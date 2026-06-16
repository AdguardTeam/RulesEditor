import {
    loadWASM,
    createOnigScanner,
    createOnigString,
} from 'vscode-oniguruma';
import {
    Registry,
    parseRawGrammar,
    type IGrammar,
    type IRawGrammar,
} from 'vscode-textmate';

import adblockJson from '../grammars/adblock.tmLanguage.json';
import jsJson from '../grammars/js.tmLanguage.json';
import { GrammarNotFoundError, WasmLoadError } from './errors';
import { SCOPE_ADBLOCK, SCOPE_JS } from './constants';

/**
 * Flexible Oniguruma WASM input. URL/string inputs are `fetch`ed (streaming
 * compile); a thunk/Promise defers resolution; everything else is passed to
 * `loadWASM` unchanged. Lets the consumer's bundler own path resolution.
 */
export type WasmSource =
    | ResolvedWasm
    | Promise<ResolvedWasm>
    | (() => ResolvedWasm | Promise<ResolvedWasm>);

/** A directly usable WASM input (no thunk/Promise wrapper). */
type ResolvedWasm =
    | ArrayBuffer
    | ArrayBufferView
    | Response
    | URL
    | string;

const scopeToRawJson: Record<string, unknown> = {
    [SCOPE_ADBLOCK]: adblockJson,
    [SCOPE_JS]: jsJson,
};

let wasmSource: WasmSource | null = null;
let readyPromise: Promise<Registry> | null = null;
const grammarCache = new Map<string, IGrammar>();

/**
 * Captures the WASM source used to build the registry on first use. Performs no
 * async work: the WASM is resolved/loaded and the registry created lazily the
 * first time a grammar is requested. Safe to call repeatedly; the source is
 * captured once and later calls are ignored.
 *
 * @param wasm The WASM source (URL/string/Response/ArrayBuffer/Promise/thunk).
 * @returns Nothing.
 */
export function configureRegistry(wasm: WasmSource): void {
    if (!wasmSource) {
        wasmSource = wasm;
    }
}

/**
 * Normalizes a {@link WasmSource} into a value accepted by `loadWASM`,
 * unwrapping thunks/Promises and `fetch`ing URL/string inputs.
 *
 * @param source The configured WASM source.
 * @returns The resolved binary or `Response` for `loadWASM`.
 */
async function resolveWasm(
    source: WasmSource,
): Promise<ArrayBuffer | ArrayBufferView | Response> {
    const unwrapped = typeof source === 'function' ? source() : source;
    const value = await unwrapped;
    if (typeof value === 'string' || value instanceof URL) {
        // Caller-supplied URL: fetch it (vscode-oniguruma streaming-compiles
        // a Response when possible). This is the only network access, and it
        // happens solely because the caller passed a URL (FR-012 opt-in).
        return fetch(value.toString());
    }
    return value;
}

/**
 * Lazily loads the WASM and builds the vscode-textmate registry, memoizing the
 * readiness promise so the work runs at most once per page.
 *
 * @returns The shared registry.
 * @throws {WasmLoadError} If the WASM is not configured or fails to load.
 */
function ensureRegistry(): Promise<Registry> {
    if (!readyPromise) {
        readyPromise = (async (): Promise<Registry> => {
            if (!wasmSource) {
                throw new WasmLoadError(
                    new Error('Registry not configured: call configureRegistry(wasm) first.'),
                );
            }
            try {
                await loadWASM(await resolveWasm(wasmSource));
            } catch (e) {
                // vscode-oniguruma throws if loadWASM was already called elsewhere.
                if (!(e instanceof Error && /already/i.test(e.message))) {
                    throw new WasmLoadError(e);
                }
            }
            return new Registry({
                onigLib: Promise.resolve({ createOnigScanner, createOnigString }),
                loadGrammar: async (scopeName: string): Promise<IRawGrammar | null> => {
                    const raw = scopeToRawJson[scopeName];
                    if (!raw) {
                        return null;
                    }
                    return parseRawGrammar(JSON.stringify(raw), `${scopeName}.json`);
                },
            });
        })();
    }
    return readyPromise;
}

/**
 * Returns the loaded grammar for a scope, lazily initializing the registry and
 * caching grammars on first use.
 *
 * @param scopeName The top-level grammar scope (e.g. {@link SCOPE_ADBLOCK}).
 * @returns The loaded grammar.
 * @throws {WasmLoadError} If the WASM is not configured or fails to load.
 * @throws {GrammarNotFoundError} If the scope has no registered grammar.
 */
export async function getGrammar(scopeName: string): Promise<IGrammar> {
    const cached = grammarCache.get(scopeName);
    if (cached) {
        return cached;
    }
    const registry = await ensureRegistry();
    try {
        const grammar = await registry.loadGrammar(scopeName);
        if (!grammar) {
            throw new GrammarNotFoundError(scopeName);
        }
        grammarCache.set(scopeName, grammar);
        return grammar;
    } catch (e) {
        if (e instanceof GrammarNotFoundError) {
            throw e;
        }
        // vscode-textmate throws when loadGrammar callback returns null
        throw new GrammarNotFoundError(scopeName);
    }
}

/**
 * Resets module state. Test-only helper; not part of the public API.
 *
 * @returns Nothing.
 */
export function resetRegistryForTests(): void {
    wasmSource = null;
    readyPromise = null;
    grammarCache.clear();
}

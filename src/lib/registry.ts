import { createOnigScanner, createOnigString, loadWASM } from 'vscode-oniguruma';
import {
    type IGrammar,
    type IRawGrammar,
    parseRawGrammar,
    Registry,
} from 'vscode-textmate';

import adblockJson from '../grammars/adblock.tmLanguage.json';
import jsJson from '../grammars/js.tmLanguage.json';

import { SCOPE_ADBLOCK, SCOPE_JS } from './constants';
import { GrammarNotFoundError, WasmLoadError } from './errors';

/**
 * Flexible Oniguruma WASM input. URL/string inputs are `fetch`ed (streaming
 * compile); a thunk/Promise defers resolution; everything else is passed to
 * `loadWASM` unchanged. Lets the consumer's bundler own path resolution.
 */
export type WasmSource =
    | ResolvedWasm
    | Promise<ResolvedWasm>
    | (() => ResolvedWasm | Promise<ResolvedWasm>);

/**
 * A directly usable WASM input (no thunk/Promise wrapper).
 */
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

/**
 * Namespace-style manager that owns the lazily-initialized Oniguruma WASM and
 * the vscode-textmate {@link Registry}. State is grouped as private static
 * members so the module exposes a single cohesive surface instead of loose
 * module-level variables.
 */
export class RegistryManager {
    /**
     * The WASM source captured on first configuration, or `null`.
     */
    private static wasmSource: WasmSource | null = null;

    /**
     * Memoized promise resolving to the shared registry, or `null`.
     */
    private static readyPromise: Promise<Registry> | null = null;

    /**
     * Cache of loaded grammars keyed by their top-level scope name.
     */
    private static readonly grammarCache = new Map<string, IGrammar>();

    /**
     * Captures the WASM source used to build the registry on first use.
     * Performs no async work: the WASM is resolved/loaded and the registry
     * created lazily the first time a grammar is requested. Safe to call
     * repeatedly; the source is captured once and later calls are ignored.
     *
     * @param wasm The WASM source (URL/string/Response/ArrayBuffer/Promise/thunk).
     */
    public static configureRegistry(wasm: WasmSource): void {
        if (!RegistryManager.wasmSource) {
            RegistryManager.wasmSource = wasm;
        }
    }

    /**
     * Normalizes a {@link WasmSource} into a value accepted by `loadWASM`,
     * unwrapping thunks/Promises and `fetch`ing URL/string inputs.
     *
     * @param source The configured WASM source.
     *
     * @returns The resolved binary or `Response` for `loadWASM`.
     */
    private static async resolveWasm(
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
     * Lazily loads the WASM and builds the vscode-textmate registry, memoizing
     * the readiness promise so the work runs at most once per page.
     *
     * @returns The shared registry.
     *
     * @throws {WasmLoadError} If the WASM is not configured or fails to load.
     */
    private static ensureRegistry(): Promise<Registry> {
        if (!RegistryManager.readyPromise) {
            RegistryManager.readyPromise = (async (): Promise<Registry> => {
                if (!RegistryManager.wasmSource) {
                    throw new WasmLoadError(
                        new Error('Registry not configured: call RegistryManager.configureRegistry(wasm) first.'),
                    );
                }
                // Safe to call repeatedly: vscode-oniguruma tracks initCalled/initPromise
                // and returns the existing promise for duplicate calls.
                try {
                    await loadWASM(await RegistryManager.resolveWasm(RegistryManager.wasmSource));
                } catch (e) {
                    throw new WasmLoadError(e);
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
        return RegistryManager.readyPromise;
    }

    /**
     * Returns the loaded grammar for a scope, lazily initializing the registry
     * and caching grammars on first use.
     *
     * @param scopeName The top-level grammar scope (e.g. {@link SCOPE_ADBLOCK}).
     *
     * @returns The loaded grammar.
     *
     * @throws {WasmLoadError} If the WASM is not configured or fails to load.
     * @throws {GrammarNotFoundError} If the scope has no registered grammar.
     */
    public static async getGrammar(scopeName: string): Promise<IGrammar> {
        const cached = RegistryManager.grammarCache.get(scopeName);
        if (cached) {
            return cached;
        }
        const registry = await RegistryManager.ensureRegistry();
        try {
            const grammar = await registry.loadGrammar(scopeName);
            if (!grammar) {
                throw new GrammarNotFoundError(scopeName);
            }
            RegistryManager.grammarCache.set(scopeName, grammar);
            return grammar;
        } catch (e) {
            if (e instanceof GrammarNotFoundError) {
                throw e;
            }
            // vscode-textmate throws when loadGrammar callback returns null.
            throw new GrammarNotFoundError(scopeName);
        }
    }

    /**
     * Resets all manager state. Test-only helper; not part of the public API.
     */
    public static resetForTests(): void {
        RegistryManager.wasmSource = null;
        RegistryManager.readyPromise = null;
        RegistryManager.grammarCache.clear();
    }
}

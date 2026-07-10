import { resolveToken } from '../highlight/scope-to-token';
import { SCOPE_ADBLOCK } from '../lib/constants';
import { RegistryManager, type WasmSource } from '../lib/registry';
import type { TokenSegment } from '../lib/types';

/**
 * Tokenizes a single line through the adblock grammar and returns one segment
 * per TextMate token, each with its text, offsets, scope stack, and resolved
 * highlight token. Intended for tests and grammar debugging.
 *
 * @param wasm The Oniguruma WASM source (URL/string/Response/ArrayBuffer/
 *   Promise/thunk); URL/string inputs are fetched. See {@link WasmSource}.
 * @param line The line of text to tokenize.
 * @param scopeName The top-level grammar scope. Defaults to {@link SCOPE_ADBLOCK}.
 *
 * @returns A contiguous, gap-free list of segments covering the whole line.
 *
 * @throws {WasmLoadError} If the WASM binary cannot be loaded.
 * @throws {GrammarNotFoundError} If the registry is not initialized or the
 * scope is unknown.
 */
export async function inspectLine(
    wasm: WasmSource,
    line: string,
    scopeName = SCOPE_ADBLOCK,
): Promise<TokenSegment[]> {
    RegistryManager.configureRegistry(wasm);
    if (line.length === 0) {
        return [];
    }
    const grammar = await RegistryManager.getGrammar(scopeName);
    const { tokens } = grammar.tokenizeLine(line, null);
    return tokens.map((t) => ({
        text: line.slice(t.startIndex, t.endIndex),
        startIndex: t.startIndex,
        endIndex: t.endIndex,
        scopes: t.scopes,
        token: resolveToken(t.scopes),
    }));
}

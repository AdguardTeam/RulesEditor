import { SCOPE_ADBLOCK } from '../lib/constants';
import { RegistryManager } from '../lib/registry';
import { resolveToken } from '../highlight/scope-to-token';
import type { TokenSegment } from '../lib/types';

/**
 * Tokenizes a single line through the adblock grammar and returns one segment
 * per TextMate token, each with its text, offsets, scope stack, and resolved
 * highlight token. Intended for tests and grammar debugging.
 *
 * @param line The line of text to tokenize.
 * @param scopeName The top-level grammar scope. Defaults to {@link SCOPE_ADBLOCK}.
 * @returns A contiguous, gap-free list of segments covering the whole line.
 * @throws {GrammarNotFoundError} If the scope is unknown.
 */
export async function inspectLine(
    line: string,
    scopeName = SCOPE_ADBLOCK,
): Promise<TokenSegment[]> {
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

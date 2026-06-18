import { StreamLanguage, type StreamParser } from '@codemirror/language';
import type { Tag } from '@lezer/highlight';
import { CM_LANGUAGE_NAME } from '../lib/constants';
import { simpleTokenizer } from '../tokenizers/simple-tokenizer';
import type { RuleTokens } from '../lib/utils';
import { tokenTags } from './token-tags';

/**
 * Internal state for the lightweight stream parser. Holds the tokens produced
 * by {@link simpleTokenizer} for the current line and the cursor within them.
 */
interface SimpleState {
    /**
     * Tokens produced by the most recent {@link simpleTokenizer} call.
     */
    tokens: RuleTokens;

    /**
     * Current index within {@link tokens}.
     */
    index: number;
}

/**
 * Builds a CodeMirror 6 language that highlights adblock rules using the
 * regex-based {@link simpleTokenizer}, requiring no WebAssembly. Each line is
 * tokenized independently and every token is mapped to a standard
 * `@lezer/highlight` tag via the shared {@link tokenTags} table, so the same
 * themes that style the full TextMate language apply here too. Precision is
 * best-effort; tokenization failures fall back to an unstyled line.
 *
 * @returns A CodeMirror 6 `StreamLanguage` extension.
 */
export function createSimpleLanguage(): StreamLanguage<SimpleState> {
    const parser: StreamParser<SimpleState> = {
        name: CM_LANGUAGE_NAME,
        startState: () => ({ tokens: [], index: 0 }),
        token(stream, state) {
            if (stream.sol() || state.index >= state.tokens.length) {
                try {
                    state.tokens = stream.string.length > 0
                        ? simpleTokenizer(stream.string)
                        : [];
                } catch {
                    state.tokens = [];
                }
                state.index = 0;
            }
            const current = state.tokens[state.index];
            if (!current) {
                stream.skipToEnd();
                return null;
            }
            state.index += 1;
            stream.pos += current.str.length;
            return current.token ?? null;
        },
        tokenTable: tokenTags as unknown as Record<string, Tag>,
    };
    return StreamLanguage.define(parser);
}

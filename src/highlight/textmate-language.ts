import { StreamLanguage, type StreamParser } from '@codemirror/language';
import type { Tag } from '@lezer/highlight';
import {
    type IGrammar,
    INITIAL,
    type IToken,
    type StateStack,
} from 'vscode-textmate';

import { CM_LANGUAGE_NAME } from '../lib/constants';
import type { Token } from '../lib/utils';

import { resolveToken } from './scope-to-token';
import { tokenTags } from './token-tags';

/**
 * Internal state for the CodeMirror stream parser. Tracks the TextMate
 * rule stack and the list of tokens produced by the most recent
 * {@link IGrammar.tokenizeLine} call, along with the current position
 * within that list.
 */
interface TmState {
    /**
     * TextMate rule stack persisted across lines.
     */
    stack: StateStack;
    /**
     * Tokens produced by the most recent {@link IGrammar.tokenizeLine} call.
     */
    tokens: IToken[];
    /**
     * Current index within {@link tokens}.
     */
    index: number;
}

/**
 * Builds a CodeMirror 6 language from a loaded vscode-textmate grammar. The
 * stream tokenizer threads the TextMate rule stack across lines and emits one
 * styled token per TextMate token, mapped to a standard `@lezer/highlight` tag
 * via the shared {@link tokenTags} table so themes apply automatically.
 *
 * @param grammar A grammar previously loaded from the registry.
 *
 * @returns A CodeMirror 6 `StreamLanguage` extension.
 */
export function createTextmateLanguage(grammar: IGrammar): StreamLanguage<TmState> {
    const parser: StreamParser<TmState> = {
        name: CM_LANGUAGE_NAME,
        startState: () => ({ stack: INITIAL, tokens: [], index: 0 }),
        token(stream, state) {
            if (stream.sol() || state.index >= state.tokens.length) {
                const result = grammar.tokenizeLine(stream.string, state.stack);
                state.tokens = result.tokens;
                state.stack = result.ruleStack;
                state.index = 0;
            }
            const current = state.tokens[state.index];
            if (!current) {
                stream.skipToEnd();
                return null;
            }
            state.index += 1;
            stream.pos = current.endIndex;
            const token: Token | null = resolveToken(current.scopes);
            return token ?? null;
        },
        tokenTable: tokenTags as unknown as Record<string, Tag>,
    };
    return StreamLanguage.define(parser);
}

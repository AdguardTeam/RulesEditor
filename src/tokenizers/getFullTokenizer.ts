import type { ITextmateThemePlus } from 'codemirror-textmate';
import {
    addTheme,
    themedHighlighters,
} from 'codemirror-textmate';

import { normalizeTokens } from '../lib/utils';
import { initGrammar } from '../lib/initGrammar';
import type { Token, RuleTokens } from '../lib/utils';

/**
 * getFullTokenizer - provides a tokenizer function for splitting a filter rule into tokenized parts,
 * which aids in highlighting individual segments of a single rule
 * @param wasm - WebAssembly module provided by onigasm
 * @param theme - Usually a JSON object with a theme for syntax and editor highlighting
 * @returns Promise<(rule: string) => RuleTokens | { str: string, token: string | null }[]>
 */
export async function getFullTokenizer(wasm: any, theme?: ITextmateThemePlus)
    : Promise<(rule: string) => RuleTokens | { str: string, token: string | null }[]> {
    await initGrammar(wasm);

    if (theme) {
        addTheme(theme);
    }

    const tokenizer = await themedHighlighters.get(theme?.name ?? 'default')?.getTokenizer('adblock');
    if (!tokenizer) {
        throw new Error(`Failed to load tokenizer for theme ${theme?.name ?? 'default'}`);
    }

    return function parseRule(rule: string) {
        const stream = {
            lastColumnPos: rule.length,
            lastColumnValue: rule[rule.length - 1],
            lineStart: 0,
            pos: 0,
            start: 0,
            string: rule,
            tabSize: 4,
            eol() { return this.pos === this.lastColumnPos; },
            sol() { return this.pos === 0; },
            skipToEnd() { this.pos = this.lastColumnPos; },
            eatWhile(match: () => boolean) {
                while (match()) {
                    this.pos += 1;
                }
            },
        } as any;

        const state = {
            ruleStack: null,
            tokensCache: [],
        } as any;

        const initialToken = tokenizer(stream, state) as Token;
        const parsedRule = [{ token: initialToken, str: rule.slice(0, stream.pos) }];

        while (state.tokensCache.length !== 0) {
            const lastPos = stream.pos;
            const token = tokenizer(stream, state) as Token;
            const currentPos = stream.pos;
            parsedRule.push({ token, str: rule.slice(lastPos, currentPos) });
        }

        return normalizeTokens(parsedRule);
    };
}

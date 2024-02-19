/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { RuleFactory, CosmeticRule, NetworkRule, HostRule } from '@adguard/tsurlfilter';

import type { RuleTokens } from '../lib/utils';
import { findCosmeticRuleMarker, normalizeTokens, Token } from '../lib/utils';

/**
 * simpleTokenizer - provides a tokenizer function for splitting a filter ruleRaw into tokenized parts,
 * which aids in highlighting individual segments of a single ruleRaw. Because it does not utilize WebAssembly,
 * the outcome is not as precise as the tokenizer obtained from getTokenizer
 * @param ruleRaw - user rule
 * @returns RuleTokens
 */
export const simpleTokenizer = (ruleRaw: string): RuleTokens => {
    if (RuleFactory.isComment(ruleRaw)) {
        return [{ token: Token.Comment, str: ruleRaw }];
    }
    const rule = RuleFactory.createRule(ruleRaw, 0, false, false, false, true);

    if (rule instanceof NetworkRule) {
        if (rule.isRegexRule()) {
            return [
                { token: Token.Keyword, str: '/' },
                { token: Token.String2, str: ruleRaw.slice(1, -1) },
                { token: Token.Keyword, str: '/' },
            ];
        }
        let pattern = rule.getPattern();
        while (pattern.startsWith('|')) {
            pattern = pattern.slice(1);
        }
        const [keyword, modifiers] = ruleRaw.split(pattern);

        const tokenized = [] as RuleTokens;

        if (keyword) {
            tokenized.push({ token: Token.Keyword, str: keyword });
        }
        if (pattern.endsWith('^')) {
            pattern = pattern.slice(0, -1);
            tokenized.push({ token: null, str: pattern });
            tokenized.push({ token: Token.Keyword, str: '^' });
        } else {
            tokenized.push({ token: null, str: pattern });
        }

        const { options } = NetworkRule.parseRuleText(ruleRaw);

        if (!options && !modifiers) {
            return tokenized;
        }
        if (!options && modifiers) {
            tokenized.push({ token: Token.Keyword, str: modifiers });
            return tokenized;
        }
        if (options && modifiers && modifiers.replace(options, '').length > 0) {
            tokenized.push({ token: Token.Keyword, str: modifiers.replace(options, '') });

            // all,domain=~example.com
            const splitOptions = options.split(',');

            splitOptions.forEach((modificator, index) => {
                if (modificator.includes('=')) {
                    const spMod = modificator.split('=');
                    tokenized.push(
                        { token: Token.Keyword, str: spMod[0] },
                        { token: Token.Operator, str: '=' },
                        { token: Token.String, str: spMod[1] },
                    );
                } else {
                    tokenized.push({ token: Token.Keyword, str: modificator });
                }
                if (index < splitOptions.length - 1) {
                    tokenized.push({ token: Token.Operator, str: ',' });
                }
            });
        }

        return normalizeTokens(tokenized);
    }
    if (rule instanceof CosmeticRule) {
        const [, marker] = findCosmeticRuleMarker(ruleRaw);
        const tokens = ruleRaw.split(marker!);
        return [
            { token: Token.String, str: tokens[0] },
            { token: Token.Keyword, str: marker! },
            { token: Token.Def, str: tokens[1] },
        ];
    }
    if (rule instanceof HostRule) {
        return [{ token: null, str: ruleRaw }];
    }

    return [{ token: null, str: ruleRaw }];
};

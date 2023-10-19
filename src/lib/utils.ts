import { CosmeticRuleMarker } from '@adguard/tsurlfilter';

// Token names that resemble the return types of the CodeMirror-TextMate tokenizer.
export enum Token {
    Atom = 'atom',
    Attribute = 'attribute',
    Bracket = 'bracket',
    Builtin = 'builtin',
    Comment = 'comment',
    Def = 'def',
    Error = 'error',
    Header = 'header',
    HR = 'hr',
    Keyword = 'keyword',
    Link = 'link',
    Meta = 'meta',
    Number = 'number',
    Operator = 'operator',
    Property = 'property',
    Qualifier = 'qualifier',
    Quote = 'quote',
    String = 'string',
    String2 = 'string-2',
    Tag = 'tag',
    Type = 'type',
    Variable = 'variable',
    Variable2 = 'variable-2',
    Variable3 = 'variable-3',
}

// The return type for both tokenize functions.
// It can be used as the input parameter type for the generator function.
// Please refer to the README.md file for examples of how the generator can looks like.
export type RuleTokens = { str: string, token: Token | null }[];

/**
 * normalizeTokens - function is designed to merge adjacent rule parts which tokens are identical.
 */
export function normalizeTokens(rule: RuleTokens): RuleTokens {
    const normalizedRule = [rule.shift()!];

    rule.forEach((item) => {
        const { token, str } = item;
        const last = normalizedRule.length - 1;

        if (normalizedRule[last]?.token === token) {
            normalizedRule[last]!.str += str;
        } else {
            normalizedRule.push(item);
        }
    });

    return normalizedRule;
}

/**
* Function is locating the CosmeticRuleMarker and determine its position within a cosmetic rule.
* Has been taken from: https://github.com/AdguardTeam/tsurlfilter/blob/tsurlfilter-v2.1.12/packages/tsurlfilter/src/rules/cosmetic-rule-marker.ts
*/
export function findCosmeticRuleMarker(ruleText: string): [number, CosmeticRuleMarker | null] {
    const maxIndex = ruleText.length - 1;
    for (let i = 0; i < maxIndex; i += 1) {
        const char = ruleText.charAt(i);
        switch (char) {
            case '#':
                if (i + 4 <= maxIndex) {
                    if (ruleText.charAt(i + 1) === '@'
                       && ruleText.charAt(i + 2) === '$'
                       && ruleText.charAt(i + 3) === '?'
                       && ruleText.charAt(i + 4) === '#') {
                        return [i, CosmeticRuleMarker.CssExtCSSException];
                    }
                }

                if (i + 3 <= maxIndex) {
                    if (ruleText.charAt(i + 1) === '@'
                       && ruleText.charAt(i + 2) === '?' && ruleText.charAt(i + 3) === '#') {
                        return [i, CosmeticRuleMarker.ElementHidingExtCSSException];
                    }

                    if (ruleText.charAt(i + 1) === '@'
                       && ruleText.charAt(i + 2) === '$' && ruleText.charAt(i + 3) === '#') {
                        return [i, CosmeticRuleMarker.CssException];
                    }

                    if (ruleText.charAt(i + 1) === '@'
                       && ruleText.charAt(i + 2) === '%' && ruleText.charAt(i + 3) === '#') {
                        return [i, CosmeticRuleMarker.JsException];
                    }

                    if (ruleText.charAt(i + 1) === '$'
                       && ruleText.charAt(i + 2) === '?' && ruleText.charAt(i + 3) === '#') {
                        return [i, CosmeticRuleMarker.CssExtCSS];
                    }
                }

                if (i + 2 <= maxIndex) {
                    if (ruleText.charAt(i + 1) === '@' && ruleText.charAt(i + 2) === '#') {
                        return [i, CosmeticRuleMarker.ElementHidingException];
                    }

                    if (ruleText.charAt(i + 1) === '?' && ruleText.charAt(i + 2) === '#') {
                        return [i, CosmeticRuleMarker.ElementHidingExtCSS];
                    }

                    if (ruleText.charAt(i + 1) === '%' && ruleText.charAt(i + 2) === '#') {
                        return [i, CosmeticRuleMarker.Js];
                    }

                    if (ruleText.charAt(i + 1) === '$' && ruleText.charAt(i + 2) === '#') {
                        return [i, CosmeticRuleMarker.Css];
                    }
                }

                if (i + 1 <= maxIndex) {
                    if (ruleText.charAt(i + 1) === '#') {
                        // Handling false positives while looking for cosmetic rules in host files.
                        //
                        // For instance, it could look like this:
                        // 127.0.0.1 localhost ## this is just a comment
                        if (i > 0 && ruleText.charAt(i - 1) === ' ') {
                            return [-1, null];
                        }

                        return [i, CosmeticRuleMarker.ElementHiding];
                    }
                }
                break;
            case '$':
                if (i + 2 <= maxIndex) {
                    if (ruleText.charAt(i + 1) === '@' && ruleText.charAt(i + 2) === '$') {
                        return [i, CosmeticRuleMarker.HtmlException];
                    }
                }

                if (i + 1 <= maxIndex) {
                    if (ruleText.charAt(i + 1) === '$') {
                        return [i, CosmeticRuleMarker.Html];
                    }
                }
                break;
            default:
                break;
        }
    }

    return [-1, null];
}

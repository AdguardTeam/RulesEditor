import { CosmeticRuleMarker } from '@adguard/tsurlfilter';

/**
 * Token names aligned with the CodeMirror 6 / `@lezer/highlight` tag taxonomy.
 *
 * Each value is backed by a standard highlight tag (see
 * `src/highlight/tokenTags.ts`), so editor highlighting works with the built-in
 * `defaultHighlightStyle` and any consumer-supplied theme.
 */
export enum Token {
    Atom = 'atom',
    AttributeName = 'attributeName',
    ClassName = 'className',
    Comment = 'comment',
    Definition = 'definition',
    Emphasis = 'emphasis',
    Escape = 'escape',
    Function = 'function',
    Heading = 'heading',
    Invalid = 'invalid',
    Keyword = 'keyword',
    Link = 'link',
    List = 'list',
    Meta = 'meta',
    Monospace = 'monospace',
    Number = 'number',
    Operator = 'operator',
    PropertyName = 'propertyName',
    Quote = 'quote',
    Regexp = 'regexp',
    Self = 'self',
    Special = 'special',
    Standard = 'standard',
    Strong = 'strong',
    String = 'string',
    TagName = 'tagName',
    TypeName = 'typeName',
    VariableName = 'variableName',
}

// The return type for both tokenize functions.
// It can be used as the input parameter type for the generator function.
// Please refer to the README.md file for examples of how the generator can looks like.
export type RuleTokens = { str: string, token: Token | null }[];

/**
 * The function is used to normalize the output of the tokenizer by merging adjacent tokens of the same type.
 *
 * @param rule The output of the tokenizer function, which is an array of objects containing a string and a token type.
 * @returns A new array of objects where adjacent tokens of the same type have been merged into a single object.
 * The `str` property of the merged object is the concatenation of the `str` properties of the original objects,
 * and the `token` property is the same as the original token type.
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
* Has been taken from: https://github.com/AdguardTeam/tsurlfilter/blob/tsurlfilter-v2.1.12/packages/tsurlfilter/src/rules/cosmetic-rule-marker.ts.
*
* @param ruleText The text of the cosmetic rule to be analyzed.
* @returns A tuple containing the index of the found marker
* and the corresponding CosmeticRuleMarker enum value, or -1 and null if no marker is found.
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

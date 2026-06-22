import { normalizeTokens } from '../lib/utils';
import type { RuleTokens } from '../lib/utils';
import { SCOPE_ADBLOCK } from '../lib/constants';
import { RegistryManager } from '../lib/registry';
import { resolveToken } from '../highlight/scope-to-token';

/**
 * Builds a tokenizer that splits a single filter rule into highlighted
 * segments using the adblock TextMate grammar (with embedded JavaScript
 * support) backed by vscode-textmate and a native-`RegExp` Oniguruma mock.
 *
 * @returns A function mapping a rule string to its {@link RuleTokens}.
 * @throws {GrammarNotFoundError} If the adblock grammar cannot be resolved.
 */
export async function getFullTokenizer(): Promise<(rule: string) => RuleTokens> {
    const grammar = await RegistryManager.getGrammar(SCOPE_ADBLOCK);

    return function parseRule(rule: string): RuleTokens {
        if (rule.length === 0) {
            return [];
        }
        const { tokens } = grammar.tokenizeLine(rule, null);
        const parsed: RuleTokens = tokens.map((t) => ({
            token: resolveToken(t.scopes),
            str: rule.slice(t.startIndex, t.endIndex),
        }));
        return normalizeTokens(parsed);
    };
}

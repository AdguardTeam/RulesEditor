import { resolveToken } from '../highlight/scope-to-token';
import { SCOPE_ADBLOCK } from '../lib/constants';
import { RegistryManager, type WasmSource } from '../lib/registry';
import { normalizeTokens } from '../lib/utils';
import type { RuleTokens } from '../lib/utils';

/**
 * Builds a tokenizer that splits a single filter rule into highlighted
 * segments using the adblock TextMate grammar (with embedded JavaScript
 * support) backed by vscode-textmate and vscode-oniguruma.
 *
 * @param wasm The Oniguruma WASM source (URL/string/Response/ArrayBuffer/
 *   Promise/thunk); URL/string inputs are fetched. See {@link WasmSource}.
 *
 * @returns A function mapping a rule string to its {@link RuleTokens}.
 *
 * @throws {WasmLoadError} If the WASM binary cannot be loaded.
 * @throws {GrammarNotFoundError} If the adblock grammar cannot be resolved.
 */
export async function getTokenizer(
    wasm: WasmSource,
): Promise<(rule: string) => RuleTokens> {
    RegistryManager.configureRegistry(wasm);
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

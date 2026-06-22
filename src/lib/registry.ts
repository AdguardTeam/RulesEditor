import {
    Registry,
    parseRawGrammar,
    type IGrammar,
    type IRawGrammar,
} from 'vscode-textmate';

import adblockJson from '../grammars/adblock.tmLanguage.json';
import jsJson from '../grammars/js.tmLanguage.json';
import { GrammarNotFoundError } from './errors';
import { SCOPE_ADBLOCK, SCOPE_JS } from './constants';
import { createOnigScanner, createOnigString } from './onig-mock';

const scopeToRawJson: Record<string, unknown> = {
    [SCOPE_ADBLOCK]: adblockJson,
    [SCOPE_JS]: jsJson,
};

/**
 * Namespace-style manager that owns the lazily-built vscode-textmate
 * {@link Registry} and a grammar cache. The registry uses a native-`RegExp`
 * Oniguruma mock ({@link createOnigScanner}/{@link createOnigString}); there is
 * no WASM and no network access.
 */
export class RegistryManager {
    /**
     * The lazily-built shared registry, or `null` before first use.
     */
    private static registry: Registry | null = null;

    /**
     * Cache of loaded grammars keyed by their top-level scope name.
     */
    private static readonly grammarCache = new Map<string, IGrammar>();

    /**
     * Builds (once) and returns the shared vscode-textmate registry wired to the
     * native-`RegExp` Oniguruma mock.
     *
     * @returns The shared registry.
     */
    private static getRegistry(): Registry {
        if (!RegistryManager.registry) {
            RegistryManager.registry = new Registry({
                onigLib: Promise.resolve({ createOnigScanner, createOnigString }),
                loadGrammar: async (scopeName: string): Promise<IRawGrammar | null> => {
                    const raw = scopeToRawJson[scopeName];
                    if (!raw) {
                        return null;
                    }
                    return parseRawGrammar(JSON.stringify(raw), `${scopeName}.json`);
                },
            });
        }
        return RegistryManager.registry;
    }

    /**
     * Returns the loaded grammar for a scope, caching it on first use. The
     * returned promise resolves within a microtask (no I/O).
     *
     * @param scopeName The top-level grammar scope (e.g. {@link SCOPE_ADBLOCK}).
     * @returns The loaded grammar.
     * @throws {GrammarNotFoundError} If the scope has no registered grammar.
     */
    public static async getGrammar(scopeName: string): Promise<IGrammar> {
        const cached = RegistryManager.grammarCache.get(scopeName);
        if (cached) {
            return cached;
        }
        let grammar: IGrammar | null;
        try {
            grammar = await RegistryManager.getRegistry().loadGrammar(scopeName);
        } catch {
            // vscode-textmate throws when the loadGrammar callback returns null.
            throw new GrammarNotFoundError(scopeName);
        }
        if (!grammar) {
            throw new GrammarNotFoundError(scopeName);
        }
        RegistryManager.grammarCache.set(scopeName, grammar);
        return grammar;
    }

    /**
     * Resets all manager state. Test-only helper; not part of the public API.
     *
     * @returns Nothing.
     */
    public static resetForTests(): void {
        RegistryManager.registry = null;
        RegistryManager.grammarCache.clear();
    }
}

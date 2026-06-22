import { test, expect, beforeEach } from 'vitest';
import { SCOPE_ADBLOCK } from '../src/lib/constants';
import { RegistryManager } from '../src/lib/registry';
import { GrammarNotFoundError } from '../src/lib/errors';

beforeEach(() => {
    RegistryManager.resetForTests();
});

test('loads the adblock grammar lazily', async () => {
    const grammar = await RegistryManager.getGrammar(SCOPE_ADBLOCK);
    const { tokens } = grammar.tokenizeLine('! comment', null);
    expect(tokens.length).toBeGreaterThan(0);
});

test('throws GrammarNotFoundError for unknown scope', async () => {
    await expect(RegistryManager.getGrammar('source.python')).rejects.toBeInstanceOf(GrammarNotFoundError);
});

test('caches grammars (same instance on repeat calls)', async () => {
    const first = await RegistryManager.getGrammar(SCOPE_ADBLOCK);
    const second = await RegistryManager.getGrammar(SCOPE_ADBLOCK);
    expect(first).toBe(second);
});

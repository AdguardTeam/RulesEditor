import { test, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SCOPE_ADBLOCK } from '../src/lib/constants';
import { RegistryManager } from '../src/lib/registry';
import { GrammarNotFoundError, WasmLoadError } from '../src/lib/errors';

const wasm = readFileSync(
    resolve(__dirname, '../node_modules/vscode-oniguruma/release/onig.wasm'),
).buffer;

beforeEach(() => {
    RegistryManager.resetForTests();
});

test('loads the adblock grammar lazily after configuration', async () => {
    RegistryManager.configureRegistry(wasm);
    const grammar = await RegistryManager.getGrammar(SCOPE_ADBLOCK);
    const { tokens } = grammar.tokenizeLine('! comment', null);
    expect(tokens.length).toBeGreaterThan(0);
});

test('throws GrammarNotFoundError for unknown scope', async () => {
    RegistryManager.configureRegistry(wasm);
    await expect(RegistryManager.getGrammar('source.python')).rejects.toBeInstanceOf(GrammarNotFoundError);
});

test('getGrammar before configuration throws WasmLoadError', async () => {
    await expect(RegistryManager.getGrammar(SCOPE_ADBLOCK)).rejects.toBeInstanceOf(WasmLoadError);
});

test('builds the registry at most once (grammars are cached)', async () => {
    RegistryManager.configureRegistry(wasm);
    const first = await RegistryManager.getGrammar(SCOPE_ADBLOCK);
    const second = await RegistryManager.getGrammar(SCOPE_ADBLOCK);
    expect(first).toBe(second);
});

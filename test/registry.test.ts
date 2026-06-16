import { test, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SCOPE_ADBLOCK } from '../src/lib/constants';
import { configureRegistry, getGrammar, resetRegistryForTests } from '../src/lib/registry';
import { GrammarNotFoundError, WasmLoadError } from '../src/lib/errors';

const wasm = readFileSync(
    resolve(__dirname, '../node_modules/vscode-oniguruma/release/onig.wasm'),
).buffer;

beforeEach(() => {
    resetRegistryForTests();
});

test('loads the adblock grammar lazily after configuration', async () => {
    configureRegistry(wasm);
    const grammar = await getGrammar(SCOPE_ADBLOCK);
    const { tokens } = grammar.tokenizeLine('! comment', null);
    expect(tokens.length).toBeGreaterThan(0);
});

test('throws GrammarNotFoundError for unknown scope', async () => {
    configureRegistry(wasm);
    await expect(getGrammar('source.python')).rejects.toBeInstanceOf(GrammarNotFoundError);
});

test('getGrammar before configuration throws WasmLoadError', async () => {
    await expect(getGrammar(SCOPE_ADBLOCK)).rejects.toBeInstanceOf(WasmLoadError);
});

test('builds the registry at most once (grammars are cached)', async () => {
    configureRegistry(wasm);
    const first = await getGrammar(SCOPE_ADBLOCK);
    const second = await getGrammar(SCOPE_ADBLOCK);
    expect(first).toBe(second);
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, expect, test } from 'vitest';

import { RegistryManager } from '../src/lib/registry';
import { getTokenizer } from '../src/tokenizers/tokenizer';

const wasm = readFileSync(
    resolve(__dirname, '../node_modules/vscode-oniguruma/release/onig.wasm'),
).buffer;

beforeEach(() => RegistryManager.resetForTests());

test('returns contiguous RuleTokens covering the rule', async () => {
    const tokenize = await getTokenizer(wasm);
    const rule = '! this is a comment';
    const tokens = tokenize(rule);
    expect(tokens.map((t) => t.str).join('')).toBe(rule);
    expect(tokens.every((t) => 'token' in t && 'str' in t)).toBe(true);
});

test('comment rule is tokenized as a comment', async () => {
    const tokenize = await getTokenizer(wasm);
    const tokens = tokenize('! hello');
    expect(tokens.some((t) => t.token === 'comment')).toBe(true);
});

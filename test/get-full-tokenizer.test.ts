import { test, expect, beforeEach } from 'vitest';
import { getFullTokenizer } from '../src/tokenizers/get-full-tokenizer';
import { RegistryManager } from '../src/lib/registry';

beforeEach(() => RegistryManager.resetForTests());

test('returns contiguous RuleTokens covering the rule', async () => {
    const tokenize = await getFullTokenizer();
    const rule = '! this is a comment';
    const tokens = tokenize(rule);
    expect(tokens.map((t) => t.str).join('')).toBe(rule);
    expect(tokens.every((t) => 'token' in t && 'str' in t)).toBe(true);
});

test('comment rule is tokenized as a comment', async () => {
    const tokenize = await getFullTokenizer();
    const tokens = tokenize('! hello');
    expect(tokens.some((t) => t.token === 'comment')).toBe(true);
});

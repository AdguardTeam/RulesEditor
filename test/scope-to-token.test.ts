import { expect, test } from 'vitest';

import { resolveToken, scopeToToken } from '../src/highlight/scope-to-token';
import { SCOPE_ADBLOCK } from '../src/lib/constants';
import { Token } from '../src/lib/utils';

test('maps comment scope to Comment token', () => {
    expect(scopeToToken('comment.line.adblock')).toBe(Token.Comment);
});

test('maps keyword scope to Keyword token', () => {
    expect(scopeToToken('keyword.control.adblock')).toBe(Token.Keyword);
});

test('maps numeric constant to Number token', () => {
    expect(scopeToToken('constant.numeric.decimal')).toBe(Token.Number);
});

test('unmapped scope returns null', () => {
    expect(scopeToToken('totally.unknown.scope')).toBeNull();
});

test('resolveToken picks the innermost mapped scope', () => {
    // source.js is unmapped, string.quoted maps to String
    expect(resolveToken([SCOPE_ADBLOCK, 'string.quoted.double'])).toBe(Token.String);
});

test('resolveToken returns null when no scope maps', () => {
    expect(resolveToken([SCOPE_ADBLOCK, 'meta.unknown'])).toBe(Token.Meta);
});

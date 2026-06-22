import { test, expect } from 'vitest';
import { assertConvertible } from '../scripts/update-grammars.mts';

test('assertConvertible passes for convertible patterns', () => {
    const grammar = {
        patterns: [
            { match: '\\d+' },
            { begin: '/\\*', end: '\\*/' },
            { match: '(?>foo(bar))baz' }, // atomic group -> hidden captures
        ],
    };
    expect(() => assertConvertible(grammar, 'test.grammar')).not.toThrow();
});

test('assertConvertible throws on an unconvertible pattern', () => {
    const grammar = { patterns: [{ match: '(?<' }] }; // malformed group
    expect(() => assertConvertible(grammar, 'test.grammar')).toThrow(/test\.grammar/);
});

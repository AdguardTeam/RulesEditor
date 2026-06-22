import { test, expect } from 'vitest';
import { toRegExpDetails } from 'oniguruma-to-es';
import adblock from '../src/grammars/adblock.tmLanguage.json';
import js from '../src/grammars/js.tmLanguage.json';

const REGEX_KEYS = new Set([
    'match', 'begin', 'end', 'while',
    'firstLineMatch', 'foldingStartMarker', 'foldingStopMarker',
]);

/**
 * Recursively collects every Oniguruma regex field value from a grammar node.
 *
 * @param node The current grammar node (object, array, or leaf).
 * @param out The array to append patterns to.
 */
function collectPatterns(node: unknown, out: string[]): void {
    if (Array.isArray(node)) {
        node.forEach((n) => collectPatterns(n, out));
        return;
    }
    if (node === null || typeof node !== 'object') {
        return;
    }
    const obj = node as Record<string, unknown>;
    Object.keys(obj).forEach((key) => {
        const value = obj[key];
        if (typeof value === 'string') {
            if (REGEX_KEYS.has(key)) {
                out.push(value);
            }
        } else {
            collectPatterns(value, out);
        }
    });
}

test.each([
    ['adblock', adblock],
    ['js', js],
])('every %s grammar pattern converts in strict mode', (_name, grammar) => {
    const patterns: string[] = [];
    collectPatterns(grammar, patterns);
    expect(patterns.length).toBeGreaterThan(0);
    const failures: string[] = [];
    patterns.forEach((pattern) => {
        try {
            toRegExpDetails(pattern, {
                accuracy: 'strict',
                rules: { allowOrphanBackrefs: true },
            });
        } catch (e) {
            failures.push(`${pattern} :: ${(e as Error).message}`);
        }
    });
    expect(failures).toEqual([]);
});

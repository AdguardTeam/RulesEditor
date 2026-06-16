import { test, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { inspectLine } from '../src/tokenizers/inspectLine';
import { configureRegistry, resetRegistryForTests } from '../src/lib/registry';

const wasm = readFileSync(
    resolve(__dirname, '../node_modules/vscode-oniguruma/release/onig.wasm'),
).buffer;

beforeEach(() => resetRegistryForTests());

test('segments cover the whole line contiguously', async () => {
    configureRegistry(wasm);
    const line = '||example.org^$important';
    const segments = await inspectLine(line);
    expect(segments.map((s) => s.text).join('')).toBe(line);
    for (let i = 1; i < segments.length; i += 1) {
        expect(segments[i].startIndex).toBe(segments[i - 1].endIndex);
    }
});

test('every segment carries a scope stack', async () => {
    configureRegistry(wasm);
    const segments = await inspectLine('! comment');
    expect(segments.every((s) => Array.isArray(s.scopes) && s.scopes.length > 0)).toBe(true);
});

test('empty line yields no segments', async () => {
    configureRegistry(wasm);
    expect(await inspectLine('')).toEqual([]);
});

test('embedded JavaScript region carries source.js scopes', async () => {
    configureRegistry(wasm);
    // JS injection rule with embedded JS body (#%# triggers source.js).
    const line = 'example.org#%#var x = 1';
    const segments = await inspectLine(line);
    const hasJsScope = segments.some((s) => s.scopes.some((sc) => sc.startsWith('source.js')));
    const hasAdblockScope = segments.some((s) => s.scopes.some((sc) => sc.includes('adblock')));
    expect(hasJsScope).toBe(true);
    expect(hasAdblockScope).toBe(true);
});

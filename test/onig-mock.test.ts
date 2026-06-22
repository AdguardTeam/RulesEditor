import { test, expect } from 'vitest';
import { createOnigScanner, createOnigString } from '../src/lib/onig-mock';

test('createOnigString wraps content and exposes a no-op dispose', () => {
    const s = createOnigString('hello');
    expect(s.content).toBe('hello');
    expect(() => s.dispose()).not.toThrow();
});

test('findNextMatchSync returns the matched pattern index and capture spans', () => {
    const scanner = createOnigScanner(['\\d+', '[a-z]+']);
    const match = scanner.findNextMatchSync('ab 12', 0);
    expect(match).not.toBeNull();
    expect(match!.index).toBe(1); // '[a-z]+' matches first (at 0)
    expect(match!.captureIndices[0]).toEqual({ start: 0, end: 2, length: 2 });
});

test('findNextMatchSync honors startPosition', () => {
    const scanner = createOnigScanner(['[a-z]+']);
    const match = scanner.findNextMatchSync('ab 12 cd', 3);
    expect(match!.captureIndices[0]).toEqual({ start: 6, end: 8, length: 2 });
});

test('non-participating capture groups use the 0xFFFFFFFF sentinel', () => {
    const scanner = createOnigScanner(['(a)?(b)']);
    const match = scanner.findNextMatchSync('b', 0);
    expect(match!.captureIndices[0]).toEqual({ start: 0, end: 1, length: 1 });
    expect(match!.captureIndices[1]).toEqual({ start: 0xFFFFFFFF, end: 0xFFFFFFFF, length: 0 });
    expect(match!.captureIndices[2]).toEqual({ start: 0, end: 1, length: 1 });
});

test('leftmost match wins; ties break to the earliest pattern', () => {
    const scanner = createOnigScanner(['foo', 'f']);
    const match = scanner.findNextMatchSync('foo', 0);
    expect(match!.index).toBe(0); // both start at 0; first pattern wins
});

test('\\G matches only at the search start position (sticky)', () => {
    const scanner = createOnigScanner(['\\Gfoo']);
    expect(scanner.findNextMatchSync('xfoo', 0)).toBeNull(); // not at pos 0
    const match = scanner.findNextMatchSync('xfoo', 1);
    expect(match!.captureIndices[0]).toEqual({ start: 1, end: 4, length: 3 });
});

test('findNextMatchSync accepts an OnigString', () => {
    const scanner = createOnigScanner(['\\d+']);
    const match = scanner.findNextMatchSync(createOnigString('ab12'), 0);
    expect(match!.captureIndices[0]).toEqual({ start: 2, end: 4, length: 2 });
});

test('no match returns null', () => {
    const scanner = createOnigScanner(['\\d+']);
    expect(scanner.findNextMatchSync('abc', 0)).toBeNull();
});

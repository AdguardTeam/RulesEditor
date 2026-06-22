import { toRegExp } from 'oniguruma-to-es';

/**
 * A single capture group's match span, mirroring vscode-oniguruma's
 * `IOnigCaptureIndex`. Element 0 of a match is the whole match.
 */
export interface OnigCaptureIndex {
    /**
     * UTF-16 start offset, or {@link NOT_MATCHED} for a non-participating group.
     */
    start: number;
    /**
     * UTF-16 end offset, or {@link NOT_MATCHED} for a non-participating group.
     */
    end: number;
    /**
     * Length in UTF-16 code units (`end - start`, or `0` when unmatched).
     */
    length: number;
}

/**
 * A scanner match result, mirroring vscode-oniguruma's `IOnigMatch`.
 */
export interface OnigMatch {
    /**
     * Index of the matched pattern within the scanner's pattern array.
     */
    index: number;
    /**
     * Capture spans; element 0 is the whole match.
     */
    captureIndices: OnigCaptureIndex[];
}

/**
 * A wrapped input string, mirroring vscode-oniguruma's `OnigString`.
 */
export interface OnigString {
    /**
     * The wrapped string content.
     */
    readonly content: string;
    /**
     * Releases resources. A no-op for the native engine.
     *
     * @returns Nothing.
     */
    dispose(): void;
}

/**
 * A compiled multi-pattern scanner, mirroring vscode-oniguruma's `OnigScanner`.
 */
export interface OnigScanner {
    /**
     * Finds the leftmost match at or after `startPosition` across all patterns.
     * Ties (equal start offsets) resolve to the earliest pattern in the array.
     *
     * @param string The input string or {@link OnigString}.
     * @param startPosition The UTF-16 offset to start searching from.
     * @returns The match, or `null` when no pattern matches.
     */
    findNextMatchSync(string: string | OnigString, startPosition: number): OnigMatch | null;
    /**
     * Releases resources. A no-op for the native engine.
     *
     * @returns Nothing.
     */
    dispose(): void;
}

/**
 * Sentinel start/end value vscode-oniguruma uses for non-participating capture
 * groups (unsigned 32-bit -1). Reproduced for result parity.
 */
const NOT_MATCHED = 0xFFFFFFFF;

/**
 * Caches compiled regexes by their Oniguruma source so identical patterns
 * (anchor variants, repeated rules) are converted at most once.
 */
const regexCache = new Map<string, RegExp>();

/**
 * Converts an Oniguruma pattern to a native (Emulated) `RegExp`, memoized.
 * Options mirror the build-time validation gate in
 * `scripts/update-grammars.mts`: `strict` accuracy, the `g` flag (so `exec`
 * honors `lastIndex`), the `d` flag (so capture offsets are available), and
 * `allowOrphanBackrefs` (so `end`/`while` patterns referencing `begin` groups
 * convert). `\G` patterns gain the sticky `y` flag automatically.
 *
 * @param pattern The Oniguruma regex source.
 * @returns The compiled `RegExp` (an `EmulatedRegExp` that remaps captures).
 */
function compilePattern(pattern: string): RegExp {
    const cached = regexCache.get(pattern);
    if (cached) {
        return cached;
    }
    const regex = toRegExp(pattern, {
        accuracy: 'strict',
        global: true,
        hasIndices: true,
        rules: { allowOrphanBackrefs: true },
    });
    regexCache.set(pattern, regex);
    return regex;
}

/**
 * Maps a native `RegExpExecArray` (with `d`-flag indices) to vscode-oniguruma
 * capture spans. Non-participating groups use the {@link NOT_MATCHED} sentinel.
 *
 * @param match The successful match, including `indices`.
 * @returns The capture spans, element 0 being the whole match.
 */
function toCaptureIndices(match: RegExpExecArray): OnigCaptureIndex[] {
    return match.indices!.map((pair) => (pair
        ? { start: pair[0], end: pair[1], length: pair[1] - pair[0] }
        : { start: NOT_MATCHED, end: NOT_MATCHED, length: 0 }));
}

/**
 * Creates a wrapped input string compatible with vscode-textmate.
 *
 * @param content The string to wrap.
 * @returns An {@link OnigString}.
 */
export function createOnigString(content: string): OnigString {
    return {
        content,
        dispose(): void {
            // No native resources to release.
        },
    };
}

/**
 * Creates a native-RegExp scanner compatible with vscode-textmate's `onigLib`.
 * Patterns are the Oniguruma sources vscode-textmate produces after resolving
 * anchors and back-references.
 *
 * @param patterns The Oniguruma pattern sources.
 * @returns An {@link OnigScanner}.
 */
export function createOnigScanner(patterns: string[]): OnigScanner {
    const regexes = patterns.map(compilePattern);
    return {
        findNextMatchSync(string: string | OnigString, startPosition: number): OnigMatch | null {
            const text = typeof string === 'string' ? string : string.content;
            let best: OnigMatch | null = null;
            let bestStart = Number.POSITIVE_INFINITY;
            for (let i = 0; i < regexes.length; i += 1) {
                const regex = regexes[i];
                regex.lastIndex = startPosition;
                const match = regex.exec(text);
                if (match && match.index < bestStart) {
                    bestStart = match.index;
                    best = { index: i, captureIndices: toCaptureIndices(match) };
                    if (bestStart === startPosition) {
                        break;
                    }
                }
            }
            return best;
        },
        dispose(): void {
            // No native resources to release.
        },
    };
}

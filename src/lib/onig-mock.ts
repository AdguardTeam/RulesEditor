import { toRegExpDetails, EmulatedRegExp } from 'oniguruma-to-es';
import { parse } from 'oniguruma-parser/parser';
import { traverse } from 'oniguruma-parser/traverser';

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
 * A compiled pattern together with whether it contains capturing groups.
 * Capture-less patterns are compiled without the `d` flag (no per-match
 * `.indices` computation) since only the whole-match span is ever needed.
 */
interface CompiledPattern {
    /**
     * The native `RegExp` (or {@link EmulatedRegExp} when emulation is required).
     */
    regex: RegExp;
    /**
     * Whether the pattern has at least one capturing group, determining whether
     * sub-capture spans must be read from `RegExpExecArray.indices`.
     */
    hasCaptures: boolean;
}

/**
 * Caches compiled patterns by their Oniguruma source so identical patterns
 * (anchor variants, repeated rules) are converted at most once.
 */
const regexCache = new Map<string, CompiledPattern>();

/**
 * Determines whether an Oniguruma pattern contains at least one capturing group
 * by parsing it into an AST with `oniguruma-parser` and looking for a
 * `CapturingGroup` node. Validation is skipped because grammar `end`/`while`
 * patterns reference `begin` groups (orphan backrefs) and may use look-behind
 * or Unicode properties that are only resolvable in context.
 *
 * @param pattern The Oniguruma regex source.
 * @returns `true` when the pattern has at least one capturing group.
 */
function hasCapturingGroups(pattern: string): boolean {
    const ast = parse(pattern, {
        skipBackrefValidation: true,
        skipLookbehindValidation: true,
        skipPropertyNameValidation: true,
    });
    let found = false;
    traverse(ast, {
        CapturingGroup(): void {
            found = true;
        },
    });
    return found;
}

/**
 * Converts an Oniguruma pattern to a native (or emulated) `RegExp`, memoized.
 * Uses {@link toRegExpDetails} so a plain `RegExp` is built whenever possible —
 * an {@link EmulatedRegExp} is only created when the conversion needs emulation
 * (hidden captures, capture transfers, a strategy, or lazy compilation).
 * Capture-less patterns drop the `d` flag to avoid computing `.indices`.
 *
 * Options mirror the build-time validation gate in
 * `scripts/update-grammars.mts`: `strict` accuracy, the `g` flag (so `exec`
 * honors `lastIndex`), the `d` flag (so capture offsets are available), and
 * `allowOrphanBackrefs` (so `end`/`while` patterns referencing `begin` groups
 * convert). `\G` patterns gain the sticky `y` flag automatically.
 *
 * @param pattern The Oniguruma regex source.
 * @returns The compiled pattern and whether it has capturing groups.
 */
function compilePattern(pattern: string): CompiledPattern {
    const cached = regexCache.get(pattern);
    if (cached) {
        return cached;
    }
    const { pattern: source, flags, options } = toRegExpDetails(pattern, {
        accuracy: 'strict',
        global: true,
        hasIndices: true,
        rules: { allowOrphanBackrefs: true },
    });
    let compiled: CompiledPattern;
    if (options) {
        // Emulation is required; keep the `d` flag so the subclass can remap
        // capture spans.
        compiled = { regex: new EmulatedRegExp(source, flags, options), hasCaptures: true };
    } else if (hasCapturingGroups(pattern)) {
        compiled = { regex: new RegExp(source, flags), hasCaptures: true };
    } else {
        // No capturing groups: drop the `d` flag and read the whole-match span
        // from `match.index`/`match[0]` instead of `match.indices`.
        compiled = { regex: new RegExp(source, flags.replace('d', '')), hasCaptures: false };
    }
    regexCache.set(pattern, compiled);
    return compiled;
}

/**
 * Maps a native `RegExpExecArray` (with `d`-flag indices) to vscode-oniguruma
 * capture spans. Non-participating groups use the {@link NOT_MATCHED} sentinel.
 *
 * @param match The successful match, including `indices`.
 * @returns The capture spans, element 0 being the whole match.
 */
function toCaptureIndices(match: RegExpExecArray): OnigCaptureIndex[] {
    const { indices } = match as RegExpExecArray & { indices: Array<[number, number] | undefined> };
    const result: OnigCaptureIndex[] = new Array(indices.length);
    for (let i = 0; i < indices.length; i += 1) {
        const pair = indices[i];
        result[i] = pair
            ? { start: pair[0], end: pair[1], length: pair[1] - pair[0] }
            : { start: NOT_MATCHED, end: NOT_MATCHED, length: 0 };
    }
    return result;
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
    const compiled = patterns.map(compilePattern);
    return {
        findNextMatchSync(string: string | OnigString, startPosition: number): OnigMatch | null {
            const text = typeof string === 'string' ? string : string.content;
            let bestIndex = -1;
            let bestStart = Number.POSITIVE_INFINITY;
            let bestMatch: RegExpExecArray | null = null;
            let bestHasCaptures = false;
            for (let i = 0; i < compiled.length; i += 1) {
                const { regex, hasCaptures } = compiled[i];
                regex.lastIndex = startPosition;
                const match = regex.exec(text);
                if (match && match.index < bestStart) {
                    bestStart = match.index;
                    bestIndex = i;
                    bestMatch = match;
                    bestHasCaptures = hasCaptures;
                    if (bestStart === startPosition) {
                        break;
                    }
                }
            }
            if (!bestMatch) {
                return null;
            }
            // Compute capture spans only once, for the winning match.
            const captureIndices = bestHasCaptures
                ? toCaptureIndices(bestMatch)
                : [{ start: bestStart, end: bestStart + bestMatch[0].length, length: bestMatch[0].length }];
            return { index: bestIndex, captureIndices };
        },
        dispose(): void {
            // No native resources to release.
        },
    };
}

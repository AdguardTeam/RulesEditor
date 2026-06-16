import type { Token } from './utils';

/**
 * A contiguous run of characters on a single line sharing one TextMate scope
 * stack, with its resolved highlight token.
 */
export interface TokenSegment {
    /** The exact substring this segment covers. */
    text: string;
    /** Inclusive start offset within the line. */
    startIndex: number;
    /** Exclusive end offset within the line. */
    endIndex: number;
    /** Full TextMate scope stack (outer to inner). */
    scopes: string[];
    /** Resolved highlight token, or `null` when no scope maps. */
    token: Token | null;
}

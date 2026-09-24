import type { Token } from './utils';

/**
 * Keyboard shortcut style of the host application. Selects the modifier keys
 * of the multi-cursor bindings: `'windows'` binds `Ctrl` through CodeMirror's
 * `Mod`, while `'mac'` keeps the literal `Ctrl` Ace used, since the macOS
 * browsers reserve `Cmd+Option+Left/Right` for previous/next tab. Every other
 * binding uses `Mod` whatever the mode is.
 */
export type HotkeyMode = 'windows' | 'mac';

/**
 * A contiguous run of characters on a single line sharing one TextMate scope
 * stack, with its resolved highlight token.
 */
export interface TokenSegment {
    /**
     * The exact substring this segment covers.
     */
    text: string;

    /**
     * Inclusive start offset within the line.
     */
    startIndex: number;

    /**
     * Exclusive end offset within the line.
     */
    endIndex: number;

    /**
     * Full TextMate scope stack (outer to inner).
     */
    scopes: string[];

    /**
     * Resolved highlight token, or `null` when no scope maps.
     */
    token: Token | null;
}

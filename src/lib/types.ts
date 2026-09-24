import type { Token } from './utils';

/**
 * Keyboard shortcut style of the host application. Selects the modifier keys
 * the editor's bindings use — `'windows'` binds `Ctrl` through CodeMirror's
 * `Mod`, while `'mac'` keeps the literal `Ctrl` of the shortcuts that macOS
 * browsers reserve for themselves when `Cmd` is used.
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

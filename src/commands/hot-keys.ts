import {
    copyLineDown,
    copyLineUp,
    deleteLine,
    moveLineDown,
    moveLineUp,
} from '@codemirror/commands';
import {
    findNext,
    findPrevious,
    gotoLine,
    openSearchPanel,
} from '@codemirror/search';
import {
    type ChangeSpec,
    type EditorState,
    type Extension,
    Prec,
    type SelectionRange,
} from '@codemirror/state';
import { type EditorView, type KeyBinding, keymap } from '@codemirror/view';

import type { HotkeyMode } from '../lib/types';
import { isCommentLine } from '../lib/utils';

import { toggleBreakpoint } from './breakpoints';
import {
    addCursorAbove,
    addCursorAboveSkipCurrent,
    addCursorBelow,
    addCursorBelowSkipCurrent,
    selectMoreAfter,
    selectMoreBefore,
    selectNextAfter,
    selectNextBefore,
    singleSelection,
} from './multi-cursor';

const COMMENT_MARKER = '!';
const HASH_COMMENT_MARKER = '#';

/**
 * Creates the marker DOM factory used for enabled rules in the gutter.
 *
 * @param options Color and inner HTML for the marker.
 * @param options.color Marker text color.
 * @param options.innerHTML Marker inner HTML.
 *
 * @returns A factory producing marker elements.
 */
export const createMarker = (options: { color?: string; innerHTML?: string }) => (): HTMLElement => {
    const marker = document.createElement('div');
    marker.style.color = options.color || '#67B279';
    marker.style.marginLeft = '-12px';
    marker.style.marginTop = '4px';
    marker.innerHTML = options.innerHTML
        || '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 16 16" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.9888 3.24536C14.4056 3.60773 14.4497 4.23936 14.0873 4.65614L7.13182 12.6561C6.94683 12.8689 6.68062 12.9937 6.39875 12.9998C6.11688 13.0059 5.84553 12.8927 5.65154 12.6881L1.94039 8.77448C1.56037 8.37373 1.57718 7.74079 1.97793 7.36077C2.37868 6.98075 3.01163 6.99756 3.39165 7.39831L6.34505 10.5128L12.578 3.34389C12.9404 2.92711 13.572 2.88299 13.9888 3.24536Z" fill="var(--stroke-icons-product-icon-default)"/></svg>';
    return marker;
};

/**
 * Collects the 1-based numbers of the lines touched by the given ranges, in
 * ascending order and without duplicates, so a shortcut acts on every visible
 * cursor exactly once.
 *
 * @param state The editor state.
 * @param ranges The selection ranges.
 *
 * @returns The distinct line numbers covered by the ranges.
 */
function selectedLineNumbers(state: EditorState, ranges: readonly SelectionRange[]): number[] {
    const numbers = new Set<number>();
    for (const range of ranges) {
        const first = state.doc.lineAt(range.from).number;
        const last = state.doc.lineAt(range.to).number;
        for (let number = first; number <= last; number += 1) {
            numbers.add(number);
        }
    }
    return [...numbers].sort((a, b) => a - b);
}

/**
 * Toggles an adblock comment (`! `) at the beginning of the given lines. If all
 * of them are already commented they are uncommented, otherwise every line gets
 * a `! ` prefix.
 *
 * @param view The editor view.
 * @param lines The 1-based numbers of the lines to toggle.
 *
 * @returns `true` so the keymap consumes the event.
 */
function toggleCommentOnLines(view: EditorView, lines: readonly number[]): boolean {
    const { state } = view;
    const changes: ChangeSpec[] = [];

    // Determine whether we are commenting or uncommenting.
    let allAreComments = true;
    for (const number of lines) {
        const { text } = state.doc.line(number);
        if (text !== '' && !isCommentLine(text)) {
            allAreComments = false;
            break;
        }
    }

    for (const number of lines) {
        const line = state.doc.line(number);
        if (allAreComments) {
            // Uncomment: strip `! `, `# ` or bare prefix.
            if (line.text.startsWith(`${COMMENT_MARKER} `)) {
                changes.push({ from: line.from, to: line.from + 2 });
            } else if (line.text.startsWith(COMMENT_MARKER)) {
                changes.push({ from: line.from, to: line.from + 1 });
            } else if (line.text.startsWith(`${HASH_COMMENT_MARKER} `)) {
                changes.push({ from: line.from, to: line.from + 2 });
            } else if (line.text.startsWith(HASH_COMMENT_MARKER)) {
                changes.push({ from: line.from, to: line.from + 1 });
            }
        } else if (line.text !== '') {
            // Comment: always prepend `! `.
            changes.push({ from: line.from, insert: `${COMMENT_MARKER} ` });
        }
    }

    view.dispatch({ changes });
    return true;
}

/**
 * Opens the search panel with the focus placed in the replace field, so the
 * "find & replace" shortcuts land the user directly in the replace input.
 *
 * The default CodeMirror search panel renders the replace field only when the
 * editor is editable (a read-only editor drops it), and a custom panel may
 * not render an input named `replace` at all. When no replace field is found,
 * the focus falls back to the find field of the default panel; a custom panel
 * (a consumer's `search({ createPanel })`) does not carry the built-in
 * panel's `cm-search` class, so the focus falls back further to the first
 * input of the open panel. The shortcut therefore still lands the user inside
 * the panel instead of being swallowed with the focus left wherever it was.
 *
 * @param view The editor view.
 *
 * @returns `true` so the keymap consumes the event.
 */
const openFindAndReplace = (view: EditorView): boolean => {
    openSearchPanel(view);

    // The input names are part of the default panel DOM rendered by
    // @codemirror/search and are stable across minor versions.
    const replaceField = view.dom.querySelector<HTMLInputElement>(
        '.cm-panel.cm-search input[name="replace"]',
    );
    if (replaceField) {
        replaceField.focus();
        replaceField.select();
        return true;
    }

    // The `cm-search` class is only set by the built-in search panel; with a
    // custom consumer panel it matches nothing, so fall back to the first
    // input of any open panel.
    const findField = view.dom.querySelector<HTMLInputElement>(
        '.cm-panel.cm-search input[name="search"]',
    ) ?? view.dom.querySelector<HTMLInputElement>('.cm-panel input');
    findField?.focus();

    return true;
};

/**
 * Builds the keymap that restores the shortcut set of the previous
 * (Ace-based) editor, so filter maintainers keep their muscle memory:
 * `Ctrl+K` / `Ctrl+Shift+K` for find next / previous on Windows/Linux,
 * `Ctrl+L` / `Cmd+L` for go to line, `Cmd+Option+ArrowUp/Down` for copying
 * lines on macOS, and `Ctrl+D` / `Cmd+D` for deleting a line.
 *
 * These chords intentionally supersede CodeMirror defaults that reuse them
 * ("select next occurrence" on `Mod-d`, "add cursor above" / "below" on
 * macOS `Cmd+Option+Arrow`, "delete line" on Windows/Linux `Ctrl+Shift+K`).
 * The keymap is registered before the built-in `defaultKeymap` /
 * `searchKeymap` at `Prec.high`, so it also beats the multi-cursor bindings
 * of `configureHotKeys` on the shared macOS `Cmd+Option+Arrow` chord — see
 * `init-editor.ts`.
 *
 * @returns A CodeMirror 6 keymap extension.
 */
export function configureAceParityKeys(): Extension {
    return Prec.high(keymap.of([
        // The Windows/Linux chords of Ace's `findnext` / `findprevious`;
        // macOS keeps `Cmd+G` / `Cmd+Shift+G` from `searchKeymap`, and its
        // `Ctrl+K` stays "delete to line end" (Ace's `removetolineend`).
        // The wrappers always consume the key: `findNext` / `findPrevious`
        // return `false` when the query has no match, and a `false` lets the
        // keydown fall through to the next binding on the chord — on
        // Windows/Linux `Ctrl+Shift+K` would hit `Shift-Mod-k` (delete line)
        // from the default keymap.
        {
            win: 'Ctrl-k',
            linux: 'Ctrl-k',
            run: (view): boolean => {
                findNext(view);
                return true;
            },
            shift: (view): boolean => {
                findPrevious(view);
                return true;
            },
            scope: 'editor search-panel',
        },
        // Ace's `gotoline`; `Ctrl+Alt+G` / `Cmd+Alt+G` from `searchKeymap`
        // stays available as well.
        { key: 'Mod-l', run: gotoLine, scope: 'editor search-panel' },
        // Ace copied lines with `Cmd+Option+Arrow` on macOS; Windows keeps
        // `Shift-Alt-Arrow` from `configureHotKeys`, and the CodeMirror
        // default on this chord ("add cursor above/below") stays intact off
        // macOS.
        { mac: 'Mod-Alt-ArrowUp', run: copyLineUp },
        { mac: 'Mod-Alt-ArrowDown', run: copyLineDown },
        // Ace's `removeline`, which CodeMirror replaces with "select next
        // occurrence" on the same chord. The wrapper always consumes the key:
        // `deleteLine` returns `false` in a read-only editor, and a
        // fall-through would reach `selectNextOccurrence` from the search
        // keymap and move the selection.
        {
            key: 'Mod-d',
            run: (view): boolean => {
                deleteLine(view);
                return true;
            },
        },
    ]));
}

/**
 * Toggles an adblock comment (`! `) at the beginning of every selected line,
 * for every selection range. If all selected lines are already commented they
 * are uncommented, otherwise every line gets a `! ` prefix.
 *
 * @param view The editor view.
 *
 * @returns `true` so the keymap consumes the event.
 */
export function toggleAdblockComment(view: EditorView): boolean {
    const { state } = view;
    return toggleCommentOnLines(view, selectedLineNumbers(state, state.selection.ranges));
}

/**
 * Builds the editor keymap, wiring line operations, multi-cursor editing,
 * search, comment toggle, the enabled-rule toggle, and save.
 *
 * The multi-cursor commands keep Ace's `Ctrl+Alt` chords instead of `Mod-Alt`:
 * on macOS `Mod-Alt` resolves to `Cmd+Alt`, and Chrome and Firefox intercept
 * `Cmd+Option+Left/Right` for previous/next tab, so those shortcuts would never
 * reach the editor. `mode` selects the modifiers of the multi-cursor bindings
 * only; every other binding uses `Mod` in both modes.
 *
 * The find & replace, comment-toggle, and save bindings are scoped to
 * `editor search-panel`, so they keep working while the focus is inside the
 * open search panel — without the scope the keydown consumes nothing there
 * and falls through to the browser.
 *
 * @param handlers Multi-cursor binding configuration and the toggle-rule /
 *   save callbacks.
 * @param handlers.mode Keyboard shortcut style of the host application; selects
 *   the modifiers of the multi-cursor bindings (see {@link HotkeyMode}).
 * @param handlers.withMultipleSelections Whether to bind the multi-cursor
 *   commands. Pass `false` together with
 *   `EditorState.allowMultipleSelections` being off, since every command would
 *   otherwise be collapsed back to a single range.
 * @param handlers.onToggleRule Invoked when a rule is toggled.
 * @param handlers.onSave Invoked when the save shortcut is pressed.
 *
 * @returns A CodeMirror 6 keymap extension.
 */
export function configureHotKeys(handlers: {
    mode: HotkeyMode;
    withMultipleSelections: boolean;
    onToggleRule?: (view: EditorView) => void;
    onSave?: (view: EditorView) => void;
}): Extension {
    // Ace binds the multi-cursor commands to `Ctrl-Alt` on every platform,
    // including macOS. On Windows and Linux `Mod` resolves to `Ctrl` anyway, so
    // only `mac` needs the literal modifier.
    const multiCursor = handlers.mode === 'mac' ? 'Ctrl-Alt' : 'Mod-Alt';

    // `withMultipleSelections: false` switches multi-cursor editing off, so the
    // commands are not bound at all: `allowMultipleSelections` is off and every
    // dispatch would be collapsed back to a single range anyway.
    const multiCursorBindings: KeyBinding[] = handlers.withMultipleSelections
        ? [
            // `preventDefault` swallows the chord even when the command declines
            // (a cursor on the first or last line, or an empty cursor with no
            // word under it), so the browser does not treat it as a tab switch
            // or a window-manager shortcut. Declining is not a hard stop: the
            // keymap moves on to the next binding for the same key, and
            // `defaultKeymap` binds `Mod-Alt-ArrowUp` / `Mod-Alt-ArrowDown` to
            // its own add-cursor commands, so a range that cannot be moved can
            // still gain a bare cursor. That is deliberate — claiming the chord
            // as handled while nothing happens would hide the decline.
            { key: `${multiCursor}-ArrowUp`, run: addCursorAbove, preventDefault: true },
            { key: `${multiCursor}-ArrowDown`, run: addCursorBelow, preventDefault: true },
            { key: `${multiCursor}-Shift-ArrowUp`, run: addCursorAboveSkipCurrent, preventDefault: true },
            { key: `${multiCursor}-Shift-ArrowDown`, run: addCursorBelowSkipCurrent, preventDefault: true },
            { key: `${multiCursor}-ArrowLeft`, run: selectMoreBefore, preventDefault: true },
            { key: `${multiCursor}-ArrowRight`, run: selectMoreAfter, preventDefault: true },
            { key: `${multiCursor}-Shift-ArrowLeft`, run: selectNextBefore, preventDefault: true },
            { key: `${multiCursor}-Shift-ArrowRight`, run: selectNextAfter, preventDefault: true },
            // No `preventDefault` here: with a single cursor there is nothing to
            // collapse, and marking the key as handled would suppress the
            // browser default (`Escape` closing a dialog or a popover, leaving
            // fullscreen) for a keypress the editor does not use.
            { key: 'Escape', run: singleSelection },
        ]
        : [];

    // `Prec.high` gives these bindings precedence over `defaultKeymap`, which
    // also binds `Mod-Alt-ArrowUp`/`Mod-Alt-ArrowDown` (to CodeMirror's own
    // add-cursor commands) and `Escape` (to `simplifySelection`). Keymaps are
    // consulted in precedence order and stop at the first command that returns
    // true, so without this the bindings below would never run.
    return Prec.high(keymap.of([
        { key: 'Alt-ArrowUp', run: moveLineUp },
        { key: 'Alt-ArrowDown', run: moveLineDown },
        { key: 'Shift-Alt-ArrowUp', run: copyLineUp },
        { key: 'Shift-Alt-ArrowDown', run: copyLineDown },
        ...multiCursorBindings,
        // Ctrl+H opens the search panel with the focus in the replace field
        // ("find & replace"). On macOS this binding is inert — Cmd+H is
        // reserved by the OS/browser ("hide application") — so Cmd+Alt+F
        // covers find & replace there, matching the previous editor.
        // The scope matches the search panel so the shortcut also works
        // while the focus is inside the open panel.
        { key: 'Mod-h', run: openFindAndReplace, scope: 'editor search-panel' },
        { key: 'Mod-Alt-f', run: openFindAndReplace, scope: 'editor search-panel' },
        {
            key: 'Mod-/',
            run: (view): boolean => {
                const { state } = view;
                const lines = selectedLineNumbers(state, state.selection.ranges);
                const ruleLines = lines
                    .map((number) => state.doc.line(number))
                    .filter((line) => !isCommentLine(line.text));
                if (ruleLines.length > 0) {
                    view.dispatch({
                        effects: ruleLines.map((line) => toggleBreakpoint.of(line.from)),
                    });
                    handlers.onToggleRule?.(view);
                }
                return toggleCommentOnLines(view, lines);
            },
            scope: 'editor search-panel',
        },
        {
            key: 'Mod-s',
            run: (view): boolean => {
                handlers.onSave?.(view);
                return true;
            },
            scope: 'editor search-panel',
        },
    ]));
}

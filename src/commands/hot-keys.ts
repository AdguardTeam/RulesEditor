import {
    copyLineDown,
    copyLineUp,
    moveLineDown,
    moveLineUp,
} from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import {
    type ChangeSpec,
    type EditorState,
    type Extension,
    Prec,
    type SelectionRange,
} from '@codemirror/state';
import { type EditorView, keymap } from '@codemirror/view';

import { isCommentLine } from '../lib/utils';

import { isBreakpointAt, toggleBreakpoint } from './breakpoints';
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
 * Toggles an adblock comment (`! `) at the beginning of every selected line.
 * If all selected lines are already commented they are uncommented, otherwise
 * every line gets a `! ` prefix.
 *
 * @param view The editor view.
 *
 * @returns `true` so the keymap consumes the event.
 */
export function toggleAdblockComment(view: EditorView): boolean {
    const { state } = view;
    const { from, to } = state.selection.main;
    const startLine = state.doc.lineAt(from);
    const endLine = state.doc.lineAt(to);

    const changes: ChangeSpec[] = [];

    // Determine whether we are commenting or uncommenting.
    let allAreComments = true;
    for (let i = startLine.number; i <= endLine.number; i += 1) {
        const { text } = state.doc.line(i);
        if (text !== '' && !isCommentLine(text)) {
            allAreComments = false;
            break;
        }
    }

    for (let i = startLine.number; i <= endLine.number; i += 1) {
        const line = state.doc.line(i);
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
 * Builds the editor keymap, wiring line operations, multi-cursor editing,
 * search, comment toggle, the enabled-rule toggle, and save.
 *
 * The multi-cursor commands keep Ace's `Ctrl+Alt` chords instead of `Mod-Alt`:
 * on macOS `Mod-Alt` resolves to `Cmd+Alt`, and Chrome and Firefox intercept
 * `Cmd+Option+Left/Right` for previous/next tab, so those shortcuts would never
 * reach the editor. `mode` picks the binding set, like the rest of the editor's
 * configuration.
 *
 * @param handlers Optional toggle-rule and save callbacks.
 * @param handlers.mode Keyboard shortcut style of the host application.
 * @param handlers.onToggleRule Invoked when a rule is toggled.
 * @param handlers.onSave Invoked when the save shortcut is pressed.
 *
 * @returns A CodeMirror 6 keymap extension.
 */
export function configureHotKeys(handlers: {
    mode: 'windows' | 'mac';
    onToggleRule?: (view: EditorView) => void;
    onSave?: (view: EditorView) => void;
}): Extension {
    // Ace binds the multi-cursor commands to `Ctrl-Alt` on every platform,
    // including macOS. On Windows and Linux `Mod` resolves to `Ctrl` anyway, so
    // only `mac` needs the literal modifier.
    const multiCursor = handlers.mode === 'mac' ? 'Ctrl-Alt' : 'Mod-Alt';

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
        // AG-57986: multi-cursor commands with the Ace editor's bindings.
        // `preventDefault` swallows the chord even when the command declines
        // (a cursor on the first or last line, or an empty cursor with no word
        // under it), so the browser does not treat it as a tab switch or a
        // window-manager shortcut.
        { key: `${multiCursor}-ArrowUp`, run: addCursorAbove, preventDefault: true },
        { key: `${multiCursor}-ArrowDown`, run: addCursorBelow, preventDefault: true },
        { key: `${multiCursor}-Shift-ArrowUp`, run: addCursorAboveSkipCurrent, preventDefault: true },
        { key: `${multiCursor}-Shift-ArrowDown`, run: addCursorBelowSkipCurrent, preventDefault: true },
        { key: `${multiCursor}-ArrowLeft`, run: selectMoreBefore, preventDefault: true },
        { key: `${multiCursor}-ArrowRight`, run: selectMoreAfter, preventDefault: true },
        { key: `${multiCursor}-Shift-ArrowLeft`, run: selectNextBefore, preventDefault: true },
        { key: `${multiCursor}-Shift-ArrowRight`, run: selectNextAfter, preventDefault: true },
        { key: 'Escape', run: singleSelection, preventDefault: true },
        { key: 'Mod-h', run: openSearchPanel },
        {
            key: 'Mod-/',
            run: (view): boolean => {
                const { state } = view;
                const ruleLines = selectedLineNumbers(state, state.selection.ranges)
                    .map((number) => state.doc.line(number))
                    .filter((line) => !isCommentLine(line.text));
                if (ruleLines.length > 0) {
                    view.dispatch({
                        effects: ruleLines.map((line) => toggleBreakpoint.of(line.from)),
                    });
                    handlers.onToggleRule?.(view);
                }
                return toggleAdblockComment(view);
            },
        },
        {
            key: 'Mod-s',
            run: (view): boolean => {
                handlers.onSave?.(view);
                return true;
            },
        },
    ]));
}

export { toggleBreakpoint, isBreakpointAt };

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
import type { ChangeSpec, Extension } from '@codemirror/state';
import { type EditorView, keymap } from '@codemirror/view';

import { isCommentLine } from '../lib/utils';

import { isBreakpointAt, toggleBreakpoint } from './breakpoints';

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
 * Opens the search panel with the focus placed in the replace field, so the
 * "find & replace" shortcuts land the user directly in the replace input.
 *
 * The default CodeMirror search panel renders the replace field only when the
 * editor is editable (a read-only editor drops it), and a custom panel may
 * not render an input named `replace` at all. When no replace field is found,
 * the focus falls back to the find field, so the shortcut still lands the
 * user inside the panel instead of being swallowed with the focus left
 * wherever it was.
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

    view.dom.querySelector<HTMLInputElement>(
        '.cm-panel.cm-search input[name="search"]',
    )?.focus();

    return true;
};

/**
 * Builds the keymap that restores the shortcut set of the previous
 * (Ace-based) editor, so filter maintainers keep their muscle memory:
 * `Ctrl+K` / `Ctrl+Shift+K` for find next / previous, `Ctrl+L` / `Cmd+L`
 * for go to line, `Cmd+Option+ArrowUp/Down` for copying lines, and
 * `Ctrl+D` / `Cmd+D` for deleting a line.
 *
 * These chords intentionally supersede CodeMirror defaults that reuse them
 * ("select next occurrence" on `Mod-d`, "add cursor above" / "below" on
 * `Mod-Alt-Arrow`), so this keymap must be registered before the built-in
 * `defaultKeymap` / `searchKeymap` — see `init-editor.ts`.
 *
 * @returns A CodeMirror 6 keymap extension.
 */
export function configureAceParityKeys(): Extension {
    return keymap.of([
        // The Windows/Linux chords of Ace's `findnext` / `findprevious`;
        // macOS keeps `Cmd+G` / `Cmd+Shift+G` from `searchKeymap`.
        {
            key: 'Ctrl-k',
            run: findNext,
            shift: findPrevious,
            scope: 'editor search-panel',
        },
        // Ace's `gotoline`; `Ctrl+Alt+G` / `Cmd+Alt+G` from `searchKeymap`
        // stays available as well.
        { key: 'Mod-l', run: gotoLine, scope: 'editor search-panel' },
        // Ace copied lines with `Cmd+Option+Arrow` on macOS
        // (`Mod-Alt-Arrow` there); Windows keeps `Shift-Alt-Arrow` from
        // `configureHotKeys`.
        { key: 'Mod-Alt-ArrowUp', run: copyLineUp },
        { key: 'Mod-Alt-ArrowDown', run: copyLineDown },
        // Ace's `removeline`, which CodeMirror replaces with "select next
        // occurrence" on the same chord.
        { key: 'Mod-d', run: deleteLine },
    ]);
}

/**
 * Builds the editor keymap, wiring line operations, search, comment toggle,
 * the enabled-rule toggle, and save.
 *
 * The find & replace, comment-toggle, and save bindings are scoped to
 * `editor search-panel`, so they keep working while the focus is inside the
 * open search panel — without the scope the keydown consumes nothing there
 * and falls through to the browser.
 *
 * @param handlers Optional toggle-rule and save callbacks.
 * @param handlers.onToggleRule Invoked when a rule is toggled.
 * @param handlers.onSave Invoked when the save shortcut is pressed.
 *
 * @returns A CodeMirror 6 keymap extension.
 */
export function configureHotKeys(handlers: {
    onToggleRule?: (view: EditorView) => void;
    onSave?: (view: EditorView) => void;
}): Extension {
    return keymap.of([
        { key: 'Alt-ArrowUp', run: moveLineUp },
        { key: 'Alt-ArrowDown', run: moveLineDown },
        { key: 'Shift-Alt-ArrowUp', run: copyLineUp },
        { key: 'Shift-Alt-ArrowDown', run: copyLineDown },
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
                const line = view.state.doc.lineAt(view.state.selection.main.head);
                if (!isCommentLine(line.text)) {
                    view.dispatch({ effects: toggleBreakpoint.of(line.from) });
                    handlers.onToggleRule?.(view);
                }
                return toggleAdblockComment(view);
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
    ]);
}

export { toggleBreakpoint, isBreakpointAt };

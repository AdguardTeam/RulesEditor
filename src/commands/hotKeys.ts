import { keymap, type EditorView } from '@codemirror/view';
import {
    moveLineUp,
    moveLineDown,
    copyLineUp,
    copyLineDown,
} from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import type { Extension, ChangeSpec } from '@codemirror/state';
import { toggleBreakpoint, isBreakpointAt } from './breakpoints';
import { findCosmeticRuleMarker } from '../lib/utils';

const COMMENT_MARKER = '!';

/**
 * Returns `true` when a line is purely a comment — it starts with `!`, or it
 * starts with `#` and {@link findCosmeticRuleMarker} does not match a valid
 * cosmetic rule separator (meaning it's a legacy `#`-style comment).
 *
 * @param text The line text.
 * @returns `true` if the line is a comment, `false` otherwise.
 */
function isCommentLine(text: string): boolean {
    if (text.startsWith(COMMENT_MARKER)) {
        return true;
    }
    if (text.startsWith('#') && findCosmeticRuleMarker(text)[0] === -1) {
        return true;
    }
    return false;
}

/**
 * Creates the marker DOM factory used for enabled rules in the gutter.
 *
 * @param options Color and inner HTML for the marker.
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
 * @returns `true` so the keymap consumes the event.
 */
function toggleAdblockComment(view: EditorView): boolean {
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
            } else if (line.text.startsWith('# ')) {
                changes.push({ from: line.from, to: line.from + 2 });
            } else if (line.text.startsWith('#')) {
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
 * Builds the editor keymap, wiring line operations, search, comment toggle,
 * the enabled-rule toggle, and save.
 *
 * @param handlers Optional toggle-rule and save callbacks.
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
        { key: 'Mod-h', run: openSearchPanel },
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
        },
        {
            key: 'Mod-s',
            run: (view): boolean => {
                handlers.onSave?.(view);
                return true;
            },
        },
    ]);
}

export { toggleBreakpoint, isBreakpointAt };

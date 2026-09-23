// @vitest-environment jsdom
import { undo } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { expect, test } from 'vitest';

import { initEditor, type InitEditorConfig } from '../src/init-editor';

const DOC = '||a.com^\n||b.com^';

/**
 * Creates an editor over a two-line document without WASM.
 *
 * @param conf Configuration overrides for `initEditor`.
 *
 * @returns The created editor view.
 */
async function createView(conf: Partial<InitEditorConfig> = {}) {
    const textarea = document.createElement('textarea');
    textarea.value = DOC;
    document.body.appendChild(textarea);
    return initEditor(textarea, undefined, {
        hotkeys: { mode: 'windows' },
        highlight: 'none',
        ...conf,
    });
}

test('EditorState.allowMultipleSelections is enabled', async () => {
    const view = await createView();
    expect(view.state.facet(EditorState.allowMultipleSelections)).toBe(true);
    view.destroy();
});

test('multiple selection ranges are preserved instead of collapsed', async () => {
    const view = await createView();
    view.dispatch({
        selection: EditorSelection.create(
            [EditorSelection.cursor(0), EditorSelection.cursor(9)],
            0,
        ),
    });
    expect(view.state.selection.ranges.length).toBe(2);
    expect(view.state.selection.main.from).toBe(0);
    view.destroy();
});

test('drawSelection mounts cursor and selection layers', async () => {
    const view = await createView();
    // The layers exist as DOM elements right after init; without
    // `drawSelection()` no `.cm-cursorLayer` / `.cm-selectionLayer` exists.
    expect(view.dom.querySelector('.cm-cursorLayer')).not.toBeNull();
    expect(view.dom.querySelector('.cm-selectionLayer')).not.toBeNull();
    view.destroy();
});

test('a secondary cursor is rendered for every range after a measure pass', async () => {
    // jsdom has no layout, and its `Range` has no `getClientRects`, which
    // `drawSelection` needs to place the cursors; stub it so the layers are
    // really drawn instead of staying empty.
    const proto = Range.prototype as unknown as { getClientRects?: () => DOMRectList };
    const original = proto.getClientRects;
    const rect = {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 16,
        toJSON: () => ({}),
    };
    proto.getClientRects = () => Object.assign([rect], {
        item: () => rect,
        length: 1,
    }) as unknown as DOMRectList;
    try {
        const view = await createView();
        view.dispatch({
            selection: EditorSelection.create(
                [EditorSelection.cursor(0), EditorSelection.cursor(9)],
                0,
            ),
        });
        view.requestMeasure();
        await new Promise((resolve) => { requestAnimationFrame(resolve); });
        // One cursor per range, and the non-main one is the secondary cursor.
        expect(view.dom.querySelectorAll('.cm-cursor-primary')).toHaveLength(1);
        expect(view.dom.querySelectorAll('.cm-cursor-secondary')).toHaveLength(1);
        view.destroy();
    } finally {
        if (original) {
            proto.getClientRects = original;
        } else {
            delete proto.getClientRects;
        }
    }
});

test('withMultipleSelections: false leaves multi-selection off', async () => {
    const view = await createView({ withMultipleSelections: false });
    expect(view.state.facet(EditorState.allowMultipleSelections)).toBe(false);
    view.dispatch({
        selection: EditorSelection.create(
            [EditorSelection.cursor(0), EditorSelection.cursor(9)],
            0,
        ),
    });
    // CodeMirror collapses the extra ranges instead of keeping them.
    expect(view.state.selection.ranges.length).toBe(1);
    view.destroy();
});

test('modifier+click add: the range at the clicked position is added', async () => {
    const view = await createView();
    // The exact transaction CodeMirror's built-in modifier+click handler
    // dispatches in "add" mode: `state.selection.addRange(cursor)`.
    view.dispatch({ selection: view.state.selection.addRange(EditorSelection.cursor(9)) });
    expect(view.state.selection.ranges.length).toBe(2);
    expect(view.state.selection.main.from).toBe(9);
    view.destroy();
});

test('modifier+click remove: clicking an existing secondary cursor removes it', async () => {
    const view = await createView();
    view.dispatch({
        selection: EditorSelection.create(
            [EditorSelection.cursor(0), EditorSelection.cursor(9)],
            1,
        ),
    });
    // Mirrors `removeRangeAround` in CodeMirror's built-in handler: the range
    // containing the clicked position is dropped and the main range survives.
    const { ranges, mainIndex } = view.state.selection;
    const removedIndex = 1;
    view.dispatch({
        selection: EditorSelection.create(
            ranges.slice(0, removedIndex).concat(ranges.slice(removedIndex + 1)),
            mainIndex === removedIndex ? 0 : mainIndex - 1,
        ),
    });
    expect(view.state.selection.ranges.length).toBe(1);
    expect(view.state.selection.main.from).toBe(0);
    view.destroy();
});

test('plain click collapses the selection to a single range', async () => {
    const view = await createView();
    view.dispatch({
        selection: EditorSelection.create(
            [EditorSelection.cursor(0), EditorSelection.cursor(9)],
            0,
        ),
    });
    // A plain click dispatches `EditorSelection.create([range])`.
    view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(5)]) });
    expect(view.state.selection.ranges.length).toBe(1);
    expect(view.state.selection.main.from).toBe(5);
    view.destroy();
});

test('typing with multiple cursors changes every range in one undo step', async () => {
    const view = await createView();
    view.dispatch({
        selection: EditorSelection.create(
            [EditorSelection.cursor(0), EditorSelection.cursor(9)],
            0,
        ),
    });
    // Typing with two cursors produces one transaction with one change per
    // range; a single undo must revert all of them together.
    view.dispatch({ changes: [{ from: 0, insert: 'x' }, { from: 9, insert: 'x' }] });
    expect(view.state.doc.toString()).toBe('x||a.com^\nx||b.com^');
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(DOC);
    view.destroy();
});

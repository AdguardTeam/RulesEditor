// @vitest-environment jsdom
import { EditorSelection, EditorState, Text } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { expect, test } from 'vitest';

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
} from '../src/commands/multi-cursor';
import { initEditor } from '../src/init-editor';

const DOC = '||a.com^\n||b.com^\n||c.com^';

/**
 * Creates an EditorView with multi-selection enabled.
 *
 * @param doc The initial content of the editor.
 * @param selection Optional anchor/head selection; defaults to a cursor at 0.
 * @param selection.anchor Selection anchor offset.
 * @param selection.head Selection head offset.
 *
 * @returns An EditorView instance.
 */
function makeView(doc = DOC, selection?: { anchor: number; head: number }): EditorView {
    return new EditorView({
        state: EditorState.create({
            doc,
            selection,
            extensions: [EditorState.allowMultipleSelections.of(true)],
        }),
        parent: document.body,
    });
}

/**
 * Reads the current selection as `from`/`to` pairs, in document order.
 *
 * @param view The editor view.
 *
 * @returns One `from`/`to` pair per selection range.
 */
function ranges(view: EditorView): { from: number; to: number }[] {
    return view.state.selection.ranges.map((range) => ({ from: range.from, to: range.to }));
}

test('addCursorBelow adds a cursor one line below at the same column', () => {
    const view = makeView(DOC, { anchor: 3, head: 3 });
    expect(addCursorBelow(view)).toBe(true);
    expect(ranges(view)).toEqual([{ from: 3, to: 3 }, { from: 12, to: 12 }]);
    // The newly added cursor becomes the main range, so repeated presses walk down.
    expect(view.state.selection.main.head).toBe(12);
    view.destroy();
});

test('addCursorAbove adds a cursor one line above at the same column', () => {
    const view = makeView(DOC, { anchor: 12, head: 12 });
    expect(addCursorAbove(view)).toBe(true);
    expect(ranges(view)).toEqual([{ from: 3, to: 3 }, { from: 12, to: 12 }]);
    expect(view.state.selection.main.head).toBe(3);
    view.destroy();
});

test('addCursorBelow clamps the column to the target line length', () => {
    const doc = 'long-rule.com\nshort';
    const view = makeView(doc, { anchor: 8, head: 8 });
    addCursorBelow(view);
    expect(view.state.selection.main.head).toBe(doc.indexOf('short') + 'short'.length);
    view.destroy();
});

test('addCursorAbove on the first line does nothing', () => {
    const view = makeView(DOC, { anchor: 3, head: 3 });
    expect(addCursorAbove(view)).toBe(false);
    expect(ranges(view)).toEqual([{ from: 3, to: 3 }]);
    view.destroy();
});

test('repeated addCursorBelow builds one cursor per line and edits them together', () => {
    const view = makeView(DOC, { anchor: 3, head: 3 });
    addCursorBelow(view);
    addCursorBelow(view);
    expect(ranges(view)).toEqual([
        { from: 3, to: 3 },
        { from: 12, to: 12 },
        { from: 21, to: 21 },
    ]);
    view.dispatch({ changes: view.state.selection.ranges.map((range) => ({ from: range.head, insert: 'x' })) });
    expect(view.state.doc.toString()).toBe('||ax.com^\n||bx.com^\n||cx.com^');
    view.destroy();
});

test('addCursorBelowSkipCurrent moves the last cursor instead of adding one', () => {
    const view = makeView(DOC, { anchor: 3, head: 3 });
    addCursorBelow(view);
    expect(addCursorBelowSkipCurrent(view)).toBe(true);
    expect(ranges(view)).toEqual([{ from: 3, to: 3 }, { from: 21, to: 21 }]);
    expect(view.state.selection.main.head).toBe(21);
    view.destroy();
});

test('addCursorAboveSkipCurrent moves the last cursor instead of adding one', () => {
    const view = makeView(DOC, { anchor: 21, head: 21 });
    addCursorAbove(view);
    expect(addCursorAboveSkipCurrent(view)).toBe(true);
    expect(ranges(view)).toEqual([{ from: 3, to: 3 }, { from: 21, to: 21 }]);
    view.destroy();
});

test('addCursorBelowSkipCurrent adds a cursor on the first press, as in Ace', () => {
    // Ace's `selectMoreLines` only skips the current range in multi-select
    // mode, so with a single cursor the first press adds one.
    const view = makeView(DOC, { anchor: 3, head: 3 });
    expect(addCursorBelowSkipCurrent(view)).toBe(true);
    expect(ranges(view)).toEqual([{ from: 3, to: 3 }, { from: 12, to: 12 }]);
    expect(view.state.selection.main.head).toBe(12);
    view.destroy();
});

test('selectMoreAfter adds the next occurrence of the selected text', () => {
    const doc = 'a.com\nb.com\na.com';
    const view = makeView(doc, { anchor: 0, head: 5 });
    expect(selectMoreAfter(view)).toBe(true);
    expect(ranges(view)).toEqual([{ from: 0, to: 5 }, { from: 12, to: 17 }]);
    expect(view.state.selection.main.from).toBe(12);
    view.destroy();
});

test('selectMoreBefore adds the previous occurrence of the selected text', () => {
    const doc = 'a.com\nb.com\na.com';
    const view = makeView(doc, { anchor: 12, head: 17 });
    expect(selectMoreBefore(view)).toBe(true);
    expect(ranges(view)).toEqual([{ from: 0, to: 5 }, { from: 12, to: 17 }]);
    view.destroy();
});

test('selectMoreAfter selects the word under an empty cursor and its next occurrence', () => {
    const doc = 'a.com\nb.com\na.com';
    const view = makeView(doc, { anchor: 2, head: 2 });
    selectMoreAfter(view);
    expect(ranges(view)).toEqual([{ from: 0, to: 5 }, { from: 12, to: 17 }]);
    view.destroy();
});

test('selectMoreAfter selects a non-ASCII word and its next occurrence', () => {
    const doc = '||пример.рф^\n||пример.рф^';
    const view = makeView(doc, { anchor: 4, head: 4 });
    expect(selectMoreAfter(view)).toBe(true);
    expect(ranges(view)).toEqual([{ from: 2, to: 11 }, { from: 15, to: 24 }]);
    view.destroy();
});

test('selectMoreAfter selects a word that contains a combining mark', () => {
    // NFD `é` is `e` plus U+0301, which only `\p{M}` matches.
    const rule = '||e\u0301xample.com^';
    const doc = `${rule}\n${rule}`;
    const word = { from: 2, to: 2 + 'e\u0301xample.com'.length };
    const view = makeView(doc, { anchor: 3, head: 3 });
    expect(selectMoreAfter(view)).toBe(true);
    expect(ranges(view)).toEqual([
        word,
        { from: word.from + rule.length + 1, to: word.to + rule.length + 1 },
    ]);
    view.destroy();
});

test('selectMoreAfter selects the word next to a cursor on a non-word character', () => {
    // A cursor on `^` expands to the domain to its left.
    const doc = '||a.com^\n||a.com^';
    const view = makeView(doc, { anchor: 7, head: 7 });
    selectMoreAfter(view);
    expect(ranges(view)).toEqual([{ from: 2, to: 7 }, { from: 11, to: 16 }]);
    view.destroy();
});

test('selectNextAfter moves to the next occurrence instead of adding one', () => {
    const doc = 'a.com\nb.com\na.com';
    const view = makeView(doc, { anchor: 2, head: 2 });
    expect(selectNextAfter(view)).toBe(true);
    expect(ranges(view)).toEqual([{ from: 12, to: 17 }]);
    view.destroy();
});

test('selectNextBefore moves to the previous occurrence instead of adding one', () => {
    const doc = 'a.com\nb.com\na.com';
    const view = makeView(doc, { anchor: 12, head: 17 });
    expect(selectNextBefore(view)).toBe(true);
    expect(ranges(view)).toEqual([{ from: 0, to: 5 }]);
    view.destroy();
});

test('selectNextBefore wraps around to the last occurrence', () => {
    const doc = 'a.com\nb.com\na.com';
    const view = makeView(doc, { anchor: 0, head: 5 });
    expect(selectNextBefore(view)).toBe(true);
    expect(ranges(view)).toEqual([{ from: 12, to: 17 }]);
    view.destroy();
});

test('selectNextBefore stops when every occurrence is already selected', () => {
    // The backward scan must terminate when the selected match at index 0 is
    // the only candidate left.
    const doc = 'a.com\na.com';
    const view = makeView(doc, { anchor: 6, head: 11 });
    view.dispatch({
        selection: EditorSelection.create(
            [EditorSelection.range(0, 5), EditorSelection.range(6, 11)],
            1,
        ),
    });
    expect(selectNextBefore(view)).toBe(true);
    expect(ranges(view)).toEqual([{ from: 0, to: 5 }, { from: 6, to: 11 }]);
    view.destroy();
});

test('selectMoreAfter wraps around the document', () => {
    const doc = 'a.com\nb.com\na.com';
    const view = makeView(doc, { anchor: 12, head: 17 });
    selectMoreAfter(view);
    expect(ranges(view)).toEqual([{ from: 0, to: 5 }, { from: 12, to: 17 }]);
    view.destroy();
});

test('selectMoreBefore wraps around to the last occurrence', () => {
    const doc = 'a.com\nb.com\na.com';
    const view = makeView(doc, { anchor: 0, head: 5 });
    selectMoreBefore(view);
    expect(ranges(view)).toEqual([{ from: 0, to: 5 }, { from: 12, to: 17 }]);
    expect(view.state.selection.main.from).toBe(12);
    view.destroy();
});

test('selectMoreBefore stops when every occurrence is already selected', () => {
    // The backward scan must not find the selected match at index 0 over and
    // over (`lastIndexOf` clamps a negative position to 0).
    const doc = 'a.com\na.com';
    const view = makeView(doc, { anchor: 0, head: 5 });
    view.dispatch({
        selection: EditorSelection.create(
            [EditorSelection.range(0, 5), EditorSelection.range(6, 11)],
            1,
        ),
    });
    expect(selectMoreBefore(view)).toBe(true);
    expect(ranges(view)).toEqual([{ from: 0, to: 5 }, { from: 6, to: 11 }]);
    view.destroy();
});

test('selectMoreAfter selects every occurrence and then stops', () => {
    const doc = 'a.com\nb.com\na.com';
    const view = makeView(doc, { anchor: 0, head: 5 });
    selectMoreAfter(view);
    expect(ranges(view)).toEqual([{ from: 0, to: 5 }, { from: 12, to: 17 }]);
    // Every occurrence is selected, so there is no free match left to add.
    expect(selectMoreAfter(view)).toBe(true);
    expect(ranges(view)).toEqual([{ from: 0, to: 5 }, { from: 12, to: 17 }]);
    view.destroy();
});

test('selectMoreAfter matches a needle that spans a line break', () => {
    // Every line is a separate chunk of the document's rope, so a needle that
    // crosses a line break exercises the chunk overlap of the scan.
    const doc = 'a.com\nb.com\na.com\nb.com';
    const view = makeView(doc, { anchor: 0, head: 11 });
    expect(selectMoreAfter(view)).toBe(true);
    expect(ranges(view)).toEqual([{ from: 0, to: 11 }, { from: 12, to: 23 }]);
    view.destroy();
});

test('selectMoreBefore matches a needle that spans a line break', () => {
    const doc = 'a.com\nb.com\na.com\nb.com';
    const view = makeView(doc, { anchor: 12, head: 23 });
    expect(selectMoreBefore(view)).toBe(true);
    expect(ranges(view)).toEqual([{ from: 0, to: 11 }, { from: 12, to: 23 }]);
    view.destroy();
});

test('selectMoreBefore crosses scan windows in a large document', () => {
    // The backward scan reads the document in windows of 4096 characters, so
    // this occurrence is only reachable after crossing a window boundary.
    const needle = '||target.com^';
    const filler = Array.from({ length: 400 }, (_, i) => `||filler-${i}.com^`);
    const doc = [needle, ...filler, needle].join('\n');
    const last = doc.lastIndexOf(needle);
    expect(last).toBeGreaterThan(4096);
    const view = makeView(doc, { anchor: last, head: last + needle.length });
    expect(selectMoreBefore(view)).toBe(true);
    expect(ranges(view)).toEqual([
        { from: 0, to: needle.length },
        { from: last, to: last + needle.length },
    ]);
    view.destroy();
});

test('the occurrence scan does not copy the whole document', () => {
    // The scan walks the document in chunks instead of calling
    // `doc.toString()`, which would allocate a copy of the whole document on
    // every keypress.
    const original = Text.prototype.toString;
    Text.prototype.toString = () => {
        throw new Error('the document must not be copied');
    };
    try {
        const doc = 'a.com\nb.com\na.com';
        const view = makeView(doc, { anchor: 0, head: 5 });
        expect(selectMoreAfter(view)).toBe(true);
        expect(ranges(view)).toEqual([{ from: 0, to: 5 }, { from: 12, to: 17 }]);
        expect(selectMoreBefore(view)).toBe(true);
        expect(ranges(view)).toEqual([{ from: 0, to: 5 }, { from: 12, to: 17 }]);
        view.destroy();
    } finally {
        Text.prototype.toString = original;
    }
});

test('singleSelection collapses to the main range', () => {
    const view = makeView(DOC, { anchor: 3, head: 3 });
    addCursorBelow(view);
    expect(singleSelection(view)).toBe(true);
    expect(ranges(view)).toEqual([{ from: 12, to: 12 }]);
    view.destroy();
});

test('singleSelection leaves a single range alone', () => {
    const view = makeView(DOC, { anchor: 3, head: 3 });
    expect(singleSelection(view)).toBe(false);
    expect(ranges(view)).toEqual([{ from: 3, to: 3 }]);
    view.destroy();
});

test('initEditor registers the Ace multi-cursor keybindings', async () => {
    const textarea = document.createElement('textarea');
    textarea.value = DOC;
    document.body.appendChild(textarea);
    const view = await initEditor(textarea, undefined, {
        hotkeys: { mode: 'windows' },
        highlight: 'none',
    });
    const keys = view.state.facet(keymap).flat().map((binding) => binding.key);
    // `Mod` is Ctrl on Windows/Linux and Cmd on macOS.
    expect(keys).toEqual(expect.arrayContaining([
        'Mod-Alt-ArrowUp',
        'Mod-Alt-ArrowDown',
        'Mod-Alt-Shift-ArrowUp',
        'Mod-Alt-Shift-ArrowDown',
        'Mod-Alt-ArrowLeft',
        'Mod-Alt-ArrowRight',
        'Mod-Alt-Shift-ArrowLeft',
        'Mod-Alt-Shift-ArrowRight',
        'Escape',
    ]));
    view.destroy();
});

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
import { initEditor, type InitEditorConfig } from '../src/init-editor';
import type { HotkeyMode } from '../src/lib/types';

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

/**
 * Creates an editor through `initEditor`, the way a consumer does, so the real
 * keymap precedence is exercised.
 *
 * @param mode Hotkey mode passed to `initEditor`.
 * @param conf Additional configuration overrides.
 *
 * @returns The created editor view.
 */
async function createEditor(
    mode: HotkeyMode = 'windows',
    conf: Partial<InitEditorConfig> = {},
): Promise<EditorView> {
    const textarea = document.createElement('textarea');
    textarea.value = DOC;
    document.body.appendChild(textarea);
    return initEditor(textarea, undefined, {
        hotkeys: { mode },
        highlight: 'none',
        ...conf,
    });
}

/**
 * Dispatches a `keydown` event on the editor's content element.
 *
 * @param view The editor view.
 * @param key The `KeyboardEvent.key` value.
 * @param modifiers Modifier keys held down.
 * @param modifiers.ctrl Whether Ctrl is held down.
 * @param modifiers.alt Whether Alt is held down.
 * @param modifiers.shift Whether Shift is held down.
 *
 * @returns The dispatched event, so `defaultPrevented` can be inspected.
 */
function pressKey(
    view: EditorView,
    key: string,
    modifiers: { ctrl?: boolean; alt?: boolean; shift?: boolean } = {},
): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
        key,
        ctrlKey: modifiers.ctrl ?? false,
        altKey: modifiers.alt ?? false,
        shiftKey: modifiers.shift ?? false,
        bubbles: true,
        cancelable: true,
    });
    view.contentDOM.dispatchEvent(event);
    return event;
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

test('addCursorBelow treats the goal column as pixels, not as a character column', () => {
    // `goalColumn` holds a pixel x-offset set by CodeMirror's own vertical
    // motion, so reading it as a column would jump to the end of the line.
    const view = makeView(DOC, { anchor: 3, head: 3 });
    view.dispatch({ selection: EditorSelection.create([EditorSelection.range(3, 3, 120)]) });
    expect(addCursorBelow(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(12);
    // The pixel value is carried over instead of being overwritten with a
    // character offset, so a later ArrowDown keeps CodeMirror's goal column.
    expect(view.state.selection.main.goalColumn).toBe(120);
    view.destroy();

    // Without a goal column on the source range, none is invented either.
    const plain = makeView(DOC, { anchor: 3, head: 3 });
    expect(addCursorBelow(plain)).toBe(true);
    expect(plain.state.selection.main.goalColumn).toBeUndefined();
    plain.destroy();
});

test('addCursorBelow does not land inside a surrogate pair', () => {
    // Column 1 of the emoji line is between the halves of the surrogate pair.
    const doc = 'a\n\u{1F600}.com';
    const view = makeView(doc, { anchor: 1, head: 1 });
    expect(addCursorBelow(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(doc.indexOf('.com'));
    // Typing at the new cursor must not split the emoji in two.
    const { head } = view.state.selection.main;
    view.dispatch({ changes: { from: head, insert: '!' } });
    expect(view.state.doc.toString()).toBe('a\n\u{1F600}!.com');
    view.destroy();
});

test('addCursorBelow does not land inside a combining sequence', () => {
    // Column 1 of the second line is between `e` and its combining acute
    // accent; the cursor has to move past the whole cluster.
    const doc = 'ab\ne\u0301x';
    const view = makeView(doc, { anchor: 1, head: 1 });
    expect(addCursorBelow(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(doc.indexOf('x'));
    // Typing at the new cursor must not split the accent from its base letter.
    const { head } = view.state.selection.main;
    view.dispatch({ changes: { from: head, insert: '!' } });
    expect(view.state.doc.toString()).toBe('ab\ne\u0301!x');
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

test('the occurrence scans read the document in bounded slices', () => {
    // Both directions walk the document in windows. A needle longer than a
    // window used to leave a copy of itself in every window of the backward
    // scan, and the forward scan used to rebuild its buffer on every line, so a
    // keypress cost `lines × selection length`; a scan that fell back to
    // slicing the document whole would show up here as well.
    const needle = `||${'a'.repeat(32 * 1024)}^`;
    const line = '||filler-example.com^$third-party,domain=example.com\n';
    const doc = `${needle}\n${line.repeat(4096)}${needle}`;
    const view = makeView(doc, { anchor: doc.length - needle.length, head: doc.length });
    // `sliceString` is defined on the `Text` subclasses rather than on `Text`
    // itself, so the spy goes on the document instance the scans read.
    const text = view.state.doc;
    const originalSliceString = text.sliceString;
    const originalIndexOf = String.prototype.indexOf;
    let sliced = 0;
    let searches = 0;
    text.sliceString = function spy(this: Text, from: number, to: number, lineSep?: string): string {
        sliced += to - from;
        return originalSliceString.call(this, from, to, lineSep);
    };
    // The scans only search for the needle, so counting those searches is how
    // the forward scan's window size becomes observable from the outside.
    // eslint-disable-next-line no-extend-native
    String.prototype.indexOf = function spy(this: string, search: string, position?: number): number {
        if (search === needle) {
            searches += 1;
        }
        return originalIndexOf.call(this, search, position);
    };
    try {
        sliced = 0;
        expect(selectMoreBefore(view)).toBe(true);
        // Six windows of ~32 KB: the walk reads the document about twice, where
        // re-slicing the needle per 4096-character window reads it nine times.
        expect(sliced).toBeGreaterThan(0);
        expect(sliced).toBeLessThan(doc.length * 4);
        searches = 0;
        sliced = 0;
        expect(selectMoreAfter(view)).toBe(true);
        // The forward scan walks the document with `iterRange`, so it must not
        // slice anything; a fallback to `doc.sliceString(0, doc.length)` would
        // slice exactly one whole document and fail the bound.
        expect(sliced).toBeLessThan(doc.length);
        // One search per window, where rescanning the buffered overlap per line
        // needs one per line.
        expect(searches).toBeLessThan(64);
    } finally {
        text.sliceString = originalSliceString;
        // eslint-disable-next-line no-extend-native
        String.prototype.indexOf = originalIndexOf;
        view.destroy();
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
    const view = await createEditor();
    const keys = view.state.facet(keymap).flat().map((binding) => binding.key);
    // `Mod` is Ctrl on Windows/Linux; macOS keeps Ace's literal `Ctrl-Alt`.
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

test("macOS mode keeps Ace's Ctrl+Alt bindings", async () => {
    // `Cmd+Alt+ArrowLeft/Right` is the browsers' previous/next tab shortcut, so
    // macOS uses Ace's literal `Ctrl-Alt` instead of `Mod-Alt` (= `Cmd-Alt`).
    const view = await createEditor('mac');
    const keys = view.state.facet(keymap).flat().map((binding) => binding.key);
    expect(keys).toEqual(expect.arrayContaining([
        'Ctrl-Alt-ArrowUp',
        'Ctrl-Alt-ArrowDown',
        'Ctrl-Alt-Shift-ArrowUp',
        'Ctrl-Alt-Shift-ArrowDown',
        'Ctrl-Alt-ArrowLeft',
        'Ctrl-Alt-ArrowRight',
        'Ctrl-Alt-Shift-ArrowLeft',
        'Ctrl-Alt-Shift-ArrowRight',
        'Escape',
    ]));
    expect(keys).not.toContain('Mod-Alt-ArrowLeft');
    view.destroy();
});

test('the multi-cursor bindings take precedence over defaultKeymap', async () => {
    // `defaultKeymap` binds `Mod-Alt-ArrowUp`/`Mod-Alt-ArrowDown` and `Escape`
    // too. Keymaps run in facet order, so the first binding for a key is the
    // one that is consulted — it has to be the Ace command.
    const view = await createEditor();
    const bindings = view.state.facet(keymap).flat();
    const expected: [string, unknown][] = [
        ['Mod-Alt-ArrowUp', addCursorAbove],
        ['Mod-Alt-ArrowDown', addCursorBelow],
        ['Mod-Alt-Shift-ArrowUp', addCursorAboveSkipCurrent],
        ['Mod-Alt-Shift-ArrowDown', addCursorBelowSkipCurrent],
        ['Mod-Alt-ArrowLeft', selectMoreBefore],
        ['Mod-Alt-ArrowRight', selectMoreAfter],
        ['Mod-Alt-Shift-ArrowLeft', selectNextBefore],
        ['Mod-Alt-Shift-ArrowRight', selectNextAfter],
        ['Escape', singleSelection],
    ];
    for (const [key, command] of expected) {
        expect(bindings.find((binding) => binding.key === key)?.run, key).toBe(command);
    }
    view.destroy();
});

test('Ctrl+Alt+ArrowDown copies the selected range instead of adding a cursor', async () => {
    const view = await createEditor();
    // The whole first line is selected, so the copy lands on the second one.
    view.dispatch({ selection: EditorSelection.range(0, 8) });
    const event = pressKey(view, 'ArrowDown', { ctrl: true, alt: true });
    expect(event.defaultPrevented).toBe(true);
    // CodeMirror's built-in add-cursor command would add a bare cursor here.
    expect(ranges(view)).toEqual([{ from: 0, to: 8 }, { from: 9, to: 17 }]);
    expect(view.state.selection.mainIndex).toBe(1);
    view.destroy();
});

test('a declined multi-cursor binding still swallows the browser default', async () => {
    const view = await createEditor();
    // A cursor on the first line cannot move up, so the command returns false —
    // the chord must not reach the browser as a tab switch or a window-manager
    // shortcut.
    const event = pressKey(view, 'ArrowUp', { ctrl: true, alt: true });
    expect(event.defaultPrevented).toBe(true);
    expect(ranges(view)).toEqual([{ from: 0, to: 0 }]);
    view.destroy();
});

test('Ctrl+Alt+ArrowDown moves a multi-line selection instead of merging a copy', async () => {
    const view = await createEditor();
    // The range covers parts of two lines, so its shifted copy would overlap
    // the original and CodeMirror would merge the two into one longer
    // selection; the range is moved instead, keeping its length.
    view.dispatch({ selection: EditorSelection.range(0, 10) });
    const event = pressKey(view, 'ArrowDown', { ctrl: true, alt: true });
    expect(event.defaultPrevented).toBe(true);
    expect(ranges(view)).toEqual([{ from: 9, to: 19 }]);
    // And back up, which is only possible because nothing was merged.
    pressKey(view, 'ArrowUp', { ctrl: true, alt: true });
    expect(ranges(view)).toEqual([{ from: 0, to: 10 }]);
    view.destroy();
});

test('addCursorAbove declines a multi-line selection that cannot move', () => {
    const view = makeView(DOC, { anchor: 0, head: 10 });
    // The range starts on the first line, so moving it up would have to clamp
    // its start and silently shorten it; the command declines instead.
    expect(addCursorAbove(view)).toBe(false);
    expect(ranges(view)).toEqual([{ from: 0, to: 10 }]);
    view.destroy();
});

test('Escape with a single cursor leaves the browser default alone', async () => {
    const view = await createEditor();
    // There is nothing to collapse, so the command declines and the chord is
    // not marked as handled.
    const event = pressKey(view, 'Escape');
    expect(event.defaultPrevented).toBe(false);
    view.destroy();
});

test('withMultipleSelections: false leaves the multi-cursor commands unbound', async () => {
    const view = await createEditor('windows', { withMultipleSelections: false });
    const bindings = view.state.facet(keymap).flat();
    // Neither the Ace commands nor the `Esc` collapse are bound: with
    // `allowMultipleSelections` off every dispatch would be collapsed back to a
    // single range, so the chords are left to `defaultKeymap` and the browser.
    expect(bindings.some((binding) => binding.run === addCursorBelow)).toBe(false);
    expect(bindings.some((binding) => binding.run === singleSelection)).toBe(false);
    view.destroy();
});

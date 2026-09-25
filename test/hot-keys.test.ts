// @vitest-environment jsdom
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { expect, test } from 'vitest';

import { enabledRuleLines } from '../src/commands/breakpoints';
import { toggleAdblockComment } from '../src/commands/hot-keys';
import { initEditor } from '../src/init-editor';

/**
 * Creates an EditorView with the given document and optional selection range.
 *
 * @param doc The initial content of the editor.
 * @param selection Optional anchor/head selection; defaults to a cursor at 0.
 * @param selection.anchor Selection anchor offset.
 * @param selection.head Selection head offset.
 *
 * @returns An EditorView instance.
 */
function makeView(doc: string, selection?: { anchor: number; head: number }): EditorView {
    return new EditorView({
        state: EditorState.create({ doc, selection }),
        parent: document.body,
    });
}

/**
 * Creates an EditorView with multi-selection enabled and one range per entry.
 *
 * @param doc The initial content of the editor.
 * @param ranges The selection ranges to apply.
 *
 * @returns An EditorView instance.
 */
function makeMultiCursorView(doc: string, ranges: { anchor: number; head: number }[]): EditorView {
    return new EditorView({
        state: EditorState.create({
            doc,
            selection: EditorSelection.create(
                ranges.map(({ anchor, head }) => EditorSelection.range(anchor, head)),
                0,
            ),
            extensions: [EditorState.allowMultipleSelections.of(true)],
        }),
        parent: document.body,
    });
}

test('comments a single uncommented line', () => {
    const view = makeView('example.com');
    expect(toggleAdblockComment(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('! example.com');
    view.destroy();
});

test('uncomments a single `! ` commented line', () => {
    const view = makeView('! example.com');
    toggleAdblockComment(view);
    expect(view.state.doc.toString()).toBe('example.com');
    view.destroy();
});

test('uncomments a bare `!` prefix', () => {
    const view = makeView('!example.com');
    toggleAdblockComment(view);
    expect(view.state.doc.toString()).toBe('example.com');
    view.destroy();
});

test('uncomments a legacy `# ` comment line', () => {
    const view = makeView('# legacy comment');
    toggleAdblockComment(view);
    expect(view.state.doc.toString()).toBe('legacy comment');
    view.destroy();
});

test('comments every line when the selection spans multiple uncommented lines', () => {
    const doc = 'a.com\nb.com\nc.com';
    const view = makeView(doc, { anchor: 0, head: doc.length });
    toggleAdblockComment(view);
    expect(view.state.doc.toString()).toBe('! a.com\n! b.com\n! c.com');
    view.destroy();
});

test('uncomments every line when all selected lines are already comments', () => {
    const doc = '! a.com\n! b.com';
    const view = makeView(doc, { anchor: 0, head: doc.length });
    toggleAdblockComment(view);
    expect(view.state.doc.toString()).toBe('a.com\nb.com');
    view.destroy();
});

test('skips empty lines when commenting a selection', () => {
    const doc = 'a.com\n\nb.com';
    const view = makeView(doc, { anchor: 0, head: doc.length });
    toggleAdblockComment(view);
    expect(view.state.doc.toString()).toBe('! a.com\n\n! b.com');
    view.destroy();
});

test('treats a cosmetic rule (`##`) as a non-comment and comments it', () => {
    const view = makeView('##.banner');
    toggleAdblockComment(view);
    expect(view.state.doc.toString()).toBe('! ##.banner');
    view.destroy();
});

test('comments all lines when the selection mixes commented and uncommented lines', () => {
    const doc = '! a.com\nb.com';
    const view = makeView(doc, { anchor: 0, head: doc.length });
    toggleAdblockComment(view);
    expect(view.state.doc.toString()).toBe('! ! a.com\n! b.com');
    view.destroy();
});

test('comments the line under every cursor', () => {
    const doc = 'a.com\nb.com\nc.com';
    const view = makeMultiCursorView(doc, [
        { anchor: 0, head: 0 },
        { anchor: doc.indexOf('c.com'), head: doc.indexOf('c.com') },
    ]);
    expect(toggleAdblockComment(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('! a.com\nb.com\n! c.com');
    view.destroy();
});

test('comments a shared line once when two cursors are on it', () => {
    const doc = 'a.com\nb.com';
    const view = makeMultiCursorView(doc, [
        { anchor: 0, head: 0 },
        { anchor: 2, head: 2 },
    ]);
    expect(toggleAdblockComment(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('! a.com\nb.com');
    view.destroy();
});

test('uncomments the line under every cursor when all of them are comments', () => {
    const doc = '! a.com\nb.com\n! c.com';
    const view = makeMultiCursorView(doc, [
        { anchor: 0, head: 0 },
        { anchor: doc.indexOf('! c.com'), head: doc.indexOf('! c.com') },
    ]);
    expect(toggleAdblockComment(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('a.com\nb.com\nc.com');
    view.destroy();
});

test('comments every line covered by a multi-line selection range', () => {
    const doc = 'a.com\nb.com\nc.com\nd.com';
    const view = makeMultiCursorView(doc, [
        // A range spanning the first three lines plus a cursor on the fourth.
        { anchor: 0, head: doc.indexOf('c.com') + 'c.com'.length },
        { anchor: doc.indexOf('d.com'), head: doc.indexOf('d.com') },
    ]);
    expect(toggleAdblockComment(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('! a.com\n! b.com\n! c.com\n! d.com');
    view.destroy();
});

test('Ctrl+/ comments the line under every cursor and toggles its rule marker', async () => {
    const textarea = document.createElement('textarea');
    textarea.value = '||a.com^\n||b.com^\n||c.com^';
    document.body.appendChild(textarea);
    const toggledRules: string[] = [];
    const view = await initEditor(textarea, undefined, {
        hotkeys: {
            mode: 'windows',
            toggleRule: (editorView) => { toggledRules.push(editorView.state.doc.lineAt(0).text); },
        },
        withBreakpoints: true,
        highlight: 'none',
    });
    view.dispatch({
        selection: EditorSelection.create(
            [EditorSelection.cursor(0), EditorSelection.cursor(18)],
            0,
        ),
    });

    const event = new KeyboardEvent('keydown', {
        key: '/',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
    });
    view.contentDOM.dispatchEvent(event);

    expect(view.state.doc.toString()).toBe('! ||a.com^\n||b.com^\n! ||c.com^');
    // Both rules are marked as toggled, and the handler is called once.
    expect(enabledRuleLines(view.state)).toEqual([1, 3]);
    expect(toggledRules).toHaveLength(1);
    view.destroy();
});

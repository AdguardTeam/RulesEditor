// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { expect, test } from 'vitest';

import { toggleAdblockComment } from '../src/commands/hot-keys';

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

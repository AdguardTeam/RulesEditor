// @vitest-environment jsdom
import { isolateHistory, undo } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { expect, test, vi } from 'vitest';

import { enabledRuleLines, toggleBreakpoint } from '../src/commands/breakpoints';
import { toggleAdblockComment } from '../src/commands/hot-keys';
import { initEditor } from '../src/init-editor';

import { mountEditor, pressKey } from './helpers';

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

/**
 * Mounts an editor with the enabled-rule gutter and a toggle-rule counter,
 * replaces the document with the given text, and selects the whole document.
 *
 * @param doc The document text.
 *
 * @returns The mounted view and a function returning the callback call count.
 */
async function mountEditorWithSelection(doc: string): Promise<{
    view: EditorView;
    toggleCount: () => number;
}> {
    let toggles = 0;
    const view = await mountEditor(initEditor, {
        withBreakpoints: true,
        hotkeys: {
            toggleRule: () => { toggles += 1; },
        },
    });
    view.dispatch({
        changes: { from: 0, insert: doc },
        selection: { anchor: 0, head: doc.length },
        // Keep the setup insertion out of the undo step of the first toggle,
        // so an undo test reverts only the toggle.
        annotations: isolateHistory.of('after'),
    });
    return { view, toggleCount: () => toggles };
}

test('keeps an enabled rule enabled after a comment and uncomment cycle', async () => {
    let toggles = 0;
    const view = await mountEditor(initEditor, {
        withBreakpoints: true,
        hotkeys: {
            toggleRule: () => { toggles += 1; },
        },
    });
    view.dispatch({ changes: { from: 0, insert: '||a.com^' } });
    view.dispatch({ effects: toggleBreakpoint.of(0) });
    expect(enabledRuleLines(view.state)).toEqual([1]);

    pressKey(view.contentDOM, '/', { ctrl: true });
    expect(view.state.doc.toString()).toBe('! ||a.com^');
    expect(enabledRuleLines(view.state)).toEqual([]);

    pressKey(view.contentDOM, '/', { ctrl: true });
    expect(view.state.doc.toString()).toBe('||a.com^');
    expect(enabledRuleLines(view.state)).toEqual([1]);
    expect(toggles).toBe(2);
    view.destroy();
});

test('toggles the marker only for the rule line of a mixed selection', async () => {
    const { view, toggleCount } = await mountEditorWithSelection('! note\n||a.com^');
    pressKey(view.contentDOM, '/', { ctrl: true });
    expect(view.state.doc.toString()).toBe('! ! note\n! ||a.com^');
    // The comment line does not flip to a rule, so it gets no marker. A marker
    // on `! ! note` would not survive `setEditorValue`, which skips comments.
    expect(enabledRuleLines(view.state)).toEqual([2]);
    expect(toggleCount()).toBe(1);
    view.destroy();
});

test('does not leave a marker on a comment that becomes empty', async () => {
    const { view, toggleCount } = await mountEditorWithSelection('!');
    pressKey(view.contentDOM, '/', { ctrl: true });
    expect(view.state.doc.toString()).toBe('');
    expect(enabledRuleLines(view.state)).toEqual([]);
    expect(toggleCount()).toBe(0);
    view.destroy();
});

test('marks a whitespace-only line, which is not empty', async () => {
    const { view, toggleCount } = await mountEditorWithSelection('   ');
    pressKey(view.contentDOM, '/', { ctrl: true });
    expect(view.state.doc.toString()).toBe('!    ');
    expect(enabledRuleLines(view.state)).toEqual([1]);
    expect(toggleCount()).toBe(1);

    pressKey(view.contentDOM, '/', { ctrl: true });
    expect(view.state.doc.toString()).toBe('   ');
    expect(enabledRuleLines(view.state)).toEqual([]);
    expect(toggleCount()).toBe(2);
    view.destroy();
});

test('marks a comment line that the toggle turns into a rule', async () => {
    const { view, toggleCount } = await mountEditorWithSelection('! Title: My filter');
    pressKey(view.contentDOM, '/', { ctrl: true });
    expect(view.state.doc.toString()).toBe('Title: My filter');
    // The command toggles the marker for every line whose rule state flips, so
    // the uncommented header is an enabled rule like any other uncommented
    // line. A header that is not enabled before the cycle is therefore enabled
    // after it.
    expect(enabledRuleLines(view.state)).toEqual([1]);
    expect(toggleCount()).toBe(1);
    view.destroy();
});

test('does not mark a comment that stays a comment after uncommenting', async () => {
    const { view, toggleCount } = await mountEditorWithSelection('! ||a.com^\n! ! note');
    pressKey(view.contentDOM, '/', { ctrl: true });
    expect(view.state.doc.toString()).toBe('||a.com^\n! note');
    // The stripped `! ! note` is still a comment, so only the rule line flips.
    expect(enabledRuleLines(view.state)).toEqual([1]);
    expect(toggleCount()).toBe(1);
    view.destroy();
});

test('undoes the uncomment press together with the marker', async () => {
    const { view, toggleCount } = await mountEditorWithSelection('! ||a.com^');
    pressKey(view.contentDOM, '/', { ctrl: true });
    expect(view.state.doc.toString()).toBe('||a.com^');
    expect(enabledRuleLines(view.state)).toEqual([1]);
    expect(toggleCount()).toBe(1);

    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('! ||a.com^');
    expect(enabledRuleLines(view.state)).toEqual([]);
    view.destroy();
});

test('undoes the comment press together with the marker', async () => {
    const { view } = await mountEditorWithSelection('||a.com^');
    pressKey(view.contentDOM, '/', { ctrl: true });
    expect(view.state.doc.toString()).toBe('! ||a.com^');
    expect(enabledRuleLines(view.state)).toEqual([1]);

    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('||a.com^');
    expect(enabledRuleLines(view.state)).toEqual([]);
    view.destroy();
});

test('keeps two quick comment presses as separate undo steps', async () => {
    const { view } = await mountEditorWithSelection('||a.com^\n||b.com^');
    pressKey(view.contentDOM, '/', { ctrl: true });
    expect(view.state.doc.toString()).toBe('! ||a.com^\n! ||b.com^');
    expect(enabledRuleLines(view.state)).toEqual([1, 2]);

    pressKey(view.contentDOM, '/', { ctrl: true });
    expect(view.state.doc.toString()).toBe('||a.com^\n||b.com^');
    expect(enabledRuleLines(view.state)).toEqual([]);

    // The second press must undo alone. A joined event composes the text
    // change to nothing and resolves the effect positions in the wrong
    // coordinate space, which leaves both markers on.
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('! ||a.com^\n! ||b.com^');
    expect(enabledRuleLines(view.state)).toEqual([1, 2]);

    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('||a.com^\n||b.com^');
    expect(enabledRuleLines(view.state)).toEqual([]);
    view.destroy();
});

test('does not join a nearby edit with the comment toggle in the undo history', async () => {
    const { view } = await mountEditorWithSelection('||a.com^');
    pressKey(view.contentDOM, '/', { ctrl: true });
    expect(view.state.doc.toString()).toBe('! ||a.com^');
    expect(enabledRuleLines(view.state)).toEqual([1]);

    // Type directly after the inserted prefix, next to the toggle change.
    view.dispatch({ changes: { from: 2, insert: 'x' } });
    expect(view.state.doc.toString()).toBe('! x||a.com^');

    // The typing undoes alone and keeps the marker of the commented rule.
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('! ||a.com^');
    expect(enabledRuleLines(view.state)).toEqual([1]);

    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('||a.com^');
    expect(enabledRuleLines(view.state)).toEqual([]);
    view.destroy();
});

test('Ctrl+/ is a consumed no-op in a read-only editor', async () => {
    const toggleRule = vi.fn();
    const view = await mountEditor(initEditor, {
        withBreakpoints: true,
        hotkeys: { toggleRule },
        extensions: [EditorState.readOnly.of(true)],
    });
    view.dispatch({ changes: { from: 0, insert: '||a.com^' } });
    view.dispatch({ effects: toggleBreakpoint.of(0) });

    const event = pressKey(view.contentDOM, '/', { ctrl: true });

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe('||a.com^');
    expect(enabledRuleLines(view.state)).toEqual([1]);
    expect(toggleRule).not.toHaveBeenCalled();
    view.destroy();
});

test('toggleAdblockComment is a consumed no-op in a read-only editor', () => {
    const view = new EditorView({
        state: EditorState.create({
            doc: 'a.com',
            extensions: [EditorState.readOnly.of(true)],
        }),
        parent: document.body,
    });

    expect(toggleAdblockComment(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('a.com');
    view.destroy();
});

test('does not comment the next line when the selection ends at its start', () => {
    const doc = 'aaa\nbbb\nccc';
    // A Home + Shift+Down selection: from the start of `bbb` to the start of
    // `ccc` — `ccc` is only touched at its first character position.
    const view = makeView(doc, { anchor: doc.indexOf('bbb'), head: doc.indexOf('ccc') });
    expect(toggleAdblockComment(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('aaa\n! bbb\nccc');
    view.destroy();
});

test('comments the line under a cursor placed at a line start', () => {
    const doc = 'aaa\nbbb\nccc';
    const start = doc.indexOf('bbb');
    const view = makeView(doc, { anchor: start, head: start });
    expect(toggleAdblockComment(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('aaa\n! bbb\nccc');
    view.destroy();
});

test('comments every line when a selection starts mid-line and ends at the next line start', () => {
    const doc = 'aaa\nbbb\nccc';
    const view = makeView(doc, { anchor: 1, head: doc.indexOf('ccc') });
    expect(toggleAdblockComment(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('! aaa\n! bbb\nccc');
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
    // Both rules are marked as toggled, and the handler is called once with
    // the final text: the callback runs after the comment is applied.
    expect(enabledRuleLines(view.state)).toEqual([1, 3]);
    expect(toggledRules).toEqual(['! ||a.com^']);
    view.destroy();
});

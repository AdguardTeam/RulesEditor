// @vitest-environment jsdom
import { EditorState, RangeSet } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { expect, test, vi } from 'vitest';

import {
    breakpointState,
    enabledRuleLines,
    isBreakpointAt,
    setBreakpoints,
    setMarkerFactory,
    toggleBreakpoint,
} from '../src/commands/breakpoints';

/**
 * Builds a marker factory that renders the given text.
 *
 * @param text The marker text.
 *
 * @returns A factory producing marker elements.
 */
const marker = (text: string) => (): HTMLElement => {
    const el = document.createElement('div');
    el.textContent = text;
    return el;
};

/**
 * Creates an EditorView instance with the given document.
 *
 * @param doc The initial content of the editor.
 * @param options Gutter configuration.
 * @param options.markerFactory Factory producing a marker element.
 *
 * @returns An EditorView instance.
 */
function makeView(doc: string, options: { markerFactory?: () => HTMLElement } = {}): EditorView {
    return new EditorView({
        state: EditorState.create({ doc, extensions: [breakpointState(options)] }),
        parent: document.body,
    });
}

test('toggles a breakpoint on a line', () => {
    const view = makeView('||a.com^\n||b.com^');
    const line = view.state.doc.line(1);
    expect(isBreakpointAt(view.state, line.from)).toBe(false);
    view.dispatch({ effects: toggleBreakpoint.of(line.from) });
    expect(isBreakpointAt(view.state, line.from)).toBe(true);
    view.destroy();
});

test('renders markers with the factory of each editor', () => {
    const first = makeView('||a.com^', { markerFactory: marker('first') });
    const second = makeView('||a.com^', { markerFactory: marker('second') });
    first.dispatch({ effects: toggleBreakpoint.of(0) });
    second.dispatch({ effects: toggleBreakpoint.of(0) });

    const firstGutter = first.dom.querySelector('.cm-breakpoint-gutter')?.textContent ?? '';
    const secondGutter = second.dom.querySelector('.cm-breakpoint-gutter')?.textContent ?? '';
    expect(firstGutter).toContain('first');
    expect(firstGutter).not.toContain('second');
    expect(secondGutter).toContain('second');
    expect(secondGutter).not.toContain('first');
    first.destroy();
    second.destroy();
});

test('applies a new factory to the markers that a setBreakpoints effect replaces', () => {
    const view = makeView('||a.com^', { markerFactory: marker('before') });
    view.dispatch({ effects: toggleBreakpoint.of(0) });
    // Production changes the factory only together with `setBreakpoints`
    // (`setEditorValue`), which rebuilds every marker with the new factory.
    view.dispatch({
        effects: [setMarkerFactory.of(marker('after')), setBreakpoints.of([0])],
    });

    const gutter = view.dom.querySelector('.cm-breakpoint-gutter')?.textContent ?? '';
    expect(gutter).toContain('after');
    expect(gutter).not.toContain('before');
    expect(enabledRuleLines(view.state)).toEqual([1]);
    view.destroy();
});

test('enabledRuleLines reports marked lines', () => {
    const view = makeView('||a.com^\n||b.com^');
    const second = view.state.doc.line(2);
    view.dispatch({ effects: toggleBreakpoint.of(second.from) });
    expect(enabledRuleLines(view.state)).toEqual([2]);
    view.destroy();
});

test('a transaction without document changes keeps the marker set', () => {
    const view = makeView('||a.com^\n||b.com^');
    view.dispatch({ effects: toggleBreakpoint.of(0) });

    // A transaction without document changes must not rebuild the set:
    // rebuilding walks every marker, and a rule list holds thousands of them.
    // `RangeSet.map` returned the set unchanged for an empty change set, so
    // the field keeps that path for a selection and for a marker toggle.
    const build = vi.spyOn(RangeSet, 'of');
    const selected = view.state.update({ selection: { anchor: 1 } }).state;
    expect(build).not.toHaveBeenCalled();
    const secondLine = selected.doc.line(2).from;
    const added = selected.update({ effects: toggleBreakpoint.of(secondLine) }).state;
    expect(build).not.toHaveBeenCalled();
    const removed = added.update({ effects: toggleBreakpoint.of(0) }).state;
    expect(build).not.toHaveBeenCalled();
    build.mockRestore();

    expect(enabledRuleLines(removed)).toEqual([2]);
    view.destroy();
});

test('Replace All keeps, adds and removes markers in one transaction', () => {
    const view = makeView('||a.com^\n||b.com^\n||c.com^\n||d.com^');
    view.dispatch({
        effects: [1, 2, 4].map((number) => toggleBreakpoint.of(view.state.doc.line(number).from)),
    });
    expect(enabledRuleLines(view.state)).toEqual([1, 2, 4]);

    // Replace `com` on every line with longer text, remove the marker of line
    // 2, and add a marker to line 3 in the same transaction. The kept markers
    // must follow their lines through the length changes.
    const changes = [1, 2, 3, 4].map((number) => {
        const line = view.state.doc.line(number);
        const from = line.from + line.text.indexOf('com');
        return { from, to: from + 'com'.length, insert: 'example.org' };
    });
    view.dispatch({
        changes,
        effects: [
            toggleBreakpoint.of(view.state.doc.line(2).from),
            toggleBreakpoint.of(view.state.doc.line(3).from),
        ],
        userEvent: 'input.replace.all',
    });

    expect(enabledRuleLines(view.state)).toEqual([1, 3, 4]);
    view.destroy();
});

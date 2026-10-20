// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { expect, test } from 'vitest';

import {
    breakpointState,
    enabledRuleLines,
    isBreakpointAt,
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

test('rebuilds existing markers when the factory changes', () => {
    const view = makeView('||a.com^', { markerFactory: marker('before') });
    view.dispatch({ effects: toggleBreakpoint.of(0) });
    view.dispatch({ effects: setMarkerFactory.of(marker('after')) });

    const gutter = view.dom.querySelector('.cm-breakpoint-gutter')?.textContent ?? '';
    expect(gutter).toContain('after');
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

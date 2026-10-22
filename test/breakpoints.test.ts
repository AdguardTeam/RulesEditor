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

import { visibleGutterText } from './helpers';

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

    // The hidden spacer renders the factory too, so only the visible gutter
    // elements prove that each editor drew its own line marker.
    expect(visibleGutterText(first)).toBe('first');
    expect(visibleGutterText(second)).toBe('second');
    first.destroy();
    second.destroy();
});

test('rebuilds existing markers when the factory changes', () => {
    const view = makeView('||a.com^', { markerFactory: marker('before') });
    view.dispatch({ effects: toggleBreakpoint.of(0) });
    expect(visibleGutterText(view)).toBe('before');

    view.dispatch({ effects: setMarkerFactory.of(marker('after')) });

    // The hidden spacer follows the new factory, so only the visible marker
    // proves the rebuild: without `rebuildMarkers` it still renders 'before'.
    expect(visibleGutterText(view)).toBe('after');
    expect(enabledRuleLines(view.state)).toEqual([1]);
    view.destroy();
});

test('reuses the spacer element while the factory does not change', () => {
    let renders = 0;
    const factory = (): HTMLElement => {
        renders += 1;
        return marker('spacer')();
    };
    const view = makeView('||a.com^', { markerFactory: factory });
    const gutter = view.dom.querySelector('.cm-breakpoint-gutter');
    const spacer = gutter?.querySelector('.cm-gutterElement');
    const spacerMarker = spacer?.firstElementChild;
    expect(spacer).not.toBeNull();
    expect(renders).toBe(1);

    // An unrelated update must keep the spacer DOM: a new spacer marker on
    // every update would re-parse the default SVG each time.
    view.dispatch({ selection: { anchor: 1 } });
    expect(gutter?.querySelector('.cm-gutterElement')).toBe(spacer);
    expect(spacer?.firstElementChild).toBe(spacerMarker);
    expect(renders).toBe(1);

    // A new factory must replace the spacer marker, so its width follows the
    // new icon.
    const nextFactory = (): HTMLElement => {
        renders += 1;
        return marker('next')();
    };
    view.dispatch({ effects: setMarkerFactory.of(nextFactory) });
    expect(spacer?.firstElementChild).not.toBe(spacerMarker);
    expect(renders).toBe(2);
    view.destroy();
});

test('enabledRuleLines reports marked lines', () => {
    const view = makeView('||a.com^\n||b.com^');
    const second = view.state.doc.line(2);
    view.dispatch({ effects: toggleBreakpoint.of(second.from) });
    expect(enabledRuleLines(view.state)).toEqual([2]);
    view.destroy();
});

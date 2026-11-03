// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { expect, test } from 'vitest';

import {
    breakpointState,
    enabledRuleLines,
    isBreakpointAt,
    type MarkerConfig,
    markerFactoryOf,
    markerOptionsOf,
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
 * @param config Marker factory and the options it applies.
 *
 * @returns An EditorView instance.
 */
function makeView(doc: string, config?: MarkerConfig): EditorView {
    return new EditorView({
        state: EditorState.create({
            doc,
            extensions: [breakpointState(config ? { marker: config } : {})],
        }),
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
    const first = makeView('||a.com^', { factory: marker('first'), options: {} });
    const second = makeView('||a.com^', { factory: marker('second'), options: {} });
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
    const view = makeView('||a.com^', { factory: marker('before'), options: {} });
    view.dispatch({ effects: toggleBreakpoint.of(0) });
    expect(visibleGutterText(view)).toBe('before');

    view.dispatch({
        effects: setMarkerFactory.of({ factory: marker('after'), options: {} }),
    });

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
    const view = makeView('||a.com^', { factory, options: {} });
    const gutter = view.dom.querySelector('.cm-breakpoint-gutter');
    const spacer = gutter?.querySelector('.cm-gutterElement');
    const spacerMarker = spacer?.firstElementChild;
    expect(spacer).not.toBeNull();
    expect(spacer?.textContent).toBe('spacer');
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
    view.dispatch({
        effects: setMarkerFactory.of({ factory: nextFactory, options: {} }),
    });
    expect(spacer?.firstElementChild).not.toBe(spacerMarker);
    // The new marker must come from the new factory: a reused old factory
    // would keep the 'spacer' text.
    expect(spacer?.textContent).toBe('next');
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

test('markerFactoryOf returns undefined without the breakpoint field', () => {
    const state = EditorState.create({ doc: '' });
    expect(markerFactoryOf(state)).toBeUndefined();
});

test('markerOptionsOf follows the options installed with the factory', () => {
    const view = makeView('', {
        factory: marker('initial'),
        options: { color: 'red' },
    });
    expect(markerOptionsOf(view.state)).toEqual({ color: 'red' });

    const nextOptions = { color: 'blue', innerHTML: '<b></b>' };
    const nextFactory = marker('next');
    view.dispatch({
        effects: setMarkerFactory.of({ factory: nextFactory, options: nextOptions }),
    });
    expect(markerOptionsOf(view.state)).toEqual(nextOptions);
    expect(markerFactoryOf(view.state)).toBe(nextFactory);
    view.destroy();
});

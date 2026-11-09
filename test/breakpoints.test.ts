// @vitest-environment jsdom
import {
    ChangeDesc,
    ChangeSet,
    EditorState,
    RangeSet,
    type RangeValue,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { expect, test, vi } from 'vitest';

import {
    breakpointState,
    enabledRuleLines,
    isBreakpointAt,
    type MarkerConfig,
    markerFactoryOf,
    markerOptionsOf,
    setBreakpoints,
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

/**
 * Reports whether a range set holds enabled-rule markers.
 *
 * The markers carry the `factory` of their editor, so this tells the marker
 * set apart from the empty set and the other range sets that the view maps
 * during a dispatch.
 *
 * @param set The range set to inspect.
 *
 * @returns `true` if the set holds an enabled-rule marker.
 */
function holdsBreakpointMarkers(set: RangeSet<RangeValue>): boolean {
    for (let cursor = set.iter(); cursor.value; cursor.next()) {
        if ('factory' in cursor.value) {
            return true;
        }
    }
    return false;
}

/**
 * Runs a transaction and counts the `RangeSet.map` calls that remapped the
 * enabled-rule marker set.
 *
 * A `view.dispatch` update also maps an empty set, so a call counts only when
 * it maps a non-empty change set on a set that holds enabled-rule markers. The
 * spy is restored in `finally`, so a failing assertion leaves no spy behind for
 * the next test.
 *
 * @param run The callback that creates the transaction.
 *
 * @returns The number of `RangeSet.map` calls on the marker set.
 */
function markerSetMapCalls(run: () => void): number {
    const map = vi.spyOn(RangeSet.prototype, 'map');
    try {
        run();
        return map.mock.calls.filter(
            ([changeSet], index) => !changeSet.empty
                && holdsBreakpointMarkers(map.mock.contexts[index] as RangeSet<RangeValue>),
        ).length;
    } finally {
        map.mockRestore();
    }
}

/**
 * Creates an editor state with an enabled marker on every line of a generated
 * rule list.
 *
 * @param lineCount The number of rules and markers.
 *
 * @returns The state and the start offset of every line.
 */
function stateWithMarkedLines(lineCount: number): {
    state: EditorState;
    lineStarts: number[];
} {
    const rules = Array.from({ length: lineCount }, (_, index) => `||rule-${index}.com^`);
    const lineStarts: number[] = [];
    let lineStart = 0;
    rules.forEach((rule) => {
        lineStarts.push(lineStart);
        lineStart += rule.length + 1;
    });
    const { state } = EditorState.create({
        doc: rules.join('\n'),
        extensions: [breakpointState()],
    }).update({ effects: setBreakpoints.of(lineStarts) });
    return { state, lineStarts };
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

test('applies a new factory to the markers that a setBreakpoints effect replaces', () => {
    const view = makeView('||a.com^', { factory: marker('before'), options: {} });
    view.dispatch({ effects: toggleBreakpoint.of(0) });
    expect(visibleGutterText(view)).toBe('before');

    // Production changes the factory only together with `setBreakpoints`
    // (`setEditorValue`), which rebuilds every marker with the new factory.
    view.dispatch({
        effects: [
            setMarkerFactory.of({ factory: marker('after'), options: {} }),
            setBreakpoints.of([0]),
        ],
    });

    // The hidden spacer follows the new factory, so only the visible marker
    // proves the rebuild: without the `setBreakpoints` rebuild, the marker
    // still renders 'before'.
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

test('a selection-only transaction keeps the marker set', () => {
    const view = makeView('||a.com^\n||b.com^');
    view.dispatch({ effects: toggleBreakpoint.of(0) });

    // A selection-only transaction must not rebuild the set: rebuilding walks
    // every marker, and a rule list holds thousands of them. `RangeSet.map`
    // still runs on the empty change set and returns the same set.
    const build = vi.spyOn(RangeSet, 'of');
    const rebuild = vi.spyOn(RangeSet.prototype, 'update');
    const selected = view.state.update({ selection: { anchor: 1 } }).state;
    expect(build).not.toHaveBeenCalled();
    expect(rebuild).not.toHaveBeenCalled();
    build.mockRestore();
    rebuild.mockRestore();

    expect(enabledRuleLines(selected)).toEqual([1]);
    view.destroy();
});

test('Replace All keeps, adds and removes markers in one transaction', () => {
    const rules = Array.from({ length: 100 }, (_, index) => `||rule-${index}.com^`);
    const view = makeView(rules.join('\n'));
    view.dispatch({
        effects: [1, 2, 4].map((number) => toggleBreakpoint.of(view.state.doc.line(number).from)),
    });
    expect(enabledRuleLines(view.state)).toEqual([1, 2, 4]);

    // Insert a line break at the start of line 1 to push its rule down, replace
    // `com` on every line with longer text, remove the marker of line 2, and
    // add a marker to line 3 in the same transaction. The kept markers must
    // follow their lines through the length changes, the carried marker must
    // move with the pushed-down rule, and the removed and added markers must
    // follow their effects. The changed ranges take the linear pass, not
    // `RangeSet.map`.
    const changes = [
        { from: 0, insert: '\n' },
        ...rules.map((rule, index) => {
            const line = view.state.doc.line(index + 1);
            const from = line.from + rule.indexOf('com');
            return { from, to: from + 'com'.length, insert: 'example.org' };
        }),
    ];
    // The DOM update maps an empty set during `view.dispatch`, so the helper
    // ignores the calls on empty sets: a call on the marker set means the
    // chunked path ran and the test no longer covers the linear pass.
    const mapCalls = markerSetMapCalls(() => {
        view.dispatch({
            changes,
            effects: [
                toggleBreakpoint.of(view.state.doc.line(2).from),
                toggleBreakpoint.of(view.state.doc.line(3).from),
            ],
            userEvent: 'input.replace.all',
        });
    });
    expect(mapCalls).toBe(0);

    expect(enabledRuleLines(view.state)).toEqual([2, 4, 5]);
    view.destroy();
});

test('a small edit maps the marker set with the chunked path', () => {
    const view = makeView('||a.com^\n||b.com^');
    view.dispatch({ effects: toggleBreakpoint.of(0) });

    // One changed range stays below the linear cutoff, so `RangeSet.map`
    // remaps the marker set and reuses the chunks that the edit does not
    // touch. A call on the marker set proves that the chunked path ran.
    const mapCalls = markerSetMapCalls(() => {
        view.dispatch({
            changes: { from: 1, to: 2, insert: 'x' },
            userEvent: 'input.type',
        });
    });
    expect(mapCalls).toBe(1);

    expect(enabledRuleLines(view.state)).toEqual([1]);
    view.destroy();
});

test('a block edit with many adjacent ranges keeps the chunked path', () => {
    const { state, lineStarts } = stateWithMarkedLines(500);

    // A hundred adjacent cursors span a small share of the document, so the
    // weighted cutoff keeps them on the chunked path even though the count is
    // above the threshold. A call on the marker set proves that path ran.
    const changes = lineStarts.slice(0, 100).map((from) => ({ from: from + 2, insert: 'x' }));
    let next = state;
    const mapCalls = markerSetMapCalls(() => {
        next = state.update({ changes, userEvent: 'input.type' }).state;
    });
    expect(mapCalls).toBe(1);

    expect(enabledRuleLines(next)).toHaveLength(lineStarts.length);
});

test('a distant cursor does not send a block edit to the linear pass', () => {
    const { state, lineStarts } = stateWithMarkedLines(3000);

    // A block of 64 adjacent cursors plus one at the last line. The first
    // change start and the last change end span the whole document, but the
    // gap between the block and the distant cursor holds chunks that
    // `RangeSet.map` does not touch, so the block edit must stay on the chunked
    // path.
    const changes = [
        ...lineStarts.slice(0, 64).map((from) => ({ from: from + 2, insert: 'x' })),
        { from: lineStarts[lineStarts.length - 1] + 2, insert: 'x' },
    ];
    let next = state;
    const mapCalls = markerSetMapCalls(() => {
        next = state.update({ changes, userEvent: 'input.type' }).state;
    });
    expect(mapCalls).toBe(1);

    expect(enabledRuleLines(next)).toHaveLength(lineStarts.length);
});

test('two separated block edits stay on the chunked path', () => {
    const { state, lineStarts } = stateWithMarkedLines(3000);

    // Two blocks of 50 cursors, one at the top and one at the bottom. The gap
    // between the blocks counts at most one chunk span, so the untouched
    // chunks in between do not send the edit to the linear pass.
    const changes = [
        ...lineStarts.slice(0, 50).map((from) => ({ from: from + 2, insert: 'x' })),
        ...lineStarts.slice(lineStarts.length - 50).map((from) => ({
            from: from + 2,
            insert: 'x',
        })),
    ];
    let next = state;
    const mapCalls = markerSetMapCalls(() => {
        next = state.update({ changes, userEvent: 'input.type' }).state;
    });
    expect(mapCalls).toBe(1);

    expect(enabledRuleLines(next)).toHaveLength(lineStarts.length);
});

test('a spread edit above the cutoff takes the linear pass', () => {
    const { state, lineStarts } = stateWithMarkedLines(3000);

    // Forty cursors every 75 lines weigh about 39: above the cutoff of 24 and
    // below 64. A call on the marker set means the chunked path ran, so the
    // test pins the cutoff: it passes at 24 and fails at 64, which would send
    // this edit back to the chunked path.
    const changes = lineStarts
        .filter((_from, index) => index % 75 === 0)
        .map((from) => ({ from: from + 2, insert: 'x' }));
    let next = state;
    const mapCalls = markerSetMapCalls(() => {
        next = state.update({ changes, userEvent: 'input.type' }).state;
    });
    expect(changes).toHaveLength(40);
    expect(mapCalls).toBe(0);
    expect(enabledRuleLines(next)).toHaveLength(lineStarts.length);
});

test('a document change without markers does not scan the changed ranges', () => {
    const rules = Array.from({ length: 10 }, (_, index) => `||rule-${index}.com^`);
    const view = makeView(rules.join('\n'));

    // The field must skip the changed-range scan when the marker set is empty.
    // The field's scan reads a `ChangeDesc`; the view reads the `ChangeSet`
    // directly, so only a `ChangeDesc` call would come from the field.
    const iter = vi.spyOn(ChangeDesc.prototype, 'iterChangedRanges');
    view.dispatch({
        changes: rules.map((rule, index) => {
            const line = view.state.doc.line(index + 1);
            const from = line.from + rule.indexOf('com');
            return { from, to: from + 'com'.length, insert: 'example.org' };
        }),
        userEvent: 'input.replace.all',
    });
    const descCalls = iter.mock.calls.filter(
        (_call, index) => !(iter.mock.contexts[index] instanceof ChangeSet),
    );
    expect(descCalls).toHaveLength(0);
    iter.mockRestore();
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

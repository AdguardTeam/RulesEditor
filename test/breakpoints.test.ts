// @vitest-environment jsdom
import {
    ChangeDesc,
    ChangeSet,
    Compartment,
    EditorState,
    Prec,
    RangeSet,
    type RangeValue,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { expect, test, vi } from 'vitest';

import {
    breakpointState,
    createMarker,
    enabledRuleLines,
    initialMarkerOptionsOf,
    isBreakpointAt,
    type MarkerConfig,
    markerFactoryOf,
    markerOptionsOf,
    setBreakpoints,
    setMarkerFactory,
    toggleBreakpoint,
} from '../src/commands/breakpoints';

import {
    MARKER_COLOR,
    MARKER_ICON_PATH,
    visibleGutterText,
    visibleMarker,
} from './helpers';

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
 * Creates an editor whose gutter and a spare extension sit in separate
 * compartments, so a test can reconfigure one without the other.
 *
 * @param config Marker factory and the options it applies.
 *
 * @returns The view, the gutter compartment, and the spare compartment.
 */
function makeCompartmentView(config?: MarkerConfig): {
    view: EditorView;
    gutter: Compartment;
    spare: Compartment;
} {
    const gutter = new Compartment();
    const spare = new Compartment();
    const view = new EditorView({
        state: EditorState.create({
            doc: '||a.com^',
            extensions: [
                gutter.of(breakpointState(config ? { marker: config } : {})),
                spare.of([]),
            ],
        }),
        parent: document.body,
    });
    return { view, gutter, spare };
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

test('renders the default marker when no marker config is given', () => {
    const view = makeView('||a.com^');
    view.dispatch({ effects: toggleBreakpoint.of(0) });

    // A config-less editor still gets a working marker: the product color and
    // the default check mark icon.
    const markerElement = visibleMarker(view);
    if (markerElement === null) {
        throw new Error('The gutter has no visible marker.');
    }
    expect(markerElement.style.color).toBe(MARKER_COLOR);
    // A literal path, not the source constant: a change to the default icon
    // must fail here.
    expect(markerElement.querySelector('path')?.getAttribute('d')).toBe(MARKER_ICON_PATH);
    expect(markerElement.querySelector('path')?.getAttribute('fill')).toBe('currentColor');
    expect(markerOptionsOf(view.state)).toEqual({});
    expect(initialMarkerOptionsOf(view.state)).toEqual({});
    view.destroy();
});

test('createMarker applies the default color, icon, and margins', () => {
    // An empty string means "use the default" for both fields.
    const markerElement = createMarker({ color: '', innerHTML: '' })();
    expect(markerElement.style.color).toBe(MARKER_COLOR);
    expect(markerElement.style.marginLeft).toBe('-12px');
    expect(markerElement.style.marginTop).toBe('4px');
    expect(markerElement.querySelector('path')?.getAttribute('d')).toBe(MARKER_ICON_PATH);
    expect(markerElement.querySelector('path')?.getAttribute('fill')).toBe('currentColor');
});

test('reconfiguring another compartment keeps the markers', () => {
    const factory = marker('before');
    const { view, spare } = makeCompartmentView({ factory, options: { color: 'red' } });
    view.dispatch({ effects: toggleBreakpoint.of(0) });
    expect(enabledRuleLines(view.state)).toEqual([1]);

    // The gutter extension stays in the state, so CodeMirror keeps the field
    // value: the marker set, the factory, and its options survive.
    view.dispatch({ effects: spare.reconfigure(EditorView.lineWrapping) });

    expect(enabledRuleLines(view.state)).toEqual([1]);
    expect(markerFactoryOf(view.state)).toBe(factory);
    expect(markerOptionsOf(view.state)).toEqual({ color: 'red' });
    expect(initialMarkerOptionsOf(view.state)).toEqual({ color: 'red' });
    expect(visibleGutterText(view)).toBe('before');
    view.destroy();
});

test('re-supplying breakpointState resets the markers', () => {
    const { view, gutter } = makeCompartmentView({
        factory: marker('first'),
        options: {},
    });
    view.dispatch({ effects: toggleBreakpoint.of(0) });
    expect(enabledRuleLines(view.state)).toEqual([1]);

    // A new `breakpointState()` call returns a new init provider. CodeMirror
    // re-creates the field value when the provider object changes, so the
    // marker set starts empty and the new marker options apply.
    const nextFactory = marker('second');
    view.dispatch({
        effects: gutter.reconfigure(breakpointState({
            marker: { factory: nextFactory, options: { color: 'blue' } },
        })),
    });
    expect(enabledRuleLines(view.state)).toEqual([]);
    expect(markerFactoryOf(view.state)).toBe(nextFactory);
    expect(initialMarkerOptionsOf(view.state)).toEqual({ color: 'blue' });

    view.dispatch({ effects: toggleBreakpoint.of(0) });
    expect(visibleGutterText(view)).toBe('second');
    view.destroy();
});

test('the first breakpointState init provider sets the marker options', () => {
    const marked = breakpointState({
        marker: { factory: marker('marked'), options: { color: 'red' } },
    });
    // Each instance supplies its own init value. CodeMirror uses the first
    // provider, so a config-less instance wins when it comes first.
    const ordered = EditorState.create({
        doc: '',
        extensions: [breakpointState(), marked],
    });
    expect(markerOptionsOf(ordered)).toEqual({});

    // A higher precedence puts the config-less provider first even when the
    // marked instance comes earlier in the extension list.
    const higher = EditorState.create({
        doc: '',
        extensions: [marked, Prec.high(breakpointState())],
    });
    expect(markerOptionsOf(higher)).toEqual({});
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

test('a carry seeks across a chunk gap to a marked line start', () => {
    const { state, lineStarts } = stateWithMarkedLines(2000);

    // The two line-break insertions are farther apart than one marker chunk,
    // so the carry seeks to the last change instead of stepping over every
    // unchanged marker. The seek must land on the marker at the change start:
    // a missed marker would stay on the empty line above the pushed-down rule.
    const last = lineStarts[lineStarts.length - 1];
    const next = state.update({
        changes: [
            { from: lineStarts[10], insert: '\n' },
            { from: last, insert: '\n' },
        ],
        userEvent: 'input',
    }).state;

    expect(next.doc.lines).toBe(2002);
    expect(enabledRuleLines(next)).toHaveLength(2000);
    // Line 11 is the empty line that the first insertion adds; its rule moved
    // to line 12.
    expect(isBreakpointAt(next, next.doc.line(11).from)).toBe(false);
    expect(isBreakpointAt(next, next.doc.line(12).from)).toBe(true);
    // Line 2001 is the empty line that the second insertion adds; the last
    // rule moved to line 2002.
    expect(isBreakpointAt(next, next.doc.line(2001).from)).toBe(false);
    expect(isBreakpointAt(next, next.doc.line(2002).from)).toBe(true);
});

test('a toggle from another extender removes a carried marker', () => {
    // A transaction extender sees the original transaction, so its toggle is
    // missing from the carry that `deletedLineEffect` computes. The field must
    // reconcile the carry against the removed set that it builds after every
    // extender ran.
    const extender = EditorState.transactionExtender.of((tr) => (
        tr.docChanged && !tr.isUserEvent('undo') && !tr.isUserEvent('redo')
            ? { effects: [toggleBreakpoint.of(2)] }
            : null
    ));
    const state = EditorState.create({
        doc: 'a\nb',
        extensions: [breakpointState(), extender],
    });
    const marked = state.update({ effects: toggleBreakpoint.of(2) }).state;
    expect(enabledRuleLines(marked)).toEqual([2]);

    // Enter at the start of line 2 carries its marker down, and the external
    // extender turns the marker off in the same transaction. The marker must
    // not come back on the pushed-down line.
    const next = marked.update({
        changes: { from: 2, insert: '\n' },
        userEvent: 'input',
    }).state;
    expect(next.doc.toString()).toBe('a\n\nb');
    expect(enabledRuleLines(next)).toEqual([]);
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

test('initialMarkerOptionsOf returns undefined without the breakpoint field', () => {
    const state = EditorState.create({ doc: '' });
    expect(initialMarkerOptionsOf(state)).toBeUndefined();
});

test('markerOptionsOf follows the options installed with the factory', () => {
    const view = makeView('', {
        factory: marker('initial'),
        options: { color: 'red' },
    });
    expect(markerOptionsOf(view.state)).toEqual({ color: 'red' });
    expect(initialMarkerOptionsOf(view.state)).toEqual({ color: 'red' });

    const nextOptions = { color: 'blue', innerHTML: '<b></b>' };
    const nextFactory = marker('next');
    view.dispatch({
        effects: setMarkerFactory.of({ factory: nextFactory, options: nextOptions }),
    });
    expect(markerOptionsOf(view.state)).toEqual(nextOptions);
    expect(markerFactoryOf(view.state)).toBe(nextFactory);
    // A factory change keeps the options that the editor was created with, so
    // a later reset can restore them.
    expect(initialMarkerOptionsOf(view.state)).toEqual({ color: 'red' });
    view.destroy();
});

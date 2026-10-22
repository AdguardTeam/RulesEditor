import { invertedEffects } from '@codemirror/commands';
import {
    Annotation,
    type ChangeSet,
    EditorState,
    type Extension,
    Facet,
    type Range,
    RangeSet,
    StateEffect,
    StateField,
    Transaction,
} from '@codemirror/state';
import { gutter, GutterMarker } from '@codemirror/view';

/**
 * Effect that toggles the enabled marker for the line at the given document
 * position (the line's start offset).
 *
 * A dispatched value is in the transaction's start (pre-change) coordinates:
 * `breakpointField` removes the marker of a toggled-off line from the start
 * set and maps only the toggled-on positions through `tr.changes` with an
 * association of `-1`, so a prefix inserted at the line start (the comment
 * toggle) keeps the marker at the start of the line instead of moving it
 * behind the prefix.
 *
 * History inverts the effect by restoring the whole marker set of the
 * transaction's start state (see the `invertedEffects` provider in
 * `breakpointState`): a per-position inverse cannot express the start of a
 * line that a deletion restored.
 */
export const toggleBreakpoint = StateEffect.define<number>({
    map: (value, mapping) => mapping.mapPos(value, -1),
});

/**
 * Effect that replaces the enabled markers of the editor that handles it with
 * markers at the given line starts.
 *
 * The positions are in the document produced by the transaction that carries
 * the effect, not in its start document: `breakpointField` does not map them
 * through the transaction's changes. `setEditorValue` uses the effect to load
 * markers for a document that the same transaction inserts. The effect's `map`
 * rebases the positions when history replays the transaction after a change
 * that was not recorded.
 */
export const setBreakpoints = StateEffect.define<readonly number[]>({
    map: (value, mapping) => value.map((pos) => mapping.mapPos(pos, -1)),
});

/**
 * Effect that replaces the marker factory of the editor that handles it.
 */
export const setMarkerFactory = StateEffect.define<() => HTMLElement>();

/**
 * Annotation that marks a transaction as a programmatic load, so the
 * deleted-line extender leaves it alone.
 */
export const programmaticLoad = Annotation.define<boolean>();

/**
 * Builds the default marker element (a filled circle).
 *
 * @returns The default marker DOM element.
 */
function defaultMarker(): HTMLElement {
    const el = document.createElement('div');
    el.textContent = '\u25CF';
    return el;
}

/**
 * Facet that holds the marker factory of one editor, so two editors on the
 * same page can render different marker styles.
 */
const markerFactory = Facet.define<() => HTMLElement, () => HTMLElement>({
    // CodeMirror resolves facet providers highest-precedence first, so the
    // first value is the one that wins.
    combine: (factories) => factories[0] ?? defaultMarker,
});

/**
 * Gutter marker rendered for an enabled rule line.
 *
 * The marker keeps the factory of the editor it belongs to: `toDOM` receives
 * no editor state, so the factory is resolved when the marker is created.
 */
class BreakpointMarker extends GutterMarker {
    /**
     * The factory that renders this marker.
     */
    readonly factory: () => HTMLElement;

    /**
     * Creates a marker that renders its element with the given factory.
     *
     * @param factory Factory producing a marker element.
     */
    constructor(factory: () => HTMLElement) {
        super();
        this.factory = factory;
    }

    /**
     * Renders the marker element using the factory of the owning editor.
     *
     * @returns The marker DOM node.
     */
    public toDOM(): HTMLElement {
        return this.factory();
    }
}

/**
 * The enabled-rule markers of one editor and the factory for new markers.
 */
interface BreakpointState {
    /**
     * The marked lines.
     */
    markers: RangeSet<GutterMarker>;

    /**
     * The factory used to render new markers.
     */
    factory: () => HTMLElement;
}

/**
 * Rebuilds the marker set with a new factory, keeping the marker positions.
 *
 * @param markers The current marker set.
 * @param factory The new marker factory.
 *
 * @returns A marker set whose markers use `factory`.
 */
function rebuildMarkers(
    markers: RangeSet<GutterMarker>,
    factory: () => HTMLElement,
): RangeSet<GutterMarker> {
    const rebuilt: Range<GutterMarker>[] = [];
    const cursor = markers.iter();
    while (cursor.value) {
        rebuilt.push(new BreakpointMarker(factory).range(cursor.from, cursor.to));
        cursor.next();
    }
    return RangeSet.of(rebuilt, true);
}

/**
 * Maps the given start-document positions through `changes` with an
 * association of `-1`, in a single pass.
 *
 * `ChangeSet.mapPos` scans the change sections from the start, so mapping one
 * position per toggle effect is quadratic when a whole-document selection
 * toggles thousands of lines. The positions must be sorted in ascending order;
 * the toggle effects always come from selected line numbers, which are sorted.
 *
 * @param changes The changes to map through.
 * @param positions The sorted start-document positions.
 *
 * @returns The mapped positions, in the same order.
 */
function mapPositions(changes: ChangeSet, positions: readonly number[]): number[] {
    const mapped: number[] = [];
    let index = 0;
    let shift = 0;
    changes.iterChangedRanges((fromA, toA, fromB, toB) => {
        while (index < positions.length && positions[index] < fromA) {
            mapped.push(positions[index] + shift);
            index += 1;
        }
        if (fromA === toA) {
            // An insertion: a position at its start stays before the inserted
            // text.
            while (index < positions.length && positions[index] === fromA) {
                mapped.push(fromB);
                index += 1;
            }
        } else {
            // A deletion or a replacement: positions inside the deleted range
            // collapse to its start, and a position at its end moves after the
            // inserted text.
            while (index < positions.length && positions[index] <= toA) {
                mapped.push(positions[index] === toA ? toB : fromB);
                index += 1;
            }
        }
        shift = toB - toA;
    }, true);
    while (index < positions.length) {
        mapped.push(positions[index] + shift);
        index += 1;
    }
    return mapped;
}

const breakpointField = StateField.define<BreakpointState>({
    create: (state) => ({
        markers: RangeSet.empty,
        factory: state.facet(markerFactory),
    }),
    update(value, tr) {
        const factoryEffect = tr.effects.find((effect) => effect.is(setMarkerFactory));
        const factory = factoryEffect ? factoryEffect.value : value.factory;

        // A `setBreakpoints` effect replaces the whole set with positions in
        // the new document, so the old markers need neither mapping nor
        // toggling. This also keeps an undo or a redo of a large toggle fast:
        // mapping every marker through the change set that reverts thousands
        // of comment prefixes would be quadratic in the number of lines.
        const setEffect = tr.effects
            .filter((effect): effect is StateEffect<readonly number[]> => effect.is(setBreakpoints))
            .at(-1);
        if (setEffect) {
            return {
                markers: RangeSet.of(
                    setEffect.value.map((pos) => new BreakpointMarker(factory).range(pos)),
                    true,
                ),
                factory,
            };
        }

        // Toggle effects carry start-document positions. Split them into the
        // markers to remove from the start set and the positions to add after
        // the set is mapped: a marker that the same transaction moves or
        // deletes must not be mapped onto another line first. Two toggles of
        // the same position in one transaction cancel each other out.
        const counts = new Map<number, number>();
        for (const effect of tr.effects) {
            if (effect.is(toggleBreakpoint)) {
                counts.set(effect.value, (counts.get(effect.value) ?? 0) + 1);
            }
        }
        const removed = new Set<number>();
        const added: number[] = [];
        [...counts.keys()]
            .sort((a, b) => a - b)
            .forEach((pos) => {
                if (counts.get(pos)! % 2 === 0) {
                    return;
                }
                let has = false;
                value.markers.between(pos, pos, () => {
                    has = true;
                });
                if (has) {
                    removed.add(pos);
                } else {
                    added.push(pos);
                }
            });

        // `RangeSet.update` rebuilds the whole set, so all removals are applied
        // with a single update instead of one per effect: `Ctrl+A` → `Ctrl+/`
        // dispatches one effect per selected line, and rebuilding the set per
        // effect would make it quadratic in the number of lines.
        let markers = removed.size > 0
            ? value.markers.update({ filter: (from) => !removed.has(from) })
            : value.markers;
        markers = markers.map(tr.changes);
        if (added.length > 0) {
            markers = markers.update({
                add: mapPositions(tr.changes, added)
                    .map((pos) => new BreakpointMarker(factory).range(pos)),
                sort: true,
            });
        }

        if (factory !== value.factory) {
            markers = rebuildMarkers(markers, factory);
        }

        return { markers, factory };
    },
});

/**
 * Returns the toggle effects that remove the markers whose line start the
 * transaction deletes.
 *
 * A marker belongs to a line start. When a transaction deletes the line break
 * before a marker, the marker would be mapped into the middle of the merged
 * line; when it deletes the whole line, the marker would be mapped onto the
 * next or the previous line (`deleteLine` deletes the break after the first
 * line and the one before every other line). Removing the marker in the same
 * transaction makes the removal part of the delete's undo step, so an undo
 * restores the line and its marker together.
 *
 * @param tr The transaction to inspect.
 *
 * @returns One toggle effect per marker whose line start is deleted.
 */
function deletedLineEffects(tr: Transaction): StateEffect<number>[] {
    const { doc } = tr.startState;
    const { markers } = tr.startState.field(breakpointField);
    if (markers.size === 0) {
        return [];
    }
    const positions = new Set<number>();
    tr.changes.iterChangedRanges((fromA, toA) => {
        markers.between(fromA, toA, (from) => {
            if (from > fromA) {
                // The deletion covers the line break before the marker's line,
                // so the line start is gone even when part of the line text
                // survives. This includes a line joined to the previous one
                // and a marker at the end of the deleted range.
                positions.add(from);
                return;
            }
            const line = doc.lineAt(from);
            // A deletion that starts at the line start removes the whole line
            // only when it also removes an adjacent line break; a full-line
            // replacement that keeps the breaks is not a deletion.
            if (fromA <= line.from && toA >= line.to
                && (fromA < line.from || toA > line.to)) {
                positions.add(from);
            }
        });
    });
    return [...positions].map((pos) => toggleBreakpoint.of(pos));
}

/**
 * Extension that drops the markers of deleted lines in the same transaction as
 * the deletion, so one undo restores the line and its marker together.
 *
 * An extender, not a filter: it adds effects to the transaction instead of
 * rebuilding it. Undo and redo transactions already carry the marker effects
 * that history stored for them, so they are skipped.
 */
const deletedLineMarkers = EditorState.transactionExtender.of((tr) => {
    if (!tr.docChanged || tr.annotation(programmaticLoad)) {
        return null;
    }
    const userEvent = tr.annotation(Transaction.userEvent);
    if (userEvent === 'undo' || userEvent === 'redo') {
        return null;
    }
    const effects = deletedLineEffects(tr);
    if (effects.length === 0) {
        return null;
    }
    return { effects };
});

/**
 * Editor extension providing the enabled-rule gutter and its state field.
 *
 * @param options Gutter configuration.
 * @param options.markerFactory Factory producing a marker element for this
 *   editor. Defaults to a filled circle.
 *
 * @returns A CodeMirror 6 extension.
 */
export function breakpointState(options: {
    markerFactory?: () => HTMLElement;
} = {}): Extension {
    return [
        options.markerFactory ? markerFactory.of(options.markerFactory) : [],
        breakpointField,
        deletedLineMarkers,
        // A marker change is inverted by restoring the whole marker set of the
        // transaction's start state. Restoring positions one by one cannot
        // express the start of a line that a deletion restored: a deleted
        // middle line collapses to the end of the previous line, and the
        // inverse effect would land before the restored line break.
        invertedEffects.of((tr) => {
            const changesMarkers = tr.effects.some(
                (effect) => effect.is(toggleBreakpoint) || effect.is(setBreakpoints),
            );
            if (!changesMarkers) {
                return [];
            }
            const positions: number[] = [];
            const { markers } = tr.startState.field(breakpointField);
            markers.between(0, tr.startState.doc.length, (from) => {
                positions.push(from);
            });
            return [setBreakpoints.of(positions)];
        }),
        gutter({
            class: 'cm-breakpoint-gutter',
            markers: (view) => view.state.field(breakpointField).markers,
            // The field, not the facet, is the runtime source of the factory:
            // `setMarkerFactory` changes it after the editor is created.
            initialSpacer: (view) => new BreakpointMarker(
                view.state.field(breakpointField).factory,
            ),
            updateSpacer: (spacer, update) => {
                const { factory } = update.state.field(breakpointField);
                return (spacer as BreakpointMarker).factory === factory
                    ? spacer
                    : new BreakpointMarker(factory);
            },
        }),
    ];
}

/**
 * Reports whether the given state carries the enabled-rule field.
 *
 * @param state The editor state.
 *
 * @returns `true` if the breakpoint field is present.
 */
export function hasBreakpoints(state: EditorState): boolean {
    return state.field(breakpointField, false) !== undefined;
}

/**
 * Reports whether an enabled marker exists at the given line-start position.
 *
 * @param state The editor state.
 * @param pos The line start offset.
 *
 * @returns `true` if a marker exists at `pos`.
 */
export function isBreakpointAt(state: EditorState, pos: number): boolean {
    let has = false;
    state.field(breakpointField).markers.between(pos, pos, () => {
        has = true;
    });
    return has;
}

/**
 * Returns the 1-based line numbers that carry an enabled marker.
 *
 * @param state The editor state.
 *
 * @returns The sorted list of enabled line numbers.
 */
export function enabledRuleLines(state: EditorState): number[] {
    const lines: number[] = [];
    const { markers } = state.field(breakpointField);
    markers.between(0, state.doc.length, (from) => {
        lines.push(state.doc.lineAt(from).number);
    });
    return lines;
}

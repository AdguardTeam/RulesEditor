import { invertedEffects } from '@codemirror/commands';
import {
    type ChangeSet,
    EditorState,
    type Extension,
    Facet,
    MapMode,
    type RangeCursor,
    RangeSet,
    StateEffect,
    StateField,
    type Transaction,
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
 * line that a deletion restored. The effect therefore defines no `map`; a
 * history join stores the `setBreakpoints` snapshot instead of the toggle.
 */
export const toggleBreakpoint = StateEffect.define<number>();

/**
 * Effect that replaces the enabled markers of the editor that handles it with
 * markers at the given line starts.
 *
 * The positions are in the document produced by the transaction that carries
 * the effect, not in its start document: `breakpointField` does not map them
 * through the transaction's changes. `setEditorValue` uses the effect to load
 * markers for a document that the same transaction inserts. The effect's `map`
 * runs when history joins two events: it rebases the snapshot of the newer
 * event through the changes of the older one, so both snapshots refer to the
 * document that the joined undo restores. After a change that history does not
 * record, the stored positions no longer fit the mapping and it can throw a
 * `RangeError`.
 */
export const setBreakpoints = StateEffect.define<readonly number[]>({
    map: (value, mapping) => value.map((pos) => mapping.mapPos(pos, -1)),
});

/**
 * The value of the `removeBreakpoints` effect.
 */
interface MarkerRemoval {
    /**
     * The line starts whose marker the transaction removes, in the start
     * document's coordinates.
     */
    positions: readonly number[];

    /**
     * The marked line starts that the transaction carries to the line start
     * that now holds the rule, keyed by their start-document positions.
     */
    carried: ReadonlyMap<number, number>;
}

/**
 * Effect that removes the enabled markers at the given line starts and passes
 * the carried marker positions to `breakpointField`.
 *
 * The extender computes the carry because it has the marker set of the start
 * state, and the field reuses the map instead of scanning the marker set a
 * second time for the same transaction. The extender sees only the effects of
 * the original transaction spec, so the field still reconciles the map against
 * the removed set that it builds after all extenders ran.
 *
 * The positions are in the transaction's start (pre-change) coordinates, like
 * `toggleBreakpoint`. The effect has no `map` on purpose: `deletedLineMarkers`
 * adds it to a transaction through an `EditorState.transactionExtender`, and
 * CodeMirror maps an extender's effects through an empty change set of the new
 * document length. A position past that length would throw a `RangeError`, and
 * a removed line start has no position to map to anyway.
 */
const removeBreakpoints = StateEffect.define<MarkerRemoval>();

/**
 * Color and inner HTML applied by a marker factory.
 */
export interface MarkerOptions {
    /**
     * Marker icon color; an empty string means the default.
     */
    color?: string;

    /**
     * Marker inner HTML; an empty string means the default.
     */
    innerHTML?: string;
}

/**
 * The factory of one editor and the options it applies.
 */
export interface MarkerConfig {
    /**
     * The factory that renders the markers.
     */
    factory: () => HTMLElement;

    /**
     * The color and inner HTML that `factory` applies.
     */
    options: MarkerOptions;
}

/**
 * Effect that replaces the marker factory of the editor that handles it,
 * together with the options the factory was built from.
 */
export const setMarkerFactory = StateEffect.define<MarkerConfig>();

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
 * Facet that holds the marker factory of one editor together with the options
 * it applies, so two editors on the same page can render different marker
 * styles and a later marker change can merge the current options instead of
 * wrapping the current factory in another layer.
 */
const markerConfig = Facet.define<MarkerConfig, MarkerConfig>({
    // CodeMirror resolves facet providers highest-precedence first, so the
    // first value is the one that wins.
    combine: (configs) => configs[0] ?? { factory: defaultMarker, options: {} },
});

/**
 * The range value settings of an enabled-rule marker. `RangeSet.map` reads
 * them from `BreakpointMarker`, and the mapping equivalence test builds its
 * reference marker from the same values. The test compares that reference with
 * `mapPositions`, so a change to the constant that the linear path does not
 * follow fails the test.
 *
 * A `GutterMarker` has a start and an end side of `-1`, and an enabled-rule
 * marker overrides the default `MapMode.TrackBefore` with `MapMode.Simple`.
 *
 * Exported for the mapping equivalence test; it is not part of the public API.
 */
export const MARKER_MAPPING = {
    /**
     * The position association that a change applies to the marker.
     */
    startSide: -1,

    /**
     * The end side of the point range.
     */
    endSide: -1,

    /**
     * The mode that maps the marker through a change.
     */
    mapMode: MapMode.Simple,
};

/**
 * Gutter marker rendered for an enabled rule line.
 *
 * The marker captures the factory of the editor it belongs to. `toDOM` gets
 * the view, so it could read the current factory. A factory change must
 * replace the marker objects instead: the gutter redraws a line only when its
 * marker changes, and an unchanged marker keeps its old DOM.
 */
class BreakpointMarker extends GutterMarker {
    /**
     * The factory that renders this marker.
     */
    readonly factory: () => HTMLElement;

    /**
     * The position association that a change applies to the marker.
     */
    readonly startSide = MARKER_MAPPING.startSide;

    /**
     * The end side of the point range.
     */
    readonly endSide = MARKER_MAPPING.endSide;

    /**
     * Maps the marker to the nearest position instead of dropping it when a
     * change deletes its line start. `deletedLineEffect` removes the markers
     * whose line a delete should drop, so this mode only decides where the
     * remaining markers land. A move swaps line text without telling the
     * marker which line moved, so a marker that survives `move.line` can land
     * on the line that took its place.
     */
    readonly mapMode = MARKER_MAPPING.mapMode;

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
interface BreakpointState extends MarkerConfig {
    /**
     * The marked lines.
     */
    markers: RangeSet<GutterMarker>;

    /**
     * The options the editor was created with, so a later change can reset a
     * field to the `initEditor` value or the library default.
     */
    initialOptions: MarkerOptions;
}

/**
 * Maps the given start-document positions through `changes` with a negative
 * start side and `MapMode.Simple`, in a single pass over both lists.
 *
 * `ChangeSet.mapPos` scans the change sections from the start, so mapping one
 * position at a time is quadratic when an edit produces many changes and many
 * positions. The positions must be sorted in ascending order; the toggle
 * effects are not sorted, so `breakpointField` sorts their values before
 * calling this function.
 *
 * A replacement keeps a position at its start before the inserted text and a
 * position at its end after it. An insertion keeps a position at its start
 * before the inserted text because the start side is negative. The function
 * reads the change description, which holds no inserted text, so it does not
 * build a `Text` for every changed range. It implements the marker mapping
 * directly instead of reading `MARKER_MAPPING`; the equivalence test builds its
 * reference marker from the constant, so a change to the constant that this
 * function does not follow fails the test.
 *
 * Exported for the mapping equivalence test; it is not part of the public API.
 *
 * @param changes The changes to map through.
 * @param positions The sorted start-document positions.
 *
 * @returns The mapped positions, in the same order.
 */
export function mapPositions(changes: ChangeSet, positions: readonly number[]): number[] {
    // An empty list needs no scan, and a transaction without added positions
    // must not walk the change set.
    if (positions.length === 0) {
        return [];
    }
    const mapped: number[] = [];
    let index = 0;
    let shift = 0;
    changes.desc.iterChangedRanges((fromA, toA, fromB, toB) => {
        while (index < positions.length && positions[index] < fromA) {
            mapped.push(positions[index] + shift);
            index += 1;
        }
        if (fromA === toA) {
            // An insertion: a position at its start stays before the inserted
            // text, like `ChangeSet.mapPos` does for a negative start side.
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

/**
 * The number of markers that `RangeSet` keeps in one chunk. `RangeSet.map`
 * remaps a chunk as a unit, so a gap between changes that is longer than one
 * chunk leaves the chunks inside the gap untouched.
 */
const MARKERS_PER_CHUNK = 250;

/**
 * Returns the approximate document span of one marker chunk at the current
 * marker density.
 *
 * A gap longer than this holds more markers than one chunk, so seeking across
 * it costs no more than walking it and avoids a walk over an untouched region
 * such as the gap before a distant cursor.
 *
 * @param markers The marker set.
 * @param documentLength The length of the document.
 *
 * @returns The approximate span of one chunk.
 */
function chunkSpanOf(markers: RangeSet<GutterMarker>, documentLength: number): number {
    return documentLength / Math.max(1, Math.ceil(markers.size / MARKERS_PER_CHUNK));
}

/**
 * Moves the marker cursor to the first marker at or after `pos`.
 *
 * A step-by-step walk is linear in the markers inside the gap, and `goto`
 * rescans the chunks from the first chunk. The function jumps when the gap is
 * longer than one chunk span, so a distant change costs one chunk scan
 * instead of a walk over every marker between the changes.
 *
 * @param cursor The marker cursor to move.
 * @param pos The position to move to.
 * @param chunkSpan The approximate span of one marker chunk.
 */
function seekCursor(cursor: RangeCursor<GutterMarker>, pos: number, chunkSpan: number): void {
    if (cursor.value && cursor.from < pos && pos - cursor.from > chunkSpan) {
        cursor.goto(pos);
    }
    while (cursor.value && cursor.from < pos) {
        cursor.next();
    }
}

/**
 * The weighted span above which `breakpointField.update` maps the markers in
 * one pass over the markers and the changes.
 *
 * `RangeSet.map` walks the chunks of the set and remaps only the chunks that
 * the changes touch, so a few ranges stay cheap even when the set holds many
 * markers. The linear pass walks every marker, so it pays off only when the
 * changes are spread over a large part of the document. The check weights the
 * number of changed ranges by the share of the document that they span:
 * `count * span / documentLength`.
 *
 * The span counts the changed ranges and the gaps between them, but caps every
 * gap at one chunk span: `RangeSet.map` does not touch the chunks inside a
 * longer gap, so the gap must not add to the weight. Without the cap a single
 * cursor far from a block edit stretches the span over the whole document and
 * sends the block edit to the linear pass.
 *
 * On the 50,000-line document with one marker per line, the two paths cost
 * about the same at a weight of 24, which is about 70 changed ranges spread
 * over the document. A single keystroke, a 20-cursor edit, and a 100-cursor
 * edit on adjacent lines stay below the cutoff. Replace All and a comment
 * toggle on 100 marked lines spread over the document go above it. The
 * benchmarks in `test/breakpoints.bench.ts` cover these cases, and the
 * spread-edit test in `test/breakpoints.test.ts` pins the cutoff from above:
 * it expects the linear pass for an edit that weighs about 39, so raising the
 * cutoff past 39 fails it.
 */
const LINEAR_MAP_CHANGE_THRESHOLD = 24;

/**
 * Reports whether the linear pass over the markers and the changes is cheaper
 * than `RangeSet.map` for this transaction.
 *
 * The number of changed ranges alone cannot separate a Replace All from a
 * block edit: `RangeSet.map` remaps only the chunks that the changes touch, so
 * many adjacent cursors stay cheap there, while the linear pass walks every
 * marker. Weighting the count by the span that the changes cover keeps adjacent
 * edits on the chunked path and sends spread edits to the linear pass. The span
 * caps every gap at one chunk span, so a change far from a block does not count
 * the untouched chunks between them.
 *
 * The check runs only when the set holds markers: `RangeSet.map` returns an
 * empty set at once, so a document without enabled rules must not scan the
 * changed ranges. The scan reads the change description, which has no inserted
 * text, instead of the change set, which builds a `Text` for every changed
 * range.
 *
 * @param markers The marker set of the transaction's start state.
 * @param changes The changes to map through.
 * @param documentLength The length of the start document.
 *
 * @returns `true` when the linear pass is cheaper.
 */
function needsLinearMapping(
    markers: RangeSet<GutterMarker>,
    changes: ChangeSet,
    documentLength: number,
): boolean {
    if (markers.size === 0 || changes.empty || documentLength === 0) {
        return false;
    }
    // One chunk spans about this much of the document at the current marker
    // density. A gap longer than this leaves whole chunks untouched.
    const chunkSpan = chunkSpanOf(markers, documentLength);
    let count = 0;
    let span = 0;
    let previousEnd = -1;
    changes.desc.iterChangedRanges((fromA, toA) => {
        if (previousEnd >= 0) {
            span += Math.min(fromA - previousEnd, chunkSpan);
        }
        span += toA - fromA;
        previousEnd = toA;
        count += 1;
    });
    return (count * span) / documentLength > LINEAR_MAP_CHANGE_THRESHOLD;
}

/**
 * Drops the duplicate markers that a change mapped onto the same line start.
 *
 * A change can keep a marker at its end and also map the marker of the line
 * that the change started on onto the same position. A line start holds at most
 * one enabled marker, so the first one wins.
 *
 * @param markers The marker set to deduplicate.
 *
 * @returns A marker set with one marker per position.
 */
function dedupeMarkers(markers: RangeSet<GutterMarker>): RangeSet<GutterMarker> {
    const seen = new Set<number>();
    return markers.update({
        filter: (from) => {
            if (seen.has(from)) {
                return false;
            }
            seen.add(from);
            return true;
        },
    });
}

/**
 * Reports whether a copy-line transaction inserts the copy above the selected
 * block (`copyLineDown`).
 *
 * `copyLineDown` and `copyLineUp` share the `input.copyline` user event. A copy
 * up inserts below the block, so the markers already map to their lines. A copy
 * down inserts above the block and would move the markers of the block onto the
 * inserted copy.
 *
 * `copyLineDown` inserts the block text and a line break after it. The original
 * block then starts at the insertion end. `copyLineUp` inserts a line break and
 * the block text, and the original block ends at the insertion point. The text
 * next to the insertion tells the direction. Only an empty block (a cursor on
 * an empty line) leaves both sides equal. Its selection range is empty, and an
 * empty range keeps its association when mapped: `copyLineDown` maps it with
 * `1` and `copyLineUp` with `-1`.
 *
 * @param tr The transaction to inspect.
 *
 * @returns `true` for a copy down, `false` for a copy up.
 */
function isCopyLineDown(tr: Transaction): boolean {
    let down: boolean | undefined;
    tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
        if (down !== undefined || fromA !== toA || fromB === toB) {
            return;
        }
        const after = inserted.slice(0, inserted.length - 1);
        const before = inserted.slice(1);
        const afterMatches = tr.newDoc.slice(toB, toB + after.length).eq(after);
        const beforeMatches = tr.newDoc.slice(fromB - before.length, fromB).eq(before);
        if (afterMatches !== beforeMatches) {
            down = afterMatches;
        } else if (afterMatches && after.length > 0) {
            // Identical text on both sides of the insertion. Keep the markers
            // in place; the lines hold the same text either way.
            down = true;
        }
    });
    if (down !== undefined) {
        return down;
    }
    // All blocks are empty lines. The selection range of each block is empty,
    // so the selection mapping tells the direction.
    const beforeSelection = tr.startState.selection.map(tr.changes, -1);
    const afterSelection = tr.startState.selection.map(tr.changes, 1);
    if (tr.selection && !beforeSelection.eq(afterSelection)) {
        if (tr.selection.eq(afterSelection)) {
            return true;
        }
        if (tr.selection.eq(beforeSelection)) {
            return false;
        }
    }
    return true;
}

/**
 * Returns the marked line starts that a change keeps on their lines or pushes
 * down, mapped to the line start that now holds the rule.
 *
 * An insertion at a marked line start that ends with a line break (Enter, a
 * paste, or a drop before the rule) pushes the rule down. `insertNewlineAndIndent`
 * can insert a line break with indentation instead: it replaces the leading
 * whitespace of an indented line, and a language indent service can add
 * indentation to an unindented line. In all these cases the rule moves to the
 * next line and the marker belongs to the rule, not to the new empty line
 * above it.
 *
 * `copyLineDown` and `copyLineUp` also insert text with line breaks, but they
 * duplicate the block instead of pushing it down: every marker of the copied
 * block stays on its line and the copy gets no marker. A copy up leaves the
 * marker positions unchanged. A copy down inserts the copy above the block, so
 * it returns each marker of the block at its own position; the non-empty map
 * also makes `deletedLineEffect` add the marker effect that stores the undo
 * snapshot. Without that effect, an undo would delete the inserted copy
 * together with its markers.
 *
 * @param tr The transaction to inspect.
 * @param markers The marker set of the transaction's start state.
 * @param removed The line starts whose marker the transaction removes.
 *
 * @returns A map from each carried line start to the line start that now holds
 *   the rule.
 */
function carriedLineStarts(
    tr: Transaction,
    markers: RangeSet<GutterMarker>,
    removed: ReadonlySet<number>,
): Map<number, number> {
    const carried = new Map<number, number>();
    const isCopyLine = tr.isUserEvent('input.copyline');
    if (isCopyLine && !isCopyLineDown(tr)) {
        return carried;
    }
    // `markers.between` walks the chunks of the set from the first chunk on
    // every call, so one call per changed range costs the changed ranges times
    // the chunks. The cursor below walks the marker ranges once, in order,
    // over the whole changed span. It seeks to the first changed range once and
    // then only moves forward, so the walk is linear in the markers it visits
    // and the changed ranges, not in their product.
    let firstChange = -1;
    tr.changes.desc.iterChangedRanges((fromA) => {
        if (firstChange < 0) {
            firstChange = fromA;
        }
    });
    if (firstChange < 0) {
        return carried;
    }
    const chunkSpan = chunkSpanOf(markers, tr.startState.doc.length);
    const cursor = markers.iter(firstChange);
    tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
        if (isCopyLine) {
            if (fromA !== toA || fromB === toB) {
                return;
            }
            seekCursor(cursor, fromA, chunkSpan);
            // The copied block occupies `[fromA, fromA + inserted.length)` in
            // the start document, and the copy keeps the same offsets. A
            // marker at the end of the block belongs to the line that follows
            // it, so the last position to keep is one before that end. Blocks
            // of a multi-cursor copy are ordered by their start, so a cursor
            // that has already passed a marker cannot meet it again here; the
            // carry value is the marker's own position either way.
            const blockEnd = fromA + inserted.length;
            while (cursor.value && cursor.from <= blockEnd - 1) {
                if (!removed.has(cursor.from)) {
                    carried.set(cursor.from, cursor.from);
                }
                cursor.next();
            }
            return;
        }
        if (removed.has(fromA)) {
            return;
        }
        seekCursor(cursor, fromA, chunkSpan);
        if (!cursor.value || cursor.from !== fromA) {
            return;
        }
        const line = tr.startState.doc.lineAt(fromA);
        const lastLine = inserted.line(inserted.lines);
        // A paste or a drop of text that ends with a line break looks like
        // Enter: the rule moves to the line below the inserted text.
        const isPushingInsertion = tr.isUserEvent('input.paste')
            || tr.isUserEvent('input.drop')
            || tr.isUserEvent('move.drop');
        const isLineBreakInsertion = fromA === toA
            && inserted.lines > 1
            && lastLine.length === 0
            && (inserted.line(1).length === 0 || isPushingInsertion);
        const indent = line.text.search(/\S/);
        const indentLength = indent < 0 ? line.text.length : indent;
        // `insertNewlineAndIndent` inserts a line break with indentation, so
        // the first inserted line is empty and the last one is whitespace
        // only. It replaces the leading whitespace of an indented line and
        // inserts at the line start of an unindented line.
        const pushesLineDown = fromA === line.from
            && inserted.lines > 1
            && inserted.line(1).length === 0
            && /^\s*$/.test(lastLine.text)
            && (fromA === toA || toA <= line.from + indentLength);
        if (isLineBreakInsertion || pushesLineDown) {
            carried.set(fromA, tr.newDoc.lineAt(toB).from);
        }
    });
    return carried;
}

/**
 * Splits the toggle effects of a transaction into the marked line starts that
 * the transaction turns off and the unmarked line starts that it turns on.
 *
 * Two toggles of the same position in one transaction cancel each other out.
 *
 * @param tr The transaction to inspect.
 * @param markers The marker set of the transaction's start state.
 *
 * @returns The positions to remove and the positions to add.
 */
function splitToggles(
    tr: Transaction,
    markers: RangeSet<GutterMarker>,
): { removed: number[]; added: number[] } {
    const toggled = new Set<number>();
    for (const effect of tr.effects) {
        if (effect.is(toggleBreakpoint) && !toggled.delete(effect.value)) {
            toggled.add(effect.value);
        }
    }
    const removed: number[] = [];
    const added: number[] = [];
    [...toggled]
        .sort((a, b) => a - b)
        .forEach((pos) => {
            let has = false;
            markers.between(pos, pos, () => {
                has = true;
            });
            (has ? removed : added).push(pos);
        });
    return { removed, added };
}

const breakpointField = StateField.define<BreakpointState>({
    create: (state) => {
        const config = state.facet(markerConfig);
        return {
            markers: RangeSet.empty,
            ...config,
            initialOptions: config.options,
        };
    },
    update(value, tr) {
        const factoryEffect = tr.effects.find((effect) => effect.is(setMarkerFactory));
        const factory = factoryEffect ? factoryEffect.value.factory : value.factory;
        const options = factoryEffect ? factoryEffect.value.options : value.options;

        // A `setBreakpoints` effect replaces the whole set with positions in
        // the new document, so the old markers need neither mapping nor
        // toggling. This also keeps an undo or a redo of a large toggle fast:
        // mapping every marker through the change set that reverts thousands
        // of comment prefixes would be quadratic in the number of lines.
        //
        // The last effect wins. History joins adjacent edits into one undo
        // step and appends the snapshot of the oldest edit at the end of the
        // joined effect list, so `.at(-1)` is the state that an undo of the
        // whole group must restore. `.at(0)` (or `.find`) would restore an
        // intermediate state: after five joined Backspaces it would bring
        // back the markers of the second-to-last delete only.
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
                options,
                initialOptions: value.initialOptions,
            };
        }

        // Toggle and removal effects carry start-document positions. Split
        // them into the markers to remove from the start set and the positions
        // to add after the set is mapped: a marker that the same transaction
        // moves or deletes must not be mapped onto another line first. Two
        // toggles of the same position in one transaction cancel each other
        // out, so the set keeps the positions toggled an odd number of times.
        const removalEffect = tr.effects
            .filter((effect): effect is StateEffect<MarkerRemoval> => effect.is(removeBreakpoints))
            .at(-1);
        const removed = new Set<number>();
        if (removalEffect) {
            removalEffect.value.positions.forEach((pos) => removed.add(pos));
        }
        const toggled = splitToggles(tr, value.markers);
        toggled.removed.forEach((pos) => removed.add(pos));
        const { added } = toggled;

        // An insertion at a marked line start that ends with a line break
        // (Enter or a paste at the start of the line) pushes the rule down.
        // The marker belongs to the rule, so it moves to the start of the line
        // that the insertion pushes down instead of staying on the new empty
        // line. `insertNewlineAndIndent` replaces the leading whitespace of an
        // indented line, so a replacement of the indent carries too.
        //
        // The extender computes the carry and passes it through
        // `removeBreakpoints`, so the field maps the marker set only once per
        // transaction. A transaction extender sees only the effects of the
        // original transaction spec, while this update reads the effects that
        // every extender added. A toggle effect added by another extender is
        // therefore missing from the extender's `removed` set, and the carry
        // must not bring back a marker that this update removes.
        //
        // History replays the edit as an undo or a redo transaction and
        // restores the marker from its stored snapshot; the extender skips
        // those transactions, so the carry is empty there.
        const carried = new Map<number, number>(removalEffect?.value.carried ?? []);
        removed.forEach((pos) => carried.delete(pos));

        // `RangeSet.map` reuses the chunks that an edit does not touch, so a
        // typed character or another edit with a few changed ranges stays
        // cheap. The linear pass is faster when the changes are spread over the
        // document, because mapping each marker with `ChangeSet.mapPos` scans
        // the change sections from the start: the cost there would be markers ×
        // changes. Decide the path on the start set, before the removals and
        // the carries: the linear walk skips those positions itself, so it
        // rebuilds the set once instead of filtering it first and rebuilding it
        // again.
        let markers: RangeSet<GutterMarker>;
        if (needsLinearMapping(value.markers, tr.changes, tr.startState.doc.length)) {
            // Collect the markers that survive the removals and the carries,
            // then map their positions in one pass over the sorted markers and
            // the sorted changes.
            const survivingPositions: number[] = [];
            const survivingMarkers: GutterMarker[] = [];
            for (let cursor = value.markers.iter(); cursor.value; cursor.next()) {
                if (removed.has(cursor.from) || carried.has(cursor.from)) {
                    continue;
                }
                survivingPositions.push(cursor.from);
                survivingMarkers.push(cursor.value);
            }
            markers = RangeSet.of(
                mapPositions(tr.changes, survivingPositions)
                    .map((pos, index) => survivingMarkers[index].range(pos)),
                true,
            );
        } else {
            // `RangeSet.update` rebuilds the whole set, so a typed character
            // on a large rule list must not run it when nothing is dropped.
            markers = removed.size > 0 || carried.size > 0
                ? value.markers.update({
                    filter: (from) => !removed.has(from) && !carried.has(from),
                })
                : value.markers;
            markers = markers.map(tr.changes);
        }
        // The carried and toggled-on positions are already in new-document
        // coordinates; the added positions need mapping from the start
        // document first.
        const nextMarkers = [
            ...carried.values(),
            ...mapPositions(tr.changes, added),
        ].map((pos) => new BreakpointMarker(factory).range(pos));
        if (nextMarkers.length > 0) {
            markers = markers.update({ add: nextMarkers, sort: true });
        }

        // A change that keeps a marker at its end can map it onto the same
        // line start as the marker of the line that the change started on
        // (for example `moveLineUp`); a line start holds at most one marker.
        // Only the kept-at-`toA` case in `deletedLineEffect` produces the
        // duplicate, so the whole set is deduplicated only when that effect is
        // present.
        if (removalEffect && markers.size > 1) {
            markers = dedupeMarkers(markers);
        }

        return {
            markers,
            factory,
            options,
            initialOptions: value.initialOptions,
        };
    },
});

/**
 * Returns the effect that removes the markers whose line the transaction
 * deletes, or keeps the marker snapshot for a marker that survives at a line
 * start or that the transaction carries to a pushed-down line.
 *
 * A marker belongs to a line start. When a transaction deletes the line break
 * before a marker, the marker would be mapped into the middle of the merged
 * line; when it deletes the whole line, the marker would be mapped onto the
 * next or the previous line (`deleteLine` deletes the break after the first
 * line and the one before every other line). Removing the marker in the same
 * transaction makes the removal part of the delete's undo step, so an undo
 * restores the line and its marker together.
 *
 * The effect also carries `carriedLineStarts`, so `breakpointField` reuses the
 * map instead of scanning the marker set a second time for the same
 * transaction. The extender sees only the original transaction spec, so it
 * passes the deletion positions to the carry. `breakpointField` then drops the
 * entries that its final removed set covers, which includes toggles added by
 * another extender.
 *
 * @param tr The transaction to inspect.
 *
 * @returns The removal effect, or `null` when the transaction does not touch a
 *   marked line. The effect can list no positions when it only keeps the
 *   marker snapshot for an undo of a carried marker, of a marker that survives
 *   at a line start, or of the markers of a copied block.
 */
function deletedLineEffect(tr: Transaction): StateEffect<MarkerRemoval> | null {
    const { doc } = tr.startState;
    const { markers } = tr.startState.field(breakpointField);
    if (markers.size === 0) {
        return null;
    }
    const isLineDelete = tr.isUserEvent('delete.line');
    // A cut without a selection deletes the line under the cursor. The cut
    // handler includes the line break of every line except the last one, which
    // has no break to include, so the whole-line check below has to treat a
    // line-wise cut like `deleteLine` on every line.
    const isLineCut = tr.isUserEvent('delete.cut')
        && tr.startState.selection.ranges.every((range) => range.empty);
    // A drag deletes the dragged text and inserts it again at the drop point.
    // Like `move.line`, the change shape cannot tell which line moved, so the
    // marker of a dragged line is only kept from being dropped; mapping can
    // still leave it on another line.
    const isMove = tr.isUserEvent('move.line') || tr.isUserEvent('move.drop');
    const positions = new Set<number>();
    // Whether a marker survives at `toA`. Such a transaction removes nothing,
    // but it still has to carry a marker effect: without one, the
    // `invertedEffects` provider stores no snapshot and an undo inserts the
    // deleted text after the marker instead of restoring the marker with it.
    let keptLineStart = false;
    // The callback needs only positions, so iterate the change description
    // instead of the change set, which builds the inserted text.
    tr.changes.desc.iterChangedRanges((fromA, toA, fromB, toB) => {
        // A marker at `toA` belongs to the first line that survives the
        // change, but only when the change maps it onto a line start: a
        // replacement that does not end with a line break joins the line to
        // the previous one. This is the shape of `deleteLine` on the first
        // line and of `moveLineUp`. `toB` is the mapped `toA` with an
        // association of `-1`, the same mapping the marker set uses.
        const keepsLineStart = tr.newDoc.lineAt(toB).from === toB;
        markers.between(fromA, toA, (from) => {
            if (from > fromA) {
                if (from === toA && keepsLineStart) {
                    keptLineStart = true;
                    return;
                }
                positions.add(from);
                return;
            }
            const line = doc.lineAt(from);
            // A pure delete that reaches past the line's end removes the
            // marker even when it does not cover the whole line: Backspace on
            // a selection through the line break, or Delete on an emptied
            // line, would otherwise map the marker onto the next rule.
            // `move.line` also deletes a line's text and reinserts it, but the
            // change shape cannot tell which line moved: `!isMove` only keeps
            // its marker from being dropped, and mapping can still leave the
            // marker on the line that takes the moved line's place.
            const deletesBreak = fromB === toB
                && toA > line.to
                && (toA < doc.length || fromA > 0);
            // `deleteLine` on the only line deletes `0..length` without an
            // adjacent line break, and a line-wise cut on the last line ends
            // at the document end, so those are the line deletes that
            // `deletesBreak` alone does not catch. An ordinary edit that
            // covers a whole line, such as a selection replacement or a
            // document-wide delete, keeps the marker, like an edit that only
            // empties the line.
            if (fromA <= line.from
                && toA >= line.to
                && (isLineDelete || isLineCut || (deletesBreak && !isMove))) {
                positions.add(from);
            }
        });
    }, true);
    // A carried insertion moves a marker without removing anything. A
    // copy-line transaction keeps the markers of the copied block at their
    // positions. Like a marker that survives at `toA`, both still need a
    // marker effect: the `invertedEffects` provider stores the snapshot only
    // for a transaction that changes markers, and a joined undo would
    // otherwise lose the carried marker.
    //
    // The extender cannot see the toggle effects that another extender adds,
    // so the carry starts from the deletion positions only. `breakpointField`
    // reconciles the map against the final removed set.
    const carried = carriedLineStarts(tr, markers, positions);
    return positions.size > 0 || keptLineStart || carried.size > 0
        ? removeBreakpoints.of({ positions: [...positions], carried })
        : null;
}

/**
 * Extension that drops the markers of deleted lines and records the marker
 * snapshot for a carried insertion in the same transaction as the edit, so one
 * undo restores the line and its marker together.
 *
 * An extender, not a filter: it adds an effect to the transaction instead of
 * rebuilding it. Undo and redo transactions already carry the marker effects
 * that history stored for them, so they are skipped.
 */
const deletedLineMarkers = EditorState.transactionExtender.of((tr) => {
    if (!tr.docChanged || tr.isUserEvent('undo') || tr.isUserEvent('redo')) {
        return null;
    }
    const effect = deletedLineEffect(tr);
    return effect ? { effects: [effect] } : null;
});

/**
 * Returns the factory that renders the markers of the editor that owns the
 * given state.
 *
 * @param state The editor state.
 *
 * @returns The marker factory, or `undefined` when the state has no
 *   breakpoint field.
 */
export function markerFactoryOf(state: EditorState): (() => HTMLElement) | undefined {
    return state.field(breakpointField, false)?.factory;
}

/**
 * Returns the marker options that the factory of the editor applies.
 *
 * @param state The editor state.
 *
 * @returns The marker options, or `undefined` when the state has no breakpoint
 *   field.
 */
export function markerOptionsOf(state: EditorState): MarkerOptions | undefined {
    return state.field(breakpointField, false)?.options;
}

/**
 * Returns the marker options the editor was created with.
 *
 * @param state The editor state.
 *
 * @returns The initial marker options, or `undefined` when the state has no
 *   breakpoint field.
 */
export function initialMarkerOptionsOf(state: EditorState): MarkerOptions | undefined {
    return state.field(breakpointField, false)?.initialOptions;
}

/**
 * Editor extension providing the enabled-rule gutter and its state field.
 *
 * @param options Gutter configuration.
 * @param options.marker Factory that renders the markers of this editor and
 *   the color and inner HTML it applies. Defaults to a filled circle with no
 *   color or HTML override.
 *
 * @returns A CodeMirror 6 extension.
 */
export function breakpointState(options: { marker?: MarkerConfig } = {}): Extension {
    return [
        options.marker ? markerConfig.of(options.marker) : [],
        breakpointField,
        deletedLineMarkers,
        // A marker change is inverted by restoring the whole marker set of the
        // transaction's start state. Restoring positions one by one cannot
        // express the start of a line that a deletion restored: a deleted
        // middle line collapses to the end of the previous line, and the
        // inverse effect would land before the restored line break.
        invertedEffects.of((tr) => {
            const changesMarkers = tr.effects.some(
                (effect) => effect.is(toggleBreakpoint)
                    || effect.is(setBreakpoints)
                    || effect.is(removeBreakpoints),
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
 * The result does not say whether any rule is enabled: it is `true` for an
 * editor with the gutter and zero markers.
 *
 * @param state The editor state.
 *
 * @returns `true` if the breakpoint field is present.
 */
export function hasBreakpointField(state: EditorState): boolean {
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

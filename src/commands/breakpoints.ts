import { invertedEffects } from '@codemirror/commands';
import {
    type ChangeSet,
    EditorState,
    type Extension,
    Facet,
    MapMode,
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
 * Effect that removes the enabled markers at the given line starts.
 *
 * The positions are in the transaction's start (pre-change) coordinates, like
 * `toggleBreakpoint`. The effect has no `map` on purpose: `deletedLineMarkers`
 * adds it to a transaction through an `EditorState.transactionExtender`, and
 * CodeMirror maps an extender's effects through an empty change set of the new
 * document length. A position past that length would throw a `RangeError`, and
 * a removed line start has no position to map to anyway.
 */
const removeBreakpoints = StateEffect.define<readonly number[]>();

/**
 * Effect that replaces the marker factory of the editor that handles it.
 */
export const setMarkerFactory = StateEffect.define<() => HTMLElement>();

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
     * Maps the marker to the nearest position instead of dropping it when a
     * change deletes its line start. `deletedLineEffect` removes the markers
     * whose line a delete should drop, so this mode only decides where the
     * remaining markers land. A move swaps line text without telling the
     * marker which line moved, so a marker that survives `move.line` can land
     * on the line that took its place.
     */
    readonly mapMode = MapMode.Simple;

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
 * Maps the given start-document positions through `changes` with an
 * association of `-1`, in a single pass over both lists.
 *
 * `ChangeSet.mapPos` scans the change sections from the start, so mapping one
 * position at a time is quadratic when an edit produces many changes and many
 * positions. The positions must be sorted in ascending order; the toggle
 * effects are not sorted, so `breakpointField` sorts their values before
 * calling this function.
 *
 * The association and the mode match `RangeSet.map` for the enabled-rule
 * markers: a `GutterMarker` has a start side of `-1` and `BreakpointMarker`
 * uses `MapMode.Simple`. A replacement keeps a position at its start before
 * the inserted text and a position at its end after it. An insertion keeps a
 * position at its start before the inserted text.
 *
 * Exported for the mapping equivalence test; it is not part of the public API.
 *
 * @param changes The changes to map through.
 * @param positions The sorted start-document positions.
 *
 * @returns The mapped positions, in the same order.
 */
export function mapPositions(changes: ChangeSet, positions: readonly number[]): number[] {
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
    if (tr.isUserEvent('input.copyline')) {
        if (!isCopyLineDown(tr)) {
            return carried;
        }
        tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
            if (fromA !== toA || fromB === toB) {
                return;
            }
            // The copied block occupies `[fromA, fromA + inserted.length)` in
            // the start document, and the copy keeps the same offsets. A
            // marker at the end of the block belongs to the line that follows
            // it, so the last position to keep is one before that end.
            const blockEnd = fromA + inserted.length;
            markers.between(fromA, blockEnd - 1, (from) => {
                if (!removed.has(from)) {
                    carried.set(from, from);
                }
            });
        });
        return carried;
    }
    tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
        if (removed.has(fromA)) {
            return;
        }
        let marked = false;
        markers.between(fromA, fromA, () => {
            marked = true;
        });
        if (!marked) {
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
            };
        }

        // Toggle and removal effects carry start-document positions. Split
        // them into the markers to remove from the start set and the positions
        // to add after the set is mapped: a marker that the same transaction
        // moves or deletes must not be mapped onto another line first. Two
        // toggles of the same position in one transaction cancel each other
        // out, so the set keeps the positions toggled an odd number of times.
        const removed = new Set<number>();
        for (const effect of tr.effects) {
            if (effect.is(removeBreakpoints)) {
                effect.value.forEach((pos) => removed.add(pos));
            }
        }
        const toggled = new Set<number>();
        for (const effect of tr.effects) {
            if (effect.is(toggleBreakpoint) && !toggled.delete(effect.value)) {
                toggled.add(effect.value);
            }
        }
        const added: number[] = [];
        [...toggled]
            .sort((a, b) => a - b)
            .forEach((pos) => {
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

        // An insertion at a marked line start that ends with a line break
        // (Enter or a paste at the start of the line) pushes the rule down.
        // The marker belongs to the rule, so it moves to the start of the line
        // that the insertion pushes down instead of staying on the new empty
        // line. `insertNewlineAndIndent` replaces the leading whitespace of an
        // indented line, so a replacement of the indent carries too.
        //
        // History replays the edit as an undo or a redo transaction and
        // restores the marker from its stored snapshot, so the carry runs only
        // on the edit itself. Without the guard, an undo that puts text ending
        // in a line break back looks like Enter and moves the marker again.
        const carried = tr.isUserEvent('undo') || tr.isUserEvent('redo')
            ? new Map<number, number>()
            : carriedLineStarts(tr, value.markers, removed);

        // Collect the markers that survive the removals and the carries, then
        // map their positions in one pass over the sorted markers and the
        // sorted changes. `RangeSet.map` maps each point through
        // `ChangeSet.mapPos` separately, and that method scans the change
        // sections from the start, so a Replace All over thousands of changes
        // and markers would cost markers × changes.
        const survivingPositions: number[] = [];
        const survivingMarkers: GutterMarker[] = [];
        const cursor = value.markers.iter();
        while (cursor.value) {
            const { from, value: marker } = cursor;
            if (marker && !removed.has(from) && !carried.has(from)) {
                survivingPositions.push(from);
                survivingMarkers.push(marker);
            }
            cursor.next();
        }
        const mappedPositions = mapPositions(tr.changes, survivingPositions);
        let markers = RangeSet.of(
            mappedPositions.map((pos, index) => survivingMarkers[index].range(pos)),
            true,
        );
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
        if (tr.effects.some((effect) => effect.is(removeBreakpoints)) && markers.size > 1) {
            markers = dedupeMarkers(markers);
        }

        return { markers, factory };
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
 * @param tr The transaction to inspect.
 *
 * @returns The removal effect, or `null` when the transaction does not touch a
 *   marked line. The effect can list no positions when it only keeps the
 *   marker snapshot for an undo of a carried marker, of a marker that survives
 *   at a line start, or of the markers of a copied block.
 */
function deletedLineEffect(tr: Transaction): StateEffect<readonly number[]> | null {
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
    tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
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
    const carried = carriedLineStarts(tr, markers, positions);
    return positions.size > 0 || keptLineStart || carried.size > 0
        ? removeBreakpoints.of([...positions])
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

import { ChangeSet, type ChangeSpec, EditorState } from '@codemirror/state';
import { bench } from 'vitest';

import { breakpointState, setBreakpoints, toggleBreakpoint } from '../src/commands/breakpoints';

const LINE_COUNT = 50_000;
const lines = Array.from({ length: LINE_COUNT }, (_, index) => `||rule-${index}.example^`);
const doc = lines.join('\n');

const markerPositions: number[] = [];
let lineStart = 0;
lines.forEach((line) => {
    markerPositions.push(lineStart);
    lineStart += line.length + 1;
});

/**
 * A position inside the first line, where a typed character shifts the markers
 * on the following lines.
 */
const TYPING_POSITION = markerPositions[0] + 2;

/**
 * The options shared by every benchmark: one warmup pass and one measured
 * second with three iterations. A pair of benchmarks uses the same options so
 * the comparison between the two stays fair.
 */
const BENCH_OPTIONS = {
    time: 1000,
    iterations: 3,
    warmupTime: 100,
    warmupIterations: 1,
};

/**
 * Builds the changes of a Replace All that replaces the `rule-` prefix on
 * every line.
 *
 * @returns The change specifications.
 */
function replaceAllSpecs(): ChangeSpec[] {
    return lines.map((line, index) => {
        const from = markerPositions[index] + 2;
        return { from, to: from + 'rule-'.length, insert: 'domain-' };
    });
}

/**
 * Builds the changes of a Replace All that replaces the leading `||` of every
 * line, so every changed range starts on a marked line start. The carry then
 * inspects every marker of a changed line instead of only the marked lines
 * next to a change.
 *
 * @returns The change specifications.
 */
function markedStartSpecs(): ChangeSpec[] {
    return markerPositions.map((from) => ({ from, to: from + 2, insert: '@@' }));
}

const changes = ChangeSet.of(replaceAllSpecs(), doc.length);
const markedStartChanges = ChangeSet.of(markedStartSpecs(), doc.length);
const stateWithMarkers = EditorState.create({
    doc,
    extensions: [breakpointState()],
}).update({ effects: setBreakpoints.of(markerPositions) }).state;
const stateWithoutMarkers = EditorState.create({
    doc,
    extensions: [breakpointState()],
});

/**
 * Applies the Replace All transaction and builds the next state.
 *
 * @param state The state to apply the transaction to.
 *
 * @returns The state after the transaction.
 */
function replaceAll(state: EditorState): EditorState {
    return state.update({ changes, userEvent: 'input.replace.all' }).state;
}

/**
 * Applies the Replace All transaction that starts on every marked line and
 * builds the next state.
 *
 * @param state The state to apply the transaction to.
 *
 * @returns The state after the transaction.
 */
function replaceAllOnMarkedStarts(state: EditorState): EditorState {
    return state.update({ changes: markedStartChanges, userEvent: 'input.replace.all' }).state;
}

/**
 * Applies a single typed character and builds the next state.
 *
 * @param state The state to apply the transaction to.
 *
 * @returns The state after the transaction.
 */
function typeCharacter(state: EditorState): EditorState {
    return state.update({
        changes: { from: TYPING_POSITION, insert: 'x' },
        userEvent: 'input.type',
    }).state;
}

/**
 * Builds the changes of a cursor on each of the first `count` adjacent lines.
 *
 * @param count The number of cursors.
 *
 * @returns The change specifications.
 */
function adjacentCursorSpecs(count: number): ChangeSpec[] {
    return Array.from({ length: count }, (_, index) => ({
        from: markerPositions[index] + 2,
        insert: 'x',
    }));
}

/**
 * Builds the changes of a keystroke with a cursor on each of the first
 * `count` adjacent lines.
 *
 * @param count The number of cursors.
 *
 * @returns The change set.
 */
function adjacentCursorChanges(count: number): ChangeSet {
    return ChangeSet.of(adjacentCursorSpecs(count), doc.length);
}

/**
 * The changes of one keystroke with 20 cursors on adjacent lines.
 */
const MULTI_CURSOR_CHANGES = adjacentCursorChanges(20);

/**
 * The changes of one keystroke with 100 cursors on adjacent lines. The cutoff
 * must keep a block edit this large on the chunked path.
 */
const BLOCK_CURSOR_CHANGES = adjacentCursorChanges(100);

/**
 * The changes of one keystroke with 64 cursors on adjacent lines and one at the
 * last line. The first-to-last span covers the whole document, but the gap
 * between the block and the distant cursor is untouched, so the weighting must
 * keep the edit on the chunked path.
 */
const DISTANT_CURSOR_CHANGES = ChangeSet.of(
    [
        ...adjacentCursorSpecs(64),
        { from: markerPositions[LINE_COUNT - 1] + 2, insert: 'x' },
    ],
    doc.length,
);

/**
 * Applies a keystroke with adjacent cursors and builds the next state.
 *
 * @param state The state to apply the transaction to.
 * @param keystrokeChanges The changes of the keystroke.
 *
 * @returns The state after the transaction.
 */
function typeWithCursors(state: EditorState, keystrokeChanges: ChangeSet): EditorState {
    return state.update({
        changes: keystrokeChanges,
        userEvent: 'input.type',
    }).state;
}

/**
 * The line indices of the marked lines in the comment-toggle benchmark. The
 * lines are spread over the document, so the changes take the linear pass.
 */
const COMMENT_LINE_INDICES = Array.from(
    { length: 100 },
    (_, index) => Math.floor((index * LINE_COUNT) / 100),
);

/**
 * The changes of a comment toggle that inserts `! ` at the start of every
 * marked line.
 */
const COMMENT_CHANGES = ChangeSet.of(
    COMMENT_LINE_INDICES.map((index) => ({
        from: markerPositions[index],
        insert: '! ',
    })),
    doc.length,
);

/**
 * The effects that remove the marker of every commented line.
 */
const COMMENT_EFFECTS = COMMENT_LINE_INDICES.map(
    (index) => toggleBreakpoint.of(markerPositions[index]),
);

/**
 * Applies a comment toggle to 100 marked lines and builds the next state.
 *
 * @param state The state to apply the transaction to.
 *
 * @returns The state after the transaction.
 */
function commentLines(state: EditorState): EditorState {
    return state.update({
        changes: COMMENT_CHANGES,
        effects: COMMENT_EFFECTS,
        userEvent: 'input.comment',
    }).state;
}

/**
 * Applies a transaction that only moves the selection and builds the next
 * state.
 *
 * @param state The state to apply the transaction to.
 *
 * @returns The state after the transaction.
 */
function moveSelection(state: EditorState): EditorState {
    return state.update({ selection: { anchor: 1 } }).state;
}

/**
 * Toggles the marker of the first line off and builds the next state.
 *
 * @param state The state to apply the transaction to.
 *
 * @returns The state after the transaction.
 */
function toggleMarker(state: EditorState): EditorState {
    return state.update({ effects: toggleBreakpoint.of(0) }).state;
}

bench('Replace All with 50k markers', () => {
    replaceAll(stateWithMarkers);
}, BENCH_OPTIONS);
bench('Replace All without markers', () => {
    replaceAll(stateWithoutMarkers);
}, BENCH_OPTIONS);
bench('Replace All on marked line starts with 50k markers', () => {
    replaceAllOnMarkedStarts(stateWithMarkers);
}, BENCH_OPTIONS);
bench('Replace All on marked line starts without markers', () => {
    replaceAllOnMarkedStarts(stateWithoutMarkers);
}, BENCH_OPTIONS);
bench('Single keystroke with 50k markers', () => {
    typeCharacter(stateWithMarkers);
}, BENCH_OPTIONS);
bench('Single keystroke without markers', () => {
    typeCharacter(stateWithoutMarkers);
}, BENCH_OPTIONS);
bench('20-cursor keystroke with 50k markers', () => {
    typeWithCursors(stateWithMarkers, MULTI_CURSOR_CHANGES);
}, BENCH_OPTIONS);
bench('20-cursor keystroke without markers', () => {
    typeWithCursors(stateWithoutMarkers, MULTI_CURSOR_CHANGES);
}, BENCH_OPTIONS);
bench('100-cursor keystroke with 50k markers', () => {
    typeWithCursors(stateWithMarkers, BLOCK_CURSOR_CHANGES);
}, BENCH_OPTIONS);
bench('100-cursor keystroke without markers', () => {
    typeWithCursors(stateWithoutMarkers, BLOCK_CURSOR_CHANGES);
}, BENCH_OPTIONS);
bench('64-cursor block plus a distant cursor with 50k markers', () => {
    typeWithCursors(stateWithMarkers, DISTANT_CURSOR_CHANGES);
}, BENCH_OPTIONS);
bench('64-cursor block plus a distant cursor without markers', () => {
    typeWithCursors(stateWithoutMarkers, DISTANT_CURSOR_CHANGES);
}, BENCH_OPTIONS);
bench('100-line comment toggle with 50k markers', () => {
    commentLines(stateWithMarkers);
}, BENCH_OPTIONS);
bench('Selection-only update with 50k markers', () => {
    moveSelection(stateWithMarkers);
}, BENCH_OPTIONS);
bench('Selection-only update without markers', () => {
    moveSelection(stateWithoutMarkers);
}, BENCH_OPTIONS);
bench('Marker toggle with 50k markers', () => {
    toggleMarker(stateWithMarkers);
}, BENCH_OPTIONS);

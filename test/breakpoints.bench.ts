// @vitest-environment jsdom
import { ChangeSet, type ChangeSpec, EditorState } from '@codemirror/state';
import { bench } from 'vitest';

import { breakpointState, setBreakpoints } from '../src/commands/breakpoints';

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

const changes = ChangeSet.of(replaceAllSpecs(), doc.length);
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
 */
function replaceAll(state: EditorState): void {
    const next = state.update({ changes, userEvent: 'input.replace.all' }).state;
    if (next.doc.length !== doc.length + LINE_COUNT * 2) {
        throw new Error('Replace All produced an unexpected document length');
    }
}

bench(
    'Replace All with 50k markers',
    () => replaceAll(stateWithMarkers),
    {
        time: 1000,
        iterations: 3,
        warmupTime: 100,
        warmupIterations: 1,
    },
);

bench(
    'Replace All without markers',
    () => replaceAll(stateWithoutMarkers),
    {
        time: 1000,
        iterations: 3,
        warmupTime: 100,
        warmupIterations: 1,
    },
);

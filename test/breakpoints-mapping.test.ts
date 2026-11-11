import {
    ChangeSet,
    type ChangeSpec,
    RangeSet,
    RangeValue,
} from '@codemirror/state';
import { expect, test } from 'vitest';

import { mapPositions, MARKER_MAPPING } from '../src/commands/breakpoints';

/**
 * A point range value with the mapping settings of an enabled-rule marker.
 *
 * The reference set maps a position exactly like the real marker set because
 * both read `MARKER_MAPPING`.
 */
class ReferenceMarker extends RangeValue {
    /**
     * Whether this marker only keeps the reference chunk at the document
     * boundaries.
     */
    readonly boundary: boolean;

    /**
     * The start side of an enabled-rule marker.
     */
    startSide = MARKER_MAPPING.startSide;

    /**
     * The end side of an enabled-rule marker.
     */
    endSide = MARKER_MAPPING.endSide;

    /**
     * The map mode of an enabled-rule marker.
     */
    mapMode = MARKER_MAPPING.mapMode;

    /**
     * Gutter markers are point ranges.
     */
    point = true;

    /**
     * Creates a reference marker.
     *
     * @param boundary Whether the marker only keeps the reference chunk at the
     *   document boundaries.
     */
    constructor(boundary = false) {
        super();
        this.boundary = boundary;
    }
}

/**
 * Maps positions with the reference `RangeSet.map` implementation.
 *
 * `RangeSet.map` drops a whole chunk when one change covers the chunk. The
 * boundary markers keep the reference chunk at the document extents, so no
 * change can cover it and the set maps every marker through `mapPos`, the way
 * the field does.
 *
 * @param changes The changes to map through.
 * @param positions The start-document positions.
 *
 * @returns The mapped positions, in ascending order.
 */
function referenceMap(changes: ChangeSet, positions: readonly number[]): number[] {
    const ranges = positions.map((pos) => new ReferenceMarker().range(pos));
    ranges.push(new ReferenceMarker(true).range(0), new ReferenceMarker(true).range(changes.length));
    const set = RangeSet.of(ranges, true);
    const mapped: number[] = [];
    set.map(changes).between(0, changes.newLength, (from, to, value) => {
        if (!value.boundary) {
            mapped.push(from);
        }
    });
    return mapped;
}

/**
 * Compares the linear mapping with the reference mapping for one change set.
 *
 * @param length The start-document length.
 * @param positions The sorted start-document positions.
 * @param specs The change specifications.
 */
function expectEquivalent(
    length: number,
    positions: readonly number[],
    specs: readonly ChangeSpec[],
): void {
    const changes = ChangeSet.of(specs, length);
    expect(mapPositions(changes, positions)).toEqual(referenceMap(changes, positions));
}

test('maps positions like RangeSet.map at change boundaries', () => {
    const positions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const cases: { length: number; specs: ChangeSpec[] }[] = [
        { length: 10, specs: [] },
        { length: 10, specs: [{ from: 0, insert: 'ab' }] },
        { length: 10, specs: [{ from: 5, insert: 'ab' }] },
        { length: 10, specs: [{ from: 10, insert: 'ab' }] },
        { length: 10, specs: [{ from: 0, to: 3 }] },
        { length: 10, specs: [{ from: 4, to: 6 }] },
        { length: 10, specs: [{ from: 7, to: 10 }] },
        { length: 10, specs: [{ from: 7, to: 10, insert: 'xyz' }] },
        { length: 10, specs: [{ from: 0, to: 10, insert: 'x' }] },
        { length: 10, specs: [{ from: 0, to: 10 }] },
        // Adjacent changed sections: a replacement followed by an insertion,
        // and an insertion followed by a replacement.
        { length: 10, specs: [{ from: 2, to: 6, insert: 'ab' }, { from: 6, insert: 'cd' }] },
        { length: 10, specs: [{ from: 2, insert: 'ab' }, { from: 2, to: 6, insert: 'cd' }] },
        { length: 10, specs: [{ from: 0, insert: 'ab' }, { from: 0, to: 4 }] },
        // Multiple ranges and a change at the document end.
        {
            length: 10,
            specs: [
                { from: 0, to: 1, insert: 'aa' },
                { from: 3, to: 4, insert: '' },
                { from: 6, to: 8, insert: 'xyz' },
                { from: 10, insert: '!' },
            ],
        },
    ];
    cases.forEach(({ length, specs }) => {
        expectEquivalent(length, positions, specs);
    });
});

test('maps positions like RangeSet.map through line breaks', () => {
    const doc = 'aa\nbb\ncc\ndd';
    const { length } = doc;
    // Every line start and every offset in the document.
    const positions = Array.from({ length: length + 1 }, (_, index) => index);
    const specs: ChangeSpec[][] = [
        [{ from: 2, to: 3 }],
        [{ from: 5, to: 6, insert: 'x' }],
        [{ from: 2, to: 8, insert: 'merged' }],
        [{ from: 0, to: 3, insert: 'first' }],
        [{ from: 9, to: length, insert: 'last' }],
        [{ from: 1, to: 4, insert: 'a\nb' }],
        [{ from: 3, insert: '\n' }],
        [{ from: 2, to: 3 }, { from: 5, to: 6 }, { from: 8, to: 9 }],
    ];
    specs.forEach((changeSpecs) => {
        expectEquivalent(length, positions, changeSpecs);
    });
});

test('maps positions like RangeSet.map on an empty document', () => {
    expectEquivalent(0, [0], []);
    expectEquivalent(0, [0], [{ from: 0, insert: 'text' }]);
    expectEquivalent(0, [0], [{ from: 0, insert: '\n\n' }]);
});

test('maps positions like RangeSet.map for randomized change sets', () => {
    let seed = 0x61517;
    const random = (): number => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0x100000000;
    };
    const randomInt = (max: number): number => Math.floor(random() * (max + 1));
    const alphabet = 'abc\n';

    for (let round = 0; round < 200; round += 1) {
        const length = randomInt(80);
        const positions = Array.from({ length: randomInt(20) + 1 }, () => randomInt(length))
            .sort((a, b) => a - b);
        const specs: ChangeSpec[] = [];
        let pos = 0;
        const changeCount = randomInt(8) + 1;
        for (let index = 0; index < changeCount && pos <= length; index += 1) {
            const from = Math.min(length, pos + randomInt(5));
            const isInsertion = random() < 0.3;
            const to = isInsertion ? from : Math.min(length, from + randomInt(6));
            const insert = Array.from(
                { length: randomInt(4) },
                () => alphabet[randomInt(alphabet.length - 1)],
            ).join('');
            if (from !== to || insert.length > 0) {
                specs.push({ from, to, insert });
            }
            pos = to === from ? from + 1 : to;
        }
        expectEquivalent(length, positions, specs);
    }
});

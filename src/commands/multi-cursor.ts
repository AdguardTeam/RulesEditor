import { EditorSelection, type EditorState, type SelectionRange } from '@codemirror/state';
import { type EditorView } from '@codemirror/view';

/**
 * Characters treated as part of a word by the select-more commands. `-` and
 * `.` are included so that whole domains (`example.com`) are selected as a
 * single word in adblock rules. Letters and digits are matched with Unicode
 * property escapes, so non-ASCII domains (`пример.рф`) work as well.
 */
const WORD_CHAR = /[\p{L}\p{N}_.-]/u;

/**
 * Finds the word around a position.
 *
 * @param state The editor state.
 * @param pos The position to inspect.
 *
 * @returns The word range, or `null` when the position is not on a word character.
 */
function wordRangeAt(state: EditorState, pos: number): SelectionRange | null {
    const line = state.doc.lineAt(pos);
    let from = pos;
    let to = pos;
    while (from > line.from && WORD_CHAR.test(state.doc.sliceString(from - 1, from))) {
        from -= 1;
    }
    while (to < line.to && WORD_CHAR.test(state.doc.sliceString(to, to + 1))) {
        to += 1;
    }
    return from === to ? null : EditorSelection.range(from, to);
}

/**
 * Dispatches a selection, letting CodeMirror sort and merge the ranges while
 * tracking which range must become the main one.
 *
 * @param view The editor view.
 * @param ranges The ranges to apply.
 * @param main The range that becomes the main one.
 */
function applySelection(view: EditorView, ranges: readonly SelectionRange[], main: SelectionRange): void {
    const mainIndex = ranges.indexOf(main);
    view.dispatch({
        selection: EditorSelection.create(ranges.slice(), mainIndex < 0 ? 0 : mainIndex),
        scrollIntoView: true,
    });
}

/**
 * Moves the main range one line up or down while keeping its column, and adds
 * the moved range to the selection. With `skipCurrent` the cursor is moved
 * instead of added, mirroring Ace's `addCursorAbove`/`addCursorBelow`.
 *
 * @param view The editor view.
 * @param direction `-1` for the line above, `1` for the line below.
 * @param skipCurrent Whether to move the last cursor instead of adding one.
 *
 * @returns `true` when the key event was handled.
 */
function addCursorVertically(view: EditorView, direction: -1 | 1, skipCurrent: boolean): boolean {
    const { state } = view;
    const { selection } = state;
    const { main } = selection;
    const line = state.doc.lineAt(main.head);
    const column = main.goalColumn ?? main.head - line.from;
    const targetNumber = line.number + direction;
    if (targetNumber < 1 || targetNumber > state.doc.lines) {
        return false;
    }

    const target = state.doc.line(targetNumber);
    const head = target.from + Math.min(column, target.length);
    let anchor = head;
    if (!main.empty) {
        const anchorLine = state.doc.lineAt(main.anchor);
        const anchorNumber = Math.min(Math.max(anchorLine.number + direction, 1), state.doc.lines);
        const anchorTarget = state.doc.line(anchorNumber);
        anchor = anchorTarget.from + Math.min(main.anchor - anchorLine.from, anchorTarget.length);
    }

    const moved = EditorSelection.range(anchor, head, column);
    const ranges = selection.ranges.slice();
    if (skipCurrent && ranges.length > 1) {
        ranges[selection.mainIndex] = moved;
    } else {
        ranges.push(moved);
    }
    applySelection(view, ranges, moved);
    return true;
}

/**
 * Finds the next or previous occurrence of `needle` that is not covered by the
 * current ranges, wrapping around the document.
 *
 * @param state The editor state.
 * @param ranges The ranges that are already selected.
 * @param needle The text to search for.
 * @param direction `1` to search forward, `-1` to search backward.
 * @param anchor The range the search starts from.
 *
 * @returns The occurrence range, or `null` when there is none.
 */
function findOccurrence(
    state: EditorState,
    ranges: readonly SelectionRange[],
    needle: string,
    direction: -1 | 1,
    anchor: SelectionRange,
): SelectionRange | null {
    const text = state.doc.toString();
    const free: number[] = [];
    for (let pos = text.indexOf(needle); pos >= 0; pos = text.indexOf(needle, pos + 1)) {
        const overlaps = ranges.some((range) => pos < range.to && pos + needle.length > range.from);
        if (!overlaps) {
            free.push(pos);
        }
    }
    if (free.length === 0) {
        return null;
    }

    // For backward searches the matches are visited from the end of the
    // document, so the first free match is also the wrap-around target.
    const ordered = direction === 1 ? free : free.slice().reverse();
    const reference = direction === 1 ? anchor.to : anchor.from;
    const next = ordered.find((pos) => (direction === 1 ? pos >= reference : pos + needle.length <= reference));
    const chosen = next ?? ordered[0]!;
    return EditorSelection.range(chosen, chosen + needle.length);
}

/**
 * Selects the next or previous occurrence of the current selection and adds it
 * to the selection. When the main range is empty, the word under the cursor is
 * selected first, as Ace's `selectMore` does. With `skipCurrent` the main range
 * is moved to the occurrence instead of adding one.
 *
 * @param view The editor view.
 * @param direction `1` to search forward, `-1` to search backward.
 * @param skipCurrent Whether to move the main range instead of adding one.
 *
 * @returns `true` when the key event was handled.
 */
function selectOccurrence(view: EditorView, direction: -1 | 1, skipCurrent: boolean): boolean {
    const { state } = view;
    const { selection } = state;
    const ranges = selection.ranges.slice();
    let { mainIndex } = selection;
    let { main } = selection;

    if (main.empty) {
        const word = wordRangeAt(state, main.head);
        if (word === null) {
            return false;
        }
        ranges[mainIndex] = word;
        main = word;
    }

    const needle = state.sliceDoc(main.from, main.to);
    const found = findOccurrence(state, ranges, needle, direction, main);
    if (found === null) {
        if (ranges[mainIndex] !== selection.main) {
            // The word selection is still worth applying even without a match.
            applySelection(view, ranges, main);
        }
        return true;
    }

    if (skipCurrent) {
        ranges[mainIndex] = found;
    } else {
        ranges.push(found);
        mainIndex = ranges.length - 1;
    }
    main = found;
    applySelection(view, ranges, main);
    return true;
}

/**
 * Adds a cursor one line above the main cursor, keeping the column
 * (Ace `addCursorAbove`, `Ctrl+Alt+Up`).
 *
 * @param view The editor view.
 *
 * @returns `true` when the key event was handled.
 */
export function addCursorAbove(view: EditorView): boolean {
    return addCursorVertically(view, -1, false);
}

/**
 * Adds a cursor one line below the main cursor, keeping the column
 * (Ace `addCursorBelow`, `Ctrl+Alt+Down`).
 *
 * @param view The editor view.
 *
 * @returns `true` when the key event was handled.
 */
export function addCursorBelow(view: EditorView): boolean {
    return addCursorVertically(view, 1, false);
}

/**
 * Moves the last cursor one line up instead of adding one
 * (Ace `addCursorAboveSkipCurrent`, `Ctrl+Alt+Shift+Up`).
 *
 * @param view The editor view.
 *
 * @returns `true` when the key event was handled.
 */
export function addCursorAboveSkipCurrent(view: EditorView): boolean {
    return addCursorVertically(view, -1, true);
}

/**
 * Moves the last cursor one line down instead of adding one
 * (Ace `addCursorBelowSkipCurrent`, `Ctrl+Alt+Shift+Down`).
 *
 * @param view The editor view.
 *
 * @returns `true` when the key event was handled.
 */
export function addCursorBelowSkipCurrent(view: EditorView): boolean {
    return addCursorVertically(view, 1, true);
}

/**
 * Adds the previous occurrence of the selection
 * (Ace `selectMoreBefore`, `Ctrl+Alt+Left`).
 *
 * @param view The editor view.
 *
 * @returns `true` when the key event was handled.
 */
export function selectMoreBefore(view: EditorView): boolean {
    return selectOccurrence(view, -1, false);
}

/**
 * Adds the next occurrence of the selection
 * (Ace `selectMoreAfter`, `Ctrl+Alt+Right`).
 *
 * @param view The editor view.
 *
 * @returns `true` when the key event was handled.
 */
export function selectMoreAfter(view: EditorView): boolean {
    return selectOccurrence(view, 1, false);
}

/**
 * Moves the main range to the previous occurrence instead of adding one
 * (Ace `selectNextBefore`, `Ctrl+Alt+Shift+Left`).
 *
 * @param view The editor view.
 *
 * @returns `true` when the key event was handled.
 */
export function selectNextBefore(view: EditorView): boolean {
    return selectOccurrence(view, -1, true);
}

/**
 * Moves the main range to the next occurrence instead of adding one
 * (Ace `selectNextAfter`, `Ctrl+Alt+Shift+Right`).
 *
 * @param view The editor view.
 *
 * @returns `true` when the key event was handled.
 */
export function selectNextAfter(view: EditorView): boolean {
    return selectOccurrence(view, 1, true);
}

/**
 * Collapses the selection to its main range (Ace `singleSelection`, `Esc`).
 *
 * @param view The editor view.
 *
 * @returns `true` when there was more than one range to collapse.
 */
export function singleSelection(view: EditorView): boolean {
    const { selection } = view.state;
    if (selection.ranges.length < 2) {
        return false;
    }
    view.dispatch({ selection: EditorSelection.create([selection.main], 0) });
    return true;
}

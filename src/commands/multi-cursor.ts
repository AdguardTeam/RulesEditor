import { EditorSelection } from '@codemirror/state';
import type { EditorState, SelectionRange, Text } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/**
 * Characters treated as part of a word by the select-more commands. `-` and
 * `.` are included so that whole domains (`example.com`) are selected as a
 * single word in adblock rules. Letters, digits and combining marks are
 * matched with Unicode property escapes, so non-ASCII domains (`пример.рф`) and
 * decomposed text (`e` + `\u0301`) work as well.
 */
const WORD_CHAR = /[\p{L}\p{M}\p{N}_.-]/u;

/**
 * Number of characters read per window of a backward occurrence scan.
 */
const BACKWARD_WINDOW = 4096;

/**
 * Finds the word around a position. The position itself does not have to be on
 * a word character — the search expands to the word on either side, so a cursor
 * on the `^` of `||example.com^` selects `example.com`.
 *
 * @param state The editor state.
 * @param pos The position to inspect.
 *
 * @returns The word range, or `null` when there is no word character on either
 *   side of the position.
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
 * the moved range to the selection. With `skipCurrent` the cursor that was
 * added last is moved instead of adding a new one. On the first press there is
 * no added cursor to move yet, so a cursor is added — exactly like Ace's
 * `selectMoreLines`, which only skips the current range when the editor is
 * already in multi-select mode.
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
 * Whether a candidate match is already covered by one of the ranges.
 *
 * @param ranges The ranges that are already selected.
 * @param from The start of the candidate match.
 * @param to The end of the candidate match.
 *
 * @returns `true` when the candidate overlaps a range.
 */
function isSelected(ranges: readonly SelectionRange[], from: number, to: number): boolean {
    return ranges.some((range) => from < range.to && to > range.from);
}

/**
 * Finds the first occurrence of `needle` at or after `from` that is not covered
 * by `ranges`. The scan stops at the first free match.
 *
 * @param text The document text.
 * @param ranges The ranges that are already selected.
 * @param needle The text to search for.
 * @param from The position to start the scan at.
 *
 * @returns The occurrence position, or `null` when there is none.
 */
function nextFreeMatch(
    text: string,
    ranges: readonly SelectionRange[],
    needle: string,
    from: number,
): number | null {
    for (let pos = text.indexOf(needle, from); pos >= 0; pos = text.indexOf(needle, pos + 1)) {
        if (!isSelected(ranges, pos, pos + needle.length)) {
            return pos;
        }
    }
    return null;
}

/**
 * Finds the last occurrence of `needle` that ends at or before `end` and is not
 * covered by `ranges`. The scan moves backwards and stops at the first free
 * match.
 *
 * @param text The document text.
 * @param ranges The ranges that are already selected.
 * @param needle The text to search for.
 * @param end The position the occurrence must end at or before.
 *
 * @returns The occurrence position, or `null` when there is none.
 */
function previousFreeMatch(
    text: string,
    ranges: readonly SelectionRange[],
    needle: string,
    end: number,
): number | null {
    const maxStart = end - needle.length;
    if (maxStart < 0) {
        return null;
    }
    let pos = text.lastIndexOf(needle, maxStart);
    while (pos > 0) {
        if (!isSelected(ranges, pos, pos + needle.length)) {
            return pos;
        }
        pos = text.lastIndexOf(needle, pos - 1);
    }
    // `lastIndexOf` clamps a negative position to 0, so the loop would find a
    // match at index 0 again and again; it is checked once, outside the loop.
    if (pos === 0 && !isSelected(ranges, 0, needle.length)) {
        return 0;
    }
    return null;
}

/**
 * Finds the next or previous occurrence of `needle` that is not covered by the
 * current ranges, wrapping around the document.
 *
 * Only the nearest free occurrence in the search direction and the wrap-around
 * target are needed, so the document is scanned lazily and both scans stop at
 * the first free match instead of collecting every occurrence.
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
    let pos: number | null;
    if (direction === 1) {
        // The wrap-around target is the first free match in the document.
        pos = nextFreeMatch(text, ranges, needle, anchor.to)
            ?? nextFreeMatch(text, ranges, needle, 0);
    } else {
        // The wrap-around target is the last free match in the document.
        pos = previousFreeMatch(text, ranges, needle, anchor.from)
            ?? previousFreeMatch(text, ranges, needle, text.length);
    }
    if (pos === null) {
        return null;
    }
    return EditorSelection.range(pos, pos + needle.length);
}

/**
 * Selects the next or previous occurrence of the current selection and adds it
 * to the selection. When the main range is empty, the word under the cursor is
 * selected first, as Ace's `selectMore` does. With `skipCurrent` the main range
 * is moved to the occurrence instead of adding one; unlike the line commands
 * this also holds for a single range, because Ace drops the range it started
 * from after adding the occurrence.
 *
 * @param view The editor view.
 * @param direction `1` to search forward, `-1` to search backward.
 * @param skipCurrent Whether to move the main range instead of adding one.
 *
 * @returns `true` when the command applied. That does not mean the selection
 *   changed: with every occurrence already selected there is nothing to add, so
 *   the selection is left as it is and the event is still consumed. `false` is
 *   returned only when the main range is empty and there is no word next to it
 *   to select, leaving the key event to the browser.
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
            applySelection(view, ranges, mainIndex);
        }
        return true;
    }

    if (skipCurrent) {
        ranges[mainIndex] = found;
    } else {
        ranges.push(found);
        mainIndex = ranges.length - 1;
    }
    applySelection(view, ranges, mainIndex);
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
 * (Ace `addCursorAboveSkipCurrent`, `Ctrl+Alt+Shift+Up`). With a single cursor
 * the first press adds one, as in Ace.
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
 * (Ace `addCursorBelowSkipCurrent`, `Ctrl+Alt+Shift+Down`). With a single
 * cursor the first press adds one, as in Ace.
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
 * @returns `true` unless the empty cursor has no word to select. The selection
 *   is left untouched when every occurrence is already selected.
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
 * @returns `true` unless the empty cursor has no word to select. The selection
 *   is left untouched when every occurrence is already selected.
 */
export function selectMoreAfter(view: EditorView): boolean {
    return selectOccurrence(view, 1, false);
}

/**
 * Moves the main range to the previous occurrence instead of adding one
 * (Ace `selectNextBefore`, `Ctrl+Alt+Shift+Left`). A single range is replaced
 * too, as in Ace.
 *
 * @param view The editor view.
 *
 * @returns `true` unless the empty cursor has no word to select. The selection
 *   is left untouched when every occurrence is already selected.
 */
export function selectNextBefore(view: EditorView): boolean {
    return selectOccurrence(view, -1, true);
}

/**
 * Moves the main range to the next occurrence instead of adding one
 * (Ace `selectNextAfter`, `Ctrl+Alt+Shift+Right`). A single range is replaced
 * too, as in Ace.
 *
 * @param view The editor view.
 *
 * @returns `true` unless the empty cursor has no word to select. The selection
 *   is left untouched when every occurrence is already selected.
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

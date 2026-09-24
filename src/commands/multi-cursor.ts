import { EditorSelection, findClusterBreak } from '@codemirror/state';
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
 * Minimum number of characters read per window of an occurrence scan. A window
 * is never smaller than the needle, so the overlap kept between windows cannot
 * dominate the scan.
 */
const SCAN_WINDOW = 4096;

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
    const offset = pos - line.from;
    const { text } = line;
    let from = offset;
    let to = offset;
    // The line is already at hand, so the scan indexes into it instead of
    // slicing one character at a time out of the document.
    while (from > 0 && WORD_CHAR.test(text[from - 1])) {
        from -= 1;
    }
    while (to < text.length && WORD_CHAR.test(text[to])) {
        to += 1;
    }
    return from === to ? null : EditorSelection.range(line.from + from, line.from + to);
}

/**
 * Whether `pos` sits on a grapheme cluster boundary in `text`.
 *
 * @param text The line text.
 * @param pos The position to test, counted in UTF-16 code units.
 *
 * @returns `true` when `pos` is the start or the end of the line, or the end
 *   of the cluster that precedes it.
 */
function isClusterBoundary(text: string, pos: number): boolean {
    if (pos === 0) {
        return true;
    }
    // `findClusterBreak` with `forward: false` returns the last cluster break
    // strictly before `pos`; the position is a boundary when that break is
    // followed immediately by `pos`.
    const previous = findClusterBreak(text, pos, false);
    return findClusterBreak(text, previous, true) === pos;
}

/**
 * Clamps a character column to `text` and moves it out of the middle of a
 * grapheme cluster — a surrogate pair or a base character with its combining
 * marks — so the resulting offset is a valid cluster boundary.
 *
 * @param text The line the column is placed in.
 * @param column The column, counted in UTF-16 code units.
 *
 * @returns A column that can be used as an offset into `text`.
 */
function snapColumn(text: string, column: number): number {
    const clamped = Math.min(Math.max(column, 0), text.length);
    // A column that already sits on a cluster boundary is left alone; one that
    // lands inside a cluster (between the halves of a surrogate pair, or
    // between a base character and its combining marks) moves to the end of
    // the cluster, so typing there cannot split the character.
    return isClusterBoundary(text, clamped)
        ? clamped
        : findClusterBreak(text, clamped);
}

/**
 * Dispatches a selection, letting CodeMirror sort and merge the ranges.
 *
 * @param view The editor view.
 * @param ranges The ranges to apply. The array is handed to the selection, so
 *   the caller must not mutate it afterwards.
 * @param mainIndex The index of the range that becomes the main one.
 */
function applySelection(view: EditorView, ranges: readonly SelectionRange[], mainIndex: number): void {
    view.dispatch({
        selection: EditorSelection.create(ranges, mainIndex),
        scrollIntoView: true,
    });
}

/**
 * Moves the main range one line up or down while keeping its column, and adds
 * the moved range to the selection. A range that spans several lines is moved
 * instead (see below). With `skipCurrent` the cursor that was added last is
 * moved instead of adding a new one. On the first press there is no added cursor
 * to move yet, so a cursor is added — exactly like Ace's `selectMoreLines`,
 * which only skips the current range when the editor is already in multi-select
 * mode.
 *
 * A range that spans several lines is moved instead of copied: its shifted copy
 * overlaps the original, and CodeMirror merges overlapping ranges into one
 * longer selection, which grew the range and made the reverse move a no-op.
 * Replacing the main range with the moved one keeps the range at the same
 * columns on the shifted lines and leaves nothing to merge — the same thing Ace
 * does on the first press, where two colliding ranges are dropped in favour of
 * the moved one. Unlike Ace, which merges again from the second press on, every
 * press here moves the range by exactly one line.
 *
 * A move that would take either end out of the document declines instead of
 * clamping it: a clamped anchor landed somewhere else on the first (or last)
 * line, where it either merged into the range, extended it to the document
 * start, or left a stray extra range.
 *
 * The column is taken from the caret itself. CodeMirror's `goalColumn` is a
 * pixel x-offset rather than a column, so it is never interpreted here; when
 * the caret carries one it is only passed on to the moved range, keeping the
 * goal column CodeMirror set for later vertical motion.
 *
 * @param view The editor view.
 * @param direction `-1` for the line above, `1` for the line below.
 * @param skipCurrent Whether to move the last cursor instead of adding one.
 *
 * @returns `true` when the move was applied, `false` when an end would leave the
 *   document. A decline is not a hard stop for the chord: the keymap moves on to
 *   the next binding for the same key, which is `defaultKeymap`'s
 *   `Mod-Alt-ArrowUp` / `Mod-Alt-ArrowDown` — CodeMirror's own add-cursor
 *   commands, so a multi-line range that cannot be moved can still gain one of
 *   its bare cursors. The chord is still swallowed at the DOM level by the
 *   binding's `preventDefault`, so the browser never sees it.
 */
function addCursorVertically(view: EditorView, direction: -1 | 1, skipCurrent: boolean): boolean {
    const { state } = view;
    const { selection } = state;
    const { main } = selection;
    const line = state.doc.lineAt(main.head);
    const anchorLine = state.doc.lineAt(main.anchor);
    const headNumber = line.number + direction;
    const anchorNumber = anchorLine.number + direction;
    // Both ends have to stay inside the document: a clamped anchor would land
    // somewhere else on the first (or last) line and either merge into the
    // range, extend it to the document start, or leave a stray extra range.
    if (headNumber < 1 || headNumber > state.doc.lines
        || anchorNumber < 1 || anchorNumber > state.doc.lines) {
        return false;
    }

    const target = state.doc.line(headNumber);
    const head = target.from + snapColumn(target.text, main.head - line.from);
    let anchor = head;
    if (!main.empty) {
        const anchorTarget = state.doc.line(anchorNumber);
        anchor = anchorTarget.from + snapColumn(anchorTarget.text, main.anchor - anchorLine.from);
    }

    const moved = EditorSelection.range(anchor, head, main.goalColumn);
    const ranges = selection.ranges.slice();
    let { mainIndex } = selection;
    const spansLines = anchorLine.number !== line.number;
    if (spansLines || (skipCurrent && ranges.length > 1)) {
        ranges[mainIndex] = moved;
    } else {
        ranges.push(moved);
        mainIndex = ranges.length - 1;
    }
    applySelection(view, ranges, mainIndex);
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
 * Finds the first occurrence of `needle` in `[from, to)` that is not covered by
 * `ranges`.
 *
 * The document is walked chunk by chunk into a window that is never smaller
 * than the needle, so an occurrence that spans a chunk boundary is still found,
 * matching stays exact, and no copy of the document is made. Only the overlap
 * between two windows is carried over, so the scan costs a window per step
 * instead of a copy of the needle. The scan returns as soon as it finds a free
 * occurrence.
 *
 * @param doc The document to scan.
 * @param ranges The ranges that are already selected.
 * @param needle The text to search for.
 * @param from The start of the range to scan.
 * @param to The end of the range to scan.
 *
 * @returns The occurrence position, or `null` when there is none.
 */
function findFirstFreeMatch(
    doc: Text,
    ranges: readonly SelectionRange[],
    needle: string,
    from: number,
    to: number,
): number | null {
    const overlap = needle.length - 1;
    const windowSize = Math.max(SCAN_WINDOW, needle.length);
    let buffer = '';
    let bufferStart = from;
    // Characters read since the last scan. Counting them instead of measuring
    // the buffer keeps a window from being rescanned as soon as the overlap it
    // carries is long enough on its own.
    let pending = 0;

    // Scans the buffered window and keeps only its tail for the next one.
    const scan = (): number | null => {
        for (let pos = buffer.indexOf(needle); pos >= 0; pos = buffer.indexOf(needle, pos + 1)) {
            const start = bufferStart + pos;
            if (!isSelected(ranges, start, start + needle.length)) {
                return start;
            }
        }
        const keep = Math.min(overlap, buffer.length);
        bufferStart += buffer.length - keep;
        buffer = keep > 0 ? buffer.slice(buffer.length - keep) : '';
        pending = 0;
        return null;
    };

    for (const chunk of doc.iterRange(from, to)) {
        buffer += chunk;
        pending += chunk.length;
        if (pending >= windowSize) {
            const found = scan();
            if (found !== null) {
                return found;
            }
        }
    }
    return scan();
}

/**
 * Finds the last occurrence of `needle` in `[0, end)` that is not covered by
 * `ranges`.
 *
 * `Text` cannot be iterated backwards, so instead of copying the whole document
 * the scan reads it in windows, walking from the search position towards the
 * start of the document and stopping at the first free occurrence. Every window
 * reaches `needle.length - 1` characters into the previous one, so an
 * occurrence that spans a window boundary is still complete, and it is never
 * smaller than the needle, so the overlap cannot dominate the walk.
 *
 * @param doc The document to scan.
 * @param ranges The ranges that are already selected.
 * @param needle The text to search for.
 * @param end The position the occurrence must end at or before.
 *
 * @returns The occurrence position, or `null` when there is none.
 */
function findLastFreeMatch(
    doc: Text,
    ranges: readonly SelectionRange[],
    needle: string,
    end: number,
): number | null {
    const overlap = needle.length - 1;
    const windowSize = Math.max(SCAN_WINDOW, needle.length);
    let windowEnd = end;

    while (windowEnd > 0) {
        const windowStart = Math.max(0, windowEnd - windowSize);
        const sliceStart = Math.max(0, windowStart - overlap);
        const text = doc.sliceString(sliceStart, windowEnd);

        let pos = text.lastIndexOf(needle);
        while (pos >= 0) {
            const start = sliceStart + pos;
            if (!isSelected(ranges, start, start + needle.length)) {
                return start;
            }
            // `lastIndexOf` clamps a negative position to 0, so the scan has to
            // stop explicitly instead of stepping past the first occurrence.
            if (pos === 0) {
                break;
            }
            pos = text.lastIndexOf(needle, pos - 1);
        }

        if (windowStart === 0) {
            return null;
        }
        windowEnd = windowStart;
    }
    return null;
}

/**
 * Finds the next or previous occurrence of `needle` that is not covered by the
 * current ranges, wrapping around the document.
 *
 * Only the nearest free occurrence in the search direction and the wrap-around
 * target are needed, so the document is scanned lazily and both scans stop at
 * the first free occurrence instead of collecting every one.
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
    const { doc } = state;
    let pos: number | null;
    if (direction === 1) {
        // The wrap-around target is the first free occurrence in the document.
        pos = findFirstFreeMatch(doc, ranges, needle, anchor.to, doc.length)
            ?? findFirstFreeMatch(doc, ranges, needle, 0, anchor.to);
    } else {
        // The wrap-around target is the last free occurrence in the document.
        pos = findLastFreeMatch(doc, ranges, needle, anchor.from)
            ?? findLastFreeMatch(doc, ranges, needle, doc.length);
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
 *   to select; the keymap then moves on to the next binding for the same key,
 *   which `defaultKeymap` does not define for these chords.
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

    // `sliceDoc` joins lines with `state.lineBreak`, while both scans read the
    // document through `iterRange` / `sliceString`, which always use `\n`; a
    // needle taken from the document itself keeps the two sides consistent.
    const needle = state.doc.sliceString(main.from, main.to);
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
 * @returns `true` when the cursor was added (or the main range moved), `false`
 *   when the move would leave the document.
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
 * @returns `true` when the cursor was added (or the main range moved), `false`
 *   when the move would leave the document.
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
 * @returns `true` when a cursor was added or the last one moved, `false` when
 *   the move would leave the document.
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
 * @returns `true` when a cursor was added or the last one moved, `false` when
 *   the move would leave the document.
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
 * @returns `true` when there was more than one range to collapse. `false`
 *   leaves the key event to the browser: the `Escape` binding deliberately does
 *   not set `preventDefault`, so the browser default (closing a dialog or a
 *   popover, leaving fullscreen) is not suppressed for a keypress the editor has
 *   no use for.
 */
export function singleSelection(view: EditorView): boolean {
    const { selection } = view.state;
    if (selection.ranges.length < 2) {
        return false;
    }
    view.dispatch({ selection: EditorSelection.create([selection.main], 0) });
    return true;
}

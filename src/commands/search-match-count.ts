import { getSearchQuery, searchPanelOpen, type SearchQuery } from '@codemirror/search';
import type { EditorState, Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

/**
 * Maximum number of matches counted. Above it the status shows the limit with
 * a `+`, so a short query on a huge rule list does not collect an unbounded
 * number of positions.
 */
const MAX_COUNTED_MATCHES = 10000;

/**
 * Delay before recounting after a query or document change, so typing and
 * rapid edits do not scan the whole document on every update.
 */
const RECOUNT_DELAY_MS = 100;

/**
 * Class of the status element added to the search panel.
 */
const COUNT_CLASS = 'cm-search-count';

/**
 * Phrase shown when a non-empty valid query has no match. Translatable
 * through `EditorState.phrases`.
 */
const NO_RESULTS_PHRASE = 'No results';

/**
 * Phrase for the match position: `$1` is the 1-based number of the selected
 * match (`?` when the selection is not on a match) and `$2` is the number of
 * matches. Translatable through `EditorState.phrases`.
 */
const POSITION_PHRASE = '$1 of $2';

/**
 * Placeholder for the position when the selection is not on a match.
 */
const UNKNOWN_POSITION = '?';

/**
 * Matches of the current query in the whole document.
 */
interface MatchList {
    /**
     * Start and end offsets of the counted matches, in document order.
     */
    ranges: { from: number; to: number }[];

    /**
     * Whether counting stopped at {@link MAX_COUNTED_MATCHES}.
     */
    truncated: boolean;
}

/**
 * Collects the matches of a query in the whole document, not only in the
 * rendered lines, up to {@link MAX_COUNTED_MATCHES}.
 *
 * @param state The editor state.
 * @param query The search query.
 *
 * @returns The matches, or `null` when the query is empty or invalid.
 */
function collectMatches(state: EditorState, query: SearchQuery): MatchList | null {
    if (!query.valid) {
        return null;
    }

    const ranges: { from: number; to: number }[] = [];
    const cursor = query.getCursor(state);
    for (let next = cursor.next(); !next.done; next = cursor.next()) {
        if (ranges.length === MAX_COUNTED_MATCHES) {
            return { ranges, truncated: true };
        }
        ranges.push(next.value);
    }

    return { ranges, truncated: false };
}

/**
 * Finds the 1-based number of the match the main selection covers or
 * overlaps, as after a find-next jump. Find next and find previous select an
 * overlapping occurrence when one exists, while the counting cursor skips it,
 * so a selection that is itself a match gets the number of the counted match
 * it overlaps. A selection that merely touches a match stays unnumbered.
 *
 * @param matches The counted matches.
 * @param state The editor state.
 * @param query The search query, used to tell whether the selection is a
 *   match itself.
 *
 * @returns The match number, or `null` when the selection is not a match.
 */
function selectedMatchNumber(
    matches: MatchList,
    state: EditorState,
    query: SearchQuery,
): number | null {
    const { from, to } = state.selection.main;
    const { ranges } = matches;

    // The ranges are sorted by start, so a binary search finds the last range
    // starting at or before the selection start: a match that Find next
    // selects starts there, and one that Find previous selects overlaps a
    // range that starts at or before it.
    let low = 0;
    let high = ranges.length - 1;
    let candidate = -1;
    while (low <= high) {
        const middle = (low + high) >> 1;
        if (ranges[middle].from <= from) {
            candidate = middle;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }
    if (candidate < 0) {
        return null;
    }

    const range = ranges[candidate];
    if (range.from === from && range.to === to) {
        return candidate + 1;
    }

    // The candidate starts at or before the selection start, so a selection
    // that begins at or after the candidate end cannot overlap it: it is not
    // a match the counting cursor skipped, and scanning it would only cost
    // time on every selection change.
    if (range.to <= from) {
        return null;
    }

    // A caret does not cover a match, but a zero-width match is still found
    // by the exact check above. A wider selection gets the number only when
    // it is a match itself that starts inside the counted range. The cursor
    // runs to the end of the line rather than to the selection end, so a
    // regexp that looks past the selection (`$`, a lookahead, a word
    // boundary) still sees the text it matches against.
    const own = query.getCursor(state, from, state.doc.lineAt(to).to).next();
    const isOwnMatch = !own.done && own.value.from === from && own.value.to === to;

    return isOwnMatch ? candidate + 1 : null;
}

/**
 * Builds the status text for the counted matches.
 *
 * @param matches The counted matches, or `null` for an empty or invalid query.
 * @param state The editor state, used for the phrases.
 * @param query The search query, used to number the selected match.
 *
 * @returns The status text; an empty string for an empty or invalid query.
 */
function formatStatus(matches: MatchList | null, state: EditorState, query: SearchQuery): string {
    if (matches === null) {
        return '';
    }
    if (matches.ranges.length === 0) {
        return state.phrase(NO_RESULTS_PHRASE);
    }

    const total = matches.truncated
        ? `${MAX_COUNTED_MATCHES}+`
        : String(matches.ranges.length);
    const position = selectedMatchNumber(matches, state, query);

    return state.phrase(POSITION_PHRASE, position ?? UNKNOWN_POSITION, total);
}

/**
 * Compares the query fields that affect the matches. Unlike `SearchQuery.eq`,
 * this ignores `replace` — typing in the replace field does not change the
 * matches — and includes `literal`, which `eq` skips.
 *
 * @param first The first query.
 * @param second The second query.
 *
 * @returns Whether both queries select the same matches.
 */
function sameMatchQuery(first: SearchQuery, second: SearchQuery): boolean {
    return first.search === second.search
        && first.caseSensitive === second.caseSensitive
        && first.literal === second.literal
        && first.regexp === second.regexp
        && first.wholeWord === second.wholeWord
        && first.test === second.test;
}

/**
 * Keeps the match status of the search panel up to date.
 */
class SearchMatchCountPlugin {
    /**
     * Matches of the last counted query, or `null` for an empty query or a
     * closed panel.
     */
    private matches: MatchList | null = null;

    /**
     * Status element added to the search panel, while the panel is open.
     */
    private element: HTMLElement | null = null;

    /**
     * Pending recount, so typing and rapid edits do not scan the whole
     * document on every update.
     */
    private recountTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Creates the plugin and schedules the count if the panel is already open.
     *
     * @param view The editor view.
     */
    constructor(private readonly view: EditorView) {
        if (searchPanelOpen(view.state)) {
            this.scheduleRecount();
        }
    }

    /**
     * Schedules a recount after a query or document change and refreshes the
     * status after a selection change.
     *
     * @param update The view update.
     */
    public update(update: ViewUpdate): void {
        const isOpen = searchPanelOpen(update.state);
        const wasOpen = searchPanelOpen(update.startState);
        if (!isOpen) {
            if (wasOpen) {
                this.cancelRecount();
                this.matches = null;
                this.element = null;
            }
            return;
        }

        const queryChanged = !sameMatchQuery(
            getSearchQuery(update.state),
            getSearchQuery(update.startState),
        );
        if (!wasOpen || queryChanged || update.docChanged) {
            this.scheduleRecount();
            return;
        }

        if (update.selectionSet) {
            this.scheduleRender();
        }
    }

    /**
     * Removes the status element and cancels a pending recount.
     */
    public destroy(): void {
        this.cancelRecount();
        this.element?.remove();
        this.element = null;
    }

    /**
     * Schedules a recount after a short pause. Changes during the pause
     * restart the timer, so continuous typing scans the document once.
     */
    private scheduleRecount(): void {
        this.cancelRecount();
        this.recountTimer = setTimeout(() => {
            this.recountTimer = null;
            this.matches = collectMatches(this.view.state, getSearchQuery(this.view.state));
            this.scheduleRender();
        }, RECOUNT_DELAY_MS);
    }

    /**
     * Cancels a pending recount.
     */
    private cancelRecount(): void {
        if (this.recountTimer !== null) {
            clearTimeout(this.recountTimer);
            this.recountTimer = null;
        }
    }

    /**
     * Writes the status after the view update, once the panel DOM exists.
     */
    private scheduleRender(): void {
        this.view.requestMeasure({
            key: this,
            read: () => null,
            write: () => this.render(),
        });
    }

    /**
     * Writes the status next to the search field of the panel. The field is
     * found by the markup of the built-in panel
     * (`.cm-panel.cm-search input[name="search"]`), so a custom panel
     * (`search({ createPanel })`) shows the status only when it reuses that
     * markup.
     */
    private render(): void {
        const field = this.view.dom.querySelector<HTMLInputElement>(
            '.cm-panel.cm-search input[name="search"]',
        );
        if (!field) {
            return;
        }

        if (!this.element || !this.element.isConnected) {
            // Plain text, not a live region: the search panel already
            // announces the match when Enter moves the selection, and a live
            // count would announce it twice.
            this.element = document.createElement('span');
            this.element.className = COUNT_CLASS;
            field.after(this.element);
        }

        const text = formatStatus(this.matches, this.view.state, getSearchQuery(this.view.state));
        if (this.element.textContent !== text) {
            this.element.textContent = text;
        }
    }
}

/**
 * Shows the position of the selected match and the number of matches (e.g.
 * `3 of 12`) next to the search field of the search panel. The count covers
 * the whole document, not only the rendered lines, and counting stops at 10000
 * matches: exactly 10000 shows `10000`, more shows `10000+`, and a match
 * selected past the first 10000 shows `?` as its position. `?` also stands for
 * the position when the selection is not a match, including a selection that
 * only covers part of one, and a non-empty valid query without matches shows
 * `No results` (an empty or invalid query leaves the status blank). The texts
 * are translatable through `EditorState.phrases` (`No results`, `$1 of $2`).
 *
 * The status is attached to the search field of the built-in panel markup
 * (`.cm-panel.cm-search input[name="search"]`). A custom panel
 * (`search({ createPanel })`) with its own markup is left unchanged, while one
 * that reuses the built-in markup gets the status.
 *
 * @returns A CodeMirror 6 extension.
 */
export function searchMatchCount(): Extension {
    return [
        ViewPlugin.fromClass(SearchMatchCountPlugin),
        EditorView.baseTheme({
            [`.${COUNT_CLASS}`]: {
                display: 'inline-block',
                minWidth: '5em',
                margin: '0 0.4em',
                fontSize: '90%',
                whiteSpace: 'nowrap',
                verticalAlign: 'middle',
            },
        }),
    ];
}

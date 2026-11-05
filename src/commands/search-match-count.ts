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
 * Class of the status element added to the search panel.
 */
const COUNT_CLASS = 'cm-search-count';

/**
 * Phrase shown when the query has no match. Translatable through
 * `EditorState.phrases`.
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
    if (!query.search || !query.valid) {
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
 * Finds the 1-based number of the match the main selection covers exactly, as
 * after a find-next jump.
 *
 * @param matches The counted matches.
 * @param state The editor state.
 *
 * @returns The match number, or `null` when the selection is not on a counted
 *   match.
 */
function selectedMatchNumber(matches: MatchList, state: EditorState): number | null {
    const { from, to } = state.selection.main;
    const { ranges } = matches;

    // The ranges are sorted by start, so a binary search finds the candidate.
    let low = 0;
    let high = ranges.length - 1;
    while (low <= high) {
        const middle = (low + high) >> 1;
        const range = ranges[middle];
        if (range.from < from) {
            low = middle + 1;
        } else if (range.from > from) {
            high = middle - 1;
        } else {
            return range.to === to ? middle + 1 : null;
        }
    }

    return null;
}

/**
 * Builds the status text for the counted matches.
 *
 * @param matches The counted matches, or `null` for an empty query.
 * @param state The editor state, used for the phrases.
 *
 * @returns The status text; an empty string for an empty query.
 */
function formatStatus(matches: MatchList | null, state: EditorState): string {
    if (matches === null) {
        return '';
    }
    if (matches.ranges.length === 0) {
        return state.phrase(NO_RESULTS_PHRASE);
    }

    const total = matches.truncated
        ? `${MAX_COUNTED_MATCHES}+`
        : String(matches.ranges.length);
    const position = selectedMatchNumber(matches, state);

    return state.phrase(POSITION_PHRASE, position ?? UNKNOWN_POSITION, total);
}

/**
 * Keeps the match status of the built-in search panel up to date.
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
     * Creates the plugin and counts the matches if the panel is already open.
     *
     * @param view The editor view.
     */
    constructor(private readonly view: EditorView) {
        if (searchPanelOpen(view.state)) {
            this.matches = collectMatches(view.state, getSearchQuery(view.state));
            this.scheduleRender();
        }
    }

    /**
     * Recounts on a query or document change and refreshes the status after a
     * selection change.
     *
     * @param update The view update.
     */
    public update(update: ViewUpdate): void {
        const isOpen = searchPanelOpen(update.state);
        const wasOpen = searchPanelOpen(update.startState);
        if (!isOpen) {
            if (wasOpen) {
                this.matches = null;
                this.element = null;
            }
            return;
        }

        const queryChanged = !getSearchQuery(update.state).eq(getSearchQuery(update.startState));
        if (!wasOpen || queryChanged || update.docChanged) {
            this.matches = collectMatches(update.state, getSearchQuery(update.state));
        } else if (!update.selectionSet) {
            return;
        }

        this.scheduleRender();
    }

    /**
     * Removes the status element.
     */
    public destroy(): void {
        this.element?.remove();
        this.element = null;
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
     * Writes the status next to the search field of the built-in panel. A
     * custom panel (`search({ createPanel })`) has no `cm-search` class, so the
     * status is not shown there.
     */
    private render(): void {
        const field = this.view.dom.querySelector<HTMLInputElement>(
            '.cm-panel.cm-search input[name="search"]',
        );
        if (!field) {
            return;
        }

        if (!this.element || !this.element.isConnected) {
            this.element = document.createElement('span');
            this.element.className = COUNT_CLASS;
            this.element.setAttribute('role', 'status');
            this.element.setAttribute('aria-live', 'polite');
            field.after(this.element);
        }

        this.element.textContent = formatStatus(this.matches, this.view.state);
    }
}

/**
 * Shows the position of the selected match and the number of matches (e.g.
 * `3 of 12`) next to the search field of the built-in search panel. The count
 * covers the whole document, not only the rendered lines. `No results` is
 * shown when the query has no match, `?` stands for the position when the
 * selection is not on a match, and counting stops at 10000 matches (`10000+`).
 * The texts are translatable through `EditorState.phrases` (`No results`,
 * `$1 of $2`).
 *
 * The status is added only to the built-in panel: a custom panel
 * (`search({ createPanel })`) is left unchanged.
 *
 * @returns The extension.
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

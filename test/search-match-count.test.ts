// @vitest-environment jsdom
import {
    closeSearchPanel,
    findNext,
    findPrevious,
    openSearchPanel,
    search,
    SearchQuery,
    setSearchQuery,
} from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import {
    afterEach,
    beforeEach,
    expect,
    test,
    vi,
} from 'vitest';

import { initEditor, type InitEditorConfig } from '../src/init-editor';

import { mountEditor, stubRangeClientRects } from './helpers';

const DOC = '||a.com^\n||b.com^\n! a.com comment\n||c.org^';

const FIVE_MATCHES_DOC = 'a\na\na\na\na';

const OVERLAPPING_DOC = 'example.com###banner';

const ADJACENT_DOC = '||example.com^';

/**
 * Debounce of the plugin before it recounts, mirrored here so a test can
 * check a moment before it elapses.
 */
const RECOUNT_DELAY_MS = 100;

/**
 * Longer than the plugin's recount debounce, so the status has settled.
 */
const RECOUNT_WAIT_MS = RECOUNT_DELAY_MS + 100;

/**
 * Longer than a frame, so a measure scheduled by `view.requestMeasure` runs.
 */
const FRAME_WAIT_MS = 20;

const views: EditorView[] = [];

stubRangeClientRects();

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    views.splice(0).forEach((view) => view.destroy());
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
});

/**
 * Creates an editor with a document, without WASM.
 *
 * @param conf Configuration overrides for `initEditor`.
 * @param doc Initial document.
 *
 * @returns The created editor view.
 */
async function createView(conf: Partial<InitEditorConfig> = {}, doc = DOC): Promise<EditorView> {
    const view = await mountEditor(initEditor, { autofocus: false, ...conf }, undefined, doc);
    views.push(view);
    return view;
}

/**
 * Waits for the debounced recount and the scheduled DOM writes.
 *
 * @param view The editor view.
 *
 * @returns A promise resolved after the status is written.
 */
async function flush(view: EditorView): Promise<void> {
    await vi.advanceTimersByTimeAsync(RECOUNT_WAIT_MS);
    view.requestMeasure();
    await vi.advanceTimersByTimeAsync(FRAME_WAIT_MS);
}

/**
 * Reads the match status of the search panel.
 *
 * @param view The editor view.
 *
 * @returns The status text, or `null` when there is no status element.
 */
function status(view: EditorView): string | null {
    return view.dom.querySelector('.cm-panel.cm-search .cm-search-count')?.textContent ?? null;
}

/**
 * Opens the search panel with a query.
 *
 * @param view The editor view.
 * @param query The query.
 */
function searchFor(view: EditorView, query: string): void {
    openSearchPanel(view);
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: query })) });
}

test('counts the matches in the whole document', async () => {
    const view = await createView();
    searchFor(view, 'a.com');
    await flush(view);

    expect(status(view)).toBe('? of 2');
});

test('shows the position of the selected match after find next', async () => {
    const view = await createView();
    searchFor(view, 'a.com');
    findNext(view);
    await flush(view);
    expect(status(view)).toBe('1 of 2');

    findNext(view);
    await flush(view);
    expect(status(view)).toBe('2 of 2');
});

test('finds a selected match left of the binary search midpoint', async () => {
    const view = await createView({}, FIVE_MATCHES_DOC);
    searchFor(view, 'a');
    findNext(view);
    findNext(view);
    await flush(view);

    expect(status(view)).toBe('2 of 5');
});

test('numbers a selected overlapping match by the counted match it overlaps', async () => {
    const view = await createView({}, OVERLAPPING_DOC);
    searchFor(view, '##');
    await flush(view);
    expect(status(view)).toBe('? of 1');

    findNext(view);
    await flush(view);
    expect(status(view)).toBe('1 of 1');

    findPrevious(view);
    await flush(view);
    expect(status(view)).toBe('1 of 1');
});

test('numbers adjacent one-character matches from the selection start', async () => {
    const view = await createView({}, ADJACENT_DOC);
    searchFor(view, '|');
    await flush(view);
    expect(status(view)).toBe('? of 2');

    findNext(view);
    await flush(view);
    expect(status(view)).toBe('1 of 2');

    findNext(view);
    await flush(view);
    expect(status(view)).toBe('2 of 2');
});

test('numbers adjacent multi-character matches from the selection start', async () => {
    const view = await createView({}, 'aaaa');
    searchFor(view, 'aa');
    await flush(view);
    expect(status(view)).toBe('? of 2');

    findNext(view);
    await flush(view);
    expect(status(view)).toBe('1 of 2');

    findNext(view);
    await flush(view);
    expect(status(view)).toBe('2 of 2');
});

test('shows "?" for a selection that is not a match', async () => {
    const view = await createView();
    searchFor(view, 'a.com');
    findNext(view);
    await flush(view);
    expect(status(view)).toBe('1 of 2');

    // `.co` covers part of the first match only.
    view.dispatch({ selection: { anchor: 3, head: 6 } });
    await flush(view);
    expect(status(view)).toBe('? of 2');

    // Select All covers every match.
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    await flush(view);
    expect(status(view)).toBe('? of 2');
});

test('places the status right after the search field', async () => {
    const view = await createView();
    searchFor(view, 'a.com');
    await flush(view);

    const field = view.dom.querySelector('.cm-panel.cm-search input[name="search"]');
    expect(field?.nextElementSibling?.classList.contains('cm-search-count')).toBe(true);
});

test('does not rewrite the status when the text does not change', async () => {
    const view = await createView();
    searchFor(view, 'a.com');
    await flush(view);

    const element = view.dom.querySelector('.cm-search-count');
    const text = element?.firstChild;

    view.dispatch({ selection: { anchor: view.state.doc.length } });
    await flush(view);

    expect(element?.firstChild).toBe(text);
});

test('shows "No results" for a query without matches and nothing for an empty query', async () => {
    const view = await createView();
    searchFor(view, 'zzz');
    await flush(view);
    expect(status(view)).toBe('No results');

    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '' })) });
    await flush(view);
    expect(status(view)).toBe('');
});

test('shows nothing for an invalid regular expression', async () => {
    const view = await createView();
    openSearchPanel(view);
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '[', regexp: true })) });
    await flush(view);

    expect(status(view)).toBe('');
});

test('recounts after a document change', async () => {
    const view = await createView();
    searchFor(view, 'a.com');
    await flush(view);
    expect(status(view)).toBe('? of 2');

    view.dispatch({ changes: { from: view.state.doc.length, insert: '\n||a.com^$third-party' } });
    await flush(view);
    expect(status(view)).toBe('? of 3');
});

test('counts the matches of a regular expression query', async () => {
    const view = await createView();
    openSearchPanel(view);
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '\\|\\|[a-z]\\.', regexp: true })) });
    await flush(view);

    expect(status(view)).toBe('? of 3');
});

test('caps the count of a very frequent match', async () => {
    const view = await createView({}, 'a'.repeat(10001));
    searchFor(view, 'a');
    await flush(view);

    expect(status(view)).toBe('? of 10000+');
});

test('shows exactly 10000 matches without a plus', async () => {
    const view = await createView({}, 'a'.repeat(10000));
    searchFor(view, 'a');
    await flush(view);

    expect(status(view)).toBe('? of 10000');
});

test('shows "?" for a match selected past the counted limit', async () => {
    const view = await createView({}, 'a'.repeat(10001));
    searchFor(view, 'a');
    await flush(view);

    view.dispatch({ selection: { anchor: 10000, head: 10001 } });
    await flush(view);
    expect(status(view)).toBe('? of 10000+');
});

test('uses translated phrases', async () => {
    const view = await createView({
        extensions: [EditorState.phrases.of({ 'No results': 'Nichts gefunden', '$1 of $2': '$1 von $2' })],
    });
    searchFor(view, 'a.com');
    findNext(view);
    await flush(view);
    expect(status(view)).toBe('1 von 2');

    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'zzz' })) });
    await flush(view);
    expect(status(view)).toBe('Nichts gefunden');
});

test('shows the status again after the panel is closed and reopened', async () => {
    const view = await createView();
    searchFor(view, 'a.com');
    await flush(view);
    closeSearchPanel(view);
    await flush(view);
    expect(status(view)).toBeNull();

    openSearchPanel(view);
    await flush(view);
    expect(status(view)).toBe('? of 2');
});

test('is left out with withSearchMatchCount: false', async () => {
    const view = await createView({ withSearchMatchCount: false });
    searchFor(view, 'a.com');
    await flush(view);

    expect(status(view)).toBeNull();
});

test('shows no status in a custom panel with its own markup', async () => {
    const view = await createView({
        extensions: [search({ createPanel: () => ({ dom: document.createElement('div') }) })],
    });
    searchFor(view, 'a.com');
    await flush(view);

    expect(status(view)).toBeNull();
});

test('shows the status in a custom panel that reuses the built-in markup', async () => {
    const view = await createView({
        extensions: [search({
            createPanel: () => {
                const dom = document.createElement('div');
                dom.className = 'cm-search';
                const field = document.createElement('input');
                field.name = 'search';
                dom.appendChild(field);
                return { dom };
            },
        })],
    });
    searchFor(view, 'a.com');
    await flush(view);

    expect(status(view)).toBe('? of 2');
});

test('recounts for a literal-only change but not for a replace-only change', async () => {
    const getCursor = vi.spyOn(SearchQuery.prototype, 'getCursor');
    const view = await createView();
    searchFor(view, 'a.com');
    await flush(view);
    const counted = getCursor.mock.calls.length;
    expect(counted).toBeGreaterThan(0);

    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'a.com', replace: 'b.com' })) });
    await flush(view);
    expect(getCursor).toHaveBeenCalledTimes(counted);

    view.dispatch({
        effects: setSearchQuery.of(new SearchQuery({ search: 'a.com', replace: 'b.com', literal: true })),
    });
    await flush(view);
    expect(getCursor).toHaveBeenCalledTimes(counted + 1);
});

test('debounces rapid document changes', async () => {
    const getCursor = vi.spyOn(SearchQuery.prototype, 'getCursor');
    const view = await createView();
    searchFor(view, 'a.com');
    await flush(view);
    const counted = getCursor.mock.calls.length;
    expect(counted).toBeGreaterThan(0);

    view.dispatch({ changes: { from: view.state.doc.length, insert: '\n||a.com^' } });
    view.dispatch({ changes: { from: view.state.doc.length, insert: '\n||a.com^' } });

    // Both edits are in the same tick and the debounce has not elapsed, so
    // the document is not scanned again and the status still describes the
    // old count.
    await vi.advanceTimersByTimeAsync(RECOUNT_DELAY_MS - 1);
    expect(getCursor).toHaveBeenCalledTimes(counted);
    expect(status(view)).toBe('? of 2');

    // Past the delay the two edits cost one scan.
    await vi.advanceTimersByTimeAsync(1);
    await flush(view);

    expect(getCursor).toHaveBeenCalledTimes(counted + 1);
    expect(status(view)).toBe('? of 4');
});

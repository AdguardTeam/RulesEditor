// @vitest-environment jsdom
import {
    closeSearchPanel,
    findNext,
    openSearchPanel,
    SearchQuery,
    setSearchQuery,
} from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import {
    afterEach,
    beforeAll,
    expect,
    test,
} from 'vitest';

import { initEditor, type InitEditorConfig } from '../src/init-editor';

const DOC = '||a.com^\n||b.com^\n! a.com comment\n||c.org^';

const views: EditorView[] = [];

beforeAll(() => {
    // jsdom does not implement `Range.getClientRects`, which CodeMirror calls
    // when it scrolls the selection into view.
    if (!Range.prototype.getClientRects) {
        Object.defineProperty(Range.prototype, 'getClientRects', {
            configurable: true,
            value: () => [],
        });
    }
});

afterEach(() => {
    views.splice(0).forEach((view) => view.destroy());
    document.body.innerHTML = '';
});

/**
 * Creates an editor over {@link DOC} without WASM.
 *
 * @param conf Configuration overrides for `initEditor`.
 * @param doc Initial document.
 *
 * @returns The created editor view.
 */
async function createView(conf: Partial<InitEditorConfig> = {}, doc = DOC): Promise<EditorView> {
    const textarea = document.createElement('textarea');
    textarea.value = doc;
    document.body.appendChild(textarea);
    const view = await initEditor(textarea, undefined, {
        hotkeys: { mode: 'windows' },
        highlight: 'none',
        autofocus: false,
        ...conf,
    });
    views.push(view);
    return view;
}

/**
 * Waits for the scheduled DOM writes of the view.
 *
 * @param view The editor view.
 *
 * @returns A promise resolved after the next animation frame.
 */
async function flush(view: EditorView): Promise<void> {
    view.requestMeasure();
    await new Promise((resolve) => { requestAnimationFrame(resolve); });
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

test('places the status right after the search field', async () => {
    const view = await createView();
    searchFor(view, 'a.com');
    await flush(view);

    const field = view.dom.querySelector('.cm-panel.cm-search input[name="search"]');
    expect(field?.nextElementSibling?.classList.contains('cm-search-count')).toBe(true);
    expect(field?.nextElementSibling?.getAttribute('role')).toBe('status');
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

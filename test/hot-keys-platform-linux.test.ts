// @vitest-environment jsdom
import {
    afterEach,
    expect,
    test,
    vi,
} from 'vitest';

import {
    mountEditor,
    pressCtrlShiftK,
    pressKey,
    stubRangeClientRects,
} from './helpers';

// CodeMirror detects the platform from `navigator.platform` once, when
// `@codemirror/view` is first evaluated, and resolves platform-specific key
// bindings (`win:` / `linux:` / `mac:`) against it. jsdom leaves
// `navigator.platform` empty (so only the platform-neutral `key` map
// resolves), therefore this file stubs the Linux platform before the editor
// modules are imported — one platform per test file, since the detected
// platform cannot be changed afterwards. The real `userAgent` / `vendor`
// are kept so the rest of CodeMirror's browser detection behaves exactly
// as in the other jsdom tests.
const { userAgent, vendor } = navigator;
vi.stubGlobal('navigator', { platform: 'Linux x86_64', userAgent, vendor });

afterEach(() => vi.unstubAllGlobals());

// jsdom does not implement `Range.getClientRects`, which CodeMirror calls
// while measuring text.
stubRangeClientRects();

// The modules are loaded only after the platform stub is in place; no
// static import may pull in `@codemirror/*` in this file.
const modulesPromise = Promise.all([
    import('../src/init-editor'),
    import('@codemirror/search'),
]);

test('Ctrl+K and Ctrl+Shift+K find the next and previous match', async () => {
    const [{ initEditor }, { SearchQuery, setSearchQuery }] = await modulesPromise;
    const view = await mountEditor(initEditor);
    view.dispatch({ changes: { from: 0, insert: 'aaa\nbbb\naaa' } });
    // Find next/previous move the cursor through the current query; without
    // a query they open the search panel instead.
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'aaa' })) });
    view.dispatch({ selection: { anchor: 4 } });

    // The previous (Ace) editor bound find next to Ctrl+K on Windows/Linux;
    // the `linux:` binding must resolve like the `win:` one.
    const next = pressKey(view.contentDOM, 'k', { ctrl: true });

    expect(next.defaultPrevented).toBe(true);
    expect(view.state.selection.main.from).toBe(8);

    const prev = pressCtrlShiftK(view);

    expect(prev.defaultPrevented).toBe(true);
    expect(view.state.selection.main.from).toBe(0);
    view.destroy();
});

test('Ctrl+K and Ctrl+Shift+K consume the key when the query has no match', async () => {
    const [{ initEditor }, { SearchQuery, setSearchQuery, searchPanelOpen }] = await modulesPromise;
    const view = await mountEditor(initEditor);
    view.dispatch({ changes: { from: 0, insert: 'aaa\nbbb' } });
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'zzz' })) });
    view.dispatch({ selection: { anchor: 0 } });

    // `findNext` / `findPrevious` return `false` when the query has no
    // match; the bindings must still consume the key, otherwise the keydown
    // falls through to the next binding on the chord — `Ctrl+Shift+K` would
    // hit `Shift-Mod-k` (delete line) from the default keymap.
    const next = pressKey(view.contentDOM, 'k', { ctrl: true });

    expect(next.defaultPrevented).toBe(true);
    expect(searchPanelOpen(view.state)).toBe(false);

    const prev = pressCtrlShiftK(view);

    expect(prev.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe('aaa\nbbb');
    expect(view.state.selection.main.from).toBe(0);
    view.destroy();
});

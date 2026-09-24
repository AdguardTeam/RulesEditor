// @vitest-environment jsdom
import type { EditorView } from '@codemirror/view';
import {
    afterEach,
    expect,
    test,
    vi,
} from 'vitest';

import { mountEditor, pressKey, stubRangeClientRects } from './helpers';

// CodeMirror detects the platform from `navigator.platform` once, when
// `@codemirror/view` is first evaluated, and resolves platform-specific key
// bindings (`win:` / `linux:` / `mac:`) against it. jsdom leaves
// `navigator.platform` empty (so only the platform-neutral `key` map
// resolves), therefore this file stubs the Windows platform before the
// editor modules are imported — one platform per test file, since the
// detected platform cannot be changed afterwards. The real `userAgent` /
// `vendor` are kept so the rest of CodeMirror's browser detection behaves
// exactly as in the other jsdom tests.
const { userAgent, vendor } = navigator;
vi.stubGlobal('navigator', { platform: 'Win32', userAgent, vendor });

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

/**
 * Dispatches a Ctrl+Shift+K keydown event. Real browsers report `K`
 * (uppercase) while Shift is held and CM6 resolves the binding through the
 * `w3c-keyname` tables, which jsdom does not populate (`keyCode` stays 0),
 * so it is stubbed (75 = K) — same technique as the Ctrl+Shift+Z test in
 * `init-editor.test.ts`.
 *
 * @param view The editor view to dispatch the event on.
 *
 * @returns The dispatched event.
 */
const pressCtrlShiftK = (view: EditorView): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
        key: 'K',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
    });
    Object.defineProperty(event, 'keyCode', { get: () => 75 });
    view.contentDOM.dispatchEvent(event);
    return event;
};

test('Ctrl+K and Ctrl+Shift+K find the next and previous match', async () => {
    const [{ initEditor }, { SearchQuery, setSearchQuery }] = await modulesPromise;
    const view = await mountEditor(initEditor);
    view.dispatch({ changes: { from: 0, insert: 'aaa\nbbb\naaa' } });
    // Find next/previous move the cursor through the current query; without
    // a query they open the search panel instead.
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'aaa' })) });
    view.dispatch({ selection: { anchor: 4 } });

    // The previous (Ace) editor bound find next to Ctrl+K on Windows/Linux.
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

test('Ctrl+Alt+ArrowDown does not copy the line', async () => {
    const [{ initEditor }] = await modulesPromise;
    const view = await mountEditor(initEditor);
    view.dispatch({ changes: { from: 0, insert: 'a\nb' } });
    view.dispatch({ selection: { anchor: 0 } });

    // Copy lines stays on `Shift-Alt+Arrow` on Windows/Linux (as in the
    // previous editor); this chord keeps CodeMirror's "add cursor below"
    // default, which only adds a selection range and never copies the line.
    pressKey(view.contentDOM, 'ArrowDown', { ctrl: true, alt: true });

    expect(view.state.doc.toString()).toBe('a\nb');
    view.destroy();
});

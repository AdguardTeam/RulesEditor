// @vitest-environment jsdom
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
// resolves), therefore this file stubs the macOS platform before the editor
// modules are imported — one platform per test file, since the detected
// platform cannot be changed afterwards. The real `userAgent` / `vendor`
// are kept so the rest of CodeMirror's browser detection behaves exactly
// as in the other jsdom tests.
const { userAgent, vendor } = navigator;
vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent, vendor });

afterEach(() => vi.unstubAllGlobals());

// jsdom does not implement `Range.getClientRects`, which CodeMirror calls
// while measuring text.
stubRangeClientRects();

// The module is loaded only after the platform stub is in place; no
// static import may pull in `@codemirror/*` in this file.
const modulePromise = import('../src/init-editor');

test('Ctrl+K deletes to the end of the line', async () => {
    const { initEditor } = await modulePromise;
    const view = await mountEditor(initEditor);
    view.dispatch({ changes: { from: 0, insert: 'hello' } });
    view.dispatch({ selection: { anchor: 2 } });

    // Find next is a Windows/Linux chord; on macOS `Ctrl+K` keeps the
    // CodeMirror default "delete to line end" (Ace's `removetolineend`).
    const event = pressKey(view.contentDOM, 'k', { ctrl: true });

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe('he');
    view.destroy();
});

test('Cmd+Option+ArrowDown copies the current line', async () => {
    const { initEditor } = await modulePromise;
    const view = await mountEditor(initEditor);
    view.dispatch({ changes: { from: 0, insert: 'a\nb' } });
    view.dispatch({ selection: { anchor: 0 } });

    // The previous (Ace) editor copied lines with `Cmd+Option+Arrow` on
    // macOS; the binding supersedes CodeMirror's add-cursor-below default
    // on the same chord.
    const event = pressKey(view.contentDOM, 'ArrowDown', { meta: true, alt: true });

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe('a\na\nb');
    view.destroy();
});

test('Cmd+Option+ArrowUp copies the current line up', async () => {
    const { initEditor } = await modulePromise;
    const view = await mountEditor(initEditor);
    view.dispatch({ changes: { from: 0, insert: 'a\nb' } });
    view.dispatch({ selection: { anchor: 2 } });

    const event = pressKey(view.contentDOM, 'ArrowUp', { meta: true, alt: true });

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe('a\nb\nb');
    view.destroy();
});

// @vitest-environment jsdom
import type { EditorView } from '@codemirror/view';
import {
    afterEach,
    expect,
    test,
    vi,
} from 'vitest';

import type { initEditor, InitEditorConfig } from '../src/init-editor';

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
// while measuring text. An empty rect list makes it fall back to
// line-based movement instead of throwing.
Object.defineProperty(Range.prototype, 'getClientRects', { value: () => [] });

// The modules are loaded only after the platform stub is in place; no
// static import may pull in `@codemirror/*` in this file.
const modulesPromise = Promise.all([
    import('../src/init-editor'),
    import('@codemirror/search'),
]);

type InitEditorFn = typeof initEditor;

/**
 * Mounts an editor without syntax highlighting (no WASM needed).
 *
 * @param initEditorFn The `initEditor` function from `modulesPromise`.
 * @param conf Config overrides merged into the defaults.
 *
 * @returns The mounted editor view. Destroy it when the test is done.
 */
const mountEditor = async (
    initEditorFn: InitEditorFn,
    conf: Omit<Partial<InitEditorConfig>, 'hotkeys'> & {
        hotkeys?: Partial<InitEditorConfig['hotkeys']>;
    } = {},
): Promise<EditorView> => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    return initEditorFn(textarea, undefined, {
        highlight: 'none',
        ...conf,
        hotkeys: { mode: 'windows', ...conf.hotkeys },
    });
};

/**
 * Dispatches a keydown event with modifiers on the editor's content DOM.
 *
 * @param view The editor view to dispatch the event on.
 * @param key The `key` value of the event, e.g. `k` or `ArrowDown`.
 * @param mods Modifier keys held down; all default to `false`.
 * @param mods.ctrl Whether Ctrl is held down.
 * @param mods.meta Whether Cmd (Meta) is held down.
 * @param mods.alt Whether Alt (Option) is held down.
 *
 * @returns The dispatched event.
 */
const pressKey = (
    view: EditorView,
    key: string,
    mods: { ctrl?: boolean; meta?: boolean; alt?: boolean } = {},
): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
        key,
        ctrlKey: mods.ctrl ?? false,
        metaKey: mods.meta ?? false,
        altKey: mods.alt ?? false,
        bubbles: true,
        cancelable: true,
    });
    view.contentDOM.dispatchEvent(event);
    return event;
};

test('Ctrl+K deletes to the end of the line', async () => {
    const [{ initEditor }] = await modulesPromise;
    const view = await mountEditor(initEditor);
    view.dispatch({ changes: { from: 0, insert: 'hello' } });
    view.dispatch({ selection: { anchor: 2 } });

    // Find next is a Windows/Linux chord; on macOS `Ctrl+K` keeps the
    // CodeMirror default "delete to line end" (Ace's `removetolineend`).
    const event = pressKey(view, 'k', { ctrl: true });

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe('he');
    view.destroy();
});

test('Cmd+Option+ArrowDown copies the current line', async () => {
    const [{ initEditor }] = await modulesPromise;
    const view = await mountEditor(initEditor);
    view.dispatch({ changes: { from: 0, insert: 'a\nb' } });
    view.dispatch({ selection: { anchor: 0 } });

    // The previous (Ace) editor copied lines with `Cmd+Option+Arrow` on
    // macOS; the binding supersedes CodeMirror's add-cursor-below default
    // on the same chord.
    const event = pressKey(view, 'ArrowDown', { meta: true, alt: true });

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe('a\na\nb');
    view.destroy();
});

test('Cmd+Option+ArrowUp copies the current line up', async () => {
    const [{ initEditor }] = await modulesPromise;
    const view = await mountEditor(initEditor);
    view.dispatch({ changes: { from: 0, insert: 'a\nb' } });
    view.dispatch({ selection: { anchor: 2 } });

    const event = pressKey(view, 'ArrowUp', { meta: true, alt: true });

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe('a\nb\nb');
    view.destroy();
});

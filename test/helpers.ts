import type { EditorView } from '@codemirror/view';

import type { initEditor, InitEditorConfig } from '../src/init-editor';
import type { WasmSource } from '../src/lib/registry';

// The platform-specific test files import this module before they stub
// `navigator.platform`, and CodeMirror resolves the platform when
// `@codemirror/view` is first evaluated. Every import above is therefore
// type-only (erased at compile time) and must stay that way — a runtime
// import here would load CodeMirror too early and defeat the stub.

type InitEditorFn = typeof initEditor;

/**
 * Mounts an editor with the default test config: no WASM (no highlighting)
 * and the Windows hotkey mode.
 *
 * @param initEditorFn The `initEditor` function — passed in because the
 * platform-specific tests load it dynamically, after the platform stub.
 * @param conf Config overrides merged into the defaults.
 * @param wasmSource Oniguruma WASM source, for tests that need highlighting
 * (requires `highlight: 'full'`).
 *
 * @returns The mounted editor view. Destroy it when the test is done.
 */
export const mountEditor = async (
    initEditorFn: InitEditorFn,
    conf: Omit<Partial<InitEditorConfig>, 'hotkeys'> & {
        hotkeys?: Partial<InitEditorConfig['hotkeys']>;
    } = {},
    wasmSource: WasmSource | undefined = undefined,
): Promise<EditorView> => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    return initEditorFn(textarea, wasmSource, {
        highlight: 'none',
        ...conf,
        hotkeys: { mode: 'windows', ...conf.hotkeys },
    });
};

/**
 * Dispatches a keydown event with modifiers on the given element.
 *
 * @param target Element to dispatch the event on, e.g. the editor content DOM
 * or an input inside the search panel.
 * @param key The `key` value of the event, e.g. `f`, `/`, or `ArrowDown`.
 * @param mods Modifier keys held down; all default to `false`.
 * @param mods.ctrl Whether Ctrl is held down.
 * @param mods.meta Whether Cmd (Meta) is held down.
 * @param mods.alt Whether Alt (Option) is held down.
 * @param mods.shift Whether Shift is held down.
 *
 * @returns The dispatched event.
 */
export const pressKey = (
    target: Element,
    key: string,
    mods: {
        ctrl?: boolean;
        meta?: boolean;
        alt?: boolean;
        shift?: boolean;
    } = {},
): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
        key,
        ctrlKey: mods.ctrl ?? false,
        metaKey: mods.meta ?? false,
        altKey: mods.alt ?? false,
        shiftKey: mods.shift ?? false,
        bubbles: true,
        cancelable: true,
    });
    target.dispatchEvent(event);
    return event;
};

/**
 * Stubs `Range.getClientRects`, which jsdom does not implement. CodeMirror
 * calls it while measuring text; an empty rect list makes the measurement
 * fall back to line-based movement instead of throwing.
 */
export const stubRangeClientRects = (): void => {
    Object.defineProperty(Range.prototype, 'getClientRects', { value: () => [] });
};

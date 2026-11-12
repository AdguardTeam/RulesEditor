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
 * CSS color of the default enabled-rule marker.
 *
 * Copied from the product asset instead of imported from the source, so a
 * change to the source default fails the tests that use it.
 */
export const MARKER_COLOR = 'var(--stroke-icons-product-icon-default, #67B279)';

/**
 * Path data of the default enabled-rule marker icon (a check mark).
 *
 * Copied from the product asset instead of imported from the source, so a
 * change to the default icon fails the tests that use it. The path uses
 * spaces as separators, so joining the chunks restores it byte for byte.
 */
export const MARKER_ICON_PATH = [
    'M13.9888 3.24536C14.4056 3.60773 14.4497 4.23936 14.0873 4.65614L7.13182 12.6561C6.94683',
    '12.8689 6.68062 12.9937 6.39875 12.9998C6.11688 13.0059 5.84553 12.8927 5.65154 12.6881L1.94039',
    '8.77448C1.56037 8.37373 1.57718 7.74079 1.97793 7.36077C2.37868 6.98075 3.01163 6.99756 3.39165',
    '7.39831L6.34505 10.5128L12.578 3.34389C12.9404 2.92711 13.572 2.88299 13.9888 3.24536Z',
].join(' ');

/**
 * Mounts an editor with the default test config: no WASM (no highlighting)
 * and the Windows hotkey mode.
 *
 * @param initEditorFn The `initEditor` function — passed in because the
 * platform-specific tests load it dynamically, after the platform stub.
 * @param conf Config overrides merged into the defaults.
 * @param wasmSource Oniguruma WASM source, for tests that need highlighting
 * (requires `highlight: 'full'`).
 * @param doc Initial document.
 *
 * @returns The mounted editor view. Destroy it when the test is done.
 */
export const mountEditor = async (
    initEditorFn: InitEditorFn,
    conf: Omit<Partial<InitEditorConfig>, 'hotkeys'> & {
        hotkeys?: Partial<InitEditorConfig['hotkeys']>;
    } = {},
    wasmSource: WasmSource | undefined = undefined,
    doc = '',
): Promise<EditorView> => {
    const textarea = document.createElement('textarea');
    textarea.value = doc;
    document.body.appendChild(textarea);
    return initEditorFn(textarea, wasmSource, {
        highlight: 'none',
        ...conf,
        hotkeys: { mode: 'windows', ...conf.hotkeys },
    });
};

/**
 * Returns the visible elements of the enabled-rule gutter.
 *
 * The gutter also holds a hidden spacer element that reserves the marker
 * width. The spacer renders the same factory, so it must not count as a line
 * marker.
 *
 * @param view The editor view.
 *
 * @returns The gutter elements that are not the hidden spacer.
 */
const visibleGutterElements = (view: EditorView): HTMLElement[] => Array
    .from(view.dom.querySelectorAll<HTMLElement>('.cm-breakpoint-gutter .cm-gutterElement'))
    .filter((element) => element.style.visibility !== 'hidden');

/**
 * Returns the marker element of the first marked line in the enabled-rule
 * gutter.
 *
 * @param view The editor view.
 *
 * @returns The marker element, or `null` when no line carries a marker.
 */
export const visibleMarker = (view: EditorView): HTMLElement | null => {
    const [element] = visibleGutterElements(view);
    if (!element) {
        return null;
    }
    return element.firstElementChild as HTMLElement | null;
};

/**
 * Returns the text of the visible elements of the enabled-rule gutter.
 *
 * @param view The editor view.
 *
 * @returns The concatenated text of the visible gutter elements.
 */
export const visibleGutterText = (view: EditorView): string => visibleGutterElements(view)
    .map((element) => element.textContent ?? '')
    .join('');

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
export const pressCtrlShiftK = (view: EditorView): KeyboardEvent => {
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

/**
 * Stubs `Range.getClientRects`, which jsdom does not implement. CodeMirror
 * calls it while measuring text; an empty rect list makes the measurement
 * fall back to line-based movement instead of throwing.
 */
export const stubRangeClientRects = (): void => {
    Object.defineProperty(Range.prototype, 'getClientRects', { value: () => [] });
};

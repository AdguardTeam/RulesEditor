import {
    defaultKeymap,
    history,
    historyKeymap,
    redo,
} from '@codemirror/commands';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { search, searchKeymap } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';

import {
    breakpointState,
    enabledRuleLines,
    isBreakpointAt,
    setMarkerFactory,
    toggleBreakpoint,
} from './commands/breakpoints';
import { configureAceParityKeys, configureHotKeys, createMarker } from './commands/hot-keys';
import { createTextmateLanguage } from './highlight/textmate-language';
import { SCOPE_ADBLOCK } from './lib/constants';
import { WasmLoadError } from './lib/errors';
import { RegistryManager, type WasmSource } from './lib/registry';
import { isCommentLine } from './lib/utils';

export { EditorView };

/**
 * Syntax-highlighting strategy for {@link initEditor}.
 *
 * - `'full'` — TextMate highlighting backed by Oniguruma WASM. Highest
 *   precision; requires a {@link WasmSource}. This is the default.
 * - `'none'` — no syntax highlighting. No WASM.
 */
export type HighlightMode = 'full' | 'none';

/**
 * Configuration for {@link initEditor}.
 */
export interface InitEditorConfig {
    /**
     * Syntax-highlighting strategy. Defaults to `'full'` (WASM-backed
     * TextMate). `'none'` skips WASM entirely. See
     * {@link HighlightMode}.
     */
    highlight?: HighlightMode;

    /**
     * Whether to focus the editor as soon as it is created so that hotkeys
     * (Ctrl+F/Ctrl+H/Ctrl+S, etc.) work immediately. Defaults to `true`.
     * Pass `false` when the host page manages focus itself, e.g. when
     * several editors are mounted on one page.
     */
    autofocus?: boolean;

    /**
     * Enables the enabled-rule gutter.
     */
    withBreakpoints?: boolean;

    /**
     * Called after each document change.
     */
    onChange?: (view: EditorView) => void;

    /**
     * Hotkey configuration.
     */
    hotkeys: {
        /**
         * Has no effect on the resolved bindings: CodeMirror maps `Mod` to
         * `Cmd` on macOS and `Ctrl` elsewhere based on the user's platform
         * automatically. The option is kept for compatibility with existing
         * integrations.
         */
        mode: 'windows' | 'mac';

        /**
         * CSS color for the gutter marker icon.
         */
        markerColor?: string;

        /**
         * Raw HTML for the gutter marker icon.
         */
        markerHTML?: string;

        /**
         * Called when the user toggles a rule's enabled state.
         */
        toggleRule?: (view: EditorView) => void;

        /**
         * Called when the user triggers the save shortcut.
         */
        onSave?: (view: EditorView) => void;
    };

    /**
     * Extra CodeMirror 6 extensions appended last.
     */
    extensions?: Extension[];
}

/**
 * Initializes a CodeMirror 6 editor with adblock TextMate highlighting and the
 * AdGuard rule-editing extensions, replacing the provided textarea.
 *
 * The created editor is focused immediately by default (unless
 * {@link InitEditorConfig.autofocus} is `false`), so editor hotkeys
 * (Ctrl+F/Ctrl+H, Ctrl+S, etc.) work right after this promise resolves.
 *
 * @param element The textarea to replace.
 * @param wasm The Oniguruma WASM source (URL/string/Response/ArrayBuffer/
 *   Promise/thunk); URL/string inputs are fetched. Only required when
 *   {@link highlight} is `'full'` (the default); pass `undefined` for
 *   `'none'`. See {@link WasmSource}.
 * @param conf Editor configuration.
 *
 * @returns The created {@link EditorView}.
 *
 * @throws {WasmLoadError} If the WASM binary cannot be loaded.
 */
export async function initEditor(
    element: HTMLTextAreaElement,
    wasm: WasmSource | undefined,
    conf: InitEditorConfig,
): Promise<EditorView> {
    const highlight: HighlightMode = conf.highlight ?? 'full';

    setMarkerFactory(createMarker({
        color: conf.hotkeys.markerColor,
        innerHTML: conf.hotkeys.markerHTML,
    }));

    const extensions: Extension[] = [
        lineNumbers(),
        history(),
        // The previous editor's chords are registered before the CodeMirror
        // defaults: some of them intentionally supersede a default that
        // binds the same chord (`Mod-d` — select next occurrence; macOS
        // `Cmd+Alt+Arrow` — add cursor above/below; Windows/Linux
        // `Ctrl+Shift+K` — delete line).
        configureAceParityKeys(),
        keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            // `historyKeymap` binds redo to `Mod-y` on Windows only — its
            // `Ctrl-Shift-z` entry is scoped to Linux — so the conventional
            // redo shortcut is bound on every platform.
            { key: 'Mod-Shift-z', run: redo, preventDefault: true },
        ]),
        // `search()` provides the search state and the panel, but does not
        // include the keymap — the standard search bindings (Ctrl+F, F3/Mod-g,
        // Escape) are registered here (`Mod-d` from `searchKeymap` is
        // shadowed by the delete-line parity binding above). The panel
        // defaults to the bottom of the editor, and no config is passed on
        // purpose: an explicit `top` would conflict with a consumer's own
        // `search({ top: ... })` extension.
        keymap.of(searchKeymap),
        search(),
        configureHotKeys({
            onToggleRule: conf.hotkeys.toggleRule,
            onSave: conf.hotkeys.onSave,
        }),
    ];

    if (highlight === 'full') {
        if (wasm === undefined) {
            throw new WasmLoadError(
                new Error(
                    "highlight: 'full' requires a WASM source; pass one or use "
                    + "highlight: 'none'.",
                ),
            );
        }
        RegistryManager.configureRegistry(wasm);
        const grammar = await RegistryManager.getGrammar(SCOPE_ADBLOCK);
        extensions.push(
            createTextmateLanguage(grammar),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        );
    }

    if (conf.withBreakpoints) {
        extensions.push(breakpointState());
    }

    if (conf.onChange) {
        extensions.push(EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                conf.onChange!(update.view);
            }
        }));
    }

    if (conf.extensions) {
        extensions.push(...conf.extensions);
    }

    const view = new EditorView({
        state: EditorState.create({ doc: element.value, extensions }),
    });

    // Replace the textarea (CM5 fromTextArea parity).
    element.parentNode?.insertBefore(view.dom, element);
    element.style.display = 'none';
    if (element.form) {
        element.form.addEventListener('submit', () => {
            element.value = view.state.doc.toString();
        });
    }

    // Focus the editor as soon as it is created so that keyboard shortcuts
    // (Ctrl+F find, Ctrl+H find & replace, Ctrl+S save, etc.) work
    // immediately after the editor is opened, without requiring the user to
    // click inside it first. CodeMirror keymaps only respond to keydown
    // events dispatched on the focused content DOM. Consumers that manage
    // focus themselves (e.g. multiple editors on one page) opt out with
    // `autofocus: false`.
    if (conf.autofocus !== false) {
        view.focus();
    }

    return view;
}

/**
 * Reads rules and their enabled flags from the editor.
 *
 * @param view The editor view.
 *
 * @returns One entry per line with its text and enabled flag.
 */
export function getRulesFromEditor(view: EditorView): { enabled: boolean; rule: string }[] {
    const enabled = new Set(enabledRuleLines(view.state));
    const rules: { enabled: boolean; rule: string }[] = [];
    for (let i = 1; i <= view.state.doc.lines; i += 1) {
        const line = view.state.doc.line(i);
        rules.push({ enabled: enabled.has(i), rule: line.text });
    }
    return rules;
}

/**
 * Replaces the editor content and restores enabled-rule markers.
 *
 * @param view The editor view.
 * @param value Rules with enabled flags.
 * @param markerOptions Marker color/HTML overrides.
 * @param markerOptions.color Marker text color.
 * @param markerOptions.innerHTML Marker inner HTML.
 */
export function setEditorValue(
    view: EditorView,
    value: { enabled: boolean; rule: string }[],
    markerOptions: { color?: string; innerHTML?: string },
): void {
    setMarkerFactory(createMarker(markerOptions));
    const doc = value.map((v) => v.rule).join('\n');
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } });

    value.forEach((v, index) => {
        if (v.enabled && !isCommentLine(v.rule)) {
            const line = view.state.doc.line(index + 1);
            if (!isBreakpointAt(view.state, line.from)) {
                view.dispatch({ effects: toggleBreakpoint.of(line.from) });
            }
        }
    });
}

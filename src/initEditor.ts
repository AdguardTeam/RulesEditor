import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, lineNumbers, keymap } from '@codemirror/view';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { search } from '@codemirror/search';

import { SCOPE_ADBLOCK } from './lib/constants';
import { RegistryManager, type WasmSource } from './lib/registry';
import { createTextmateLanguage } from './highlight/textmateLanguage';
import {
    breakpointState,
    toggleBreakpoint,
    isBreakpointAt,
    enabledRuleLines,
    setMarkerFactory,
} from './commands/breakpoints';
import { configureHotKeys, createMarker } from './commands/hotKeys';
import { RulesBuilder } from './rulesBuilder/RulesBuilder';

export { EditorView };

/**
 * Configuration for {@link initEditor}.
 */
export interface InitEditorConfig {
    /** Enables the enabled-rule gutter. */
    withBreakpoints?: boolean;
    /** Called after each document change. */
    onChange?: (view: EditorView) => void;
    /** Hotkey configuration. */
    hotkeys: {
        mode: 'windows' | 'mac';
        markerColor?: string;
        markerHTML?: string;
        toggleRule?: (view: EditorView) => void;
        onSave?: (view: EditorView) => void;
    };
    /** Extra CodeMirror 6 extensions appended last. */
    extensions?: Extension[];
}

/**
 * Initializes a CodeMirror 6 editor with adblock TextMate highlighting and the
 * AdGuard rule-editing extensions, replacing the provided textarea.
 *
 * @param element The textarea to replace.
 * @param wasm The Oniguruma WASM source (URL/string/Response/ArrayBuffer/
 *   Promise/thunk); URL/string inputs are fetched. See {@link WasmSource}.
 * @param conf Editor configuration.
 * @returns The created {@link EditorView}.
 * @throws {WasmLoadError} If the WASM binary cannot be loaded.
 */
export async function initEditor(
    element: HTMLTextAreaElement,
    wasm: WasmSource,
    conf: InitEditorConfig,
): Promise<EditorView> {
    RegistryManager.configureRegistry(wasm);
    const grammar = await RegistryManager.getGrammar(SCOPE_ADBLOCK);

    setMarkerFactory(createMarker({
        color: conf.hotkeys.markerColor,
        innerHTML: conf.hotkeys.markerHTML,
    }));

    const extensions: Extension[] = [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        search(),
        createTextmateLanguage(grammar),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        configureHotKeys({
            onToggleRule: conf.hotkeys.toggleRule,
            onSave: conf.hotkeys.onSave,
        }),
    ];

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

    return view;
}

/**
 * Reads rules and their enabled flags from the editor.
 *
 * @param view The editor view.
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
 * @returns Nothing.
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
        if (v.enabled && RulesBuilder.getRuleType(v.rule) !== 'comment') {
            const line = view.state.doc.line(index + 1);
            if (!isBreakpointAt(view.state, line.from)) {
                view.dispatch({ effects: toggleBreakpoint.of(line.from) });
            }
        }
    });
}

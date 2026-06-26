import * as CodeMirror from 'codemirror';
import type { ITextmateThemePlus } from 'codemirror-textmate';
import { addTheme } from 'codemirror-textmate';
// Enabling find and replace functionality
import 'codemirror/addon/search/searchcursor';
import 'codemirror/addon/search/search';
import 'codemirror/addon/dialog/dialog';

import { configureHotKeys, createMarker } from './commands/hotKeys';
import { initGrammar } from './lib/initGrammar';
import { RulesBuilder } from './rulesBuilder/RulesBuilder';

// Enabling comment functionality
import './commands/comment';
// Enabling move/copy lines up and down functionality
import './commands/lines';

export type EditorFromTextArea = CodeMirror.EditorFromTextArea;

// Editor enabled syntax mode, we have it here as constant temporary, then it should be exported from lib
export const EDITOR_DEFAULT_MODE = 'adblock';
export const MAX_HIGHLIGHTED_LINES = 1000;

/**
 * InitEditor - function initializes a CodeMirror editor with syntax highlighting for AdGuard filter rules.
 *
 * @param element Textarea element in your HTML.
 * @param wasm WebAssembly module provided by onigasm.
 * @param conf Configuration for initialization of CodeMirror and hotkeys.
 * @param conf.withBreakpoints Whether the breakpoint gutter is enabled.
 * @param conf.onChange Callback invoked on editor change.
 * @param conf.hotkeys Hotkey configuration.
 * @param conf.hotkeys.mode OS mode for hotkey mapping.
 * @param conf.hotkeys.markerColor Color of the gutter marker.
 * @param conf.hotkeys.markerHTML HTML of the gutter marker.
 * @param conf.hotkeys.toggleRule Callback invoked to toggle a rule.
 * @param conf.hotkeys.onSave Callback invoked on save.
 * @param conf.editor CodeMirror editor configuration.
 * @param conf.theme Editor theme.
 *
 * @returns CodeMirror instance.
 */
export async function initEditor(
    element: HTMLTextAreaElement,
    wasm: any,
    conf: {
        // Describes if breakpoint gutter will be used
        withBreakpoints?: boolean;
        // Callback for change event
        onChange?: (editor: CodeMirror.Editor, makeMarker: () => HTMLDivElement) => void;
        // Configuration for hotkeys
        hotkeys: {
            // OS mode for hotkeys mapping
            mode: 'windows' | 'mac';
            // Color of the marker for placing on the gutter (describes if rule is enabled)
            markerColor?: string;
            // HTML of the marker
            markerHTML?: string;
            // Callback for toggle rule
            toggleRule?: (editor: CodeMirror.Editor) => void;
            // Callback for save
            onSave?: (editor: CodeMirror.Editor) => void;
        };
        // Extended configuration of CodeMirror
        editor?: CodeMirror.EditorConfiguration;
        // Additional theme for CodeMirror
        theme?: ITextmateThemePlus;
    },
): Promise<EditorFromTextArea> {
    await initGrammar(wasm);

    const { hotkeys, editor: editorConfig, theme } = conf;

    const config: CodeMirror.EditorConfiguration = {
        ...(editorConfig || {}),
        lineNumbers: true,
        mode: 'adblock',
    };

    if (conf.withBreakpoints) {
        config.gutters = ['CodeMirror-linenumbers', 'breakpoints'];
    }

    if (theme) {
        addTheme(theme);
        config.theme = theme.name;
    }

    const editor = CodeMirror.fromTextArea(element, config);

    const keys = configureHotKeys({
        commentCallback: (cm) => {
            hotkeys.toggleRule?.(cm);
        },
        markerOptions: {
            color: hotkeys.markerColor,
            innerHTML: hotkeys.markerHTML,
        },
    });

    if (conf.onChange) {
        editor.on('change', () => {
            conf.onChange!(editor, keys.makeMarker);
        });
    }

    if (hotkeys.mode === 'mac' && conf.withBreakpoints) {
        editor.on('gutterClick', (cm: any, n: number) => {
            const info = cm.lineInfo(n);
            if (RulesBuilder.getRuleType(info.text) !== 'comment') {
                cm.setGutterMarker(n, 'breakpoints', info.gutterMarkers ? null : keys.makeMarker());
                hotkeys.toggleRule?.(cm);
            }
        });
        editor.setOption('extraKeys', {
            'Cmd-R': 'replace',
            'Cmd-/': keys.onComment,
            'Cmd-S': conf.hotkeys.onSave || (() => {}),
            'Cmd-C': keys.onCopy,
            'Cmd-V': () => {
                keys.onPaste(editor);
            },
            'Cmd-X': keys.onCut,
            'Alt-Up': keys.moveLineUp,
            'Shift-Alt-Up': keys.copyLineUp,
            'Shift-Alt-Down': keys.copyLineDown,
            'Alt-Down': keys.moveLineDown,
        });
    } else {
        editor.setOption('extraKeys', {
            'Mod-/': (editorInstance) => {
                conf.hotkeys.toggleRule?.(editorInstance);
            },
            'Mod-H': 'replace',
            'Alt-Up': 'moveLineUp',
            'Alt-Down': 'moveLineDown',
            'Shift-Alt-Up': 'copyLineUp',
            'Shift-Alt-Down': 'copyLineDown',
            'Mod-S': () => hotkeys.onSave?.(editor),
        });
        editor.on('gutterClick', (editorInstance, line) => {
            editorInstance.setCursor(line);
            conf.hotkeys.toggleRule?.(editorInstance);
        });
    }

    return editor;
}
// Function to get rules from editor with gutter markers
export const getRulesFromEditor = (editor: CodeMirror.Editor) => {
    // Get editor document
    const doc = editor.getDoc();
    try {
        // Get total number of lines
        const totalLines = doc.lineCount();
        let i = 0;
        const rules: { enabled: boolean; rule: string }[] = [];

        // Process each line
        while (i <= totalLines) {
            const info = editor.lineInfo(i);
            if (info && info.text) {
                rules.push({ enabled: !!info.gutterMarkers, rule: info.text });
            }
            i += 1;
        }
        return rules;
    } catch {
        // Fallback - return raw editor value if processing fails
        return editor.getValue();
    }
};

// Function to configure editor mode
export const configureEditorMode = (editor: CodeMirror.Editor) => {
    const doc = editor.getDoc();
    try {
        // Get total number of lines
        const totalLines = doc.lineCount();
        if (totalLines > MAX_HIGHLIGHTED_LINES && editor.getOption('mode') === EDITOR_DEFAULT_MODE) {
            editor.setOption('mode', undefined);
        }
        if (totalLines <= MAX_HIGHLIGHTED_LINES && editor.getOption('mode') !== EDITOR_DEFAULT_MODE) {
            editor.setOption('mode', EDITOR_DEFAULT_MODE);
        }
    } catch (e) {
        // If some unexpected error occurs, do nothing, logs will appear in console
        // eslint-disable-next-line no-console
        console.error(e instanceof Error ? e.message : 'Unknown error');
    }
};

// Function to set editor value with gutter markers
export const setEditorValue = (
    editor: CodeMirror.Editor,
    value: { enabled: boolean; rule: string }[],
    markerOptions: { color?: string; innerHTML?: string },
) => {
    // Array to store line numbers of enabled rules
    const enabledLines: number[] = [];
    // Split editor value by lines and process each line
    const data = value.map(({ enabled, rule }, index) => {
        // If rule is enabled and not a comment, store its line number
        if (enabled && RulesBuilder.getRuleType(rule) !== 'comment') {
            enabledLines.push(index);
        }
        return rule;
    });
    editor.setValue(data.join('\n'));
    // Add gutter markers for enabled rules
    const makeMarker = createMarker(markerOptions);
    enabledLines.forEach((l) => {
        editor.setGutterMarker(l, 'breakpoints', makeMarker());
    });
    configureEditorMode(editor);
};

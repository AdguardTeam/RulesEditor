/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import * as CodeMirror from 'codemirror';

import type { ITextmateThemePlus } from 'codemirror-textmate';
import { addTheme } from 'codemirror-textmate';

import { initGrammar } from './lib/initGrammar';

// Enabling find and replace functionality
import 'codemirror/addon/search/searchcursor';
import 'codemirror/addon/search/search';
import 'codemirror/addon/dialog/dialog';
// Enabling comment functionality
import './commands/comment';
// Enabling move/copy lines up and down functionality
import './commands/lines';

/**
 * initEditor - function initializes a CodeMirror editor with syntax highlighting for AdGuard filter rules.
 * @param element - Textarea element in your HTML.
 * @param wasm - WebAssembly module provided by onigasm.
 * @param theme - Usually a JSON object with a theme for syntax and editor highlighting.
 * @param conf - Configuration for extended initialization of CodeMirror.
 * @param callbacks - Object with toggleRule callback and onSave callback.
 * @returns - Promise<CodeMirror.EditorFromTextArea>. CodeMirror instance, check CodeMirror typings for more information.
 */
export async function initEditor(
    element: HTMLTextAreaElement,
    wasm: any,
    theme?: ITextmateThemePlus,
    conf?: CodeMirror.EditorConfiguration,
    callbacks?: {
        toggleRule?: (editor: CodeMirror.Editor) => void,
        onSave?: () => void,
    },
) {
    await initGrammar(wasm);

    const config: CodeMirror.EditorConfiguration = {
        ...conf,
        lineNumbers: true,
        mode: 'adblock',
    };

    if (theme) {
        addTheme(theme);
        config.theme = theme.name;
    }

    const editor = CodeMirror.fromTextArea(element, config);

    editor.setOption('extraKeys', {
        'Ctrl-/': (editorInstance) => {
            callbacks?.toggleRule?.(editorInstance);
        },
        'Ctrl-H': 'replace',
        'Alt-Up': 'moveLineUp',
        'Alt-Down': 'moveLineDown',
        'Shift-Alt-Up': 'copyLineUp',
        'Shift-Alt-Down': 'copyLineDown',
        'Ctrl-S': () => callbacks?.onSave?.(),
    });

    editor.on('gutterClick', (editorInstance, line) => {
        editorInstance.setCursor(line);
        callbacks?.toggleRule?.(editorInstance);
    });

    return editor;
}

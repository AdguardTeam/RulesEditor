/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import * as CodeMirror from 'codemirror';

import type { ITextmateThemePlus } from 'codemirror-textmate';
import { addTheme } from 'codemirror-textmate';

import { initGrammar } from './lib/initGrammar';

/**
 * initEditor - function initializes a CodeMirror editor with syntax highlighting for AdGuard filter rules
 * @param element - Textarea element in your HTML
 * @param wasm - WebAssembly module provided by onigasm
 * @param theme - Usually a JSON object with a theme for syntax and editor highlighting
 * @param conf - Configuration for extended initialization of CodeMirror
 * @returns - Promise<CodeMirror.EditorFromTextArea>. CodeMirror instance, check CodeMirror typings for more information
 */
export async function initEditor(
    element: HTMLTextAreaElement,
    wasm: any,
    theme?: ITextmateThemePlus,
    conf?: CodeMirror.EditorConfiguration,
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

    return editor;
}

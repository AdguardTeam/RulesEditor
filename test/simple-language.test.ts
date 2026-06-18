// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { createSimpleLanguage } from '../src/highlight/simple-language';

test('createSimpleLanguage highlights a comment without WASM', () => {
    const view = new EditorView({
        state: EditorState.create({
            doc: '! a comment',
            extensions: [createSimpleLanguage(), syntaxHighlighting(defaultHighlightStyle)],
        }),
        parent: document.body,
    });
    // Force the viewport to render.
    view.dispatch({});
    const span = view.dom.querySelector('.cm-line span');
    expect(span).not.toBeNull();
    expect(span!.className).not.toBe('');
    expect(view.dom.textContent).toContain('! a comment');
    view.destroy();
});

test('createSimpleLanguage renders an unparseable line without throwing', () => {
    const view = new EditorView({
        state: EditorState.create({
            doc: '||example.org^$domain=example.com',
            extensions: [createSimpleLanguage(), syntaxHighlighting(defaultHighlightStyle)],
        }),
        parent: document.body,
    });
    view.dispatch({});
    expect(view.dom.textContent).toContain('||example.org^$domain=example.com');
    view.destroy();
});

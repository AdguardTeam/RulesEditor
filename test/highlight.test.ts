// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { beforeEach, expect, test } from 'vitest';

import { createTextmateLanguage } from '../src/highlight/textmate-language';
import { tokenTags } from '../src/highlight/token-tags';
import { SCOPE_ADBLOCK } from '../src/lib/constants';
import { RegistryManager } from '../src/lib/registry';
import { Token } from '../src/lib/utils';

const wasm = readFileSync(
    resolve(__dirname, '../node_modules/vscode-oniguruma/release/onig.wasm'),
).buffer;

beforeEach(() => RegistryManager.resetForTests());

test('tokenTags maps tokens to standard @lezer/highlight tags', () => {
    expect(tokenTags[Token.Comment]).toBe(tags.comment);
    expect(tokenTags[Token.Keyword]).toBe(tags.keyword);
    expect(tokenTags[Token.String]).toBe(tags.string);
});

test('wraps a comment in a highlighted span via defaultHighlightStyle', async () => {
    RegistryManager.configureRegistry(wasm);
    const grammar = await RegistryManager.getGrammar(SCOPE_ADBLOCK);
    const language = createTextmateLanguage(grammar);
    const view = new EditorView({
        state: EditorState.create({
            doc: '! a comment',
            extensions: [language, syntaxHighlighting(defaultHighlightStyle)],
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

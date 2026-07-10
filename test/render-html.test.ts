// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { defaultHighlightStyle, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { expect, test } from 'vitest';

import { mountHighlightStyle, renderTokensToHtml, renderTokensToHtmlWithSearch } from '../src/highlight/render-html';
import { createTextmateLanguage } from '../src/highlight/textmate-language';
import { SCOPE_ADBLOCK } from '../src/lib/constants';
import { RegistryManager } from '../src/lib/registry';
import { Token } from '../src/lib/utils';

const wasm = readFileSync(
    resolve(__dirname, '../node_modules/vscode-oniguruma/release/onig.wasm'),
).buffer;

test('wraps a mapped token in a span with the HighlightStyle class', () => {
    const cls = defaultHighlightStyle.style([tags.comment]);
    expect(cls).not.toBeNull();
    const html = renderTokensToHtml([{ str: '! hi', token: Token.Comment }]);
    expect(html).toBe(`<span class="${cls}">! hi</span>`);
});

test('emits text without a class for a null token', () => {
    const html = renderTokensToHtml([{ str: 'plain', token: null }]);
    expect(html).toBe('plain');
});

test('escapes HTML-significant characters', () => {
    const html = renderTokensToHtml([{ str: '<a&b>"\'', token: null }]);
    expect(html).toBe('&lt;a&amp;b&gt;&quot;&#39;');
});

test('returns an empty string for an empty token list', () => {
    expect(renderTokensToHtml([])).toBe('');
});

test('skips tokens with empty str', () => {
    const html = renderTokensToHtml([
        { str: '', token: Token.Comment },
        { str: 'x', token: null },
    ]);
    expect(html).toBe('x');
});

test('uses a custom HighlightStyle when provided', () => {
    const custom = HighlightStyle.define([
        { tag: tags.comment, class: 'my-comment' },
    ]);
    const html = renderTokensToHtml(
        [{ str: '! hi', token: Token.Comment }],
        { highlightStyle: custom },
    );
    expect(html).toBe('<span class="my-comment">! hi</span>');
});

test('text content round-trips the input exactly', () => {
    const tokens = [
        { str: '||example.org^', token: Token.Keyword },
        { str: '$', token: Token.Operator },
        { str: 'important', token: Token.Keyword },
    ];
    const div = document.createElement('div');
    div.innerHTML = renderTokensToHtml(tokens);
    expect(div.textContent).toBe('||example.org^$important');
});

test('mountHighlightStyle injects the style module into the document', () => {
    const before = document.querySelectorAll('style').length;
    mountHighlightStyle();
    const after = document.querySelectorAll('style').length;
    expect(after).toBeGreaterThan(before);
});

test('mountHighlightStyle is idempotent (repeated calls do not duplicate rules)', () => {
    const before = document.querySelectorAll('style').length;
    mountHighlightStyle();
    mountHighlightStyle();
    mountHighlightStyle();
    const after = document.querySelectorAll('style').length;
    // At most one style element should be added regardless of how many
    // times mountHighlightStyle is called (style-mod dedupes).
    expect(after - before).toBeLessThanOrEqual(1);
});

test('escapes class attribute when class name contains special characters', () => {
    const custom = HighlightStyle.define([
        { tag: tags.comment, class: 'bad"class' },
    ]);
    const html = renderTokensToHtml(
        [{ str: '! hi', token: Token.Comment }],
        { highlightStyle: custom },
    );
    expect(html).toBe('<span class="bad&quot;class">! hi</span>');
});

test('emitted class matches the class CodeMirror applies in the editor', async () => {
    RegistryManager.resetForTests();
    RegistryManager.configureRegistry(wasm);
    const grammar = await RegistryManager.getGrammar(SCOPE_ADBLOCK);
    const view = new EditorView({
        state: EditorState.create({
            doc: '! a comment',
            extensions: [
                createTextmateLanguage(grammar),
                syntaxHighlighting(defaultHighlightStyle),
            ],
        }),
        parent: document.body,
    });
    view.dispatch({});
    const editorClass = view.dom.querySelector('.cm-line span')!.className;
    view.destroy();
    const ourClass = defaultHighlightStyle.style([tags.comment]);
    expect(ourClass).not.toBeNull();
    expect(editorClass.split(' ')).toContain(ourClass);
});

// --- renderTokensToHtmlWithSearch ---

test('search: no term renders identically to renderTokensToHtml', () => {
    const tokens = [
        { str: '||example.org^', token: Token.Keyword },
        { str: '$', token: Token.Operator },
        { str: 'important', token: Token.Keyword },
    ];
    expect(renderTokensToHtmlWithSearch(tokens, {}, undefined)).toBe(
        renderTokensToHtml(tokens),
    );
    expect(renderTokensToHtmlWithSearch(tokens, {}, { searchTerm: '' })).toBe(
        renderTokensToHtml(tokens),
    );
    expect(renderTokensToHtmlWithSearch(tokens, {}, { searchTerm: '   ' })).toBe(
        renderTokensToHtml(tokens),
    );
});

test('search: unmatched term renders identically to renderTokensToHtml', () => {
    const tokens = [{ str: '||example.org^', token: null }];
    expect(
        renderTokensToHtmlWithSearch(tokens, {}, {
            searchTerm: 'zzz',
            searchClassName: 'hl',
        }),
    ).toBe(renderTokensToHtml(tokens));
});

test('search: wraps a match inside a single null-token segment', () => {
    const tokens = [{ str: '||example.org^', token: null }];
    const html = renderTokensToHtmlWithSearch(tokens, {}, {
        searchTerm: 'example',
        searchClassName: 'hl',
    });
    expect(html).toBe('||<span class="hl">example</span>.org^');
});

test('search: matches are case-insensitive and preserve original casing', () => {
    const tokens = [{ str: 'Example', token: null }];
    const html = renderTokensToHtmlWithSearch(tokens, {}, {
        searchTerm: 'example',
        searchClassName: 'hl',
    });
    expect(html).toBe('<span class="hl">Example</span>');
});

test('search: wraps every non-overlapping occurrence independently', () => {
    const tokens = [{ str: 'abab', token: null }];
    const html = renderTokensToHtmlWithSearch(tokens, {}, {
        searchTerm: 'ab',
        searchClassName: 'hl',
    });
    expect(html).toBe('<span class="hl">ab</span><span class="hl">ab</span>');
});

test('search: a match spanning two tokens nests token spans in one wrapper', () => {
    const tokens = [
        { str: 'org', token: Token.String },
        { str: '^', token: Token.Operator },
    ];
    const strCls = defaultHighlightStyle.style([tags.string]);
    const opCls = defaultHighlightStyle.style([tags.operator]);
    const html = renderTokensToHtmlWithSearch(tokens, {}, {
        searchTerm: 'org^',
        searchClassName: 'hl',
    });
    const orgPart = strCls ? `<span class="${strCls}">org</span>` : 'org';
    const caretPart = opCls ? `<span class="${opCls}">^</span>` : '^';
    expect(html).toBe(`<span class="hl">${orgPart}${caretPart}</span>`);
});

test('search: splits a partially matched token, keeping its class on both parts', () => {
    const tokens = [{ str: 'example', token: Token.String }];
    const strCls = defaultHighlightStyle.style([tags.string]);
    const html = renderTokensToHtmlWithSearch(tokens, {}, {
        searchTerm: 'amp',
        searchClassName: 'hl',
    });
    expect(html).toBe(
        `<span class="${strCls}">ex</span>`
        + `<span class="hl"><span class="${strCls}">amp</span></span>`
        + `<span class="${strCls}">le</span>`,
    );
});

test('search: escapes the search class name and the matched text', () => {
    const tokens = [{ str: '<a>', token: null }];
    const html = renderTokensToHtmlWithSearch(tokens, {}, {
        searchTerm: '<a>',
        searchClassName: 'bad"cls',
    });
    expect(html).toBe('<span class="bad&quot;cls">&lt;a&gt;</span>');
});

test('search: emits a class-less span when no search class name is given', () => {
    const tokens = [{ str: 'abc', token: null }];
    const html = renderTokensToHtmlWithSearch(tokens, {}, { searchTerm: 'b' });
    expect(html).toBe('a<span>b</span>c');
});

test('search: total visible text round-trips the input', () => {
    const tokens = [
        { str: '||example.org^', token: Token.Keyword },
        { str: '$', token: Token.Operator },
        { str: 'important', token: Token.Keyword },
    ];
    const div = document.createElement('div');
    div.innerHTML = renderTokensToHtmlWithSearch(tokens, {}, {
        searchTerm: 'org^$imp',
        searchClassName: 'hl',
    });
    expect(div.textContent).toBe('||example.org^$important');
});

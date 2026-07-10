// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, expect, test } from 'vitest';

import { renderTokensToHtml } from '../src/highlight/render-html';
import * as lib from '../src/index';
import { RegistryManager } from '../src/lib/registry';
import { getHtmlRenderer } from '../src/tokenizers/get-html-renderer';
import { getTokenizer } from '../src/tokenizers/tokenizer';

const wasm = readFileSync(
    resolve(__dirname, '../node_modules/vscode-oniguruma/release/onig.wasm'),
).buffer;

beforeEach(() => RegistryManager.resetForTests());

test('getHtmlRenderer output equals renderTokensToHtml(getTokenizer output)', async () => {
    const render = await getHtmlRenderer(wasm);
    const tokenize = await getTokenizer(wasm);
    const rule = '||example.org^$important';
    expect(render(rule)).toBe(renderTokensToHtml(tokenize(rule)));
});

test('getHtmlRenderer returns an empty string for empty input', async () => {
    const render = await getHtmlRenderer(wasm);
    expect(render('')).toBe('');
});

test('public API exposes the rendering utilities', () => {
    expect(typeof lib.renderTokensToHtml).toBe('function');
    expect(typeof lib.getHtmlRenderer).toBe('function');
    expect(typeof lib.mountHighlightStyle).toBe('function');
});

test('renderer with no search argument is unchanged', async () => {
    const render = await getHtmlRenderer(wasm);
    const tokenize = await getTokenizer(wasm);
    const rule = '||example.org^$important';
    expect(render(rule)).toBe(renderTokensToHtml(tokenize(rule)));
});

test('renderer highlights a search term across token boundaries', async () => {
    const render = await getHtmlRenderer(wasm);
    const rule = '||example.org^';
    const html = render(rule, { searchTerm: 'org^', searchClassName: 'hl' });
    expect(html).toContain('<span class="hl">');
    expect((html.match(/<span class="hl">/g) ?? []).length).toBe(1);
    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.textContent).toBe(rule);
    const wrapper = div.querySelector('.hl')!;
    expect(wrapper.textContent).toBe('org^');
});

test('renderer highlights all occurrences of a term', async () => {
    const render = await getHtmlRenderer(wasm);
    const html = render('||a.org^a', { searchTerm: 'a', searchClassName: 'hl' });
    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.querySelectorAll('.hl').length).toBe(2);
});

test('public API exposes SearchHighlightOptions as a usable type', () => {
    const search: lib.SearchHighlightOptions = {
        searchTerm: 'x',
        searchClassName: 'hl',
    };
    expect(search.searchTerm).toBe('x');
});

import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

import { initEditor } from '../src/index';

import { initThemeSwitcher } from './theme';

import './styles.css';

// Let rspack emit the asset and compute its URL at build time.
const wasm = new URL('vscode-oniguruma/release/onig.wasm', import.meta.url);

const SAMPLE_RULES = [
    '! This is a comment',
    '||example.org^',
    'example.com##.banner',
    '@@||adguard.com^$important',
    '||tracker.example^$third-party,domain=example.com|example.net',
    '/^https?:\\/\\/[^/]+\\/ads\\/\\d+\\.js$/',
].join('\n');

/**
 * Syntax colors for the dark theme. The library's built-in fallback
 * (`defaultHighlightStyle`) is light-oriented, so the demo supplies its own
 * style when the dark theme is active. The list covers every token the adblock
 * grammar can emit (see the `Token` enum in `src/lib/utils.ts` and the
 * `tokenTags` map in `src/highlight/token-tags.ts`).
 */
const darkHighlightStyle = HighlightStyle.define([
    { tag: tags.comment, color: '#6a9955', fontStyle: 'italic' },
    { tag: tags.keyword, color: '#569cd6' },
    { tag: tags.string, color: '#ce9178' },
    { tag: tags.regexp, color: '#d16969' },
    { tag: tags.escape, color: '#d7ba7d' },
    { tag: tags.atom, color: '#569cd6' },
    { tag: tags.meta, color: '#d4d4d4' },
    { tag: tags.number, color: '#b5cea8' },
    { tag: tags.operator, color: '#d4d4d4' },
    { tag: tags.function(tags.variableName), color: '#dcdcaa' },
    { tag: tags.tagName, color: '#4ec9b0' },
    { tag: tags.attributeName, color: '#d7ba7d' },
    { tag: tags.invalid, color: '#f48771' },
]);

/**
 * Bootstraps the demo editor and seeds it with sample filter rules.
 *
 * @returns A promise that resolves once the editor is mounted.
 */
async function main(): Promise<void> {
    const textarea = document.getElementById('textarea') as HTMLTextAreaElement;

    const isMac = /^Mac/i.test(navigator.platform);

    const themeCompartment = new Compartment();

    /**
     * Builds the extensions for the given appearance. CodeMirror applies its
     * dark base styles (gutters, cursor, search panel, etc.) when the
     * `darkTheme` facet is enabled.
     *
     * @param dark Whether the dark appearance is active.
     *
     * @returns Extension list for the theme compartment.
     */
    const themeExtensions = (dark: boolean): Extension => {
        return dark
            ? [EditorView.darkTheme.of(true), syntaxHighlighting(darkHighlightStyle)]
            : [];
    };

    // The editor view is created after the WASM load; the theme switcher is
    // wired up first so theme switching works (and reflects the persisted
    // mode) from first paint. The dispatch is a no-op until the view exists.
    let view: EditorView | undefined;

    const themeSwitcher = initThemeSwitcher({
        container: document.getElementById('theme')!,
        onAppearanceChange: (dark) => {
            view?.dispatch({
                effects: themeCompartment.reconfigure(themeExtensions(dark)),
            });
        },
    });

    view = await initEditor(textarea, wasm, {
        hotkeys: { mode: isMac ? 'mac' : 'windows' },
        withBreakpoints: true,
        extensions: [themeCompartment.of(themeExtensions(themeSwitcher.isDarkAppearance()))],
    });

    view.dispatch({
        changes: { from: 0, insert: SAMPLE_RULES },
    });

    // The editor was initialized with the mode resolved at startup; re-apply
    // the current mode so a switch made while WASM was loading takes effect.
    themeSwitcher.reapplyAppearance();
}

main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
});

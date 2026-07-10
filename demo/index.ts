import { initEditor } from '../src/index';

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
 * Bootstraps the demo editor and seeds it with sample filter rules.
 *
 * @returns A promise that resolves once the editor is mounted.
 */
async function main(): Promise<void> {
    const textarea = document.getElementById('textarea') as HTMLTextAreaElement;

    const isMac = /^Mac/i.test(navigator.platform);

    const view = await initEditor(textarea, wasm, {
        hotkeys: { mode: isMac ? 'mac' : 'windows' },
        withBreakpoints: true,
    });

    view.dispatch({
        changes: { from: 0, insert: SAMPLE_RULES },
    });
}

main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
});

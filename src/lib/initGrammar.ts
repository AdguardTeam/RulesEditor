import { loadWASM } from 'onigasm';
import { activateLanguage, addGrammar } from 'codemirror-textmate';

import adblock from '../grammars/adblock.tmLanguage.json';
import js from '../grammars/js.tmLanguage.json';

/**
 * initGrammar - Private internal function, used to set up WebAssembly and textmate grammars,
 * and ensures that they are not loaded multiple times.
 * Ex. initEditor and getTokenizer in the same page.
 */
export const initGrammar = (() => {
    let inited = false;
    return async (wasm: any) => {
        if (!inited) {
            inited = true;
            try {
                await loadWASM(wasm);
                addGrammar('source.js', js as any);
                await activateLanguage('source.js', 'javascript', 'now');
                addGrammar('text.adblock', adblock as any);
                await activateLanguage('text.adblock', 'adblock', 'now');
            } catch (e) {
                // already loaded
            }
        }
    };
})();

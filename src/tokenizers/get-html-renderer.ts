import { renderTokensToHtmlWithSearch } from '../highlight/render-html';
import type { RenderOptions, SearchHighlightOptions } from '../highlight/render-html';
import type { WasmSource } from '../lib/registry';

import { getTokenizer } from './tokenizer';

/**
 * Builds a full-precision (WASM-backed) HTML renderer. Initializes the grammar
 * once, then returns a synchronous `(rule, search?) => html` function reusable
 * across many rows. Pass `search` per call to highlight a search term; omit it
 * for plain syntax-colored output.
 *
 * @param wasm The Oniguruma WASM source (URL/string/Response/ArrayBuffer/
 *   Promise/thunk); URL/string inputs are fetched. See {@link WasmSource}.
 * @param options Rendering options.
 *
 * @returns A function mapping a rule string (and optional search-highlight
 *   options) to colorized HTML.
 *
 * @throws {WasmLoadError} If the WASM binary cannot be loaded.
 * @throws {GrammarNotFoundError} If the adblock grammar cannot be resolved.
 */
export async function getHtmlRenderer(
    wasm: WasmSource,
    options?: RenderOptions,
): Promise<(rule: string, search?: SearchHighlightOptions) => string> {
    const tokenize = await getTokenizer(wasm);
    return (rule: string, search?: SearchHighlightOptions): string => (
        renderTokensToHtmlWithSearch(tokenize(rule), options, search)
    );
}

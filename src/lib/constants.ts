/**
 * Primary grammar for filter rule syntax. Used by `initEditor` (CM6 language),
 * `getTokenizer`, and `inspectLine` to tokenize adblock rules.
 */
export const SCOPE_ADBLOCK = 'text.adblock';

/**
 * Embedded grammar for scriptlet / `#%#` JavaScript. Required by the adblock
 * grammar's `"include": "source.js"` references so that inline JS in rules like
 * `example.org#%#var x = 1` still receives a `source.js` scope. The bundled
 * grammar is an intentionally minimal placeholder (no inner tokenization) to
 * keep the bundle small; full JS highlighting can be restored by registering a
 * real grammar (see `scripts/update-grammars.mts`).
 */
export const SCOPE_JS = 'source.js';

/**
 * CodeMirror stream parser language name for the adblock language.
 */
export const CM_LANGUAGE_NAME = 'adblock';

/**
 * Lookup object mapping all supported grammar scope names to their string
 * value. Useful when iterating over registered grammars.
 */
export const GRAMMAR_SCOPES = {
    adblock: SCOPE_ADBLOCK,
    js: SCOPE_JS,
} as const;

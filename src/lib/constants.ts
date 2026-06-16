/**
 * TextMate grammar scope name for AdGuard filter rules.
 */
export const SCOPE_ADBLOCK = 'text.adblock';

/**
 * TextMate grammar scope name for embedded JavaScript.
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

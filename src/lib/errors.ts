/* eslint-disable max-classes-per-file */

/**
 * Thrown when the Oniguruma WASM binary fails to load or is invalid.
 */
export class WasmLoadError extends Error {
    /** The underlying cause, if any. */
    public readonly cause?: unknown;

    /**
     * Creates a WasmLoadError.
     *
     * @param cause The underlying error, if any.
     */
    constructor(cause?: unknown) {
        super('Failed to load Oniguruma WASM binary.');
        this.name = 'WasmLoadError';
        this.cause = cause;
    }
}

/**
 * Thrown when a grammar is requested for a scope that has no registration.
 */
export class GrammarNotFoundError extends Error {
    /**
     * Creates a GrammarNotFoundError.
     *
     * @param scopeName The unresolved scope name.
     */
    constructor(scopeName: string) {
        super(`No grammar registered for scope '${scopeName}'.`);
        this.name = 'GrammarNotFoundError';
    }
}

/**
 * Thrown when an editor/tokenizer is requested with an unregistered theme name.
 */
export class UnknownThemeError extends Error {
    /**
     * Creates an UnknownThemeError.
     *
     * @param themeName The unknown theme name.
     */
    constructor(themeName: string) {
        super(`Unknown theme '${themeName}'.`);
        this.name = 'UnknownThemeError';
    }
}

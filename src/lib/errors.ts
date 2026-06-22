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

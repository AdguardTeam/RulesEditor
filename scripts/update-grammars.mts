/* eslint-disable no-console */
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { optimize } from 'oniguruma-parser/optimizer';

import { GRAMMAR_SCOPES } from '../src/lib/constants';

/**
 * Friendly grammar key. Must match a key in {@link GRAMMAR_SCOPES}
 * (`src/lib/constants.ts`), which is the single source of truth for the scope
 * names this library knows how to resolve.
 */
type GrammarKey = keyof typeof GRAMMAR_SCOPES;

/**
 * A downloadable TextMate grammar definition.
 */
interface GrammarSource {
    /** Friendly key; also the output filename stem (`<key>.tmLanguage.json`). */
    key: GrammarKey;
    /** URL to download the grammar from. */
    url: string;
    /** Source format. YAML grammars are converted to JSON on write. */
    format: 'yaml' | 'json';
}

/**
 * Grammars to download. To add one: register its scope in
 * {@link GRAMMAR_SCOPES} (`src/lib/constants.ts`) and add an entry here. The
 * `key` is type-checked against {@link GRAMMAR_SCOPES}, so both stay in sync.
 */
const GRAMMARS: GrammarSource[] = [
    {
        key: 'adblock',
        url: 'https://raw.githubusercontent.com/AdguardTeam/VscodeAdblockSyntax/refs/heads/master/syntaxes/adblock.yaml-tmlanguage',
        format: 'yaml',
    },
    {
        key: 'js',
        url: 'https://raw.githubusercontent.com/microsoft/vscode/refs/heads/main/extensions/javascript/syntaxes/JavaScript.tmLanguage.json',
        format: 'json',
    },
];

const GRAMMARS_DIR = path.resolve(import.meta.dirname, '../src/grammars');

/** All grammar scope names this library can resolve. */
const KNOWN_SCOPES = new Set<string>(Object.values(GRAMMAR_SCOPES));

/**
 * TextMate grammar keys whose values are Oniguruma regular expressions.
 */
const REGEX_KEYS = new Set([
    'match',
    'begin',
    'end',
    'while',
    'firstLineMatch',
    'foldingStartMarker',
    'foldingStopMarker',
]);

/**
 * Visitor callbacks for {@link walkGrammar}.
 */
interface GrammarVisitors {
    /** Called for each Oniguruma regex field; the return value replaces it. */
    onRegex?: (value: string) => string;
    /** Called for each `include` reference (read-only). */
    onInclude?: (ref: string) => void;
}

/**
 * Recursively walks a parsed TextMate grammar, visiting every regex field and
 * `include` reference. This replaces brittle regex matching on a stringified
 * grammar with structural traversal of the grammar object itself.
 *
 * @param node The current grammar node (object, array, or leaf).
 * @param visitors Callbacks invoked for regex fields and includes.
 */
function walkGrammar(node: unknown, visitors: GrammarVisitors): void {
    if (Array.isArray(node)) {
        node.forEach((item) => walkGrammar(item, visitors));
        return;
    }
    if (node === null || typeof node !== 'object') {
        return;
    }
    const obj = node as Record<string, unknown>;
    Object.keys(obj).forEach((key) => {
        const value = obj[key];
        if (typeof value === 'string') {
            if (visitors.onRegex && REGEX_KEYS.has(key)) {
                obj[key] = visitors.onRegex(value);
            } else if (visitors.onInclude && key === 'include') {
                visitors.onInclude(value);
            }
            return;
        }
        walkGrammar(value, visitors);
    });
}

/**
 * Optimizes a single Oniguruma pattern. Falls back to the original pattern when
 * the optimizer cannot parse it (e.g. exotic constructs), so the grammar is
 * never broken by optimization.
 *
 * @param pattern The Oniguruma regex to optimize.
 * @returns The optimized pattern, or the original on failure.
 */
export function optimizePattern(pattern: string): string {
    try {
        // `allowOrphanBackrefs` is required because TextMate `end`/`while`
        // patterns reference capture groups defined in the paired `begin`.
        const result = optimize(pattern, { rules: { allowOrphanBackrefs: true } });
        return result.flags ? `(?${result.flags})${result.pattern}` : result.pattern;
    } catch {
        return pattern;
    }
}

/**
 * Optimizes every Oniguruma regex in a grammar in place.
 *
 * @param grammar The parsed grammar to mutate.
 * @returns Counts of changed and total regex fields.
 */
function optimizeGrammar(grammar: unknown): { changed: number; total: number } {
    let changed = 0;
    let total = 0;
    walkGrammar(grammar, {
        onRegex: (value) => {
            total += 1;
            const next = optimizePattern(value);
            if (next !== value) {
                changed += 1;
            }
            return next;
        },
    });
    return { changed, total };
}

/**
 * Finds the external grammar scopes a grammar embeds via `include`. Internal
 * repository references (`#name`), `$self`/`$base`, and self-references to
 * `ownScope` are ignored.
 *
 * @param grammar The parsed grammar to inspect.
 * @param ownScope The grammar's own `scopeName`.
 * @returns The deduplicated list of external scope names.
 */
export function findExternalScopes(grammar: unknown, ownScope: string): string[] {
    const found = new Set<string>();
    walkGrammar(grammar, {
        onInclude: (ref) => {
            if (ref.startsWith('#') || ref.startsWith('$')) {
                return;
            }
            // Includes may be `scopeName` or `scopeName#repositoryKey`.
            const scope = ref.split('#')[0];
            if (scope && scope !== ownScope) {
                found.add(scope);
            }
        },
    });
    return [...found];
}

/**
 * Asserts that every external scope is one the library can resolve.
 *
 * @param scopes External scope names found in a grammar.
 * @param known The set of known grammar scopes.
 * @throws {Error} If any scope is unknown, with guidance on how to add it.
 */
export function assertKnownScopes(scopes: string[], known: Set<string>): void {
    const unknown = scopes.filter((scope) => !known.has(scope));
    if (unknown.length > 0) {
        throw new Error(
            `Unknown external grammar scope(s): ${unknown.join(', ')}.\n`
            + 'Each embedded grammar must be downloadable and registered. To fix:\n'
            + '  1. Add the scope to GRAMMAR_SCOPES in src/lib/constants.ts.\n'
            + '  2. Add a matching download entry to the GRAMMARS array in '
            + 'scripts/update-grammars.mts.',
        );
    }
}

/**
 * Downloads each configured grammar, validates that every embedded external
 * grammar is known, optimizes all Oniguruma regexes, and writes the grammars
 * to `src/grammars/` as JSON.
 *
 * @returns A promise that resolves when all grammars are written.
 */
async function main(): Promise<void> {
    await fs.mkdir(GRAMMARS_DIR, { recursive: true });

    const grammars = await Promise.all(GRAMMARS.map(async (source) => {
        const response = await fetch(source.url);
        if (!response.ok) {
            throw new Error(
                `Failed to download "${source.key}" grammar from ${source.url} `
                + `(HTTP ${response.status}).`,
            );
        }
        const text = await response.text();
        const grammar = source.format === 'yaml' ? parse(text) : JSON.parse(text);
        return { ...source, scopeName: GRAMMAR_SCOPES[source.key], grammar };
    }));

    // Validate embedded grammars before writing anything.
    grammars.forEach(({ grammar, scopeName }) => {
        assertKnownScopes(findExternalScopes(grammar, scopeName), KNOWN_SCOPES);
    });

    await Promise.all(grammars.map(async ({ key, grammar }) => {
        const { changed, total } = optimizeGrammar(grammar);
        const outFile = path.resolve(GRAMMARS_DIR, `${key}.tmLanguage.json`);
        await fs.writeFile(outFile, `${JSON.stringify(grammar, null, 4)}\n`);
        console.log(
            `${key}: optimized ${changed}/${total} regexes -> `
            + `${path.relative(process.cwd(), outFile)}`,
        );
    }));

    console.log('Grammars updated.');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

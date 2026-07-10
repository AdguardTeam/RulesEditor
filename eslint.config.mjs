import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importNewlines from 'eslint-plugin-import-newlines';
import jsdoc from 'eslint-plugin-jsdoc';
import n from 'eslint-plugin-n';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_LINE_LENGTH = 120;

/**
 * Core ESLint rules.
 *
 * @see {@link https://eslint.org/docs/latest/rules/}
 */
const ESLINT_RULES = {
    indent: 'off',
    'no-bitwise': 'off',
    'no-new': 'off',
    'no-continue': 'off',
    'arrow-body-style': 'off',
    // Vendored CM idioms and tooling configs rely on these relaxations.
    'class-methods-use-this': 'off',
    'no-underscore-dangle': 'off',
    'no-param-reassign': ['error', { props: false }],

    'no-restricted-syntax': ['error', 'LabeledStatement', 'WithStatement'],
    'no-constant-condition': ['error', { checkLoops: false }],
    'max-len': [
        'error',
        {
            code: MAX_LINE_LENGTH,
            comments: MAX_LINE_LENGTH,
            tabWidth: 4,
            ignoreUrls: true,
            ignoreTrailingComments: false,
            ignoreComments: false,
        },
    ],
    // Sort members of import statements, e.g. `import { B, A } from 'module';` -> `import { A, B } from 'module';`
    // Note: imports themself are sorted by import/order rule
    'sort-imports': ['error', {
        ignoreCase: true,
        // Avoid conflict with import/order rule
        ignoreDeclarationSort: true,
        ignoreMemberSort: false,
        memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
    }],
};

/**
 * TypeScript ESLint rules.
 *
 * Formatting rules removed from `@typescript-eslint` v8 (`indent`,
 * `member-delimiter-style`) are configured through `@stylistic` instead.
 *
 * @see {@link https://typescript-eslint.io/rules/}
 */
const TYPESCRIPT_ESLINT_RULES = {
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/interface-name-prefix': 'off',

    // Only constrain enum naming; leave other identifiers to general rules so
    // tooling globals like `__dirname` are allowed.
    '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'enum', format: ['UPPER_CASE', 'PascalCase'] },
    ],

    '@stylistic/member-delimiter-style': 'error',

    '@stylistic/indent': ['error', 4],
    '@typescript-eslint/explicit-member-accessibility': [
        'error',
        {
            accessibility: 'explicit',
            overrides: {
                accessors: 'explicit',
                constructors: 'no-public',
                methods: 'explicit',
                properties: 'off',
                parameterProperties: 'explicit',
            },
        },
    ],
    // Force proper import and export of types
    '@typescript-eslint/consistent-type-imports': [
        'error',
        {
            prefer: 'type-imports',
            fixStyle: 'inline-type-imports',
        },
    ],
    '@typescript-eslint/consistent-type-exports': [
        'error',
        {
            fixMixedExportsWithInlineTypeSpecifier: true,
        },
    ],
};

/**
 * Import plugin rules.
 *
 * @see {@link https://github.com/import-js/eslint-plugin-import/tree/main/docs/rules}
 */
const IMPORT_PLUGIN_RULES = {
    'import/prefer-default-export': 'off',
    // `import-x` cannot parse some modern plugin dist bundles (e.g.
    // `@stylistic/eslint-plugin`); these checks add no value for this project.
    'import/no-named-as-default': 'off',
    'import/no-named-as-default-member': 'off',

    'import-newlines/enforce': ['error', 3, MAX_LINE_LENGTH],
    'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
    // Split external and internal imports with an empty line
    'import/order': [
        'error',
        {
            groups: [
                // Built-in Node.js modules
                'builtin',
                // External packages
                'external',
                // Parent modules, e.g. `import { foo } from '../bar';`
                'parent',
                // Sibling modules, e.g. `import { foo } from './bar';`
                'sibling',
                // All other imports
            ],
            alphabetize: { order: 'asc', caseInsensitive: true },
            'newlines-between': 'always',
        },
    ],
};

/**
 * JSDoc plugin rules shared by both TypeScript and JavaScript files.
 *
 * @see {@link https://github.com/gajus/eslint-plugin-jsdoc?tab=readme-ov-file#user-content-eslint-plugin-jsdoc-rules}
 */
const JSDOC_COMMON_RULES = {
    'jsdoc/require-param-description': 'error',
    'jsdoc/require-property-description': 'error',
    'jsdoc/require-returns-description': 'error',
    'jsdoc/require-returns': 'error',
    'jsdoc/require-param': 'error',
    'jsdoc/require-returns-check': 'error',

    'jsdoc/check-tag-names': [
        'warn',
        {
            // Define additional tags
            // https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/check-tag-names.md#definedtags
            definedTags: ['note'],
        },
    ],

    'jsdoc/require-hyphen-before-param-description': ['error', 'never'],
    'jsdoc/require-jsdoc': [
        'error',
        {
            contexts: [
                'ClassDeclaration',
                'ClassProperty',
                'PropertyDefinition',
                'FunctionDeclaration',
                'MethodDefinition',
            ],
        },
    ],
    'jsdoc/require-description': [
        'error',
        {
            contexts: [
                'ClassDeclaration',
                'ClassProperty',
                'PropertyDefinition',
                'FunctionDeclaration',
                'MethodDefinition',
            ],
        },
    ],
    'jsdoc/require-description-complete-sentence': [
        'error',
        {
            abbreviations: [
                'e.g.',
                'i.e.',
            ],
        },
    ],
    'jsdoc/multiline-blocks': [
        'error',
        {
            noSingleLineBlocks: true,
            singleLineTags: [
                'inheritdoc',
            ],
        },
    ],
    'jsdoc/tag-lines': [
        'error',
        'any',
        {
            startLines: 1,
        },
    ],
    'jsdoc/sort-tags': [
        'error',
        {
            linesBetween: 1,
            tagSequence: [
                { tags: ['file'] },
                { tags: ['template'] },
                { tags: ['see'] },
                { tags: ['param'] },
                { tags: ['returns'] },
                { tags: ['throws'] },
                { tags: ['example'] },
            ],
        },
    ],
};

/**
 * JSDoc rules for TypeScript files. Parameter and return types come from the
 * TypeScript annotations, so the JSDoc type tags are disabled.
 *
 * @see {@link https://github.com/gajus/eslint-plugin-jsdoc?tab=readme-ov-file#user-content-eslint-plugin-jsdoc-rules}
 */
const JSDOC_TS_RULES = {
    ...JSDOC_COMMON_RULES,
    // Types are described in TypeScript.
    'jsdoc/require-param-type': 'off',
    'jsdoc/no-undefined-types': 'off',
    'jsdoc/require-returns-type': 'off',
};

/**
 * JSDoc rules for plain JavaScript files (build and tooling configs). There are
 * no TypeScript annotations here, so JSDoc must document parameter and return
 * types instead.
 *
 * @see {@link https://github.com/gajus/eslint-plugin-jsdoc?tab=readme-ov-file#user-content-eslint-plugin-jsdoc-rules}
 */
const JSDOC_JS_RULES = {
    ...JSDOC_COMMON_RULES,
    'jsdoc/require-param-type': 'error',
    'jsdoc/require-returns-type': 'error',
    // Plain config files do not resolve type names against a type registry.
    'jsdoc/no-undefined-types': 'off',
};

/**
 * N plugin rules.
 *
 * @see {@link https://github.com/eslint-community/eslint-plugin-n?tab=readme-ov-file#-rules}
 */
const N_PLUGIN_RULES = {
    // Import plugin is enough, also, this rule requires extensions in ESM, but we use bundler resolution
    'n/no-missing-import': 'off',
    // The library targets browsers (via bundler) and its dev scripts run on the
    // maintainer's Node toolchain, so Node-version builtin checks are noise.
    'n/no-unsupported-features/node-builtins': 'off',
    // Require using node protocol for node modules, e.g. `node:fs` instead of `fs`.
    'n/prefer-node-protocol': 'error',
    // Prefer `/promises` API for `fs` and `dns` modules, if the corresponding imports are used.
    'n/prefer-promises/fs': 'error',
    'n/prefer-promises/dns': 'error',
};

/**
 * Merges multiple rule sets into a single object.
 *
 * @param {...object} ruleSets The rule sets to merge.
 *
 * @returns {object} The merged rule set.
 */
function mergeRules(...ruleSets) {
    const merged = {};
    for (const rules of ruleSets) {
        for (const [key, value] of Object.entries(rules)) {
            if (merged[key]) {
                throw new Error(`Duplicate ESLint rule: ${key}`);
            }
            merged[key] = value;
        }
    }
    return merged;
}

const compat = new FlatCompat({
    baseDirectory: __dirname,
    resolvePluginsRelativeTo: __dirname,
});

const TS_PLUGIN_PREFIX = '@typescript-eslint/';

/**
 * Rule names still shipped by the installed `@typescript-eslint` version.
 * Anything referenced under the `@typescript-eslint/` namespace that is absent
 * here was removed in v8 (most of its formatting rules moved to `@stylistic`).
 */
const TYPESCRIPT_RULE_NAMES = new Set(Object.keys(tseslint.rules));

/**
 * Rule names provided by the installed `@stylistic/eslint-plugin`.
 */
const STYLISTIC_RULE_NAMES = new Set(Object.keys(stylistic.rules));

/**
 * The few formatting rules `@stylistic` renamed when it adopted them from
 * `@typescript-eslint` / core ESLint. Everything else keeps the same name.
 */
const STYLISTIC_RULE_RENAMES = {
    'func-call-spacing': 'function-call-spacing',
};

/**
 * Remaps `@typescript-eslint` rules that were removed in v8. Formatting rules
 * are re-pointed at their `@stylistic` equivalent, resolved automatically from
 * the installed plugins (no hand-maintained mapping). Removed rules with no
 * `@stylistic` replacement are dropped. Rules still shipped by
 * `@typescript-eslint` v8, and all non-`@typescript-eslint` rules, pass
 * through unchanged.
 *
 * @param {object} rules The rules object to transform.
 *
 * @returns {object} A new rules object compatible with `@typescript-eslint` v8.
 */
function remapRemovedTsRules(rules) {
    const result = {};
    for (const [ruleId, value] of Object.entries(rules)) {
        if (!ruleId.startsWith(TS_PLUGIN_PREFIX)) {
            result[ruleId] = value;
            continue;
        }

        const baseName = ruleId.slice(TS_PLUGIN_PREFIX.length);

        // Still a valid @typescript-eslint v8 rule.
        if (TYPESCRIPT_RULE_NAMES.has(baseName)) {
            result[ruleId] = value;
            continue;
        }

        // Removed in v8: re-point to @stylistic if it adopted the rule.
        const stylisticName = STYLISTIC_RULE_RENAMES[baseName] ?? baseName;
        if (STYLISTIC_RULE_NAMES.has(stylisticName)) {
            result[`@stylistic/${stylisticName}`] = value;
            continue;
        }

        // Removed with no replacement; drop it.
    }
    return result;
}

/**
 * Airbnb shareable configs are still authored in the eslintrc format, so they
 * are loaded through the `@eslint/eslintrc` `FlatCompat` adapter. The removed
 * `@typescript-eslint` formatting rules they reference are remapped to
 * `@stylistic` afterwards.
 */
const airbnbConfigs = compat
    .extends('airbnb-base', 'airbnb-typescript/base')
    .map((config) => {
        const next = { ...config };
        if (next.rules) {
            next.rules = remapRemovedTsRules(next.rules);
        }
        // Airbnb's eslintrc `overrides` use bare globs like `*.ts`, which in
        // flat config only match root-level files. Rewrite them to `**/*.ts`
        // so the TypeScript-specific overrides (e.g. `import/extensions`) apply
        // to nested source files too.
        if (Array.isArray(next.files)) {
            next.files = next.files.map((pattern) => (
                typeof pattern === 'string' && pattern.startsWith('*.')
                    ? `**/${pattern}`
                    : pattern
            ));
        }
        return next;
    });

export default [
    // Replaces the legacy `ignorePatterns`.
    {
        ignores: [
            'dist',
            'coverage',
            // Hand-written ambient type declarations for third-party modules.
            'types',
            // Vendored CodeMirror addon ports — kept as-is to preserve behavior.
            'src/commands/comment.js',
            'src/commands/lines.js',
        ],
    },

    // Airbnb base config (eslintrc format, via FlatCompat).
    ...airbnbConfigs,

    // Native flat presets for the remaining plugins.
    tseslint.configs['flat/eslint-recommended'],
    jsdoc.configs['flat/recommended'],
    // `recommended-typescript` disables the JSDoc type tags (types come from
    // the TypeScript annotations), so it must apply to TypeScript files only —
    // plain JS config files still document their types in JSDoc.
    { ...jsdoc.configs['flat/recommended-typescript'], files: ['**/*.ts', '**/*.mts', '**/*.cts'] },
    n.configs['flat/recommended'],

    // Register shared plugins globally. The airbnb-typescript ruleset references
    // `@stylistic/*` rules for every file (its formatting rules were remapped
    // away from `@typescript-eslint`), so the plugin must be available outside
    // of the TypeScript-only block below.
    {
        plugins: {
            '@stylistic': stylistic,
            'import-newlines': importNewlines,
        },
    },

    // Project parser configuration and rule overrides.
    //
    // All linted TypeScript (`src`, `test`, `scripts`, `declaration.d.ts`) is
    // covered by the single `tsconfig.json`. Matches `.ts` as well as the
    // `.mts`/`.cts` module variants (e.g. `scripts/update-grammars.mts`).
    {
        files: ['**/*.ts', '**/*.mts', '**/*.cts'],
        languageOptions: {
            parser: tsParser,
            sourceType: 'module',
            parserOptions: {
                project: [
                    './tsconfig.json',
                ],
                tsconfigRootDir: __dirname,
            },
        },
        settings: {
            // Resolve TypeScript imports so `import/extensions` (ts: 'never')
            // can detect that extensionless relative imports point at `.ts`
            // files. `eslint-plugin-import-x` reads its own `import-x/resolver`
            // settings key and ignores the airbnb-provided `import/resolver`.
            'import-x/resolver': {
                typescript: {
                    project: [
                        './tsconfig.json',
                    ],
                },
            },
        },
        rules: mergeRules(
            ESLINT_RULES,
            TYPESCRIPT_ESLINT_RULES,
            IMPORT_PLUGIN_RULES,
            JSDOC_TS_RULES,
            N_PLUGIN_RULES,
        ),
    },

    // Build-time CLI scripts may log progress and terminate the process.
    {
        files: ['scripts/**/*.ts', 'scripts/**/*.mts', 'scripts/**/*.cts'],
        rules: {
            'no-console': 'off',
            'n/no-process-exit': 'off',
        },
    },

    // Loose tooling config files (`eslint.config.mjs`, `webpack.config.js`,
    // `jest.config.js`) are plain JS/ESM and are not part of the TypeScript
    // program, so type-aware rules cannot run on them. Disable type-checked
    // rules and let them be process-aware (they use Node globals and `console`).
    {
        files: ['*.js', '*.cjs', '*.mjs'],
        languageOptions: {
            parserOptions: {
                project: false,
            },
        },
        rules: {
            ...tseslint.configs['flat/disable-type-checked'].rules,
            // Apply the project's general (non-type-aware) style conventions
            // that the TypeScript block scopes to `*.ts` only, so config files
            // follow the same rules (4-space indent, 120-col lines, etc.).
            ...ESLINT_RULES,
            ...IMPORT_PLUGIN_RULES,
            ...JSDOC_JS_RULES,
            ...N_PLUGIN_RULES,
            indent: 'off',
            '@stylistic/indent': ['error', 4],
            // Config files are dev tooling: they are never published and may
            // freely import devDependencies and use Node globals/`console`.
            'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
            'import/no-named-as-default': 'off',
            'n/no-unpublished-import': 'off',
            'n/no-unpublished-require': 'off',
            'no-underscore-dangle': ['error', { allow: ['__dirname', '__filename'] }],
            'no-console': 'off',
            'n/no-process-exit': 'off',
        },
    },
];

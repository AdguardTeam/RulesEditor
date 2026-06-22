<!-- omit in toc -->
# AGENTS.md

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Project Overview](#project-overview)
- [Technical Context](#technical-context)
- [Project Structure](#project-structure)
- [Build And Test Commands](#build-and-test-commands)
- [Contribution Instructions](#contribution-instructions)
- [Code Guidelines](#code-guidelines)
  - [System Design](#system-design)
  - [Architecture](#architecture)
  - [Code Quality](#code-quality)
  - [Testing](#testing)
  - [Configuration \& Documentation](#configuration--documentation)
  - [Markdown Formatting](#markdown-formatting)

## Project Overview

`@adguard/rules-editor` is a browser-based text editor library for AdGuard
filter rules. It provides:

1. A CodeMirror 6 editor with TextMate-based syntax highlighting for
   adblock filter rules (using `vscode-textmate` with a native-`RegExp`
   Oniguruma engine, `oniguruma-to-es`).
2. A full tokenizer that splits a rule into highlighted segments for
   custom rendering outside the editor.
3. A simple tokenizer (no WASM) for lightweight rule tokenization.
4. A `RulesBuilder` class that programmatically constructs filter rules
   (block, unblock, no-filtering, DNS, comment, custom).

## Technical Context

| Field | Value |
| --- | --- |
| Language/Version | TypeScript 5.2, targeting ES6 |
| Primary Dependencies | CodeMirror 6 (@codemirror/* — peer), vscode-textmate,
  oniguruma-to-es, @adguard/tsurlfilter 2 |
| Storage | None (client-side library) |
| Testing | Vitest |
| Target Platform | Browser (bundled as UMD via Webpack) |
| Project Type | Library / Package |
| Performance Goals | N/A |
| Constraints | Native `RegExp` (v flag, ES2024) for full tokenization; no WASM |
| Scale/Scope | Consumed by AdGuard products for user rule editing UIs |

## Project Structure

```text
├── src/
│   ├── index.ts                  # Public API entry point (re-exports)
│   ├── init-editor.ts            # CodeMirror 6 editor initialization
│   ├── commands/
│   │   ├── breakpoints.ts        # Enabled-rule gutter state (CM6)
│   │   └── hot-keys.ts           # CM6 keymap builder
│   ├── grammars/                 # TextMate grammar JSON files (adblock, JS)
│   ├── highlight/
│   │   ├── token-tags.ts         # Token → standard @lezer/highlight Tag map
│   │   ├── scope-to-token.ts     # TextMate scope to Token mapping
│   │   ├── textmate-language.ts  # StreamLanguage for CM6 (TextMate)
│   │   └── simple-language.ts    # StreamLanguage for CM6 (no-WASM simple)
│   ├── lib/
│   │   ├── constants.ts          # Scope name constants
│   │   ├── errors.ts             # GrammarNotFoundError
│   │   ├── onig-mock.ts          # Native-RegExp Oniguruma engine (vscode-oniguruma mock)
│   │   ├── registry.ts           # Lazy vscode-textmate Registry
│   │   ├── types.ts              # TokenSegment type
│   │   └── utils.ts              # Token enum, normalizeTokens helper
│   ├── rules-builder/
│   │   ├── rules-builder.ts      # Static factory for rule builders
│   │   └── rules/                # Individual rule type builders (7 files)
│   └── tokenizers/
│       ├── get-full-tokenizer.ts # Full tokenizer (vscode-textmate)
│       ├── inspect-line.ts       # Line→TokenSegment[] utility
│       └── simple-tokenizer.ts   # Regex-based tokenizer (no WASM)
├── test/                         # Vitest test files
├── scripts/                      # Build-time scripts (grammar loader)
├── webpack.config.js             # UMD bundle config
├── tsconfig.json                 # Main TypeScript config
├── vitest.config.ts              # Vitest config
├── package.json                  # Package manifest
└── .eslintrc                     # ESLint config (airbnb-typescript)
```

## Build And Test Commands

| Command | Purpose |
| --- | --- |
| `pnpm run build` | Build UMD bundle to `dist/` via Webpack |
| `pnpm test` | Run all Vitest tests |
| `pnpm run lint` | Lint `src/index.ts` with ESLint |
| `pnpm run update-grammars` | Download + optimize TextMate grammars from upstream |
| `pnpm run increment` | Bump patch version |

## Contribution Instructions

- You MUST verify it with linter, formatter, and type checker.

  Use the following commands:
    - `pnpm run build` to check for type errors (TypeScript via
      ts-loader)
    - `pnpm run lint` to run the linter

- You MUST update the unit tests for changed code.

- You MUST run tests with `pnpm test` to verify that your changes do
  not break existing functionality.

- When making changes to the project structure, ensure the Project
  Structure section in `AGENTS.md` is updated and remains valid.

- If the prompt essentially asks you to refactor or improve existing
  code, check if you can phrase it as a code guideline. If it's
  possible, add it to the relevant Code Guidelines section in
  `AGENTS.md`.

- After completing the task you MUST verify that the code you've
  written follows the Code Guidelines in this file.

## Code Guidelines

### System Design

Design for a library:

- The library is consumed by other code — never access the filesystem,
  network, or environment unless the caller explicitly opts in.
  Keep side effects out of the default code path.
- Export a stable public API; internal functions and types MUST be
  explicitly marked as private or internal.
- Keep the dependency footprint minimal — every transitive dependency
  becomes a burden on consumers. Prefer built-in APIs over adding
  packages.
- Do not mutate global state (environment variables, process listeners,
  shared singletons) — the consumer may use the library in a
  long-running process alongside other code.
- Provide complete type definitions so the library is usable with
  static type checking and editor autocompletion out of the box.
- Document every public function, class, and type with doc comments —
  consumers should not need to read source code to use the library.
- Handle errors by throwing specific, documented error classes — let the
  consumer decide how to recover.

### Architecture

Universal design principles:

- **Separation of Concerns** — each module handles one aspect of the
  system (editor init, grammar loading, tokenization, rule building)
- **Single Responsibility Principle** — every file, class, or function
  has one reason to change
- **Dependency Direction** — dependencies point inward; public API
  (`index.ts`) depends on internal modules, never the reverse
- **Explicit Boundaries** — only `src/index.ts` defines the public
  surface; everything else is internal
- **Data Flow Clarity** — Grammar loads → tokenizer/editor consumes grammar state
- **Minimize Coupling, Maximize Cohesion** — rule builders are
  self-contained; tokenizers share only the `Token` enum and
  `normalizeTokens` utility
- **Make Invalid States Impossible** — `RuleType` union constrains
  builder selection; `Token` enum constrains valid token values
- **Observability Built-in** — less critical for a client-side library;
  errors surface via thrown exceptions to the consumer
- **Keep It Boring** — standard patterns (factory, builder, singleton
  for WASM init)

This project's layers, from top to bottom:

```text
Public API (src/index.ts — re-exports)
     ↓
Features (initEditor, tokenizers, rulesBuilder)
     ↓
Shared library (lib/registry, lib/utils, lib/errors)
     ↓
External deps (codemirror, vscode-textmate, oniguruma-to-es, tsurlfilter)
```

Public API re-exports features. Features may depend on shared library
and external deps. Shared library may only depend on external deps.

### Code Quality

Shared library (lib/registry, lib/utils, lib/errors)
  `jsdoc/require-description` (complete sentence), and
  `jsdoc/require-returns` on classes, class properties, functions, and
  methods.
- **Strict TypeScript** — `strict: true`, `noImplicitAny: true` in
  tsconfig.
- **Airbnb style** — ESLint extends `airbnb-typescript/base`; follow
  its conventions for imports, naming, and formatting.
- **No modification of linter config** without explicit approval —
  the `.eslintrc` rules are intentional.
- **Error handling** — throw errors; let consumers catch. The
  `initGrammar` singleton silently catches "already loaded" errors
  to allow safe repeated calls.
- **Naming** — files use kebab-case; classes use PascalCase; enums use
  PascalCase with camelCase members; constants use camelCase.
  **Exception**: generated TextMate grammar files in `src/grammars/` use
  the standard `<scope>.tmLanguage.json` convention (e.g.
  `adblock.tmLanguage.json`).

### Testing

- Tests live in `test/` directory at repo root.
- Test files follow `*.test.ts` naming convention.
- Framework: Vitest (no globals; every file imports `test`/`expect` etc.
  explicitly from `vitest`).
- Default environment is `node`; editor/gutter tests use `@vitest-environment
  jsdom` docblock.
- Tests are plain `test()` calls (no `describe` blocks currently).
- Each rule builder type has coverage for building rules and parsing
  them back from strings.
- Tokenizer tests verify token output against expected arrays.
- No mocking is used — tests exercise real module code.

- **Error handling** — throw errors; let consumers catch. The
  registry's `ensureRegistry` catches duplicate `loadWASM` calls
  to allow safe repeated initialization.

- **Pin all dependency versions explicitly** — do not use version
  ranges that allow automatic upgrades to untested versions.
- **Prefer vanilla solutions** — use the language's standard library
  and built-in APIs when they adequately solve the problem. Only add a
  dependency when it provides significant value over a vanilla
  implementation.
- **Reputable sources only** — dependencies MUST come from
  well-established, actively maintained projects.
- **Avoid unpopular libraries** — do NOT add niche or obscure packages
  with limited community adoption.
- **Minimize dependency count** — each new dependency increases attack
  surface, bundle size, and maintenance burden. Justify every addition.
- **Use the latest stable version** — when adding a new dependency,
  explicitly check the package registry for the latest stable release
  and use it.

**Rationale**: Fewer, well-vetted dependencies reduce security
vulnerabilities, supply chain risks, and long-term maintenance costs.

**Known exclusions** (to be fixed):

- All dependencies use caret (`^`) version ranges instead of exact
  pinning.
- `is-valid-domain` — niche package; could be replaced with a simple
  regex or validation function.
- `path-browserify` and `util` — polyfills for Node built-ins needed
  by Webpack browser bundle; acceptable but should be evaluated for
  removal if upstream deps drop Node API usage.

### Configuration & Documentation

- No runtime configuration — the library is configured via function
  parameters (`initEditor` accepts a config object, tokenizers are
  initialized without a WASM argument).
- No environment variables or config files are read at runtime.
- `README.md` documents the public API with usage examples — update it
  when the public interface changes.
- Grammar JSON files in `src/grammars/` are generated by
  `pnpm run update-grammars` — do not edit them manually.

### Markdown Formatting

All Markdown files MUST follow these formatting rules:

- **Line length**: Keep lines at most 80 characters. This is not a hard
  lint gate, but SHOULD be followed for readability. Lines inside fenced
  code blocks are exempt from this limit.
- **Unordered lists**: Use dashes (`-`) for bullet points. Indent nested
  list items by 4 spaces.
- No runtime configuration — the library is configured via function
  parameters (`initEditor` accepts a config object, tokenizers are
  initialized without a WASM argument).
  `**bold**`). Do NOT use underscores.
- **Headings**: Duplicate heading names are allowed only among sibling
  headings (same parent level). Avoid duplicates across different levels.
- **Inline HTML**: Avoid raw HTML in Markdown. The only allowed elements
  are `<a>`, `<p>`, `<details>`, `<summary>`, and `<img>`.
- **Trailing spaces**: Do NOT leave trailing whitespace on any line. Do
  NOT use two-space line breaks — use a blank line instead.
- **Bare URLs**: Bare URLs are permitted and do not need to be wrapped
  in angle brackets.
- **Table formatting**: Align table columns with padding when the table
  fits within 80 characters. If the table exceeds 80 characters or
  triggers an MD060 linter warning, switch to a compact format using
  single spaces only. This applies to the separator row as well — it
  should be written as `| --- |`, not `|--|`.

  Example of correct layout:

  ```markdown
  | Col1 | Col2 |
  | --- | --- |
  | Value1 | Value2 |
  ```

  Do NOT use extra padding or alignment characters beyond single spaces.

**Rationale**: Uniform Markdown formatting improves readability for both
humans and AI agents that consume project documentation.

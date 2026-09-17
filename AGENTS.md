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
    - [Dependencies](#dependencies)
    - [Configuration \& Documentation](#configuration--documentation)
    - [Markdown Formatting](#markdown-formatting)

## Project Overview

`@adguard/rules-editor` is a browser-based text editor library for AdGuard
filter rules. It provides:

1. A CodeMirror 6 editor with TextMate-based syntax highlighting for
   adblock filter rules (using WebAssembly Oniguruma via `vscode-oniguruma`).
2. A WASM-backed tokenizer that splits a rule into highlighted segments
   for custom rendering outside the editor.

## Technical Context

| Field                | Value                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| Language/Version     | TypeScript 5.2, targeting ES6                                                                                |
| Primary Dependencies | CodeMirror 6 (@codemirror/* — peer), vscode-oniguruma (WASM — peer), vscode-textmate, @adguard/tsurlfilter 2 |
| Storage              | None (client-side library)                                                                                   |
| Testing              | Vitest                                                                                                       |
| Target Platform      | Browser (bundled as UMD via Rspack)                                                                          |
| Project Type         | Library / Package                                                                                            |
| Performance Goals    | N/A                                                                                                          |
| Constraints          | Requires WASM for full tokenization; must support browsers without native Oniguruma                          |
| Scale/Scope          | Consumed by AdGuard products for user rule editing UIs                                                       |

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
│   │   ├── render-html.ts        # Token-list → colorized HTML + style mount
│   │   ├── token-tags.ts         # Token → standard @lezer/highlight Tag map
│   │   ├── scope-to-token.ts     # TextMate scope to Token mapping
│   │   └── textmate-language.ts  # StreamLanguage for CM6 (WASM TextMate)
│   ├── lib/
│   │   ├── constants.ts          # Scope name constants
│   │   ├── errors.ts             # WasmLoadError, GrammarNotFoundError
│   │   ├── registry.ts           # Lazy Oniguruma + vscode-textmate Registry
│   │   ├── types.ts              # TokenSegment type
│   │   └── utils.ts              # Token enum, normalizeTokens, isCommentLine, findCosmeticRuleMarker
│   └── tokenizers/
│       ├── tokenizer.ts          # WASM-based tokenizer (vscode-textmate)
│       ├── get-html-renderer.ts  # Compose tokenizer + renderer → HTML helpers
│       └── inspect-line.ts       # Line → TokenSegment[] utility
├── test/                         # Vitest test files
├── scripts/                      # Build-time scripts (grammar loader)
├── demo/                         # Browser demo (pnpm run demo)
│   ├── index.html                # Demo page template
│   ├── index.ts                  # Editor bootstrap with sample rules
│   ├── rspack.config.ts          # Dev-server config (bundles CodeMirror)
│   └── tsconfig.json             # TypeScript config for the demo build
├── .github/
│   └── workflows/                # GitHub Actions CI/CD pipelines
├── rspack.config.ts              # UMD bundle config
├── tsconfig.json                 # Main TypeScript config
├── vitest.config.ts              # Vitest config
├── package.json                  # Package manifest (no version — changelog-driven)
├── eslint.config.mjs             # ESLint flat config (airbnb via FlatCompat)
├── Dockerfile                    # Multi-stage Docker build
├── CHANGELOG.md                  # Version history
└── DEPLOYMENT.md                 # Release pipeline documentation
```

## Build And Test Commands

| Command           | Purpose                                                       |
| ----------------- | ------------------------------------------------------------- |
| `pnpm build`      | Build bundle + type declarations to `dist/` via Rspack + tsc  |
| `pnpm test`       | Run all Vitest tests                                          |
| `pnpm lint`       | Run all linters (ESLint + TypeScript + Markdown)              |
| `pnpm lint:code`  | Run ESLint                                                    |
| `pnpm lint:types` | Run TypeScript type checking                                  |
| `pnpm lint:md`    | Run Markdown linting                                          |

See [DEVELOPMENT.md](DEVELOPMENT.md) for the full command list and for how
`package.json` derives its release version from `CHANGELOG.md` (it has no
`version` field).

## Contribution Instructions

- You MUST verify it with linter, formatter, and type checker.

  Use the following commands:
    - `pnpm run build` to check for type errors (TypeScript via
      ts-loader)
    - `pnpm run lint` to run the linter

- You MUST update the unit tests for changed code.

- You MUST run tests with `pnpm test` to verify that your changes do
  not break existing functionality. Both `pnpm lint` and `pnpm test` are
  enforced by the Husky pre-commit hook.

- When the task changes code in `src/`, update `CHANGELOG.md` in the
  `Unreleased` section. Add entries to the appropriate subsection (`Added`,
  `Changed`, or `Fixed`); do not create duplicate subsections. Do NOT add
  changelog entries for documentation-only changes (e.g., `AGENTS.md`,
  `DEVELOPMENT.md`, `README.md`), CI changes, or test changes.

- Use ticket-prefixed commit messages — `AG-XXX <short description in present
  tense>`, so commits auto-link with the task tracker. Automated commits made
  by CI (e.g. the CHANGELOG finalization in release PRs, which has no ticket
  number) use a [Conventional Commits] prefix such as `docs:` instead. See
  [DEVELOPMENT.md](DEVELOPMENT.md) for the full convention with examples.

[Conventional Commits]: https://www.conventionalcommits.org/en/v1.0.0/

- When adding an `## [Unreleased]` section to `CHANGELOG.md`, always add the
  corresponding link reference immediately after the section's last entry,
  pointing to `HEAD` from the latest released version, e.g.:

  ```markdown
  [Unreleased]: https://github.com/AdguardTeam/RulesEditor/compare/vX.Y.Z...HEAD
  ```

  where `vX.Y.Z` is the latest versioned tag in the changelog.

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
- **Data Flow Clarity** — WASM loads once → grammar activates →
  tokenizer/editor consumes grammar state
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
Features (initEditor, tokenizers)
     ↓
Shared library (lib/registry, lib/utils, lib/errors)
     ↓
External deps (codemirror, vscode-textmate, vscode-oniguruma)
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
  the `eslint.config.mjs` rules are intentional.
- **Error handling** — throw errors; let consumers catch. The
  registry's `ensureRegistry` catches duplicate `loadWASM` calls
  to allow safe repeated initialization.
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

### Dependencies

- **Pin all dependency versions explicitly** — do not use version
  ranges that allow automatic upgrades to untested versions. When
  pinning, keep at least the version already resolved in
  `pnpm-lock.yaml` — never downgrade a dependency.
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

### Configuration & Documentation

- No runtime configuration — the library is configured via function
  parameters (`initEditor` accepts a config object, tokenizers accept
  a `WasmSource`).
- No environment variables or config files are read at runtime.
- `README.md` documents the public API with usage examples — update it
  when the public interface changes.
- Grammar JSON files in `src/grammars/` are generated by
  `pnpm run update-grammars` — do not edit them manually.

### Markdown Formatting

All Markdown files MUST pass `pnpm lint:md` (markdownlint, configured in
`.markdownlint.json`). The formatting rules below follow that configuration:

- **Line length**: Keep lines at most 120 characters (enforced by
  markdownlint). Lines inside fenced code blocks and table rows are
  exempt from this limit.
- **Unordered lists**: Use dashes (`-`) for bullet points. Indent nested
  list items by 4 spaces.
- **Bold**: Use double asterisks (`**bold**`). Do NOT use underscores.
- **Headings**: Duplicate heading names are allowed only among sibling
  headings (same parent level). Avoid duplicates across different levels.
- **Inline HTML**: Avoid raw HTML in Markdown. The only allowed elements
  are `<a>`, `<p>`, `<details>`, `<summary>`, and `<img>`.
- **Trailing spaces**: Do NOT leave trailing whitespace on any line. Do
  NOT use two-space line breaks — use a blank line instead.
- **Bare URLs**: Bare URLs are permitted and do not need to be wrapped
  in angle brackets.
- **Table formatting**: Align table columns with padding so that pipes
  line up with the header row (`table-column-style: aligned`). This
  applies to the separator row as well — pad it with dashes to match
  the column widths.

  Example of correct layout:

  ```markdown
  | Col1   | Col2   |
  | ------ | ------ |
  | Value1 | Value2 |
  ```

  Do NOT use compact single-space tables — they fail the markdownlint
  aligned style check.

**Rationale**: Uniform Markdown formatting improves readability for both
humans and AI agents that consume project documentation.

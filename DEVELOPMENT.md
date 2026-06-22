# Development

## Prerequisites

- Node.js (LTS)
- pnpm

## Setup

```sh
git clone <repo-url>
cd rules-editor
pnpm install
```

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm run build` | Build UMD bundle to `dist/` via Webpack |
| `pnpm test` | Run all Vitest tests |
| `pnpm run test:watch` | Run Vitest in watch mode |
| `pnpm run lint` | Lint `./src` with ESLint |
| `pnpm run update-grammars` | Download + optimize TextMate grammars from upstream |
| `pnpm run increment` | Bump patch version |

## Updating Grammars

Filter rule highlighting uses a TextMate grammar from the
[AdGuard VSCode extension](https://github.com/AdguardTeam/VscodeAdblockSyntax/blob/master/syntaxes/adblock.yaml-tmlanguage).
The JavaScript grammar is based on
[TypeScript-tmLanguage](https://github.com/Microsoft/TypeScript-TmLanguage/blob/master/TypeScriptReact.tmLanguage).

To update to the latest version:

```sh
pnpm run update-grammars
```

This downloads each grammar listed in `scripts/update-grammars.mts`, optimizes
every Oniguruma regex with `oniguruma-parser`, verifies that any embedded
(external) grammar is one the library knows how to resolve, and validates that
every pattern converts to a native `RegExp` (via `oniguruma-to-es`, strict
accuracy) — failing the build if any pattern is not convertible. To add a new
embedded grammar, register its scope in `src/lib/constants.ts`
(`GRAMMAR_SCOPES`) and add a download entry to the `GRAMMARS` array in
`scripts/update-grammars.mts`.

Do not edit `src/grammars/*.json` files manually — they are generated.

## Project Structure

See [AGENTS.md](AGENTS.md) for detailed project structure and
architecture.

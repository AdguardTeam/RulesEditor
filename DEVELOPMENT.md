# Development

## Prerequisites

- Node.js v22
- pnpm v10.33.4

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
| `pnpm test` | Run all Jest tests |
| `pnpm run lint` | Lint `src/index.ts` with ESLint |
| `pnpm run loadGrammar` | Regenerate TextMate grammar from upstream |
| `pnpm run increment` | Bump patch version |

## Updating Grammars

Filter rule highlighting uses a TextMate grammar from the
[AdGuard VSCode extension](https://github.com/AdguardTeam/VscodeAdblockSyntax/blob/master/syntaxes/adblock.yaml-tmlanguage).
The JavaScript grammar is based on
[TypeScript-tmLanguage](https://github.com/Microsoft/TypeScript-TmLanguage/blob/master/TypeScriptReact.tmLanguage).

To update to the latest version:

```sh
pnpm run loadGrammar
```

Do not edit `src/grammars/*.json` files manually — they are generated.

## Project Structure

See [AGENTS.md](AGENTS.md) for detailed project structure and
architecture.

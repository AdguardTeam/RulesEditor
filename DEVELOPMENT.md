# Development

## Prerequisites

- Node.js v22
- pnpm v10.33.4

## Setup

```sh
# Private source repo (for contributors with access)
git clone https://github.com/AdGuardSoftwareLimited/ext-rules-editor.git
cd ext-rules-editor

# Public mirror (read-only)
# git clone https://github.com/AdguardTeam/RulesEditor.git

pnpm install
```

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm run build` | Build ESM bundle + type declarations to `dist/` via Rspack + tsc |
| `ANALYZE=true pnpm run build` | Build with bundle analysis report |
| `pnpm run demo` | Start a dev server with a live editor in the browser |
| `pnpm test` | Run all Vitest tests |
| `pnpm run test:watch` | Run Vitest in watch mode |
| `pnpm run lint` | Lint `./src` with ESLint |
| `pnpm run update-grammars` | Download + optimize TextMate grammars from upstream |

`package.json` intentionally has no `version` field — the release version is
derived from `CHANGELOG.md` and injected by CI before packing. See
[DEPLOYMENT.md](DEPLOYMENT.md) for details.

## Releasing

Releases are fully automated via GitHub Actions. See
[DEPLOYMENT.md](DEPLOYMENT.md) for the complete release pipeline documentation.

## Demo

A standalone demo page lets you open the editor in the browser and try it
out against live source. Start the dev server with:

```sh
pnpm run demo
```

This launches an Rspack dev server (default [http://localhost:8080](http://localhost:8080)). The demo imports the editor directly from
`src`, so changes to the library are reflected on reload without a
separate build step. The Oniguruma WASM asset is resolved from
`vscode-oniguruma/release/onig.wasm` and emitted by Rspack.

Demo sources live in the `demo/` directory.

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
every Oniguruma regex with `oniguruma-parser`, and verifies that any embedded
(external) grammar is one the library knows how to resolve. To add a new
embedded grammar, register its scope in `src/lib/constants.ts`
(`GRAMMAR_SCOPES`) and add a download entry to the `GRAMMARS` array in
`scripts/update-grammars.mts`.

Do not edit `src/grammars/*.json` files manually — they are generated.

## Project Structure

See [AGENTS.md](AGENTS.md) for detailed project structure and
architecture.

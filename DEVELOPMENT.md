# Development

## Prerequisites

- Node.js >= 22.22.2 (matches `engines.node` — required by the
  `markdownlint-cli` toolchain via `ini@7.0.0`)
- pnpm >= 10.33.4 < 11 (matches `engines.pnpm`)

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

| Command                         | Purpose                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `pnpm run build`                | Build ESM bundle + type declarations to `dist/` via Rspack + tsc   |
| `ANALYZE=true pnpm run build`   | Build with bundle analysis report                                  |
| `pnpm run demo`                 | Start a dev server with a live editor in the browser               |
| `pnpm test`                     | Run all Vitest tests                                               |
| `pnpm run test:watch`           | Run Vitest in watch mode                                           |
| `pnpm run lint`                 | Run all linters (ESLint + TypeScript + Markdown)                   |
| `pnpm run lint:code`            | Run ESLint                                                         |
| `pnpm run lint:types`           | Run TypeScript type checking                                       |
| `pnpm run lint:md`              | Run Markdown linting                                               |
| `pnpm run update-grammars`      | Download + optimize TextMate grammars from upstream                |

`package.json` intentionally has no `version` field — the release version is
derived from `CHANGELOG.md` and injected by CI before packing. To pack
locally, set a temporary version first (`npm pkg set version=0.0.0-dev`,
revert with `git checkout package.json`) or use the Docker build with the
`VERSION` build arg. Releases are fully automated via GitHub Actions — see
[DEPLOYMENT.md](DEPLOYMENT.md) for the complete release pipeline.

## Demo

A standalone demo page lets you open the editor in the browser and try it
out against live source. Start the dev server with:

```sh
pnpm run demo
```

This launches an Rspack dev server (default
[http://localhost:8080](http://localhost:8080)). The demo imports the
editor directly from
`src`, so changes to the library are reflected on reload without a
separate build step. The Oniguruma WASM asset is resolved from
`vscode-oniguruma/release/onig.wasm` and emitted by Rspack.

Demo sources live in the `demo/` directory.

## Updating Grammars

Filter rule highlighting uses a TextMate grammar from the
[AdGuard VSCode extension][adguard-vscode-extension].
The JavaScript grammar is based on
[TypeScript-tmLanguage][typescript-tmlanguage].

To update to the latest version:

```sh
pnpm run update-grammars
```

[adguard-vscode-extension]: https://github.com/AdguardTeam/VscodeAdblockSyntax/blob/master/syntaxes/adblock.yaml-tmlanguage
[typescript-tmlanguage]: https://github.com/Microsoft/TypeScript-TmLanguage/blob/master/TypeScriptReact.tmLanguage

This downloads each grammar listed in `scripts/update-grammars.mts`, optimizes
every Oniguruma regex with `oniguruma-parser`, and verifies that any embedded
(external) grammar is one the library knows how to resolve. To add a new
embedded grammar, register its scope in `src/lib/constants.ts`
(`GRAMMAR_SCOPES`) and add a download entry to the `GRAMMARS` array in
`scripts/update-grammars.mts`.

Do not edit `src/grammars/*.json` files manually — they are generated.

## Commit Message Convention

Every commit message MUST start with the ticket number (`AG-XXX`) so it
auto-links with the task tracker, followed by a short description in the
present tense:

```text
AG-XXX <short description in present tense>
```

Examples:

- `AG-55716 Add reusable publish-release workflow`
- `AG-4321 Fix redirect after login`
- `AG-99 Update dependencies`

Automated commits that CI creates on its own (for example, the CHANGELOG
finalization in release PRs, which has no ticket number) use a
[Conventional Commits] prefix such as `docs:` — e.g.
`docs: finalize changelog for release`.

[Conventional Commits]: https://www.conventionalcommits.org/en/v1.0.0/

Ticket references belong in the commit message; the rules for code
comments are defined in the Code Quality guidelines of
[AGENTS.md](AGENTS.md).

## Project Structure

See [AGENTS.md](AGENTS.md) for detailed project structure and
architecture.

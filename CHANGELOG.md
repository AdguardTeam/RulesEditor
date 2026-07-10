# AdGuard Editor Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 2.0.0 - 2026-07-10

### Added

- `inspectLine` utility returning per-token segments with TextMate scope stacks
- Public error classes: `WasmLoadError`, `GrammarNotFoundError`, `UnknownThemeError`
- `TokenSegment` type and `WasmSource` type
- `normalizeTokens` exported for custom tokenization pipelines
- Display-only HTML renderer: `renderTokensToHtml`, `renderRuleToHtml`,
  `getHtmlRenderer`, and `mountHighlightStyle` — tokenize a rule and produce
  colorized HTML with editor-identical syntax highlighting, no CodeMirror
  instance required
- `SearchHighlightOptions` type for `getHtmlRenderer` and `renderTokensToHtml` to allow specifying a search term and CSS class for highlighting search hits in the rendered HTML. The `searchTerm` is HTML-escaped, and the `searchClassName` is applied to each matched chunk.

### Changed

- **Breaking:** Migrated editor from CodeMirror 5 to CodeMirror 6; `initEditor` now returns `EditorView` with a new configuration shape
- **Breaking:** Token enum values aligned with `@lezer/highlight` tag taxonomy (e.g. `Def` → `Definition`, `String2` → `Regexp`, `Tag` → `TagName`)
- **Breaking:** WASM backend changed from `onigasm` to `vscode-oniguruma` + `vscode-textmate`; the library no longer exports a `wasm` URL — pass a flexible `WasmSource` instead
- **Breaking:** `getFullTokenizer` renamed to `getTokenizer`
- **Breaking:** `HighlightMode` is now `'full' | 'none'`
- **Breaking:** CodeMirror packages (`@codemirror/*`, `@lezer/*`) moved to `peerDependencies`; the consumer's bundler must supply them
- **Breaking:** Removed `configureEditorMode` and `EDITOR_DEFAULT_MODE` — syntax highlighting is now always active
- The package now ships with a standards-compliant `exports` map and emitted type declarations under `dist/types`
- Editor commands (comment toggle, line move/copy, search) now use CodeMirror 6 built-ins
- Grammars are now optimized at build time via `oniguruma-parser`
- Grammars are updated

### Removed

- `RulesBuilder` and all rule-construction exports (`RuleType`, `DnsRuleType`,
  `BlockContentTypeModifiers`, `UnblockContentTypeModifier`, `DomainModifiers`,
  `ExceptionSelectModifiers`, `BlockRequestRule`, `UnblockRequestRule`,
  `NoFilteringRule`, `Comment`, `CustomRule`, `DNSRule`).
- `simpleTokenizer` and the `highlight: 'simple'` editor strategy.
- `renderRuleToHtml` (use the async `getHtmlRenderer` instead).
- Dependencies `@adguard/tsurlfilter` (and transitive `@adguard/scriptlets`),
  `is-valid-domain`, `path-browserify`, `util`.

### Fixed

- Comment toggle no longer marks comment-only lines as enabled
- `BlockRequestRule` and `UnblockRequestRule` now correctly include the `important` modifier in rule output
- `NoFilteringRule` no longer appends a trailing `$`

## 1.3.3 - 2026-06-08

- Fix @adguard/scriplets dependency

## 1.3.2 - 2026-06-03

- Export `normalizeTokens` from the package

## 1.3.1 - 2026-02-05

- Fix bug with moving lines up and down

## 1.3.0 - 2025-12-01

- Refactor initEditor, add modes for work with gutter markers and hotkey for macOS

## 1.2.10 - 2024-09-03

- Add multiplatform support for comment and save hotkey

## 1.2.9 - 2024-09-02

- Add hotkeys support for editor

## 1.2.8 - 2024-04-01

- Add a check to ensure that the tokenizer correctly returns a null token and the original string in cases where the cosmetic rules' marker logic would not be applicable.

## 1.2.7 - 2024-03-26

- Changed the `isBlockingRule` property in the `DNSRule` class to public.

- Fixed a bug in the `buildRule` for `BlockRequestRule` and `UnblockRequestRule` function where using the `important` modifier resulted in an empty string. The function now properly considers and integrates the `important` modifier, ensuring accurate rule construction.

- Fixed a bug in the `buildRule` method for `NoFilteringRule`, where it previously added an unnecessary `$` at the end of the rule. The method has been updated to omit the `$`, aligning the output with the correct rule syntax and expected behavior.

## 1.2.6 - 2024-02-26

### Changed

- Split RequestRule to two separate classes for block and unblock rules
- Refactor some strings to consts


## 1.2.5 - 2024-02-16

### Changed

- fix noFiltering parsing

## 1.2.4 - 2023-06-12

### Changed

- fix comment parsing

## 1.2.3 - 2023-06-12

### Changed

- add validation support for dns rules

## 1.2.2 - 2023-06-12

### Changed

- refactor `getDnsRule -> getDnsRuleByType` for dns rules.


## 1.2.1 - 2023-01-12

### Changed

- export `DNSRule` builder.
- fix `getRuleFromRuleString` for dns rules.

## 1.2.0 - 2023-27-11

### Changed

- `RulesBuilder` add `getDnsRule()`.
- `RulesBuilder` add support for DNS rules.


## 1.1.1 - 2023-11-10

### Changed

- `RulesBuilder` bug fixes.


## 1.1.0 - 2023-10-24

### Changed

- `RulesBuilder` class.


## 1.0.0 - 2023-10-12

### Changed

- `initEditor()`, `simpleTokenizer()` and `getTokenizer()` methods.
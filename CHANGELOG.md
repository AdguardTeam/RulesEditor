# AdGuard Editor Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `conf.autofocus` option for `initEditor` — pass `autofocus: false` when the
  host page manages focus itself (e.g. several editors on one page), so the
  editor does not steal focus on creation.
- Shortcuts of the previous (Ace-based) editor, restored in place of the
  CodeMirror defaults that reused the same chords: `Ctrl+K` / `Ctrl+Shift+K`
  on Windows/Linux find the next / previous match (`Ctrl+Shift+K` was
  "delete line"), `Ctrl+L` / `Cmd+L` opens go to line,
  `Cmd+Option+ArrowUp` / `Cmd+Option+ArrowDown` on macOS copy lines up /
  down (was "add cursor above / below"), and `Ctrl+D` / `Cmd+D` deletes the
  current line (was "select next occurrence").
- Multi-cursor keyboard shortcuts matching the previous Ace-based editor:
  `Ctrl+Alt+Up` / `Ctrl+Alt+Down` add a cursor above / below, their `Shift`
  variants move the last cursor instead (with a single cursor the first press
  adds one, as in Ace), and `Ctrl+Alt+Left` / `Ctrl+Alt+Right` (with `Shift` to
  move instead of add) select the previous / next occurrence of the selection,
  starting from the word under or next to the cursor. Letters, digits and
  combining marks are matched with Unicode property escapes, so non-ASCII
  domains and decomposed text are supported, and cursors never land inside a
  surrogate pair or a combining sequence. The bindings take precedence over
  CodeMirror's `defaultKeymap`, and the chords are swallowed even when a
  command declines, so they never reach the browser. A selection that spans
  several lines is moved by the line commands instead of being merged with its
  shifted copy; the occurrence search reads the document in bounded windows
  rather than copying it whole on every keypress, and takes its needle from the
  document itself so a multi-line selection matches with any line separator.
  As in Ace, the shortcuts use `Ctrl+Alt` on macOS too — `Cmd+Alt` is taken by
  the browsers' previous/next tab; `Esc` collapses back to a single cursor, and
  with only one cursor and nothing to collapse it does not mark the key event
  as handled, so the browser default is not swallowed either
  [AdguardBrowserExtension#3607].
- `withMultipleSelections` option for `initEditor` (default `true`); pass
  `false` to disable multi-cursor editing, which also leaves the multi-cursor
  shortcuts unbound.
- `HotkeyMode` type, the `'windows' | 'mac'` union `conf.hotkeys.mode` uses,
  exported so the config and the keymap builder cannot drift apart.

### Changed

- `Ctrl+/` / `Cmd+/` now toggles the adblock comment (and the enabled-rule
  marker) for the line under every cursor, not only for the main one.

### Deprecated

### Removed

### Fixed

- Search hotkeys are restored in the editor: `Ctrl+F` opens the search panel
  and `Ctrl+H` opens it with the focus in the replace field ("find &
  replace") — on macOS `Cmd+H` is reserved by the OS/browser, so find &
  replace there is covered by `Ctrl+Alt+F` / `Cmd+Alt+F`, which is bound on
  every platform. The editor is now focused on initialization, so the
  shortcuts work immediately after the editor is opened, and the search
  panel is rendered at the bottom of the editor. When the panel has no
  replace field (a read-only editor or a custom search panel), the shortcut
  focuses the find field — or the first input of a custom panel — instead
  of being swallowed.
- The save (`Ctrl+S` / `Cmd+S`) and comment-toggle (`Ctrl+/` / `Cmd+/`)
  shortcuts now also work while the focus is inside the open search panel,
  instead of falling through to the browser.
- `Ctrl+D` / `Cmd+D` (delete line) is consumed as a no-op in a read-only
  editor instead of falling through to CodeMirror's "select next
  occurrence", which moved the selection.
- Multi-line editing with modifier+click (`Ctrl+click` on Windows/Linux,
  `Cmd+click` on macOS) works again: it was lost in the CodeMirror 5 → 6
  migration, where the editor was created without multi-selection support, so
  every selection was collapsed to a single cursor
  [AdguardBrowserExtension#3607].

### Security

## [2.0.2] - 2026-09-07

### Fixed

- Redo via `Ctrl+Shift+Z` (`Cmd+Shift+Z` on macOS) now works on every
  platform; previously `historyKeymap` left the shortcut unbound on
  Windows, so the redo hotkey did nothing there (AG-58535).

## [2.0.1] - 2026-08-19

## [2.0.0] - 2026-07-10

### Added

- `inspectLine` utility returning per-token segments with TextMate scope stacks
- Public error classes: `WasmLoadError`, `GrammarNotFoundError`, `UnknownThemeError`
- `TokenSegment` type and `WasmSource` type
- `normalizeTokens` exported for custom tokenization pipelines
- Display-only HTML renderer: `renderTokensToHtml`, `renderRuleToHtml`,
  `getHtmlRenderer`, and `mountHighlightStyle` — tokenize a rule and produce
  colorized HTML with editor-identical syntax highlighting, no CodeMirror
  instance required
- `SearchHighlightOptions` type for `getHtmlRenderer` and `renderTokensToHtml`
  to allow specifying a search term and CSS class for highlighting search hits
  in the rendered HTML. The `searchTerm` is HTML-escaped, and the `searchClassName`
  is applied to each matched chunk.

### Changed

- **Breaking:** Migrated editor from CodeMirror 5 to CodeMirror 6; `initEditor`
  now returns `EditorView` with a new configuration shape
- **Breaking:** Token enum values aligned with `@lezer/highlight` tag taxonomy
  (e.g. `Def` → `Definition`, `String2` → `Regexp`, `Tag` → `TagName`)
- **Breaking:** WASM backend changed from `onigasm` to `vscode-oniguruma` +
  `vscode-textmate`; the library no longer exports a `wasm` URL — pass a
  flexible `WasmSource` instead
- **Breaking:** `getFullTokenizer` renamed to `getTokenizer`
- **Breaking:** `HighlightMode` is now `'full' | 'none'`
- **Breaking:** CodeMirror packages (`@codemirror/*`, `@lezer/*`) moved to
  `peerDependencies`; the consumer's bundler must supply them
- **Breaking:** Removed `configureEditorMode` and `EDITOR_DEFAULT_MODE` — syntax
  highlighting is now always active
- The package now ships with a standards-compliant `exports` map and emitted
  type declarations under `dist/types`
- Editor commands (comment toggle, line move/copy, search) now use CodeMirror 6
  built-ins
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

## [1.3.3] - 2026-06-08

- Fix @adguard/scriplets dependency

## [1.3.2] - 2026-06-03

- Export `normalizeTokens` from the package

## [1.3.1] - 2026-02-05

- Fix bug with moving lines up and down

## [1.3.0] - 2025-12-01

- Refactor initEditor, add modes for work with gutter markers and hotkey for macOS

## [1.2.10] - 2024-09-03

- Add multiplatform support for comment and save hotkey

## [1.2.9] - 2024-09-02

- Add hotkeys support for editor

## [1.2.8] - 2024-04-01

- Add a check to ensure that the tokenizer correctly returns a null token
  and the original string in cases where the cosmetic rules' marker logic
  would not be applicable.

## [1.2.7] - 2024-03-26

- Changed the `isBlockingRule` property in the `DNSRule` class to public.

- Fixed a bug in the `buildRule` for `BlockRequestRule` and `UnblockRequestRule`
  function where using the `important` modifier resulted in an empty string.
  The function now properly considers and integrates the `important` modifier,
  ensuring accurate rule construction.

- Fixed a bug in the `buildRule` method for `NoFilteringRule`, where it
  previously added an unnecessary `$` at the end of the rule. The method has been
  updated to omit the `$`, aligning the output with the correct rule syntax and
  expected behavior.

## [1.2.6] - 2024-02-26

### Changed

- Split RequestRule to two separate classes for block and unblock rules
- Refactor some strings to consts

## [1.2.5] - 2024-02-16

### Changed

- fix noFiltering parsing

## [1.2.4] - 2023-06-12

### Changed

- fix comment parsing

## [1.2.3] - 2023-06-12

### Changed

- add validation support for dns rules

## [1.2.2] - 2023-06-12

### Changed

- refactor `getDnsRule -> getDnsRuleByType` for dns rules.


## [1.2.1] - 2023-01-12

### Changed

- export `DNSRule` builder.
- fix `getRuleFromRuleString` for dns rules.

## [1.2.0] - 2023-27-11

### Changed

- `RulesBuilder` add `getDnsRule()`.
- `RulesBuilder` add support for DNS rules.


## [1.1.1] - 2023-11-10

### Changed

- `RulesBuilder` bug fixes.


## [1.1.0] - 2023-10-24

### Changed

- `RulesBuilder` class.


## [1.0.0] - 2023-10-12

### Changed

- `initEditor()`, `simpleTokenizer()` and `getTokenizer()` methods.

[Unreleased]: https://github.com/AdguardTeam/RulesEditor/compare/v2.0.2...HEAD
[2.0.2]: https://github.com/AdguardTeam/RulesEditor/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/AdguardTeam/RulesEditor/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/AdguardTeam/RulesEditor/compare/v1.3.3...v2.0.0
[1.3.3]: https://github.com/AdguardTeam/RulesEditor/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/AdguardTeam/RulesEditor/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/AdguardTeam/RulesEditor/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/AdguardTeam/RulesEditor/compare/v1.2.10...v1.3.0
[1.2.10]: https://github.com/AdguardTeam/RulesEditor/compare/v1.2.9...v1.2.10
[1.2.9]: https://github.com/AdguardTeam/RulesEditor/compare/v1.2.8...v1.2.9
[1.2.8]: https://github.com/AdguardTeam/RulesEditor/compare/v1.2.7...v1.2.8
[1.2.7]: https://github.com/AdguardTeam/RulesEditor/compare/v1.2.6...v1.2.7
[1.2.6]: https://github.com/AdguardTeam/RulesEditor/compare/v1.2.5...v1.2.6
[1.2.5]: https://github.com/AdguardTeam/RulesEditor/compare/v1.2.4...v1.2.5
[1.2.4]: https://github.com/AdguardTeam/RulesEditor/compare/v1.2.3...v1.2.4
[1.2.3]: https://github.com/AdguardTeam/RulesEditor/compare/v1.2.2...v1.2.3
[1.2.2]: https://github.com/AdguardTeam/RulesEditor/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/AdguardTeam/RulesEditor/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/AdguardTeam/RulesEditor/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/AdguardTeam/RulesEditor/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/AdguardTeam/RulesEditor/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/AdguardTeam/RulesEditor/releases/tag/v1.0.0

[AdguardBrowserExtension#3607]: https://github.com/AdguardTeam/AdguardBrowserExtension/issues/3607

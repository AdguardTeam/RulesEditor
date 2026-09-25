# AdGuard Rules Editor

> **Note:** This package is developed in [AdGuardSoftwareLimited/ext-rules-editor].
> The [AdguardTeam/RulesEditor] repository is a public mirror.

A browser-based library for editing and tokenizing AdGuard filter rules.
It provides a **CodeMirror 6** text editor with TextMate syntax highlighting
(via WebAssembly Oniguruma backed by `vscode-textmate` + `vscode-oniguruma`)
and a WASM-backed tokenizer for custom rule rendering.

## Table of Contents

- [Installation](#installation)
- [Key Concepts](#key-concepts)
- [Quick Start](#quick-start)
    - [Editor](#editor)
        - [Theming](#theming)
        - [Highlighting strategy](#highlighting-strategy)
        - [Multi-cursor editing](#multi-cursor-editing)
    - [Tokenizing a Rule](#tokenizing-a-rule)
    - [Inspecting a Line (scope debugging)](#inspecting-a-line-scope-debugging)
- [API](#api)
    - [`initEditor`](#initeditor)
        - [Hotkeys](#hotkeys)
    - [`getTokenizer`](#gettokenizer)
    - [`inspectLine`](#inspectline)
    - [Rendering tokens to HTML (display-only)](#rendering-tokens-to-html-display-only)
        - [`renderTokensToHtml`](#rendertokenstohtml)
        - [`getHtmlRenderer`](#gethtmlrenderer)
        - [`mountHighlightStyle`](#mounthighlightstyle)
        - [`RenderOptions`](#renderoptions)
    - [Error Classes](#error-classes)
- [Peer Dependencies](#peer-dependencies)
- [Documentation](#documentation)

## Installation

`vscode-oniguruma` and CodeMirror/Lezer packages are peer dependencies —
your project must install them separately. `vscode-oniguruma` is required
so the WASM binary is available in your bundle; the CodeMirror packages
are required because the library returns a live `EditorView` instance.
CodeMirror's `@codemirror/state` relies on `instanceof` checks for
extensions and facets — if your bundler duplicates `@codemirror/state`
(the library bundles one copy and your app another), these checks will
fail. Externalizing the peer deps ensures a single shared copy.

```sh
pnpm add @adguard/rules-editor vscode-oniguruma @codemirror/state \
    @codemirror/view @codemirror/language @codemirror/commands \
    @codemirror/search @lezer/highlight
```

## Key Concepts

- **Editor** — a CodeMirror 6 instance with adblock syntax highlighting
  (embedded JavaScript regions are scoped as `source.js` but use a minimal
  placeholder grammar to keep the bundle small), powered by WASM-based
  Oniguruma regex from `vscode-oniguruma`.
- **Tokenizer** — splits a rule into highlighted segments using WASM;
  highest precision.
- **Token** — an enum of token types aligned with the CodeMirror 6 /
  `@lezer/highlight` tag taxonomy (`keyword`, `operator`, `string`,
  `comment`, `regexp`, etc.).
- **inspectLine** — returns per-token segments with full TextMate scope
  stacks for debugging and tests.

## Quick Start

### Editor

```js
import { initEditor } from '@adguard/rules-editor';

// Let your bundler (rspack / Vite) emit the asset and compute the URL.
const wasm = new URL('vscode-oniguruma/release/onig.wasm', import.meta.url);

const textarea = document.getElementById('textarea');
const view = await initEditor(textarea, wasm, {
    hotkeys: { mode: 'mac' },
});
view.dispatch({ changes: { from: 0, insert: '||example.org^' } });
```

#### Theming

Tokens are highlighted using standard `@lezer/highlight` tags, so any
CodeMirror 6 theme works out of the box. By default the editor applies
CodeMirror's `defaultHighlightStyle`; pass your own theme (or
`HighlightStyle`) via `conf.extensions` to override it:

```js
import { oneDark } from '@codemirror/theme-one-dark';

const view = await initEditor(textarea, wasm, {
    hotkeys: { mode: 'mac' },
    extensions: [oneDark],
});
```

`initEditor` always adds CodeMirror's `drawSelection()` extension, so the caret
and the selection are drawn by CodeMirror rather than by the browser: native
`::selection` and caret styles do not apply, and you should not add
`drawSelection()` yourself. Multi-cursor editing can be turned off with
`withMultipleSelections: false`, which disables the extra selection ranges while
leaving the drawing as it is.

#### Highlighting strategy

By default the editor uses full TextMate highlighting backed by Oniguruma
WASM. When you do not need syntax highlighting, choose
`highlight: 'none'` — it never loads WASM, so the `wasm` argument can be
`undefined`:

```js
// No highlighting at all, no WASM:
const plain = await initEditor(textarea, undefined, {
    hotkeys: { mode: 'mac' },
    highlight: 'none',
});
```

`initEditor` still returns a `Promise<EditorView>` for every strategy, so
existing `await initEditor(...)` call sites are unaffected.

#### Multi-cursor editing

The editor supports editing several lines at once. Hold `Ctrl` (Windows/Linux)
or `Cmd` (macOS) and click each line you want to edit: every click adds a
secondary cursor, and typing inserts the same text at all cursors. A single
`Ctrl+Z` / `Cmd+Z` reverts the whole multi-line edit. Holding the modifier and
clicking an existing secondary cursor removes it; a plain click collapses back
to a single cursor.

Set `withMultipleSelections: false` to switch multi-cursor editing off; without
it the editor cannot be turned back to single-selection mode from
`conf.extensions`, because `EditorState.allowMultipleSelections` combines its
values with `some`. Switching it off also leaves the keyboard commands below
unbound, so their chords fall through to CodeMirror's own keymap and to the
browser.

The same commands are available on the keyboard, with the bindings the previous
Ace-based editor used. Ace binds them to `Ctrl+Alt` on every platform, and on
macOS this library does the same — `Cmd+Alt` is deliberately not used there,
because Chrome and Firefox intercept `Cmd+Option+Left/Right` for previous/next
tab, so those shortcuts would never reach the editor:

- `Ctrl+Alt+Up` / `Ctrl+Alt+Down` — add a cursor on the line above / below;
- `Ctrl+Alt+Shift+Up` / `Ctrl+Alt+Shift+Down` — move the last cursor up / down
  instead of adding one; with a single cursor the first press adds one, as in
  Ace;
- `Ctrl+Alt+Right` / `Ctrl+Alt+Left` — add the next / previous occurrence of
  the selection;
- `Ctrl+Alt+Shift+Right` / `Ctrl+Alt+Shift+Left` — move the main cursor to the
  next / previous occurrence instead of adding one;
- `Esc` — collapse back to a single cursor.

A selection that spans several lines is moved by the line commands instead of
being copied: the copy would overlap the original and CodeMirror would merge
the two into one longer selection. When the move would leave the document the
command declines and the selection is left as it is — though on Windows and
Linux the chord then falls through to CodeMirror's own add-cursor commands
bound to the same keys, which can still add a bare cursor.

With an empty cursor the occurrence shortcuts select the word under the cursor
first — the search expands to the adjacent word when the cursor itself is not
on a word character, so it selects `example.com` on the `^` of
`||example.com^`. Letters, digits and combining marks are matched with Unicode
property escapes, so non-ASCII domains are selected as well.

`Ctrl+/` / `Cmd+/` comments (or uncomments) the line under every cursor and
toggles the enabled-rule marker on those lines, and `Ctrl+S` / `Cmd+S` triggers
the `onSave` handler.

On Linux desktops `Ctrl+Alt+Arrow` is usually captured by the window manager
for workspace switching, so those keys never reach the browser there; the mouse
gesture and the remaining shortcuts are unaffected.

### Tokenizing a Rule

```typescript
import { getTokenizer } from '@adguard/rules-editor';

// WASM-based (async init, highest precision)
const wasm = new URL('vscode-oniguruma/release/onig.wasm', import.meta.url);
const tokenize = await getTokenizer(wasm);
const tokens = tokenize('||example.org^$important');
```

### Inspecting a Line (scope debugging)

```typescript
import { inspectLine } from '@adguard/rules-editor';

const wasm = new URL('vscode-oniguruma/release/onig.wasm', import.meta.url);
const segments = await inspectLine(wasm, '||example.org^$important');
// segments: TokenSegment[] — each with text, startIndex, endIndex,
//            scopes (full TextMate scope stack), and token (resolved class)
```

## API

### `initEditor`

```typescript
async function initEditor(
    element: HTMLTextAreaElement,
    wasm: WasmSource,
    conf: InitEditorConfig,
): Promise<EditorView>
```

A `WasmSource` is a URL/string (fetched at runtime), `Response`,
`ArrayBuffer`, or a `Promise`/thunk resolving to any of these.

| Parameter                     | Description                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `element`                     | Textarea element to attach the editor to                                                                         |
| `wasm`                        | A `WasmSource` (see above). Required for `highlight: 'full'` (the default); pass `undefined` when using `'none'` |
| `conf.hotkeys.mode`           | OS mode for hotkey mapping (`'windows'` or `'mac'`)                                                              |
| `conf.hotkeys.toggleRule`     | Callback for Ctrl/Cmd+/ (toggle rule breakpoint)                                                                 |
| `conf.hotkeys.onSave`         | Callback for Ctrl/Cmd+S                                                                                          |
| `conf.hotkeys.markerColor`    | CSS color for the breakpoint marker                                                                              |
| `conf.hotkeys.markerHTML`     | Custom innerHTML for the breakpoint marker                                                                       |
| `conf.withMultipleSelections` | Enable multi-cursor editing (default `true`)                                                                     |
| `conf.withBreakpoints`        | Enable breakpoint gutter                                                                                         |
| `conf.onChange`               | Called after each document change                                                                                |
| `conf.extensions`             | Extra CodeMirror 6 extensions appended last                                                                      |
| `conf.highlight`              | Highlight strategy: `'full'` (WASM TextMate, default) or `'none'` (no WASM)                                      |
| `conf.autofocus`              | Focus the editor on creation (default `true`); pass `false` to manage focus yourself                             |

Returns a `CodeMirror.EditorView` instance. See the CodeMirror 6 docs for
[events](https://codemirror.net/6/docs/ref/#view.EditorView) and
[keymaps](https://codemirror.net/6/docs/ref/#commands).

#### Hotkeys

By default the editor is focused as soon as it is created (pass
`conf.autofocus: false` to opt out, e.g. when the host page mounts several
editors), so editor hotkeys work immediately. `Ctrl` means Windows/Linux,
`Cmd` means macOS — CodeMirror resolves the modifier from the user's platform
automatically, so the bindings below ignore `conf.hotkeys.mode` (the option
only selects the modifiers of the multi-cursor chords — see Multi-cursor
editing above). The search panel is rendered at the bottom of the editor by
default; pass your own `search({ top: true })` through `conf.extensions` to
change that.

- `Ctrl+F` / `Cmd+F` opens the search panel
- `Ctrl+H` opens the search panel with the focus in the replace field
  ("find & replace"; on Windows/Linux only — on macOS `Cmd+H` is reserved
  by the OS/browser, so `Cmd+Alt+F` is the "find & replace" shortcut there)
- `Ctrl+Alt+F` / `Cmd+Alt+F` opens the search panel with the focus in the
  replace field ("find & replace") on every platform
- `F3` or `Ctrl+G` finds the next match; `Shift+F3` or `Ctrl+Shift+G`
  finds the previous one (on macOS: `Cmd+G` / `Cmd+Shift+G`). On
  Windows/Linux the previous editor's `Ctrl+K` / `Ctrl+Shift+K` chords work
  as well; on macOS `Ctrl+K` keeps its "delete to line end" default
- `Escape` closes the search panel
- `Ctrl+Alt+G` / `Cmd+Alt+G` moves the cursor to a line with a given number
  ("go to line"); the previous editor's `Ctrl+L` / `Cmd+L` works as well
- `Alt+Up` / `Alt+Down` moves the selected lines up or down
- `Shift+Alt+Up` / `Shift+Alt+Down` copies the selected lines up or down
  (`Cmd+Option+Up` / `Cmd+Option+Down` on macOS, as in the previous editor)
- `Ctrl+D` / `Cmd+D` deletes the current line or selection
- `Ctrl+S` / `Cmd+S` triggers the `conf.hotkeys.onSave` callback
- `Ctrl+/` / `Cmd+/` toggles `!`/`#` comments on the selected lines

> **Note:** the chords restored from the previous (Ace-based) editor are
> registered before the CodeMirror defaults, so they win where both bind the
> same key: the macOS copy-lines chord `Cmd+Option+Arrow` supersedes "add
> cursor above/below", `Ctrl+D` / `Cmd+D` supersedes "select next
> occurrence" with "delete line", and on Windows/Linux `Ctrl+Shift+K`
> supersedes "delete line" with "find previous". "Select all occurrences"
> (`Ctrl+Shift+L` / `Cmd+Shift+L`) is left as CodeMirror binds it — it acts
> on the current selection and does nothing while no text is selected.

Like the search bindings (`Ctrl+F`, `F3`, `Ctrl+G`, `Escape`), the
find & replace, save, and comment-toggle shortcuts also work while the focus
is inside the open search panel.

The built-in keymaps are registered before `conf.extensions`. The AdGuard
bindings (line operations, multi-cursor, find & replace, save, and comment
toggle) run at `Prec.high`, and at equal precedence the earlier extension
wins, so a `Prec.high` binding added through `conf.extensions` cannot shadow
them — the built-in binding is consulted first. The stock CodeMirror keymaps
(`defaultKeymap`, `historyKeymap`, `searchKeymap`) run at the default
precedence instead, so a `Prec.high` binding in `conf.extensions` does
shadow them — `Mod-f` from `searchKeymap` is one example. To override an
AdGuard binding as well, raise the precedence of your keymap above the
built-ins with `Prec.highest(...)`:

```typescript
import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';

extensions: [
    // Overrides the AdGuard `Prec.high` bindings (and the stock keymaps).
    Prec.highest(keymap.of([{ key: 'Mod-s', run: mySaveCommand }])),
]
```

### `getTokenizer`

```typescript
async function getTokenizer(
    wasm: WasmSource,
): Promise<(rule: string) => RuleTokens>
```

| Parameter | Description                |
| --------- | -------------------------- |
| `wasm`    | A `WasmSource` (see above) |

Returns a function that accepts a rule string and returns `RuleTokens`
(`{ str: string, token: Token | null }[]`).

### `inspectLine`

```typescript
async function inspectLine(
    wasm: WasmSource,
    line: string,
    scopeName?: string,
): Promise<TokenSegment[]>
```

| Parameter   | Description                               |
| ----------- | ----------------------------------------- |
| `wasm`      | A `WasmSource` (see above)                |
| `line`      | The line of filter rule text to tokenize  |
| `scopeName` | Grammar scope; defaults to `text.adblock` |

Returns a contiguous, gap-free array of `TokenSegment` objects covering
the input line. Each segment has `text`, `startIndex`, `endIndex`,
`scopes` (full scope stack), and `token` (resolved class or `null`).

### Rendering tokens to HTML (display-only)

For read-only views (e.g. a virtualized list of rule rows) you can render a
token list to colorized HTML whose classes match the editor — without creating
a CodeMirror editor per row. Set `white-space: pre` on the container to
preserve spacing.

#### `renderTokensToHtml`

```typescript
function renderTokensToHtml(
    tokens: RuleTokens,
    options?: RenderOptions,
): string
```

| Parameter                | Description                                                    |
| ------------------------ | -------------------------------------------------------------- |
| `tokens`                 | Token list from `getTokenizer`                                 |
| `options.highlightStyle` | `HighlightStyle` or array; defaults to `defaultHighlightStyle` |

Returns an HTML string safe for `innerHTML`/`dangerouslySetInnerHTML`.

#### `getHtmlRenderer`

```typescript
async function getHtmlRenderer(
    wasm: WasmSource,
    options?: RenderOptions,
): Promise<(rule: string, search?: SearchHighlightOptions) => string>
```

| Parameter                | Description                  |
| ------------------------ | ---------------------------- |
| `wasm`                   | A `WasmSource` (see above)   |
| `options.highlightStyle` | Same as `renderTokensToHtml` |

Returns an async factory that initializes the grammar once, then returns a
synchronous `(rule, search?) => html` function for full-precision (WASM)
highlighting reusable across many rows.

The returned function accepts an optional `search` argument to highlight a
search term within the rule:

```typescript
interface SearchHighlightOptions {
    searchTerm?: string;     // plain-text, case-insensitive
    searchClassName?: string; // CSS class on each matched chunk
}
```

When `searchTerm` is a non-empty string, every case-insensitive occurrence —
including matches that span multiple tokens — is wrapped in a `<span>`
carrying `searchClassName`. Omitting `search` (or passing an empty term)
leaves the output identical to plain rendering. Both the matched text and
`searchClassName` are HTML-escaped.

```typescript
const render = await getHtmlRenderer(wasm);
// Plain rendering — unchanged from previous versions:
const html = render('||example.org^');
// With search highlighting:
const highlighted = render('||example.org^', {
    searchTerm: 'example',
    searchClassName: 'search-hit',
});
```

#### `mountHighlightStyle`

```typescript
function mountHighlightStyle(
    highlightStyle?: HighlightStyle,
    root?: Document | ShadowRoot,
): void
```

| Parameter        | Description                                                                         |
| ---------------- | ----------------------------------------------------------------------------------- |
| `highlightStyle` | Style whose CSS to mount; defaults to `defaultHighlightStyle`                       |
| `root`           | Target document or shadow root; defaults to `document` (no-ops in non-browser envs) |

Mounts a `HighlightStyle`'s CSS so emitted classes are colorized without an
editor. Call once; repeated calls are idempotent.

#### `RenderOptions`

```typescript
interface RenderOptions {
    highlightStyle?: HighlightStyle | HighlightStyle[];
}
```

Pass a custom `HighlightStyle` (e.g. `oneDarkHighlightStyle`) to match a
custom editor theme.

### Error Classes

| Class                  | Description                                           |
| ---------------------- | ----------------------------------------------------- |
| `WasmLoadError`        | Thrown when the Oniguruma WASM binary fails to load   |
| `GrammarNotFoundError` | Thrown when a grammar scope has no registration       |

## Peer Dependencies

| Package                | Version   |
| ---------------------- | --------- |
| `vscode-oniguruma`     | `^2.0.1`  |
| `@codemirror/commands` | `^6.10.3` |
| `@codemirror/language` | `^6.12.3` |
| `@codemirror/search`   | `^6.7.0`  |
| `@codemirror/state`    | `^6.6.0`  |
| `@codemirror/view`     | `^6.43.0` |
| `@lezer/highlight`     | `^1.2.3`  |

## Documentation

- [Development](DEVELOPMENT.md)
- [Deployment](DEPLOYMENT.md)
- [LLM agent rules](AGENTS.md)
- [Changelog](CHANGELOG.md)

[AdGuardSoftwareLimited/ext-rules-editor]: https://github.com/AdGuardSoftwareLimited/ext-rules-editor
[AdguardTeam/RulesEditor]: https://github.com/AdguardTeam/RulesEditor

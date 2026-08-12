# AdGuard Rules Editor

> **Note:** This package is developed in [AdGuardSoftwareLimited/ext-rules-editor].
> The [AdguardTeam/RulesEditor] repository is a public mirror.

A browser-based library for editing and tokenizing AdGuard filter rules.
It provides a **CodeMirror 6** text editor with TextMate syntax highlighting
(via WebAssembly Oniguruma backed by `vscode-textmate` + `vscode-oniguruma`)
and a WASM-backed tokenizer for custom rule rendering.

## Installation

`vscode-oniguruma` and CodeMirror/Lezer packages are peer dependencies —
your project must install them separately. `vscode-oniguruma` is required
so the WASM binary is available in your bundle; the CodeMirror packages
are required because the library returns a live `EditorView` instance.
CodeMirror's `@codemirror/state` relies on `instanceof` checks for
extensions and facets — if your bundler duplicates `@codemirror/state`
(the library bundles one copy and your app another), these checks will
fail. Externalizing the peer deps ensures a single shared copy.`

```sh
pnpm add @adguard/rules-editor vscode-oniguruma @codemirror/state @codemirror/view @codemirror/language @codemirror/commands @codemirror/search @lezer/highlight
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

| Parameter | Description |
| --- | --- |
| `element` | Textarea element to attach the editor to |
| `wasm` | WASM source — URL/string (fetched), `Response`, `ArrayBuffer`, or a `Promise`/thunk of these. Required for `highlight: 'full'` (the default); pass `undefined` when using `'none'` |
| `conf.hotkeys.mode` | OS mode for hotkey mapping (`'windows'` or `'mac'`) |
| `conf.hotkeys.toggleRule` | Callback for Ctrl/Cmd+/ (toggle rule breakpoint) |
| `conf.hotkeys.onSave` | Callback for Ctrl/Cmd+S |
| `conf.hotkeys.markerColor` | CSS color for the breakpoint marker |
| `conf.hotkeys.markerHTML` | Custom innerHTML for the breakpoint marker |
| `conf.withBreakpoints` | Enable breakpoint gutter |
| `conf.onChange` | Called after each document change |
| `conf.extensions` | Extra CodeMirror 6 extensions appended last |
| `conf.highlight` | Highlight strategy: `'full'` (WASM TextMate, default) or `'none'` (no WASM) |

Returns a `CodeMirror.EditorView` instance. See the CodeMirror 6 docs for
[events](https://codemirror.net/6/docs/ref/#view.EditorView) and
[keymaps](https://codemirror.net/6/docs/ref/#commands).

### `getTokenizer`

```typescript
async function getTokenizer(
    wasm: WasmSource,
): Promise<(rule: string) => RuleTokens>
```

| Parameter | Description |
| --- | --- |
| `wasm` | WASM source — URL/string (fetched), `Response`, `ArrayBuffer`, or a `Promise`/thunk of these |

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

| Parameter | Description |
| --- | --- |
| `wasm` | WASM source — URL/string (fetched), `Response`, `ArrayBuffer`, or a `Promise`/thunk of these |
| `line` | The line of filter rule text to tokenize |
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

| Parameter | Description |
| --- | --- |
| `tokens` | Token list from `getTokenizer` |
| `options.highlightStyle` | `HighlightStyle` or array; defaults to `defaultHighlightStyle` |

Returns an HTML string safe for `innerHTML`/`dangerouslySetInnerHTML`.

#### `getHtmlRenderer`

```typescript
async function getHtmlRenderer(
    wasm: WasmSource,
    options?: RenderOptions,
): Promise<(rule: string, search?: SearchHighlightOptions) => string>
```

| Parameter | Description |
| --- | --- |
| `wasm` | WASM source — URL/string/`Response`/`ArrayBuffer`/Promise/thunk |
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

| Parameter | Description |
| --- | --- |
| `highlightStyle` | Style whose CSS to mount; defaults to `defaultHighlightStyle` |
| `root` | Target document or shadow root; defaults to `document` (no-ops in non-browser envs) |

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

| Class | Description |
| --- | --- |
| `WasmLoadError` | Thrown when the Oniguruma WASM binary fails to load |
| `GrammarNotFoundError` | Thrown when a grammar scope has no registration |

## Peer Dependencies

| Package | Version |
| --- | --- |
| `vscode-oniguruma` | `^2.0.1` |
| `@codemirror/commands` | `^6.10.3` |
| `@codemirror/language` | `^6.12.3` |
| `@codemirror/search` | `^6.7.0` |
| `@codemirror/state` | `^6.6.0` |
| `@codemirror/view` | `^6.43.0` |
| `@lezer/highlight` | `^1.2.3` |

## Documentation

- [Development](DEVELOPMENT.md)
- [Deployment](DEPLOYMENT.md)
- [LLM agent rules](AGENTS.md)
- [Changelog](CHANGELOG.md)

[AdGuardSoftwareLimited/ext-rules-editor]: https://github.com/AdGuardSoftwareLimited/ext-rules-editor
[AdguardTeam/RulesEditor]: https://github.com/AdguardTeam/RulesEditor

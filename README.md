# AdGuard Rules Editor

A browser-based library for editing and tokenizing AdGuard filter rules.
It provides a **CodeMirror 6** text editor with TextMate syntax highlighting
(via WebAssembly Oniguruma backed by `vscode-textmate` + `vscode-oniguruma`),
two tokenizers for custom rule rendering, and a `RulesBuilder` for
programmatic rule construction.

## Installation

```sh
pnpm add @adguard/rules-editor
```

## Key Concepts

- **Editor** — a CodeMirror 6 instance with adblock syntax highlighting
  (including embedded JavaScript highlighting via `source.js`), powered by
  WASM-based Oniguruma regex from `vscode-oniguruma`.
- **Full tokenizer** — splits a rule into highlighted segments using WASM;
  highest precision.
- **Simple tokenizer** — regex-based tokenizer without WASM; slightly
  less precise but no async setup required.
- **RulesBuilder** — factory class that constructs filter rules (block,
  unblock, no-filtering, DNS, comment, custom) via a builder pattern.
- **Token** — an enum of token types aligned with the CodeMirror 6 /
  `@lezer/highlight` tag taxonomy (`keyword`, `operator`, `string`,
  `comment`, `regexp`, etc.) shared by both tokenizers.
- **inspectLine** — returns per-token segments with full TextMate scope
  stacks for debugging and tests.

## Quick Start

### Editor

```js
import { initEditor } from '@adguard/rules-editor';

// Let your bundler (webpack 5 / Vite) emit the asset and compute the URL.
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

### Tokenizing a Rule

```typescript
import { getFullTokenizer, simpleTokenizer } from '@adguard/rules-editor';

// WASM-based (async init, higher precision)
const wasm = new URL('vscode-oniguruma/release/onig.wasm', import.meta.url);
const tokenize = await getFullTokenizer(wasm);
const tokens = tokenize('||example.org^$important');

// Simple (sync, no WASM)
const tokens2 = simpleTokenizer('||example.org^$important');
```

### Inspecting a Line (scope debugging)

```typescript
import { inspectLine } from '@adguard/rules-editor';

const wasm = new URL('vscode-oniguruma/release/onig.wasm', import.meta.url);
const segments = await inspectLine(wasm, '||example.org^$important');
// segments: TokenSegment[] — each with text, startIndex, endIndex,
//            scopes (full TextMate scope stack), and token (resolved class)
```

### Building a Rule

```typescript
import { RulesBuilder, BlockContentTypeModifiers, DomainModifiers } from '@adguard/rules-editor';

const rule = RulesBuilder.getRuleByType('block');
rule.setDomain('example.org');
rule.setContentType([BlockContentTypeModifiers.css, BlockContentTypeModifiers.scripts]);
rule.setHighPriority(true);
rule.setDomainModifiers(DomainModifiers.onlyListed, ['example.com', 'example.ru']);

rule.buildRule();
// => '||example.org^$stylesheet,script,domain=example.com|example.ru,important'
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
| `wasm` | WASM source — URL/string (fetched), `Response`, `ArrayBuffer`, or a `Promise`/thunk of these |
| `conf.hotkeys.mode` | OS mode for hotkey mapping (`'windows'` or `'mac'`) |
| `conf.hotkeys.toggleRule` | Callback for Ctrl/Cmd+/ (toggle rule breakpoint) |
| `conf.hotkeys.onSave` | Callback for Ctrl/Cmd+S |
| `conf.hotkeys.markerColor` | CSS color for the breakpoint marker |
| `conf.hotkeys.markerHTML` | Custom innerHTML for the breakpoint marker |
| `conf.withBreakpoints` | Enable breakpoint gutter |
| `conf.onChange` | Called after each document change |
| `conf.extensions` | Extra CodeMirror 6 extensions appended last |

Returns a `CodeMirror.EditorView` instance. See the CodeMirror 6 docs for
[events](https://codemirror.net/6/docs/ref/#view.EditorView) and
[keymaps](https://codemirror.net/6/docs/ref/#commands).

### `getFullTokenizer`

```typescript
async function getFullTokenizer(
    wasm: WasmSource,
): Promise<(rule: string) => RuleTokens>
```

| Parameter | Description |
| --- | --- |
| `wasm` | WASM source — URL/string (fetched), `Response`, `ArrayBuffer`, or a `Promise`/thunk of these |

Returns a function that accepts a rule string and returns `RuleTokens`
(`{ str: string, token: Token | null }[]`). No `theme` argument.

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

### `simpleTokenizer`

```typescript
function simpleTokenizer(rule: string): RuleTokens
```

Lightweight regex-based tokenizer requiring no async WASM setup.

### `RulesBuilder`

```typescript
import { RulesBuilder } from '@adguard/rules-editor';

RulesBuilder.getRuleByType('block');
RulesBuilder.getRuleByType('unblock');
RulesBuilder.getRuleByType('noFiltering');
RulesBuilder.getRuleByType('dns');
RulesBuilder.getRuleByType('comment');
RulesBuilder.getRuleByType('custom');
```

Returns a rule builder instance. See the TypeScript types for the full
builder API.

### Error Classes

| Class | Description |
| --- | --- |
| `WasmLoadError` | Thrown when the Oniguruma WASM binary fails to load |
| `GrammarNotFoundError` | Thrown when a grammar scope has no registration |
| `UnknownThemeError` | Thrown when an unknown theme name is requested |

## Migration (v1 -> v2)

- **`initEditor`** now returns a CodeMirror 6 `EditorView` instead of a CM5
  `EditorFromTextArea`. Use the CM6 API for document manipulation and events.
- **WASM backend** changed from `onigasm` to `vscode-oniguruma`. The library
  no longer exports a `wasm` URL. Pass a flexible `WasmSource` instead:
  `new URL('vscode-oniguruma/release/onig.wasm', import.meta.url)`.
- **`getFullTokenizer`** no longer accepts a `theme` argument.
- **`configureEditorMode`** and **`EDITOR_DEFAULT_MODE`** removed.
- **Editor commands** (comment toggle, line move/copy, search) are now
  CodeMirror 6 built-ins rather than custom CM5 addons.
- **Test runner** changed from Jest to Vitest. Run `pnpm test` (Vitest).

### `normalizeTokens`

```typescript
function normalizeTokens(rule: RuleTokens): RuleTokens
```

Merges adjacent segments with identical token types into single segments.
Used internally by `getFullTokenizer`; exposed for custom tokenization
pipelines.

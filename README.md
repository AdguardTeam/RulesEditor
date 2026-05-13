# AdGuard Rules Editor

A browser-based library for editing and tokenizing AdGuard filter rules.
It provides a CodeMirror 5 text editor with TextMate syntax highlighting
(via WebAssembly Oniguruma), two tokenizers for custom rule rendering,
and a `RulesBuilder` for programmatic rule construction.

## Installation

```sh
pnpm add @adguard/rules-editor
```

## Key Concepts

- **Editor** — a CodeMirror 5 instance with adblock syntax highlighting,
  powered by WASM-based Oniguruma regex via `onigasm`.
- **Full tokenizer** — splits a rule into highlighted segments using WASM;
  highest precision.
- **Simple tokenizer** — regex-based tokenizer without WASM; slightly
  less precise but no async setup required.
- **RulesBuilder** — factory class that constructs filter rules (block,
  unblock, no-filtering, DNS, comment, custom) via a builder pattern.
- **Token** — an enum of token types (`keyword`, `operator`, `string`,
  `comment`, etc.) shared by both tokenizers.

## Quick Start

### Editor

```js
import { initEditor } from '@adguard/rules-editor';
import wasm from '@adguard/rules-editor/dist/onigasm.wasm';
import '@adguard/rules-editor/dist/codemirror.css';

const textarea = document.getElementById('textarea');
const editor = await initEditor(textarea, wasm, {
    hotkeys: { mode: 'mac' },
});
editor.setValue('||example.org^');
```

### Tokenizing a Rule

```typescript
import { getFullTokenizer, simpleTokenizer } from '@adguard/rules-editor';
import wasm from '@adguard/rules-editor/dist/onigasm.wasm';

// WASM-based (async init, higher precision)
const tokenize = await getFullTokenizer(wasm);
const tokens = tokenize('||example.org^$important');

// Simple (sync, no WASM)
const tokens2 = simpleTokenizer('||example.org^$important');
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
    wasm: any,
    conf: {
        withBreakpoints?: boolean;
        onChange?: (editor: CodeMirror.Editor, makeMarker: () => HTMLDivElement) => void;
        hotkeys: {
            mode: 'windows' | 'mac';
            markerColor?: string;
            markerHTML?: string;
            toggleRule?: (editor: CodeMirror.Editor) => void;
            onSave?: (editor: CodeMirror.Editor) => void;
        };
        editor?: CodeMirror.EditorConfiguration;
        theme?: ITextmateThemePlus;
    },
): Promise<EditorFromTextArea>
```

| Parameter | Description |
| --- | --- |
| `element` | Textarea element to attach the editor to |
| `wasm` | WASM binary (re-exported from onigasm) |
| `conf.hotkeys.mode` | OS mode for hotkey mapping (`'windows'` or `'mac'`) |
| `conf.hotkeys.toggleRule` | Callback for Ctrl/Cmd+/ (toggle rule) |
| `conf.hotkeys.onSave` | Callback for Ctrl/Cmd+S |
| `conf.editor` | Extra [CodeMirror config](https://codemirror.net/5/doc/manual.html#option_extraKeys) |
| `conf.theme` | Theme object for syntax highlighting |
| `conf.withBreakpoints` | Enable breakpoint gutter |
| `conf.onChange` | Editor change callback |

Returns a `CodeMirror.EditorFromTextArea` instance. See CodeMirror docs
for [events](https://codemirror.net/5/doc/manual.html#events) and
[commands](https://codemirror.net/5/doc/manual.html#commands).

### `getFullTokenizer`

```typescript
async function getFullTokenizer(
    wasm: any,
    theme?: ITextmateThemePlus,
): Promise<(rule: string) => RuleTokens>
```

Returns a tokenizer function. When `theme` is provided, the `token`
field contains CSS class names from that theme instead of generic token
names.

### `simpleTokenizer`

```typescript
function simpleTokenizer(rule: string): RuleTokens
```

Synchronous tokenizer. Same `RuleTokens` return type as the full
tokenizer, but with slightly less granular splitting.

### Tokenizer Comparison

For `@@|https://example.org/file.js$domain=a.com|b.com`:

| Tokenizer | Behavior |
| --- | --- |
| `simpleTokenizer` | Domain list as single `string` token |
| `getFullTokenizer` | Domain list split per domain with `operator` separators |

### `RulesBuilder`

```typescript
class RulesBuilder {
    static getRuleByType(type: 'block'): BlockRequestRule;
    static getRuleByType(type: 'unblock'): UnblockRequestRule;
    static getRuleByType(type: 'noFiltering'): NoFilteringRule;
    static getRuleByType(type: 'custom'): CustomRule;
    static getRuleByType(type: 'comment'): Comment;

    static getDnsRuleByType(type: 'block'): DNSRule;
    static getDnsRuleByType(type: 'unblock'): DNSRule;
    static getDnsRuleByType(type: 'custom'): CustomRule;
    static getDnsRuleByType(type: 'comment'): Comment;

    static isDomainValid(domain: string): boolean;
    static isRuleValid(rule: string): boolean;
    static getRuleType(rule: string): RuleType | null;
    static getRuleFromRuleString(rule: string): BasicRule | null;
}
```

**Rule types:** `'block'` | `'unblock'` | `'noFiltering'` | `'custom'`
| `'comment'`

**Common builder methods:**

| Method | Description |
| --- | --- |
| `setDomain(domain)` | Set rule domain |
| `setContentType(modifiers[])` | Set content type modifiers |
| `setDomainModifiers(modifier, domains?)` | Set domain scope |
| `setHighPriority(priority)` | Add `$important` modifier |
| `buildRule()` | Build the rule string |

**DNS rule** additionally has `setIsIncludingSubdomains(bool)`.

**Per-class differences:**

- **Comment** — `setText(text)` / `buildRule()`
- **CustomRule** — `setRule(rule)` / `buildRule()` (returns rule as-is)
- **NoFilteringRule** — `setDomain`, `getDomain`, `setContentType`
  (accepts `ExceptionSelectModifiers[]`), `setHighPriority`, `buildRule`
- **UnblockRequestRule** — same as BlockRequestRule but accepts
  `UnblockContentTypeModifier[]`
- **DNSRule** — `setDomain`, `getDomain`,
  `setIsIncludingSubdomains(bool)`, `getIsIncludingSubdomains()`,
  `buildRule`

### Editor Helpers

```typescript
// Extract rules with enabled/disabled state from editor
function getRulesFromEditor(
    editor: CodeMirror.Editor,
): { enabled: boolean; rule: string }[] | string;

// Set editor content with gutter markers for enabled rules
function setEditorValue(
    editor: CodeMirror.Editor,
    value: { enabled: boolean; rule: string }[],
    markerOptions: { color?: string; innerHTML?: string },
): void;

// Disable syntax highlighting when editor exceeds 1000 lines
function configureEditorMode(editor: CodeMirror.Editor): void;
```

### WASM Re-export

The library re-exports the onigasm WASM binary for convenience:

```typescript
import { wasm } from '@adguard/rules-editor';
```

### Rendering Tokens (React Example)

```tsx
import { simpleTokenizer } from '@adguard/rules-editor';

function HighlightedRule({ rule }: { rule: string }) {
    return (
        <>
            {simpleTokenizer(rule).map(({ token, str }, i) => (
                <span key={i} className={token ?? 'plain'}>
                    {str}
                </span>
            ))}
        </>
    );
}
```

### Helper Exports

```typescript
// Content type modifiers
export { BlockContentTypeModifiers, UnblockContentTypeModifier } from './rulesBuilder/rules/utils';
// Domain scope modifiers
export { DomainModifiers } from './rulesBuilder/rules/utils';
// Exception modifiers for noFiltering rules
export { ExceptionSelectModifiers } from './rulesBuilder/rules/utils';
// Rule type enums
export { RuleType, DnsRuleType } from './rulesBuilder/RulesBuilder';
// Token enum and RuleTokens type
export type { RuleTokens } from './lib/utils';
```

## Documentation

- [Development](DEVELOPMENT.md)
- [LLM agent rules](AGENTS.md)
- [Changelog](CHANGELOG.md)

# AdGuard Rules Editor

This project provides a convenient text editor with support for filter rule syntaxes. It's built upon the [AdGuard VSCode extension](https://github.com/AdguardTeam/VscodeAdblockSyntax), [CodeMirror 5](https://codemirror.net/5/), and [codemirror-textmate](https://github.com/zikaari/codemirror-textmate). Since JavaScript does not support all RegExp capabilities (such as lookbehind) that are utilized within tmLanguage, this project leverages WebAssembly [onigasm](https://github.com/zikaari/onigasm) - a port of the Oniguruma regex library, via codemirror-textmate.

Additionally, it provides tokenizers for splitting a filter rule into tokenized parts, which aids in highlighting individual segments of a single rule and RulesBuilder class that can help users to create simple rules.

## Installation
```sh
yarn add @adguard/rules-editor
```

## Usage

### Text Editor

```js
import { initEditor } from '@adguard/rules-editor';
// wasm is reexported from the onigasm library
import wasm from '@adguard/rules-editor/dist/onigasm.wasm';
// css is reexported from codemirror
import '@adguard/rules-editor/dist/codemirror.css';

// Add a textarea element into your HTML with an id
const load = async () => {
    const textarea = document.getElementById('textarea');
    const editor = await initEditor(textarea, wasm);
    editor.setValue(rule);
};
```


### CodeMirror Tokenizer with WebAssembly
```typescript
import { getFullTokenizer } from '@adguard/rules-editor';
// wasm is reexported from the onigasm library
import wasm from '@adguard/rules-editor/dist/onigasm.wasm';


const convertTokenToCssClass = (token: string) => {
    switch (token) {
        case 'keyword':
            return 'class_keyword';
        ...
    }
}

// Example with React
const rule = 'any filter rule';
const split = async () => {
    const tokenizer = await getFullTokenizer(wasm);
    return tokenizer(rule).map(({ token, str }) => (
        <span key={str} className={convertTokenToCssClass(token)}>
            {str}
        </span>
    ));
};


```
### Simple Tokenizer without WebAssembly
```typescript
import { simpleTokenizer } from '@adguard/rules-editor';
// wasm is reexported from the onigasm library
import wasm from '@adguard/rules-editor/dist/onigasm.wasm';


const convertTokenToCssClass = (token: string) => {
    switch (token) {
        case 'keyword':
            return 'class_keyword';
        ...
    }
}

// Example with React
const rule = 'any filter rule';
const split = () => {
    return simpleTokenizer(rule).map(({ token, str }) => (
        <span key={str} className={convertTokenToCssClass(token)}>
            {str}
        </span>
    ));
};
```


## API

### `initEditor`

```typescript
 async initEditor(
    element: HTMLTextAreaElement,
    wasm: any,
    theme?: ITextmateThemePlus, // import type { ITextmateThemePlus } from 'codemirror-textmate';
    conf?: CodeMirror.EditorConfiguration
):  Promise<CodeMirror.EditorFromTextArea>
```
- `element` - Textarea element in your HTML
- `wasm` - WebAssembly module provided by onigasm
- `theme` - Usually a JSON object with a theme for syntax and editor highlighting
- `conf` - Configuration for extended initialization of CodeMirror. You can find further information regarding the configuration options in the [CodeMirror documentation](https://codemirror.net/5/doc/manual.html#option_extraKeys), which offers a wide range of diverse configuration capabilities.

Returns an editor instance for interaction: `CodeMirror.EditorFromTextArea`.
You can utilize this instance to define different event handlers as well as execute various commands by referring to the [events](https://codemirror.net/5/doc/manual.html#events) and [commands](https://codemirror.net/5/doc/manual.html#commands) sections in the CodeMirror documentation.

### Tokenizers

The library offers two different types of tokenizers: the first one is obtained from the `getFullTokenizer` function, and the second  `simpleTokenizer` function. These tokenizers have varying levels of precision, as the `simpleTokenizer` function does not utilize WebAssembly.

For example:

For rule `@@|https://example.org/unified/someJsFile.js$domain=domain.one.com|domaintwo.com|domainthree.com`

`simpleTokenizer` result:
```js
    [
        { token: 'keyword', str: '@@|' },
        { token: null, str: 'https://example.org/unified/someJsFile.js' },
        { token: 'keyword', str: '$domain' },
        { token: 'operator', str: '=' },
        { token: 'string', str: 'domain.one.com|domaintwo.com|domainthree.com' },
    ]
```
Tokenizer received from `getFullTokenizer` result:
```js
    [
        { token: 'keyword', str: '@@|' },
        { token: null, str: 'https://example.org/unified/someJsFile.js' },
        { token: 'keyword', str: '$domain' },
        { token: 'operator', str: '=' },
        { token: 'string', str: 'domain.one.com' },
        { token: 'operator', str: '|' },
        { token: 'string', str: 'domaintwo.com' },
        { token: 'operator', str: '|' },
        { token: 'string', str: 'domainthree.com' }
    ]
```

If you prefer not to use WebAssembly but still want to highlight your rules with slightly less precision, you can utilize the `simpleTokenizer` function.

### `getFullTokenizer`
```typescript
async getFullTokenizer(
    wasm: any,
    theme?: ITextmateThemePlus
): Promise<(rule: string) => RuleTokens | { str: string, token: string | null }[]>
```
- `wasm` - WebAssembly module provided by onigasm
- `theme` - Usually a JSON object with a theme for syntax highlighting, same as for the editor

Returns a function that can tokenize a filter rule.
Important Note: When a theme is passed as an argument to the function, the `token` field in the returned result will contain the name of the CSS class associated with that token in accordance with your theme.


### `simpleTokenizer`
```typescript
simpleTokenizer(rule: string): RuleTokens
```
- `rule` - filter rule

The function returns a tokenized rule, with the same tokens and return type as the tokenizer obtained from the `getFullTokenizer` function.
Because it does not utilize WebAssembly, the outcome is not as precise as the tokenizer obtained from `getFullTokenizer`.


## Grammars

Highlighting for filter rules utilizes a textmate file from the [AdGuard VSCode extension](https://github.com/AdguardTeam/VscodeAdblockSyntax/blob/master/syntaxes/adblock.yaml-tmlanguage). A script is provided for updating it to the latest version:
```sh
yarn loadGrammar 
```

The AdGuard syntax has a dependency on the source.js grammar. Here, js.tmLanguage.json is used, based on [TypeScript-tmLanguage](https://github.com/Microsoft/TypeScript-TmLanguage/blob/master/TypeScriptReact.tmLanguage).


## `RulesBuilder`
The `RulesBuilder` class offers static methods to acquire the RulesBuilder for a particular rule type, check the validity of rule domains, and validate completed rules. It simplifies the process of creating user rules without the need to worry about grammar.

### Usage

```typescript
    import { RulesBuilder, ContentTypeModifiers, DomainModifiers } from '@adguard/rules-editor';
    
    const rule = RulesBuilder.getRuleByType('block');
    rule.setDomain('example.org');
    rule.setContentType([ContentTypeModifiers.css, ContentTypeModifiers.scripts]);
    rule.setHighPriority(true);
    rule.setDomainModifiers(DomainModifiers.onlyListed, [
        'example.com',
        'example.ru'
    ]);
    const result = '||example.org^$stylesheet,script,domain=example.com|example.ru,important'
    expect(rule.buildRule()).toEqual(result);

```

### API
```typescript 
    class RulesBuilder {
        // getRuleByType - Return correct rule builder for each type of creating rule
        static getRuleByType(type: 'block'): RequestRule;
        static getRuleByType(type: 'unblock'): RequestRule;
        static getRuleByType(type: 'noFiltering'): NoFilteringRule;
        static getRuleByType(type: 'custom'): CustomRule;
        static getRuleByType(type: 'comment'): Comment;
        static getDnsRuleByType(type: 'block'): DNSRule;
        static getDnsRuleByType(type: 'unblock'): DNSRule;
        static getDnsRuleByType(type: 'custom'): CustomRule;
        static getDnsRuleByType(type: 'comment'): Comment;
    }

    class Comment implements BasicRule {
        // Set comment text
        setText(text: string): void;
        // Build comment from current text
        buildRule(): string;
    }

    class CustomRule implements BasicRule {
        // Set custom rule
        setRule(rule: string): void;
        // Return rule as it is
        buildRule(): string;
    }

    class NoFilteringRule implements BasicRule {
        // Set rule domain
        setDomain(domain: string): void;
        getDomain(): string;
        // Set modifiers, which exceptions should be used for this rule
        setContentType(modifiers: ExceptionModifiers[]): void;
        // Set rule priority
        setHighPriority(priority: boolean): void;
        // Transform rule to string
        buildRule(): string;
    }

    class RequestRule implements BasicRule {
        // Set rule domain
        setDomain(domain: string): void;
        getDomain(): string;
        // Set modifiers, which content should be blocked for this rule
        setContentType(modifiers: ContentTypeModifiers[]): void;
        // Set on which domains this rule should be used
        setDomainModifiers(modifier: DomainModifiers, domains?: string[]): void;
        // Set rule priority
        setHighPriority(priority: boolean): void;
        // Transform rule to string
        buildRule(): string;
    }

    class DNSRule implements BasicRule {
        // Set rule domain
        setDomain(domain: string): void;
        getDomain(): string;
        // Set if rule should include subdomains
        setIsIncludingSubdomains(includingSubdomains: boolean): void;
        // Get if rule includes subdomains
        getIsIncludingSubdomains(): boolean;
        // Transform rule to string
        buildRule(): string;
    }
}
```

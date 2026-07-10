import { Token } from '../lib/utils';

interface ScopeNode {
    $?: Token;
    [segment: string]: ScopeNode | Token | undefined;
}

/**
 * Hierarchical TextMate-scope to {@link Token} map. A `$` key holds the token
 * for that node; child keys are scope segments. Tokens follow the CodeMirror 6
 * (`@lezer/highlight`) tag taxonomy so themes apply automatically.
 */
const scopeTree: ScopeNode = {
    comment: { $: Token.Comment },
    constant: {
        $: Token.Atom,
        character: { escape: { $: Token.Escape } },
        language: { $: Token.Atom },
        numeric: { $: Token.Number },
        other: { email: { link: { $: Token.Link } }, symbol: { $: Token.Atom } },
    },
    entity: {
        name: {
            class: { $: Token.ClassName },
            function: { $: Token.Function },
            tag: { $: Token.TagName },
            type: { $: Token.TypeName, class: { $: Token.ClassName } },
        },
        other: {
            'attribute-name': { $: Token.AttributeName },
            'inherited-class': { $: Token.ClassName },
        },
        support: { function: { $: Token.Function } },
    },
    invalid: { $: Token.Invalid, deprecated: { $: Token.Invalid } },
    keyword: {
        $: Token.Keyword,
        operator: { $: Token.Operator },
        other: { unit: { $: Token.Number } },
    },
    markup: {
        bold: { $: Token.Strong },
        heading: { $: Token.Heading },
        italic: { $: Token.Emphasis },
        list: { $: Token.List },
        quote: { $: Token.Quote },
        raw: { $: Token.Monospace },
        underline: { link: { $: Token.Link } },
    },
    meta: { $: Token.Meta },
    storage: { $: Token.Keyword, type: { $: Token.TypeName } },
    string: { $: Token.String, regexp: { $: Token.Regexp } },
    support: {
        $: Token.Standard,
        class: { $: Token.Special, builtin: { $: Token.Special } },
        constant: { $: Token.Special },
        function: { $: Token.Function },
        type: { $: Token.TypeName },
        variable: { $: Token.Special },
    },
    variable: {
        $: Token.VariableName,
        language: { $: Token.Self },
        other: {
            object: { $: Token.VariableName },
            property: { $: Token.PropertyName },
        },
        parameter: { $: Token.Definition },
    },
};

/**
 * Resolves a single TextMate scope name to a {@link Token}, walking from the
 * most specific segment back to the most general until a mapping is found.
 *
 * @param scope A dot-separated TextMate scope name.
 *
 * @returns The mapped {@link Token}, or `null` if the scope is unmapped.
 */
export function scopeToToken(scope: string): Token | null {
    const segments = scope.split('.');
    let node: ScopeNode | undefined = scopeTree[segments[0]!] as ScopeNode | undefined;
    if (!node) {
        return null;
    }
    let token: Token | null = node.$ ?? null;
    for (let i = 1; i < segments.length; i += 1) {
        const next = node[segments[i]!] as ScopeNode | undefined;
        if (!next) {
            break;
        }
        node = next;
        if (node.$ !== undefined) {
            token = node.$;
        }
    }
    return token;
}

/**
 * Resolves a TextMate scope stack to a single {@link Token}, preferring the
 * innermost scope that maps to a token.
 *
 * @param scopes The scope stack (outer to inner) for a token.
 *
 * @returns The resolved {@link Token}, or `null` if none map.
 */
export function resolveToken(scopes: string[]): Token | null {
    for (let i = scopes.length - 1; i >= 0; i -= 1) {
        const token = scopeToToken(scopes[i]!);
        if (token) {
            return token;
        }
    }
    return null;
}

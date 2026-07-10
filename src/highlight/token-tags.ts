import { type Tag, tags } from '@lezer/highlight';

import { Token } from '../lib/utils';

/**
 * Maps each {@link Token} to a standard `@lezer/highlight` {@link Tag}. Using
 * the canonical tags (rather than anonymous `Tag.define()` tags) lets the
 * built-in `defaultHighlightStyle` and any consumer-supplied CodeMirror 6 theme
 * style adblock tokens automatically.
 */
export const tokenTags: Record<Token, Tag> = {
    [Token.Atom]: tags.atom,
    [Token.AttributeName]: tags.attributeName,
    [Token.ClassName]: tags.className,
    [Token.Comment]: tags.comment,
    [Token.Definition]: tags.definition(tags.variableName),
    [Token.Emphasis]: tags.emphasis,
    [Token.Escape]: tags.escape,
    [Token.Function]: tags.function(tags.variableName),
    [Token.Heading]: tags.heading,
    [Token.Invalid]: tags.invalid,
    [Token.Keyword]: tags.keyword,
    [Token.Link]: tags.link,
    [Token.List]: tags.list,
    [Token.Meta]: tags.meta,
    [Token.Monospace]: tags.monospace,
    [Token.Number]: tags.number,
    [Token.Operator]: tags.operator,
    [Token.PropertyName]: tags.propertyName,
    [Token.Quote]: tags.quote,
    [Token.Regexp]: tags.regexp,
    [Token.Self]: tags.self,
    [Token.Special]: tags.special(tags.variableName),
    [Token.Standard]: tags.standard(tags.variableName),
    [Token.Strong]: tags.strong,
    [Token.String]: tags.string,
    [Token.TagName]: tags.tagName,
    [Token.TypeName]: tags.typeName,
    [Token.VariableName]: tags.variableName,
};

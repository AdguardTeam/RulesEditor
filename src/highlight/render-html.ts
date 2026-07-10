import { defaultHighlightStyle, type HighlightStyle } from '@codemirror/language';
import { StyleModule } from 'style-mod';

import type { RuleTokens, Token } from '../lib/utils';

import { tokenTags } from './token-tags';

/**
 * Options shared by the HTML rendering utilities.
 */
export interface RenderOptions {
    /**
     * HighlightStyle(s) used to resolve token CSS classes. Defaults to
     * CodeMirror's `defaultHighlightStyle`, matching the editor's default theme.
     */
    highlightStyle?: HighlightStyle | HighlightStyle[];
}

/**
 * Per-call options for highlighting a search term inside a rendered rule.
 */
export interface SearchHighlightOptions {
    /**
     * Plain-text term to highlight within the rule. Matching is
     * case-insensitive. Empty or whitespace-only terms disable highlighting.
     */
    searchTerm?: string;

    /**
     * CSS class applied to the wrapper span around each matched chunk. When
     * omitted, matches are wrapped in a class-less `<span>`.
     */
    searchClassName?: string;
}

const HTML_ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

/**
 * Escapes characters that are significant in HTML text content.
 *
 * @param str The raw token text.
 *
 * @returns The escaped text, safe to inject via `innerHTML`.
 */
function escapeHtml(str: string): string {
    return str.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]!);
}

/**
 * Normalizes the optional highlight style into a non-empty array.
 *
 * @param highlightStyle The configured style or styles.
 *
 * @returns An array of styles, defaulting to `defaultHighlightStyle`.
 */
function normalizeStyles(
    highlightStyle?: HighlightStyle | HighlightStyle[],
): HighlightStyle[] {
    if (!highlightStyle) {
        return [defaultHighlightStyle];
    }
    return Array.isArray(highlightStyle) ? highlightStyle : [highlightStyle];
}

/**
 * Resolves the CSS class for a token using the same `HighlightStyle.style`
 * lookup the CodeMirror editor uses, so output classes match the editor.
 *
 * @param token The resolved highlight token, or `null` when unmapped.
 * @param styles The active highlight styles.
 *
 * @returns The space-joined class string, or `null` when no style applies.
 */
function resolveClass(token: Token | null, styles: HighlightStyle[]): string | null {
    if (token === null) {
        return null;
    }
    const tag = tokenTags[token];
    const classes = styles
        .map((style) => style.style([tag]))
        .filter((cls): cls is string => Boolean(cls));
    return classes.length > 0 ? classes.join(' ') : null;
}

/**
 * Renders a single line's token list to escaped, class-annotated HTML whose
 * classes match the CodeMirror editor for the same tags. Pure and synchronous.
 *
 * @param tokens The token list (e.g. From `getTokenizer`).
 * @param options Rendering options.
 *
 * @returns An HTML string safe for `innerHTML`/`dangerouslySetInnerHTML`.
 */
export function renderTokensToHtml(
    tokens: RuleTokens,
    options: RenderOptions = {},
): string {
    const styles = normalizeStyles(options.highlightStyle);
    return tokens
        .map(({ str, token }) => {
            if (str.length === 0) {
                return '';
            }
            const escaped = escapeHtml(str);
            const cls = resolveClass(token, styles);
            return cls ? `<span class="${escapeHtml(cls)}">${escaped}</span>` : escaped;
        })
        .join('');
}

/**
 * Mounts a HighlightStyle's CSS module into a document or shadow root so the
 * classes emitted by `renderTokensToHtml` are colorized when no editor using the
 * same style is present. The only DOM side effect in this module; call once.
 *
 * @param highlightStyle The style whose CSS to mount. Defaults to
 *   `defaultHighlightStyle`.
 * @param root The target document or shadow root. Defaults to `document`.
 */
export function mountHighlightStyle(
    highlightStyle: HighlightStyle = defaultHighlightStyle,
    root?: Document | ShadowRoot,
): void {
    if (!highlightStyle.module) {
        return;
    }
    const rootOrDocument = root ?? (typeof document !== 'undefined' ? document : undefined);
    if (!rootOrDocument) {
        return;
    }
    StyleModule.mount(rootOrDocument, highlightStyle.module);
}

/**
 * A zero-based character range representing a single match in the rule text.
 */
type SearchMatch = {
    /**
     * The index of the first character in the match, inclusive.
     */
    start: number;

    /**
     * The index after the last character in the match, exclusive. The match
     * includes all characters from `start` up to but not including `end`.
     */
    end: number;
};

/**
 * Finds every non-overlapping, case-insensitive occurrence of `term` in
 * `text`, scanning left to right. Offsets index the original `text`.
 *
 * @param text The full rule text to search within.
 * @param term The plain-text term to locate.
 *
 * @returns Ascending, non-overlapping match ranges.
 */
function findSearchMatches(
    text: string,
    term: string,
): SearchMatch[] {
    const matches: SearchMatch[] = [];
    const haystack = text.toLowerCase();
    const needle = term.toLowerCase();
    const { length } = needle;

    let from = 0;

    let index = haystack.indexOf(needle, from);
    while (index !== -1) {
        matches.push({ start: index, end: index + length });
        from = index + length;
        index = haystack.indexOf(needle, from);
    }

    return matches;
}

/**
 * Renders a token list to HTML like {@link renderTokensToHtml}, additionally
 * wrapping every case-insensitive occurrence of `search.searchTerm` in a
 * wrapper span. A match that spans multiple tokens is wrapped once, with the
 * per-token syntax spans nested inside it. When there is no effective term,
 * this delegates to {@link renderTokensToHtml} for identical output.
 *
 * @param tokens The token list (e.g. from `getTokenizer`).
 * @param options Rendering options.
 * @param search Optional search-highlight options.
 *
 * @returns An HTML string safe for `innerHTML`/`dangerouslySetInnerHTML`.
 */
export function renderTokensToHtmlWithSearch(
    tokens: RuleTokens,
    options: RenderOptions = {},
    search?: SearchHighlightOptions,
): string {
    const term = search?.searchTerm;
    if (!term || term.trim().length === 0) {
        return renderTokensToHtml(tokens, options);
    }

    const fullText = tokens.map(({ str }) => str).join('');
    const matches = findSearchMatches(fullText, term);
    if (matches.length === 0) {
        return renderTokensToHtml(tokens, options);
    }

    const styles = normalizeStyles(options.highlightStyle);
    const searchClassName = search?.searchClassName;
    const openWrapper = searchClassName
        ? `<span class="${escapeHtml(searchClassName)}">`
        : '<span>';

    let result = '';
    let offset = 0;
    let matchIndex = 0;
    let openMatchId = -1;

    for (const { str, token } of tokens) {
        if (str.length === 0) {
            continue;
        }
        const tokenEnd = offset + str.length;
        const cls = resolveClass(token, styles);

        let position = offset;
        while (position < tokenEnd) {
            // Advance past matches that end at or before our current position.
            while (
                matchIndex < matches.length
                && matches[matchIndex]!.end <= position
            ) {
                matchIndex += 1;
            }
            const match = matchIndex < matches.length
                ? matches[matchIndex]!
                : null;

            let segmentEnd: number;
            let currentMatchId: number;
            if (match && match.start <= position) {
                // We are inside a match.
                segmentEnd = Math.min(match.end, tokenEnd);
                currentMatchId = matchIndex;
            } else {
                // We are before the next match (or there is none).
                segmentEnd = match
                    ? Math.min(match.start, tokenEnd)
                    : tokenEnd;
                currentMatchId = -1;
            }

            if (currentMatchId !== openMatchId) {
                if (openMatchId !== -1) {
                    result += '</span>';
                }
                if (currentMatchId !== -1) {
                    result += openWrapper;
                }
                openMatchId = currentMatchId;
            }

            const text = escapeHtml(fullText.slice(position, segmentEnd));
            result += cls
                ? `<span class="${escapeHtml(cls)}">${text}</span>`
                : text;
            position = segmentEnd;
        }

        offset = tokenEnd;
    }

    if (openMatchId !== -1) {
        result += '</span>';
    }
    return result;
}

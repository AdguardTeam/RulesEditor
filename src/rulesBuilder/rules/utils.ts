export interface BasicRule {
    // Returns rule that was created by builder
    buildRule: () => string;
}

// Modifiers for content type, can be used in UI for select
export enum ContentTypeModifiers {
    all = 'all',
    webpages = 'document',
    images = 'image',
    css = 'stylesheet',
    scripts = 'script',
    fonts = 'font',
    media = 'media',
    xmlhttprequest = 'xmlhttprequest',
    other = 'other',
}

// Modifiers for domain, can be used in UI for select
export enum DomainModifiers {
    all = 'all',
    onlyThis = 'onlyThis',
    allOther = 'allOther',
    onlyListed = 'onlyListed',
    allExceptListed = 'allExceptListed',
}

// Exception modifiers for disable filtering rules, can be used in UI for select
export enum ExceptionModifiers {
    filtering = 'filtering',
    urls = 'urls',
    hidingRules = 'elemhide',
    jsAndScriplets = 'jsinject',
    userscripts = 'extension',
}

export const noFilteringModifiers = [
    'extension',
    'jsinject',
    'elemhide',
    'content',
    'urlblock',
];

export const important = 'important';
export const domainModifier = 'domain';
export const thirdParty = 'third-party';

export const domainMatch = /^@?@?\|?\|([\d\w.-]*)[/\d\w-]*\^/;

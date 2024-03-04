// Any rule base interface
export interface BasicRule {
    // Returns rule that was created by builder
    buildRule: () => string;
}

// Modifiers for content type, can be used in UI for select
export enum BlockContentTypeModifiers {
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

// Unblock content type modifiers, similar with BlockContentTypeModifiers but don't have 'all'
export enum UnblockContentTypeModifier {
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

// Exception modifiers variants for disable filtering rules, can be used only in UI for select
export enum ExceptionSelectModifiers {
    filtering = 'filtering',
    urls = 'urls',
    hidingRules = 'elemhide',
    jsAndScriplets = 'jsinject',
    userscripts = 'extension',
}

// Exception modifiers that are used in rules
export enum ExceptionsModifiers {
    extension = 'extension',
    jsinject = 'jsinject',
    elemhide = 'elemhide',
    content = 'content',
    urlblock = 'urlblock',
}

// All modifiers that are used in disable filtering rules
export const noFilteringModifiers = [
    ExceptionsModifiers.extension,
    ExceptionsModifiers.jsinject,
    ExceptionsModifiers.elemhide,
    ExceptionsModifiers.content,
    ExceptionsModifiers.urlblock,
];

// Modifiers that are used when ExceptionSelectModifiers.urls is used
export const noFilteringUrlsModifiers = [ExceptionsModifiers.content, ExceptionsModifiers.urlblock];

// Block rule beginning
export const blockRuleBeginning = '||';

// Unblock rule beginning
export const unblockRuleBeginning = '@@||';

export const important = 'important';
export const domainModifier = 'domain';
export const thirdParty = 'third-party';

export const domainMatch = /^@?@?\|?\|([\d\w.-]*)[/\d\w-]*\^/;

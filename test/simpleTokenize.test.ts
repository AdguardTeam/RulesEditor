import { simpleTokenizer } from '../src/tokenizers/simpleTokenizer';

test('Rule: @@|https://example.org/unified/someJsFile.js$domain=domain.one.com|domaintwo.com|domainthree.com', () => {
    const rule = '@@|https://example.org/unified/someJsFile.js$domain=domain.one.com|domaintwo.com|domainthree.com';
    const result = [
        { token: 'keyword', str: '@@|' },
        { token: null, str: 'https://example.org/unified/someJsFile.js' },
        { token: 'keyword', str: '$domain' },
        { token: 'operator', str: '=' },
        { token: 'string', str: 'domain.one.com|domaintwo.com|domainthree.com' },
    ];
    expect(simpleTokenizer(rule)).toEqual(result);
});

test('Rule: example.com.it#@##some-sdk', () => {
    const rule = 'example.com.it#@##some-sdk';
    const result = [
        { token: 'string', str: 'example.com.it' },
        { token: 'keyword', str: '#@#' },
        { token: 'def', str: '#some-sdk' },
    ];
    expect(simpleTokenizer(rule)).toEqual(result);
});

test('Rule: example.com#@#.cookie-confirm', () => {
    const rule = 'example.com#@#.cookie-confirm';
    const result = [
        { token: 'string', str: 'example.com' },
        { token: 'keyword', str: '#@#' },
        { token: 'def', str: '.cookie-confirm' },
    ];
    expect(simpleTokenizer(rule)).toEqual(result);
});

test('Rule: @@||example.no/static/*/frontend/folder/path/$domain=example.no', () => {
    const rule = '@@||example.no/static/*/frontend/folder/path/$domain=example.no';
    const result = [
        { token: 'keyword', str: '@@||' },
        { token: null, str: 'example.no/static/*/frontend/folder/path/' },
        { token: 'keyword', str: '$domain' },
        { token: 'operator', str: '=' },
        { token: 'string', str: 'example.no' },
    ];
    expect(simpleTokenizer(rule)).toEqual(result);
});

test('Rule: /example.org/', () => {
    const rule = '/example.org/';
    const result = [
        { token: 'keyword', str: '/' },
        { token: 'string-2', str: 'example.org' },
        { token: 'keyword', str: '/' },
    ];
    expect(simpleTokenizer(rule)).toEqual(result);
});

test('Rule: @@||example.org^', () => {
    const rule = '@@||example.org^';
    const result = [
        { token: 'keyword', str: '@@||' },
        { token: null, str: 'example.org' },
        { token: 'keyword', str: '^' },
    ];
    expect(simpleTokenizer(rule)).toEqual(result);
});

test('Rule: !comment', () => {
    const rule = '!comment';
    const result = [{ token: 'comment', str: '!comment' }];
    expect(simpleTokenizer(rule)).toEqual(result);
});

test('Rule: ||example.com/assets/Cookie.$stylesheet,script', () => {
    const rule = '||example.com/assets/Cookie.$stylesheet,script';
    const result = [
        { token: 'keyword', str: '||' },
        { token: null, str: 'example.com/assets/Cookie.' },
        { token: 'keyword', str: '$stylesheet' },
        { token: 'operator', str: ',' },
        { token: 'keyword', str: 'script' },
    ];
    expect(simpleTokenizer(rule)).toEqual(result);
});

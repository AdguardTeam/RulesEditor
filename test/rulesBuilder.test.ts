import { RulesBuilder } from '../src/rulesBuilder/RulesBuilder';
import { ContentTypeModifiers, ExceptionModifiers, DomainModifiers } from '../src/rulesBuilder/rules/utils';

// Block rules
test('RulesBuilder: ||example.org^$stylesheet,script,domain=example.com|example.ru,important', () => {
    const rule = RulesBuilder.getRuleByType('block');
    rule.setDomain('example.org');
    rule.setContentType([ContentTypeModifiers.css, ContentTypeModifiers.scripts]);
    rule.setHighPriority(true);
    rule.setDomainModifiers(DomainModifiers.onlyListed, [
        'example.com',
        'example.ru',
    ]);
    const result = '||example.org^$stylesheet,script,domain=example.com|example.ru,important';
    expect(rule.buildRule()).toEqual(result);
});

test('RuleParser: ||example.org^$stylesheet,script,domain=example.com|example.ru,important', () => {
    const rule = RulesBuilder.getRuleFromRuleString('||example.org^$stylesheet,script,domain=example.com|example.ru,important');
    const result = '||example.org^$stylesheet,script,domain=example.com|example.ru,important';
    expect(rule?.buildRule()).toEqual(result);
});

test('Rule type: ||example.org^', () => {
    const rule = RulesBuilder.getRuleType('||example.org^');
    const result = 'block';
    expect(rule).toEqual(result);
});

test('RulesBuilder: ||example.org^$stylesheet,script,domain=example.com|example.ru,important', () => {
    const rule = RulesBuilder.getRuleByType('block');
    rule.setDomain('example.org');
    rule.setContentType([ContentTypeModifiers.css, ContentTypeModifiers.scripts]);
    rule.setHighPriority(true);
    rule.setDomainModifiers(DomainModifiers.allExceptListed, [
        'example.com',
        'example.ru',
    ]);
    const result = '||example.org^$stylesheet,script,domain=~example.com|~example.ru,important';
    expect(rule.buildRule()).toEqual(result);
});

test('RuleParser: ||example.org^$stylesheet,script,domain=~example.com|~example.ru,important', () => {
    const rule = RulesBuilder.getRuleFromRuleString('||example.org^$stylesheet,script,domain=~example.com|~example.ru,important');
    const result = '||example.org^$stylesheet,script,domain=~example.com|~example.ru,important';
    expect(rule?.buildRule()).toEqual(result);
});

test('Rule type: ||example.org^$stylesheet,script,domain=~example.com|~example.ru,important', () => {
    const rule = RulesBuilder.getRuleType('||example.org^$stylesheet,script,domain=~example.com|~example.ru,important');
    const result = 'block';
    expect(rule).toEqual(result);
});

test('RulesBuilder: ||example.org^$document,domain=example.org,important', () => {
    const rule = RulesBuilder.getRuleByType('block');
    rule.setDomain('example.org');
    rule.setContentType([ContentTypeModifiers.webpages]);
    rule.setHighPriority(true);
    rule.setDomainModifiers(DomainModifiers.onlyThis);
    const result = '||example.org^$document,domain=example.org,important';
    expect(rule.buildRule()).toEqual(result);
});

test('RuleParser: ||example.org^$document,domain=example.org,important', () => {
    const rule = RulesBuilder.getRuleFromRuleString('||example.org^$document,domain=example.org,important');
    const result = '||example.org^$document,domain=example.org,important';
    expect(rule?.buildRule()).toEqual(result);
});

test('Rule type: ||example.org^$document,domain=example.org,important', () => {
    const rule = RulesBuilder.getRuleType('||example.org^$document,domain=example.org,important');
    const result = 'block';
    expect(rule).toEqual(result);
});

test('RulesBuilder: ||example.org^$all,third-party,important', () => {
    const rule = RulesBuilder.getRuleByType('block');
    rule.setDomain('example.org');
    rule.setContentType([ContentTypeModifiers.all]);
    rule.setHighPriority(true);
    rule.setDomainModifiers(DomainModifiers.allOther);
    const result = '||example.org^$all,third-party,important';
    expect(rule.buildRule()).toEqual(result);
});

test('RuleParser: ||example.org^$all,third-party,important', () => {
    const rule = RulesBuilder.getRuleFromRuleString('||example.org^$all,third-party,important');
    const result = '||example.org^$all,third-party,important';
    expect(rule?.buildRule()).toEqual(result);
});

test('Rule type: ||example.org^$all,third-party,important', () => {
    const rule = RulesBuilder.getRuleType('||example.org^$all,third-party,important');
    const result = 'block';
    expect(rule).toEqual(result);
});

test('RulesBuilder: ||example.org^$stylesheet,script,important', () => {
    const rule = RulesBuilder.getRuleByType('block');
    rule.setDomain('example.org');
    rule.setContentType([ContentTypeModifiers.css, ContentTypeModifiers.scripts]);
    rule.setHighPriority(true);
    rule.setDomainModifiers(DomainModifiers.all);
    const result = '||example.org^$stylesheet,script,important';
    expect(rule.buildRule()).toEqual(result);
});

test('RuleParser: ||example.org^$stylesheet,script,important', () => {
    const rule = RulesBuilder.getRuleFromRuleString('||example.org^$stylesheet,script,important');
    const result = '||example.org^$stylesheet,script,important';
    expect(rule?.buildRule()).toEqual(result);
});

test('Rule type: ||example.org^$stylesheet,script,important', () => {
    const rule = RulesBuilder.getRuleType('||example.org^$stylesheet,script,important');
    const result = 'block';
    expect(rule).toEqual(result);
});

// Unblock rules
test('RulesBuilder: @@||example.org^$stylesheet,script,domain=example.com|example.ru,important', () => {
    const rule = RulesBuilder.getRuleByType('unblock');
    rule.setDomain('example.org');
    rule.setContentType([ContentTypeModifiers.css, ContentTypeModifiers.scripts]);
    rule.setHighPriority(true);
    rule.setDomainModifiers(DomainModifiers.onlyListed, [
        'example.com',
        'example.ru',
    ]);
    const result = '@@||example.org^$stylesheet,script,domain=example.com|example.ru,important';
    expect(rule.buildRule()).toEqual(result);
});

test('RuleParser: @@||example.org^$stylesheet,script,domain=example.com|example.ru,important', () => {
    const rule = RulesBuilder.getRuleFromRuleString('@@||example.org^$stylesheet,script,domain=example.com|example.ru,important');
    const result = '@@||example.org^$stylesheet,script,domain=example.com|example.ru,important';
    expect(rule?.buildRule()).toEqual(result);
});

test('Rule type: @@||example.org^$stylesheet,script,domain=example.com|example.ru,important', () => {
    const rule = RulesBuilder.getRuleType('@@||example.org^$stylesheet,script,domain=example.com|example.ru,important');
    const result = 'unblock';
    expect(rule).toEqual(result);
});

test('RulesBuilder: @@||example.org^$stylesheet,script,domain=~example.com|~example.ru,important', () => {
    const rule = RulesBuilder.getRuleByType('unblock');
    rule.setDomain('example.org');
    rule.setContentType([ContentTypeModifiers.css, ContentTypeModifiers.scripts]);
    rule.setHighPriority(true);
    rule.setDomainModifiers(DomainModifiers.allExceptListed, [
        'example.com',
        'example.ru',
    ]);
    const result = '@@||example.org^$stylesheet,script,domain=~example.com|~example.ru,important';
    expect(rule.buildRule()).toEqual(result);
});

test('RuleParser: @@||example.org^$stylesheet,script,domain=~example.com|~example.ru,important', () => {
    const rule = RulesBuilder.getRuleFromRuleString('@@||example.org^$stylesheet,script,domain=~example.com|~example.ru,important');
    const result = '@@||example.org^$stylesheet,script,domain=~example.com|~example.ru,important';
    expect(rule?.buildRule()).toEqual(result);
});

test('Rule type: @@||example.org^$stylesheet,script,domain=~example.com|~example.ru,important', () => {
    const rule = RulesBuilder.getRuleType('@@||example.org^$stylesheet,script,domain=~example.com|~example.ru,important');
    const result = 'unblock';
    expect(rule).toEqual(result);
});

test('RulesBuilder: @@||example.org^$document,domain=example.org,important', () => {
    const rule = RulesBuilder.getRuleByType('unblock');
    rule.setDomain('example.org');
    rule.setContentType([ContentTypeModifiers.webpages]);
    rule.setHighPriority(true);
    rule.setDomainModifiers(DomainModifiers.onlyThis);
    const result = '@@||example.org^$document,domain=example.org,important';
    expect(rule.buildRule()).toEqual(result);
});

test('RuleParser: @@||example.org^$document,domain=example.org,important', () => {
    const rule = RulesBuilder.getRuleFromRuleString('@@||example.org^$document,domain=example.org,important');
    const result = '@@||example.org^$document,domain=example.org,important';
    expect(rule?.buildRule()).toEqual(result);
});

test('Rule type: @@||example.org^$document,domain=example.org,important', () => {
    const rule = RulesBuilder.getRuleType('@@||example.org^$document,domain=example.org,important');
    const result = 'unblock';
    expect(rule).toEqual(result);
});

test('RulesBuilder: @@||example.org^$third-party,important', () => {
    const rule = RulesBuilder.getRuleByType('unblock');
    rule.setDomain('example.org');
    rule.setHighPriority(true);
    rule.setDomainModifiers(DomainModifiers.allOther);
    const result = '@@||example.org^$third-party,important';
    expect(rule.buildRule()).toEqual(result);
});

test('RuleParser: @@||example.org^$third-party,important', () => {
    const rule = RulesBuilder.getRuleFromRuleString('@@||example.org^$third-party,important');
    const result = '@@||example.org^$third-party,important';
    expect(rule?.buildRule()).toEqual(result);
});

test('Rule type: @@||example.org^$third-party,important', () => {
    const rule = RulesBuilder.getRuleType('@@||example.org^$third-party,important');
    const result = 'unblock';
    expect(rule).toEqual(result);
});

test('RulesBuilder: @@||example.org^$stylesheet,script,important', () => {
    const rule = RulesBuilder.getRuleByType('unblock');
    rule.setDomain('example.org');
    rule.setContentType([ContentTypeModifiers.css, ContentTypeModifiers.scripts]);
    rule.setHighPriority(true);
    rule.setDomainModifiers(DomainModifiers.all);
    const result = '@@||example.org^$stylesheet,script,important';
    expect(rule.buildRule()).toEqual(result);
});

test('RuleParser: @@||example.org^$stylesheet,script,important', () => {
    const rule = RulesBuilder.getRuleFromRuleString('@@||example.org^$stylesheet,script,important');
    const result = '@@||example.org^$stylesheet,script,important';
    expect(rule?.buildRule()).toEqual(result);
});

test('Rule type: @@||example.org^$stylesheet,script,important', () => {
    const rule = RulesBuilder.getRuleType('@@||example.org^$stylesheet,script,important');
    const result = 'unblock';
    expect(rule).toEqual(result);
});

// Disable filtering

test('RulesBuilder: @@||example.org^$extension,jsinject,elemhide,content,urlblock,important', () => {
    const rule = RulesBuilder.getRuleByType('noFiltering');
    rule.setDomain('example.org');
    rule.setContentType([ExceptionModifiers.filtering]);
    rule.setHighPriority(true);
    const result = '@@||example.org^$extension,jsinject,elemhide,content,urlblock,important';
    expect(rule.buildRule()).toEqual(result);
});

test('RuleParser: @@||example.org^$extension,jsinject,elemhide,content,urlblock,important', () => {
    const rule = RulesBuilder.getRuleFromRuleString('@@||example.org^$extension,jsinject,elemhide,content,urlblock,important');
    const result = '@@||example.org^$extension,jsinject,elemhide,content,urlblock,important';
    expect(rule?.buildRule()).toEqual(result);
});

test('Rule type: @@||example.org^$extension,jsinject,elemhide,content,urlblock,important', () => {
    const rule = RulesBuilder.getRuleType('@@||example.org^$extension,jsinject,elemhide,content,urlblock,important');
    const result = 'noFiltering';
    expect(rule).toEqual(result);
});

test('RulesBuilder: @@||example.org^$content,urlblock,extension,important', () => {
    const rule = RulesBuilder.getRuleByType('noFiltering');
    rule.setDomain('example.org');
    rule.setContentType([ExceptionModifiers.urls, ExceptionModifiers.userscripts]);
    rule.setHighPriority(true);
    const result = '@@||example.org^$content,urlblock,extension,important';
    expect(rule.buildRule()).toEqual(result);
});

test('RuleParser: @@||example.org^$content,urlblock,extension,important', () => {
    const rule = RulesBuilder.getRuleFromRuleString('@@||example.org^$content,urlblock,extension,important');
    const result = '@@||example.org^$content,urlblock,extension,important';
    expect(rule?.buildRule()).toEqual(result);
});

test('Rule type: @@||example.org^$content,urlblock,extension,important', () => {
    const rule = RulesBuilder.getRuleType('@@||example.org^$content,urlblock,extension,important');
    const result = 'noFiltering';
    expect(rule).toEqual(result);
});

test('RulesBuilder: @@||example.org^$jsinject', () => {
    const rule = RulesBuilder.getRuleByType('noFiltering');
    rule.setDomain('example.org');
    rule.setContentType([ExceptionModifiers.jsAndScriplets]);
    const result = '@@||example.org^$jsinject';
    expect(rule.buildRule()).toEqual(result);
});

test('RuleParser: @@||example.org^$jsinject', () => {
    const rule = RulesBuilder.getRuleFromRuleString('@@||example.org^$jsinject');
    const result = '@@||example.org^$jsinject';
    expect(rule?.buildRule()).toEqual(result);
});

test('Rule type: @@||example.org^$jsinject', () => {
    const rule = RulesBuilder.getRuleType('@@||example.org^$jsinject');
    const result = 'noFiltering';
    expect(rule).toEqual(result);
});

// Custom rule

test('RulesBuilder: example.com#$#body { background-color: #333!important; }', () => {
    const rule = RulesBuilder.getRuleByType('custom');
    rule.setRule('example.com#$#body { background-color: #333!important; }');
    const result = 'example.com#$#body { background-color: #333!important; }';
    expect(rule.buildRule()).toEqual(result);
});

test('RuleParser: example.com#$#body { background-color: #333!important; }', () => {
    const rule = RulesBuilder.getRuleFromRuleString('example.com#$#body { background-color: #333!important; }');
    const result = 'example.com#$#body { background-color: #333!important; }';
    expect(rule?.buildRule()).toEqual(result);
});

test('Rule type: example.com#$#body { background-color: #333!important; }', () => {
    const rule = RulesBuilder.getRuleType('example.com#$#body { background-color: #333!important; }');
    const result = 'custom';
    expect(rule).toEqual(result);
});

// Comment

test('RulesBuilder: ! Some comment', () => {
    const rule = RulesBuilder.getRuleByType('comment');
    rule.setText('Some comment');
    const result = '! Some comment';
    expect(rule.buildRule()).toEqual(result);
});

test('RuleParser: # Some comment', () => {
    const rule = RulesBuilder.getRuleFromRuleString('# Some comment');
    const result = '# Some comment';
    expect(rule?.buildRule()).toEqual(result);
});

test('Rule type: ! Some comment', () => {
    const rule = RulesBuilder.getRuleType('! Some comment');
    const result = 'comment';
    expect(rule).toEqual(result);
});

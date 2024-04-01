# AdGuard Editor Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.2.8 - 2024-04-01

- Add a check to ensure that the tokenizer correctly returns a null token and the original string in cases where the cosmetic rules' marker logic would not be applicable.

## 1.2.7 - 2024-03-26

- Changed the `isBlockingRule` property in the `DNSRule` class to public.

- Fixed a bug in the `buildRule` for `BlockRequestRule` and `UnblockRequestRule` function where using the `important` modifier resulted in an empty string. The function now properly considers and integrates the `important` modifier, ensuring accurate rule construction.

- Fixed a bug in the `buildRule` method for `NoFilteringRule`, where it previously added an unnecessary `$` at the end of the rule. The method has been updated to omit the `$`, aligning the output with the correct rule syntax and expected behavior.

## 1.2.6 - 2024-02-26

### Changed

- Split RequestRule to two separate classes for block and unblock rules
- Refactor some strings to consts


## 1.2.5 - 2024-02-16

### Changed

- fix noFiltering parsing

## 1.2.4 - 2023-06-12

### Changed

- fix comment parsing

## 1.2.3 - 2023-06-12

### Changed

- add validation support for dns rules

## 1.2.2 - 2023-06-12

### Changed

- refactor `getDnsRule -> getDnsRuleByType` for dns rules.


## 1.2.1 - 2023-01-12

### Changed

- export `DNSRule` builder.
- fix `getRuleFromRuleString` for dns rules.

## 1.2.0 - 2023-27-11

### Changed

- `RulesBuilder` add `getDnsRule()`.
- `RulesBuilder` add support for DNS rules.


## 1.1.1 - 2023-11-10

### Changed

- `RulesBuilder` bug fixes.


## 1.1.0 - 2023-10-24

### Changed

- `RulesBuilder` class.


## 1.0.0 - 2023-10-12

### Changed

- `initEditor()`, `simpleTokenizer()` and `getTokenizer()` methods.
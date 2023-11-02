import isValidDomain from 'is-valid-domain';
import { CosmeticRule, NetworkRule, HostRule, RuleFactory } from '@adguard/tsurlfilter';

import type { BasicRule } from './rules/utils';
import { ContentTypeModifiers, ExceptionModifiers, domainMatch, important, thirdParty, domainModifier } from './rules/utils';
import { RequestRule } from './rules/RequestRule';
import { NoFilteringRule } from './rules/NoFilteringRule';
import { Comment } from './rules/Comment';
import { CustomRule } from './rules/CustomRule';

type RuleType = 'block' | 'unblock' | 'noFiltering' | 'custom' | 'comment';

type DomainValidationOptions = Parameters<typeof isValidDomain>[1];

/**
 * The RulesBuilder class offers static methods to acquire the RulesBuilder for a particular rule type,
 * check the validity of rule domains, and validate completed rules.
 */
export class RulesBuilder {
    /**
     * Returns rule builder for block request rule.
     */
    public static getRuleByType(type: 'block'): RequestRule;
    /**
     * Returns rule builder for unblock request rule.
     */
    public static getRuleByType(type: 'unblock'): RequestRule;
    /**
     * Returns rule builder for disable filtering rule.
     */
    public static getRuleByType(type: 'noFiltering'): NoFilteringRule;
    /**
     * Returns rule builder for custom rule.
     */
    public static getRuleByType(type: 'custom'): CustomRule;
    /**
     * Returns rule builder for comment.
     */
    public static getRuleByType(type: 'comment'): Comment;
    /**
     * Return correct rule builder for each type of creating rule.
     * @returns One of rule builder instance.
     */
    public static getRuleByType(type: RuleType): BasicRule {
        switch (type) {
            case 'block':
                return new RequestRule(true);
            case 'unblock':
                return new RequestRule(false);
            case 'noFiltering':
                return new NoFilteringRule();
            case 'custom':
                return new CustomRule();
            case 'comment':
                return new Comment();
        }
    }

    /**
     * Simple validator for domain.
     * @param ruleBuilder - Instance of RequestRule or NoFilteringRule builder.
     * @param opts - Validation parameters, check is-valid-domain library function.
     * @returns Boolean - if domain is valid.
     */
    public static validateDomain(ruleBuilder: RequestRule | NoFilteringRule, opts?: DomainValidationOptions) {
        return isValidDomain(ruleBuilder.getDomain(), opts);
    }

    /**
     * Validate if final rule is valid.
     * @param ruleBuilder - Instance of rule builder.
     * @returns Boolean - if rule is valid.
     */
    public static validateRule(ruleBuilder: BasicRule) {
        const rawRule = ruleBuilder.buildRule();

        if (RuleFactory.isComment(rawRule)) {
            return true;
        }

        const rule = RuleFactory.createRule(rawRule, 0, false, false, false, true);

        return !!rule;
    }

    /**
     * Defines rule type from raw rule string.
     * @param rawRule - Rule string.
     * @returns RuleType or null if failed to detect the rule type.
     */
    public static getRuleType(rawRule: string): RuleType | null {
        if (RuleFactory.isComment(rawRule)) {
            return 'comment';
        }
        const requestContentTypeModifiers = new Set<string>(Object.values(ContentTypeModifiers));
        const allowedDomainModifiers = new Set([ContentTypeModifiers.webpages,
            domainModifier,
            thirdParty,
        ]);
        const exceptionModifiers = new Set<string>(Object.values(ExceptionModifiers));

        const rule = RuleFactory.createRule(rawRule, 0, false, false, false, true);

        if (rule instanceof NetworkRule) {
            const { options, pattern } = NetworkRule.parseRuleText(rawRule);
            if (typeof pattern !== 'string') {
                return 'custom';
            }
            const groups = domainMatch.exec(pattern);
            if (!groups || groups?.length !== 1) {
                return 'custom';
            }

            if (!isValidDomain(groups[0], { subdomain: true, wildcard: true })) {
                return 'custom';
            }

            if (options === important || typeof options !== 'string') {
                return rule.isAllowlist() ? 'unblock' : 'block';
            }

            if (rule.isAllowlist()) {
                const modifiersArr = options.split(',');
                let onlyExceptionRulesModifiers = true;

                modifiersArr.forEach((m) => {
                    onlyExceptionRulesModifiers = onlyExceptionRulesModifiers && exceptionModifiers.has(m);
                });

                return onlyExceptionRulesModifiers ? 'noFiltering' : 'custom';
            }

            const modifiersArr = options.split(',');
            let onlyRequestRulesModifiers = true;

            modifiersArr.forEach((m) => {
                if (m.includes('=')) {
                    const modifier = m.split('=')[0];
                    onlyRequestRulesModifiers = onlyRequestRulesModifiers && allowedDomainModifiers.has(modifier);
                    return;
                }
                onlyRequestRulesModifiers = onlyRequestRulesModifiers
                    && (requestContentTypeModifiers.has(m) || allowedDomainModifiers.has(m));
            });

            if (!onlyRequestRulesModifiers) {
                return 'custom';
            }

            return rule.isAllowlist() ? 'unblock' : 'block';
        }

        if (rule instanceof HostRule || rule instanceof CosmeticRule) {
            return 'custom';
        }

        return null;
    }

    /**
     * Returns specific rule builder depending on passed rule, return null if passed rule is incorrect.
     * @param rawRule - Rule string.
     * @returns One of rule builder instance.
     */
    public static getRuleFromRuleString(rawRule: string) {
        switch (RulesBuilder.getRuleType(rawRule)) {
            case 'block':
                return RequestRule.fromRule(rawRule, true);
            case 'unblock':
                return RequestRule.fromRule(rawRule, false);
            case 'noFiltering':
                return NoFilteringRule.fromRule(rawRule);
            case 'custom':
                return CustomRule.fromRule(rawRule);
            case 'comment':
                return Comment.fromRule(rawRule);
            default:
                return null;
        }
    }
}

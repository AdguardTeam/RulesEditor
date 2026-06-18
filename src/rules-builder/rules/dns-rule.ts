import { NetworkRule } from '@adguard/tsurlfilter';
import type { BasicRule } from './utils';
import { unblockRuleBeginning, blockRuleBeginning } from './utils';

/**
 * Rule builder for blocking and unblocking request rules.
 */
export class DNSRule implements BasicRule {
    /**
     * Rule's domain.
     */
    private domain: string = '';

    /**
     * Shows if this is a isBlockingRule or unblock rule.
     */
    public readonly isBlockingRule: boolean;

    /**
     * Include isIncludingSubdomains.
     */
    private isIncludingSubdomains: boolean = false;

    /**
     * Constructor.
     * @param isBlockingRule Defines if this DNSRule will be blocking rule or unblocking.
     */
    public constructor(isBlockingRule: boolean) {
        this.isBlockingRule = isBlockingRule;
    }

    /**
     * Setter for domain.
     * @param domain - Domain.
     */
    public setDomain(domain: string) {
        this.domain = domain;
    }

    /**
     * Getter for domain.
     * @returns Domain rule string.
     */
    public getDomain(): string {
        return this.domain;
    }

    /**
     * Setter for subdomain.
     * @param includingSubdomains - Include subdomains.
     */
    public setIsIncludingSubdomains(includingSubdomains: boolean) {
        this.isIncludingSubdomains = includingSubdomains;
    }

    /**
     * Getter for domain.
     * @returns Domain rule string.
     */
    public getIsIncludingSubdomains(): boolean {
        return this.isIncludingSubdomains;
    }

    /**
     * Build rule from current setup.
     * @returns String - rule string.
     */
    public buildRule(): string {
        let rule = '';
        if (this.isBlockingRule) {
            rule = this.isIncludingSubdomains ? blockRuleBeginning : '|';
        } else {
            rule = this.isIncludingSubdomains ? unblockRuleBeginning : '@@|';
        }

        rule = `${rule}${this.domain}^`;

        return rule;
    }

    /**
     * Create DNSRule instance from existing rule string.
     * @param rawRule - Rule string.
     * @returns DNSRule instance.
     */
    public static fromRule(rawRule: string, isBlockingRule: boolean): DNSRule {
        const rule = new DNSRule(isBlockingRule);
        const { pattern } = NetworkRule.parseRuleText(rawRule);

        let domain = pattern || '';

        if (domain.startsWith(blockRuleBeginning)) {
            rule.setIsIncludingSubdomains(true);
        }

        if (domain.endsWith('^')) {
            domain = domain.slice(0, -1);
        }
        while (domain.startsWith('|')) {
            domain = domain.slice(1);
        }
        rule.setDomain(domain);

        return rule;
    }
}

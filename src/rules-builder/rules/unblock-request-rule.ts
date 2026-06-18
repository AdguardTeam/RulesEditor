import { NetworkRule } from '@adguard/tsurlfilter';
import type { BasicRule } from './utils';
import {
    DomainModifiers,
    UnblockContentTypeModifier,
    important,
    domainModifier,
    thirdParty,
    unblockRuleBeginning,
    blockRuleBeginning,
} from './utils';

/**
 * Rule builder for blocking and unblocking request rules.
 */
export class UnblockRequestRule implements BasicRule {
    /**
     * Rule's domain.
     */
    private domain: string = '';

    /**
     * Array of content type modifiers.
     */
    private contentModifiers: UnblockContentTypeModifier[] = [];

    /**
     * Shows where apply this rule.
     */
    private domainModifier: DomainModifiers = DomainModifiers.all;

    /**
     * Array of domains for domain modifier.
     */
    private domainModifierDomains: string[] = [];

    /**
     * Shows if rule should have important modifier.
     */
    private important: boolean = false;

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
     * Setter for blocking content type.
     * @param modifiers - Content type modifiers.
     */
    public setContentType(modifiers: UnblockContentTypeModifier[]) {
        this.contentModifiers = modifiers;
    }

    /**
     * Setter for domain modifiers.
     * @param modifier - DomainModifiers.
     */
    public setDomainModifiers(modifier: DomainModifiers, domains?: string[]): void {
        this.domainModifier = modifier;
        this.domainModifierDomains = domains || [];
    }

    /**
     * Setter for rule priority.
     * @param priority - Boolean.
     */
    public setHighPriority(priority: boolean): void {
        this.important = priority;
    }

    /**
     * Getter for blocking content type.
     * @returns Data.
     */
    public getContentType() {
        return this.contentModifiers;
    }

    /**
     * Getter for domain modifiers.
     * @returns Data.
     */
    public getDomainModifiers() {
        return this.domainModifier;
    }

    /**
     * Getter for domain modifiers.
     * @returns Data.
     */
    public getDomainModifiersDomains() {
        return this.domainModifierDomains;
    }

    /**
     * Getter for rule priority.
     * @returns Data.
     */
    public getHighPriority() {
        return this.important;
    }

    /**
     * Build rule from current setup.
     * @returns String - rule string.
     */
    public buildRule(): string {
        let rule = `${unblockRuleBeginning}${this.domain}^`;

        const modifiers = new Set<string>(this.contentModifiers);

        switch (this.domainModifier) {
            case DomainModifiers.onlyThis:
                modifiers.add(UnblockContentTypeModifier.webpages);
                modifiers.add(`${domainModifier}=${this.domain}`);
                break;
            case DomainModifiers.allOther:
                modifiers.add(thirdParty);
                break;
            case DomainModifiers.onlyListed:
                modifiers.add(`${domainModifier}=${this.domainModifierDomains.join('|')}`);
                break;
            case DomainModifiers.allExceptListed:
                modifiers.add(`${domainModifier}=${this.domainModifierDomains.map((s) => `~${s}`).join('|')}`);
                break;
        }

        if (this.important) {
            modifiers.add(important);
        }

        if (modifiers.size > 0) {
            rule = `${rule}$${Array.from(modifiers).join(',')}`;
        }

        return rule;
    }

    /**
     * Create RequestRule instance from existing rule string.
     * @param rawRule - Rule string.
     * @returns RequestRule instance.
     */
    public static fromRule(rawRule: string): UnblockRequestRule {
        const rule = new UnblockRequestRule();
        const { options, pattern } = NetworkRule.parseRuleText(rawRule);

        let domain = pattern || '';
        const modifiers = options || '';

        if (domain.endsWith('^')) {
            domain = domain.slice(0, -1);
        }
        if (domain.startsWith(blockRuleBeginning)) {
            domain = domain.slice(2);
        }
        rule.setDomain(domain);

        const allowedContentModifiers = new Set<string>(Object.values(UnblockContentTypeModifier));
        const setModifiers: UnblockContentTypeModifier[] = [];

        let ruleDomainModifier = '';

        modifiers.split(',').forEach((m) => {
            if (m === important) {
                rule.setHighPriority(true);
            }
            if (allowedContentModifiers.has(m)) {
                setModifiers.push(m as UnblockContentTypeModifier);
            }
            if (m.includes(domainModifier)) {
                ruleDomainModifier = m;
            }
        });

        rule.setContentType(setModifiers);

        let domainSetup: DomainModifiers = DomainModifiers.all;

        if (modifiers.includes(UnblockContentTypeModifier.webpages) && modifiers.includes(`${domainModifier}=${domain}`)) {
            domainSetup = DomainModifiers.onlyThis;
        }

        if (modifiers.includes(thirdParty) && !modifiers.includes(domainModifier)) {
            domainSetup = DomainModifiers.allOther;
        }
        rule.setDomainModifiers(domainSetup);

        if (ruleDomainModifier && domainSetup !== DomainModifiers.onlyThis) {
            const parsedDomain = ruleDomainModifier.split('=');
            const domains = parsedDomain[1].split('|');

            domainSetup = domains.every((v) => v.startsWith('~')) ? DomainModifiers.allExceptListed : DomainModifiers.onlyListed;
            rule.setDomainModifiers(
                domainSetup,
                domainSetup === DomainModifiers.allExceptListed ? domains.map((d) => d.slice(1)) : domains,
            );
        }

        return rule;
    }
}

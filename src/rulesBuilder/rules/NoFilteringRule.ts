import { NetworkRule } from '@adguard/tsurlfilter';
import type { BasicRule } from './utils';
import { important, ExceptionModifiers } from './utils';

/**
 * Rule builder for disable filtering rules.
 */
export class NoFilteringRule implements BasicRule {
    /**
     * Rule domain.
     */
    private domain: string = '';

    /**
     * Exception modifiers array.
     */
    private exceptionModifiers: ExceptionModifiers[] = [];

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
    public setContentType(modifiers: ExceptionModifiers[]) {
        this.exceptionModifiers = modifiers;
    }

    /**
     * Getter for blocking content type.
     * @returns Modifiers - Content type modifiers.
     */
    public getContentType() {
        return this.exceptionModifiers;
    }

    /**
     * Setter for rule priority.
     * @param priority - Boolean.
     */
    public setHighPriority(priority: boolean): void {
        this.important = priority;
    }

    /**
     * Getter for rule priority.
     * @returns Priority.
     */
    public getHighPriority() {
        return this.important;
    }

    /**
     * Build rule from current setup.
     * @returns String - rule string.
     */
    public buildRule(): string {
        let rule = `@@||${this.domain}^`;

        const modifiers: Set<string> = new Set();

        this.exceptionModifiers.forEach((ex) => {
            if (ex === ExceptionModifiers.filtering) {
                modifiers.add('extension');
                modifiers.add('jsinject');
                modifiers.add('elemhide');
                modifiers.add('content');
                modifiers.add('urlblock');
                return;
            }
            if (ex === ExceptionModifiers.urls) {
                modifiers.add('content');
                modifiers.add('urlblock');
                return;
            }
            modifiers.add(ex);
        });

        if (this.important) {
            modifiers.add(important);
        }

        rule = `${rule}$${Array.from(modifiers).join(',')}`;

        return rule;
    }

    /**
     * Create NoFilteringRule instance from existing rule string.
     * @param rawRule - Rule string.
     * @returns NoFilteringRule instance.
     */
    public static fromRule(rawRule: string): NoFilteringRule {
        const rule = new NoFilteringRule();
        const { options, pattern } = NetworkRule.parseRuleText(rawRule);

        let domain = pattern || '';
        const modifiers = options || '';

        if (domain.endsWith('^')) {
            domain = domain.slice(0, -1);
        }
        if (domain.startsWith('||')) {
            domain = domain.slice(2);
        }
        rule.setDomain(domain);

        const setModifiers: ExceptionModifiers[] = [];

        modifiers.split(',').forEach((m) => {
            if (m === important) {
                rule.setHighPriority(true);
            } else {
                setModifiers.push(m as ExceptionModifiers);
            }
        });
        rule.setContentType(setModifiers);

        return rule;
    }
}

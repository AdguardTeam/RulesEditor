import type { BasicRule } from './utils';

/**
 * Rule builder for custom rules.
 */
export class CustomRule implements BasicRule {
    /**
     * Rule's text.
     */
    private rule: string = '';

    /**
     * Setter for comment.
     * @param rule - Comment text.
     */
    public setRule(rule: string) {
        this.rule = rule;
    }

    /**
     * Getter for comment.
     * @returns Rule text.
     */
    public getRule() {
        return this.rule;
    }

    /**
     * Build rule from current setup.
     * @returns String - rule string.
     */
    public buildRule(): string {
        return this.rule;
    }

    /**
     * Create CustomRule instance from existing rule string.
     * @param rawRule - Rule string.
     * @returns CustomRule instance.
     */
    public static fromRule(rawRule: string): CustomRule {
        const rule = new CustomRule();
        rule.setRule(rawRule);
        return rule;
    }
}

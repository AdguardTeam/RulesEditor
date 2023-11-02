import type { BasicRule } from './utils';

/**
 * Rule builder for comments.
 */
export class Comment implements BasicRule {
    /**
     * Comment's text.
     */
    private text: string = '';

    /**
     * Shows if initial comment started with #.
     */
    private hadHashtag: boolean = false;

    /**
     * Set comment text.
     * @param text - Comment text.
     */
    public setText(text: string) {
        this.text = text;
    }

    /**
     * Set hadHashtag property, defines that initial rule had a hashtag.
     * @param hadHashtag - Boolean.
     */
    public setHadHashtag(hadHashtag: boolean) {
        this.hadHashtag = hadHashtag;
    }

    /**
     * Build comment from current text.
     * @returns String - comment string.
     */
    public buildRule(): string {
        return `${this.hadHashtag ? '#' : '!'} ${this.text}`;
    }

    /**
     * Create Comment instance from existing comment string.
     * @param rawRule - Comment string.
     * @returns Comment instance.
     */
    public static fromRule(rawRule: string): Comment {
        const comment = new Comment();
        if (rawRule.startsWith('#')) {
            comment.setHadHashtag(true);
            comment.setText(rawRule.slice(1).trim());
        }
        return comment;
    }
}

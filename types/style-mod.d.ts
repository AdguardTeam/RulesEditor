declare module 'style-mod' {
    /**
     *
     */
    export class StyleModule {
        /**
         *
         */
        constructor(spec: { [selector: string]: unknown });
        /**
         *
         */
        getRules(): string;
        /**
         *
         */
        static mount(root: Document | ShadowRoot | DocumentOrShadowRoot, module: StyleModule): void;
    }
    export default StyleModule;
}

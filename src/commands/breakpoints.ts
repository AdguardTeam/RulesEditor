import {
    StateField,
    StateEffect,
    RangeSet,
    type EditorState,
    type Extension,
} from '@codemirror/state';
import { GutterMarker, gutter } from '@codemirror/view';

/**
 * Effect that toggles the enabled marker for the line at the given document
 * position (the line's start offset).
 */
export const toggleBreakpoint = StateEffect.define<number>();

/**
 * Gutter marker rendered for an enabled rule line.
 */
class BreakpointMarker extends GutterMarker {
    /** Marker DOM element factory provided by the editor configuration. */
    private readonly make: () => HTMLElement;

    /**
     * Creates a BreakpointMarker.
     *
     * @param make Factory producing the marker DOM element.
     */
    constructor(make: () => HTMLElement) {
        super();
        this.make = make;
    }

    /**
     * Renders the marker element.
     *
     * @returns The marker DOM node.
     */
    public toDOM(): HTMLElement {
        return this.make();
    }
}

const defaultMake = (): HTMLElement => {
    const el = document.createElement('div');
    el.textContent = '\u25CF';
    return el;
};

let markerFactory: () => HTMLElement = defaultMake;

/**
 * Sets the DOM factory used to render enabled-rule markers.
 *
 * @param make Factory producing a marker element.
 * @returns Nothing.
 */
export function setMarkerFactory(make: () => HTMLElement): void {
    markerFactory = make;
}

const breakpointField = StateField.define<RangeSet<GutterMarker>>({
    create: () => RangeSet.empty,
    update(set, tr) {
        let next = set.map(tr.changes);
        tr.effects.forEach((effect) => {
            if (effect.is(toggleBreakpoint)) {
                const pos = effect.value;
                let has = false;
                next.between(pos, pos, () => {
                    has = true;
                });
                next = has
                    ? next.update({ filter: (from) => from !== pos })
                    : next.update({ add: [new BreakpointMarker(markerFactory).range(pos)] });
            }
        });
        return next;
    },
});

/**
 * Editor extension providing the enabled-rule gutter and its state field.
 *
 * @returns A CodeMirror 6 extension.
 */
export function breakpointState(): Extension {
    return [
        breakpointField,
        gutter({
            class: 'cm-breakpoint-gutter',
            markers: (view) => view.state.field(breakpointField),
            initialSpacer: () => new BreakpointMarker(markerFactory),
        }),
    ];
}

/**
 * Reports whether an enabled marker exists at the given line-start position.
 *
 * @param state The editor state.
 * @param pos The line start offset.
 * @returns `true` if a marker exists at `pos`.
 */
export function isBreakpointAt(state: EditorState, pos: number): boolean {
    let has = false;
    state.field(breakpointField).between(pos, pos, () => {
        has = true;
    });
    return has;
}

/**
 * Returns the 1-based line numbers that carry an enabled marker.
 *
 * @param state The editor state.
 * @returns The sorted list of enabled line numbers.
 */
export function enabledRuleLines(state: EditorState): number[] {
    const lines: number[] = [];
    const set = state.field(breakpointField);
    set.between(0, state.doc.length, (from) => {
        lines.push(state.doc.lineAt(from).number);
    });
    return lines;
}

import {
    type EditorState,
    type Extension,
    type Range,
    RangeSet,
    StateEffect,
    StateField,
} from '@codemirror/state';
import { gutter, GutterMarker } from '@codemirror/view';

/**
 * Effect that toggles the enabled marker for the line at the given document
 * position (the line's start offset).
 */
export const toggleBreakpoint = StateEffect.define<number>();

/**
 * Gutter marker rendered for an enabled rule line. Also owns the (mutable) DOM
 * factory used to render markers, grouped as static members instead of loose
 * module-level state.
 */
class BreakpointMarker extends GutterMarker {
    /**
     * The current factory producing an enabled-rule marker element.
     */
    private static factory: () => HTMLElement = BreakpointMarker.defaultMarker;

    /**
     * Builds the default marker element (a filled circle).
     *
     * @returns The default marker DOM element.
     */
    private static defaultMarker(): HTMLElement {
        const el = document.createElement('div');
        el.textContent = '\u25CF';
        return el;
    }

    /**
     * Sets the factory used to render enabled-rule markers.
     *
     * @param make Factory producing a marker element.
     */
    public static setFactory(make: () => HTMLElement): void {
        BreakpointMarker.factory = make;
    }

    /**
     * Renders the marker element using the current factory.
     *
     * @returns The marker DOM node.
     */
    public toDOM(): HTMLElement {
        return BreakpointMarker.factory();
    }
}

/**
 * Sets the DOM factory used to render enabled-rule markers.
 *
 * @param make Factory producing a marker element.
 */
export function setMarkerFactory(make: () => HTMLElement): void {
    BreakpointMarker.setFactory(make);
}

const breakpointField = StateField.define<RangeSet<GutterMarker>>({
    create: () => RangeSet.empty,
    update(set, tr) {
        const next = set.map(tr.changes);
        const toggles = tr.effects
            .filter((effect) => effect.is(toggleBreakpoint))
            .map((effect) => effect.value);
        if (toggles.length === 0) {
            return next;
        }
        // `RangeSet.update` rebuilds the whole set, so the toggles of one
        // transaction are applied with a single update instead of one per
        // effect: `Ctrl+A` → `Ctrl+/` dispatches one effect per selected line,
        // and rebuilding the set per effect would make it quadratic in the
        // number of lines. Two toggles of the same position in one transaction
        // still cancel each other out, like the per-effect update used to.
        const counts = new Map<number, number>();
        toggles.forEach((pos) => {
            counts.set(pos, (counts.get(pos) ?? 0) + 1);
        });
        const removed = new Set<number>();
        const added: Range<GutterMarker>[] = [];
        counts.forEach((count, pos) => {
            if (count % 2 === 1) {
                let has = false;
                next.between(pos, pos, () => {
                    has = true;
                });
                if (has) {
                    removed.add(pos);
                } else {
                    added.push(new BreakpointMarker().range(pos));
                }
            }
        });
        return next.update({
            filter: (from) => !removed.has(from),
            add: added,
            sort: true,
        });
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
            initialSpacer: () => new BreakpointMarker(),
        }),
    ];
}

/**
 * Reports whether an enabled marker exists at the given line-start position.
 *
 * @param state The editor state.
 * @param pos The line start offset.
 *
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
 *
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

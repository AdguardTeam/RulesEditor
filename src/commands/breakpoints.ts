import { invertedEffects } from '@codemirror/commands';
import {
    type EditorState,
    type Extension,
    Facet,
    type Range,
    RangeSet,
    StateEffect,
    StateField,
} from '@codemirror/state';
import { gutter, GutterMarker } from '@codemirror/view';

/**
 * Effect that toggles the enabled marker for the line at the given document
 * position (the line's start offset).
 *
 * The position is mapped with an association of `-1`, so a prefix inserted at
 * the line start (the comment toggle) keeps the marker at the start of the
 * line instead of moving it behind the prefix.
 */
export const toggleBreakpoint = StateEffect.define<number>({
    map: (value, mapping) => mapping.mapPos(value, -1),
});

/**
 * Effect that replaces the marker factory of the editor that handles it.
 */
export const setMarkerFactory = StateEffect.define<() => HTMLElement>();

/**
 * Effect that removes every enabled marker from the editor that handles it.
 */
export const clearBreakpoints = StateEffect.define<null>();

/**
 * Builds the default marker element (a filled circle).
 *
 * @returns The default marker DOM element.
 */
function defaultMarker(): HTMLElement {
    const el = document.createElement('div');
    el.textContent = '\u25CF';
    return el;
}

/**
 * Facet that holds the marker factory of one editor, so two editors on the
 * same page can render different marker styles.
 */
const markerFactory = Facet.define<() => HTMLElement, () => HTMLElement>({
    // CodeMirror resolves facet providers highest-precedence first, so the
    // first value is the one that wins.
    combine: (factories) => factories[0] ?? defaultMarker,
});

/**
 * Gutter marker rendered for an enabled rule line.
 *
 * The marker keeps the factory of the editor it belongs to: `toDOM` receives
 * no editor state, so the factory is resolved when the marker is created.
 */
class BreakpointMarker extends GutterMarker {
    /**
     * The factory that renders this marker.
     */
    readonly factory: () => HTMLElement;

    /**
     * Creates a marker that renders its element with the given factory.
     *
     * @param factory Factory producing a marker element.
     */
    constructor(factory: () => HTMLElement) {
        super();
        this.factory = factory;
    }

    /**
     * Renders the marker element using the factory of the owning editor.
     *
     * @returns The marker DOM node.
     */
    public toDOM(): HTMLElement {
        return this.factory();
    }
}

/**
 * The enabled-rule markers of one editor and the factory for new markers.
 */
interface BreakpointState {
    /**
     * The marked lines.
     */
    markers: RangeSet<GutterMarker>;

    /**
     * The factory used to render new markers.
     */
    factory: () => HTMLElement;
}

/**
 * Rebuilds the marker set with a new factory, keeping the marker positions.
 *
 * @param markers The current marker set.
 * @param factory The new marker factory.
 *
 * @returns A marker set whose markers use `factory`.
 */
function rebuildMarkers(
    markers: RangeSet<GutterMarker>,
    factory: () => HTMLElement,
): RangeSet<GutterMarker> {
    const rebuilt: Range<GutterMarker>[] = [];
    const cursor = markers.iter();
    while (cursor.value) {
        rebuilt.push(new BreakpointMarker(factory).range(cursor.from, cursor.to));
        cursor.next();
    }
    return RangeSet.of(rebuilt, true);
}

const breakpointField = StateField.define<BreakpointState>({
    create: (state) => ({
        markers: RangeSet.empty,
        factory: state.facet(markerFactory),
    }),
    update(value, tr) {
        const factoryEffect = tr.effects.find((effect) => effect.is(setMarkerFactory));
        const factory = factoryEffect ? factoryEffect.value : value.factory;
        let markers = value.markers.map(tr.changes);
        if (tr.effects.some((effect) => effect.is(clearBreakpoints))) {
            markers = RangeSet.empty;
        }
        if (factory !== value.factory) {
            markers = rebuildMarkers(markers, factory);
        }
        // The transaction does not map its own effect values, so map them to
        // the post-change document before matching them against `markers`.
        const toggles = tr.effects
            .filter((effect) => effect.is(toggleBreakpoint))
            .map((effect) => tr.changes.mapPos(effect.value, -1));
        if (toggles.length === 0) {
            return { markers, factory };
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
                markers.between(pos, pos, () => {
                    has = true;
                });
                if (has) {
                    removed.add(pos);
                } else {
                    added.push(new BreakpointMarker(factory).range(pos));
                }
            }
        });
        return {
            markers: markers.update({
                filter: (from) => !removed.has(from),
                add: added,
                sort: true,
            }),
            factory,
        };
    },
});

/**
 * Editor extension providing the enabled-rule gutter and its state field.
 *
 * @param options Gutter configuration.
 * @param options.markerFactory Factory producing a marker element for this
 *   editor. Defaults to a filled circle.
 *
 * @returns A CodeMirror 6 extension.
 */
export function breakpointState(options: {
    markerFactory?: () => HTMLElement;
} = {}): Extension {
    return [
        options.markerFactory ? markerFactory.of(options.markerFactory) : [],
        breakpointField,
        // The toggle is its own inverse, so the same effect undoes it. The
        // value is mapped to the state after the transaction, which is the
        // state an undo starts from; `breakpointField` maps it again when the
        // undo transaction is applied.
        invertedEffects.of((tr) => tr.effects
            .filter((effect) => effect.is(toggleBreakpoint))
            .map((effect) => toggleBreakpoint.of(tr.changes.mapPos(effect.value, -1)))),
        gutter({
            class: 'cm-breakpoint-gutter',
            markers: (view) => view.state.field(breakpointField).markers,
            // The field, not the facet, is the runtime source of the factory:
            // `setMarkerFactory` changes it after the editor is created.
            initialSpacer: (view) => new BreakpointMarker(
                view.state.field(breakpointField).factory,
            ),
            updateSpacer: (spacer, update) => {
                const { factory } = update.state.field(breakpointField);
                return (spacer as BreakpointMarker).factory === factory
                    ? spacer
                    : new BreakpointMarker(factory);
            },
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
    state.field(breakpointField).markers.between(pos, pos, () => {
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
    const { markers } = state.field(breakpointField);
    markers.between(0, state.doc.length, (from) => {
        lines.push(state.doc.lineAt(from).number);
    });
    return lines;
}

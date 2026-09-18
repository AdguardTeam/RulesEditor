/**
 * Storage key for the persisted demo theme.
 */
// Keep this key and the dark-resolution logic in sync with the pre-paint
// script in demo/index.html.
export const THEME_STORAGE_KEY = 'rules-editor-demo-theme';

/**
 * Theme modes offered by the demo toolbar. Values match the `data-theme`
 * attributes of the toolbar buttons in demo/index.html.
 */
export enum ThemeMode {
    System = 'system',
    Light = 'light',
    Dark = 'dark',
}

/**
 * Options for {@link initThemeSwitcher}.
 */
export interface ThemeSwitcherOptions {
    /**
     * Toolbar container holding one button with a `data-theme` attribute per
     * mode.
     */
    container: HTMLElement;

    /**
     * Called with the resolved appearance on init and on every change. The
     * consumer decides how to apply it, e.g. by reconfiguring the editor.
     *
     * @param dark Whether the dark appearance became active.
     */
    onAppearanceChange: (dark: boolean) => void;
}

/**
 * Handle for an initialized theme switcher.
 */
export interface ThemeSwitcher {
    /**
     * Resolves the current mode to a concrete appearance.
     *
     * @returns `true` when the dark appearance is active.
     */
    isDarkAppearance(): boolean;

    /**
     * Emits the current appearance via `onAppearanceChange` again. Used to
     * re-sync the editor once it exists: theme switches made while the WASM
     * module loads cannot be dispatched to the editor yet.
     */
    reapplyAppearance(): void;
}

/**
 * Initializes the demo theme switcher: restores the persisted mode, wires the
 * toolbar (mouse and ARIA radio-group arrow-key navigation), tracks the system
 * appearance while the "System" mode is selected, and applies the initial mode
 * immediately so the page reflects the persisted mode from first paint.
 *
 * @param options Switcher options.
 *
 * @returns A handle for resolving and re-applying the current appearance.
 */
export const initThemeSwitcher = (options: ThemeSwitcherOptions): ThemeSwitcher => {
    const { container, onAppearanceChange } = options;
    const buttons = Array.from(container.querySelectorAll('button'));

    // One MediaQueryList is shared by the system-mode resolution and the
    // change listener: its `matches` value stays up to date.
    const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

    /**
     * Checks whether the operating system prefers a dark appearance.
     *
     * @returns `true` when the system prefers dark mode.
     */
    const prefersDark = (): boolean => {
        return systemDarkQuery.matches;
    };

    /**
     * Resolves a theme mode to a concrete appearance.
     *
     * @param mode The selected theme mode.
     *
     * @returns `true` when the dark theme should be used.
     */
    const isDark = (mode: ThemeMode): boolean => {
        return mode === ThemeMode.Dark || (mode === ThemeMode.System && prefersDark());
    };

    /**
     * Validates an arbitrary string against the known theme modes.
     *
     * @param candidate The candidate value, e.g. a `data-theme` attribute.
     *
     * @returns The matching mode, or the system mode for invalid values.
     */
    const toThemeMode = (candidate: string | undefined): ThemeMode => {
        return candidate === ThemeMode.Light || candidate === ThemeMode.Dark || candidate === ThemeMode.System
            ? candidate
            : ThemeMode.System;
    };

    /**
     * Reads the persisted theme mode.
     *
     * @returns The stored mode, or the system mode when nothing valid is
     * stored or storage is blocked (sandboxed iframes, strict privacy
     * settings).
     */
    const readStoredTheme = (): ThemeMode => {
        try {
            return toThemeMode(localStorage.getItem(THEME_STORAGE_KEY) ?? undefined);
        } catch {
            return ThemeMode.System;
        }
    };

    let mode = readStoredTheme();

    /**
     * Applies a theme mode to the page and the toolbar, then notifies the
     * consumer so it can re-apply it to the editor.
     *
     * @param nextMode The theme mode to apply.
     */
    const applyTheme = (nextMode: ThemeMode): void => {
        const dark = isDark(nextMode);
        document.documentElement.classList.toggle('dark', dark);
        // Pin `color-scheme` for the light mode too, so page-level native UI
        // (scrollbars, form controls) matches the page while the OS is dark.
        document.documentElement.classList.toggle('light', !dark);
        for (const button of buttons) {
            const active = button.dataset.theme === nextMode;
            button.setAttribute('aria-checked', String(active));
            // Roving tabindex: only the checked radio is tabbable (ARIA radio
            // group pattern).
            button.tabIndex = active ? 0 : -1;
        }
        onAppearanceChange(dark);
    };

    /**
     * Selects a theme mode: applies it, persists it, and remembers it as the
     * current selection. A failed write (private mode, blocked storage) does
     * not cancel the applied theme.
     *
     * @param nextMode The theme mode to select.
     */
    const selectTheme = (nextMode: ThemeMode): void => {
        mode = nextMode;
        applyTheme(nextMode);
        try {
            localStorage.setItem(THEME_STORAGE_KEY, nextMode);
        } catch {
            // Storage can be blocked; the theme still applies for this
            // session.
        }
    };

    for (const button of buttons) {
        button.addEventListener('click', () => {
            selectTheme(toThemeMode(button.dataset.theme));
        });
    }

    // ARIA radio-group keyboard support: arrow keys move focus and selection
    // to the previous/next option, wrapping around at the edges.
    container.addEventListener('keydown', (event) => {
        const { key } = event;
        if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') {
            return;
        }
        event.preventDefault();
        const currentIndex = buttons.findIndex((button) => button.getAttribute('aria-checked') === 'true');
        const offset = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
        const nextIndex = (currentIndex + offset + buttons.length) % buttons.length;
        const nextButton = buttons[nextIndex];
        nextButton.focus();
        selectTheme(toThemeMode(nextButton.dataset.theme));
    });

    // Follow the system appearance while the "System" mode is selected.
    systemDarkQuery.addEventListener('change', () => {
        if (mode === ThemeMode.System) {
            applyTheme(ThemeMode.System);
        }
    });

    // Reflect the persisted mode in the page and the toolbar immediately, so
    // the initial state matches from first paint.
    applyTheme(mode);

    return {
        isDarkAppearance: () => {
            return isDark(mode);
        },
        reapplyAppearance: () => {
            onAppearanceChange(isDark(mode));
        },
    };
};

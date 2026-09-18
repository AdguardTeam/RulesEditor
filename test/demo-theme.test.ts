// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    afterEach,
    beforeEach,
    expect,
    type Mock,
    test,
    vi,
} from 'vitest';

import { initThemeSwitcher, THEME_STORAGE_KEY, ThemeMode } from '../demo/theme';

/**
 * Controllable `window.matchMedia` double: jsdom does not implement
 * `matchMedia`, and tests need to flip the OS appearance on demand.
 */
interface MatchMediaStub {
    /**
     * Flips the `matches` value and notifies the registered `change`
     * listeners.
     *
     * @param matches Whether the OS now prefers a dark appearance.
     */
    simulateOsChange: (matches: boolean) => void;
}

/**
 * Stubs `window.matchMedia` with a single MediaQueryList double.
 *
 * @param initialMatches Whether the OS initially prefers a dark appearance.
 *
 * @returns A handle for simulating OS appearance changes.
 */
const stubMatchMedia = (initialMatches: boolean): MatchMediaStub => {
    let matches = initialMatches;
    const changeListeners = new Set<() => void>();
    const mql = {
        get matches() {
            return matches;
        },
        media: '(prefers-color-scheme: dark)',
        addEventListener: (_type: string, listener: () => void) => {
            changeListeners.add(listener);
        },
        removeEventListener: (_type: string, listener: () => void) => {
            changeListeners.delete(listener);
        },
    } as unknown as MediaQueryList;
    window.matchMedia = vi.fn(() => mql);
    return {
        simulateOsChange: (nextMatches: boolean) => {
            matches = nextMatches;
            for (const listener of changeListeners) {
                listener();
            }
        },
    };
};

/**
 * The initialized demo pieces a test interacts with.
 */
interface DemoHarness {
    /**
     * Toolbar buttons in markup order (System, Light, Dark).
     */
    buttons: HTMLButtonElement[];

    /**
     * Spy standing in for the editor re-configuration callback.
     */
    onAppearanceChange: Mock<(dark: boolean) => void>;

    /**
     * Flips the stubbed OS appearance and fires the `change` listeners.
     *
     * @param matches Whether the OS now prefers a dark appearance.
     */
    simulateOsChange: (matches: boolean) => void;

    /**
     * The theme switcher handle returned by `initThemeSwitcher`.
     */
    switcher: ReturnType<typeof initThemeSwitcher>;
}

/**
 * Finds a toolbar button by its `data-theme` value.
 *
 * @param buttons Toolbar buttons.
 * @param mode The `data-theme` value to find.
 *
 * @returns The matching button.
 */
const getButton = (buttons: HTMLButtonElement[], mode: ThemeMode): HTMLButtonElement => {
    return buttons.find((button) => button.dataset.theme === mode)!;
};

/**
 * Stubs the OS appearance and initializes the theme switcher on the mounted
 * toolbar markup.
 *
 * @param osDark Whether the OS initially prefers a dark appearance.
 *
 * @returns The initialized demo pieces.
 */
const initDemo = (osDark = false): DemoHarness => {
    const { simulateOsChange } = stubMatchMedia(osDark);
    const onAppearanceChange = vi.fn<(dark: boolean) => void>();
    const container = document.getElementById('theme')!;
    const buttons = Array.from(container.querySelectorAll('button'));
    const switcher = initThemeSwitcher({ container, onAppearanceChange });
    return {
        buttons,
        onAppearanceChange,
        simulateOsChange,
        switcher,
    };
};

beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
        <div id="theme" role="radiogroup" aria-label="Theme">
            <button type="button" role="radio" data-theme="system" aria-checked="true" tabindex="0">System</button>
            <button type="button" role="radio" data-theme="light" aria-checked="false" tabindex="-1">Light</button>
            <button type="button" role="radio" data-theme="dark" aria-checked="false" tabindex="-1">Dark</button>
        </div>
    `;
});

afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.classList.remove('dark', 'light');
    document.body.innerHTML = '';
});

test('restores the persisted theme on init', () => {
    localStorage.setItem(THEME_STORAGE_KEY, ThemeMode.Dark);
    const { buttons, onAppearanceChange } = initDemo();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(getButton(buttons, ThemeMode.Dark).getAttribute('aria-checked')).toBe('true');
    expect(getButton(buttons, ThemeMode.Dark).tabIndex).toBe(0);
    expect(getButton(buttons, ThemeMode.System).getAttribute('aria-checked')).toBe('false');
    expect(getButton(buttons, ThemeMode.System).tabIndex).toBe(-1);
    expect(onAppearanceChange).toHaveBeenCalledWith(true);
});

test('ignores an invalid stored value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'blue');
    const { buttons, onAppearanceChange } = initDemo();
    expect(getButton(buttons, ThemeMode.System).getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(onAppearanceChange).toHaveBeenCalledWith(false);
});

test('falls back to the system appearance when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('Access is denied', 'SecurityError');
    });
    const { buttons, onAppearanceChange } = initDemo(true);
    expect(getButton(buttons, ThemeMode.System).getAttribute('aria-checked')).toBe('true');
    // System mode + dark OS resolves to the dark appearance.
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(onAppearanceChange).toHaveBeenCalledWith(true);
});

test('applies the theme even when persisting the selection fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    const { buttons, onAppearanceChange } = initDemo();
    getButton(buttons, ThemeMode.Dark).click();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(getButton(buttons, ThemeMode.Dark).getAttribute('aria-checked')).toBe('true');
    expect(onAppearanceChange).toHaveBeenLastCalledWith(true);
});

test('applies theme switches made before the editor finishes loading', () => {
    const { buttons, onAppearanceChange, switcher } = initDemo();
    // The editor is not created yet (WASM still loading): clicks still apply.
    getButton(buttons, ThemeMode.Dark).click();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    getButton(buttons, ThemeMode.Light).click();
    expect(document.documentElement.classList.contains('light')).toBe(true);
    // Once the editor exists, it is re-synced to the latest selection.
    switcher.reapplyAppearance();
    expect(onAppearanceChange).toHaveBeenLastCalledWith(false);
    expect(switcher.isDarkAppearance()).toBe(false);
});

test('follows OS appearance changes while the system mode is selected', () => {
    const { onAppearanceChange, simulateOsChange } = initDemo();
    expect(document.documentElement.classList.contains('light')).toBe(true);
    simulateOsChange(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(onAppearanceChange).toHaveBeenLastCalledWith(true);
});

test('ignores OS appearance changes when a concrete mode is selected', () => {
    const { buttons, simulateOsChange } = initDemo();
    getButton(buttons, ThemeMode.Light).click();
    simulateOsChange(true);
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
});

test('arrow keys move focus and selection with a roving tabindex', () => {
    const { buttons } = initDemo();
    document.getElementById('theme')!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    const lightButton = getButton(buttons, ThemeMode.Light);
    expect(lightButton.getAttribute('aria-checked')).toBe('true');
    expect(lightButton.tabIndex).toBe(0);
    expect(getButton(buttons, ThemeMode.System).tabIndex).toBe(-1);
    expect(document.activeElement).toBe(lightButton);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(ThemeMode.Light);
});

test('arrow keys wrap around at the edges', () => {
    const { buttons } = initDemo();
    document.getElementById('theme')!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }),
    );
    expect(getButton(buttons, ThemeMode.Dark).getAttribute('aria-checked')).toBe('true');
    expect(getButton(buttons, ThemeMode.Dark).tabIndex).toBe(0);
});

test('demo/index.html toolbar buttons match the ThemeMode enum', () => {
    const html = readFileSync(resolve(__dirname, '../demo/index.html'), 'utf8');
    const page = new DOMParser().parseFromString(html, 'text/html');
    const pageModes = Array.from(page.querySelectorAll('#theme button')).map(
        (button) => button.getAttribute('data-theme'),
    );
    const enumModes = Object.values(ThemeMode);
    // The mode list lives in two places: the `ThemeMode` enum and the
    // `data-theme` attributes in `demo/index.html`. A rename or typo in one
    // of them must fail the test instead of silently selecting System.
    expect(pageModes).toHaveLength(enumModes.length);
    for (const mode of enumModes) {
        expect(pageModes).toContain(mode);
    }
});

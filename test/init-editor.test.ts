// @vitest-environment jsdom
import { test, expect, beforeEach, vi } from 'vitest';
import { initEditor, getRulesFromEditor, setEditorValue } from '../src/init-editor';
import { RegistryManager } from '../src/lib/registry';

beforeEach(() => RegistryManager.resetForTests());

test('mounts an editor and highlights a comment', async () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const view = await initEditor(textarea, { hotkeys: { mode: 'mac' } });
    view.dispatch({ changes: { from: 0, insert: '! comment' } });
    const span = view.dom.querySelector('.cm-line span');
    expect(span).not.toBeNull();
    expect(span!.textContent).toBe('! comment');
    expect(span!.className).not.toBe('');
    view.destroy();
});

test('setEditorValue + getRulesFromEditor round-trips enabled flags', async () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const view = await initEditor(textarea, { hotkeys: { mode: 'mac' }, withBreakpoints: true });
    setEditorValue(view, [
        { enabled: true, rule: '||a.com^' },
        { enabled: false, rule: '||b.com^' },
    ], {});
    const rules = getRulesFromEditor(view);
    expect(rules).toEqual([
        { enabled: true, rule: '||a.com^' },
        { enabled: false, rule: '||b.com^' },
    ]);
    view.destroy();
});

test("highlight: 'none' mounts without loading a grammar", async () => {
    const spy = vi.spyOn(RegistryManager, 'getGrammar');
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const view = await initEditor(textarea, {
        hotkeys: { mode: 'mac' },
        highlight: 'none',
    });
    view.dispatch({ changes: { from: 0, insert: '! comment' } });
    expect(spy).not.toHaveBeenCalled();
    expect(view.dom.querySelector('.cm-line span')).toBeNull();
    expect(view.dom.textContent).toContain('! comment');
    spy.mockRestore();
    view.destroy();
});

test("highlight: 'simple' highlights without loading a grammar", async () => {
    const spy = vi.spyOn(RegistryManager, 'getGrammar');
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const view = await initEditor(textarea, {
        hotkeys: { mode: 'mac' },
        highlight: 'simple',
    });
    view.dispatch({ changes: { from: 0, insert: '! comment' } });
    const span = view.dom.querySelector('.cm-line span');
    expect(spy).not.toHaveBeenCalled();
    expect(span).not.toBeNull();
    expect(span!.className).not.toBe('');
    spy.mockRestore();
    view.destroy();
});

test('HighlightMode is exported from the package entry point', async () => {
    const mod = await import('../src/index');
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    const value: import('../src/index').HighlightMode = 'simple';
    expect(mod.initEditor).toBeTypeOf('function');
    expect(value).toBe('simple');
});

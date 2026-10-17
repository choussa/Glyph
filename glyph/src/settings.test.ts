import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  activeScopes,
  clearSettings,
  loadSettings,
  saveSettings,
  scopeOf,
} from './settings';

class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

const KEY = 'glyph.settings.v1';

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = new MemoryStorage() as unknown as Storage;
});

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe('settings', () => {
  it('boots with the defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges a stored file over the defaults, so an old build still boots', () => {
    localStorage.setItem(KEY, JSON.stringify({ theme: 'light', fontSize: 20 }));
    const loaded = loadSettings();
    expect(loaded.theme).toBe('light');
    expect(loaded.fontSize).toBe(20);
    expect(loaded.tabSize).toBe(DEFAULT_SETTINGS.tabSize);
  });

  it('recovers from corrupt storage', () => {
    localStorage.setItem(KEY, '{ not json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips through save and clear', () => {
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'light' });
    expect(loadSettings().theme).toBe('light');
    clearSettings();
    expect(loadSettings().theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it('survives storage that throws (private mode, quota)', () => {
    const thrower = {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('quota');
      },
      removeItem() {
        throw new Error('denied');
      },
    } as unknown as Storage;
    (globalThis as { localStorage?: Storage }).localStorage = thrower;
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
    expect(() => clearSettings()).not.toThrow();
  });
});

describe('settings scopes', () => {
  it('assigns every setting an owning scope', () => {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      expect(['local-editor', 'cloud-user', 'cloud-project']).toContain(
        scopeOf(key as keyof typeof DEFAULT_SETTINGS),
      );
    }
  });

  it('reports the layers a context can write to, highest precedence first', () => {
    expect(activeScopes()).toEqual(['local-editor']);
    expect(activeScopes({ user: 'a@b.c' })).toEqual(['cloud-user', 'local-editor']);
    expect(activeScopes({ user: 'a@b.c', projectId: 'p1' })).toEqual([
      'cloud-project',
      'cloud-user',
      'local-editor',
    ]);
  });

  it('routes each key to its owner layer', () => {
    const context = { user: 'a@b.c', projectId: 'p1' };
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark', zoomMode: 'fit-page', splitRatio: 0.3 }, context);

    // Theme is a profile setting, zoom belongs to the project, layout to the browser.
    expect(JSON.parse(localStorage.getItem('glyph.user-settings.v1:a@b.c')!)).toEqual({
      theme: 'dark',
      fontSize: DEFAULT_SETTINGS.fontSize,
      lineHeight: DEFAULT_SETTINGS.lineHeight,
      tabSize: DEFAULT_SETTINGS.tabSize,
      wrap: DEFAULT_SETTINGS.wrap,
      lineNumbers: DEFAULT_SETTINGS.lineNumbers,
      highlightActiveLine: DEFAULT_SETTINGS.highlightActiveLine,
      showToolbar: DEFAULT_SETTINGS.showToolbar,
      showTabBar: DEFAULT_SETTINGS.showTabBar,
      showStatusBar: DEFAULT_SETTINGS.showStatusBar,
    });
    expect(JSON.parse(localStorage.getItem('glyph.project-settings.v1:p1')!)).toEqual({
      follow: DEFAULT_SETTINGS.follow,
      zoomMode: 'fit-page',
      scale: DEFAULT_SETTINGS.scale,
    });
    expect(JSON.parse(localStorage.getItem('glyph.settings.v1')!)).toEqual({
      layout: DEFAULT_SETTINGS.layout,
      splitRatio: 0.3,
      railWidth: DEFAULT_SETTINGS.railWidth,
      panelWidth: DEFAULT_SETTINGS.panelWidth,
      panel: DEFAULT_SETTINGS.panel,
      previewPopup: DEFAULT_SETTINGS.previewPopup,
    });
  });

  it('resolves project over user over editor per key', () => {
    localStorage.setItem('glyph.settings.v1', JSON.stringify({ theme: 'light', layout: 'editor' }));
    localStorage.setItem('glyph.user-settings.v1:a@b.c', JSON.stringify({ theme: 'dark' }));
    localStorage.setItem('glyph.project-settings.v1:p1', JSON.stringify({ zoomMode: 'fit-page' }));

    const resolved = loadSettings({ user: 'a@b.c', projectId: 'p1' });
    expect(resolved.theme).toBe('dark'); // user beats editor
    expect(resolved.layout).toBe('editor'); // editor is the only layer that owns it
    expect(resolved.zoomMode).toBe('fit-page'); // project owns the view
  });

  it('falls back to the editor layer when the owner layer has no value', () => {
    // A value set before signing in must survive signing in.
    localStorage.setItem('glyph.settings.v1', JSON.stringify({ theme: 'dark' }));
    expect(loadSettings({ user: 'a@b.c' }).theme).toBe('dark');

    // Writing while signed in now targets the profile, which then wins.
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'light' }, { user: 'a@b.c' });
    expect(loadSettings({ user: 'a@b.c' }).theme).toBe('light');
    expect(loadSettings().theme).toBe('dark');
  });

  it('degrades to one browser blob when there is no account or project', () => {
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark', zoomMode: 'fit-page' });
    const stored = JSON.parse(localStorage.getItem('glyph.settings.v1')!);
    expect(Object.keys(stored).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
    expect(loadSettings()).toMatchObject({ theme: 'dark', zoomMode: 'fit-page' });
  });

  it('clears every layer the context can see', () => {
    const context = { user: 'a@b.c', projectId: 'p1' };
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, context);
    localStorage.setItem('glyph.settings.v1', JSON.stringify({ layout: 'editor' }));

    clearSettings(context);
    expect(localStorage.getItem('glyph.user-settings.v1:a@b.c')).toBeNull();
    expect(localStorage.getItem('glyph.project-settings.v1:p1')).toBeNull();
    expect(localStorage.getItem('glyph.settings.v1')).toBeNull();
    expect(loadSettings(context)).toEqual(DEFAULT_SETTINGS);
  });

  it('ignores a corrupt layer instead of losing the others', () => {
    localStorage.setItem('glyph.settings.v1', '{ not json');
    localStorage.setItem('glyph.user-settings.v1:a@b.c', JSON.stringify({ theme: 'dark' }));
    const resolved = loadSettings({ user: 'a@b.c' });
    expect(resolved.theme).toBe('dark');
    expect(resolved.tabSize).toBe(DEFAULT_SETTINGS.tabSize);
  });
});

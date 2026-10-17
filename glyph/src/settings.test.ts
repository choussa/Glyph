import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, clearSettings, loadSettings, saveSettings } from './settings';

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

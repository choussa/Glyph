import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Workspace } from './useWorkspace';

/** A valid 1x1 PNG, so the test proves real bytes survive the trip. */
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

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

function pngBytes(): Uint8Array {
  return Uint8Array.from(atob(PNG_B64), (char) => char.charCodeAt(0));
}

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = new MemoryStorage() as unknown as Storage;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe('Workspace.bundle', () => {
  it('sends text files in `files` and binary files in `assets`, base64-encoded', () => {
    const workspace = new Workspace();
    workspace.init('#let x = 1');

    const bytes = pngBytes();
    workspace.addUpload('/', new File([], 'logo.png'), bytes.buffer as ArrayBuffer);
    workspace.createFile('/', 'notes.typ', 'body text');

    const bundle = workspace.bundle();
    expect(bundle.entry).toBe('/main.typ');
    expect(bundle.files['/main.typ']).toBe('#let x = 1');
    expect(bundle.files['/notes.typ']).toBe('body text');
    // The regression: this used to be absent, so a rendered image vanished.
    expect(bundle.assets['/logo.png']).toBe(PNG_B64);
  });

  it('drops an asset from the bundle when the file is deleted', () => {
    const workspace = new Workspace();
    workspace.init('x');
    const bytes = pngBytes();
    workspace.addUpload('/', new File([], 'logo.png'), bytes.buffer as ArrayBuffer);
    expect(Object.keys(workspace.bundle().assets)).toEqual(['/logo.png']);

    workspace.remove('/logo.png');
    expect(Object.keys(workspace.bundle().assets)).toEqual([]);
  });

  it('treats known source extensions as text, not assets', () => {
    const workspace = new Workspace();
    workspace.init('x');
    const source = new TextEncoder().encode('= Imported').buffer as ArrayBuffer;
    workspace.addUpload('/', new File([], 'chapter.typ'), source);
    const bundle = workspace.bundle();
    expect(bundle.files['/chapter.typ']).toBe('= Imported');
    expect(bundle.assets['/chapter.typ']).toBeUndefined();
  });

  it('refuses a forbidden upload and leaves the project untouched', () => {
    const workspace = new Workspace();
    workspace.init('x');
    const before = workspace.getSnapshot().paths;

    expect(() =>
      workspace.addUpload('/', new File([], 'installer.exe'), new ArrayBuffer(4)),
    ).toThrowError(/not allowed/);
    expect(workspace.getSnapshot().paths).toEqual(before);
    expect(workspace.has('/installer.exe')).toBe(false);
  });

  it('refuses an unsupported extension', () => {
    const workspace = new Workspace();
    workspace.init('x');
    expect(() =>
      workspace.addUpload('/', new File([], 'theme.css'), new ArrayBuffer(4)),
    ).toThrowError(/not supported/);
  });
});

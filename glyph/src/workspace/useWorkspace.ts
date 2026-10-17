/**
 * The workspace store.
 *
 * A project is more than one buffer: it is a set of files, the folders that
 * imply its shape, which file is the entry point, which tabs are open, and
 * which file is in front. This module owns all of that.
 *
 * Two deliberate design choices:
 *
 * 1. **File contents live outside React state.** Keystrokes mutate a `Map` and
 *    notify only a content channel, so typing re-renders nothing. Metadata
 *    (paths, tabs, dirty flags) is published through an immutable snapshot read
 *    by `useSyncExternalStore`.
 * 2. **The store never touches the engine.** Structural changes are emitted as
 *    `EngineOp`s that the host applies to the `TypstProject`. That keeps the
 *    file model testable and the engine wiring in one place.
 */
import { useSyncExternalStore } from 'react';
import { MAIN_PATH } from '../typst/config';
import { bytesToBase64 } from './base64';
import { dirname, isInside, normalizePath, uniquePath } from './model';

/* ------------------------------------------------------------ engine ops */

/** A structural change the engine needs to mirror. */
export type EngineOp =
  | { type: 'set'; path: string; text: string }
  | { type: 'binary'; path: string; bytes: Uint8Array }
  | { type: 'remove'; path: string };

/* --------------------------------------------------------------- snapshot */

export interface WorkspaceSnapshot {
  /** False until `init` has seeded the project. */
  ready: boolean;
  /** Every file path, in insertion order. */
  paths: string[];
  /** The subset of `paths` the engine treats as binary. */
  binary: string[];
  /** Explicitly-created folders (folders are otherwise implied by paths). */
  folders: string[];
  entry: string;
  tabs: string[];
  active: string;
  /** Paths with edits not yet written to storage. */
  dirty: string[];
}

const EMPTY: WorkspaceSnapshot = {
  ready: false,
  paths: [],
  binary: [],
  folders: [],
  entry: MAIN_PATH,
  tabs: [],
  active: '',
  dirty: [],
};

/* ------------------------------------------------------------ persistence */

const STORAGE_KEY = 'glyph.workspace.v1';

/** Per-project key; the original key is kept for the seeded demo project. */
export function storageKeyFor(projectId: string): string {
  return projectId === 'attention' ? STORAGE_KEY : `glyph.workspace.v2.${projectId}`;
}

interface Persisted {
  version: 1;
  files: { path: string; text: string }[];
  folders: string[];
  entry: string;
  tabs: string[];
  active: string;
}

/* ---------------------------------------------------------------- helpers */

/** A name is usable if it is non-empty and free of path separators. */
export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 128 && !/[/\\]/.test(trimmed);
}

/** Split a file name into `stem` and `ext` (ext includes the dot). */
function splitName(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? { stem: name.slice(0, dot), ext: name.slice(dot) } : { stem: name, ext: '' };
}

/* --------------------------------------------------------------- the store */

export class Workspace {
  private readonly text = new Map<string, string>();
  private readonly bytes = new Map<string, Uint8Array>();
  private readonly folders = new Set<string>();
  private readonly dirty = new Set<string>();
  private order: string[] = [];
  private tabs: string[] = [];
  private active = '';
  private entry = MAIN_PATH;
  private ready = false;

  constructor(private readonly storageKey: string = STORAGE_KEY) {}

  private readonly listeners = new Set<() => void>();
  private readonly contentListeners = new Set<() => void>();
  private snapshot: WorkspaceSnapshot = EMPTY;
  private persistTimer: ReturnType<typeof setTimeout> | undefined;

  /** Applied to the engine by the host. */
  private opHandler: ((op: EngineOp) => void) | null = null;
  /** Ops emitted before the engine existed, replayed on connect. */
  private pending: EngineOp[] = [];
  /** User-facing messages (failed renames, rejected names…). */
  onNotice: ((message: string) => void) | null = null;

  /* ------------------------------------------------------------ plumbing */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): WorkspaceSnapshot => this.snapshot;

  /** Subscribe to *content* edits — search results, word counts, and so on. */
  subscribeContent = (listener: () => void): (() => void) => {
    this.contentListeners.add(listener);
    return () => this.contentListeners.delete(listener);
  };

  private publish(): void {
    this.snapshot = {
      ready: this.ready,
      paths: [...this.order],
      binary: this.order.filter((path) => this.bytes.has(path)),
      folders: [...this.folders],
      entry: this.entry,
      tabs: [...this.tabs],
      active: this.active,
      dirty: [...this.dirty],
    };
    for (const listener of this.listeners) listener();
    this.schedulePersist();
  }

  private notifyContent(): void {
    for (const listener of this.contentListeners) listener();
  }

  private emit(op: EngineOp): void {
    if (this.opHandler) this.opHandler(op);
    else this.pending.push(op);
  }

  /**
   * Connect the engine. Everything emitted before this call — including the
   * initial project from `init` — is replayed in order, so a slow engine boot
   * never loses a file.
   */
  setOpHandler(handler: ((op: EngineOp) => void) | null): void {
    this.opHandler = handler;
    if (!handler) return;
    const queue = this.pending;
    this.pending = [];
    for (const op of queue) handler(op);
  }

  private notice(message: string): void {
    this.onNotice?.(message);
  }

  /* --------------------------------------------------------------- reads */

  has(path: string): boolean {
    const normal = normalizePath(path);
    return this.text.has(normal) || this.bytes.has(normal);
  }

  isBinary(path: string): boolean {
    return this.bytes.has(normalizePath(path));
  }

  getText(path: string): string | undefined {
    return this.text.get(normalizePath(path));
  }

  getBytes(path: string): Uint8Array | undefined {
    return this.bytes.get(normalizePath(path));
  }

  /** Size in bytes for binaries, UTF-16 length for text. */
  sizeOf(path: string): number {
    const normal = normalizePath(path);
    const bytes = this.bytes.get(normal);
    if (bytes) return bytes.length;
    return this.text.get(normal)?.length ?? 0;
  }

  /** Every text file, for search and export. */
  textFiles(): { path: string; text: string }[] {
    return this.order
      .filter((path) => this.text.has(path))
      .map((path) => ({ path, text: this.text.get(path)! }));
  }

  /** Every path currently in the project. */
  listPaths(): string[] {
    return [...this.order];
  }

  /** Every binary file, base64-encoded, for the render service. */
  assetFiles(): { path: string; base64: string }[] {
    return this.order
      .filter((path) => this.bytes.has(path))
      .map((path) => ({ path, base64: bytesToBase64(this.bytes.get(path)!) }));
  }

  /**
   * The whole project as the render service expects it.
   *
   * Text files go in `files`; binary files go in `assets`, base64-encoded.
   * Dropping the assets here was a real bug: a document with `#image("logo.png")`
   * rendered server-side (export, share preview) came out with the image missing
   * and no error, because the service never received the bytes.
   */
  bundle(): { entry: string; files: Record<string, string>; assets: Record<string, string> } {
    const files: Record<string, string> = {};
    for (const { path, text } of this.textFiles()) files[path] = text;
    const assets: Record<string, string> = {};
    for (const { path, base64 } of this.assetFiles()) assets[path] = base64;
    return { entry: this.entry, files, assets };
  }

  /* ------------------------------------------------------------ lifecycle */

  /**
   * Seed the project on first boot, restoring the previous session when one
   * exists. Binaries are intentionally not persisted — durable asset storage is
   * a server concern, not a `localStorage` one.
   */
  init(fallbackText: string): void {
    if (this.ready) return;

    const restored = this.load();
    if (restored && restored.files.length > 0) {
      for (const file of restored.files) {
        const path = normalizePath(file.path);
        this.text.set(path, file.text);
        this.order.push(path);
      }
      for (const folder of restored.folders) this.folders.add(normalizePath(folder));
      this.entry = this.has(restored.entry) ? normalizePath(restored.entry) : this.order[0]!;
      this.tabs = restored.tabs.filter((path) => this.has(path));
      if (this.tabs.length === 0) this.tabs = [this.entry];
      this.active = this.has(restored.active) ? normalizePath(restored.active) : this.tabs[0]!;
    } else {
      this.text.set(MAIN_PATH, fallbackText);
      this.order.push(MAIN_PATH);
      this.entry = MAIN_PATH;
      this.tabs = [MAIN_PATH];
      this.active = MAIN_PATH;
    }

    this.ready = true;
    // Push the restored project into the engine.
    for (const path of this.order) {
      const text = this.text.get(path);
      if (text !== undefined) this.emit({ type: 'set', path, text });
    }
    this.publish();
    this.notifyContent();
  }

  /* ---------------------------------------------------------------- tabs */

  open(path: string): void {
    const normal = normalizePath(path);
    if (!this.has(normal)) return;
    if (!this.tabs.includes(normal)) this.tabs.push(normal);
    this.active = normal;
    this.publish();
  }

  setActive(path: string): void {
    const normal = normalizePath(path);
    if (!this.has(normal) || this.active === normal) return;
    if (!this.tabs.includes(normal)) this.tabs.push(normal);
    this.active = normal;
    this.publish();
  }

  close(path: string): void {
    const normal = normalizePath(path);
    const at = this.tabs.indexOf(normal);
    if (at === -1) return;
    this.tabs.splice(at, 1);
    if (this.active === normal) {
      // Prefer the tab to the right, then the one to the left.
      const next = this.tabs[at] ?? this.tabs[at - 1] ?? this.entry;
      this.active = this.has(next) ? next : (this.order[0] ?? '');
    }
    this.publish();
  }

  closeOthers(path: string): void {
    const normal = normalizePath(path);
    if (!this.has(normal)) return;
    this.tabs = [normal];
    this.active = normal;
    this.publish();
  }

  closeAll(): void {
    this.tabs = [];
    this.active = this.entry;
    this.publish();
  }

  /* --------------------------------------------------------- file system */

  /** Create a text file. Returns the path actually used. */
  createFile(dir: string, name: string, content = ''): string {
    if (!isValidName(name)) {
      this.notice(`“${name}” is not a valid file name`);
      return '';
    }
    const path = uniquePath(`${normalizePath(dir)}/${name.trim()}`, this.order);
    this.text.set(path, content);
    this.order.push(path);
    this.tabs.push(path);
    this.active = path;
    this.emit({ type: 'set', path, text: content });
    this.publish();
    this.notifyContent();
    return path;
  }

  /** Create a folder. Returns the path actually used. */
  createFolder(dir: string, name: string): string {
    if (!isValidName(name)) {
      this.notice(`“${name}” is not a valid folder name`);
      return '';
    }
    const path = uniquePath(`${normalizePath(dir)}/${name.trim()}`, this.folders);
    this.folders.add(path);
    this.publish();
    return path;
  }

  /** Rename a file, keeping its contents, tabs, and dirty flag. */
  rename(path: string, name: string): string {
    const from = normalizePath(path);
    if (!this.has(from)) return from;
    if (!isValidName(name)) {
      this.notice(`“${name}” is not a valid file name`);
      return from;
    }
    const to = uniquePath(`${dirname(from)}/${name.trim()}`, this.order);
    if (to === from) return from;
    this.remap(from, to);
    this.publish();
    return to;
  }

  /** Rename a folder and every file inside it. */
  renameFolder(path: string, name: string): string {
    const from = normalizePath(path);
    if (!isValidName(name)) {
      this.notice(`“${name}” is not a valid folder name`);
      return from;
    }
    const to = uniquePath(`${dirname(from)}/${name.trim()}`, this.folders);
    if (to === from) return from;

    for (const file of this.order.filter((p) => isInside(p, from))) {
      this.remap(file, normalizePath(`${to}${file.slice(from.length)}`), false);
    }
    for (const folder of [...this.folders].filter((f) => isInside(f, from))) {
      const next = normalizePath(`${to}${folder.slice(from.length)}`);
      this.folders.delete(folder);
      this.folders.add(next);
    }
    this.folders.delete(from);
    this.folders.add(to);
    this.publish();
    return to;
  }

  /** Move a file into a directory. */
  move(path: string, dir: string): string {
    const from = normalizePath(path);
    if (!this.has(from)) return from;
    const to = uniquePath(`${normalizePath(dir)}/${from.slice(from.lastIndexOf('/') + 1)}`, this.order);
    if (to === from) return from;
    this.remap(from, to);
    this.publish();
    return to;
  }

  /** Copy a file next to itself, with a `-copy` suffix. */
  duplicate(path: string): string {
    const from = normalizePath(path);
    const text = this.text.get(from);
    const bytes = this.bytes.get(from);
    if (text === undefined && bytes === undefined) return from;

    const { stem, ext } = splitName(from.slice(from.lastIndexOf('/') + 1));
    const target = uniquePath(`${dirname(from)}/${stem}-copy${ext}`, this.order);

    if (text !== undefined) {
      this.text.set(target, text);
      this.emit({ type: 'set', path: target, text });
    } else if (bytes !== undefined) {
      this.bytes.set(target, bytes);
      this.emit({ type: 'binary', path: target, bytes });
    }
    this.order.push(target);
    this.tabs.push(target);
    this.active = target;
    this.publish();
    this.notifyContent();
    return target;
  }

  /** Delete a file. */
  remove(path: string): void {
    const normal = normalizePath(path);
    if (!this.has(normal)) return;
    this.drop(normal);
    this.publish();
    this.notifyContent();
  }

  /** Delete a folder and everything inside it. */
  removeFolder(path: string): void {
    const normal = normalizePath(path);
    const victims = this.order.filter((p) => isInside(p, normal));
    for (const victim of victims) this.drop(victim);
    for (const folder of [...this.folders]) {
      if (isInside(folder, normal)) this.folders.delete(folder);
    }
    this.folders.delete(normal);
    this.publish();
    this.notifyContent();
  }

  /** Adopt an uploaded file (binary asset or imported source). */
  addUpload(dir: string, file: File, data: ArrayBuffer): string {
    const target = uniquePath(`${normalizePath(dir)}/${file.name}`, this.order);
    const isText = /\.(typ|txt|md|json|toml|yaml|yml|csv|bib|csl)$/i.test(file.name);
    if (isText) {
      const text = new TextDecoder().decode(data);
      this.text.set(target, text);
      this.emit({ type: 'set', path: target, text });
    } else {
      const bytes = new Uint8Array(data);
      this.bytes.set(target, bytes);
      this.emit({ type: 'binary', path: target, bytes });
    }
    this.order.push(target);
    this.tabs.push(target);
    this.active = target;
    this.publish();
    this.notifyContent();
    return target;
  }

  setEntry(path: string): void {
    const normal = normalizePath(path);
    if (!this.text.has(normal)) return;
    this.entry = normal;
    this.publish();
  }

  /* ------------------------------------------------------------ contents */

  /**
   * Record an edit. Deliberately does *not* republish the metadata snapshot
   * unless the dirty flag flips — that is what keeps typing cheap.
   */
  setText(path: string, text: string): void {
    const normal = normalizePath(path);
    if (this.text.get(normal) === text) return;
    const wasDirty = this.dirty.has(normal);
    this.text.set(normal, text);
    this.dirty.add(normal);
    this.emit({ type: 'set', path: normal, text });
    if (!wasDirty) this.publish();
    else this.schedulePersist();
    this.notifyContent();
  }

  /* --------------------------------------------------------- persistence */

  private schedulePersist(): void {
    if (this.persistTimer !== undefined) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.flush(), 600);
  }

  /** Write to `localStorage` and clear the dirty set. */
  flush(): void {
    if (this.persistTimer !== undefined) {
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
    }
    if (!this.ready) return;

    const payload: Persisted = {
      version: 1,
      files: this.textFiles(),
      folders: [...this.folders],
      entry: this.entry,
      tabs: [...this.tabs],
      active: this.active,
    };

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(payload));
    } catch {
      // Quota exceeded, or storage disabled. The session keeps working.
    }

    if (this.dirty.size > 0) {
      this.dirty.clear();
      this.snapshot = { ...this.snapshot, dirty: [] };
      for (const listener of this.listeners) listener();
    }
  }

  private load(): Persisted | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Persisted;
      if (parsed?.version !== 1 || !Array.isArray(parsed.files)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  /** Forget the persisted project (used by “Reset workspace”). */
  clearStorage(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      /* ignore */
    }
  }

  /* -------------------------------------------------------------- private */

  /** Move a path in every index that mentions it. */
  private remap(from: string, to: string, emit = true): void {
    const text = this.text.get(from);
    const bytes = this.bytes.get(from);
    if (text !== undefined) {
      this.text.delete(from);
      this.text.set(to, text);
      if (emit) this.emit({ type: 'remove', path: from });
      if (emit) this.emit({ type: 'set', path: to, text });
    } else if (bytes !== undefined) {
      this.bytes.delete(from);
      this.bytes.set(to, bytes);
      if (emit) this.emit({ type: 'remove', path: from });
      if (emit) this.emit({ type: 'binary', path: to, bytes });
    }

    const at = this.order.indexOf(from);
    if (at !== -1) this.order[at] = to;
    this.tabs = this.tabs.map((path) => (path === from ? to : path));
    if (this.active === from) this.active = to;
    if (this.entry === from) this.entry = to;
    if (this.dirty.delete(from)) this.dirty.add(to);
  }

  private drop(path: string): void {
    this.text.delete(path);
    this.bytes.delete(path);
    this.order = this.order.filter((p) => p !== path);
    this.tabs = this.tabs.filter((p) => p !== path);
    this.dirty.delete(path);
    if (this.active === path) this.active = this.tabs[0] ?? this.entry;
    if (this.entry === path) this.entry = this.order[0] ?? '';
    this.emit({ type: 'remove', path });
  }
}

/** Read the workspace snapshot, re-rendering only when metadata changes. */
export function useWorkspaceSnapshot(workspace: Workspace): WorkspaceSnapshot {
  return useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);
}

/**
 * Cursor and selection state, published outside React.
 *
 * The status bar, the outline, and the word count all need to know where the
 * cursor is — and the cursor moves on every keystroke. Routing that through
 * React state would re-render the whole application per character, so instead
 * the editor writes here and only the few components that care subscribe.
 */
import { useSyncExternalStore } from 'react';
import type { SelectionInfo } from './insert';

export interface CursorState {
  /** The file the cursor is in. */
  path: string;
  /** UTF-16 offset of the cursor. */
  offset: number;
  info: SelectionInfo;
  /**
   * Increments whenever the document changes, so content-dependent subscribers
   * can tell an edit from a pure cursor move.
   */
  revision: number;
}

const EMPTY_INFO: SelectionInfo = { line: 1, column: 1, selected: 0, ranges: 1, endLine: 1 };

export class CursorStore {
  private state: CursorState = { path: '', offset: 0, info: EMPTY_INFO, revision: 0 };
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): CursorState => this.state;

  /** Record a cursor move. */
  move(path: string, offset: number, info: SelectionInfo): void {
    this.state = { ...this.state, path, offset, info };
    this.emit();
  }

  /** Record a document change. */
  edit(path: string, offset: number, info: SelectionInfo): void {
    this.state = { path, offset, info, revision: this.state.revision + 1 };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** Subscribe a component to the cursor store. */
export function useCursor(cursor: CursorStore): CursorState {
  return useSyncExternalStore(cursor.subscribe, cursor.getSnapshot, cursor.getSnapshot);
}

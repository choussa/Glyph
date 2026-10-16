/**
 * The document outline.
 *
 * Headings come from a lexical scan of the active document (see
 * `extractOutline`) — synchronous, offline, and always in step with the buffer
 * the editor is showing. The panel subscribes to the workspace's content channel
 * and the cursor store itself, so typing and cursor movement update the outline
 * without re-rendering the rest of the application.
 */
import { useEffect, useMemo, useState } from 'react';
import { extractOutline } from '../workspace/model';
import type { Workspace } from '../workspace/useWorkspace';
import { useCursor, type CursorStore } from '../editor/cursorStore';
import { Icon } from '../ui/Icon';

export interface OutlinePanelProps {
  workspace: Workspace;
  /** The file to outline. */
  path: string;
  cursor: CursorStore;
  /** Reveal a range in the active document. */
  onReveal: (from: number, to: number) => void;
}

export function OutlinePanel({ workspace, path, cursor, onReveal }: OutlinePanelProps) {
  const [text, setText] = useState(() => workspace.getText(path) ?? '');
  const position = useCursor(cursor);

  // Re-read on tab switch.
  useEffect(() => {
    setText(workspace.getText(path) ?? '');
  }, [workspace, path]);

  // Re-read (debounced) after edits.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = workspace.subscribeContent(() => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => setText(workspace.getText(path) ?? ''), 180);
    });
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      unsubscribe();
    };
  }, [workspace, path]);

  const entries = useMemo(() => extractOutline(text), [text]);
  const cursorOffset = position.path === path ? position.offset : 0;

  const currentIndex = useMemo(() => {
    let index = -1;
    for (let at = 0; at < entries.length; at++) {
      if (entries[at]!.from <= cursorOffset) index = at;
      else break;
    }
    return index;
  }, [entries, cursorOffset]);

  const minLevel = entries.length > 0 ? Math.min(...entries.map((entry) => entry.level)) : 1;

  return (
    <div className="panel panel-outline">
      <header className="panel-head">
        <h2 className="panel-title">Outline</h2>
        <span className="panel-count">{entries.length}</span>
      </header>

      {entries.length === 0 ? (
        <p className="panel-empty">
          No headings yet. Start a line with <code>=</code> to create one.
        </p>
      ) : (
        <ul className="outline-list" role="tree">
          {entries.map((entry, index) => (
            <li key={`${entry.from}-${index}`} role="treeitem">
              <button
                type="button"
                className={`outline-item${index === currentIndex ? ' outline-current' : ''}`}
                style={{ paddingLeft: 10 + (entry.level - minLevel) * 14 }}
                title={entry.title}
                onClick={() => onReveal(entry.from, entry.to)}
              >
                <span className={`outline-level outline-level-${Math.min(entry.level, 4)}`}>
                  {entry.level}
                </span>
                <span className="outline-title">{entry.title}</span>
                <span className="outline-line">{entry.line}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {entries.length > 0 && (
        <footer className="panel-foot">
          <Icon name="arrow-right" size={12} />
          Click a heading to jump to it
        </footer>
      )}
    </div>
  );
}

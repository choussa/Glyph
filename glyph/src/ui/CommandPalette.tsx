/**
 * The command palette.
 *
 * A single entry point for every action, every open file, and every panel —
 * the affordance that makes a large feature set usable without a large toolbar.
 * Matching is a subsequence score, so `nfl` finds "New file".
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';

export interface Command {
  id: string;
  label: string;
  /** Secondary text, e.g. a file path. */
  hint?: string;
  icon?: IconName;
  shortcut?: string;
  group: string;
  run: () => void;
}

export interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
}

/** Subsequence match; returns a score (higher is better) or -1. */
function score(query: string, target: string): number {
  if (query.length === 0) return 0;
  const haystack = target.toLowerCase();
  const needle = query.toLowerCase();

  const direct = haystack.indexOf(needle);
  if (direct !== -1) {
    // Exact substrings beat scattered matches; earlier and word-start beats later.
    const boundary = direct === 0 || /[\s/._-]/.test(haystack[direct - 1] ?? '');
    return 1000 - direct + (boundary ? 200 : 0);
  }

  let at = 0;
  let total = 0;
  for (const character of needle) {
    const found = haystack.indexOf(character, at);
    if (found === -1) return -1;
    total += 40 - Math.min(20, found - at);
    at = found + 1;
  }
  return total;
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const scored = commands
      .map((command) => ({
        command,
        value: Math.max(score(query, command.label), score(query, command.hint ?? '') - 200),
      }))
      .filter((entry) => entry.value >= 0)
      .sort((a, b) => b.value - a.value);
    return scored.slice(0, 60).map((entry) => entry.command);
  }, [commands, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep the highlighted row in view.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    // Let the palette unmount before the command moves focus.
    setTimeout(() => command.run(), 0);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        setActive((current) => Math.min(current + 1, results.length - 1));
        break;
      case 'ArrowUp':
        setActive((current) => Math.max(current - 1, 0));
        break;
      case 'Home':
        setActive(0);
        break;
      case 'End':
        setActive(results.length - 1);
        break;
      case 'Enter':
        run(results[active]);
        break;
      case 'Escape':
        onClose();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  // Group headings are rendered inline, in order of first appearance.
  let lastGroup = '';

  return (
    <div className="overlay overlay-top" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-input">
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Type a command or file name…"
            aria-label="Command palette"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="palette-esc">esc</kbd>
        </div>

        <div className="palette-list" ref={listRef} role="listbox">
          {results.length === 0 && <p className="palette-empty">No matching commands.</p>}
          {results.map((command, index) => {
            const heading = command.group !== lastGroup ? command.group : null;
            lastGroup = command.group;
            return (
              <div key={command.id}>
                {heading && <div className="palette-group">{heading}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  data-index={index}
                  className={`palette-item${index === active ? ' active' : ''}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => run(command)}
                >
                  {command.icon && <Icon name={command.icon} size={14} className="palette-icon" />}
                  <span className="palette-label">{command.label}</span>
                  {command.hint && <span className="palette-hint">{command.hint}</span>}
                  {command.shortcut && <kbd className="palette-kbd">{command.shortcut}</kbd>}
                </button>
              </div>
            );
          })}
        </div>

        <footer className="palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> run
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </footer>
      </div>
    </div>
  );
}

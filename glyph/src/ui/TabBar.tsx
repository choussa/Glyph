/**
 * The open-file tab strip.
 *
 * Tabs are scrollable, closable (click, middle-click, or context menu), and
 * marked with a dot while an edit is waiting to be persisted. The active tab is
 * scrolled into view whenever it changes, so keyboard navigation stays visible.
 */
import { useEffect, useRef } from 'react';
import { basename } from '../workspace/model';
import { ContextMenu, useContextMenu, type MenuItem } from './Menu';
import { Icon } from './Icon';

export interface TabBarProps {
  tabs: string[];
  active: string;
  dirty: string[];
  binary: string[];
  entry: string;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onCloseOthers: (path: string) => void;
  onCloseAll: () => void;
  onRename: (path: string) => void;
  onCopyPath: (path: string) => void;
  onSetEntry: (path: string) => void;
  onReveal: (path: string) => void;
}

export function TabBar(props: TabBarProps) {
  const { tabs, active, dirty, binary, entry } = props;
  const stripRef = useRef<HTMLDivElement>(null);
  const menu = useContextMenu<string>();

  // Keep the active tab visible.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const element = strip.querySelector<HTMLElement>(`[data-path="${CSS.escape(active)}"]`);
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active, tabs.length]);

  // A vertical wheel scrolls the strip horizontally — the expected gesture.
  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const strip = stripRef.current;
    if (!strip || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    strip.scrollLeft += event.deltaY;
  };

  const itemsFor = (path: string): MenuItem[] => [
    { label: 'Close', icon: 'x', shortcut: '⌥W', onSelect: () => props.onClose(path) },
    {
      label: 'Close others',
      icon: 'layers',
      disabled: tabs.length <= 1,
      onSelect: () => props.onCloseOthers(path),
    },
    { label: 'Close all', disabled: tabs.length === 0, onSelect: props.onCloseAll },
    { kind: 'separator' },
    { label: 'Rename…', icon: 'pencil', shortcut: 'F2', onSelect: () => props.onRename(path) },
    { label: 'Reveal in files', icon: 'files', onSelect: () => props.onReveal(path) },
    { label: 'Copy path', icon: 'copy', onSelect: () => props.onCopyPath(path) },
    { kind: 'separator' },
    {
      label: entry === path ? 'Entry point' : 'Set as entry point',
      icon: 'play',
      checked: entry === path,
      disabled: binary.includes(path),
      onSelect: () => props.onSetEntry(path),
    },
  ];

  return (
    <div className="tabstrip" ref={stripRef} role="tablist" onWheel={onWheel}>
      {tabs.map((path) => {
        const isActive = path === active;
        const isDirty = dirty.includes(path);
        return (
          <div
            key={path}
            data-path={path}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={`tab${isActive ? ' tab-active' : ''}${isDirty ? ' tab-dirty' : ''}`}
            title={path}
            onClick={() => props.onSelect(path)}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                props.onClose(path);
              }
            }}
            onContextMenu={(event) => menu.open(event, path)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                props.onSelect(path);
              }
            }}
          >
            <Icon
              name={binary.includes(path) ? 'image' : 'file'}
              size={13}
              className="tab-icon"
            />
            <span className="tab-name">{basename(path)}</span>
            {entry === path && <span className="tab-entry" title="Entry point" />}
            <button
              type="button"
              className="tab-close"
              title="Close"
              aria-label={`Close ${basename(path)}`}
              onClick={(event) => {
                event.stopPropagation();
                props.onClose(path);
              }}
            >
              {isDirty ? <span className="tab-dot" /> : <Icon name="x" size={12} />}
            </button>
          </div>
        );
      })}
      {tabs.length === 0 && <span className="tabstrip-empty">No open files</span>}

      {menu.at && (
        <ContextMenu
          x={menu.at.x}
          y={menu.at.y}
          items={itemsFor(menu.at.payload || active || tabs[0] || '')}
          onClose={menu.close}
        />
      )}
    </div>
  );
}

/**
 * Menu primitives.
 *
 * One `MenuList` renderer backs the menu bar, the export button, tab context
 * menus, and the file panel's right-click menu, so keyboard behaviour (arrows,
 * Home/End, Enter, Escape) and visuals are defined exactly once.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from './Icon';

export interface MenuItem {
  id?: string;
  /** A divider; every other field is ignored. */
  kind?: 'item' | 'separator';
  label?: string;
  /** Right-aligned note, e.g. `server · instant`. */
  hint?: string;
  icon?: IconName;
  /** Rendered as a `<kbd>` on the right. */
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  onSelect?: () => void;
}

/** Close on an outside pointer press or Escape. */
export function useDismiss(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (!active) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onDismiss();
      }
    };
    // `capture` so a click on another trigger closes this menu first.
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, active, onDismiss]);
}

interface MenuListProps {
  items: MenuItem[];
  onClose: () => void;
  /** Extra classes, e.g. `menu-panel-flat` inside a context layer. */
  className?: string;
  autoFocus?: boolean;
}

/** A keyboard-navigable menu. */
export function MenuList({ items, onClose, className, autoFocus = true }: MenuListProps) {
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  const selectable = useCallback(
    (index: number) => items[index] && items[index]!.kind !== 'separator' && !items[index]!.disabled,
    [items],
  );

  const move = useCallback(
    (delta: number) => {
      setActive((current) => {
        let next = current;
        for (let step = 0; step < items.length; step++) {
          next = (next + delta + items.length) % items.length;
          if (selectable(next)) return next;
        }
        return current;
      });
    },
    [items.length, selectable],
  );

  useEffect(() => {
    if (autoFocus) listRef.current?.focus();
  }, [autoFocus]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        move(1);
        break;
      case 'ArrowUp':
        move(-1);
        break;
      case 'Home':
        setActive(items.findIndex((_, index) => selectable(index)));
        break;
      case 'End':
        for (let index = items.length - 1; index >= 0; index--) {
          if (selectable(index)) {
            setActive(index);
            break;
          }
        }
        break;
      case 'Enter':
      case ' ': {
        const item = items[active];
        if (item && selectable(active)) {
          item.onSelect?.();
          onClose();
        }
        break;
      }
      case 'Escape':
        onClose();
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={listRef}
      className={className ? `menu-panel ${className}` : 'menu-panel'}
      role="menu"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {items.map((item, index) =>
        item.kind === 'separator' ? (
          <div key={item.id ?? `sep-${index}`} className="menu-sep" role="separator" />
        ) : (
          <button
            key={item.id ?? `${item.label}-${index}`}
            type="button"
            role="menuitem"
            className={[
              'menu-item',
              item.danger ? 'menu-item-danger' : '',
              index === active ? 'menu-item-active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={item.disabled}
            onMouseEnter={() => setActive(index)}
            onClick={() => {
              item.onSelect?.();
              onClose();
            }}
          >
            {item.icon && <Icon name={item.icon} size={14} className="menu-icon" />}
            <span className="menu-label">{item.label}</span>
            {item.checked && <Icon name="check" size={13} className="menu-check" />}
            {item.shortcut && <kbd className="menu-kbd">{item.shortcut}</kbd>}
            {item.hint && <span className="menu-hint">{item.hint}</span>}
          </button>
        ),
      )}
    </div>
  );
}

interface DropdownProps {
  /** Trigger contents. */
  children: ReactNode;
  items: MenuItem[];
  className?: string;
  panelClassName?: string;
  title?: string;
  disabled?: boolean;
  /** `end` right-aligns the panel under the trigger. */
  align?: 'start' | 'end';
  /** Controlled open state, for menu-bar-style hover switching. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** A button that reveals a `MenuList`. */
export function Dropdown({
  children,
  items,
  className,
  panelClassName,
  title,
  disabled,
  align = 'start',
  open: controlled,
  onOpenChange,
}: DropdownProps) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlled ?? uncontrolled;
  const setOpen = (next: boolean) => {
    setUncontrolled(next);
    onOpenChange?.(next);
  };

  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  return (
    <div className={`dropdown ${className ?? ''}`} ref={ref}>
      <button
        type="button"
        className={`dropdown-trigger${open ? ' open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        title={title}
        onClick={() => setOpen(!open)}
      >
        {children}
      </button>
      {open && (
        <MenuList
          items={items}
          onClose={() => setOpen(false)}
          className={[panelClassName, align === 'end' ? 'menu-panel-end' : '']
            .filter(Boolean)
            .join(' ')}
        />
      )}
    </div>
  );
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

/** A menu anchored at a viewport point, clamped to stay on screen. */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    const margin = 8;
    setPosition({
      left: Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin)),
    });
  }, [x, y]);

  useDismiss(layerRef, true, onClose);

  return (
    <div
      ref={layerRef}
      className="context-layer"
      style={{ left: position.left, top: position.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <MenuList items={items} onClose={onClose} autoFocus={false} />
    </div>
  );
}

export interface ContextTarget<T> {
  x: number;
  y: number;
  payload: T;
}

/**
 * Track a right-click position and an arbitrary payload (the row that was
 * clicked, say), or null when no menu is open.
 */
export function useContextMenu<T = undefined>() {
  const [at, setAt] = useState<ContextTarget<T> | null>(null);
  const open = useCallback((event: React.MouseEvent, payload?: T) => {
    event.preventDefault();
    event.stopPropagation();
    setAt({ x: event.clientX, y: event.clientY, payload: payload as T });
  }, []);
  const close = useCallback(() => setAt(null), []);
  return { at, open, close };
}

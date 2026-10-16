/**
 * Modal shell.
 *
 * One component for the share/export/shortcuts/about dialogs: backdrop, Escape
 * to close, focus moved into the dialog on open and restored on close, and a
 * body scroll lock while it is up.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

export interface DialogProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Width in pixels. */
  width?: number;
}

export function Dialog({ title, subtitle, onClose, children, footer, width = 520 }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<Element | null>(null);

  useEffect(() => {
    restoreRef.current = document.activeElement;
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(
      'input, button, [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
      if (event.key !== 'Tab' || !panel) return;
      // Keep Tab inside the dialog.
      const items = [
        ...panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = overflow;
      (restoreRef.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth: width }}
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="dialog-head">
          <div>
            <h2 className="dialog-title">{title}</h2>
            {subtitle && <p className="dialog-subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="dialog-close" title="Close" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>
  );
}

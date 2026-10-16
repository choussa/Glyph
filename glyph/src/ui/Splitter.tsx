/**
 * The draggable pane divider.
 *
 * Pointer-driven, with pointer capture so the drag survives leaving the handle,
 * and fully keyboard-operable (arrows nudge, Home/End jump to the limits,
 * Enter/double-click restores the midpoint) — a divider that can only be used
 * with a mouse is a divider half the users cannot use.
 */
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export interface SplitterProps {
  /** `horizontal` divides left/right; `vertical` divides top/bottom. */
  direction: 'horizontal' | 'vertical';
  /** Fraction of the container given to the first pane, 0–1. */
  ratio: number;
  onRatio: (ratio: number) => void;
  min?: number;
  max?: number;
  /** Called when the user double-clicks or presses Enter. */
  onReset?: () => void;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));

export function Splitter({
  direction,
  ratio,
  onRatio,
  min = 0.12,
  max = 0.88,
  onReset,
}: SplitterProps) {
  const handleRef = useRef<HTMLDivElement>(null);
  // A ref, not state: pointermove must see the drag as soon as pointerdown has
  // run, without waiting for a React render.
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const ratioFrom = useCallback(
    (clientX: number, clientY: number): number | null => {
      const container = handleRef.current?.parentElement;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      const size = direction === 'horizontal' ? rect.width : rect.height;
      if (size <= 0) return null;
      const offset =
        direction === 'horizontal' ? clientX - rect.left : clientY - rect.top;
      return clamp(offset / size, min, max);
    },
    [direction, min, max],
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Ignore secondary buttons so right-click menus still work.
    if (event.button !== 0) return;
    event.preventDefault();
    handleRef.current?.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    setDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const next = ratioFrom(event.clientX, event.clientY);
    if (next !== null) onRatio(next);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    handleRef.current?.releasePointerCapture(event.pointerId);
    draggingRef.current = false;
    setDragging(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    const horizontal = direction === 'horizontal';
    switch (event.key) {
      case 'ArrowLeft':
        if (!horizontal) return;
        onRatio(clamp(ratio - step, min, max));
        break;
      case 'ArrowRight':
        if (!horizontal) return;
        onRatio(clamp(ratio + step, min, max));
        break;
      case 'ArrowUp':
        if (horizontal) return;
        onRatio(clamp(ratio - step, min, max));
        break;
      case 'ArrowDown':
        if (horizontal) return;
        onRatio(clamp(ratio + step, min, max));
        break;
      case 'Home':
        onRatio(min);
        break;
      case 'End':
        onRatio(max);
        break;
      case 'Enter':
      case ' ':
        onReset?.();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div
      ref={handleRef}
      className={`splitter splitter-${direction}${dragging ? ' dragging' : ''}`}
      role="separator"
      tabIndex={0}
      aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
      aria-label={direction === 'horizontal' ? 'Resize editor and preview' : 'Resize panes'}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={Math.round(min * 100)}
      aria-valuemax={Math.round(max * 100)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => onReset?.()}
      onKeyDown={handleKeyDown}
    >
      <span className="splitter-grip" aria-hidden="true" />
    </div>
  );
}

/* --------------------------------------------------------------- resizers */

export interface PixelResizerProps {
  /** Called once when a drag begins, to capture the base size. */
  onStart: () => void;
  /** Pointer delta in pixels along the axis. */
  onMove: (delta: number) => void;
  onEnd: () => void;
  label: string;
}

/**
 * A divider that reports raw pixel deltas.
 *
 * Used where the pane has a real width (the side panel) rather than a share of
 * the window, so dragging sets the width directly instead of a ratio.
 */
export function PixelResizer({ onStart, onMove, onEnd, label }: PixelResizerProps) {
  const handleRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handleRef.current?.setPointerCapture(event.pointerId);
    startX.current = event.clientX;
    draggingRef.current = true;
    setDragging(true);
    onStart();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    onMove(event.clientX - startX.current);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    handleRef.current?.releasePointerCapture(event.pointerId);
    draggingRef.current = false;
    setDragging(false);
    onEnd();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 12;
    if (event.key === 'ArrowLeft') onMove(-step);
    else if (event.key === 'ArrowRight') onMove(step);
    else return;
    event.preventDefault();
  };

  return (
    <div
      ref={handleRef}
      className={`splitter splitter-horizontal splitter-narrow${dragging ? ' dragging' : ''}`}
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
    />
  );
}

/**
 * Preview zoom maths.
 *
 * A page is laid out in points (A4 is 595.28 × 841.89 pt), while the screen
 * works in CSS pixels. `PT_TO_PX` is the standard 96 dpi conversion, so a scale
 * of 1 renders a page at its true physical size on a nominally-calibrated
 * display — which is what "100%" should mean.
 */
import type { IconName } from '../ui/Icon';

export const PT_TO_PX = 96 / 72;

/** Gutter kept around the page when fitting, in pixels. */
export const PAGE_GUTTER = 24;

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 6;

export type ZoomMode = 'manual' | 'fit-width' | 'fit-height' | 'fit-page';

export interface PageBox {
  width: number;
  height: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));

/** The scale that satisfies `mode`, or `manual` when there is nothing to fit. */
export function computeScale(
  mode: ZoomMode,
  manual: number,
  container: PageBox,
  page: PageBox | null,
): number {
  if (!page || mode === 'manual') return clamp(manual, MIN_SCALE, MAX_SCALE);

  const availableWidth = Math.max(1, container.width - PAGE_GUTTER * 2);
  const availableHeight = Math.max(1, container.height - PAGE_GUTTER * 2);
  const width = availableWidth / (page.width * PT_TO_PX);
  const height = availableHeight / (page.height * PT_TO_PX);

  switch (mode) {
    case 'fit-width':
      return clamp(width, MIN_SCALE, MAX_SCALE);
    case 'fit-height':
      return clamp(height, MIN_SCALE, MAX_SCALE);
    default:
      return clamp(Math.min(width, height), MIN_SCALE, MAX_SCALE);
  }
}

/** The zoom steps the ⌘+/⌘− keys and the toolbar walk through. */
export const ZOOM_STEPS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4,
];

/** The next step up or down from `scale`. */
export function stepZoom(scale: number, direction: 1 | -1): number {
  if (direction === 1) {
    return ZOOM_STEPS.find((step) => step > scale + 1e-6) ?? MAX_SCALE;
  }
  return [...ZOOM_STEPS].reverse().find((step) => step < scale - 1e-6) ?? MIN_SCALE;
}

export interface ZoomPreset {
  id: ZoomMode;
  label: string;
  icon: IconName;
  shortcut?: string;
}

export const ZOOM_PRESETS: ZoomPreset[] = [
  { id: 'fit-width', label: 'Fit width', icon: 'fit-width' },
  { id: 'fit-page', label: 'Fit page', icon: 'fit-page' },
  { id: 'fit-height', label: 'Fit height', icon: 'fit-height' },
  { id: 'manual', label: 'Actual size', icon: 'text' },
];

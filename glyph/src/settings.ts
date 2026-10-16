/**
 * Persisted UI preferences.
 *
 * Kept apart from the workspace (which is project content) because these are
 * per-user, per-machine choices: theme, layout, panel sizes, editor behaviour.
 * Read once at boot, written back debounced on change.
 */
import type { PanelId } from './panels/registry';
import type { ZoomMode } from './preview/zoom';

/** How the editor and preview share the window. */
export type Layout = 'split' | 'vertical' | 'editor' | 'preview';

export interface Settings {
  theme: 'light' | 'dark';
  layout: Layout;
  /** Fraction of the split given to the editor. */
  splitRatio: number;
  /** Width of the icon rail, in pixels. */
  railWidth: number;
  /** Width of the side panel, in pixels. */
  panelWidth: number;
  /** The open side panel, or null when collapsed. */
  panel: PanelId | null;
  fontSize: number;
  lineHeight: number;
  tabSize: number;
  wrap: boolean;
  lineNumbers: boolean;
  highlightActiveLine: boolean;
  showToolbar: boolean;
  showTabBar: boolean;
  showStatusBar: boolean;
  follow: boolean;
  zoomMode: ZoomMode;
  scale: number;
  /** Whether the preview opens in a separate window-sized overlay. */
  previewPopup: boolean;
}

const KEY = 'glyph.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  layout: 'split',
  splitRatio: 0.5,
  railWidth: 48,
  panelWidth: 260,
  panel: 'files',
  fontSize: 14,
  lineHeight: 1.65,
  tabSize: 2,
  wrap: true,
  lineNumbers: true,
  highlightActiveLine: true,
  showToolbar: true,
  showTabBar: true,
  showStatusBar: true,
  follow: true,
  zoomMode: 'fit-width',
  scale: 1,
  previewPopup: false,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // Merge so a settings file written by an older build still boots.
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
}

export function clearSettings(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

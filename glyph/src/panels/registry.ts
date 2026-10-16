/** The side panels, and the rail that switches between them. */
import type { IconName } from '../ui/Icon';

export type PanelId = 'files' | 'search' | 'outline' | 'issues' | 'settings';

export interface PanelDefinition {
  id: PanelId;
  label: string;
  icon: IconName;
  /** Shown in the tooltip, e.g. `⌃1`. */
  shortcut: string;
  /** Panels that need an open document. */
  needsDocument?: boolean;
}

export const PANELS: PanelDefinition[] = [
  { id: 'files', label: 'Files', icon: 'files', shortcut: '⌥1' },
  { id: 'search', label: 'Search', icon: 'search', shortcut: '⌥2' },
  { id: 'outline', label: 'Outline', icon: 'outline', shortcut: '⌥3', needsDocument: true },
  { id: 'issues', label: 'Issues', icon: 'issues', shortcut: '⌥4' },
  { id: 'settings', label: 'Settings', icon: 'settings', shortcut: '⌥5' },
];

export const PANEL_BY_ID: Record<PanelId, PanelDefinition> = Object.fromEntries(
  PANELS.map((panel) => [panel.id, panel]),
) as Record<PanelId, PanelDefinition>;

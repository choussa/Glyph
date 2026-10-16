/**
 * The left icon rail: one button per panel, plus the two global affordances
 * (command palette, help). Issue counts ride on the Issues button so problems
 * are visible without opening the panel.
 */
import { Icon } from '../ui/Icon';
import { PANELS, type PanelId } from './registry';

export interface LeftRailProps {
  active: PanelId | null;
  onSelect: (panel: PanelId) => void;
  errors: number;
  warnings: number;
  onCommandPalette: () => void;
  onHelp: () => void;
}

export function LeftRail({
  active,
  onSelect,
  errors,
  warnings,
  onCommandPalette,
  onHelp,
}: LeftRailProps) {
  const issueCount = errors + warnings;

  return (
    <nav className="rail" aria-label="Panels">
      {PANELS.map((panel) => (
        <button
          key={panel.id}
          type="button"
          className={`rail-button${active === panel.id ? ' rail-active' : ''}`}
          aria-pressed={active === panel.id}
          title={`${panel.label} (${panel.shortcut})`}
          onClick={() => onSelect(panel.id)}
        >
          <Icon name={panel.icon} size={18} />
          {panel.id === 'issues' && issueCount > 0 && (
            <span className={`rail-badge${errors > 0 ? ' rail-badge-error' : ''}`}>
              {issueCount > 99 ? '99+' : issueCount}
            </span>
          )}
        </button>
      ))}

      <div className="rail-spacer" />

      <button
        type="button"
        className="rail-button"
        title="Command palette (⌘K)"
        onClick={onCommandPalette}
      >
        <Icon name="keyboard" size={18} />
      </button>
      <button type="button" className="rail-button" title="Help (⌘/)" onClick={onHelp}>
        <Icon name="help" size={18} />
      </button>
    </nav>
  );
}

/**
 * Editor and interface preferences.
 *
 * Everything here writes straight into the persisted `Settings`, so the panel is
 * a thin projection of that object — no local mirrors to drift out of sync.
 */
import { Icon, type IconName } from '../ui/Icon';
import type { Settings } from '../settings';
import type { Layout } from '../settings';
import { ZOOM_PRESETS, type ZoomMode } from '../preview/zoom';

export interface SettingsPanelProps {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onReset: () => void;
}

interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  return (
    <label className="setting-toggle">
      <span className="setting-text">
        <span className="setting-label">{label}</span>
        {hint && <span className="setting-hint">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch${checked ? ' switch-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-knob" />
      </button>
    </label>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { id: T; label: string; icon?: IconName }[];
  onChange: (value: T) => void;
}

function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="setting-row">
      <span className="setting-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            className={value === option.id ? 'active' : ''}
            title={option.label}
            onClick={() => onChange(option.id)}
          >
            {option.icon && <Icon name={option.icon} size={13} />}
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}

function Stepper({ label, value, min, max, step = 1, suffix, onChange }: StepperProps) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="setting-row">
      <span className="setting-label">{label}</span>
      <div className="stepper">
        <button type="button" title="Decrease" onClick={() => onChange(clamp(value - step))}>
          −
        </button>
        <span className="stepper-value">
          {value}
          {suffix}
        </span>
        <button type="button" title="Increase" onClick={() => onChange(clamp(value + step))}>
          +
        </button>
      </div>
    </div>
  );
}

export function SettingsPanel({ settings, onChange, onReset }: SettingsPanelProps) {
  return (
    <div className="panel panel-settings">
      <header className="panel-head">
        <h2 className="panel-title">Settings</h2>
        <div className="panel-actions">
          <button type="button" title="Reset preferences" onClick={onReset}>
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </header>

      <div className="settings-body">
        <section className="settings-group">
          <h3>Appearance</h3>
          <Segmented
            label="Theme"
            value={settings.theme}
            options={[
              { id: 'dark', label: 'Dark', icon: 'moon' },
              { id: 'light', label: 'Light', icon: 'sun' },
            ]}
            onChange={(theme) => onChange({ theme })}
          />
          <Segmented
            label="Layout"
            value={settings.layout}
            options={[
              { id: 'split', label: 'Right', icon: 'split-h' },
              { id: 'vertical', label: 'Down', icon: 'split-v' },
              { id: 'editor', label: 'Editor', icon: 'file' },
              { id: 'preview', label: 'Preview', icon: 'image' },
            ]}
            onChange={(layout: Layout) => onChange({ layout })}
          />
          <Toggle
            label="Tab bar"
            hint="Show open files above the editor"
            checked={settings.showTabBar}
            onChange={(showTabBar) => onChange({ showTabBar })}
          />
          <Toggle
            label="Formatting toolbar"
            checked={settings.showToolbar}
            onChange={(showToolbar) => onChange({ showToolbar })}
          />
          <Toggle
            label="Status bar"
            checked={settings.showStatusBar}
            onChange={(showStatusBar) => onChange({ showStatusBar })}
          />
        </section>

        <section className="settings-group">
          <h3>Editor</h3>
          <Stepper
            label="Font size"
            value={settings.fontSize}
            min={10}
            max={28}
            suffix=" px"
            onChange={(fontSize) => onChange({ fontSize })}
          />
          <Stepper
            label="Tab size"
            value={settings.tabSize}
            min={1}
            max={8}
            onChange={(tabSize) => onChange({ tabSize })}
          />
          <Toggle
            label="Wrap lines"
            checked={settings.wrap}
            onChange={(wrap) => onChange({ wrap })}
          />
          <Toggle
            label="Line numbers"
            checked={settings.lineNumbers}
            onChange={(lineNumbers) => onChange({ lineNumbers })}
          />
          <Toggle
            label="Highlight active line"
            checked={settings.highlightActiveLine}
            onChange={(highlightActiveLine) => onChange({ highlightActiveLine })}
          />
        </section>

        <section className="settings-group">
          <h3>Preview</h3>
          <Segmented
            label="Zoom"
            value={settings.zoomMode}
            options={ZOOM_PRESETS.map((preset) => ({
              id: preset.id as ZoomMode,
              label: preset.label,
              icon: preset.icon,
            }))}
            onChange={(zoomMode) => onChange({ zoomMode })}
          />
          <Toggle
            label="Follow cursor"
            hint="Scroll the preview as you type"
            checked={settings.follow}
            onChange={(follow) => onChange({ follow })}
          />
          <Toggle
            label="Open preview in a popup"
            checked={settings.previewPopup}
            onChange={(previewPopup) => onChange({ previewPopup })}
          />
        </section>

        <section className="settings-group">
          <h3>Storage</h3>
          <p className="settings-note">
            Text files and tabs are saved to this browser automatically. Uploaded binary assets
            live for the session only.
          </p>
          <p className="settings-note">
            Preferences are layered: editor behaviour (theme, font, editor toggles) belongs to the
            signed-in profile, preview view settings (zoom, follow) belong to the open project, and
            window layout belongs to this browser. In this build every layer is stored locally —
            there is no account service yet.
          </p>
        </section>
      </div>
    </div>
  );
}

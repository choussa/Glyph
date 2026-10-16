/**
 * The formatting toolbar.
 *
 * Buttons map one-to-one onto the actions in `editor/insert`, so the toolbar,
 * the keymap, and the command palette all perform identical edits. Rare inserts
 * live behind a "more" menu rather than stretching the bar.
 */
import { Icon, type IconName } from './Icon';
import { Dropdown } from './Menu';
import type { ActionName } from '../editor/insert';

export interface EditorToolbarProps {
  onAction: (name: ActionName) => void;
  onFormat: () => void;
  follow: boolean;
  onFollow: (value: boolean) => void;
  disabled: boolean;
}

interface ToolbarButton {
  action: ActionName;
  icon: IconName;
  label: string;
  shortcut?: string;
}

const TEXT_GROUP: ToolbarButton[] = [
  { action: 'bold', icon: 'bold', label: 'Strong', shortcut: '⌘B' },
  { action: 'italic', icon: 'italic', label: 'Emphasis', shortcut: '⌘I' },
  { action: 'underline', icon: 'underline', label: 'Underline', shortcut: '⌘U' },
  { action: 'code', icon: 'code', label: 'Raw inline', shortcut: '⌘E' },
];

const BLOCK_GROUP: ToolbarButton[] = [
  { action: 'heading', icon: 'heading', label: 'Heading' },
  { action: 'list', icon: 'list', label: 'Bullet list' },
  { action: 'enum', icon: 'ordered-list', label: 'Numbered list' },
  { action: 'math', icon: 'math', label: 'Equation', shortcut: '⌘M' },
];

const INLINE_GROUP: ToolbarButton[] = [
  { action: 'link', icon: 'link', label: 'Link' },
  { action: 'comment', icon: 'comment', label: 'Comment', shortcut: '⌘/' },
  { action: 'reference', icon: 'arrow-right', label: 'Reference' },
  { action: 'label', icon: 'text', label: 'Label' },
];

export function EditorToolbar({
  onAction,
  onFormat,
  follow,
  onFollow,
  disabled,
}: EditorToolbarProps) {
  const render = (button: ToolbarButton) => (
    <button
      key={button.action}
      type="button"
      className="tool-button"
      disabled={disabled}
      title={button.shortcut ? `${button.label} (${button.shortcut})` : button.label}
      aria-label={button.label}
      onClick={() => onAction(button.action)}
    >
      <Icon name={button.icon} size={15} />
    </button>
  );

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
      <div className="tool-group">{TEXT_GROUP.map(render)}</div>
      <span className="tool-sep" />
      <div className="tool-group">{BLOCK_GROUP.map(render)}</div>
      <span className="tool-sep" />
      <div className="tool-group">
        {INLINE_GROUP.map(render)}
        <Dropdown
          className="tool-more"
          panelClassName="menu-panel-end"
          title="More inserts"
          align="end"
          disabled={disabled}
          items={[
            { label: 'Code block', icon: 'code', onSelect: () => onAction('codeBlock') },
            { label: 'Table', icon: 'layers', onSelect: () => onAction('table') },
            { label: 'Figure', icon: 'image', onSelect: () => onAction('figure') },
            { label: 'Footnote', icon: 'text', onSelect: () => onAction('footnote') },
            { label: 'Strikethrough', icon: 'text', onSelect: () => onAction('strikethrough') },
            { kind: 'separator' },
            { label: 'Page break', icon: 'file', onSelect: () => onAction('pagebreak') },
          ]}
        >
          <Icon name="dots" size={15} />
        </Dropdown>
      </div>

      <span className="tool-spacer" />

      <button
        type="button"
        className="tool-button"
        disabled={disabled}
        title="Format document (⇧⌥F)"
        aria-label="Format document"
        onClick={onFormat}
      >
        <Icon name="wand" size={15} />
      </button>
      <button
        type="button"
        className={`tool-button${follow ? ' tool-active' : ''}`}
        title="Scroll the preview to follow the cursor"
        aria-label="Follow cursor"
        aria-pressed={follow}
        onClick={() => onFollow(!follow)}
      >
        <Icon name="arrow-right" size={15} />
      </button>
    </div>
  );
}

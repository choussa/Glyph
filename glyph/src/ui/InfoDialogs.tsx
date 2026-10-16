/** The two informational dialogs: keyboard shortcuts and about. */
import { Dialog } from './Dialog';
import { Icon } from './Icon';

interface Shortcut {
  keys: string;
  label: string;
}

const GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: 'Files',
    items: [
      { keys: '⌘N', label: 'New file' },
      { keys: '⇧⌘N', label: 'New folder' },
      { keys: '⌘O', label: 'Upload files' },
      { keys: 'F2', label: 'Rename the active file' },
      { keys: '⌥W', label: 'Close the active tab' },
      { keys: '⌘S', label: 'Save the workspace' },
    ],
  },
  {
    title: 'Navigate',
    items: [
      { keys: '⌘K', label: 'Command palette' },
      { keys: '⌘P', label: 'Go to file' },
      { keys: '⌘F', label: 'Search the project' },
      { keys: '⌥⌘F', label: 'Search and replace' },
      { keys: '⌘G', label: 'Go to line' },
      { keys: '⌥1…⌥5', label: 'Switch side panel' },
      { keys: '⌘\\', label: 'Toggle the side panel' },
    ],
  },
  {
    title: 'Format',
    items: [
      { keys: '⌘B', label: 'Strong' },
      { keys: '⌘I', label: 'Emphasis' },
      { keys: '⌘U', label: 'Underline' },
      { keys: '⌘E', label: 'Raw inline' },
      { keys: '⌘M', label: 'Equation' },
      { keys: '⌘/', label: 'Comment' },
      { keys: '⇧⌥F', label: 'Format document' },
    ],
  },
  {
    title: 'View',
    items: [
      { keys: '⌘+', label: 'Zoom in' },
      { keys: '⌘−', label: 'Zoom out' },
      { keys: '⌘0', label: 'Fit page' },
      { keys: '⇧⌘0', label: 'Fit width' },
      { keys: '⌘/', label: 'Show this list' },
    ],
  },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      title="Keyboard shortcuts"
      subtitle="Everything in glyph has a key."
      width={620}
      onClose={onClose}
    >
      <div className="shortcut-groups">
        {GROUPS.map((group) => (
          <section key={group.title} className="shortcut-group">
            <h3>{group.title}</h3>
            <dl>
              {group.items.map((item) => (
                <div key={`${item.keys}-${item.label}`} className="shortcut-row">
                  <dt>{item.label}</dt>
                  <dd>
                    <kbd>{item.keys}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

export interface AboutDialogProps {
  onClose: () => void;
  engineVersion: string;
  serverLabel: string;
  pages: number;
  diagnostics: number;
}

export function AboutDialog({
  onClose,
  engineVersion,
  serverLabel,
  pages,
  diagnostics,
}: AboutDialogProps) {
  return (
    <Dialog title="About glyph" subtitle="A Typst editor for the web." width={480} onClose={onClose}>
      <div className="about">
        <div className="about-mark">
          <Icon name="text" size={28} />
        </div>
        <p>
          glyph compiles Typst in the browser with a WebAssembly engine, so the preview updates as
          you type and works offline. A native render service handles durable exports and share
          previews.
        </p>
        <dl className="about-facts">
          <div>
            <dt>Browser engine</dt>
            <dd>{engineVersion}</dd>
          </div>
          <div>
            <dt>Render service</dt>
            <dd>{serverLabel}</dd>
          </div>
          <div>
            <dt>Pages</dt>
            <dd>{pages}</dd>
          </div>
          <div>
            <dt>Diagnostics</dt>
            <dd>{diagnostics}</dd>
          </div>
        </dl>
        <p className="about-fine">
          Built clean-room. Typst, CodeMirror, and the WebAssembly engines are open source; the
          interface here shares no code or assets with any proprietary editor.
        </p>
      </div>
    </Dialog>
  );
}

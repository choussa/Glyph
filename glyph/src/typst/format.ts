// Formatting via the engine's bundled typstyle. Bound to Shift-Alt-F; the
// toolbar's Format button calls `formatSource` directly.
import type { Extension } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';
import type { TypstProject } from '@vedivad/typst-web-service';

/** Format the buffer in place. Returns true so the keymap consumes the key. */
export function formatSource(project: TypstProject, path: string, view: EditorView): boolean {
  const before = view.state.doc.toString();
  void project.format(path, before).then((formatted) => {
    if (formatted == null || formatted === before) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted } });
  });
  return true;
}

/** Shift-Alt-F formatting for the active path. */
export function typstFormatter(project: TypstProject, getPath: () => string): Extension {
  return keymap.of([
    { key: 'Shift-Alt-f', run: (view) => formatSource(project, getPath(), view) },
  ]);
}

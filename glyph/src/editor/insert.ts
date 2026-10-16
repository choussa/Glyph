/**
 * Toolbar actions: the editing operations that insert or wrap Typst syntax.
 *
 * Each one is a pure function over an `EditorView`, so the toolbar, the menus,
 * the command palette, and the keymap all call the same code.
 */
import type { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import type { ChangeSpec } from '@codemirror/state';

/** The lines touched by the current selection, with their document ranges. */
function selectedLines(view: EditorView) {
  const { state } = view;
  const lines = new Map<number, { from: number; to: number; text: string }>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let number = first; number <= last; number++) {
      const line = state.doc.line(number);
      lines.set(number, { from: line.from, to: line.to, text: line.text });
    }
  }
  return [...lines.values()];
}

/** Wrap every selection in `before`/`after`, selecting a placeholder if empty. */
export function wrapSelection(
  view: EditorView,
  before: string,
  after: string,
  placeholder = '',
): void {
  const { state } = view;
  const changes: ChangeSpec[] = [];
  const ranges: { anchor: number; head: number }[] = [];

  for (const range of state.selection.ranges) {
    const selected = state.sliceDoc(range.from, range.to);
    const body = selected.length > 0 ? selected : placeholder;
    changes.push({ from: range.from, to: range.to, insert: `${before}${body}${after}` });
    // Select the body (or the placeholder) so the next keystroke replaces it.
    ranges.push({
      anchor: range.from + before.length,
      head: range.from + before.length + body.length,
    });
  }

  view.dispatch({
    changes,
    selection: ranges.length === 1 ? ranges[0] : undefined,
    scrollIntoView: true,
  });
  view.focus();
}

/** Insert literal text at each cursor. */
export function insertText(view: EditorView, text: string): void {
  const { state } = view;
  const changes = state.selection.ranges.map((range) => ({
    from: range.from,
    to: range.to,
    insert: text,
  }));
  view.dispatch({ changes, scrollIntoView: true });
  view.focus();
}

/** Insert a block on its own lines, keeping the cursor inside it. */
export function insertBlock(view: EditorView, block: string, cursorOffset: number): void {
  const range = view.state.selection.main;
  const line = view.state.doc.lineAt(range.from);
  const atLineStart = range.from === line.from;
  const prefix = atLineStart ? '' : '\n';
  const insert = `${prefix}${block}`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + prefix.length + cursorOffset },
    scrollIntoView: true,
  });
  view.focus();
}

/**
 * Add `prefix` to each selected line — or remove it when every line already
 * carries it, which makes the toolbar buttons true toggles.
 */
export function toggleLinePrefix(view: EditorView, prefix: string): void {
  const lines = selectedLines(view);
  if (lines.length === 0) return;

  const allPrefixed = lines.every((line) => line.text.startsWith(prefix));
  const changes: ChangeSpec[] = [];
  let delta = 0;
  let anchor = view.state.selection.main.anchor;
  let head = view.state.selection.main.head;

  for (const line of lines) {
    if (allPrefixed) {
      changes.push({ from: line.from, to: line.from + prefix.length, insert: '' });
      if (line.from < anchor) delta -= prefix.length;
    } else {
      changes.push({ from: line.from, to: line.from, insert: prefix });
      if (line.from <= anchor) delta += prefix.length;
    }
  }

  anchor += delta;
  head += delta;
  view.dispatch({ changes, selection: { anchor, head }, scrollIntoView: true });
  view.focus();
}

/* ---------------------------------------------------------- named actions */

export const actions = {
  bold: (view: EditorView) => wrapSelection(view, '*', '*', 'strong'),
  italic: (view: EditorView) => wrapSelection(view, '_', '_', 'emphasis'),
  underline: (view: EditorView) => wrapSelection(view, '#underline[', ']', 'text'),
  strikethrough: (view: EditorView) => wrapSelection(view, '#strike[', ']', 'text'),
  code: (view: EditorView) => wrapSelection(view, '`', '`', 'code'),
  math: (view: EditorView) => wrapSelection(view, '$', '$', 'x^2'),
  link: (view: EditorView) => wrapSelection(view, '#link("https://")[', ']', 'label'),
  reference: (view: EditorView) => insertText(view, '@'),
  comment: (view: EditorView) => toggleLinePrefix(view, '// '),
  heading: (view: EditorView) => toggleLinePrefix(view, '= '),
  list: (view: EditorView) => toggleLinePrefix(view, '- '),
  enum: (view: EditorView) => toggleLinePrefix(view, '+ '),
  codeBlock: (view: EditorView) =>
    insertBlock(view, '```\n\n```', 4),
  table: (view: EditorView) =>
    insertBlock(
      view,
      '#table(\n  columns: 2,\n  [A], [B],\n  [1], [2],\n)',
      '#table(\n  columns: 2,\n  [A], [B],\n  [1], [2],\n)'.length,
    ),
  figure: (view: EditorView) =>
    insertBlock(view, '#figure(\n  image("figure.png"),\n  caption: [Caption],\n)', 28),
  rawBlock: (view: EditorView) => insertBlock(view, '```typ\n\n```', 7),
  footnote: (view: EditorView) => wrapSelection(view, '#footnote[', ']', 'note'),
  label: (view: EditorView) => insertText(view, '<label>'),
  pagebreak: (view: EditorView) => insertBlock(view, '#pagebreak()', 12),
} as const;

export type ActionName = keyof typeof actions;

/** Run a named action against a view, if the view still exists. */
export function runAction(view: EditorView | null, name: ActionName): boolean {
  if (!view) return false;
  actions[name](view);
  return true;
}

/** The selection summary the status bar shows. */
export interface SelectionInfo {
  line: number;
  column: number;
  /** Number of characters in the primary selection. */
  selected: number;
  /** Number of selection ranges. */
  ranges: number;
  /** 1-based line of the last selected line. */
  endLine: number;
}

export function describeSelection(view: EditorView | null): SelectionInfo | null {
  if (!view) return null;
  const { state } = view;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.head);
  const endLine = state.doc.lineAt(range.to);
  return {
    line: line.number,
    column: range.head - line.from + 1,
    selected: state.selection.ranges.reduce(
      (total, r) => total + Math.abs(r.to - r.from),
      0,
    ),
    ranges: state.selection.ranges.length,
    endLine: endLine.number,
  };
}

/** Replace the whole buffer, preserving a sensible cursor position. */
export function replaceDocument(view: EditorView, text: string): void {
  const selection: EditorSelection = EditorSelection.single(
    Math.min(view.state.selection.main.anchor, text.length),
  );
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    selection,
  });
}

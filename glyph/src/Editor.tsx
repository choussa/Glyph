/**
 * The editor host.
 *
 * A single `EditorView` serves every open file: each file keeps its own
 * `EditorState` (document, selection, and undo history) in a cache, and
 * switching tabs swaps the whole state. That is the approach CodeMirror
 * documents for multi-document editors, and it means undo never crosses files.
 *
 * Engine-backed extensions (highlighting, lint, completion, hover, formatting)
 * follow the *active* path through a getter rather than being bound to one file.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  type KeyBinding,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from '@codemirror/autocomplete';
import { lintKeymap, lintGutter } from '@codemirror/lint';
import { oneDark } from '@codemirror/theme-one-dark';
import type { TypstProject } from '@vedivad/typst-web-service';
import { typstHighlighting } from './typst/highlight';
import { refreshLint, typstDiagnostics } from './typst/diagnostics';
import { typstCompletionSource } from './typst/completion';
import { typstHover } from './typst/hover';
import { typstFormatter } from './typst/format';
import type { Workspace } from './workspace/useWorkspace';
import { describeSelection, type SelectionInfo } from './editor/insert';

export type Theme = 'light' | 'dark';

/** Where the editor should put the cursor, and when. */
export interface GoTo {
  path: string;
  /** 1-based line; ignored when `from` is given. */
  line?: number;
  /** 1-based column; ignored when `from` is given. */
  column?: number;
  /** Explicit offsets take precedence over line/column. */
  from?: number;
  to?: number;
  /** Bumped on every request so repeats of the same location still apply. */
  nonce: number;
}

export interface EditorChrome {
  fontSize: number;
  lineHeight: number;
  tabSize: number;
  wrap: boolean;
  lineNumbers: boolean;
  highlightActiveLine: boolean;
}

export interface EditorProps {
  project: TypstProject;
  workspace: Workspace;
  path: string;
  theme: Theme;
  chrome: EditorChrome;
  /** Application shortcuts, merged after CodeMirror's own. */
  keybindings: KeyBinding[];
  goTo: GoTo | null;
  onChange: (path: string, text: string) => void;
  onCursor: (path: string, offset: number, text: string) => void;
  onSelection: (info: SelectionInfo) => void;
  onView: (view: EditorView | null) => void;
}

/* ------------------------------------------------------------- compartments */

const themeCompartment = new Compartment();
const fontCompartment = new Compartment();
const wrapCompartment = new Compartment();
const gutterCompartment = new Compartment();
const activeLineCompartment = new Compartment();
const tabSizeCompartment = new Compartment();

const themeExtension = (theme: Theme) => (theme === 'dark' ? [oneDark] : []);

const fontExtension = (chrome: EditorChrome) =>
  EditorView.theme({
    '&': { fontSize: `${chrome.fontSize}px` },
    '.cm-content': {
      fontFamily: 'var(--mono)',
      lineHeight: String(chrome.lineHeight),
      caretColor: 'var(--accent)',
    },
    '.cm-scroller': { fontFamily: 'var(--mono)' },
    '.cm-gutters': { fontSize: `${Math.max(10, chrome.fontSize - 2)}px` },
  });

export function Editor(props: EditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const statesRef = useRef<Map<string, EditorState>>(new Map());
  const activePathRef = useRef(props.path);

  // Latest props, read from stable extension closures.
  const live = useRef(props);
  live.current = props;

  const buildExtensions = useCallback(
    (): Extension[] => {
      const { project, workspace, keybindings } = live.current;
      const chrome = live.current.chrome;
      const getPath = () => activePathRef.current;

      return [
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        bracketMatching(),
        closeBrackets(),
        rectangularSelection(),
        crosshairCursor(),
        highlightSelectionMatches(),
        lintGutter(),
        // Engine-backed editor intelligence (bidirectional with the worker):
        typstHighlighting(project),
        typstDiagnostics(project, getPath),
        typstHover(project, getPath),
        typstFormatter(project, getPath),
        autocompletion({ override: [typstCompletionSource(project, getPath)] }),
        themeCompartment.of(themeExtension(live.current.theme)),
        fontCompartment.of(fontExtension(chrome)),
        tabSizeCompartment.of(EditorState.tabSize.of(chrome.tabSize)),
        wrapCompartment.of(chrome.wrap ? EditorView.lineWrapping : []),
        gutterCompartment.of(
          chrome.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : [],
        ),
        activeLineCompartment.of(chrome.highlightActiveLine ? [highlightActiveLine()] : []),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...completionKeymap,
          ...lintKeymap,
          ...keybindings,
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          const path = activePathRef.current;
          if (update.docChanged) {
            live.current.onChange(path, update.state.doc.toString());
          }
          if (update.docChanged || update.selectionSet) {
            live.current.onCursor(path, update.state.selection.main.head, update.state.doc.toString());
            live.current.onSelection(describeSelection(update.view) ?? {
              line: 1,
              column: 1,
              selected: 0,
              ranges: 1,
              endLine: 1,
            });
          }
        }),
        EditorView.domEventHandlers({
          // Keep the workspace's copy of the document current on blur, so
          // non-active files are never stale when they come back into view.
          blur: () => {
            const path = activePathRef.current;
            const view = viewRef.current;
            if (view) live.current.onChange(path, view.state.doc.toString());
            return false;
          },
        }),
      ];
      // `workspace` is read for its identity only; the getter keeps it live.
      void workspace;
    },
    [],
  );

  const createState = useCallback(
    (path: string): EditorState =>
      EditorState.create({
        doc: live.current.workspace.getText(path) ?? '',
        extensions: buildExtensions(),
      }),
    [buildExtensions],
  );

  /* -------------------------------------------------------------- lifetime */

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    activePathRef.current = live.current.path;
    const view = new EditorView({ parent: host, state: createState(live.current.path) });
    viewRef.current = view;
    live.current.onView(view);
    live.current.onSelection(describeSelection(view) ?? {
      line: 1,
      column: 1,
      selected: 0,
      ranges: 1,
      endLine: 1,
    });
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
      statesRef.current.clear();
      live.current.onView(null);
    };
  }, [createState]);

  /* ------------------------------------------------------------ tab switch */

  useEffect(() => {
    const view = viewRef.current;
    const path = props.path;
    if (!view) return;
    const previous = activePathRef.current;
    if (previous === path) return;

    if (previous) statesRef.current.set(previous, view.state);
    activePathRef.current = path;

    // Drop states for files that no longer exist.
    const alive = new Set(props.workspace.listPaths());
    for (const key of [...statesRef.current.keys()]) {
      if (!alive.has(key)) statesRef.current.delete(key);
    }

    // Prefer the cached state, but rebuild it if the file changed elsewhere
    // (a project-wide replace, for instance).
    const text = props.workspace.getText(path) ?? '';
    const cached = statesRef.current.get(path);
    const next = cached && cached.doc.toString() === text ? cached : createState(path);
    view.setState(next);
    view.dispatch({ effects: refreshLint.of() });
    view.focus();

    const info = describeSelection(view);
    if (info) props.onSelection(info);
    props.onCursor(path, view.state.selection.main.head, text);
    // `props.workspace` is stable; only the path should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.path, createState]);

  /* -------------------------------------------------------------- chrome */

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.reconfigure(themeExtension(props.theme)),
    });
  }, [props.theme]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: [
        fontCompartment.reconfigure(fontExtension(props.chrome)),
        tabSizeCompartment.reconfigure(EditorState.tabSize.of(props.chrome.tabSize)),
        wrapCompartment.reconfigure(props.chrome.wrap ? EditorView.lineWrapping : []),
        gutterCompartment.reconfigure(
          props.chrome.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : [],
        ),
        activeLineCompartment.reconfigure(
          props.chrome.highlightActiveLine ? [highlightActiveLine()] : [],
        ),
      ],
    });
  }, [props.chrome]);

  /* --------------------------------------------------------------- go-to */

  useEffect(() => {
    const view = viewRef.current;
    const target = props.goTo;
    if (!view || !target) return;

    const doc = view.state.doc;
    let from: number;
    let to: number;

    if (target.from !== undefined) {
      from = Math.max(0, Math.min(target.from, doc.length));
      to = Math.max(from, Math.min(target.to ?? target.from, doc.length));
    } else {
      const lineNumber = Math.max(1, Math.min(target.line ?? 1, doc.lines));
      const line = doc.line(lineNumber);
      from = Math.min(line.from + Math.max(0, (target.column ?? 1) - 1), line.to);
      to = line.to;
    }

    view.dispatch({
      selection: { anchor: from, head: to },
      scrollIntoView: true,
    });
    view.focus();
  }, [props.goTo]);

  return <div className="editor-host" ref={hostRef} />;
}

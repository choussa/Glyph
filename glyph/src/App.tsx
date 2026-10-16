/**
 * The application shell.
 *
 * Responsibilities, in order of importance:
 *
 * 1. Boot the browser engine and keep the workspace mirrored into it.
 * 2. Own the UI state that genuinely belongs to the whole app — settings,
 *    layout, dialogs — while file contents live in the workspace store and
 *    cursor position lives in the cursor store, both outside React.
 * 3. Route every user intent (toolbar, menu, palette, shortcut, panel) to one
 *    handler, so there is a single implementation per action.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import {
  TypstProject,
  type CompileResult,
  type PreviewNavigator,
} from '@vedivad/typst-web-service';
import { Editor, type EditorChrome, type GoTo } from './Editor';
import { Preview } from './Preview';
import { MenuBar, type Layout } from './ui/MenuBar';
import { TabBar } from './ui/TabBar';
import { EditorToolbar } from './ui/EditorToolbar';
import { Dropdown, type MenuItem } from './ui/Menu';
import { Icon } from './ui/Icon';
import { PixelResizer, Splitter } from './ui/Splitter';
import { CommandPalette, type Command } from './ui/CommandPalette';
import { StatusBar, type CompileStatus } from './ui/StatusBar';
import { AboutDialog, ShortcutsDialog } from './ui/InfoDialogs';
import { LeftRail } from './panels/LeftRail';
import { FilePanel } from './panels/FilePanel';
import { SearchPanel } from './panels/SearchPanel';
import { OutlinePanel } from './panels/OutlinePanel';
import { IssuesPanel } from './panels/IssuesPanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { PANELS, type PanelId } from './panels/registry';
import { CursorStore } from './editor/cursorStore';
import { runAction, type ActionName, type SelectionInfo } from './editor/insert';
import { Workspace, useWorkspaceSnapshot } from './workspace/useWorkspace';
import { basename, normalizePath } from './workspace/model';
import { createZip } from './workspace/zip';
import { clearSettings, loadSettings, saveSettings, type Settings } from './settings';
import { downloadBytes, type RenderFormat } from './render/client';
import { useRenderServer } from './render/useRenderServer';
import { ServerPreview } from './render/ServerPreview';
import { ZOOM_PRESETS, stepZoom, type ZoomMode } from './preview/zoom';
import sampleDoc from './sample.typ?raw';

type DialogKind = 'shortcuts' | 'about' | 'goto' | null;

const EXPORT_MIME: Record<Exclude<RenderFormat, 'pages'>, string> = {
  pdf: 'application/pdf',
  svg: 'image/svg+xml',
  html: 'text/html',
  vector: 'application/octet-stream',
};

const EXPORT_EXT: Record<Exclude<RenderFormat, 'pages'>, string> = {
  pdf: 'pdf',
  svg: 'svg',
  html: 'html',
  vector: 'vec',
};

/** Whether the platform's primary modifier is ⌘ rather than Ctrl. */
const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

export function App() {
  /* --------------------------------------------------------------- stores */

  const workspaceRef = useRef<Workspace | null>(null);
  if (!workspaceRef.current) {
    const created = new Workspace();
    created.init(sampleDoc);
    workspaceRef.current = created;
  }
  const workspace = workspaceRef.current;
  const snapshot = useWorkspaceSnapshot(workspace);

  const cursorRef = useRef<CursorStore | null>(null);
  if (!cursorRef.current) cursorRef.current = new CursorStore();
  const cursor = cursorRef.current;

  const { client, state: server, refresh: refreshServer } = useRenderServer();

  /* ---------------------------------------------------------------- state */

  const [project, setProject] = useState<TypstProject | null>(null);
  const [result, setResult] = useState<CompileResult | null>(null);
  const [status, setStatus] = useState<CompileStatus>('booting');
  const [ms, setMs] = useState(0);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [notice, setNotice] = useState<string | null>(null);
  const [goTo, setGoTo] = useState<GoTo | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [renameRequest, setRenameRequest] = useState<{ path: string; nonce: number } | null>(null);
  const [draftRequest, setDraftRequest] = useState<{
    kind: 'file' | 'folder';
    dir: string;
    nonce: number;
  } | null>(null);
  const [serverPreview, setServerPreview] = useState<number | null>(null);
  const [effectiveScale, setEffectiveScale] = useState(1);

  /* ---------------------------------------------------------------- refs */

  const viewRef = useRef<EditorView | null>(null);
  const navRef = useRef<PreviewNavigator | null>(null);
  const editAtRef = useRef(0);
  const followTimer = useRef<number | undefined>(undefined);
  const noticeTimer = useRef<number | undefined>(undefined);
  const goToNonce = useRef(0);
  const requestNonce = useRef(0);
  const panelBaseWidth = useRef(settings.panelWidth);
  const cursorPathRef = useRef('');
  const cursorOffsetRef = useRef(0);
  const editedRef = useRef(false);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5000);
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      settingsRef.current = next;
      return next;
    });
  }, []);

  /* --------------------------------------------------------------- engine */

  useEffect(() => {
    let disposed = false;
    let created: TypstProject | null = null;

    (async () => {
      const instance = await TypstProject.create({
        entry: workspace.getSnapshot().entry,
        autoCompile: { debounceMs: 220, maxWaitMs: 1400 },
      });
      created = instance;
      if (disposed) {
        instance.destroy();
        return;
      }
      setProject(instance);
    })();

    return () => {
      disposed = true;
      created?.destroy();
    };
  }, [workspace]);

  // Mirror structural changes into the engine. Replays anything the workspace
  // emitted before the worker finished booting.
  useEffect(() => {
    if (!project) return;
    workspace.setOpHandler((op) => {
      switch (op.type) {
        case 'set':
          void project.setText(op.path, op.text);
          break;
        case 'binary':
          void project.setBinary(op.path, op.bytes);
          break;
        case 'remove':
          void project.remove(op.path);
          break;
      }
    });
    return () => workspace.setOpHandler(null);
  }, [project, workspace]);

  // Keep the engine's entry point in step with the workspace's.
  useEffect(() => {
    if (!project || !snapshot.entry) return;
    project.entry = snapshot.entry;
  }, [project, snapshot.entry]);

  useEffect(() => {
    workspace.onNotice = flash;
    return () => {
      workspace.onNotice = null;
    };
  }, [workspace, flash]);

  // Subscribe to compiles, then force the first one past the debounce.
  useEffect(() => {
    if (!project) return;
    const unsubscribe = project.onCompile((compiled) => {
      setResult(compiled);
      setStatus(compiled.diagnostics.some((d) => d.severity === 'error') ? 'error' : 'ok');
      if (editAtRef.current) setMs(performance.now() - editAtRef.current);
    });

    editAtRef.current = performance.now();
    void project.compile();
    return unsubscribe;
  }, [project]);

  /* -------------------------------------------------------------- editor */

  const handleChange = useCallback(
    (path: string, text: string) => {
      editedRef.current = true;
      editAtRef.current = performance.now();
      setStatus((current) => (current === 'compiling' ? current : 'compiling'));
      workspace.setText(path, text);
    },
    [workspace],
  );

  const handleCursor = useCallback(
    (path: string, offset: number, text: string) => {
      cursorPathRef.current = path;
      cursorOffsetRef.current = offset;
      if (!settingsRef.current.follow) return;
      window.clearTimeout(followTimer.current);
      followTimer.current = window.setTimeout(() => {
        void navRef.current?.scrollToSource(path, text, offset);
      }, 220);
    },
    [],
  );

  const handleSelection = useCallback(
    (info: SelectionInfo) => {
      const path = cursorPathRef.current;
      const offset = cursorOffsetRef.current;
      if (editedRef.current) {
        editedRef.current = false;
        cursor.edit(path, offset, info);
      } else {
        cursor.move(path, offset, info);
      }
    },
    [cursor],
  );

  const handleView = useCallback((view: EditorView | null) => {
    viewRef.current = view;
  }, []);

  /** Reveal a location: switch to the file, then place the cursor. */
  const reveal = useCallback(
    (path: string, target: { line?: number; column?: number; from?: number; to?: number }) => {
      const normal = normalizePath(path);
      if (!workspace.has(normal)) {
        flash(`${basename(normal)} is not part of this project`);
        return;
      }
      workspace.open(normal);
      setGoTo({ path: normal, ...target, nonce: goToNonce.current++ });
    },
    [workspace, flash],
  );

  /** Preview → source. The engine resolves the click to a file and position. */
  const handleSource = useCallback(
    (file: string, line: number, column: number) => {
      reveal(file, { line, column });
    },
    [reveal],
  );

  const handleAction = useCallback((name: ActionName) => {
    runAction(viewRef.current, name);
  }, []);

  const handleFormat = useCallback(async () => {
    const view = viewRef.current;
    if (!view || !project) return;
    const path = workspace.getSnapshot().active;
    const before = view.state.doc.toString();
    const formatted = await project.format(path, before);
    if (formatted == null || formatted === before) {
      flash('Already formatted');
      return;
    }
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted } });
    flash('Formatted');
  }, [project, workspace, flash]);

  /** Apply new contents to files, keeping the live editor in step. */
  const applyText = useCallback(
    (edits: { path: string; text: string }[]) => {
      const active = workspace.getSnapshot().active;
      for (const edit of edits) {
        const view = viewRef.current;
        if (edit.path === active && view) {
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: edit.text } });
        } else {
          workspace.setText(edit.path, edit.text);
        }
      }
      flash(`Replaced in ${edits.length} file${edits.length === 1 ? '' : 's'}`);
    },
    [workspace, flash],
  );

  /* ---------------------------------------------------------- file system */

  const handleUpload = useCallback(
    async (dir: string, files: File[]) => {
      for (const file of files) {
        const data = await file.arrayBuffer();
        workspace.addUpload(dir, file, data);
      }
      flash(`Uploaded ${files.length} file${files.length === 1 ? '' : 's'}`);
    },
    [workspace, flash],
  );

  const handleDelete = useCallback(
    (path: string) => {
      if (!window.confirm(`Delete ${basename(path)}? This cannot be undone.`)) return;
      workspace.remove(path);
    },
    [workspace],
  );

  const handleDeleteFolder = useCallback(
    (path: string) => {
      if (!window.confirm(`Delete the folder ${basename(path)} and everything in it?`)) return;
      workspace.removeFolder(path);
    },
    [workspace],
  );

  const handleDownload = useCallback(
    (path: string) => {
      const text = workspace.getText(path);
      const bytes = workspace.getBytes(path);
      if (text !== undefined) {
        downloadBytes(new TextEncoder().encode(text), basename(path), 'text/plain');
      } else if (bytes) {
        downloadBytes(bytes, basename(path), 'application/octet-stream');
      }
    },
    [workspace],
  );

  const handleDownloadProject = useCallback(() => {
    const encoder = new TextEncoder();
    const entries = [
      ...workspace.textFiles().map((file) => ({
        name: file.path.replace(/^\/+/, ''),
        data: encoder.encode(file.text),
      })),
      ...workspace
        .listPaths()
        .filter((path) => workspace.isBinary(path))
        .map((path) => ({
          name: path.replace(/^\/+/, ''),
          data: workspace.getBytes(path)!,
        })),
    ];
    if (entries.length === 0) return;
    downloadBytes(createZip(entries), 'glyph-project.zip', 'application/zip');
    flash(`Archived ${entries.length} file${entries.length === 1 ? '' : 's'}`);
  }, [workspace, flash]);

  const requestRename = useCallback((path: string) => {
    setRenameRequest({ path, nonce: requestNonce.current++ });
  }, []);

  const requestDraft = useCallback((kind: 'file' | 'folder', dir: string) => {
    update({ panel: 'files' });
    setDraftRequest({ kind, dir, nonce: requestNonce.current++ });
  }, [update]);

  const handleCopyPath = useCallback(
    (path: string) => {
      void navigator.clipboard?.writeText(path);
      flash(`Copied ${path}`);
    },
    [flash],
  );

  const handleResetWorkspace = useCallback(() => {
    if (!window.confirm('Reset the workspace? Every file will be replaced by the sample document.'))
      return;
    Workspace.clearStorage();
    window.location.reload();
  }, []);

  const handleResetSettings = useCallback(() => {
    clearSettings();
    setSettings(loadSettings());
    flash('Preferences reset');
  }, [flash]);

  /* --------------------------------------------------------------- export */

  const bundle = useCallback(() => workspace.bundle(), [workspace]);

  const exportBrowser = useCallback(async () => {
    const bytes = await project?.exportPdf();
    if (!bytes) return;
    const stem = basename(workspace.getSnapshot().entry).replace(/\.[^.]+$/, '');
    downloadBytes(bytes, `${stem || 'document'}.pdf`, 'application/pdf');
    flash(`browser pdf · ${(bytes.length / 1024).toFixed(0)} KB`);
  }, [project, workspace, flash]);

  const exportOnServer = useCallback(
    async (format: Exclude<RenderFormat, 'pages'>) => {
      try {
        const { bytes, meta } = await client.render(bundle(), format);
        const stem = basename(workspace.getSnapshot().entry).replace(/\.[^.]+$/, '');
        downloadBytes(bytes, `${stem || 'document'}.${EXPORT_EXT[format]}`, EXPORT_MIME[format]);
        flash(
          `server ${format} · ${meta.ms.toFixed(1)} ms · ${(bytes.length / 1024).toFixed(0)} KB · ${meta.cache}`,
        );
        refreshServer();
      } catch (error) {
        flash(`server ${format} failed · ${(error as Error).message}`);
      }
    },
    [client, bundle, workspace, flash, refreshServer],
  );

  /* ------------------------------------------------------------ shortcuts */

  const openPanel = useCallback(
    (panel: PanelId) => update({ panel }),
    [update],
  );

  const togglePanel = useCallback(
    (panel: PanelId) => update({ panel: settingsRef.current.panel === panel ? null : panel }),
    [update],
  );

  const zoomBy = useCallback(
    (direction: 1 | -1) => {
      update({ zoomMode: 'manual', scale: stepZoom(effectiveScale, direction) });
    },
    [update, effectiveScale],
  );

  const closeActiveTab = useCallback(() => {
    const active = workspace.getSnapshot().active;
    if (active) workspace.close(active);
  }, [workspace]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = IS_MAC ? event.metaKey : event.ctrlKey;
      const alt = event.altKey;
      const code = event.code;
      const target = event.target as HTMLElement | null;
      const inEditor = Boolean(target?.closest?.('.cm-editor'));
      const inField =
        !inEditor &&
        (target?.tagName === 'INPUT' ||
          target?.tagName === 'TEXTAREA' ||
          target?.isContentEditable === true);

      const handled = (() => {
        if (mod && code === 'KeyK') return setPaletteOpen(true), true;
        if (mod && code === 'KeyP') return setPaletteOpen(true), true;
        if (mod && code === 'KeyS') return workspace.flush(), flash('Workspace saved'), true;
        if (mod && code === 'KeyN') {
          requestDraft(event.shiftKey ? 'folder' : 'file', '/');
          return true;
        }
        if (mod && code === 'KeyO') {
          update({ panel: 'files' });
          return true;
        }
        if (mod && code === 'KeyF') {
          openPanel('search');
          return true;
        }
        if (mod && code === 'KeyG') {
          setDialog('goto');
          return true;
        }
        if (mod && code === 'Slash') {
          if (event.shiftKey) setDialog('shortcuts');
          else if (!inField) handleAction('comment');
          return true;
        }
        if (mod && code === 'Backslash') {
          update({ panel: settingsRef.current.panel ? null : 'files' });
          return true;
        }
        if (mod && code === 'Equal') return zoomBy(1), true;
        if (mod && code === 'Minus') return zoomBy(-1), true;
        if (mod && code === 'Digit0') {
          update({ zoomMode: event.shiftKey ? 'fit-width' : 'fit-page' });
          return true;
        }
        if (alt && code.startsWith('Digit')) {
          const index = Number(code.slice(5)) - 1;
          const panel = PANELS[index];
          if (panel) {
            togglePanel(panel.id);
            return true;
          }
        }
        if (alt && code === 'KeyW') {
          closeActiveTab();
          return true;
        }
        if (event.key === 'F2') {
          const active = workspace.getSnapshot().active;
          if (active) requestRename(active);
          return true;
        }
        if (inField || !inEditor) return false;
        if (mod && code === 'KeyB') return handleAction('bold'), true;
        if (mod && code === 'KeyI') return handleAction('italic'), true;
        if (mod && code === 'KeyU') return handleAction('underline'), true;
        if (mod && code === 'KeyE') return handleAction('code'), true;
        if (mod && code === 'KeyM') return handleAction('math'), true;
        return false;
      })();

      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [
    workspace,
    flash,
    update,
    openPanel,
    togglePanel,
    zoomBy,
    closeActiveTab,
    requestDraft,
    requestRename,
    handleAction,
  ]);

  /* ------------------------------------------------------------- settings */

  useEffect(() => {
    const timer = window.setTimeout(() => saveSettings(settings), 300);
    return () => window.clearTimeout(timer);
  }, [settings]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  const handleScaleChange = useCallback((value: number) => {
    setEffectiveScale((current) => (Math.abs(current - value) < 1e-4 ? current : value));
  }, []);

  /* ------------------------------------------------------------- commands */

  const chrome = useMemo<EditorChrome>(
    () => ({
      fontSize: settings.fontSize,
      lineHeight: settings.lineHeight,
      tabSize: settings.tabSize,
      wrap: settings.wrap,
      lineNumbers: settings.lineNumbers,
      highlightActiveLine: settings.highlightActiveLine,
    }),
    [
      settings.fontSize,
      settings.lineHeight,
      settings.tabSize,
      settings.wrap,
      settings.lineNumbers,
      settings.highlightActiveLine,
    ],
  );

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [];

    for (const path of snapshot.paths) {
      list.push({
        id: `open:${path}`,
        group: 'Files',
        label: basename(path),
        hint: path,
        icon: snapshot.binary.includes(path) ? 'image' : 'file',
        run: () => reveal(path, { line: 1, column: 1 }),
      });
    }

    for (const panel of PANELS) {
      list.push({
        id: `panel:${panel.id}`,
        group: 'View',
        label: `${settings.panel === panel.id ? 'Hide' : 'Show'} ${panel.label}`,
        icon: panel.icon,
        shortcut: panel.shortcut,
        run: () => togglePanel(panel.id),
      });
    }

    const layouts: { id: Layout; label: string; icon: 'split-h' | 'split-v' | 'file' | 'image' }[] = [
      { id: 'split', label: 'Split right', icon: 'split-h' },
      { id: 'vertical', label: 'Split down', icon: 'split-v' },
      { id: 'editor', label: 'Editor only', icon: 'file' },
      { id: 'preview', label: 'Preview only', icon: 'image' },
    ];
    for (const item of layouts) {
      list.push({
        id: `layout:${item.id}`,
        group: 'View',
        label: item.label,
        icon: item.icon,
        run: () => update({ layout: item.id }),
      });
    }

    for (const preset of ZOOM_PRESETS) {
      list.push({
        id: `zoom:${preset.id}`,
        group: 'View',
        label: preset.label,
        icon: preset.icon,
        run: () => update({ zoomMode: preset.id as ZoomMode }),
      });
    }

    list.push(
      { id: 'theme', group: 'View', label: 'Toggle theme', icon: 'moon', run: () => update({ theme: settings.theme === 'dark' ? 'light' : 'dark' }) },
      { id: 'follow', group: 'View', label: `${settings.follow ? 'Disable' : 'Enable'} follow cursor`, icon: 'arrow-right', run: () => update({ follow: !settings.follow }) },
      { id: 'wrap', group: 'View', label: `${settings.wrap ? 'Disable' : 'Enable'} line wrapping`, icon: 'text', run: () => update({ wrap: !settings.wrap }) },
      { id: 'format', group: 'Edit', label: 'Format document', icon: 'wand', shortcut: '⇧⌥F', run: () => void handleFormat() },
      { id: 'new-file', group: 'File', label: 'New file', icon: 'file', shortcut: '⌘N', run: () => requestDraft('file', '/') },
      { id: 'new-folder', group: 'File', label: 'New folder', icon: 'folder', shortcut: '⇧⌘N', run: () => requestDraft('folder', '/') },
      { id: 'rename', group: 'File', label: 'Rename active file', icon: 'pencil', shortcut: 'F2', run: () => { const active = workspace.getSnapshot().active; if (active) requestRename(active); } },
      { id: 'export-pdf', group: 'File', label: 'Export PDF (browser)', icon: 'export', run: () => void exportBrowser() },
      { id: 'export-pdf-server', group: 'File', label: 'Export PDF (server)', icon: 'export', run: () => void exportOnServer('pdf') },
      { id: 'export-svg', group: 'File', label: 'Export SVG (server)', icon: 'export', run: () => void exportOnServer('svg') },
      { id: 'export-html', group: 'File', label: 'Export HTML (server)', icon: 'export', run: () => void exportOnServer('html') },
      { id: 'share', group: 'File', label: 'Share preview', icon: 'share', run: () => setServerPreview(Date.now()) },
      { id: 'zip', group: 'File', label: 'Download project archive', icon: 'download', run: handleDownloadProject },
      { id: 'shortcuts', group: 'Help', label: 'Keyboard shortcuts', icon: 'keyboard', shortcut: '⇧⌘/', run: () => setDialog('shortcuts') },
      { id: 'about', group: 'Help', label: 'About glyph', icon: 'info', run: () => setDialog('about') },
    );

    return list;
  }, [
    snapshot.paths,
    snapshot.binary,
    settings.panel,
    settings.theme,
    settings.follow,
    settings.wrap,
    workspace,
    update,
    togglePanel,
    reveal,
    requestDraft,
    requestRename,
    handleFormat,
    exportBrowser,
    exportOnServer,
    handleDownloadProject,
  ]);

  /* -------------------------------------------------------------- layout */

  const layout = settings.layout;
  const vertical = layout === 'vertical';
  const split = layout === 'split' || layout === 'vertical';
  const showEditor = layout !== 'preview';
  const showPreview = layout !== 'editor' && !settings.previewPopup;
  const active = snapshot.active;
  const canEdit = Boolean(project && active);

  const editorPaneStyle = split
    ? { flexGrow: settings.splitRatio, flexBasis: 0 }
    : { flexGrow: 1, flexBasis: 0 };
  const previewPaneStyle = split
    ? { flexGrow: 1 - settings.splitRatio, flexBasis: 0 }
    : { flexGrow: 1, flexBasis: 0 };

  const exportItems: MenuItem[] = [
    { label: 'PDF', hint: 'browser · instant', icon: 'export', onSelect: () => void exportBrowser() },
    { kind: 'separator' },
    { label: 'PDF', hint: 'server', icon: 'export', onSelect: () => void exportOnServer('pdf') },
    { label: 'SVG', hint: 'server', icon: 'export', onSelect: () => void exportOnServer('svg') },
    { label: 'HTML', hint: 'server', icon: 'export', onSelect: () => void exportOnServer('html') },
    { label: 'Vector IR', hint: 'server', icon: 'export', onSelect: () => void exportOnServer('vector') },
    { kind: 'separator' },
    { label: 'Share preview', hint: 'server', icon: 'share', onSelect: () => setServerPreview(Date.now()) },
    { label: 'Project archive', hint: '.zip', icon: 'download', onSelect: handleDownloadProject },
  ];

  const previewControls = (
    <div className="zoom">
      <button type="button" title="Zoom out (⌘−)" onClick={() => zoomBy(-1)}>
        <Icon name="zoom-out" size={14} />
      </button>
      <button
        type="button"
        className="zoom-value"
        title="Reset zoom"
        onClick={() => update({ zoomMode: 'manual', scale: 1 })}
      >
        {Math.round(effectiveScale * 100)}%
      </button>
      <button type="button" title="Zoom in (⌘+)" onClick={() => zoomBy(1)}>
        <Icon name="zoom-in" size={14} />
      </button>
      <Dropdown
        className="zoom-presets"
        panelClassName="menu-panel-end"
        align="end"
        title="Zoom presets"
        items={ZOOM_PRESETS.map((preset) => ({
          label: preset.label,
          icon: preset.icon,
          checked: settings.zoomMode === preset.id,
          onSelect: () => update({ zoomMode: preset.id as ZoomMode }),
        }))}
      >
        <Icon name="chevron-down" size={13} />
      </Dropdown>
    </div>
  );

  /* --------------------------------------------------------------- render */

  return (
    <div className={`app app-layout-${layout}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">g</span>
          <span className="brand-name">glyph</span>
        </div>

        <MenuBar
          onNewFile={() => requestDraft('file', '/')}
          onNewFolder={() => requestDraft('folder', '/')}
          onUpload={() => {
            update({ panel: 'files' });
            flash('Drop files onto the Files panel, or use its upload button');
          }}
          onDownloadProject={handleDownloadProject}
          onExportBrowser={() => void exportBrowser()}
          onExportServer={(format) => void exportOnServer(format)}
          onSharePreview={() => setServerPreview(Date.now())}
          onResetWorkspace={handleResetWorkspace}
          onUndo={() => {
            viewRef.current?.focus();
            document.execCommand?.('undo');
          }}
          onRedo={() => {
            viewRef.current?.focus();
            document.execCommand?.('redo');
          }}
          onFormat={() => void handleFormat()}
          onFind={() => openPanel('search')}
          onReplace={() => openPanel('search')}
          onGotoLine={() => setDialog('goto')}
          onSelectAll={() => viewRef.current?.dispatch({ selection: { anchor: 0, head: viewRef.current.state.doc.length } })}
          onCommandPalette={() => setPaletteOpen(true)}
          panel={settings.panel}
          onTogglePanel={togglePanel}
          layout={layout}
          onLayout={(next) => update({ layout: next })}
          zoomMode={settings.zoomMode}
          onZoomMode={(mode) => update({ zoomMode: mode })}
          scale={effectiveScale}
          onScale={(scale) => update({ zoomMode: 'manual', scale })}
          theme={settings.theme}
          onTheme={(theme) => update({ theme })}
          follow={settings.follow}
          onFollow={(follow) => update({ follow })}
          wrap={settings.wrap}
          onWrap={(wrap) => update({ wrap })}
          showToolbar={settings.showToolbar}
          onShowToolbar={(showToolbar) => update({ showToolbar })}
          showTabBar={settings.showTabBar}
          onShowTabBar={(showTabBar) => update({ showTabBar })}
          onShortcuts={() => setDialog('shortcuts')}
          onAbout={() => setDialog('about')}
        />

        <div className="topbar-center">{notice && <span className="notice">{notice}</span>}</div>

        <div className="topbar-actions">
          <button
            type="button"
            className={`icon-button${settings.panel ? ' active' : ''}`}
            title="Toggle side panel (⌘\\)"
            aria-pressed={Boolean(settings.panel)}
            onClick={() => update({ panel: settings.panel ? null : 'files' })}
          >
            <Icon name="sidebar" size={16} />
          </button>
          <Dropdown
            className="menu"
            panelClassName="menu-panel-end"
            align="end"
            title="Export the document"
            disabled={!project}
            items={exportItems}
          >
            <Icon name="export" size={15} />
            <span>Export</span>
            <Icon name="chevron-down" size={12} />
          </Dropdown>
          {previewControls}
          <button
            type="button"
            className="icon-button"
            title="Toggle theme"
            onClick={() => update({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
          >
            <Icon name={settings.theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
        </div>
      </header>

      <div className="workspace">
        <LeftRail
          active={settings.panel}
          onSelect={togglePanel}
          errors={result?.diagnostics.filter((d) => d.severity === 'error').length ?? 0}
          warnings={result?.diagnostics.filter((d) => d.severity !== 'error').length ?? 0}
          onCommandPalette={() => setPaletteOpen(true)}
          onHelp={() => setDialog('shortcuts')}
        />

        {settings.panel && (
          <>
            <aside className="side-panel" style={{ width: settings.panelWidth }}>
              {settings.panel === 'files' && (
                <FilePanel
                  paths={snapshot.paths}
                  folders={snapshot.folders}
                  entry={snapshot.entry}
                  active={snapshot.active}
                  binary={snapshot.binary}
                  dirty={snapshot.dirty}
                  sizes={(path) => workspace.sizeOf(path)}
                  renameRequest={renameRequest}
                  draftRequest={draftRequest}
                  onOpen={(path) => workspace.open(path)}
                  onCreateFile={(dir, name) => workspace.createFile(dir, name)}
                  onCreateFolder={(dir, name) => workspace.createFolder(dir, name)}
                  onRename={(path, name) => workspace.rename(path, name)}
                  onRenameFolder={(path, name) => workspace.renameFolder(path, name)}
                  onDelete={handleDelete}
                  onDeleteFolder={handleDeleteFolder}
                  onDuplicate={(path) => workspace.duplicate(path)}
                  onMove={(path, dir) => workspace.move(path, dir)}
                  onSetEntry={(path) => workspace.setEntry(path)}
                  onUpload={(dir, files) => void handleUpload(dir, files)}
                  onDownload={handleDownload}
                />
              )}

              {settings.panel === 'search' && (
                <SearchPanel
                  workspace={workspace}
                  activePath={snapshot.active}
                  onReveal={(path, from, to) => reveal(path, { from, to })}
                  onApplyText={applyText}
                />
              )}

              {settings.panel === 'outline' && (
                <OutlinePanel
                  workspace={workspace}
                  path={snapshot.active}
                  cursor={cursor}
                  onReveal={(from, to) => reveal(snapshot.active, { from, to })}
                />
              )}

              {settings.panel === 'issues' && (
                <IssuesPanel
                  diagnostics={result?.diagnostics ?? []}
                  onReveal={(path, line, column) => reveal(path, { line, column })}
                />
              )}

              {settings.panel === 'settings' && (
                <SettingsPanel
                  settings={settings}
                  onChange={update}
                  onReset={handleResetSettings}
                />
              )}
            </aside>
            <PixelResizer
              label="Resize the side panel"
              onStart={() => {
                panelBaseWidth.current = settingsRef.current.panelWidth;
              }}
              onMove={(delta) => {
                const next = Math.max(180, Math.min(560, panelBaseWidth.current + delta));
                update({ panelWidth: next });
              }}
              onEnd={() => {
                panelBaseWidth.current = settingsRef.current.panelWidth;
              }}
            />
          </>
        )}

        <main className={`panes${vertical ? ' panes-vertical' : ''}`}>
          {showEditor && (
            <section className="pane pane-editor" style={editorPaneStyle}>
              {settings.showToolbar && (
                <EditorToolbar
                  onAction={handleAction}
                  onFormat={() => void handleFormat()}
                  follow={settings.follow}
                  onFollow={(follow) => update({ follow })}
                  disabled={!canEdit}
                />
              )}
              {settings.showTabBar && (
                <TabBar
                  tabs={snapshot.tabs}
                  active={snapshot.active}
                  dirty={snapshot.dirty}
                  binary={snapshot.binary}
                  entry={snapshot.entry}
                  onSelect={(path) => workspace.setActive(path)}
                  onClose={(path) => workspace.close(path)}
                  onCloseOthers={(path) => workspace.closeOthers(path)}
                  onCloseAll={() => workspace.closeAll()}
                  onRename={requestRename}
                  onCopyPath={handleCopyPath}
                  onSetEntry={(path) => workspace.setEntry(path)}
                  onReveal={() => update({ panel: 'files' })}
                />
              )}
              {project && active ? (
                <Editor
                  project={project}
                  workspace={workspace}
                  path={active}
                  theme={settings.theme}
                  chrome={chrome}
                  keybindings={EMPTY_KEYBINDINGS}
                  goTo={goTo}
                  onChange={handleChange}
                  onCursor={handleCursor}
                  onSelection={handleSelection}
                  onView={handleView}
                />
              ) : (
                <div className="editor-empty">
                  <Icon name="file" size={24} />
                  <p>{project ? 'No file is open.' : 'Starting the Typst engine…'}</p>
                  {project && (
                    <button type="button" onClick={() => requestDraft('file', '/')}>
                      Create a file
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          {split && (
            <Splitter
              direction={vertical ? 'vertical' : 'horizontal'}
              ratio={settings.splitRatio}
              onRatio={(ratio) => update({ splitRatio: ratio })}
              onReset={() => update({ splitRatio: 0.5 })}
            />
          )}

          {showPreview && (
            <section className="pane pane-preview" style={previewPaneStyle}>
              <div className="pane-toolbar">
                <span className="pane-title">
                  <Icon name="image" size={13} />
                  Preview
                </span>
                <span className="pane-meta">
                  {result?.pages.length ?? 0} {result?.pages.length === 1 ? 'page' : 'pages'}
                </span>
                <span className="tool-spacer" />
                <button
                  type="button"
                  className={`icon-button${settings.follow ? ' active' : ''}`}
                  title="Follow cursor"
                  aria-pressed={settings.follow}
                  onClick={() => update({ follow: !settings.follow })}
                >
                  <Icon name="arrow-right" size={14} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  title="Open the preview in a popup"
                  onClick={() => update({ previewPopup: true })}
                >
                  <Icon name="external" size={14} />
                </button>
                {previewControls}
              </div>
              {project ? (
                <Preview
                  project={project}
                  result={result}
                  zoomMode={settings.zoomMode}
                  manualScale={settings.scale}
                  onScaleChange={handleScaleChange}
                  onSource={handleSource}
                  navRef={navRef}
                />
              ) : (
                <div className="preview-empty">
                  <span className="spinner" />
                  Starting the Typst engine…
                </div>
              )}
            </section>
          )}
        </main>
      </div>

      {settings.showStatusBar && (
        <StatusBar
          workspace={workspace}
          cursor={cursor}
          active={snapshot.active}
          entry={snapshot.entry}
          result={result}
          status={status}
          ms={ms}
          server={server}
          onRevealIssue={(path, line, column) => reveal(path, { line, column })}
          onOpenIssues={() => openPanel('issues')}
          onRefreshServer={refreshServer}
        />
      )}

      {settings.previewPopup && project && (
        <div className="overlay preview-overlay" role="dialog" aria-modal="true" aria-label="Preview">
          <header className="overlay-bar">
            <div className="overlay-title">
              <strong>Preview</strong>
              <span className="overlay-sub">
                {result?.pages.length ?? 0} pages · {Math.round(effectiveScale * 100)}%
              </span>
            </div>
            <div className="overlay-stats">{previewControls}</div>
            <button type="button" onClick={() => update({ previewPopup: false })}>
              Close
            </button>
          </header>
          <div className="overlay-body">
            <Preview
              project={project}
              result={result}
              zoomMode={settings.zoomMode}
              manualScale={settings.scale}
              onScaleChange={handleScaleChange}
              onSource={handleSource}
              navRef={navRef}
            />
          </div>
        </div>
      )}

      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}

      {dialog === 'shortcuts' && <ShortcutsDialog onClose={() => setDialog(null)} />}

      {dialog === 'goto' && (
        <GotoDialog
          maxLine={viewRef.current?.state.doc.lines ?? 1}
          onClose={() => setDialog(null)}
          onSubmit={(line) => {
            setDialog(null);
            if (active) reveal(active, { line, column: 1 });
          }}
        />
      )}

      {dialog === 'about' && (
        <AboutDialog
          onClose={() => setDialog(null)}
          engineVersion="typst-web-service 0.18.8"
          serverLabel={
            server.status === 'online'
              ? `typst.ts ${server.health.engine.version} (${server.health.pool.size} workers)`
              : server.status === 'offline'
                ? 'offline'
                : 'checking…'
          }
          pages={result?.pages.length ?? 0}
          diagnostics={result?.diagnostics.length ?? 0}
        />
      )}

      {serverPreview !== null && (
        <ServerPreview
          key={serverPreview}
          client={client}
          bundle={bundle()}
          revision={serverPreview}
          onClose={() => setServerPreview(null)}
        />
      )}
    </div>
  );
}

/** The editor takes no CodeMirror-level bindings of its own; the app owns them. */
const EMPTY_KEYBINDINGS: never[] = [];

/* ------------------------------------------------------------ go to line */

interface GotoDialogProps {
  maxLine: number;
  onClose: () => void;
  onSubmit: (line: number) => void;
}

function GotoDialog({ maxLine, onClose, onSubmit }: GotoDialogProps) {
  const [value, setValue] = useState('1');
  const line = Math.max(1, Math.min(Number(value) || 1, maxLine));

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dialog dialog-small" role="dialog" aria-modal="true" aria-label="Go to line">
        <header className="dialog-head">
          <h2 className="dialog-title">Go to line</h2>
          <button type="button" className="dialog-close" title="Close" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </header>
        <form
          className="dialog-body goto-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(line);
          }}
        >
          <input
            type="number"
            min={1}
            max={maxLine}
            value={value}
            autoFocus
            aria-label="Line number"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && onClose()}
          />
          <span className="goto-hint">of {maxLine}</span>
          <button type="submit">Go</button>
        </form>
      </div>
    </div>
  );
}

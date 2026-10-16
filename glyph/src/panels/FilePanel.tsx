/**
 * The file panel.
 *
 * A real file tree rather than a flat list: folders sort before files, inline
 * rename edits in place, new items appear as an input row in the folder that
 * will contain them, and rows can be dragged into folders to move them. Dropping
 * OS files onto the panel uploads them.
 *
 * Folder state (which are expanded) is view state and lives here; the file model
 * itself lives in the workspace store.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  basename,
  buildTree,
  dirname,
  formatBytes,
  isInside,
  type TreeNode,
} from '../workspace/model';
import { ContextMenu, useContextMenu, type MenuItem } from '../ui/Menu';
import { Icon } from '../ui/Icon';

export interface FilePanelProps {
  paths: string[];
  folders: string[];
  entry: string;
  active: string;
  binary: string[];
  dirty: string[];
  sizes: (path: string) => number;
  /** Set to begin an inline rename of `path`; the nonce makes repeats work. */
  renameRequest?: { path: string; nonce: number } | null;
  /** Set to begin creating an item; the nonce makes repeats work. */
  draftRequest?: { kind: 'file' | 'folder'; dir: string; nonce: number } | null;
  onOpen: (path: string) => void;
  onCreateFile: (dir: string, name: string) => void;
  onCreateFolder: (dir: string, name: string) => void;
  onRename: (path: string, name: string) => void;
  onRenameFolder: (path: string, name: string) => void;
  onDelete: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  onDuplicate: (path: string) => void;
  onMove: (path: string, dir: string) => void;
  onSetEntry: (path: string) => void;
  onUpload: (dir: string, files: File[]) => void;
  onDownload: (path: string) => void;
}

type Draft = { kind: 'file' | 'folder'; dir: string } | null;

/** Every ancestor folder of a path, outermost first. */
function ancestors(path: string): string[] {
  const parts = path.split('/').filter(Boolean);
  const out: string[] = [];
  let current = '';
  for (let index = 0; index < parts.length - 1; index++) {
    current += `/${parts[index]}`;
    out.push(current);
  }
  return out;
}

export function FilePanel(props: FilePanelProps) {
  const { paths, folders, entry, active, binary, dirty } = props;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['/']));
  const [renaming, setRenaming] = useState<{ path: string; name: string; folder: boolean } | null>(
    null,
  );
  const [draft, setDraft] = useState<Draft>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadDirRef = useRef('/');
  const dragPathRef = useRef<string | null>(null);
  const menu = useContextMenu<string>();

  const tree = useMemo(
    () => buildTree(paths.map((path) => ({ path, binary: binary.includes(path) })), folders),
    [paths, folders, binary],
  );

  // Always reveal the active file's folder.
  useEffect(() => {
    if (!active) return;
    setExpanded((current) => {
      const next = new Set(current);
      next.add('/');
      for (const folder of ancestors(active)) next.add(folder);
      return next;
    });
  }, [active]);

  // Honour rename/create requests coming from menus, tabs, and shortcuts.
  // The refs start below the host's first nonce so request #1 is never skipped.
  const renameNonce = useRef(-1);
  const draftNonce = useRef(-1);

  useEffect(() => {
    const request = props.renameRequest;
    if (!request || request.nonce === renameNonce.current) return;
    renameNonce.current = request.nonce;
    setExpanded((current) => {
      const next = new Set(current);
      next.add('/');
      for (const folder of ancestors(request.path)) next.add(folder);
      return next;
    });
    setRenaming({
      path: request.path,
      name: basename(request.path),
      folder: props.folders.includes(request.path),
    });
  }, [props.renameRequest, props.folders]);

  useEffect(() => {
    const request = props.draftRequest;
    if (!request || request.nonce === draftNonce.current) return;
    draftNonce.current = request.nonce;
    beginDraft(request.kind, request.dir);
    // `beginDraft` is stable enough for this purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.draftRequest]);

  const toggle = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const beginDraft = (kind: 'file' | 'folder', dir: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      next.add('/');
      for (const folder of ancestors(`${dir}/x`)) next.add(folder);
      return next;
    });
    setDraft({ kind, dir });
  };

  const commitDraft = (name: string) => {
    if (!draft) return;
    const trimmed = name.trim();
    if (trimmed) {
      if (draft.kind === 'file') props.onCreateFile(draft.dir, trimmed);
      else props.onCreateFolder(draft.dir, trimmed);
    }
    setDraft(null);
  };

  const commitRename = (name: string) => {
    if (!renaming) return;
    const trimmed = name.trim();
    if (trimmed && trimmed !== basename(renaming.path)) {
      if (renaming.folder) props.onRenameFolder(renaming.path, trimmed);
      else props.onRename(renaming.path, trimmed);
    }
    setRenaming(null);
  };

  const openUpload = (dir: string) => {
    uploadDirRef.current = dir;
    fileInputRef.current?.click();
  };

  const itemsFor = (path: string, isFolder: boolean): MenuItem[] =>
    isFolder
      ? [
          { label: 'New file…', icon: 'file', onSelect: () => beginDraft('file', path) },
          { label: 'New folder…', icon: 'folder', onSelect: () => beginDraft('folder', path) },
          { label: 'Upload here…', icon: 'upload', onSelect: () => openUpload(path) },
          { kind: 'separator' },
          { label: 'Rename…', icon: 'pencil', onSelect: () => setRenaming({ path, name: basename(path), folder: true }) },
          {
            label: 'Delete folder',
            icon: 'trash',
            danger: true,
            onSelect: () => props.onDeleteFolder(path),
          },
        ]
      : [
          { label: 'Open', icon: 'file', onSelect: () => props.onOpen(path) },
          { label: 'Rename…', icon: 'pencil', shortcut: 'F2', onSelect: () => setRenaming({ path, name: basename(path), folder: false }) },
          { label: 'Duplicate', icon: 'copy', onSelect: () => props.onDuplicate(path) },
          { kind: 'separator' },
          {
            label: entry === path ? 'Entry point' : 'Set as entry point',
            icon: 'play',
            checked: entry === path,
            disabled: binary.includes(path),
            onSelect: () => props.onSetEntry(path),
          },
          { kind: 'separator' },
          {
            label: 'Download',
            icon: 'download',
            disabled: binary.includes(path),
            onSelect: () => props.onDownload(path),
          },
          { label: 'Delete', icon: 'trash', danger: true, onSelect: () => props.onDelete(path) },
        ];

  /** Depth-first render with the search filter applied. */
  const renderNodes = (nodes: TreeNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      if (node.kind === 'file') {
        if (filter && !node.name.toLowerCase().includes(filter.toLowerCase())) return null;
        const isActive = node.path === active;
        const isDirty = dirty.includes(node.path);
        return (
          <div
            key={node.path}
            data-path={node.path}
            className={`file-row${isActive ? ' file-row-active' : ''}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            role="treeitem"
            aria-selected={isActive}
            tabIndex={0}
            draggable
            title={node.path}
            onClick={() => props.onOpen(node.path)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') props.onOpen(node.path);
            }}
            onContextMenu={(event) => menu.open(event, node.path)}
            onDragStart={(event) => {
              dragPathRef.current = node.path;
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', node.path);
            }}
            onDragEnd={() => {
              dragPathRef.current = null;
              setDropTarget(null);
            }}
          >
            {renaming?.path === node.path ? (
              <InlineInput
                initial={renaming.name}
                onCommit={commitRename}
                onCancel={() => setRenaming(null)}
              />
            ) : (
              <>
                <Icon
                  name={node.binary ? 'image' : 'file'}
                  size={13}
                  className="file-icon"
                />
                <span className="file-name">{node.name}</span>
                {entry === node.path && <span className="file-badge" title="Entry point">entry</span>}
                {isDirty && <span className="file-dot" title="Unsaved edits" />}
                <span className="file-size">{formatBytes(props.sizes(node.path))}</span>
              </>
            )}
          </div>
        );
      }

      const isExpanded = expanded.has(node.path) || (filter.length > 0 && node.children.length > 0);
      const containsActive = isInside(active, node.path);
      const isDropTarget = dropTarget === node.path;
      return (
        <div key={node.path} className="folder-group">
          <div
            className={`file-row folder-row${containsActive ? ' folder-row-active' : ''}${
              isDropTarget ? ' drop-target' : ''
            }`}
            data-path={node.path}
            style={{ paddingLeft: 8 + depth * 14 }}
            role="treeitem"
            aria-expanded={isExpanded}
            tabIndex={0}
            onClick={() => toggle(node.path)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggle(node.path);
              }
            }}
            onContextMenu={(event) => menu.open(event, node.path)}
            onDragOver={(event) => {
              if (dragPathRef.current === node.path) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDropTarget(node.path);
            }}
            onDragLeave={() => setDropTarget((current) => (current === node.path ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              setDropTarget(null);
              const dropped = event.dataTransfer.files;
              if (dropped.length > 0) {
                props.onUpload(node.path, [...dropped]);
                return;
              }
              const source = dragPathRef.current;
              if (source) props.onMove(source, node.path);
            }}
          >
            {renaming?.path === node.path ? (
              <InlineInput
                initial={renaming.name}
                onCommit={commitRename}
                onCancel={() => setRenaming(null)}
              />
            ) : (
              <>
                <Icon
                  name="chevron-right"
                  size={12}
                  className={`chevron${isExpanded ? ' chevron-open' : ''}`}
                />
                <Icon name="folder" size={13} className="file-icon folder-icon" />
                <span className="file-name">{node.name}</span>
                <span className="file-count">{node.children.length}</span>
              </>
            )}
          </div>
          {isExpanded && (
            <div className="folder-children" role="group">
              {draft?.dir === node.path && (
                <DraftRow
                  kind={draft.kind}
                  depth={depth + 1}
                  onCommit={commitDraft}
                  onCancel={() => setDraft(null)}
                />
              )}
              {renderNodes(node.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });

  return (
    <div className="panel panel-files">
      <header className="panel-head">
        <h2 className="panel-title">Files</h2>
        <div className="panel-actions">
          <button type="button" title="New file (⌘N)" onClick={() => beginDraft('file', '/')}>
            <Icon name="file" size={14} />
          </button>
          <button type="button" title="New folder (⇧⌘N)" onClick={() => beginDraft('folder', '/')}>
            <Icon name="folder" size={14} />
          </button>
          <button type="button" title="Upload (⌘O)" onClick={() => openUpload('/')}>
            <Icon name="upload" size={14} />
          </button>
          <button
            type="button"
            title="Collapse all"
            onClick={() => setExpanded(new Set(['/']))}
          >
            <Icon name="layers" size={14} />
          </button>
        </div>
      </header>

      <div className="panel-search">
        <Icon name="search" size={13} />
        <input
          type="search"
          value={filter}
          placeholder="Filter files"
          aria-label="Filter files"
          onChange={(event) => setFilter(event.target.value)}
        />
        {filter && (
          <button type="button" title="Clear" onClick={() => setFilter('')}>
            <Icon name="x" size={12} />
          </button>
        )}
      </div>

      <div
        className={`file-tree${dropTarget === '/' ? ' drop-root' : ''}`}
        role="tree"
        aria-label="Project files"
        onDragOver={(event) => {
          event.preventDefault();
          setDropTarget('/');
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setDropTarget(null);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDropTarget(null);
          const dropped = event.dataTransfer.files;
          if (dropped.length > 0) {
            props.onUpload('/', [...dropped]);
            return;
          }
          const source = dragPathRef.current;
          if (source && dirname(source) !== '/') props.onMove(source, '/');
        }}
        onContextMenu={(event) => {
          // A right-click on empty space offers the root actions.
          if (event.target === event.currentTarget) menu.open(event, '/');
        }}
      >
        {draft?.dir === '/' && (
          <DraftRow
            kind={draft.kind}
            depth={0}
            onCommit={commitDraft}
            onCancel={() => setDraft(null)}
          />
        )}
        {renderNodes(tree, 0)}
        {paths.length === 0 && <p className="panel-empty">No files yet.</p>}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          if (files.length > 0) props.onUpload(uploadDirRef.current, files);
          event.target.value = '';
        }}
      />

      {menu.at && (
        <ContextMenu
          x={menu.at.x}
          y={menu.at.y}
          items={itemsFor(menu.at.payload, menu.at.payload !== '/' && folders.includes(menu.at.payload))}
          onClose={menu.close}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- subviews */

interface InlineInputProps {
  initial: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

/** A text field that commits on Enter/blur and cancels on Escape. */
function InlineInput({ initial, placeholder, onCommit, onCancel }: InlineInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);

  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus();
    // Select the stem so typing replaces the name but keeps the extension.
    const dot = initial.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);

  return (
    <input
      ref={ref}
      className="inline-input"
      value={value}
      placeholder={placeholder}
      spellCheck={false}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') onCommit(value);
        if (event.key === 'Escape') onCancel();
      }}
    />
  );
}

interface DraftRowProps {
  kind: 'file' | 'folder';
  depth: number;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

function DraftRow({ kind, depth, onCommit, onCancel }: DraftRowProps) {
  return (
    <div className="file-row draft-row" style={{ paddingLeft: 8 + depth * 14 }}>
      <Icon name={kind === 'file' ? 'file' : 'folder'} size={13} className="file-icon" />
      <InlineInput
        initial=""
        placeholder={kind === 'file' ? 'untitled.typ' : 'folder'}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    </div>
  );
}

/**
 * The workspace model: paths, the file tree, the outline, and project search.
 *
 * Everything here is pure and synchronous. The engine owns compilation; this
 * module owns the *shape* of a project — which files exist, how they nest, what
 * headings a document has, and where a string occurs across all of them.
 */

/* ------------------------------------------------------------------- paths */

/** `/a//b.typ`, `./a/b.typ` and `a/b.typ` all normalise to `/a/b.typ`. */
export function normalizePath(path: string): string {
  const segments = path.split('/').filter((segment) => segment !== '' && segment !== '.');
  return `/${segments.join('/')}`;
}

/** The final segment of a path. `/a/b.typ` -> `b.typ`. */
export function basename(path: string): string {
  const normal = normalizePath(path);
  return normal.slice(normal.lastIndexOf('/') + 1);
}

/** The containing directory. `/a/b.typ` -> `/a`, `/b.typ` -> `/`. */
export function dirname(path: string): string {
  const normal = normalizePath(path);
  const at = normal.lastIndexOf('/');
  return at <= 0 ? '/' : normal.slice(0, at);
}

/** Join a directory and a name. `('/', 'a.typ')` -> `/a.typ`. */
export function joinPath(dir: string, name: string): string {
  return normalizePath(`${dirname(dir) === dir ? dir : dir}/${name}`);
}

/** The file extension without the dot, lowercased. */
export function extensionOf(path: string): string {
  const name = basename(path);
  const at = name.lastIndexOf('.');
  return at <= 0 ? '' : name.slice(at + 1).toLowerCase();
}

/** Whether a path names a file the engine should treat as text. */
export function isTextPath(path: string): boolean {
  return /\.(typ|txt|md|json|toml|yaml|yml|csv|bib|csl|xml|html|css|js|ts)$/i.test(path);
}

/** Whether a path sits inside a directory (at any depth). */
export function isInside(path: string, dir: string): boolean {
  const parent = normalizePath(dir);
  if (parent === '/') return true;
  return normalizePath(path).startsWith(`${parent}/`);
}

/** A path that does not collide with `taken`, e.g. `/notes.typ` -> `/notes-2.typ`. */
export function uniquePath(path: string, taken: Iterable<string>): string {
  const existing = new Set([...taken].map(normalizePath));
  if (!existing.has(normalizePath(path))) return normalizePath(path);

  const dir = dirname(path);
  const name = basename(path);
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';

  for (let n = 2; n < 10_000; n++) {
    const candidate = normalizePath(`${dir === '/' ? '' : dir}/${stem}-${n}${ext}`);
    if (!existing.has(candidate)) return candidate;
  }
  return normalizePath(`${dir}/${stem}-${Date.now()}${ext}`);
}

/* -------------------------------------------------------------- file tree */

export interface TreeFile {
  kind: 'file';
  path: string;
  name: string;
  binary: boolean;
}

export interface TreeFolder {
  kind: 'folder';
  path: string;
  name: string;
  children: TreeNode[];
}

export type TreeNode = TreeFile | TreeFolder;

/**
 * Build a sorted tree from flat paths plus explicitly-created empty folders.
 *
 * Folders sort before files at every level; both are alphabetical and
 * case-insensitive, which is what a file browser is expected to do.
 */
export function buildTree(
  files: { path: string; binary: boolean }[],
  folders: string[],
): TreeNode[] {
  interface Dir {
    folders: Map<string, Dir>;
    files: TreeFile[];
    path: string;
  }

  const root: Dir = { folders: new Map(), files: [], path: '/' };

  const dirFor = (path: string): Dir => {
    const normal = normalizePath(path);
    if (normal === '/') return root;
    let node = root;
    for (const segment of normal.slice(1).split('/')) {
      let next = node.folders.get(segment);
      if (!next) {
        next = { folders: new Map(), files: [], path: `${node.path === '/' ? '' : node.path}/${segment}` };
        node.folders.set(segment, next);
      }
      node = next;
    }
    return node;
  };

  for (const folder of folders) dirFor(folder);
  for (const file of files) {
    const normal = normalizePath(file.path);
    dirFor(dirname(normal)).files.push({
      kind: 'file',
      path: normal,
      name: basename(normal),
      binary: file.binary,
    });
  }

  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });

  const walk = (dir: Dir): TreeNode[] => {
    const childFolders: TreeFolder[] = [...dir.folders.entries()]
      .map(([name, child]) => ({
        kind: 'folder' as const,
        path: child.path,
        name,
        children: walk(child),
      }))
      .sort(byName);
    return [...childFolders, ...[...dir.files].sort(byName)];
  };

  return walk(root);
}

/** Every file path in the tree, depth-first. */
export function flattenTree(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      if (node.kind === 'file') out.push(node.path);
      else walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/* ---------------------------------------------------------------- outline */

export interface OutlineEntry {
  level: number;
  title: string;
  /** 1-based line number in the file. */
  line: number;
  /** UTF-16 offset of the line start. */
  from: number;
  /** UTF-16 offset just past the heading text. */
  to: number;
}

/**
 * Extract headings by scanning for `=` markers, skipping fenced code blocks.
 *
 * A lexical scan rather than a parse: it is synchronous, works offline, and
 * cannot disagree with the editor about which document is open. Fenced raw
 * blocks (``` … ```) are skipped, and `//`-commented lines never start with `=`,
 * so the two common false positives are handled.
 */
export function extractOutline(text: string): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  let fenced = false;
  let offset = 0;

  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const lineStart = offset;
    offset += line.length + 1;

    const trimmed = line.trimStart();
    if (trimmed.startsWith('```')) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;

    const match = /^(=+)\s+(.*)$/.exec(trimmed);
    if (!match) continue;

    const level = match[1]!.length;
    const title = match[2]!.trim();
    if (!title) continue;

    const titleAt = lineStart + (line.length - trimmed.length) + match[1]!.length + 1;
    entries.push({
      level,
      title,
      line: index + 1,
      from: lineStart,
      to: titleAt + title.length,
    });
  }

  return entries;
}

/* ----------------------------------------------------------------- search */

export interface SearchOptions {
  caseSensitive: boolean;
  regex: boolean;
  wholeWord: boolean;
}

export interface SearchMatch {
  path: string;
  line: number;
  column: number;
  /** UTF-16 offset of the match start in the file. */
  from: number;
  to: number;
  /** The whole line, for context. */
  preview: string;
  /** Offsets of the match *within* `preview`. */
  previewFrom: number;
  previewTo: number;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  caseSensitive: false,
  regex: false,
  wholeWord: false,
};

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/** Compile a query into a global regex, or null when it cannot match. */
export function buildMatcher(query: string, options: SearchOptions): RegExp | null {
  if (query.length === 0) return null;
  let source = options.regex ? query : query.replace(REGEX_SPECIALS, '\\$&');
  if (options.wholeWord) source = `\\b(?:${source})\\b`;
  try {
    return new RegExp(source, options.caseSensitive ? 'g' : 'gi');
  } catch {
    return null;
  }
}

/** Every match of `matcher` in `text`, with line/column and a line preview. */
export function findMatches(path: string, text: string, matcher: RegExp): SearchMatch[] {
  const out: SearchMatch[] = [];
  // A fresh lastIndex per call: the regex is shared across files.
  matcher.lastIndex = 0;

  // Line starts, computed once, to turn an offset into line/column cheaply.
  const lineStarts = [0];
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) {
    lineStarts.push(at + 1);
  }
  const lineAt = (offset: number): number => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  let match: RegExpExecArray | null;
  while ((match = matcher.exec(text)) !== null) {
    // Guard against zero-width matches looping forever.
    if (match[0].length === 0) {
      matcher.lastIndex++;
      continue;
    }
    const from = match.index;
    const line = lineAt(from);
    const lineStart = lineStarts[line]!;
    const lineEnd = text.indexOf('\n', from);
    const preview = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);

    out.push({
      path,
      line: line + 1,
      column: from - lineStart + 1,
      from,
      to: from + match[0].length,
      preview,
      previewFrom: from - lineStart,
      previewTo: from - lineStart + match[0].length,
    });
  }
  return out;
}

/** Replace every match in `text`; returns the new text and the count. */
export function replaceAll(
  text: string,
  matcher: RegExp,
  replacement: string,
): { text: string; count: number } {
  matcher.lastIndex = 0;
  let count = 0;
  const next = text.replace(matcher, (...args) => {
    count++;
    // Support `$1` group references in the replacement.
    const groups = args.slice(1, -2) as (string | undefined)[];
    return replacement.replace(/\$(\d+)/g, (whole, index: string) => {
      const group = groups[Number(index) - 1];
      return group ?? whole;
    });
  });
  return { text: next, count };
}

/** Replace the `ordinal`-th match in `text` (0-based), honouring `$1` refs. */
export function replaceOne(
  text: string,
  matcher: RegExp,
  ordinal: number,
  replacement: string,
): string {
  matcher.lastIndex = 0;
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(text)) !== null) {
    if (match[0].length === 0) {
      matcher.lastIndex++;
      continue;
    }
    if (index++ === ordinal) {
      const groups = match.slice(1);
      const body = replacement.replace(/\$(\d+)/g, (whole, group: string) => {
        return groups[Number(group) - 1] ?? whole;
      });
      return text.slice(0, match.index) + body + text.slice(match.index + match[0].length);
    }
  }
  return text;
}

/* --------------------------------------------------------------- utilities */

/** A short human size, e.g. `12.4 KB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Count words the way a writer does: runs of non-whitespace. */
export function countWords(text: string): number {
  const matches = text.match(/\S+/g);
  return matches ? matches.length : 0;
}

/**
 * Path handling, shared by the HTTP layer and the worker.
 *
 * This module deliberately imports nothing: the main thread validates paths
 * before dispatching (so a bad request never costs a worker round trip), but it
 * must not pull the native compiler into the main process — that is what the
 * pool is for.
 */
import { WORKSPACE_ROOT } from './config.ts';

/** A malformed request: bad paths, or an entry that was never supplied. */
export class SourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceError';
  }
}

/** `/a//b.typ`, `./a/b.typ` and `a/b.typ` all normalise to `/a/b.typ`. */
export function normalizeKey(path: string): string {
  return `/${path.replace(/^\.?\/+/, '').replace(/\/+/g, '/')}`;
}

/** Map a request path beneath the workspace root, refusing traversal. */
export function toWorkspacePath(root: string, path: string): string {
  const key = normalizeKey(path);
  if (key.split('/').includes('..')) {
    throw new SourceError(`path escapes the workspace: ${path}`);
  }
  return `${root}${key}`;
}

/** Map an engine path (`/glyph/main.typ`) back to a request path (`/main.typ`). */
export function toRequestPath(path: string): string {
  if (path === WORKSPACE_ROOT) return '/';
  if (path.startsWith(`${WORKSPACE_ROOT}/`)) return path.slice(WORKSPACE_ROOT.length);
  return path;
}

/** Validate every path in a bundle up front, and return the entry key. */
export function validateBundlePaths(
  entry: string | undefined,
  files: Record<string, string>,
  assets: Record<string, string> | undefined,
): { entryKey: string; files: Record<string, string>; assets?: Record<string, string> } {
  const mappedFiles: Record<string, string> = {};
  for (const [path, source] of Object.entries(files)) {
    toWorkspacePath(WORKSPACE_ROOT, path); // throws on traversal
    mappedFiles[normalizeKey(path)] = source;
  }

  let mappedAssets: Record<string, string> | undefined;
  if (assets !== undefined) {
    mappedAssets = {};
    for (const [path, base64] of Object.entries(assets)) {
      toWorkspacePath(WORKSPACE_ROOT, path);
      mappedAssets[normalizeKey(path)] = base64;
    }
  }

  const entryKey = normalizeKey(entry ?? '/main.typ');
  toWorkspacePath(WORKSPACE_ROOT, entryKey); // rejects a traversing entry path
  if (!(entryKey in mappedFiles)) {
    throw new SourceError(`entry file not supplied: ${entryKey}`);
  }
  return { entryKey, files: mappedFiles, assets: mappedAssets };
}

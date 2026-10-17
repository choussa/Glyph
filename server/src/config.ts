import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Repository-relative locations. */
export const SERVER_ROOT = resolve(here, '..');
export const FONTS_DIR = process.env.GLYPH_FONTS_DIR ?? join(SERVER_ROOT, 'fonts');

/**
 * The virtual workspace root every request is compiled under.
 *
 * The engine resolves both relative imports (`template.typ`) and
 * project-absolute ones (`/template.typ`) against this root, and it refuses to
 * compile an entry outside it — so every request path is mapped underneath.
 */
export const WORKSPACE_ROOT = '/glyph';

function int(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/**
 * Server configuration. Everything is overridable by environment variable so
 * the same image can be sized down for a small box or up for a big one.
 */
export const config = {
  host: process.env.HOST ?? '0.0.0.0',
  port: int(process.env.GLYPH_RENDER_PORT ?? process.env.PORT, 8787),

  /**
   * Compile workers. Typst compiles synchronously and burns CPU, so real
   * parallelism needs real threads; the main thread stays free to serve HTTP.
   */
  workers: int(process.env.GLYPH_RENDER_WORKERS, Math.max(1, Math.min(4, availableParallelism()))),

  /** Render cache budget (bytes of rendered artifacts). */
  cacheBytes: int(process.env.GLYPH_CACHE_BYTES, 192 * 1024 * 1024),
  cacheEntries: int(process.env.GLYPH_CACHE_ENTRIES, 1024),

  /** Request limits. */
  maxBodyBytes: int(process.env.GLYPH_MAX_BODY_BYTES, 8 * 1024 * 1024),
  maxFiles: int(process.env.GLYPH_MAX_FILES, 512),
  maxSourceBytes: int(process.env.GLYPH_MAX_SOURCE_BYTES, 4 * 1024 * 1024),
  requestTimeoutMs: int(process.env.GLYPH_REQUEST_TIMEOUT_MS, 30_000),

  /**
   * The engine memoises aggressively; a periodic eviction keeps that bounded.
   * `0` disables eviction.
   */
  evictEvery: int(process.env.GLYPH_EVICT_EVERY, 256),
  evictMaxAge: int(process.env.GLYPH_EVICT_MAX_AGE, 10),

  cors: process.env.GLYPH_CORS ?? '*',
  logLevel: (process.env.GLYPH_LOG ?? 'info') as 'silent' | 'info' | 'debug',
};

export type Config = typeof config;

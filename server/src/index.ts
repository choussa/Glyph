/**
 * glyph render service.
 *
 * The browser editor compiles locally (that is what makes typing feel instant);
 * this service is the durable half of the split — share-link previews,
 * thumbnails, and exports, rendered by the native Typst compiler in Node so
 * they do not depend on any visitor's browser.
 *
 * Design notes worth keeping:
 *
 * - **Cache in front of the pool.** A cache hit costs a hash and a write; a
 *   miss costs a worker round trip. Rendering the same document twice is the
 *   common case (a share page reloaded, a thumbnail re-requested), so the cache
 *   is the first thing a request touches.
 * - **Coalesce identical in-flight requests.** Two callers asking for the same
 *   bytes at the same time share one compile rather than queueing two.
 * - **Diagnostics come back even on success.** Warnings are part of the
 *   response, so a share page can surface them without a second call.
 */
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ByteLruCache } from './cache.ts';
import { FONTS_DIR, config } from './config.ts';
import { countErrors, type Diagnostic } from './diagnostics.ts';
import { ENGINE, INSTALLED_TYPST_TS } from './engine.ts';
import { HttpError, applyCors, log, readJson, sendBytes, sendJson } from './http.ts';
import { SourceError, validateBundlePaths } from './paths.ts';
import { PoolError, RenderPool } from './pool.ts';
import { ShareNotFound, ShareStore } from './share.ts';
import {
  FORMAT_CONTENT_TYPE,
  RENDER_FORMATS,
  type PagesArtifact,
  type QueryRequest,
  type RenderFormat,
  type RenderOutcome,
  type RenderRequest,
  type SourceBundle,
} from './types.ts';

/** The installed native compiler version — the manifest's `typstTs`. */
const ENGINE_VERSION = INSTALLED_TYPST_TS;
const startedAt = Date.now();
const pool = new RenderPool(config.workers);
const cache = new ByteLruCache<RenderOutcome>(config.cacheBytes, config.cacheEntries);
const inFlight = new Map<string, Promise<RenderOutcome>>();
const shares = new ShareStore(config.sharesDir, config.appUrl);

let served = 0;
let cacheHits = 0;
let coalesced = 0;

/* ------------------------------------------------------------------ helpers */

/** Stable hash of everything that can change the rendered bytes. */
function renderCacheKey(request: RenderRequest): string {
  const parts: string[] = [
    'render',
    request.format,
    request.entry ?? '/main.typ',
    request.pdfStandard ?? '',
    request.pdfTags === undefined ? '' : String(request.pdfTags),
  ];
  for (const [key, value] of Object.entries(request.inputs ?? {}).sort()) parts.push(`i:${key}=${value}`);
  for (const [path, source] of Object.entries(request.files).sort()) parts.push(`f:${path}=${source}`);
  for (const [path, base64] of Object.entries(request.assets ?? {}).sort()) parts.push(`a:${path}=${base64}`);
  return createHash('sha256').update(Buffer.from(parts.join('\0'), 'utf8')).digest('base64url');
}

function artifactSize(outcome: RenderOutcome): number {
  const artifact = outcome.artifact;
  if (artifact === null) return 128;
  if (typeof artifact === 'string') return Buffer.byteLength(artifact) + 128;
  if (artifact instanceof Uint8Array) return artifact.byteLength + 128;
  return Buffer.byteLength(JSON.stringify(artifact)) + 128;
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, `"${field}" must be an object`, 'invalid_field');
  }
  return value as Record<string, unknown>;
}

function asStringMap(value: unknown, field: string): Record<string, string> {
  const record = asRecord(value, field);
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== 'string') {
      throw new HttpError(400, `"${field}.${key}" must be a string`, 'invalid_field');
    }
    out[key] = item;
  }
  return out;
}

/** Pull the shared source bundle out of a request body. */
function readBundle(body: Record<string, unknown>): SourceBundle {
  if (body.files === undefined) {
    throw new HttpError(400, '"files" is required', 'missing_files');
  }
  const files = asStringMap(body.files, 'files');
  const paths = Object.keys(files);
  if (paths.length === 0) {
    throw new HttpError(400, '"files" must contain at least one file', 'missing_files');
  }
  if (paths.length > config.maxFiles) {
    throw new HttpError(413, `too many files (max ${config.maxFiles})`, 'too_many_files');
  }

  let total = 0;
  for (const source of Object.values(files)) total += Buffer.byteLength(source);
  if (total > config.maxSourceBytes) {
    throw new HttpError(413, `sources exceed ${config.maxSourceBytes} bytes`, 'sources_too_large');
  }

  const bundle: SourceBundle = { files };
  if (typeof body.entry === 'string') bundle.entry = body.entry;
  if (body.assets !== undefined) bundle.assets = asStringMap(body.assets, 'assets');
  if (body.inputs !== undefined) bundle.inputs = asStringMap(body.inputs, 'inputs');

  // Validate paths (and the entry) here so a malformed request never costs a
  // worker round trip.
  const validated = validateBundlePaths(bundle.entry, bundle.files, bundle.assets);
  return { ...bundle, entry: validated.entryKey, files: validated.files, assets: validated.assets };
}

function readFormat(body: Record<string, unknown>, url: URL): RenderFormat {
  const raw = body.format ?? url.searchParams.get('format') ?? 'pdf';
  if (typeof raw !== 'string' || !RENDER_FORMATS.includes(raw as RenderFormat)) {
    throw new HttpError(400, `"format" must be one of ${RENDER_FORMATS.join(', ')}`, 'invalid_format');
  }
  return raw as RenderFormat;
}

function outcomeHeaders(outcome: RenderOutcome, source: 'hit' | 'miss' | 'coalesced'): Record<string, string> {
  const errors = countErrors(outcome.diagnostics);
  return {
    'X-Glyph-Ms': outcome.ms.toFixed(2),
    'X-Glyph-Pages': String(outcome.pages),
    'X-Glyph-Cache': source,
    'X-Glyph-Errors': String(errors),
    'X-Glyph-Warnings': String(outcome.diagnostics.length - errors),
  };
}

/** The `pages` payload, shared by `/v1/render` and the read-only share route. */
function sendPages(
  response: ServerResponse,
  outcome: RenderOutcome,
  headers: Record<string, string>,
): void {
  const pages = outcome.artifact as PagesArtifact;
  sendJson(
    response,
    200,
    {
      width: pages.width,
      height: pages.height,
      count: pages.pages.length,
      pages: pages.pages,
      diagnostics: outcome.diagnostics,
      ms: outcome.ms,
    },
    headers,
  );
}

/** Run a render, reusing cached bytes or an identical in-flight compile. */
async function render(
  request: RenderRequest,
): Promise<{ outcome: RenderOutcome; source: 'hit' | 'miss' | 'coalesced' }> {
  const key = renderCacheKey(request);

  const cached = cache.get(key);
  if (cached !== undefined) {
    cacheHits++;
    return { outcome: cached, source: 'hit' };
  }

  const pending = inFlight.get(key);
  if (pending !== undefined) {
    coalesced++;
    return { outcome: await pending, source: 'coalesced' };
  }

  const job = pool.run<RenderOutcome>('render', request);
  inFlight.set(key, job);
  try {
    const outcome = await job;
    cache.set(key, outcome, artifactSize(outcome));
    return { outcome, source: 'miss' };
  } finally {
    inFlight.delete(key);
  }
}

/* ------------------------------------------------------------------- routes */

async function handleHealth(response: ServerResponse): Promise<void> {
  sendJson(response, 200, {
    ok: true,
    service: 'glyph-render',
    engine: {
      package: ENGINE.package,
      version: ENGINE_VERSION,
      /** The Typst language version both engines are pinned to. */
      typst: ENGINE.typst,
    },
    uptimeMs: Date.now() - startedAt,
    pool: pool.stats(),
    cache: cache.stats(),
    counters: { served, cacheHits, coalesced },
  });
}

async function handleFonts(response: ServerResponse): Promise<void> {
  const names = (await readdir(FONTS_DIR)).filter((name) => /\.(ttf|otf|ttc)$/i.test(name));
  const fonts = await Promise.all(
    names.sort().map(async (name) => ({
      file: name,
      bytes: (await stat(join(FONTS_DIR, name))).size,
    })),
  );
  sendJson(response, 200, { dir: FONTS_DIR, count: fonts.length, fonts });
}

async function handleRender(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> {
  const body = await readJson(request);
  const bundle = readBundle(body);
  const format = readFormat(body, url);

  const renderRequest: RenderRequest = { ...bundle, format };
  if (typeof body.pdfStandard === 'string') renderRequest.pdfStandard = body.pdfStandard;
  if (typeof body.pdfTags === 'boolean') renderRequest.pdfTags = body.pdfTags;

  const { outcome, source } = await render(renderRequest);
  const headers = outcomeHeaders(outcome, source);
  served++;

  if (outcome.artifact === null) {
    // Nothing renderable: the caller gets the diagnostics and keeps whatever it
    // was already showing (the editor keeps its last good preview).
    sendJson(response, 422, { error: 'compile_failed', diagnostics: outcome.diagnostics }, headers);
    return;
  }

  const artifact = outcome.artifact;
  if (format === 'pages') {
    sendPages(response, outcome, headers);
    return;
  }

  sendBytes(response, 200, artifact as Uint8Array | string, FORMAT_CONTENT_TYPE[format], headers);
}

/* ------------------------------------------------------------------- shares */

/**
 * Persist a project and return a read-only token.
 *
 * The body is the same `SourceBundle` shape as `/v1/render`, so a client can
 * share exactly what it is previewing without a second serialisation.
 */
async function handleShareCreate(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = await readJson(request);
  const bundle = readBundle(body);
  const title = typeof body.title === 'string' ? body.title : undefined;
  const record = await shares.create({ title, bundle });
  sendJson(response, 201, shares.summary(record), {
    Location: `/v1/shares/${record.token}`,
  });
}

async function handleShareSummary(response: ServerResponse, token: string): Promise<void> {
  const record = await shares.get(token);
  sendJson(response, 200, shares.summary(record));
}

async function handleShareRender(
  token: string,
  response: ServerResponse,
  format: 'pages' | 'pdf',
): Promise<void> {
  const record = await shares.get(token);
  const { outcome, source } = await render({ ...record.bundle, format });
  const headers = outcomeHeaders(outcome, source);
  served++;

  if (outcome.artifact === null) {
    sendJson(response, 422, { error: 'compile_failed', diagnostics: outcome.diagnostics }, headers);
    return;
  }

  if (format === 'pages') {
    sendPages(response, outcome, headers);
    return;
  }

  sendBytes(response, 200, outcome.artifact as Uint8Array, FORMAT_CONTENT_TYPE.pdf, {
    ...headers,
    'Content-Disposition': `inline; filename="${shares.pdfFilename(record)}"`,
  });
}

async function handleShareDelete(response: ServerResponse, token: string): Promise<void> {
  const removed = await shares.remove(token);
  if (!removed) throw new HttpError(404, `share ${token} not found`, 'share_not_found');
  response.writeHead(204);
  response.end();
}

async function handleQuery(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJson(request);
  const bundle = readBundle(body);
  if (typeof body.selector !== 'string' || body.selector.length === 0) {
    throw new HttpError(400, '"selector" is required', 'missing_selector');
  }

  const queryRequest: QueryRequest = { ...bundle, selector: body.selector };
  if (typeof body.field === 'string') queryRequest.field = body.field;

  const outcome = await pool.run<{ result: unknown; diagnostics: Diagnostic[]; ms: number }>(
    'query',
    queryRequest,
  );
  sendJson(response, 200, {
    result: outcome.result,
    diagnostics: outcome.diagnostics,
    ms: outcome.ms,
  });
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (applyCors(request, response)) return;

  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method === 'GET' && (path === '/' || path === '/v1')) {
    sendJson(response, 200, {
      service: 'glyph-render',
      engine: `typst.ts ${ENGINE_VERSION} (native)`,
      routes: {
        'GET /v1/health': 'pool + cache stats',
        'GET /v1/fonts': 'fonts the engine will resolve',
        'POST /v1/render': 'compile and export (pdf | svg | pages | html | vector)',
        'POST /v1/query': 'introspection queries (e.g. selector=heading)',
        'POST /v1/shares': 'persist a bundle, return a read-only token',
        'GET /v1/shares/:token': 'share metadata (never sources)',
        'GET /v1/shares/:token/pages': 'rendered pages for a share',
        'GET /v1/shares/:token/pdf': 'rendered PDF for a share',
        'DELETE /v1/shares/:token': 'revoke a share',
      },
    });
    return;
  }
  if (request.method === 'GET' && path === '/v1/health') return handleHealth(response);
  if (request.method === 'GET' && path === '/v1/fonts') return handleFonts(response);
  if (request.method === 'POST' && path === '/v1/render') return handleRender(request, response, url);
  if (request.method === 'POST' && path === '/v1/query') return handleQuery(request, response);

  if (path === '/v1/shares') {
    if (request.method === 'POST') return handleShareCreate(request, response);
    throw new HttpError(405, 'use POST /v1/shares', 'method_not_allowed');
  }

  const share = /^\/v1\/shares\/([^/]+)(?:\/(pages|pdf))?$/.exec(path);
  if (share !== null) {
    const token = share[1]!;
    const artifact = share[2];
    if (artifact === undefined) {
      if (request.method === 'GET') return handleShareSummary(response, token);
      if (request.method === 'DELETE') return handleShareDelete(response, token);
    } else if (request.method === 'GET') {
      return handleShareRender(token, response, artifact as 'pages' | 'pdf');
    }
    throw new HttpError(405, `unsupported method for ${path}`, 'method_not_allowed');
  }

  throw new HttpError(404, `no route for ${request.method} ${path}`, 'not_found');
}

/* ------------------------------------------------------------------- server */

const server = createServer((request, response) => {
  const at = performance.now();
  route(request, response)
    .catch((error: unknown) => {
      if (response.headersSent) {
        response.end();
        return;
      }
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.code ?? 'error', message: error.message });
        return;
      }
      if (error instanceof SourceError) {
        sendJson(response, 400, { error: 'bad_source', message: error.message });
        return;
      }
      if (error instanceof ShareNotFound) {
        sendJson(response, 404, { error: 'share_not_found', message: error.message });
        return;
      }
      if (error instanceof PoolError) {
        const status =
          error.code === 'bad_request' ? 400 : error.code === 'timeout' ? 504 : 503;
        sendJson(response, status, { error: error.code, message: error.message });
        return;
      }
      log({ level: 'error', message: (error as Error)?.message });
      sendJson(response, 500, { error: 'internal', message: 'internal error' });
    })
    .finally(() => {
      if (config.logLevel === 'debug') {
        log({
          level: 'debug',
          method: request.method,
          url: request.url,
          status: response.statusCode,
          ms: Number((performance.now() - at).toFixed(2)),
        });
      }
    });
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;

/**
 * A port conflict is the most common local failure (a stale `--watch` process,
 * or two terminals running `npm run dev`). Node's default is an unhandled
 * `error` event with a stack trace; say what happened and how to fix it instead.
 */
server.on('error', (error: NodeJS.ErrnoException) => {
  const conflict = error.code === 'EADDRINUSE';
  log({
    level: 'error',
    message: conflict
      ? `port ${config.port} is already in use`
      : 'render service failed to start',
    code: error.code,
    detail: error.message,
    ...(conflict
      ? {
          hint: `stop the other process (lsof -i :${config.port}) or run both packages with GLYPH_RENDER_PORT=${config.port + 1}`,
        }
      : {}),
  });
  void pool.close().finally(() => process.exit(1));
});

async function shutdown(signal: string): Promise<void> {
  log({ level: 'info', message: `received ${signal}, shutting down` });
  server.close();
  await pool.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await pool.ready;
server.listen(config.port, config.host, () => {
  const stats = pool.stats();
  log({
    level: 'info',
    message: 'glyph render service listening',
    url: `http://${config.host}:${config.port}`,
    engine: ENGINE_VERSION,
    typst: ENGINE.typst,
    workers: stats.size,
    warmMs: stats.warmMs,
    cacheMB: Math.round(config.cacheBytes / 1024 / 1024),
  });
});

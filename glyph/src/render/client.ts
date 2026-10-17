/**
 * Client for the glyph render service (`server/`).
 *
 * The editor does not need this to compile — that happens locally in a worker.
 * This is how the app reaches the *durable* half of the split: exports that
 * should not depend on the visitor's machine, and the server-rendered pages a
 * share link would show.
 *
 * In development Vite proxies `/api` to the service (see `vite.config.ts`), so
 * the default base URL is same-origin and needs no CORS round trip. In
 * production point `VITE_RENDER_URL` at the deployed service.
 */

export type RenderFormat = 'pdf' | 'svg' | 'pages' | 'html' | 'vector';

export interface SourceBundle {
  entry?: string;
  files: Record<string, string>;
  /** Project-relative path to base64-encoded bytes (images, data files). */
  assets?: Record<string, string>;
  inputs?: Record<string, string>;
}

export interface RenderDiagnostic {
  severity: 'error' | 'warning';
  message: string;
  hints: string[];
  file?: string;
}

export interface SvgPage {
  index: number;
  width: number;
  height: number;
  svg: string;
}

export interface PagesResult {
  width: number;
  height: number;
  count: number;
  pages: SvgPage[];
  diagnostics: RenderDiagnostic[];
  ms: number;
}

/** `PagesResult` plus the per-response telemetry headers. */
export type PagesReport = PagesResult & { meta: RenderMeta };

/** Per-response telemetry, straight off the `X-Glyph-*` headers. */
export interface RenderMeta {
  ms: number;
  pages: number;
  cache: 'hit' | 'miss' | 'coalesced' | 'unknown';
  errors: number;
  warnings: number;
}

export interface HealthReport {
  ok: boolean;
  service: string;
  engine: { package: string; version: string };
  uptimeMs: number;
  pool: {
    size: number;
    idle: number;
    queued: number;
    inFlight: number;
    completed: number;
    restarts: number;
    warmMs: number;
  };
  cache: {
    entries: number;
    bytes: number;
    maxBytes: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
}

/** A failed render. Carries the engine's diagnostics when it has them. */
export class RenderError extends Error {
  readonly status: number;
  readonly diagnostics: RenderDiagnostic[];

  constructor(message: string, status: number, diagnostics: RenderDiagnostic[] = []) {
    super(message);
    this.name = 'RenderError';
    this.status = status;
    this.diagnostics = diagnostics;
  }
}

const DEFAULT_BASE = (import.meta.env.VITE_RENDER_URL as string | undefined) ?? '/api';

function readMeta(response: Response): RenderMeta {
  const cache = response.headers.get('X-Glyph-Cache');
  return {
    ms: Number(response.headers.get('X-Glyph-Ms') ?? 0),
    pages: Number(response.headers.get('X-Glyph-Pages') ?? 0),
    cache: cache === 'hit' || cache === 'miss' || cache === 'coalesced' ? cache : 'unknown',
    errors: Number(response.headers.get('X-Glyph-Errors') ?? 0),
    warnings: Number(response.headers.get('X-Glyph-Warnings') ?? 0),
  };
}

export interface RenderedBytes {
  bytes: Uint8Array;
  meta: RenderMeta;
}

export class RenderClient {
  readonly baseUrl: string;

  constructor(baseUrl: string = DEFAULT_BASE) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async #post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      throw new RenderError('render service is unreachable', 0);
    }

    if (response.ok) return response;

    // A failed compile answers 422 with diagnostics; anything else is an
    // operational error. Both should surface the server's own message.
    let message = `render failed (${response.status})`;
    let diagnostics: RenderDiagnostic[] = [];
    try {
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        diagnostics?: RenderDiagnostic[];
      };
      if (payload.diagnostics) diagnostics = payload.diagnostics;
      message = payload.message ?? payload.error ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new RenderError(message, response.status, diagnostics);
  }

  /** Liveness + pool/cache stats. Used by the toolbar indicator. */
  async health(signal?: AbortSignal): Promise<HealthReport> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/health`, { signal });
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      throw new RenderError('render service is unreachable', 0);
    }
    if (!response.ok) throw new RenderError(`health check failed (${response.status})`, response.status);
    return (await response.json()) as HealthReport;
  }

  /** Render to a binary artifact (pdf, vector, svg, html). */
  async render(
    bundle: SourceBundle,
    format: Exclude<RenderFormat, 'pages'>,
    signal?: AbortSignal,
  ): Promise<RenderedBytes> {
    const response = await this.#post('render', { ...bundle, format }, signal);
    const buffer = await response.arrayBuffer();
    return { bytes: new Uint8Array(buffer), meta: readMeta(response) };
  }

  /** Render to text (svg, html). */
  async renderText(
    bundle: SourceBundle,
    format: 'svg' | 'html',
    signal?: AbortSignal,
  ): Promise<{ text: string; meta: RenderMeta }> {
    const response = await this.#post('render', { ...bundle, format }, signal);
    return { text: await response.text(), meta: readMeta(response) };
  }

  /** Render one standalone SVG per page — what a share link displays. */
  async pages(bundle: SourceBundle, signal?: AbortSignal): Promise<PagesReport> {
    const response = await this.#post('render', { ...bundle, format: 'pages' }, signal);
    const report = (await response.json()) as PagesResult;
    return { ...report, meta: readMeta(response) };
  }

  /** Run an introspection query against the document (e.g. `heading`). */
  async query(
    bundle: SourceBundle,
    selector: string,
    field?: string,
    signal?: AbortSignal,
  ): Promise<{ result: unknown; ms: number }> {
    const response = await this.#post('query', { ...bundle, selector, field }, signal);
    return (await response.json()) as { result: unknown; ms: number };
  }
}

/** Save bytes to disk via a temporary object URL. */
export function downloadBytes(bytes: Uint8Array, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

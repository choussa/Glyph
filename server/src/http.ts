/**
 * A deliberately tiny HTTP layer — no framework, no router tree.
 *
 * The surface is JSON-in/binary-out, so a `node:http` server with a switch on
 * the path is both the smallest and the fastest option: no dependency, no
 * middleware, no per-request allocation beyond the body.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from './config.ts';

export class HttpError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

/** Apply CORS headers (and answer preflights). Returns true if handled. */
export function applyCors(request: IncomingMessage, response: ServerResponse): boolean {
  response.setHeader('Access-Control-Allow-Origin', config.cors);
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.setHeader(
    'Access-Control-Expose-Headers',
    'X-Glyph-Ms, X-Glyph-Pages, X-Glyph-Cache, X-Glyph-Errors, X-Glyph-Warnings',
  );
  response.setHeader('Vary', 'Origin');

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return true;
  }
  return false;
}

/** Read and parse a JSON body, enforcing the size limit. */
export async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const declared = Number(request.headers['content-length'] ?? 0);
  if (Number.isFinite(declared) && declared > config.maxBodyBytes) {
    throw new HttpError(413, `body exceeds ${config.maxBodyBytes} bytes`, 'body_too_large');
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > config.maxBodyBytes) {
      throw new HttpError(413, `body exceeds ${config.maxBodyBytes} bytes`, 'body_too_large');
    }
    chunks.push(buffer);
  }

  if (size === 0) throw new HttpError(400, 'request body is required', 'empty_body');
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new HttpError(400, 'body must be a JSON object', 'invalid_body');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'body is not valid JSON', 'invalid_json');
  }
}

export function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const payload = Buffer.from(JSON.stringify(body), 'utf8');
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(payload.length),
    ...headers,
  });
  response.end(payload);
}

export function sendBytes(
  response: ServerResponse,
  status: number,
  body: Uint8Array | string,
  contentType: string,
  headers: Record<string, string> = {},
): void {
  const payload = typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  response.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': String(payload.length),
    ...headers,
  });
  response.end(payload);
}

/** A structured one-line access log. */
export function log(event: Record<string, unknown>): void {
  if (config.logLevel === 'silent') return;
  process.stdout.write(`${JSON.stringify({ t: new Date().toISOString(), ...event })}\n`);
}

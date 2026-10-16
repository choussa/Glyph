/**
 * Worker entry: owns one warm `Renderer` and answers one job at a time.
 *
 * Typst compiles synchronously, so a worker thread is the unit of parallelism.
 * The worker is deliberately dumb — it never touches the HTTP layer, never
 * caches, and never sees another job while one is running — which keeps the
 * renderer's shadow-file isolation trivially correct.
 *
 * Every job is wrapped: an exception escaping this handler would kill the
 * thread, and a dead thread is far more expensive than a failed request.
 */
import { parentPort } from 'node:worker_threads';
import { SourceError } from './paths.ts';
import { Renderer } from './renderer.ts';
import type { QueryRequest, RenderRequest } from './types.ts';

export interface WorkerJob {
  id: number;
  kind: 'render' | 'query';
  payload: RenderRequest | QueryRequest;
}

export interface WorkerOk {
  type: 'ok';
  id: number;
  value: unknown;
}

export interface WorkerFail {
  type: 'error';
  id: number;
  message: string;
  code: 'bad_request' | 'internal';
}

export interface WorkerReady {
  type: 'ready';
  warmMs: number;
}

const port = parentPort;
if (port === null) throw new Error('render worker must run inside a worker thread');

const renderer = new Renderer();

port.on('message', (job: WorkerJob) => {
  try {
    if (job.kind === 'render') {
      const outcome = renderer.render(job.payload as RenderRequest);
      // Hand binary artifacts over without a structured-clone copy.
      const artifact = outcome.artifact;
      if (artifact instanceof Uint8Array) {
        const bytes = new Uint8Array(artifact.byteLength);
        bytes.set(artifact);
        port.postMessage(
          { type: 'ok', id: job.id, value: { ...outcome, artifact: bytes } } satisfies WorkerOk,
          [bytes.buffer],
        );
        return;
      }
      port.postMessage({ type: 'ok', id: job.id, value: outcome } satisfies WorkerOk);
      return;
    }

    port.postMessage({
      type: 'ok',
      id: job.id,
      value: renderer.query(job.payload as QueryRequest),
    } satisfies WorkerOk);
  } catch (error) {
    port.postMessage({
      type: 'error',
      id: job.id,
      message: error instanceof Error ? error.message : String(error),
      code: error instanceof SourceError ? 'bad_request' : 'internal',
    } satisfies WorkerFail);
  }
});

// Warm the engine before advertising readiness, so the first real request is
// already on the fast path (fonts parsed, native module hot).
const warmMs = renderer.warm();
port.postMessage({ type: 'ready', warmMs } satisfies WorkerReady);

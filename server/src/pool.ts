/**
 * A fixed pool of render workers.
 *
 * The work is CPU-bound and synchronous inside the worker, so the pool exists
 * purely to keep the event loop responsive and to let concurrent requests use
 * more than one core. Jobs are dispatched round-robin over idle workers and
 * queued FIFO when all of them are busy.
 *
 * A worker that crashes or hangs is dropped and replaced: a native compile that
 * never returns cannot be interrupted, so the only recovery is to terminate the
 * thread and respawn it.
 */
import { Worker } from 'node:worker_threads';
import { config } from './config.ts';
import type { WorkerFail, WorkerJob, WorkerOk, WorkerReady } from './worker.ts';

export type PoolErrorCode = 'bad_request' | 'internal' | 'timeout' | 'closed';

export class PoolError extends Error {
  readonly code: PoolErrorCode;

  constructor(message: string, code: PoolErrorCode) {
    super(message);
    this.name = 'PoolError';
    this.code = code;
  }
}

type JobKind = WorkerJob['kind'];
type Payload = WorkerJob['payload'];

interface Waiting {
  kind: JobKind;
  payload: Payload;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface Running {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface PoolStats {
  size: number;
  idle: number;
  queued: number;
  inFlight: number;
  completed: number;
  restarts: number;
  warmMs: number;
}

export class RenderPool {
  readonly size: number;
  readonly #workers = new Set<Worker>();
  readonly #idle: Worker[] = [];
  readonly #queue: Waiting[] = [];
  readonly #running = new Map<Worker, Running>();
  readonly #dead = new Set<Worker>();
  #readyCount = 0;
  #warmMs = 0;
  #restarts = 0;
  #completed = 0;
  #nextId = 1;
  #closed = false;
  readonly #ready: Promise<void>;
  #resolveReady!: () => void;

  constructor(size: number) {
    this.size = size;
    this.#ready = new Promise<void>((resolve) => {
      this.#resolveReady = resolve;
    });
    for (let i = 0; i < size; i++) this.#spawn();
  }

  /** Resolves once every worker has warmed its engine. */
  get ready(): Promise<void> {
    return this.#ready;
  }

  #spawn(): void {
    const worker = new Worker(new URL('./worker.ts', import.meta.url));
    this.#workers.add(worker);
    worker.on('message', (message: WorkerOk | WorkerFail | WorkerReady) => {
      this.#onMessage(worker, message);
    });
    worker.on('error', (error: Error) => this.#retire(worker, error));
    worker.on('exit', (code: number) => {
      if (this.#closed || this.#dead.has(worker)) return;
      this.#retire(worker, new PoolError(`render worker exited with code ${code}`, 'internal'));
    });
  }

  #onMessage(worker: Worker, message: WorkerOk | WorkerFail | WorkerReady): void {
    if (message.type === 'ready') {
      this.#warmMs = Math.max(this.#warmMs, message.warmMs);
      this.#idle.push(worker);
      if (++this.#readyCount >= this.size) this.#resolveReady();
      this.#dispatch();
      return;
    }

    const running = this.#running.get(worker);
    this.#running.delete(worker);
    if (running) {
      clearTimeout(running.timer);
      if (message.type === 'ok') {
        this.#completed++;
        running.resolve(message.value);
      } else {
        running.reject(new PoolError(message.message, message.code));
      }
    }

    // The worker is still healthy — put it back to work.
    if (!this.#dead.has(worker)) {
      this.#idle.push(worker);
      this.#dispatch();
    }
  }

  /** Drop a worker and, if the pool is live, replace it. */
  #retire(worker: Worker, error: Error): void {
    if (this.#dead.has(worker)) return;
    this.#dead.add(worker);
    this.#workers.delete(worker);

    const running = this.#running.get(worker);
    this.#running.delete(worker);
    if (running) {
      clearTimeout(running.timer);
      running.reject(error);
    }

    const idleAt = this.#idle.indexOf(worker);
    if (idleAt !== -1) this.#idle.splice(idleAt, 1);

    if (!this.#closed) {
      this.#restarts++;
      this.#spawn();
    }
  }

  #dispatch(): void {
    while (this.#queue.length > 0 && this.#idle.length > 0) {
      const worker = this.#idle.pop()!;
      this.#send(worker, this.#queue.shift()!);
    }
  }

  #send(worker: Worker, waiting: Waiting): void {
    const id = this.#nextId++;
    const timer = setTimeout(() => {
      // The thread is wedged in native code; terminate it and let #retire
      // reject the request and respawn a replacement.
      worker.terminate().catch(() => {});
      this.#retire(
        worker,
        new PoolError(`render exceeded ${config.requestTimeoutMs} ms`, 'timeout'),
      );
    }, config.requestTimeoutMs);
    timer.unref();

    this.#running.set(worker, { resolve: waiting.resolve, reject: waiting.reject, timer });
    worker.postMessage({ id, kind: waiting.kind, payload: waiting.payload } satisfies WorkerJob);
  }

  run<T>(kind: JobKind, payload: Payload): Promise<T> {
    if (this.#closed) {
      return Promise.reject(new PoolError('render pool is closed', 'closed'));
    }
    return new Promise<T>((resolve, reject) => {
      this.#queue.push({
        kind,
        payload,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.#dispatch();
    });
  }

  stats(): PoolStats {
    return {
      size: this.size,
      idle: this.#idle.length,
      queued: this.#queue.length,
      inFlight: this.#running.size,
      completed: this.#completed,
      restarts: this.#restarts,
      warmMs: Number(this.#warmMs.toFixed(1)),
    };
  }

  async close(): Promise<void> {
    this.#closed = true;
    const closing = new PoolError('render pool is closing', 'closed');
    for (const [, running] of this.#running) {
      clearTimeout(running.timer);
      running.reject(closing);
    }
    this.#running.clear();
    for (const waiting of this.#queue) waiting.reject(closing);
    this.#queue.length = 0;

    const workers = [...this.#workers];
    this.#workers.clear();
    this.#idle.length = 0;
    await Promise.all(workers.map((worker) => worker.terminate().catch(() => {})));
  }
}

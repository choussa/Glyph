/**
 * Render service benchmark.
 *
 * Measures the three things that decide whether the split is worth it:
 *   1. engine warm-up (paid once per worker),
 *   2. warm render latency per format (the interactive path), and
 *   3. HTTP throughput under concurrency, with and without the cache.
 *
 * Run: `npm run bench`
 */
import { spawn } from 'node:child_process';
import { Renderer } from '../src/renderer.ts';
import type { RenderFormat } from '../src/types.ts';

const SMALL = `#set page(width: 21cm, height: 29.7cm, margin: 2.5cm)
#set text(font: "Libertinus Serif", size: 11pt)
#set heading(numbering: "1.")
= glyph
Hello *world*. $ integral_0^oo e^(-x^2) dif x = sqrt(pi)/2 $
`;

const LARGE = `${SMALL}
${Array.from({ length: 40 }, (_, i) => `== Section ${i + 1}\n#lorem(120)\n`).join('\n')}`;

function percentile(sorted: number[], p: number): number {
  const at = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[at]!;
}

function report(label: string, samples: number[]): void {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  console.log(
    `${label.padEnd(30)} n=${String(samples.length).padStart(4)}  ` +
      `mean=${mean.toFixed(2)}ms  p50=${percentile(sorted, 50).toFixed(2)}ms  ` +
      `p95=${percentile(sorted, 95).toFixed(2)}ms  max=${sorted.at(-1)!.toFixed(2)}ms`,
  );
}

/* --------------------------------------------------------- in-process engine */

console.log('\n== in-process engine ==');
const renderer = new Renderer();
const warmMs = renderer.warm();
console.log(`cold warm-up: ${warmMs.toFixed(0)}ms (fonts parsed, module loaded)`);

for (const [name, doc] of [
  ['small (1 page)', SMALL],
  ['large (40 sections)', LARGE],
] as const) {
  const compiled = renderer.render({ files: { '/main.typ': doc }, format: 'pdf' });
  console.log(`  ${name}: ${compiled.pages} pages, first render ${compiled.ms.toFixed(2)}ms`);
  for (const format of ['pdf', 'svg', 'pages', 'vector'] as RenderFormat[]) {
    const samples: number[] = [];
    for (let i = 0; i < 40; i++) {
      samples.push(renderer.render({ files: { '/main.typ': doc }, format }).ms);
    }
    report(`  ${name} -> ${format}`, samples);
  }
}

/* ------------------------------------------------------------------ over HTTP */

const PORT = 8799;
const server = spawn(process.execPath, ['src/index.ts'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: {
    ...process.env,
    PORT: String(PORT),
    GLYPH_RENDER_WORKERS: process.env.GLYPH_RENDER_WORKERS ?? '2',
    GLYPH_LOG: 'silent',
  },
  stdio: 'ignore',
});

const base = `http://127.0.0.1:${PORT}/v1`;
for (let waited = 0; ; waited += 200) {
  try {
    if ((await fetch(`${base}/health`)).ok) break;
  } catch {
    /* not up yet */
  }
  if (waited > 60_000) throw new Error('server did not start');
  await new Promise((r) => setTimeout(r, 200));
}
console.log('\n== over HTTP ==');

const post = (path: string, body: unknown) =>
  fetch(`${base}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

// Cache hit: same bytes requested repeatedly.
const hitBody = { files: { '/main.typ': SMALL }, format: 'pdf' };
await (await post('render', hitBody)).arrayBuffer();
{
  const samples: number[] = [];
  for (let i = 0; i < 200; i++) {
    const at = performance.now();
    await (await post('render', hitBody)).arrayBuffer();
    samples.push(performance.now() - at);
  }
  report('cache hit (round trip)', samples);
}

// Cache miss: a different document every request.
{
  const samples: number[] = [];
  for (let i = 0; i < 60; i++) {
    const body = { files: { '/main.typ': `${SMALL}\n${i}\n` }, format: 'pdf' };
    const at = performance.now();
    await (await post('render', body)).arrayBuffer();
    samples.push(performance.now() - at);
  }
  report('cache miss (round trip)', samples);
}

// Concurrency: distinct documents in parallel, so the pool is actually used.
for (const concurrency of [1, 4, 16]) {
  const at = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, (_, i) =>
      post('render', { files: { '/main.typ': `${SMALL}\n${i}\n` }, format: 'pdf' }).then((r) =>
        r.arrayBuffer(),
      ),
    ),
  );
  const elapsed = performance.now() - at;
  console.log(
    `concurrency ${String(concurrency).padStart(2)}: ${elapsed.toFixed(1)}ms total, ` +
      `${(elapsed / concurrency).toFixed(2)}ms/request, ` +
      `${(concurrency / (elapsed / 1000)).toFixed(0)} req/s`,
  );
}

const health = (await (await fetch(`${base}/health`)).json()) as {
  pool: unknown;
  cache: unknown;
};
console.log('\nhealth:', JSON.stringify({ pool: health.pool, cache: health.cache }));

server.kill('SIGKILL');

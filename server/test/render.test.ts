/**
 * Render service tests.
 *
 * These exercise the engine directly (no HTTP, no pool) so they stay fast, plus
 * one subprocess smoke test that proves the real server boots and serves.
 *
 * Run: `node --test test/`
 */
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { ByteLruCache } from '../src/cache.ts';
import { normalizeDiagnostics, splitHints } from '../src/diagnostics.ts';
import { ENGINE, ENGINE_IN_SYNC, INSTALLED_TYPST_TS } from '../src/engine.ts';
import {
  SourceError,
  normalizeKey,
  toRequestPath,
  toWorkspacePath,
  validateBundlePaths,
} from '../src/paths.ts';
import { Renderer } from '../src/renderer.ts';
import { splitSvgPages } from '../src/svg.ts';

const renderer = new Renderer();
const warmMs = renderer.warm();

const DOC = `#set page(width: 21cm, height: 29.7cm, margin: 2.5cm)
#set text(font: "Libertinus Serif", size: 11pt)
= glyph
Hello *world*. $ integral_0^oo e^(-x^2) dif x = sqrt(pi)/2 $
#pagebreak()
= Two
Second page.
`;

test('engine warms up', () => {
  assert.ok(warmMs >= 0);
});

/* ------------------------------------------------------------------ engine */

test('the manifest matches the installed compiler package', () => {
  assert.equal(INSTALLED_TYPST_TS, ENGINE.typstTs, 'engine.json typstTs is stale');
  assert.equal(ENGINE_IN_SYNC, true);
});

test('the running engine compiles the Typst version the manifest records', () => {
  // `#panic(str(sys.version))` surfaces the language version in the diagnostic,
  // which is the only way to read it — the npm version is not the language one.
  const outcome = renderer.render({
    files: { '/main.typ': '#panic("VER=" + str(sys.version))\n' },
    format: 'pdf',
  });
  const message = outcome.diagnostics.map((d) => d.message).join('\n');
  assert.ok(
    message.includes(`VER=${ENGINE.typst}`),
    `engine reports a different Typst version than engine.json (${ENGINE.typst}): ${message}`,
  );
});

/* ------------------------------------------------------------------- paths */

test('paths normalise consistently', () => {
  assert.equal(normalizeKey('main.typ'), '/main.typ');
  assert.equal(normalizeKey('./a/b.typ'), '/a/b.typ');
  assert.equal(normalizeKey('/a//b.typ'), '/a/b.typ');
  assert.equal(toWorkspacePath('/glyph', '/a/b.typ'), '/glyph/a/b.typ');
  assert.equal(toRequestPath('/glyph/a/b.typ'), '/a/b.typ');
  assert.equal(toRequestPath('/other/x.typ'), '/other/x.typ');
});

test('paths reject traversal', () => {
  assert.throws(() => toWorkspacePath('/glyph', '/../etc/passwd'), SourceError);
  assert.throws(() => toWorkspacePath('/glyph', 'a/../../b'), SourceError);
});

test('bundle validation requires the entry', () => {
  assert.throws(() => validateBundlePaths('/main.typ', { '/other.typ': 'x' }, undefined), SourceError);
  const ok = validateBundlePaths(undefined, { 'main.typ': 'x' }, undefined);
  assert.equal(ok.entryKey, '/main.typ');
  assert.deepEqual(Object.keys(ok.files), ['/main.typ']);
});

/* -------------------------------------------------------------- diagnostics */

test('diagnostic hints are split out of the message', () => {
  assert.deepEqual(splitHints('boom, hints: try this'), { message: 'boom', hints: ['try this'] });
  assert.deepEqual(splitHints('boom'), { message: 'boom', hints: [] });
});

test('diagnostics carry severity and drop non-diagnostics', () => {
  const normalized = normalizeDiagnostics(
    [{ message: 'bad', path: '/glyph/main.typ' }, null, { nope: 1 }],
    'error',
  );
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].severity, 'error');
  assert.equal(normalized[0].file, '/glyph/main.typ');
  assert.deepEqual(normalizeDiagnostics(undefined, 'warning'), []);
});

/* -------------------------------------------------------------------- cache */

test('cache evicts by byte budget and tracks recency', () => {
  const cache = new ByteLruCache<string>(100, 10);
  cache.set('a', 'A', 40);
  cache.set('b', 'B', 40);
  assert.equal(cache.get('a'), 'A');
  cache.set('c', 'C', 40); // 120 > 100 -> evicts the least recently used ('b')
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 'A');
  assert.equal(cache.get('c'), 'C');
  assert.equal(cache.stats().evictions, 1);
});

test('cache refuses a blob larger than the whole budget', () => {
  const cache = new ByteLruCache<string>(100, 10);
  cache.set('big', 'X', 500);
  assert.equal(cache.get('big'), undefined);
  assert.equal(cache.stats().entries, 0);
});

/* ---------------------------------------------------------------- rendering */

test('renders a PDF', () => {
  const outcome = renderer.render({ files: { '/main.typ': DOC }, format: 'pdf' });
  assert.equal(outcome.diagnostics.length, 0);
  assert.equal(outcome.pages, 2);
  const pdf = outcome.artifact as Uint8Array;
  assert.ok(pdf instanceof Uint8Array);
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString('latin1'), '%PDF-');
});

test('renders an SVG', () => {
  const outcome = renderer.render({ files: { '/main.typ': DOC }, format: 'svg' });
  const svg = outcome.artifact as string;
  assert.match(svg, /^<svg /);
  assert.match(svg, /class="typst-doc"/);
});

test('renders html on the html target', () => {
  const outcome = renderer.render({
    files: { '/main.typ': '= Web\n\nHello *html*.\n' },
    format: 'html',
  });
  const html = outcome.artifact as string;
  assert.match(html, /^<!DOCTYPE html>/);
});

test('renders the vector IR', () => {
  const outcome = renderer.render({ files: { '/main.typ': DOC }, format: 'vector' });
  assert.ok((outcome.artifact as Uint8Array).byteLength > 0);
});

test('resolves multi-file imports', () => {
  const outcome = renderer.render({
    files: {
      '/main.typ': '#import "lib.typ": chapter\n#chapter("from another file")\n',
      '/lib.typ': '#let chapter(title) = [= #title]\n',
    },
    format: 'pdf',
  });
  assert.deepEqual(outcome.diagnostics, []);

  const outline = renderer.query({
    files: {
      '/main.typ': '#import "lib.typ": chapter\n#chapter("from another file")\n',
      '/lib.typ': '#let chapter(title) = [= #title]\n',
    },
    selector: 'heading',
    field: 'body',
  });
  assert.deepEqual(outline.result, [{ func: 'text', text: 'from another file' }]);
});

test('resolves project-absolute imports', () => {
  const outcome = renderer.render({
    files: {
      '/main.typ': '#import "/lib.typ": greet\n#greet()\n',
      '/lib.typ': '#let greet() = [hi]\n',
    },
    format: 'pdf',
  });
  assert.deepEqual(outcome.diagnostics, []);
});

test('reports diagnostics with request-relative paths', () => {
  const outcome = renderer.render({
    files: { '/main.typ': '#import "lib.typ": missing\n', '/lib.typ': '#let other = 1\n' },
    format: 'pdf',
  });
  assert.ok(outcome.diagnostics.length > 0);
  assert.equal(outcome.diagnostics[0].severity, 'error');
  assert.equal(outcome.diagnostics[0].file, '/main.typ');
});

test('returns no artifact for an unrenderable document', () => {
  const outcome = renderer.render({
    files: { '/main.typ': '#set page(width: 1pt)\n#panic()\n' },
    format: 'pdf',
  });
  // Either it produced something partial, or nothing — never a throw.
  assert.ok(outcome.artifact === null || outcome.artifact instanceof Uint8Array);
});

test('renders binary assets', () => {
  // A real 2x2 RGBA PNG (hand-rolled fixtures with bad CRCs fail to decode).
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP4z8DwHwwZGP7//w9kAABHygj4/BTyWgAAAABJRU5ErkJggg==';
  const outcome = renderer.render({
    files: { '/main.typ': '#image("logo.png", width: 10pt)\n' },
    assets: { '/logo.png': png },
    format: 'pdf',
  });
  assert.deepEqual(outcome.diagnostics, []);

  // Prove the bytes were actually used, not silently ignored: the SVG embeds
  // the raster as an <image> element. This is the server half of the B1 guard —
  // the editor half is `Workspace.bundle()` in glyph/src/workspace.
  const svg = renderer.render({
    files: { '/main.typ': '#image("logo.png", width: 10pt)\n' },
    assets: { '/logo.png': png },
    format: 'svg',
  }).artifact as string;
  assert.match(svg, /<image\b/);
});

test('does not leak sources between requests', () => {
  renderer.render({ files: { '/main.typ': '#import "only-here.typ": x\n#x\n', '/only-here.typ': '#let x = 1' }, format: 'pdf' });
  const second = renderer.render({
    files: { '/main.typ': '#import "only-here.typ": x\n#x\n' },
    format: 'pdf',
  });
  // The second request must fail: the first request's file is gone.
  assert.ok(second.diagnostics.some((d) => d.message.includes('file not found')));
});

/* -------------------------------------------------------------- svg splitting */

test('splits a multi-page SVG into standalone pages', () => {
  const outcome = renderer.render({ files: { '/main.typ': DOC }, format: 'pages' });
  const artifact = outcome.artifact as {
    width: number;
    height: number;
    pages: { index: number; width: number; height: number; svg: string }[];
  };

  assert.equal(artifact.pages.length, 2);
  assert.equal(artifact.width, 596);

  for (const page of artifact.pages) {
    assert.equal(page.width, 596);
    assert.equal(page.height, 842);
    assert.match(page.svg, /^<svg /);
    assert.ok(page.svg.endsWith('</svg>'));
    // Each page must be re-rooted at its own box and pulled back to the origin.
    assert.ok(page.svg.includes(`viewBox="0 0 596 842"`), 'page viewBox is the page box');
    assert.ok(page.svg.includes('transform="translate(0, 0)"'), 'page group is not offset');
    // Shared glyph definitions travel with every page so it stands alone.
    assert.ok(page.svg.includes('<defs'), 'shared defs are included');
  }

  // Distinct pages must not be identical.
  assert.notEqual(artifact.pages[0].svg, artifact.pages[1].svg);
});

test('a single-page document splits to one page', () => {
  const outcome = renderer.render({ files: { '/main.typ': '= One\n' }, format: 'pages' });
  const artifact = outcome.artifact as { pages: unknown[] };
  assert.equal(artifact.pages.length, 1);
});

test('splitSvgPages is total on junk input', () => {
  assert.deepEqual(splitSvgPages('<svg></svg>').pages, []);
  assert.deepEqual(splitSvgPages('').count, 0);
});

/* --------------------------------------------------------------------- query */

test('queries the outline', () => {
  const outcome = renderer.query({
    files: { '/main.typ': '#set heading(numbering: "1.")\n= One\n== One A\n= Two\n' },
    selector: 'heading',
    field: 'level',
  });
  assert.deepEqual(outcome.result, [1, 2, 1]);
});

/* ----------------------------------------------------------- http smoke test */

test('the HTTP server boots and serves every route', async (t) => {
  const { spawn } = await import('node:child_process');
  const port = 8791;
  const server = spawn(process.execPath, ['src/index.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, PORT: String(port), GLYPH_RENDER_WORKERS: '1', GLYPH_LOG: 'silent' },
    stdio: 'ignore',
  });
  t.after(() => server.kill('SIGKILL'));

  const base = `http://127.0.0.1:${port}/v1`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const probe = await fetch(`${base}/health`);
      if (probe.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error('server did not start');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const health = (await (await fetch(`${base}/health`)).json()) as {
    ok: boolean;
    pool: { size: number };
  };
  assert.equal(health.ok, true);
  assert.equal(health.pool.size, 1);

  const body = JSON.stringify({ files: { '/main.typ': DOC }, format: 'pdf' });
  const headers = { 'content-type': 'application/json' };

  const first = await fetch(`${base}/render`, { method: 'POST', headers, body });
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('x-glyph-cache'), 'miss');
  assert.equal(first.headers.get('x-glyph-pages'), '2');
  assert.equal((await first.arrayBuffer()).byteLength > 1000, true);

  const second = await fetch(`${base}/render`, { method: 'POST', headers, body });
  assert.equal(second.headers.get('x-glyph-cache'), 'hit');

  const pages = (await (
    await fetch(`${base}/render`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ files: { '/main.typ': DOC }, format: 'pages' }),
    })
  ).json()) as { count: number };
  assert.equal(pages.count, 2);

  const broken = await fetch(`${base}/render`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ files: { '/main.typ': '#nope()\n' }, format: 'pdf' }),
  });
  assert.equal(broken.status, 422);
  const brokenBody = (await broken.json()) as { diagnostics: { severity: string }[] };
  assert.equal(brokenBody.diagnostics[0].severity, 'error');

  const badEntry = await fetch(`${base}/render`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ files: { '/a.typ': 'x' }, format: 'pdf' }),
  });
  assert.equal(badEntry.status, 400);

  const fonts = (await (await fetch(`${base}/fonts`)).json()) as { count: number };
  assert.ok(fonts.count >= 8);

  const outline = (await (
    await fetch(`${base}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ files: { '/main.typ': DOC }, selector: 'heading', field: 'level' }),
    })
  ).json()) as { result: unknown };
  assert.deepEqual(outline.result, [1, 1]);
});

after(() => {
  // Nothing global to tear down: the in-process renderer has no timers.
});

# `@glyph/render` — server-side Typst

The server half of glyph's rendering split.

The editor compiles Typst **in the browser** so typing stays instant and works
offline. This service is the **durable** half: it renders the documents that
must not depend on any visitor's machine — share-link previews, thumbnails, and
exports — using Typst's native compiler through
[`typst.ts`](https://github.com/Myriad-Dreamin/typst.ts).

| | Browser | Server |
| --- | --- | --- |
| Engine | `@vedivad/typst-web-service` (wasm, ~29 MB) | `@myriaddreamin/typst-ts-node-compiler` (native, napi) |
| Job | live preview, highlight, completion, hover, click-to-source | PDF / SVG / HTML / vector export, share previews, outline queries |
| Latency | ~2 ms per edit, no network | ~0.7 ms warm compile, ~1.4 ms cached round trip |

Both engines are Typst, so both produce the same document — the split is about
*where the work happens*, not about two different renderers.

## Quickstart

```bash
cd server
npm install
npm run dev            # http://localhost:8787
```

No build step: Node ≥ 22.18 runs the TypeScript directly via type stripping, and
the compiler is a prebuilt native addon.

```bash
npm test               # 23 tests: engine, cache, paths, SVG splitting, HTTP
npm run typecheck      # tsc --noEmit
npm run bench          # measured latency + throughput
```

## API

All routes are under `/v1`. Requests are JSON; artifacts come back as binary or
JSON.

### `GET /v1/health`

Pool, cache, and counter stats — used by the editor's server indicator.

```json
{
  "ok": true,
  "engine": { "package": "@myriaddreamin/typst-ts-node-compiler", "version": "0.7.0" },
  "pool": { "size": 2, "idle": 2, "queued": 0, "inFlight": 0, "completed": 61, "restarts": 0, "warmMs": 49.4 },
  "cache": { "entries": 61, "bytes": 1299690, "hits": 221, "misses": 61, "hitRate": 0.7837 }
}
```

### `POST /v1/render`

```jsonc
{
  "entry": "/main.typ",                 // optional, default "/main.typ"
  "files": {
    "/main.typ": "#import \"lib.typ\": x\n#x\n",
    "/lib.typ": "#let x = 1"
  },
  "assets": { "/logo.png": "iVBORw0KGgo…" },   // optional, base64
  "inputs": { "draft": "true" },               // optional, `sys.inputs`
  "format": "pdf",                             // pdf | svg | pages | html | vector
  "pdfStandard": "a-2b",                       // optional, pdf only
  "pdfTags": true                              // optional, pdf only
}
```

`format` may also be given as `?format=svg`.

| `format` | Response | Notes |
| --- | --- | --- |
| `pdf` | `application/pdf` | honours `pdfStandard` / `pdfTags` |
| `svg` | `image/svg+xml` | whole document as one SVG, pages stacked |
| `pages` | JSON | one **standalone** SVG per page — see below |
| `html` | `text/html` | compiles on the `html` target |
| `vector` | `application/octet-stream` | Typst vector IR |

Every response carries:

```
X-Glyph-Ms: 0.71          compile + export time inside the worker
X-Glyph-Pages: 2
X-Glyph-Cache: miss       miss | hit | coalesced
X-Glyph-Errors: 0
X-Glyph-Warnings: 0
```

If the document produces nothing renderable the service answers **422** with
structured diagnostics instead of an artifact — the caller keeps whatever it was
already showing, which is how the editor preserves its last good preview:

```json
{
  "error": "compile_failed",
  "diagnostics": [
    {
      "severity": "error",
      "message": "unknown variable: no-such-fn",
      "hints": ["if you meant to use subtraction, try adding spaces around the minus signs: `no - such - fn`"],
      "file": "/main.typ"
    }
  ]
}
```

Warnings ride along on successful responses, so a share page can surface them
without a second call.

### `POST /v1/query`

Introspection on a compiled document — the outline panel is
`selector: "heading"`:

```jsonc
{ "files": { "/main.typ": "= One\n== One A\n" }, "selector": "heading", "field": "level" }
// → { "result": [1, 2], "diagnostics": [], "ms": 0.2 }
```

### `GET /v1/fonts`

The font files the engine resolves, so a client can tell a user which families
are available.

## Architecture

```
HTTP  ──►  cache (byte-budget LRU)  ──►  in-flight coalescing  ──►  worker pool
                                                                      │
                                                          one warm NodeCompiler
                                                          per worker thread
```

**Worker pool.** Typst compiles synchronously and burns CPU, so a worker thread
is the unit of parallelism — the main thread stays free to serve HTTP. Jobs go
round-robin to idle workers and queue FIFO when all are busy. A worker that
crashes or wedges in native code is terminated and replaced; a native compile
that never returns cannot be interrupted, so respawning is the only recovery.

**Per-request isolation.** The engine's virtual file system is populated with
`mapShadow` for the duration of one request and torn down with `resetShadow`.
Two requests can never see each other's sources, and nothing accumulates across
requests (a 200-cycle run holds steady at ~94 MB RSS).

**One workspace root.** The engine refuses to compile an entry outside its
workspace, and resolves both `import "x.typ"` and `import "/x.typ"` against it.
Every request path is therefore mapped beneath `/glyph`, and paths are validated
in the main thread before dispatch — a malformed request never costs a worker
round trip.

**Cache.** A byte-budgeted LRU in front of the pool, keyed by a SHA-256 of
everything that can change the output (sources, assets, entry, format, PDF
options, inputs). Identical in-flight requests are coalesced into one compile.
The engine's own memo cache is evicted periodically to keep it bounded.

**Page splitting.** `typst.ts` renders a whole document as a single SVG: shared
`<style>`/`<defs>` first, then one `<g class="typst-page">` per page. `format:
"pages"` lifts the shared prefix out once and re-roots each page in its own
`<svg>` with the page's viewBox, normalising the vertical `translate` back to the
origin. Each page stands alone (it carries the shared glyph definitions), which
is what makes per-page thumbnails and share previews trivial.

## Performance

Measured on a 2-core Codespace with the vendored font set (`npm run bench`):

```
cold warm-up: 24 ms                      fonts parsed, native module loaded

small (1 page)  -> pdf       mean 0.71 ms   p95 0.80 ms
small (1 page)  -> svg       mean 0.84 ms   p95 1.18 ms
small (1 page)  -> pages     mean 0.84 ms   p95 1.01 ms
large (40 sections, 9 pages) -> pdf   mean 7.93 ms   p95 9.15 ms
large (40 sections, 9 pages) -> svg   mean 31.82 ms  p95 44.24 ms

cache hit  (HTTP round trip)  mean 1.40 ms   p95 3.40 ms
cache miss (HTTP round trip)  mean 3.12 ms   p95 4.85 ms

concurrency  1:   1036 req/s
concurrency 16:   1421 req/s
```

Two things dominate the numbers: the engine's per-compile cost (sub-millisecond
for a page, ~8 ms for nine pages) and, above that, the HTTP round trip — which is
why the cache sits in front of the pool rather than behind it.

## Configuration

Every knob is an environment variable.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | listen port |
| `HOST` | `0.0.0.0` | listen address |
| `GLYPH_RENDER_WORKERS` | `availableParallelism()`, max 4 | compile worker threads |
| `GLYPH_FONTS_DIR` | `server/fonts` | font directory scanned at compiler construction |
| `GLYPH_CACHE_BYTES` | `201326592` (192 MB) | render cache budget |
| `GLYPH_CACHE_ENTRIES` | `1024` | render cache entry cap |
| `GLYPH_MAX_BODY_BYTES` | `8388608` (8 MB) | request body limit |
| `GLYPH_MAX_FILES` | `512` | files per request |
| `GLYPH_MAX_SOURCE_BYTES` | `4194304` (4 MB) | total source bytes per request |
| `GLYPH_REQUEST_TIMEOUT_MS` | `30000` | per-render timeout before the worker is recycled |
| `GLYPH_EVICT_EVERY` | `256` | evict the engine memo cache every N compiles (`0` disables) |
| `GLYPH_CORS` | `*` | `Access-Control-Allow-Origin` |
| `GLYPH_LOG` | `info` | `silent` \| `info` \| `debug` |

## Fonts

The service ships Libertinus Serif, Libertinus Math, New Computer Modern Math,
and DejaVu Sans Mono — the same families the browser engine bundles, so a
server export matches the editor's preview. See [`fonts/NOTICE.md`](./fonts/NOTICE.md)
for versions and licenses.

## Known limitations

- **Diagnostics have no positions.** `typst.ts` 0.7.0 reports `range: null` for
  every diagnostic and folds hints into the message text. The editor's squiggles
  therefore come from the browser engine (`typst-ide`), which does produce
  ranges; the server's diagnostics are message-level and used for exports and
  share pages.
- **No raster output.** The Node compiler exports PDF, SVG, HTML, and vector IR,
  but no PNG — rasterising needs a canvas backend. `format: "pages"` returns SVG
  per page, which is what thumbnails actually want (crisp at any size, and a
  fraction of the bytes).
- **`pages` duplicates glyph definitions.** Each standalone page carries the
  shared `<defs>`. For a very long document prefer `format: "svg"` (one copy) and
  crop client-side, or request only the pages you need.
- **`typst.ts` is at 0.7.0.** `0.8.0-rc3` exists on the `rc` dist-tag but is not
  used here; the native node compiler tracks the same version.

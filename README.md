# glyph

A clean-room clone of the Typst web app. The editor comes first, and it has to
actually work — compile and live preview, not a mock.

Nothing here is copied from `typst.app`: no source, no CSS, no assets, no copy.
The behaviour is reconstructed from public documentation, the open-source Typst
toolchain, and a reverse-engineering pass over the real app that is kept as
evidence (see [`typst-app-auth/FINDINGS.md`](./typst-app-auth/FINDINGS.md)).

## What's built

**A working editor and a working render service, split across two Typst engines.**

| | [`glyph/`](./glyph) | [`server/`](./server) |
| --- | --- | --- |
| What | the editor — CodeMirror 6, live vector preview, bidirectional navigation | the render service — exports, share previews, thumbnails, introspection |
| Engine | `@vedivad/typst-web-service` (wasm, Web Worker) | `@myriaddreamin/typst-ts-node-compiler` (native, napi) |
| Why | instant feedback, works offline, zero server cost while typing | artifacts that must not depend on a visitor's machine |

Both halves are Typst, so both produce the same document. The split is about
*where the work happens*, not about two renderers that disagree. The editor is
fully functional with the service stopped.

## Run it

```bash
# terminal 1 — the render service
cd server
npm install
npm run dev          # http://localhost:8787

# terminal 2 — the editor
cd glyph
npm install
npm run dev          # http://localhost:5173
```

Open <http://localhost:5173>. Type; the preview recompiles as you go. Click a page
to jump to its source, or let the preview follow your cursor. **Export ▾** offers
a browser PDF (instant) alongside server PDF/SVG/HTML/vector, and **Share
preview** shows the pages a share link would serve.

## Verify it

```bash
cd server && npm test        # 23 tests: engine, cache, paths, SVG splitting, HTTP
cd glyph  && npm run build   # typecheck + production build
```

Both packages also expose `npm run typecheck`.

## Layout

```
glyph/            the editor (React 19 + Vite 7 + CodeMirror 6)
server/           the render service (typst.ts native, worker pool + cache)
plan.md           the full build plan: architecture, data model, API contracts,
                  milestones, and the RE evidence each decision rests on
typst-app-auth/   reverse-engineering artifacts (findings + exported API spec)
```

## Status

- **M1 — the compiler core: done.** Live compilation, syntax highlighting,
  completion, hover, formatting, diagnostics with squiggles, click-to-source, and
  follow-cursor, verified headlessly in both `vite dev` and the production build.
- **Server render service: done.** Native Typst with a warm worker pool, a
  byte-budgeted render cache, in-flight coalescing, per-page SVG splitting, and a
  query API. 0.7 ms warm for a one-page PDF; ~1400 req/s at concurrency 16.
- **Next:** M2 — auth, accounts, and the dashboard. See
  [`plan.md`](./plan.md) §14 for the milestone list.

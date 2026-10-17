# glyph

A clean-room clone of the Typst web app. The editor comes first, and it has to
actually work — compile and live preview, not a mock.

Nothing here is copied from `typst.app`: no source, no CSS, no assets, no copy.
The behaviour is reconstructed from public documentation, the open-source Typst
toolchain, and a reverse-engineering pass over the real app that is kept as
evidence (see [`typst-app-auth/FINDINGS.md`](./typst-app-auth/FINDINGS.md)).

## What's built

**A working editor and a working render service.** The editor compiles in the
browser for instant feedback; the render service produces artifacts that must not
depend on a visitor's machine. Both run the same Typst compiler (see
[Engines](#engines)), so the split is about *where* the work happens, not about
two renderers that disagree. The editor is fully functional with the service
stopped.

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

The editor is a real multi-file workspace: a file tree with folders, tabs, a
project-wide search and replace, an outline, an issues panel, a command palette
and a full keyboard shortcut set (`⇧⌘/` lists them). `#import` and `#include`
resolve across files, and the whole workspace is saved to `localStorage`.

## Verify it

```bash
cd server && npm test        # 48 tests: engine, cache, paths, SVG splitting, shares, projects, HTTP
cd glyph  && npm test        # 83 unit tests: paths, tree, outline, search, ZIP, base64, zoom, formats, settings
cd glyph  && npm run build   # typecheck + production build
```

From the repository root, `npm test` and `npm run typecheck` run both packages.

The editor's pure modules — paths, the file tree, the outline scan, project-wide
search and replace, the ZIP writer, base64 and zoom maths — have committed Vitest
suites (`glyph/src/**/*.test.ts`). Everything runs in CI
([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)). Browser end-to-end
coverage (click-to-source, offline degradation, multi-file imports through the
wasm worker) is **not** committed yet; it is the next verification step.

## Engines

Both halves are the same compiler in two compilation targets, so they must agree
on the Typst version. That version is recorded once in
[`engine.json`](./engine.json) — currently **Typst 0.14.2** — and a test asserts
the running engine agrees, so a dependency bump cannot silently change the pages
a reader sees.

| | [`glyph/`](./glyph) | [`server/`](./server) |
| --- | --- | --- |
| What | the editor — CodeMirror 6, live vector preview, bidirectional navigation | the render service — exports, share previews, thumbnails, introspection |
| Engine | `@vedivad/typst-web-service` 0.18.8 (wasm, Web Worker) | `@myriaddreamin/typst-ts-node-compiler` 0.7.0 (native, napi) |
| Typst | 0.14.2 | 0.14.2 |
| Why | instant feedback, works offline, zero server cost while typing | artifacts that must not depend on a visitor's machine |

## Layout

```
glyph/            the editor (React 19 + Vite 7 + CodeMirror 6)
server/           the render service (typst.ts native, worker pool + cache)
engine.json       the Typst version both halves are pinned to
plan.md           the full build plan: architecture, data model, API contracts,
                  milestones, and the RE evidence each decision rests on
plan2.md          the grounded continuation: verified status, the engine ruling,
                  and a prioritized gap list
typst-app-auth/   reverse-engineering artifacts (findings + exported API spec)
```

## Status

- **M1 — the compiler core: done.** Live compilation, syntax highlighting,
  completion, hover, formatting, diagnostics with squiggles, click-to-source, and
  follow-cursor.
- **Editor feature set: done.** Multi-file workspace (folders, tabs, drag-to-move,
  rename cascade, upload), project-wide search and replace, lexical outline,
  issues panel, settings, command palette, context menus, keyboard shortcuts,
  ZIP export and `localStorage` persistence.
- **Server render service: done.** Native Typst with a warm worker pool, a
  byte-budgeted render cache, in-flight coalescing, per-page SVG splitting, and a
  query API. 0.7 ms warm for a one-page PDF; ~1400 req/s at concurrency 16.
- **Verification: started.** 83 editor unit tests and 48 server tests, committed
  and run in CI. Browser end-to-end tests are still to come.
- **Next:** the server-side product surface — accounts, a dashboard, projects and
  share links. See [`plan2.md`](./plan2.md) for the prioritized list.

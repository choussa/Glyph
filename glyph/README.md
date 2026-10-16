# glyph — editor

The working core of the glyph Typst clone: a real Typst engine in the browser
with live vector preview, bidirectional editor↔preview navigation, and a
server-side render service for the artifacts that must outlive the session.

The rendering is **split** — both halves are Typst, they just do different jobs.

| | Browser | Server (`server/`) |
| --- | --- | --- |
| Engine | [`@vedivad/typst-web-service`](https://www.npmjs.com/package/@vedivad/typst-web-service) — wasm, in a Web Worker | [`@myriaddreamin/typst-ts-node-compiler`](https://www.npmjs.com/package/@myriaddreamin/typst-ts-node-compiler) — native (napi) |
| Job | live preview, highlighting, completion, hover, diagnostics, click-to-source | exports, share-link previews, thumbnails, introspection |
| Latency | ~2 ms per edit, no network | 0.7 ms warm compile, 1.4 ms cached round trip |

The browser engine owns everything the user sees while typing. The server exists
for what a share link or a thumbnail needs: a render that does not depend on any
visitor's machine. **The editor works fully without the server** — server-backed
actions are additive, not load-bearing.

## Editor

- **Engine** — one Typst engine (compiler + `typst-ide` + `typst-syntax` +
  `typstyle`) compiled to WebAssembly, in a Web Worker. It bundles Typst's
  default fonts (Libertinus Serif, New Computer Modern Math, DejaVu Sans Mono),
  so documents render out of the box.
- **Editor** — CodeMirror 6. Highlighting, completion, hover, diagnostics and
  formatting all come from that one engine — there is no second grammar to drift
  from the parser.
- **Preview** — the engine renders pages to SVG on demand, and a
  `PreviewNavigator` maps clicks on the laid-out page back to source locations.

## Bidirectional features

| Direction | What it does |
|---|---|
| **Preview → source** | Click any text in the preview and the editor jumps to that source location (`clickJump`). |
| **Source → preview** | Move the cursor and the preview scrolls to where it renders (`jumpFromCursor`) — toggle with **Follow cursor**. |
| Engine → editor | `completion`, `hover`, `highlight`, `format` (Shift-Alt-F), and compile diagnostics with squiggles and gutter markers. |
| Editor → engine | Every edit is mirrored into the project's virtual file system, which auto-schedules a debounced compile. |

## Server integration

- **Export ▾** — *PDF* renders in the browser (instant, works offline); *PDF*,
  *SVG*, *HTML* and *Vector IR* render on the server. Each server export reports
  its own timing and cache status.
- **Share preview** — renders the current document through the service and shows
  exactly the pages a share link would serve, with the server's timing. It doubles
  as a parity check against the local preview.
- **Server indicator** — the toolbar pill shows the engine version and worker
  count, and turns red when the service is unreachable.

Vite proxies `/api` to `http://localhost:8787` in development, so the client is
same-origin and needs no CORS setup. In production, set `VITE_RENDER_URL` at
build time to the deployed service.

## Run

```bash
# terminal 1 — the render service
cd server && npm install && npm run dev     # http://localhost:8787

# terminal 2 — the editor
npm install
npm run dev                                 # http://localhost:5173
npm run build                               # typecheck + production build
```

## Layout

```
src/
├─ render/
│  ├─ client.ts           # typed client for the render service
│  ├─ useRenderServer.ts  # health polling for the toolbar indicator
│  └─ ServerPreview.tsx   # share-link preview (server-rendered pages)
├─ typst/
│  ├─ config.ts       # the project file path
│  ├─ highlight.ts    # engine highlight spans -> CodeMirror decorations
│  ├─ diagnostics.ts  # compile diagnostics -> lint squiggles
│  ├─ completion.ts   # typst-ide completions -> CodeMirror autocomplete
│  ├─ hover.ts        # typst-ide tooltips -> CodeMirror hover
│  └─ format.ts       # typstyle -> Shift-Alt-F / toolbar button
├─ Editor.tsx         # CodeMirror 6 setup + theme compartment
├─ Preview.tsx        # SVG pages + PreviewNavigator (click-to-source)
├─ App.tsx            # engine lifecycle, compile status, toolbar, export menu
└─ styles.css         # chrome + the `typ-*` token palette
```

## Gotchas baked in

- **Do not pre-bundle the engine.** It spawns its worker with
  `new Worker(new URL('./typsten-worker.js', import.meta.url))` and fetches its
  wasm with `new URL('./typsten_bg.wasm', import.meta.url)`. Vite's dependency
  optimizer rewrites those into a dead `.vite/deps/…?worker_file` URL, so
  `optimizeDeps.exclude` must list `@vedivad/typst-web-service`.
- **Diagnostic paths lose their leading slash.** The engine reports `main.typ`
  while the VFS keys files as `/main.typ`; compare with `normalizePath`.
- **Byte offsets, not UTF-16.** Diagnostics carry UTF-8 byte offsets; convert
  with `byteToCmOffset` before placing a squiggle.
- **`jumpFromCursor` legitimately returns nothing** for cursors inside `#set`
  rules, on blank lines, or in code that renders nothing — don't treat null as
  an error.
- Highlight spans may nest (a `typ-strong` run containing a `typ-func` leaf), so
  build the decoration set with `Decoration.set(ranges, true)`.
- **The document text lives in a ref, not state.** Mirroring every keystroke into
  React state would re-render the whole app on each keypress; `docRef` keeps the
  server actions fed without that cost.
- **The two engines round the page box differently** (A4 is 595.28 pt: the
  browser reports 595, the server 596). Page geometry comparisons need a
  tolerance of a point; the rendered content is identical.

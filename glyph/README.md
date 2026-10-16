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
- **Multi-file editing** — one CodeMirror `EditorView` with a cached
  `EditorState` per open file, so switching tabs is instant and keeps each file's
  undo history and cursor. Rename, create, delete and drag-to-move all cascade
  through the tree; the engine's virtual file system is kept in step, so
  `#import` / `#include` resolve across files.
- **Highlighting, completion, hover, diagnostics, formatting** all come from that
  one engine — there is no second grammar to drift from the parser.
- **Preview** — the engine renders pages to SVG on demand; a `PreviewNavigator`
  maps clicks on the laid-out page back to source locations.
- **Persistence** — the workspace and preferences are saved to `localStorage` and
  restored on reload.

### Panels

| Panel | Shortcut | What it does |
| --- | --- | --- |
| Files | `⌥1` | Tree with folders, inline rename/create, upload, drag-to-move, per-file context menus, filter box, download-project |
| Search | `⌥2` | Project-wide search and replace with case / regex / whole-word toggles and `$1` group refs |
| Outline | `⌥3` | Lexical heading scan; click a heading to jump to it |
| Issues | `⌥4` | Compile diagnostics with locations; click to jump |
| Settings | `⌥5` | Theme, font, tab size, soft wrap, zoom, follow-cursor, split |

Search and outline are lexical scans, not engine calls, so they stay instant while
typing and still work if the engine is cold.

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
- **Server indicator** — the status-bar pill shows the engine version and worker
  count in its tooltip, and turns red when the service is unreachable.

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

## Shortcuts

Everything is reachable from the keyboard; `⇧⌘/` shows this list in the app.

| Files | | Navigate | |
|---|---|---|---|
| New file | `⌘N` | Command palette | `⌘K` |
| New folder | `⌥⌘N` | Go to file | `⌘P` |
| Upload files | `⌘O` | Search project | `⌘F` |
| Rename active file | `F2` | Search and replace | `⌥⌘F` |
| Close active tab | `⌥W` | Go to line | `⌘G` |
| Save workspace | `⌘S` | Switch side panel | `⌥1`…`⌥5` |
| | | Toggle side panel | `⌥\` |

| Format | | View | |
|---|---|---|---|
| Strong | `⌘B` | Zoom in | `⌘+` |
| Emphasis | `⌘I` | Zoom out | `⌘−` |
| Underline | `⌘U` | Fit page | `⌘0` |
| Raw inline | `⌘E` | Fit width | `⇧⌘0` |
| Equation | `⌘M` | Show shortcut list | `⇧⌘/` |
| Comment | `⌘/` | | |
| Format document | `⇧⌥F` | | |

`⌥W` closes a tab rather than `⌘W` because Chrome refuses to let a page intercept
`⌘W`.

## Layout

```
src/
├─ render/
│  ├─ client.ts           # typed client for the render service
│  ├─ useRenderServer.ts  # health polling for the status pill
│  └─ ServerPreview.tsx   # share-link preview (server-rendered pages)
├─ typst/
│  ├─ config.ts       # the entry file path
│  ├─ highlight.ts    # engine highlight spans -> CodeMirror decorations
│  ├─ diagnostics.ts  # compile diagnostics -> lint squiggles
│  ├─ completion.ts   # typst-ide completions -> CodeMirror autocomplete
│  ├─ hover.ts        # typst-ide tooltips -> CodeMirror hover
│  └─ format.ts       # typstyle -> Shift-Alt-F / toolbar button
├─ workspace/
│  ├─ model.ts         # paths, tree building, outline scan, search/replace
│  ├─ useWorkspace.ts  # the Workspace store + engine-op queue
│  └─ zip.ts           # uncompressed ZIP writer for project download
├─ editor/
│  ├─ insert.ts        # toolbar actions (strong, emphasis, headings, …)
│  └─ cursorStore.ts   # selection store, isolated from app re-renders
├─ panels/            # Files · Search · Outline · Issues · Settings
├─ preview/zoom.ts    # zoom modes and scale maths
├─ ui/                # icons, menus, splitter, tabs, palette, dialogs, status bar
├─ Editor.tsx         # multi-file CodeMirror host + compartments
├─ Preview.tsx        # SVG pages + click-to-source
├─ App.tsx            # engine lifecycle, layout, shortcuts, commands
├─ settings.ts        # persisted preferences
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
- **`clickJump` only resolves inside a text run's box**, and lines sit ~21 pt
  apart with only ~11 pt of ink — a click in the leading resolves nothing. The
  navigator is created with `listen: false` and the host probes outward from the
  click (±3, ±6, … pt) so a near-miss still reaches the nearest line.
- **`jumpFromCursor` legitimately returns nothing** for cursors inside `#set`
  rules, on blank lines, or in code that renders nothing — don't treat null as
  an error.
- **`EditorView.setState` does not run update listeners**, so the multi-file host
  re-emits selection and cursor itself after a tab swap.
- **Dispatching inside a CodeMirror update throws.** Diagnostics are flushed one
  microtask late (`queueMicrotask`) and re-applied to the active file after a
  tab swap.
- **Keystrokes must not re-render the app.** File contents live in the workspace
  store; the selection lives in a separate store that only the status bar,
  outline and search panels subscribe to.
- Highlight spans may nest (a `typ-strong` run containing a `typ-func` leaf), so
  build the decoration set with `Decoration.set(ranges, true)`.
- **The two engines round the page box differently** (A4 is 595.28 pt: the
  browser reports 595, the server 596). Page geometry comparisons need a
  tolerance of a point; the rendered content is identical.

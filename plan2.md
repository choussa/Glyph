# `glyph` — plan2: from "working editor" to "working product"

> This is the **correction and continuation** of [`plan.md`](./plan.md).
> `plan.md` is the aspirational build plan (monorepo, API, teams, billing).
> `plan2.md` is grounded in **what is actually in the repository today**, what is
> missing, the one architectural decision that needs a ruling (two Typst engines),
> and a prioritized list of what to build next.
>
> Read this top to bottom once; it is ordered so each phase is shippable on its
> own. Nothing here invalidates `plan.md` — it re-sequences it against reality.

---

## 0. Status snapshot (verified against the code, not the README)

| Area | Reality | Evidence |
|---|---|---|
| Editor | **Real and substantial.** Multi-file workspace, tabs with per-file undo, file tree with folders/rename/drag/upload, search+replace, outline, issues, settings, palette, shortcuts, ZIP export, `localStorage` persistence. ~10 000 LOC. | `glyph/src/**` |
| Browser engine | `@vedivad/typst-web-service` in a Web Worker: compile, `typst-ide` (completion/hover), `typst-syntax` (highlight), `typstyle` (format), PDF export, per-page SVG, bidirectional click/scroll. | `glyph/src/typst/*`, `glyph/src/Preview.tsx` |
| Render service | **Real.** `server/` — native `typst-ts-node-compiler` 0.7.0, worker pool, byte-LRU cache, in-flight coalescing, per-page SVG split, query API. 4 routes. 23 tests. | `server/src/*`, `server/test/render.test.ts` |
| Auth / accounts / dashboard | **Does not exist.** No router, no login, no server persistence. | no `apps/`, no api |
| Database / blobs / Redis | **Does not exist.** No `infra/`, no Prisma schema, no docker-compose. | repo root |
| Realtime / comments / sharing | **Does not exist.** No WS server, no Yjs, no share tokens. | — |
| Monorepo | **Does not exist.** Two independent npm projects (`glyph/`, `server/`), separate lockfiles. | `glyph/package.json`, `server/package.json` |
| CI | **Does not exist.** No `.github/`, no workflow. | — |
| Editor tests | **Do not exist.** README claims 39 UI + 28 workspace + 13 server-split + 5 offline Playwright checks; none are in the repo. | `find` finds only `server/test/render.test.ts` |

**One-line verdict:** M1 (compiler core) and the editor feature set are genuinely
built and good. Everything from `plan.md` §14 M0 and M2 onward is unbuilt, and the
README's verification claims are not reproducible.

---

## 1. The engine question: is combining `@vedivad/typst-web-service` + `typst.ts` good?

**Short answer: yes — it is the right split, and it is better than it looks,
because the two "engines" are the same engine.** Keep it. But it has two
correctness/coupling risks that plan2 fixes.

### 1.1 Why it is a good combination

- **They are the same compiler, compiled twice.** `@vedivad/typst-web-service`
  (MIT) is a wrapper: it bundles a `@myriaddreamin/typst.ts` WebAssembly build
  (`typst-ts-web-compiler`) plus `typst-ide` / `typst-syntax` / `typstyle` into a
  worker (comlink) and adds a VFS, auto-compile, font bundling and a
  `PreviewNavigator`. `server/` uses `@myriaddreamin/typst-ts-node-compiler`, the
  native napi build of the same project. So "two engines" is really **one Typst
  compiler in two compilation targets** — the split is about *where the work
  happens*, exactly as `README.md` claims.
- **Parity is structural, not coincidental.** Same language semantics, same
  bundled font families (Libertinus Serif/Math, New Computer Modern Math, DejaVu
  Sans Mono), therefore the same layout. The only known difference is page-box
  rounding (A4 595.28 pt → 595 browser / 596 server), already documented.
- **The split buys the right things.** Browser = ~2 ms per edit, offline, zero
  server cost on the interactive path. Server = artifacts that must not depend on
  a visitor's machine (share pages, thumbnails, exports). That is precisely
  typst.app's own rationale (their WASM compiler is client-side too).
- **Licensing is clean-room safe**: MIT wrapper, Apache-2.0 engine, OFL fonts.

### 1.2 Why the combination is *currently* risky

1. **Version skew across the two halves.**
   - Browser: `@vedivad/typst-web-service` `0.18.8` (its own version number;
     internally pinned to `@myriaddreamin/typst.ts` `^0.7.0-rc2` — a *range*).
   - Server: `@myriaddreamin/typst-ts-node-compiler` **`0.7.0` exactly**.
   - Nothing guarantees the two compile the same Typst version. A patch release
     of the wrapper can silently move the browser compiler.
2. **No per-project compiler pinning.** typst.app ships **12 builds (0.10–0.15.1)**
   and lets a project pin one (`Project.pinnedVersion`, `plan.md` §1/§5). Neither
   package exposes that; the wrapper hides its wasm version entirely. Documents
   using recent Typst syntax may not compile at all.
3. **Feature asymmetry undermines the "one document" claim.**
   - Browser engine: PDF + per-page SVG only. **No PNG, no HTML, no query.** So
     `plan.md` §9's "PNG/SVG/HTML via the same render path" (browser) is false.
   - Server engine: PDF/SVG/HTML/vector/query, but **diagnostics have no ranges**
     (`range: null` in 0.7.0), so squiggles exist only in the browser.
   - Net effect: what a user sees while typing is *not byte-identical* to what a
     share link or export produces. Acceptable, but must be tested and stated.
4. **Third-party coupling on the critical path.** The wrapper is a single-maintainer
   package; the codebase has already worked around two of its quirks
   (`optimizeDeps.exclude`, `clickJump` probing, `EditorView.setState`). And its
   sibling `@vedivad/codemirror-typst` is **not installable** (published dep on
   `workspace:^`), which is why the CodeMirror glue here is hand-written.

### 1.3 The ruling (Decision record D1)

> **Keep both engines. Do not rewrite the browser engine.**
> Introduce `packages/typst-runtime` as the *single* façade over the browser
> engine, pin *both* halves to the *same* typst.ts minor, ship the fonts and the
> wasm from one place, and add a **cross-engine parity test** that is the
> contract between them. Treat the wrapper as swappable behind that façade.

Concretely:

- `packages/typst-runtime` exports the `TypstProject` façade the app already uses,
  the font set, the entry/`MAIN_PATH` constant, and the `byteToCmOffset` helpers.
  Both `apps/web` and `apps/render` depend on it.
- Record the engine version in one place: `packages/typst-runtime/engine.json`
  (`{ "typstTs": "0.7.0", "wrapper": "0.18.8" }`), asserted at boot and shown in
  About.
- **Parity test (blocking):** compile a fixture with both engines and assert
  equal page count, page boxes within 1 pt, and identical extracted text (via the
  server `query` API and a browser-side equivalent). If it fails, the build fails.
- **Follow-up option (deferred, not now):** if per-project compiler pinning
  becomes a requirement, drop to `@myriaddreamin/typst.ts` + `typst-ts-web-compiler`
  directly inside `typst-runtime` — the façade is what makes that a contained
  change.

### 1.4 What the REA bundle actually proves (the reference architecture)

The bundle (`typst-app-auth/export/bundle/index-PUyMOzys.js`) is more informative
than `FINDINGS.md` about the engine. It shows the real app's own `Core` wrapper
over **typst.ts**, and it settles several architectural questions.

**Compiler registry (this is the biggest architectural fact):**

```js
LATEST_COMPILER_VERSION = "0.15.1"
URLS = {
  dev:    { wasmUrl: "/assets/core_bg-By6UHrTV.wasm", worker: () => new Worker("/assets/worker-CodvREV8.js") },
  "0.15.1": { wasmUrl: "/assets/core_bg-w9ivCOeS.wasm", worker: … },
  "0.15.0": …, "0.14.2": …, "0.14.1": …, "0.14.0": …,
  "0.13.1": …, "0.13.0": …, "0.12.0": …,
  "0.11.1": …, "0.11.0": …, "0.10.0": …
}
COMPILER_VERSIONS = Object.keys(URLS)
```

So typst.app ships **11 released compiler builds + a dev build**, each a
`core_bg-*.wasm` + `worker-*.js` pair, and pins one **per project**
(`pinnedVersion: "0.15.1"` in `ProjectFiles`) with a `CompilerVersionModal` and
a "change the compiler version in the project settings" flow. Playgrounds keep
`compilerVersion` in `localStorage` (`playground-settings`).

**Engine protocol (their `Core` class):**

| Kind | Names |
|---|---|
| Commands | `archive, autocomplete, clear, configureSpellCheck, create, definition, delete, edit, eval, export, highlight, jumpFromClick, jumpFromCursor, move, references, render, setFeatures, setMain, setProjectId, setRemoteFonts, setRemotePackages, setTarget, startProfiling, stopProfiling, tags, tooltip` |
| Notifications | `diagnostics, outline, pages, status` |
| Asks (callbacks into app code) | `font(file)`, `package(namespace, name, version)`, `spellcheck(word, lang, region)` |

Consequences for glyph:

- **Outline and pages are engine *notifications*, not poll results.** glyph
  derives the outline lexically and reads pages from the compile result; the
  reference engine emits both, so its outline is semantic (numbering, nesting).
- **Definition / references / tags / eval / archive / spellcheck are engine
  features** the current wrapper does not expose.
- **`setTarget("paged"|"html")` and `setFeatures(...)`** are first-class: HTML is
  a *target*, not just an export format.
- **`setRemoteFonts` / `setRemotePackages`** are how fonts and `@local`/private
  packages enter the engine — i.e. ask-callbacks, not a VFS hack.
- **7 workers** spawn from `worker-fecRb9ao.js` on editor load (capture 04,
  `worker-created` ×7). glyph boots exactly one worker.

**Other REA facts that change the plan:**

| Fact | Evidence | Consequence |
|---|---|---|
| Share links are **`/project/<shareToken>`**, not a separate route | bundle: `CONFIG.APP_URL + '/project/' + shareLinkReadOnly` | `plan2.md` Phase 3 must not invent `/share/:token` |
| Share links open the **real editor** (same engine), not a static page | bundle share components + `EditorSparkplug` route | server pages are for OG/thumbnail, not the share UX |
| `previewed` is a **file id string**, not a boolean | `"previewed":"f9gz…"` in `ProjectFiles` response | Prisma `previewed Boolean` is wrong |
| `settings` are **JSON strings** (`"{}"`) on both User and Project | GraphQL responses | `settings Json` in `plan.md` should be `String` |
| Comments carry **`from` / `to` integers** + `content`, `resolved`, `replies` | `CoreCommentFields` | no opaque `anchor Json`; ranges are top-level |
| `thumbnail` is `{ id, url }`; upload is **client → `POST /v1/projects/:id/thumb/:hash`** | bundle + console warning "Failed to upload thumbnail… invalid" | support the upload contract; server rendering is a fallback |
| REST sends `X-Typst-Preflight` and `X-Typst-Client-Id`; WS takes `?clientId=` (8 chars) | bundle `RestClient` | add the headers; keep the query param |
| Yjs persistence names DBs **`${projectId}/${fileId}`** (`updates` store) + **`${projectId}/${fileId}/fetch`** (`etag`/`buffer`) | bundle `IndexeddbPersistence` | offline cache contract is per-file, with an HTTP blob cache |
| Settings have **four scopes**: global, local-editor, cloud-user, cloud-project | bundle `GLOBAL_SETTINGS`, `LOCAL_EDITOR_SETTINGS`, `CLOUD_EDITOR_SETTINGS`, `CLOUD_PROJECT_SETTINGS` | one `settings` blob is not enough; define all four now |
| Entitlements are a **map of feature names/policies** (`presentation-mode`, `dashboard-folders`, `create-comments`, `vcs-sync`, `publish-packages`, `project-email-invites`, `speaker-notes`, …), `PRO_FEATURES` = 6 of them | bundle `FEATURES`, `PRO_FEATURES` | copy the names; `plan.md` invented some |
| File formats are a **declared table** with `acceptance: multiplayable \| blob \| forbidden` and `conversionName` (markdown/latex) | bundle `fileFormats` | upload validation and magic files should be data-driven |
| Themes are `light \| dark \| system \| start23 \| tub \| ubuntu \| christmas` | bundle `THEME` | `glyph.theme: 'light' \| 'dark'` is a subset |
| Engine export settings live **per project**: `{ pageRanges, pretty, pdf: { version, standard[], tagged }, png: { ppi } }` | `CLOUD_PROJECT_SETTINGS` | the server render API needs the same options |
| Dashboard settings: `{ viewMode: grid\|table, order: { policy: alphabetical\|last-modified\|last-created, reverse } }` | `DASHBOARD_SETTINGS` | mirrors the dashboard to build |
| Real app has a **service worker** + web manifest | `assets/serviceWorker-So4VqnvC.js` | offline shell is part of the target |

**Verdict on the reference architecture:** typst.app is **one client-side
compiler** (typst.ts, version-registered) with GraphQL/REST/WS around it. glyph's
addition of a native server renderer is **not parity — it is an extra**. That is
fine and valuable for durable artifacts, but it must never become the source of
truth for what the user sees, and it must be parity-tested (D1). Conversely,
glyph is currently missing the parts that make the reference architecture work
well: the **version registry**, the **engine event surface**, the **worker pool**,
and the **four settings scopes**.

---

## 2. Missing: the full gap list

### 2.1 Correctness bugs in what exists (fix first, cheap)

| ID | Bug | Where | Impact |
|---|---|---|---|
| **B1** | `Workspace.bundle()` returns **only text files** — binary assets are dropped. | `glyph/src/workspace/useWorkspace.ts:207` | Any server export / share preview of a document with an image renders **without the image**, silently. The server's `assets` field is never populated by the client. |
| **B2** | Undo/redo use `document.execCommand('undo')`. | `glyph/src/App.tsx:759`–`766` | Deprecated, unreliable, and bypasses CodeMirror's own history; menu undo can desync from the editor. Should call CM6 `undo`/`redo` commands against `viewRef`. |
| **B3** | `ServerPreview` receives `diagnostics` but never shows them. | `glyph/src/render/ServerPreview.tsx` | A failed/partial server render shows pages with no explanation; `X-Glyph-Errors/Warnings` are unused. |
| **B4** | Browser `exportPdf()` result is not checked for the "no pages" case, and there is no PNG/HTML in the browser despite the menu implying parity with the server. | `App.tsx` export handlers | User-visible inconsistency between "PDF (browser)" and "PDF (server)". |
| **B5** | `settings.previewPopup` opens a second `Preview` bound to the same `navRef` as the pane. | `Preview.tsx` / `App.tsx` | Two previews race on one navigator ref; the last mounted wins, breaking click-to-source in the other. |
| **B6** | Claims not backed by the repo: `README.md` cites "39 UI + 28 workspace + 13 server-split + 5 offline" Playwright checks that are **not committed**; `plan.md` is stale ("pdf.js preview" §14 M1, "browser PNG/SVG/HTML via the same render path" §9 — the wrapper exports PDF only, plus per-page SVG). | `README.md`, `plan.md` | Erodes trust; makes "done" unverifiable. |

### 2.2 Missing verification (highest-leverage gap)

The only executable test in the repo is `server/test/render.test.ts` (23 tests).
There is **no test for a single line of `glyph/`**. Because the editor's whole
design (byte offsets, `setState` semantics, `queueMicrotask` lint flush, navigator
probing) exists to work around engine quirks, it is exactly the code that will
silently rot on an engine bump. Required:

- **Vitest unit** (pure, fast): `workspace/model.ts` (paths, tree, outline scan,
  search/replace incl. regex `$1`, whole-word), `workspace/zip.ts` (CRC + layout),
  `preview/zoom.ts`, `editor/insert.ts` (via a headless CM view), the offset
  converters in `typst/diagnostics.ts` and `highlight.ts`.
- **Playwright e2e** (the claims in the README, actually committed): boot &
  zero console errors, A4 render, ≥13 `typ-*` classes, completion, hover,
  click-to-source, follow-cursor, injected error → squiggle + gutter + last-good
  page, cross-file `#import` (with negative control), tabs + per-file undo,
  folder rename cascade, drag-move, project-wide replace, ZIP contents, reload
  persistence, export menu, server share preview, offline degradation.
- **Cross-engine parity test** (§1.3) — the single most valuable test here.
- **CI** (`.github/workflows/ci.yml`): typecheck + unit + e2e for both packages,
  server bench smoke, and a `docker compose config` sanity check.

### 2.3 Missing product surface (everything server-side)

- **No API** (GraphQL or REST), **no database**, **no blobs**, **no Redis**, **no
  mail**, **no billing**. `server/` is render-only: `/v1/health`, `/v1/fonts`,
  `/v1/render`, `/v1/query`.
- **No router.** `App.tsx` is a single route; none of `plan.md` §7.1 exists
  (`/`, `/signin`, `/signup`, `/project/:token`, `/settings`, `/folder/:id`,
  `/team/:id`, `/pro/`, `/paddle`).
- **No accounts**: signup/signin/session cookies/MFA/email verify/reset/takeout/delete.
- **No dashboard**: projects grid, search/sort, thumbnails, templates, folders, teams.
- **No collaboration**: no Yjs, no cursors/presence, no comments/review/suggestions.
- **No sharing**: no read-only / review-only / read-write link tokens, no email invites.
- **No thumbnails**: no endpoint and no raster output.
- **No local/private packages**: `@local/<name>` resolver absent on both engines.
- **No Present/Speaker mode, draw, Zotero/Mendeley, GitHub/GitLab sync, publish.**

### 2.4 Missing pieces inside the "done" parts

- **PNG/raster.** Server has no canvas backend, so no PNG export and no PNG
  thumbnails (`plan.md` §9 calls this a known gap; it is still open).
- **Assets end-to-end.** Even after B1, uploaded binaries live only for the
  session (`localStorage` stores text); durable assets need blob storage (M3).
- **`sys.inputs` UI.** The server accepts `inputs`; the client never sends them.
- **Project-level settings** (page size, pinned version, `previewed` flag).
- **A11y / i18n / telemetry** (`plan.md` §13; zero coverage).
- **Monorepo scaffold** (root `package.json`, `pnpm-workspace.yaml`, `turbo.json`).

---

## 3. What to implement next — phases

Each phase is independently shippable with explicit acceptance. Effort is for one
strong full-stack dev.

### Phase 0 — Truth & correctness (2–3 days) ← start here

**Goal:** everything the README claims is true, and no known render bug remains.

- [ ] **B1** `Workspace.bundle()` returns `{ entry, files, assets }`, base64 for
      every binary path. Update `App.tsx` (`bundle()` consumers), the render
      client types, and add a unit test with a 1×1 PNG.
- [ ] **B2** Menu undo/redo call CM6 `undo`/`redo` on `viewRef`.
- [ ] **B3** `ServerPreview` surfaces `diagnostics` + `X-Glyph-Errors/Warnings`.
- [ ] **B5** Give each `Preview` its own navigator instance (or a single shared
      preview component with a mode flag).
- [ ] **B6** Rewrite `README.md`'s status section and delete the unverifiable
      Playwright counts until Phase 1 commits them. Fix `plan.md`'s stale
      "pdf.js preview" (§14 M1) and "browser PNG/SVG/HTML via the same render
      path" (§9) statements, or mark them planned.
- [ ] Add `npm run typecheck` to the root of both packages (already present in
      `glyph`, present in `server`) and wire a trivial root script.

**Accept:** a doc with `#image("logo.png")` exported server-side **contains the
image**; menu undo/redo match `⌘Z`/`⇧⌘Z`; README makes no claim not backed by a
committed test or a file.

### Phase 1 — Verification that exists (3–5 days)

**Goal:** the editor's claims become machine-checked, so engine bumps can't rot it.

- [ ] Add `vitest` to `glyph/`; write the unit suites of §2.2.
- [ ] Add `@playwright/test`; commit `glyph/e2e/*.spec.ts` covering §2.2.
- [ ] Add `packages/typst-runtime` **parity harness** (can be a Vitest test that
      boots the render service and the browser worker in one Playwright run).
- [ ] `.github/workflows/ci.yml`: typecheck, unit, e2e (headless), `server` tests,
      `server` bench smoke (assert p95 budgets).
- [ ] Convert the `server` suite's implicit contracts into named cases (engine,
      cache, coalescing, paths/traversal, SVG splitting, HTTP status codes) —
      already mostly there, just assert the budgets too.

**Accept:** `npm test` at the root runs both packages; CI is green from a clean
clone; the README's numbers are produced by CI, not by hand.

### Phase 2 — Monorepo + accounts + dashboard (1.5 weeks) — `plan.md` M0 + M2

**Goal:** a real product loop: register → sign in → create project → edit → reload → saved.

- [ ] **Monorepo:** root `package.json`, `pnpm-workspace.yaml`, `turbo.json`;
      move `glyph/` → `apps/web`, `server/` → `apps/render`; add `packages/`
      (`typst-runtime`, `ui`, `config`, `graphql-schema`, `testing`).
- [ ] **Infra:** `infra/docker-compose.yml` (postgres:16, redis:7, minio, mailpit).
- [ ] **`apps/api`:** Apollo Server 5 + GraphQL 17 + Prisma 7 + Zod.
      - REST auth: `signup`, `signin`, `logout?all=`, `resend-validation`,
        `verify/confirm`. Session cookie `__Http-glyph-session` (HttpOnly, Secure,
        SameSite=Strict), Argon2id, honeypot field.
      - GraphQL: `user`, `session`, `features`, `DashboardContent`,
        `ProjectFiles`, `CreateProject`, `EditProject`, `DeleteProject`,
        `DuplicateProject`, `UpdatesFile`, `DeleteFiles`. Schema **from the
        inventory and the captured fragments**, not invented:
        `typst-app-auth/notes/graphql-operation-inventory.txt` +
        `notes/graphql-editor/request-69-ProjectFiles.txt`. Use the REA shapes:
        `previewed` is a **file id**, `settings` / `settings` are **JSON
        strings**, comments carry `from`/`to`, `thumbnail` is `{id,url}`,
        `Access { canWrite, canReview, canManage }`, and
        `personalWorkspaceAccessError` / `workspaceAccessError` are nullable
        fields on `User`/`Team`.
- [ ] **Settings scopes (do this in Phase 2, not later):** `global`
      (`theme`, `darkModeInvert`), `local-editor`
      (`showMultiplayerCursors`, `showToolbar`, `scrollOnType`,
      `splitHorizontal`, `lineWrap`, `editorDir`, `persistToIndexedDb`,
      `disableWebSocket`, `useFetchCache`), `cloud-user`
      (`showErrorOverlay`, `vim`, `captureModS`, `editorFontSize`,
      `editorFontFamily`, `lineNumbers`, `showSearchLineNumbers`, `spellcheck`,
      `personalDictionary`, `cursorSize`, `improvePanelGrouping`), and
      `cloud-project` (`features`, `target`, `exportSettings`). The server
      stores the cloud scopes as JSON strings via `EditUser`/`EditProject`.
- [ ] REST parity details: send `X-Typst-Preflight` and `X-Typst-Client-Id`;
      keep the `__Http-glyph-session` (Strict, HttpOnly, Secure) plus the
      non-HttpOnly `INSECURE_SIGNED_IN` hint cookie for static pages.
- [ ] **`apps/web`:** React Router 7; routes `/signin`, `/signup`, `/`, `/project/:token`,
      `/play`, `/settings`. Dashboard grid (search, sort, thumbnails placeholder,
      empty project, template starter). Editor loads/saves the project from the
      API; `localStorage` becomes an offline cache, not the source of truth.
- [ ] `pnpm db:seed` (demo user + one project).

**Accept:** register → verify via Mailpit → sign in → create an empty project →
open the editor → edit → hard reload → content is in Postgres and restored; a
second browser session sees the same project; session/logout cookies have the
correct flags; the editor still works with `apps/api` stopped (degraded to
`localStorage`).

### Phase 3 — Files, blobs, thumbnails, share links (1.5 weeks) — `plan.md` M3 + M5 slice

- [ ] Blob storage behind `StorageUsage`: uploads via presigned S3 URL, `PUT
      /v1/files/:projectId/:fileId/blob`, text vs binary vs magic files.
- [ ] In-project folders; rename/delete cascade server-side; `?download=1` project ZIP.
- [ ] **Thumbnails:** on save, `apps/api` calls `apps/render` for page 1; store
      SVG (cheap) and optionally rasterise with `@resvg/resvg-js` for PNG.
      `GET/PUT /v1/projects/:projectId/thumb/:hash`.
- [ ] **PNG export** on the render service (resvg backend) so `Export ▾ → PNG`
      matches typst.app; keep SVG thumbs as the default.
- [ ] **Share links:** read-only / review-only / read-write opaque tokens **served
      at `/project/:token`** (the REA contract — the same editor route, not a
      new `/share` route). The link opens the editor in the matching mode; the
      server-rendered pages remain for OG images/thumbnails, not for the share
      UX. Anonymous access is a config flag (`SHARELINK_ANONYMOUS` in the real
      app).
- [ ] **Thumbnails:** accept the REA upload contract
      (`POST /v1/projects/:projectId/thumb/:hash`, client-generated PNG) **and**
      add a server fallback that renders page 1 and rasterises it with
      `@resvg/resvg-js`; `GET` the same path. This keeps parity while removing
      the "thumbnail only after the client has rendered" dependency.

**Accept:** a project with images/uploads compiles on both engines with **identical
assets** (guards B1 forever); a dashboard tile shows a real thumbnail; an
anonymous visitor opens a read-only share link and cannot write; a review-only
link can comment but not edit.

### Phase 4 — Realtime multiplayer + comments (1.5–2 weeks) — `plan.md` M4 + M5

- [ ] `apps/ws`: `y-websocket`-compatible server at `/editing/v3`, room =
      `projectId:fileId`, auth via session cookie + project access.
- [ ] Per-file `Y.Doc` bound to CodeMirror; **evaluate `@vedivad/typst-web-yjs`**
      (published by the same author as the browser engine) before writing adapters.
- [ ] Persistence: append updates, compact snapshots to S3; Redis pub/sub fan-out;
      IndexedDB offline cache; presence/awareness cursors; read-only review clients.
- [ ] Comments: Postgres rows + `anchor { path, from, to, snippetHash }`;
      create/reply/resolve/edit/delete; panel UI.

**Accept:** two headless browsers converge on one file; a third read-only client
emits no updates; killing/restarting `ws` loses no updates; comments survive
reload and a moved anchor degrades gracefully.

### Phase 5 — Settings, teams, Pro, SSO, hardening (2–3 weeks) — `plan.md` M6–M10

- [ ] Account settings (name/avatar/emails/optin/password/MFA-TOTP/telemetry/
      occupations/theme), storage meter, takeout ZIP, delete account.
- [ ] Teams + members + invites + roles; folders (Pro) incl. `/folder/:id`;
      transfer/move.
- [ ] Billing: Paddle sandbox, subscriptions, payment method, invoices,
      cancel/resume, entitlements/feature flags.
- [ ] Enterprise OIDC/SSO flows + `UpdateTeamIdpAccessPolicy`.
- [ ] Local/private packages (`@local/*`), publish, VCS sync, Zotero/Mendeley.
- [ ] Hardening: rate limits, audit log, OTEL, analytics sink, axe + keyboard a11y,
      load test, production Docker images, reverse proxy.

**Accept:** `plan.md` §16 Definition of Done, item by item, each backed by a
committed test.

---

## 4. Cross-cutting track: engine version policy (own it before Phase 3)

Do this in parallel with Phase 1–2; it is cheap now and expensive later.

1. Create `packages/typst-runtime` and move every `@vedivad/*` /
   `@myriaddreamin/*` import behind it (`TypstProject`, `PreviewNavigator`,
   `MAIN_PATH`, fonts, offsets). The app imports the façade only.
2. Pin **exactly**: browser wrapper and server `typst-ts-node-compiler` on the
   same minor. Add `engine.json`; assert at boot; show it in the About dialog.
3. Ship the font set from one directory (`packages/typst-runtime/fonts`) so the
   editor and the server provably use identical files.
4. Add the parity test (§1.3) to CI as **blocking**.
5. Decide and document the compiler-version story:
   - **v1:** one pinned compiler; documents use it. State this explicitly.
   - **later:** per-project `pinnedVersion` requires dropping to raw
     `@myriaddreamin/typst.ts` + `typst-ts-web-compiler` with fetched wasm builds.
     The façade makes this a one-package change.

---

## 5. Explicit non-goals (this round)

- Rewriting the browser engine to drop `@vedivad/typst-web-service`. Not worth it
  until per-project pinning is required (see §4.5).
- Pixel-parity with typst.app's chrome. Capability parity only (`plan.md` §0).
- Real Paddle keys, real tax logic, third-party analytics, native mobile apps,
  the public marketing site (unchanged from `plan.md`).
- Replacing SVG preview with pdf.js. SVG-on-demand is better here: no canvas, crisp
  at any zoom, and the source-navigation mapping already works.

---

## 6. Risk register (delta from `plan.md` §15)

| Risk | Impact | Mitigation |
|---|---|---|
| **Engine version skew** (wrapper `^0.7.0-rc2` vs server `0.7.0`) | preview and export silently diverge | `packages/typst-runtime` + exact pins + blocking parity test (§4) |
| **Unverified editor** (no committed tests) | engine bump breaks the editor in ways nobody notices | Phase 1 suites + CI before any server work |
| **Assets dropped client-side** (B1) | server exports/share pages lose images | Phase 0 fix + an end-to-end image test in Phase 3 |
| **Wrapper is single-maintainer** | supply-chain/release risk on the critical path | façade isolates it; raw typst.ts fallback documented |
| **No per-project compiler pinning** | newer-syntax documents won't compile | state the v1 limitation; defer to façade swap |
| **Scope**: `plan.md` reads as ~12 weeks of work not yet started | schedule surprise | `plan2.md` phases are the real schedule; treat `plan.md` as reference |

---

## 7. REA parity matrix — what to implement *now*

"Now" = implementable without inventing contracts, because the REA artifacts
already fix the shape. Priority is value ÷ effort for the current codebase.

### 7.1 Now — editor/engine, no new backend (1–2 weeks)

| # | Item | REA source | Why now |
|---|---|---|---|
| **N1** | `packages/typst-runtime`: one façade + a version registry shaped like `URLS` (start with the current 0.7.0 build, one entry) | bundle `URLS`, `COMPILER_VERSIONS` | Every other engine item lands behind it; makes pinning possible |
| **N2** | Subscribe to engine **`outline` / `pages` / `status`** notifications instead of lexical outline + compile-result polling | `Core.onOutline/onPages/onStatus` | Correct semantic outline (numbering/nesting) and decouples preview from compile |
| **N3** | Split settings into the **four scopes** with the REA key names (`global`, `local-editor`, `cloud-user`, `cloud-project`); persist the first two locally now, leave cloud serialisation ready | `GLOBAL_SETTINGS`, `LOCAL_EDITOR_SETTINGS`, `CLOUD_EDITOR_SETTINGS`, `CLOUD_PROJECT_SETTINGS` | Cheap now, painful after users have data |
| **N4** | Editor settings parity: line numbers `normal/relative/disabled`, `cursorSize`, `editorDir` (RTL), `showErrorOverlay` (`onError/hint/manual`), `showSearchLineNumbers`, `improvePanelGrouping` | `CLOUD_EDITOR_SETTINGS` | Small, visible, and removes the "subset" caveat |
| **N5** | Themes: `system` + the five named themes, `darkModeInvert` | `THEME`, `GLOBAL_SETTINGS` | `glyph` has only light/dark |
| **N6** | Export settings + server options: `pageRanges`, `pretty`, `pdf { version, standard[], tagged }`, `png { ppi }`; add `png` to the render service (resvg) | `CLOUD_PROJECT_SETTINGS`, render API | The export menu is already built; this makes it real |
| **N7** | File-format table with `acceptance: multiplayable \| blob \| forbidden` + `conversionName`; use it for upload validation and the "magic file" label | bundle `fileFormats` | Replaces the ad-hoc extension regex in `Workspace.addUpload` |
| **N8** | "**Set as preview**" file action + `previewed` file id (local field for now) | context menu `Set as preview`; `"previewed":"f9gz…"` | Required by the project model and the dashboard thumbnail |
| **N9** | **Quick export** (`⇧⌘S`) next to "Export…", and the Export menu labels/order (PDF "Previewed", PNG, SVG, HTML, Project archive) | bundle toolbar strings; FINDINGS §5 | Pure UI parity on an existing feature |
| **N10** | Browser **worker pool** (2–4) instead of one worker; keep IDE queries on a separate worker from compiles | capture 04 (`worker-created` ×7) | One worker makes completion/hover block during a compile |
| **N11** | Offline shell: service worker + web manifest | `serviceWorker-So4VqnvC.js`, `site.webmanifest` | Turns "works offline" from a claim into a property |
| **N12** | Improve panel grouping: compiler / comments / spellcheck markers in one gutter | `improvementsGutter`, `improvePanelGrouping` | Sets up comments + spellcheck without a second panel |
| **N13** | **Definition / references / tags / eval / spellcheck** — expose them from the façade *if* the underlying engine provides them; otherwise mark as blocked by D1's raw-typst.ts swap | `Core.definition/references/tags/eval/configureSpellCheck` | These are the largest editor-parity gaps left |

> N13 is the honest fork: the current wrapper exposes compile, render, export,
> highlight, completion, tooltip, jump and format — **not** definition,
> references, tags, eval or spellcheck. Do not fake them with a second grammar.

### 7.2 Next — first backend slice, corrected contracts (Phase 2)

| # | Item | REA source |
|---|---|---|
| **B1** | Prisma models matching the captured fragments: `previewed: String?` (file id), `settings: String`, `Comment { fileId, from, to, content, resolved }`, `thumbnail { id, url }`, `Access`, `workspaceAccessError` fields, `SubscriptionLike` union, `File { isMultiplayable, etag, version: String, size, magicKind, lastChange }` | `ProjectFiles` response, `CoreCommentFields` |
| **B2** | GraphQL operations exactly as captured for the slice: `DashboardContent`, `Features`, `ProjectFileIds`, `ProjectFiles`, `CreateProjectMutation`, `EditProject`, `EditProjectMember`, `UpdatesFileMutation` | inventory + `notes/graphql-editor/*` |
| **B3** | Auth per REA: SSR form `POST /v1/auth/signin` (`email`, `password`, `redirect`, `grant-id`, honeypot), `GET /v1/auth/logout?all=true`, `GET /v1/verify/confirm`, resend; cookies as above; `X-Typst-Preflight`/`X-Typst-Client-Id` | capture 01/02; bundle `SigninPage.astro` |
| **B4** | Dashboard: grid/table, order `alphabetical\|last-modified\|last-created` + reverse, project starter (`typst-last-chosen-project-starter`), package categories/templates | `DASHBOARD_SETTINGS`, bundle `PACKAGE_CATEGORIES` |
| **B5** | Route table exactly: `/`, `/app/` (alias), `/project/:token`, `/play`, `/folder/:id`, `/team/:id`, `/team/:id/manage`, `/settings`, `/settings/subscription`, `/settings/subscription/payment-method`, `/pro/`, `/paddle`, `/signin`, `/signup` | FINDINGS §2 |

### 7.3 Later — realtime, sharing, teams, Pro

| # | Item | REA source |
|---|---|---|
| **L1** | Yjs per file with IndexedDB names `${projectId}/${fileId}` (`updates`) and `${projectId}/${fileId}/fetch` (`etag`/`buffer`), `UndoManager` per file, awareness relative positions, WS `/editing/v3?clientId=` | bundle `IndexeddbPersistence`, `YSyncConfig`; capture 04 frames |
| **L2** | Share links at `/project/:token` for `read \| review \| write`; anonymous flag; email invites gated by `project-email-invites` | bundle share components; `shareLinkReadOnly/ReviewOnly/ReadWrite` |
| **L3** | Thumbnail upload contract + server fallback | `POST /v1/projects/:id/thumb/:hash`, console 400 |
| **L4** | Entitlements: copy `FEATURES` names/policies; `PRO_FEATURES` = `presentation-mode`, `use-sync`, `vcs-sync`, `create-comments`, `publish-packages`, `dashboard-folders`; `PROJECT_WIDE_PRO_FEATURES` = `create-comments`, `project-email-invites` | bundle `FEATURES`, `PRO_FEATURES` |
| **L5** | Presentation / Speaker mode, speaker notes | toolbar strings, `presentation-mode`, `speaker-notes` |
| **L6** | Local/private packages: `setRemotePackages(data, privateNamespaces)`, `/v1/package/local/index.json?context=`, `sharedPackages` | bundle; capture URLs |
| **L7** | Magic files / conversions (`.docx`, `.md`, `.tex`, `.bib`, `.csl`, images/PDF as blobs) | `fileFormats` table |

### 7.4 Immediate next tasks (next 3 sessions)

1. **Phase 0 bugs** — B1 (assets), B2 (undo/redo), B3 (server diagnostics in
   preview), B5 (dual navigator), then correct `README.md`.
2. **N1 + N3 + N2**, in that order: the runtime façade, then the four settings
   scopes, then engine outline/pages/status. Add the cross-engine parity test at
   the same time (it belongs to N1).
3. **Phase 1 harness + Phase 2 start** — Vitest/Playwright/CI, then the monorepo
   scaffold, `infra/docker-compose.yml`, and the auth vertical slice with the
   corrected REA contracts (B1–B3).

> Order matters: **verify before you build**, then **pin before you scale**.
> N1/N2/N3 are the three changes that get harder with every feature added, so
> they come before the backend.

---

## 8. Answering "is the architecture correct?"

Short: **the shape is right; the implementation is missing and four contracts are
wrong.** Specifically:

| Question | Verdict |
|---|---|
| Client-side WASM compiler? | ✅ Correct, and it is exactly what typst.app does |
| Native server renderer as well? | ⚠️ Not parity (typst.app has one renderer), but a sound *extra* — keep it additive, parity-tested, never on the interactive path |
| GraphQL for the app model + REST for auth/blobs? | ✅ Correct (matches `/v1/graphql`, `/v1/auth/*`, `/v1/files/*`, `/v1/projects/*/thumb`) |
| Yjs over `/editing/v3?clientId=` + IndexedDB + HTTP fallback? | ✅ Correct design; per-file DB naming and `fetch-cache` still to do |
| Session cookie + honeypot sign-in form? | ✅ Correct; add `INSECURE_SIGNED_IN` and the preflight/client-id headers |
| `/project/:token` for projects *and* share links? | ✅ Correct in `plan.md`; `plan2.md` §Phase 3 has been corrected |
| One pinned compiler? | ❌ Wrong versus the reference (11 builds + per-project `pinnedVersion`); fix via N1 |
| Engine events for outline/pages/status? | ❌ Wrong (lexical outline, compile-result polling); fix via N2 |
| One settings blob? | ❌ Wrong (four scopes); fix via N3 |
| `previewed Boolean`, `settings Json`, `anchor Json`, `thumbnailKey`? | ❌ Wrong versus the GraphQL model; fix via B1 |
| Single browser worker? | ⚠️ Works, but the reference runs a pool (7); fix via N10 |
| Monorepo / API / DB / WS exist? | ❌ Not implemented; `plan.md` §4 is a diagram, not the repo |
| Verification? | ❌ Only `server/test/render.test.ts`; the README's Playwright counts are not committed |

So: **do not redesign the architecture.** Implement the version registry, the
engine event surface, the four settings scopes, and the corrected data model —
that is the difference between "a very good editor demo" and "the reference
product's architecture".


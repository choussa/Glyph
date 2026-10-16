# `glyph` — a full clone of the Typst web app

> Build plan for a clean-room reimplementation of the **authenticated typst.app**
> product surface, based on the reconnaissance in `typst-app-auth/FINDINGS.md`.
> Target host: this GitHub Codespace (Node 24.21, Docker 29 + Compose v5, ~12 GB
> free disk, ~5 GB RAM headroom).

---

## 0. Ground rules (read first)

- **Clean-room.** typst.app is proprietary. **Do not copy** its JavaScript,
  CSS, HTML, fonts-as-shipped, icons, or copy text. Reimplement behavior from
  observed contracts. The compiler and language are open source and are the
  only things we reuse directly.
- **Reusable OSS (allowed):**
  - `typst` / `typst.ts` (`@myriaddreamin/*`) — compiler WASM, Apache-2.0.
  - `codemirror-lang-typst` — Lezer grammar, MIT.
  - `Libertinus` / `NewCM` / `Inter` / `Cascadia` fonts under their own licenses
    (SIL OFL / Apache) — vendor with license files.
  - The full OSS stack below (React, Yjs, Postgres, etc.).
- **Naming.** Product name `glyph`, npm scope `@glyph/*`, package `glyph`.
  Change freely; nothing depends on it.
- **Success = parity of capability, not of pixels.** Pixel-parity is a stretch
  goal only for the editor chrome.

---

## 1. Vision & scope

A multi-tenant SaaS that reproduces typst.app's core loop and its surrounding
product:

```
write Typst  →  instant in-browser compile  →  PDF preview  →  export/share
                        │                            │
                   live multiplayer            comments/review
                        │
        accounts · projects · files · folders · teams · billing
```

**In scope (v1.0 = full parity target):**

| Area | typst.app behavior we must match |
|---|---|
| Editor | CodeMirror 6 source pane, Typst WASM compile in workers, PDF preview, toolbar, menus, panels, split views, themes, zoom/fit |
| Compiler | Client-side WASM, multiple pinned versions, feature flags (`target: paged\|html`), diagnostics, completion |
| Files | Multi-file projects, folders inside a project, upload, magic files, assets, rename/delete |
| Realtime | Yjs CRDT per file, WebSocket sync, collaborator cursors, online status |
| Sharing | Read-only / review-only / read-write share links; email invites; members + roles |
| Review | Comments anchored to ranges, replies, resolve, review-only mode |
| Dashboard | Projects grid/table, search, sort, thumbnails, recent/templates, folders |
| Teams | Team workspaces, members, roles, invites, team storage, team delete |
| Accounts | Email/password, session cookies, MFA (TOTP), email verification, SSO/OIDC, takeout, delete |
| Billing | Free vs Pro, monthly/annual, Paddle checkout, payment method, invoices, cancel/resume |
| Export | PDF, PNG, SVG, HTML, project archive (+ quick PDF) |
| Integrations | Local/private packages, publish, GitHub/GitLab VCS sync, Zotero/Mendeley |
| Platform | Dark/light/system theme, a11y, telemetry, analytics, i18n-ready |

**Explicitly out of scope for v1:** exact billing tax logic, real Paddle
production keys, exact Mixpanel dashboards, mobile native apps, the public
marketing site, Typst Universe (we proxy the real registry read-only).

---

## 2. Architecture

```
                         ┌──────────────────────────────────────────────┐
   Browser               │  apps/web  (React + React Router 7, Vite)     │
 ┌───────────────┐       │                                               │
 │ CodeMirror 6  │◀─────▶│  editor · dashboard · settings · teams        │
 │ Typst WASM    │       └──┬──────────┬──────────┬──────────┬──────────┘
 │ (Web Worker)  │          │          │          │          │
 │ SVG preview   │◀─────────┘  live    │ GraphQL  │ WS (Yjs) │ exports
 └───────────────┘          preview    ▼          ▼          ▼
                            (local)  ┌────────┐ ┌────────┐ ┌──────────────┐
                                     │apps/api│ │apps/ws │ │ apps/render  │
                                     │ Apollo │ │y-webskt│ │ typst.ts     │
                                     │ + REST │ │+ persist│ │ native      │
                                     └───┬────┘ └───┬────┘ └──────────────┘
                                         │          │
             ┌───────────────────────────┼──────────┘
             ▼                ▼          ▼
      ┌────────────┐  ┌────────────┐  ┌────────────┐
      │ PostgreSQL │  │  Redis     │  │ MinIO (S3) │
      │ (Prisma)   │  │cache/pubsub│  │ blobs/yjs  │
      └────────────┘  └────────────┘  └────────────┘
```

**Why this shape**

- Mirrors the discovered split: **GraphQL for the app model** (`/v1/graphql`),
  **REST for auth + blobs** (`/v1/auth/*`, `/v1/files/*`, `/v1/projects/*/thumb`),
  **WebSocket for live editing** (`/editing/v3`).
- **Two Typst engines, one document.** The browser engine compiles locally, which
  is what makes typing feel instant, keeps the "offline playground" property and
  holds server cost at zero for the interactive path. The server engine
  (`apps/render`) exists for the artifacts that must not depend on any visitor's
  machine: share-link previews, thumbnails, and exports. `apps/web` talks to it
  directly for exports and previews; `apps/api` calls it to mint thumbnails.
- Both engines are Typst, so both produce the same document. The split is about
  *where the work happens*, not about two renderers that disagree.


---

## 3. Tech stack (decisions)

| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | fast, matches modern TS monorepos |
| Web | React 19 + **React Router 7 (framework/data mode)** + Vite | parity with target stack (RR7 framework mode confirmed in RE) |
| Editor | **CodeMirror 6** (`@codemirror/*`) | confirmed editor; highlighting/completion/hover come from the engine, not a second grammar |
| Engine (browser) | **`@vedivad/typst-web-service`** 0.18.8 | one WASM engine (compiler + `typst-ide` + `typst-syntax` + `typstyle`) in a worker; bundled fonts; **bidirectional** source↔preview navigation |
| Engine (server) | **`@myriaddreamin/typst-ts-node-compiler`** 0.7.0 (native napi) | PDF/SVG/HTML/vector for share previews, thumbnails and exports — no browser required; warm worker pool + byte-budgeted cache |
| Preview | **SVG pages** + `PreviewNavigator` | engine renders pages to SVG on demand; navigator gives click-to-source |
| API | **Apollo Server 5** + GraphQL 17 + Prisma 7 | GraphQL contract parity; typed end-to-end |
| DB | **PostgreSQL 16** (Docker) | relational model matches users/teams/projects |
| Cache/PubSub | **Redis 7** | sessions, rate limit, WS fan-out, presence |
| Blobs | **MinIO** (S3 API) | files, thumbnails, exports, takeout ZIPs |
| Realtime | **Yjs 13** + custom `y-websocket` server | CRDT parity with typst's Yjs editor |
| Auth | Session cookies (`__Http-glyph-session`) + Argon2id, TOTP MFA | matches observed session-cookie model |
| Billing | **Paddle** (sandbox) | typst uses Paddle |
| Mail | Nodemailer → Mailpit (dev) / SMTP (prod) | invites, verification, reset |
| Validation | Zod | shared request/response schemas |
| Styling | CSS Modules + CSS custom properties (design tokens) | matches target's variable-driven theming; no heavy UI kit |
| Testing | Vitest + Playwright (web), Playwright component, Supertest (api) | E2E parity tests driven like REA scenarios |
| Observability | pino logs + OpenTelemetry + a self-hosted analytics sink | mirrors `events/track`; no third-party by default |
| CI | GitHub Actions: typecheck, test, build, docker build | |

**Memory budget note (this Codespace):** Postgres + Redis + MinIO + api + ws +
web is ~1.5–2 GB. Keep the browser to one tab; use headless Playwright for E2E.
Provide a `dev:lite` profile (SQLite + local FS) for low-RAM sessions.

---

## 4. Repository layout

```
glyph/
├─ apps/
│  ├─ web/                     # React Router 7 app
│  │  ├─ app/
│  │  │  ├─ routes/
│  │  │  │  ├─ _index.tsx                 # dashboard  (/)
│  │  │  │  ├─ app.tsx                    # /app/ → index
│  │  │  │  ├─ signin.tsx  signup.tsx  forgot-password.tsx
│  │  │  │  ├─ settings/
│  │  │  │  │  ├─ _index.tsx              # /settings
│  │  │  │  │  └─ subscription/
│  │  │  │  │     ├─ _index.tsx           # /settings/subscription
│  │  │  │  │     └─ payment-method.tsx
│  │  │  │  ├─ pro.tsx                    # /pro/
│  │  │  │  ├─ paddle.tsx                 # /paddle
│  │  │  │  ├─ folder.$folderId.tsx
│  │  │  │  ├─ team.$teamId.tsx
│  │  │  │  ├─ team.$teamId.manage.tsx
│  │  │  │  ├─ team.$teamId.manage.idps.openid-connect.$providerId.tsx
│  │  │  │  ├─ project.$projectToken.tsx  # editor (kind=project)
│  │  │  │  └─ play.tsx                   # editor (kind=play)
│  │  │  └─ components/ (Editor, Preview, FilePanel, Outline, Share, Menus…)
│  │  ├─ lib/ (apollo, graphql codegen, yjs, typst worker client, theme)
│  │  └─ workers/compile.worker.ts
│  ├─ api/                     # Apollo Server + REST + auth + billing
│  │  ├─ src/graphql/ (schema SDL, resolvers per domain)
│  │  ├─ src/rest/   (auth, files, thumbs, packages, avatars, takeout)
│  │  ├─ src/services/ (mail, billing/paddle, storage, render client)
│  │  └─ prisma/schema.prisma
│  ├─ ws/                      # Yjs websocket server (auth + persistence)
│  └─ render/                  # server-side typst.ts render (pdf/svg/html/vector)
│                              #   — built today as the standalone `server/` package
│                              #     (worker pool + cache + page splitting)
├─ packages/
│  ├─ typst-runtime/           # version-pinned WASM loader + font resolver + worker protocol
│  ├─ graphql-schema/          # SDL + generated types (shared web/api)
│  ├─ ui/                      # design tokens, primitives (Button, Modal, Menu…)
│  ├─ config/                  # eslint, tsconfig, tailwind-less tokens
│  └─ testing/                 # fixtures, scenario runner harness
├─ fonts/                      # vendored fonts + LICENSE files
├─ vendor/typst/               # pinned typst.ts wasm artifacts (git-lfs or fetched)
├─ infra/
│  ├─ docker-compose.yml       # postgres, redis, minio, mailpit
│  ├─ docker-compose.full.yml  # + api, ws, render, web
│  └─ Dockerfile.*
├─ scenarios/                  # Playwright parity scenarios (mirror REA runs)
├─ plan.md  README.md  pnpm-workspace.yaml  turbo.json
```

---

## 5. Data model (Prisma / Postgres)

Mirrors the entity graph recovered from GraphQL (`DashboardUserFragment`,
`TeamFields`, `ProjectMetaFragment`, `CoreFileFields`, subscriptions…).

```prisma
model User {
  id            String   @id @default(cuid())
  name          String
  avatarKey     String?
  telemetryLevel TelemetryLevel @default(FULL)
  settings      Json     @default("{}")
  emailOptin    Boolean  @default(false)
  occupations   String[] @default([])
  hasPassword   Boolean  @default(false)
  passwordHash  String?
  termsVersion  DateTime?
  termsState    TermsState @default(PENDING)
  createdAt     DateTime @default(now())
  emails        Email[]
  projects      Project[] @relation("owner")
  memberships   ProjectMember[]
  teams         TeamMember[]
  sessions      Session[]
  mfa           Mfa?
  subscriptions Subscription[]
  transactions  Transaction[]
  billing       BillingInformation?
  vcsAccounts   VcsAccount[]
  refAccounts   RefAccount[]
  folders       Folder[]
  storage       StorageUsage?
}

model Email { id, address @unique, confirmed, primary, academic, userId }
model Session { id, tokenHash @unique, userId, started, native, ip, userAgent, expiresAt }
model Mfa { userId, secretEnc, enabledAt, backupCodesHashes String[], allowSupportRecovery }
model EmailToken { id, kind (VERIFY|RESET|OPTIN), tokenHash, userId, expiresAt, usedAt }

model Project {
  id, name, token @unique, ownerUserId?, ownerTeamId?, folderId?,
  settings Json, pinnedVersion String?, previewed Boolean,
  shareLinkReadOnly String?, shareLinkReviewOnly String?, shareLinkReadWrite String?,
  created, modified, deletedAt?
  files File[], members ProjectMember[], invitations ProjectInvitation[],
  comments Comment[], vcs ProjectVcs?, packages ProjectPackage[], thumbnailKey String?
}

model ProjectMember { id, projectId, userId?, inviteEmail?, canWrite, canReview, canManage }
model ProjectInvitation { id, projectId, email, canWrite, canReview, token, expiresAt }

model File {
  id, projectId, name, kind (TEXT|BINARY|MAGIC),
  yjsStateKey String?,            // object-storage snapshot
  size, version, magicKind?, etag, lastChange,
  folderId?          // in-project folder (Pro)
  @@index([projectId, name])
}

model Folder { id, name, ownerUserId?, ownerTeamId?, parentId?, created, modified }
model Team { id, name, avatarKey?, created }
model TeamMember { id, teamId, userId, role (ADMIN|MEMBER) }
model TeamInvitation { id, teamId, email, asAdmin, token, expiresAt }
model TeamDomain { id, teamId, domain, token, verified }
model OidcProvider { id, teamId, kind (PENDING|ACTIVE), displayName, credentialsEnc, claims Json, accessPolicy Json }

model Comment {
  id, projectId, fileId, authorUserId, body, resolved, created, modified,
  anchor Json      // { path, from, to, snippetHash }
  replies CommentReply[]
}
model CommentReply { id, commentId, authorUserId, body, created, modified }

model Feature  { userId, name, expires?, metric? }        // server-driven flags
model Subscription {
  id, userId, plan (FREE|PRO), status, annual, periodStart, periodEnd,
  nextBilledAt?, willCancel, willPause, paddleSubscriptionId?, paddleCustomerId?
}
model Transaction { id, userId, subscriptionId?, status, billedAt, tax, total, grandTotal, currencyCode, paddleInvoiceId? }
model PaymentMethod { id, userId, type, cardLast4, cardType, expiryMonth, expiryYear, cardholderName }
model BillingInformation { userId, countryCode, region, postalCode, fullName, firstLine, secondLine, city, businessName?, vatId? }

model StorageUsage { userId?, teamId?, used BigInt, available BigInt }
model VcsAccount { id, userId, backend (GITHUB|GITLAB), userName, accessTokenEnc }
model ProjectVcs { projectId, accountId, repoUrl, ref, subDir, lastPushDate }
model RefAccount { id, userId, backend (ZOTERO|MENDELEY), userName, credentialsEnc }
model Package { id, projectId?, publisherUserId, name, version, state (DRAFT|PUBLISHED), archiveKey }
model FeedItem { id, title, created, anchor, unread }   // heads-up / what's new
model AuditLog { id, actorUserId?, action, targetType, targetId, meta Json, createdAt }
```

Yjs persistence (see §8) lives in Postgres (`yjs_update`, `yjs_snapshot`) or in
Redis Streams + S3 snapshots; start with Postgres for simplicity.

---

## 6. API contracts

### 6.1 GraphQL (`POST /api/v1/graphql`, Apollo)

Recreate the **157 operations** from `typst-app-auth/export/bundle/graphql-documents.txt`
under our own names/schema, but keep the *shape* so the frontend is a drop-in.
Full inventory: `typst-app-auth/notes/graphql-operation-inventory.txt`.

SDL sketch (authoritative file: `packages/graphql-schema/schema.graphql`):

```graphql
type Query {
  user: User
  session: Session
  features: [Feature!]!
  countryCode: String
  project(id: ID!): Project
  projectFiles(ids: [ID!]!): [ProjectFiles!]!
  team(id: ID!): Team
  teamMember(teamId: ID!, ...): TeamMemberQuery
  oidcProviderSettings(teamId: ID!): OidcProviderSettings
  pendingOidcProviders(teamId: ID!): [PendingOidcProvider!]!
  subscription: Subscription
  subscriptions: [SubscriptionLike!]!
  transactions: [SubscriptionTransaction!]!
}
type Mutation {
  # projects/files
  createProject(name: String, folder: ID, template: ID, team: ID): Project
  duplicateProject(id: ID!): Project
  editProject(id: ID!, name: String, settings: JSON, pinnedVersion: String): Project
  deleteProject(id: ID!): Boolean
  updatesFile(...): File
  deleteFiles(ids: [ID!]!): Boolean
  createMagicFile(...): File
  # collaboration
  inviteProjectMember(projectId: ID!, email: String!, canWrite: Boolean, canReview: Boolean): ProjectInvitation
  editProjectMember(...): ProjectMember
  deleteProjectMember(...): Boolean
  createComment(...): Comment
  createCommentReply(...): CommentReply
  editComment(...): Comment
  deleteComment(...): Boolean
  resolveComment(...): Comment
  sendBatchUpdate / pushUpdatesFile : File   # Yjs HTTP fallback
  # teams
  createTeam(name: String!): Team
  teamEdit(teamId: ID!, name: String): Team
  teamDelete(teamId: ID!): Boolean
  teamMemberInvite(teamId: ID!, email: String!, asAdmin: Boolean): TeamInvitation
  teamMemberEdit / teamMemberDelete / teamInvitation* / teamDomain* / teamIdpAccessPolicy
  # enterprise OIDC
  startPendingOidcProviderWithDiscovery / ...Manually / setPendingOidcProvider* / promotePendingOidcProvider / updateOidcProvider / rediscoverOidcProvider / deleteOidcProvider / disassociateUserFromOidcProvider
  # folders
  createFolder(name: String!, parent: ID, owner: ID): Folder
  updateFolder(...): Folder
  deleteFolder(id: ID!): Boolean
  # account
  addEmail / deleteEmail / promoteEmail / addPassword / editUser / editSettings / deleteUser / acceptTos
  beginMfaEnrollment / confirmMfaEnrollment / beginMfaTotpChange / confirmMfaTotpChange / regenerateBackupCodes / disableMfa
  # billing
  issueSubscription / cancelSubscription / undoCancelSubscription / resumeSubscription / changeBillingCycle / previewBillingCycleChange / changePaymentMethod / updateBillingInfo / getInvoiceUrl
  # packages / vcs / refs
  publishPackage / deletePackage / connectVcs / disconnectVcs / reconnectVcs / vcsPull / vcsPush
  setUserInfoSource / clearUserInfoSource / authorizeOAuth
  collectNps / submitFeedback / reportProject
}
```

Objects: `User, Agent, Email, Session, Feature, Project, ProjectFiles, File,
Folder, Team, TeamMember, TeamInvitation, Domain, OidcProvider, Comment,
CommentReply, SubscriptionLike, Subscription/UserSubscription/GrantSubscription,
PaymentMethod, SubscriptionTransaction, BillingInformation, StorageUsage,
Access, QueryAccess, PendingOidcProvider, Insights…`

**Resolvers** return `__typename` (Apollo cache) and enforce access via
`access { canWrite, canReview, canManage }`.

### 6.2 REST (`/api/v1/*`)

| Method | Endpoint | Mirrors |
|---|---|---|
| POST | `/api/v1/auth/signup` | form register |
| POST | `/api/v1/auth/signin` | form login (email, password, redirect) |
| POST | `/api/v1/auth/mfa/verify` | TOTP step |
| GET | `/api/v1/auth/logout?all=` | sign out |
| POST | `/api/v1/auth/resend-validation` | resend verify |
| GET | `/api/v1/verify/confirm?token=` | email verify (also `/double-opt-in`) |
| GET | `/api/v1/files/:projectId/:fileId/yjs` | load Yjs snapshot |
| POST | `/api/v1/files/:projectId/:fileId/yjs` | HTTP Yjs update fallback |
| PUT | `/api/v1/files/:projectId/:fileId/blob` | upload file bytes |
| POST/GET | `/api/v1/projects/:projectId/thumb/:hash` | thumbnail write/read |
| GET | `/api/v1/package/local/index.json?context=<user\|projectId>` | local package index |
| GET/TAR | `/api/v1/package/:scope/:name/:version` | package download |
| GET | `/api/v1/avatar/:id?teamId=&providerId=` | avatars |
| GET | `/api/v1/takeout` | data takeout ZIP (async) |
| POST | `/api/v1/billing/paddle/webhook` | Paddle webhook |
| GET | `/api/v1/oauth/authorize` · `/oauth/consent` · `/auth/oidc` | OIDC/OAuth |
| ALL | `/api/v1/paddle` (UI route) | checkout |

### 6.3 WebSocket (`wss://…/editing/v3?clientId=`)

Mirror the observed endpoint + Yjs binary protocol:

- Query: `clientId` (8-char), auth via session cookie.
- First client messages: sync-step-1 (`38 B` in RE), then awareness init.
- Server: `y-websocket`-compatible; persistence + auth + room = `projectId:fileId`.
- Server messages observed small (13/2/2 B) = sync-step-2 / awareness acks.

---

## 7. Frontend application

### 7.1 Routes (parity with recovered route table)

`/`, `/app/`, `/play`, `/project/:projectToken`, `/folder/:folderId`,
`/team/:teamId`, `/team/:teamId/manage`,
`/team/:teamId/manage/idps/openid-connect/:providerId`,
`/settings`, `/settings/subscription`, `/settings/subscription/payment-method`,
`/pro/`, `/paddle`, `/signin`, `/signup`, `/forgot-password`,
`/project/:token?download=1`.

### 7.2 Editor composition

```
EditorRoute (glyph/src/App.tsx)
├─ MenuBar        wordmark · File / Edit / View / Help dropdowns · theme · Export
├─ LeftRail       Files · Search · Outline · Issues · Settings (⌥1…⌥5)
├─ EditorPane     TabBar + EditorToolbar + CodeMirror 6
│                 (per-file EditorState cache; lint / completion / hover / format
│                  all driven by the engine through a live path getter)
├─ PreviewPane    SVG pages · zoom · click-to-source · follow-cursor · scroll-sync
├─ Panels         FilePanel · SearchPanel · OutlinePanel · IssuesPanel · SettingsPanel
├─ StatusBar      path · entry badge · compile state · error/warning counts ·
│                 pages · words · Ln/Col · server pill
└─ Overlays       CommandPalette · ContextMenu · ShortcutsDialog · AboutDialog ·
                  ServerPreview
```

Mirror recovered UI affordances exactly where they encode behavior: toolbar
buttons, File/Edit/View menu items, Export menu (PDF/PNG/SVG/HTML/archive),
Share dialog (read-only / review-only / read-write + email invites).

**As built (M1).** The pane is a real multi-file editor, not a single buffer:

- **Two stores, two update frequencies.** `Workspace`
  (`workspace/useWorkspace.ts`) owns files, folders, tabs, entry, dirty flags and
  persistence; `CursorStore` (`editor/cursorStore.ts`) owns the selection. Only
  the status bar, outline and search panels subscribe to the cursor, so a
  keystroke re-renders those three nodes and never the app. App state changes
  only on a dirty flip, a structural change, or a compile-status transition.
- **One `EditorView`, one `EditorState` per file.** Switching tabs is
  `view.setState(cached)`, which preserves per-file undo history and cursor for
  free. Cached states are rebuilt if their doc text no longer matches the
  workspace (self-healing after a project-wide replace).
  `EditorView.setState` does not run update listeners, so the host re-emits
  selection/cursor itself after a swap.
- **Engine extensions take a path getter** (`() => string`) rather than a fixed
  path, so a tab switch never rebuilds the extension set.
- **Diagnostics are flushed one microtask late.** Dispatching from inside a
  CodeMirror update throws; the lint pass is queued with `queueMicrotask` and
  re-run for the active file via a `refreshLint` effect after each swap.
- **The file tree is implied by paths plus an explicit `folders: string[]`**, so
  empty folders exist. Folder rename/delete cascade to contained files; rename is
  `setText(new) + remove(old)` because the engine has no rename.
- **Outline and search are lexical**, not engine calls: `extractOutline` is a
  synchronous scan of headings, and search/replace scans every text file with
  case / regex / whole-word toggles and `$1` group refs. Both therefore work with
  the engine cold and cost nothing while typing.
- **Zoom is decoupled from rendering.** Pages are fetched once per compile; zoom
  only rewrites each page's width (`PT_TO_PX = 96/72`, 24 px gutter), so changing
  zoom never re-invokes the compiler.
- **One `document` keydown listener** with `capture: true` owns every shortcut
  (the editor gets `keybindings={[]}`), keyed on `event.code` so it is
  layout-independent. `⌥W` closes a tab — `⌘W` cannot be intercepted in Chrome.
- **Persistence** is localStorage: `glyph.workspace.v1` (text files, folders,
  entry, tabs, active) and `glyph.settings.v1` (theme, font, tab size, wrap,
  zoom, panel, split). "Dirty" means changed since the last debounced persist
  (600 ms); binary uploads are session-only.
- **Project download is a hand-written uncompressed ZIP writer**
  (`workspace/zip.ts`) — no extra dependency.

### 7.3 Pure frontend modules (`@glyph/typst-runtime`)

One engine, one worker, everything routed through a `TypstProject`:

```ts
const project = await TypstProject.create({
  entry: '/main.typ',
  autoCompile: { debounceMs: 250, maxWaitMs: 1500 },  // VFS mutations -> debounced compile
});

await project.setMany({ '/main.typ': source, '/logo.svg': bytes });
const { pages, diagnostics } = await project.compile();  // pages = per-page dims
const svgs = await project.renderedPages(0, pages.length); // render on demand
const pdf  = await project.exportPdf();

// Bidirectional source <-> preview:
await project.clickJump(page, xPt, yPt);        // preview click -> source location / link
await project.jumpFromCursor(path, src, off);   // cursor -> page + point

// Editor intelligence, all from the same engine:
await project.completion(path, src, off, explicit);
await project.hover(path, src, off);
await project.format(path, src);
await project.highlight(src, viewportFrom, viewportTo); // -> typ-* spans
```

**Integration gotchas to bake in as regression tests:**

1. **Don't pre-bundle the engine.** It spawns its worker with
   `new Worker(new URL('./typsten-worker.js', import.meta.url))` and fetches its
   wasm via `new URL('./typsten_bg.wasm', import.meta.url)`; Vite's optimizer
   rewrites those into a dead `.vite/deps/…?worker_file` URL. Exclude
   `@vedivad/typst-web-service` from `optimizeDeps`.
2. **Diagnostic paths lose the leading slash** (`main.typ` vs the VFS key
   `/main.typ`) — compare through `normalizePath`.
3. **Byte offsets, not UTF-16** — diagnostics carry UTF-8 offsets; convert with
   `byteToCmOffset`.
4. **`jumpFromCursor` legitimately returns nothing** for cursors inside `#set`
   rules, blank lines, or code that renders nothing.
5. Highlight spans may **nest** (`typ-strong` containing `typ-func`) — build the
   decoration set with `Decoration.set(ranges, true)`.
6. Keep the last good pages on compile error (the engine already reports the last
   successful document's page dims).
7. Debounce recompiles and drop stale results; warm the worker once at load.
8. `@vedivad/codemirror-typst` is **not installable** (its published manifest
   depends on `workspace:^`), so the CodeMirror glue is ours.
9. **`clickJump` only resolves inside a text run's box**, and lines are ~21 pt
   apart with ~11 pt of ink — a click in the leading resolves nothing. `glyph`
   creates the navigator with `listen: false` and probes outward from the click
   (±3, ±6, … pt) so a near-miss still reaches the nearest line.
10. **`EditorView.setState` skips update listeners** — the multi-file host
    re-emits selection/cursor manually, and lint flushes go through
    `queueMicrotask` because dispatching inside an update throws.

---

## 8. Realtime (Yjs) design

- **Document per file:** `Y.Doc` bound to CodeMirror via `y-codemirror.next`.
- **Awareness:** presence (name, color, cursor) → "collaborator cursors".
- **Transport:** `apps/ws` implements a `y-websocket` server:
  - room = `projectId:fileId`; auth = session cookie + project write/review check.
  - persistence: append `Y.encodeStateAsUpdate` to `yjs_update`; compact to
    `yjs_snapshot` (S3) every N updates or on last-disconnect.
  - fan-out via Redis pub/sub so `ws` scales horizontally.
- **Offline/optimistic:** mirror typst's client persistence — IndexedDB stores
  `updates` and `fetch-cache` so reloads don't lose work.
- **Review-only** clients connect read-only (server rejects write updates).
- **Comments** are a separate Y map (or Postgres rows synced over WS) keyed by
  anchor; resolve/reply mutate through GraphQL.

Acceptance: two headless browsers editing the same file converge; a third
read-only client never emits updates; kill/restart `ws` and state survives.

---

## 9. Compilation pipeline

**Client (primary):**

- One WASM engine (`@vedivad/typst-web-service`) in a worker: compile + `typst-ide`
  + `typst-syntax` + `typstyle`. It owns a virtual file system, mirrors edits into
  it, auto-schedules debounced compiles, and renders pages to **SVG on demand**.
- **Multi-file** is native: `setMany({ '/main.typ', '/template.typ', … })`, with
  `@preview` packages fetched over HTTP on demand when a source imports them.
- **Fonts** ship with the engine (Libertinus Serif, New Computer Modern Math,
  DejaVu Sans Mono); `project.addFont(bytes)` adds families it lacks (e.g. CJK).
- **Exports**: `exportPdf()`; PNG/SVG/HTML via the same render path.

**Server (`apps/render`, secondary) — built as the standalone `server/` package:**

- **`@myriaddreamin/typst-ts-node-compiler` 0.7.0** — the native (napi) build of
  the same Typst compiler, so there is no WASM in the request path.
- **Worker pool.** Typst compiles synchronously, so a `worker_threads` worker is
  the unit of parallelism and each owns one warm `NodeCompiler`. Jobs go
  round-robin to idle workers and queue FIFO; a crashed or wedged worker is
  terminated and respawned.
- **Per-request isolation.** Sources are installed as engine shadow files
  (`mapShadow`) for the duration of a request and torn down with `resetShadow`,
  so no two requests share a file system and nothing accumulates across requests.
- **One workspace root** (`/glyph`). The engine refuses an entry outside its
  workspace and resolves both `import "x.typ"` and `import "/x.typ"` against it.
  Paths are validated in the main thread before dispatch, so a malformed request
  never costs a worker round trip.
- **Cache + coalescing** sit in front of the pool: a byte-budgeted LRU keyed by a
  SHA-256 of everything that changes the output, plus in-flight deduplication of
  identical requests.
- **Formats:** `pdf` (honours `pdfStandard` / `pdfTags`), `svg` (whole document),
  `pages` (one standalone SVG per page — the share-link artifact), `html`
  (`compileHtml` target), `vector` (Typst vector IR). `POST /v1/query` adds
  introspection — the outline panel is `selector: "heading"`.
- **Fonts:** Libertinus Serif, Libertinus Math, New Computer Modern Math, DejaVu
  Sans Mono — the same families the browser engine bundles, so a server export
  matches the editor's preview.
- **Measured** (2 cores, `npm run bench`): 0.71 ms mean for a warm one-page PDF,
  7.93 ms for a nine-page document, 1.40 ms cache-hit HTTP round trip, ~1400 req/s
  at concurrency 16, ~94 MB RSS per worker, 24 ms cold warm-up.
- **Known gap:** `typst.ts` 0.7.0 reports diagnostics with `range: null`, so
  squiggles remain a browser-engine feature. PNG/OG raster output needs a canvas
  backend and is not implemented; `format: "pages"` returns SVG instead.

**Packages:** a project can resolve `@local/<name>` (own project) and
`@preview/*` (registry, fetched on demand by the engine). `GET
/v1/package/local/index.json?context=` returns a `typst.toml` index; the resolver
maps imports to files/archives.

---

## 10. Auth & security

- **Sessions:** opaque 256-bit token in `__Http-glyph-session` (HttpOnly,
  Secure, SameSite=Strict, Domain=`.glyph.local` in dev); store SHA-256 in
  `Session`. Rotate on login; `logout?all=true` clears all.
- **Passwords:** Argon2id; `hasPassword` mirrors SSO-only accounts.
- **MFA:** TOTP (`otpauth://`), backup codes (hashed), enroll/change/disable
  flows matching `BeginMfaEnrollment…DisableMfa`.
- **SSO/OIDC:** per-team providers; discovery + manual config; claim mapping;
  access policy requiring SSO; the flow from `PendingOidcProvider*` →
  `OidcProviderSettings`.
- **Authorization:** every resolver checks `Access { canWrite, canReview,
  canManage }`; share links map to review/write scopes; owner/team scoping.
- **Hardening:** CSRF tokens on form POSTs, rate limiting (Redis), email
  verification before sharing, signed share tokens (opaque, revocable),
  upload size/type limits, S3 presigned URLs, honeypot field on signup
  (mirror typst's `captcha-trap` → keep our own, clearly documented as a trap).
- **Data minimization:** never log secrets; encrypt VCS/OIDC/ref credentials at
  rest (libsodium sealed box with a KMS/env key).

---

## 11. Billing (Paddle)

- Plans: **Free** (200 MB, limits from RE: max files/projects strings) and
  **Pro** (2 GB, 1 000 files; features: present/draw, VCS sync, Zotero/Mendeley,
  private packages, review comments, folders).
- Monthly/annual (annual ≈ −17%); `GET /pro/` pricing; `/settings/subscription`;
  `/paddle` checkout page; `PreviewBillingCycleChange`, `ChangePaymentMethod`,
  `GetInvoiceUrl`, cancel/resume/undo.
- Async: Paddle webhook (`/api/v1/billing/paddle/webhook`) → update
  `Subscription`/`Transaction`; idempotent by event id.
- Entitlements: a `features` resolver flips flags (`zotero-sync`, `github-sync`,
  `gitlab-sync`, `mendeley-sync`, `storage-subscription`).
- Dev: Paddle **sandbox** + CLI-triggered webhook fixtures; no real cards.

---

## 12. Infra & developer experience

`infra/docker-compose.yml` (dev):

```
postgres:16   :5432   redis:7   :6379   minio   :9000/9001   mailpit :1025/8025
```

`docker-compose.full.yml` adds `api :4000`, `ws :4001`, `render :4002`,
`web :5173`. Ports are forwarded by Codespaces.

`pnpm dev` starts everything via Turborepo. `pnpm dev:lite` swaps Postgres→SQLite
(Prisma) and MinIO→local FS for low-RAM sessions.

Secrets via `.env` (never committed) + `.env.example`. `pnpm db:reset`,
`pnpm db:seed` (demo user, demo project, one team).

**Codespaces constraints:** 7.8 GB RAM / 12 GB free disk. Keep WASM artifacts
fetched on demand (`pnpm fetch:wasm`) rather than committed; the base compiler
is ~28 MB. One browser tab at a time in dev.

---

## 13. Testing & QA

- **Unit (Vitest):** resolvers, auth, permissions, billing transitions, Yjs
  persistence, typst worker protocol.
- **Contract:** GraphQL schema snapshot; every RE operation has a test.
- **E2E (Playwright):** mirror the REA scenarios — login, dashboard, create
  project, edit+compile+preview, share, comment, team invite, export. Run
  headless in CI.
- **Parity scenarios:** re-run `typst-app-auth/scenarios/*` conceptually against
  `glyph` and assert equivalent a11y landmarks (structure, not pixels).
- **Perf budgets:** first paint < 1.5 s; compiler warm < 3 s; keystroke→preview
  p95 < 400 ms on the sample doc; WS sync < 150 ms LAN.
- **A11y:** axe on every route; keyboard-only editing; ARIA mirrors the a11y
  trees captured in RE.

---

## 14. Roadmap (milestones)

Each milestone is shippable and has explicit acceptance criteria.

### M0 — Skeleton & dev env (½ week)
- pnpm/Turbo monorepo, `docker compose up` (pg/redis/minio/mailpit), Prisma
  migrations, Apollo server with `user` query, Vite React app with RR7 routes
  stubbed, CI.
- **Accept:** `pnpm dev` boots all services; `/` renders; `pnpm test` green;
  CI passes.

### M1 — Compiler core (1 week) ← *the heart*  — ✅ **built**
- `packages/typst-runtime` (version-pinned WASM, fonts, worker pool) + CodeMirror
  editor + pdf.js preview + diagnostics + toolbar + debounce/stale-drop.
- **Accept:** typing a doc with heading/math/grid/rect compiles & renders;
  broken doc shows squiggles + badge and keeps last good preview; all §7.3
  gotchas covered by tests.

> **Status.** Implemented as a single Vite app in `glyph/` (the monorepo split
> comes in M0). Engine: **`@vedivad/typst-web-service`** — one WASM worker
> providing the compiler, `typst-ide`, `typst-syntax` and `typstyle`, with
> Typst's default fonts bundled (no font vendoring). Editor: CodeMirror 6 whose
> highlighting, completion, hover, formatting and diagnostics all come from that
> engine. Preview: SVG pages rendered on demand, with **bidirectional**
> navigation — click a page to jump to its source (`clickJump`) and let the
> preview follow the cursor (`jumpFromCursor`). Verified headlessly (Playwright,
> in both `vite dev` and the production build): A4 page renders, 13 distinct
> `typ-*` highlight classes applied, 100 engine completions, engine hover text,
> click-to-source moves the cursor from line 1 to `== Mathematics`, follow-cursor
> scrolls the preview 549→806 px as the cursor moves down, and an injected
> `#unclosed(` produces a lint squiggle + gutter marker while keeping the last
> good page. Zero console errors.
>
> **Status (split).** The server half now exists as the standalone `server/`
> package: a `typst.ts` **native** (napi) render service with a warm worker pool,
> a byte-budgeted render cache, in-flight coalescing, and per-page SVG splitting.
> The editor keeps compiling locally and reaches the service only for durable
> artifacts — an **Export** menu (PDF in the browser; PDF/SVG/HTML/vector on the
> server), a live **server indicator** in the status bar, and a **Share preview**
> overlay showing exactly the pages a share link would serve. Vite proxies `/api`
> to the service in development, so no CORS setup is needed; without a running
> service the editor degrades to browser-only rather than breaking. Verified
> headlessly: 13/13 Playwright checks in `vite dev` (server pill reports
> `typst.ts 0.7.0` with workers and cache hits in its tooltip, the export menu
> lists all seven actions, a server PDF download is a real `%PDF-`, the share
> preview renders server pages whose geometry matches the local preview to within
> a rounding point, Escape closes it, zero console errors), 5/5 offline-degradation
> checks, and 23/23 render-service tests.
>
> **Status (editor).** The editor is now a full multi-file application rather than
> a single buffer: file tree with folders, inline rename/create, drag-to-move and
> upload; tabs with per-file undo history; project-wide search and replace;
> lexical outline; issues panel wired to compile diagnostics; settings; command
> palette; context menus; keyboard shortcut set; a hand-written ZIP export; and
> localStorage persistence. The composition and its two-store design are described
> in §7.2. Verified headlessly with two further suites — **39/39** UI checks
> (panels, palette, dialogs, theme, splitter, persistence, no console errors) and
> **28/28** workspace checks (folders, rename cascade, drag-move, cross-file
> `#import` compiling with a negative control that removes the import, squiggles +
> gutter markers + issue list, click-to-source reaching several lines, project-wide
> replace, ZIP contents, reload) — in **both** `vite dev` and the production
> build. Click-to-source needed a fix: the engine's `clickJump` only resolves
> points inside a text run's box, so the host probes a few points outward from the
> click before giving up.

### M2 — Auth, accounts, dashboard (1 week)
- Signup/signin/signout, sessions, email verify (Mailpit), reset, dashboard
  (projects grid/table, search, sort, templates, empty project), project CRUD,
  create-from-template.
- **Accept:** register → verify → login → create empty project → open editor;
  session cookie flags correct; logout all works.

### M3 — Files & assets (1 week)
- Multi-file projects, in-project folders, upload, blob storage (S3), magic
  files, rename/delete, thumbnails (server render), project settings, pin
  compiler version, `?download=1`.
- **Accept:** multi-file doc with an image compiles; thumbnail generated; upload
  rejects oversize/bad types.

### M4 — Realtime multiplayer (1.5 weeks)
- `apps/ws` Yjs server, awareness/cursors, offline IndexedDB cache, presence,
  "Online" indicator, read-only review clients.
- **Accept:** §8 acceptance; reconnect converges; no lost updates.

### M5 — Sharing & review (1 week)
- Share links (read-only / review-only / read-write), email invites, members +
  roles, comment create/reply/resolve anchored to ranges, suggestion mode.
- **Accept:** anonymous link opens correct mode; reviewer can comment but not
  write; member roles enforced server-side.

### M6 — Settings, storage, takeout, MFA (1 week)
- Account settings (name/avatar/emails/optin/password/MFA/telemetry/occupations/
  theme), storage meter, data takeout ZIP, delete account.
- **Accept:** TOTP enroll/verify/disable; takeout ZIP contains projects+files;
  delete cascades.

### M7 — Teams & folders (1 week)
- Team create/manage/members/invites/roles/domains, team projects, team storage,
  folders (Pro) incl. `/folder/:id`, transfer folder ownership, move projects.
- **Accept:** invite → accept → member sees team projects; folder move works;
  non-admin blocked from admin ops.

### M8 — Pro features (1.5 weeks)
- Paddle billing (subscriptions, payment method, invoices, cancel/resume),
  entitlements/feature flags, private packages + publish, VCS sync
  (GitHub/GitLab), Zotero/Mendeley.
- **Accept:** sandbox upgrade flips entitlements; push/pull round-trips a repo;
  publish a package and import it from another project.

### M9 — Enterprise SSO + exports (1 week)
- OIDC/IDP flows + access policy; export PDF/PNG/SVG/HTML/archive, present mode.
- **Accept:** OIDC discovery → test auth → activate provider → SSO login maps
  claims; each export format downloadable and valid.

### M10 — Hardening, a11y, observability, deploy (1 week)
- Rate limits, audit log, OTEL traces, analytics sink, axe/keyboard a11y,
  load test, prod Docker images, seed/demo data.
- **Accept:** all E2E green; budgets met; container images run behind a reverse
  proxy.

**Total ≈ 12–13 focused weeks** for one strong full-stack dev; parallelizable to
~7–8 weeks with 2–3 people (split web/editor, api/realtime, infra/billing).

---

## 15. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| typst.ts API drift (0.7.0 typings loose; `compile()` returns `any`) | compiler breakage | pin versions; wrap in `@glyph/typst-runtime`; regression tests per §7.3 |
| WASM size / memory on 8 GB box | dev friction | lazy-load per version; worker pool capped; `dev:lite` profile |
| Yjs scaling / conflicts | data loss | proven `y-websocket`; snapshot compaction; load test M10 |
| GraphQL contract drift from real app | clone incomplete | treat extracted ops as the spec; schema snapshot test |
| Billing correctness | money bugs | sandbox only in dev; idempotent webhooks; no real keys |
| OIDC complexity | schedule slip | isolate in M9; feature-flag off until ready |
| Legal/copy risk | takedown | strict clean-room; own code/assets/copy; OSS licenses |
| PDF-in-canvas interaction perf | UX | canvas + text layer; virtualize large docs |
| Fonts missing → tofu | broken render | vendor + license fonts; warm-compile check |

---

## 16. Definition of Done (v1.0)

- Every route in §7.1 exists and behaves as specced.
- Every operation in `typst-app-auth/notes/graphql-operation-inventory.txt` has a
  counterpart with tests.
- End-to-end: signup → project → multi-file compile → multiplayer → comment →
  share → export → upgrade (sandbox).
- Perf budgets (§13) met; axe clean; keyboard-complete editor.
- `docker compose` brings up the whole stack from zero on a fresh Codespace.
- Clean-room + license audit passes (no typst.app code/copy/assets).

---

## 17. Immediate first tasks (next 3 sessions)

1. **Scaffold M0** — monorepo, docker-compose, Prisma, Apollo `user` query, RR7
   routes stubbed, CI.
2. **Port M1** — extract the de-risked compiler core into `packages/typst-runtime`
   (+ `apps/web` editor/preview) with the §7.3 regression tests.
3. **Seed M5 slice** — session auth + create-project + `/project/:token` opening
   the real editor against Postgres.

---

## Appendix A — RE evidence this plan is built from

| Artifact | Use |
|---|---|
| `typst-app-auth/FINDINGS.md` | full narrative of the authenticated app |
| `typst-app-auth/export/bundle/graphql-documents.txt` | 157 GraphQL documents (spec for §6.1) |
| `typst-app-auth/notes/graphql-operation-inventory.txt` | op list for DoD |
| `typst-app-auth/notes/graphql/*`, `graphql-editor/*` | live request/response shapes (§5 model) |
| `typst-app-auth/captures/*.json` | routes, endpoints, WS, storage, a11y trees |
| `typst-app-auth/scenarios/*.json` | flows to mirror as Playwright E2E |
| `typst-app-auth/secrets note` | account created **"REA Recon Team"** `awKOdRGIzHBGLwoB0oaBy8` (delete on request) |

## Appendix B — RE operation → milestone map (abbrev.)

- Dashboard/account: `DashboardContent`, `Features`, `UserStorageQuery`,
  `UserMfa`, `UserIntegrationsQuery`, `EditUser/EditSettings`, `AddPassword`,
  `AddEmail/DeleteEmail/PromoteEmail`, `AcceptTos`, takeout → **M2/M6**
- Projects/files: `CreateProject*`, `DuplicateProject*`, `EditProject`,
  `DeleteProject*`, `UpdatesFile*`, `DeleteFiles*`, `CreateMagicFile*`,
  `ProjectFiles(Ids)`, `FileRefresh`, `NewRevisions` → **M2/M3**
- Realtime/comments: `ProjectJoin`, `CreateComment*`, `ResolveComment*`,
  `CommentRefresh` + `editing/v3` → **M4/M5**
- Sharing: `InviteProjectMember`, `EditProjectMember`, `DeleteProjectMember`,
  `ProjectInvitation*`, `ProjectRevokeInvitation*` → **M5**
- Teams/folders/SSO: `CreateTeam*`, `Team*`, `AddTeamDomain*`, `Folder*`,
  OIDC `*OidcProvider*`, `UpdateTeamIdpAccessPolicy*` → **M7/M9**
- Billing/packages/VCS/refs: `Issue/Cancel/Resume/Change*`, `PreviewBilling*`,
  `UpdateBillingInfo`, `GetInvoiceUrl`, `PublishPackage/DeletePackage`,
  `ConnectVcs/DisconnectVcs/VcsPush/VcsPull`, `SetUserInfoSource` → **M8**

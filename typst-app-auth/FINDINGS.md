# typst.app — authenticated web-app reverse engineering

Target: `https://typst.app/` — the **signed-in** Typst web app (dashboard, editor,
teams, settings, billing).
Method: REA 6.5.0 (`rea-agents`) — Playwright `capture-browser-scenario`
(launch mode), passive CDP `list-browser-targets` / `analyze-web-bundle`, static
`analyze-javascript-application`, plus direct static extraction from the bundle.
Browser: Chrome for Testing 149.0.7827.55 (`chromium-1228`), headless.

All findings come from a **user-owned account** (its own credentials) and from
publicly served assets. Credentials are declared as REA secrets backed by
environment variables and are redacted automatically in every capture — the
account email appears as `[REDACTED:typst_email]` throughout the Evidence.

Supersedes the anonymous recon in the previous workspace: the anon pass saw
`/play/` and the marketing shell; this pass covers the authenticated product.

---

## 0. How to reproduce

```bash
# REA CLI (same 6.5.0 used here)
npm install --global rea-agents

# Each scenario logs in and drives the real UI. Credentials are env-backed secrets.
TYPST_EMAIL=... TYPST_PASSWORD=... \
  rea capture-browser-scenario ./scenarios/scenario-03-auth-network.json --json > captures/03-auth-network.json
```

`scenarios/` holds the declarative REA scenarios; `captures/` holds the Evidence
JSON (see §11 for the index). No login is scripted into the capture files
themselves — values are `{ "source": "secret", "secret_id": ... }` references.

---

## 1. Authentication & session model

The sign-in surface is **server-rendered (Astro), not the React SPA.**

- Sign-in page: `https://typst.app/signin/` (route `/signin`, and
  `/signin/?...&SIGNIN_NEEDED=1&redirect=%2F` when hitting `/app/` signed out).
- The form is a plain HTML POST:

  ```html
  <form method="post" action="https://api.typst.app/v1/auth/signin">
    <input name="email"    id="email"    type="email">
    <input name="password" id="password" type="password">
    <input type="hidden" name="redirect" value="https://typst.app/" id="redirect-field">
    <input type="hidden" name="grant-id" id="grant-id">
    <input tabindex="-1" name="captcha-trap" id="captcha-trap" type="text">  <!-- honeypot -->
    <input type="submit" value="Sign in">
  </form>
  ```

  **The "Prove that you aren't a robot" field is a honeypot, not a captcha.** It
  is `tabindex="-1"` inside a `.inconspicuous` container positioned off-screen;
  leaving it empty is what a real user does. There is no Cloudflare/Turnstile/
  hCaptcha/reCAPTCHA on the sign-in path.
- Sign-up: `https://typst.app/signup/` → `api.typst.app/v1/to-signup`.
- OIDC/enterprise SSO hooks in the app: `/v1/hooks/oauth/oidc`,
  `api.typst.app/v1/auth/oidc`, `oauth/consent/`, plus a sign-in flow that
  redirects through `api.typst.app/v1/to-signin?signedouturl=<per-session origin>`.

**Session cookies** (captured, values hashed/redacted), all scoped to `.typst.app`:

| Cookie | Flags | Role |
|---|---|---|
| `__Http-typst-session` | HttpOnly, Secure, SameSite=Strict | authenticated session |
| `INSECURE_SIGNED_IN` | Secure, SameSite=Lax | lightweight "signed in" hint for static pages |
| `mp_47a3b71271e5a85fabbac7058fee9dfb_mixpanel` | SameSite=Lax | Mixpanel |

The session is also described by GraphQL (`UserStorageQuery`):

```json
"session": { "started": 1792102634681, "native": true, "sso": [] }
```

Sign-out is a plain link (no JS mutation):
`GET api.typst.app/v1/auth/logout` and `…/v1/auth/logout?all=true`
(plus variants `?redirect=…`, `?redirect-after-signin=…`).

Native/elevated auth also exists (`AddNative`, `UserForNativeAuthSetup`,
`UserForNativeElevation` operations).

---

## 2. App shell & route table

The authenticated app is the **React + React Router (framework mode)** SPA,
built with Vite/Rolldown, served with the bundle `assets/index-PUyMOzys.js`
(3,563,268 B — note the different hash from the anon recon's `index-gnwRyrW0.js`).

`/app/` is an alias for the dashboard and redirects to `/` when signed in.
The full recovered route table (`path` → component), extracted from the bundle:

| Path | Component |
|---|---|
| `/` | `DashboardSparkplug` (personal dashboard) |
| `/app/` | `DashboardSparkplug` (alias) |
| `/folder/:folderId` | `PersonalProjectList` |
| `/team/:teamId` | `TeamProjectList` |
| `/team/:teamId/manage` | `TeamSettings` |
| `/team/:teamId/manage/idps/openid-connect/:providerId` | `OidcProviderSettings` |
| `/settings/subscription` | `SubscriptionSettings` |
| `/settings/subscription/payment-method` | `ChangePaymentMethodPage` |
| `/project/:projectToken` | `EditorSparkplug` (project editor) |
| `/play` | `EditorSparkplug` (playground, kind `play`) |
| `/pro/` | `UpgradePage` |
| `/paddle` | `NoPlug` + `DefaultCheckoutPage` (cloud only) |
| `/settings` | account settings (personal) |

The banner wordmark links `/`, `/settings`, `/universe`, `/docs`, `/pro/`.

---

## 3. GraphQL API

- Endpoint: **`POST https://api.typst.app/v1/graphql`** — Apollo Client.
- `DashboardContent`/`Features` fire immediately after login; the anon response
  was `{"data":{"user":null,"features":[]}}`, the signed-in response returns the
  full user graph.
- **157 GraphQL documents are recoverable directly from the bundle** (they are
  embedded as both string literals and pre-parsed AST): **30 queries, 98
  mutations, 29 fragments.** Full text: `export/bundle/graphql-documents.txt`;
  compact inventory: `notes/graphql-operation-inventory.txt`.

### Queries

`CheckEmailVerification`, `CheckSubscription`, `CommentRefresh`, `DashboardContent`,
`Features`, `FetchVcsDirs`, `FetchVcsEmails`, `FetchVcsRefs`, `FileRefresh`,
`GetBillingInfo`, `GetCountryCode`, `NewRevisions`, `OidcProviderSettingsQuery`,
`PendingOidcProvidersQuery`, `ProjectFileIds`, `ProjectFiles`, `ProjectRefresh`,
`ReferenceManagerMeta`, `RefreshMendeley`, `RefreshVcs`, `RefreshZotero`,
`Subscription`, `SubscriptionDetails`, `SubscriptionDetailsWithTransactions`,
`TeamMemberQuery`, `UserForNativeAuthSetup`, `UserForNativeElevation`,
`UserIntegrationsQuery`, `UserMfa`, `UserStorageQuery`.

### Mutations (grouped by domain)

- **Account/auth**: `AcceptTos`, `AddEmailMutation`, `DeleteEmailMutation`,
  `PromoteEmailMutation`, `AddPassword`, `EditUserMutation`, `EditSettingsMutation`,
  `DeleteUserMutation`, `AddNative`, `DisconnectOAuth`, `AuthorizeOAuth`,
  `SubmitFeedback`, `CollectNps`, `CollectMarketResponse`.
- **MFA**: `BeginMfaEnrollment`, `ConfirmMfaEnrollment`, `BeginMfaTotpChange`,
  `ConfirmMfaTotpChange`, `RegenerateBackupCodes`, `ConfirmRegenerateBackupCodes`,
  `DisableMfa`.
- **Projects/files**: `CreateProjectMutation`, `DuplicateProjectMutation`,
  `DeleteProjectMutation`, `EditProject`, `UpdatesFileMutation`,
  `DeleteFilesMutation`, `CreateMagicFileMutation`, `ForceMagicFileSyncMutation`,
  `DisenchantFileMutation`, `ConvertToEditableTextMutation`, `ReportProject`.
- **Collaboration**: `InviteProjectMember`, `EditProjectMember`,
  `DeleteProjectMember`, `ProjectJoin`, `ProjectInvitationAcceptMutation`,
  `ProjectInvitationDeclineMutation`, `ProjectRevokeInvitationMutation`,
  `CreateCommentMutation`, `EditCommentMutation`, `DeleteCommentMutation`,
  `CreateCommentReplyMutation`, `EditCommentReplyMutation`,
  `DeleteCommentReplyMutation`, `ResolveCommentMutation`.
- **Teams**: `CreateTeamMutation`, `TeamEditMutation`, `TeamDeleteMutation`,
  `TeamMemberInviteMutation`, `TeamMemberEditMutation`, `TeamMemberDeleteMutation`,
  `TeamInvitationAcceptMutation`, `TeamInvitationDeclineMutation`,
  `TeamResendInvitationMutation`, `TeamRevokeInvitationMutation`,
  `AddTeamDomainMutation`, `DeleteTeamDomainMutation`,
  `RerollTeamDomainTokenMutation`, `TryVerifyTeamDomainMutation`,
  `UpdateTeamIdpAccessPolicyMutation`.
- **Enterprise OIDC/SSO**: `StartPendingOidcProviderWithDiscovery`,
  `StartPendingOidcProviderManually`, `StartOidcTestAuthentication`,
  `SetPendingOidcProviderCredentials`, `SetPendingOidcProviderClaims`,
  `SetPendingOidcProviderDomains`, `PromotePendingOidcProvider`,
  `DeletePendingOidcProviderMutation`, `UpdateOidcProvider`,
  `UpdateOidcProviderDomains`, `RediscoverOidcProvider`,
  `DeleteOidcProviderMutation`, `DisassociateUserFromOidcProvider`,
  `GetOidcUpgradeUrl`.
- **Billing**: `IssueSubscription`, `CancelSubscription`, `UndoCancelSubscription`,
  `ResumeSubscription`, `ChangeBillingCycle`, `PreviewBillingCycleChange`,
  `ChangePaymentMethod`, `UpdateBillingInfo`, `GetInvoiceUrl`,
  `SubmitCancellationSurvey`.
- **Folders**: `createFolder`, `updateFolder`, `deleteFolder`.
- **Packages/VCS**: `PublishPackage`, `DeletePackage`, `ConnectVcs`,
  `DisconnectVcs`, `ReconnectVcs`, `VcsPullMutation`, `VcsPushMutation`.

### Fragments

`CoreAgentFields`, `CoreCommentFields`, `CoreCommentReplyFields`,
`CoreFeatureFields`, `CoreFileFields`, `CoreGrantSubscriptionFields`,
`CorePaymentMethodFields`, `CoreProjectFields`, `CoreSubscriptionFields`,
`CoreUserSubscriptionFields`, `DashboardUserFragment`, `DetailedEmailFields`,
`DetailedSubscriptionFields`, `DomainFields`, `FolderFields`,
`MendeleyFolderFragment`, `NewRevisionsFragment`, `OidcProviderFields`,
`OidcProviderSettingsFields`, `PendingOidcProviderFields`, `ProjectFilesFragment`,
`ProjectInviteFields`, `ProjectMetaFragment`, `ProjectUserFragment`,
`ProjectVcsFields`, `TeamFields`, `TeamInviteFields`, `TransactionsFields`,
`ZoteroCollectionFragment`.

### Observed shaped responses

`Features` (server-driven capability gating):

```json
{"data":{"user":{"id":"…","telemetryLevel":"FULL"},
 "features":[{"name":"storage-subscription","expires":null,"metric":204800},
             {"name":"zotero-sync"},{"name":"mendeley-sync"},
             {"name":"github-sync"},{"name":"gitlab-sync"}]}}
```

`ProjectFileIds` → `projectFiles[].files[].isMultiplayable`, and
`ProjectFiles` carries `ProjectMetaFragment` (share links, members, invites, VCS,
packages, settings), `CoreFileFields` (`magicKind`, `etag`, `version`,
`lastChange`), and the comment fields.

Account model: `User` → `email`, `emailOptin`, `storageUsage{used,available}`,
`emails[]`, `vcsProjects`, `occupations`, `hasPassword`, `ssoConnections`,
`teams[]`, `subscriptions[]`, `transactions[]`, `billingInformation`, `mfa`,
`terms`, `feed`, `headsUp`, `projectInvitations`, `teamInvitations`, `settings`.

---

## 4. REST & non-GraphQL endpoints

Observed live (from captures) plus bundle-derived:

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `api.typst.app/v1/graphql` | GraphQL (Apollo) |
| POST | `api.typst.app/v1/auth/signin` | form login |
| POST | `api.typst.app/v1/auth/signup` (`/v1/to-signup`) | registration |
| GET | `api.typst.app/v1/auth/logout` (`?all=true`) | sign out |
| GET | `api.typst.app/v1/to-signin?signedouturl=…` | sign-in redirect |
| GET | `api.typst.app/v1/verify/confirm`, `/v1/double-opt-in`, `/v1/auth/resend-validation` | email verification |
| GET | `api.typst.app/v1/files/:projectId/:fileId/yjs` | load file Yjs state |
| POST | `api.typst.app/v1/projects/:projectId/thumb/:hash` | upload thumbnail |
| GET | `api.typst.app/v1/projects/:projectId/thumb/:hash` | fetch thumbnail |
| GET | `api.typst.app/v1/package/local/index.json?context=<user\|projectId>` | local packages index |
| GET | `api.typst.app/v1/package/:scope/:name/index.json` | package index |
| GET | `api.typst.app/v1/avatar/:id` (`?teamId=`, `?providerId=`) | avatars |
| ANY | `api.typst.app/v1/{resource}` | generic REST wrapper `${API_URL}/v1/${path}` |
| POST | `api.typst.app/v1/hooks/oauth/oidc`, `auth/oidc`, `oauth/consent/` | OIDC |
| WS | `wss://api.typst.app/editing/v3?clientId=<8-char>` | live editing (Yjs) |
| POST | `misc-b.typst.app/events/track/` | product analytics |
| GET | `misc-a.typst.app/js/script.pageview-props.revenue.js` | revenue analytics |
| — | `packages.typst.org/preview/index.json` | public package registry |
| — | `cdn.paddle.com/paddle/v2/paddle.js`, `api.paddle.com/pricing-preview` | billing/Paddle |
| — | `public.profitwell.com/js/profitwell.js` | billing analytics |

---

## 5. Editor (project & playground)

Same editor for `/project/:token` and `/play` (`EditorSparkplug`):

- **CodeMirror 6** source pane; Typst compiler as **WASM** in workers; preview is
  the compiled output.
- On load it fetches `api.typst.app/v1/package/local/index.json?context=<projectId>`
  and `api.typst.app/v1/files/<projectId>/<fileId>/yjs`, then opens
  **`wss://api.typst.app/editing/v3?clientId=…`** — the **multiplayer / live-sync
  WebSocket**. Frames are binary (Yjs protocol); REA records direction + byte
  length only, e.g. sent 38/12/4/34 B, received 13/2/2 B.
- 7 workers spawn from `assets/worker-fecRb9ao.js` (Typst 0.15.1 chunk), pool
  warmed at load (matches the anon recon).
- Toolbar: font, bold, italic, underline, headings, list, enumeration, math,
  code block, Insert Reference, Add comment, scroll-preview-to-cursor.
- Right toolbar: zoom, "Show preview in popup", **Share**, "Quick export (PDF)",
  "Export…". Export menu offers **PDF** (marked "Previewed"), **PNG**, **SVG**,
  **HTML** ("Enable it in the project settings"), and **Project archive**.

**Menus** (recovered from the live a11y tree):

- **File**: New file (`Shift-Ctrl-N`), Upload file (`Ctrl-O`), Rename file (`F2`),
  Package project *(Pro)*, Quick export PDF (`Shift-Ctrl-S`), Export as ▸, Backup project.
- **Edit**: Undo/Redo, Search and replace (`Ctrl-F`), Go to line (`Ctrl-G`),
  Select all, Toggle line/block comment, Add a suggestion/comment *(Pro)*.
- **View**: File/Search/Outline/Improve (`Ctrl-Alt-3`)/Settings panels,
  Show collaborator cursors, Show toolbar, Scroll on type, Wrap lines,
  Split views (V/H), Theme, Cursor size, Only show editor/preview/both,
  Show preview in popup, Simulate color blindness, Present / Speaker mode *(Pro)*,
  Zoom in/out, Fit to width/height/page.

**Share dialog** (`Share "…"`): Create **read-only / review-only / read-write**
share links; "Share via email" is **Pro-gated** (email invites, private packages,
Git sync).

---

## 6. Settings, teams, folders, billing

**Account settings** (`/settings`) sections: Display name, Avatar, Email
addresses (add/promote/confirm), Updates from Typst, Password, **Two-factor
authentication**, Telemetry, "About you" (occupations), Theme (light/dark/system),
Subscription/upsell, Connections (Zotero, Mendeley, GitHub, GitLab — Pro),
Storage meter (`0/200MB` on free), Download my data (ZIP takeout), Session
(sign out one/all), Delete account.

**Teams** (created and inspected live):

- Create via dashboard **"Add new team"** → modal *Create new team*, field
  **Team name**, button **Create** → `CreateTeamMutation`.
- Team dashboard `/team/:id`; management `/team/:id/manage` shows Display name,
  Avatar, **Members** table (role Administrator/Member, delete member), **Add
  member** (dialog *Add member to …*, fields Email address + Role combobox,
  button Invite → `TeamMemberInviteMutation`), Storage, **Delete team**.
- Team invites, domains (`AddTeamDomainMutation`, `TryVerifyTeamDomainMutation`,
  `RerollTeamDomainTokenMutation`) and IDP/SSO exist in the API, but the
  **OIDC/IDP UI is feature-flagged off** for this account (`isOidcEnabled`
  gate in the bundle: only `DEBUG`/`onpremise` or specific team IDs).
- Limit string: "Each user can be an administrator of at most ten teams."

**Folders** are **Pro-only** on this account: clicking **New folder** opens the
*Upgrade to Typst Pro* dialog ("Organize your projects within folders"). The
GraphQL surface (`createFolder`/`updateFolder`/`deleteFolder`, `FolderFields`,
`/folder/:folderId`) is present but unusable without Pro.

**Billing / Pro**:

- `/settings/subscription` → `SubscriptionDetailsWithTransactions` (empty for
  free), `/pro/` → `GetBillingInfo`, `GetCountryCode` → Paddle checkout at
  `/paddle` (`DefaultCheckoutPage`).
- `/pro/`: monthly/annual billing toggle ("Switch to annual… get 17% off"),
  feature list (Present/draw slides, GitHub/GitLab sync, Zotero/Mendeley,
  private packages/templates, review comments, folders, 2GB + 1,000 files).

---

## 7. Static bundle facts

| Property | Value |
|---|---|
| Entry chunk | `assets/index-PUyMOzys.js`, 3,563,268 B |
| Framework | React + React Router v7 (framework mode) |
| Bundler | Rolldown via Vite (`assets/rolldown-runtime-CNC7AqOf.js`) |
| CSS | `assets/index-CAL7gfwj.css` |
| Service worker | `assets/serviceWorker-So4VqnvC.js` |
| Analytics | `assets/mixpanel.cjs-CFpifFKQ.js` |
| Compiler | Typst 0.15.1 WASM `assets/core_bg-w9ivCOeS.wasm` (12 builds, 0.10–0.15.1) |
| Fonts | Inter, Cascadia Mono, Libertinus (Serif/Math), NewCM Math + `font-derived/font-index-v2.mpk` |
| Config | `CONFIG.API_URL=https://api.typst.app`, `APP_URL=https://typst.app`, `BUILD_MODE=cloud` |

Static analysis of the raw bundle (REA `analyze-javascript-application`):
873,880 AST nodes visited, 0 parse failures, 358 findings, 15,565 functions —
`captures/10-js-app-analysis.json` (large; gzipped).

`localStorage` keys seen: `side-panel-split-ratio`, `editor-split-ratio`,
`typst-last-chosen-project-starter`, Mixpanel keys.

---

## 8. Notable behaviours & gaps

- **Optimistic preview on error**: as before, the editor keeps the last good
  render on compile errors.
- **Thumbnail upload 400** on a fresh project (console:
  "The project thumbnail is invalid") — expected, no PNG/WebP in the project.
- The anon and authed bundles are the *same app*; only auth state differs. The
  different entry hash (`index-PUyMOzys.js` vs anon `index-gnwRyrW0.js`) reflects
  a redeploy, not a different surface.
- **`capture.limits`** (per-body/aggregate byte budgets) is present in REA HEAD
  but **not in the released 6.5.0** — captures here use the 6.5.0 defaults
  (64 KiB/body, 1 MiB retained allocation, 1,024 transactions). One large
  GraphQL response (a big `DashboardContent`) came back `unavailable` because of
  the default budget.
- OIDC/SSO and folders could not be exercised live (feature-gated / Pro-only);
  their shape is documented from the GraphQL documents and route table.

---

## 9. Side effects on the account

Per your approval, this recon **created** on the account:

- Team **"REA Recon Team"** — `https://typst.app/team/awKOdRGIzHBGLwoB0oaBy8`
- The **folder** was **not** created (Pro-only; the upgrade dialog appeared).

Nothing else was mutated. Say the word and I'll remove the team.

---

## 10. Files

```
typst-app-auth/
  scenarios/     # REA browser scenarios (env-backed secrets)
  captures/      # REA Evidence JSON (index below)
  export/bundle/ # downloaded app bundle + extracted GraphQL documents
  notes/         # decoded live GraphQL, operation inventory
```

## 11. Evidence index

| File | Bytes | Evidence ID |
|---|---|---|
| `captures/01-signin-recon.json` | 146 KB | `ev_c69c1b55…` |
| `captures/02-login.json` | 339 KB | `ev_ab1e1d51…` |
| `captures/03-auth-network.json` | 1.5 MB | `ev_534d36d0…` |
| `captures/04-editor.json` | 928 KB | `ev_0ca2c96c…` |
| `captures/05-ui-menus.json` | 867 KB | `ev_9252ff33…` |
| `captures/06-team-folder.json` | 800 KB | `ev_7e7dc606…` |
| `captures/07-team-manage.json` | 857 KB | `ev_ca1f6499…` |
| `captures/08-addmember-export.json` | 1.1 MB | `ev_d5f1878b…` |
| `captures/09-bundle-analysis.json` | 8 KB | `ev_f4547b58…` |
| `captures/10-js-app-analysis.json.gz` | 114 MB→gz | `ev_621c36bc…` |

| Scenario | Covers |
|---|---|
| `scenario-01-signin-recon.json` | sign-in page structure |
| `scenario-02-login.json` | login → dashboard |
| `scenario-03-auth-network.json` | dashboard/settings/subscription/pro + GraphQL bodies |
| `scenario-04-editor.json` | project editor + editing WebSocket |
| `scenario-05-ui-menus.json` | File/Edit/View menus, Share, panels |
| `scenario-06-team-folder.json` | create team (+ folder attempt) |
| `scenario-07-team-manage.json` | team management + members |
| `scenario-08-addmember-export.json` | Add-member dialog, export menu |

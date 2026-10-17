# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Writers and researchers working on long-form documents — theses, papers, lab
notes, reports — who care about how the page looks and who need math, figures
and citations to be correct. They work at a laptop for extended sessions, often
offline or on unreliable networks, and they export to PDF for submission,
sharing, or review. A secondary audience is technical writers comfortable with a
plain-text workflow who want a real compiler rather than a word processor.

## Product Purpose

glyph is a browser Typst editor with a real engine underneath: live vector
preview, real diagnostics with source locations, multi-file projects, and
exports that do not depend on the visitor's machine. Success means the writer
stops thinking about tooling and trusts what they see on the page.

## Positioning

The editor runs the same Typst compiler in the browser (WebAssembly) that the
render service runs natively on the server. The preview is compiled output, not
a mock or an approximation, and it keeps working with the service stopped. Most
web document editors either edit HTML and approximate print, or require a
compile round trip to show anything true.

## Operating Context

Long writing sessions in a browser tab; projects with folders, images and
multiple `.typ` files; math, tables, figures, bibliographies; click a rendered
page to jump to its source; export PDF for a supervisor, journal or repository.
The current build stores the workspace in `localStorage` and has no server-side
accounts. Authentication, dashboard projects, and sharing on this surface are a
local product demonstration unless a real backend is added.

## Capabilities and Constraints

- Browser engine: `@vedivad/typst-web-service` 0.18.8 (WASM, Web Worker).
- Server engine: `@myriaddreamin/typst-ts-node-compiler` 0.7.0 (native N-API).
- Working today: live compile, syntax highlighting, completion, hover,
  formatting, diagnostics, click-to-source, follow-cursor, multi-file workspace,
  project search and replace, outline, issues, ZIP export, local persistence,
  browser PDF export, server PDF/SVG/HTML/vector export, share preview.
- No real accounts, no database, no collaboration, no cloud sync, no billing in
  this repository. Do not imply otherwise in product copy.
- The demo dashboard and auth screens in this redesign are local-only and must
  say so where a visitor could mistake them for a hosted account.

## Brand Commitments

- Name: **glyph**, lowercase.
- Clean-room clone of the Typst web app: no copied source, assets, or copy from
  `typst.app`; behaviour is reconstructed from public docs and the open-source
  toolchain.
- Visual direction pinned by the user for this redesign: a modern Y Combinator
  startup. Orange is the signal colour; the product itself is the proof.
- The editor must remain fully usable with the render service offline.

## Evidence on Hand

- `server/test/render.test.ts`: 23 passing tests covering engine, cache, paths,
  SVG splitting and HTTP.
- Measured render performance documented in `README.md`: ~0.7 ms warm compile,
  ~1.4 ms cached round trip on the development machine.
- Bundled fonts in the browser engine: Libertinus Serif, New Computer Modern
  Math, DejaVu Sans Mono.
- No testimonials, customer logos, funding claims, or user counts exist. Do not
  invent them.

## Product Principles

1. **The page is the proof.** Show compiled output, not screenshots of output.
2. **Truth over reassurance.** Diagnostics, errors and offline states are
   visible and specific; the interface never pretends work succeeded.
3. **The tool disappears.** Chrome is dense, quiet and keyboard-first; the
   document gets the light.
4. **One engine, two places.** Browser and server must agree because they are
   the same compiler, not because we tune them to match.
5. **Local-first by default.** Editing works without a network; server features
   are additive.

## Accessibility & Inclusion

Keyboard-first operation is a core requirement (the editor already exposes a
full shortcut set). Body text and controls must meet WCAG AA contrast in both
themes; focus must remain visible; motion must not be required to understand
state.

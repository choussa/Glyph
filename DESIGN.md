---
name: glyph
description: A browser Typst editor for serious writing, with a real compiler under the page.
colors:
  ink: "#141414"
  paper: "#FFFFFF"
  paper-warm: "#FBFAF7"
  line: "#E4E1D9"
  line-soft: "#EFEDE7"
  text-muted: "#5F5C55"
  text-faint: "#77736A"
  yc-orange: "#FF6600"
  orange-ink: "#C44700"
  orange-tint: "#FFF4E8"
  desk: "#ECEAE4"
  success: "#1F7A4D"
  danger: "#B3362B"
  warning: "#8F5B00"
  dark-ground: "#0F0F0E"
  dark-panel: "#171716"
  dark-line: "#30302B"
  dark-text: "#F3F1EA"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(46px, 6.6vw, 86px)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(30px, 3.5vw, 44px)"
    fontWeight: 750
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.62
    letterSpacing: "-0.006em"
  document:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "11pt"
    fontWeight: 400
    lineHeight: 1.55
  data:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0.06em"
rounded:
  sm: "2px"
  md: "3px"
  lg: "5px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "clamp(56px, 8vw, 96px)"
components:
  button-primary:
    backgroundColor: "{colors.yc-orange}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "0 13px"
  button-primary-hover:
    backgroundColor: "#FF7A1F"
    textColor: "{colors.ink}"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "0 13px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "0 13px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "44px"
  app-tab-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  project-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "11px 12px"
---

# glyph — The Submission Desk

## Overview

glyph is a Typst editor for writers and researchers, and the interface is built
around the artifact they hand over: the page. The visual world is a **submission
desk** — bright paper, dense ink, hairline rules, and one orange signal reserved
for live state and primary action. It borrows the directness of a modern YC
product without the startup theater: no invented customers, no decorative
metrics, and no marketing gradients. The compiled document is the evidence.

The world applies to three surfaces: the marketing page, the local project
dashboard, and the editor. Each surface keeps its own job: persuade, orient, or
get out of the way.

## Colors

- **Ink `#141414`** is the primary text, solid button, wordmark square, and
  status bar. It replaces pure black so photography and warm paper sit together.
- **Paper `#FFFFFF`** and **paper-warm `#FBFAF7`** are the ground and the
  secondary chrome surface. Warmth is limited to panel grounds, never the whole
  page.
- **YC orange `#FF6600`** is a *signal*, not a wash. It marks the primary
  action, the active tab/rail marker, compile state, the caret, and the one
  full-bleed conversion band. Text on orange is ink, never white, to keep
  contrast above 7:1.
- **Orange ink `#C44700`** is the accessible orange for text on white and warm
  paper (4.7:1) and for active labels. `#FF6600` itself is only used for large
  display type or as a fill.
- **Line `#E4E1D9`** replaces shadows for separation. **Desk `#ECEAE4`** is the
  paper-desk behind rendered pages.
- **State colors** are functional: success green `#1F7A4D`, danger `#B3362B`,
  warning `#8F5B00`. They appear in diagnostics and service status only.
- The dark theme mirrors the roles: ground `#0F0F0E`, panel `#171716`, line
  `#30302B`, text `#F3F1EA`, with the same orange signal.

## Typography

Three families, each with a job:

- **Archivo** — interface, navigation, buttons, and display. Display runs at
  800 weight with -0.04em tracking (the floor); headings step down in weight
  to 750/650. It is a grotesque with enough squareness to feel like signage
  rather than a neutral SaaS default.
- **Literata** — the document's literary register. It is used for the rendered
  page, document thumbnails, and the single quotation on the auth screen. It
  never leaks into UI labels.
- **JetBrains Mono** — code, measurements, metadata, shortcuts, and the status
  bar. Mono is reserved for facts that are read as data, never as costume.

Body measure stays between 54–66ch. Uppercase mono labels use 0.06–0.09em
tracking and 9–10px. Display never exceeds 86px.

## Layout

The landing page is a masthead, not a split hero: headline and CTA on the
left, a real engine spec ledger on the right, and the working editor stage
spanning the full width beneath them. Sections are separated by full-width
rules at the text ink, not by floating cards.

The dashboard is a 248px sidebar plus a dense project table. Projects are rows
with a small paper thumbnail, not a card grid; templates are a ledger of
one-line tiles. The table exposes edited time, length, and word count in mono.

The editor is the original three-column workbench (rail, panel, panes) with a
shorter 52px top bar and a 30px ink status strip. Panes split horizontally
above 1080px and stack vertically below it; the side panel becomes a 220px
overlay with a scrim under 900px. The first viewport always shows the
document, not a stack of controls.

Spacing follows 4/8/16/24/32/48/64/96. Sections use `clamp(56px, 8vw, 96px)`
vertical rhythm. Tight groups stay tight: label to input is 7px, field to
field is 17px, heading to body is 10–18px.

## Elevation & Depth

The system is flat by default. Depth is carried by **hairline borders and
tonal paper steps**, not by layered shadows. Only two places earn a shadow:

- the rendered A4 page on its desk (offset, soft, two-layer), and
- floating surfaces (menus, dialogs, the narrow-panel overlay).

No zero-offset colored halos, no glass, no gradient chrome. Hover states use a
paper tint; focus uses a 3px orange-tinted ring plus a 2px orange outline.
Active navigation is a warm tint with an orange icon, not a colored side bar.

## Shapes

Radii are small and purposeful: 2px for buttons, inputs and menu items, 3px for
the wordmark square and cards, 5px for dialogs. Pills are reserved for the
avatar circle and status dots. Rules are 1px; the strong top rule on major
sections is 1px ink. There are no 12–20px rounded cards.

The wordmark is a black 3px-radius square with a lowercase `g` set in orange
mono. The same mark appears in orange-on-ink on the auth aside. It is a stamp,
not a logo lockup.

## Components

**Buttons.** 34px high, 12.5px Archivo 600. Primary is orange with ink text;
ink is solid ink with paper text; outline is a hairline. Large page actions are
44px. Buttons never use white text on orange.

**Inputs.** 44px on auth, 29–36px in the app; white ground, 1px line, 2px
radius. Focus moves the border to ink and adds the orange ring.

**Tabs.** 36px, paper-warm ground, hairline separators. The active tab is paper
with a 2px orange top rule and an ink label. Dirty files carry an orange dot.

**Side panel.** Paper white with a mono 42px header; rows are 26px. The active
file is a warm orange tint; entry files carry a solid orange `ENTRY` tag.

**Status bar.** Ink ground with paper text. Compile state is a 5px orange dot
plus a mono latency. This is the editor's signature move: the compiler's
honesty lives in one line at the bottom of the screen.

**Rendered page.** A4 white on the desk, with a two-layer shadow, page number in
the corner, and click-to-source. The page is never framed by a decorative card.

## Do's and Don'ts

**Do**

- Let the compiled page carry the proof. Show the artifact before the feature.
- Use orange for one live signal at a time: primary action, active tab, compile
  dot, caret.
- Use hairlines, mono metadata and paper tint to build density.
- Keep the editor keyboard-first and the chrome quiet.
- State local-only behaviour plainly on the auth and dashboard surfaces.

**Don't**

- Don't use orange as a background wash outside the one conversion band.
- Don't put white text on `#FF6600`.
- Don't introduce gradients, glass, neon glows, or decorative icons.
- Don't invent customers, funding, usage counts, or collaboration claims; this
  build has no account server.
- Don't use Literata or mono for UI labels; they have document and data jobs.
- Don't exceed -0.04em tracking on display type or 6rem on its size.
- Don't replace the paper/ink ground with a dark "editor" theme by default; the
  light world is the product, and dark is a user preference.

# Fonts

The render service ships the same font families the browser engine bundles, so a
server-rendered export matches the preview a user sees in the editor.

| File(s) | Family | Version | License |
| --- | --- | --- | --- |
| `LibertinusSerif-Regular/Bold/Italic/BoldItalic.ttf`, `LibertinusMath-Regular.ttf` | Libertinus Serif, Libertinus Math | 7.051 | SIL Open Font License 1.1 |
| `NewCMMath-Regular.otf`, `NewCMMath-Bold.otf` | New Computer Modern Math | 4.1 | GUST Font License |
| `DejaVuSansMono.ttf` | DejaVu Sans Mono | 2.37 | Bitstream Vera / DejaVu (permissive) |

These are the families Typst reaches for by default:

- body text — `Libertinus Serif`
- mathematics — `New Computer Modern Math`
- code — `DejaVu Sans Mono`

All four resolve with zero warnings, and each is verified by the render tests.

## Sources

- Libertinus 7.051 — <https://github.com/alerque/libertinus> (SIL OFL 1.1; see
  the upstream `OFL.txt`).
- New Computer Modern — <https://ctan.org/pkg/newcomputermodern> (the math
  fonts are distributed under the GUST Font License; see the upstream
  `License.txt`).
- DejaVu Sans Mono — <https://dejavu-fonts.github.io/> (Bitstream Vera Fonts
  Copyright, plus public-domain additions).

## Replacing them

Point `GLYPH_FONTS_DIR` at another directory to serve a different font set. The
directory is scanned at compiler construction, so a worker restart picks up
changes. Keeping the set small is deliberate: font parsing dominates cold start
(~1.5 s cold, ~25 ms warm), and a smaller set keeps every worker's resident set
low.

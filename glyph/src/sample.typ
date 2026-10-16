#set page(width: 21cm, height: 29.7cm, margin: 2.5cm)
#set text(font: "Libertinus Serif", size: 11pt)
#set heading(numbering: "1.")

= glyph

A clean-room Typst editor. Edit the source on the left and the pages on the
right recompile as you type.

== Features

- Live compilation in a Web Worker
- Real Typst via `typst-web-service`
- Click a page to jump to its source, or let the preview follow your cursor
- Completions, hover, formatting and diagnostics from the engine

== Mathematics

$ integral_0^oo e^(-x^2) dif x = sqrt(pi)/2 $

== A small table

#table(
  columns: (auto, auto, auto),
  [*Feature*], [*Status*], [*Owner*],
  [Editor], [done], [CodeMirror 6],
  [Engine], [done], [typst-web-service],
  [Preview], [done], [SVG],
)

== Code

```typst
#let greet(name) = [Hello, #name!]
#greet("world")
```

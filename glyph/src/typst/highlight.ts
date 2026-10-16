// Syntax highlighting from the engine's own parser (typst-syntax), via the
// service worker. We ask `project.highlight(source, from, to)` for the visible
// range and apply the returned spans as mark decorations carrying Typst's own
// stable `typ-*` classes — the same classes the real typst.app editor uses.
// There is no second grammar to drift from the parser.
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';
import type { HlSpan, TypstProject } from '@vedivad/typst-web-service';

const setHighlights = StateEffect.define<DecorationSet>();

const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    // Keep the previous highlights tracking edits until the next request lands.
    value = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setHighlights)) value = effect.value;
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** Build a sorted decoration set from worker spans (already CodeMirror offsets). */
function decorationsFor(spans: HlSpan[], docLength: number): DecorationSet {
  const ranges = [];
  for (const span of spans) {
    const from = Math.max(0, Math.min(span.from, docLength));
    const to = Math.max(0, Math.min(span.to, docLength));
    // Mark decorations must be non-empty.
    if (to > from) ranges.push(Decoration.mark({ class: span.tag }).range(from, to));
  }
  // `true` sorts by (from, startSide); spans may nest (typ-strong > typ-func).
  return Decoration.set(ranges, true);
}

class HighlightPlugin implements PluginValue {
  private requestId = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;

  constructor(
    private readonly view: EditorView,
    private readonly project: TypstProject,
    private readonly debounceMs: number,
  ) {
    this.schedule();
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged) this.schedule();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
  }

  private schedule(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.refresh();
    }, this.debounceMs);
  }

  private async refresh(): Promise<void> {
    const id = ++this.requestId;
    const doc = this.view.state.doc;
    const { from, to } = this.view.viewport;
    let spans: HlSpan[];
    try {
      spans = await this.project.highlight(doc.toString(), from, to);
    } catch {
      // Worker still initialising, or the project was torn down.
      return;
    }
    // Drop stale results: superseded, destroyed, or the document moved on.
    if (this.destroyed || id !== this.requestId || this.view.state.doc !== doc) return;
    this.view.dispatch({ effects: setHighlights.of(decorationsFor(spans, doc.length)) });
  }
}

/** Typst syntax highlighting: decorations only; colours come from `typ-*` CSS. */
export function typstHighlighting(project: TypstProject, debounceMs = 30): Extension {
  return [highlightField, ViewPlugin.define((view) => new HighlightPlugin(view, project, debounceMs))];
}

// Diagnostics from the engine's compile, rendered as CodeMirror lint squiggles.
// The engine reports UTF-8 byte offsets; `byteToCmOffset` maps them back to the
// editor's UTF-16 positions.
//
// The plugin follows the *active* path through a getter rather than being bound
// to one file, because a single `EditorView` serves every open tab.
import { setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { StateEffect, type Extension } from '@codemirror/state';
import { ViewPlugin, type EditorView, type PluginValue, type ViewUpdate } from '@codemirror/view';
import {
  byteToCmOffset,
  normalizePath,
  type Diagnostic,
  type TypstProject,
} from '@vedivad/typst-web-service';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));

/**
 * Ask the lint plugin to re-read diagnostics for the current path. Dispatched by
 * the host when the active tab changes, since switching tabs replaces the state
 * without a document edit.
 */
export const refreshLint = StateEffect.define<void>();

class DiagnosticsPlugin implements PluginValue {
  private destroyed = false;
  private scheduled = false;
  private readonly unsubscribe: () => void;
  private last: Diagnostic[] = [];

  constructor(
    private readonly view: EditorView,
    project: TypstProject,
    private readonly getPath: () => string,
  ) {
    this.unsubscribe = project.onCompile((result) => this.apply(result.diagnostics));
    // A late subscriber receives the last result synchronously — possibly while
    // CodeMirror is mid-update, so it is only stored, never dispatched here.
    this.last = project.lastResult?.diagnostics ?? [];
    this.schedule();
  }

  private apply(all: Diagnostic[]): void {
    this.last = all;
    this.schedule();
  }

  /**
   * Re-project the stored diagnostics onto the current document, one microtask
   * later. Dispatching from inside a plugin update (or the constructor) is
   * illegal — CodeMirror throws "update is in progress".
   */
  private schedule(): void {
    if (this.scheduled || this.destroyed) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.flush();
    });
  }

  private flush(): void {
    if (this.destroyed || !this.view.dom.isConnected) return;
    const path = normalizePath(this.getPath());
    const doc = this.view.state.doc;
    const text = doc.toString();
    const out: CmDiagnostic[] = [];

    for (const diagnostic of this.last) {
      const location = diagnostic.location;
      // The engine reports paths without the leading slash (e.g. `main.typ`).
      if (location && normalizePath(location.file) !== path) continue;

      let from = 0;
      let to = Math.min(1, doc.length);
      if (location) {
        from = clamp(byteToCmOffset(text, location.start), 0, doc.length);
        to = clamp(byteToCmOffset(text, location.end), 0, doc.length);
        if (to < from) to = from;
      }

      out.push({
        from,
        to,
        severity: diagnostic.severity === 'error' ? 'error' : 'warning',
        message: diagnostic.hints.length
          ? `${diagnostic.message}\n\n${diagnostic.hints.join('\n')}`
          : diagnostic.message,
      });
    }

    this.view.dispatch(setDiagnostics(this.view.state, out));
  }

  update(update: ViewUpdate): void {
    for (const transaction of update.transactions) {
      for (const effect of transaction.effects) {
        if (effect.is(refreshLint)) this.schedule();
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.unsubscribe();
  }
}

/** Compile diagnostics for the active path, from the engine's `onCompile` stream. */
export function typstDiagnostics(project: TypstProject, getPath: () => string): Extension {
  return ViewPlugin.define((view) => new DiagnosticsPlugin(view, project, getPath));
}

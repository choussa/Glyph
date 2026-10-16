// Hover tooltips from the engine's `typst-ide`: signatures and docs for
// functions, values for expressions, with code values syntax-highlighted by the
// same parser that compiles the document.
import type { Extension } from '@codemirror/state';
import { hoverTooltip } from '@codemirror/view';
import type { TypstProject } from '@vedivad/typst-web-service';

/** Typst hover tooltips for the active path. */
export function typstHover(project: TypstProject, getPath: () => string): Extension {
  return hoverTooltip(async (view, pos) => {
    const hover = await project.hover(getPath(), view.state.doc.toString(), pos);
    if (!hover) return null;

    const html = hover.kind === 'code' ? await project.highlightHtml(hover.value) : null;

    return {
      pos,
      end: pos,
      create() {
        const dom = document.createElement('div');
        dom.className = 'cm-typst-hover';
        if (html !== null) {
          const pre = document.createElement('pre');
          pre.className = 'cm-typst-hover-code';
          pre.innerHTML = html;
          dom.appendChild(pre);
        } else {
          dom.textContent = hover.value;
        }
        return { dom };
      },
    };
  });
}

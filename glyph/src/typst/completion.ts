// Autocomplete backed by the engine's own `typst-ide`, so completions are what
// the parser actually knows: builtins, locals, labels, packages, fonts, symbols.
import {
  snippet,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import type { TypstProject } from '@vedivad/typst-web-service';

const WORD = /[\w.-]*/;

/** Completions at the cursor, sourced from `project.completion`. */
export function typstCompletionSource(
  project: TypstProject,
  getPath: () => string,
): CompletionSource {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const word = context.matchBefore(WORD);
    if (!word) return null;
    if (word.from === word.to && !context.explicit) return null;

    const response = await project.completion(
      getPath(),
      context.state.doc.toString(),
      context.pos,
      context.explicit,
    );
    if (!response || response.completions.length === 0) return null;

    const options: Completion[] = response.completions.map((candidate) => {
      const apply = candidate.apply;
      return {
        label: candidate.label,
        type: candidate.kind,
        detail: candidate.detail ?? undefined,
        // `apply` may carry `${placeholder}` snippets; fall back to the label.
        apply:
          apply && apply !== candidate.label
            ? apply.includes('$')
              ? snippet(apply)
              : apply
            : undefined,
      };
    });

    return {
      from: Math.max(0, Math.min(response.from, context.pos)),
      options,
      validFor: WORD,
    };
  };
}

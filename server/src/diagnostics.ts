/**
 * Normalising the engine's diagnostics into the shape the app uses.
 *
 * `typst.ts` reports diagnostics as `{ message, package, path, range, severity }`.
 * Two things are worth knowing:
 *
 * - **There are no positions.** `range` is always `null` in 0.7.0, and hints are
 *   folded into the message text as `"<message>, hints: <hint>"`. The browser
 *   engine (`typst-ide`) is the one that produces precise ranges, which is why
 *   the editor takes its squiggles from the worker and not from here.
 * - **Severity is numeric**: `1` is an error, `2` is a warning.
 */
export type Severity = 'error' | 'warning';

export interface Diagnostic {
  severity: Severity;
  message: string;
  hints: string[];
  file?: string;
  package?: string;
}

interface RawDiagnostic {
  message?: string;
  package?: string;
  path?: string;
  severity?: number;
}

const HINT_MARKER = ', hints: ';

/** Split the engine's `"<message>, hints: <hint>"` form. */
export function splitHints(message: string): { message: string; hints: string[] } {
  const at = message.indexOf(HINT_MARKER);
  if (at === -1) return { message, hints: [] };
  return {
    message: message.slice(0, at),
    hints: [message.slice(at + HINT_MARKER.length)],
  };
}

/** Normalise a batch of engine diagnostics. */
export function normalizeDiagnostics(raw: unknown, severity: Severity): Diagnostic[] {
  if (!Array.isArray(raw)) return [];
  const out: Diagnostic[] = [];
  for (const item of raw as RawDiagnostic[]) {
    if (!item || typeof item.message !== 'string') continue;
    const { message, hints } = splitHints(item.message);
    out.push({
      severity,
      message,
      hints,
      file: item.path || undefined,
      package: item.package || undefined,
    });
  }
  return out;
}

export function countErrors(diagnostics: Diagnostic[]): number {
  return diagnostics.reduce((n, d) => (d.severity === 'error' ? n + 1 : n), 0);
}

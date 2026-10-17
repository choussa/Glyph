/**
 * The engine the editor runs.
 *
 * Imported from the repository-wide `engine.json` so the editor and the render
 * service cannot drift apart on the Typst version. The wrapper bundles its own
 * wasm (it has no `@myriaddreamin/typst.ts` dependency), so the version cannot be
 * read from the dependency graph — it is recorded once and shown to the user.
 */
import manifest from '../../../engine.json';

export const ENGINE = {
  /** The npm package that wraps the browser engine. */
  wrapper: manifest.browserPackage,
  wrapperVersion: manifest.browserVersion,
  /** The npm version of the shared typst.ts toolchain. */
  typstTs: manifest.typstTs,
  /** The Typst *language* version both engines compile. */
  typst: manifest.typst,
} as const;

/** One-line engine identity, for the About dialog and bug reports. */
export const ENGINE_LABEL = `${ENGINE.wrapper} ${ENGINE.wrapperVersion} · Typst ${ENGINE.typst}`;

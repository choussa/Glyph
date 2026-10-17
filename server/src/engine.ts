/**
 * The engine manifest — one place that records *which* Typst this service runs.
 *
 * The browser editor (`glyph/`) and this render service are the same compiler in
 * two compilation targets, so they must agree on the Typst *language* version:
 * that is what decides whether a given document compiles and how it lays out.
 * npm versions (`typst.ts` 0.7.0) do not tell you that, so the language version
 * is recorded here and asserted against the running engine in the test suite.
 *
 * `@vedivad/typst-web-service` bundles its own wasm (it does not depend on
 * `@myriaddreamin/typst.ts`), so the browser side cannot be derived from the
 * dependency graph — it is mirrored here and in `glyph/src/typst/engine.ts`.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const ENGINE = {
  /** npm package that provides the native compiler. */
  package: '@myriaddreamin/typst-ts-node-compiler',
  /** Its npm version. */
  typstTs: '0.7.0',
  /** The Typst language version it compiles (`sys.version`). */
  typst: '0.14.2',
  /** The browser wrapper, for display; mirrored in the editor. */
  browser: '@vedivad/typst-web-service@0.18.8',
} as const;

/** The installed npm version, read so a skew is detectable rather than silent. */
export const INSTALLED_TYPST_TS: string = (
  require('@myriaddreamin/typst-ts-node-compiler/package.json') as { version: string }
).version;

/** `true` when the installed package matches the manifest. */
export const ENGINE_IN_SYNC = INSTALLED_TYPST_TS === ENGINE.typstTs;

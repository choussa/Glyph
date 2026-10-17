/**
 * The engine manifest — one place that records *which* Typst this service runs.
 *
 * The browser editor (`glyph/`) and this render service are the same compiler in
 * two compilation targets, so they must agree on the Typst *language* version:
 * that is what decides whether a given document compiles and how it lays out.
 * npm versions (`typst.ts` 0.7.0) do not tell you that, so the language version
 * is recorded in the repository-wide `engine.json` (shared with the editor) and
 * asserted against the running engine in the test suite.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

interface EngineManifest {
  typst: string;
  typstTs: string;
  serverPackage: string;
  browserPackage: string;
  browserVersion: string;
}

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../engine.json', import.meta.url)), 'utf8'),
) as EngineManifest;

export const ENGINE = {
  /** npm package that provides the native compiler. */
  package: manifest.serverPackage,
  /** Its npm version. */
  typstTs: manifest.typstTs,
  /** The Typst language version it compiles (`sys.version`). */
  typst: manifest.typst,
  /** The browser wrapper, for display; mirrored in the editor. */
  browser: `${manifest.browserPackage}@${manifest.browserVersion}`,
} as const;

const require = createRequire(import.meta.url);

/** The installed npm version, read so a skew is detectable rather than silent. */
export const INSTALLED_TYPST_TS: string = (
  require(`${manifest.serverPackage}/package.json`) as { version: string }
).version;

/** `true` when the installed package matches the manifest. */
export const ENGINE_IN_SYNC = INSTALLED_TYPST_TS === ENGINE.typstTs;

import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the editor's pure modules.
 *
 * The editor's risky code is the part that models a project without the engine:
 * paths, the file tree, the outline scan, search/replace, ZIP, base64 and zoom
 * maths. Those are all synchronous and dependency-free, so the default `node`
 * environment is enough — no jsdom, no browser, no 6 MB wasm.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
});

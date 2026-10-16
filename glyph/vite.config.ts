import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';

/**
 * Where the render service listens in development (see `server/`).
 *
 * In production the app talks to the deployed service directly: set
 * `VITE_RENDER_URL` at build time (it becomes the client's base URL).
 */
const RENDER_SERVICE = 'http://localhost:8787';

export default defineConfig({
  plugins: [react(), wasm()],
  // The engine spawns its worker with `new Worker(new URL('./typsten-worker.js',
  // import.meta.url))` and fetches its wasm via `new URL('./typsten_bg.wasm', …)`.
  // Pre-bundling rewrites those URLs into a dead `.vite/deps/…?worker_file` path,
  // so the package must be served unbundled.
  optimizeDeps: {
    exclude: ['@vedivad/typst-web-service'],
  },
  worker: { format: 'es' },
  server: {
    host: true,
    port: 5173,
    // Same-origin in development, so server-backed actions need no CORS setup.
    proxy: {
      '/api': {
        target: RENDER_SERVICE,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    target: 'es2022',
  },
});

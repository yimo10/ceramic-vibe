import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

import { createShareHandler } from './server/share.mjs';

const r = (p) => fileURLToPath(new URL(p, import.meta.url));

// [v3] The share endpoint (QR code -> download page) runs inside the dev / preview server, so `npm run dev` is still the only command.
const shareServer = () => {
  const handler = createShareHandler({ dir: r('./server/shared') });
  return {
    name: 'share-server',
    // NOTE: the arrow functions use braces on purpose. Vite treats a *returned* function as a "post hook" and would call it
    // with the server object, which crashed with "Cannot read properties of undefined (reading 'url')".
    configureServer(s) { s.middlewares.use(handler); },
    configurePreviewServer(s) { s.middlewares.use(handler); }
  };
};

export default defineConfig({
  plugins: [shareServer()],
  base: '/', // relative paths: the built folder works from any sub-path or static host
  server: { host: true },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: { main: r('./index.html'), studio: r('./studio.html') }
    }
  }
});

/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// The deployment target is GitHub Pages (project site), which serves the app
// from a sub-path: https://<owner>.github.io/<repo>/. Vite therefore needs a
// matching `base` so that asset URLs resolve correctly once deployed.
//
// During the Pages build the workflow sets VITE_BASE (e.g. "/agent-forge-ui/").
// Locally `npm run dev`/`npm run build` fall back to "/" so the dev server and
// preview keep working without any sub-path configuration.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
  },
  // Vitest configuration. The jsdom environment provides browser-like DOM APIs
  // (document, DOMParser, …) so the front-end logic and HTML-structure tests
  // can run headlessly in CI. Test files live under src/**/__tests__/.
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});

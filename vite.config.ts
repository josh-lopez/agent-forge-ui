/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { resolveBasePath } from './src/lib/basePath';

// The deployment target is GitHub Pages (project site), which serves the app
// from a sub-path: https://<owner>.github.io/<repo>/. Vite therefore needs a
// matching `base` so that asset URLs resolve correctly once deployed.
//
// During the Pages build the workflow sets VITE_BASE (e.g. "/agent-forge-ui/").
// Locally `npm run dev`/`npm run build` fall back to "/" so the dev server and
// preview keep working without any sub-path configuration. The normalisation
// logic lives in `src/lib/basePath.ts` so it can be unit-tested in isolation.
const base = resolveBasePath(process.env.VITE_BASE);

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,js}'],
  },
});

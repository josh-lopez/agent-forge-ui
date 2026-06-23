// Vite config used ONLY by tests/test_simulator_di.sh to produce a real
// (Rollup-backed) production-style bundle of the webhook delivery DI seam, so
// the bundle-content check verifies tree-shaking exactly as the production
// `vite build` would. Not part of the app build.
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = resolve(import.meta.dirname, '..', '..');

export default defineConfig({
  root,
  build: {
    lib: {
      entry: resolve(root, 'src/delivery/index.ts'),
      formats: ['es'],
      fileName: () => 'delivery.js',
    },
    outDir: process.env.SIM_BUNDLE_OUTDIR || resolve(root, 'dist-sim-test'),
    minify: 'esbuild',
    emptyOutDir: true,
  },
});

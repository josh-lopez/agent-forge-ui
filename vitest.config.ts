import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

// Vitest reuses/extends the existing Vite config so that path aliases and any
// Vite-specific plugins/imports resolve identically in tests and in the app
// build. Keeping the Vitest configuration in its own file (rather than inlining
// a `test` block in vite.config.ts) prevents the test settings from being
// picked up during a normal `vite build`.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // jsdom gives tests a browser-like DOM environment (document, window…).
      environment: 'jsdom',
      // Allow `describe`/`it`/`expect` without explicit imports.
      globals: true,
      // Only pick up the TypeScript/JavaScript unit tests; the legacy bash
      // suites under tests/ are run separately by run_all.sh.
      include: ['tests/**/*.{test,spec}.{ts,tsx,js,jsx}'],
    },
  }),
);

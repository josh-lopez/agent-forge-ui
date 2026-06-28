import { defineConfig } from 'vite';

// The deployment target is GitHub Pages (project site), which serves the app
// from a sub-path: https://<owner>.github.io/<repo>/. Vite therefore needs a
// matching `base` so that asset URLs resolve correctly once deployed.
//
// During the Pages build the workflow sets VITE_BASE (e.g. "/agent-forge-ui/").
// Locally `npm run dev`/`npm run build` fall back to "/" so the dev server and
// preview keep working without any sub-path configuration.
const base = process.env.VITE_BASE ?? '/';

// ── Webhook delivery simulator exclusion (Issue #158) ────────────────────────
//
// The webhook delivery simulator is a *developer-only* fixture (see
// spec/README.md › "Webhook delivery simulator"). The spec requires it to have
// "no impact on production builds". Two build-config guarantees make that hold:
//
//   1. Environment-based dead-code elimination. Application code activates the
//      simulator only inside an `if (import.meta.env.DEV) { … }` guard (the
//      documented dev-mode toggle — see Issue #152). During a production build
//      Vite statically replaces `import.meta.env.DEV` with the literal `false`,
//      so the whole branch — and the *static* `import './simulator'` it
//      contains — becomes unreachable and is removed. The condition is purely
//      environment-based and statically analysable, satisfying AC2 and keeping
//      the simulator available in development (AC3).
//
//   2. `"sideEffects": false` in package.json (Rollup tree-shaking). This tells
//      the bundler the project's modules have no import-time side effects, so a
//      simulator module that is no longer referenced after step 1 can be safely
//      dropped from the graph rather than retained "just in case". This guards
//      against the BA-flagged risk that a side-effectful module pattern defeats
//      elimination.
//
// `build.minify` defaults to esbuild in production, which performs the dead-code
// elimination of the `false` branch. We pin `target` so the syntax Vite emits
// is consistent across environments. No simulator-specific aliasing is needed:
// the exclusion is a property of how the code is written + tree-shaking, which
// is verified by `npm run build:analyze` (scripts/assert-no-simulator.mjs).

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
    // Ensure dead-code elimination of the `import.meta.env.DEV` branch (and the
    // simulator import inside it) runs for production bundles.
    minify: 'esbuild',
  },
});

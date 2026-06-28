import { defineConfig, type Plugin } from 'vite';

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
// "no impact on production builds". This module guarantees that in two layers:
//
//   1. Environment-based stubbing (this plugin). `excludeSimulatorInProduction`
//      applies ONLY to production builds — it resolves Vite's `command` and
//      `mode` in `configResolved` and activates only when
//      `command === 'build'` AND `mode === 'production'`, so it never touches
//      the dev server or development-mode builds (`vite build --mode
//      development`). When active, its `transform` hook replaces the *body* of
//      any module whose id matches the simulator (e.g. `src/simulator.ts`) with
//      an inert stub, while preserving the module's export *signature* (the
//      exported names) so importers still type-check and link. Because the
//      replacement happens at the module's `transform` step, the simulator's
//      implementation never enters the bundle even when it is imported
//      unconditionally — the most robust defence against the BA-flagged risk
//      that an indirect/unconditional import defeats static tree-shaking. The
//      condition is purely environment/mode based and statically determined at
//      config-resolution time, satisfying AC2 while leaving the simulator fully
//      intact in development (AC3).
//
//   2. `"sideEffects": false` in package.json (Rollup tree-shaking). After the
//      stub replaces the simulator body, the now-inert module (and any of its
//      previously-imported bindings) can be tree-shaken out entirely rather
//      than retained "just in case". This guards against side-effectful module
//      patterns preventing elimination.
//
// The exclusion is verified by `npm run build:analyze`
// (scripts/assert-no-simulator.mjs), which fails the build if any simulator
// marker survives into a production bundle (AC1 / AC4).
//
// NB: vite.config.ts is exported in *object* form (not a callback) so that
// vitest.config.ts can `mergeConfig` it; the production gate therefore lives in
// the plugin's `configResolved` hook rather than a config callback.

// Matches the webhook delivery simulator module by path. Kept deliberately
// broad (any `simulator` file under the project) so it catches the simulator
// regardless of its exact filename/location, while never matching unrelated
// modules. The pattern operates on the resolved module id.
const SIMULATOR_ID_RE = /[\\/]simulator(\.[cm]?[jt]sx?)?$|simulator[^\\/]*\.[cm]?[jt]sx?$/i;

function isSimulatorModule(id: string): boolean {
  // Strip any Vite/Rollup query suffix (e.g. `?import`) before matching.
  const clean = id.split('?')[0];
  return SIMULATOR_ID_RE.test(clean);
}

// Build an inert ES-module stub that preserves the original module's export
// *signature* (so importers still link) but contains none of its body. The
// named exports are produced by scanning the source for `export` declarations;
// each becomes an `export const NAME = undefined` style binding. A `default`
// export is also emitted when the source has one.
function buildSimulatorStub(code: string): string {
  const named = new Set<string>();
  let hasDefault = false;

  // `export function foo`, `export async function foo`, `export function* foo`
  for (const m of code.matchAll(/export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g)) {
    named.add(m[1]);
  }
  // `export class Foo`
  for (const m of code.matchAll(/export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g)) {
    named.add(m[1]);
  }
  // `export const a = ...`, `export let b`, `export var c` (single or
  // comma-separated declarators)
  for (const m of code.matchAll(/export\s+(?:const|let|var)\s+([^=;{]+?)(?:[=;]|$)/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().replace(/:.*$/, '').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) named.add(name);
    }
  }
  // `export { a, b as c }` — record the *exported* name (after `as`).
  for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const piece = part.trim();
      if (!piece) continue;
      const asMatch = piece.match(/\bas\s+([A-Za-z_$][\w$]*)/);
      const exported = asMatch ? asMatch[1] : piece.split(/\s+/)[0];
      if (exported === 'default') {
        hasDefault = true;
      } else if (/^[A-Za-z_$][\w$]*$/.test(exported)) {
        named.add(exported);
      }
    }
  }
  // `export default ...`
  if (/export\s+default\b/.test(code)) {
    hasDefault = true;
  }

  const lines = ['/* simulator excluded from production build (Issue #158) */'];
  for (const name of named) {
    lines.push(`export const ${name} = undefined;`);
  }
  if (hasDefault) {
    lines.push('export default undefined;');
  }
  // Always include an empty export so the file is treated as an ES module even
  // when it had no analysable exports.
  lines.push('export {};');
  return lines.join('\n') + '\n';
}

function excludeSimulatorInProduction(): Plugin {
  let isProduction = false;
  return {
    name: 'agent-forge:exclude-simulator-in-production',
    // Only ever run during the production build pipeline. `apply: 'build'`
    // keeps it out of the dev server; the `configResolved` gate below keeps it
    // out of development-mode builds (`vite build --mode development`).
    apply: 'build',
    enforce: 'pre',
    configResolved(config) {
      isProduction = config.command === 'build' && config.mode === 'production';
    },
    transform(code, id) {
      if (!isProduction) return null;
      if (!isSimulatorModule(id)) return null;
      // Replace the simulator's source with an inert ES-module stub that keeps
      // its export signature but drops the entire body. The build then contains
      // none of the simulator's implementation; the stub bindings are
      // `undefined` and tree-shaken away.
      return { code: buildSimulatorStub(code), map: null };
    },
  };
}

export default defineConfig({
  base,
  plugins: [excludeSimulatorInProduction()],
  build: {
    outDir: 'dist',
    // Ensure dead-code elimination runs for production bundles so the now-
    // unreferenced simulator bindings are stripped.
    minify: 'esbuild',
  },
});

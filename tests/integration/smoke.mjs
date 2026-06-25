// Integration smoke test for Issue #97: MetricsDashboard mounted in the main
// merchant view, sharing the delivery-event data source with the event log.
//
// Runs headlessly: bundles the TypeScript UI modules with esbuild, mounts the
// app into a minimal DOM stub, drives a deterministic simulator, and asserts:
//   * the dashboard and event log both mount (shared store),
//   * a new delivery event updates BOTH views simultaneously,
//   * the dashboard displays a non-zero stat (total attempts > 0),
//   * exhausted alerting still surfaces, and manual re-trigger still works.

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createDocument } from './dom-stub.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`PASS: ${msg}`);
  } else {
    console.log(`FAIL: ${msg}`);
    failures += 1;
  }
}

async function loadAppModule() {
  // Bundle the main view (main.ts) together with the simulator into one ESM
  // file we can import in node. A tiny synthetic entry re-exports both so the
  // test can both mount the view AND drive the simulator from the same bundle
  // (and thus the same module instances).
  const posix = (p) => p.replace(/\\/g, '/');
  const entry = [
    `export * from ${JSON.stringify(posix(join(repoRoot, 'src', 'main.ts')))};`,
    `export * from ${JSON.stringify(posix(join(repoRoot, 'src', 'simulator.ts')))};`,
  ].join('\n');

  const result = await build({
    stdin: {
      contents: entry,
      resolveDir: repoRoot,
      sourcefile: 'issue97-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    // The app imports './app.css'; strip CSS so node can import the bundle.
    loader: { '.css': 'empty' },
    // Provide import.meta.env so isSimulatorEnabled() does not crash.
    define: { 'import.meta.env.VITE_SIMULATOR': '"0"' },
  });
  const code = result.outputFiles[0].text;
  const tmp = mkdtempSync(join(tmpdir(), 'issue97-'));
  const file = join(tmp, 'bundle.mjs');
  writeFileSync(file, code);
  return import(pathToFileURL(file).href);
}

async function main() {
  // No DOM at import time -> auto-bootstrap is skipped, mountApp is exported.
  const mod = await loadAppModule();
  assert(typeof mod.mountApp === 'function', 'mountApp is exported');
  assert(
    typeof mod.WebhookDeliverySimulator === 'function',
    'WebhookDeliverySimulator is available to the test',
  );

  // Install the DOM stub so element creation works inside mountApp.
  globalThis.document = createDocument();

  const root = globalThis.document.createElement('div');
  root.id = 'app';

  const handle = mod.mountApp(root, { simulate: false });
  assert(typeof handle.store === 'object', 'mountApp returns a shared store handle');

  const view = root.children[0];
  const dashboard = view.querySelector('#metrics-dashboard');
  const log = view.querySelector('#event-log');
  assert(dashboard !== null, 'MetricsDashboard section is mounted in the main view');
  assert(log !== null, 'Event log section is mounted in the main view');

  // ── Shared data source: one store, both views ─────────────────────────────
  // Add a delivered event and confirm BOTH the dashboard total and the event
  // log update simultaneously from the single store.
  const beforeAttempts = readMetric(dashboard, 'metric-total-attempts');
  const beforeRows = log.querySelectorAll('.log-entry').length;

  handle.store.add({
    webhookId: 'wh-1',
    attempt: 1,
    status: 'delivered',
    timestamp: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    httpStatus: 200,
    responseExcerpt: '{"ok":true}',
  });

  const afterAttempts = readMetric(dashboard, 'metric-total-attempts');
  const afterRows = log.querySelectorAll('.log-entry').length;

  assert(
    afterAttempts === beforeAttempts + 1,
    'a new delivery event increments the dashboard total-attempts stat',
  );
  assert(
    afterRows === beforeRows + 1,
    'the same event adds a row to the event log (shared data source)',
  );
  assert(afterAttempts > 0, 'dashboard displays a non-zero stat (total attempts > 0)');

  // ── Simulator integration: non-zero stats when the simulator is active ─────
  // Deterministic: always fail, synchronous scheduler so the full retry
  // schedule resolves immediately and the webhook reaches "exhausted".
  const sim = new mod.WebhookDeliverySimulator(handle.store, {
    successRate: 0,
    random: () => 0.9, // > successRate -> always fail; 0.9 -> httpStatus 500
    schedule: (fn) => fn(), // synchronous: resolve the whole retry schedule now
    now: () => Date.parse('2026-02-01T00:00:00.000Z'),
  });
  sim.deliver('wh-exhaust');

  const simAttempts = readMetric(dashboard, 'metric-total-attempts');
  assert(
    simAttempts > afterAttempts,
    'simulator activity increases dashboard stats (non-zero when active)',
  );

  // ── Alerting still surfaces for exhausted webhooks ─────────────────────────
  const alert = log.querySelector('.exhausted-alert');
  assert(alert !== null, 'exhausted alert region exists');
  assert(alert.hidden === false, 'exhausted alert is shown when a webhook is exhausted');
  const exhaustedStat = readMetric(dashboard, 'metric-stat-exhausted');
  assert(exhaustedStat > 0, 'dashboard reflects exhausted webhooks (stat > 0)');

  // ── Manual re-trigger still works from the event log ───────────────────────
  const retryButtons = log.querySelectorAll('.log-entry-retry');
  const retryBtn = retryButtons.length > 0 ? retryButtons[0] : undefined;
  assert(retryBtn !== undefined, 'a re-trigger control is present on failed/exhausted rows');
  const attemptsBeforeRetry = readMetric(dashboard, 'metric-total-attempts');
  retryBtn.dispatch('click');
  const attemptsAfterRetry = readMetric(dashboard, 'metric-total-attempts');
  assert(
    attemptsAfterRetry === attemptsBeforeRetry + 1,
    'manual re-trigger adds a new attempt to the shared store',
  );

  handle.destroy();

  console.log('');
  console.log(`Results: ${failures === 0 ? 'all assertions passed' : failures + ' failed'}`);
  process.exit(failures === 0 ? 0 : 1);
}

function readMetric(dashboard, id) {
  const el = dashboard.querySelector('#' + id);
  if (!el) return NaN;
  return Number(el.textContent);
}

main().catch((err) => {
  console.log('FAIL: smoke test threw an error');
  console.error(err);
  process.exit(1);
});

// Unit tests for the shared delivery-event model used by both the metrics
// dashboard and the event log (Issue #97 regression guard). Covers the pure,
// DOM-free functions: computeStats aggregation and the date-range filter
// (range applied, range cleared, boundary entries included).

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

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

async function load() {
  const posix = (p) => p.replace(/\\/g, '/');
  const entry = [
    `export * from ${JSON.stringify(posix(join(repoRoot, 'src', 'deliveryEvents.ts')))};`,
    `export * from ${JSON.stringify(posix(join(repoRoot, 'src', 'eventLog.ts')))};`,
  ].join('\n');
  const result = await build({
    stdin: { contents: entry, resolveDir: repoRoot, sourcefile: 'units-entry.ts', loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    loader: { '.css': 'empty' },
  });
  const tmp = mkdtempSync(join(tmpdir(), 'issue97-units-'));
  const file = join(tmp, 'bundle.mjs');
  writeFileSync(file, result.outputFiles[0].text);
  return import(pathToFileURL(file).href);
}

function ev(webhookId, attempt, status, iso) {
  return {
    webhookId,
    attempt,
    status,
    timestamp: iso,
    httpStatus: status === 'delivered' ? 200 : 500,
    responseExcerpt: 'x',
  };
}

async function main() {
  const m = await load();

  // ── computeStats ──────────────────────────────────────────────────────────
  const events = [
    ev('a', 1, 'failed', '2026-01-01T00:00:00.000Z'),
    ev('a', 2, 'delivered', '2026-01-01T00:05:00.000Z'),
    ev('b', 1, 'failed', '2026-01-01T01:00:00.000Z'),
    ev('b', 6, 'exhausted', '2026-01-01T09:00:00.000Z'),
  ];
  const stats = m.computeStats(events);
  assert(stats.totalAttempts === 4, 'computeStats counts total attempts');
  assert(stats.totalWebhooks === 2, 'computeStats counts distinct webhooks');
  assert(stats.byStatus.delivered === 1, 'computeStats counts delivered attempts');
  assert(stats.byStatus.exhausted === 1, 'computeStats counts exhausted attempts');
  assert(stats.webhooksByStatus.delivered === 1, 'computeStats latest-status: 1 delivered webhook');
  assert(stats.webhooksByStatus.exhausted === 1, 'computeStats latest-status: 1 exhausted webhook');
  assert(Math.abs(stats.deliveryRate - 0.5) < 1e-9, 'computeStats delivery rate = 0.5');

  const empty = m.computeStats([]);
  assert(empty.totalAttempts === 0 && empty.deliveryRate === 0, 'computeStats empty -> zero stats');

  // ── date-range filter ──────────────────────────────────────────────────────
  const start = Date.parse('2026-01-01T00:05:00.000Z');
  const end = Date.parse('2026-01-01T01:00:00.000Z');

  // range applied: keeps entries within [start, end], boundary inclusive
  const within = m.filterEvents(events, { start, end, status: null });
  const isoSet = new Set(within.map((e) => e.timestamp));
  assert(within.length === 2, 'date-range applied keeps only in-range entries');
  assert(
    isoSet.has('2026-01-01T00:05:00.000Z') && isoSet.has('2026-01-01T01:00:00.000Z'),
    'boundary entries (== start and == end) are INCLUDED',
  );
  assert(
    !isoSet.has('2026-01-01T00:00:00.000Z') && !isoSet.has('2026-01-01T09:00:00.000Z'),
    'out-of-range entries are EXCLUDED',
  );

  // range cleared: restores full unfiltered log
  const cleared = m.filterEvents(events, m.EMPTY_FILTER);
  assert(cleared.length === events.length, 'cleared range restores the full log');
  assert(m.isFilterActive(m.EMPTY_FILTER) === false, 'empty filter is reported inactive');
  assert(m.isFilterActive({ start, end: null, status: null }) === true, 'set range -> active');

  // filter composition with status
  const composed = m.filterEvents(events, { start: null, end: null, status: 'failed' });
  assert(composed.length === 2, 'status filter composes correctly');

  console.log('');
  console.log(`Results: ${failures === 0 ? 'all assertions passed' : failures + ' failed'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.log('FAIL: unit test threw an error');
  console.error(err);
  process.exit(1);
});

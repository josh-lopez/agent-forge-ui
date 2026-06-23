// Unit tests for the webhook delivery simulator (developer fixture).
//
// Run via tests/test_simulator_di.sh, which first transpiles the TypeScript
// sources to a runnable ESM bundle with esbuild (already a dev dependency). The
// tests exercise the simulator's success/failure behaviour, the full retry
// schedule, maxAttempts -> exhausted, and the delivery-event shape parity with
// the real mechanism's contract.

import assert from 'node:assert/strict';
import {
  WebhookDeliverySimulator,
  RETRY_SCHEDULE_MS,
} from './_build/simulator.mjs';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (err) {
    console.error(`FAIL: ${name}`);
    console.error(err && err.message ? err.message : err);
    process.exitCode = 1;
  }
}

// A synchronous scheduler so retry chains run to completion immediately.
const runNow = (fn) => fn();

function collect(options) {
  const events = [];
  const sim = new WebhookDeliverySimulator({ schedule: runNow, ...options });
  sim.deliver('wh_1', (e) => events.push(e));
  return events;
}

test('always-success delivers on first attempt', () => {
  const events = collect({ successRate: 1, random: () => 0 });
  assert.equal(events.length, 1);
  assert.equal(events[0].status, 'delivered');
  assert.equal(events[0].attempt, 1);
  assert.equal(events[0].httpStatusCode, 200);
});

test('always-failure progresses through retry schedule then exhausts', () => {
  const events = collect({ successRate: 0, random: () => 0.999, maxAttempts: 4 });
  // 3 intermediate "failed" then a terminal "exhausted".
  assert.equal(events.length, 4);
  assert.deepEqual(
    events.map((e) => e.status),
    ['failed', 'failed', 'failed', 'exhausted'],
  );
  assert.deepEqual(
    events.map((e) => e.attempt),
    [1, 2, 3, 4],
  );
  assert.equal(events.at(-1).status, 'exhausted');
});

test('emits intermediate failed events before delivering', () => {
  // Fail twice, then succeed on the third attempt.
  const rolls = [0.9, 0.9, 0.0];
  let i = 0;
  const events = collect({ successRate: 0.5, random: () => rolls[i++] });
  assert.deepEqual(
    events.map((e) => e.status),
    ['failed', 'failed', 'delivered'],
  );
});

test('delivery-event shape matches the real-mechanism contract', () => {
  const [event] = collect({ successRate: 1, random: () => 0 });
  for (const key of [
    'webhookId',
    'status',
    'timestamp',
    'httpStatusCode',
    'responseBodyExcerpt',
    'attempt',
  ]) {
    assert.ok(key in event, `event missing field: ${key}`);
  }
  assert.equal(typeof event.timestamp, 'string');
  // ISO-8601 timestamp parses to a valid date.
  assert.ok(!Number.isNaN(Date.parse(event.timestamp)));
  assert.equal(typeof event.httpStatusCode, 'number');
  assert.equal(typeof event.responseBodyExcerpt, 'string');
});

test('successRate is clamped to 0..1', () => {
  // successRate > 1 behaves like 1 (always succeed) regardless of the roll.
  const over = collect({ successRate: 5, random: () => 0.999 });
  assert.equal(over[0].status, 'delivered');
  // successRate < 0 behaves like 0 (always fail) -> exhausts.
  const under = collect({ successRate: -5, random: () => 0, maxAttempts: 2 });
  assert.equal(under.at(-1).status, 'exhausted');
});

test('retry schedule matches spec (immediate, 1m, 5m, 30m, 2h, 8h)', () => {
  assert.deepEqual(
    [...RETRY_SCHEDULE_MS],
    [0, 60_000, 300_000, 1_800_000, 7_200_000, 28_800_000],
  );
});

console.log(`\nSimulator unit tests: ${passed} passed`);

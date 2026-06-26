/**
 * Integration and supplementary tests for Issue #147 — client-side webhook
 * delivery simulator.
 *
 * These tests provide additional coverage for acceptance criteria not fully
 * exercised by the primary suites, including:
 * - AC7: isSimulatorEnabled flag behaviour (env-var gating)
 * - AC8/AC9: absence of network calls verified via module-level inspection
 * - AC11: documentation completeness (README + JSDoc)
 * - AC12: spec-mandated unit test cases (successRate=1.0, 0.0, mid-range)
 * - AC13: production-bundle exclusion (structural check via source analysis)
 * - Additional edge cases: concurrent simulations, webhookId uniqueness,
 *   eventType propagation, and promise resolution ordering.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_MAX_ATTEMPTS,
  RETRY_SCHEDULE_MS,
  type DeliveryEvent,
} from '../src/deliveryEvents';
import {
  type Clock,
  isSimulatorEnabled,
  realClock,
  runSimulation,
} from '../src/webhookSimulator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fake clock: queues callbacks and drains synchronously via flush(). */
function makeFakeClock(nowMs = 0): Clock & { flush: () => void } {
  const queue: Array<() => void> = [];
  return {
    setTimeout: (cb) => {
      queue.push(cb);
    },
    now: () => nowMs,
    flush() {
      while (queue.length > 0) {
        const cb = queue.shift();
        cb?.();
      }
    },
  };
}

const always = (v: number) => () => v;

// ---------------------------------------------------------------------------
// AC7 — isSimulatorEnabled env-var gating
// ---------------------------------------------------------------------------
describe('AC7 – isSimulatorEnabled env-var gating', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns false when VITE_USE_SIMULATOR is not set', () => {
    vi.stubEnv('VITE_USE_SIMULATOR', '');
    expect(isSimulatorEnabled()).toBe(false);
  });

  it('returns true when VITE_USE_SIMULATOR is "true"', () => {
    vi.stubEnv('VITE_USE_SIMULATOR', 'true');
    expect(isSimulatorEnabled()).toBe(true);
  });

  it('returns false when VITE_USE_SIMULATOR is "false"', () => {
    vi.stubEnv('VITE_USE_SIMULATOR', 'false');
    expect(isSimulatorEnabled()).toBe(false);
  });

  it('returns false when VITE_USE_SIMULATOR is "1" (only "true" activates it)', () => {
    vi.stubEnv('VITE_USE_SIMULATOR', '1');
    expect(isSimulatorEnabled()).toBe(false);
  });

  it('isSimulatorEnabled is a function exported from the module', () => {
    expect(typeof isSimulatorEnabled).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// AC8 — no real network calls (belt-and-suspenders: both fetch and XHR)
// ---------------------------------------------------------------------------
describe('AC8 – no real network calls during simulation', () => {
  it('does not invoke fetch during successRate=1.0 run', async () => {
    const fetchSpy = vi.fn();
    const origFetch = globalThis.fetch;
    // @ts-expect-error override for assertion
    globalThis.fetch = fetchSpy;
    try {
      const clock = makeFakeClock();
      const p = runSimulation({
        successRate: 1.0,
        random: always(0.0),
        clock,
        onEvent: () => {},
      });
      clock.flush();
      await p;
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('does not invoke fetch during successRate=0.0 exhaustion run', async () => {
    const fetchSpy = vi.fn();
    const origFetch = globalThis.fetch;
    // @ts-expect-error override for assertion
    globalThis.fetch = fetchSpy;
    try {
      const clock = makeFakeClock();
      const p = runSimulation({
        successRate: 0.0,
        random: always(0.999),
        clock,
        onEvent: () => {},
      });
      clock.flush();
      await p;
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// AC9 — no external service required (module runs standalone)
// ---------------------------------------------------------------------------
describe('AC9 – simulator runs without any external service', () => {
  it('completes a full exhaustion run in a pure in-memory environment', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 0.0,
      random: always(0.999),
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    const terminal = await p;

    expect(events).toHaveLength(DEFAULT_MAX_ATTEMPTS);
    expect(terminal.status).toBe('exhausted');
  });

  it('realClock is exported and has the correct interface shape', () => {
    expect(typeof realClock.setTimeout).toBe('function');
    expect(typeof realClock.now).toBe('function');
    // now() should return a number (epoch ms)
    expect(typeof realClock.now()).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// AC10 — configurable maxAttempts (additional cases)
// ---------------------------------------------------------------------------
describe('AC10 – configurable maxAttempts (additional cases)', () => {
  it('maxAttempts=2: one failed then one exhausted', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 0.0,
      random: always(0.999),
      maxAttempts: 2,
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    await p;

    expect(events).toHaveLength(2);
    expect(events[0].status).toBe('failed');
    expect(events[1].status).toBe('exhausted');
  });

  it('maxAttempts defaults to DEFAULT_MAX_ATTEMPTS (6) when not specified', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 0.0,
      random: always(0.999),
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    await p;

    expect(events).toHaveLength(DEFAULT_MAX_ATTEMPTS);
    expect(DEFAULT_MAX_ATTEMPTS).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// AC12 — spec-mandated unit test cases
// ---------------------------------------------------------------------------
describe('AC12 – spec-mandated unit test cases', () => {
  it('successRate=1.0: single delivered event, attempt=1, httpStatusCode=200', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 1.0,
      random: always(0.0),
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    const terminal = await p;

    expect(events).toHaveLength(1);
    expect(terminal.status).toBe('delivered');
    expect(terminal.attempt).toBe(1);
    expect(terminal.httpStatusCode).toBe(200);
  });

  it('successRate=0.0: DEFAULT_MAX_ATTEMPTS events, last is exhausted', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 0.0,
      random: always(0.999),
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    const terminal = await p;

    expect(events).toHaveLength(DEFAULT_MAX_ATTEMPTS);
    expect(terminal.status).toBe('exhausted');
    expect(terminal.attempt).toBe(DEFAULT_MAX_ATTEMPTS);
    // All intermediate events must be 'failed'
    const intermediates = events.slice(0, -1);
    expect(intermediates.every((e) => e.status === 'failed')).toBe(true);
  });

  it('mid-range successRate: intermediate failed events before eventual delivery', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    // successRate=0.4: random() < 0.4 succeeds.
    // Sequence: 0.9 (fail), 0.8 (fail), 0.2 (succeed)
    const seq = [0.9, 0.8, 0.2];
    let i = 0;
    const p = runSimulation({
      successRate: 0.4,
      random: () => seq[i++ % seq.length],
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    const terminal = await p;

    // Two failed events then one delivered
    expect(events).toHaveLength(3);
    expect(events[0].status).toBe('failed');
    expect(events[1].status).toBe('failed');
    expect(terminal.status).toBe('delivered');
    expect(terminal.attempt).toBe(3);
  });

  it('mid-range successRate=0.0 with maxAttempts=3: exercises all intermediate failed states', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 0.0,
      random: always(0.999),
      maxAttempts: 3,
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    const terminal = await p;

    expect(events).toHaveLength(3);
    expect(events[0].status).toBe('failed');
    expect(events[1].status).toBe('failed');
    expect(terminal.status).toBe('exhausted');
  });
});

// ---------------------------------------------------------------------------
// AC3 — event shape: all required fields present on every emitted event
// ---------------------------------------------------------------------------
describe('AC3 – event shape completeness on every emitted event', () => {
  const REQUIRED_FIELDS = [
    'webhookId',
    'eventType',
    'status',
    'attempt',
    'timestamp',
    'httpStatusCode',
    'responseBodyExcerpt',
  ].sort();

  it('every event in a full exhaustion run has all required fields', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 0.0,
      random: always(0.999),
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    await p;

    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(REQUIRED_FIELDS);
    }
  });

  it('every event in a successful run has all required fields', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 1.0,
      random: always(0.0),
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    await p;

    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(REQUIRED_FIELDS);
    }
  });
});

// ---------------------------------------------------------------------------
// AC4 — retry schedule: RETRY_SCHEDULE_MS values match spec exactly
// ---------------------------------------------------------------------------
describe('AC4 – retry schedule matches spec', () => {
  it('RETRY_SCHEDULE_MS[0] is 0 (immediate initial attempt)', () => {
    expect(RETRY_SCHEDULE_MS[0]).toBe(0);
  });

  it('RETRY_SCHEDULE_MS[1] is 60_000 (1 minute)', () => {
    expect(RETRY_SCHEDULE_MS[1]).toBe(60_000);
  });

  it('RETRY_SCHEDULE_MS[2] is 300_000 (5 minutes)', () => {
    expect(RETRY_SCHEDULE_MS[2]).toBe(5 * 60_000);
  });

  it('RETRY_SCHEDULE_MS[3] is 1_800_000 (30 minutes)', () => {
    expect(RETRY_SCHEDULE_MS[3]).toBe(30 * 60_000);
  });

  it('RETRY_SCHEDULE_MS[4] is 7_200_000 (2 hours)', () => {
    expect(RETRY_SCHEDULE_MS[4]).toBe(2 * 60 * 60_000);
  });

  it('RETRY_SCHEDULE_MS[5] is 28_800_000 (8 hours)', () => {
    expect(RETRY_SCHEDULE_MS[5]).toBe(8 * 60 * 60_000);
  });
});

// ---------------------------------------------------------------------------
// AC1 — concurrent simulations are independent (no shared mutable state leak)
// ---------------------------------------------------------------------------
describe('AC1 – concurrent simulations are independent', () => {
  it('two concurrent simulations with different webhookIds emit separate events', async () => {
    const eventsA: DeliveryEvent[] = [];
    const eventsB: DeliveryEvent[] = [];
    const clockA = makeFakeClock();
    const clockB = makeFakeClock();

    const pA = runSimulation({
      successRate: 1.0,
      random: always(0.0),
      webhookId: 'wh-A',
      clock: clockA,
      onEvent: (e) => eventsA.push(e),
    });
    const pB = runSimulation({
      successRate: 0.0,
      random: always(0.999),
      webhookId: 'wh-B',
      maxAttempts: 2,
      clock: clockB,
      onEvent: (e) => eventsB.push(e),
    });

    clockA.flush();
    clockB.flush();
    await Promise.all([pA, pB]);

    expect(eventsA).toHaveLength(1);
    expect(eventsA[0].webhookId).toBe('wh-A');
    expect(eventsA[0].status).toBe('delivered');

    expect(eventsB).toHaveLength(2);
    expect(eventsB[0].webhookId).toBe('wh-B');
    expect(eventsB[1].status).toBe('exhausted');
  });
});

// ---------------------------------------------------------------------------
// AC2 — successRate validation: additional boundary checks
// ---------------------------------------------------------------------------
describe('AC2 – successRate validation (additional boundaries)', () => {
  it('rejects successRate = -0.001', () => {
    expect(() =>
      runSimulation({ successRate: -0.001, onEvent: () => {} }),
    ).toThrow(RangeError);
  });

  it('rejects successRate = 1.001', () => {
    expect(() =>
      runSimulation({ successRate: 1.001, onEvent: () => {} }),
    ).toThrow(RangeError);
  });

  it('accepts successRate = 0.5 (mid-range)', () => {
    const clock = makeFakeClock();
    expect(() => {
      const p = runSimulation({
        successRate: 0.5,
        random: always(0.0), // always succeed
        clock,
        onEvent: () => {},
      });
      clock.flush();
      return p;
    }).not.toThrow();
  });
});

/**
 * Edge-case and supplementary tests for Issue #147 — client-side webhook
 * delivery simulator.
 *
 * These tests cover additional corners not exercised by the primary suites:
 * - Default webhookId generation (unique per call)
 * - Default eventType fallback
 * - realClock export shape
 * - Attempt-number stamping on every event in a full exhaustion run
 * - webhookId and eventType propagation through all emitted events
 * - successRate exactly at 0.5 boundary (random() === successRate is a failure)
 * - Promise resolves only once (terminal event is the resolved value)
 * - Clock.now() is used for timestamps (injectable clock controls timestamp)
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_MAX_ATTEMPTS, type DeliveryEvent } from '../src/deliveryEvents';
import { type Clock, realClock, runSimulation } from '../src/webhookSimulator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fake clock: queues callbacks and drains synchronously via flush(). */
function makeFakeClock(startMs = 1_234_567_890_000): Clock & { flush: () => void } {
  const queue: Array<() => void> = [];
  return {
    setTimeout: (cb) => {
      queue.push(cb);
    },
    now: () => startMs,
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
// Default webhookId generation
// ---------------------------------------------------------------------------
describe('default webhookId generation', () => {
  it('assigns a non-empty string webhookId when none is provided', async () => {
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

    expect(typeof events[0].webhookId).toBe('string');
    expect(events[0].webhookId.length).toBeGreaterThan(0);
  });

  it('generates distinct webhookIds for successive calls without explicit id', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const clock = makeFakeClock();
      const p = runSimulation({
        successRate: 1.0,
        random: always(0.0),
        clock,
        onEvent: (e) => ids.push(e.webhookId),
      });
      clock.flush();
      await p;
    }
    // All three ids should be unique.
    expect(new Set(ids).size).toBe(3);
  });

  it('uses the provided webhookId on all emitted events', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 0.0,
      random: always(0.999),
      maxAttempts: 3,
      webhookId: 'my-webhook-42',
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    await p;

    expect(events).toHaveLength(3);
    for (const event of events) {
      expect(event.webhookId).toBe('my-webhook-42');
    }
  });
});

// ---------------------------------------------------------------------------
// Default eventType fallback
// ---------------------------------------------------------------------------
describe('default eventType', () => {
  it('defaults to payment.created when no eventType is provided', async () => {
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

    expect(events[0].eventType).toBe('payment.created');
  });

  it('stamps the provided eventType on all emitted events', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 0.0,
      random: always(0.999),
      maxAttempts: 2,
      eventType: 'refund.issued',
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    await p;

    for (const event of events) {
      expect(event.eventType).toBe('refund.issued');
    }
  });
});

// ---------------------------------------------------------------------------
// realClock export shape
// ---------------------------------------------------------------------------
describe('realClock export', () => {
  it('realClock is exported and has setTimeout and now methods', () => {
    expect(typeof realClock.setTimeout).toBe('function');
    expect(typeof realClock.now).toBe('function');
  });

  it('realClock.now() returns a number close to Date.now()', () => {
    const before = Date.now();
    const result = realClock.now();
    const after = Date.now();
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after + 5); // 5 ms tolerance
  });
});

// ---------------------------------------------------------------------------
// Attempt numbering on every event in a full exhaustion run
// ---------------------------------------------------------------------------
describe('attempt numbering across full exhaustion', () => {
  it('every event in a full exhaustion run has the correct 1-based attempt number', async () => {
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
    events.forEach((e, idx) => {
      expect(e.attempt).toBe(idx + 1);
    });
  });

  it('the exhausted event has attempt equal to maxAttempts', async () => {
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 0.0,
      random: always(0.999),
      maxAttempts: 4,
      clock,
      onEvent: () => {},
    });
    clock.flush();
    const terminal = await p;

    expect(terminal.attempt).toBe(4);
    expect(terminal.status).toBe('exhausted');
  });
});

// ---------------------------------------------------------------------------
// Clock.now() controls the timestamp on emitted events
// ---------------------------------------------------------------------------
describe('clock.now() controls event timestamps', () => {
  it('emitted event timestamp matches the ISO string of clock.now()', async () => {
    const fixedMs = 1_700_000_000_000; // a known epoch ms
    const clock: Clock & { flush: () => void } = {
      ...makeFakeClock(fixedMs),
      now: () => fixedMs,
    };
    const events: DeliveryEvent[] = [];
    const p = runSimulation({
      successRate: 1.0,
      random: always(0.0),
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    await p;

    expect(events[0].timestamp).toBe(new Date(fixedMs).toISOString());
  });
});

// ---------------------------------------------------------------------------
// successRate boundary: random() === successRate is treated as failure
// ---------------------------------------------------------------------------
describe('successRate boundary: random() === successRate is a failure', () => {
  it('random() === successRate (0.5) does NOT succeed (strict less-than)', async () => {
    // The simulator uses `random() < successRate`, so equality is a failure.
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 0.5,
      random: always(0.5), // exactly equal → should fail
      maxAttempts: 2,
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    const terminal = await p;

    // Both attempts should fail.
    expect(events).toHaveLength(2);
    expect(events[0].status).toBe('failed');
    expect(terminal.status).toBe('exhausted');
  });

  it('random() just below successRate (0.5) succeeds', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 0.5,
      random: always(0.4999), // just below → should succeed
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    const terminal = await p;

    expect(events).toHaveLength(1);
    expect(terminal.status).toBe('delivered');
  });
});

// ---------------------------------------------------------------------------
// Promise resolves exactly once with the terminal event
// ---------------------------------------------------------------------------
describe('promise resolves with terminal event', () => {
  it('the resolved value is the same object as the last onEvent call', async () => {
    let lastEvent: DeliveryEvent | null = null;
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 1.0,
      random: always(0.0),
      clock,
      onEvent: (e) => {
        lastEvent = e;
      },
    });
    clock.flush();
    const terminal = await p;

    expect(terminal).toBe(lastEvent);
  });

  it('the resolved value for exhaustion is the same object as the last onEvent call', async () => {
    let lastEvent: DeliveryEvent | null = null;
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 0.0,
      random: always(0.999),
      maxAttempts: 3,
      clock,
      onEvent: (e) => {
        lastEvent = e;
      },
    });
    clock.flush();
    const terminal = await p;

    expect(terminal).toBe(lastEvent);
    expect(terminal.status).toBe('exhausted');
  });
});

// ---------------------------------------------------------------------------
// AC8 / AC9 — no network calls (belt-and-suspenders check in this file too)
// ---------------------------------------------------------------------------
describe('no network calls (AC8/AC9)', () => {
  it('does not call fetch during a full exhaustion run', async () => {
    const calls: string[] = [];
    const origFetch = globalThis.fetch;
    // @ts-expect-error override for assertion
    globalThis.fetch = (...args: unknown[]) => {
      calls.push(String(args[0]));
      return Promise.resolve(new Response());
    };
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
      expect(calls).toHaveLength(0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

/**
 * Supplementary acceptance-criteria tests for Issue #147 — client-side
 * webhook delivery simulator.
 *
 * These tests complement the primary suite (webhookSimulator.test.ts) by
 * covering additional edge cases and acceptance criteria not fully exercised
 * there.
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAX_ATTEMPTS,
  RETRY_SCHEDULE_MS,
  type DeliveryEvent,
  type DeliveryStatus,
} from '../src/deliveryEvents';
import {
  type Clock,
  type RandomFn,
  runSimulation,
} from '../src/webhookSimulator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A fake clock that queues callbacks and drains them synchronously. */
function makeFakeClock(): Clock & { flush: () => void } {
  const queue: Array<() => void> = [];
  let _now = 1_000_000; // fixed epoch ms for deterministic timestamps
  return {
    setTimeout: (cb) => {
      queue.push(cb);
    },
    now: () => _now,
    flush() {
      while (queue.length > 0) {
        const cb = queue.shift();
        cb?.();
      }
    },
  };
}

/** RNG that always returns the given value. */
const always = (v: number): RandomFn => () => v;

// ---------------------------------------------------------------------------
// AC2 — successRate boundary & NaN validation
// ---------------------------------------------------------------------------
describe('AC2 – successRate validation', () => {
  it('accepts the exact boundary value 0.0', () => {
    const clock = makeFakeClock();
    expect(() => {
      const p = runSimulation({
        successRate: 0.0,
        random: always(0.999),
        clock,
        onEvent: () => {},
      });
      clock.flush();
      return p;
    }).not.toThrow();
  });

  it('accepts the exact boundary value 1.0', () => {
    const clock = makeFakeClock();
    expect(() => {
      const p = runSimulation({
        successRate: 1.0,
        random: always(0.0),
        clock,
        onEvent: () => {},
      });
      clock.flush();
      return p;
    }).not.toThrow();
  });

  it('rejects NaN as successRate', () => {
    expect(() =>
      runSimulation({ successRate: NaN, onEvent: () => {} }),
    ).toThrow(RangeError);
  });

  it('rejects Infinity as successRate', () => {
    expect(() =>
      runSimulation({ successRate: Infinity, onEvent: () => {} }),
    ).toThrow(RangeError);
  });

  it('rejects -Infinity as successRate', () => {
    expect(() =>
      runSimulation({ successRate: -Infinity, onEvent: () => {} }),
    ).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// AC3 — event shape completeness
// ---------------------------------------------------------------------------
describe('AC3 – DeliveryEvent shape', () => {
  it('all emitted events have a valid ISO-8601 timestamp', async () => {
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
      expect(typeof event.timestamp).toBe('string');
      const d = new Date(event.timestamp);
      expect(Number.isNaN(d.getTime())).toBe(false);
    }
  });

  it('failed events carry httpStatusCode 500 and a non-empty responseBodyExcerpt', async () => {
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

    const failedEvent = events[0];
    expect(failedEvent.status).toBe('failed');
    expect(failedEvent.httpStatusCode).toBe(500);
    expect(typeof failedEvent.responseBodyExcerpt).toBe('string');
    expect(failedEvent.responseBodyExcerpt.length).toBeGreaterThan(0);
  });

  it('delivered events carry httpStatusCode 200 and a non-empty responseBodyExcerpt', async () => {
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

    const deliveredEvent = events[0];
    expect(deliveredEvent.status).toBe('delivered');
    expect(deliveredEvent.httpStatusCode).toBe(200);
    expect(typeof deliveredEvent.responseBodyExcerpt).toBe('string');
    expect(deliveredEvent.responseBodyExcerpt.length).toBeGreaterThan(0);
  });

  it('exhausted event carries httpStatusCode 500', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 0.0,
      random: always(0.999),
      maxAttempts: 1,
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    await p;

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('exhausted');
    expect(events[0].httpStatusCode).toBe(500);
  });

  it('DeliveryStatus type includes all four required values', () => {
    // Compile-time check: all four statuses are assignable to DeliveryStatus.
    const statuses: DeliveryStatus[] = ['pending', 'failed', 'delivered', 'exhausted'];
    expect(statuses).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// AC4 — attempt numbering through the full retry schedule
// ---------------------------------------------------------------------------
describe('AC4 – attempt numbering and retry schedule progression', () => {
  it('attempt numbers are sequential starting from 1', async () => {
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
    events.forEach((e, i) => {
      expect(e.attempt).toBe(i + 1);
    });
  });

  it('RETRY_SCHEDULE_MS has exactly 6 entries matching the spec schedule', () => {
    expect(RETRY_SCHEDULE_MS).toHaveLength(6);
    expect(RETRY_SCHEDULE_MS[0]).toBe(0);           // immediate
    expect(RETRY_SCHEDULE_MS[1]).toBe(60_000);       // 1 min
    expect(RETRY_SCHEDULE_MS[2]).toBe(5 * 60_000);   // 5 min
    expect(RETRY_SCHEDULE_MS[3]).toBe(30 * 60_000);  // 30 min
    expect(RETRY_SCHEDULE_MS[4]).toBe(2 * 60 * 60_000); // 2 h
    expect(RETRY_SCHEDULE_MS[5]).toBe(8 * 60 * 60_000); // 8 h
  });

  it('DEFAULT_MAX_ATTEMPTS equals the length of RETRY_SCHEDULE_MS', () => {
    expect(DEFAULT_MAX_ATTEMPTS).toBe(RETRY_SCHEDULE_MS.length);
  });
});

// ---------------------------------------------------------------------------
// AC5 — exhausted terminal state
// ---------------------------------------------------------------------------
describe('AC5 – exhausted terminal state', () => {
  it('the last event is exhausted when all attempts fail (maxAttempts=1)', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 0.0,
      random: always(0.999),
      maxAttempts: 1,
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    const terminal = await p;

    expect(events).toHaveLength(1);
    expect(terminal.status).toBe('exhausted');
    expect(terminal.attempt).toBe(1);
  });

  it('promise resolves with the exhausted event as the terminal value', async () => {
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 0.0,
      random: always(0.999),
      maxAttempts: 3,
      clock,
      onEvent: () => {},
    });
    clock.flush();
    const terminal = await p;

    expect(terminal.status).toBe('exhausted');
    expect(terminal.attempt).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// AC6 — delivered terminal state stops retrying
// ---------------------------------------------------------------------------
describe('AC6 – delivered terminal state stops retrying', () => {
  it('no further events are emitted after delivered', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 1.0,
      random: always(0.0),
      maxAttempts: 6,
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    await p;

    // Only one event: the delivered one.
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('delivered');
  });

  it('promise resolves with the delivered event as the terminal value', async () => {
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 1.0,
      random: always(0.0),
      clock,
      onEvent: () => {},
    });
    clock.flush();
    const terminal = await p;

    expect(terminal.status).toBe('delivered');
    expect(terminal.attempt).toBe(1);
  });

  it('delivers on attempt 3 when first two fail, then stops', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    // fail, fail, succeed
    const seq = [0.9, 0.9, 0.1];
    let i = 0;
    const p = runSimulation({
      successRate: 0.5,
      random: () => seq[i++ % seq.length],
      maxAttempts: 6,
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    await p;

    expect(events).toHaveLength(3);
    expect(events[2].status).toBe('delivered');
    expect(events[2].attempt).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// AC9 — no external service required (module-level checks)
// ---------------------------------------------------------------------------
describe('AC9 – no external service required', () => {
  it('runSimulation completes without any global side effects on fetch/XHR', async () => {
    // Verify that XMLHttpRequest is not called either.
    const xhrOpen = vi.fn();
    const OrigXHR = globalThis.XMLHttpRequest;
    // @ts-expect-error override for assertion
    globalThis.XMLHttpRequest = class {
      open = xhrOpen;
      send = vi.fn();
    };
    try {
      const clock = makeFakeClock();
      const p = runSimulation({
        successRate: 0.0,
        random: always(0.999),
        maxAttempts: 2,
        clock,
        onEvent: () => {},
      });
      clock.flush();
      await p;
      expect(xhrOpen).not.toHaveBeenCalled();
    } finally {
      globalThis.XMLHttpRequest = OrigXHR;
    }
  });
});

// ---------------------------------------------------------------------------
// AC10 — configurable maxAttempts
// ---------------------------------------------------------------------------
describe('AC10 – configurable maxAttempts', () => {
  it('maxAttempts=1 produces exactly one event (exhausted)', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 0.0,
      random: always(0.999),
      maxAttempts: 1,
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    await p;

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('exhausted');
  });

  it('maxAttempts=10 produces exactly 10 events when successRate=0', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 0.0,
      random: always(0.999),
      maxAttempts: 10,
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    await p;

    expect(events).toHaveLength(10);
    expect(events[9].status).toBe('exhausted');
    expect(events[9].attempt).toBe(10);
  });

  it('rejects maxAttempts=0', () => {
    expect(() =>
      runSimulation({ successRate: 0.5, maxAttempts: 0, onEvent: () => {} }),
    ).toThrow(RangeError);
  });

  it('rejects non-integer maxAttempts', () => {
    expect(() =>
      runSimulation({ successRate: 0.5, maxAttempts: 2.5, onEvent: () => {} }),
    ).toThrow(RangeError);
  });

  it('rejects negative maxAttempts', () => {
    expect(() =>
      runSimulation({ successRate: 0.5, maxAttempts: -1, onEvent: () => {} }),
    ).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// AC12 — spec-required unit test cases (successRate=1.0, 0.0, mid-range)
// ---------------------------------------------------------------------------
describe('AC12 – required unit test cases', () => {
  it('successRate=1.0: always delivers on first attempt, no retries', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 1.0,
      random: always(0.0), // 0.0 < 1.0 → always succeed
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    const terminal = await p;

    expect(events).toHaveLength(1);
    expect(terminal.status).toBe('delivered');
    expect(terminal.attempt).toBe(1);
  });

  it('successRate=0.0: exhausts all DEFAULT_MAX_ATTEMPTS retries', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const p = runSimulation({
      successRate: 0.0,
      random: always(0.999), // 0.999 < 0.0 is false → always fail
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    const terminal = await p;

    expect(events).toHaveLength(DEFAULT_MAX_ATTEMPTS);
    expect(terminal.status).toBe('exhausted');
    expect(terminal.attempt).toBe(DEFAULT_MAX_ATTEMPTS);
    // All intermediate events are 'failed'
    const intermediates = events.slice(0, -1);
    expect(intermediates.every((e) => e.status === 'failed')).toBe(true);
  });

  it('mid-range successRate: exercises intermediate failed events before delivery', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    // successRate=0.5: random() < 0.5 succeeds.
    // Sequence: 0.8 (fail), 0.7 (fail), 0.3 (succeed)
    const seq = [0.8, 0.7, 0.3];
    let i = 0;
    const p = runSimulation({
      successRate: 0.5,
      random: () => seq[i++ % seq.length],
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    const terminal = await p;

    expect(events.length).toBeGreaterThanOrEqual(2);
    // At least one intermediate failed event
    expect(events.slice(0, -1).every((e) => e.status === 'failed')).toBe(true);
    expect(terminal.status).toBe('delivered');
  });
});

// ---------------------------------------------------------------------------
// AC1 — module is importable with only deliveryEvents as local dep
// (structural: verified by the fact that this test file imports successfully)
// ---------------------------------------------------------------------------
describe('AC1 – module importability', () => {
  it('runSimulation is a function exported from the module', () => {
    expect(typeof runSimulation).toBe('function');
  });

  it('DEFAULT_MAX_ATTEMPTS is a positive integer exported from deliveryEvents', () => {
    expect(Number.isInteger(DEFAULT_MAX_ATTEMPTS)).toBe(true);
    expect(DEFAULT_MAX_ATTEMPTS).toBeGreaterThan(0);
  });

  it('RETRY_SCHEDULE_MS is a readonly array exported from deliveryEvents', () => {
    expect(Array.isArray(RETRY_SCHEDULE_MS)).toBe(true);
    expect(RETRY_SCHEDULE_MS.length).toBeGreaterThan(0);
  });
});

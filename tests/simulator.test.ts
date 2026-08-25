/**
 * Unit tests for the WebhookDeliverySimulator.
 *
 * Covers Issue #155 acceptance criteria:
 *   AC1  – progresses through every step of the retry schedule in order
 *   AC2  – emits `failed` events for each unsuccessful attempt (correct shape)
 *   AC3  – final event is `delivered` when simulation succeeds
 *   AC4  – final event is `exhausted` when all retries are exhausted
 *   AC5  – maxAttempts is configurable and respected
 *   AC6  – successRate=0 drives to `exhausted`
 *   AC7  – successRate=1 drives to `delivered` on first attempt
 *   AC8  – covers full-exhaustion, early-success, and mid-schedule resolution
 *   AC9  – correct number of intermediate `failed` events before terminal event
 *   AC10 – every emitted event carries status, timestamp, httpStatusCode,
 *           responseBodyExcerpt
 *   AC11 – no events emitted after terminal state
 *   AC12 – no real HTTP calls (simulator is entirely client-side)
 */

import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAX_ATTEMPTS,
  DeliveryEvent,
  RETRY_SCHEDULE_MS,
} from '../src/delivery/types.ts';
import { WebhookDeliverySimulator } from '../src/delivery/simulator.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Collect all events emitted during a simulator run. */
async function collectEvents(
  options: ConstructorParameters<typeof WebhookDeliverySimulator>[0] = {},
): Promise<DeliveryEvent[]> {
  const events: DeliveryEvent[] = [];
  const sim = new WebhookDeliverySimulator({
    // Skip real delays in tests.
    sleep: () => Promise.resolve(),
    ...options,
  });
  sim.on('delivery', (e) => events.push(e));
  await sim.run();
  return events;
}

/** A deterministic clock that advances by 1 second per call. */
function makeClock(startMs = 0): () => number {
  let t = startMs;
  return () => {
    const current = t;
    t += 1_000;
    return current;
  };
}

// ── AC6 / AC4: successRate=0 → exhausted ─────────────────────────────────────

describe('successRate=0 (AC6, AC4)', () => {
  it('final event status is exhausted', async () => {
    const events = await collectEvents({ successRate: 0 });
    const last = events[events.length - 1];
    expect(last.status).toBe('exhausted');
  });

  it('emits exactly maxAttempts events (AC5, AC9)', async () => {
    const events = await collectEvents({ successRate: 0 });
    expect(events).toHaveLength(DEFAULT_MAX_ATTEMPTS);
  });

  it('all events except the last have status=failed (AC2, AC9)', async () => {
    const events = await collectEvents({ successRate: 0 });
    const intermediate = events.slice(0, -1);
    for (const e of intermediate) {
      expect(e.status).toBe('failed');
    }
  });

  it('emits DEFAULT_MAX_ATTEMPTS - 1 failed events before exhausted (AC9)', async () => {
    const events = await collectEvents({ successRate: 0 });
    const failedCount = events.filter((e) => e.status === 'failed').length;
    expect(failedCount).toBe(DEFAULT_MAX_ATTEMPTS - 1);
  });
});

// ── AC7 / AC3: successRate=1 → delivered on first attempt ────────────────────

describe('successRate=1 (AC7, AC3)', () => {
  it('final event status is delivered', async () => {
    const events = await collectEvents({ successRate: 1 });
    const last = events[events.length - 1];
    expect(last.status).toBe('delivered');
  });

  it('emits exactly one event (no intermediate failed events) (AC9)', async () => {
    const events = await collectEvents({ successRate: 1 });
    expect(events).toHaveLength(1);
  });

  it('emits zero failed events (AC9)', async () => {
    const events = await collectEvents({ successRate: 1 });
    const failedCount = events.filter((e) => e.status === 'failed').length;
    expect(failedCount).toBe(0);
  });
});

// ── AC8: mid-schedule resolution ─────────────────────────────────────────────

describe('mid-schedule resolution (AC8)', () => {
  it('succeeds on the 3rd attempt when first two fail', async () => {
    // Fail twice, then succeed.
    let callCount = 0;
    const random = () => {
      callCount++;
      return callCount <= 2 ? 1.0 : 0.0; // > successRate=0.5 → fail; < 0.5 → succeed
    };
    const events = await collectEvents({ successRate: 0.5, random });

    expect(events).toHaveLength(3);
    expect(events[0].status).toBe('failed');
    expect(events[1].status).toBe('failed');
    expect(events[2].status).toBe('delivered');
  });

  it('emits 2 failed events before delivered (AC9)', async () => {
    let callCount = 0;
    const random = () => {
      callCount++;
      return callCount <= 2 ? 1.0 : 0.0;
    };
    const events = await collectEvents({ successRate: 0.5, random });
    const failedCount = events.filter((e) => e.status === 'failed').length;
    expect(failedCount).toBe(2);
  });
});

// ── AC10: event shape ─────────────────────────────────────────────────────────

describe('event shape (AC10)', () => {
  it('every event has a status field', async () => {
    const events = await collectEvents({ successRate: 0 });
    for (const e of events) {
      expect(e).toHaveProperty('status');
      expect(typeof e.status).toBe('string');
    }
  });

  it('every event has a timestamp field (ISO-8601)', async () => {
    const events = await collectEvents({ successRate: 0 });
    for (const e of events) {
      expect(e).toHaveProperty('timestamp');
      expect(typeof e.timestamp).toBe('string');
      // Must parse as a valid date.
      expect(isNaN(Date.parse(e.timestamp))).toBe(false);
    }
  });

  it('every event has an httpStatusCode field', async () => {
    const events = await collectEvents({ successRate: 0 });
    for (const e of events) {
      expect(e).toHaveProperty('httpStatusCode');
      expect(typeof e.httpStatusCode).toBe('number');
    }
  });

  it('every event has a responseBodyExcerpt field', async () => {
    const events = await collectEvents({ successRate: 0 });
    for (const e of events) {
      expect(e).toHaveProperty('responseBodyExcerpt');
      expect(typeof e.responseBodyExcerpt).toBe('string');
    }
  });

  it('delivered event has httpStatusCode 200', async () => {
    const events = await collectEvents({ successRate: 1 });
    expect(events[0].httpStatusCode).toBe(200);
  });

  it('failed events have httpStatusCode 500', async () => {
    const events = await collectEvents({ successRate: 0 });
    const failedEvents = events.filter((e) => e.status === 'failed');
    for (const e of failedEvents) {
      expect(e.httpStatusCode).toBe(500);
    }
  });

  it('exhausted event has httpStatusCode 500', async () => {
    const events = await collectEvents({ successRate: 0 });
    const last = events[events.length - 1];
    expect(last.httpStatusCode).toBe(500);
  });

  it('every event has an attemptIndex field', async () => {
    const events = await collectEvents({ successRate: 0 });
    for (let i = 0; i < events.length; i++) {
      expect(events[i]).toHaveProperty('attemptIndex');
      expect(events[i].attemptIndex).toBe(i);
    }
  });
});

// ── AC1: full retry schedule progression ─────────────────────────────────────

describe('retry schedule progression (AC1)', () => {
  it('calls sleep with the correct delay for each retry step', async () => {
    const sleepDelays: number[] = [];
    const sleep = (ms: number) => {
      sleepDelays.push(ms);
      return Promise.resolve();
    };

    // Force all attempts to fail so we traverse the full schedule.
    await collectEvents({ successRate: 0, sleep });

    // The first attempt has no preceding sleep; retries 1..N use the schedule.
    // With DEFAULT_MAX_ATTEMPTS=7 we expect 6 sleep calls.
    expect(sleepDelays).toHaveLength(DEFAULT_MAX_ATTEMPTS - 1);

    // Verify each delay matches the schedule.
    for (let i = 0; i < RETRY_SCHEDULE_MS.length; i++) {
      expect(sleepDelays[i]).toBe(RETRY_SCHEDULE_MS[i]);
    }
  });

  it('schedule has 6 entries (immediately, 1m, 5m, 30m, 2h, 8h)', () => {
    expect(RETRY_SCHEDULE_MS).toHaveLength(6);
    expect(RETRY_SCHEDULE_MS[0]).toBe(0);               // immediately
    expect(RETRY_SCHEDULE_MS[1]).toBe(60_000);          // 1 minute
    expect(RETRY_SCHEDULE_MS[2]).toBe(5 * 60_000);      // 5 minutes
    expect(RETRY_SCHEDULE_MS[3]).toBe(30 * 60_000);     // 30 minutes
    expect(RETRY_SCHEDULE_MS[4]).toBe(2 * 60 * 60_000); // 2 hours
    expect(RETRY_SCHEDULE_MS[5]).toBe(8 * 60 * 60_000); // 8 hours
  });

  it('attempt indices are sequential starting from 0', async () => {
    const events = await collectEvents({ successRate: 0 });
    for (let i = 0; i < events.length; i++) {
      expect(events[i].attemptIndex).toBe(i);
    }
  });
});

// ── AC5: configurable maxAttempts ─────────────────────────────────────────────

describe('configurable maxAttempts (AC5)', () => {
  it('stops after maxAttempts=1 with exhausted (no retries)', async () => {
    const events = await collectEvents({ successRate: 0, maxAttempts: 1 });
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('exhausted');
  });

  it('stops after maxAttempts=3 with exhausted', async () => {
    const events = await collectEvents({ successRate: 0, maxAttempts: 3 });
    expect(events).toHaveLength(3);
    expect(events[2].status).toBe('exhausted');
    expect(events[0].status).toBe('failed');
    expect(events[1].status).toBe('failed');
  });

  it('stops after maxAttempts=3 even if successRate=1 (succeeds on first)', async () => {
    const events = await collectEvents({ successRate: 1, maxAttempts: 3 });
    // Succeeds immediately — only 1 event emitted.
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('delivered');
  });

  it('throws RangeError for maxAttempts < 1', () => {
    expect(
      () => new WebhookDeliverySimulator({ maxAttempts: 0 }),
    ).toThrow(RangeError);
  });

  it('throws RangeError for successRate out of range', () => {
    expect(
      () => new WebhookDeliverySimulator({ successRate: 1.5 }),
    ).toThrow(RangeError);
    expect(
      () => new WebhookDeliverySimulator({ successRate: -0.1 }),
    ).toThrow(RangeError);
  });
});

// ── AC11: no events after terminal state ──────────────────────────────────────

describe('no events after terminal state (AC11)', () => {
  it('isTerminated is true after run() completes', async () => {
    const sim = new WebhookDeliverySimulator({
      successRate: 1,
      sleep: () => Promise.resolve(),
    });
    await sim.run();
    expect(sim.isTerminated).toBe(true);
  });

  it('calling run() again after exhaustion emits a fresh sequence', async () => {
    // Each run() is independent; the simulator resets terminated state.
    const events: DeliveryEvent[] = [];
    const sim = new WebhookDeliverySimulator({
      successRate: 0,
      maxAttempts: 2,
      sleep: () => Promise.resolve(),
    });
    sim.on('delivery', (e) => events.push(e));

    await sim.run();
    const firstRunCount = events.length;
    expect(firstRunCount).toBe(2);
    expect(sim.isTerminated).toBe(true);

    // Second run should emit another 2 events.
    await sim.run();
    expect(events).toHaveLength(4);
  });

  it('emits no events after delivered', async () => {
    // Verify the simulator stops immediately after delivered.
    const events: DeliveryEvent[] = [];
    const sim = new WebhookDeliverySimulator({
      successRate: 1,
      maxAttempts: 5,
      sleep: () => Promise.resolve(),
    });
    sim.on('delivery', (e) => events.push(e));
    await sim.run();

    // Only 1 event (the delivered one) — no further events.
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('delivered');
  });
});

// ── AC12: no real HTTP calls ──────────────────────────────────────────────────

describe('no real HTTP calls (AC12)', () => {
  it('does not call fetch during simulation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 }),
    );
    await collectEvents({ successRate: 0.5 });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ── Timestamp correctness ─────────────────────────────────────────────────────

describe('timestamp correctness', () => {
  it('uses the injected clock for timestamps', async () => {
    const clock = makeClock(1_700_000_000_000);
    const events = await collectEvents({ successRate: 0, maxAttempts: 3, now: clock });

    // Each event should have a distinct, increasing timestamp.
    const timestamps = events.map((e) => Date.parse(e.timestamp));
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
    }
  });

  it('timestamps are valid ISO-8601 strings', async () => {
    const events = await collectEvents({ successRate: 0, maxAttempts: 2 });
    for (const e of events) {
      expect(e.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('zero deliveries: no events emitted if maxAttempts=0 is rejected', () => {
    expect(() => new WebhookDeliverySimulator({ maxAttempts: 0 })).toThrow();
  });

  it('100% failure: all events are failed except the last (exhausted)', async () => {
    const events = await collectEvents({ successRate: 0 });
    const statuses = events.map((e) => e.status);
    const allButLast = statuses.slice(0, -1);
    expect(allButLast.every((s) => s === 'failed')).toBe(true);
    expect(statuses[statuses.length - 1]).toBe('exhausted');
  });

  it('single attempt (maxAttempts=1, successRate=0): emits one exhausted event', async () => {
    const events = await collectEvents({ successRate: 0, maxAttempts: 1 });
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('exhausted');
    expect(events[0].attemptIndex).toBe(0);
  });

  it('single attempt (maxAttempts=1, successRate=1): emits one delivered event', async () => {
    const events = await collectEvents({ successRate: 1, maxAttempts: 1 });
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('delivered');
    expect(events[0].attemptIndex).toBe(0);
  });
});

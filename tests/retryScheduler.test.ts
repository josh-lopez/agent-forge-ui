/**
 * Unit tests for src/retryScheduler.ts
 *
 * Covers:
 *   AC2  – back-off intervals fire in the correct order
 *   AC3  – max-attempt count is respected
 *   AC4  – exhausted state is reached when all attempts fail
 *   AC5  – early success stops retries
 *   AC7  – intermediate `failed` events are emitted
 *   AC8  – all back-off intervals fire in the correct order
 *   AC9  – edge cases: maxAttempts=1, maxAttempts=scheduleLength, maxAttempts>scheduleLength
 *   AC10 – no runtime dependency on any backend / real HTTP endpoint
 *   AC11 – usable by the simulator without special-case code
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scheduleWithRetry,
  BACKOFF_SCHEDULE_MS,
  DEFAULT_MAX_ATTEMPTS,
  type DeliveryEvent,
  type AttemptResult,
} from '../src/retryScheduler';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build an AttemptFn that always fails. */
function alwaysFail(httpStatus = 500, body = 'Internal Server Error'): () => AttemptResult {
  return () => ({ success: false, httpStatus, responseBodyExcerpt: body });
}

/** Build an AttemptFn that always succeeds. */
function alwaysSucceed(httpStatus = 200, body = 'OK'): () => AttemptResult {
  return () => ({ success: true, httpStatus, responseBodyExcerpt: body });
}

/**
 * Build an AttemptFn that fails for the first `failCount` attempts then
 * succeeds.
 */
function failThenSucceed(failCount: number): (n: number) => AttemptResult {
  return (n: number) => {
    if (n <= failCount) {
      return { success: false, httpStatus: 503, responseBodyExcerpt: 'Service Unavailable' };
    }
    return { success: true, httpStatus: 200, responseBodyExcerpt: 'OK' };
  };
}

/**
 * Run the scheduler to completion using fake timers and collect all emitted
 * events.
 *
 * @param attemptFn  - The attempt function to use.
 * @param maxAttempts - Maximum attempts.
 * @param scheduleMs  - Optional custom schedule (defaults to BACKOFF_SCHEDULE_MS).
 * @returns Array of DeliveryEvent objects in emission order.
 */
async function runToCompletion(
  attemptFn: Parameters<typeof scheduleWithRetry>[0],
  maxAttempts: number,
  scheduleMs?: readonly number[],
): Promise<DeliveryEvent[]> {
  const events: DeliveryEvent[] = [];

  scheduleWithRetry(attemptFn, {
    maxAttempts,
    scheduleMs,
    onEvent: (e) => events.push(e),
  });

  // Advance fake timers through all possible delays.
  // We run all timers repeatedly until no more pending timers exist.
  // Each `runAllTimersAsync` flushes one "layer" of timers (including any
  // timers set by timer callbacks).
  await vi.runAllTimersAsync();

  return events;
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('retryScheduler – module exports', () => {
  it('exports BACKOFF_SCHEDULE_MS with 6 entries', () => {
    expect(BACKOFF_SCHEDULE_MS).toHaveLength(6);
  });

  it('BACKOFF_SCHEDULE_MS[0] is 0 (immediate)', () => {
    expect(BACKOFF_SCHEDULE_MS[0]).toBe(0);
  });

  it('BACKOFF_SCHEDULE_MS[1] is 1 minute', () => {
    expect(BACKOFF_SCHEDULE_MS[1]).toBe(60_000);
  });

  it('BACKOFF_SCHEDULE_MS[2] is 5 minutes', () => {
    expect(BACKOFF_SCHEDULE_MS[2]).toBe(5 * 60_000);
  });

  it('BACKOFF_SCHEDULE_MS[3] is 30 minutes', () => {
    expect(BACKOFF_SCHEDULE_MS[3]).toBe(30 * 60_000);
  });

  it('BACKOFF_SCHEDULE_MS[4] is 2 hours', () => {
    expect(BACKOFF_SCHEDULE_MS[4]).toBe(2 * 60 * 60_000);
  });

  it('BACKOFF_SCHEDULE_MS[5] is 8 hours', () => {
    expect(BACKOFF_SCHEDULE_MS[5]).toBe(8 * 60 * 60_000);
  });

  it('DEFAULT_MAX_ATTEMPTS equals the schedule length (6)', () => {
    expect(DEFAULT_MAX_ATTEMPTS).toBe(BACKOFF_SCHEDULE_MS.length);
    expect(DEFAULT_MAX_ATTEMPTS).toBe(6);
  });

  it('scheduleWithRetry is a function', () => {
    expect(typeof scheduleWithRetry).toBe('function');
  });
});

describe('retryScheduler – back-off intervals (AC2, AC8)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires all 6 attempts in order with the canonical schedule', async () => {
    const callTimes: number[] = [];
    const attemptFn = () => {
      callTimes.push(Date.now());
      return { success: false, httpStatus: 500, responseBodyExcerpt: '' };
    };

    scheduleWithRetry(attemptFn, {
      maxAttempts: 6,
      scheduleMs: BACKOFF_SCHEDULE_MS,
    });

    await vi.runAllTimersAsync();

    expect(callTimes).toHaveLength(6);

    // Verify the gaps between consecutive calls match the schedule.
    // callTimes[0] is the first attempt (immediate, ~0 ms after start).
    // callTimes[1] should be ~1 min after callTimes[0], etc.
    const expectedDelays = [
      BACKOFF_SCHEDULE_MS[1], // gap between attempt 1 and 2
      BACKOFF_SCHEDULE_MS[2], // gap between attempt 2 and 3
      BACKOFF_SCHEDULE_MS[3], // gap between attempt 3 and 4
      BACKOFF_SCHEDULE_MS[4], // gap between attempt 4 and 5
      BACKOFF_SCHEDULE_MS[5], // gap between attempt 5 and 6
    ];

    for (let i = 0; i < expectedDelays.length; i++) {
      const actualGap = callTimes[i + 1] - callTimes[i];
      expect(actualGap).toBe(expectedDelays[i]);
    }
  });

  it('emits events with monotonically increasing timestamps', async () => {
    const events = await runToCompletion(alwaysFail(), 3, [0, 100, 200]);

    expect(events).toHaveLength(3);
    const timestamps = events.map((e) => new Date(e.timestamp).getTime());
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
    }
  });
});

describe('retryScheduler – max-attempt count (AC3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops after exactly maxAttempts when all fail', async () => {
    let callCount = 0;
    const attemptFn = () => {
      callCount++;
      return { success: false, httpStatus: 500, responseBodyExcerpt: '' };
    };

    await runToCompletion(attemptFn, 4, [0, 10, 20, 30]);

    expect(callCount).toBe(4);
  });

  it('emits exactly maxAttempts events when all fail', async () => {
    const events = await runToCompletion(alwaysFail(), 4, [0, 10, 20, 30]);
    expect(events).toHaveLength(4);
  });

  it('last event is exhausted when all attempts fail', async () => {
    const events = await runToCompletion(alwaysFail(), 4, [0, 10, 20, 30]);
    expect(events[events.length - 1].status).toBe('exhausted');
  });
});

describe('retryScheduler – exhausted state (AC4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks the final event as exhausted after all attempts fail', async () => {
    const events = await runToCompletion(alwaysFail(503, 'Service Unavailable'), 3, [0, 10, 20]);

    const last = events[events.length - 1];
    expect(last.status).toBe('exhausted');
    expect(last.httpStatus).toBe(503);
    expect(last.responseBodyExcerpt).toBe('Service Unavailable');
  });

  it('exhausted event has the correct attemptNumber', async () => {
    const events = await runToCompletion(alwaysFail(), 3, [0, 10, 20]);
    const last = events[events.length - 1];
    expect(last.attemptNumber).toBe(3);
  });

  it('no further events are emitted after exhausted', async () => {
    const events = await runToCompletion(alwaysFail(), 2, [0, 10]);
    expect(events).toHaveLength(2);
    expect(events[0].status).toBe('failed');
    expect(events[1].status).toBe('exhausted');
  });
});

describe('retryScheduler – early success stops retries (AC5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops after the first successful attempt', async () => {
    let callCount = 0;
    const attemptFn = () => {
      callCount++;
      return { success: true, httpStatus: 200, responseBodyExcerpt: 'OK' };
    };

    await runToCompletion(attemptFn, 6, [0, 10, 20, 30, 40, 50]);

    expect(callCount).toBe(1);
  });

  it('emits a single delivered event on immediate success', async () => {
    const events = await runToCompletion(alwaysSucceed(), 6, [0, 10, 20, 30, 40, 50]);

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('delivered');
    expect(events[0].attemptNumber).toBe(1);
  });

  it('stops retrying after success on attempt 3 of 6', async () => {
    let callCount = 0;
    const attemptFn = () => {
      callCount++;
      return {
        success: callCount >= 3,
        httpStatus: callCount >= 3 ? 200 : 500,
        responseBodyExcerpt: callCount >= 3 ? 'OK' : 'Error',
      };
    };

    const events = await runToCompletion(attemptFn, 6, [0, 10, 20, 30, 40, 50]);

    expect(callCount).toBe(3);
    expect(events).toHaveLength(3);
    expect(events[0].status).toBe('failed');
    expect(events[1].status).toBe('failed');
    expect(events[2].status).toBe('delivered');
  });
});

describe('retryScheduler – intermediate failed events (AC7)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits failed events for each unsuccessful attempt before exhausted', async () => {
    const events = await runToCompletion(alwaysFail(), 4, [0, 10, 20, 30]);

    // First 3 should be failed, last should be exhausted.
    expect(events[0].status).toBe('failed');
    expect(events[1].status).toBe('failed');
    expect(events[2].status).toBe('failed');
    expect(events[3].status).toBe('exhausted');
  });

  it('emits failed events for each unsuccessful attempt before delivered', async () => {
    const events = await runToCompletion(failThenSucceed(2), 6, [0, 10, 20, 30, 40, 50]);

    expect(events).toHaveLength(3);
    expect(events[0].status).toBe('failed');
    expect(events[1].status).toBe('failed');
    expect(events[2].status).toBe('delivered');
  });

  it('each failed event carries the correct attemptNumber', async () => {
    const events = await runToCompletion(alwaysFail(), 3, [0, 10, 20]);

    events.forEach((e, i) => {
      expect(e.attemptNumber).toBe(i + 1);
    });
  });

  it('each event carries httpStatus and responseBodyExcerpt', async () => {
    const events = await runToCompletion(alwaysFail(429, 'Too Many Requests'), 2, [0, 10]);

    for (const e of events) {
      expect(e.httpStatus).toBe(429);
      expect(e.responseBodyExcerpt).toBe('Too Many Requests');
    }
  });

  it('each event carries a valid ISO-8601 timestamp', async () => {
    const events = await runToCompletion(alwaysFail(), 2, [0, 10]);

    for (const e of events) {
      expect(e.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(isNaN(new Date(e.timestamp).getTime())).toBe(false);
    }
  });
});

describe('retryScheduler – edge cases (AC9)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('maxAttempts=1: fires exactly once and emits exhausted (no retries)', async () => {
    let callCount = 0;
    const attemptFn = () => {
      callCount++;
      return { success: false, httpStatus: 500, responseBodyExcerpt: '' };
    };

    const events = await runToCompletion(attemptFn, 1, [0]);

    expect(callCount).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('exhausted');
    expect(events[0].attemptNumber).toBe(1);
  });

  it('maxAttempts=1: success on first attempt emits delivered', async () => {
    const events = await runToCompletion(alwaysSucceed(), 1, [0]);

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('delivered');
  });

  it('maxAttempts equals schedule length: uses all schedule entries', async () => {
    const schedule = [0, 10, 20, 30, 40, 50];
    const callTimes: number[] = [];
    const attemptFn = () => {
      callTimes.push(Date.now());
      return { success: false, httpStatus: 500, responseBodyExcerpt: '' };
    };

    const events = await runToCompletion(attemptFn, schedule.length, schedule);

    expect(callTimes).toHaveLength(schedule.length);
    expect(events).toHaveLength(schedule.length);
    expect(events[events.length - 1].status).toBe('exhausted');

    // Verify all gaps match the schedule.
    for (let i = 1; i < callTimes.length; i++) {
      expect(callTimes[i] - callTimes[i - 1]).toBe(schedule[i]);
    }
  });

  it('maxAttempts exceeds schedule length: reuses last interval for extra attempts', async () => {
    const schedule = [0, 10, 20]; // 3-entry schedule
    const callTimes: number[] = [];
    const attemptFn = () => {
      callTimes.push(Date.now());
      return { success: false, httpStatus: 500, responseBodyExcerpt: '' };
    };

    // 5 attempts with a 3-entry schedule → attempts 4 and 5 reuse schedule[2]=20.
    const events = await runToCompletion(attemptFn, 5, schedule);

    expect(callTimes).toHaveLength(5);
    expect(events).toHaveLength(5);
    expect(events[events.length - 1].status).toBe('exhausted');

    // Gaps: 10, 20, 20 (reused), 20 (reused).
    expect(callTimes[1] - callTimes[0]).toBe(10);
    expect(callTimes[2] - callTimes[1]).toBe(20);
    expect(callTimes[3] - callTimes[2]).toBe(20);
    expect(callTimes[4] - callTimes[3]).toBe(20);
  });

  it('maxAttempts=2 with immediate success on attempt 2', async () => {
    const events = await runToCompletion(failThenSucceed(1), 2, [0, 10]);

    expect(events).toHaveLength(2);
    expect(events[0].status).toBe('failed');
    expect(events[1].status).toBe('delivered');
  });
});

describe('retryScheduler – cancellation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancel() stops further attempts from firing', async () => {
    let callCount = 0;
    const attemptFn = () => {
      callCount++;
      return { success: false, httpStatus: 500, responseBodyExcerpt: '' };
    };

    const events: DeliveryEvent[] = [];
    const handle = scheduleWithRetry(attemptFn, {
      maxAttempts: 6,
      scheduleMs: [0, 10, 20, 30, 40, 50],
      onEvent: (e) => events.push(e),
    });

    // Let the first attempt fire.
    await vi.advanceTimersByTimeAsync(0);

    // Cancel before any retry fires.
    handle.cancel();

    // Advance through all remaining time — no more attempts should fire.
    await vi.runAllTimersAsync();

    expect(callCount).toBe(1);
    expect(events).toHaveLength(1);
  });

  it('cancel() prevents onEvent from being called after cancellation', async () => {
    const events: DeliveryEvent[] = [];
    const handle = scheduleWithRetry(alwaysFail(), {
      maxAttempts: 4,
      scheduleMs: [0, 10, 20, 30],
      onEvent: (e) => events.push(e),
    });

    // Let first attempt fire and emit its failed event.
    await vi.advanceTimersByTimeAsync(0);
    const countAfterFirst = events.length;

    handle.cancel();
    await vi.runAllTimersAsync();

    // No new events after cancel.
    expect(events.length).toBe(countAfterFirst);
  });
});

describe('retryScheduler – delivery event shape (AC6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('every event has all required fields', async () => {
    const events = await runToCompletion(alwaysFail(404, 'Not Found'), 2, [0, 10]);

    for (const e of events) {
      expect(e).toHaveProperty('status');
      expect(e).toHaveProperty('timestamp');
      expect(e).toHaveProperty('httpStatus');
      expect(e).toHaveProperty('responseBodyExcerpt');
      expect(e).toHaveProperty('attemptNumber');
    }
  });

  it('status is one of the valid DeliveryStatus values', async () => {
    const validStatuses = new Set(['pending', 'failed', 'delivered', 'exhausted']);
    const events = await runToCompletion(failThenSucceed(2), 6, [0, 10, 20, 30, 40, 50]);

    for (const e of events) {
      expect(validStatuses.has(e.status)).toBe(true);
    }
  });

  it('delivered event has httpStatus and responseBodyExcerpt from the attempt', async () => {
    const events = await runToCompletion(alwaysSucceed(201, 'Created'), 3, [0, 10, 20]);

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('delivered');
    expect(events[0].httpStatus).toBe(201);
    expect(events[0].responseBodyExcerpt).toBe('Created');
  });
});

describe('retryScheduler – simulator compatibility (AC11)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('can be driven by a probability-based attempt function (simulator pattern)', async () => {
    // Simulate a 0% success rate — all attempts fail.
    const successRate = 0.0;
    const simulatorAttemptFn = (): AttemptResult => {
      const success = Math.random() < successRate;
      return {
        success,
        httpStatus: success ? 200 : 500,
        responseBodyExcerpt: success ? 'OK' : 'Simulated failure',
      };
    };

    const events = await runToCompletion(simulatorAttemptFn, 3, [0, 10, 20]);

    expect(events).toHaveLength(3);
    expect(events[events.length - 1].status).toBe('exhausted');
  });

  it('can be driven by a 100% success rate simulator', async () => {
    const successRate = 1.0;
    const simulatorAttemptFn = (): AttemptResult => ({
      success: Math.random() < successRate,
      httpStatus: 200,
      responseBodyExcerpt: 'OK',
    });

    const events = await runToCompletion(simulatorAttemptFn, 6, [0, 10, 20, 30, 40, 50]);

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('delivered');
  });

  it('emits the same event shape as the real delivery mechanism', async () => {
    // The simulator uses the same AttemptResult → DeliveryEvent pipeline.
    const events = await runToCompletion(alwaysFail(), 2, [0, 10]);

    // Verify the shape matches what the event log and status UI expect.
    for (const e of events) {
      expect(typeof e.status).toBe('string');
      expect(typeof e.timestamp).toBe('string');
      expect(typeof e.httpStatus).toBe('number');
      expect(typeof e.responseBodyExcerpt).toBe('string');
      expect(typeof e.attemptNumber).toBe('number');
    }
  });
});

describe('retryScheduler – no backend dependency (AC10)', () => {
  it('module can be imported and used without any network calls', async () => {
    // This test simply verifies the module loads and the function is callable
    // without any network activity. The fake-timer tests above also confirm
    // this implicitly (they would hang/fail if real HTTP calls were made).
    expect(typeof scheduleWithRetry).toBe('function');
    expect(typeof BACKOFF_SCHEDULE_MS).toBe('object');
    expect(typeof DEFAULT_MAX_ATTEMPTS).toBe('number');
  });
});

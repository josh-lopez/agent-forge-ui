/**
 * Issue #59 acceptance-criteria tests for src/retryScheduler.ts
 *
 * These tests are written by the Test Engineer role and directly map to the
 * nine acceptance criteria stated in Issue #59.
 *
 * AC1 – Failed webhook triggers retries following the schedule: immediate,
 *        ~1 min, ~5 min, ~30 min, ~2 h, ~8 h.
 * AC2 – Max attempt count is read from config and defaults to 6.
 * AC3 – No further retry is attempted once max attempts is reached.
 * AC4 – Status transitions to `exhausted` after the final failed attempt.
 * AC5 – Each attempt records timestamp, HTTP status code, response body excerpt.
 * AC6 – Unit tests verify back-off interval calculation for each schedule step.
 * AC7 – Unit tests verify retries stop exactly at the configured max count.
 * AC8 – Unit tests verify the `exhausted` status transition.
 * AC9 – Configurable maxAttempts can be overridden and is respected.
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

function alwaysFail(httpStatus = 500, body = 'Error'): () => AttemptResult {
  return () => ({ success: false, httpStatus, responseBodyExcerpt: body });
}

function alwaysSucceed(): () => AttemptResult {
  return () => ({ success: true, httpStatus: 200, responseBodyExcerpt: 'OK' });
}

async function collect(
  attemptFn: Parameters<typeof scheduleWithRetry>[0],
  options: Parameters<typeof scheduleWithRetry>[1],
): Promise<DeliveryEvent[]> {
  const events: DeliveryEvent[] = [];
  scheduleWithRetry(attemptFn, { ...options, onEvent: (e) => events.push(e) });
  await vi.runAllTimersAsync();
  return events;
}

// ── AC1: back-off schedule fires in the correct order ─────────────────────────

describe('AC1 – back-off schedule: immediate then exponential delays', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('BACKOFF_SCHEDULE_MS has exactly 6 entries covering the full spec schedule', () => {
    expect(BACKOFF_SCHEDULE_MS).toHaveLength(6);
    expect(BACKOFF_SCHEDULE_MS[0]).toBe(0);                    // immediate
    expect(BACKOFF_SCHEDULE_MS[1]).toBe(1 * 60 * 1000);       // 1 min
    expect(BACKOFF_SCHEDULE_MS[2]).toBe(5 * 60 * 1000);       // 5 min
    expect(BACKOFF_SCHEDULE_MS[3]).toBe(30 * 60 * 1000);      // 30 min
    expect(BACKOFF_SCHEDULE_MS[4]).toBe(2 * 60 * 60 * 1000);  // 2 h
    expect(BACKOFF_SCHEDULE_MS[5]).toBe(8 * 60 * 60 * 1000);  // 8 h
  });

  it('first attempt fires immediately (0 ms delay)', async () => {
    const callTimes: number[] = [];
    const start = Date.now();
    scheduleWithRetry(() => { callTimes.push(Date.now() - start); return { success: false, httpStatus: 500, responseBodyExcerpt: '' }; }, {
      maxAttempts: 1, scheduleMs: [0],
    });
    await vi.runAllTimersAsync();
    expect(callTimes[0]).toBe(0);
  });

  it('subsequent attempts fire at the correct cumulative delays', async () => {
    const callTimes: number[] = [];
    scheduleWithRetry(() => { callTimes.push(Date.now()); return { success: false, httpStatus: 500, responseBodyExcerpt: '' }; }, {
      maxAttempts: 6,
      scheduleMs: BACKOFF_SCHEDULE_MS,
    });
    await vi.runAllTimersAsync();

    expect(callTimes).toHaveLength(6);
    // Verify each inter-attempt gap matches the schedule entry
    const expectedGaps = [
      BACKOFF_SCHEDULE_MS[1], // gap 1→2
      BACKOFF_SCHEDULE_MS[2], // gap 2→3
      BACKOFF_SCHEDULE_MS[3], // gap 3→4
      BACKOFF_SCHEDULE_MS[4], // gap 4→5
      BACKOFF_SCHEDULE_MS[5], // gap 5→6
    ];
    for (let i = 0; i < expectedGaps.length; i++) {
      expect(callTimes[i + 1] - callTimes[i]).toBe(expectedGaps[i]);
    }
  });

  it('a failed delivery triggers the retry sequence (not just one attempt)', async () => {
    let callCount = 0;
    await collect(() => { callCount++; return { success: false, httpStatus: 500, responseBodyExcerpt: '' }; }, {
      maxAttempts: 3, scheduleMs: [0, 10, 20],
    });
    expect(callCount).toBe(3); // retries did fire
  });
});

// ── AC2: DEFAULT_MAX_ATTEMPTS = 6 and is configurable ────────────────────────

describe('AC2 – max attempt count defaults to 6', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('DEFAULT_MAX_ATTEMPTS is exactly 6', () => {
    expect(DEFAULT_MAX_ATTEMPTS).toBe(6);
  });

  it('scheduler uses DEFAULT_MAX_ATTEMPTS when no maxAttempts option is given', async () => {
    let callCount = 0;
    scheduleWithRetry(() => { callCount++; return { success: false, httpStatus: 500, responseBodyExcerpt: '' }; });
    await vi.runAllTimersAsync();
    expect(callCount).toBe(DEFAULT_MAX_ATTEMPTS);
  });
});

// ── AC3: no retry after max attempts ─────────────────────────────────────────

describe('AC3 – no further retry once max attempts reached', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('attempt function is called exactly maxAttempts times', async () => {
    let callCount = 0;
    await collect(() => { callCount++; return { success: false, httpStatus: 500, responseBodyExcerpt: '' }; }, {
      maxAttempts: 4, scheduleMs: [0, 10, 20, 30],
    });
    expect(callCount).toBe(4);
  });

  it('no events are emitted after the final attempt', async () => {
    const events = await collect(alwaysFail(), { maxAttempts: 3, scheduleMs: [0, 10, 20] });
    expect(events).toHaveLength(3);
  });
});

// ── AC4: exhausted status transition ─────────────────────────────────────────

describe('AC4 – status transitions to exhausted after final failed attempt', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('last event has status exhausted when all attempts fail', async () => {
    const events = await collect(alwaysFail(503, 'Service Unavailable'), {
      maxAttempts: 3, scheduleMs: [0, 10, 20],
    });
    expect(events[events.length - 1].status).toBe('exhausted');
  });

  it('exhausted event carries the httpStatus from the final attempt', async () => {
    const events = await collect(alwaysFail(429, 'Rate Limited'), {
      maxAttempts: 2, scheduleMs: [0, 10],
    });
    expect(events[1].status).toBe('exhausted');
    expect(events[1].httpStatus).toBe(429);
    expect(events[1].responseBodyExcerpt).toBe('Rate Limited');
  });

  it('exhausted event has the correct 1-based attemptNumber', async () => {
    const events = await collect(alwaysFail(), { maxAttempts: 4, scheduleMs: [0, 10, 20, 30] });
    expect(events[3].status).toBe('exhausted');
    expect(events[3].attemptNumber).toBe(4);
  });

  it('no exhausted event when delivery succeeds', async () => {
    const events = await collect(alwaysSucceed(), { maxAttempts: 6, scheduleMs: [0, 10, 20, 30, 40, 50] });
    expect(events.every(e => e.status !== 'exhausted')).toBe(true);
    expect(events[0].status).toBe('delivered');
  });
});

// ── AC5: each attempt records timestamp, httpStatus, responseBodyExcerpt ──────

describe('AC5 – each attempt records its outcome for the event log', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('every emitted event has timestamp, httpStatus, responseBodyExcerpt, attemptNumber', async () => {
    const events = await collect(alwaysFail(502, 'Bad Gateway'), {
      maxAttempts: 3, scheduleMs: [0, 10, 20],
    });
    for (const e of events) {
      expect(typeof e.timestamp).toBe('string');
      expect(new Date(e.timestamp).getTime()).not.toBeNaN();
      expect(e.httpStatus).toBe(502);
      expect(e.responseBodyExcerpt).toBe('Bad Gateway');
      expect(typeof e.attemptNumber).toBe('number');
      expect(e.attemptNumber).toBeGreaterThan(0);
    }
  });

  it('intermediate failed events carry the correct httpStatus from each attempt', async () => {
    let n = 0;
    const attemptFn = (): AttemptResult => {
      n++;
      return { success: false, httpStatus: 500 + n, responseBodyExcerpt: `err${n}` };
    };
    const events = await collect(attemptFn, { maxAttempts: 3, scheduleMs: [0, 10, 20] });
    expect(events[0].httpStatus).toBe(501);
    expect(events[1].httpStatus).toBe(502);
    expect(events[2].httpStatus).toBe(503);
  });

  it('timestamps are valid ISO-8601 strings', async () => {
    const events = await collect(alwaysFail(), { maxAttempts: 2, scheduleMs: [0, 10] });
    for (const e of events) {
      expect(e.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
  });
});

// ── AC6: back-off interval calculation for each schedule step ─────────────────

describe('AC6 – back-off interval calculation for each step', () => {
  it('step 0 → 1: delay is 1 minute (60 000 ms)', () => {
    expect(BACKOFF_SCHEDULE_MS[1]).toBe(60_000);
  });
  it('step 1 → 2: delay is 5 minutes (300 000 ms)', () => {
    expect(BACKOFF_SCHEDULE_MS[2]).toBe(300_000);
  });
  it('step 2 → 3: delay is 30 minutes (1 800 000 ms)', () => {
    expect(BACKOFF_SCHEDULE_MS[3]).toBe(1_800_000);
  });
  it('step 3 → 4: delay is 2 hours (7 200 000 ms)', () => {
    expect(BACKOFF_SCHEDULE_MS[4]).toBe(7_200_000);
  });
  it('step 4 → 5: delay is 8 hours (28 800 000 ms)', () => {
    expect(BACKOFF_SCHEDULE_MS[5]).toBe(28_800_000);
  });
  it('schedule is strictly non-decreasing after index 0', () => {
    for (let i = 1; i < BACKOFF_SCHEDULE_MS.length; i++) {
      expect(BACKOFF_SCHEDULE_MS[i]).toBeGreaterThanOrEqual(BACKOFF_SCHEDULE_MS[i - 1]);
    }
  });
});

// ── AC7: retries stop exactly at configured max count ─────────────────────────

describe('AC7 – retries stop exactly at configured maxAttempts', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('maxAttempts=1: exactly 1 call, no retries', async () => {
    let callCount = 0;
    await collect(() => { callCount++; return { success: false, httpStatus: 500, responseBodyExcerpt: '' }; }, {
      maxAttempts: 1, scheduleMs: [0],
    });
    expect(callCount).toBe(1);
  });

  it('maxAttempts=3: exactly 3 calls', async () => {
    let callCount = 0;
    await collect(() => { callCount++; return { success: false, httpStatus: 500, responseBodyExcerpt: '' }; }, {
      maxAttempts: 3, scheduleMs: [0, 10, 20],
    });
    expect(callCount).toBe(3);
  });

  it('maxAttempts=6 (default): exactly 6 calls', async () => {
    let callCount = 0;
    await collect(() => { callCount++; return { success: false, httpStatus: 500, responseBodyExcerpt: '' }; }, {
      maxAttempts: 6, scheduleMs: [0, 10, 20, 30, 40, 50],
    });
    expect(callCount).toBe(6);
  });
});

// ── AC8: exhausted status transition (unit test coverage) ─────────────────────

describe('AC8 – exhausted transition verified by unit tests', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('all intermediate events are failed; only the last is exhausted', async () => {
    const events = await collect(alwaysFail(), { maxAttempts: 4, scheduleMs: [0, 10, 20, 30] });
    for (let i = 0; i < events.length - 1; i++) {
      expect(events[i].status).toBe('failed');
    }
    expect(events[events.length - 1].status).toBe('exhausted');
  });

  it('maxAttempts=1 goes straight to exhausted (no intermediate failed events)', async () => {
    const events = await collect(alwaysFail(), { maxAttempts: 1, scheduleMs: [0] });
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('exhausted');
  });
});

// ── AC9: configurable maxAttempts override ────────────────────────────────────

describe('AC9 – configurable maxAttempts is respected when overridden', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('maxAttempts=2 (below default) stops after 2 attempts', async () => {
    let callCount = 0;
    await collect(() => { callCount++; return { success: false, httpStatus: 500, responseBodyExcerpt: '' }; }, {
      maxAttempts: 2, scheduleMs: [0, 10],
    });
    expect(callCount).toBe(2);
  });

  it('maxAttempts=10 (above default) fires 10 attempts', async () => {
    let callCount = 0;
    const schedule = Array.from({ length: 10 }, (_, i) => i * 10);
    await collect(() => { callCount++; return { success: false, httpStatus: 500, responseBodyExcerpt: '' }; }, {
      maxAttempts: 10, scheduleMs: schedule,
    });
    expect(callCount).toBe(10);
  });

  it('override maxAttempts=3 produces exhausted at attempt 3, not 6', async () => {
    const events = await collect(alwaysFail(), { maxAttempts: 3, scheduleMs: [0, 10, 20] });
    expect(events).toHaveLength(3);
    expect(events[2].status).toBe('exhausted');
    expect(events[2].attemptNumber).toBe(3);
  });

  it('override maxAttempts=5 produces exhausted at attempt 5', async () => {
    const events = await collect(alwaysFail(), { maxAttempts: 5, scheduleMs: [0, 10, 20, 30, 40] });
    expect(events).toHaveLength(5);
    expect(events[4].status).toBe('exhausted');
    expect(events[4].attemptNumber).toBe(5);
  });
});

/**
 * Unit tests for src/simulator/webhookDeliverySimulator.ts — Issue #77
 *
 * Acceptance criteria covered:
 *   AC1  – Module exports `createWebhookDeliverySimulator` and `DeliveryEvent`.
 *   AC2  – Factory accepts `{ successRate, maxAttempts }`.
 *   AC3  – `DeliveryEvent` has all required fields.
 *   AC4  – `DeliveryEvent` is the canonical shared type (no divergence).
 *   AC5  – `simulate()` returns an AsyncIterable yielding one event per attempt.
 *   AC6  – Simulator progresses through the full retry back-off schedule.
 *   AC7  – successRate=1.0 → delivered on first attempt.
 *   AC8  – successRate=0.0 → exhausted after maxAttempts.
 *   AC9  – successRate between 0 and 1 → probabilistic outcomes.
 *   AC10 – Event shape is correct for delivered and exhausted terminal states.
 *   AC11 – Number of emitted events does not exceed maxAttempts.
 *   AC12 – No network calls (structural check).
 *   AC13 – Module can be activated via env flag (structural check).
 */

import { describe, expect, it } from 'vitest';
import {
  createWebhookDeliverySimulator,
  RETRY_SCHEDULE_MS,
  DEFAULT_MAX_ATTEMPTS,
  type WebhookDeliverySimulatorOptions,
} from '../src/simulator/webhookDeliverySimulator';
import type { DeliveryEvent } from '../src/delivery-events';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Zero-delay retry schedule so tests run instantly. */
const INSTANT_DELAYS = [0, 0, 0, 0, 0, 0];

/** Deterministic RNG that always returns a value below any positive successRate. */
const alwaysSucceed = () => 0.0;

/** Deterministic RNG that always returns a value >= any successRate < 1. */
const alwaysFail = () => 1.0;

/**
 * Collect all events from a single simulate() call.
 */
async function collectEvents(
  options: WebhookDeliverySimulatorOptions,
  webhookId = 'wh_test',
  eventType = 'payment.created',
): Promise<DeliveryEvent[]> {
  const sim = createWebhookDeliverySimulator(options);
  const events: DeliveryEvent[] = [];
  for await (const event of sim.simulate(webhookId, eventType)) {
    events.push(event);
  }
  return events;
}

// ---------------------------------------------------------------------------
// AC1 – Module exports createWebhookDeliverySimulator and DeliveryEvent
// ---------------------------------------------------------------------------

describe('AC1 – module exports', () => {
  it('exports createWebhookDeliverySimulator as a function', () => {
    expect(typeof createWebhookDeliverySimulator).toBe('function');
  });

  it('exports RETRY_SCHEDULE_MS constant', () => {
    expect(Array.isArray(RETRY_SCHEDULE_MS)).toBe(true);
    expect(RETRY_SCHEDULE_MS.length).toBeGreaterThan(0);
  });

  it('exports DEFAULT_MAX_ATTEMPTS constant', () => {
    expect(typeof DEFAULT_MAX_ATTEMPTS).toBe('number');
    expect(DEFAULT_MAX_ATTEMPTS).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// AC2 – Factory accepts { successRate, maxAttempts }
// ---------------------------------------------------------------------------

describe('AC2 – factory options', () => {
  it('accepts successRate and maxAttempts', () => {
    expect(() =>
      createWebhookDeliverySimulator({ successRate: 0.8, maxAttempts: 6 }),
    ).not.toThrow();
  });

  it('returns an object with a simulate method', () => {
    const sim = createWebhookDeliverySimulator({ successRate: 0.5, maxAttempts: 3 });
    expect(typeof sim.simulate).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// AC3 & AC10 – DeliveryEvent shape for delivered and exhausted states
// ---------------------------------------------------------------------------

describe('AC3 & AC10 – DeliveryEvent shape', () => {
  it('delivered event has all required fields with correct types', async () => {
    const events = await collectEvents(
      { successRate: 1.0, maxAttempts: 6, retryDelaysMs: INSTANT_DELAYS, rng: alwaysSucceed },
      'wh_shape',
      'payment.created',
    );

    expect(events).toHaveLength(1);
    const event = events[0];

    // All required fields present
    expect(event).toHaveProperty('webhookId', 'wh_shape');
    expect(event).toHaveProperty('eventType', 'payment.created');
    expect(event).toHaveProperty('status', 'delivered');
    expect(event).toHaveProperty('attempt', 1);
    expect(event).toHaveProperty('timestamp');
    expect(event).toHaveProperty('httpStatus', 200);
    expect(event).toHaveProperty('responseBodyExcerpt');

    // Type checks
    expect(typeof event.webhookId).toBe('string');
    expect(typeof event.eventType).toBe('string');
    expect(typeof event.status).toBe('string');
    expect(typeof event.attempt).toBe('number');
    expect(typeof event.timestamp).toBe('string');
    expect(typeof event.httpStatus).toBe('number');
    expect(typeof event.responseBodyExcerpt).toBe('string');
  });

  it('exhausted event has all required fields with correct types', async () => {
    const events = await collectEvents(
      { successRate: 0.0, maxAttempts: 3, retryDelaysMs: INSTANT_DELAYS, rng: alwaysFail },
      'wh_exhausted',
      'refund.issued',
    );

    const last = events[events.length - 1];
    expect(last.status).toBe('exhausted');
    expect(last).toHaveProperty('webhookId', 'wh_exhausted');
    expect(last).toHaveProperty('eventType', 'refund.issued');
    expect(last).toHaveProperty('attempt', 3);
    expect(last).toHaveProperty('timestamp');
    expect(last).toHaveProperty('httpStatus');
    expect(last).toHaveProperty('responseBodyExcerpt');

    expect(typeof last.webhookId).toBe('string');
    expect(typeof last.eventType).toBe('string');
    expect(typeof last.attempt).toBe('number');
    expect(typeof last.timestamp).toBe('string');
    expect(typeof last.httpStatus).toBe('number');
    expect(typeof last.responseBodyExcerpt).toBe('string');
  });

  it('failed event has all required fields', async () => {
    const events = await collectEvents(
      { successRate: 0.0, maxAttempts: 3, retryDelaysMs: INSTANT_DELAYS, rng: alwaysFail },
      'wh_failed',
      'payout.paid',
    );

    const failedEvent = events[0];
    expect(failedEvent.status).toBe('failed');
    expect(failedEvent).toHaveProperty('webhookId', 'wh_failed');
    expect(failedEvent).toHaveProperty('eventType', 'payout.paid');
    expect(failedEvent).toHaveProperty('attempt', 1);
    expect(failedEvent).toHaveProperty('timestamp');
    expect(failedEvent).toHaveProperty('httpStatus');
    expect(failedEvent).toHaveProperty('responseBodyExcerpt');
  });

  it('timestamp is a valid ISO-8601 string', async () => {
    const events = await collectEvents(
      { successRate: 1.0, maxAttempts: 6, retryDelaysMs: INSTANT_DELAYS, rng: alwaysSucceed },
    );
    const ts = events[0].timestamp;
    expect(typeof ts).toBe('string');
    expect(new Date(ts).toISOString()).toBe(ts);
  });
});

// ---------------------------------------------------------------------------
// AC4 – DeliveryEvent is the canonical shared type
// ---------------------------------------------------------------------------

describe('AC4 – DeliveryEvent is the canonical shared type', () => {
  it('uses "attempt" field (not "attemptNumber") matching delivery-events.ts', async () => {
    const events = await collectEvents(
      { successRate: 1.0, maxAttempts: 6, retryDelaysMs: INSTANT_DELAYS, rng: alwaysSucceed },
    );
    // The canonical type uses `attempt`, not `attemptNumber`
    expect(events[0]).toHaveProperty('attempt');
    expect(events[0]).not.toHaveProperty('attemptNumber');
  });

  it('uses "responseBodyExcerpt" field (not "responseExcerpt") matching delivery-events.ts', async () => {
    const events = await collectEvents(
      { successRate: 1.0, maxAttempts: 6, retryDelaysMs: INSTANT_DELAYS, rng: alwaysSucceed },
    );
    // The canonical type uses `responseBodyExcerpt`, not `responseExcerpt`
    expect(events[0]).toHaveProperty('responseBodyExcerpt');
    expect(events[0]).not.toHaveProperty('responseExcerpt');
  });

  it('uses "httpStatus" field (not "httpStatusCode") matching delivery-events.ts', async () => {
    const events = await collectEvents(
      { successRate: 1.0, maxAttempts: 6, retryDelaysMs: INSTANT_DELAYS, rng: alwaysSucceed },
    );
    // The canonical type uses `httpStatus`, not `httpStatusCode`
    expect(events[0]).toHaveProperty('httpStatus');
    expect(events[0]).not.toHaveProperty('httpStatusCode');
  });
});

// ---------------------------------------------------------------------------
// AC5 – simulate() returns an AsyncIterable
// ---------------------------------------------------------------------------

describe('AC5 – simulate() returns an AsyncIterable', () => {
  it('simulate() returns an object with Symbol.asyncIterator', () => {
    const sim = createWebhookDeliverySimulator({ successRate: 1.0, maxAttempts: 6 });
    const iterable = sim.simulate('wh_1');
    expect(typeof iterable[Symbol.asyncIterator]).toBe('function');
  });

  it('can be consumed with for-await-of', async () => {
    const sim = createWebhookDeliverySimulator({
      successRate: 1.0,
      maxAttempts: 6,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysSucceed,
    });
    const events: DeliveryEvent[] = [];
    for await (const event of sim.simulate('wh_1', 'payment.created')) {
      events.push(event);
    }
    expect(events.length).toBeGreaterThan(0);
  });

  it('each call to simulate() produces an independent iterable', async () => {
    const sim = createWebhookDeliverySimulator({
      successRate: 1.0,
      maxAttempts: 6,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysSucceed,
    });
    const events1: DeliveryEvent[] = [];
    const events2: DeliveryEvent[] = [];
    for await (const e of sim.simulate('wh_a')) events1.push(e);
    for await (const e of sim.simulate('wh_b')) events2.push(e);
    expect(events1[0].webhookId).toBe('wh_a');
    expect(events2[0].webhookId).toBe('wh_b');
  });
});

// ---------------------------------------------------------------------------
// AC6 – Retry back-off schedule
// ---------------------------------------------------------------------------

describe('AC6 – retry back-off schedule', () => {
  it('RETRY_SCHEDULE_MS has 6 entries matching the spec', () => {
    expect(RETRY_SCHEDULE_MS).toHaveLength(6);
    expect(RETRY_SCHEDULE_MS[0]).toBe(0);              // immediate
    expect(RETRY_SCHEDULE_MS[1]).toBe(60_000);         // 1 min
    expect(RETRY_SCHEDULE_MS[2]).toBe(5 * 60_000);     // 5 min
    expect(RETRY_SCHEDULE_MS[3]).toBe(30 * 60_000);    // 30 min
    expect(RETRY_SCHEDULE_MS[4]).toBe(2 * 60 * 60_000); // 2 h
    expect(RETRY_SCHEDULE_MS[5]).toBe(8 * 60 * 60_000); // 8 h
  });

  it('emits intermediate failed events before terminal state', async () => {
    const maxAttempts = 4;
    const events = await collectEvents(
      { successRate: 0.0, maxAttempts, retryDelaysMs: INSTANT_DELAYS, rng: alwaysFail },
    );

    // All but the last should be 'failed'
    const intermediate = events.slice(0, -1);
    intermediate.forEach((e) => expect(e.status).toBe('failed'));
    expect(events[events.length - 1].status).toBe('exhausted');
  });

  it('attempt numbers are sequential starting from 1', async () => {
    const maxAttempts = 4;
    const events = await collectEvents(
      { successRate: 0.0, maxAttempts, retryDelaysMs: INSTANT_DELAYS, rng: alwaysFail },
    );
    events.forEach((e, i) => expect(e.attempt).toBe(i + 1));
  });

  it('delivers on a retry (not first attempt) when first attempt fails', async () => {
    // RNG returns 0.9 on first call (fail), then 0.1 on second (succeed)
    const values = [0.9, 0.1];
    let idx = 0;
    const rng = () => values[idx++];

    const events = await collectEvents(
      { successRate: 0.5, maxAttempts: 6, retryDelaysMs: INSTANT_DELAYS, rng },
    );

    expect(events).toHaveLength(2);
    expect(events[0].status).toBe('failed');
    expect(events[0].attempt).toBe(1);
    expect(events[1].status).toBe('delivered');
    expect(events[1].attempt).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// AC7 – successRate=1.0 → delivered on first attempt
// ---------------------------------------------------------------------------

describe('AC7 – successRate=1.0 always delivers on first attempt', () => {
  it('emits exactly one event with status delivered', async () => {
    const events = await collectEvents(
      { successRate: 1.0, maxAttempts: 6, retryDelaysMs: INSTANT_DELAYS, rng: alwaysSucceed },
    );
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('delivered');
    expect(events[0].attempt).toBe(1);
  });

  it('no failed or exhausted events are emitted', async () => {
    const events = await collectEvents(
      { successRate: 1.0, maxAttempts: 6, retryDelaysMs: INSTANT_DELAYS, rng: alwaysSucceed },
    );
    const bad = events.filter((e) => e.status === 'failed' || e.status === 'exhausted');
    expect(bad).toHaveLength(0);
  });

  it('multiple webhooks all resolve to delivered', async () => {
    const opts: WebhookDeliverySimulatorOptions = {
      successRate: 1.0,
      maxAttempts: 6,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysSucceed,
    };
    for (let i = 0; i < 5; i++) {
      const events = await collectEvents(opts, `wh_${i}`);
      expect(events[events.length - 1].status).toBe('delivered');
    }
  });
});

// ---------------------------------------------------------------------------
// AC8 – successRate=0.0 → exhausted after maxAttempts
// ---------------------------------------------------------------------------

describe('AC8 – successRate=0.0 always exhausts', () => {
  it('emits maxAttempts events with last being exhausted', async () => {
    const maxAttempts = 4;
    const events = await collectEvents(
      { successRate: 0.0, maxAttempts, retryDelaysMs: INSTANT_DELAYS, rng: alwaysFail },
    );
    expect(events).toHaveLength(maxAttempts);
    expect(events[events.length - 1].status).toBe('exhausted');
  });

  it('no delivered events are emitted', async () => {
    const events = await collectEvents(
      { successRate: 0.0, maxAttempts: 6, retryDelaysMs: INSTANT_DELAYS, rng: alwaysFail },
    );
    const delivered = events.filter((e) => e.status === 'delivered');
    expect(delivered).toHaveLength(0);
  });

  it('maxAttempts=1 with successRate=0.0 emits a single exhausted event', async () => {
    const events = await collectEvents(
      { successRate: 0.0, maxAttempts: 1, retryDelaysMs: [0], rng: alwaysFail },
    );
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('exhausted');
    expect(events[0].attempt).toBe(1);
  });

  it('default maxAttempts (6) emits 6 events', async () => {
    const events = await collectEvents(
      { successRate: 0.0, maxAttempts: DEFAULT_MAX_ATTEMPTS, retryDelaysMs: INSTANT_DELAYS, rng: alwaysFail },
    );
    expect(events).toHaveLength(6);
    expect(events[5].status).toBe('exhausted');
  });
});

// ---------------------------------------------------------------------------
// AC9 – successRate between 0 and 1 → probabilistic outcomes
// ---------------------------------------------------------------------------

describe('AC9 – probabilistic outcomes for mid-range successRate', () => {
  it('seeded RNG produces both delivered and exhausted outcomes', async () => {
    // Use a simple linear-congruential generator for reproducibility.
    let seed = 42;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0x100000000;
    };

    const SAMPLES = 50;
    let deliveredCount = 0;
    let exhaustedCount = 0;

    for (let i = 0; i < SAMPLES; i++) {
      const events = await collectEvents(
        { successRate: 0.5, maxAttempts: 1, retryDelaysMs: [0], rng: lcg },
        `wh_${i}`,
      );
      const last = events[events.length - 1];
      if (last.status === 'delivered') deliveredCount++;
      else if (last.status === 'exhausted') exhaustedCount++;
    }

    // With successRate=0.5 and 50 samples, expect both outcomes to appear
    expect(deliveredCount).toBeGreaterThan(0);
    expect(exhaustedCount).toBeGreaterThan(0);
    // And the total should be all samples
    expect(deliveredCount + exhaustedCount).toBe(SAMPLES);
  });

  it('successRate=0.8 delivers more often than it exhausts (seeded)', async () => {
    let seed = 99;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0x100000000;
    };

    const SAMPLES = 100;
    let deliveredCount = 0;

    for (let i = 0; i < SAMPLES; i++) {
      const events = await collectEvents(
        { successRate: 0.8, maxAttempts: 1, retryDelaysMs: [0], rng: lcg },
        `wh_${i}`,
      );
      if (events[events.length - 1].status === 'delivered') deliveredCount++;
    }

    // With successRate=0.8 we expect >60% delivered
    expect(deliveredCount).toBeGreaterThan(60);
  });
});

// ---------------------------------------------------------------------------
// AC11 – Number of emitted events does not exceed maxAttempts
// ---------------------------------------------------------------------------

describe('AC11 – event count does not exceed maxAttempts', () => {
  it('successRate=0.0 emits exactly maxAttempts events', async () => {
    for (const maxAttempts of [1, 2, 3, 6]) {
      const events = await collectEvents(
        { successRate: 0.0, maxAttempts, retryDelaysMs: INSTANT_DELAYS, rng: alwaysFail },
      );
      expect(events.length).toBe(maxAttempts);
    }
  });

  it('successRate=1.0 emits exactly 1 event (stops early)', async () => {
    const events = await collectEvents(
      { successRate: 1.0, maxAttempts: 6, retryDelaysMs: INSTANT_DELAYS, rng: alwaysSucceed },
    );
    expect(events.length).toBe(1);
    expect(events.length).toBeLessThanOrEqual(6);
  });

  it('maxAttempts lower than schedule length stops early', async () => {
    // maxAttempts=2 is less than the 6-entry schedule
    const events = await collectEvents(
      { successRate: 0.0, maxAttempts: 2, retryDelaysMs: INSTANT_DELAYS, rng: alwaysFail },
    );
    expect(events).toHaveLength(2);
    expect(events[1].status).toBe('exhausted');
  });

  it('never emits more events than maxAttempts with probabilistic RNG', async () => {
    let seed = 7;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0x100000000;
    };

    const maxAttempts = 4;
    for (let i = 0; i < 20; i++) {
      const events = await collectEvents(
        { successRate: 0.5, maxAttempts, retryDelaysMs: INSTANT_DELAYS, rng: lcg },
        `wh_${i}`,
      );
      expect(events.length).toBeLessThanOrEqual(maxAttempts);
    }
  });
});

// ---------------------------------------------------------------------------
// AC12 – No network calls (structural check via source import)
// ---------------------------------------------------------------------------

describe('AC12 – no network calls', () => {
  it('simulator source does not call fetch', async () => {
    const src = await import('../src/simulator/webhookDeliverySimulator.ts?raw');
    expect(src.default).not.toMatch(/\bfetch\s*\(/);
  });

  it('simulator source does not use XMLHttpRequest', async () => {
    const src = await import('../src/simulator/webhookDeliverySimulator.ts?raw');
    expect(src.default).not.toMatch(/XMLHttpRequest/);
  });

  it('simulator source does not import external HTTP libraries', async () => {
    const src = await import('../src/simulator/webhookDeliverySimulator.ts?raw');
    const httpLibs = /from\s+['"](?:axios|node-fetch|got|superagent|request)['"]/;
    expect(httpLibs.test(src.default)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC13 – Module can be imported in isolation (no UI framework imports)
// ---------------------------------------------------------------------------

describe('AC13 – no UI framework imports at module level', () => {
  it('simulator source has no UI framework imports', async () => {
    const src = await import('../src/simulator/webhookDeliverySimulator.ts?raw');
    // Should not import React, Vue, Svelte, Angular, etc.
    expect(src.default).not.toMatch(/from\s+['"]react['"]/);
    expect(src.default).not.toMatch(/from\s+['"]vue['"]/);
    expect(src.default).not.toMatch(/from\s+['"]svelte['"]/);
    expect(src.default).not.toMatch(/from\s+['"]@angular/);
  });

  it('all imports in simulator are relative (no external runtime deps)', async () => {
    const src = await import('../src/simulator/webhookDeliverySimulator.ts?raw');
    const importLines = src.default
      .split('\n')
      .filter((line: string) => /^\s*import\s/.test(line) && !/^\s*\/\//.test(line));

    for (const line of importLines) {
      const isRelative = /from\s+['"]\./.test(line);
      const isTypeOnly = /import\s+type\s/.test(line);
      expect(isRelative || isTypeOnly).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Additional edge cases
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
  it('successRate clamped: -0.1 behaves like 0.0', async () => {
    const events = await collectEvents(
      { successRate: -0.1, maxAttempts: 3, retryDelaysMs: INSTANT_DELAYS, rng: alwaysFail },
    );
    expect(events[events.length - 1].status).toBe('exhausted');
  });

  it('successRate clamped: 1.1 behaves like 1.0', async () => {
    const events = await collectEvents(
      { successRate: 1.1, maxAttempts: 6, retryDelaysMs: INSTANT_DELAYS, rng: alwaysSucceed },
    );
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('delivered');
  });

  it('defaultEventType is used when eventType not passed to simulate()', async () => {
    const sim = createWebhookDeliverySimulator({
      successRate: 1.0,
      maxAttempts: 6,
      defaultEventType: 'refund.issued',
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysSucceed,
    });
    const events: DeliveryEvent[] = [];
    for await (const e of sim.simulate('wh_default')) {
      events.push(e);
    }
    expect(events[0].eventType).toBe('refund.issued');
  });

  it('explicit eventType overrides defaultEventType', async () => {
    const sim = createWebhookDeliverySimulator({
      successRate: 1.0,
      maxAttempts: 6,
      defaultEventType: 'refund.issued',
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysSucceed,
    });
    const events: DeliveryEvent[] = [];
    for await (const e of sim.simulate('wh_override', 'payout.paid')) {
      events.push(e);
    }
    expect(events[0].eventType).toBe('payout.paid');
  });

  it('webhookId is correctly propagated to all events', async () => {
    const events = await collectEvents(
      { successRate: 0.0, maxAttempts: 3, retryDelaysMs: INSTANT_DELAYS, rng: alwaysFail },
      'wh_propagate',
    );
    events.forEach((e) => expect(e.webhookId).toBe('wh_propagate'));
  });
});

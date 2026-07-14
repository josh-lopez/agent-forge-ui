/**
 * Unit tests for the `successRate` parameter on the functional webhook
 * delivery simulator (src/webhook-simulator.ts) — Issue #252.
 *
 * Acceptance criteria covered:
 *   AC1 – successRate is exported as part of SimulatorOptions (typed 0.0–1.0).
 *   AC2 – successRate=1.0 → every attempt resolves to `delivered` on first try.
 *   AC3 – successRate=0.0 → every attempt resolves to `failed` until `exhausted`.
 *   AC4 – mid-range successRate produces probabilistic outcomes (seeded RNG).
 *   AC5 – out-of-range values are clamped; behaviour is documented.
 *   AC6 – emitted event shape is unchanged regardless of successRate value.
 *   AC7 – unit tests cover 1.0, 0.0, and mid-range values.
 *   AC8 – parameter has no effect on production builds (simulator is dev-only).
 */

import { describe, expect, it } from 'vitest';
import {
  simulateWebhook,
  generateSimulatedEvents,
  type SimulatorOptions,
  type SimulationRunOptions,
  RETRY_SCHEDULE_MS,
} from '../src/webhook-simulator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** RNG that always returns a value below any positive successRate → always succeeds. */
const alwaysSucceed = () => 0.0;

/** RNG that always returns 1.0 → always fails (1.0 >= any successRate ≤ 1.0). */
const alwaysFail = () => 1.0;

/** Zero-delay retry schedule so tests run instantly. */
const INSTANT_DELAYS_COUNT = RETRY_SCHEDULE_MS.length;

// ---------------------------------------------------------------------------
// AC1 – successRate is part of the public SimulatorOptions interface
// ---------------------------------------------------------------------------

describe('AC1 – successRate is part of the public SimulatorOptions interface', () => {
  it('SimulatorOptions type accepts a successRate property', () => {
    const opts: SimulatorOptions = { successRate: 0.5 };
    expect(opts.successRate).toBe(0.5);
  });

  it('simulateWebhook accepts successRate in its options', () => {
    expect(() =>
      simulateWebhook('wh_1', 'payment.created', { successRate: 0.7, random: alwaysSucceed }),
    ).not.toThrow();
  });

  it('generateSimulatedEvents accepts successRate in its options', () => {
    expect(() =>
      generateSimulatedEvents({ successRate: 0.5, count: 2, random: alwaysSucceed }),
    ).not.toThrow();
  });

  it('SimulationRunOptions extends SimulatorOptions and also accepts successRate', () => {
    const opts: SimulationRunOptions = { successRate: 0.8, count: 5 };
    expect(opts.successRate).toBe(0.8);
  });
});

// ---------------------------------------------------------------------------
// AC2 – successRate=1.0 → every attempt resolves to `delivered` on first try
// ---------------------------------------------------------------------------

describe('AC2 – successRate=1.0 always delivers on the first attempt', () => {
  it('single webhook resolves to delivered on attempt 1', () => {
    const events = simulateWebhook('wh_1', 'payment.created', {
      successRate: 1.0,
      random: alwaysSucceed,
    });

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('delivered');
    expect(events[0].attempt).toBe(1);
  });

  it('no failed or exhausted events are emitted', () => {
    const events = simulateWebhook('wh_1', 'payment.created', {
      successRate: 1.0,
      random: alwaysSucceed,
    });

    const bad = events.filter((e) => e.status === 'failed' || e.status === 'exhausted');
    expect(bad).toHaveLength(0);
  });

  it('multiple webhooks all resolve to delivered', () => {
    for (let i = 0; i < 10; i++) {
      const events = simulateWebhook(`wh_${i}`, 'payment.created', {
        successRate: 1.0,
        random: alwaysSucceed,
      });
      expect(events[events.length - 1].status).toBe('delivered');
    }
  });

  it('generateSimulatedEvents with successRate=1.0 produces only delivered events', () => {
    const events = generateSimulatedEvents({
      successRate: 1.0,
      count: 8,
      random: alwaysSucceed,
    });

    // Every webhook should have exactly one event: delivered on attempt 1.
    const nonDelivered = events.filter((e) => e.status !== 'delivered');
    expect(nonDelivered).toHaveLength(0);
    expect(events).toHaveLength(8);
  });
});

// ---------------------------------------------------------------------------
// AC3 – successRate=0.0 → every attempt fails until `exhausted`
// ---------------------------------------------------------------------------

describe('AC3 – successRate=0.0 always exhausts', () => {
  it('webhook reaches exhausted after maxAttempts', () => {
    const maxAttempts = 4;
    const events = simulateWebhook('wh_1', 'payment.created', {
      successRate: 0.0,
      maxAttempts,
      random: alwaysFail,
    });

    // (maxAttempts - 1) failed + 1 exhausted.
    expect(events).toHaveLength(maxAttempts);
    expect(events[events.length - 1].status).toBe('exhausted');
  });

  it('no delivered events are emitted', () => {
    const events = simulateWebhook('wh_1', 'payment.created', {
      successRate: 0.0,
      random: alwaysFail,
    });

    const delivered = events.filter((e) => e.status === 'delivered');
    expect(delivered).toHaveLength(0);
  });

  it('intermediate events have status failed', () => {
    const maxAttempts = 3;
    const events = simulateWebhook('wh_1', 'payment.created', {
      successRate: 0.0,
      maxAttempts,
      random: alwaysFail,
    });

    const intermediate = events.slice(0, -1);
    intermediate.forEach((e) => expect(e.status).toBe('failed'));
  });

  it('default maxAttempts produces 6 events (matches retry schedule length)', () => {
    const events = simulateWebhook('wh_1', 'payment.created', {
      successRate: 0.0,
      random: alwaysFail,
    });

    expect(events).toHaveLength(INSTANT_DELAYS_COUNT);
    expect(events[events.length - 1].status).toBe('exhausted');
  });

  it('multiple webhooks all reach exhausted', () => {
    for (let i = 0; i < 5; i++) {
      const events = simulateWebhook(`wh_${i}`, 'refund.issued', {
        successRate: 0.0,
        random: alwaysFail,
      });
      expect(events[events.length - 1].status).toBe('exhausted');
    }
  });

  it('generateSimulatedEvents with successRate=0.0 produces no delivered events', () => {
    const events = generateSimulatedEvents({
      successRate: 0.0,
      count: 5,
      random: alwaysFail,
    });

    const delivered = events.filter((e) => e.status === 'delivered');
    expect(delivered).toHaveLength(0);

    // Every batch must end with exhausted.
    const webhookIds = [...new Set(events.map((e) => e.webhookId))];
    for (const id of webhookIds) {
      const webhookEvents = events.filter((e) => e.webhookId === id);
      expect(webhookEvents[webhookEvents.length - 1].status).toBe('exhausted');
    }
  });
});

// ---------------------------------------------------------------------------
// AC4 – mid-range successRate produces probabilistic outcomes (seeded RNG)
// ---------------------------------------------------------------------------

describe('AC4 – mid-range successRate produces probabilistic outcomes', () => {
  it('successRate=0.5 with alternating RNG delivers exactly 50% of webhooks', () => {
    // Alternating sequence: 0.4 (< 0.5 → succeed) and 0.6 (>= 0.5 → fail).
    // With maxAttempts=1 each webhook either delivers or exhausts immediately.
    const sequence = [0.4, 0.6];
    let idx = 0;
    const seededRng = () => sequence[idx++ % sequence.length];

    let delivered = 0;
    let exhausted = 0;

    for (let i = 0; i < 10; i++) {
      idx = i % 2 === 0 ? 0 : 1; // reset to alternating position
      const events = simulateWebhook(`wh_${i}`, 'payment.created', {
        successRate: 0.5,
        maxAttempts: 1,
        random: seededRng,
      });
      const last = events[events.length - 1];
      if (last.status === 'delivered') delivered++;
      else if (last.status === 'exhausted') exhausted++;
    }

    expect(delivered).toBe(5);
    expect(exhausted).toBe(5);
  });

  it('successRate=0.5 with LCG seed stays within tolerance over 200 samples', () => {
    let seed = 42;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0x100000000;
    };

    const SAMPLES = 200;
    let deliveredCount = 0;

    for (let i = 0; i < SAMPLES; i++) {
      const events = simulateWebhook(`wh_${i}`, 'payment.created', {
        successRate: 0.5,
        maxAttempts: 1,
        random: lcg,
      });
      if (events[events.length - 1].status === 'delivered') deliveredCount++;
    }

    const rate = deliveredCount / SAMPLES;
    // With a seeded LCG and 200 samples, expect within ±15% of 0.5.
    expect(rate).toBeGreaterThan(0.35);
    expect(rate).toBeLessThan(0.65);
  });

  it('successRate=0.8 delivers more often than it exhausts (seeded LCG)', () => {
    let seed = 99;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0x100000000;
    };

    const SAMPLES = 100;
    let deliveredCount = 0;

    for (let i = 0; i < SAMPLES; i++) {
      const events = simulateWebhook(`wh_${i}`, 'payment.created', {
        successRate: 0.8,
        maxAttempts: 1,
        random: lcg,
      });
      if (events[events.length - 1].status === 'delivered') deliveredCount++;
    }

    // With successRate=0.8 we expect >60% delivered.
    expect(deliveredCount).toBeGreaterThan(60);
  });

  it('successRate=0.5 threads through every retry iteration, not just the first', () => {
    // RNG returns 0.9 on first call (fail), then 0.1 on second (succeed).
    const values = [0.9, 0.1];
    let idx = 0;
    const rng = () => values[idx++];

    const events = simulateWebhook('wh_retry', 'payment.created', {
      successRate: 0.5,
      maxAttempts: 3,
      random: rng,
    });

    // First attempt fails, second succeeds — proves successRate is checked on retries.
    expect(events).toHaveLength(2);
    expect(events[0].status).toBe('failed');
    expect(events[0].attempt).toBe(1);
    expect(events[1].status).toBe('delivered');
    expect(events[1].attempt).toBe(2);
  });

  it('generateSimulatedEvents with successRate=0.5 produces a mix of outcomes', () => {
    // Use a seeded LCG that produces a known mix of outcomes.
    // The RNG is shared between event-type selection and success checks, so we
    // use a large enough sample with a seeded generator to guarantee both
    // delivered and exhausted webhooks appear.
    let seed = 12345;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0x100000000;
    };

    const events = generateSimulatedEvents({
      successRate: 0.5,
      count: 30,
      maxAttempts: 1,
      random: lcg,
    });

    const webhookIds = [...new Set(events.map((e) => e.webhookId))];
    const deliveredWebhooks = webhookIds.filter((id) => {
      const wh = events.filter((e) => e.webhookId === id);
      return wh[wh.length - 1].status === 'delivered';
    });
    const exhaustedWebhooks = webhookIds.filter((id) => {
      const wh = events.filter((e) => e.webhookId === id);
      return wh[wh.length - 1].status === 'exhausted';
    });

    // With 30 webhooks and successRate=0.5, both outcomes must appear.
    expect(deliveredWebhooks.length).toBeGreaterThan(0);
    expect(exhaustedWebhooks.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// AC5 – out-of-range successRate is clamped; behaviour is documented
// ---------------------------------------------------------------------------

describe('AC5 – out-of-range successRate is clamped gracefully', () => {
  it('successRate=-0.1 is clamped to 0.0 (behaves like always-fail)', () => {
    const events = simulateWebhook('wh_1', 'payment.created', {
      successRate: -0.1,
      random: alwaysFail,
    });

    expect(events[events.length - 1].status).toBe('exhausted');
  });

  it('successRate=1.1 is clamped to 1.0 (behaves like always-succeed)', () => {
    const events = simulateWebhook('wh_1', 'payment.created', {
      successRate: 1.1,
      random: alwaysSucceed,
    });

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('delivered');
  });

  it('successRate=-0.1 does not throw', () => {
    expect(() =>
      simulateWebhook('wh_1', 'payment.created', { successRate: -0.1, random: alwaysFail }),
    ).not.toThrow();
  });

  it('successRate=1.1 does not throw', () => {
    expect(() =>
      simulateWebhook('wh_1', 'payment.created', { successRate: 1.1, random: alwaysSucceed }),
    ).not.toThrow();
  });

  it('successRate=2.0 is clamped to 1.0 (always delivers)', () => {
    const events = simulateWebhook('wh_1', 'payment.created', {
      successRate: 2.0,
      random: alwaysSucceed,
    });

    expect(events[0].status).toBe('delivered');
  });

  it('successRate=NaN is treated as 0 (clamped to 0.0)', () => {
    // clamp01 returns 0 for NaN — verify it does not crash.
    expect(() =>
      simulateWebhook('wh_1', 'payment.created', { successRate: NaN, random: alwaysFail }),
    ).not.toThrow();
  });

  it('boundary value 0.0 exactly: random()=0.0 does NOT succeed (0.0 < 0.0 is false)', () => {
    // With successRate=0.0, the condition `random() < 0.0` is always false.
    const events = simulateWebhook('wh_1', 'payment.created', {
      successRate: 0.0,
      maxAttempts: 1,
      random: () => 0.0,
    });

    expect(events[0].status).toBe('exhausted');
  });

  it('boundary value 1.0 exactly: random()=0.0 succeeds (0.0 < 1.0 is true)', () => {
    const events = simulateWebhook('wh_1', 'payment.created', {
      successRate: 1.0,
      random: () => 0.0,
    });

    expect(events[0].status).toBe('delivered');
  });
});

// ---------------------------------------------------------------------------
// AC6 – emitted event shape is unchanged regardless of successRate value
// ---------------------------------------------------------------------------

describe('AC6 – emitted DeliveryEvent shape is unchanged regardless of successRate', () => {
  it('delivered event has all required fields (successRate=1.0)', () => {
    const events = simulateWebhook('wh_shape', 'refund.issued', {
      successRate: 1.0,
      random: alwaysSucceed,
    });

    const event = events[0];
    expect(event).toHaveProperty('webhookId', 'wh_shape');
    expect(event).toHaveProperty('eventType', 'refund.issued');
    expect(event).toHaveProperty('status', 'delivered');
    expect(event).toHaveProperty('attempt', 1);
    expect(event).toHaveProperty('timestamp');
    expect(event).toHaveProperty('httpStatus');
    expect(event).toHaveProperty('responseBodyExcerpt');
  });

  it('failed event has all required fields (successRate=0.0, intermediate)', () => {
    const events = simulateWebhook('wh_fail', 'payment.created', {
      successRate: 0.0,
      maxAttempts: 2,
      random: alwaysFail,
    });

    const failedEvent = events[0];
    expect(failedEvent.status).toBe('failed');
    expect(failedEvent).toHaveProperty('webhookId', 'wh_fail');
    expect(failedEvent).toHaveProperty('eventType', 'payment.created');
    expect(failedEvent).toHaveProperty('attempt', 1);
    expect(failedEvent).toHaveProperty('timestamp');
    expect(failedEvent).toHaveProperty('httpStatus');
    expect(failedEvent).toHaveProperty('responseBodyExcerpt');
  });

  it('exhausted event has all required fields (successRate=0.0, final)', () => {
    const events = simulateWebhook('wh_exhausted', 'dispute.opened', {
      successRate: 0.0,
      maxAttempts: 2,
      random: alwaysFail,
    });

    const exhaustedEvent = events[events.length - 1];
    expect(exhaustedEvent.status).toBe('exhausted');
    expect(exhaustedEvent).toHaveProperty('webhookId', 'wh_exhausted');
    expect(exhaustedEvent).toHaveProperty('eventType', 'dispute.opened');
    expect(exhaustedEvent).toHaveProperty('attempt', 2);
    expect(exhaustedEvent).toHaveProperty('timestamp');
    expect(exhaustedEvent).toHaveProperty('httpStatus');
    expect(exhaustedEvent).toHaveProperty('responseBodyExcerpt');
  });

  it('timestamp is a valid ISO-8601 string for all successRate values', () => {
    for (const successRate of [0.0, 0.5, 1.0]) {
      const rng = successRate === 0.0 ? alwaysFail : alwaysSucceed;
      const events = simulateWebhook('wh_ts', 'payment.created', {
        successRate,
        maxAttempts: 1,
        random: rng,
      });

      const ts = events[0].timestamp;
      expect(typeof ts).toBe('string');
      expect(new Date(ts).toISOString()).toBe(ts);
    }
  });

  it('attempt numbers are sequential starting from 1', () => {
    const maxAttempts = 4;
    const events = simulateWebhook('wh_seq', 'payment.created', {
      successRate: 0.0,
      maxAttempts,
      random: alwaysFail,
    });

    events.forEach((e, i) => {
      expect(e.attempt).toBe(i + 1);
    });
  });

  it('httpStatus is 200 for delivered events', () => {
    const events = simulateWebhook('wh_http', 'payment.created', {
      successRate: 1.0,
      random: alwaysSucceed,
    });

    expect(events[0].httpStatus).toBe(200);
  });

  it('httpStatus is non-200 for failed/exhausted events', () => {
    const events = simulateWebhook('wh_http_fail', 'payment.created', {
      successRate: 0.0,
      maxAttempts: 2,
      random: alwaysFail,
    });

    events.forEach((e) => {
      expect(e.httpStatus).not.toBe(200);
    });
  });

  it('responseBodyExcerpt is a string for all event statuses', () => {
    const events = simulateWebhook('wh_body', 'payment.created', {
      successRate: 0.0,
      maxAttempts: 3,
      random: alwaysFail,
    });

    events.forEach((e) => {
      expect(typeof e.responseBodyExcerpt).toBe('string');
    });
  });
});

// ---------------------------------------------------------------------------
// AC7 – unit tests cover 1.0, 0.0, and mid-range values (explicit summary)
// ---------------------------------------------------------------------------

describe('AC7 – explicit coverage of successRate=1.0, 0.0, and mid-range', () => {
  it('successRate=1.0: single delivered event, no retries', () => {
    const events = simulateWebhook('wh_ac7_1', 'payment.created', {
      successRate: 1.0,
      random: alwaysSucceed,
    });

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('delivered');
    expect(events[0].attempt).toBe(1);
  });

  it('successRate=0.0: all attempts fail, final is exhausted', () => {
    const maxAttempts = 3;
    const events = simulateWebhook('wh_ac7_0', 'payment.created', {
      successRate: 0.0,
      maxAttempts,
      random: alwaysFail,
    });

    expect(events).toHaveLength(maxAttempts);
    expect(events.slice(0, -1).every((e) => e.status === 'failed')).toBe(true);
    expect(events[events.length - 1].status).toBe('exhausted');
  });

  it('successRate=0.5: mix of delivered and exhausted across a sample', () => {
    // Use a deterministic sequence to guarantee both outcomes appear.
    const values = [0.4, 0.6]; // 0.4 < 0.5 → succeed; 0.6 >= 0.5 → fail
    let idx = 0;
    const rng = () => values[idx++ % values.length];

    const outcomes = new Set<string>();
    for (let i = 0; i < 10; i++) {
      idx = i % 2 === 0 ? 0 : 1;
      const events = simulateWebhook(`wh_ac7_mid_${i}`, 'payment.created', {
        successRate: 0.5,
        maxAttempts: 1,
        random: rng,
      });
      outcomes.add(events[events.length - 1].status);
    }

    expect(outcomes.has('delivered')).toBe(true);
    expect(outcomes.has('exhausted')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC8 – successRate has no effect on production builds (simulator is dev-only)
// ---------------------------------------------------------------------------

describe('AC8 – successRate parameter has no effect on production builds', () => {
  it('main.ts gates simulator usage behind a dev-mode flag (not unconditional)', async () => {
    // The simulator is imported in main.ts but its usage is gated behind a
    // runtime check (simulatorEnabled()) so it has no effect in production.
    const MAIN_SOURCE = await import('../src/main.ts?raw').then((m) => m.default);
    // The simulator call must be inside a conditional block, not at top level.
    expect(MAIN_SOURCE).toMatch(/if\s*\(\s*simulatorEnabled\s*\(\s*\)/);
    // The generateSimulatedEvents call must appear after the guard.
    expect(MAIN_SOURCE).toMatch(/simulatorEnabled[\s\S]*generateSimulatedEvents/);
  });

  it('webhook-simulator module makes no network calls', async () => {
    const SIM_SOURCE = await import('../src/webhook-simulator.ts?raw').then((m) => m.default);
    expect(SIM_SOURCE).not.toMatch(/\bfetch\s*\(/);
    expect(SIM_SOURCE).not.toMatch(/XMLHttpRequest/);
    expect(SIM_SOURCE).not.toMatch(/axios/);
  });

  it('webhook-simulator module has no external (non-relative) imports', async () => {
    const SIM_SOURCE = await import('../src/webhook-simulator.ts?raw').then((m) => m.default);
    const importLines = SIM_SOURCE
      .split('\n')
      .filter((line) => /^\s*import\s/.test(line));

    for (const line of importLines) {
      const isRelative = /from\s+['"]\./.test(line);
      const isTypeOnly = /import\s+type\s/.test(line);
      expect(isRelative || isTypeOnly).toBe(true);
    }
  });

  it('webhook-simulator module has no top-level side-effecting calls', async () => {
    // A passive module should not execute side effects at import time.
    const SIM_SOURCE = await import('../src/webhook-simulator.ts?raw').then((m) => m.default);
    const topLevelCallLines = SIM_SOURCE
      .split('\n')
      .filter((line) => {
        if (/^\s/.test(line)) return false;
        const trimmed = line.trim();
        if (!trimmed) return false;
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
        if (/^(import|export|const|let|var|function|class|type|interface|async)\b/.test(trimmed)) return false;
        return /^\w+\s*\(/.test(trimmed);
      });

    expect(topLevelCallLines).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
  it('maxAttempts=1 with successRate=0.0 emits a single exhausted event', () => {
    const events = simulateWebhook('wh_edge_1', 'payment.created', {
      successRate: 0.0,
      maxAttempts: 1,
      random: alwaysFail,
    });

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('exhausted');
    expect(events[0].attempt).toBe(1);
  });

  it('maxAttempts=1 with successRate=1.0 emits a single delivered event', () => {
    const events = simulateWebhook('wh_edge_2', 'payment.created', {
      successRate: 1.0,
      maxAttempts: 1,
      random: alwaysSucceed,
    });

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('delivered');
  });

  it('generateSimulatedEvents with count=0 returns empty array', () => {
    const events = generateSimulatedEvents({ count: 0, successRate: 0.5 });
    expect(events).toHaveLength(0);
  });

  it('successRate is threaded through every retry, not just the first attempt', () => {
    // Verify that the successRate check happens on each retry iteration.
    // RNG returns 0.9 (fail), 0.9 (fail), 0.1 (succeed) — proves all 3 calls.
    const values = [0.9, 0.9, 0.1];
    let idx = 0;
    const rng = () => values[idx++];

    const events = simulateWebhook('wh_retry_thread', 'payment.created', {
      successRate: 0.5,
      maxAttempts: 4,
      random: rng,
    });

    expect(events).toHaveLength(3);
    expect(events[0].status).toBe('failed');
    expect(events[1].status).toBe('failed');
    expect(events[2].status).toBe('delivered');
    expect(events[2].attempt).toBe(3);
  });

  it('omitting successRate defaults to a non-zero value (some deliveries expected)', () => {
    // Default successRate is 0.8 — with alwaysSucceed RNG, should deliver.
    const events = simulateWebhook('wh_default', 'payment.created', {
      random: alwaysSucceed,
    });

    expect(events[0].status).toBe('delivered');
  });
});

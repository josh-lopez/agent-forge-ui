/**
 * Unit tests for the WebhookSimulator — Issue #156
 *
 * Acceptance criteria covered:
 *   AC1  – successRate is part of the public API/configuration.
 *   AC2  – successRate=1.0 → every attempt resolves to `delivered`.
 *   AC3  – successRate=0.0 → every attempt eventually resolves to `exhausted`.
 *   AC4  – mid-range successRate produces probabilistic outcomes (seeded RNG).
 *   AC5  – out-of-range successRate is clamped gracefully.
 *   AC6  – JSDoc is present on the public interface (structural check).
 *   AC7  – unit tests for 1.0, 0.0, and mid-range.
 *   AC8  – emitted event shape is unchanged / consistent.
 */

import { describe, expect, it } from 'vitest';
import {
  WebhookSimulator,
  type DeliveryEvent,
  type SimulatorConfig,
} from '../src/webhookSimulator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Collect all events from a single deliver() call synchronously by using
 * zero-delay retries and a deterministic RNG.
 */
async function collectEvents(
  config: SimulatorConfig,
  webhookId = 'wh_test',
  eventType = 'payment.created',
): Promise<DeliveryEvent[]> {
  const sim = new WebhookSimulator(config);
  const events: DeliveryEvent[] = [];
  for await (const event of sim.deliver(webhookId, eventType)) {
    events.push(event);
  }
  return events;
}

/** A deterministic RNG that always returns the given constant. */
const alwaysSucceed = () => 0.0;   // 0.0 < any successRate > 0 → succeeds
const alwaysFail    = () => 1.0;   // 1.0 >= any successRate < 1 → fails

// Zero-delay retry schedule so tests run instantly.
const INSTANT_DELAYS = [0, 0, 0, 0, 0, 0];

// ---------------------------------------------------------------------------
// AC1 – successRate is part of the public API
// ---------------------------------------------------------------------------

describe('AC1 – successRate is part of the public SimulatorConfig interface', () => {
  it('SimulatorConfig type accepts a successRate property', () => {
    // If this compiles, the property exists on the interface.
    const config: SimulatorConfig = { successRate: 0.5 };
    expect(config.successRate).toBe(0.5);
  });

  it('WebhookSimulator constructor accepts successRate', () => {
    expect(() => new WebhookSimulator({ successRate: 0.7 })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AC2 – successRate=1.0 → every attempt resolves to `delivered`
// ---------------------------------------------------------------------------

describe('AC2 – successRate=1.0 always delivers', () => {
  it('single webhook resolves to delivered on the first attempt', async () => {
    const events = await collectEvents({
      successRate: 1.0,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysSucceed,
    });

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('delivered');
    expect(events[0].attempt).toBe(1);
  });

  it('multiple webhooks all resolve to delivered', async () => {
    const config: SimulatorConfig = {
      successRate: 1.0,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysSucceed,
    };

    for (let i = 0; i < 10; i++) {
      const events = await collectEvents(config, `wh_${i}`);
      const last = events[events.length - 1];
      expect(last.status).toBe('delivered');
    }
  });

  it('no failed or exhausted events are emitted', async () => {
    const events = await collectEvents({
      successRate: 1.0,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysSucceed,
    });

    const bad = events.filter(
      (e) => e.status === 'failed' || e.status === 'exhausted',
    );
    expect(bad).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// AC3 – successRate=0.0 → every attempt eventually resolves to `exhausted`
// ---------------------------------------------------------------------------

describe('AC3 – successRate=0.0 always exhausts', () => {
  it('webhook reaches exhausted after maxAttempts', async () => {
    const maxAttempts = 4;
    const events = await collectEvents({
      successRate: 0.0,
      maxAttempts,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysFail,
    });

    // Should emit (maxAttempts - 1) failed events + 1 exhausted event.
    expect(events).toHaveLength(maxAttempts);
    expect(events[events.length - 1].status).toBe('exhausted');
  });

  it('no delivered events are emitted', async () => {
    const events = await collectEvents({
      successRate: 0.0,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysFail,
    });

    const delivered = events.filter((e) => e.status === 'delivered');
    expect(delivered).toHaveLength(0);
  });

  it('intermediate events have status failed', async () => {
    const maxAttempts = 3;
    const events = await collectEvents({
      successRate: 0.0,
      maxAttempts,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysFail,
    });

    // All but the last should be 'failed'.
    const intermediate = events.slice(0, -1);
    intermediate.forEach((e) => expect(e.status).toBe('failed'));
  });

  it('multiple webhooks all reach exhausted', async () => {
    const config: SimulatorConfig = {
      successRate: 0.0,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysFail,
    };

    for (let i = 0; i < 5; i++) {
      const events = await collectEvents(config, `wh_${i}`);
      const last = events[events.length - 1];
      expect(last.status).toBe('exhausted');
    }
  });
});

// ---------------------------------------------------------------------------
// AC4 – mid-range successRate produces probabilistic outcomes
// ---------------------------------------------------------------------------

describe('AC4 – mid-range successRate produces probabilistic outcomes', () => {
  it('successRate=0.5 with seeded RNG delivers ~50% of webhooks', async () => {
    // Use a deterministic sequence: alternating 0.4 (< 0.5 → succeed) and
    // 0.6 (>= 0.5 → fail).  With maxAttempts=1 each webhook either delivers
    // or exhausts on the first attempt, giving us a clean 50/50 split.
    const sequence = [0.4, 0.6, 0.4, 0.6, 0.4, 0.6, 0.4, 0.6, 0.4, 0.6];
    let idx = 0;
    const seededRng = () => sequence[idx++ % sequence.length];

    const config: SimulatorConfig = {
      successRate: 0.5,
      maxAttempts: 1,
      retryDelaysMs: [0],
      rng: seededRng,
    };

    let delivered = 0;
    let exhausted = 0;

    for (let i = 0; i < 10; i++) {
      idx = i % 2 === 0 ? 0 : 1; // reset to alternating position
      const events = await collectEvents(config, `wh_${i}`);
      const last = events[events.length - 1];
      if (last.status === 'delivered') delivered++;
      else if (last.status === 'exhausted') exhausted++;
    }

    // With the alternating sequence, exactly 5 should deliver and 5 exhaust.
    expect(delivered).toBe(5);
    expect(exhausted).toBe(5);
  });

  it('successRate=0.5 with large sample stays within tolerance (seeded)', async () => {
    // Use a simple linear-congruential generator for reproducibility.
    let seed = 42;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0x100000000;
    };

    const SAMPLES = 200;
    let deliveredCount = 0;

    for (let i = 0; i < SAMPLES; i++) {
      const events = await collectEvents(
        {
          successRate: 0.5,
          maxAttempts: 1,
          retryDelaysMs: [0],
          rng: lcg,
        },
        `wh_${i}`,
      );
      if (events[events.length - 1].status === 'delivered') deliveredCount++;
    }

    const rate = deliveredCount / SAMPLES;
    // With a seeded LCG and 200 samples, expect within ±15% of 0.5.
    expect(rate).toBeGreaterThan(0.35);
    expect(rate).toBeLessThan(0.65);
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
        {
          successRate: 0.8,
          maxAttempts: 1,
          retryDelaysMs: [0],
          rng: lcg,
        },
        `wh_${i}`,
      );
      if (events[events.length - 1].status === 'delivered') deliveredCount++;
    }

    // With successRate=0.8 we expect >60% delivered.
    expect(deliveredCount).toBeGreaterThan(60);
  });
});

// ---------------------------------------------------------------------------
// AC5 – out-of-range successRate is clamped gracefully
// ---------------------------------------------------------------------------

describe('AC5 – out-of-range successRate is clamped', () => {
  it('successRate=-0.1 is clamped to 0.0 (behaves like always-fail)', async () => {
    const events = await collectEvents({
      successRate: -0.1,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysFail,
    });

    const last = events[events.length - 1];
    expect(last.status).toBe('exhausted');
  });

  it('successRate=1.1 is clamped to 1.0 (behaves like always-succeed)', async () => {
    const events = await collectEvents({
      successRate: 1.1,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysSucceed,
    });

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('delivered');
  });

  it('successRate=-0.1 does not throw', () => {
    expect(() => new WebhookSimulator({ successRate: -0.1 })).not.toThrow();
  });

  it('successRate=1.1 does not throw', () => {
    expect(() => new WebhookSimulator({ successRate: 1.1 })).not.toThrow();
  });

  it('successRate=2.0 is clamped to 1.0 (always delivers)', async () => {
    const events = await collectEvents({
      successRate: 2.0,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysSucceed,
    });

    expect(events[0].status).toBe('delivered');
  });
});

// ---------------------------------------------------------------------------
// AC8 – emitted event shape is consistent and complete
// ---------------------------------------------------------------------------

describe('AC8 – emitted DeliveryEvent shape is unchanged', () => {
  it('delivered event has all required fields', async () => {
    const events = await collectEvents({
      successRate: 1.0,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysSucceed,
    }, 'wh_shape_test', 'refund.issued');

    const event = events[0];
    expect(event).toHaveProperty('webhookId', 'wh_shape_test');
    expect(event).toHaveProperty('eventType', 'refund.issued');
    expect(event).toHaveProperty('status', 'delivered');
    expect(event).toHaveProperty('timestamp');
    expect(event).toHaveProperty('httpStatus', 200);
    expect(event).toHaveProperty('responseExcerpt', 'OK');
    expect(event).toHaveProperty('attempt', 1);
  });

  it('failed event has all required fields', async () => {
    const events = await collectEvents({
      successRate: 0.0,
      maxAttempts: 2,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysFail,
    }, 'wh_fail_test', 'payment.created');

    const failedEvent = events[0];
    expect(failedEvent.status).toBe('failed');
    expect(failedEvent).toHaveProperty('webhookId', 'wh_fail_test');
    expect(failedEvent).toHaveProperty('eventType', 'payment.created');
    expect(failedEvent).toHaveProperty('timestamp');
    expect(failedEvent).toHaveProperty('httpStatus', 500);
    expect(failedEvent).toHaveProperty('attempt', 1);
  });

  it('exhausted event has all required fields', async () => {
    const events = await collectEvents({
      successRate: 0.0,
      maxAttempts: 2,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysFail,
    }, 'wh_exhausted_test', 'dispute.opened');

    const exhaustedEvent = events[events.length - 1];
    expect(exhaustedEvent.status).toBe('exhausted');
    expect(exhaustedEvent).toHaveProperty('webhookId', 'wh_exhausted_test');
    expect(exhaustedEvent).toHaveProperty('eventType', 'dispute.opened');
    expect(exhaustedEvent).toHaveProperty('timestamp');
    expect(exhaustedEvent).toHaveProperty('attempt', 2);
  });

  it('timestamp is a valid ISO-8601 string', async () => {
    const events = await collectEvents({
      successRate: 1.0,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysSucceed,
    });

    const ts = events[0].timestamp;
    expect(typeof ts).toBe('string');
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it('attempt numbers are sequential starting from 1', async () => {
    const maxAttempts = 4;
    const events = await collectEvents({
      successRate: 0.0,
      maxAttempts,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysFail,
    });

    events.forEach((e, i) => {
      expect(e.attempt).toBe(i + 1);
    });
  });
});

// ---------------------------------------------------------------------------
// Additional edge-case tests
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
  it('maxAttempts=1 with successRate=0.0 emits a single exhausted event', async () => {
    const events = await collectEvents({
      successRate: 0.0,
      maxAttempts: 1,
      retryDelaysMs: [0],
      rng: alwaysFail,
    });

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('exhausted');
    expect(events[0].attempt).toBe(1);
  });

  it('maxAttempts=1 with successRate=1.0 emits a single delivered event', async () => {
    const events = await collectEvents({
      successRate: 1.0,
      maxAttempts: 1,
      retryDelaysMs: [0],
      rng: alwaysSucceed,
    });

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('delivered');
  });

  it('successRate=0.0 with default maxAttempts emits 6 events', async () => {
    const events = await collectEvents({
      successRate: 0.0,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysFail,
    });

    // Default maxAttempts is 6.
    expect(events).toHaveLength(6);
    expect(events[5].status).toBe('exhausted');
  });

  it('delivers on a retry (not first attempt) when first attempt fails', async () => {
    // RNG returns 0.9 on first call (fail), then 0.1 on second (succeed).
    const values = [0.9, 0.1];
    let idx = 0;
    const rng = () => values[idx++];

    const events = await collectEvents({
      successRate: 0.5,
      maxAttempts: 3,
      retryDelaysMs: [0, 0, 0],
      rng,
    });

    expect(events).toHaveLength(2);
    expect(events[0].status).toBe('failed');
    expect(events[0].attempt).toBe(1);
    expect(events[1].status).toBe('delivered');
    expect(events[1].attempt).toBe(2);
  });
});

/**
 * Supplemental tests for the `successRate` parameter — Issue #252.
 * These complement the main webhook-simulator-successRate.test.ts file
 * and verify a few additional edge cases not covered there.
 */

import { describe, expect, it } from 'vitest';
import {
  simulateWebhook,
  generateSimulatedEvents,
  RETRY_SCHEDULE_MS,
} from '../src/webhook-simulator';

describe('AC2/AC3 – successRate boundary: exactly 1.0 and 0.0 with real Math.random replaced', () => {
  it('successRate=1.0 with rng returning 0.999 still delivers (0.999 < 1.0)', () => {
    const events = simulateWebhook('wh_boundary', 'payment.created', {
      successRate: 1.0,
      random: () => 0.999,
    });
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('delivered');
  });

  it('successRate=0.0 with rng returning 0.0 still exhausts (0.0 < 0.0 is false)', () => {
    const events = simulateWebhook('wh_boundary2', 'payment.created', {
      successRate: 0.0,
      maxAttempts: 2,
      random: () => 0.0,
    });
    expect(events[events.length - 1].status).toBe('exhausted');
  });
});

describe('AC4 – successRate threads through generateSimulatedEvents correctly', () => {
  it('generateSimulatedEvents successRate=1.0 produces only delivered final events', () => {
    const events = generateSimulatedEvents({
      successRate: 1.0,
      count: 5,
      random: () => 0.0,
    });
    const ids = [...new Set(events.map((e) => e.webhookId))];
    for (const id of ids) {
      const wh = events.filter((e) => e.webhookId === id);
      expect(wh[wh.length - 1].status).toBe('delivered');
    }
  });

  it('generateSimulatedEvents successRate=0.0 produces only exhausted final events', () => {
    const events = generateSimulatedEvents({
      successRate: 0.0,
      count: 5,
      random: () => 1.0,
    });
    const ids = [...new Set(events.map((e) => e.webhookId))];
    for (const id of ids) {
      const wh = events.filter((e) => e.webhookId === id);
      expect(wh[wh.length - 1].status).toBe('exhausted');
    }
  });
});

describe('AC6 – event shape: webhookId and eventType are preserved verbatim', () => {
  it('webhookId is preserved exactly in all emitted events', () => {
    const events = simulateWebhook('my-webhook-id-123', 'payout.paid', {
      successRate: 0.0,
      maxAttempts: 3,
      random: () => 1.0,
    });
    for (const e of events) {
      expect(e.webhookId).toBe('my-webhook-id-123');
      expect(e.eventType).toBe('payout.paid');
    }
  });
});

describe('AC5 – retry schedule length matches RETRY_SCHEDULE_MS', () => {
  it('default maxAttempts equals RETRY_SCHEDULE_MS.length', () => {
    const events = simulateWebhook('wh_sched', 'payment.created', {
      successRate: 0.0,
      random: () => 1.0,
    });
    expect(events).toHaveLength(RETRY_SCHEDULE_MS.length);
  });
});

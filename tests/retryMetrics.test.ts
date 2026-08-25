/**
 * Unit tests for Issue #161: per-event-type retry count breakdown.
 *
 * Covers all acceptance criteria from the issue:
 *   AC1 – mean retry count displayed per distinct event type
 *   AC4 – zero-delivery edge case handled gracefully
 *   AC6 – correct mean for single event type, multiple event types,
 *          zero-delivery edge case, 100% failure edge case
 *
 * Retry count definition (consistent with src/retryMetrics.ts):
 *   retries = attemptCount - 1
 *   A webhook delivered on the first attempt contributes 0 retries.
 *
 * Spec ref: spec § "Webhook delivery metrics dashboard — Average retry count"
 */

import { describe, expect, it } from 'vitest';
import {
  calcRetryCountByEventType,
  formatMeanRetryCount,
  renderRetryBreakdownTable,
  type RetryableWebhook,
  type EventTypeRetryStats,
} from '../src/retryMetrics';

// ── Helper ────────────────────────────────────────────────────────────────────

function wh(eventType: string, attemptCount: number): RetryableWebhook {
  return { eventType, attemptCount };
}

// ── calcRetryCountByEventType ─────────────────────────────────────────────────

describe('calcRetryCountByEventType', () => {
  // AC6 – zero deliveries edge case
  it('returns empty array when given an empty webhook list', () => {
    const result = calcRetryCountByEventType([]);
    expect(result).toEqual([]);
  });

  // AC6 – single event type, single attempt (0 retries)
  it('returns 0 mean retries for a single webhook with 1 attempt', () => {
    const result = calcRetryCountByEventType([wh('payment.created', 1)]);
    expect(result).toHaveLength(1);
    expect(result[0].eventType).toBe('payment.created');
    expect(result[0].meanRetryCount).toBe(0);
    expect(result[0].webhookCount).toBe(1);
  });

  // AC6 – single event type, multiple attempts
  it('calculates correct mean for a single event type with multiple webhooks', () => {
    // 3 webhooks: 1 attempt (0 retries), 3 attempts (2 retries), 2 attempts (1 retry)
    // mean = (0 + 2 + 1) / 3 = 1.0
    const webhooks = [
      wh('payment.created', 1),
      wh('payment.created', 3),
      wh('payment.created', 2),
    ];
    const result = calcRetryCountByEventType(webhooks);
    expect(result).toHaveLength(1);
    expect(result[0].eventType).toBe('payment.created');
    expect(result[0].meanRetryCount).toBeCloseTo(1.0);
    expect(result[0].webhookCount).toBe(3);
  });

  // AC6 – multiple distinct event types
  it('calculates correct mean for multiple distinct event types', () => {
    // payment.created: 1 attempt (0 retries), 3 attempts (2 retries) → mean = 1.0
    // refund.issued:   2 attempts (1 retry),  4 attempts (3 retries) → mean = 2.0
    const webhooks = [
      wh('payment.created', 1),
      wh('payment.created', 3),
      wh('refund.issued', 2),
      wh('refund.issued', 4),
    ];
    const result = calcRetryCountByEventType(webhooks);
    expect(result).toHaveLength(2);

    // Results are sorted alphabetically
    const pc = result.find((r) => r.eventType === 'payment.created');
    const ri = result.find((r) => r.eventType === 'refund.issued');

    expect(pc).toBeDefined();
    expect(pc!.meanRetryCount).toBeCloseTo(1.0);
    expect(pc!.webhookCount).toBe(2);

    expect(ri).toBeDefined();
    expect(ri!.meanRetryCount).toBeCloseTo(2.0);
    expect(ri!.webhookCount).toBe(2);
  });

  // AC6 – 100% failure edge case (all webhooks exhausted after max retries)
  it('handles 100% failure case (all webhooks exhausted after many retries)', () => {
    // 3 webhooks all exhausted after 6 attempts each → 5 retries each → mean = 5.0
    const webhooks = [
      wh('payment.created', 6),
      wh('payment.created', 6),
      wh('payment.created', 6),
    ];
    const result = calcRetryCountByEventType(webhooks);
    expect(result).toHaveLength(1);
    expect(result[0].meanRetryCount).toBeCloseTo(5.0);
    expect(result[0].webhookCount).toBe(3);
  });

  // AC4 – graceful handling when a specific event type has zero webhooks
  // (the function returns no entry for that type — callers handle display)
  it('does not include event types with no webhooks in the result', () => {
    // Only payment.created webhooks present; refund.issued has none
    const webhooks = [wh('payment.created', 2)];
    const result = calcRetryCountByEventType(webhooks);
    const ri = result.find((r) => r.eventType === 'refund.issued');
    expect(ri).toBeUndefined();
  });

  // AC1 – each distinct event type gets its own entry
  it('produces one result entry per distinct event type', () => {
    const webhooks = [
      wh('payment.created', 1),
      wh('refund.issued', 2),
      wh('dispute.opened', 3),
      wh('payment.created', 2),
    ];
    const result = calcRetryCountByEventType(webhooks);
    expect(result).toHaveLength(3);
    const types = result.map((r) => r.eventType).sort();
    expect(types).toEqual(['dispute.opened', 'payment.created', 'refund.issued']);
  });

  // Results are sorted alphabetically for stable rendering (AC7 scannability)
  it('returns results sorted alphabetically by event type', () => {
    const webhooks = [
      wh('refund.issued', 1),
      wh('payment.created', 1),
      wh('dispute.opened', 1),
    ];
    const result = calcRetryCountByEventType(webhooks);
    expect(result.map((r) => r.eventType)).toEqual([
      'dispute.opened',
      'payment.created',
      'refund.issued',
    ]);
  });

  // A webhook with a single attempt (never retried) contributes 0 retries
  it('a webhook with 1 attempt contributes 0 retries (not excluded)', () => {
    const webhooks = [wh('payment.created', 1), wh('payment.created', 3)];
    // mean = (0 + 2) / 2 = 1.0
    const result = calcRetryCountByEventType(webhooks);
    expect(result[0].webhookCount).toBe(2);
    expect(result[0].meanRetryCount).toBeCloseTo(1.0);
  });

  // Mixed event types with varying attempt counts
  it('handles mixed event types with varying attempt counts correctly', () => {
    const webhooks = [
      wh('payment.created', 1), // 0 retries
      wh('payment.created', 2), // 1 retry
      wh('payment.created', 3), // 2 retries
      wh('refund.issued', 4),   // 3 retries
      wh('refund.issued', 6),   // 5 retries
    ];
    // payment.created mean = (0+1+2)/3 = 1.0
    // refund.issued mean = (3+5)/2 = 4.0
    const result = calcRetryCountByEventType(webhooks);
    const pc = result.find((r) => r.eventType === 'payment.created')!;
    const ri = result.find((r) => r.eventType === 'refund.issued')!;
    expect(pc.meanRetryCount).toBeCloseTo(1.0);
    expect(ri.meanRetryCount).toBeCloseTo(4.0);
  });
});

// ── formatMeanRetryCount ──────────────────────────────────────────────────────

describe('formatMeanRetryCount', () => {
  it('returns "—" for null (zero-delivery edge case)', () => {
    expect(formatMeanRetryCount(null)).toBe('—');
  });

  it('formats 0 as "0.00"', () => {
    expect(formatMeanRetryCount(0)).toBe('0.00');
  });

  it('formats integer values with 2 decimal places by default', () => {
    expect(formatMeanRetryCount(1)).toBe('1.00');
    expect(formatMeanRetryCount(5)).toBe('5.00');
  });

  it('formats fractional values correctly', () => {
    expect(formatMeanRetryCount(1.5)).toBe('1.50');
    expect(formatMeanRetryCount(2.333)).toBe('2.33');
  });

  it('respects custom decimal places', () => {
    expect(formatMeanRetryCount(1.5, 0)).toBe('2');
    expect(formatMeanRetryCount(1.5, 1)).toBe('1.5');
    expect(formatMeanRetryCount(1.5, 3)).toBe('1.500');
  });
});

// ── renderRetryBreakdownTable ─────────────────────────────────────────────────

describe('renderRetryBreakdownTable', () => {
  it('returns a no-data message when stats array is empty', () => {
    const html = renderRetryBreakdownTable([]);
    expect(html).toContain('retry-breakdown-empty');
    expect(html).not.toContain('<table');
  });

  it('renders a table with one row per event type', () => {
    const stats: EventTypeRetryStats[] = [
      { eventType: 'payment.created', meanRetryCount: 1.0, webhookCount: 3 },
      { eventType: 'refund.issued', meanRetryCount: 2.5, webhookCount: 2 },
    ];
    const html = renderRetryBreakdownTable(stats);
    expect(html).toContain('<table');
    expect(html).toContain('payment.created');
    expect(html).toContain('refund.issued');
    // Two data rows
    const rowMatches = html.match(/<tr>/g);
    // thead row + 2 tbody rows = 3 <tr> tags
    expect(rowMatches).toHaveLength(3);
  });

  it('displays "—" for null meanRetryCount (zero-delivery edge case)', () => {
    const stats: EventTypeRetryStats[] = [
      { eventType: 'payment.created', meanRetryCount: null, webhookCount: 0 },
    ];
    const html = renderRetryBreakdownTable(stats);
    expect(html).toContain('—');
  });

  it('escapes HTML special characters in event type names', () => {
    const stats: EventTypeRetryStats[] = [
      { eventType: '<script>alert(1)</script>', meanRetryCount: 0, webhookCount: 1 },
    ];
    const html = renderRetryBreakdownTable(stats);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('includes correct CSS class names for styling', () => {
    const stats: EventTypeRetryStats[] = [
      { eventType: 'payment.created', meanRetryCount: 1.0, webhookCount: 1 },
    ];
    const html = renderRetryBreakdownTable(stats);
    expect(html).toContain('retry-breakdown-table');
    expect(html).toContain('retry-breakdown-event-type');
    expect(html).toContain('retry-breakdown-mean');
    expect(html).toContain('retry-breakdown-count');
  });

  it('includes table headers for Event Type, Mean Retries, and Webhooks', () => {
    const stats: EventTypeRetryStats[] = [
      { eventType: 'payment.created', meanRetryCount: 0, webhookCount: 1 },
    ];
    const html = renderRetryBreakdownTable(stats);
    expect(html).toContain('Event Type');
    expect(html).toContain('Mean Retries');
    expect(html).toContain('Webhooks');
  });
});

// ── Integration: full pipeline ────────────────────────────────────────────────

describe('retry metrics integration', () => {
  it('full pipeline: calc → format → render produces correct output', () => {
    const webhooks: RetryableWebhook[] = [
      wh('payment.created', 1), // 0 retries
      wh('payment.created', 3), // 2 retries
      wh('refund.issued', 2),   // 1 retry
    ];
    const stats = calcRetryCountByEventType(webhooks);
    const html = renderRetryBreakdownTable(stats);

    // payment.created mean = (0+2)/2 = 1.00
    expect(html).toContain('payment.created');
    expect(html).toContain('1.00');

    // refund.issued mean = 1/1 = 1.00
    expect(html).toContain('refund.issued');
  });

  // AC5 – simulator compatibility: all retry states exercised
  it('handles simulator-style data with all retry states', () => {
    // Simulate: pending (1 attempt), failed (3 attempts), delivered (2 attempts),
    // exhausted (6 attempts)
    const webhooks: RetryableWebhook[] = [
      wh('payment.created', 1), // pending / first attempt
      wh('payment.created', 3), // failed after 3 attempts
      wh('payment.created', 2), // delivered on 2nd attempt
      wh('payment.created', 6), // exhausted after max retries
    ];
    const stats = calcRetryCountByEventType(webhooks);
    expect(stats).toHaveLength(1);
    // mean retries = (0 + 2 + 1 + 5) / 4 = 2.0
    expect(stats[0].meanRetryCount).toBeCloseTo(2.0);
    expect(stats[0].webhookCount).toBe(4);
  });

  // AC3 – reactive recalculation: calling the function again with updated data
  // produces updated results (pure function, no stale state)
  it('recalculates correctly when called with updated data (reactive-safe)', () => {
    const initial: RetryableWebhook[] = [wh('payment.created', 1)];
    const r1 = calcRetryCountByEventType(initial);
    expect(r1[0].meanRetryCount).toBe(0);

    // Simulate a new attempt being logged
    const updated: RetryableWebhook[] = [
      wh('payment.created', 1),
      wh('payment.created', 3),
    ];
    const r2 = calcRetryCountByEventType(updated);
    expect(r2[0].meanRetryCount).toBeCloseTo(1.0);
  });
});

/**
 * Supplemental unit tests for Issue #167: Aggregate success rate metric.
 *
 * These tests complement the primary suite (metrics-success-rate.test.ts)
 * shipped by Dev, adding additional edge-case and integration coverage for
 * the acceptance criteria.
 *
 * Covers:
 *   AC1  – additional mixed-fixture percentages (2/3, 3/4, etc.)
 *   AC2  – cross-type aggregation with many distinct event types
 *   AC3  – multiple sequential reactive updates (data changes more than once)
 *   AC4  – zero-deliveries: formatSuccessRate(null) returns '—' (not '0%')
 *   AC5  – exhausted status is treated as non-delivered (counts toward failure)
 *   AC6  – 100% success with many events
 *   AC7  – single-attempt exhausted edge case
 *   AC8  – simulator full retry-flow data (pending → failed → delivered)
 *   AC9  – aria-label on the card element identifies the metric
 *
 * Spec ref: spec § "Webhook delivery metrics dashboard — Aggregate success rate"
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { calculateSuccessRate, formatSuccessRate } from '../src/metrics';
import { mountMetricsDashboard } from '../src/MetricsDashboard';
import type { DeliveryEvent } from '../src/deliveryEvent';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(
  id: string,
  status: DeliveryEvent['status'],
  eventType = 'payment.created',
  attemptCount = 1,
): DeliveryEvent {
  return {
    id,
    eventType,
    status,
    timestamp: `2024-01-01T00:0${attemptCount}:00Z`,
    attemptCount,
  };
}

// ── calculateSuccessRate — additional edge cases ──────────────────────────────

describe('calculateSuccessRate — supplemental', () => {
  // AC1: 2 of 3 delivered → ~66.67%
  it('calculates 2/3 correctly (~66.67%)', () => {
    const events: DeliveryEvent[] = [
      makeEvent('1', 'delivered'),
      makeEvent('2', 'delivered'),
      makeEvent('3', 'failed'),
    ];
    const rate = calculateSuccessRate(events);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(66.667, 2);
  });

  // AC1: 3 of 4 delivered → 75%
  it('calculates 3/4 correctly (75%)', () => {
    const events: DeliveryEvent[] = [
      makeEvent('1', 'delivered'),
      makeEvent('2', 'delivered'),
      makeEvent('3', 'delivered'),
      makeEvent('4', 'failed'),
    ];
    expect(calculateSuccessRate(events)).toBe(75);
  });

  // AC5: exhausted status is non-delivered — contributes to denominator but not numerator
  it('treats exhausted status as non-delivered', () => {
    const events: DeliveryEvent[] = [
      makeEvent('1', 'delivered'),
      makeEvent('2', 'exhausted'),
      makeEvent('3', 'exhausted'),
      makeEvent('4', 'exhausted'),
    ];
    // 1 delivered out of 4 → 25%
    expect(calculateSuccessRate(events)).toBe(25);
  });

  // AC7: single exhausted attempt → 0%
  it('returns 0 for a single exhausted attempt', () => {
    expect(calculateSuccessRate([makeEvent('1', 'exhausted')])).toBe(0);
  });

  // AC6: 100% success with a large dataset
  it('returns 100 for a large all-delivered dataset', () => {
    const events: DeliveryEvent[] = Array.from({ length: 50 }, (_, i) =>
      makeEvent(String(i), 'delivered'),
    );
    expect(calculateSuccessRate(events)).toBe(100);
  });

  // AC2: aggregates across many distinct event types
  it('aggregates correctly across many distinct event types', () => {
    const eventTypes = [
      'payment.created',
      'refund.issued',
      'dispute.opened',
      'chargeback.created',
      'payout.completed',
    ];
    // 1 delivered per type (5 total), 1 failed per type (5 total) → 50%
    const events: DeliveryEvent[] = eventTypes.flatMap((et, i) => [
      makeEvent(`d-${i}`, 'delivered', et),
      makeEvent(`f-${i}`, 'failed', et),
    ]);
    expect(calculateSuccessRate(events)).toBe(50);
  });

  // AC4: null is distinct from 0 — zero attempts ≠ zero success
  it('returns null (not 0) for zero attempts, distinguishing no-data from 0% success', () => {
    const zeroResult = calculateSuccessRate([]);
    const failResult = calculateSuccessRate([makeEvent('1', 'failed')]);
    expect(zeroResult).toBeNull();
    expect(failResult).toBe(0);
    expect(zeroResult).not.toBe(failResult);
  });
});

// ── formatSuccessRate — additional edge cases ─────────────────────────────────

describe('formatSuccessRate — supplemental', () => {
  // AC4: null → '—' (not '0%' or 'NaN%')
  it('returns "—" for null, not "0%" or "NaN%"', () => {
    const result = formatSuccessRate(null);
    expect(result).toBe('—');
    expect(result).not.toBe('0%');
    expect(result).not.toContain('NaN');
  });

  // AC5: 0 → '0%' (not '—')
  it('returns "0%" for 0, not "—"', () => {
    const result = formatSuccessRate(0);
    expect(result).toBe('0%');
    expect(result).not.toBe('—');
  });

  // AC1: 2/3 * 100 ≈ 66.666… → '66.7%'
  it('rounds 66.666… to "66.7%"', () => {
    expect(formatSuccessRate(66.6667)).toBe('66.7%');
  });

  // AC1: 75% → '75%' (no unnecessary decimal)
  it('returns "75%" for 75 (no trailing .0)', () => {
    expect(formatSuccessRate(75)).toBe('75%');
  });

  // AC1: result always ends with '%'
  it('always appends a "%" suffix for non-null values', () => {
    [0, 25, 50, 75, 100, 33.333].forEach((v) => {
      expect(formatSuccessRate(v)).toMatch(/%$/);
    });
  });
});

// ── mountMetricsDashboard — supplemental ─────────────────────────────────────

describe('mountMetricsDashboard — supplemental', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  // AC3: multiple sequential reactive updates
  it('handles multiple sequential update() calls correctly', () => {
    const handle = mountMetricsDashboard(container);

    // First update: 1/2 delivered → 50%
    handle.update([makeEvent('1', 'delivered'), makeEvent('2', 'failed')]);
    let valueEl = container.querySelector('[data-testid="success-rate-value"]');
    expect(valueEl!.textContent!.trim()).toBe('50%');

    // Second update: 0/2 delivered → 0%
    handle.update([makeEvent('3', 'failed'), makeEvent('4', 'failed')]);
    valueEl = container.querySelector('[data-testid="success-rate-value"]');
    expect(valueEl!.textContent!.trim()).toBe('0%');

    // Third update: 2/2 delivered → 100%
    handle.update([makeEvent('5', 'delivered'), makeEvent('6', 'delivered')]);
    valueEl = container.querySelector('[data-testid="success-rate-value"]');
    expect(valueEl!.textContent!.trim()).toBe('100%');

    // Fourth update: back to empty → '—'
    handle.update([]);
    valueEl = container.querySelector('[data-testid="success-rate-value"]');
    expect(valueEl!.textContent!.trim()).toBe('—');
  });

  // AC9: aria-label on the card identifies the metric for accessibility
  it('renders an aria-label identifying the success rate card', () => {
    mountMetricsDashboard(container);
    const card = container.querySelector('[aria-label="Aggregate success rate"]');
    expect(card).not.toBeNull();
  });

  // AC9: section has an aria-label for the overall dashboard
  it('renders the dashboard section with an aria-label', () => {
    mountMetricsDashboard(container);
    const section = container.querySelector('section[aria-label]');
    expect(section).not.toBeNull();
    expect(section!.getAttribute('aria-label')).toContain('metrics');
  });

  // AC5: exhausted events count as non-delivered in the dashboard display
  it('displays correct rate when some events are exhausted (not delivered)', () => {
    const handle = mountMetricsDashboard(container);
    handle.update([
      makeEvent('1', 'delivered'),
      makeEvent('2', 'exhausted'),
      makeEvent('3', 'exhausted'),
      makeEvent('4', 'exhausted'),
    ]);
    // 1/4 = 25%
    const valueEl = container.querySelector('[data-testid="success-rate-value"]');
    expect(valueEl!.textContent!.trim()).toBe('25%');
  });

  // AC8: simulator full retry-flow data (multiple statuses in one dataset)
  it('works with a full simulator retry-flow dataset', () => {
    const handle = mountMetricsDashboard(container);
    // Simulate a webhook that went through: pending → failed → failed → delivered
    const simulatorEvents: DeliveryEvent[] = [
      {
        id: 'wh-1',
        eventType: 'payment.created',
        status: 'delivered',
        timestamp: '2024-06-01T10:03:00Z',
        httpStatus: 200,
        responseBody: '{"ok":true}',
        attemptCount: 3,
      },
      {
        id: 'wh-2',
        eventType: 'refund.issued',
        status: 'exhausted',
        timestamp: '2024-06-01T10:10:00Z',
        httpStatus: 503,
        responseBody: 'Service Unavailable',
        attemptCount: 6,
      },
      {
        id: 'wh-3',
        eventType: 'payment.created',
        status: 'failed',
        timestamp: '2024-06-01T10:01:00Z',
        httpStatus: 500,
        responseBody: 'Internal Server Error',
        attemptCount: 1,
      },
    ];
    handle.update(simulatorEvents);
    // 1 delivered out of 3 → 33.3%
    const valueEl = container.querySelector('[data-testid="success-rate-value"]');
    expect(valueEl!.textContent!.trim()).toBe('33.3%');
  });

  // AC2: cross-type aggregation visible in the rendered value
  it('renders the cross-type aggregate (not per-type) in the dashboard', () => {
    const handle = mountMetricsDashboard(container);
    // 3 event types, 2 delivered total out of 6 → 33.3%
    handle.update([
      makeEvent('1', 'delivered', 'payment.created'),
      makeEvent('2', 'failed',    'payment.created'),
      makeEvent('3', 'delivered', 'refund.issued'),
      makeEvent('4', 'failed',    'refund.issued'),
      makeEvent('5', 'failed',    'dispute.opened'),
      makeEvent('6', 'failed',    'dispute.opened'),
    ]);
    const valueEl = container.querySelector('[data-testid="success-rate-value"]');
    // 2/6 = 33.3%
    expect(valueEl!.textContent!.trim()).toBe('33.3%');
  });

  // AC4: update() called with empty array after having data → reverts to '—'
  it('reverts to "—" when update() is called with an empty array', () => {
    const handle = mountMetricsDashboard(container);
    handle.update([makeEvent('1', 'delivered')]);
    handle.update([]);
    const valueEl = container.querySelector('[data-testid="success-rate-value"]');
    expect(valueEl!.textContent!.trim()).toBe('—');
  });
});

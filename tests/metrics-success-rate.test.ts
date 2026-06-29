/**
 * Unit tests for Issue #167: Aggregate success rate metric.
 *
 * Covers:
 *   AC1  – correct percentage calculation for a representative mixed fixture.
 *   AC2  – success rate is computed across all event types combined.
 *   AC4  – zero-deliveries edge case: returns null / renders '—' without error.
 *   AC5  – 100% failure edge case: displays 0%.
 *   AC6  – 100% success edge case: displays 100%.
 *   AC7  – single-attempt edge case (delivered and failed variants).
 *   AC3  – reactive update: calling update() re-renders with new data.
 *   AC8  – works with simulator-shaped data (same DeliveryEvent shape).
 *   AC9  – metric is visually labelled in the rendered dashboard.
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
): DeliveryEvent {
  return {
    id,
    eventType,
    status,
    timestamp: '2024-01-01T00:00:00Z',
    attemptCount: 1,
  };
}

// ── calculateSuccessRate ──────────────────────────────────────────────────────

describe('calculateSuccessRate', () => {
  // AC4: zero deliveries
  it('returns null when there are zero delivery attempts', () => {
    expect(calculateSuccessRate([])).toBeNull();
  });

  // AC5: 100% failure
  it('returns 0 when all attempts have failed', () => {
    const events: DeliveryEvent[] = [
      makeEvent('1', 'failed'),
      makeEvent('2', 'failed'),
      makeEvent('3', 'exhausted'),
    ];
    expect(calculateSuccessRate(events)).toBe(0);
  });

  // AC6: 100% success
  it('returns 100 when all attempts have succeeded', () => {
    const events: DeliveryEvent[] = [
      makeEvent('1', 'delivered'),
      makeEvent('2', 'delivered'),
      makeEvent('3', 'delivered'),
    ];
    expect(calculateSuccessRate(events)).toBe(100);
  });

  // AC7: single attempt — delivered
  it('returns 100 for a single delivered attempt', () => {
    expect(calculateSuccessRate([makeEvent('1', 'delivered')])).toBe(100);
  });

  // AC7: single attempt — failed
  it('returns 0 for a single failed attempt', () => {
    expect(calculateSuccessRate([makeEvent('1', 'failed')])).toBe(0);
  });

  // AC1: representative mixed fixture
  it('calculates the correct percentage for a mixed fixture', () => {
    // 3 delivered out of 6 total → 50%
    const events: DeliveryEvent[] = [
      makeEvent('1', 'delivered'),
      makeEvent('2', 'delivered'),
      makeEvent('3', 'delivered'),
      makeEvent('4', 'failed'),
      makeEvent('5', 'failed'),
      makeEvent('6', 'exhausted'),
    ];
    expect(calculateSuccessRate(events)).toBe(50);
  });

  // AC1: non-round percentage
  it('calculates a non-round percentage correctly (1 of 3 = 33.33…%)', () => {
    const events: DeliveryEvent[] = [
      makeEvent('1', 'delivered'),
      makeEvent('2', 'failed'),
      makeEvent('3', 'failed'),
    ];
    const rate = calculateSuccessRate(events);
    expect(rate).not.toBeNull();
    // 1/3 * 100 ≈ 33.333…
    expect(rate!).toBeCloseTo(33.333, 2);
  });

  // AC2: success rate is computed across all event types combined
  it('aggregates across multiple event types', () => {
    const events: DeliveryEvent[] = [
      makeEvent('1', 'delivered', 'payment.created'),
      makeEvent('2', 'delivered', 'refund.issued'),
      makeEvent('3', 'failed',    'payment.created'),
      makeEvent('4', 'failed',    'dispute.opened'),
    ];
    // 2 delivered out of 4 total → 50%
    expect(calculateSuccessRate(events)).toBe(50);
  });

  // AC8: works with simulator-shaped data (pending status counts as non-delivered)
  it('treats pending status as non-delivered', () => {
    const events: DeliveryEvent[] = [
      makeEvent('1', 'delivered'),
      makeEvent('2', 'pending'),
    ];
    // 1 delivered out of 2 → 50%
    expect(calculateSuccessRate(events)).toBe(50);
  });
});

// ── formatSuccessRate ─────────────────────────────────────────────────────────

describe('formatSuccessRate', () => {
  it('returns "—" for null (no data)', () => {
    expect(formatSuccessRate(null)).toBe('—');
  });

  it('returns "0%" for 0', () => {
    expect(formatSuccessRate(0)).toBe('0%');
  });

  it('returns "100%" for 100', () => {
    expect(formatSuccessRate(100)).toBe('100%');
  });

  it('returns "50%" for 50', () => {
    expect(formatSuccessRate(50)).toBe('50%');
  });

  it('rounds to one decimal place', () => {
    // 1/3 * 100 ≈ 33.333… → '33.3%'
    expect(formatSuccessRate(33.333)).toBe('33.3%');
  });
});

// ── mountMetricsDashboard ─────────────────────────────────────────────────────

describe('mountMetricsDashboard', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  // AC4: zero deliveries — renders without error
  it('renders without error when mounted with no data', () => {
    expect(() => mountMetricsDashboard(container)).not.toThrow();
  });

  // AC4: zero deliveries — shows empty/zero state
  it('shows "—" when there are zero delivery attempts', () => {
    mountMetricsDashboard(container);
    const valueEl = container.querySelector('[data-testid="success-rate-value"]');
    expect(valueEl).not.toBeNull();
    expect(valueEl!.textContent!.trim()).toBe('—');
  });

  // AC9: metric is visually labelled
  it('renders a visible label for the success rate metric', () => {
    mountMetricsDashboard(container);
    expect(container.textContent).toContain('Aggregate Success Rate');
  });

  // AC3: reactive update — calling update() re-renders with new data
  it('updates the displayed value reactively when update() is called', () => {
    const handle = mountMetricsDashboard(container);

    // Initially no data → '—'
    let valueEl = container.querySelector('[data-testid="success-rate-value"]');
    expect(valueEl!.textContent!.trim()).toBe('—');

    // Provide 2 delivered out of 2 → 100%
    handle.update([makeEvent('1', 'delivered'), makeEvent('2', 'delivered')]);
    valueEl = container.querySelector('[data-testid="success-rate-value"]');
    expect(valueEl!.textContent!.trim()).toBe('100%');
  });

  // AC5: 100% failure
  it('displays "0%" when all attempts have failed', () => {
    const handle = mountMetricsDashboard(container);
    handle.update([makeEvent('1', 'failed'), makeEvent('2', 'failed')]);
    const valueEl = container.querySelector('[data-testid="success-rate-value"]');
    expect(valueEl!.textContent!.trim()).toBe('0%');
  });

  // AC6: 100% success
  it('displays "100%" when all attempts have succeeded', () => {
    const handle = mountMetricsDashboard(container);
    handle.update([makeEvent('1', 'delivered'), makeEvent('2', 'delivered')]);
    const valueEl = container.querySelector('[data-testid="success-rate-value"]');
    expect(valueEl!.textContent!.trim()).toBe('100%');
  });

  // AC1: representative mixed fixture
  it('displays the correct percentage for a mixed fixture', () => {
    const handle = mountMetricsDashboard(container);
    const events: DeliveryEvent[] = [
      makeEvent('1', 'delivered'),
      makeEvent('2', 'delivered'),
      makeEvent('3', 'failed'),
      makeEvent('4', 'failed'),
    ];
    handle.update(events);
    const valueEl = container.querySelector('[data-testid="success-rate-value"]');
    expect(valueEl!.textContent!.trim()).toBe('50%');
  });

  // AC2: aggregates across event types
  it('aggregates success rate across all event types', () => {
    const handle = mountMetricsDashboard(container);
    const events: DeliveryEvent[] = [
      makeEvent('1', 'delivered', 'payment.created'),
      makeEvent('2', 'failed',    'refund.issued'),
    ];
    handle.update(events);
    const valueEl = container.querySelector('[data-testid="success-rate-value"]');
    expect(valueEl!.textContent!.trim()).toBe('50%');
  });

  // AC7: single attempt — delivered
  it('handles a single delivered attempt correctly', () => {
    const handle = mountMetricsDashboard(container);
    handle.update([makeEvent('1', 'delivered')]);
    const valueEl = container.querySelector('[data-testid="success-rate-value"]');
    expect(valueEl!.textContent!.trim()).toBe('100%');
  });

  // AC7: single attempt — failed
  it('handles a single failed attempt correctly', () => {
    const handle = mountMetricsDashboard(container);
    handle.update([makeEvent('1', 'failed')]);
    const valueEl = container.querySelector('[data-testid="success-rate-value"]');
    expect(valueEl!.textContent!.trim()).toBe('0%');
  });

  // AC8: simulator-shaped data (includes httpStatus, responseBody)
  it('works correctly with simulator-shaped data', () => {
    const handle = mountMetricsDashboard(container);
    const simulatorEvents: DeliveryEvent[] = [
      {
        id: 'sim-1',
        eventType: 'payment.created',
        status: 'delivered',
        timestamp: '2024-06-01T10:00:00Z',
        httpStatus: 200,
        responseBody: '{"ok":true}',
        attemptCount: 1,
      },
      {
        id: 'sim-2',
        eventType: 'payment.created',
        status: 'failed',
        timestamp: '2024-06-01T10:01:00Z',
        httpStatus: 500,
        responseBody: 'Internal Server Error',
        attemptCount: 2,
      },
    ];
    handle.update(simulatorEvents);
    const valueEl = container.querySelector('[data-testid="success-rate-value"]');
    expect(valueEl!.textContent!.trim()).toBe('50%');
  });
});

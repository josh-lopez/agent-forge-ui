// Component/integration tests for the metrics dashboard (Issue #145).
//
// Covers AC1/AC5 (rendered, aggregate + per-event-type in one view), AC6
// (reactive recalculation on store changes), AC7 (renders with simulator data),
// AC11 (graceful empty state), AC12 (no backend/network).

import { describe, expect, it, beforeEach } from 'vitest';

import { DeliveryEvent } from '../src/delivery-events';
import { DeliveryEventStore } from '../src/delivery-event-store';
import { mountMetricsDashboard } from '../src/metrics-dashboard';
import { generateSimulatedEvents } from '../src/webhook-simulator';

function ev(partial: Partial<DeliveryEvent> & Pick<DeliveryEvent, 'webhookId' | 'eventType'>): DeliveryEvent {
  return {
    status: 'delivered',
    attempt: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
    httpStatus: 200,
    responseBodyExcerpt: '',
    ...partial,
  };
}

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

describe('mountMetricsDashboard – render & layout (AC1, AC5)', () => {
  it('renders a dashboard section with a title', () => {
    const store = new DeliveryEventStore([ev({ webhookId: 'w', eventType: 'payment.created' })]);
    mountMetricsDashboard(container, store);
    const dash = container.querySelector('.metrics-dashboard');
    expect(dash).not.toBeNull();
    expect(container.querySelector('.metrics-dashboard__title')?.textContent).toContain('metrics');
  });

  it('shows aggregate cards and a per-event-type table in one view', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created' }),
      ev({ webhookId: 'b', eventType: 'refund.issued', status: 'failed', httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);

    // Aggregate summary cards.
    expect(container.querySelectorAll('.metrics-card').length).toBe(4);

    // One aggregate row plus one row per event type.
    expect(container.querySelector('.metrics-row--aggregate')).not.toBeNull();
    const typeCells = [...container.querySelectorAll('.metrics-cell--type')].map((c) => c.textContent);
    expect(typeCells).toContain('All event types');
    expect(typeCells).toContain('payment.created');
    expect(typeCells).toContain('refund.issued');
  });
});

describe('mountMetricsDashboard – reactivity (AC6)', () => {
  it('recalculates when new events are added — no manual refresh', () => {
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);

    // Initial empty state.
    expect(container.querySelector('.metrics-cell--empty')).not.toBeNull();

    store.add(ev({ webhookId: 'a', eventType: 'payment.created' }));

    // After the reactive update the empty row is gone and a type row appears.
    expect(container.querySelector('.metrics-cell--empty')).toBeNull();
    const typeCells = [...container.querySelectorAll('.metrics-cell--type')].map((c) => c.textContent);
    expect(typeCells).toContain('payment.created');
  });

  it('updates the success-rate card when a webhook transitions state', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed', httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);

    const valueBefore = container.querySelector('.metrics-card__value')?.textContent;
    expect(valueBefore).toBe('0.0%');

    store.add(ev({ webhookId: 'a', eventType: 'payment.created', status: 'delivered', attempt: 2 }));

    const valueAfter = container.querySelector('.metrics-card__value')?.textContent;
    // 1 delivered of 2 attempts = 50.0%
    expect(valueAfter).toBe('50.0%');
  });

  it('stops updating after the disposer is called', () => {
    const store = new DeliveryEventStore();
    const dispose = mountMetricsDashboard(container, store);
    dispose();
    store.add(ev({ webhookId: 'a', eventType: 'payment.created' }));
    // Disposer clears the container and unsubscribes.
    expect(container.querySelector('.metrics-dashboard')).toBeNull();
  });
});

describe('mountMetricsDashboard – empty state (AC11)', () => {
  it('renders a clear empty indicator and no NaN with zero deliveries', () => {
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);
    expect(container.textContent).toContain('No delivery events yet.');
    expect(container.textContent).not.toContain('NaN');
    // The aggregate cards show em-dash placeholders, not NaN.
    const values = [...container.querySelectorAll('.metrics-card__value')].map((v) => v.textContent);
    expect(values).toContain('—');
  });
});

describe('mountMetricsDashboard – simulator compatibility (AC7, AC12)', () => {
  it('renders correctly with simulator-produced data', () => {
    let seed = 1;
    const random = () => {
      // deterministic pseudo-random for a stable test
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const events = generateSimulatedEvents({ count: 8, successRate: 0.7, random, startTime: 0 });
    expect(events.length).toBeGreaterThan(0);

    const store = new DeliveryEventStore(events);
    mountMetricsDashboard(container, store);

    // Dashboard renders without throwing and shows a populated table.
    expect(container.querySelector('.metrics-dashboard')).not.toBeNull();
    expect(container.querySelector('.metrics-cell--empty')).toBeNull();
    expect(container.textContent).not.toContain('NaN');
  });
});

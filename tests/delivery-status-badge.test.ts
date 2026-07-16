/**
 * Unit tests for src/delivery-status-badge.ts — Issue #271
 *
 * Acceptance criteria covered:
 *   AC1  – Tests exist for all four states: pending, delivered, failed, exhausted.
 *   AC2  – Each test asserts the correct status label/indicator is rendered.
 *   AC3  – Tests verify the component updates when a delivery event transitions
 *           the status (e.g. pending → delivered, pending → failed, failed → exhausted).
 *   AC4  – All four state-to-state transitions relevant to the retry schedule
 *           are covered by at least one test case.
 *   AC5  – Tests are co-located with the delivery status UI component (*.test.ts in tests/).
 *   AC6  – All new tests pass in CI with no skipped assertions.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { DeliveryEvent } from '../src/delivery-events';
import { DeliveryEventStore } from '../src/delivery-event-store';
import {
  STATUS_LABELS,
  STATUS_CLASSES,
  deriveStatus,
  renderStatusBadge,
  mountDeliveryStatusBadge,
} from '../src/delivery-status-badge';

// ── Test helpers ──────────────────────────────────────────────────────────────

/** Build a minimal DeliveryEvent for a given webhook and status. */
function ev(
  webhookId: string,
  status: DeliveryEvent['status'],
  overrides: Partial<DeliveryEvent> = {},
): DeliveryEvent {
  return {
    webhookId,
    eventType: 'payment.created',
    status,
    attempt: 1,
    timestamp: new Date().toISOString(),
    httpStatus: status === 'delivered' ? 200 : 500,
    responseBodyExcerpt: '',
    ...overrides,
  };
}

// ── STATUS_LABELS ─────────────────────────────────────────────────────────────

describe('STATUS_LABELS – canonical human-readable labels (AC2)', () => {
  it('has a label for pending', () => {
    expect(STATUS_LABELS.pending).toBeTruthy();
    expect(typeof STATUS_LABELS.pending).toBe('string');
  });

  it('has a label for delivered', () => {
    expect(STATUS_LABELS.delivered).toBeTruthy();
    expect(typeof STATUS_LABELS.delivered).toBe('string');
  });

  it('has a label for failed', () => {
    expect(STATUS_LABELS.failed).toBeTruthy();
    expect(typeof STATUS_LABELS.failed).toBe('string');
  });

  it('has a label for exhausted', () => {
    expect(STATUS_LABELS.exhausted).toBeTruthy();
    expect(typeof STATUS_LABELS.exhausted).toBe('string');
  });

  it('all four labels are distinct', () => {
    const labels = Object.values(STATUS_LABELS);
    const unique = new Set(labels);
    expect(unique.size).toBe(4);
  });
});

// ── STATUS_CLASSES ────────────────────────────────────────────────────────────

describe('STATUS_CLASSES – CSS modifier classes (AC2)', () => {
  it('has a CSS class for each of the four statuses', () => {
    for (const status of ['pending', 'delivered', 'failed', 'exhausted'] as const) {
      expect(STATUS_CLASSES[status]).toBeTruthy();
      expect(STATUS_CLASSES[status]).toContain(status);
    }
  });

  it('all four CSS classes are distinct', () => {
    const classes = Object.values(STATUS_CLASSES);
    const unique = new Set(classes);
    expect(unique.size).toBe(4);
  });
});

// ── deriveStatus – pure logic ─────────────────────────────────────────────────

describe('deriveStatus – derives status from event history (AC1, AC3, AC4)', () => {
  it('returns pending when there are no events at all', () => {
    expect(deriveStatus('wh_1', [])).toBe('pending');
  });

  it('returns pending when there are no events for the given webhookId', () => {
    const events = [ev('wh_other', 'delivered')];
    expect(deriveStatus('wh_1', events)).toBe('pending');
  });

  // ── All four states rendered correctly (AC1, AC2) ──────────────────────────

  it('returns pending when the only event for the webhook is pending', () => {
    // Note: pending is the implicit initial state; some flows may emit it
    // explicitly as the first event.
    const events = [ev('wh_1', 'pending')];
    expect(deriveStatus('wh_1', events)).toBe('pending');
  });

  it('returns delivered when the latest event for the webhook is delivered', () => {
    const events = [ev('wh_1', 'delivered')];
    expect(deriveStatus('wh_1', events)).toBe('delivered');
  });

  it('returns failed when the latest event for the webhook is failed', () => {
    const events = [ev('wh_1', 'failed')];
    expect(deriveStatus('wh_1', events)).toBe('failed');
  });

  it('returns exhausted when the latest event for the webhook is exhausted', () => {
    const events = [ev('wh_1', 'exhausted')];
    expect(deriveStatus('wh_1', events)).toBe('exhausted');
  });

  // ── State transitions (AC3, AC4) ──────────────────────────────────────────

  it('transition: pending → delivered (first attempt succeeds)', () => {
    // Initial state: no events → pending.
    expect(deriveStatus('wh_1', [])).toBe('pending');

    // After a delivered event arrives.
    const events = [ev('wh_1', 'delivered', { attempt: 1 })];
    expect(deriveStatus('wh_1', events)).toBe('delivered');
  });

  it('transition: pending → failed (first attempt fails, retry pending)', () => {
    // Initial state: no events → pending.
    expect(deriveStatus('wh_1', [])).toBe('pending');

    // After a failed event arrives.
    const events = [ev('wh_1', 'failed', { attempt: 1 })];
    expect(deriveStatus('wh_1', events)).toBe('failed');
  });

  it('transition: failed → delivered (retry succeeds)', () => {
    const events = [
      ev('wh_1', 'failed',    { attempt: 1 }),
      ev('wh_1', 'delivered', { attempt: 2 }),
    ];
    expect(deriveStatus('wh_1', events)).toBe('delivered');
  });

  it('transition: failed → failed (multiple retries still failing)', () => {
    const events = [
      ev('wh_1', 'failed', { attempt: 1 }),
      ev('wh_1', 'failed', { attempt: 2 }),
    ];
    expect(deriveStatus('wh_1', events)).toBe('failed');
  });

  it('transition: failed → exhausted (all retries exhausted)', () => {
    const events = [
      ev('wh_1', 'failed',    { attempt: 1 }),
      ev('wh_1', 'failed',    { attempt: 2 }),
      ev('wh_1', 'failed',    { attempt: 3 }),
      ev('wh_1', 'failed',    { attempt: 4 }),
      ev('wh_1', 'failed',    { attempt: 5 }),
      ev('wh_1', 'exhausted', { attempt: 6 }),
    ];
    expect(deriveStatus('wh_1', events)).toBe('exhausted');
  });

  it('transition: pending → exhausted (maxAttempts=1, single attempt fails)', () => {
    // With maxAttempts=1 the scheduler emits exhausted directly (no failed).
    const events = [ev('wh_1', 'exhausted', { attempt: 1 })];
    expect(deriveStatus('wh_1', events)).toBe('exhausted');
  });

  it('uses the most-recent event when multiple events exist for the same webhook', () => {
    const events = [
      ev('wh_1', 'failed',    { attempt: 1 }),
      ev('wh_1', 'failed',    { attempt: 2 }),
      ev('wh_1', 'delivered', { attempt: 3 }),
    ];
    expect(deriveStatus('wh_1', events)).toBe('delivered');
  });

  it('ignores events for other webhooks', () => {
    const events = [
      ev('wh_other', 'delivered'),
      ev('wh_1',     'failed'),
    ];
    expect(deriveStatus('wh_1', events)).toBe('failed');
    expect(deriveStatus('wh_other', events)).toBe('delivered');
  });
});

// ── renderStatusBadge – DOM rendering ────────────────────────────────────────

describe('renderStatusBadge – renders correct DOM for each state (AC1, AC2)', () => {
  it('renders a span element', () => {
    const badge = renderStatusBadge('pending');
    expect(badge.tagName.toLowerCase()).toBe('span');
  });

  it('includes the base CSS class on every badge', () => {
    for (const status of ['pending', 'delivered', 'failed', 'exhausted'] as const) {
      const badge = renderStatusBadge(status);
      expect(badge.className).toContain('delivery-status-badge');
    }
  });

  it('pending badge has the correct label text', () => {
    const badge = renderStatusBadge('pending');
    expect(badge.textContent).toBe(STATUS_LABELS.pending);
  });

  it('delivered badge has the correct label text', () => {
    const badge = renderStatusBadge('delivered');
    expect(badge.textContent).toBe(STATUS_LABELS.delivered);
  });

  it('failed badge has the correct label text', () => {
    const badge = renderStatusBadge('failed');
    expect(badge.textContent).toBe(STATUS_LABELS.failed);
  });

  it('exhausted badge has the correct label text', () => {
    const badge = renderStatusBadge('exhausted');
    expect(badge.textContent).toBe(STATUS_LABELS.exhausted);
  });

  it('pending badge has the pending CSS modifier class', () => {
    const badge = renderStatusBadge('pending');
    expect(badge.className).toContain(STATUS_CLASSES.pending);
  });

  it('delivered badge has the delivered CSS modifier class', () => {
    const badge = renderStatusBadge('delivered');
    expect(badge.className).toContain(STATUS_CLASSES.delivered);
  });

  it('failed badge has the failed CSS modifier class', () => {
    const badge = renderStatusBadge('failed');
    expect(badge.className).toContain(STATUS_CLASSES.failed);
  });

  it('exhausted badge has the exhausted CSS modifier class', () => {
    const badge = renderStatusBadge('exhausted');
    expect(badge.className).toContain(STATUS_CLASSES.exhausted);
  });

  it('badge carries a data-status attribute matching the status', () => {
    for (const status of ['pending', 'delivered', 'failed', 'exhausted'] as const) {
      const badge = renderStatusBadge(status);
      expect(badge.getAttribute('data-status')).toBe(status);
    }
  });

  it('badge carries role="status" for accessibility', () => {
    for (const status of ['pending', 'delivered', 'failed', 'exhausted'] as const) {
      const badge = renderStatusBadge(status);
      expect(badge.getAttribute('role')).toBe('status');
    }
  });

  it('each status produces a badge with a distinct CSS class', () => {
    const classes = (['pending', 'delivered', 'failed', 'exhausted'] as const).map(
      (s) => renderStatusBadge(s).className,
    );
    const unique = new Set(classes);
    expect(unique.size).toBe(4);
  });
});

// ── mountDeliveryStatusBadge – reactive component ────────────────────────────

describe('mountDeliveryStatusBadge – reactive mount (AC1, AC2, AC3, AC4)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  // ── Initial render ─────────────────────────────────────────────────────────

  it('renders pending badge immediately when store has no events for the webhook', () => {
    const store = new DeliveryEventStore();
    mountDeliveryStatusBadge(container, 'wh_1', store);

    const badge = container.querySelector('[data-status]');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('data-status')).toBe('pending');
    expect(badge?.textContent).toBe(STATUS_LABELS.pending);
  });

  it('renders delivered badge immediately when store already has a delivered event', () => {
    const store = new DeliveryEventStore([ev('wh_1', 'delivered')]);
    mountDeliveryStatusBadge(container, 'wh_1', store);

    const badge = container.querySelector('[data-status]');
    expect(badge?.getAttribute('data-status')).toBe('delivered');
    expect(badge?.textContent).toBe(STATUS_LABELS.delivered);
  });

  it('renders failed badge immediately when store already has a failed event', () => {
    const store = new DeliveryEventStore([ev('wh_1', 'failed')]);
    mountDeliveryStatusBadge(container, 'wh_1', store);

    const badge = container.querySelector('[data-status]');
    expect(badge?.getAttribute('data-status')).toBe('failed');
    expect(badge?.textContent).toBe(STATUS_LABELS.failed);
  });

  it('renders exhausted badge immediately when store already has an exhausted event', () => {
    const store = new DeliveryEventStore([ev('wh_1', 'exhausted')]);
    mountDeliveryStatusBadge(container, 'wh_1', store);

    const badge = container.querySelector('[data-status]');
    expect(badge?.getAttribute('data-status')).toBe('exhausted');
    expect(badge?.textContent).toBe(STATUS_LABELS.exhausted);
  });

  // ── Reactive transitions (AC3, AC4) ───────────────────────────────────────

  it('transition: pending → delivered — badge updates when delivered event arrives', () => {
    const store = new DeliveryEventStore();
    mountDeliveryStatusBadge(container, 'wh_1', store);

    // Initially pending.
    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('pending');

    // Deliver the webhook.
    store.add(ev('wh_1', 'delivered', { attempt: 1 }));

    // Badge should now show delivered.
    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('delivered');
    expect(container.querySelector('[data-status]')?.textContent).toBe(STATUS_LABELS.delivered);
  });

  it('transition: pending → failed — badge updates when failed event arrives', () => {
    const store = new DeliveryEventStore();
    mountDeliveryStatusBadge(container, 'wh_1', store);

    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('pending');

    store.add(ev('wh_1', 'failed', { attempt: 1 }));

    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('failed');
    expect(container.querySelector('[data-status]')?.textContent).toBe(STATUS_LABELS.failed);
  });

  it('transition: failed → delivered — badge updates when retry succeeds', () => {
    const store = new DeliveryEventStore([ev('wh_1', 'failed', { attempt: 1 })]);
    mountDeliveryStatusBadge(container, 'wh_1', store);

    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('failed');

    store.add(ev('wh_1', 'delivered', { attempt: 2 }));

    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('delivered');
    expect(container.querySelector('[data-status]')?.textContent).toBe(STATUS_LABELS.delivered);
  });

  it('transition: failed → exhausted — badge updates when all retries are exhausted', () => {
    const store = new DeliveryEventStore([
      ev('wh_1', 'failed', { attempt: 1 }),
      ev('wh_1', 'failed', { attempt: 2 }),
      ev('wh_1', 'failed', { attempt: 3 }),
      ev('wh_1', 'failed', { attempt: 4 }),
      ev('wh_1', 'failed', { attempt: 5 }),
    ]);
    mountDeliveryStatusBadge(container, 'wh_1', store);

    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('failed');

    store.add(ev('wh_1', 'exhausted', { attempt: 6 }));

    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('exhausted');
    expect(container.querySelector('[data-status]')?.textContent).toBe(STATUS_LABELS.exhausted);
  });

  it('transition: failed → failed — badge stays failed when another retry also fails', () => {
    const store = new DeliveryEventStore([ev('wh_1', 'failed', { attempt: 1 })]);
    mountDeliveryStatusBadge(container, 'wh_1', store);

    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('failed');

    store.add(ev('wh_1', 'failed', { attempt: 2 }));

    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('failed');
  });

  it('transition: pending → exhausted — badge updates when maxAttempts=1 and attempt fails', () => {
    const store = new DeliveryEventStore();
    mountDeliveryStatusBadge(container, 'wh_1', store);

    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('pending');

    // With maxAttempts=1 the scheduler emits exhausted directly.
    store.add(ev('wh_1', 'exhausted', { attempt: 1 }));

    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('exhausted');
    expect(container.querySelector('[data-status]')?.textContent).toBe(STATUS_LABELS.exhausted);
  });

  // ── Multiple webhooks tracked independently ────────────────────────────────

  it('tracks each webhook independently — events for other webhooks do not affect the badge', () => {
    const store = new DeliveryEventStore();
    mountDeliveryStatusBadge(container, 'wh_1', store);

    // Add an event for a different webhook.
    store.add(ev('wh_other', 'delivered'));

    // wh_1 should still be pending.
    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('pending');
  });

  it('two badges for different webhooks update independently', () => {
    const container2 = document.createElement('div');
    document.body.appendChild(container2);

    const store = new DeliveryEventStore();
    mountDeliveryStatusBadge(container,  'wh_1', store);
    mountDeliveryStatusBadge(container2, 'wh_2', store);

    // Both start pending.
    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('pending');
    expect(container2.querySelector('[data-status]')?.getAttribute('data-status')).toBe('pending');

    // Deliver wh_1 only.
    store.add(ev('wh_1', 'delivered'));

    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('delivered');
    expect(container2.querySelector('[data-status]')?.getAttribute('data-status')).toBe('pending');

    // Fail wh_2.
    store.add(ev('wh_2', 'failed'));

    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('delivered');
    expect(container2.querySelector('[data-status]')?.getAttribute('data-status')).toBe('failed');
  });

  // ── Disposer ───────────────────────────────────────────────────────────────

  it('disposer clears the container and stops further updates', () => {
    const store = new DeliveryEventStore();
    const dispose = mountDeliveryStatusBadge(container, 'wh_1', store);

    // Badge is rendered initially.
    expect(container.querySelector('[data-status]')).not.toBeNull();

    dispose();

    // Container is cleared.
    expect(container.querySelector('[data-status]')).toBeNull();
    expect(container.children.length).toBe(0);

    // Adding an event after disposal does not re-render.
    store.add(ev('wh_1', 'delivered'));
    expect(container.querySelector('[data-status]')).toBeNull();
  });

  // ── Full retry-schedule flow (AC4) ────────────────────────────────────────

  it('full retry-schedule flow: pending → failed × 5 → exhausted', () => {
    const store = new DeliveryEventStore();
    mountDeliveryStatusBadge(container, 'wh_retry', store);

    // Initial state.
    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('pending');

    // Simulate the full retry schedule (6 attempts, all failing).
    const statuses: string[] = [];
    for (let attempt = 1; attempt <= 5; attempt++) {
      store.add(ev('wh_retry', 'failed', { attempt }));
      statuses.push(container.querySelector('[data-status]')?.getAttribute('data-status') ?? '');
    }
    store.add(ev('wh_retry', 'exhausted', { attempt: 6 }));
    statuses.push(container.querySelector('[data-status]')?.getAttribute('data-status') ?? '');

    // Attempts 1–5 should all show 'failed'; attempt 6 shows 'exhausted'.
    expect(statuses.slice(0, 5).every((s) => s === 'failed')).toBe(true);
    expect(statuses[5]).toBe('exhausted');
  });

  it('full retry-schedule flow: pending → failed × 2 → delivered on 3rd attempt', () => {
    const store = new DeliveryEventStore();
    mountDeliveryStatusBadge(container, 'wh_retry2', store);

    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('pending');

    store.add(ev('wh_retry2', 'failed',    { attempt: 1 }));
    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('failed');

    store.add(ev('wh_retry2', 'failed',    { attempt: 2 }));
    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('failed');

    store.add(ev('wh_retry2', 'delivered', { attempt: 3 }));
    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('delivered');
    expect(container.querySelector('[data-status]')?.textContent).toBe(STATUS_LABELS.delivered);
  });

  // ── addMany batch update ───────────────────────────────────────────────────

  it('updates correctly when multiple events are added in a batch via addMany', () => {
    const store = new DeliveryEventStore();
    mountDeliveryStatusBadge(container, 'wh_batch', store);

    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('pending');

    // Batch-add a full failed-then-delivered sequence.
    store.addMany([
      ev('wh_batch', 'failed',    { attempt: 1 }),
      ev('wh_batch', 'delivered', { attempt: 2 }),
    ]);

    // After the batch the badge should reflect the most-recent event.
    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('delivered');
  });

  // ── store.reset ────────────────────────────────────────────────────────────

  it('resets to pending when the store is reset to an empty event set', () => {
    const store = new DeliveryEventStore([ev('wh_1', 'delivered')]);
    mountDeliveryStatusBadge(container, 'wh_1', store);

    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('delivered');

    store.reset([]);

    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('pending');
  });

  it('updates to the new status when the store is reset with new events', () => {
    const store = new DeliveryEventStore([ev('wh_1', 'failed')]);
    mountDeliveryStatusBadge(container, 'wh_1', store);

    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('failed');

    store.reset([ev('wh_1', 'exhausted', { attempt: 3 })]);

    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('exhausted');
  });
});

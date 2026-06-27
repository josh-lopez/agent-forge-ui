/**
 * Unit tests for ExhaustedAlert (Issue #150)
 *
 * Acceptance criteria covered:
 *   AC1  – alert renders when a webhook reaches `exhausted`
 *   AC2  – alert is visually distinct (warning class / icon present)
 *   AC3  – multiple simultaneous exhausted webhooks each produce an alert
 *   AC4  – alert includes webhook ID and event type
 *   AC5  – alert persists (is not auto-removed); dismiss button present
 *   AC6  – alert fires reactively when store transitions to `exhausted`
 *   AC8  – no alert for `pending`, `delivered`, or `failed` states
 *   AC9  – alert does not replace the event log (coexistence)
 *
 * Deduplication (BA risk): same webhook ID does not produce duplicate alerts
 * Re-trigger (BA risk): dismissing and re-exhausting produces a fresh alert
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DeliveryEventStore } from '../src/DeliveryEventStore.ts';
import { ExhaustedAlert } from '../src/ExhaustedAlert.ts';
import type { DeliveryEvent } from '../src/DeliveryEventStore.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(
  webhookId: string,
  status: DeliveryEvent['status'],
  eventType = 'payment.created',
): DeliveryEvent {
  return {
    webhookId,
    eventType,
    status,
    attempts: [
      { timestamp: new Date().toISOString(), httpStatus: 500, responseBody: 'error' },
    ],
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('ExhaustedAlert', () => {
  let container: HTMLElement;
  let store: DeliveryEventStore;
  let alert: ExhaustedAlert;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'exhausted-alerts';
    document.body.appendChild(container);
    store = new DeliveryEventStore();
    alert = new ExhaustedAlert(container, store);
  });

  afterEach(() => {
    alert.destroy();
    document.body.removeChild(container);
  });

  // ── AC8: no alert for non-exhausted states ──────────────────────────────

  it('does not render an alert for a pending webhook', () => {
    store.upsert(makeEvent('wh-1', 'pending'));
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(0);
  });

  it('does not render an alert for a delivered webhook', () => {
    store.upsert(makeEvent('wh-2', 'delivered'));
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(0);
  });

  it('does not render an alert for a failed (non-exhausted) webhook', () => {
    store.upsert(makeEvent('wh-3', 'failed'));
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(0);
  });

  // ── AC1 & AC6: alert renders reactively when status is exhausted ────────

  it('renders an alert when a webhook transitions to exhausted', () => {
    store.upsert(makeEvent('wh-10', 'exhausted'));
    const alerts = container.querySelectorAll('.exhausted-alert');
    expect(alerts.length).toBe(1);
  });

  it('renders the alert with role="alert" for accessibility (ARIA)', () => {
    store.upsert(makeEvent('wh-11', 'exhausted'));
    const banner = container.querySelector('.exhausted-alert');
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute('role')).toBe('alert');
  });

  // ── AC4: alert includes webhook ID and event type ───────────────────────

  it('includes the webhook ID in the alert message', () => {
    store.upsert(makeEvent('wh-abc', 'exhausted', 'refund.issued'));
    const message = container.querySelector('.exhausted-alert__message');
    expect(message).not.toBeNull();
    expect(message!.textContent).toContain('wh-abc');
  });

  it('includes the event type in the alert message', () => {
    store.upsert(makeEvent('wh-abc', 'exhausted', 'refund.issued'));
    const message = container.querySelector('.exhausted-alert__message');
    expect(message!.textContent).toContain('refund.issued');
  });

  // ── AC2: visually distinct (icon present) ──────────────────────────────

  it('renders a warning icon inside the alert', () => {
    store.upsert(makeEvent('wh-20', 'exhausted'));
    const icon = container.querySelector('.exhausted-alert__icon');
    expect(icon).not.toBeNull();
    expect(icon!.textContent).toBeTruthy();
  });

  // ── AC5: alert persists; dismiss button present ─────────────────────────

  it('renders a dismiss button inside the alert', () => {
    store.upsert(makeEvent('wh-30', 'exhausted'));
    const btn = container.querySelector('.exhausted-alert__dismiss');
    expect(btn).not.toBeNull();
  });

  it('alert is not auto-removed (persists after upsert)', () => {
    store.upsert(makeEvent('wh-31', 'exhausted'));
    // Simulate time passing by triggering another unrelated upsert
    store.upsert(makeEvent('wh-32', 'delivered'));
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(1);
  });

  it('removes the alert when the dismiss button is clicked', () => {
    store.upsert(makeEvent('wh-33', 'exhausted'));
    const btn = container.querySelector<HTMLButtonElement>('.exhausted-alert__dismiss');
    expect(btn).not.toBeNull();
    btn!.click();
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(0);
  });

  // ── AC3: multiple simultaneous exhausted webhooks ──────────────────────

  it('renders separate alerts for multiple exhausted webhooks', () => {
    store.upsert(makeEvent('wh-40', 'exhausted', 'payment.created'));
    store.upsert(makeEvent('wh-41', 'exhausted', 'refund.issued'));
    store.upsert(makeEvent('wh-42', 'exhausted', 'payment.updated'));
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(3);
  });

  // ── Deduplication: same webhook ID does not spam ────────────────────────

  it('does not render a duplicate alert when the same exhausted webhook is upserted again', () => {
    const event = makeEvent('wh-50', 'exhausted');
    store.upsert(event);
    // Upsert the same event again (e.g. a redundant state update)
    store.upsert({ ...event });
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(1);
  });

  // ── Re-trigger: dismiss + re-exhaust produces a fresh alert ─────────────

  it('shows a new alert if the same webhook is dismissed then exhausted again', () => {
    store.upsert(makeEvent('wh-60', 'exhausted'));
    // Merchant dismisses the alert
    const btn = container.querySelector<HTMLButtonElement>('.exhausted-alert__dismiss');
    btn!.click();
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(0);

    // Webhook is re-triggered (#141) and exhausts again
    store.upsert(makeEvent('wh-60', 'exhausted'));
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(1);
  });

  // ── AC6: reactive — fires on store update without page refresh ──────────

  it('fires reactively when the store transitions a webhook to exhausted', () => {
    // Start as pending
    store.upsert(makeEvent('wh-70', 'pending'));
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(0);

    // Transition to failed (no alert yet)
    store.upsert(makeEvent('wh-70', 'failed'));
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(0);

    // Transition to exhausted — alert must appear immediately
    store.upsert(makeEvent('wh-70', 'exhausted'));
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(1);
  });

  // ── AC9: coexistence — alert container is separate from event log ────────

  it('does not affect sibling elements (event log coexistence)', () => {
    // Simulate an event log sitting alongside the alert container
    const eventLog = document.createElement('ul');
    eventLog.id = 'event-log';
    const logItem = document.createElement('li');
    logItem.textContent = 'payment.created – delivered';
    eventLog.appendChild(logItem);
    document.body.appendChild(eventLog);

    store.upsert(makeEvent('wh-80', 'exhausted'));

    // Alert container has the alert
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(1);
    // Event log is untouched
    expect(eventLog.querySelectorAll('li').length).toBe(1);
    expect(eventLog.querySelector('li')!.textContent).toBe('payment.created – delivered');

    document.body.removeChild(eventLog);
  });

  // ── Edge cases ──────────────────────────────────────────────────────────

  it('handles zero deliveries (empty store) without error', () => {
    // No upserts — container should be empty
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(0);
  });

  it('handles 100% failure (all failed, none exhausted) without showing alerts', () => {
    store.upsert(makeEvent('wh-90', 'failed'));
    store.upsert(makeEvent('wh-91', 'failed'));
    store.upsert(makeEvent('wh-92', 'failed'));
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(0);
  });

  it('handles a single exhausted attempt correctly', () => {
    store.upsert({
      webhookId: 'wh-single',
      eventType: 'payment.created',
      status: 'exhausted',
      attempts: [{ timestamp: new Date().toISOString(), httpStatus: 0, responseBody: '' }],
    });
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(1);
  });

  // ── data-webhook-id attribute for identification ─────────────────────────

  it('sets data-webhook-id on the alert banner for identification', () => {
    store.upsert(makeEvent('wh-id-check', 'exhausted'));
    const banner = container.querySelector('.exhausted-alert');
    expect(banner!.getAttribute('data-webhook-id')).toBe('wh-id-check');
  });
});

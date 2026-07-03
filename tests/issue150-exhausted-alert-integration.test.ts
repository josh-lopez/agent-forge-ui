/**
 * Integration & supplementary unit tests for Issue #150 — Exhausted-webhook alerting
 *
 * These tests complement the Dev-shipped exhausted-alert.test.ts by covering:
 *   - DeliveryEventStore unit behaviour (subscribe, upsert, clear, unsubscribe)
 *   - AC2: CSS class presence on the banner (visual distinction)
 *   - AC3: large batch of simultaneous exhausted webhooks
 *   - AC5: dismiss button aria-label contains the webhook ID
 *   - AC6: destroy() stops reactive updates (no stale listeners)
 *   - AC7: simulator-compatible event shape (zero-attempt edge case)
 *   - AC9: multiple independent ExhaustedAlert instances on separate containers
 *   - Store.clear() resets state so a fresh subscription sees no events
 *   - Mixed-status batch: only exhausted webhooks produce alerts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DeliveryEventStore } from '../src/DeliveryEventStore.ts';
import { ExhaustedAlert } from '../src/ExhaustedAlert.ts';
import type { DeliveryEvent } from '../src/DeliveryEventStore.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

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
      { timestamp: new Date().toISOString(), httpStatus: 500, responseBody: 'Internal Server Error' },
    ],
  };
}

// ── DeliveryEventStore unit tests ─────────────────────────────────────────────

describe('DeliveryEventStore', () => {
  let store: DeliveryEventStore;

  beforeEach(() => {
    store = new DeliveryEventStore();
  });

  it('starts empty', () => {
    expect(store.getEvents().length).toBe(0);
  });

  it('appends a new event on upsert', () => {
    store.upsert(makeEvent('wh-s1', 'pending'));
    expect(store.getEvents().length).toBe(1);
    expect(store.getEvents()[0].webhookId).toBe('wh-s1');
  });

  it('replaces an existing event with the same webhookId (in-place update)', () => {
    store.upsert(makeEvent('wh-s2', 'pending'));
    store.upsert(makeEvent('wh-s2', 'exhausted'));
    expect(store.getEvents().length).toBe(1);
    expect(store.getEvents()[0].status).toBe('exhausted');
  });

  it('preserves insertion order when multiple webhooks are upserted', () => {
    store.upsert(makeEvent('wh-a', 'pending'));
    store.upsert(makeEvent('wh-b', 'failed'));
    store.upsert(makeEvent('wh-c', 'delivered'));
    const ids = store.getEvents().map((e) => e.webhookId);
    expect(ids).toEqual(['wh-a', 'wh-b', 'wh-c']);
  });

  it('calls the subscriber immediately with the current snapshot on subscribe', () => {
    store.upsert(makeEvent('wh-s3', 'pending'));
    let callCount = 0;
    let receivedLength = -1;
    store.subscribe((events) => {
      callCount++;
      receivedLength = events.length;
    });
    expect(callCount).toBe(1);
    expect(receivedLength).toBe(1);
  });

  it('notifies subscriber on each subsequent upsert', () => {
    let callCount = 0;
    store.subscribe(() => { callCount++; });
    // subscribe fires once immediately (callCount = 1)
    store.upsert(makeEvent('wh-s4', 'pending'));   // callCount = 2
    store.upsert(makeEvent('wh-s5', 'exhausted')); // callCount = 3
    expect(callCount).toBe(3);
  });

  it('unsubscribe stops further notifications', () => {
    let callCount = 0;
    const unsub = store.subscribe(() => { callCount++; });
    // immediate call: callCount = 1
    unsub();
    store.upsert(makeEvent('wh-s6', 'exhausted')); // should NOT fire
    expect(callCount).toBe(1);
  });

  it('clear() empties the store and notifies subscribers', () => {
    store.upsert(makeEvent('wh-s7', 'exhausted'));
    let lastLength = -1;
    store.subscribe((events) => { lastLength = events.length; });
    // immediate call: lastLength = 1
    store.clear();
    expect(lastLength).toBe(0);
    expect(store.getEvents().length).toBe(0);
  });

  it('supports multiple independent subscribers', () => {
    const counts = [0, 0];
    store.subscribe(() => { counts[0]++; });
    store.subscribe(() => { counts[1]++; });
    // Both fired immediately: [1, 1]
    store.upsert(makeEvent('wh-s8', 'pending'));
    expect(counts).toEqual([2, 2]);
  });
});

// ── ExhaustedAlert supplementary integration tests ────────────────────────────

describe('ExhaustedAlert — supplementary integration (Issue #150)', () => {
  let container: HTMLElement;
  let store: DeliveryEventStore;
  let alertComponent: ExhaustedAlert;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'exhausted-alerts';
    document.body.appendChild(container);
    store = new DeliveryEventStore();
    alertComponent = new ExhaustedAlert(container, store);
  });

  afterEach(() => {
    alertComponent.destroy();
    document.body.removeChild(container);
  });

  // ── AC2: CSS class on banner signals visual distinction ─────────────────

  it('applies the exhausted-alert CSS class to the banner (AC2 — visual distinction)', () => {
    store.upsert(makeEvent('wh-css', 'exhausted'));
    const banner = container.querySelector('[data-webhook-id="wh-css"]');
    expect(banner).not.toBeNull();
    expect(banner!.classList.contains('exhausted-alert')).toBe(true);
  });

  it('banner has aria-live="assertive" for immediate screen-reader announcement (AC2)', () => {
    store.upsert(makeEvent('wh-aria', 'exhausted'));
    const banner = container.querySelector('.exhausted-alert');
    expect(banner!.getAttribute('aria-live')).toBe('assertive');
  });

  // ── AC4: dismiss button aria-label contains the webhook ID ─────────────

  it('dismiss button aria-label references the webhook ID (AC4 — identifying info)', () => {
    store.upsert(makeEvent('wh-dismiss-label', 'exhausted'));
    const btn = container.querySelector<HTMLButtonElement>('.exhausted-alert__dismiss');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('aria-label')).toContain('wh-dismiss-label');
  });

  // ── AC3: large batch of simultaneous exhausted webhooks ────────────────

  it('renders 10 separate alerts for 10 simultaneously exhausted webhooks (AC3)', () => {
    for (let i = 0; i < 10; i++) {
      store.upsert(makeEvent(`wh-batch-${i}`, 'exhausted', 'payment.created'));
    }
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(10);
  });

  // ── AC6: destroy() stops reactive updates ──────────────────────────────

  it('destroy() prevents further alerts after component is torn down (AC6)', () => {
    alertComponent.destroy();
    store.upsert(makeEvent('wh-destroyed', 'exhausted'));
    // After destroy the component is unsubscribed; no new alert should appear
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(0);
  });

  // ── AC7: simulator-compatible — zero-attempt event shape ───────────────

  it('handles a simulator event with zero attempts without error (AC7)', () => {
    const simEvent: DeliveryEvent = {
      webhookId: 'sim-wh-1',
      eventType: 'payment.created',
      status: 'exhausted',
      attempts: [], // simulator may emit exhausted before any attempt is logged
    };
    store.upsert(simEvent);
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(1);
    const msg = container.querySelector('.exhausted-alert__message');
    expect(msg!.textContent).toContain('sim-wh-1');
    expect(msg!.textContent).toContain('payment.created');
  });

  // ── AC9: two independent ExhaustedAlert instances on separate containers ─

  it('two independent ExhaustedAlert instances on separate containers do not interfere (AC9)', () => {
    const container2 = document.createElement('div');
    container2.id = 'exhausted-alerts-2';
    document.body.appendChild(container2);

    const store2 = new DeliveryEventStore();
    const alert2 = new ExhaustedAlert(container2, store2);

    // Exhaust a webhook in store1 only
    store.upsert(makeEvent('wh-inst-1', 'exhausted'));

    // container1 has 1 alert; container2 has 0
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(1);
    expect(container2.querySelectorAll('.exhausted-alert').length).toBe(0);

    // Exhaust a different webhook in store2 only
    store2.upsert(makeEvent('wh-inst-2', 'exhausted'));

    // container1 still has 1; container2 now has 1
    expect(container.querySelectorAll('.exhausted-alert').length).toBe(1);
    expect(container2.querySelectorAll('.exhausted-alert').length).toBe(1);

    alert2.destroy();
    document.body.removeChild(container2);
  });

  // ── Mixed-status batch: only exhausted webhooks produce alerts ──────────

  it('only exhausted webhooks in a mixed-status batch produce alerts', () => {
    store.upsert(makeEvent('wh-mix-1', 'pending'));
    store.upsert(makeEvent('wh-mix-2', 'failed'));
    store.upsert(makeEvent('wh-mix-3', 'exhausted', 'refund.issued'));
    store.upsert(makeEvent('wh-mix-4', 'delivered'));
    store.upsert(makeEvent('wh-mix-5', 'exhausted', 'payment.created'));

    const alerts = container.querySelectorAll('.exhausted-alert');
    expect(alerts.length).toBe(2);

    // Verify the two alerts are for the correct webhooks
    const ids = Array.from(alerts).map((el) => el.getAttribute('data-webhook-id'));
    expect(ids).toContain('wh-mix-3');
    expect(ids).toContain('wh-mix-5');
  });

  // ── AC5: multiple dismissals leave container clean ──────────────────────

  it('dismissing all alerts leaves the container empty (AC5)', () => {
    store.upsert(makeEvent('wh-d1', 'exhausted'));
    store.upsert(makeEvent('wh-d2', 'exhausted'));
    store.upsert(makeEvent('wh-d3', 'exhausted'));

    const buttons = container.querySelectorAll<HTMLButtonElement>('.exhausted-alert__dismiss');
    expect(buttons.length).toBe(3);
    buttons.forEach((btn) => btn.click());

    expect(container.querySelectorAll('.exhausted-alert').length).toBe(0);
  });

  // ── Store.clear() after exhausted events: fresh subscription sees nothing ─

  it('store.clear() after exhausted events means a new component sees no alerts', () => {
    store.upsert(makeEvent('wh-clr', 'exhausted'));
    store.clear();

    // Create a brand-new container + component on the now-empty store
    const freshContainer = document.createElement('div');
    document.body.appendChild(freshContainer);
    const freshAlert = new ExhaustedAlert(freshContainer, store);

    expect(freshContainer.querySelectorAll('.exhausted-alert').length).toBe(0);

    freshAlert.destroy();
    document.body.removeChild(freshContainer);
  });
});

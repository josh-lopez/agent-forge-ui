// Unit tests for the exhausted-webhook alert component (Issue #255).
//
// AC coverage map:
//   AC1 – alert is rendered (visible in DOM) when a webhook transitions to `exhausted`
//   AC2 – alert is NOT rendered when no webhook has `exhausted` status
//   AC3 – alert is dismissed/hidden after the user interacts with the dismiss control
//   AC4 – multiple simultaneous `exhausted` webhooks each surface an alert
//         (or a consolidated alert indicating multiple exhausted webhooks)
//   AC5 – alert disappears (or updates) if an `exhausted` webhook is manually
//         re-triggered and transitions out of the `exhausted` state
//   AC6 – all tests pass with no skips or pending markers
//   AC7 – test coverage for alerting behaviour is reported in coverage output

import { describe, expect, it, beforeEach } from 'vitest';

import { DeliveryEvent } from '../src/delivery-events';
import { DeliveryEventStore } from '../src/delivery-event-store';
import {
  getExhaustedWebhookIds,
  renderExhaustedAlert,
  mountExhaustedAlert,
} from '../src/exhausted-alert';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ev(
  partial: Partial<DeliveryEvent> & Pick<DeliveryEvent, 'webhookId' | 'eventType'>,
): DeliveryEvent {
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

// ---------------------------------------------------------------------------
// getExhaustedWebhookIds – pure helper
// ---------------------------------------------------------------------------

describe('getExhaustedWebhookIds – pure helper', () => {
  it('returns an empty array when there are no events', () => {
    expect(getExhaustedWebhookIds([])).toEqual([]);
  });

  it('returns an empty array when all webhooks are delivered', () => {
    const events = [
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'delivered' }),
      ev({ webhookId: 'wh_2', eventType: 'refund.issued',   status: 'delivered' }),
    ];
    expect(getExhaustedWebhookIds(events)).toEqual([]);
  });

  it('returns an empty array when all webhooks are failed (not yet exhausted)', () => {
    const events = [
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'failed' }),
    ];
    expect(getExhaustedWebhookIds(events)).toEqual([]);
  });

  it('returns the webhookId when the latest attempt is exhausted', () => {
    const events = [
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'failed',    attempt: 1 }),
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'exhausted', attempt: 2 }),
    ];
    expect(getExhaustedWebhookIds(events)).toEqual(['wh_1']);
  });

  it('returns multiple IDs when multiple webhooks are exhausted', () => {
    const events = [
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'exhausted', attempt: 2 }),
      ev({ webhookId: 'wh_2', eventType: 'refund.issued',   status: 'exhausted', attempt: 3 }),
    ];
    expect(getExhaustedWebhookIds(events)).toEqual(['wh_1', 'wh_2']);
  });

  it('does NOT include a webhook whose latest attempt is delivered (re-triggered)', () => {
    // wh_1 was exhausted on attempt 2, then re-triggered and delivered on attempt 3.
    const events = [
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'failed',    attempt: 1 }),
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'exhausted', attempt: 2 }),
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'delivered', attempt: 3 }),
    ];
    expect(getExhaustedWebhookIds(events)).toEqual([]);
  });

  it('does NOT include a webhook whose latest attempt is failed (re-triggered, still failing)', () => {
    const events = [
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'exhausted', attempt: 2 }),
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'failed',    attempt: 3 }),
    ];
    expect(getExhaustedWebhookIds(events)).toEqual([]);
  });

  it('returns IDs sorted alphabetically', () => {
    const events = [
      ev({ webhookId: 'wh_z', eventType: 'payment.created', status: 'exhausted', attempt: 1 }),
      ev({ webhookId: 'wh_a', eventType: 'refund.issued',   status: 'exhausted', attempt: 1 }),
      ev({ webhookId: 'wh_m', eventType: 'payout.paid',     status: 'exhausted', attempt: 1 }),
    ];
    expect(getExhaustedWebhookIds(events)).toEqual(['wh_a', 'wh_m', 'wh_z']);
  });
});

// ---------------------------------------------------------------------------
// renderExhaustedAlert – pure DOM render
// ---------------------------------------------------------------------------

describe('renderExhaustedAlert – pure DOM render', () => {
  it('returns null when the exhausted list is empty (AC2)', () => {
    expect(renderExhaustedAlert([], () => {})).toBeNull();
  });

  it('returns an element with role="alert" for a single exhausted webhook (AC1)', () => {
    const el = renderExhaustedAlert(['wh_1'], () => {});
    expect(el).not.toBeNull();
    expect(el!.getAttribute('role')).toBe('alert');
  });

  it('rendered alert contains the exhausted webhook ID in its text (AC1)', () => {
    const el = renderExhaustedAlert(['wh_42'], () => {});
    expect(el!.textContent).toContain('wh_42');
  });

  it('rendered alert has class "exhausted-alert" (AC1)', () => {
    const el = renderExhaustedAlert(['wh_1'], () => {});
    expect(el!.classList.contains('exhausted-alert')).toBe(true);
  });

  it('rendered alert contains a dismiss button (AC3)', () => {
    const el = renderExhaustedAlert(['wh_1'], () => {});
    const btn = el!.querySelector('.exhausted-alert__dismiss');
    expect(btn).not.toBeNull();
    expect((btn as HTMLButtonElement).type).toBe('button');
  });

  it('clicking the dismiss button invokes the onDismiss callback (AC3)', () => {
    let dismissed = false;
    const el = renderExhaustedAlert(['wh_1'], () => { dismissed = true; });
    const btn = el!.querySelector<HTMLButtonElement>('.exhausted-alert__dismiss')!;
    btn.click();
    expect(dismissed).toBe(true);
  });

  it('consolidated alert mentions the count when multiple webhooks are exhausted (AC4)', () => {
    const el = renderExhaustedAlert(['wh_1', 'wh_2', 'wh_3'], () => {});
    expect(el).not.toBeNull();
    // Should mention "3" somewhere (count) and list the IDs.
    expect(el!.textContent).toContain('3');
    expect(el!.textContent).toContain('wh_1');
    expect(el!.textContent).toContain('wh_2');
    expect(el!.textContent).toContain('wh_3');
  });
});

// ---------------------------------------------------------------------------
// mountExhaustedAlert – reactive component (AC1–AC5)
// ---------------------------------------------------------------------------

describe('mountExhaustedAlert – AC1: alert rendered when webhook is exhausted', () => {
  it('renders an alert when the store already contains an exhausted webhook', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'exhausted', attempt: 1 }),
    ]);
    mountExhaustedAlert(container, store);

    const alert = container.querySelector('.exhausted-alert');
    expect(alert).not.toBeNull();
    expect(alert!.getAttribute('role')).toBe('alert');
  });

  it('renders an alert reactively when a webhook transitions to exhausted', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'failed', attempt: 1 }),
    ]);
    mountExhaustedAlert(container, store);

    // No alert yet — webhook is only failed.
    expect(container.querySelector('.exhausted-alert')).toBeNull();

    // Webhook exhausts on the next attempt.
    store.add(ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'exhausted', attempt: 2 }));

    expect(container.querySelector('.exhausted-alert')).not.toBeNull();
  });

  it('alert text contains the exhausted webhook ID', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'wh_99', eventType: 'payment.created', status: 'exhausted', attempt: 1 }),
    ]);
    mountExhaustedAlert(container, store);

    expect(container.textContent).toContain('wh_99');
  });
});

describe('mountExhaustedAlert – AC2: no alert when no webhook is exhausted', () => {
  it('renders nothing when the store is empty', () => {
    const store = new DeliveryEventStore();
    mountExhaustedAlert(container, store);

    expect(container.querySelector('.exhausted-alert')).toBeNull();
    expect(container.children.length).toBe(0);
  });

  it('renders nothing when all webhooks are delivered', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'delivered' }),
      ev({ webhookId: 'wh_2', eventType: 'refund.issued',   status: 'delivered' }),
    ]);
    mountExhaustedAlert(container, store);

    expect(container.querySelector('.exhausted-alert')).toBeNull();
  });

  it('renders nothing when all webhooks are failed (not yet exhausted)', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'failed', attempt: 1 }),
    ]);
    mountExhaustedAlert(container, store);

    expect(container.querySelector('.exhausted-alert')).toBeNull();
  });

  it('removes the alert reactively when the last exhausted webhook is re-triggered to delivered', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'exhausted', attempt: 2 }),
    ]);
    mountExhaustedAlert(container, store);

    // Alert is present.
    expect(container.querySelector('.exhausted-alert')).not.toBeNull();

    // Re-trigger: add a delivered attempt with a higher attempt number.
    store.add(ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'delivered', attempt: 3 }));

    // Alert should be gone.
    expect(container.querySelector('.exhausted-alert')).toBeNull();
  });
});

describe('mountExhaustedAlert – AC3: dismiss control hides the alert', () => {
  it('clicking dismiss removes the alert from the DOM', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'exhausted', attempt: 1 }),
    ]);
    mountExhaustedAlert(container, store);

    const btn = container.querySelector<HTMLButtonElement>('.exhausted-alert__dismiss')!;
    expect(btn).not.toBeNull();

    btn.click();

    expect(container.querySelector('.exhausted-alert')).toBeNull();
  });

  it('dismissed alert stays hidden when the same set of exhausted webhooks is re-notified', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'exhausted', attempt: 1 }),
    ]);
    mountExhaustedAlert(container, store);

    // Dismiss the alert.
    container.querySelector<HTMLButtonElement>('.exhausted-alert__dismiss')!.click();
    expect(container.querySelector('.exhausted-alert')).toBeNull();

    // Adding an unrelated delivered event for a different webhook should not
    // re-surface the alert for the same dismissed set.
    store.add(ev({ webhookId: 'wh_2', eventType: 'payment.created', status: 'delivered', attempt: 1 }));
    expect(container.querySelector('.exhausted-alert')).toBeNull();
  });

  it('re-surfaces the alert after dismiss if a NEW webhook becomes exhausted', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'exhausted', attempt: 1 }),
    ]);
    mountExhaustedAlert(container, store);

    // Dismiss the alert for {wh_1}.
    container.querySelector<HTMLButtonElement>('.exhausted-alert__dismiss')!.click();
    expect(container.querySelector('.exhausted-alert')).toBeNull();

    // A second webhook now exhausts — the set changes to {wh_1, wh_2}.
    store.add(ev({ webhookId: 'wh_2', eventType: 'refund.issued', status: 'exhausted', attempt: 1 }));

    // Alert should re-appear because the exhausted set changed.
    expect(container.querySelector('.exhausted-alert')).not.toBeNull();
  });
});

describe('mountExhaustedAlert – AC4: multiple simultaneous exhausted webhooks', () => {
  it('surfaces an alert when two webhooks are simultaneously exhausted', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'exhausted', attempt: 2 }),
      ev({ webhookId: 'wh_2', eventType: 'refund.issued',   status: 'exhausted', attempt: 3 }),
    ]);
    mountExhaustedAlert(container, store);

    const alert = container.querySelector('.exhausted-alert');
    expect(alert).not.toBeNull();
  });

  it('consolidated alert mentions both exhausted webhook IDs (no silent omissions)', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'exhausted', attempt: 2 }),
      ev({ webhookId: 'wh_2', eventType: 'refund.issued',   status: 'exhausted', attempt: 3 }),
    ]);
    mountExhaustedAlert(container, store);

    expect(container.textContent).toContain('wh_1');
    expect(container.textContent).toContain('wh_2');
  });

  it('surfaces an alert for three simultaneously exhausted webhooks', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'wh_a', eventType: 'payment.created', status: 'exhausted', attempt: 1 }),
      ev({ webhookId: 'wh_b', eventType: 'refund.issued',   status: 'exhausted', attempt: 1 }),
      ev({ webhookId: 'wh_c', eventType: 'payout.paid',     status: 'exhausted', attempt: 1 }),
    ]);
    mountExhaustedAlert(container, store);

    const alert = container.querySelector('.exhausted-alert');
    expect(alert).not.toBeNull();
    expect(container.textContent).toContain('wh_a');
    expect(container.textContent).toContain('wh_b');
    expect(container.textContent).toContain('wh_c');
  });

  it('alert updates reactively as additional webhooks become exhausted', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'exhausted', attempt: 1 }),
    ]);
    mountExhaustedAlert(container, store);

    // Initially only wh_1 is exhausted.
    expect(container.textContent).toContain('wh_1');
    expect(container.textContent).not.toContain('wh_2');

    // wh_2 also exhausts.
    store.add(ev({ webhookId: 'wh_2', eventType: 'refund.issued', status: 'exhausted', attempt: 1 }));

    // Alert now mentions both.
    expect(container.textContent).toContain('wh_1');
    expect(container.textContent).toContain('wh_2');
  });
});

describe('mountExhaustedAlert – AC5: alert updates when exhausted webhook is re-triggered', () => {
  it('alert disappears when the only exhausted webhook is re-triggered and delivered', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'failed',    attempt: 1 }),
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'exhausted', attempt: 2 }),
    ]);
    mountExhaustedAlert(container, store);

    expect(container.querySelector('.exhausted-alert')).not.toBeNull();

    // Manual re-trigger: a new attempt succeeds.
    store.add(ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'delivered', attempt: 3 }));

    expect(container.querySelector('.exhausted-alert')).toBeNull();
  });

  it('alert updates (not disappears) when one of two exhausted webhooks is re-triggered', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'exhausted', attempt: 2 }),
      ev({ webhookId: 'wh_2', eventType: 'refund.issued',   status: 'exhausted', attempt: 2 }),
    ]);
    mountExhaustedAlert(container, store);

    // Both are exhausted.
    expect(container.textContent).toContain('wh_1');
    expect(container.textContent).toContain('wh_2');

    // wh_1 is re-triggered and delivered.
    store.add(ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'delivered', attempt: 3 }));

    // Alert still present for wh_2, but wh_1 is no longer mentioned.
    expect(container.querySelector('.exhausted-alert')).not.toBeNull();
    expect(container.textContent).not.toContain('wh_1');
    expect(container.textContent).toContain('wh_2');
  });

  it('alert disappears when re-triggered webhook transitions to failed (not exhausted)', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'exhausted', attempt: 2 }),
    ]);
    mountExhaustedAlert(container, store);

    expect(container.querySelector('.exhausted-alert')).not.toBeNull();

    // Re-trigger: new attempt fails (but is not exhausted — still retrying).
    store.add(ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'failed', attempt: 3 }));

    // The latest status is now 'failed', not 'exhausted' — alert should be gone.
    expect(container.querySelector('.exhausted-alert')).toBeNull();
  });
});

describe('mountExhaustedAlert – disposer', () => {
  it('disposer unsubscribes and clears the container', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'exhausted', attempt: 1 }),
    ]);
    const dispose = mountExhaustedAlert(container, store);

    expect(container.querySelector('.exhausted-alert')).not.toBeNull();

    dispose();

    expect(container.children.length).toBe(0);

    // After disposal, adding new events should not update the container.
    store.add(ev({ webhookId: 'wh_2', eventType: 'refund.issued', status: 'exhausted', attempt: 1 }));
    expect(container.children.length).toBe(0);
  });
});

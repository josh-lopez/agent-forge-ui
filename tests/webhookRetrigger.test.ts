/**
 * Unit tests for src/webhookRetrigger.ts — Issue #294
 *
 * Covers all acceptance criteria for manual re-trigger UI state transitions:
 *
 *   AC1 – clicking re-trigger on an `exhausted` webhook transitions to `pending`.
 *   AC2 – after a re-triggered delivery succeeds, status transitions to `delivered`.
 *   AC3 – after a re-triggered delivery fails, status transitions to `failed`.
 *   AC4 – clicking re-trigger on a `failed` webhook transitions to `pending`.
 *   AC5 – re-trigger control is visible/enabled only for `failed` or `exhausted`;
 *          absent/disabled for `pending` and `delivered`.
 *   AC6 – triggering while already in-flight (`pending`) does not produce
 *          duplicate state transitions.
 *   AC7 – all tests pass with no regressions.
 *
 * Design notes:
 *   - All delivery functions are synchronous or use resolved Promises so tests
 *     are deterministic and require no fake timers.
 *   - The `retriggerFn` seam is injected per-test to control outcomes precisely.
 *   - DOM assertions use `data-webhook-status` and `data-webhook-retrigger`
 *     attributes (defined as constants in the module) to avoid coupling to
 *     implementation details like class names or text content.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mountWebhookRetrigger,
  isRetriggerAvailable,
  ATTR_STATUS_BADGE,
  ATTR_RETRIGGER_BTN,
  type RetriggerResult,
  type WebhookRetriggerHandle,
} from '../src/webhookRetrigger';
import { type DeliveryStatus } from '../src/delivery-events';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Creates a fresh container element attached to the document body. */
function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

/** Returns a retriggerFn that always resolves to success. */
function alwaysSucceed(): () => Promise<RetriggerResult> {
  return () => Promise.resolve({ success: true, httpStatus: 200, responseBodyExcerpt: 'OK' });
}

/** Returns a retriggerFn that always resolves to failure. */
function alwaysFail(): () => Promise<RetriggerResult> {
  return () =>
    Promise.resolve({ success: false, httpStatus: 503, responseBodyExcerpt: 'Service Unavailable' });
}

/** Returns a retriggerFn backed by a vi.fn() spy for call-count assertions. */
function spyFn(result: RetriggerResult): { fn: () => Promise<RetriggerResult>; spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn(() => Promise.resolve(result));
  return { fn: spy, spy };
}

/** Queries the status badge from a container. */
function getBadge(container: HTMLElement): HTMLElement | null {
  return container.querySelector(`[${ATTR_STATUS_BADGE}]`);
}

/** Queries the re-trigger button from a container. */
function getBtn(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector(`[${ATTR_RETRIGGER_BTN}]`) as HTMLButtonElement | null;
}

/** Reads the displayed status from the badge attribute. */
function getDisplayedStatus(container: HTMLElement): string | null {
  return getBadge(container)?.getAttribute(ATTR_STATUS_BADGE) ?? null;
}

// ── Test lifecycle ────────────────────────────────────────────────────────────

let container: HTMLElement;
let handle: WebhookRetriggerHandle;

beforeEach(() => {
  container = makeContainer();
});

afterEach(() => {
  handle?.dispose();
  container.remove();
});

// ── AC1: exhausted → pending on re-trigger click ──────────────────────────────

describe('AC1 – exhausted webhook transitions to pending on re-trigger click', () => {
  it('status badge shows "pending" immediately after clicking re-trigger on exhausted webhook', async () => {
    // Use a never-resolving promise so we can observe the intermediate `pending` state.
    let resolveDelivery!: (r: RetriggerResult) => void;
    const retriggerFn = () =>
      new Promise<RetriggerResult>((resolve) => {
        resolveDelivery = resolve;
      });

    handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn,
    });

    expect(getDisplayedStatus(container)).toBe('exhausted');

    // Click the re-trigger button.
    getBtn(container)!.click();

    // Status should transition to `pending` synchronously (before delivery resolves).
    expect(getDisplayedStatus(container)).toBe('pending');

    // Resolve the delivery to avoid dangling promises.
    resolveDelivery({ success: true, httpStatus: 200, responseBodyExcerpt: '' });
    await Promise.resolve();
  });

  it('handle.getStatus() returns "pending" immediately after trigger on exhausted', async () => {
    let resolveDelivery!: (r: RetriggerResult) => void;
    const retriggerFn = () =>
      new Promise<RetriggerResult>((resolve) => {
        resolveDelivery = resolve;
      });

    handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn,
    });

    const triggerPromise = handle.trigger();
    expect(handle.getStatus()).toBe('pending');

    resolveDelivery({ success: true, httpStatus: 200, responseBodyExcerpt: '' });
    await triggerPromise;
  });

  it('onStatusChange callback is called with "pending" when re-trigger fires on exhausted', async () => {
    const statusChanges: DeliveryStatus[] = [];
    let resolveDelivery!: (r: RetriggerResult) => void;

    handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: () =>
        new Promise<RetriggerResult>((resolve) => {
          resolveDelivery = resolve;
        }),
      onStatusChange: (s) => statusChanges.push(s),
    });

    getBtn(container)!.click();
    expect(statusChanges).toContain('pending');

    resolveDelivery({ success: true, httpStatus: 200, responseBodyExcerpt: '' });
    await Promise.resolve();
  });
});

// ── AC2: pending → delivered after successful re-delivery ─────────────────────

describe('AC2 – status transitions from pending to delivered after successful re-delivery', () => {
  it('status badge shows "delivered" after a successful re-trigger on exhausted', async () => {
    handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: alwaysSucceed(),
    });

    await handle.trigger();

    expect(getDisplayedStatus(container)).toBe('delivered');
  });

  it('status badge shows "delivered" after a successful re-trigger on failed', async () => {
    handle = mountWebhookRetrigger(container, {
      initialStatus: 'failed',
      retriggerFn: alwaysSucceed(),
    });

    await handle.trigger();

    expect(getDisplayedStatus(container)).toBe('delivered');
  });

  it('handle.getStatus() returns "delivered" after successful re-delivery', async () => {
    handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: alwaysSucceed(),
    });

    await handle.trigger();

    expect(handle.getStatus()).toBe('delivered');
  });

  it('onStatusChange is called with "pending" then "delivered" in order', async () => {
    const statusChanges: DeliveryStatus[] = [];

    handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: alwaysSucceed(),
      onStatusChange: (s) => statusChanges.push(s),
    });

    await handle.trigger();

    expect(statusChanges).toEqual(['pending', 'delivered']);
  });

  it('re-trigger button is absent after transitioning to delivered', async () => {
    handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: alwaysSucceed(),
    });

    await handle.trigger();

    expect(getBtn(container)).toBeNull();
  });
});

// ── AC3: pending → failed after unsuccessful re-delivery ──────────────────────

describe('AC3 – status transitions from pending to failed after unsuccessful re-delivery', () => {
  it('status badge shows "failed" after a failed re-trigger on exhausted', async () => {
    handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: alwaysFail(),
    });

    await handle.trigger();

    expect(getDisplayedStatus(container)).toBe('failed');
  });

  it('status badge shows "failed" after a failed re-trigger on failed', async () => {
    handle = mountWebhookRetrigger(container, {
      initialStatus: 'failed',
      retriggerFn: alwaysFail(),
    });

    await handle.trigger();

    expect(getDisplayedStatus(container)).toBe('failed');
  });

  it('handle.getStatus() returns "failed" after unsuccessful re-delivery', async () => {
    handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: alwaysFail(),
    });

    await handle.trigger();

    expect(handle.getStatus()).toBe('failed');
  });

  it('onStatusChange is called with "pending" then "failed" in order', async () => {
    const statusChanges: DeliveryStatus[] = [];

    handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: alwaysFail(),
      onStatusChange: (s) => statusChanges.push(s),
    });

    await handle.trigger();

    expect(statusChanges).toEqual(['pending', 'failed']);
  });

  it('re-trigger button is present again after transitioning back to failed', async () => {
    handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: alwaysFail(),
    });

    await handle.trigger();

    // After failing again, the re-trigger button should be available.
    expect(getBtn(container)).not.toBeNull();
  });
});

// ── AC4: failed → pending on re-trigger click ─────────────────────────────────

describe('AC4 – failed webhook transitions to pending on re-trigger click', () => {
  it('status badge shows "pending" immediately after clicking re-trigger on failed webhook', async () => {
    let resolveDelivery!: (r: RetriggerResult) => void;
    const retriggerFn = () =>
      new Promise<RetriggerResult>((resolve) => {
        resolveDelivery = resolve;
      });

    handle = mountWebhookRetrigger(container, {
      initialStatus: 'failed',
      retriggerFn,
    });

    expect(getDisplayedStatus(container)).toBe('failed');

    getBtn(container)!.click();

    expect(getDisplayedStatus(container)).toBe('pending');

    resolveDelivery({ success: true, httpStatus: 200, responseBodyExcerpt: '' });
    await Promise.resolve();
  });

  it('handle.getStatus() returns "pending" immediately after trigger on failed', async () => {
    let resolveDelivery!: (r: RetriggerResult) => void;

    handle = mountWebhookRetrigger(container, {
      initialStatus: 'failed',
      retriggerFn: () =>
        new Promise<RetriggerResult>((resolve) => {
          resolveDelivery = resolve;
        }),
    });

    const triggerPromise = handle.trigger();
    expect(handle.getStatus()).toBe('pending');

    resolveDelivery({ success: false, httpStatus: 503, responseBodyExcerpt: '' });
    await triggerPromise;
  });

  it('onStatusChange callback is called with "pending" when re-trigger fires on failed', async () => {
    const statusChanges: DeliveryStatus[] = [];
    let resolveDelivery!: (r: RetriggerResult) => void;

    handle = mountWebhookRetrigger(container, {
      initialStatus: 'failed',
      retriggerFn: () =>
        new Promise<RetriggerResult>((resolve) => {
          resolveDelivery = resolve;
        }),
      onStatusChange: (s) => statusChanges.push(s),
    });

    getBtn(container)!.click();
    expect(statusChanges[0]).toBe('pending');

    resolveDelivery({ success: false, httpStatus: 503, responseBodyExcerpt: '' });
    await Promise.resolve();
  });

  it('full transition sequence: failed → pending → delivered', async () => {
    const statusChanges: DeliveryStatus[] = [];

    handle = mountWebhookRetrigger(container, {
      initialStatus: 'failed',
      retriggerFn: alwaysSucceed(),
      onStatusChange: (s) => statusChanges.push(s),
    });

    await handle.trigger();

    expect(statusChanges).toEqual(['pending', 'delivered']);
    expect(handle.getStatus()).toBe('delivered');
  });

  it('full transition sequence: failed → pending → failed', async () => {
    const statusChanges: DeliveryStatus[] = [];

    handle = mountWebhookRetrigger(container, {
      initialStatus: 'failed',
      retriggerFn: alwaysFail(),
      onStatusChange: (s) => statusChanges.push(s),
    });

    await handle.trigger();

    expect(statusChanges).toEqual(['pending', 'failed']);
    expect(handle.getStatus()).toBe('failed');
  });
});

// ── AC5: re-trigger control visibility ────────────────────────────────────────

describe('AC5 – re-trigger control visible/enabled only for failed or exhausted', () => {
  it('re-trigger button is present when initial status is "failed"', () => {
    handle = mountWebhookRetrigger(container, {
      initialStatus: 'failed',
      retriggerFn: alwaysSucceed(),
    });

    expect(getBtn(container)).not.toBeNull();
  });

  it('re-trigger button is present when initial status is "exhausted"', () => {
    handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: alwaysSucceed(),
    });

    expect(getBtn(container)).not.toBeNull();
  });

  it('re-trigger button is absent when initial status is "pending"', () => {
    handle = mountWebhookRetrigger(container, {
      initialStatus: 'pending',
      retriggerFn: alwaysSucceed(),
    });

    expect(getBtn(container)).toBeNull();
  });

  it('re-trigger button is absent when initial status is "delivered"', () => {
    handle = mountWebhookRetrigger(container, {
      initialStatus: 'delivered',
      retriggerFn: alwaysSucceed(),
    });

    expect(getBtn(container)).toBeNull();
  });

  it('re-trigger button disappears while status is "pending" (in-flight)', async () => {
    let resolveDelivery!: (r: RetriggerResult) => void;

    handle = mountWebhookRetrigger(container, {
      initialStatus: 'failed',
      retriggerFn: () =>
        new Promise<RetriggerResult>((resolve) => {
          resolveDelivery = resolve;
        }),
    });

    // Button present before trigger.
    expect(getBtn(container)).not.toBeNull();

    // Trigger — status becomes pending.
    const triggerPromise = handle.trigger();
    expect(getBtn(container)).toBeNull();

    // Resolve and confirm button reappears (delivery failed → back to failed).
    resolveDelivery({ success: false, httpStatus: 503, responseBodyExcerpt: '' });
    await triggerPromise;
    expect(getBtn(container)).not.toBeNull();
  });

  it('re-trigger button disappears after successful delivery (delivered has no button)', async () => {
    handle = mountWebhookRetrigger(container, {
      initialStatus: 'failed',
      retriggerFn: alwaysSucceed(),
    });

    await handle.trigger();

    expect(getBtn(container)).toBeNull();
  });

  it('isRetriggerAvailable returns true for "failed"', () => {
    expect(isRetriggerAvailable('failed')).toBe(true);
  });

  it('isRetriggerAvailable returns true for "exhausted"', () => {
    expect(isRetriggerAvailable('exhausted')).toBe(true);
  });

  it('isRetriggerAvailable returns false for "pending"', () => {
    expect(isRetriggerAvailable('pending')).toBe(false);
  });

  it('isRetriggerAvailable returns false for "delivered"', () => {
    expect(isRetriggerAvailable('delivered')).toBe(false);
  });

  it('status badge is always present regardless of status', () => {
    for (const status of ['pending', 'delivered', 'failed', 'exhausted'] as DeliveryStatus[]) {
      const c = makeContainer();
      const h = mountWebhookRetrigger(c, { initialStatus: status, retriggerFn: alwaysSucceed() });
      expect(getBadge(c)).not.toBeNull();
      h.dispose();
      c.remove();
    }
  });

  it('status badge attribute value matches the current status', () => {
    for (const status of ['pending', 'delivered', 'failed', 'exhausted'] as DeliveryStatus[]) {
      const c = makeContainer();
      const h = mountWebhookRetrigger(c, { initialStatus: status, retriggerFn: alwaysSucceed() });
      expect(getDisplayedStatus(c)).toBe(status);
      h.dispose();
      c.remove();
    }
  });
});

// ── AC6: no duplicate transitions while in-flight ─────────────────────────────

describe('AC6 – no duplicate state transitions when re-trigger is already in-flight', () => {
  it('calling trigger() twice concurrently does not call retriggerFn twice', async () => {
    const { fn, spy } = spyFn({ success: true, httpStatus: 200, responseBodyExcerpt: '' });

    handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: fn,
    });

    // Fire two concurrent triggers.
    const p1 = handle.trigger();
    const p2 = handle.trigger(); // should be a no-op (already in-flight)

    await Promise.all([p1, p2]);

    // retriggerFn must have been called exactly once.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('clicking the button twice rapidly does not produce duplicate pending transitions', async () => {
    const statusChanges: DeliveryStatus[] = [];
    const { fn } = spyFn({ success: true, httpStatus: 200, responseBodyExcerpt: '' });

    handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: fn,
      onStatusChange: (s) => statusChanges.push(s),
    });

    // Simulate rapid double-click.
    getBtn(container)!.click();
    // After first click the button is gone (status = pending), so a second
    // click on the now-absent button is impossible — but we also test the
    // programmatic path.
    const p = handle.trigger(); // second trigger while in-flight
    await p;

    // Should only see one pending transition, not two.
    const pendingCount = statusChanges.filter((s) => s === 'pending').length;
    expect(pendingCount).toBe(1);
  });

  it('second trigger() call while in-flight resolves without changing status', async () => {
    let resolveDelivery!: (r: RetriggerResult) => void;

    handle = mountWebhookRetrigger(container, {
      initialStatus: 'failed',
      retriggerFn: () =>
        new Promise<RetriggerResult>((resolve) => {
          resolveDelivery = resolve;
        }),
    });

    // Start first trigger.
    const p1 = handle.trigger();
    expect(handle.getStatus()).toBe('pending');

    // Second trigger while in-flight — should be a no-op.
    const p2 = handle.trigger();
    await p2; // resolves immediately (no-op)

    // Status is still pending (first trigger not yet resolved).
    expect(handle.getStatus()).toBe('pending');

    // Resolve the first trigger.
    resolveDelivery({ success: true, httpStatus: 200, responseBodyExcerpt: '' });
    await p1;

    expect(handle.getStatus()).toBe('delivered');
  });

  it('trigger() is a no-op when status is "pending" (not failed/exhausted)', async () => {
    const { fn, spy } = spyFn({ success: true, httpStatus: 200, responseBodyExcerpt: '' });

    handle = mountWebhookRetrigger(container, {
      initialStatus: 'pending',
      retriggerFn: fn,
    });

    await handle.trigger();

    // retriggerFn must NOT have been called — pending is not a re-triggerable state.
    expect(spy).not.toHaveBeenCalled();
    expect(handle.getStatus()).toBe('pending');
  });

  it('trigger() is a no-op when status is "delivered"', async () => {
    const { fn, spy } = spyFn({ success: true, httpStatus: 200, responseBodyExcerpt: '' });

    handle = mountWebhookRetrigger(container, {
      initialStatus: 'delivered',
      retriggerFn: fn,
    });

    await handle.trigger();

    expect(spy).not.toHaveBeenCalled();
    expect(handle.getStatus()).toBe('delivered');
  });

  it('onStatusChange is not called when trigger() is a no-op (in-flight)', async () => {
    const statusChanges: DeliveryStatus[] = [];
    let resolveDelivery!: (r: RetriggerResult) => void;

    handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: () =>
        new Promise<RetriggerResult>((resolve) => {
          resolveDelivery = resolve;
        }),
      onStatusChange: (s) => statusChanges.push(s),
    });

    // First trigger — transitions to pending.
    const p1 = handle.trigger();
    const countAfterFirst = statusChanges.length;

    // Second trigger while in-flight — no-op, no additional status change.
    await handle.trigger();
    expect(statusChanges.length).toBe(countAfterFirst);

    resolveDelivery({ success: true, httpStatus: 200, responseBodyExcerpt: '' });
    await p1;
  });
});

// ── Additional edge cases ─────────────────────────────────────────────────────

describe('Edge cases and DOM integrity', () => {
  it('dispose() clears the container DOM', async () => {
    handle = mountWebhookRetrigger(container, {
      initialStatus: 'failed',
      retriggerFn: alwaysSucceed(),
    });

    expect(container.innerHTML).not.toBe('');
    handle.dispose();
    expect(container.innerHTML).toBe('');
  });

  it('re-trigger button has type="button" to prevent accidental form submission', () => {
    handle = mountWebhookRetrigger(container, {
      initialStatus: 'failed',
      retriggerFn: alwaysSucceed(),
    });

    const btn = getBtn(container);
    expect(btn?.type).toBe('button');
  });

  it('multiple sequential re-triggers work correctly (exhausted → delivered → no button)', async () => {
    // First trigger succeeds.
    handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: alwaysSucceed(),
    });

    await handle.trigger();
    expect(handle.getStatus()).toBe('delivered');
    expect(getBtn(container)).toBeNull();
  });

  it('multiple sequential re-triggers work correctly (failed → failed → delivered)', async () => {
    let callCount = 0;
    const retriggerFn = (): Promise<RetriggerResult> => {
      callCount++;
      // First call fails, second call succeeds.
      return Promise.resolve({
        success: callCount >= 2,
        httpStatus: callCount >= 2 ? 200 : 503,
        responseBodyExcerpt: callCount >= 2 ? 'OK' : 'Error',
      });
    };

    handle = mountWebhookRetrigger(container, {
      initialStatus: 'failed',
      retriggerFn,
    });

    // First trigger: failed → pending → failed.
    await handle.trigger();
    expect(handle.getStatus()).toBe('failed');

    // Second trigger: failed → pending → delivered.
    await handle.trigger();
    expect(handle.getStatus()).toBe('delivered');
  });

  it('synchronous retriggerFn is supported (not just async)', async () => {
    handle = mountWebhookRetrigger(container, {
      initialStatus: 'failed',
      retriggerFn: () => ({ success: true, httpStatus: 200, responseBodyExcerpt: 'sync OK' }),
    });

    await handle.trigger();

    expect(handle.getStatus()).toBe('delivered');
  });

  it('status badge text content reflects the current status', async () => {
    handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: alwaysSucceed(),
    });

    expect(getBadge(container)?.textContent).toBe('exhausted');

    await handle.trigger();

    expect(getBadge(container)?.textContent).toBe('delivered');
  });

  it('no onStatusChange call when initial status is set (only on transitions)', () => {
    const statusChanges: DeliveryStatus[] = [];

    handle = mountWebhookRetrigger(container, {
      initialStatus: 'failed',
      retriggerFn: alwaysSucceed(),
      onStatusChange: (s) => statusChanges.push(s),
    });

    // No transitions yet — callback should not have been called.
    expect(statusChanges).toHaveLength(0);
  });

  it('full exhausted → pending → delivered transition sequence via DOM click', async () => {
    const statusChanges: DeliveryStatus[] = [];

    handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: alwaysSucceed(),
      onStatusChange: (s) => statusChanges.push(s),
    });

    // Click the button and wait for microtasks to flush.
    getBtn(container)!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(statusChanges).toEqual(['pending', 'delivered']);
    expect(handle.getStatus()).toBe('delivered');
  });
});

// ── isRetriggerAvailable utility ──────────────────────────────────────────────

describe('isRetriggerAvailable utility function', () => {
  it('returns true for all actionable statuses', () => {
    expect(isRetriggerAvailable('failed')).toBe(true);
    expect(isRetriggerAvailable('exhausted')).toBe(true);
  });

  it('returns false for all non-actionable statuses', () => {
    expect(isRetriggerAvailable('pending')).toBe(false);
    expect(isRetriggerAvailable('delivered')).toBe(false);
  });

  it('covers all four DeliveryStatus values', () => {
    const statuses: DeliveryStatus[] = ['pending', 'delivered', 'failed', 'exhausted'];
    const results = statuses.map((s) => isRetriggerAvailable(s));
    // Exactly two statuses are actionable.
    expect(results.filter(Boolean)).toHaveLength(2);
    expect(results.filter((r) => !r)).toHaveLength(2);
  });
});

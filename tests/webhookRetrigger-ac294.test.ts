/**
 * Supplemental unit tests for src/webhookRetrigger.ts — Issue #294
 *
 * These tests provide additional coverage of the acceptance criteria,
 * complementing the primary tests in webhookRetrigger.test.ts.
 *
 *   AC1 – exhausted → pending on re-trigger click
 *   AC2 – pending → delivered after successful re-delivery
 *   AC3 – pending → failed after unsuccessful re-delivery
 *   AC4 – failed → pending on re-trigger click
 *   AC5 – re-trigger control visible/enabled only for failed or exhausted
 *   AC6 – no duplicate transitions while in-flight
 */

import { describe, it, expect, vi } from 'vitest';
import {
  mountWebhookRetrigger,
  isRetriggerAvailable,
  ATTR_STATUS_BADGE,
  ATTR_RETRIGGER_BTN,
  type RetriggerResult,
} from '../src/webhookRetrigger';
import { type DeliveryStatus } from '../src/delivery-events';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function getDisplayedStatus(container: HTMLElement): string | null {
  return container.querySelector(`[${ATTR_STATUS_BADGE}]`)?.getAttribute(ATTR_STATUS_BADGE) ?? null;
}

function getBtn(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector(`[${ATTR_RETRIGGER_BTN}]`) as HTMLButtonElement | null;
}

function succeed(): RetriggerResult {
  return { success: true, httpStatus: 200, responseBodyExcerpt: 'OK' };
}

function fail(): RetriggerResult {
  return { success: false, httpStatus: 503, responseBodyExcerpt: 'Error' };
}

// ── AC1: exhausted → pending ──────────────────────────────────────────────────

describe('AC1 – exhausted webhook: re-trigger click transitions status to pending', () => {
  it('DOM badge attribute transitions to "pending" synchronously on click', async () => {
    const container = makeContainer();
    let resolve!: (r: RetriggerResult) => void;
    const handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: () => new Promise<RetriggerResult>((res) => { resolve = res; }),
    });

    expect(getDisplayedStatus(container)).toBe('exhausted');
    getBtn(container)!.click();
    expect(getDisplayedStatus(container)).toBe('pending');

    resolve(succeed());
    await handle.trigger().catch(() => {});
    handle.dispose();
    container.remove();
  });

  it('onStatusChange receives "pending" as first transition from exhausted', async () => {
    const container = makeContainer();
    const changes: DeliveryStatus[] = [];
    let resolve!: (r: RetriggerResult) => void;
    const handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: () => new Promise<RetriggerResult>((res) => { resolve = res; }),
      onStatusChange: (s) => changes.push(s),
    });

    const p = handle.trigger();
    expect(changes[0]).toBe('pending');
    resolve(succeed());
    await p;
    handle.dispose();
    container.remove();
  });
});

// ── AC2: pending → delivered after success ────────────────────────────────────

describe('AC2 – re-triggered delivery succeeds: status transitions to delivered', () => {
  it('badge shows "delivered" and getStatus() returns "delivered" after success', async () => {
    const container = makeContainer();
    const handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: () => Promise.resolve(succeed()),
    });

    await handle.trigger();

    expect(getDisplayedStatus(container)).toBe('delivered');
    expect(handle.getStatus()).toBe('delivered');
    handle.dispose();
    container.remove();
  });

  it('onStatusChange sequence is ["pending", "delivered"] on success from failed', async () => {
    const container = makeContainer();
    const changes: DeliveryStatus[] = [];
    const handle = mountWebhookRetrigger(container, {
      initialStatus: 'failed',
      retriggerFn: () => Promise.resolve(succeed()),
      onStatusChange: (s) => changes.push(s),
    });

    await handle.trigger();

    expect(changes).toEqual(['pending', 'delivered']);
    handle.dispose();
    container.remove();
  });
});

// ── AC3: pending → failed after failure ───────────────────────────────────────

describe('AC3 – re-triggered delivery fails: status transitions to failed', () => {
  it('badge shows "failed" and getStatus() returns "failed" after failure', async () => {
    const container = makeContainer();
    const handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: () => Promise.resolve(fail()),
    });

    await handle.trigger();

    expect(getDisplayedStatus(container)).toBe('failed');
    expect(handle.getStatus()).toBe('failed');
    handle.dispose();
    container.remove();
  });

  it('onStatusChange sequence is ["pending", "failed"] on failure from exhausted', async () => {
    const container = makeContainer();
    const changes: DeliveryStatus[] = [];
    const handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: () => Promise.resolve(fail()),
      onStatusChange: (s) => changes.push(s),
    });

    await handle.trigger();

    expect(changes).toEqual(['pending', 'failed']);
    handle.dispose();
    container.remove();
  });
});

// ── AC4: failed → pending on re-trigger click ─────────────────────────────────

describe('AC4 – failed webhook: re-trigger click transitions status to pending', () => {
  it('DOM badge attribute transitions to "pending" synchronously on click from failed', async () => {
    const container = makeContainer();
    let resolve!: (r: RetriggerResult) => void;
    const handle = mountWebhookRetrigger(container, {
      initialStatus: 'failed',
      retriggerFn: () => new Promise<RetriggerResult>((res) => { resolve = res; }),
    });

    expect(getDisplayedStatus(container)).toBe('failed');
    getBtn(container)!.click();
    expect(getDisplayedStatus(container)).toBe('pending');

    resolve(succeed());
    await handle.trigger().catch(() => {});
    handle.dispose();
    container.remove();
  });

  it('full sequence failed → pending → delivered via programmatic trigger', async () => {
    const container = makeContainer();
    const changes: DeliveryStatus[] = [];
    const handle = mountWebhookRetrigger(container, {
      initialStatus: 'failed',
      retriggerFn: () => Promise.resolve(succeed()),
      onStatusChange: (s) => changes.push(s),
    });

    await handle.trigger();

    expect(changes).toEqual(['pending', 'delivered']);
    expect(handle.getStatus()).toBe('delivered');
    handle.dispose();
    container.remove();
  });
});

// ── AC5: control visibility ───────────────────────────────────────────────────

describe('AC5 – re-trigger control visibility by status', () => {
  const cases: Array<{ status: DeliveryStatus; expectBtn: boolean }> = [
    { status: 'failed',    expectBtn: true  },
    { status: 'exhausted', expectBtn: true  },
    { status: 'pending',   expectBtn: false },
    { status: 'delivered', expectBtn: false },
  ];

  for (const { status, expectBtn } of cases) {
    it(`button is ${expectBtn ? 'present' : 'absent'} for initial status "${status}"`, () => {
      const container = makeContainer();
      const handle = mountWebhookRetrigger(container, {
        initialStatus: status,
        retriggerFn: () => Promise.resolve(succeed()),
      });

      if (expectBtn) {
        expect(getBtn(container)).not.toBeNull();
      } else {
        expect(getBtn(container)).toBeNull();
      }

      handle.dispose();
      container.remove();
    });
  }

  it('isRetriggerAvailable is true for failed and exhausted, false for pending and delivered', () => {
    expect(isRetriggerAvailable('failed')).toBe(true);
    expect(isRetriggerAvailable('exhausted')).toBe(true);
    expect(isRetriggerAvailable('pending')).toBe(false);
    expect(isRetriggerAvailable('delivered')).toBe(false);
  });

  it('button disappears while in-flight and reappears if delivery fails', async () => {
    const container = makeContainer();
    let resolve!: (r: RetriggerResult) => void;
    const handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: () => new Promise<RetriggerResult>((res) => { resolve = res; }),
    });

    expect(getBtn(container)).not.toBeNull();
    const p = handle.trigger();
    expect(getBtn(container)).toBeNull(); // in-flight → pending, no button

    resolve(fail());
    await p;
    expect(getBtn(container)).not.toBeNull(); // back to failed, button returns

    handle.dispose();
    container.remove();
  });
});

// ── AC6: no duplicate transitions while in-flight ─────────────────────────────

describe('AC6 – in-flight guard prevents duplicate state transitions', () => {
  it('retriggerFn is called exactly once when trigger() is called twice concurrently', async () => {
    const container = makeContainer();
    let resolve!: (r: RetriggerResult) => void;
    const spy = vi.fn(() => new Promise<RetriggerResult>((res) => { resolve = res; }));

    const handle = mountWebhookRetrigger(container, {
      initialStatus: 'exhausted',
      retriggerFn: spy,
    });

    const p1 = handle.trigger();
    const p2 = handle.trigger(); // second call while in-flight — should be no-op

    resolve(succeed());
    await Promise.all([p1, p2]);

    expect(spy).toHaveBeenCalledTimes(1);
    handle.dispose();
    container.remove();
  });

  it('onStatusChange is not called a second time when trigger() is called while in-flight', async () => {
    const container = makeContainer();
    const changes: DeliveryStatus[] = [];
    let resolve!: (r: RetriggerResult) => void;

    const handle = mountWebhookRetrigger(container, {
      initialStatus: 'failed',
      retriggerFn: () => new Promise<RetriggerResult>((res) => { resolve = res; }),
      onStatusChange: (s) => changes.push(s),
    });

    const p1 = handle.trigger();
    // At this point status is pending; second trigger should be a no-op
    const p2 = handle.trigger();

    resolve(succeed());
    await Promise.all([p1, p2]);

    // Should only see pending then delivered — no duplicate pending
    expect(changes).toEqual(['pending', 'delivered']);
    handle.dispose();
    container.remove();
  });

  it('trigger() is a no-op when status is "pending" (not failed/exhausted)', async () => {
    const container = makeContainer();
    const spy = vi.fn(() => Promise.resolve(succeed()));

    const handle = mountWebhookRetrigger(container, {
      initialStatus: 'pending',
      retriggerFn: spy,
    });

    await handle.trigger();

    expect(spy).not.toHaveBeenCalled();
    expect(handle.getStatus()).toBe('pending');
    handle.dispose();
    container.remove();
  });

  it('trigger() is a no-op when status is "delivered"', async () => {
    const container = makeContainer();
    const spy = vi.fn(() => Promise.resolve(succeed()));

    const handle = mountWebhookRetrigger(container, {
      initialStatus: 'delivered',
      retriggerFn: spy,
    });

    await handle.trigger();

    expect(spy).not.toHaveBeenCalled();
    expect(handle.getStatus()).toBe('delivered');
    handle.dispose();
    container.remove();
  });
});

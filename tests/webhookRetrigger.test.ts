/**
 * Unit tests for Issue #141: Manual re-trigger control for failed/exhausted webhooks.
 *
 * Covers all AC8 requirements:
 *   - Button renders for `failed` state.
 *   - Button renders for `exhausted` state.
 *   - Button absent/null for `pending` state.
 *   - Button absent/null for `delivered` state.
 *   - Clicking triggers the retry mechanism exactly once.
 *
 * Also covers:
 *   - AC6: button is disabled while retriggering is in flight.
 *   - AC9: button has aria-label and is keyboard-operable (native <button>).
 *   - AC3: retriggerWebhook resets attemptCount to 0.
 *   - AC4: retriggerWebhook transitions status to 'pending' synchronously.
 *   - Race-condition guard: duplicate in-flight calls are no-ops.
 *   - canRetrigger pure predicate.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  canRetrigger,
  createRetriggerButton,
  retriggerWebhook,
  WebhookRecord,
  WebhookStatus,
} from '../src/webhookRetrigger';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWebhook(
  status: WebhookStatus,
  overrides: Partial<WebhookRecord> = {},
): WebhookRecord {
  return {
    id: 'wh-test-1',
    status,
    attemptCount: 3,
    retriggering: false,
    ...overrides,
  };
}

// ── canRetrigger ──────────────────────────────────────────────────────────────

describe('canRetrigger', () => {
  it('returns true for "failed" status', () => {
    expect(canRetrigger('failed')).toBe(true);
  });

  it('returns true for "exhausted" status', () => {
    expect(canRetrigger('exhausted')).toBe(true);
  });

  it('returns false for "pending" status', () => {
    expect(canRetrigger('pending')).toBe(false);
  });

  it('returns false for "delivered" status', () => {
    expect(canRetrigger('delivered')).toBe(false);
  });
});

// ── createRetriggerButton — AC1 / AC2 (render conditions) ────────────────────

describe('createRetriggerButton – render conditions (AC1 / AC2)', () => {
  // AC8: button renders for `failed` state
  it('returns a button element for "failed" status (AC1 / AC8)', () => {
    const webhook = makeWebhook('failed');
    const btn = createRetriggerButton(webhook, { onRetrigger: vi.fn() });
    expect(btn).not.toBeNull();
    expect(btn).toBeInstanceOf(HTMLButtonElement);
  });

  // AC8: button renders for `exhausted` state
  it('returns a button element for "exhausted" status (AC1 / AC8)', () => {
    const webhook = makeWebhook('exhausted');
    const btn = createRetriggerButton(webhook, { onRetrigger: vi.fn() });
    expect(btn).not.toBeNull();
    expect(btn).toBeInstanceOf(HTMLButtonElement);
  });

  // AC8: button absent for `pending` state
  it('returns null for "pending" status (AC2 / AC8)', () => {
    const webhook = makeWebhook('pending');
    const btn = createRetriggerButton(webhook, { onRetrigger: vi.fn() });
    expect(btn).toBeNull();
  });

  // AC8: button absent for `delivered` state
  it('returns null for "delivered" status (AC2 / AC8)', () => {
    const webhook = makeWebhook('delivered');
    const btn = createRetriggerButton(webhook, { onRetrigger: vi.fn() });
    expect(btn).toBeNull();
  });
});

// ── createRetriggerButton — AC9 (accessibility) ───────────────────────────────

describe('createRetriggerButton – accessibility (AC9)', () => {
  it('has aria-label="Re-trigger webhook"', () => {
    const webhook = makeWebhook('failed');
    const btn = createRetriggerButton(webhook, { onRetrigger: vi.fn() })!;
    expect(btn.getAttribute('aria-label')).toBe('Re-trigger webhook');
  });

  it('is a native <button> element (keyboard-operable)', () => {
    const webhook = makeWebhook('exhausted');
    const btn = createRetriggerButton(webhook, { onRetrigger: vi.fn() })!;
    expect(btn.tagName.toLowerCase()).toBe('button');
  });

  it('has type="button" to prevent accidental form submission', () => {
    const webhook = makeWebhook('failed');
    const btn = createRetriggerButton(webhook, { onRetrigger: vi.fn() })!;
    expect(btn.type).toBe('button');
  });

  it('uses the default label text "Re-trigger" when no label option is given', () => {
    const webhook = makeWebhook('failed');
    const btn = createRetriggerButton(webhook, { onRetrigger: vi.fn() })!;
    expect(btn.textContent).toBe('Re-trigger');
  });

  it('uses a custom label when the label option is provided', () => {
    const webhook = makeWebhook('failed');
    const btn = createRetriggerButton(webhook, {
      onRetrigger: vi.fn(),
      label: 'Retry now',
    })!;
    expect(btn.textContent).toBe('Retry now');
  });
});

// ── createRetriggerButton — AC6 (disabled while in-flight) ───────────────────

describe('createRetriggerButton – disabled while in-flight (AC6)', () => {
  it('is NOT disabled when retriggering is false', () => {
    const webhook = makeWebhook('failed', { retriggering: false });
    const btn = createRetriggerButton(webhook, { onRetrigger: vi.fn() })!;
    expect(btn.disabled).toBe(false);
  });

  it('is disabled when retriggering is true', () => {
    const webhook = makeWebhook('failed', { retriggering: true });
    const btn = createRetriggerButton(webhook, { onRetrigger: vi.fn() })!;
    expect(btn.disabled).toBe(true);
  });

  it('has aria-busy="true" when retriggering is true', () => {
    const webhook = makeWebhook('exhausted', { retriggering: true });
    const btn = createRetriggerButton(webhook, { onRetrigger: vi.fn() })!;
    expect(btn.getAttribute('aria-busy')).toBe('true');
  });
});

// ── createRetriggerButton — AC8: clicking triggers retry exactly once ─────────

describe('createRetriggerButton – click triggers retry (AC8)', () => {
  it('calls onRetrigger with the webhook id when clicked', () => {
    const onRetrigger = vi.fn();
    const webhook = makeWebhook('failed');
    const btn = createRetriggerButton(webhook, { onRetrigger })!;

    btn.click();

    expect(onRetrigger).toHaveBeenCalledTimes(1);
    expect(onRetrigger).toHaveBeenCalledWith('wh-test-1');
  });

  it('calls onRetrigger exactly once per click (not multiple times)', () => {
    const onRetrigger = vi.fn();
    const webhook = makeWebhook('exhausted');
    const btn = createRetriggerButton(webhook, { onRetrigger })!;

    btn.click();
    btn.click();

    // Two separate clicks → two calls (each click is independent).
    expect(onRetrigger).toHaveBeenCalledTimes(2);
  });

  it('does NOT call onRetrigger when the button is disabled (in-flight)', () => {
    const onRetrigger = vi.fn();
    const webhook = makeWebhook('failed', { retriggering: true });
    const btn = createRetriggerButton(webhook, { onRetrigger })!;

    btn.click();

    expect(onRetrigger).not.toHaveBeenCalled();
  });
});

// ── retriggerWebhook — AC3 / AC4 / AC6 ───────────────────────────────────────

describe('retriggerWebhook – state transitions (AC3 / AC4 / AC6)', () => {
  it('resets attemptCount to 0 before calling retryFn (AC3)', async () => {
    const webhook = makeWebhook('failed', { attemptCount: 5 });
    let countAtCallTime = -1;

    await retriggerWebhook(webhook, async (wh) => {
      countAtCallTime = wh.attemptCount;
    });

    expect(countAtCallTime).toBe(0);
    expect(webhook.attemptCount).toBe(0);
  });

  it('transitions status to "pending" synchronously before awaiting retryFn (AC4)', async () => {
    const webhook = makeWebhook('failed');
    let statusAtCallTime: WebhookStatus = 'failed';

    // We capture the status at the moment retryFn is invoked.
    await retriggerWebhook(webhook, async (wh) => {
      statusAtCallTime = wh.status;
    });

    expect(statusAtCallTime).toBe('pending');
  });

  it('sets retriggering=true while retryFn is running (AC6)', async () => {
    const webhook = makeWebhook('exhausted');
    let retriggeringDuringCall = false;

    await retriggerWebhook(webhook, async (wh) => {
      retriggeringDuringCall = wh.retriggering === true;
    });

    expect(retriggeringDuringCall).toBe(true);
  });

  it('clears retriggering=false after retryFn resolves (AC6)', async () => {
    const webhook = makeWebhook('failed');

    await retriggerWebhook(webhook, async () => {
      // no-op
    });

    expect(webhook.retriggering).toBe(false);
  });

  it('clears retriggering=false even when retryFn throws (AC6 error path)', async () => {
    const webhook = makeWebhook('failed');

    await expect(
      retriggerWebhook(webhook, async () => {
        throw new Error('simulated delivery failure');
      }),
    ).rejects.toThrow('simulated delivery failure');

    expect(webhook.retriggering).toBe(false);
  });
});

// ── retriggerWebhook — race-condition guard ───────────────────────────────────

describe('retriggerWebhook – race-condition guard', () => {
  it('is a no-op when retriggering is already true (duplicate in-flight guard)', async () => {
    const retryFn = vi.fn().mockResolvedValue(undefined);
    const webhook = makeWebhook('failed', { retriggering: true });

    await retriggerWebhook(webhook, retryFn);

    expect(retryFn).not.toHaveBeenCalled();
    // Status and attemptCount must remain unchanged.
    expect(webhook.status).toBe('failed');
    expect(webhook.attemptCount).toBe(3);
  });

  it('allows a second call after the first completes', async () => {
    const retryFn = vi.fn().mockResolvedValue(undefined);
    const webhook = makeWebhook('failed');

    await retriggerWebhook(webhook, retryFn);
    // Simulate the webhook going back to failed after the first attempt.
    webhook.status = 'failed';
    await retriggerWebhook(webhook, retryFn);

    expect(retryFn).toHaveBeenCalledTimes(2);
  });
});

// ── Simulator compatibility (AC7) ─────────────────────────────────────────────

describe('retriggerWebhook – simulator compatibility (AC7)', () => {
  it('works with a simulator-style retryFn that emits delivery events', async () => {
    const events: Array<{ status: WebhookStatus; manual: boolean }> = [];

    const simulatorRetryFn = async (wh: WebhookRecord) => {
      // Simulate the simulator emitting a pending → delivered sequence.
      events.push({ status: wh.status, manual: true });
      // Simulate async delivery success.
      wh.status = 'delivered';
      events.push({ status: wh.status, manual: true });
    };

    const webhook = makeWebhook('exhausted', { attemptCount: 6 });
    await retriggerWebhook(webhook, simulatorRetryFn);

    // AC3: attempt count was reset.
    expect(webhook.attemptCount).toBe(0);
    // AC4: first event captured status as 'pending'.
    expect(events[0].status).toBe('pending');
    // AC5: subsequent events reflect the delivery outcome.
    expect(events[1].status).toBe('delivered');
    expect(webhook.status).toBe('delivered');
  });
});

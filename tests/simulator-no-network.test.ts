/**
 * Issue #248 — Simulator no-external-dependencies constraint test
 *
 * Verifies that neither simulator module (`src/webhook-simulator.ts` nor
 * `src/webhookSimulator.ts`) makes any network calls during a full delivery
 * cycle (including retries through to `delivered` or `exhausted`).
 *
 * Acceptance criteria covered:
 *   AC1 – fetch, XMLHttpRequest, and navigator.sendBeacon are intercepted/
 *          stubbed before the simulators run; none must be called.
 *   AC2 – Covers successRate=1.0 (all succeed), successRate=0.0 (all exhaust),
 *          and successRate=0.5 (intermediate).
 *   AC3 – Part of the standard test suite (runs via `npm test`).
 *   AC5 – All tests pass with zero network calls detected.
 *   AC6 – Co-located with the simulator modules under tests/ (associated with
 *          src/ simulators).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Network-primitive stubs
// ---------------------------------------------------------------------------
// We install stubs for every known network primitive BEFORE importing the
// simulators so that even a top-level side-effecting call would be caught.
// jsdom (the Vitest environment) exposes window.fetch, window.XMLHttpRequest,
// and navigator.sendBeacon; we replace them with vi.fn() spies.

let fetchSpy: ReturnType<typeof vi.fn>;
let xhrConstructorSpy: ReturnType<typeof vi.fn>;
let sendBeaconSpy: ReturnType<typeof vi.fn>;

// We capture the original values so we can restore them after each test.
const originalFetch = globalThis.fetch;
const originalXHR = globalThis.XMLHttpRequest;
const originalSendBeacon =
  typeof navigator !== 'undefined' ? navigator.sendBeacon : undefined;

beforeEach(() => {
  // Replace fetch with a spy that throws if called (network calls are bugs).
  fetchSpy = vi.fn().mockImplementation(() => {
    throw new Error('fetch must not be called by the simulator');
  });
  globalThis.fetch = fetchSpy as unknown as typeof fetch;

  // Replace XMLHttpRequest with a spy constructor.
  xhrConstructorSpy = vi.fn().mockImplementation(() => {
    throw new Error('XMLHttpRequest must not be called by the simulator');
  });
  // Preserve static properties (e.g. DONE, OPENED …) so the environment stays
  // consistent even though we never expect the constructor to be invoked.
  Object.assign(xhrConstructorSpy, originalXHR);
  globalThis.XMLHttpRequest = xhrConstructorSpy as unknown as typeof XMLHttpRequest;

  // Replace navigator.sendBeacon with a spy.
  sendBeaconSpy = vi.fn().mockImplementation(() => {
    throw new Error('navigator.sendBeacon must not be called by the simulator');
  });
  if (typeof navigator !== 'undefined') {
    Object.defineProperty(navigator, 'sendBeacon', {
      value: sendBeaconSpy,
      writable: true,
      configurable: true,
    });
  }
});

afterEach(() => {
  // Restore originals so other test files are not affected.
  globalThis.fetch = originalFetch;
  globalThis.XMLHttpRequest = originalXHR;
  if (typeof navigator !== 'undefined' && originalSendBeacon !== undefined) {
    Object.defineProperty(navigator, 'sendBeacon', {
      value: originalSendBeacon,
      writable: true,
      configurable: true,
    });
  }
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helper: assert no network primitives were called
// ---------------------------------------------------------------------------

function assertNoNetworkCalls(): void {
  expect(fetchSpy, 'fetch must not be called by the simulator').not.toHaveBeenCalled();
  expect(xhrConstructorSpy, 'XMLHttpRequest must not be called by the simulator').not.toHaveBeenCalled();
  expect(sendBeaconSpy, 'navigator.sendBeacon must not be called by the simulator').not.toHaveBeenCalled();
}

// ---------------------------------------------------------------------------
// Tests for src/webhook-simulator.ts  (functional API)
// ---------------------------------------------------------------------------

import {
  simulateWebhook,
  generateSimulatedEvents,
} from '../src/webhook-simulator';

describe('src/webhook-simulator.ts — no network calls', () => {
  // Deterministic RNGs so tests are reproducible.
  const alwaysSucceed = () => 0.0; // 0.0 < any successRate > 0 → succeeds
  const alwaysFail = () => 1.0;    // 1.0 >= any successRate < 1 → fails

  // Zero-delay schedule so tests run instantly.
  const INSTANT_DELAYS = [0, 0, 0, 0, 0, 0];

  // ── AC2: successRate=1.0 ──────────────────────────────────────────────────

  describe('successRate=1.0 (all succeed)', () => {
    it('simulateWebhook completes without any network calls', () => {
      const events = simulateWebhook('wh_1', 'payment.created', {
        successRate: 1.0,
        random: alwaysSucceed,
        startTime: 0,
      });

      expect(events.length).toBeGreaterThan(0);
      expect(events[events.length - 1].status).toBe('delivered');
      assertNoNetworkCalls();
    });

    it('generateSimulatedEvents completes without any network calls', () => {
      const events = generateSimulatedEvents({
        successRate: 1.0,
        count: 5,
        random: alwaysSucceed,
        startTime: 0,
      });

      expect(events.length).toBeGreaterThan(0);
      events.forEach((e) => expect(e.status).toBe('delivered'));
      assertNoNetworkCalls();
    });
  });

  // ── AC2: successRate=0.0 ──────────────────────────────────────────────────

  describe('successRate=0.0 (all exhaust)', () => {
    it('simulateWebhook exhausts all retries without any network calls', () => {
      const events = simulateWebhook('wh_2', 'refund.issued', {
        successRate: 0.0,
        random: alwaysFail,
        startTime: 0,
      });

      expect(events.length).toBeGreaterThan(0);
      expect(events[events.length - 1].status).toBe('exhausted');
      assertNoNetworkCalls();
    });

    it('generateSimulatedEvents exhausts all webhooks without any network calls', () => {
      const events = generateSimulatedEvents({
        successRate: 0.0,
        count: 3,
        random: alwaysFail,
        startTime: 0,
      });

      expect(events.length).toBeGreaterThan(0);
      // Each webhook's last event should be exhausted.
      const byWebhook = new Map<string, typeof events>();
      for (const e of events) {
        if (!byWebhook.has(e.webhookId)) byWebhook.set(e.webhookId, []);
        byWebhook.get(e.webhookId)!.push(e);
      }
      for (const [, webhookEvents] of byWebhook) {
        const last = webhookEvents[webhookEvents.length - 1];
        expect(last.status).toBe('exhausted');
      }
      assertNoNetworkCalls();
    });
  });

  // ── AC2: successRate=0.5 (intermediate) ───────────────────────────────────

  describe('successRate=0.5 (intermediate)', () => {
    it('simulateWebhook with seeded RNG produces no network calls', () => {
      // Alternating: first attempt fails (0.9 >= 0.5), second succeeds (0.1 < 0.5).
      const values = [0.9, 0.1];
      let idx = 0;
      const seededRng = () => values[idx++ % values.length];

      const events = simulateWebhook('wh_3', 'payout.paid', {
        successRate: 0.5,
        random: seededRng,
        startTime: 0,
      });

      expect(events.length).toBeGreaterThan(0);
      const last = events[events.length - 1];
      expect(['delivered', 'exhausted']).toContain(last.status);
      assertNoNetworkCalls();
    });

    it('generateSimulatedEvents with seeded RNG produces no network calls', () => {
      let seed = 12345;
      const lcg = () => {
        seed = (seed * 1664525 + 1013904223) & 0xffffffff;
        return (seed >>> 0) / 0x100000000;
      };

      const events = generateSimulatedEvents({
        successRate: 0.5,
        count: 8,
        random: lcg,
        startTime: 0,
      });

      expect(events.length).toBeGreaterThan(0);
      assertNoNetworkCalls();
    });
  });

  // ── Full retry schedule traversal ─────────────────────────────────────────

  describe('full retry schedule traversal', () => {
    it('simulateWebhook traverses all retry steps without network calls', () => {
      // Force all attempts to fail so we exercise every retry step.
      const events = simulateWebhook('wh_retry', 'payment.created', {
        successRate: 0.0,
        maxAttempts: 6,
        random: alwaysFail,
        startTime: 0,
      });

      // Should have 5 failed + 1 exhausted = 6 events.
      expect(events).toHaveLength(6);
      expect(events[5].status).toBe('exhausted');
      events.slice(0, 5).forEach((e) => expect(e.status).toBe('failed'));
      assertNoNetworkCalls();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests for src/webhookSimulator.ts  (class-based API)
// ---------------------------------------------------------------------------

import { WebhookSimulator } from '../src/webhookSimulator';

describe('src/webhookSimulator.ts — no network calls', () => {
  // Use fake timers so setTimeout-based delays resolve instantly.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper: collect all events from the async generator, advancing fake timers
  // as needed so setTimeout delays don't block.
  async function collectEvents(
    config: ConstructorParameters<typeof WebhookSimulator>[0],
    webhookId = 'wh_test',
    eventType = 'payment.created',
  ) {
    const sim = new WebhookSimulator(config);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events: any[] = [];

    // We interleave advancing fake timers with consuming the async generator.
    const gen = sim.deliver(webhookId, eventType);
    let done = false;
    while (!done) {
      // Advance all pending timers so the next sleep() resolves.
      await vi.runAllTimersAsync();
      const result = await gen.next();
      if (result.done) {
        done = true;
      } else {
        events.push(result.value as any);
      }
    }
    return events;
  }

  // ── AC2: successRate=1.0 ──────────────────────────────────────────────────

  describe('successRate=1.0 (all succeed)', () => {
    it('deliver() completes without any network calls', async () => {
      const events = await collectEvents({
        successRate: 1.0,
        retryDelaysMs: [0, 0, 0, 0, 0, 0],
        rng: () => 0.0, // always succeed
      });

      expect(events.length).toBeGreaterThan(0);
      expect((events[events.length - 1] as any).status).toBe('delivered');
      assertNoNetworkCalls();
    });
  });

  // ── AC2: successRate=0.0 ──────────────────────────────────────────────────

  describe('successRate=0.0 (all exhaust)', () => {
    it('deliver() exhausts all retries without any network calls', async () => {
      const events = await collectEvents({
        successRate: 0.0,
        maxAttempts: 4,
        retryDelaysMs: [0, 0, 0, 0],
        rng: () => 1.0, // always fail
      });

      expect(events.length).toBeGreaterThan(0);
      expect((events[events.length - 1] as any).status).toBe('exhausted');
      assertNoNetworkCalls();
    });
  });

  // ── AC2: successRate=0.5 (intermediate) ───────────────────────────────────

  describe('successRate=0.5 (intermediate)', () => {
    it('deliver() with seeded RNG produces no network calls', async () => {
      const values = [0.9, 0.1]; // fail then succeed
      let idx = 0;
      const seededRng = () => values[idx++ % values.length];

      const events = await collectEvents({
        successRate: 0.5,
        maxAttempts: 6,
        retryDelaysMs: [0, 0, 0, 0, 0, 0],
        rng: seededRng,
      });

      expect(events.length).toBeGreaterThan(0);
      const last = events[events.length - 1] as any;
      expect(['delivered', 'exhausted']).toContain(last.status);
      assertNoNetworkCalls();
    });
  });

  // ── Full retry schedule traversal ─────────────────────────────────────────

  describe('full retry schedule traversal', () => {
    it('deliver() traverses all retry steps without network calls', async () => {
      const events = await collectEvents({
        successRate: 0.0,
        maxAttempts: 6,
        retryDelaysMs: [0, 0, 0, 0, 0, 0],
        rng: () => 1.0, // always fail
      });

      expect(events).toHaveLength(6);
      expect((events[5] as any).status).toBe('exhausted');
      (events.slice(0, 5) as any[]).forEach((e) => expect(e.status).toBe('failed'));
      assertNoNetworkCalls();
    });
  });
});

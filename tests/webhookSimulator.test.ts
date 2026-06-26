import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_MAX_ATTEMPTS,
  RETRY_SCHEDULE_MS,
  type DeliveryEvent,
} from '../src/deliveryEvents';
import {
  type Clock,
  isSimulatorEnabled,
  runSimulation,
} from '../src/webhookSimulator';

// A deterministic, controllable clock. Scheduled callbacks are queued and only
// run when `flush()` is called, so the retry schedule progresses immediately
// without any wall-clock delay or flakiness.
function makeFakeClock(): Clock & { flush: () => void } {
  const queue: Array<() => void> = [];
  return {
    setTimeout: (cb) => {
      queue.push(cb);
    },
    now: () => 0,
    flush: () => {
      // Drain the queue, allowing callbacks to enqueue further callbacks.
      while (queue.length > 0) {
        const cb = queue.shift();
        cb?.();
      }
    },
  };
}

// An RNG that returns a fixed value, so success/failure is fully deterministic.
const rngReturning = (value: number) => () => value;

describe('runSimulation', () => {
  it('rejects a successRate below 0', () => {
    expect(() =>
      runSimulation({ successRate: -0.1, onEvent: () => {} }),
    ).toThrow(RangeError);
  });

  it('rejects a successRate above 1', () => {
    expect(() =>
      runSimulation({ successRate: 1.5, onEvent: () => {} }),
    ).toThrow(RangeError);
  });

  it('rejects a non-number successRate', () => {
    expect(() =>
      // @ts-expect-error intentional bad input
      runSimulation({ successRate: 'high', onEvent: () => {} }),
    ).toThrow(RangeError);
  });

  it('rejects a non-positive maxAttempts', () => {
    expect(() =>
      runSimulation({ successRate: 1, maxAttempts: 0, onEvent: () => {} }),
    ).toThrow(RangeError);
  });

  it('successRate=1.0 delivers on the first attempt', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const promise = runSimulation({
      successRate: 1.0,
      random: rngReturning(0.0), // 0 < 1 => always succeed
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    const terminal = await promise;

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('delivered');
    expect(events[0].attempt).toBe(1);
    expect(events[0].httpStatusCode).toBe(200);
    expect(terminal.status).toBe('delivered');
  });

  it('successRate=0.0 exhausts all retries', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const promise = runSimulation({
      successRate: 0.0,
      random: rngReturning(0.999), // 0.999 < 0 is false => always fail
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    const terminal = await promise;

    // One event per attempt, all but the last `failed`, the last `exhausted`.
    expect(events).toHaveLength(DEFAULT_MAX_ATTEMPTS);
    const statuses = events.map((e) => e.status);
    expect(statuses.slice(0, -1).every((s) => s === 'failed')).toBe(true);
    expect(statuses[statuses.length - 1]).toBe('exhausted');
    expect(terminal.status).toBe('exhausted');
    expect(terminal.attempt).toBe(DEFAULT_MAX_ATTEMPTS);
  });

  it('emits intermediate failed events before eventual delivery (mid-range)', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    // RNG sequence: fail, fail, then succeed. successRate 0.5 means
    // random() < 0.5 succeeds.
    const sequence = [0.9, 0.9, 0.1];
    let i = 0;
    const promise = runSimulation({
      successRate: 0.5,
      random: () => sequence[i++ % sequence.length],
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    const terminal = await promise;

    expect(events).toHaveLength(3);
    expect(events[0].status).toBe('failed');
    expect(events[1].status).toBe('failed');
    expect(events[2].status).toBe('delivered');
    expect(terminal.status).toBe('delivered');
    expect(terminal.attempt).toBe(3);
  });

  it('honours a configurable maxAttempts', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const promise = runSimulation({
      successRate: 0,
      maxAttempts: 3,
      random: rngReturning(0.999),
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    await promise;

    expect(events).toHaveLength(3);
    expect(events[events.length - 1].status).toBe('exhausted');
  });

  it('emits events conforming to the shared DeliveryEvent shape', async () => {
    const events: DeliveryEvent[] = [];
    const clock = makeFakeClock();
    const promise = runSimulation({
      successRate: 1,
      webhookId: 'wh-123',
      eventType: 'refund.issued',
      random: rngReturning(0),
      clock,
      onEvent: (e) => events.push(e),
    });
    clock.flush();
    await promise;

    const event = events[0];
    expect(Object.keys(event).sort()).toEqual(
      [
        'attempt',
        'eventType',
        'httpStatusCode',
        'responseBodyExcerpt',
        'status',
        'timestamp',
        'webhookId',
      ].sort(),
    );
    expect(event.webhookId).toBe('wh-123');
    expect(event.eventType).toBe('refund.issued');
    expect(typeof event.timestamp).toBe('string');
    expect(() => new Date(event.timestamp).toISOString()).not.toThrow();
    expect(typeof event.responseBodyExcerpt).toBe('string');
  });

  it('uses the spec exponential back-off retry schedule', () => {
    expect(RETRY_SCHEDULE_MS).toEqual([
      0,
      60_000,
      5 * 60_000,
      30 * 60_000,
      2 * 60 * 60_000,
      8 * 60 * 60_000,
    ]);
    expect(DEFAULT_MAX_ATTEMPTS).toBe(6);
  });

  it('makes no real network requests during execution', async () => {
    const fetchSpy = vi.fn();
    const originalFetch = globalThis.fetch;
    // @ts-expect-error override for assertion
    globalThis.fetch = fetchSpy;
    try {
      const clock = makeFakeClock();
      const promise = runSimulation({
        successRate: 0,
        random: rngReturning(0.999),
        clock,
        onEvent: () => {},
      });
      clock.flush();
      await promise;
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('isSimulatorEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is false when the flag is unset', () => {
    vi.stubEnv('VITE_USE_SIMULATOR', '');
    expect(isSimulatorEnabled()).toBe(false);
  });

  it('is true when VITE_USE_SIMULATOR=true', () => {
    vi.stubEnv('VITE_USE_SIMULATOR', 'true');
    expect(isSimulatorEnabled()).toBe(true);
  });
});

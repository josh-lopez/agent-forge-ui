// Pure, side-effect-free metrics calculation module — the single source of
// truth for every number the metrics dashboard renders.
//
// All functions take a flat array of DeliveryEvent attempts and return plain
// data. Keeping calculation separate from the DOM component makes the maths
// unit-testable in isolation (see tests/metrics.test.ts) and lets the component
// stay a thin, reactive view.

import { DeliveryEvent, toEpochMillis } from './delivery-events';

/** Time-to-delivery statistics in milliseconds. `null` when not computable. */
export interface TimeToDeliveryStats {
  /** Median time-to-delivery (ms), or null when there are no delivered webhooks. */
  medianMs: number | null;
  /** 95th-percentile time-to-delivery (ms), or null when there are no delivered webhooks. */
  p95Ms: number | null;
  /** Number of webhooks that reached `delivered` and contributed a sample. */
  sampleCount: number;
}

/** Metrics for a single event type (or the overall aggregate). */
export interface MetricsSummary {
  /** Event type these metrics describe; `null`/'__all__' for the aggregate. */
  eventType: string | null;
  /** Total number of delivery *attempts*. */
  totalAttempts: number;
  /** Number of attempts that reached `delivered`. */
  deliveredAttempts: number;
  /**
   * Delivery success rate as a fraction 0..1 (delivered attempts / total
   * attempts). `null` when there are zero attempts (avoids NaN / div-by-zero).
   */
  successRate: number | null;
  /** Number of distinct webhooks observed. */
  webhookCount: number;
  /**
   * Mean number of *retry* attempts per webhook. A webhook delivered/failed on
   * its first attempt has 0 retries. `null` when there are no webhooks.
   */
  averageRetryCount: number | null;
  /** Time-to-delivery stats for webhooks that eventually delivered. */
  timeToDelivery: TimeToDeliveryStats;
}

/** The full dashboard payload: overall aggregate plus a per-event-type list. */
export interface MetricsReport {
  overall: MetricsSummary;
  byEventType: MetricsSummary[];
}

const EMPTY_TTD: TimeToDeliveryStats = { medianMs: null, p95Ms: null, sampleCount: 0 };

/**
 * Nearest-rank percentile over a sorted ascending array of numbers.
 *
 * @param sorted ascending-sorted samples (must be sorted by the caller)
 * @param p percentile in 0..100
 * @returns the percentile value, or null when there are no samples
 *
 * Uses the nearest-rank method: rank = ceil(p/100 * n), clamped to [1, n].
 * This is well-defined for small/skewed datasets and avoids the off-by-one
 * errors common in interpolated implementations. For a single sample it always
 * returns that sample (for any percentile).
 */
export function percentile(sorted: number[], p: number): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  if (n === 1) return sorted[0];
  const clampedP = Math.min(100, Math.max(0, p));
  const rank = Math.ceil((clampedP / 100) * n);
  const index = Math.min(n - 1, Math.max(0, rank - 1));
  return sorted[index];
}

/** Convenience: median (50th percentile) over an unsorted array. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // Use the standard average-of-two-middles median for even counts so the
  // result matches what merchants intuitively expect.
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function groupByWebhook(events: DeliveryEvent[]): Map<string, DeliveryEvent[]> {
  const groups = new Map<string, DeliveryEvent[]>();
  for (const ev of events) {
    const list = groups.get(ev.webhookId);
    if (list) list.push(ev);
    else groups.set(ev.webhookId, [ev]);
  }
  return groups;
}

/**
 * Computes time-to-delivery samples (ms) per webhook: the elapsed time from a
 * webhook's *initial* attempt to its *first* successful delivery. Webhooks that
 * never delivered contribute no sample.
 */
function timeToDeliverySamples(events: DeliveryEvent[]): number[] {
  const samples: number[] = [];
  for (const attempts of groupByWebhook(events).values()) {
    // Earliest attempt timestamp = initial attempt.
    let firstMs = Infinity;
    let firstDeliveredMs = Infinity;
    for (const a of attempts) {
      const ms = toEpochMillis(a.timestamp);
      if (Number.isNaN(ms)) continue;
      if (ms < firstMs) firstMs = ms;
      if (a.status === 'delivered' && ms < firstDeliveredMs) firstDeliveredMs = ms;
    }
    if (firstMs !== Infinity && firstDeliveredMs !== Infinity) {
      const delta = firstDeliveredMs - firstMs;
      samples.push(delta < 0 ? 0 : delta);
    }
  }
  return samples;
}

/** Average retries per webhook: (total attempts - webhook count) / webhook count. */
function averageRetryCount(events: DeliveryEvent[]): number | null {
  const groups = groupByWebhook(events);
  const webhookCount = groups.size;
  if (webhookCount === 0) return null;
  let totalAttempts = 0;
  for (const attempts of groups.values()) {
    // Prefer the max declared attempt number if present; otherwise count rows.
    let maxAttempt = 0;
    for (const a of attempts) {
      if (typeof a.attempt === 'number' && a.attempt > maxAttempt) maxAttempt = a.attempt;
    }
    totalAttempts += maxAttempt > 0 ? maxAttempt : attempts.length;
  }
  const totalRetries = totalAttempts - webhookCount;
  return totalRetries / webhookCount;
}

/** Computes a full MetricsSummary for an arbitrary list of attempts. */
function summarise(eventType: string | null, events: DeliveryEvent[]): MetricsSummary {
  const totalAttempts = events.length;
  const deliveredAttempts = events.filter((e) => e.status === 'delivered').length;
  const successRate = totalAttempts === 0 ? null : deliveredAttempts / totalAttempts;

  const webhookCount = groupByWebhook(events).size;

  const ttdSamples = timeToDeliverySamples(events).sort((a, b) => a - b);
  const timeToDelivery: TimeToDeliveryStats = ttdSamples.length === 0
    ? { ...EMPTY_TTD }
    : {
        medianMs: median(ttdSamples),
        p95Ms: percentile(ttdSamples, 95),
        sampleCount: ttdSamples.length,
      };

  return {
    eventType,
    totalAttempts,
    deliveredAttempts,
    successRate,
    webhookCount,
    averageRetryCount: averageRetryCount(events),
    timeToDelivery,
  };
}

/**
 * Calculates the full metrics report (overall aggregate + per-event-type
 * breakdown) for a set of delivery-event attempts. Pure: same input → same
 * output, no mutation of the input array.
 */
export function calculateMetrics(events: DeliveryEvent[]): MetricsReport {
  const overall = summarise(null, events);

  const byType = new Map<string, DeliveryEvent[]>();
  for (const ev of events) {
    const list = byType.get(ev.eventType);
    if (list) list.push(ev);
    else byType.set(ev.eventType, [ev]);
  }

  const byEventType = [...byType.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, list]) => summarise(type, list));

  return { overall, byEventType };
}

// ── Formatting helpers (used by the dashboard view) ──────────────────────────

/** Formats a 0..1 success rate as a percentage string, e.g. "92.5%" / "—". */
export function formatSuccessRate(rate: number | null): string {
  if (rate === null) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

/** Formats an average retry count, e.g. "1.50" / "—". */
export function formatRetryCount(count: number | null): string {
  if (count === null) return '—';
  return count.toFixed(2);
}

/** Formats a duration in ms as a human-readable string, e.g. "1.2 s" / "—". */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

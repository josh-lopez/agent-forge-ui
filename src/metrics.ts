// Webhook delivery metrics calculation module.
//
// This module is the single source of truth for the aggregate statistics
// surfaced by the MetricsDashboard component. It is entirely client-side and
// makes no network calls — it operates purely on an array of delivery events
// (the same shape produced by the webhook delivery simulator and the real
// delivery mechanism).
//
// A "delivery event" describes the outcome of attempting to deliver a single
// webhook. Each event records:
//   - status:           final outcome of the webhook ("delivered" | "failed" |
//                        "exhausted" | "pending").
//   - attempts:         total number of delivery attempts made (>= 1 once the
//                        first attempt has been made).
//   - timeToDeliveryMs: wall-clock time, in milliseconds, between the first
//                        attempt and a successful delivery. Only meaningful
//                        for delivered events; may be undefined otherwise.
//   - timestamp:        ISO timestamp of the (most recent) attempt.
//   - httpStatus:       HTTP status code of the most recent attempt.
//   - responseBody:     excerpt of the most recent response body.
//
// Only `status`, `attempts`, and `timeToDeliveryMs` are required for the
// aggregate calculations below; the remaining fields are part of the shared
// event shape used elsewhere in the UI.

export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'exhausted';

export interface DeliveryEvent {
  status: DeliveryStatus;
  /** Total number of delivery attempts made for this webhook. */
  attempts: number;
  /** Time from first attempt to successful delivery, in milliseconds. */
  timeToDeliveryMs?: number;
  /** ISO timestamp of the most recent attempt. */
  timestamp?: string;
  /** HTTP status code of the most recent attempt. */
  httpStatus?: number;
  /** Excerpt of the most recent response body. */
  responseBody?: string;
}

export interface DeliveryMetrics {
  /** Number of events considered in the aggregate. */
  totalEvents: number;
  /** Number of successfully delivered events. */
  deliveredCount: number;
  /** Fraction of events delivered successfully, in the range [0, 1]. */
  successRate: number;
  /** Mean number of retries (attempts beyond the first) per webhook. */
  averageRetryCount: number;
  /** Median time-to-delivery across delivered events, in milliseconds. */
  medianTimeToDeliveryMs: number;
  /** 95th-percentile time-to-delivery across delivered events, in ms. */
  p95TimeToDeliveryMs: number;
}

/** A zeroed metrics object, used as the empty/zero state. */
export const EMPTY_METRICS: DeliveryMetrics = {
  totalEvents: 0,
  deliveredCount: 0,
  successRate: 0,
  averageRetryCount: 0,
  medianTimeToDeliveryMs: 0,
  p95TimeToDeliveryMs: 0,
};

/**
 * Compute the percentile of a sorted (ascending) numeric array using linear
 * interpolation between closest ranks. Returns 0 for an empty array.
 *
 * @param sorted  values sorted ascending
 * @param p       percentile in the range [0, 1] (e.g. 0.5 for median)
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = p * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Calculate aggregate delivery metrics from an array of delivery events.
 *
 * The calculation is pure and deterministic: identical input always produces
 * identical output, which is what makes the dashboard's reactive binding
 * predictable and testable.
 */
export function calculateMetrics(events: readonly DeliveryEvent[]): DeliveryMetrics {
  if (!events || events.length === 0) {
    return { ...EMPTY_METRICS };
  }

  const totalEvents = events.length;

  const deliveredCount = events.filter((e) => e.status === 'delivered').length;
  const successRate = deliveredCount / totalEvents;

  // Retries = attempts beyond the first. An event with a single attempt has
  // zero retries. Missing/invalid attempt counts are treated as one attempt.
  const totalRetries = events.reduce((sum, e) => {
    const attempts = Number.isFinite(e.attempts) && e.attempts > 0 ? e.attempts : 1;
    return sum + (attempts - 1);
  }, 0);
  const averageRetryCount = totalRetries / totalEvents;

  // Time-to-delivery is only defined for delivered events with a numeric value.
  const deliveryTimes = events
    .filter((e) => e.status === 'delivered' && Number.isFinite(e.timeToDeliveryMs))
    .map((e) => e.timeToDeliveryMs as number)
    .sort((a, b) => a - b);

  const medianTimeToDeliveryMs = percentile(deliveryTimes, 0.5);
  const p95TimeToDeliveryMs = percentile(deliveryTimes, 0.95);

  return {
    totalEvents,
    deliveredCount,
    successRate,
    averageRetryCount,
    medianTimeToDeliveryMs,
    p95TimeToDeliveryMs,
  };
}

// ── Display formatting helpers ───────────────────────────────────────────────
// These produce the human-readable strings rendered by the dashboard. Keeping
// them alongside the calculation guarantees the rendered values are derived
// from the same numbers the metrics module reports.

/** Format a success rate (0–1 fraction) as a percentage string, e.g. "94.2 %". */
export function formatSuccessRate(rate: number): string {
  return `${(rate * 100).toFixed(1)} %`;
}

/** Format an average retry count, e.g. "1.3 retries / webhook". */
export function formatAverageRetryCount(count: number): string {
  const unit = 'retries / webhook';
  return `${count.toFixed(1)} ${unit}`;
}

/** Format a millisecond duration as a compact seconds string, e.g. "4 s". */
export function formatDurationMs(ms: number): string {
  const seconds = ms / 1000;
  // Use whole seconds for clean values, one decimal otherwise.
  const rounded = Math.round(seconds * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} s`;
}

/** Format the median + p95 pair, e.g. "median 4 s · p95 38 s". */
export function formatTimeToDelivery(medianMs: number, p95Ms: number): string {
  return `median ${formatDurationMs(medianMs)} · p95 ${formatDurationMs(p95Ms)}`;
}

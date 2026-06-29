/**
 * Metrics calculation module for the webhook delivery dashboard.
 *
 * Provides pure, side-effect-free functions that compute aggregate delivery
 * metrics from a list of DeliveryEvent records. All functions are intentionally
 * decoupled from any UI framework so they can be unit-tested without a DOM
 * environment.
 *
 * Spec ref: spec § "Webhook delivery metrics dashboard"
 */

import type { DeliveryEvent } from './deliveryEvent.js';

// ── Aggregate success rate ────────────────────────────────────────────────────

/**
 * Calculate the aggregate delivery success rate across all event types.
 *
 * Success rate = (number of attempts with status `delivered`) /
 *               (total number of attempts) × 100
 *
 * @param events - The full list of delivery events to analyse.
 * @returns A number in the range [0, 100] representing the percentage of
 *          attempts that reached `delivered` status, or `null` when there are
 *          zero attempts (to distinguish "no data" from "0% success").
 */
export function calculateSuccessRate(events: DeliveryEvent[]): number | null {
  if (events.length === 0) {
    // Guard against division by zero; return null to signal "no data".
    return null;
  }
  const deliveredCount = events.filter((e) => e.status === 'delivered').length;
  return (deliveredCount / events.length) * 100;
}

/**
 * Format a success-rate value for display.
 *
 * @param rate - The value returned by `calculateSuccessRate`.
 * @returns A human-readable string: '—' for null (no data), otherwise the
 *          percentage rounded to one decimal place (e.g. '66.7%').
 */
export function formatSuccessRate(rate: number | null): string {
  if (rate === null) {
    return '—';
  }
  // Round to one decimal place; avoid '-0.0%' for floating-point edge cases.
  const rounded = Math.round(rate * 10) / 10;
  return `${rounded}%`;
}

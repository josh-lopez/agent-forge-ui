/**
 * Unit tests for Issue #269: Immediate-filtering behaviour of the date-range filter.
 *
 * Spec ref: spec § "Event log filtering — Date-range filter"
 *   "Immediate filtering: selecting a range immediately (or on 'Apply') hides
 *    log entries whose attempt timestamp falls outside the selected start and
 *    end date-times; boundary entries (exactly equal to start or end) are
 *    included."
 *
 * Acceptance criteria covered:
 *   AC1 – entries strictly before start are hidden when a date range is applied
 *   AC2 – entries strictly after end are hidden when a date range is applied
 *   AC3 – entries whose timestamp exactly equals start are included (not hidden)
 *   AC4 – entries whose timestamp exactly equals end are included (not hidden)
 *   AC5 – filtering takes effect immediately upon range selection (onChange
 *          fires on input change, no additional user action required)
 *
 * All fixture timestamps are unambiguous UTC ISO-8601 strings to avoid
 * timezone/locale comparison issues.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  filterByDateRange,
  renderDateRangeFilterInputs,
  type DateRange,
} from '../src/dateRangeFilter';

// ── Fixture helpers ───────────────────────────────────────────────────────────

/** Build a minimal log entry with the given ISO timestamp. */
function entry(id: number, timestamp: string, eventType = 'payment.created', status = 'delivered') {
  return { id, timestamp, eventType, status };
}

/**
 * Representative fixture dataset with entries spread across a known time range.
 * All timestamps are UTC to avoid locale-dependent comparison issues.
 *
 * Timeline (ascending):
 *   id=1  2024-06-01T08:00:00.000Z  — well before the mid-range boundary
 *   id=2  2024-06-15T00:00:00.000Z  — exact start boundary in many tests
 *   id=3  2024-06-20T12:30:00.000Z  — inside the range
 *   id=4  2024-06-30T23:59:59.000Z  — exact end boundary in many tests
 *   id=5  2024-07-01T00:00:00.001Z  — 1 ms after the end boundary
 *   id=6  2024-07-15T10:00:00.000Z  — well after the end boundary
 */
const FIXTURE = [
  entry(1, '2024-06-01T08:00:00.000Z', 'payment.created', 'delivered'),
  entry(2, '2024-06-15T00:00:00.000Z', 'refund.issued',   'failed'),
  entry(3, '2024-06-20T12:30:00.000Z', 'payment.created', 'delivered'),
  entry(4, '2024-06-30T23:59:59.000Z', 'dispute.opened',  'pending'),
  entry(5, '2024-07-01T00:00:00.001Z', 'refund.issued',   'exhausted'),
  entry(6, '2024-07-15T10:00:00.000Z', 'payment.created', 'delivered'),
];

// Shared range used across AC1–AC4 tests.
const RANGE_START = '2024-06-15T00:00:00.000Z'; // matches entry id=2 exactly
const RANGE_END   = '2024-06-30T23:59:59.000Z'; // matches entry id=4 exactly

// ── AC1: entries strictly before start are hidden ─────────────────────────────

describe('AC1 – entries strictly before start are hidden', () => {
  it('hides a single entry whose timestamp is strictly before start', () => {
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    const result = filterByDateRange(FIXTURE, range);
    // entry id=1 (2024-06-01) is before RANGE_START (2024-06-15) — must be absent.
    expect(result.some((e) => e.id === 1)).toBe(false);
  });

  it('hides all entries that fall strictly before start', () => {
    const range: DateRange = { start: '2024-06-20T00:00:00.000Z' };
    const result = filterByDateRange(FIXTURE, range);
    // Entries 1 (Jun 1) and 2 (Jun 15) are before Jun 20 — both must be absent.
    expect(result.some((e) => e.id === 1)).toBe(false);
    expect(result.some((e) => e.id === 2)).toBe(false);
  });

  it('hides an entry that is 1 ms before start', () => {
    const startMs = new Date(RANGE_START).getTime();
    const oneBeforeStart = new Date(startMs - 1).toISOString();
    const entries = [
      entry(10, oneBeforeStart),
      entry(11, RANGE_START), // exactly at start — should be included
    ];
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    const result = filterByDateRange(entries, range);
    expect(result.some((e) => e.id === 10)).toBe(false);
    expect(result.some((e) => e.id === 11)).toBe(true);
  });

  it('returns no entries when all entries are strictly before start', () => {
    const range: DateRange = { start: '2025-01-01T00:00:00.000Z' };
    const result = filterByDateRange(FIXTURE, range);
    expect(result).toHaveLength(0);
  });

  it('shows entries that are on or after start when only start is set', () => {
    const range: DateRange = { start: RANGE_START };
    const result = filterByDateRange(FIXTURE, range);
    // Entries 2–6 are on or after RANGE_START; entry 1 is before.
    expect(result.some((e) => e.id === 1)).toBe(false);
    expect(result.length).toBe(5);
    expect(result.map((e) => e.id)).toEqual([2, 3, 4, 5, 6]);
  });
});

// ── AC2: entries strictly after end are hidden ────────────────────────────────

describe('AC2 – entries strictly after end are hidden', () => {
  it('hides a single entry whose timestamp is strictly after end', () => {
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    const result = filterByDateRange(FIXTURE, range);
    // entry id=5 (2024-07-01T00:00:00.001Z) is 1 ms after RANGE_END — must be absent.
    expect(result.some((e) => e.id === 5)).toBe(false);
    // entry id=6 (2024-07-15) is well after RANGE_END — must be absent.
    expect(result.some((e) => e.id === 6)).toBe(false);
  });

  it('hides all entries that fall strictly after end', () => {
    const range: DateRange = { end: '2024-06-20T12:30:00.000Z' };
    const result = filterByDateRange(FIXTURE, range);
    // Entries 4 (Jun 30), 5 (Jul 1), 6 (Jul 15) are after Jun 20 12:30 — all absent.
    expect(result.some((e) => e.id === 4)).toBe(false);
    expect(result.some((e) => e.id === 5)).toBe(false);
    expect(result.some((e) => e.id === 6)).toBe(false);
  });

  it('hides an entry that is 1 ms after end', () => {
    const endMs = new Date(RANGE_END).getTime();
    const oneAfterEnd = new Date(endMs + 1).toISOString();
    const entries = [
      entry(20, RANGE_END),    // exactly at end — should be included
      entry(21, oneAfterEnd),  // 1 ms after end — should be hidden
    ];
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    const result = filterByDateRange(entries, range);
    expect(result.some((e) => e.id === 20)).toBe(true);
    expect(result.some((e) => e.id === 21)).toBe(false);
  });

  it('returns no entries when all entries are strictly after end', () => {
    const range: DateRange = { end: '2023-01-01T00:00:00.000Z' };
    const result = filterByDateRange(FIXTURE, range);
    expect(result).toHaveLength(0);
  });

  it('shows entries that are on or before end when only end is set', () => {
    const range: DateRange = { end: RANGE_END };
    const result = filterByDateRange(FIXTURE, range);
    // Entries 1–4 are on or before RANGE_END; entries 5 and 6 are after.
    expect(result.some((e) => e.id === 5)).toBe(false);
    expect(result.some((e) => e.id === 6)).toBe(false);
    expect(result.length).toBe(4);
    expect(result.map((e) => e.id)).toEqual([1, 2, 3, 4]);
  });
});

// ── AC3: entries exactly equal to start are included ─────────────────────────

describe('AC3 – entries whose timestamp exactly equals start are included', () => {
  it('includes an entry whose timestamp is exactly equal to start', () => {
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    const result = filterByDateRange(FIXTURE, range);
    // entry id=2 has timestamp === RANGE_START — must be present.
    expect(result.some((e) => e.id === 2)).toBe(true);
  });

  it('includes the start-boundary entry when start === end (single-point range)', () => {
    const ts = '2024-06-20T12:30:00.000Z'; // matches entry id=3
    const range: DateRange = { start: ts, end: ts };
    const result = filterByDateRange(FIXTURE, range);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });

  it('includes the start-boundary entry when only start is set', () => {
    const range: DateRange = { start: RANGE_START };
    const result = filterByDateRange(FIXTURE, range);
    // entry id=2 has timestamp === RANGE_START — must be present.
    expect(result.some((e) => e.id === 2)).toBe(true);
  });

  it('includes start-boundary entry while excluding the entry 1 ms before it', () => {
    const startMs = new Date(RANGE_START).getTime();
    const justBefore = new Date(startMs - 1).toISOString();
    const entries = [
      entry(30, justBefore),   // 1 ms before start — excluded
      entry(31, RANGE_START),  // exactly at start — included
    ];
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    const result = filterByDateRange(entries, range);
    expect(result.map((e) => e.id)).toEqual([31]);
  });

  it('includes multiple entries all sharing the exact start timestamp', () => {
    const entries = [
      entry(40, RANGE_START, 'payment.created', 'delivered'),
      entry(41, RANGE_START, 'refund.issued',   'failed'),
    ];
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    const result = filterByDateRange(entries, range);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([40, 41]);
  });
});

// ── AC4: entries exactly equal to end are included ───────────────────────────

describe('AC4 – entries whose timestamp exactly equals end are included', () => {
  it('includes an entry whose timestamp is exactly equal to end', () => {
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    const result = filterByDateRange(FIXTURE, range);
    // entry id=4 has timestamp === RANGE_END — must be present.
    expect(result.some((e) => e.id === 4)).toBe(true);
  });

  it('includes the end-boundary entry when start === end (single-point range)', () => {
    const ts = '2024-06-20T12:30:00.000Z'; // matches entry id=3
    const range: DateRange = { start: ts, end: ts };
    const result = filterByDateRange(FIXTURE, range);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });

  it('includes the end-boundary entry when only end is set', () => {
    const range: DateRange = { end: RANGE_END };
    const result = filterByDateRange(FIXTURE, range);
    // entry id=4 has timestamp === RANGE_END — must be present.
    expect(result.some((e) => e.id === 4)).toBe(true);
  });

  it('includes end-boundary entry while excluding the entry 1 ms after it', () => {
    const endMs = new Date(RANGE_END).getTime();
    const justAfter = new Date(endMs + 1).toISOString();
    const entries = [
      entry(50, RANGE_END),  // exactly at end — included
      entry(51, justAfter),  // 1 ms after end — excluded
    ];
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    const result = filterByDateRange(entries, range);
    expect(result.map((e) => e.id)).toEqual([50]);
  });

  it('includes multiple entries all sharing the exact end timestamp', () => {
    const entries = [
      entry(60, RANGE_END, 'payment.created', 'delivered'),
      entry(61, RANGE_END, 'dispute.opened',  'pending'),
    ];
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    const result = filterByDateRange(entries, range);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([60, 61]);
  });
});

// ── AC5: filtering takes effect immediately upon range selection ──────────────
//
// The spec allows "immediately (or on 'Apply')". The implementation uses
// `renderDateRangeFilterInputs` which fires `onChange` on every `change` event
// on the start/end inputs — no separate "Apply" button is required.
//
// These tests verify that:
//   (a) onChange is called as soon as the input value changes (no extra action),
//   (b) the range passed to onChange is immediately usable to filter entries
//       (i.e. the caller can apply filterByDateRange right away and get the
//       correct result without any additional step).
//
// Note on datetime-local input values in jsdom:
//   The HTML `datetime-local` input type requires values in the format
//   "YYYY-MM-DDTHH:MM" or "YYYY-MM-DDTHH:MM:SS" (no timezone suffix).
//   jsdom sanitizes values with a trailing "Z" to an empty string.
//   Therefore, input values in these tests use the datetime-local format
//   (no "Z"), while fixture timestamps remain full UTC ISO-8601 strings.
//   `toEpochMillis` parses both formats to the same epoch milliseconds in
//   the UTC test environment, so filtering results are consistent.

/** datetime-local format of RANGE_START (no timezone suffix, for input.value). */
const RANGE_START_LOCAL = '2024-06-15T00:00:00';
/** datetime-local format of RANGE_END (no timezone suffix, for input.value). */
const RANGE_END_LOCAL   = '2024-06-30T23:59:59';

describe('AC5 – filtering takes effect immediately upon range selection', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('onChange is called immediately when the start input changes (no Apply needed)', () => {
    const onChange = vi.fn();
    renderDateRangeFilterInputs(container, { range: {}, onChange });

    const startInput = container.querySelector<HTMLInputElement>('[data-date-range-start]');
    expect(startInput).not.toBeNull();

    startInput!.value = RANGE_START_LOCAL;
    startInput!.dispatchEvent(new Event('change'));

    // onChange must have been called exactly once — no additional user action.
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('onChange is called immediately when the end input changes (no Apply needed)', () => {
    const onChange = vi.fn();
    renderDateRangeFilterInputs(container, { range: {}, onChange });

    const endInput = container.querySelector<HTMLInputElement>('[data-date-range-end]');
    expect(endInput).not.toBeNull();

    endInput!.value = RANGE_END_LOCAL;
    endInput!.dispatchEvent(new Event('change'));

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('the range passed to onChange immediately hides entries before start', () => {
    let capturedRange: DateRange = {};
    const onChange = vi.fn((r: DateRange) => { capturedRange = r; });

    renderDateRangeFilterInputs(container, { range: {}, onChange });

    const startInput = container.querySelector<HTMLInputElement>('[data-date-range-start]');
    startInput!.value = RANGE_START_LOCAL;
    startInput!.dispatchEvent(new Event('change'));

    // Verify onChange was called and captured a non-empty range.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(capturedRange.start).toBeTruthy();

    // Apply the range received by onChange immediately — no extra step.
    const result = filterByDateRange(FIXTURE, capturedRange);
    // entry id=1 (2024-06-01) is before RANGE_START — must be absent.
    expect(result.some((e) => e.id === 1)).toBe(false);
  });

  it('the range passed to onChange immediately hides entries after end', () => {
    let capturedRange: DateRange = {};
    const onChange = vi.fn((r: DateRange) => { capturedRange = r; });

    renderDateRangeFilterInputs(container, { range: {}, onChange });

    const endInput = container.querySelector<HTMLInputElement>('[data-date-range-end]');
    endInput!.value = RANGE_END_LOCAL;
    endInput!.dispatchEvent(new Event('change'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(capturedRange.end).toBeTruthy();

    const result = filterByDateRange(FIXTURE, capturedRange);
    // Entries 5 and 6 are after RANGE_END — must be absent.
    expect(result.some((e) => e.id === 5)).toBe(false);
    expect(result.some((e) => e.id === 6)).toBe(false);
  });

  it('the range passed to onChange immediately includes the start-boundary entry', () => {
    let capturedRange: DateRange = {};
    const onChange = vi.fn((r: DateRange) => { capturedRange = r; });

    renderDateRangeFilterInputs(container, { range: {}, onChange });

    const startInput = container.querySelector<HTMLInputElement>('[data-date-range-start]');
    startInput!.value = RANGE_START_LOCAL;
    startInput!.dispatchEvent(new Event('change'));

    expect(capturedRange.start).toBeTruthy();

    // The start-boundary entry (id=2, timestamp 2024-06-15T00:00:00.000Z)
    // must be included when the range starts at 2024-06-15T00:00:00.
    const result = filterByDateRange(FIXTURE, capturedRange);
    expect(result.some((e) => e.id === 2)).toBe(true);
  });

  it('the range passed to onChange immediately includes the end-boundary entry', () => {
    let capturedRange: DateRange = {};
    const onChange = vi.fn((r: DateRange) => { capturedRange = r; });

    renderDateRangeFilterInputs(container, { range: {}, onChange });

    const endInput = container.querySelector<HTMLInputElement>('[data-date-range-end]');
    endInput!.value = RANGE_END_LOCAL;
    endInput!.dispatchEvent(new Event('change'));

    expect(capturedRange.end).toBeTruthy();

    // The end-boundary entry (id=4, timestamp 2024-06-30T23:59:59.000Z)
    // must be included when the range ends at 2024-06-30T23:59:59.
    const result = filterByDateRange(FIXTURE, capturedRange);
    expect(result.some((e) => e.id === 4)).toBe(true);
  });

  it('setting both start and end immediately produces a fully filtered result', () => {
    // Simulate a user setting start first, then end.
    let currentRange: DateRange = {};
    const onChange = vi.fn((r: DateRange) => { currentRange = r; });

    renderDateRangeFilterInputs(container, { range: currentRange, onChange });

    // Step 1: user sets start — onChange fires immediately.
    const startInput = container.querySelector<HTMLInputElement>('[data-date-range-start]');
    startInput!.value = RANGE_START_LOCAL;
    startInput!.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledTimes(1);

    // Re-render with updated range so the end input closure sees the new start.
    renderDateRangeFilterInputs(container, { range: currentRange, onChange });

    // Step 2: user sets end — onChange fires immediately again.
    const endInput = container.querySelector<HTMLInputElement>('[data-date-range-end]');
    endInput!.value = RANGE_END_LOCAL;
    endInput!.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledTimes(2);

    // Apply the final range immediately — no extra action.
    const result = filterByDateRange(FIXTURE, currentRange);
    // Only entries 2, 3, 4 fall within [RANGE_START, RANGE_END].
    expect(result.map((e) => e.id)).toEqual([2, 3, 4]);
  });

  it('onChange fires once per input change event, not on subsequent unrelated actions', () => {
    const onChange = vi.fn();
    renderDateRangeFilterInputs(container, { range: {}, onChange });

    const startInput = container.querySelector<HTMLInputElement>('[data-date-range-start]');
    startInput!.value = RANGE_START_LOCAL;
    startInput!.dispatchEvent(new Event('change'));

    // Only one call so far.
    expect(onChange).toHaveBeenCalledTimes(1);

    // Dispatching a different event type (e.g. 'input') should NOT trigger onChange.
    startInput!.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

// ── Combined AC1–AC4 with full fixture ───────────────────────────────────────

describe('Combined: applying a range hides outside entries and includes boundary entries', () => {
  it('correctly partitions the fixture into inside, boundary, and outside groups', () => {
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    const result = filterByDateRange(FIXTURE, range);

    // Inside the range (ids 2, 3, 4):
    expect(result.some((e) => e.id === 2)).toBe(true);  // start boundary
    expect(result.some((e) => e.id === 3)).toBe(true);  // strictly inside
    expect(result.some((e) => e.id === 4)).toBe(true);  // end boundary

    // Outside the range (ids 1, 5, 6):
    expect(result.some((e) => e.id === 1)).toBe(false); // strictly before start
    expect(result.some((e) => e.id === 5)).toBe(false); // 1 ms after end
    expect(result.some((e) => e.id === 6)).toBe(false); // well after end

    expect(result).toHaveLength(3);
  });

  it('millisecond-precision: 1 ms before start is excluded, start itself is included', () => {
    const startMs = new Date(RANGE_START).getTime();
    const entries = [
      entry(70, new Date(startMs - 1).toISOString()), // excluded
      entry(71, RANGE_START),                          // included (start boundary)
    ];
    const result = filterByDateRange(entries, { start: RANGE_START, end: RANGE_END });
    expect(result.map((e) => e.id)).toEqual([71]);
  });

  it('millisecond-precision: end itself is included, 1 ms after end is excluded', () => {
    const endMs = new Date(RANGE_END).getTime();
    const entries = [
      entry(80, RANGE_END),                          // included (end boundary)
      entry(81, new Date(endMs + 1).toISOString()),  // excluded
    ];
    const result = filterByDateRange(entries, { start: RANGE_START, end: RANGE_END });
    expect(result.map((e) => e.id)).toEqual([80]);
  });
});

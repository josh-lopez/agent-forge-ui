/**
 * Supplemental acceptance-criterion verification tests for Issue #269:
 * Immediate-filtering behaviour of the date-range filter.
 *
 * Spec ref: spec § "Event log filtering — Date-range filter"
 *   "Immediate filtering: selecting a range immediately (or on 'Apply') hides
 *    log entries whose attempt timestamp falls outside the selected start and
 *    end date-times; boundary entries (exactly equal to start or end) are
 *    included."
 *
 * These tests complement tests/dateRangeFilter-immediate.test.ts with
 * additional edge-case and integration scenarios:
 *
 *   AC1 – entries strictly before start are hidden
 *   AC2 – entries strictly after end are hidden
 *   AC3 – entries whose timestamp exactly equals start are included
 *   AC4 – entries whose timestamp exactly equals end are included
 *   AC5 – filtering takes effect immediately upon range selection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  filterByDateRange,
  renderDateRangeFilterInputs,
  type DateRange,
} from '../src/dateRangeFilter';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function entry(
  id: number,
  timestamp: string,
  eventType = 'payment.created',
  status = 'delivered',
) {
  return { id, timestamp, eventType, status };
}

/**
 * Extended fixture with entries covering all four delivery statuses and
 * multiple event types, spread across a known UTC time range.
 *
 * Timeline (ascending):
 *   id=1  2024-01-01T00:00:00.000Z  — well before range
 *   id=2  2024-03-01T06:00:00.000Z  — exact start boundary
 *   id=3  2024-03-15T12:00:00.000Z  — inside range
 *   id=4  2024-04-01T00:00:00.000Z  — inside range
 *   id=5  2024-04-30T23:59:59.999Z  — exact end boundary
 *   id=6  2024-05-01T00:00:00.000Z  — 1 ms after end boundary
 *   id=7  2024-12-31T23:59:59.999Z  — well after range
 */
const FIXTURE = [
  entry(1, '2024-01-01T00:00:00.000Z', 'payment.created', 'delivered'),
  entry(2, '2024-03-01T06:00:00.000Z', 'refund.issued',   'failed'),
  entry(3, '2024-03-15T12:00:00.000Z', 'payment.created', 'delivered'),
  entry(4, '2024-04-01T00:00:00.000Z', 'dispute.opened',  'pending'),
  entry(5, '2024-04-30T23:59:59.999Z', 'refund.issued',   'exhausted'),
  entry(6, '2024-05-01T00:00:00.000Z', 'payment.created', 'delivered'),
  entry(7, '2024-12-31T23:59:59.999Z', 'dispute.opened',  'failed'),
];

const RANGE_START = '2024-03-01T06:00:00.000Z'; // matches entry id=2 exactly
const RANGE_END   = '2024-04-30T23:59:59.999Z'; // matches entry id=5 exactly

// ── AC1: entries strictly before start are hidden ─────────────────────────────

describe('AC1 (issue-269) – entries strictly before start are hidden', () => {
  it('hides every entry whose timestamp precedes the start boundary', () => {
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    const result = filterByDateRange(FIXTURE, range);
    // Only entry id=1 is before RANGE_START.
    expect(result.every((e) => new Date(e.timestamp) >= new Date(RANGE_START))).toBe(true);
    expect(result.some((e) => e.id === 1)).toBe(false);
  });

  it('hides entries before start regardless of their event type', () => {
    // entry id=1 is payment.created — event type must not affect exclusion.
    const range: DateRange = { start: RANGE_START };
    const result = filterByDateRange(FIXTURE, range);
    expect(result.some((e) => e.id === 1)).toBe(false);
  });

  it('hides entries before start regardless of their delivery status', () => {
    // entry id=1 has status=delivered — status must not affect exclusion.
    const range: DateRange = { start: RANGE_START };
    const result = filterByDateRange(FIXTURE, range);
    expect(result.some((e) => e.id === 1)).toBe(false);
  });

  it('returns an empty array when start is set beyond all entries', () => {
    const range: DateRange = { start: '2099-01-01T00:00:00.000Z' };
    expect(filterByDateRange(FIXTURE, range)).toHaveLength(0);
  });

  it('returns all entries when start is set before all entries', () => {
    const range: DateRange = { start: '2000-01-01T00:00:00.000Z' };
    expect(filterByDateRange(FIXTURE, range)).toHaveLength(FIXTURE.length);
  });
});

// ── AC2: entries strictly after end are hidden ────────────────────────────────

describe('AC2 (issue-269) – entries strictly after end are hidden', () => {
  it('hides every entry whose timestamp exceeds the end boundary', () => {
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    const result = filterByDateRange(FIXTURE, range);
    // Entries id=6 and id=7 are after RANGE_END.
    expect(result.some((e) => e.id === 6)).toBe(false);
    expect(result.some((e) => e.id === 7)).toBe(false);
  });

  it('hides entries after end regardless of their event type', () => {
    // entry id=6 is payment.created — event type must not affect exclusion.
    const range: DateRange = { end: RANGE_END };
    const result = filterByDateRange(FIXTURE, range);
    expect(result.some((e) => e.id === 6)).toBe(false);
  });

  it('hides entries after end regardless of their delivery status', () => {
    // entry id=7 has status=failed — status must not affect exclusion.
    const range: DateRange = { end: RANGE_END };
    const result = filterByDateRange(FIXTURE, range);
    expect(result.some((e) => e.id === 7)).toBe(false);
  });

  it('returns an empty array when end is set before all entries', () => {
    const range: DateRange = { end: '2000-01-01T00:00:00.000Z' };
    expect(filterByDateRange(FIXTURE, range)).toHaveLength(0);
  });

  it('returns all entries when end is set after all entries', () => {
    const range: DateRange = { end: '2099-12-31T23:59:59.999Z' };
    expect(filterByDateRange(FIXTURE, range)).toHaveLength(FIXTURE.length);
  });
});

// ── AC3: entries exactly equal to start are included ─────────────────────────

describe('AC3 (issue-269) – entries whose timestamp exactly equals start are included', () => {
  it('includes the start-boundary entry in the filtered result', () => {
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    const result = filterByDateRange(FIXTURE, range);
    // entry id=2 has timestamp === RANGE_START.
    expect(result.some((e) => e.id === 2)).toBe(true);
  });

  it('includes start-boundary entry even when it has a non-delivered status', () => {
    // entry id=2 has status=failed — boundary inclusion must not depend on status.
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    const result = filterByDateRange(FIXTURE, range);
    expect(result.some((e) => e.id === 2 && e.status === 'failed')).toBe(true);
  });

  it('includes start-boundary entry even when it has a non-default event type', () => {
    // entry id=2 has eventType=refund.issued.
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    const result = filterByDateRange(FIXTURE, range);
    expect(result.some((e) => e.id === 2 && e.eventType === 'refund.issued')).toBe(true);
  });

  it('start-boundary entry is included while the entry immediately before it is excluded', () => {
    const startMs = new Date(RANGE_START).getTime();
    const justBefore = new Date(startMs - 1).toISOString();
    const entries = [
      entry(100, justBefore,   'payment.created', 'delivered'),
      entry(101, RANGE_START,  'payment.created', 'delivered'),
    ];
    const result = filterByDateRange(entries, { start: RANGE_START, end: RANGE_END });
    expect(result.map((e) => e.id)).toEqual([101]);
  });
});

// ── AC4: entries exactly equal to end are included ───────────────────────────

describe('AC4 (issue-269) – entries whose timestamp exactly equals end are included', () => {
  it('includes the end-boundary entry in the filtered result', () => {
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    const result = filterByDateRange(FIXTURE, range);
    // entry id=5 has timestamp === RANGE_END.
    expect(result.some((e) => e.id === 5)).toBe(true);
  });

  it('includes end-boundary entry even when it has a non-delivered status', () => {
    // entry id=5 has status=exhausted.
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    const result = filterByDateRange(FIXTURE, range);
    expect(result.some((e) => e.id === 5 && e.status === 'exhausted')).toBe(true);
  });

  it('includes end-boundary entry even when it has a non-default event type', () => {
    // entry id=5 has eventType=refund.issued.
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    const result = filterByDateRange(FIXTURE, range);
    expect(result.some((e) => e.id === 5 && e.eventType === 'refund.issued')).toBe(true);
  });

  it('end-boundary entry is included while the entry immediately after it is excluded', () => {
    const endMs = new Date(RANGE_END).getTime();
    const justAfter = new Date(endMs + 1).toISOString();
    const entries = [
      entry(200, RANGE_END,  'payment.created', 'delivered'),
      entry(201, justAfter,  'payment.created', 'delivered'),
    ];
    const result = filterByDateRange(entries, { start: RANGE_START, end: RANGE_END });
    expect(result.map((e) => e.id)).toEqual([200]);
  });
});

// ── AC5: filtering takes effect immediately upon range selection ──────────────

describe('AC5 (issue-269) – filtering takes effect immediately upon range selection', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('onChange fires on the very first change event — no prior action required', () => {
    const onChange = vi.fn();
    renderDateRangeFilterInputs(container, { range: {}, onChange });

    const startInput = container.querySelector<HTMLInputElement>('[data-date-range-start]');
    expect(startInput).not.toBeNull();

    // Simulate the user selecting a start date — this is the ONLY action.
    startInput!.value = '2024-03-01T06:00:00';
    startInput!.dispatchEvent(new Event('change'));

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('onChange fires on the very first end-input change event — no prior action required', () => {
    const onChange = vi.fn();
    renderDateRangeFilterInputs(container, { range: {}, onChange });

    const endInput = container.querySelector<HTMLInputElement>('[data-date-range-end]');
    expect(endInput).not.toBeNull();

    endInput!.value = '2024-04-30T23:59:59';
    endInput!.dispatchEvent(new Event('change'));

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('the range delivered by onChange is immediately usable — no extra step needed', () => {
    let capturedRange: DateRange = {};
    renderDateRangeFilterInputs(container, {
      range: {},
      onChange: (r) => { capturedRange = r; },
    });

    const startInput = container.querySelector<HTMLInputElement>('[data-date-range-start]');
    startInput!.value = '2024-03-01T06:00:00';
    startInput!.dispatchEvent(new Event('change'));

    // Apply the range immediately — no additional step.
    const result = filterByDateRange(FIXTURE, capturedRange);

    // entry id=1 (Jan 1) must be absent; entries on/after start must be present.
    expect(result.some((e) => e.id === 1)).toBe(false);
    expect(result.some((e) => e.id === 2)).toBe(true); // start boundary
  });

  it('each subsequent input change fires onChange again immediately', () => {
    const onChange = vi.fn();
    renderDateRangeFilterInputs(container, { range: {}, onChange });

    const startInput = container.querySelector<HTMLInputElement>('[data-date-range-start]');
    const endInput   = container.querySelector<HTMLInputElement>('[data-date-range-end]');

    startInput!.value = '2024-03-01T06:00:00';
    startInput!.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledTimes(1);

    endInput!.value = '2024-04-30T23:59:59';
    endInput!.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('no "Apply" button is required — the inputs alone trigger filtering', () => {
    renderDateRangeFilterInputs(container, { range: {}, onChange: vi.fn() });
    // Confirm there is no "Apply" button in the rendered output.
    const buttons = container.querySelectorAll('button');
    // The inputs-only renderer should not include any button.
    expect(buttons).toHaveLength(0);
  });

  it('full end-to-end: setting start hides before-start entries immediately', () => {
    let capturedRange: DateRange = {};
    renderDateRangeFilterInputs(container, {
      range: {},
      onChange: (r) => { capturedRange = r; },
    });

    const startInput = container.querySelector<HTMLInputElement>('[data-date-range-start]');
    // Use a start that cuts off entries id=1 and id=2.
    startInput!.value = '2024-03-15T12:00:00';
    startInput!.dispatchEvent(new Event('change'));

    const result = filterByDateRange(FIXTURE, capturedRange);
    expect(result.some((e) => e.id === 1)).toBe(false);
    expect(result.some((e) => e.id === 2)).toBe(false);
    // Entries from id=3 onward should be present.
    expect(result.some((e) => e.id === 3)).toBe(true);
  });

  it('full end-to-end: setting end hides after-end entries immediately', () => {
    let capturedRange: DateRange = {};
    renderDateRangeFilterInputs(container, {
      range: {},
      onChange: (r) => { capturedRange = r; },
    });

    const endInput = container.querySelector<HTMLInputElement>('[data-date-range-end]');
    // Use an end that cuts off entries id=6 (2024-05-01) and id=7 (2024-12-31)
    // but includes entries up to id=4 (2024-04-01).
    // datetime-local format: "YYYY-MM-DDTHH:MM:SS" (no timezone suffix).
    endInput!.value = '2024-04-15T00:00:00';
    endInput!.dispatchEvent(new Event('change'));

    const result = filterByDateRange(FIXTURE, capturedRange);
    expect(result.some((e) => e.id === 6)).toBe(false);
    expect(result.some((e) => e.id === 7)).toBe(false);
    // Entries up to id=4 (2024-04-01) should be present.
    expect(result.some((e) => e.id === 4)).toBe(true);
  });
});

// ── Integration: full fixture partitioning ────────────────────────────────────

describe('Integration (issue-269) – full fixture partitioning with boundary entries', () => {
  it('correctly partitions the fixture into before, inside+boundary, and after groups', () => {
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    const result = filterByDateRange(FIXTURE, range);

    // Expected inside (including boundaries): ids 2, 3, 4, 5.
    expect(result.map((e) => e.id)).toEqual([2, 3, 4, 5]);

    // Before-start entries must be absent.
    expect(result.some((e) => e.id === 1)).toBe(false);

    // After-end entries must be absent.
    expect(result.some((e) => e.id === 6)).toBe(false);
    expect(result.some((e) => e.id === 7)).toBe(false);
  });

  it('empty entry list returns empty array regardless of range', () => {
    const range: DateRange = { start: RANGE_START, end: RANGE_END };
    expect(filterByDateRange([], range)).toHaveLength(0);
  });

  it('single entry at start boundary is the only result', () => {
    const entries = [entry(300, RANGE_START)];
    const result = filterByDateRange(entries, { start: RANGE_START, end: RANGE_END });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(300);
  });

  it('single entry at end boundary is the only result', () => {
    const entries = [entry(400, RANGE_END)];
    const result = filterByDateRange(entries, { start: RANGE_START, end: RANGE_END });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(400);
  });

  it('degenerate range (start === end) returns only entries at that exact timestamp', () => {
    const ts = '2024-03-15T12:00:00.000Z'; // matches entry id=3
    const result = filterByDateRange(FIXTURE, { start: ts, end: ts });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });
});

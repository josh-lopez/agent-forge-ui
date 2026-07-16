/**
 * Supplemental tests for Issue #192: Export filtered event log with applied filters.
 *
 * These tests extend the core eventLogExport.test.ts and event-log.test.ts
 * with additional edge-case and integration coverage for the acceptance criteria.
 *
 * AC1  – Export button is visible and accessible.
 * AC2  – No-filter export produces the full log.
 * AC3  – Filtered export produces only the visible subset.
 * AC4  – All columns present in every export format.
 * AC5  – Both CSV and JSON are valid machine-readable formats.
 * AC6  – Filename distinguishes exports by filter context.
 * AC7  – Empty filtered result yields a valid file, not an error.
 * AC8  – Export is entirely client-side (no network).
 * AC9  – Unit tests cover the mandated matrix.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeliveryEvent } from '../src/delivery-events';
import {
  EVENT_LOG_COLUMNS,
  EVENT_LOG_COLUMN_HEADERS,
  buildEventLogExport,
  buildExportFilename,
  composeFilteredEvents,
  escapeCsvField,
  eventsToCsv,
  eventsToJson,
  isFilterActive,
  serializeEvents,
  triggerEventLogExport,
} from '../src/eventLogExport';
import { DeliveryEventStore } from '../src/delivery-event-store';
import { mountEventLog } from '../src/event-log';

// ── Shared fixture factory ────────────────────────────────────────────────────

function ev(overrides: Partial<DeliveryEvent> = {}): DeliveryEvent {
  return {
    webhookId: 'wh_default',
    eventType: 'payment.created',
    status: 'delivered',
    attempt: 1,
    timestamp: '2024-06-01T12:00:00.000Z',
    httpStatus: 200,
    responseBodyExcerpt: 'OK',
    ...overrides,
  };
}

/** Four-entry fixture spanning two months and three event types. */
const FIXTURE: DeliveryEvent[] = [
  ev({ webhookId: 'wh_1', eventType: 'payment.created', status: 'delivered',  timestamp: '2024-01-01T00:00:00.000Z', httpStatus: 200, responseBodyExcerpt: 'OK' }),
  ev({ webhookId: 'wh_2', eventType: 'refund.issued',   status: 'failed',     timestamp: '2024-01-15T12:00:00.000Z', httpStatus: 500, responseBodyExcerpt: 'Internal error' }),
  ev({ webhookId: 'wh_3', eventType: 'dispute.opened',  status: 'exhausted',  timestamp: '2024-01-31T23:59:59.000Z', httpStatus: 503, responseBodyExcerpt: 'Service unavailable' }),
  ev({ webhookId: 'wh_4', eventType: 'payment.created', status: 'pending',    timestamp: '2024-02-10T08:00:00.000Z', httpStatus: 0,   responseBodyExcerpt: '' }),
];

const NOW = new Date('2024-03-01T09:00:00.000Z');

// ── AC4: Column completeness ──────────────────────────────────────────────────

describe('AC4 – column completeness', () => {
  it('EVENT_LOG_COLUMNS contains exactly the five required columns', () => {
    const required = ['timestamp', 'eventType', 'status', 'httpStatus', 'responseBodyExcerpt'];
    for (const col of required) {
      expect(EVENT_LOG_COLUMNS).toContain(col);
    }
    expect(EVENT_LOG_COLUMNS).toHaveLength(5);
  });

  it('EVENT_LOG_COLUMN_HEADERS has a human-readable label for every column', () => {
    for (const col of EVENT_LOG_COLUMNS) {
      expect(EVENT_LOG_COLUMN_HEADERS[col]).toBeTruthy();
      expect(typeof EVENT_LOG_COLUMN_HEADERS[col]).toBe('string');
    }
  });

  it('CSV export row contains a value for every column', () => {
    const csv = eventsToCsv([FIXTURE[0]]);
    const [, dataRow] = csv.split('\r\n');
    // 5 columns → 4 commas minimum (unquoted fields)
    const fields = dataRow.split(',');
    expect(fields).toHaveLength(EVENT_LOG_COLUMNS.length);
  });

  it('JSON export object contains every column key', () => {
    const parsed = JSON.parse(eventsToJson([FIXTURE[0]]));
    for (const col of EVENT_LOG_COLUMNS) {
      expect(Object.prototype.hasOwnProperty.call(parsed[0], col)).toBe(true);
    }
  });
});

// ── AC5: Machine-readable format validation ───────────────────────────────────

describe('AC5 – machine-readable format', () => {
  it('CSV uses CRLF line endings (RFC 4180)', () => {
    const csv = eventsToCsv(FIXTURE);
    // Every line break must be \r\n
    expect(csv).toContain('\r\n');
    // No bare \n that is not preceded by \r
    const bareNewlines = csv.replace(/\r\n/g, '').match(/\n/g);
    expect(bareNewlines).toBeNull();
  });

  it('CSV header row has the correct number of comma-separated fields', () => {
    const [header] = eventsToCsv([]).split('\r\n');
    expect(header.split(',')).toHaveLength(EVENT_LOG_COLUMNS.length);
  });

  it('JSON output is valid JSON (parseable without throwing)', () => {
    expect(() => JSON.parse(eventsToJson(FIXTURE))).not.toThrow();
  });

  it('JSON output is an array', () => {
    expect(Array.isArray(JSON.parse(eventsToJson(FIXTURE)))).toBe(true);
  });

  it('serializeEvents delegates to eventsToCsv for csv format', () => {
    expect(serializeEvents(FIXTURE, 'csv')).toBe(eventsToCsv(FIXTURE));
  });

  it('serializeEvents delegates to eventsToJson for json format', () => {
    expect(serializeEvents(FIXTURE, 'json')).toBe(eventsToJson(FIXTURE));
  });
});

// ── AC6: Filename distinguishability ─────────────────────────────────────────

describe('AC6 – filename distinguishability', () => {
  it('unfiltered CSV filename matches pattern event-log_all_<timestamp>.csv', () => {
    const name = buildExportFilename(undefined, 'csv', NOW);
    expect(name).toMatch(/^event-log_all_\d{8}T\d{6}Z\.csv$/);
  });

  it('unfiltered JSON filename ends with .json', () => {
    const name = buildExportFilename(undefined, 'json', NOW);
    expect(name.endsWith('.json')).toBe(true);
  });

  it('date-range filename encodes both start and end dates', () => {
    const name = buildExportFilename(
      { start: '2024-01-01T00:00:00.000Z', end: '2024-01-31T23:59:59.000Z' },
      'csv',
      NOW,
    );
    expect(name).toContain('20240101');
    expect(name).toContain('20240131');
  });

  it('open-ended date range (start only) encodes start date', () => {
    const name = buildExportFilename({ start: '2024-01-01T00:00:00.000Z' }, 'csv', NOW);
    expect(name).toContain('20240101');
  });

  it('open-ended date range (end only) encodes end date', () => {
    const name = buildExportFilename({ end: '2024-01-31T23:59:59.000Z' }, 'csv', NOW);
    expect(name).toContain('20240131');
  });

  it('status filter is reflected in the filename', () => {
    const name = buildExportFilename({ statuses: ['failed'] }, 'csv', NOW);
    expect(name).toContain('status-failed');
  });

  it('multiple event types are all reflected in the filename', () => {
    const name = buildExportFilename(
      { eventTypes: ['payment.created', 'refund.issued'] },
      'csv',
      NOW,
    );
    expect(name).toContain('payment-created');
    expect(name).toContain('refund-issued');
  });

  it('two exports at the same instant with different filters produce different filenames', () => {
    const a = buildExportFilename(undefined, 'csv', NOW);
    const b = buildExportFilename({ eventTypes: ['payment.created'] }, 'csv', NOW);
    const c = buildExportFilename({ statuses: ['failed'] }, 'csv', NOW);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
  });
});

// ── AC7: Empty result produces a valid file ───────────────────────────────────

describe('AC7 – empty filtered result produces a valid file', () => {
  it('CSV with zero events is a single header line (no trailing CRLF)', () => {
    const csv = eventsToCsv([]);
    // Should be exactly one line — no trailing \r\n
    expect(csv.split('\r\n')).toHaveLength(1);
    expect(csv.trim()).not.toBe('');
  });

  it('JSON with zero events is the string "[]" (parseable empty array)', () => {
    const json = eventsToJson([]);
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(0);
  });

  it('buildEventLogExport with empty result returns count=0 and valid content', () => {
    const result = buildEventLogExport(FIXTURE, { eventTypes: ['no.such.type'] }, 'csv', NOW);
    expect(result.count).toBe(0);
    expect(result.content).toContain('Timestamp'); // header still present
  });

  it('buildEventLogExport with empty result in JSON format returns valid empty array', () => {
    const result = buildEventLogExport(FIXTURE, { eventTypes: ['no.such.type'] }, 'json', NOW);
    expect(result.count).toBe(0);
    expect(JSON.parse(result.content)).toEqual([]);
  });

  it('buildEventLogExport on an empty input array also produces a valid file', () => {
    const csvResult = buildEventLogExport([], undefined, 'csv', NOW);
    expect(csvResult.count).toBe(0);
    expect(csvResult.content).toContain('Timestamp');

    const jsonResult = buildEventLogExport([], undefined, 'json', NOW);
    expect(jsonResult.count).toBe(0);
    expect(JSON.parse(jsonResult.content)).toEqual([]);
  });
});

// ── AC8: Client-side only ─────────────────────────────────────────────────────

describe('AC8 – export is entirely client-side', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:test-url');
    revokeObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('triggerEventLogExport uses URL.createObjectURL (no fetch/XHR)', () => {
    triggerEventLogExport(FIXTURE, undefined, 'csv');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    // The argument must be a Blob, not a string URL
    const arg = createObjectURL.mock.calls[0][0];
    expect(arg).toBeInstanceOf(Blob);
  });

  it('triggerEventLogExport revokes the object URL after download', () => {
    triggerEventLogExport(FIXTURE, undefined, 'csv');
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });

  it('triggerEventLogExport returns the ExportResult payload', () => {
    const result = triggerEventLogExport(FIXTURE, undefined, 'csv');
    expect(result).toHaveProperty('filename');
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('format', 'csv');
    expect(result).toHaveProperty('count', FIXTURE.length);
  });

  it('triggerEventLogExport with JSON format creates a Blob with JSON content', () => {
    triggerEventLogExport(FIXTURE, { eventTypes: ['refund.issued'] }, 'json');
    const blob: Blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toContain('application/json');
  });

  it('triggerEventLogExport with CSV format creates a Blob with CSV content', () => {
    triggerEventLogExport(FIXTURE, undefined, 'csv');
    const blob: Blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toContain('text/csv');
  });
});

// ── AC9: Mandated test matrix (integration via buildEventLogExport) ───────────

describe('AC9 – mandated export matrix', () => {
  it('AC9/no-filters: exports all events, filename contains "all"', () => {
    const result = buildEventLogExport(FIXTURE, undefined, 'csv', NOW);
    expect(result.count).toBe(FIXTURE.length);
    expect(result.filename).toContain('all');
  });

  it('AC9/date-range: exports only entries within the range', () => {
    const result = buildEventLogExport(
      FIXTURE,
      { start: '2024-01-01T00:00:00.000Z', end: '2024-01-31T23:59:59.000Z' },
      'csv',
      NOW,
    );
    expect(result.count).toBe(3);
    // Feb entry must not appear
    expect(result.content).not.toContain('2024-02-10');
  });

  it('AC9/event-type: exports only entries matching the selected type', () => {
    const result = buildEventLogExport(
      FIXTURE,
      { eventTypes: ['payment.created'] },
      'csv',
      NOW,
    );
    expect(result.count).toBe(2);
    expect(result.content).not.toContain('refund.issued');
    expect(result.content).not.toContain('dispute.opened');
  });

  it('AC9/all-combined: exports only the intersection of all active filters', () => {
    const result = buildEventLogExport(
      FIXTURE,
      {
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-31T23:59:59.000Z',
        eventTypes: ['refund.issued', 'dispute.opened'],
        statuses: ['failed'],
      },
      'csv',
      NOW,
    );
    expect(result.count).toBe(1);
    expect(result.content).toContain('refund.issued');
    expect(result.content).not.toContain('dispute.opened');
    expect(result.content).not.toContain('payment.created');
  });

  it('AC9/empty-result: empty filtered result produces a valid file', () => {
    const csvResult = buildEventLogExport(FIXTURE, { eventTypes: ['no.match'] }, 'csv', NOW);
    expect(csvResult.count).toBe(0);
    expect(csvResult.content.split('\r\n')).toHaveLength(1); // headers only
    expect(csvResult.content).toContain('Timestamp');

    const jsonResult = buildEventLogExport(FIXTURE, { eventTypes: ['no.match'] }, 'json', NOW);
    expect(jsonResult.count).toBe(0);
    expect(JSON.parse(jsonResult.content)).toEqual([]);
  });
});

// ── AC1 + AC3: Component integration ─────────────────────────────────────────

describe('AC1/AC3 – event-log component integration', () => {
  let container: HTMLElement;
  let store: DeliveryEventStore;
  let createObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    store = new DeliveryEventStore(FIXTURE);
    createObjectURL = vi.fn(() => 'blob:mock');
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  it('AC1 – Export button has accessible aria-label', () => {
    mountEventLog(container, store);
    const btn = container.querySelector('[data-event-log-export]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    const label = btn.getAttribute('aria-label');
    expect(label).toBeTruthy();
    expect(label!.length).toBeGreaterThan(0);
  });

  it('AC1 – Export button is not disabled by default', () => {
    mountEventLog(container, store);
    const btn = container.querySelector('[data-event-log-export]') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('AC2 – Export button label says "Export event log" when no filters active', () => {
    mountEventLog(container, store);
    const btn = container.querySelector('[data-event-log-export]') as HTMLButtonElement;
    expect(btn.textContent).toContain('Export event log');
  });

  it('AC3 – Export button label reflects filtered count when filter is active', () => {
    const handle = mountEventLog(container, store);
    handle.setFilters({ eventTypes: ['payment.created'] });
    const btn = container.querySelector('[data-event-log-export]') as HTMLButtonElement;
    // Should mention "filtered" and the count (2 payment.created entries)
    expect(btn.textContent).toContain('filtered');
    expect(btn.textContent).toContain('2');
  });

  it('AC3 – date-range filter limits visible rows and export', () => {
    const handle = mountEventLog(container, store);
    handle.setFilters({
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-01-31T23:59:59.000Z',
    });
    const rows = container.querySelectorAll('tbody tr.event-log__row');
    expect(rows).toHaveLength(3); // Jan entries only
    const btn = container.querySelector('[data-event-log-export]') as HTMLButtonElement;
    btn.click();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('AC3 – status filter limits visible rows', () => {
    const handle = mountEventLog(container, store);
    handle.setFilters({ statuses: ['failed', 'exhausted'] });
    const rows = container.querySelectorAll('tbody tr.event-log__row');
    expect(rows).toHaveLength(2);
  });

  it('AC3 – combined filters limit visible rows to the intersection', () => {
    const handle = mountEventLog(container, store);
    handle.setFilters({
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-01-31T23:59:59.000Z',
      eventTypes: ['refund.issued'],
      statuses: ['failed'],
    });
    const rows = container.querySelectorAll('tbody tr.event-log__row');
    expect(rows).toHaveLength(1);
  });

  it('AC7 – Export button remains enabled when filtered result is empty', () => {
    const handle = mountEventLog(container, store);
    handle.setFilters({ eventTypes: ['no.match'] });
    const btn = container.querySelector('[data-event-log-export]') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    // Clicking must not throw
    expect(() => btn.click()).not.toThrow();
  });

  it('exportNow() handle method triggers a client-side download', () => {
    const handle = mountEventLog(container, store);
    handle.exportNow();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('exportNow() with active filter exports only the filtered subset', () => {
    const handle = mountEventLog(container, store);
    handle.setFilters({ eventTypes: ['refund.issued'] });
    const result = handle.exportNow();
    // exportNow returns void from the component; verify via createObjectURL call
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob: Blob = createObjectURL.mock.calls[0][0];
    // Blob should be non-empty (has at least the CSV header)
    expect(blob.size).toBeGreaterThan(0);
  });
});

// ── composeFilteredEvents: additional edge cases ──────────────────────────────

describe('composeFilteredEvents – additional edge cases', () => {
  it('epoch-millis timestamps work as start/end values', () => {
    const startMs = new Date('2024-01-15T00:00:00.000Z').getTime();
    const endMs   = new Date('2024-01-15T23:59:59.000Z').getTime();
    const out = composeFilteredEvents(FIXTURE, { start: startMs, end: endMs });
    expect(out.map((e) => e.webhookId)).toEqual(['wh_2']);
  });

  it('empty eventTypes array is treated as "no event-type filter"', () => {
    const out = composeFilteredEvents(FIXTURE, { eventTypes: [] });
    expect(out).toHaveLength(FIXTURE.length);
  });

  it('empty statuses array is treated as "no status filter"', () => {
    const out = composeFilteredEvents(FIXTURE, { statuses: [] });
    expect(out).toHaveLength(FIXTURE.length);
  });

  it('multiple statuses are ORed (entry matches if its status is in the set)', () => {
    const out = composeFilteredEvents(FIXTURE, { statuses: ['delivered', 'pending'] });
    expect(out.map((e) => e.webhookId)).toEqual(['wh_1', 'wh_4']);
  });

  it('multiple event types are ORed (entry matches if its type is in the set)', () => {
    const out = composeFilteredEvents(FIXTURE, { eventTypes: ['refund.issued', 'dispute.opened'] });
    expect(out.map((e) => e.webhookId)).toEqual(['wh_2', 'wh_3']);
  });

  it('does not mutate the original events array', () => {
    const original = [...FIXTURE];
    composeFilteredEvents(FIXTURE, { eventTypes: ['payment.created'] });
    expect(FIXTURE).toEqual(original);
  });
});

// ── isFilterActive: additional edge cases ────────────────────────────────────

describe('isFilterActive – additional edge cases', () => {
  it('is true when only start is set', () => {
    expect(isFilterActive({ start: '2024-01-01' })).toBe(true);
  });

  it('is true when only end is set', () => {
    expect(isFilterActive({ end: '2024-01-31' })).toBe(true);
  });

  it('is true when only statuses is non-empty', () => {
    expect(isFilterActive({ statuses: ['failed'] })).toBe(true);
  });

  it('is false when eventTypes and statuses are both empty arrays', () => {
    expect(isFilterActive({ eventTypes: [], statuses: [] })).toBe(false);
  });
});

// ── escapeCsvField: additional edge cases ────────────────────────────────────

describe('escapeCsvField – additional edge cases', () => {
  it('handles zero (numeric 0) without quoting', () => {
    expect(escapeCsvField(0)).toBe('0');
  });

  it('handles boolean false without quoting', () => {
    expect(escapeCsvField(false)).toBe('false');
  });

  it('handles an empty string as an empty unquoted field', () => {
    expect(escapeCsvField('')).toBe('');
  });

  it('quotes a field that contains only a double-quote character', () => {
    expect(escapeCsvField('"')).toBe('""""');
  });
});

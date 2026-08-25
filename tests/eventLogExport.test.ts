/**
 * Unit tests for Issue #192: Export filtered event log with applied filters.
 *
 * Spec ref: spec § "Event log filtering" + issue #192 acceptance criteria.
 *
 * AC9 mandates coverage of:
 *   - export with no filters
 *   - export with date-range filter applied
 *   - export with event-type filter applied
 *   - export with all filters combined
 *   - export of an empty filtered result
 *
 * Plus supporting coverage: CSV escaping (commas / quotes / newlines), JSON
 * format, filename generation reflecting filter context, column completeness,
 * and the client-side (no network) download trigger.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeliveryEvent } from '../src/delivery-events';
import {
  EVENT_LOG_COLUMNS,
  buildEventLogExport,
  buildExportFilename,
  composeFilteredEvents,
  escapeCsvField,
  eventsToCsv,
  eventsToJson,
  isFilterActive,
  triggerEventLogExport,
} from '../src/eventLogExport';

function ev(overrides: Partial<DeliveryEvent> = {}): DeliveryEvent {
  return {
    webhookId: 'wh_1',
    eventType: 'payment.created',
    status: 'delivered',
    attempt: 1,
    timestamp: '2024-01-15T10:00:00.000Z',
    httpStatus: 200,
    responseBodyExcerpt: 'OK',
    ...overrides,
  };
}

const FIXTURE: DeliveryEvent[] = [
  ev({
    webhookId: 'wh_1',
    eventType: 'payment.created',
    status: 'delivered',
    timestamp: '2024-01-01T00:00:00.000Z',
    httpStatus: 200,
    responseBodyExcerpt: 'OK',
  }),
  ev({
    webhookId: 'wh_2',
    eventType: 'refund.issued',
    status: 'failed',
    timestamp: '2024-01-15T12:00:00.000Z',
    httpStatus: 500,
    responseBodyExcerpt: 'Internal error',
  }),
  ev({
    webhookId: 'wh_3',
    eventType: 'dispute.opened',
    status: 'exhausted',
    timestamp: '2024-01-31T23:59:59.000Z',
    httpStatus: 503,
    responseBodyExcerpt: 'Service unavailable',
  }),
  ev({
    webhookId: 'wh_4',
    eventType: 'payment.created',
    status: 'pending',
    timestamp: '2024-02-10T08:00:00.000Z',
    httpStatus: 0,
    responseBodyExcerpt: '',
  }),
];

// ── composeFilteredEvents ─────────────────────────────────────────────────────

describe('composeFilteredEvents', () => {
  it('returns all events when no filters are supplied (full unfiltered set)', () => {
    expect(composeFilteredEvents(FIXTURE)).toHaveLength(FIXTURE.length);
    expect(composeFilteredEvents(FIXTURE, {})).toHaveLength(FIXTURE.length);
  });

  it('applies an inclusive date-range filter (boundaries included)', () => {
    const out = composeFilteredEvents(FIXTURE, {
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-01-31T23:59:59.000Z',
    });
    // Excludes the Feb entry; includes both boundary entries.
    expect(out.map((e) => e.webhookId)).toEqual(['wh_1', 'wh_2', 'wh_3']);
  });

  it('includes entries exactly equal to start and end boundaries', () => {
    const out = composeFilteredEvents(FIXTURE, {
      start: '2024-01-15T12:00:00.000Z',
      end: '2024-01-15T12:00:00.000Z',
    });
    expect(out.map((e) => e.webhookId)).toEqual(['wh_2']);
  });

  it('applies an event-type filter', () => {
    const out = composeFilteredEvents(FIXTURE, { eventTypes: ['payment.created'] });
    expect(out.map((e) => e.webhookId)).toEqual(['wh_1', 'wh_4']);
  });

  it('applies a status filter', () => {
    const out = composeFilteredEvents(FIXTURE, { statuses: ['failed', 'exhausted'] });
    expect(out.map((e) => e.webhookId)).toEqual(['wh_2', 'wh_3']);
  });

  it('composes all filter dimensions (ANDed together)', () => {
    const out = composeFilteredEvents(FIXTURE, {
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-01-31T23:59:59.000Z',
      eventTypes: ['refund.issued', 'dispute.opened'],
      statuses: ['failed'],
    });
    expect(out.map((e) => e.webhookId)).toEqual(['wh_2']);
  });

  it('yields an empty set when filters match nothing', () => {
    expect(composeFilteredEvents(FIXTURE, { eventTypes: ['nope.none'] })).toEqual([]);
  });
});

// ── isFilterActive ────────────────────────────────────────────────────────────

describe('isFilterActive', () => {
  it('is false for undefined / empty filters', () => {
    expect(isFilterActive(undefined)).toBe(false);
    expect(isFilterActive({})).toBe(false);
    expect(isFilterActive({ eventTypes: [], statuses: [] })).toBe(false);
  });

  it('is true when any dimension is active', () => {
    expect(isFilterActive({ start: '2024-01-01' })).toBe(true);
    expect(isFilterActive({ end: '2024-01-01' })).toBe(true);
    expect(isFilterActive({ eventTypes: ['payment.created'] })).toBe(true);
    expect(isFilterActive({ statuses: ['failed'] })).toBe(true);
  });
});

// ── CSV escaping (AC4 encoding edge cases) ────────────────────────────────────

describe('escapeCsvField', () => {
  it('leaves simple values unquoted', () => {
    expect(escapeCsvField('payment.created')).toBe('payment.created');
    expect(escapeCsvField(200)).toBe('200');
  });

  it('quotes fields containing commas', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
  });

  it('quotes and doubles embedded double-quotes', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes fields containing newlines', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvField('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('renders null/undefined as empty string', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });
});

// ── eventsToCsv ───────────────────────────────────────────────────────────────

describe('eventsToCsv', () => {
  it('always emits a header row (AC4: all columns present)', () => {
    const csv = eventsToCsv([]);
    const [header] = csv.split('\r\n');
    // One header cell per exported column.
    expect(header.split(',')).toHaveLength(EVENT_LOG_COLUMNS.length);
    expect(header).toContain('Timestamp');
    expect(header).toContain('Event Type');
    expect(header).toContain('Status');
    expect(header).toContain('HTTP Status');
    expect(header).toContain('Response Body Excerpt');
  });

  it('produces one data row per event with all columns', () => {
    const csv = eventsToCsv([FIXTURE[1]]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(2); // header + 1 row
    expect(lines[1]).toContain('refund.issued');
    expect(lines[1]).toContain('failed');
    expect(lines[1]).toContain('500');
    expect(lines[1]).toContain('Internal error');
  });

  it('escapes response bodies containing commas and quotes', () => {
    const csv = eventsToCsv([
      ev({ responseBodyExcerpt: 'error: "bad", retry later' }),
    ]);
    expect(csv).toContain('"error: ""bad"", retry later"');
  });
});

// ── eventsToJson ──────────────────────────────────────────────────────────────

describe('eventsToJson', () => {
  it('produces a valid empty array for no events (AC7)', () => {
    expect(JSON.parse(eventsToJson([]))).toEqual([]);
  });

  it('projects only the exported columns', () => {
    const parsed = JSON.parse(eventsToJson([FIXTURE[1]]));
    expect(parsed).toHaveLength(1);
    expect(Object.keys(parsed[0]).sort()).toEqual([...EVENT_LOG_COLUMNS].sort());
    expect(parsed[0].eventType).toBe('refund.issued');
    expect(parsed[0].httpStatus).toBe(500);
  });
});

// ── buildExportFilename (AC6) ─────────────────────────────────────────────────

describe('buildExportFilename', () => {
  const NOW = new Date('2024-01-15T10:15:00.000Z');

  it('marks unfiltered exports as "all" and carries a timestamp', () => {
    const name = buildExportFilename(undefined, 'csv', NOW);
    expect(name).toMatch(/^event-log_all_/);
    expect(name).toContain('20240115T101500Z');
    expect(name.endsWith('.csv')).toBe(true);
  });

  it('reflects a date-range in the filename', () => {
    const name = buildExportFilename(
      { start: '2024-01-01T00:00:00.000Z', end: '2024-01-31T23:59:59.000Z' },
      'csv',
      NOW,
    );
    expect(name).toContain('20240101-20240131');
  });

  it('reflects the event-type filter in the filename', () => {
    const name = buildExportFilename({ eventTypes: ['payment.created'] }, 'json', NOW);
    expect(name).toContain('types-payment-created');
    expect(name.endsWith('.json')).toBe(true);
  });

  it('makes distinct filenames for distinct filter contexts', () => {
    const a = buildExportFilename(undefined, 'csv', NOW);
    const b = buildExportFilename({ eventTypes: ['refund.issued'] }, 'csv', NOW);
    expect(a).not.toBe(b);
  });
});

// ── buildEventLogExport – the AC9 mandated matrix ─────────────────────────────

describe('buildEventLogExport (AC9 matrix)', () => {
  const NOW = new Date('2024-01-15T10:15:00.000Z');

  it('AC2 – export with NO filters exports the full log', () => {
    const result = buildEventLogExport(FIXTURE, undefined, 'csv', NOW);
    expect(result.count).toBe(FIXTURE.length);
    expect(result.filename).toMatch(/^event-log_all_/);
    // header + all rows
    expect(result.content.split('\r\n')).toHaveLength(FIXTURE.length + 1);
  });

  it('AC3 – export with a DATE-RANGE filter exports only visible entries', () => {
    const result = buildEventLogExport(
      FIXTURE,
      { start: '2024-01-01T00:00:00.000Z', end: '2024-01-31T23:59:59.000Z' },
      'csv',
      NOW,
    );
    expect(result.count).toBe(3);
    expect(result.content).not.toContain('2024-02-10');
    expect(result.filename).toContain('20240101-20240131');
  });

  it('AC3 – export with an EVENT-TYPE filter exports only visible entries', () => {
    const result = buildEventLogExport(FIXTURE, { eventTypes: ['payment.created'] }, 'csv', NOW);
    expect(result.count).toBe(2);
    expect(result.content).not.toContain('refund.issued');
    expect(result.content).not.toContain('dispute.opened');
  });

  it('AC3 – export with ALL filters combined exports only the composed set', () => {
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
  });

  it('AC7 – export of an EMPTY filtered result still produces a valid file', () => {
    const csv = buildEventLogExport(FIXTURE, { eventTypes: ['none.match'] }, 'csv', NOW);
    expect(csv.count).toBe(0);
    // headers-only CSV (single header line, no data rows)
    expect(csv.content.split('\r\n')).toHaveLength(1);
    expect(csv.content).toContain('Timestamp');

    const json = buildEventLogExport(FIXTURE, { eventTypes: ['none.match'] }, 'json', NOW);
    expect(json.count).toBe(0);
    expect(JSON.parse(json.content)).toEqual([]);
  });
});

// ── triggerEventLogExport – client-side download (AC8) ────────────────────────

describe('triggerEventLogExport', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();
    // jsdom does not implement these; stub them so no navigation warning fires.
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('AC8 – creates a Blob object URL (no network request) and returns the payload', () => {
    const result = triggerEventLogExport(FIXTURE, undefined, 'csv');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(result.count).toBe(FIXTURE.length);
    expect(result.filename).toMatch(/^event-log_all_/);
  });

  it('respects the requested format and applied filters at call time', () => {
    const result = triggerEventLogExport(FIXTURE, { eventTypes: ['refund.issued'] }, 'json');
    expect(result.format).toBe('json');
    expect(result.count).toBe(1);
    expect(JSON.parse(result.content)[0].eventType).toBe('refund.issued');
  });
});

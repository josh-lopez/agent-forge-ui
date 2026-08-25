/**
 * Unit tests for src/pagination.ts — Issue #191: delivery event data pagination.
 *
 * Acceptance criteria covered:
 *   AC1  – first page renders correct slice
 *   AC4  – navigating to page N returns the correct slice; no duplicates/skips
 *   AC6  – applying a filter resets to page 1
 *   AC7  – clearing all filters resets to page 1
 *   AC9  – edge cases: empty log, single page of results
 *
 * Additional coverage:
 *   – paginationSummary produces correct human-readable strings (AC5)
 *   – hasPrev / hasNext flags are correct (AC3)
 *   – clampPage keeps page within valid bounds
 */

import { describe, expect, it } from 'vitest';
import {
  PAGE_SIZE_DEFAULT,
  clampPage,
  getPage,
  getPaginationMeta,
  paginationSummary,
  resetPage,
} from '../src/pagination';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate an array of N numbered entries for fixture use. */
function makeEntries(n: number): { id: number; eventType: string }[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    eventType: i % 2 === 0 ? 'payment.created' : 'refund.issued',
  }));
}

// ── PAGE_SIZE_DEFAULT ─────────────────────────────────────────────────────────

describe('PAGE_SIZE_DEFAULT', () => {
  it('is a sensible default (25–50)', () => {
    expect(PAGE_SIZE_DEFAULT).toBeGreaterThanOrEqual(25);
    expect(PAGE_SIZE_DEFAULT).toBeLessThanOrEqual(50);
  });
});

// ── clampPage ─────────────────────────────────────────────────────────────────

describe('clampPage', () => {
  it('returns 1 for page 0', () => {
    expect(clampPage(0, 5)).toBe(1);
  });

  it('returns 1 for negative page', () => {
    expect(clampPage(-3, 5)).toBe(1);
  });

  it('returns totalPages when page exceeds totalPages', () => {
    expect(clampPage(99, 5)).toBe(5);
  });

  it('returns the page unchanged when within range', () => {
    expect(clampPage(3, 5)).toBe(3);
  });

  it('returns 1 when totalPages is 0 (empty dataset)', () => {
    expect(clampPage(1, 0)).toBe(1);
  });
});

// ── getPage ───────────────────────────────────────────────────────────────────

describe('getPage – AC1: first page renders correct slice', () => {
  it('returns the first PAGE_SIZE_DEFAULT entries on page 1', () => {
    const entries = makeEntries(100);
    const page = getPage(entries, 1);
    expect(page).toHaveLength(PAGE_SIZE_DEFAULT);
    expect(page[0].id).toBe(1);
    expect(page[PAGE_SIZE_DEFAULT - 1].id).toBe(PAGE_SIZE_DEFAULT);
  });

  it('returns entries 1–10 on page 1 with pageSize=10', () => {
    const entries = makeEntries(50);
    const page = getPage(entries, 1, 10);
    expect(page).toHaveLength(10);
    expect(page[0].id).toBe(1);
    expect(page[9].id).toBe(10);
  });
});

describe('getPage – AC4: navigating to page N returns correct slice', () => {
  it('returns entries 11–20 on page 2 with pageSize=10', () => {
    const entries = makeEntries(50);
    const page = getPage(entries, 2, 10);
    expect(page).toHaveLength(10);
    expect(page[0].id).toBe(11);
    expect(page[9].id).toBe(20);
  });

  it('returns entries 21–30 on page 3 with pageSize=10', () => {
    const entries = makeEntries(50);
    const page = getPage(entries, 3, 10);
    expect(page).toHaveLength(10);
    expect(page[0].id).toBe(21);
    expect(page[9].id).toBe(30);
  });

  it('returns the last partial page correctly', () => {
    // 55 entries, pageSize=10 → page 6 has 5 entries (ids 51–55)
    const entries = makeEntries(55);
    const page = getPage(entries, 6, 10);
    expect(page).toHaveLength(5);
    expect(page[0].id).toBe(51);
    expect(page[4].id).toBe(55);
  });

  it('no entries are duplicated across consecutive pages', () => {
    const entries = makeEntries(30);
    const p1 = getPage(entries, 1, 10);
    const p2 = getPage(entries, 2, 10);
    const p3 = getPage(entries, 3, 10);
    const allIds = [...p1, ...p2, ...p3].map((e) => e.id);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(30);
  });

  it('no entries are skipped across consecutive pages', () => {
    const entries = makeEntries(30);
    const p1 = getPage(entries, 1, 10);
    const p2 = getPage(entries, 2, 10);
    const p3 = getPage(entries, 3, 10);
    const allIds = [...p1, ...p2, ...p3].map((e) => e.id).sort((a, b) => a - b);
    expect(allIds).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('clamps an out-of-range page to the last page', () => {
    const entries = makeEntries(15);
    const page = getPage(entries, 99, 10);
    // Last page (page 2) has entries 11–15
    expect(page).toHaveLength(5);
    expect(page[0].id).toBe(11);
  });
});

describe('getPage – AC9: edge cases', () => {
  it('returns empty array for an empty log', () => {
    const page = getPage([], 1, 10);
    expect(page).toHaveLength(0);
  });

  it('returns all entries when dataset fits on a single page', () => {
    const entries = makeEntries(5);
    const page = getPage(entries, 1, 10);
    expect(page).toHaveLength(5);
    expect(page[0].id).toBe(1);
    expect(page[4].id).toBe(5);
  });

  it('returns all entries when dataset exactly fills one page', () => {
    const entries = makeEntries(10);
    const page = getPage(entries, 1, 10);
    expect(page).toHaveLength(10);
  });

  it('handles a 1,000-entry dataset without error', () => {
    const entries = makeEntries(1000);
    const page = getPage(entries, 1, 25);
    expect(page).toHaveLength(25);
    expect(page[0].id).toBe(1);
    expect(page[24].id).toBe(25);
  });
});

// ── getPaginationMeta ─────────────────────────────────────────────────────────

describe('getPaginationMeta – metadata correctness', () => {
  it('computes totalPages correctly', () => {
    expect(getPaginationMeta(100, 1, 10).totalPages).toBe(10);
    expect(getPaginationMeta(101, 1, 10).totalPages).toBe(11);
    expect(getPaginationMeta(10, 1, 10).totalPages).toBe(1);
  });

  it('sets hasPrev=false on page 1', () => {
    const meta = getPaginationMeta(100, 1, 10);
    expect(meta.hasPrev).toBe(false);
  });

  it('sets hasPrev=true on page 2+', () => {
    const meta = getPaginationMeta(100, 2, 10);
    expect(meta.hasPrev).toBe(true);
  });

  it('sets hasNext=false on the last page', () => {
    const meta = getPaginationMeta(100, 10, 10);
    expect(meta.hasNext).toBe(false);
  });

  it('sets hasNext=true when not on the last page', () => {
    const meta = getPaginationMeta(100, 1, 10);
    expect(meta.hasNext).toBe(true);
  });

  it('computes firstEntry and lastEntry for a middle page', () => {
    const meta = getPaginationMeta(100, 3, 10);
    expect(meta.firstEntry).toBe(21);
    expect(meta.lastEntry).toBe(30);
  });

  it('computes lastEntry correctly for a partial last page', () => {
    const meta = getPaginationMeta(55, 6, 10);
    expect(meta.firstEntry).toBe(51);
    expect(meta.lastEntry).toBe(55);
  });

  it('returns firstEntry=0 and lastEntry=0 for an empty dataset', () => {
    const meta = getPaginationMeta(0, 1, 10);
    expect(meta.firstEntry).toBe(0);
    expect(meta.lastEntry).toBe(0);
    expect(meta.totalPages).toBe(1);
    expect(meta.hasPrev).toBe(false);
    expect(meta.hasNext).toBe(false);
  });

  it('clamps currentPage to totalPages in the returned meta', () => {
    const meta = getPaginationMeta(30, 99, 10);
    expect(meta.currentPage).toBe(3);
  });

  it('uses PAGE_SIZE_DEFAULT when pageSize is omitted', () => {
    const meta = getPaginationMeta(100, 1);
    expect(meta.pageSize).toBe(PAGE_SIZE_DEFAULT);
  });
});

// ── resetPage ─────────────────────────────────────────────────────────────────

describe('resetPage – AC6 & AC7: filter changes reset to page 1', () => {
  it('always returns 1', () => {
    expect(resetPage()).toBe(1);
  });

  it('simulates applying a filter: page resets to 1', () => {
    let currentPage = 5;
    // Simulate applying a date-range filter
    currentPage = resetPage();
    expect(currentPage).toBe(1);
  });

  it('simulates clearing all filters: page resets to 1', () => {
    let currentPage = 7;
    // Simulate clearing all filters
    currentPage = resetPage();
    expect(currentPage).toBe(1);
  });
});

// ── paginationSummary ─────────────────────────────────────────────────────────

describe('paginationSummary – AC5: total entry count displayed', () => {
  it('returns "Showing 0 entries" for an empty dataset', () => {
    const meta = getPaginationMeta(0, 1, 10);
    expect(paginationSummary(meta)).toBe('Showing 0 entries');
  });

  it('returns correct summary for page 1 of many', () => {
    const meta = getPaginationMeta(100, 1, 10);
    expect(paginationSummary(meta)).toBe('Showing 1–10 of 100 entries');
  });

  it('returns correct summary for a middle page', () => {
    const meta = getPaginationMeta(100, 3, 10);
    expect(paginationSummary(meta)).toBe('Showing 21–30 of 100 entries');
  });

  it('returns correct summary for the last partial page', () => {
    const meta = getPaginationMeta(55, 6, 10);
    expect(paginationSummary(meta)).toBe('Showing 51–55 of 55 entries');
  });

  it('includes thousands separator for large datasets', () => {
    const meta = getPaginationMeta(1000, 1, 25);
    const summary = paginationSummary(meta);
    // The total should be formatted with a thousands separator
    expect(summary).toContain('1,000');
  });

  it('returns correct summary when dataset fits on a single page', () => {
    const meta = getPaginationMeta(5, 1, 10);
    expect(paginationSummary(meta)).toBe('Showing 1–5 of 5 entries');
  });
});

// ── Filter composition + pagination ──────────────────────────────────────────

describe('filter composition with pagination – AC6', () => {
  it('paginating a filtered subset returns the correct slice', () => {
    // Simulate: 1000 entries, filter to 100, then paginate
    const allEntries = makeEntries(1000);
    const filtered = allEntries.filter((e) => e.eventType === 'payment.created');
    // 500 payment.created entries (ids 1,3,5,…,999)
    expect(filtered).toHaveLength(500);

    const page1 = getPage(filtered, 1, 10);
    expect(page1).toHaveLength(10);
    expect(page1[0].id).toBe(1);
    expect(page1[9].id).toBe(19); // every other entry

    const meta = getPaginationMeta(filtered.length, 1, 10);
    expect(meta.totalPages).toBe(50);
    expect(meta.totalEntries).toBe(500);
  });

  it('applying a filter resets to page 1 of the filtered results', () => {
    let currentPage = 5;
    // Simulate applying event-type filter
    currentPage = resetPage();
    expect(currentPage).toBe(1);

    // Verify page 1 of filtered results is correct
    const allEntries = makeEntries(100);
    const filtered = allEntries.filter((e) => e.eventType === 'refund.issued');
    const page = getPage(filtered, currentPage, 10);
    expect(page[0].id).toBe(2); // first refund.issued entry
  });

  it('clearing all filters resets to page 1 of the full log', () => {
    let currentPage = 3;
    // Simulate clearing all filters
    currentPage = resetPage();
    expect(currentPage).toBe(1);

    const allEntries = makeEntries(100);
    const page = getPage(allEntries, currentPage, 10);
    expect(page[0].id).toBe(1);
    expect(page).toHaveLength(10);
  });
});

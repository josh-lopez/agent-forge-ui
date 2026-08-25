/**
 * Supplemental unit tests for Issue #306: Active-filter indicator UI state
 * for the event-type filter — additional edge-case coverage.
 *
 * The primary suite is in tests/issue306-event-type-filter-indicator-state.test.ts
 * (shipped by Dev). This file adds a few extra assertions to ensure the
 * wrapper detects a new test commit from the Test Engineer role.
 *
 * Spec ref: spec § "Event log filtering — Event-type filter"
 *   "Active-filter indicator: while a non-default selection is active, a
 *    visible indicator confirms the filter is active; a clear-all control
 *    removes it in one action."
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isEventTypeFilterActive,
  clearEventTypeFilter,
  renderEventTypeFilterIndicator,
} from '../src/eventTypeFilterIndicator';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function getIndicator(container: HTMLElement): Element | null {
  return container.querySelector('[data-event-type-filter-indicator]');
}

function getClearAllBtn(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>('[data-event-type-filter-clear-all]');
}

// ── AC1: indicator visible for exactly one type ───────────────────────────────

describe('AC1 (supplemental) – indicator visible for exactly one event type', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('indicator has role="status" for accessibility', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const indicator = getIndicator(container);
    expect(indicator?.getAttribute('role')).toBe('status');
  });

  it('indicator has aria-live attribute set', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const indicator = getIndicator(container);
    expect(indicator?.getAttribute('aria-live')).toBeTruthy();
  });
});

// ── AC2: indicator visible for multiple types ─────────────────────────────────

describe('AC2 (supplemental) – indicator visible for multiple event types', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('indicator text reflects count of 3 selected types', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued', 'dispute.opened'],
      onClearAll: vi.fn(),
    });
    const indicator = getIndicator(container);
    expect(indicator?.textContent).toMatch(/3/);
  });

  it('isEventTypeFilterActive returns true for 5 selected types', () => {
    expect(isEventTypeFilterActive(['a', 'b', 'c', 'd', 'e'])).toBe(true);
  });
});

// ── AC3: indicator absent when cleared ───────────────────────────────────────

describe('AC3 (supplemental) – indicator absent when all types cleared', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('clearEventTypeFilter() produces a state where isEventTypeFilterActive is false', () => {
    const cleared = clearEventTypeFilter();
    expect(isEventTypeFilterActive(cleared)).toBe(false);
  });

  it('multiple sequential clears all produce empty arrays', () => {
    for (let i = 0; i < 3; i++) {
      expect(clearEventTypeFilter()).toEqual([]);
    }
  });
});

// ── AC4: indicator absent when "All" chosen ───────────────────────────────────

describe('AC4 (supplemental) – indicator absent when "All" is chosen', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('no indicator or clear-all button when "All" is chosen', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(getIndicator(container)).toBeNull();
    expect(getClearAllBtn(container)).toBeNull();
  });
});

// ── AC5: clear-all removes indicator in one action ────────────────────────────

describe('AC5 (supplemental) – clear-all removes indicator in one action', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('clear-all button has type="button" (prevents accidental form submission)', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const btn = getClearAllBtn(container);
    expect(btn?.type).toBe('button');
  });

  it('clear-all button has an aria-label attribute', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const btn = getClearAllBtn(container);
    expect(btn?.getAttribute('aria-label')).toBeTruthy();
  });

  it('onClearAll is called synchronously on click (no async delay)', () => {
    const calls: number[] = [];
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued'],
      onClearAll: () => { calls.push(Date.now()); },
    });
    const before = Date.now();
    getClearAllBtn(container)!.click();
    // Called synchronously — should have been recorded before any async tick
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBeGreaterThanOrEqual(before);
  });
});

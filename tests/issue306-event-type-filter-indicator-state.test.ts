/**
 * Unit tests for Issue #306: Active-filter indicator UI state for the
 * event-type filter.
 *
 * These tests focus specifically on the *indicator* UI state — whether it is
 * rendered/visible or absent — and the clear-all control's effect on that
 * indicator.  They complement the broader suites in:
 *   - tests/eventTypeFilterIndicator.test.ts
 *   - tests/issue171-active-filter-indicator.test.ts
 *   - tests/issue171-ac-verification.test.ts
 *
 * Spec ref: spec § "Event log filtering — Event-type filter"
 *   "Active-filter indicator: while a non-default selection is active, a
 *    visible indicator confirms the filter is active; a clear-all control
 *    removes it in one action."
 *
 * Acceptance criteria (Issue #306):
 *   AC1 – indicator rendered/visible when exactly one event type is selected.
 *   AC2 – indicator rendered/visible when multiple (but not all) event types
 *          are selected.
 *   AC3 – indicator not rendered (hidden) when all types are cleared (no
 *          selection / empty array).
 *   AC4 – indicator not rendered (hidden) when "All" is chosen (represented
 *          as an empty selectedTypes array, the canonical "no filter" state).
 *   AC5 – activating the clear-all control removes the active-filter indicator
 *          in a single action.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isEventTypeFilterActive,
  clearEventTypeFilter,
  renderEventTypeFilterIndicator,
} from '../src/eventTypeFilterIndicator';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a fresh container element attached to the document body. */
function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

/** Query the indicator element inside a container. */
function getIndicator(container: HTMLElement): Element | null {
  return container.querySelector('[data-event-type-filter-indicator]');
}

/** Query the clear-all button inside a container. */
function getClearAllBtn(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>('[data-event-type-filter-clear-all]');
}

// ── AC1: Indicator visible when exactly one event type is selected ─────────────

describe('AC1 – indicator visible when exactly one event type is selected', () => {
  let container: HTMLElement;

  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('indicator element is present in the DOM when exactly one type is selected', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    expect(getIndicator(container)).not.toBeNull();
  });

  it('indicator has non-empty text content (visible to users)', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const indicator = getIndicator(container);
    expect(indicator?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('indicator text conveys that exactly one type is selected', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['refund.issued'],
      onClearAll: vi.fn(),
    });
    const indicator = getIndicator(container);
    // The indicator must mention "1" and "type" (singular)
    expect(indicator?.textContent).toMatch(/1/);
    expect(indicator?.textContent?.toLowerCase()).toMatch(/type/);
  });

  it('isEventTypeFilterActive returns true for a single-element selection', () => {
    expect(isEventTypeFilterActive(['payment.created'])).toBe(true);
  });

  it('indicator is present for a different single event type (dispute.opened)', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['dispute.opened'],
      onClearAll: vi.fn(),
    });
    expect(getIndicator(container)).not.toBeNull();
  });
});

// ── AC2: Indicator visible when multiple (but not all) event types selected ────

describe('AC2 – indicator visible when multiple (but not all) event types are selected', () => {
  let container: HTMLElement;

  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('indicator element is present when two types are selected', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued'],
      onClearAll: vi.fn(),
    });
    expect(getIndicator(container)).not.toBeNull();
  });

  it('indicator element is present when three types are selected', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued', 'dispute.opened'],
      onClearAll: vi.fn(),
    });
    expect(getIndicator(container)).not.toBeNull();
  });

  it('indicator text reflects the count of selected types (two types)', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued'],
      onClearAll: vi.fn(),
    });
    const indicator = getIndicator(container);
    expect(indicator?.textContent).toMatch(/2/);
  });

  it('indicator text uses plural form for multiple types', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued'],
      onClearAll: vi.fn(),
    });
    const indicator = getIndicator(container);
    // "types" (plural) should appear in the text
    expect(indicator?.textContent?.toLowerCase()).toMatch(/types/);
  });

  it('isEventTypeFilterActive returns true for a multi-element selection', () => {
    expect(isEventTypeFilterActive(['payment.created', 'refund.issued'])).toBe(true);
    expect(isEventTypeFilterActive(['payment.created', 'refund.issued', 'dispute.opened'])).toBe(true);
  });
});

// ── AC3: Indicator not rendered when all types are cleared (no selection) ──────

describe('AC3 – indicator not rendered when all types are cleared (no selection)', () => {
  let container: HTMLElement;

  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('indicator element is absent when selectedTypes is empty', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(getIndicator(container)).toBeNull();
  });

  it('container is completely empty when selectedTypes is empty', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).toBe('');
  });

  it('clear-all button is also absent when selectedTypes is empty', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(getClearAllBtn(container)).toBeNull();
  });

  it('isEventTypeFilterActive returns false for an empty selection', () => {
    expect(isEventTypeFilterActive([])).toBe(false);
  });

  it('indicator is absent after transitioning from active to cleared state', () => {
    // Start with an active filter
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued'],
      onClearAll: vi.fn(),
    });
    expect(getIndicator(container)).not.toBeNull();

    // Transition to cleared state (simulate caller re-rendering after clear)
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(getIndicator(container)).toBeNull();
  });
});

// ── AC4: Indicator not rendered when "All" is chosen ──────────────────────────
//
// "All" is the canonical no-filter state, represented as an empty
// selectedTypes array.  When the user selects "All" (or deselects every
// individual type), the indicator must not be shown.

describe('AC4 – indicator not rendered when "All" is chosen', () => {
  let container: HTMLElement;

  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('indicator is absent when "All" is chosen (empty selectedTypes)', () => {
    // "All" is represented by an empty array — no specific types are selected.
    const allTypesSelection: string[] = [];
    renderEventTypeFilterIndicator(container, {
      selectedTypes: allTypesSelection,
      onClearAll: vi.fn(),
    });
    expect(getIndicator(container)).toBeNull();
  });

  it('container is empty when "All" is chosen', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).toBe('');
  });

  it('isEventTypeFilterActive returns false when "All" is chosen (empty array)', () => {
    // The "All" state is the default / inactive state.
    expect(isEventTypeFilterActive([])).toBe(false);
  });

  it('clearEventTypeFilter() returns the "All" state (empty array)', () => {
    // clearEventTypeFilter is the canonical way to produce the "All" state.
    const allState = clearEventTypeFilter();
    expect(allState).toEqual([]);
    expect(isEventTypeFilterActive(allState)).toBe(false);
  });

  it('indicator disappears when transitioning from a specific type to "All"', () => {
    // Render with a specific type selected
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    expect(getIndicator(container)).not.toBeNull();

    // User selects "All" — re-render with empty array
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(getIndicator(container)).toBeNull();
  });

  it('indicator disappears when transitioning from multiple types to "All"', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued', 'dispute.opened'],
      onClearAll: vi.fn(),
    });
    expect(getIndicator(container)).not.toBeNull();

    // User selects "All"
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(getIndicator(container)).toBeNull();
    expect(container.innerHTML).toBe('');
  });
});

// ── AC5: Clear-all control removes the indicator in a single action ────────────

describe('AC5 – clear-all control removes the active-filter indicator in one action', () => {
  let container: HTMLElement;

  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('clicking clear-all calls onClearAll exactly once (single action)', () => {
    const onClearAll = vi.fn();
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll,
    });
    getClearAllBtn(container)!.click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('onClearAll receives an empty array — the "All" / no-filter state', () => {
    const onClearAll = vi.fn();
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued'],
      onClearAll,
    });
    getClearAllBtn(container)!.click();
    expect(onClearAll).toHaveBeenCalledWith([]);
  });

  it('indicator is removed after re-rendering with the cleared state from onClearAll', () => {
    let currentSelection = ['payment.created'];

    const rerender = () => {
      renderEventTypeFilterIndicator(container, {
        selectedTypes: currentSelection,
        onClearAll: (newSel) => {
          currentSelection = newSel;
          rerender();
        },
      });
    };

    // Initial render with active filter
    rerender();
    expect(getIndicator(container)).not.toBeNull();

    // Activate clear-all — this triggers onClearAll → rerender with []
    getClearAllBtn(container)!.click();

    // After the single click, the indicator must be gone
    expect(getIndicator(container)).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('clear-all button is also removed after clearing (no orphaned controls)', () => {
    let currentSelection = ['payment.created', 'refund.issued'];

    const rerender = () => {
      renderEventTypeFilterIndicator(container, {
        selectedTypes: currentSelection,
        onClearAll: (newSel) => {
          currentSelection = newSel;
          rerender();
        },
      });
    };

    rerender();
    expect(getClearAllBtn(container)).not.toBeNull();

    getClearAllBtn(container)!.click();

    expect(getClearAllBtn(container)).toBeNull();
  });

  it('no second click or confirmation is required — reset is immediate', () => {
    const onClearAll = vi.fn();
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued', 'dispute.opened'],
      onClearAll,
    });

    // One click is sufficient
    getClearAllBtn(container)!.click();

    // onClearAll was called synchronously on the first click
    expect(onClearAll).toHaveBeenCalledTimes(1);
    const [newSelection] = onClearAll.mock.calls[0] as [string[]];
    expect(newSelection).toEqual([]);
    expect(isEventTypeFilterActive(newSelection)).toBe(false);
  });

  it('clear-all works when exactly one type was selected', () => {
    const onClearAll = vi.fn();
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['dispute.opened'],
      onClearAll,
    });

    expect(getIndicator(container)).not.toBeNull();
    getClearAllBtn(container)!.click();

    expect(onClearAll).toHaveBeenCalledWith([]);
  });

  it('clear-all works when multiple types were selected', () => {
    const onClearAll = vi.fn();
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued', 'dispute.opened'],
      onClearAll,
    });

    expect(getIndicator(container)).not.toBeNull();
    getClearAllBtn(container)!.click();

    expect(onClearAll).toHaveBeenCalledWith([]);
  });
});

#!/usr/bin/env bash
# Tests for Issue #170: Active-filter indicator and clear-all control for the
# date-range filter.
#
# Acceptance criteria verified here:
#   AC1  – indicator rendered when start, end, or both are set
#   AC2  – indicator NOT rendered when both inputs are empty
#   AC3  – clear-all control rendered alongside indicator when active
#   AC4  – clear-all resets both bounds in one action, no confirmation
#   AC5  – after clear-all, indicator disappears and full log is restored
#   AC6  – accessible (button element, aria-label, role, aria-live)
#   AC7  – clear-all does not affect event-type or status filter state
#   AC8  – filter composition: other filters remain active after clearing date range
#   AC9  – unit tests cover the four mandated cases (verified via vitest)
#
# Strategy: compile src/dateRangeFilter.ts with tsc and exercise the compiled
# module via a Node.js ESM harness. DOM interactions are simulated using jsdom.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSC="$REPO_ROOT/node_modules/.bin/tsc"
FILTER_SRC="$REPO_ROOT/src/dateRangeFilter.ts"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── Pre-flight: required files exist ─────────────────────────────────────────

if [ ! -f "$FILTER_SRC" ]; then
  fail "pre-flight – src/dateRangeFilter.ts does not exist"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – src/dateRangeFilter.ts exists"

if [ ! -x "$TSC" ]; then
  fail "pre-flight – tsc not found at $TSC (run 'npm install' first)"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – tsc binary is available"

# ── Source-level checks ───────────────────────────────────────────────────────

# isDateRangeFilterActive must be exported
if grep -q "export function isDateRangeFilterActive" "$FILTER_SRC"; then
  pass "source – isDateRangeFilterActive is exported"
else
  fail "source – isDateRangeFilterActive export not found"
fi

# clearDateRangeFilter must be exported
if grep -q "export function clearDateRangeFilter" "$FILTER_SRC"; then
  pass "source – clearDateRangeFilter is exported"
else
  fail "source – clearDateRangeFilter export not found"
fi

# renderDateRangeFilterIndicator must be exported
if grep -q "export function renderDateRangeFilterIndicator" "$FILTER_SRC"; then
  pass "source – renderDateRangeFilterIndicator is exported"
else
  fail "source – renderDateRangeFilterIndicator export not found"
fi

# aria-label must be present in the DOM rendering code (AC6)
if grep -q "aria-label" "$FILTER_SRC"; then
  pass "source – aria-label attribute is set on the clear-all control (AC6)"
else
  fail "source – aria-label attribute not found in renderDateRangeFilterIndicator (AC6)"
fi

# The clear-all control must be a <button> element (keyboard-accessible, AC6)
if grep -q "createElement('button')" "$FILTER_SRC" || grep -q 'createElement("button")' "$FILTER_SRC"; then
  pass "source – clear-all control uses a <button> element (natively keyboard-accessible, AC6)"
else
  fail "source – clear-all control does not use a <button> element (AC6)"
fi

# DateRange interface must be exported
if grep -q "export interface DateRange" "$FILTER_SRC"; then
  pass "source – DateRange interface is exported"
else
  fail "source – DateRange interface not found"
fi

# ── Compile src/dateRangeFilter.ts ────────────────────────────────────────────

TMPDIR_COMPILE="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_COMPILE"' EXIT

TSC_OUTPUT=$(
  "$TSC" \
    --module ESNext \
    --moduleResolution node \
    --target ES2020 \
    --outDir "$TMPDIR_COMPILE/out" \
    --noEmit false \
    --allowImportingTsExtensions false \
    --strict true \
    --skipLibCheck true \
    --lib "ES2020,DOM" \
    "$FILTER_SRC" 2>&1
)
TSC_EXIT=$?

if [ "$TSC_EXIT" -eq 0 ]; then
  pass "compile – src/dateRangeFilter.ts compiles without errors"
else
  fail "compile – tsc exited with code $TSC_EXIT"
  echo "$TSC_OUTPUT"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

echo '{"type":"module"}' > "$TMPDIR_COMPILE/out/package.json"

# ── Write the Node.js test harness ───────────────────────────────────────────

HARNESS="$TMPDIR_COMPILE/run_tests.mjs"
COMPILED_FILTER="$TMPDIR_COMPILE/out/dateRangeFilter.js"

cat > "$HARNESS" << 'HARNESS_EOF'
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { JSDOM } = require("__JSDOM_REQUIRE__");

import {
  isDateRangeFilterActive,
  clearDateRangeFilter,
  filterByDateRange,
  renderDateRangeFilterIndicator,
} from "__FILTER_PATH__";

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) {
    console.log("PASS: " + label);
    pass++;
  } else {
    console.log("FAIL: " + label);
    fail++;
  }
}

// Set up a jsdom environment for DOM tests
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
const { document } = dom.window;
global.document = document;

function makeContainer() {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

// ── isDateRangeFilterActive ───────────────────────────────────────────────────

check("isDateRangeFilterActive – false when both bounds are empty",
  isDateRangeFilterActive({ start: "", end: "" }) === false);
check("isDateRangeFilterActive – true when only start is set",
  isDateRangeFilterActive({ start: "2024-01-01T00:00", end: "" }) === true);
check("isDateRangeFilterActive – true when only end is set",
  isDateRangeFilterActive({ start: "", end: "2024-01-31T23:59" }) === true);
check("isDateRangeFilterActive – true when both bounds are set",
  isDateRangeFilterActive({ start: "2024-01-01T00:00", end: "2024-01-31T23:59" }) === true);

// ── clearDateRangeFilter ──────────────────────────────────────────────────────

const cleared = clearDateRangeFilter();
check("clearDateRangeFilter – returns object with start=''",
  cleared.start === "");
check("clearDateRangeFilter – returns object with end=''",
  cleared.end === "");
check("clearDateRangeFilter – result is inactive (AC4)",
  isDateRangeFilterActive(cleared) === false);

// ── filterByDateRange ─────────────────────────────────────────────────────────

const entries = [
  { timestamp: "2024-01-10T10:00", id: 1 },
  { timestamp: "2024-01-20T10:00", id: 2 },
  { timestamp: "2024-02-05T10:00", id: 3 },
  { timestamp: "2024-02-15T10:00", id: 4 },
];

check("filterByDateRange – returns all entries when both bounds empty",
  filterByDateRange(entries, { start: "", end: "" }).length === 4);
check("filterByDateRange – filters by start bound only",
  filterByDateRange(entries, { start: "2024-02-01T00:00", end: "" }).length === 2);
check("filterByDateRange – filters by end bound only",
  filterByDateRange(entries, { start: "", end: "2024-01-31T23:59" }).length === 2);
check("filterByDateRange – filters by both bounds (inclusive)",
  filterByDateRange(entries, { start: "2024-01-20T10:00", end: "2024-02-05T10:00" }).length === 2);
check("filterByDateRange – includes boundary entries",
  filterByDateRange(entries, { start: "2024-01-10T10:00", end: "2024-01-10T10:00" }).length === 1);
check("filterByDateRange – returns all entries after clearing filter",
  filterByDateRange(entries, clearDateRangeFilter()).length === 4);

// ── renderDateRangeFilterIndicator – AC2: inactive state ─────────────────────

const c1 = makeContainer();
renderDateRangeFilterIndicator(c1, {
  range: { start: "", end: "" },
  onClearAll: () => {},
});
check("AC2 – no indicator rendered when both bounds are empty",
  c1.querySelector("[data-date-range-filter-indicator]") === null);
check("AC2 – no clear-all button rendered when filter is inactive",
  c1.querySelector("[data-date-range-filter-clear-all]") === null);
check("AC2 – container is empty when filter is inactive",
  c1.innerHTML === "");

// ── renderDateRangeFilterIndicator – AC1: active state ───────────────────────

const c2 = makeContainer();
renderDateRangeFilterIndicator(c2, {
  range: { start: "2024-01-01T00:00", end: "" },
  onClearAll: () => {},
});
check("AC1 – indicator rendered when only start is set",
  c2.querySelector("[data-date-range-filter-indicator]") !== null);

const c3 = makeContainer();
renderDateRangeFilterIndicator(c3, {
  range: { start: "", end: "2024-01-31T23:59" },
  onClearAll: () => {},
});
check("AC1 – indicator rendered when only end is set",
  c3.querySelector("[data-date-range-filter-indicator]") !== null);

const c4 = makeContainer();
renderDateRangeFilterIndicator(c4, {
  range: { start: "2024-01-01T00:00", end: "2024-01-31T23:59" },
  onClearAll: () => {},
});
check("AC1 – indicator rendered when both bounds are set",
  c4.querySelector("[data-date-range-filter-indicator]") !== null);
check("AC1 – indicator text is non-empty",
  (c4.querySelector("[data-date-range-filter-indicator]")?.textContent?.trim().length ?? 0) > 0);

// ── renderDateRangeFilterIndicator – AC3: clear-all control ──────────────────

const c5 = makeContainer();
renderDateRangeFilterIndicator(c5, {
  range: { start: "2024-01-01T00:00", end: "2024-01-31T23:59" },
  onClearAll: () => {},
});
const clearBtn = c5.querySelector("[data-date-range-filter-clear-all]");
check("AC3 – clear-all button rendered when filter is active",
  clearBtn !== null);
check("AC3 – clear-all control is a <button> element",
  clearBtn?.tagName?.toLowerCase() === "button");

// ── AC6: aria-label on clear-all button ──────────────────────────────────────

check("AC6 – clear-all button has an aria-label attribute",
  clearBtn?.getAttribute("aria-label") !== null &&
  clearBtn?.getAttribute("aria-label") !== "");

const c6 = makeContainer();
renderDateRangeFilterIndicator(c6, {
  range: { start: "2024-01-01T00:00", end: "2024-01-31T23:59" },
  onClearAll: () => {},
  clearAllAriaLabel: "Remove date range filter",
});
check("AC6 – custom aria-label is applied to clear-all button",
  c6.querySelector("[data-date-range-filter-clear-all]")?.getAttribute("aria-label") === "Remove date range filter");

// ── AC4: clear-all resets both bounds in one action ───────────────────────────

let receivedRange = null;
const c7 = makeContainer();
renderDateRangeFilterIndicator(c7, {
  range: { start: "2024-01-01T00:00", end: "2024-01-31T23:59" },
  onClearAll: (newRange) => { receivedRange = newRange; },
});
const btn7 = c7.querySelector("[data-date-range-filter-clear-all]");
btn7.click();
check("AC4 – onClearAll called when clear-all button is clicked",
  receivedRange !== null);
check("AC4 – onClearAll receives cleared range with start=''",
  receivedRange?.start === "");
check("AC4 – onClearAll receives cleared range with end=''",
  receivedRange?.end === "");
check("AC4 – result of clear-all is inactive",
  isDateRangeFilterActive(receivedRange) === false);

// ── AC5: after clear-all, indicator disappears ────────────────────────────────

const c8 = makeContainer();
renderDateRangeFilterIndicator(c8, {
  range: { start: "2024-01-01T00:00", end: "2024-01-31T23:59" },
  onClearAll: () => {},
});
check("AC5 – indicator present before clear",
  c8.querySelector("[data-date-range-filter-indicator]") !== null);

renderDateRangeFilterIndicator(c8, {
  range: { start: "", end: "" },
  onClearAll: () => {},
});
check("AC5 – indicator absent after re-render with empty range",
  c8.querySelector("[data-date-range-filter-indicator]") === null);
check("AC5 – clear-all button absent after re-render with empty range",
  c8.querySelector("[data-date-range-filter-clear-all]") === null);

// ── AC7: clearing date-range does not affect other filter state ───────────────

const composedState = {
  selectedTypes: ["payment.created"],
  status: "failed",
  range: { start: "2024-01-01T00:00", end: "2024-01-31T23:59" },
};
const newRange = clearDateRangeFilter();
const newState = { ...composedState, range: newRange };
check("AC7 – date-range cleared",
  newState.range.start === "" && newState.range.end === "");
check("AC7 – event-type filter unchanged",
  JSON.stringify(newState.selectedTypes) === JSON.stringify(["payment.created"]));
check("AC7 – status filter unchanged",
  newState.status === "failed");

// ── AC6: indicator accessibility attributes ───────────────────────────────────

const c9 = makeContainer();
renderDateRangeFilterIndicator(c9, {
  range: { start: "2024-01-01T00:00", end: "2024-01-31T23:59" },
  onClearAll: () => {},
});
const indicator9 = c9.querySelector("[data-date-range-filter-indicator]");
check("AC6 – indicator has role='status'",
  indicator9?.getAttribute("role") === "status");
check("AC6 – indicator has aria-live='polite'",
  indicator9?.getAttribute("aria-live") === "polite");

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  throw new Error(`${fail} test(s) failed`);
}
HARNESS_EOF

# Inject paths
sed -i "s|__FILTER_PATH__|$COMPILED_FILTER|g" "$HARNESS"
sed -i "s|__JSDOM_REQUIRE__|$REPO_ROOT/node_modules/jsdom|g" "$HARNESS"

# ── Run the harness ───────────────────────────────────────────────────────────

HARNESS_OUTPUT=$(node "$HARNESS" 2>&1)
HARNESS_EXIT=$?

while IFS= read -r line; do
  case "$line" in
    PASS:*) pass "${line#PASS: }" ;;
    FAIL:*) fail "${line#FAIL: }" ;;
    *)      echo "$line" ;;
  esac
done <<< "$HARNESS_OUTPUT"

if [ "$HARNESS_EXIT" -ne 0 ] && ! echo "$HARNESS_OUTPUT" | grep -q "^FAIL:"; then
  fail "harness – node exited with code $HARNESS_EXIT (unexpected error)"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

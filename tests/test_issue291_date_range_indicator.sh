#!/usr/bin/env bash
# Tests for Issue #291: Date-range filter active-filter indicator implementation.
#
# Spec ref: spec § "Event log filtering — Date-range filter"
#   "Active-filter indicator: while a date range is set, a visible indicator
#    confirms the filter is active; a clear-all control removes the range in
#    one action."
#
# Acceptance criteria verified here:
#   AC1  – visible indicator rendered when start and/or end is active
#   AC2  – indicator NOT rendered when both inputs are empty/cleared
#   AC3  – clear-all control present alongside the indicator
#   AC4  – clicking clear-all resets both inputs and removes the indicator
#   AC5  – after clearing, the full unfiltered event log is restored
#   AC6  – boundary entries (timestamp == start or == end) are included
#   AC7  – date-range indicator/clear-all works with event-type and status filters
#   AC8  – unit tests: indicator appears/disappears, clear-all resets inputs,
#           boundary entries included/excluded
#
# Strategy: static source-level checks on src/dateRangeFilter.ts, then compile
# with tsc and exercise the compiled module via a Node.js ESM harness using
# jsdom (available as a project devDependency).

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

# ── Source-level checks (AC1–AC4, AC8) ───────────────────────────────────────

# isDateRangeFilterActive must be exported (AC1/AC2)
if grep -q "export function isDateRangeFilterActive" "$FILTER_SRC"; then
  pass "source – isDateRangeFilterActive is exported (AC1/AC2)"
else
  fail "source – isDateRangeFilterActive export not found (AC1/AC2)"
fi

# clearDateRangeFilter must be exported (AC4)
if grep -q "export function clearDateRangeFilter" "$FILTER_SRC"; then
  pass "source – clearDateRangeFilter is exported (AC4)"
else
  fail "source – clearDateRangeFilter export not found (AC4)"
fi

# filterByDateRange must be exported (AC5/AC6)
if grep -q "export function filterByDateRange" "$FILTER_SRC"; then
  pass "source – filterByDateRange is exported (AC5/AC6)"
else
  fail "source – filterByDateRange export not found (AC5/AC6)"
fi

# renderDateRangeFilterIndicator must be exported (AC1/AC3)
if grep -q "export function renderDateRangeFilterIndicator" "$FILTER_SRC"; then
  pass "source – renderDateRangeFilterIndicator is exported (AC1/AC3)"
else
  fail "source – renderDateRangeFilterIndicator export not found (AC1/AC3)"
fi

# renderDateRangeFilterInputs must be exported (AC4 DOM round-trip)
if grep -q "export function renderDateRangeFilterInputs" "$FILTER_SRC"; then
  pass "source – renderDateRangeFilterInputs is exported (AC4)"
else
  fail "source – renderDateRangeFilterInputs export not found (AC4)"
fi

# The indicator must use a data attribute for testability (AC1)
if grep -q "data-date-range-filter-indicator" "$FILTER_SRC" || \
   grep -q "dateRangeFilterIndicator" "$FILTER_SRC"; then
  pass "source – data-date-range-filter-indicator attribute present in indicator rendering (AC1)"
else
  fail "source – data-date-range-filter-indicator attribute not found in source (AC1)"
fi

# The clear-all control must use a data attribute for testability (AC3)
if grep -q "data-date-range-filter-clear-all" "$FILTER_SRC" || \
   grep -q "dateRangeFilterClearAll" "$FILTER_SRC"; then
  pass "source – data-date-range-filter-clear-all attribute present in clear-all rendering (AC3)"
else
  fail "source – data-date-range-filter-clear-all attribute not found in source (AC3)"
fi

# The clear-all control must be a <button> element (keyboard-accessible, AC3)
if grep -q "createElement('button')" "$FILTER_SRC" || \
   grep -q 'createElement("button")' "$FILTER_SRC"; then
  pass "source – clear-all control uses a <button> element (natively keyboard-accessible, AC3)"
else
  fail "source – clear-all control does not use a <button> element (AC3)"
fi

# aria-label must be present on the clear-all button (AC3 accessibility)
if grep -q "aria-label" "$FILTER_SRC"; then
  pass "source – aria-label attribute is set on the clear-all control (AC3)"
else
  fail "source – aria-label attribute not found in renderDateRangeFilterIndicator (AC3)"
fi

# Boundary inclusion: the filter must use >= and <= (not > and <) (AC6)
if grep -qE "ts >= startMs" "$FILTER_SRC" && grep -qE "ts <= endMs" "$FILTER_SRC"; then
  pass "source – boundary entries included via >= and <= comparisons (AC6)"
else
  fail "source – boundary-inclusive comparisons (>= startMs && <= endMs) not found (AC6)"
fi

# The start/end inputs must use data attributes for testability (AC4)
if grep -q "data-date-range-start" "$FILTER_SRC" || \
   grep -q "dateRangeStart" "$FILTER_SRC"; then
  pass "source – data-date-range-start attribute present on start input (AC4)"
else
  fail "source – data-date-range-start attribute not found in source (AC4)"
fi

if grep -q "data-date-range-end" "$FILTER_SRC" || \
   grep -q "dateRangeEnd" "$FILTER_SRC"; then
  pass "source – data-date-range-end attribute present on end input (AC4)"
else
  fail "source – data-date-range-end attribute not found in source (AC4)"
fi

# ── Compile src/dateRangeFilter.ts (and its dependency delivery-events.ts) ───

TMPDIR_COMPILE="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_COMPILE"' EXIT

DELIVERY_EVENTS_SRC="$REPO_ROOT/src/delivery-events.ts"

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
    "$DELIVERY_EVENTS_SRC" \
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
COMPILED_DELIVERY="$TMPDIR_COMPILE/out/delivery-events.js"

# Patch the compiled dateRangeFilter.js to use the full path for delivery-events
# (tsc emits bare specifiers without .js when moduleResolution is node)
patch_import() {
  sed -i "s|from './delivery-events'|from '$COMPILED_DELIVERY'|g" "$COMPILED_FILTER"
  sed -i 's|from "\./delivery-events"|from "'"$COMPILED_DELIVERY"'"|g' "$COMPILED_FILTER"
}
patch_import

cat > "$HARNESS" << 'HARNESS_EOF'
// Load jsdom via createRequire (jsdom is CJS; this harness is ESM).
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { JSDOM } = require("__JSDOM_REQUIRE__");

import {
  filterByDateRange,
  isDateRangeFilterActive,
  clearDateRangeFilter,
  renderDateRangeFilterIndicator,
  renderDateRangeFilterInputs,
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

// Set up a jsdom environment for DOM tests.
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
const { document } = dom.window;
global.document = document;

function makeContainer() {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

// ── Fixture ───────────────────────────────────────────────────────────────────

function entry(id, timestamp, eventType = "payment.created", status = "delivered") {
  return { id, timestamp, eventType, status };
}

const FIXTURE = [
  entry(1, "2024-03-01T10:00:00.000Z", "payment.created", "delivered"),
  entry(2, "2024-03-15T12:00:00.000Z", "refund.issued",   "failed"),
  entry(3, "2024-03-31T23:59:59.000Z", "payment.created", "delivered"),
  entry(4, "2024-04-10T08:00:00.000Z", "dispute.opened",  "pending"),
  entry(5, "2024-04-30T00:00:00.000Z", "refund.issued",   "exhausted"),
];

// ── isDateRangeFilterActive ───────────────────────────────────────────────────

check("isDateRangeFilterActive – false for empty range {}",
  isDateRangeFilterActive({}) === false);
check("isDateRangeFilterActive – false for {start:'',end:''}",
  isDateRangeFilterActive({ start: "", end: "" }) === false);
check("isDateRangeFilterActive – true when start is set",
  isDateRangeFilterActive({ start: "2024-03-01T00:00" }) === true);
check("isDateRangeFilterActive – true when end is set",
  isDateRangeFilterActive({ end: "2024-03-31T23:59" }) === true);
check("isDateRangeFilterActive – true when both are set",
  isDateRangeFilterActive({ start: "2024-03-01T00:00", end: "2024-03-31T23:59" }) === true);

// ── clearDateRangeFilter ──────────────────────────────────────────────────────

const cleared = clearDateRangeFilter();
check("clearDateRangeFilter – start is empty string",
  cleared.start === "");
check("clearDateRangeFilter – end is empty string",
  cleared.end === "");
check("clearDateRangeFilter – result is immediately inactive",
  isDateRangeFilterActive(cleared) === false);

// ── filterByDateRange – no filter active (AC5) ────────────────────────────────

check("AC5 – filterByDateRange with {} returns original array reference",
  filterByDateRange(FIXTURE, {}) === FIXTURE);
check("AC5 – filterByDateRange with cleared range returns original array reference",
  filterByDateRange(FIXTURE, clearDateRangeFilter()) === FIXTURE);
check("AC5 – filterByDateRange with cleared range returns all entries",
  filterByDateRange(FIXTURE, clearDateRangeFilter()).length === FIXTURE.length);

// ── filterByDateRange – range applied ─────────────────────────────────────────

const marchRange = { start: "2024-03-01T00:00:00.000Z", end: "2024-03-31T23:59:59.999Z" };
const marchResult = filterByDateRange(FIXTURE, marchRange);
check("AC5 – applying range filters to 3 entries in March",
  marchResult.length === 3);
check("AC5 – filtered entries have correct IDs (1, 2, 3)",
  marchResult.map(e => e.id).join(",") === "1,2,3");

// ── AC6: boundary entries included ────────────────────────────────────────────

const START_TS = "2024-03-15T12:00:00.000Z"; // entry 2
const END_TS   = "2024-03-31T23:59:59.000Z"; // entry 3
const boundaryRange = { start: START_TS, end: END_TS };
const boundaryResult = filterByDateRange(FIXTURE, boundaryRange);

check("AC6 – entry at exact start timestamp is included",
  boundaryResult.some(e => e.id === 2));
check("AC6 – entry at exact end timestamp is included",
  boundaryResult.some(e => e.id === 3));

// 1 ms before start is excluded
const beforeStart = new Date(new Date(START_TS).getTime() - 1).toISOString();
const afterEnd    = new Date(new Date(END_TS).getTime() + 1).toISOString();
const edgeEntries = [
  entry(10, beforeStart),
  entry(11, START_TS),
  entry(12, END_TS),
  entry(13, afterEnd),
];
const edgeResult = filterByDateRange(edgeEntries, boundaryRange);
check("AC6 – entry 1 ms before start is excluded",
  !edgeResult.some(e => e.id === 10));
check("AC6 – entry at exact start is included",
  edgeResult.some(e => e.id === 11));
check("AC6 – entry at exact end is included",
  edgeResult.some(e => e.id === 12));
check("AC6 – entry 1 ms after end is excluded",
  !edgeResult.some(e => e.id === 13));

// Single-entry range (start === end)
const singleResult = filterByDateRange(FIXTURE, { start: START_TS, end: START_TS });
check("AC6 – single-entry range (start === end) returns exactly that entry",
  singleResult.length === 1 && singleResult[0].id === 2);

// ── AC1: indicator rendered when filter is active ─────────────────────────────

const c1 = makeContainer();
renderDateRangeFilterIndicator(c1, {
  range: { start: "2024-03-01T00:00" },
  onClearAll: () => {},
});
check("AC1 – indicator rendered when start is set",
  c1.querySelector("[data-date-range-filter-indicator]") !== null);

const c2 = makeContainer();
renderDateRangeFilterIndicator(c2, {
  range: { end: "2024-03-31T23:59" },
  onClearAll: () => {},
});
check("AC1 – indicator rendered when end is set",
  c2.querySelector("[data-date-range-filter-indicator]") !== null);

const c3 = makeContainer();
renderDateRangeFilterIndicator(c3, {
  range: { start: "2024-03-01T00:00", end: "2024-03-31T23:59" },
  onClearAll: () => {},
});
check("AC1 – indicator rendered when both start and end are set",
  c3.querySelector("[data-date-range-filter-indicator]") !== null);

// Indicator text must be non-empty (visible to users)
const indicatorText = c3.querySelector("[data-date-range-filter-indicator]")?.textContent?.trim();
check("AC1 – indicator text is non-empty (visible to users)",
  typeof indicatorText === "string" && indicatorText.length > 0);

// ── AC2: indicator NOT rendered when both inputs are empty/cleared ─────────────

const c4 = makeContainer();
renderDateRangeFilterIndicator(c4, {
  range: {},
  onClearAll: () => {},
});
check("AC2 – container is empty when range is {}",
  c4.innerHTML === "");
check("AC2 – no indicator element when range is {}",
  c4.querySelector("[data-date-range-filter-indicator]") === null);

const c5 = makeContainer();
renderDateRangeFilterIndicator(c5, {
  range: { start: "", end: "" },
  onClearAll: () => {},
});
check("AC2 – container is empty when both start and end are empty strings",
  c5.innerHTML === "");

const c6 = makeContainer();
renderDateRangeFilterIndicator(c6, {
  range: clearDateRangeFilter(),
  onClearAll: () => {},
});
check("AC2 – container is empty when range is clearDateRangeFilter()",
  c6.innerHTML === "");

// ── AC3: clear-all control present alongside the indicator ────────────────────

const c7 = makeContainer();
renderDateRangeFilterIndicator(c7, {
  range: { start: "2024-03-01T00:00" },
  onClearAll: () => {},
});
const clearBtn = c7.querySelector("[data-date-range-filter-clear-all]");
check("AC3 – clear-all button rendered when filter is active",
  clearBtn !== null);
check("AC3 – clear-all control is a <button> element",
  clearBtn?.tagName?.toLowerCase() === "button");
check("AC3 – clear-all button has type='button'",
  clearBtn?.getAttribute("type") === "button");
check("AC3 – clear-all button has a non-empty aria-label",
  typeof clearBtn?.getAttribute("aria-label") === "string" &&
  clearBtn?.getAttribute("aria-label").length > 0);

// Clear-all button NOT rendered when filter is inactive
const c8 = makeContainer();
renderDateRangeFilterIndicator(c8, {
  range: {},
  onClearAll: () => {},
});
check("AC3 – clear-all button NOT rendered when filter is inactive",
  c8.querySelector("[data-date-range-filter-clear-all]") === null);

// ── AC4: clicking clear-all resets both inputs and removes the indicator ───────

let receivedRange = null;
const c9 = makeContainer();
renderDateRangeFilterIndicator(c9, {
  range: { start: "2024-03-01T00:00", end: "2024-03-31T23:59" },
  onClearAll: (newRange) => { receivedRange = newRange; },
});
const btn9 = c9.querySelector("[data-date-range-filter-clear-all]");
btn9.click();
check("AC4 – onClearAll called when clear-all button is clicked",
  receivedRange !== null);
check("AC4 – onClearAll receives range with start as empty string",
  receivedRange?.start === "");
check("AC4 – onClearAll receives range with end as empty string",
  receivedRange?.end === "");
check("AC4 – cleared range passed to onClearAll is immediately inactive",
  isDateRangeFilterActive(receivedRange) === false);

// Re-rendering with cleared range removes the indicator
const c10 = makeContainer();
renderDateRangeFilterIndicator(c10, {
  range: { start: "2024-03-01T00:00" },
  onClearAll: () => {},
});
check("AC4 – indicator present before clear",
  c10.querySelector("[data-date-range-filter-indicator]") !== null);
renderDateRangeFilterIndicator(c10, {
  range: clearDateRangeFilter(),
  onClearAll: () => {},
});
check("AC4 – indicator removed after re-render with cleared range",
  c10.querySelector("[data-date-range-filter-indicator]") === null);
check("AC4 – clear-all button removed after re-render with cleared range",
  c10.querySelector("[data-date-range-filter-clear-all]") === null);
check("AC4 – container is empty after re-render with cleared range",
  c10.innerHTML === "");

// ── AC4: renderDateRangeFilterInputs – inputs render with correct values ───────

const c11 = makeContainer();
renderDateRangeFilterInputs(c11, {
  range: { start: "2024-03-01T00:00", end: "2024-03-31T23:59" },
  onChange: () => {},
});
const startInput = c11.querySelector("[data-date-range-start]");
const endInput   = c11.querySelector("[data-date-range-end]");
check("AC4 – start input rendered with correct value",
  startInput?.value === "2024-03-01T00:00");
check("AC4 – end input rendered with correct value",
  endInput?.value === "2024-03-31T23:59");

// Inputs render as empty when range is cleared
const c12 = makeContainer();
renderDateRangeFilterInputs(c12, {
  range: clearDateRangeFilter(),
  onChange: () => {},
});
const startInputCleared = c12.querySelector("[data-date-range-start]");
const endInputCleared   = c12.querySelector("[data-date-range-end]");
check("AC4 – start input is empty after clear",
  startInputCleared?.value === "");
check("AC4 – end input is empty after clear",
  endInputCleared?.value === "");

// ── AC7: filter composition – date-range + event-type ─────────────────────────

// Simulate event-type filter (pure JS, no import needed)
function filterByEventTypes(entries, types) {
  if (!types || types.length === 0) return entries;
  return entries.filter(e => types.includes(e.eventType));
}

const dateFiltered = filterByDateRange(FIXTURE, marchRange);
const typeFiltered = filterByEventTypes(dateFiltered, ["payment.created"]);
check("AC7 – date-range + event-type: only entries matching both are shown",
  typeFiltered.length === 2 && typeFiltered.map(e => e.id).join(",") === "1,3");

// Clearing date-range while event-type filter is active
const typeOnly = filterByEventTypes(FIXTURE, ["refund.issued"]);
const dateCleared = filterByDateRange(typeOnly, clearDateRangeFilter());
check("AC7 – clearing date-range while event-type active: event-type still applied",
  dateCleared.length === 2 && dateCleared.map(e => e.id).join(",") === "2,5");

// date-range + status filter
const aprilRange = { start: "2024-04-01T00:00:00.000Z", end: "2024-04-30T23:59:59.999Z" };
const aprilFiltered = filterByDateRange(FIXTURE, aprilRange);
const pendingFiltered = aprilFiltered.filter(e => e.status === "pending");
check("AC7 – date-range + status: only entries matching both are shown",
  pendingFiltered.length === 1 && pendingFiltered[0].id === 4);

// Three-way: date-range + event-type + status
const allRange = { start: "2024-03-01T00:00:00.000Z", end: "2024-04-30T23:59:59.999Z" };
const allDateFiltered  = filterByDateRange(FIXTURE, allRange);
const allTypeFiltered  = filterByEventTypes(allDateFiltered, ["payment.created"]);
const allStatusFiltered = allTypeFiltered.filter(e => e.status === "delivered");
check("AC7 – three-way composition: date-range + event-type + status",
  allStatusFiltered.length === 2 &&
  allStatusFiltered.map(e => e.id).join(",") === "1,3");

// ── AC8: mandated unit-test cases ─────────────────────────────────────────────

// AC8a: indicator appears when range is set
const c13 = makeContainer();
renderDateRangeFilterIndicator(c13, {
  range: { start: "2024-03-01T00:00" },
  onClearAll: () => {},
});
check("AC8a – indicator appears when range is set (start only)",
  c13.querySelector("[data-date-range-filter-indicator]") !== null);

// AC8b: indicator disappears when range is cleared
renderDateRangeFilterIndicator(c13, {
  range: clearDateRangeFilter(),
  onClearAll: () => {},
});
check("AC8b – indicator disappears when range is cleared",
  c13.querySelector("[data-date-range-filter-indicator]") === null);

// AC8c: clear-all resets both inputs
let ac8cRange = null;
const c14 = makeContainer();
renderDateRangeFilterIndicator(c14, {
  range: { start: "2024-03-01T00:00", end: "2024-03-31T23:59" },
  onClearAll: (r) => { ac8cRange = r; },
});
c14.querySelector("[data-date-range-filter-clear-all]").click();
check("AC8c – clear-all resets start to empty string",
  ac8cRange?.start === "");
check("AC8c – clear-all resets end to empty string",
  ac8cRange?.end === "");

// AC8d: boundary entries included/excluded
const ac8dStart = "2024-03-15T12:00:00.000Z";
const ac8dEnd   = "2024-03-31T23:59:59.000Z";
const ac8dRange = { start: ac8dStart, end: ac8dEnd };
const ac8dResult = filterByDateRange(FIXTURE, ac8dRange);
check("AC8d – boundary entry (timestamp == start) is included",
  ac8dResult.some(e => e.id === 2));
check("AC8d – boundary entry (timestamp == end) is included",
  ac8dResult.some(e => e.id === 3));
const ac8dBefore = new Date(new Date(ac8dStart).getTime() - 1).toISOString();
const ac8dAfter  = new Date(new Date(ac8dEnd).getTime() + 1).toISOString();
const ac8dEdge = [entry(20, ac8dBefore), entry(21, ac8dStart), entry(22, ac8dEnd), entry(23, ac8dAfter)];
const ac8dEdgeResult = filterByDateRange(ac8dEdge, ac8dRange);
check("AC8d – entry 1 ms before start is excluded",
  !ac8dEdgeResult.some(e => e.id === 20));
check("AC8d – entry 1 ms after end is excluded",
  !ac8dEdgeResult.some(e => e.id === 23));

// ── Edge cases ────────────────────────────────────────────────────────────────

check("edge – filterByDateRange with empty entries list returns empty array",
  filterByDateRange([], marchRange).length === 0);
check("edge – filterByDateRange with empty entries and no range returns empty array",
  filterByDateRange([], {}).length === 0);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  throw new Error(`${fail} test(s) failed`);
}
HARNESS_EOF

# Inject paths (use | as delimiter to avoid / conflicts in paths)
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

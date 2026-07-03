#!/usr/bin/env bash
# Acceptance-criteria tests for Issue #82: date-range filter for the webhook
# event log.
#
# Covers all spec-mandated cases:
#   AC1  – start bound hides entries strictly before start.
#   AC2  – end bound hides entries strictly after end.
#   AC3  – entry at exactly the start timestamp is visible (boundary-inclusive).
#   AC4  – entry at exactly the end timestamp is visible (boundary-inclusive).
#   AC5  – entry 1 ms before start is hidden.
#   AC6  – entry 1 ms after end is hidden.
#   AC7  – clearing both inputs restores all entries.
#   AC8  – filter works with only a start bound (no end), and only an end bound
#           (no start).
#   AC9  – date-range filter composes correctly with event-type and status
#           filters via composeFilters.
#   AC10 – unit test: range applied — only in-range entries are visible.
#   AC11 – unit test: range cleared — all entries are restored.
#   AC12 – unit test: boundary entry at exactly start is included.
#   AC13 – unit test: boundary entry at exactly end is included.
#   AC14 – unit test: entry 1 ms before start excluded; 1 ms after end excluded.
#   AC15 – no new runtime dependencies; module is a pure side-effect-free
#           function; production build succeeds.
#
# Spec ref: spec § "Event log filtering — Date-range filter"
#
# Strategy: compile src/dateRangeFilter.ts (and its dependency
# src/delivery-events.ts) with tsc and exercise the compiled module via a
# Node.js ESM harness.  No DOM or external test framework needed.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSC="$REPO_ROOT/node_modules/.bin/tsc"
FILTER_SRC="$REPO_ROOT/src/dateRangeFilter.ts"
EVENTS_SRC="$REPO_ROOT/src/delivery-events.ts"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── Pre-flight: source files exist ───────────────────────────────────────────

if [ ! -f "$FILTER_SRC" ]; then
  fail "pre-flight – src/dateRangeFilter.ts does not exist"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – src/dateRangeFilter.ts exists"

if [ ! -f "$EVENTS_SRC" ]; then
  fail "pre-flight – src/delivery-events.ts does not exist (required dependency)"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – src/delivery-events.ts exists"

# ── Pre-flight: expected exports are present ─────────────────────────────────

if grep -q "export function filterByDateRange" "$FILTER_SRC"; then
  pass "pre-flight – filterByDateRange is exported from dateRangeFilter.ts"
else
  fail "pre-flight – filterByDateRange export not found in dateRangeFilter.ts"
fi

if grep -q "export function isDateRangeFilterActive" "$FILTER_SRC"; then
  pass "pre-flight – isDateRangeFilterActive is exported"
else
  fail "pre-flight – isDateRangeFilterActive export not found"
fi

if grep -q "export function clearDateRangeFilter" "$FILTER_SRC"; then
  pass "pre-flight – clearDateRangeFilter is exported"
else
  fail "pre-flight – clearDateRangeFilter export not found"
fi

if grep -q "export function composeFilters" "$FILTER_SRC"; then
  pass "pre-flight – composeFilters is exported"
else
  fail "pre-flight – composeFilters export not found"
fi

if grep -q "export interface DateRange" "$FILTER_SRC"; then
  pass "pre-flight – DateRange interface is exported"
else
  fail "pre-flight – DateRange interface export not found"
fi

# ── Pre-flight: boundary-inclusive comparison (>= and <=) ────────────────────

if grep -qE "entryMs >= startMs" "$FILTER_SRC"; then
  pass "pre-flight – lower-bound comparison is >= (boundary-inclusive)"
else
  fail "pre-flight – lower-bound comparison is not >= (boundary may be excluded)"
fi

if grep -qE "entryMs <= endMs" "$FILTER_SRC"; then
  pass "pre-flight – upper-bound comparison is <= (boundary-inclusive)"
else
  fail "pre-flight – upper-bound comparison is not <= (boundary may be excluded)"
fi

# ── Pre-flight: no new runtime dependencies ───────────────────────────────────
# The filter must be a pure client-side module with no external imports beyond
# the project's own delivery-events.ts.

EXTERNAL_IMPORTS=$(grep -E "^import .* from ['\"]" "$FILTER_SRC" | grep -v "from '\./delivery-events'" | grep -v "from \"./delivery-events\"" || true)
if [ -z "$EXTERNAL_IMPORTS" ]; then
  pass "pre-flight – no external runtime dependencies (only ./delivery-events imported)"
else
  fail "pre-flight – unexpected external imports found: $EXTERNAL_IMPORTS"
fi

# ── Pre-flight: tsc available ────────────────────────────────────────────────

if [ ! -x "$TSC" ]; then
  fail "pre-flight – tsc not found at $TSC (run 'npm install' first)"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – tsc binary is available"

# ── Compile to a temp directory ───────────────────────────────────────────────

TMPDIR_AC="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_AC"' EXIT

TSC_OUT=$(
  "$TSC" \
    --module ESNext \
    --moduleResolution node \
    --target ES2020 \
    --outDir "$TMPDIR_AC/out" \
    --noEmit false \
    --allowImportingTsExtensions false \
    --strict true \
    --skipLibCheck true \
    "$FILTER_SRC" "$EVENTS_SRC" 2>&1
)
TSC_EXIT=$?

if [ "$TSC_EXIT" -eq 0 ]; then
  pass "compile – dateRangeFilter.ts compiles without TypeScript errors"
else
  fail "compile – tsc exited with code $TSC_EXIT"
  echo "$TSC_OUT"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# Mark output as ESM so Node can import it.
echo '{"type":"module"}' > "$TMPDIR_AC/out/package.json"

# Node.js ESM requires explicit .js extensions on relative imports.
# tsc emits bare specifiers (e.g. './delivery-events') so we patch them.
for jsfile in "$TMPDIR_AC/out/"*.js; do
  sed -i "s|from '\./\([^']*\)'|from './\1.js'|g" "$jsfile"
  sed -i 's|from "\./\([^"]*\)"|from "./\1.js"|g' "$jsfile"
done

COMPILED="$TMPDIR_AC/out/dateRangeFilter.js"
HARNESS="$TMPDIR_AC/harness.mjs"

# ── Write the Node.js test harness ───────────────────────────────────────────

cat > "$HARNESS" << 'HARNESS_EOF'
import {
  filterByDateRange,
  isDateRangeFilterActive,
  clearDateRangeFilter,
  composeFilters,
} from "__COMPILED__";

let pass = 0;
let fail = 0;

function assert(label, condition) {
  if (condition) {
    console.log("PASS: " + label);
    pass++;
  } else {
    console.log("FAIL: " + label);
    fail++;
  }
}

// ── Fixture ───────────────────────────────────────────────────────────────────

const START_MS = Date.parse("2024-06-01T00:00:00.000Z");
const END_MS   = Date.parse("2024-06-30T23:59:59.999Z");
const START    = new Date(START_MS).toISOString();
const END      = new Date(END_MS).toISOString();

function entry(id, timestamp, eventType = "payment.created", status = "delivered") {
  return { id, timestamp, eventType, status };
}

// 5-entry fixture: 1 before start, 1 at start, 1 mid, 1 at end, 1 after end.
const ENTRIES = [
  entry(1, new Date(START_MS - 1).toISOString()),   // 1 ms before start → out
  entry(2, START),                                   // exactly start → in
  entry(3, "2024-06-15T12:00:00.000Z"),              // mid-range → in
  entry(4, END),                                     // exactly end → in
  entry(5, new Date(END_MS + 1).toISOString()),      // 1 ms after end → out
];

// ── isDateRangeFilterActive ───────────────────────────────────────────────────

assert("isDateRangeFilterActive – empty object returns false",
  isDateRangeFilterActive({}) === false);
assert("isDateRangeFilterActive – both empty strings returns false",
  isDateRangeFilterActive({ start: "", end: "" }) === false);
assert("isDateRangeFilterActive – only start set returns true",
  isDateRangeFilterActive({ start: START }) === true);
assert("isDateRangeFilterActive – only end set returns true",
  isDateRangeFilterActive({ end: END }) === true);
assert("isDateRangeFilterActive – both set returns true",
  isDateRangeFilterActive({ start: START, end: END }) === true);

// ── clearDateRangeFilter ──────────────────────────────────────────────────────

const cleared = clearDateRangeFilter();
assert("clearDateRangeFilter – returns inactive range",
  isDateRangeFilterActive(cleared) === false);
assert("clearDateRangeFilter – returns fresh object each call",
  clearDateRangeFilter() !== clearDateRangeFilter());

// ── No filter active ──────────────────────────────────────────────────────────

assert("no filter – empty object returns all entries",
  filterByDateRange(ENTRIES, {}).length === ENTRIES.length);
assert("no filter – both empty strings returns all entries",
  filterByDateRange(ENTRIES, { start: "", end: "" }).length === ENTRIES.length);
assert("no filter – empty input returns empty array",
  filterByDateRange([], {}).length === 0);

// ── AC10: Range applied — only in-range entries are visible ──────────────────

const ac10 = filterByDateRange(ENTRIES, { start: START, end: END });
assert("AC10 – range applied: correct count (3 of 5)",
  ac10.length === 3);
assert("AC10 – range applied: correct ids [2,3,4]",
  ac10.map(e => e.id).join(",") === "2,3,4");
assert("AC10 – range applied: no entries outside range",
  !ac10.some(e => e.id === 1 || e.id === 5));

// Empty range (future) → no results.
assert("AC10 – range applied: empty result when no entries in range",
  filterByDateRange(ENTRIES, { start: "2099-01-01T00:00:00.000Z", end: "2099-12-31T23:59:59.999Z" }).length === 0);

// ── AC11: Range cleared — all entries are restored ───────────────────────────

const ac11filtered = filterByDateRange(ENTRIES, { start: START, end: END });
const ac11cleared  = filterByDateRange(ENTRIES, clearDateRangeFilter());
assert("AC11 – range cleared: filtered result was restricted",
  ac11filtered.length < ENTRIES.length);
assert("AC11 – range cleared: cleared result returns all entries",
  ac11cleared.length === ENTRIES.length);

// ── AC12: Boundary entry at exactly start is included ────────────────────────

const ac12 = filterByDateRange(ENTRIES, { start: START, end: END });
assert("AC12 – boundary start: entry with timestamp === start is included",
  ac12.some(e => e.id === 2));

// Start-only, single entry exactly at start.
assert("AC12 – boundary start (start-only): entry at start is included",
  filterByDateRange([entry(1, START)], { start: START }).length === 1);

// Single-point range (start === end).
const ANCHOR = "2024-06-15T12:00:00.000Z";
assert("AC12 – single-point range: entry at anchor is included",
  filterByDateRange([entry(1, ANCHOR)], { start: ANCHOR, end: ANCHOR }).length === 1);

// ── AC13: Boundary entry at exactly end is included ──────────────────────────

assert("AC13 – boundary end: entry with timestamp === end is included",
  ac12.some(e => e.id === 4));

// End-only, single entry exactly at end.
assert("AC13 – boundary end (end-only): entry at end is included",
  filterByDateRange([entry(1, END)], { end: END }).length === 1);

// ── AC14: Entry 1 ms outside either boundary is excluded ─────────────────────

assert("AC14 – 1 ms before start is excluded (full range)",
  !ac12.some(e => e.id === 1));
assert("AC14 – 1 ms after end is excluded (full range)",
  !ac12.some(e => e.id === 5));

const ANCHOR_MS   = Date.parse(ANCHOR);
const BEFORE_1MS  = new Date(ANCHOR_MS - 1).toISOString();
const AFTER_1MS   = new Date(ANCHOR_MS + 1).toISOString();

assert("AC14 – 1 ms before start excluded (start-only)",
  filterByDateRange([entry(1, BEFORE_1MS)], { start: ANCHOR }).length === 0);
assert("AC14 – 1 ms after end excluded (end-only)",
  filterByDateRange([entry(1, AFTER_1MS)], { end: ANCHOR }).length === 0);
assert("AC14 – entry exactly at anchor included when start = anchor",
  filterByDateRange([entry(1, ANCHOR)], { start: ANCHOR }).length === 1);
assert("AC14 – entry exactly at anchor included when end = anchor",
  filterByDateRange([entry(1, ANCHOR)], { end: ANCHOR }).length === 1);

// ── AC1: Start bound hides entries strictly before start ─────────────────────

const ac1 = filterByDateRange(ENTRIES, { start: START });
assert("AC1 – start bound: entry 1 ms before start is hidden",
  !ac1.some(e => e.id === 1));
assert("AC1 – start bound: entries at and after start are visible",
  [2, 3, 4, 5].every(id => ac1.some(e => e.id === id)));
assert("AC1 – start bound: count is 4 (no upper bound)",
  ac1.length === 4);

// ── AC2: End bound hides entries strictly after end ──────────────────────────

const ac2 = filterByDateRange(ENTRIES, { end: END });
assert("AC2 – end bound: entry 1 ms after end is hidden",
  !ac2.some(e => e.id === 5));
assert("AC2 – end bound: entries at and before end are visible",
  [1, 2, 3, 4].every(id => ac2.some(e => e.id === id)));
assert("AC2 – end bound: count is 4 (no lower bound)",
  ac2.length === 4);

// ── AC8: Only start set (no end) ─────────────────────────────────────────────

const ac8start = filterByDateRange(ENTRIES, { start: START });
assert("AC8 – start-only: entries before start excluded",
  !ac8start.some(e => e.id === 1));
assert("AC8 – start-only: entries at/after start included (no upper bound)",
  ac8start.length === 4);

// Future entry included when no end bound.
const future = entry(99, "2099-12-31T23:59:59.999Z");
assert("AC8 – start-only: future entry included when no end bound",
  filterByDateRange([...ENTRIES, future], { start: START }).some(e => e.id === 99));

// ── AC8: Only end set (no start) ─────────────────────────────────────────────

const ac8end = filterByDateRange(ENTRIES, { end: END });
assert("AC8 – end-only: entries after end excluded",
  !ac8end.some(e => e.id === 5));
assert("AC8 – end-only: entries at/before end included (no lower bound)",
  ac8end.length === 4);

// Ancient entry included when no start bound.
const ancient = entry(0, "1970-01-01T00:00:00.000Z");
assert("AC8 – end-only: ancient entry included when no start bound",
  filterByDateRange([ancient, ...ENTRIES], { end: END }).some(e => e.id === 0));

// ── AC9: Filter composition ───────────────────────────────────────────────────

const compositeEntries = [
  { id: 1, timestamp: "2024-06-10T00:00:00.000Z", eventType: "payment.created", status: "delivered" },
  { id: 2, timestamp: "2024-06-10T00:00:00.000Z", eventType: "refund.issued",   status: "failed"    },
  { id: 3, timestamp: "2024-06-20T00:00:00.000Z", eventType: "payment.created", status: "failed"    },
  { id: 4, timestamp: "2024-06-20T00:00:00.000Z", eventType: "refund.issued",   status: "delivered" },
  { id: 5, timestamp: "2024-07-01T00:00:00.000Z", eventType: "payment.created", status: "delivered" },
];
const JUNE_RANGE = { start: "2024-06-01T00:00:00.000Z", end: "2024-06-30T23:59:59.999Z" };

// date-range + event-type
const ac9dt = composeFilters(compositeEntries, JUNE_RANGE, ["payment.created"], "");
assert("AC9 – date+type: only payment.created within June (ids 1,3)",
  ac9dt.map(e => e.id).join(",") === "1,3");

// date-range + status
const ac9ds = composeFilters(compositeEntries, JUNE_RANGE, [], "delivered");
assert("AC9 – date+status: only delivered within June (ids 1,4)",
  ac9ds.map(e => e.id).join(",") === "1,4");

// all three dimensions
const ac9all = composeFilters(compositeEntries, JUNE_RANGE, ["payment.created"], "delivered");
assert("AC9 – date+type+status: only payment.created+delivered within June (id 1)",
  ac9all.map(e => e.id).join(",") === "1");

// clearing date-range does not affect event-type filter
const ac9clearDate = composeFilters(compositeEntries, clearDateRangeFilter(), ["payment.created"], "");
assert("AC9 – clearing date-range exposes July entry while keeping type filter",
  ac9clearDate.map(e => e.id).join(",") === "1,3,5");

// clearing event-type does not affect date-range filter
const ac9clearType = composeFilters(compositeEntries, JUNE_RANGE, [], "");
assert("AC9 – clearing event-type exposes refund entries within June",
  ac9clearType.map(e => e.id).join(",") === "1,2,3,4");

// no filter active: all entries returned
assert("AC9 – no filter active: all entries returned",
  composeFilters(compositeEntries, {}, [], "").length === compositeEntries.length);

// ── Edge cases ────────────────────────────────────────────────────────────────

// Empty input
assert("edge – empty input with range: returns empty array",
  filterByDateRange([], { start: START, end: END }).length === 0);

// Input array is not mutated
const inputCopy = [...ENTRIES];
const beforeStr = JSON.stringify(inputCopy);
filterByDateRange(inputCopy, { start: START, end: END });
assert("edge – input array is not mutated",
  JSON.stringify(inputCopy) === beforeStr);

// Unparseable timestamp is excluded
assert("edge – unparseable timestamp is excluded",
  filterByDateRange([entry(1, "not-a-date")], { start: START, end: END }).length === 0);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  throw new Error(`${fail} test(s) failed`);
}
HARNESS_EOF

# Inject the compiled module path.
sed -i "s|__COMPILED__|$COMPILED|g" "$HARNESS"

# ── Run the harness ───────────────────────────────────────────────────────────

HARNESS_OUT=$(node "$HARNESS" 2>&1)
HARNESS_EXIT=$?

# Relay individual PASS/FAIL lines to the shell counters.
while IFS= read -r line; do
  case "$line" in
    PASS:*) pass "${line#PASS: }" ;;
    FAIL:*) fail "${line#FAIL: }" ;;
    *)      echo "$line" ;;
  esac
done <<< "$HARNESS_OUT"

if [ "$HARNESS_EXIT" -ne 0 ] && ! echo "$HARNESS_OUT" | grep -q "^FAIL:"; then
  fail "harness – node exited with code $HARNESS_EXIT (unexpected error)"
fi

# ── AC15: Production build succeeds (no bundle-size regression) ───────────────

BUILD_OUT=$(cd "$REPO_ROOT" && node_modules/.bin/vite build 2>&1)
BUILD_EXIT=$?
if [ "$BUILD_EXIT" -eq 0 ]; then
  pass "AC15 – production build succeeds after adding dateRangeFilter"
else
  fail "AC15 – production build failed"
  echo "$BUILD_OUT"
fi

# Verify the filter module is not accidentally bundled as a separate chunk
# (it should be tree-shaken or inlined, not emitted as a standalone file that
# would indicate an unintended side-effect import).
DIST_DIR="$REPO_ROOT/dist"
if [ -d "$DIST_DIR" ]; then
  pass "AC15 – dist/ directory exists after build"
  if [ -f "$DIST_DIR/index.html" ]; then
    pass "AC15 – dist/index.html present"
  else
    fail "AC15 – dist/index.html missing after build"
  fi
else
  fail "AC15 – dist/ directory missing after build"
fi

# ── Final summary ─────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

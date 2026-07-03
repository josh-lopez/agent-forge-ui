#!/usr/bin/env bash
# Acceptance-criteria tests for Issue #85: date-range filter boundary conditions.
#
# Independently verifies all spec-mandated cases:
#   AC2 – entries within range are included.
#   AC3 – entries outside range are excluded.
#   AC4 – entry exactly equal to start timestamp is included (boundary inclusive).
#   AC5 – entry exactly equal to end timestamp is included (boundary inclusive).
#   AC6 – clearing both inputs (null/undefined) restores the full unfiltered log.
#   AC7 – applying a range with no matching entries returns an empty result.
#
# Spec ref: spec § "Event log filtering — Date-range filter" (test coverage)
#
# Strategy: compile src/dateRangeFilter.ts with tsc and exercise the compiled
# module via a Node.js ESM harness.  No DOM or external test framework needed.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSC="$REPO_ROOT/node_modules/.bin/tsc"
FILTER_SRC="$REPO_ROOT/src/dateRangeFilter.ts"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── Pre-flight checks ─────────────────────────────────────────────────────────

if [ ! -f "$FILTER_SRC" ]; then
  fail "pre-flight – src/dateRangeFilter.ts does not exist"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – src/dateRangeFilter.ts exists"

# Verify the module exports the expected function and interface names.
if grep -q "export function filterByDateRange" "$FILTER_SRC"; then
  pass "pre-flight – filterByDateRange is exported from dateRangeFilter.ts"
else
  fail "pre-flight – filterByDateRange export not found in dateRangeFilter.ts"
fi

if grep -q "export interface DateFilterableLogEntry" "$FILTER_SRC"; then
  pass "pre-flight – DateFilterableLogEntry interface is exported"
else
  fail "pre-flight – DateFilterableLogEntry interface export not found"
fi

# Verify the no-filter short-circuit path is present in the source.
if grep -q "return entries" "$FILTER_SRC"; then
  pass "pre-flight – no-filter short-circuit (return entries) present in source"
else
  fail "pre-flight – no-filter short-circuit not found in source"
fi

if [ ! -x "$TSC" ]; then
  fail "pre-flight – tsc not found at $TSC (run 'npm install' first)"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – tsc binary is available"

# ── Verify the Vitest test file exists and covers all ACs ────────────────────

VITEST_FILE="$REPO_ROOT/tests/dateRangeFilter.test.ts"

if [ -f "$VITEST_FILE" ]; then
  pass "AC1 – tests/dateRangeFilter.test.ts exists"
else
  fail "AC1 – tests/dateRangeFilter.test.ts does not exist"
fi

for ac in AC2 AC3 AC4 AC5 AC6 AC7; do
  if grep -q "$ac" "$VITEST_FILE" 2>/dev/null; then
    pass "AC1 – Vitest file references $ac"
  else
    fail "AC1 – Vitest file does not reference $ac"
  fi
done

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
    "$FILTER_SRC" 2>&1
)
TSC_EXIT=$?

if [ "$TSC_EXIT" -eq 0 ]; then
  pass "compile – src/dateRangeFilter.ts compiles without TypeScript errors"
else
  fail "compile – tsc exited with code $TSC_EXIT"
  echo "$TSC_OUT"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# Mark output as ESM so Node can import it.
echo '{"type":"module"}' > "$TMPDIR_AC/out/package.json"

COMPILED="$TMPDIR_AC/out/dateRangeFilter.js"
HARNESS="$TMPDIR_AC/harness.mjs"

# ── Write the Node.js test harness ───────────────────────────────────────────

cat > "$HARNESS" << 'EOF'
import { filterByDateRange } from "__COMPILED__";

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

// ── Fixture: 6 entries spread across a 5-hour window ─────────────────────────
// id 1: before range  (08:00)
// id 2: === start     (09:00)  ← boundary
// id 3: inside range  (10:00)
// id 4: inside range  (11:00)
// id 5: === end       (12:00)  ← boundary
// id 6: after range   (13:00)
const ENTRIES = [
  { id: 1, eventType: "payment.created", timestamp: "2024-03-01T08:00:00.000Z" },
  { id: 2, eventType: "payment.created", timestamp: "2024-03-01T09:00:00.000Z" },
  { id: 3, eventType: "refund.issued",   timestamp: "2024-03-01T10:00:00.000Z" },
  { id: 4, eventType: "refund.issued",   timestamp: "2024-03-01T11:00:00.000Z" },
  { id: 5, eventType: "dispute.opened",  timestamp: "2024-03-01T12:00:00.000Z" },
  { id: 6, eventType: "dispute.opened",  timestamp: "2024-03-01T13:00:00.000Z" },
];

const RANGE_START = "2024-03-01T09:00:00.000Z";
const RANGE_END   = "2024-03-01T12:00:00.000Z";

// ── AC2: Entries within range are included ────────────────────────────────────
const ac2 = filterByDateRange(ENTRIES, RANGE_START, RANGE_END);
assert("AC2 – within-range entry (id 3) is included", ac2.some(e => e.id === 3));
assert("AC2 – within-range entry (id 4) is included", ac2.some(e => e.id === 4));
assert("AC2 – total in-range count is 4 (ids 2,3,4,5)", ac2.length === 4);

// ── AC3: Entries outside range are excluded ───────────────────────────────────
assert("AC3 – entry before start (id 1) is excluded", !ac2.some(e => e.id === 1));
assert("AC3 – entry after end (id 6) is excluded",    !ac2.some(e => e.id === 6));

// ── AC4: Start-boundary entry is included ─────────────────────────────────────
const startEntry = ac2.find(e => e.timestamp === RANGE_START);
assert("AC4 – entry with timestamp === start is defined", startEntry !== undefined);
assert("AC4 – start-boundary entry has id 2", startEntry && startEntry.id === 2);

// Also verify with only a start bound (no end).
const onlyStart = filterByDateRange(ENTRIES, RANGE_START, null);
assert("AC4 – start-boundary entry included when only start is set",
  onlyStart.some(e => e.timestamp === RANGE_START));

// ── AC5: End-boundary entry is included ──────────────────────────────────────
const endEntry = ac2.find(e => e.timestamp === RANGE_END);
assert("AC5 – entry with timestamp === end is defined", endEntry !== undefined);
assert("AC5 – end-boundary entry has id 5", endEntry && endEntry.id === 5);

// Also verify with only an end bound (no start).
const onlyEnd = filterByDateRange(ENTRIES, null, RANGE_END);
assert("AC5 – end-boundary entry included when only end is set",
  onlyEnd.some(e => e.timestamp === RANGE_END));

// ── AC6: Clearing both inputs restores the full unfiltered log ────────────────
const clearedNull = filterByDateRange(ENTRIES, null, null);
assert("AC6 – null/null: returns all 6 entries", clearedNull.length === ENTRIES.length);

const clearedUndef = filterByDateRange(ENTRIES, undefined, undefined);
assert("AC6 – undefined/undefined: returns all 6 entries", clearedUndef.length === ENTRIES.length);

const clearedMixed1 = filterByDateRange(ENTRIES, null, undefined);
assert("AC6 – null/undefined: returns all 6 entries", clearedMixed1.length === ENTRIES.length);

const clearedMixed2 = filterByDateRange(ENTRIES, undefined, null);
assert("AC6 – undefined/null: returns all 6 entries", clearedMixed2.length === ENTRIES.length);

// Verify all original ids are present after clearing.
const clearedIds = clearedNull.map(e => e.id).sort((a, b) => a - b);
assert("AC6 – cleared result contains all original entry ids",
  JSON.stringify(clearedIds) === JSON.stringify([1, 2, 3, 4, 5, 6]));

// ── AC7: Range with no matching entries returns empty (not an error) ──────────
const beforeAll = filterByDateRange(ENTRIES, "2024-01-01T00:00:00.000Z", "2024-01-01T23:59:59.999Z");
assert("AC7 – range entirely before all entries: returns empty array", beforeAll.length === 0);

const afterAll = filterByDateRange(ENTRIES, "2024-12-31T00:00:00.000Z", "2024-12-31T23:59:59.999Z");
assert("AC7 – range entirely after all entries: returns empty array", afterAll.length === 0);

let threw = false;
try {
  filterByDateRange(ENTRIES, "2099-01-01T00:00:00.000Z", "2099-01-01T01:00:00.000Z");
} catch (e) {
  threw = true;
}
assert("AC7 – no-match range does not throw", !threw);

const emptyLog = filterByDateRange([], RANGE_START, RANGE_END);
assert("AC7 – empty entry list with range: returns empty array", emptyLog.length === 0);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  throw new Error(`${fail} test(s) failed`);
}
EOF

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

# ── Final summary ─────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

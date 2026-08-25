#!/usr/bin/env bash
# Tests for Issue #151: Status filter for the delivery event log.
#
# Covers the acceptance criteria:
#   AC1  – src/statusFilter.ts exists and exports the expected symbols.
#   AC2  – single status selected: only matching entries are returned.
#   AC3  – multiple statuses selected: entries matching any selected status.
#   AC4  – all statuses cleared: full unfiltered log is restored.
#   AC10 – unit test: single status selected.
#   AC11 – unit test: multiple statuses selected.
#   AC12 – unit test: all statuses cleared.
#   AC13 – unit test: status filter composed with another filter dimension.
#
# Strategy: compile src/statusFilter.ts with tsc and exercise the compiled
# module via a Node.js ESM harness. No DOM or external test framework needed.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSC="$REPO_ROOT/node_modules/.bin/tsc"
FILTER_SRC="$REPO_ROOT/src/statusFilter.ts"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── Pre-flight checks ─────────────────────────────────────────────────────────

if [ ! -f "$FILTER_SRC" ]; then
  fail "pre-flight – src/statusFilter.ts does not exist"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – src/statusFilter.ts exists"

# Verify the module exports the expected function and type names.
if grep -q "export function filterByStatuses" "$FILTER_SRC"; then
  pass "pre-flight – filterByStatuses is exported from statusFilter.ts"
else
  fail "pre-flight – filterByStatuses export not found in statusFilter.ts"
fi

if grep -q "export function applyAllFilters" "$FILTER_SRC"; then
  pass "pre-flight – applyAllFilters is exported from statusFilter.ts"
else
  fail "pre-flight – applyAllFilters export not found in statusFilter.ts"
fi

if grep -q "export.*ALL_STATUSES" "$FILTER_SRC"; then
  pass "pre-flight – ALL_STATUSES is exported from statusFilter.ts"
else
  fail "pre-flight – ALL_STATUSES export not found in statusFilter.ts"
fi

# Verify all four spec-defined statuses are present.
for STATUS in pending delivered failed exhausted; do
  if grep -q "'$STATUS'" "$FILTER_SRC"; then
    pass "pre-flight – status '$STATUS' is defined in statusFilter.ts"
  else
    fail "pre-flight – status '$STATUS' not found in statusFilter.ts"
  fi
done

# Verify the empty-selection short-circuit path is present.
if grep -q "selectedStatuses.length === 0" "$FILTER_SRC"; then
  pass "pre-flight – empty-selection short-circuit present in source"
else
  fail "pre-flight – empty-selection short-circuit not found in source"
fi

if [ ! -x "$TSC" ]; then
  fail "pre-flight – tsc not found at $TSC (run 'npm install' first)"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – tsc binary is available"

# ── Compile to a temp directory ───────────────────────────────────────────────

TMPDIR_151="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_151"' EXIT

TSC_OUT=$(
  "$TSC" \
    --module ESNext \
    --moduleResolution node \
    --target ES2020 \
    --outDir "$TMPDIR_151/out" \
    --noEmit false \
    --allowImportingTsExtensions false \
    --strict true \
    --skipLibCheck true \
    "$FILTER_SRC" 2>&1
)
TSC_EXIT=$?

if [ "$TSC_EXIT" -eq 0 ]; then
  pass "compile – statusFilter.ts compiles without TypeScript errors"
else
  fail "compile – tsc exited with code $TSC_EXIT"
  echo "$TSC_OUT"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# Mark output as ESM so Node can import it.
echo '{"type":"module"}' > "$TMPDIR_151/out/package.json"

COMPILED="$TMPDIR_151/out/statusFilter.js"
HARNESS="$TMPDIR_151/harness.mjs"

# ── Write the Node.js test harness ───────────────────────────────────────────

cat > "$HARNESS" << 'EOF'
import { filterByStatuses, applyAllFilters, ALL_STATUSES } from "__COMPILED__";

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

// ── Fixture: 8 entries across 4 statuses and 3 event types ───────────────────
const LOG = [
  { id: "1", eventType: "payment.created", status: "pending",   timestamp: "2024-03-01T08:00:00Z" },
  { id: "2", eventType: "payment.created", status: "delivered", timestamp: "2024-03-01T09:00:00Z" },
  { id: "3", eventType: "refund.issued",   status: "failed",    timestamp: "2024-03-01T10:00:00Z" },
  { id: "4", eventType: "refund.issued",   status: "exhausted", timestamp: "2024-03-01T11:00:00Z" },
  { id: "5", eventType: "dispute.opened",  status: "pending",   timestamp: "2024-03-02T08:00:00Z" },
  { id: "6", eventType: "dispute.opened",  status: "delivered", timestamp: "2024-03-02T09:00:00Z" },
  { id: "7", eventType: "payment.created", status: "failed",    timestamp: "2024-03-02T10:00:00Z" },
  { id: "8", eventType: "refund.issued",   status: "delivered", timestamp: "2024-03-02T11:00:00Z" },
];

// ── ALL_STATUSES constant ─────────────────────────────────────────────────────
assert("ALL_STATUSES has exactly 4 entries", ALL_STATUSES.length === 4);
assert("ALL_STATUSES contains 'pending'",   ALL_STATUSES.includes("pending"));
assert("ALL_STATUSES contains 'delivered'", ALL_STATUSES.includes("delivered"));
assert("ALL_STATUSES contains 'failed'",    ALL_STATUSES.includes("failed"));
assert("ALL_STATUSES contains 'exhausted'", ALL_STATUSES.includes("exhausted"));

// ── AC2 / AC10: Single status selected ───────────────────────────────────────
const single_pending = filterByStatuses(LOG, ["pending"]);
assert("AC10 – single 'pending': correct count (2)", single_pending.length === 2);
assert("AC10 – single 'pending': all returned entries match",
  single_pending.every(e => e.status === "pending"));
assert("AC10 – single 'pending': no non-matching entries",
  !single_pending.some(e => e.status !== "pending"));

const single_exhausted = filterByStatuses(LOG, ["exhausted"]);
assert("AC10 – single 'exhausted': correct count (1)", single_exhausted.length === 1);
assert("AC10 – single 'exhausted': returned entry is id=4", single_exhausted[0].id === "4");

const single_delivered = filterByStatuses(LOG, ["delivered"]);
assert("AC10 – single 'delivered': correct count (3)", single_delivered.length === 3);
assert("AC10 – single 'delivered': all returned entries match",
  single_delivered.every(e => e.status === "delivered"));

const single_failed = filterByStatuses(LOG, ["failed"]);
assert("AC10 – single 'failed': correct count (2)", single_failed.length === 2);
assert("AC10 – single 'failed': all returned entries match",
  single_failed.every(e => e.status === "failed"));

// ── AC3 / AC11: Multiple statuses selected ────────────────────────────────────
const multi_pf = filterByStatuses(LOG, ["pending", "failed"]);
assert("AC11 – pending+failed: correct count (4)", multi_pf.length === 4);
assert("AC11 – pending+failed: includes pending entries",
  multi_pf.some(e => e.status === "pending"));
assert("AC11 – pending+failed: includes failed entries",
  multi_pf.some(e => e.status === "failed"));
assert("AC11 – pending+failed: excludes delivered entries",
  !multi_pf.some(e => e.status === "delivered"));
assert("AC11 – pending+failed: excludes exhausted entries",
  !multi_pf.some(e => e.status === "exhausted"));

const multi_de = filterByStatuses(LOG, ["delivered", "exhausted"]);
assert("AC11 – delivered+exhausted: correct count (4)", multi_de.length === 4);

// All four statuses → all entries
const all_four = filterByStatuses(LOG, ["pending", "delivered", "failed", "exhausted"]);
assert("AC11 – all four statuses: returns all entries", all_four.length === LOG.length);

// ALL_STATUSES constant → all entries
const via_const = filterByStatuses(LOG, ALL_STATUSES);
assert("AC11 – via ALL_STATUSES: returns all entries", via_const.length === LOG.length);

// ── AC4 / AC12: All statuses cleared (empty selection) ────────────────────────
const cleared = filterByStatuses(LOG, []);
assert("AC12 – cleared: returns full list", cleared.length === LOG.length);
assert("AC12 – cleared: same reference as input", cleared === LOG);
assert("AC12 – cleared: all statuses present",
  ["pending","delivered","failed","exhausted"].every(s => cleared.some(e => e.status === s)));

// ── Edge cases ────────────────────────────────────────────────────────────────
const empty_log_filter = filterByStatuses([], ["pending"]);
assert("edge – empty log with filter: returns empty array", empty_log_filter.length === 0);

const empty_both = filterByStatuses([], []);
assert("edge – empty log, no filter: returns empty array", empty_both.length === 0);

const no_match = filterByStatuses(LOG, ["exhausted"]);
// exhausted only has 1 entry; filter for a status not in a subset
const no_exhausted_log = LOG.filter(e => e.status !== "exhausted");
const no_match2 = filterByStatuses(no_exhausted_log, ["exhausted"]);
assert("edge – no entries match selected status: returns empty array", no_match2.length === 0);

// ── AC13 / AC7: Status + date-range composition ───────────────────────────────
const day1_start = new Date("2024-03-01T00:00:00Z");
const day1_end   = new Date("2024-03-01T23:59:59Z");

const comp_date_status = applyAllFilters(LOG, day1_start, day1_end, [], ["delivered"]);
// Day 1 delivered: id=2
assert("AC13/AC7 – date+status: correct count (1)", comp_date_status.length === 1);
assert("AC13/AC7 – date+status: correct entry (id=2)", comp_date_status[0].id === "2");

const comp_date_no_match = applyAllFilters(LOG, day1_start, day1_end, [], ["pending"]);
// Day 1 pending: id=1
assert("AC13/AC7 – date+status (pending day1): correct count (1)", comp_date_no_match.length === 1);
assert("AC13/AC7 – date+status (pending day1): correct entry (id=1)", comp_date_no_match[0].id === "1");

// Date range that excludes all entries
const far_future = new Date("2099-01-01T00:00:00Z");
const comp_no_date = applyAllFilters(LOG, far_future, null, [], ["delivered"]);
assert("AC13/AC7 – date excludes all: returns empty", comp_no_date.length === 0);

// Boundary: timestamp exactly equal to start
const boundary_start = new Date("2024-03-01T08:00:00Z");
const boundary_end   = new Date("2024-03-01T08:00:00Z");
const comp_boundary = applyAllFilters(LOG, boundary_start, boundary_end, [], []);
assert("AC13/AC7 – boundary entry included: count=1", comp_boundary.length === 1);
assert("AC13/AC7 – boundary entry included: id=1", comp_boundary[0].id === "1");

// ── AC13 / AC8: Status + event-type composition ───────────────────────────────
const comp_type_status = applyAllFilters(LOG, null, null, ["payment.created"], ["delivered"]);
// payment.created + delivered: id=2
assert("AC13/AC8 – type+status: correct count (1)", comp_type_status.length === 1);
assert("AC13/AC8 – type+status: correct entry (id=2)", comp_type_status[0].id === "2");

const comp_type_no_match = applyAllFilters(LOG, null, null, ["refund.issued"], ["pending"]);
// refund.issued has no pending entries
assert("AC13/AC8 – type+status no match: returns empty", comp_type_no_match.length === 0);

const comp_multi_type_status = applyAllFilters(
  LOG, null, null, ["payment.created"], ["pending", "failed"]
);
// payment.created: id=1(pending), id=7(failed)
assert("AC13/AC8 – multi-status+type: correct count (2)", comp_multi_type_status.length === 2);
assert("AC13/AC8 – multi-status+type: ids are 1 and 7",
  comp_multi_type_status.map(e => e.id).sort().join(",") === "1,7");

// ── AC9: All three filters active simultaneously ──────────────────────────────
const all3 = applyAllFilters(LOG, day1_start, day1_end, ["payment.created"], ["delivered"]);
// Day 1, payment.created, delivered: id=2
assert("AC9 – all three filters: correct count (1)", all3.length === 1);
assert("AC9 – all three filters: correct entry (id=2)", all3[0].id === "2");

const all3_empty = applyAllFilters(
  LOG,
  new Date("2024-03-02T00:00:00Z"),
  new Date("2024-03-02T23:59:59Z"),
  ["refund.issued"],
  ["pending"]
);
// Day 2, refund.issued, pending: id=8 is delivered, no pending refund.issued on day 2
assert("AC9 – all three filters no match: returns empty", all3_empty.length === 0);

// All filters inactive → full list
const all3_inactive = applyAllFilters(LOG, null, null, [], []);
assert("AC9 – all filters inactive: returns full list", all3_inactive.length === LOG.length);

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

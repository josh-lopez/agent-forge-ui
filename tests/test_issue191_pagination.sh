#!/usr/bin/env bash
# Acceptance-criteria tests for Issue #191: delivery event data pagination.
#
# Verifies that src/pagination.ts:
#   AC1  – first page renders correct slice
#   AC2  – only a fixed page of entries is rendered at a time
#   AC3  – pagination control metadata (hasPrev/hasNext) is present
#   AC4  – navigating to page N returns the correct slice; no duplicates/skips
#   AC5  – total entry count is surfaced via paginationSummary
#   AC6  – applying a filter resets to page 1
#   AC7  – clearing all filters resets to page 1
#   AC9  – edge cases: empty log, single page of results
#
# Strategy: compile src/pagination.ts with tsc and exercise the compiled
# module via a Node.js ESM harness.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSC="$REPO_ROOT/node_modules/.bin/tsc"
PAGINATION_SRC="$REPO_ROOT/src/pagination.ts"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── Pre-flight checks ─────────────────────────────────────────────────────────

if [ ! -f "$PAGINATION_SRC" ]; then
  fail "pre-flight – src/pagination.ts does not exist"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – src/pagination.ts exists"

# Verify expected exports are present.
for symbol in "export function getPage" "export function getPaginationMeta" \
              "export function resetPage" "export function paginationSummary" \
              "export function clampPage" "export const PAGE_SIZE_DEFAULT" \
              "export interface PaginationMeta"; do
  if grep -q "$symbol" "$PAGINATION_SRC"; then
    pass "pre-flight – '$symbol' is exported"
  else
    fail "pre-flight – '$symbol' not found in src/pagination.ts"
  fi
done

if [ ! -x "$TSC" ]; then
  fail "pre-flight – tsc not found at $TSC (run 'npm install' first)"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – tsc binary is available"

# ── Compile to a temp directory ───────────────────────────────────────────────

TMPDIR_PAG="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_PAG"' EXIT

TSC_OUT=$(
  "$TSC" \
    --module ESNext \
    --moduleResolution node \
    --target ES2020 \
    --outDir "$TMPDIR_PAG/out" \
    --noEmit false \
    --allowImportingTsExtensions false \
    --strict true \
    --skipLibCheck true \
    "$PAGINATION_SRC" 2>&1
)
TSC_EXIT=$?

if [ "$TSC_EXIT" -eq 0 ]; then
  pass "compile – src/pagination.ts compiles without TypeScript errors"
else
  fail "compile – tsc exited with code $TSC_EXIT"
  echo "$TSC_OUT"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

echo '{"type":"module"}' > "$TMPDIR_PAG/out/package.json"

COMPILED="$TMPDIR_PAG/out/pagination.js"
HARNESS="$TMPDIR_PAG/harness.mjs"

# ── Write the Node.js test harness ───────────────────────────────────────────

cat > "$HARNESS" << 'EOF'
import {
  PAGE_SIZE_DEFAULT,
  clampPage,
  getPage,
  getPaginationMeta,
  paginationSummary,
  resetPage,
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

// Helper: generate N numbered entries.
function makeEntries(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    eventType: i % 2 === 0 ? "payment.created" : "refund.issued",
  }));
}

// ── PAGE_SIZE_DEFAULT ─────────────────────────────────────────────────────────
assert("PAGE_SIZE_DEFAULT is between 25 and 50",
  PAGE_SIZE_DEFAULT >= 25 && PAGE_SIZE_DEFAULT <= 50);

// ── AC1: First page renders correct slice ─────────────────────────────────────
const entries100 = makeEntries(100);
const p1 = getPage(entries100, 1, 10);
assert("AC1 – first page has 10 entries", p1.length === 10);
assert("AC1 – first page starts at id 1", p1[0].id === 1);
assert("AC1 – first page ends at id 10", p1[9].id === 10);

// ── AC2: Only a fixed page of entries at a time ───────────────────────────────
assert("AC2 – page slice length equals pageSize (not full dataset)",
  p1.length === 10 && entries100.length === 100);

// ── AC3: Pagination control metadata ─────────────────────────────────────────
const meta1 = getPaginationMeta(100, 1, 10);
assert("AC3 – hasPrev is false on page 1", meta1.hasPrev === false);
assert("AC3 – hasNext is true on page 1 of 10", meta1.hasNext === true);
assert("AC3 – totalPages is 10 for 100 entries / pageSize 10", meta1.totalPages === 10);

const metaLast = getPaginationMeta(100, 10, 10);
assert("AC3 – hasPrev is true on last page", metaLast.hasPrev === true);
assert("AC3 – hasNext is false on last page", metaLast.hasNext === false);

// ── AC4: Navigating to page N returns correct slice; no duplicates/skips ──────
const p2 = getPage(entries100, 2, 10);
assert("AC4 – page 2 starts at id 11", p2[0].id === 11);
assert("AC4 – page 2 ends at id 20", p2[9].id === 20);

const p3 = getPage(entries100, 3, 10);
assert("AC4 – page 3 starts at id 21", p3[0].id === 21);
assert("AC4 – page 3 ends at id 30", p3[9].id === 30);

// No duplicates across pages 1–10.
const allIds = [];
for (let pg = 1; pg <= 10; pg++) {
  getPage(entries100, pg, 10).forEach(e => allIds.push(e.id));
}
const uniqueIds = new Set(allIds);
assert("AC4 – no duplicate entries across all pages", uniqueIds.size === 100);
assert("AC4 – no entries skipped across all pages", allIds.length === 100);

// Partial last page.
const entries55 = makeEntries(55);
const pLast = getPage(entries55, 6, 10);
assert("AC4 – partial last page has 5 entries", pLast.length === 5);
assert("AC4 – partial last page starts at id 51", pLast[0].id === 51);
assert("AC4 – partial last page ends at id 55", pLast[4].id === 55);

// ── AC5: Total entry count displayed ─────────────────────────────────────────
const summaryEmpty = paginationSummary(getPaginationMeta(0, 1, 10));
assert("AC5 – empty dataset summary is 'Showing 0 entries'",
  summaryEmpty === "Showing 0 entries");

const summary1 = paginationSummary(getPaginationMeta(100, 1, 10));
assert("AC5 – page 1 summary is 'Showing 1–10 of 100 entries'",
  summary1 === "Showing 1\u201310 of 100 entries");

const summary1000 = paginationSummary(getPaginationMeta(1000, 1, 25));
assert("AC5 – 1000-entry summary contains '1,000'",
  summary1000.includes("1,000"));

// ── AC6: Applying a filter resets to page 1 ──────────────────────────────────
let currentPage = 5;
currentPage = resetPage();
assert("AC6 – resetPage() returns 1 after filter applied", currentPage === 1);

// Paginating filtered results.
const allEntries = makeEntries(1000);
const filtered = allEntries.filter(e => e.eventType === "payment.created");
assert("AC6 – filtered dataset has 500 entries", filtered.length === 500);
const filteredPage1 = getPage(filtered, 1, 10);
assert("AC6 – page 1 of filtered results has 10 entries", filteredPage1.length === 10);
const filteredMeta = getPaginationMeta(filtered.length, 1, 10);
assert("AC6 – filtered meta has 50 total pages", filteredMeta.totalPages === 50);

// ── AC7: Clearing all filters resets to page 1 ───────────────────────────────
currentPage = 7;
currentPage = resetPage();
assert("AC7 – resetPage() returns 1 after filters cleared", currentPage === 1);
const fullPage1 = getPage(allEntries, currentPage, 10);
assert("AC7 – page 1 of full log starts at id 1", fullPage1[0].id === 1);

// ── AC9: Edge cases ───────────────────────────────────────────────────────────
// Empty log.
const emptyPage = getPage([], 1, 10);
assert("AC9 – empty log returns empty page", emptyPage.length === 0);

const emptyMeta = getPaginationMeta(0, 1, 10);
assert("AC9 – empty log meta: totalEntries=0", emptyMeta.totalEntries === 0);
assert("AC9 – empty log meta: totalPages=1", emptyMeta.totalPages === 1);
assert("AC9 – empty log meta: firstEntry=0", emptyMeta.firstEntry === 0);
assert("AC9 – empty log meta: lastEntry=0", emptyMeta.lastEntry === 0);
assert("AC9 – empty log meta: hasPrev=false", emptyMeta.hasPrev === false);
assert("AC9 – empty log meta: hasNext=false", emptyMeta.hasNext === false);

// Single page of results.
const fewEntries = makeEntries(5);
const singlePage = getPage(fewEntries, 1, 10);
assert("AC9 – single page: all 5 entries returned", singlePage.length === 5);
const singleMeta = getPaginationMeta(5, 1, 10);
assert("AC9 – single page meta: totalPages=1", singleMeta.totalPages === 1);
assert("AC9 – single page meta: hasPrev=false", singleMeta.hasPrev === false);
assert("AC9 – single page meta: hasNext=false", singleMeta.hasNext === false);

// 1000-entry dataset.
const bigEntries = makeEntries(1000);
const bigPage1 = getPage(bigEntries, 1, 25);
assert("AC9 – 1000-entry dataset: page 1 has 25 entries", bigPage1.length === 25);
const bigMeta = getPaginationMeta(1000, 1, 25);
assert("AC9 – 1000-entry dataset: totalPages=40", bigMeta.totalPages === 40);

// clampPage edge cases.
assert("clampPage – page 0 clamps to 1", clampPage(0, 5) === 1);
assert("clampPage – page > totalPages clamps to totalPages", clampPage(99, 5) === 5);
assert("clampPage – valid page unchanged", clampPage(3, 5) === 3);

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

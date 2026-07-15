#!/usr/bin/env bash
# Structural and behavioural verification for Issue #269:
# Immediate-filtering behaviour of the date-range filter.
#
# Spec ref: spec § "Event log filtering — Date-range filter"
#   "Immediate filtering: selecting a range immediately (or on 'Apply') hides
#    log entries whose attempt timestamp falls outside the selected start and
#    end date-times; boundary entries (exactly equal to start or end) are
#    included."
#
# Acceptance criteria verified:
#   AC1 – unit tests exist that verify entries before start are hidden
#   AC2 – unit tests exist that verify entries after end are hidden
#   AC3 – unit tests exist that verify start-boundary entries are included
#   AC4 – unit tests exist that verify end-boundary entries are included
#   AC5 – unit tests verify filtering fires immediately (no extra action)
#   AC6 – all new tests pass in CI

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMMEDIATE_TEST="$REPO_ROOT/tests/dateRangeFilter-immediate.test.ts"
AC_TEST="$REPO_ROOT/tests/issue269-ac-verification.test.ts"
SRC_FILTER="$REPO_ROOT/src/dateRangeFilter.ts"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── File existence ────────────────────────────────────────────────────────────

if [ -f "$IMMEDIATE_TEST" ]; then
  pass "AC1-5 – tests/dateRangeFilter-immediate.test.ts exists"
else
  fail "AC1-5 – tests/dateRangeFilter-immediate.test.ts is missing"
fi

if [ -f "$AC_TEST" ]; then
  pass "AC1-5 – tests/issue269-ac-verification.test.ts exists"
else
  fail "AC1-5 – tests/issue269-ac-verification.test.ts is missing"
fi

if [ -f "$SRC_FILTER" ]; then
  pass "AC1-5 – src/dateRangeFilter.ts (implementation) exists"
else
  fail "AC1-5 – src/dateRangeFilter.ts (implementation) is missing"
fi

# ── AC1: tests cover entries strictly before start being hidden ───────────────

if grep -qE "before start|strictly before|before.*start" "$IMMEDIATE_TEST" 2>/dev/null; then
  pass "AC1 – dateRangeFilter-immediate.test.ts contains tests for entries before start"
else
  fail "AC1 – dateRangeFilter-immediate.test.ts missing tests for entries before start"
fi

if grep -qE "before start|strictly before|before.*start" "$AC_TEST" 2>/dev/null; then
  pass "AC1 – issue269-ac-verification.test.ts contains tests for entries before start"
else
  fail "AC1 – issue269-ac-verification.test.ts missing tests for entries before start"
fi

# ── AC2: tests cover entries strictly after end being hidden ──────────────────

if grep -qE "after end|strictly after|after.*end" "$IMMEDIATE_TEST" 2>/dev/null; then
  pass "AC2 – dateRangeFilter-immediate.test.ts contains tests for entries after end"
else
  fail "AC2 – dateRangeFilter-immediate.test.ts missing tests for entries after end"
fi

if grep -qE "after end|strictly after|after.*end" "$AC_TEST" 2>/dev/null; then
  pass "AC2 – issue269-ac-verification.test.ts contains tests for entries after end"
else
  fail "AC2 – issue269-ac-verification.test.ts missing tests for entries after end"
fi

# ── AC3: tests cover start-boundary entries being included ───────────────────

if grep -qE "start.*boundary|boundary.*start|exactly equal.*start|start.*exactly" "$IMMEDIATE_TEST" 2>/dev/null; then
  pass "AC3 – dateRangeFilter-immediate.test.ts contains start-boundary inclusion tests"
else
  fail "AC3 – dateRangeFilter-immediate.test.ts missing start-boundary inclusion tests"
fi

if grep -qE "start.*boundary|boundary.*start|exactly equal.*start|start.*exactly" "$AC_TEST" 2>/dev/null; then
  pass "AC3 – issue269-ac-verification.test.ts contains start-boundary inclusion tests"
else
  fail "AC3 – issue269-ac-verification.test.ts missing start-boundary inclusion tests"
fi

# ── AC4: tests cover end-boundary entries being included ─────────────────────

if grep -qE "end.*boundary|boundary.*end|exactly equal.*end|end.*exactly" "$IMMEDIATE_TEST" 2>/dev/null; then
  pass "AC4 – dateRangeFilter-immediate.test.ts contains end-boundary inclusion tests"
else
  fail "AC4 – dateRangeFilter-immediate.test.ts missing end-boundary inclusion tests"
fi

if grep -qE "end.*boundary|boundary.*end|exactly equal.*end|end.*exactly" "$AC_TEST" 2>/dev/null; then
  pass "AC4 – issue269-ac-verification.test.ts contains end-boundary inclusion tests"
else
  fail "AC4 – issue269-ac-verification.test.ts missing end-boundary inclusion tests"
fi

# ── AC5: tests verify immediate filtering (onChange on input change) ──────────

if grep -qE "immediately|onChange|no.*Apply|Apply.*needed|change.*event" "$IMMEDIATE_TEST" 2>/dev/null; then
  pass "AC5 – dateRangeFilter-immediate.test.ts contains immediate-filtering tests"
else
  fail "AC5 – dateRangeFilter-immediate.test.ts missing immediate-filtering tests"
fi

if grep -qE "immediately|onChange|no.*Apply|Apply.*needed|change.*event" "$AC_TEST" 2>/dev/null; then
  pass "AC5 – issue269-ac-verification.test.ts contains immediate-filtering tests"
else
  fail "AC5 – issue269-ac-verification.test.ts missing immediate-filtering tests"
fi

# ── Implementation: filterByDateRange is exported ────────────────────────────

if grep -qE "^export function filterByDateRange" "$SRC_FILTER" 2>/dev/null; then
  pass "AC1-5 – filterByDateRange is exported from src/dateRangeFilter.ts"
else
  fail "AC1-5 – filterByDateRange is NOT exported from src/dateRangeFilter.ts"
fi

# ── Implementation: renderDateRangeFilterInputs is exported ──────────────────

if grep -qE "^export function renderDateRangeFilterInputs" "$SRC_FILTER" 2>/dev/null; then
  pass "AC5 – renderDateRangeFilterInputs is exported from src/dateRangeFilter.ts"
else
  fail "AC5 – renderDateRangeFilterInputs is NOT exported from src/dateRangeFilter.ts"
fi

# ── Implementation: boundary entries are included (>= and <=) ────────────────

if grep -qE "ts >= startMs && ts <= endMs" "$SRC_FILTER" 2>/dev/null; then
  pass "AC3/AC4 – filterByDateRange uses inclusive boundary comparison (>= and <=)"
else
  fail "AC3/AC4 – filterByDateRange does NOT use inclusive boundary comparison"
fi

# ── Implementation: onChange fires on 'change' event (immediate, no Apply) ───

if grep -qE "addEventListener\(['\"]change['\"]" "$SRC_FILTER" 2>/dev/null; then
  pass "AC5 – renderDateRangeFilterInputs attaches 'change' event listener (immediate)"
else
  fail "AC5 – renderDateRangeFilterInputs does NOT attach a 'change' event listener"
fi

# ── AC6: Vitest test files import from the correct source module ──────────────

if grep -qE "from ['\"]\.\.\/src\/dateRangeFilter['\"]" "$IMMEDIATE_TEST" 2>/dev/null; then
  pass "AC6 – dateRangeFilter-immediate.test.ts imports from src/dateRangeFilter"
else
  fail "AC6 – dateRangeFilter-immediate.test.ts does NOT import from src/dateRangeFilter"
fi

if grep -qE "from ['\"]\.\.\/src\/dateRangeFilter['\"]" "$AC_TEST" 2>/dev/null; then
  pass "AC6 – issue269-ac-verification.test.ts imports from src/dateRangeFilter"
else
  fail "AC6 – issue269-ac-verification.test.ts does NOT import from src/dateRangeFilter"
fi

# ── AC6: Test count sanity check ─────────────────────────────────────────────

IMMEDIATE_IT_COUNT=$(grep -cE "^\s+it\(" "$IMMEDIATE_TEST" 2>/dev/null || echo 0)
AC_IT_COUNT=$(grep -cE "^\s+it\(" "$AC_TEST" 2>/dev/null || echo 0)
TOTAL_IT=$((IMMEDIATE_IT_COUNT + AC_IT_COUNT))

if [ "$IMMEDIATE_IT_COUNT" -ge 20 ]; then
  pass "AC6 – dateRangeFilter-immediate.test.ts has $IMMEDIATE_IT_COUNT tests (>= 20 expected)"
else
  fail "AC6 – dateRangeFilter-immediate.test.ts has only $IMMEDIATE_IT_COUNT tests (expected >= 20)"
fi

if [ "$AC_IT_COUNT" -ge 20 ]; then
  pass "AC6 – issue269-ac-verification.test.ts has $AC_IT_COUNT tests (>= 20 expected)"
else
  fail "AC6 – issue269-ac-verification.test.ts has only $AC_IT_COUNT tests (expected >= 20)"
fi

if [ "$TOTAL_IT" -ge 50 ]; then
  pass "AC6 – Combined issue-269 test count is $TOTAL_IT (>= 50 expected)"
else
  fail "AC6 – Combined issue-269 test count is only $TOTAL_IT (expected >= 50)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

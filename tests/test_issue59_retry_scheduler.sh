#!/usr/bin/env bash
# tests/test_issue59_retry_scheduler.sh
#
# Acceptance-criteria verification for Issue #59:
#   "Implement exponential back-off retry schedule for failed webhook deliveries"
#
# These are static / structural checks that complement the Vitest unit tests
# (retryScheduler.test.ts, retryScheduler-supplemental.test.ts).  They verify
# that the source file and test files exist, that the canonical schedule values
# are present, and that the key symbols are exported.
#
# AC1  – Back-off schedule: immediate, ~1 min, ~5 min, ~30 min, ~2 h, ~8 h
# AC2  – Max attempt count defaults to 6 and is configurable
# AC3  – No retry after max attempts (exhausted transition)
# AC4  – Status transitions to `exhausted` after final failed attempt
# AC5  – Each attempt records timestamp, httpStatus, responseBodyExcerpt
# AC6  – Unit tests cover back-off interval calculation
# AC7  – Unit tests verify retries stop at max attempts
# AC8  – Unit tests verify exhausted transition
# AC9  – Configurable maxAttempts can be overridden

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCHEDULER="$REPO_ROOT/src/retryScheduler.ts"
TEST_FILE="$REPO_ROOT/tests/retryScheduler.test.ts"
SUPP_FILE="$REPO_ROOT/tests/retryScheduler-supplemental.test.ts"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: source file exists ───────────────────────────────────────────────────

if [ -f "$SCHEDULER" ]; then
  pass "AC1 – src/retryScheduler.ts exists"
else
  fail "AC1 – src/retryScheduler.ts is missing"
fi

# ── AC1: back-off schedule values are present ─────────────────────────────────

# Immediate (0 ms)
if grep -q "0," "$SCHEDULER" 2>/dev/null; then
  pass "AC1 – Schedule contains 0 ms (immediate) entry"
else
  fail "AC1 – Schedule missing 0 ms (immediate) entry"
fi

# 1 minute = 60000 ms
if grep -qE "1 \* 60 \* 1000|60_000|60000" "$SCHEDULER" 2>/dev/null; then
  pass "AC1 – Schedule contains 1-minute entry"
else
  fail "AC1 – Schedule missing 1-minute entry"
fi

# 5 minutes
if grep -qE "5 \* 60 \* 1000|300_000|300000" "$SCHEDULER" 2>/dev/null; then
  pass "AC1 – Schedule contains 5-minute entry"
else
  fail "AC1 – Schedule missing 5-minute entry"
fi

# 30 minutes
if grep -qE "30 \* 60 \* 1000|1800_000|1800000" "$SCHEDULER" 2>/dev/null; then
  pass "AC1 – Schedule contains 30-minute entry"
else
  fail "AC1 – Schedule missing 30-minute entry"
fi

# 2 hours
if grep -qE "2 \* 60 \* 60 \* 1000|7200_000|7200000" "$SCHEDULER" 2>/dev/null; then
  pass "AC1 – Schedule contains 2-hour entry"
else
  fail "AC1 – Schedule missing 2-hour entry"
fi

# 8 hours
if grep -qE "8 \* 60 \* 60 \* 1000|28800_000|28800000" "$SCHEDULER" 2>/dev/null; then
  pass "AC1 – Schedule contains 8-hour entry"
else
  fail "AC1 – Schedule missing 8-hour entry"
fi

# ── AC2: DEFAULT_MAX_ATTEMPTS = 6 ────────────────────────────────────────────

if grep -q "DEFAULT_MAX_ATTEMPTS" "$SCHEDULER" 2>/dev/null; then
  pass "AC2 – DEFAULT_MAX_ATTEMPTS is exported"
else
  fail "AC2 – DEFAULT_MAX_ATTEMPTS not found in source"
fi

if grep -qE "DEFAULT_MAX_ATTEMPTS\s*=\s*6|DEFAULT_MAX_ATTEMPTS\s*=\s*BACKOFF_SCHEDULE_MS\.length" "$SCHEDULER" 2>/dev/null; then
  pass "AC2 – DEFAULT_MAX_ATTEMPTS resolves to 6 (or schedule length)"
else
  fail "AC2 – DEFAULT_MAX_ATTEMPTS does not resolve to 6"
fi

# maxAttempts is configurable (present in options interface)
if grep -q "maxAttempts" "$SCHEDULER" 2>/dev/null; then
  pass "AC2 – maxAttempts option is present in scheduler interface"
else
  fail "AC2 – maxAttempts option not found in scheduler interface"
fi

# ── AC3 / AC4: exhausted status ───────────────────────────────────────────────

if grep -q "'exhausted'" "$SCHEDULER" 2>/dev/null; then
  pass "AC3/AC4 – 'exhausted' status is emitted by the scheduler"
else
  fail "AC3/AC4 – 'exhausted' status not found in scheduler source"
fi

if grep -q "isLastAttempt\|>= maxAttempts\|=== maxAttempts" "$SCHEDULER" 2>/dev/null; then
  pass "AC3 – Scheduler checks whether max attempts have been reached"
else
  fail "AC3 – No max-attempt guard found in scheduler source"
fi

# ── AC5: delivery event shape ─────────────────────────────────────────────────

if grep -q "timestamp" "$SCHEDULER" 2>/dev/null; then
  pass "AC5 – DeliveryEvent includes timestamp field"
else
  fail "AC5 – DeliveryEvent missing timestamp field"
fi

if grep -q "httpStatus" "$SCHEDULER" 2>/dev/null; then
  pass "AC5 – DeliveryEvent includes httpStatus field"
else
  fail "AC5 – DeliveryEvent missing httpStatus field"
fi

if grep -q "responseBodyExcerpt" "$SCHEDULER" 2>/dev/null; then
  pass "AC5 – DeliveryEvent includes responseBodyExcerpt field"
else
  fail "AC5 – DeliveryEvent missing responseBodyExcerpt field"
fi

if grep -q "attemptNumber" "$SCHEDULER" 2>/dev/null; then
  pass "AC5 – DeliveryEvent includes attemptNumber field"
else
  fail "AC5 – DeliveryEvent missing attemptNumber field"
fi

# ── AC6 / AC7 / AC8: unit test coverage ──────────────────────────────────────

if [ -f "$TEST_FILE" ]; then
  pass "AC6/AC7/AC8 – Primary unit test file exists (retryScheduler.test.ts)"
else
  fail "AC6/AC7/AC8 – Primary unit test file missing"
fi

if [ -f "$SUPP_FILE" ]; then
  pass "AC6/AC7/AC8 – Supplemental unit test file exists (retryScheduler-supplemental.test.ts)"
else
  fail "AC6/AC7/AC8 – Supplemental unit test file missing"
fi

# Check that back-off interval tests are present
if grep -q "back-off\|backoff\|BACKOFF_SCHEDULE_MS\[" "$TEST_FILE" 2>/dev/null; then
  pass "AC6 – Unit tests reference back-off interval values"
else
  fail "AC6 – No back-off interval tests found in primary test file"
fi

# Check that max-attempt tests are present
if grep -qE "maxAttempts|max.*attempt|callCount.*toBe" "$TEST_FILE" 2>/dev/null; then
  pass "AC7 – Unit tests verify max-attempt count"
else
  fail "AC7 – No max-attempt tests found in primary test file"
fi

# Check that exhausted tests are present
if grep -q "exhausted" "$TEST_FILE" 2>/dev/null; then
  pass "AC8 – Unit tests verify exhausted transition"
else
  fail "AC8 – No exhausted-transition tests found in primary test file"
fi

# ── AC9: configurable maxAttempts override ────────────────────────────────────

# Verify tests use custom maxAttempts values (not just the default 6)
if grep -qE "maxAttempts:\s*[1-5]|maxAttempts:\s*[7-9]" "$TEST_FILE" 2>/dev/null; then
  pass "AC9 – Unit tests exercise non-default maxAttempts values"
else
  fail "AC9 – No non-default maxAttempts values found in tests"
fi

# ── BACKOFF_SCHEDULE_MS export ────────────────────────────────────────────────

if grep -q "export.*BACKOFF_SCHEDULE_MS" "$SCHEDULER" 2>/dev/null; then
  pass "Export – BACKOFF_SCHEDULE_MS is a named export"
else
  fail "Export – BACKOFF_SCHEDULE_MS is not exported"
fi

if grep -q "export.*scheduleWithRetry" "$SCHEDULER" 2>/dev/null; then
  pass "Export – scheduleWithRetry is a named export"
else
  fail "Export – scheduleWithRetry is not exported"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

#!/usr/bin/env bash
# Tests for Issue #38: Unit tests for JavaScript/TypeScript logic in src/.
#
# This wrapper runs the Vitest unit-test suite (the configured unit-test
# environment) and asserts the expected unit-test files exist. It is invoked by
# tests/run_all.sh so that `npm test` exercises the TypeScript logic tests
# alongside the existing HTML/structure tests.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1/AC6: A unit test file exists under src/ with a *.test.ts convention ──
UNIT_TESTS=$(find "$REPO_ROOT/src" -type f \( -name '*.test.ts' -o -name '*.spec.ts' \) 2>/dev/null)
if [ -n "$UNIT_TESTS" ]; then
  pass "AC1 – at least one unit test file exists under src/ ($(echo "$UNIT_TESTS" | wc -l | tr -d ' ') found)"
else
  fail "AC1 – no *.test.ts / *.spec.ts unit test file found under src/"
fi

# ── AC2: The unit tests use the configured Vitest environment ────────────────
if [ -n "$UNIT_TESTS" ] && grep -rqE "from ['\"]vitest['\"]" $UNIT_TESTS; then
  pass "AC2 – unit test(s) import from the 'vitest' environment"
else
  fail "AC2 – unit test(s) do not import from 'vitest'"
fi

# ── AC3: Vitest runs and all unit tests pass ─────────────────────────────────
VITEST_BIN="$REPO_ROOT/node_modules/.bin/vitest"
if [ ! -x "$VITEST_BIN" ]; then
  echo "SKIP: vitest not found — run 'npm install' first (skipping AC3 run)"
else
  if ( cd "$REPO_ROOT" && "$VITEST_BIN" run ) > /dev/null 2>&1; then
    pass "AC3 – vitest unit suite passes (vitest run)"
  else
    fail "AC3 – vitest unit suite failed (vitest run)"
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

#!/usr/bin/env bash
# Unit tests for Issue #80: webhook delivery simulator and DI seam.
#
# Covers:
#  - AC1  simulator activated when flag is set (factory + event emission)
#  - AC2  real service returned when flag is unset (source-level check)
#  - AC8  simulator emits the same delivery-event shape as the real contract
#         (all required fields, correct types, retry flow, clamping, maxAttempts)
#  - AC9  simulator makes no network calls (pure client-side fixture)
#
# Uses esbuild (already a dev dependency) to transpile the TypeScript simulator
# to a runnable ESM bundle, then runs the JS unit tests with Node.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

PASS=0
FAIL=0
pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

ESBUILD="$REPO_ROOT/node_modules/.bin/esbuild"
SIMULATOR="$REPO_ROOT/src/delivery/simulator.ts"
BUILD_DIR="$REPO_ROOT/tests/_build_unit"
UNIT_TESTS="$REPO_ROOT/tests/test_simulator_di_unit.mjs"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK" "$BUILD_DIR"' EXIT

# ── Prerequisite checks ───────────────────────────────────────────────────────

if [ -x "$ESBUILD" ]; then
  pass "esbuild binary available"
else
  fail "esbuild binary not found at $ESBUILD (run npm ci)"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

if [ -f "$SIMULATOR" ]; then
  pass "simulator source exists at src/delivery/simulator.ts"
else
  fail "simulator source missing at src/delivery/simulator.ts"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# ── Transpile simulator to ESM for Node ──────────────────────────────────────

mkdir -p "$BUILD_DIR"
if "$ESBUILD" "$SIMULATOR" --bundle --format=esm \
      --outfile="$BUILD_DIR/simulator.mjs" \
      > "$WORK/esbuild.log" 2>&1; then
  pass "esbuild transpiles simulator.ts to ESM without errors"
else
  fail "esbuild failed to transpile simulator.ts"
  cat "$WORK/esbuild.log"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# ── Run the JS unit tests ─────────────────────────────────────────────────────

if node "$UNIT_TESTS" > "$WORK/unit.log" 2>&1; then
  pass "AC8/AC9 – simulator unit tests all pass"
  grep '^PASS:' "$WORK/unit.log" | sed 's/^/    /'
else
  fail "AC8/AC9 – one or more simulator unit tests failed"
  cat "$WORK/unit.log"
fi

# ── AC2: source-level check that flag-unset path uses real service ────────────

INDEX="$REPO_ROOT/src/delivery/index.ts"
REAL_SVC="$REPO_ROOT/src/delivery/realDeliveryService.ts"

if grep -q 'createRealDeliveryService' "$INDEX"; then
  pass "AC2 – DI seam calls createRealDeliveryService() when flag is unset"
else
  fail "AC2 – DI seam does not reference createRealDeliveryService()"
fi

if grep -q 'createRealDeliveryService' "$REAL_SVC"; then
  pass "AC2 – realDeliveryService.ts exports createRealDeliveryService()"
else
  fail "AC2 – realDeliveryService.ts does not export createRealDeliveryService()"
fi

# The real service must NOT import from the simulator module (no cross-contamination).
# We check non-comment lines only (grep -v strips lines starting with optional
# whitespace followed by //).
REAL_SVC_CODE=$(grep -v '^[[:space:]]*//' "$REAL_SVC" || true)
if echo "$REAL_SVC_CODE" | grep -q 'simulator'; then
  fail "AC2 – realDeliveryService.ts code (non-comment) references the simulator"
else
  pass "AC2 – realDeliveryService.ts code has no non-comment reference to the simulator"
fi

# ── AC1: source-level check that flag-set path uses the simulator ─────────────

if grep -qE "isSimulatorEnabled|VITE_USE_WEBHOOK_SIMULATOR" "$INDEX"; then
  pass "AC1 – DI seam exposes isSimulatorEnabled / reads VITE_USE_WEBHOOK_SIMULATOR"
else
  fail "AC1 – DI seam does not expose isSimulatorEnabled or read the env flag"
fi

# The simulator must be loaded via a guarded dynamic import (not a static one).
if grep -qE "await import" "$INDEX"; then
  pass "AC1 – simulator loaded via guarded dynamic import() in DI seam"
else
  fail "AC1 – DI seam does not use a guarded dynamic import() for the simulator"
fi

# ── AC7: DI seam is the only place that references the simulator ──────────────

SIM_REFS_OUTSIDE=$(grep -rl "delivery/simulator" "$REPO_ROOT/src" 2>/dev/null \
  | grep -v "src/delivery/" || true)
if [ -z "$SIM_REFS_OUTSIDE" ]; then
  pass "AC7 – no module outside src/delivery/ references the simulator"
else
  fail "AC7 – simulator referenced outside the delivery layer: $SIM_REFS_OUTSIDE"
fi

# ── AC9: simulator source contains no network API calls ──────────────────────

if grep -qE '\b(fetch|XMLHttpRequest|WebSocket|EventSource)\b' "$SIMULATOR"; then
  fail "AC9 – simulator.ts references a network API (must be fully client-side)"
else
  pass "AC9 – simulator.ts makes no network calls (pure client-side fixture)"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -gt 0 ] && exit 1
exit 0

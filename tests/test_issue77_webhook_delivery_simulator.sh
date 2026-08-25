#!/usr/bin/env bash
# Acceptance-criteria tests for Issue #77: webhook delivery simulator module.
#
# Structural checks that complement the Vitest unit tests in
# tests/webhookDeliverySimulator.test.ts.
#
# AC1  – File exists at src/simulator/webhookDeliverySimulator.ts.
# AC2  – createWebhookDeliverySimulator is exported from the module.
# AC3  – DeliveryEvent type/interface has all required fields.
# AC4  – DeliveryEvent is the canonical shared type (no duplicate definition).
# AC5  – simulate() method is present in the module.
# AC12 – No network calls (no fetch / XMLHttpRequest / http imports).
# AC13 – Module has no UI framework imports; env-flag documentation exists.
#
# Spec ref: spec § "Webhook delivery simulator (developer fixture)"

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIM_SRC="$REPO_ROOT/src/simulator/webhookDeliverySimulator.ts"
DELIVERY_EVENTS_SRC="$REPO_ROOT/src/delivery-events.ts"
DOCS_SIMULATOR="$REPO_ROOT/docs/simulator.md"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: File exists ──────────────────────────────────────────────────────────

if [ -f "$SIM_SRC" ]; then
  pass "AC1 – src/simulator/webhookDeliverySimulator.ts exists"
else
  fail "AC1 – src/simulator/webhookDeliverySimulator.ts does not exist"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# ── AC2: createWebhookDeliverySimulator is exported ───────────────────────────

if grep -qE "export function createWebhookDeliverySimulator" "$SIM_SRC"; then
  pass "AC2 – createWebhookDeliverySimulator is exported as a function"
else
  fail "AC2 – createWebhookDeliverySimulator export not found in simulator module"
fi

if grep -qE "successRate\s*:" "$SIM_SRC"; then
  pass "AC2 – options interface includes successRate field"
else
  fail "AC2 – successRate field not found in simulator options"
fi

if grep -qE "maxAttempts\s*:" "$SIM_SRC"; then
  pass "AC2 – options interface includes maxAttempts field"
else
  fail "AC2 – maxAttempts field not found in simulator options"
fi

# ── AC3: DeliveryEvent type has all required fields ───────────────────────────
# The canonical type lives in delivery-events.ts; the simulator re-exports it.

if [ -f "$DELIVERY_EVENTS_SRC" ]; then
  pass "AC3 – src/delivery-events.ts (canonical DeliveryEvent source) exists"
else
  fail "AC3 – src/delivery-events.ts does not exist"
fi

for field in webhookId eventType status attempt timestamp httpStatus responseBodyExcerpt; do
  if grep -qE "\b${field}\b" "$DELIVERY_EVENTS_SRC"; then
    pass "AC3 – DeliveryEvent has field: ${field}"
  else
    fail "AC3 – DeliveryEvent missing field: ${field}"
  fi
done

# Verify the status union includes all four required values
for status_val in pending delivered failed exhausted; do
  if grep -qE "'${status_val}'" "$DELIVERY_EVENTS_SRC"; then
    pass "AC3 – DeliveryStatus includes '${status_val}'"
  else
    fail "AC3 – DeliveryStatus missing '${status_val}'"
  fi
done

# ── AC4: No duplicate DeliveryEvent definition in simulator ───────────────────

# The simulator must re-export from delivery-events.ts, not define its own type.
if grep -qE "export (type|interface) DeliveryEvent\b" "$SIM_SRC"; then
  fail "AC4 – simulator defines its own DeliveryEvent (should re-export from delivery-events.ts)"
else
  pass "AC4 – simulator does not define a duplicate DeliveryEvent type"
fi

if grep -qE "from\s+['\"].*delivery-events['\"]" "$SIM_SRC"; then
  pass "AC4 – simulator imports/re-exports from the canonical delivery-events module"
else
  fail "AC4 – simulator does not reference delivery-events.ts"
fi

# ── AC5: simulate() method is present ────────────────────────────────────────

if grep -qE "simulate\s*\(" "$SIM_SRC"; then
  pass "AC5 – simulate() method is defined in the simulator module"
else
  fail "AC5 – simulate() method not found in simulator module"
fi

if grep -qE "AsyncIterable" "$SIM_SRC"; then
  pass "AC5 – simulate() returns an AsyncIterable"
else
  fail "AC5 – AsyncIterable not found in simulator module"
fi

# ── AC12: No network calls ────────────────────────────────────────────────────

if ! grep -qE "\bfetch\s*\(" "$SIM_SRC"; then
  pass "AC12 – simulator does not call fetch()"
else
  fail "AC12 – simulator contains a fetch() call"
fi

if ! grep -qE "XMLHttpRequest" "$SIM_SRC"; then
  pass "AC12 – simulator does not use XMLHttpRequest"
else
  fail "AC12 – simulator contains XMLHttpRequest"
fi

if ! grep -qE "from\s+['\"]https?://" "$SIM_SRC"; then
  pass "AC12 – simulator has no remote URL imports"
else
  fail "AC12 – simulator imports from a remote URL"
fi

if ! grep -qE "from\s+['\"]node:(http|https|net)['\"]" "$SIM_SRC"; then
  pass "AC12 – simulator does not import Node.js HTTP modules"
else
  fail "AC12 – simulator imports Node.js HTTP modules"
fi

# ── AC13: No UI framework imports ────────────────────────────────────────────

for framework in react vue svelte "@angular"; do
  if ! grep -qE "from\s+['\"]${framework}" "$SIM_SRC"; then
    pass "AC13 – simulator does not import UI framework: ${framework}"
  else
    fail "AC13 – simulator imports UI framework: ${framework}"
  fi
done

# ── AC13: Env-flag documentation exists ──────────────────────────────────────

if [ -f "$DOCS_SIMULATOR" ]; then
  pass "AC13 – docs/simulator.md exists (env-flag documentation)"
else
  fail "AC13 – docs/simulator.md not found (env-flag documentation missing)"
fi

if grep -qE "VITE_SIMULATOR|import\.meta\.env" "$DOCS_SIMULATOR" 2>/dev/null; then
  pass "AC13 – docs/simulator.md documents the activation env flag"
else
  fail "AC13 – docs/simulator.md does not mention VITE_SIMULATOR or import.meta.env"
fi

if grep -qiE "production|tree.shak|bundle" "$DOCS_SIMULATOR" 2>/dev/null; then
  pass "AC13 – docs/simulator.md documents production build exclusion"
else
  fail "AC13 – docs/simulator.md does not document production build exclusion"
fi

# ── Retry schedule constants ──────────────────────────────────────────────────

if grep -qE "RETRY_SCHEDULE_MS" "$SIM_SRC"; then
  pass "AC6 – RETRY_SCHEDULE_MS constant is defined in simulator module"
else
  fail "AC6 – RETRY_SCHEDULE_MS constant not found in simulator module"
fi

if grep -qE "export const RETRY_SCHEDULE_MS" "$SIM_SRC"; then
  pass "AC6 – RETRY_SCHEDULE_MS is exported"
else
  fail "AC6 – RETRY_SCHEDULE_MS is not exported"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

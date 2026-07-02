#!/usr/bin/env bash
# Acceptance-criteria tests for Issue #142: EventLog component.
#
# Verifies that the required source files exist, export the expected symbols,
# and that the TypeScript compiles cleanly.
#
# Spec ref: spec § "Webhook delivery & retries" — event log requirement.
# Spec ref: spec § "Event log filtering" — filtering interface (AC9).

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSC="$REPO_ROOT/node_modules/.bin/tsc"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── Pre-flight: required source files exist ───────────────────────────────────

for f in \
  "src/deliveryEvent.ts" \
  "src/DeliveryEventStore.ts" \
  "src/EventLog.ts"
do
  if [ -f "$REPO_ROOT/$f" ]; then
    pass "pre-flight – $f exists"
  else
    fail "pre-flight – $f does NOT exist"
  fi
done

# ── deliveryEvent.ts: required exports ───────────────────────────────────────

DELIVERY_EVENT="$REPO_ROOT/src/deliveryEvent.ts"

if grep -q "export interface DeliveryEvent" "$DELIVERY_EVENT"; then
  pass "deliveryEvent.ts – exports DeliveryEvent interface"
else
  fail "deliveryEvent.ts – DeliveryEvent interface not exported"
fi

if grep -q "export type DeliveryStatus" "$DELIVERY_EVENT"; then
  pass "deliveryEvent.ts – exports DeliveryStatus type"
else
  fail "deliveryEvent.ts – DeliveryStatus type not exported"
fi

# Required fields on DeliveryEvent.
for field in "id" "eventType" "timestamp" "status" "httpStatusCode" "responseBodyExcerpt" "attemptNumber"; do
  if grep -q "$field" "$DELIVERY_EVENT"; then
    pass "deliveryEvent.ts – field '$field' present"
  else
    fail "deliveryEvent.ts – field '$field' missing"
  fi
done

# All four status values must be present.
for status in "pending" "delivered" "failed" "exhausted"; do
  if grep -q "'$status'" "$DELIVERY_EVENT"; then
    pass "deliveryEvent.ts – status '$status' defined"
  else
    fail "deliveryEvent.ts – status '$status' missing from DeliveryStatus"
  fi
done

# ── DeliveryEventStore.ts: required exports ───────────────────────────────────

STORE_SRC="$REPO_ROOT/src/DeliveryEventStore.ts"

if grep -q "export class DeliveryEventStore" "$STORE_SRC"; then
  pass "DeliveryEventStore.ts – exports DeliveryEventStore class"
else
  fail "DeliveryEventStore.ts – DeliveryEventStore class not exported"
fi

for method in "add(" "subscribe(" "clear("; do
  if grep -q "$method" "$STORE_SRC"; then
    pass "DeliveryEventStore.ts – method '$method' present"
  else
    fail "DeliveryEventStore.ts – method '$method' missing"
  fi
done

# ── EventLog.ts: required exports ────────────────────────────────────────────

EVENTLOG_SRC="$REPO_ROOT/src/EventLog.ts"

if grep -q "export function mountEventLog" "$EVENTLOG_SRC"; then
  pass "EventLog.ts – exports mountEventLog function"
else
  fail "EventLog.ts – mountEventLog function not exported"
fi

if grep -q "export function formatTimestamp" "$EVENTLOG_SRC"; then
  pass "EventLog.ts – exports formatTimestamp helper"
else
  fail "EventLog.ts – formatTimestamp helper not exported"
fi

if grep -q "export function truncateExcerpt" "$EVENTLOG_SRC"; then
  pass "EventLog.ts – exports truncateExcerpt helper"
else
  fail "EventLog.ts – truncateExcerpt helper not exported"
fi

if grep -q "export function renderEntry" "$EVENTLOG_SRC"; then
  pass "EventLog.ts – exports renderEntry helper"
else
  fail "EventLog.ts – renderEntry helper not exported"
fi

# AC6: documented display order (most-recent first).
if grep -qi "most.recent" "$EVENTLOG_SRC"; then
  pass "EventLog.ts – display order (most-recent first) is documented"
else
  fail "EventLog.ts – display order not documented in source"
fi

# AC9: data attributes for filter compatibility.
for attr in "data-event-type" "data-status" "data-timestamp"; do
  if grep -q "$attr" "$EVENTLOG_SRC"; then
    pass "EventLog.ts – '$attr' attribute present for filter compatibility (AC9)"
  else
    fail "EventLog.ts – '$attr' attribute missing (AC9 filter interface)"
  fi
done

# ── TypeScript compilation check ──────────────────────────────────────────────

if [ ! -x "$TSC" ]; then
  fail "pre-flight – tsc not found at $TSC (run 'npm install' first)"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – tsc binary is available"

TMPDIR_TS="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_TS"' EXIT

TSC_OUT=$(
  "$TSC" \
    --module ESNext \
    --moduleResolution node \
    --target ES2020 \
    --outDir "$TMPDIR_TS/out" \
    --noEmit false \
    --allowImportingTsExtensions false \
    --strict true \
    --skipLibCheck true \
    --lib "ES2020,DOM" \
    "$REPO_ROOT/src/deliveryEvent.ts" \
    "$REPO_ROOT/src/DeliveryEventStore.ts" \
    "$REPO_ROOT/src/EventLog.ts" \
    2>&1
)
TSC_EXIT=$?

if [ "$TSC_EXIT" -eq 0 ]; then
  pass "compile – all three source files compile without TypeScript errors"
else
  fail "compile – tsc exited with code $TSC_EXIT"
  echo "$TSC_OUT"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

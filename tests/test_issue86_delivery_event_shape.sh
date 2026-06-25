#!/usr/bin/env bash
# Tests for Issue #86: Simulator event emission matches the canonical
# delivery-event shape shared with the real delivery mechanism.
#
# Acceptance criteria covered:
#   AC1 – Canonical DeliveryEvent interface is defined and exported with
#         status / timestamp / HTTP status code / response body excerpt.
#   AC2 – Simulator events are typed against the canonical interface
#         (TypeScript compilation fails on a non-conforming shape).
#   AC3 – Real delivery mechanism events are typed against the same interface.
#   AC4 – No UI special-case branching distinguishing simulated vs real events.
#   AC5 – Runtime assertions that emitted objects satisfy every required field.
#   AC6 – All four status values emit a conforming shape.
#   AC7 – Canonical interface is importable as a standalone module.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DELIVERY_DIR="$REPO_ROOT/src/delivery"
ESBUILD="$REPO_ROOT/node_modules/.bin/esbuild"
TSC="$REPO_ROOT/node_modules/.bin/tsc"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1 / AC7: canonical interface module exists and is standalone ───────────
EVENT_TS="$DELIVERY_DIR/event.ts"
if [ -f "$EVENT_TS" ]; then
  pass "AC1/AC7 – canonical event module exists ($EVENT_TS)"
else
  fail "AC1/AC7 – canonical event module is missing ($EVENT_TS)"
fi

if [ -f "$EVENT_TS" ]; then
  if grep -qE "export +interface +DeliveryEvent" "$EVENT_TS"; then
    pass "AC1 – DeliveryEvent interface is exported"
  else
    fail "AC1 – DeliveryEvent interface is not exported"
  fi
  for field in "status" "timestamp" "httpStatusCode" "responseBodyExcerpt"; do
    if grep -qE "$field" "$EVENT_TS"; then
      pass "AC1 – DeliveryEvent declares field '$field'"
    else
      fail "AC1 – DeliveryEvent missing field '$field'"
    fi
  done
  # AC7: the canonical module must not import from the simulator or real
  # mechanism (no circular import; it is a standalone source of truth).
  if grep -qE "from +['\"]\./(simulator|realDelivery)" "$EVENT_TS"; then
    fail "AC7 – canonical module imports a consumer (risks circular import)"
  else
    pass "AC7 – canonical module has no imports from its consumers"
  fi
fi

# ── AC2 / AC3: both consumers import & are typed against the canonical type ──
SIM_TS="$DELIVERY_DIR/simulator.ts"
REAL_TS="$DELIVERY_DIR/realDelivery.ts"
for f in "$SIM_TS" "$REAL_TS"; do
  if [ -f "$f" ] && grep -qE "DeliveryEvent" "$f" \
     && grep -qE "from +['\"]\./event" "$f"; then
    pass "AC2/AC3 – $(basename "$f") imports & references DeliveryEvent"
  else
    fail "AC2/AC3 – $(basename "$f") does not depend on canonical DeliveryEvent"
  fi
done

# ── AC2 / AC3: TypeScript compiles cleanly (conforming shapes) ───────────────
if [ -x "$TSC" ]; then
  TSC_OUT=$(cd "$REPO_ROOT" && "$TSC" --noEmit 2>&1)
  if [ $? -eq 0 ]; then
    pass "AC2/AC3 – tsc --noEmit passes (emitted shapes conform)"
  else
    fail "AC2/AC3 – tsc --noEmit failed"
    echo "$TSC_OUT"
  fi
else
  fail "AC2/AC3 – tsc binary not found at $TSC"
fi

# ── AC2 (negative): an intentionally non-conforming emit fails to compile ────
# Use a non-dot filename so tsconfig's "include": ["src"] glob picks it up.
if [ -x "$TSC" ]; then
  BAD_TS="$DELIVERY_DIR/issue86_bad_shape_check.ts"
  cat > "$BAD_TS" <<'EOF'
import { DeliveryEvent } from './event';
// Wrong status literal and missing required fields: must NOT type-check.
const bad: DeliveryEvent = { status: 'nope' };
export const _badIssue86 = bad;
EOF
  BAD_OUT=$(cd "$REPO_ROOT" && "$TSC" --noEmit 2>&1)
  BAD_EXIT=$?
  rm -f "$BAD_TS"
  if [ "$BAD_EXIT" -ne 0 ]; then
    pass "AC2 – a non-conforming emit is rejected by the compiler"
  else
    fail "AC2 – compiler accepted a non-conforming DeliveryEvent shape"
  fi
fi

# ── AC4: no UI special-case branching simulated-vs-real ──────────────────────
# Search src (UI consumers) for branching that distinguishes the two sources.
UI_BRANCH=$(grep -rniE "isSimulated|simulated.*real|real.*simulated|fromSimulator" \
  "$REPO_ROOT/src" 2>/dev/null \
  | grep -vE "src/delivery/(simulator|realDelivery|event)\.ts" \
  | grep -viE "no special-case|single shared contract|need no special-case" || true)
if [ -z "$UI_BRANCH" ]; then
  pass "AC4 – no UI branching distinguishes simulated vs real events"
else
  fail "AC4 – UI code branches on event source:"
  echo "$UI_BRANCH"
fi

# ── AC5 / AC6: runtime assertions on emitted shape for all statuses ──────────
if [ -x "$ESBUILD" ]; then
  WORK="$(mktemp -d -p "$REPO_ROOT/tests")"
  OUT_JS="$WORK/runtime_check.mjs"
  cat > "$WORK/runner.ts" <<EOF
import {
  createSimulatedEvent,
  createAllStatusEvents,
} from '$REPO_ROOT/src/delivery/simulator';
import {
  isDeliveryEvent,
  DELIVERY_STATUSES,
} from '$REPO_ROOT/src/delivery/event';
import type { DeliveryStatus } from '$REPO_ROOT/src/delivery/event';

let failures = 0;
function check(cond: boolean, msg: string): void {
  if (cond) {
    console.log('  ok: ' + msg);
  } else {
    console.log('  NOT-OK: ' + msg);
    failures++;
  }
}

// AC6: every status emits a conforming shape.
for (const status of DELIVERY_STATUSES) {
  const ev = createSimulatedEvent(status as DeliveryStatus);
  check(ev.status === status, \`status '\${status}' preserved\`);
  check(isDeliveryEvent(ev), \`status '\${status}' satisfies DeliveryEvent\`);
  // AC5: every required field present and correctly typed.
  check(typeof ev.timestamp === 'string' && ev.timestamp.length > 0,
    \`status '\${status}' has non-empty timestamp string\`);
  check(!Number.isNaN(Date.parse(ev.timestamp)),
    \`status '\${status}' timestamp is parseable\`);
  check(ev.httpStatusCode === null || typeof ev.httpStatusCode === 'number',
    \`status '\${status}' httpStatusCode is number|null\`);
  check(typeof ev.responseBodyExcerpt === 'string',
    \`status '\${status}' responseBodyExcerpt is string\`);
}

// All-status helper emits exactly the four canonical statuses.
const all = createAllStatusEvents();
check(all.length === 4, 'createAllStatusEvents emits 4 events');
check(all.every(isDeliveryEvent), 'all emitted events satisfy DeliveryEvent');

// Response body excerpt is truncated to the canonical max length.
const longBody = 'x'.repeat(5000);
const truncated = createSimulatedEvent('delivered', { responseBody: longBody });
check(truncated.responseBodyExcerpt.length <= 512,
  'long response body is truncated to <= 512 chars');

if (failures > 0) {
  console.log(\`RUNTIME FAILURES: \${failures}\`);
  process.exit(1);
}
console.log('ALL RUNTIME CHECKS PASSED');
EOF

  if "$ESBUILD" "$WORK/runner.ts" --bundle --platform=node --format=esm \
      --outfile="$OUT_JS" --log-level=warning >/dev/null 2>&1; then
    RUNTIME_OUT=$(node "$OUT_JS" 2>&1)
    RUNTIME_EXIT=$?
    echo "$RUNTIME_OUT"
    if [ "$RUNTIME_EXIT" -eq 0 ]; then
      pass "AC5/AC6 – simulator emits a conforming shape for all four statuses"
    else
      fail "AC5/AC6 – runtime shape assertions failed"
    fi
  else
    fail "AC5/AC6 – failed to bundle runtime check with esbuild"
  fi
  rm -rf "$WORK"
else
  fail "AC5/AC6 – esbuild binary not found at $ESBUILD"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

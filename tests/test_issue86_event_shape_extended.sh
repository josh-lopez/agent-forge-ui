#!/usr/bin/env bash
# Extended tests for Issue #86: Canonical delivery-event shape contract.
#
# This file supplements test_issue86_delivery_event_shape.sh with additional
# coverage of edge cases, the real-delivery helper, the DELIVERY_STATUSES
# constant, toResponseBodyExcerpt, and deeper AC3/AC5/AC6/AC7 assertions.
#
# Acceptance criteria covered:
#   AC1 – DeliveryStatus type and DELIVERY_STATUSES constant exported.
#   AC3 – toDeliveryEvent (real mechanism) emits conforming shapes for all
#         four statuses, including null httpStatusCode and empty body.
#   AC5 – toResponseBodyExcerpt helper truncates and handles null/undefined.
#   AC6 – All four statuses covered via real-delivery path as well.
#   AC7 – event.ts has no runtime imports (standalone, no circular risk).

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DELIVERY_DIR="$REPO_ROOT/src/delivery"
ESBUILD="$REPO_ROOT/node_modules/.bin/esbuild"
TSC="$REPO_ROOT/node_modules/.bin/tsc"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: DeliveryStatus type and DELIVERY_STATUSES constant are exported ─────
EVENT_TS="$DELIVERY_DIR/event.ts"

if grep -qE "export +type +DeliveryStatus" "$EVENT_TS" 2>/dev/null; then
  pass "AC1 – DeliveryStatus type is exported from event.ts"
else
  fail "AC1 – DeliveryStatus type is not exported from event.ts"
fi

if grep -qE "export +const +DELIVERY_STATUSES" "$EVENT_TS" 2>/dev/null; then
  pass "AC1 – DELIVERY_STATUSES constant is exported from event.ts"
else
  fail "AC1 – DELIVERY_STATUSES constant is not exported from event.ts"
fi

# All four status literals must appear in DELIVERY_STATUSES
for status in pending delivered failed exhausted; do
  if grep -qE "'$status'" "$EVENT_TS" 2>/dev/null; then
    pass "AC1 – status literal '$status' present in event.ts"
  else
    fail "AC1 – status literal '$status' missing from event.ts"
  fi
done

# ── AC5: toResponseBodyExcerpt helper is exported ────────────────────────────
if grep -qE "export +function +toResponseBodyExcerpt" "$EVENT_TS" 2>/dev/null; then
  pass "AC5 – toResponseBodyExcerpt helper is exported from event.ts"
else
  fail "AC5 – toResponseBodyExcerpt helper is not exported from event.ts"
fi

# ── AC3: realDelivery.ts exports toDeliveryEvent typed as DeliveryEvent ──────
REAL_TS="$DELIVERY_DIR/realDelivery.ts"
if grep -qE "export +function +toDeliveryEvent" "$REAL_TS" 2>/dev/null; then
  pass "AC3 – toDeliveryEvent function is exported from realDelivery.ts"
else
  fail "AC3 – toDeliveryEvent function is not exported from realDelivery.ts"
fi

if grep -qE "DeliveryEvent" "$REAL_TS" 2>/dev/null; then
  pass "AC3 – realDelivery.ts return type references DeliveryEvent"
else
  fail "AC3 – realDelivery.ts does not reference DeliveryEvent return type"
fi

# ── AC7: event.ts has no import statements (truly standalone) ────────────────
if ! grep -qE "^import " "$EVENT_TS" 2>/dev/null; then
  pass "AC7 – event.ts has zero import statements (fully standalone)"
else
  fail "AC7 – event.ts has import statement(s); should be standalone"
fi

# ── AC2 (negative): missing required fields also rejected by compiler ─────────
if [ -x "$TSC" ]; then
  BAD2_TS="$DELIVERY_DIR/issue86_bad_missing_fields.ts"
  cat > "$BAD2_TS" <<'EOF'
import { DeliveryEvent } from './event';
// Missing timestamp, httpStatusCode, responseBodyExcerpt — must fail.
const bad: DeliveryEvent = { status: 'pending' };
export const _bad86b = bad;
EOF
  BAD2_OUT=$(cd "$REPO_ROOT" && "$TSC" --noEmit 2>&1)
  BAD2_EXIT=$?
  rm -f "$BAD2_TS"
  if [ "$BAD2_EXIT" -ne 0 ]; then
    pass "AC2 – missing required fields are rejected by the compiler"
  else
    fail "AC2 – compiler accepted an object with missing required fields"
  fi

  # Wrong type for httpStatusCode (string instead of number|null)
  BAD3_TS="$DELIVERY_DIR/issue86_bad_http_type.ts"
  cat > "$BAD3_TS" <<'EOF'
import { DeliveryEvent } from './event';
// httpStatusCode must be number|null, not string — must fail.
const bad: DeliveryEvent = {
  status: 'delivered',
  timestamp: new Date().toISOString(),
  httpStatusCode: '200',
  responseBodyExcerpt: '',
};
export const _bad86c = bad;
EOF
  BAD3_OUT=$(cd "$REPO_ROOT" && "$TSC" --noEmit 2>&1)
  BAD3_EXIT=$?
  rm -f "$BAD3_TS"
  if [ "$BAD3_EXIT" -ne 0 ]; then
    pass "AC2 – wrong httpStatusCode type (string) is rejected by the compiler"
  else
    fail "AC2 – compiler accepted string for httpStatusCode (should be number|null)"
  fi
fi

# ── AC3 / AC5 / AC6: runtime checks on real-delivery path ────────────────────
if [ -x "$ESBUILD" ]; then
  WORK="$(mktemp -d -p "$REPO_ROOT/tests")"
  OUT_JS="$WORK/real_delivery_check.mjs"

  cat > "$WORK/real_runner.ts" <<EOF
import { toDeliveryEvent } from '$REPO_ROOT/src/delivery/realDelivery';
import {
  isDeliveryEvent,
  DELIVERY_STATUSES,
  toResponseBodyExcerpt,
  RESPONSE_BODY_EXCERPT_MAX_LENGTH,
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

// AC3 / AC6: toDeliveryEvent emits a conforming shape for all four statuses.
const httpCodes: Record<DeliveryStatus, number | null> = {
  pending: null,
  delivered: 200,
  failed: 503,
  exhausted: 503,
};
const bodies: Record<DeliveryStatus, string> = {
  pending: '',
  delivered: '{"ok":true}',
  failed: '{"error":"upstream"}',
  exhausted: '{"error":"max retries"}',
};

for (const status of DELIVERY_STATUSES) {
  const ev = toDeliveryEvent(status as DeliveryStatus, {
    httpStatusCode: httpCodes[status as DeliveryStatus],
    responseBody: bodies[status as DeliveryStatus],
    timestamp: new Date('2025-01-15T12:00:00.000Z'),
  });
  check(isDeliveryEvent(ev), \`real toDeliveryEvent('\${status}') satisfies DeliveryEvent\`);
  check(ev.status === status, \`real toDeliveryEvent('\${status}') preserves status\`);
  check(ev.timestamp === '2025-01-15T12:00:00.000Z',
    \`real toDeliveryEvent('\${status}') preserves timestamp\`);
  check(ev.httpStatusCode === httpCodes[status as DeliveryStatus],
    \`real toDeliveryEvent('\${status}') preserves httpStatusCode\`);
  check(typeof ev.responseBodyExcerpt === 'string',
    \`real toDeliveryEvent('\${status}') responseBodyExcerpt is string\`);
}

// AC3: null httpStatusCode is preserved (pending / connection error).
const pendingEv = toDeliveryEvent('pending', { httpStatusCode: null });
check(pendingEv.httpStatusCode === null,
  'real toDeliveryEvent preserves null httpStatusCode');
check(isDeliveryEvent(pendingEv),
  'real toDeliveryEvent with null httpStatusCode satisfies DeliveryEvent');

// AC3: missing responseBody defaults to empty string excerpt.
const noBodyEv = toDeliveryEvent('delivered', { httpStatusCode: 200 });
check(noBodyEv.responseBodyExcerpt === '',
  'real toDeliveryEvent with no responseBody yields empty excerpt');

// AC5: toResponseBodyExcerpt truncates to RESPONSE_BODY_EXCERPT_MAX_LENGTH.
const longBody = 'a'.repeat(RESPONSE_BODY_EXCERPT_MAX_LENGTH + 100);
const excerpt = toResponseBodyExcerpt(longBody);
check(excerpt.length === RESPONSE_BODY_EXCERPT_MAX_LENGTH,
  \`toResponseBodyExcerpt truncates to exactly \${RESPONSE_BODY_EXCERPT_MAX_LENGTH} chars\`);

// AC5: toResponseBodyExcerpt handles null input.
check(toResponseBodyExcerpt(null) === '',
  'toResponseBodyExcerpt(null) returns empty string');

// AC5: toResponseBodyExcerpt handles undefined input.
check(toResponseBodyExcerpt(undefined) === '',
  'toResponseBodyExcerpt(undefined) returns empty string');

// AC5: toResponseBodyExcerpt handles empty string input.
check(toResponseBodyExcerpt('') === '',
  'toResponseBodyExcerpt("") returns empty string');

// AC5: toResponseBodyExcerpt does not truncate short bodies.
const shortBody = 'short response';
check(toResponseBodyExcerpt(shortBody) === shortBody,
  'toResponseBodyExcerpt does not truncate short bodies');

// AC6: DELIVERY_STATUSES contains exactly the four canonical values.
check(DELIVERY_STATUSES.length === 4,
  'DELIVERY_STATUSES has exactly 4 entries');
check(DELIVERY_STATUSES.includes('pending'),   "DELIVERY_STATUSES includes 'pending'");
check(DELIVERY_STATUSES.includes('delivered'), "DELIVERY_STATUSES includes 'delivered'");
check(DELIVERY_STATUSES.includes('failed'),    "DELIVERY_STATUSES includes 'failed'");
check(DELIVERY_STATUSES.includes('exhausted'), "DELIVERY_STATUSES includes 'exhausted'");

// AC3: toDeliveryEvent accepts a string timestamp (not just Date).
const strTimestamp = '2025-06-01T08:30:00.000Z';
const strTsEv = toDeliveryEvent('delivered', {
  httpStatusCode: 200,
  timestamp: strTimestamp,
});
check(strTsEv.timestamp === strTimestamp,
  'real toDeliveryEvent accepts a string timestamp directly');

if (failures > 0) {
  console.log(\`RUNTIME FAILURES: \${failures}\`);
  process.exit(1);
}
console.log('ALL EXTENDED RUNTIME CHECKS PASSED');
EOF

  if "$ESBUILD" "$WORK/real_runner.ts" --bundle --platform=node --format=esm \
      --outfile="$OUT_JS" --log-level=warning >/dev/null 2>&1; then
    RUNTIME_OUT=$(node "$OUT_JS" 2>&1)
    RUNTIME_EXIT=$?
    echo "$RUNTIME_OUT"
    if [ "$RUNTIME_EXIT" -eq 0 ]; then
      pass "AC3/AC5/AC6 – real-delivery path emits conforming shapes for all statuses"
    else
      fail "AC3/AC5/AC6 – real-delivery runtime shape assertions failed"
    fi
  else
    fail "AC3/AC5/AC6 – failed to bundle real-delivery runtime check with esbuild"
  fi
  rm -rf "$WORK"
else
  fail "AC3/AC5/AC6 – esbuild binary not found at $ESBUILD"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

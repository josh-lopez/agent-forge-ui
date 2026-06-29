#!/usr/bin/env bash
# Acceptance-criteria tests for Issue #110: Payment event schema.
#
# Covers the structural / documentation acceptance criteria that are best
# verified by inspecting the file system and source text rather than by
# running TypeScript:
#
#   AC1  – Schema file exists at src/events/paymentEventSchema.ts and defines
#           the base event shape with the five required fields.
#   AC2  – Concrete typed definitions exist for all five event types.
#   AC3  – All event types and the base shape are exported from the module.
#   AC4  – PAYMENT_EVENTS.md exists and documents each event type, its
#           eventType literal, and payload fields with types and descriptions.
#   AC5  – A unit test file exists that constructs a sample for each of the
#           five event types and asserts schema satisfaction.
#   AC6  – The unit test covers at least one negative case (missing required
#           field fails validation).
#   AC7  – No runtime dependency on a backend service is introduced.
#
# Spec ref: Issue #110 acceptance criteria.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCHEMA_SRC="$REPO_ROOT/src/events/paymentEventSchema.ts"
DOC_FILE="$REPO_ROOT/PAYMENT_EVENTS.md"
TEST_FILE="$REPO_ROOT/tests/paymentEventSchema.test.ts"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: Schema file exists with base event shape fields ─────────────────────

if [ -f "$SCHEMA_SRC" ]; then
  pass "AC1 – src/events/paymentEventSchema.ts exists"
else
  fail "AC1 – src/events/paymentEventSchema.ts does not exist"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# Verify the five required base-shape fields are present in the source.
for field in eventId paymentId eventType occurredAt payload; do
  if grep -q "$field" "$SCHEMA_SRC"; then
    pass "AC1 – base shape field '$field' is defined in schema"
  else
    fail "AC1 – base shape field '$field' is missing from schema"
  fi
done

# Verify UUID and ISO-8601 are referenced (documentation / validation).
if grep -qE "UUID|uuid|UUID_RE" "$SCHEMA_SRC"; then
  pass "AC1 – eventId UUID constraint is referenced in schema"
else
  fail "AC1 – eventId UUID constraint not found in schema"
fi

if grep -qE "ISO.?8601|ISO_8601_RE" "$SCHEMA_SRC"; then
  pass "AC1 – occurredAt ISO-8601 constraint is referenced in schema"
else
  fail "AC1 – occurredAt ISO-8601 constraint not found in schema"
fi

# ── AC2: All five concrete event types are defined ───────────────────────────

for event_type in PaymentInitiated PaymentAuthorised PaymentCaptured PaymentFailed PaymentRefunded; do
  if grep -q "${event_type}Event" "$SCHEMA_SRC"; then
    pass "AC2 – concrete event type '${event_type}Event' is defined"
  else
    fail "AC2 – concrete event type '${event_type}Event' is missing"
  fi
done

# Verify each event type has its own payload interface.
for payload_type in PaymentInitiatedPayload PaymentAuthorisedPayload PaymentCapturedPayload PaymentFailedPayload PaymentRefundedPayload; do
  if grep -q "$payload_type" "$SCHEMA_SRC"; then
    pass "AC2 – payload interface '$payload_type' is defined"
  else
    fail "AC2 – payload interface '$payload_type' is missing"
  fi
done

# Verify discriminated union literals are present.
for literal in "'PaymentInitiated'" "'PaymentAuthorised'" "'PaymentCaptured'" "'PaymentFailed'" "'PaymentRefunded'"; do
  if grep -q "$literal" "$SCHEMA_SRC"; then
    pass "AC2 – discriminated literal $literal is present"
  else
    fail "AC2 – discriminated literal $literal is missing"
  fi
done

# ── AC3: All types are exported ───────────────────────────────────────────────

for export_name in \
  "PaymentEventType" \
  "BasePaymentEvent" \
  "PaymentInitiatedEvent" \
  "PaymentAuthorisedEvent" \
  "PaymentCapturedEvent" \
  "PaymentFailedEvent" \
  "PaymentRefundedEvent" \
  "PaymentEvent" \
  "PAYMENT_EVENT_TYPES" \
  "isPaymentEvent" \
  "assertPaymentEvent"; do
  if grep -qE "^export (type |interface |function |const )${export_name}" "$SCHEMA_SRC"; then
    pass "AC3 – '$export_name' is exported from the schema module"
  else
    fail "AC3 – '$export_name' is not exported from the schema module"
  fi
done

# ── AC4: PAYMENT_EVENTS.md exists and documents each event type ───────────────

if [ -f "$DOC_FILE" ]; then
  pass "AC4 – PAYMENT_EVENTS.md exists in the repo root"
else
  fail "AC4 – PAYMENT_EVENTS.md does not exist"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# Each event type must be documented.
for event_type in PaymentInitiated PaymentAuthorised PaymentCaptured PaymentFailed PaymentRefunded; do
  if grep -q "$event_type" "$DOC_FILE"; then
    pass "AC4 – '$event_type' is documented in PAYMENT_EVENTS.md"
  else
    fail "AC4 – '$event_type' is missing from PAYMENT_EVENTS.md"
  fi
done

# Each eventType literal value must appear in the doc.
for literal in '"PaymentInitiated"' '"PaymentAuthorised"' '"PaymentCaptured"' '"PaymentFailed"' '"PaymentRefunded"'; do
  if grep -q "$literal" "$DOC_FILE"; then
    pass "AC4 – eventType literal $literal is documented"
  else
    fail "AC4 – eventType literal $literal is missing from PAYMENT_EVENTS.md"
  fi
done

# Payload fields must be documented (spot-check key fields from each event).
for field in amountMinor currency customerId authorisationId reasonCode reason refundId; do
  if grep -q "$field" "$DOC_FILE"; then
    pass "AC4 – payload field '$field' is documented in PAYMENT_EVENTS.md"
  else
    fail "AC4 – payload field '$field' is missing from PAYMENT_EVENTS.md"
  fi
done

# The doc must have a base event shape section.
if grep -qiE "base event shape|base shape" "$DOC_FILE"; then
  pass "AC4 – PAYMENT_EVENTS.md documents the base event shape"
else
  fail "AC4 – PAYMENT_EVENTS.md does not document the base event shape"
fi

# The doc must reference the canonical TypeScript source.
if grep -q "paymentEventSchema" "$DOC_FILE"; then
  pass "AC4 – PAYMENT_EVENTS.md references the canonical TypeScript source"
else
  fail "AC4 – PAYMENT_EVENTS.md does not reference paymentEventSchema.ts"
fi

# ── AC5: Unit test file exists and covers all five event types ────────────────

if [ -f "$TEST_FILE" ]; then
  pass "AC5 – tests/paymentEventSchema.test.ts exists"
else
  fail "AC5 – tests/paymentEventSchema.test.ts does not exist"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

for event_type in PaymentInitiated PaymentAuthorised PaymentCaptured PaymentFailed PaymentRefunded; do
  if grep -q "$event_type" "$TEST_FILE"; then
    pass "AC5 – '$event_type' sample is present in the unit test"
  else
    fail "AC5 – '$event_type' sample is missing from the unit test"
  fi
done

# Verify the test imports the schema module.
if grep -q "paymentEventSchema" "$TEST_FILE"; then
  pass "AC5 – unit test imports from paymentEventSchema"
else
  fail "AC5 – unit test does not import from paymentEventSchema"
fi

# Verify runtime validation is exercised.
if grep -qE "isPaymentEvent|assertPaymentEvent" "$TEST_FILE"; then
  pass "AC5 – unit test exercises runtime validation (isPaymentEvent / assertPaymentEvent)"
else
  fail "AC5 – unit test does not exercise runtime validation"
fi

# ── AC6: Negative case is covered ────────────────────────────────────────────

# The test must contain at least one negative / rejection assertion.
if grep -qE "toBe\(false\)|toThrow|rejects" "$TEST_FILE"; then
  pass "AC6 – unit test contains at least one negative (rejection) assertion"
else
  fail "AC6 – unit test has no negative (rejection) assertions"
fi

# Specifically, missing eventId must be tested.
if grep -qE "eventId|missing.*required|required.*field" "$TEST_FILE"; then
  pass "AC6 – unit test references eventId in a negative context"
else
  fail "AC6 – unit test does not test missing eventId"
fi

# ── AC7: No backend runtime dependency ───────────────────────────────────────

# The schema file must not import from any backend/network module.
if grep -qE "^import.*(fetch|http|https|axios|node-fetch|got|superagent)" "$SCHEMA_SRC"; then
  fail "AC7 – schema imports a network/HTTP library (backend dependency detected)"
else
  pass "AC7 – schema has no network/HTTP imports"
fi

# The schema file must not reference any URL or endpoint.
if grep -qE "https?://" "$SCHEMA_SRC"; then
  fail "AC7 – schema contains a URL reference (possible backend dependency)"
else
  pass "AC7 – schema contains no URL references"
fi

# The schema must not be in devDependencies or dependencies with a backend lib.
BACKEND_LIBS="express|fastify|koa|hapi|nestjs|prisma|typeorm|sequelize|mongoose"
if grep -qE "$BACKEND_LIBS" "$REPO_ROOT/package.json"; then
  fail "AC7 – package.json lists a backend library as a dependency"
else
  pass "AC7 – package.json has no backend library dependencies"
fi

# ── Final summary ─────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

#!/usr/bin/env bash
# Tests for Issue #46: Create billing reconciliation audit log.
# Covers all six acceptance criteria for the static/mock audit log component.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INDEX_HTML="$REPO_ROOT/index.html"
STYLE_CSS="$REPO_ROOT/style.css"
AUDIT_JS="$REPO_ROOT/public/audit-log.js"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: An audit log UI component is visible within the application ──────────
if grep -qE 'id="audit-log"' "$INDEX_HTML"; then
  pass "AC1 – audit log component is present in index.html"
else
  fail "AC1 – audit log component (id=\"audit-log\") not found in index.html"
fi

if grep -qiE 'Billing Reconciliation Audit Log' "$INDEX_HTML"; then
  pass "AC1 – audit log has a descriptive heading"
else
  fail "AC1 – audit log heading not found"
fi

if [ -f "$AUDIT_JS" ]; then
  pass "AC1 – audit-log.js exists (renders log entries)"
else
  fail "AC1 – audit-log.js not found"
fi

# ── AC2: Each log entry shows timestamp, event type, amount and status ────────
for col in Timestamp "Event Type" Amount Status; do
  if grep -q "$col" "$INDEX_HTML"; then
    pass "AC2 – table has a '$col' column header"
  else
    fail "AC2 – table is missing the '$col' column header"
  fi
done

# The mock data must include the required fields per entry.
for field in timestamp eventType amount status; do
  if grep -q "$field" "$AUDIT_JS"; then
    pass "AC2 – mock data entries include '$field'"
  else
    fail "AC2 – mock data entries are missing '$field'"
  fi
done

# At least three distinct statuses are represented (matched/discrepancy/resolved).
for st in matched discrepancy resolved; do
  if grep -q "\"$st\"" "$AUDIT_JS"; then
    pass "AC2 – status value '$st' is represented in mock data"
  else
    fail "AC2 – status value '$st' is not represented in mock data"
  fi
done

# ── AC3: Entries are filterable or sortable by at least one field ─────────────
if grep -qE 'id="status-filter"' "$INDEX_HTML"; then
  pass "AC3 – a status filter control is present"
else
  fail "AC3 – no status filter control found"
fi

if grep -qE 'id="sort-order"' "$INDEX_HTML"; then
  pass "AC3 – a date sort control is present"
else
  fail "AC3 – no sort control found"
fi

if grep -q 'addEventListener' "$AUDIT_JS" && grep -q '\.filter(' "$AUDIT_JS" && grep -q '\.sort(' "$AUDIT_JS"; then
  pass "AC3 – filter and sort logic is wired to the controls"
else
  fail "AC3 – filter/sort logic not wired in audit-log.js"
fi

# ── AC4: Discrepancy entries are visually distinguished ───────────────────────
if grep -q 'status-discrepancy' "$STYLE_CSS"; then
  pass "AC4 – discrepancy entries have a dedicated style"
else
  fail "AC4 – no dedicated style for discrepancy entries"
fi

if grep -q 'status-badge-discrepancy' "$STYLE_CSS"; then
  pass "AC4 – discrepancy status badge is styled distinctly"
else
  fail "AC4 – discrepancy status badge is not styled distinctly"
fi

if grep -q 'status-' "$AUDIT_JS"; then
  pass "AC4 – rows are tagged with a per-status CSS class for distinction"
else
  fail "AC4 – rows are not tagged with per-status CSS classes"
fi

# ── AC5: Renders correctly on standard desktop viewport widths ────────────────
if grep -q '.audit-log' "$STYLE_CSS" && grep -qE 'max-width' "$STYLE_CSS"; then
  pass "AC5 – audit log has a desktop-friendly constrained width"
else
  fail "AC5 – audit log lacks a constrained desktop layout width"
fi

if grep -q 'audit-log-table' "$STYLE_CSS"; then
  pass "AC5 – the audit log table is styled for layout"
else
  fail "AC5 – the audit log table has no layout styling"
fi

# ── AC6: No backend service or real payment data — static/mock only ───────────
if ! grep -qiE 'fetch\(|XMLHttpRequest|axios|/api/|websocket|WebSocket' "$AUDIT_JS"; then
  pass "AC6 – audit-log.js performs no network/backend calls"
else
  fail "AC6 – audit-log.js appears to make a network/backend call"
fi

if grep -qiE 'mock|static' "$AUDIT_JS"; then
  pass "AC6 – audit-log.js documents its data as mock/static"
else
  fail "AC6 – audit-log.js does not document its data as mock/static"
fi

# index.html must still expose exactly one tagline <p> (regression guard).
P_COUNT=$(grep -c '<p>' "$INDEX_HTML" || true)
if [ "$P_COUNT" -eq 1 ]; then
  pass "AC6 – index.html still has exactly one tagline <p> (no regression)"
else
  fail "AC6 – index.html tagline <p> count changed unexpectedly ($P_COUNT)"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

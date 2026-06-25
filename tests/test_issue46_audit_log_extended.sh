#!/usr/bin/env bash
# Extended tests for Issue #46: Billing reconciliation audit log.
# Supplements test_issue46_audit_log.sh with deeper behavioural, structural,
# and visual-distinction checks for all six acceptance criteria.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INDEX_HTML="$REPO_ROOT/index.html"
STYLE_CSS="$REPO_ROOT/style.css"
AUDIT_JS="$REPO_ROOT/public/audit-log.js"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: Audit log component is visible within the application ────────────────

# The section must use aria-labelledby pointing to the heading id.
if grep -qE 'aria-labelledby="audit-log-heading"' "$INDEX_HTML"; then
  pass "AC1 – section uses aria-labelledby for accessible labelling"
else
  fail "AC1 – section missing aria-labelledby=\"audit-log-heading\""
fi

# The heading id must match the aria-labelledby value.
if grep -qE 'id="audit-log-heading"' "$INDEX_HTML"; then
  pass "AC1 – heading has id=\"audit-log-heading\" matching aria-labelledby"
else
  fail "AC1 – heading id=\"audit-log-heading\" not found"
fi

# The script tag must reference audit-log.js (not a bundled/hashed asset).
if grep -qE '<script src="audit-log\.js"' "$INDEX_HTML"; then
  pass "AC1 – index.html loads audit-log.js via a plain <script src>"
else
  fail "AC1 – index.html does not load audit-log.js via <script src>"
fi

# The tbody must have the id that the JS targets.
if grep -qE 'id="audit-log-body"' "$INDEX_HTML"; then
  pass "AC1 – tbody has id=\"audit-log-body\" (JS injection target)"
else
  fail "AC1 – tbody id=\"audit-log-body\" not found"
fi

# The empty-state paragraph must be present and initially hidden.
if grep -qE 'id="audit-log-empty"' "$INDEX_HTML" && grep -qE 'hidden' "$INDEX_HTML"; then
  pass "AC1 – empty-state paragraph is present and initially hidden"
else
  fail "AC1 – empty-state paragraph missing or not initially hidden"
fi

# ── AC2: Each entry shows timestamp, event type, amount, and status ───────────

# All four <th> column headers must be present in the table.
for col in Timestamp "Event Type" Amount Status; do
  if grep -qE "<th[^>]*>$col</th>" "$INDEX_HTML"; then
    pass "AC2 – <th> element for '$col' found in table header"
  else
    fail "AC2 – <th> element for '$col' not found in table header"
  fi
done

# The mock EVENTS array must contain at least 3 entries (enough to exercise
# filter and sort meaningfully).
EVENT_COUNT=$(grep -c 'timestamp:' "$AUDIT_JS" || true)
if [ "$EVENT_COUNT" -ge 3 ]; then
  pass "AC2 – mock data has at least 3 entries ($EVENT_COUNT found)"
else
  fail "AC2 – mock data has fewer than 3 entries ($EVENT_COUNT found)"
fi

# Every mock entry must have a non-empty eventType string.
if grep -qE 'eventType: "[^"]+"' "$AUDIT_JS"; then
  pass "AC2 – mock entries have non-empty eventType strings"
else
  fail "AC2 – mock entries are missing non-empty eventType strings"
fi

# Every mock entry must have a numeric amount (positive or negative).
if grep -qE 'amount: -?[0-9]+' "$AUDIT_JS"; then
  pass "AC2 – mock entries have numeric amount values"
else
  fail "AC2 – mock entries are missing numeric amount values"
fi

# Negative amounts must be present (refunds/chargebacks are realistic data).
if grep -qE 'amount: -[0-9]' "$AUDIT_JS"; then
  pass "AC2 – mock data includes at least one negative amount (refund/chargeback)"
else
  fail "AC2 – mock data has no negative amounts (refunds/chargebacks missing)"
fi

# The formatAmount function must handle negative values with a leading "-$".
if grep -qE 'sign.*\$.*Math\.abs|"-".*"\$"' "$AUDIT_JS"; then
  pass "AC2 – formatAmount handles negative amounts (sign + dollar prefix)"
else
  fail "AC2 – formatAmount does not appear to handle negative amounts"
fi

# The STATUS_LABELS map must define labels for all three statuses.
for st in matched discrepancy resolved; do
  if grep -qE "$st: \"[A-Z][a-z]+\"" "$AUDIT_JS"; then
    pass "AC2 – STATUS_LABELS defines a display label for '$st'"
  else
    fail "AC2 – STATUS_LABELS missing display label for '$st'"
  fi
done

# ── AC3: Entries are filterable or sortable by at least one field ─────────────

# The filter <select> must offer an "all" option to reset the filter.
if grep -qE 'value="all"' "$INDEX_HTML"; then
  pass "AC3 – filter control has an 'all' (reset) option"
else
  fail "AC3 – filter control is missing an 'all' (reset) option"
fi

# The filter <select> must offer options for each status value.
for st in matched discrepancy resolved; do
  if grep -qE "value=\"$st\"" "$INDEX_HTML"; then
    pass "AC3 – filter control has an option for status '$st'"
  else
    fail "AC3 – filter control is missing an option for status '$st'"
  fi
done

# The sort control must offer both ascending and descending options.
if grep -qE 'value="asc"' "$INDEX_HTML" && grep -qE 'value="desc"' "$INDEX_HTML"; then
  pass "AC3 – sort control has both 'asc' and 'desc' options"
else
  fail "AC3 – sort control is missing 'asc' or 'desc' option"
fi

# The render() function must read the filter value and apply it.
if grep -qE "status !== .all." "$AUDIT_JS"; then
  pass "AC3 – render() skips filtering when status is 'all'"
else
  fail "AC3 – render() does not handle the 'all' filter value"
fi

# The render() function must compare e.status to the selected filter value.
if grep -qE 'e\.status === status' "$AUDIT_JS"; then
  pass "AC3 – render() filters rows by matching e.status to selected value"
else
  fail "AC3 – render() does not filter rows by e.status"
fi

# The sort comparator must handle both asc and desc directions.
if grep -qE 'order === .asc.' "$AUDIT_JS" && grep -qE 'ta - tb' "$AUDIT_JS" && grep -qE 'tb - ta' "$AUDIT_JS"; then
  pass "AC3 – sort comparator handles both asc (ta-tb) and desc (tb-ta)"
else
  fail "AC3 – sort comparator does not handle both asc and desc directions"
fi

# The empty-state element must be shown/hidden based on row count.
if grep -qE 'rows\.length' "$AUDIT_JS" && grep -qE 'empty\.hidden' "$AUDIT_JS"; then
  pass "AC3 – empty-state visibility is toggled based on filtered row count"
else
  fail "AC3 – empty-state visibility is not toggled based on row count"
fi

# The render() function must clear the tbody before re-rendering.
if grep -qE 'body\.innerHTML\s*=\s*""' "$AUDIT_JS"; then
  pass "AC3 – render() clears tbody before injecting filtered/sorted rows"
else
  fail "AC3 – render() does not clear tbody before re-rendering"
fi

# ── AC4: Discrepancy entries are visually distinguished from matched entries ───

# The discrepancy row background must differ from the matched row background.
DISC_BG=$(grep -A2 'status-discrepancy' "$STYLE_CSS" | grep 'background' | head -1 | sed 's/.*background: *//;s/;//')
MATCH_BG=$(grep -A2 'status-matched' "$STYLE_CSS" | grep 'background' | head -1 | sed 's/.*background: *//;s/;//')

if [ -n "$DISC_BG" ] && [ -n "$MATCH_BG" ] && [ "$DISC_BG" != "$MATCH_BG" ]; then
  pass "AC4 – discrepancy row background ($DISC_BG) differs from matched ($MATCH_BG)"
else
  fail "AC4 – discrepancy and matched row backgrounds are identical or missing"
fi

# The discrepancy badge background must differ from the matched badge background.
DISC_BADGE_BG=$(grep -A2 'status-badge-discrepancy' "$STYLE_CSS" | grep 'background' | head -1 | sed 's/.*background: *//;s/;//')
MATCH_BADGE_BG=$(grep -A2 'status-badge-matched' "$STYLE_CSS" | grep 'background' | head -1 | sed 's/.*background: *//;s/;//')

if [ -n "$DISC_BADGE_BG" ] && [ -n "$MATCH_BADGE_BG" ] && [ "$DISC_BADGE_BG" != "$MATCH_BADGE_BG" ]; then
  pass "AC4 – discrepancy badge background ($DISC_BADGE_BG) differs from matched ($MATCH_BADGE_BG)"
else
  fail "AC4 – discrepancy and matched badge backgrounds are identical or missing"
fi

# Discrepancy rows must carry an aria-label for screen-reader users.
if grep -qE 'aria-label.*[Dd]iscrepancy' "$AUDIT_JS"; then
  pass "AC4 – discrepancy rows have an aria-label for accessibility"
else
  fail "AC4 – discrepancy rows are missing an aria-label"
fi

# The CSS class applied to rows must be derived from the event status
# (status-matched, status-discrepancy, status-resolved).
if grep -qE '"audit-log-row status-" \+ event\.status' "$AUDIT_JS"; then
  pass "AC4 – row className is set to 'audit-log-row status-<status>'"
else
  fail "AC4 – row className does not include 'audit-log-row status-<status>'"
fi

# The status badge class must also be derived from the event status.
if grep -qE '"status-badge status-badge-" \+ event\.status' "$AUDIT_JS"; then
  pass "AC4 – badge className is set to 'status-badge status-badge-<status>'"
else
  fail "AC4 – badge className does not include 'status-badge status-badge-<status>'"
fi

# ── AC5: Renders correctly on standard desktop viewport widths ────────────────

# The audit-log section must have a max-width that suits desktop (≥ 800px).
MAX_WIDTH_VAL=$(grep -A3 '^\.audit-log {' "$STYLE_CSS" | grep 'max-width' | sed 's/.*max-width: *//;s/px.*//;s/;//')
if [ -n "$MAX_WIDTH_VAL" ] && [ "$MAX_WIDTH_VAL" -ge 800 ] 2>/dev/null; then
  pass "AC5 – audit-log max-width is ${MAX_WIDTH_VAL}px (≥ 800px, desktop-friendly)"
else
  fail "AC5 – audit-log max-width is absent or below 800px (got: '$MAX_WIDTH_VAL')"
fi

# The section must be centred with auto horizontal margins.
if grep -A5 '^\.audit-log {' "$STYLE_CSS" | grep -qE 'margin.*auto'; then
  pass "AC5 – audit-log uses auto horizontal margins for centred layout"
else
  fail "AC5 – audit-log does not use auto horizontal margins"
fi

# The table must use width: 100% so it fills the constrained container.
if grep -A3 '^\.audit-log-table {' "$STYLE_CSS" | grep -qE 'width:\s*100%'; then
  pass "AC5 – audit-log-table uses width: 100% to fill its container"
else
  fail "AC5 – audit-log-table does not use width: 100%"
fi

# The controls area must use flexbox for responsive wrapping.
if grep -A5 '^\.audit-log-controls {' "$STYLE_CSS" | grep -qE 'display:\s*flex'; then
  pass "AC5 – audit-log-controls uses flexbox layout"
else
  fail "AC5 – audit-log-controls does not use flexbox layout"
fi

# The controls must have flex-wrap: wrap so they reflow on narrower viewports.
if grep -A5 '^\.audit-log-controls {' "$STYLE_CSS" | grep -qE 'flex-wrap:\s*wrap'; then
  pass "AC5 – audit-log-controls has flex-wrap: wrap for responsive reflow"
else
  fail "AC5 – audit-log-controls is missing flex-wrap: wrap"
fi

# The table must use border-collapse: collapse for clean desktop rendering.
if grep -A3 '^\.audit-log-table {' "$STYLE_CSS" | grep -qE 'border-collapse:\s*collapse'; then
  pass "AC5 – audit-log-table uses border-collapse: collapse"
else
  fail "AC5 – audit-log-table is missing border-collapse: collapse"
fi

# ── AC6: No backend service or real payment data — static/mock only ───────────

# The EVENTS array must be defined inline (no import/require/fetch).
if grep -qE '^  var EVENTS = \[' "$AUDIT_JS"; then
  pass "AC6 – EVENTS array is defined inline (no external data source)"
else
  fail "AC6 – EVENTS array is not defined inline"
fi

# The script must not use import() (dynamic import could load external data).
if ! grep -qE '\bimport\s*\(' "$AUDIT_JS"; then
  pass "AC6 – audit-log.js does not use dynamic import()"
else
  fail "AC6 – audit-log.js uses dynamic import() which could load external data"
fi

# The script must not use require() (Node.js / CommonJS module loading).
if ! grep -qE '\brequire\s*\(' "$AUDIT_JS"; then
  pass "AC6 – audit-log.js does not use require()"
else
  fail "AC6 – audit-log.js uses require() which implies a backend/bundler"
fi

# The script must not reference any URL patterns that suggest a real API.
if ! grep -qiE 'https?://|localhost:[0-9]|/v[0-9]+/' "$AUDIT_JS"; then
  pass "AC6 – audit-log.js contains no real API URLs"
else
  fail "AC6 – audit-log.js contains what looks like a real API URL"
fi

# The public/audit-log.js file must be committed (not generated at build time).
if git -C "$REPO_ROOT" ls-files --error-unmatch public/audit-log.js > /dev/null 2>&1; then
  pass "AC6 – public/audit-log.js is committed to the repository (not generated)"
else
  fail "AC6 – public/audit-log.js is not tracked by git"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

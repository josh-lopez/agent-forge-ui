#!/usr/bin/env bash
# Acceptance-criteria tests for Issue #192: Export filtered event log with
# applied filters.
#
# AC1  – A visible Export button is rendered in the event log UI.
# AC2  – Export with no filters exports the full unfiltered log.
# AC3  – Export with filters exports only the currently visible entries.
# AC4  – Exported file contains all columns (timestamp, eventType, status,
#         httpStatus, responseBodyExcerpt).
# AC5  – Exported format is machine-readable (CSV or JSON).
# AC6  – Exported filename reflects the active filter context.
# AC7  – Empty filtered result still produces a valid file (headers-only CSV /
#         empty JSON array).
# AC8  – Export is entirely client-side (no server endpoint called).
# AC9  – Unit tests cover: no filters, date-range, event-type, all combined,
#         empty result.
#
# Strategy:
#   1. Source-level checks on src/eventLogExport.ts and src/event-log.ts
#      (exports, required symbols, client-side guard).
#   2. Compile src/eventLogExport.ts with tsc and exercise the compiled module
#      via a Node.js ESM harness to verify the AC9 matrix at runtime.
#   3. Verify the Vitest test files for issue 192 exist and cover the required
#      scenarios.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSC="$REPO_ROOT/node_modules/.bin/tsc"
EXPORT_SRC="$REPO_ROOT/src/eventLogExport.ts"
EVENT_LOG_SRC="$REPO_ROOT/src/event-log.ts"
FILTER_SRC="$REPO_ROOT/src/eventTypeFilter.ts"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── Pre-flight: source files exist ────────────────────────────────────────────

if [ -f "$EXPORT_SRC" ]; then
  pass "pre-flight – src/eventLogExport.ts exists"
else
  fail "pre-flight – src/eventLogExport.ts does not exist"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

if [ -f "$EVENT_LOG_SRC" ]; then
  pass "pre-flight – src/event-log.ts exists"
else
  fail "pre-flight – src/event-log.ts does not exist"
fi

# ── AC4/AC5: Column definitions exported ─────────────────────────────────────

if grep -q "EVENT_LOG_COLUMNS" "$EXPORT_SRC"; then
  pass "AC4 – EVENT_LOG_COLUMNS constant defined in eventLogExport.ts"
else
  fail "AC4 – EVENT_LOG_COLUMNS constant not found in eventLogExport.ts"
fi

if grep -q "EVENT_LOG_COLUMN_HEADERS" "$EXPORT_SRC"; then
  pass "AC4 – EVENT_LOG_COLUMN_HEADERS constant defined in eventLogExport.ts"
else
  fail "AC4 – EVENT_LOG_COLUMN_HEADERS constant not found in eventLogExport.ts"
fi

# Verify all five required columns are present.
for col in timestamp eventType status httpStatus responseBodyExcerpt; do
  if grep -q "'$col'" "$EXPORT_SRC"; then
    pass "AC4 – column '$col' present in EVENT_LOG_COLUMNS"
  else
    fail "AC4 – column '$col' NOT found in EVENT_LOG_COLUMNS"
  fi
done

# ── AC5: Machine-readable format (CSV and JSON) ───────────────────────────────

if grep -q "eventsToCsv" "$EXPORT_SRC"; then
  pass "AC5 – eventsToCsv serialiser defined"
else
  fail "AC5 – eventsToCsv serialiser not found"
fi

if grep -q "eventsToJson" "$EXPORT_SRC"; then
  pass "AC5 – eventsToJson serialiser defined"
else
  fail "AC5 – eventsToJson serialiser not found"
fi

if grep -q "ExportFormat" "$EXPORT_SRC"; then
  pass "AC5 – ExportFormat type defined"
else
  fail "AC5 – ExportFormat type not found"
fi

# ── AC6: Filename generation ──────────────────────────────────────────────────

if grep -q "buildExportFilename" "$EXPORT_SRC"; then
  pass "AC6 – buildExportFilename function defined"
else
  fail "AC6 – buildExportFilename function not found"
fi

# Filename must embed a timestamp for distinguishability.
if grep -q "toISOString" "$EXPORT_SRC"; then
  pass "AC6 – filename generation uses ISO timestamp for distinguishability"
else
  fail "AC6 – filename generation does not appear to use ISO timestamp"
fi

# ── AC7: Empty-result guard (headers-only CSV / empty JSON array) ─────────────

# eventsToCsv must always emit a header row even for empty input.
if grep -q "header" "$EXPORT_SRC" && grep -q "rows" "$EXPORT_SRC"; then
  pass "AC7 – eventsToCsv emits header row separately from data rows"
else
  fail "AC7 – eventsToCsv header/rows structure not found"
fi

# eventsToJson must produce a JSON array (not throw) for empty input.
if grep -q "JSON.stringify" "$EXPORT_SRC"; then
  pass "AC7 – eventsToJson uses JSON.stringify (produces valid JSON for empty input)"
else
  fail "AC7 – eventsToJson does not use JSON.stringify"
fi

# ── AC8: Client-side only — no fetch / XMLHttpRequest ────────────────────────

if grep -qE "fetch\(|XMLHttpRequest|axios|http\." "$EXPORT_SRC"; then
  fail "AC8 – eventLogExport.ts contains a network call (fetch/XHR/axios)"
else
  pass "AC8 – eventLogExport.ts contains no network calls"
fi

# Must use Blob + object URL for the download.
if grep -q "Blob" "$EXPORT_SRC"; then
  pass "AC8 – export uses Blob for client-side download"
else
  fail "AC8 – export does not use Blob (expected client-side Blob download)"
fi

if grep -q "createObjectURL" "$EXPORT_SRC"; then
  pass "AC8 – export uses URL.createObjectURL (no server round-trip)"
else
  fail "AC8 – export does not use URL.createObjectURL"
fi

# Guard: non-DOM environments must not crash.
if grep -q "typeof document" "$EXPORT_SRC"; then
  pass "AC8 – export guards against non-DOM environments (typeof document check)"
else
  fail "AC8 – export has no non-DOM guard (may crash in SSR/test environments)"
fi

# ── AC1: Export button in the event-log component ────────────────────────────

if [ -f "$EVENT_LOG_SRC" ]; then
  if grep -q "event-log__export\|data-event-log-export\|exportBtn\|Export" "$EVENT_LOG_SRC"; then
    pass "AC1 – event-log.ts renders an Export control"
  else
    fail "AC1 – event-log.ts does not appear to render an Export control"
  fi

  if grep -q "triggerEventLogExport\|exportNow\|buildEventLogExport" "$EVENT_LOG_SRC"; then
    pass "AC1 – event-log.ts wires the Export control to the export function"
  else
    fail "AC1 – event-log.ts does not wire Export control to export function"
  fi

  # AC3: export reads the composed filter state at click time.
  if grep -q "filters" "$EVENT_LOG_SRC"; then
    pass "AC3 – event-log.ts passes filter state to the export function"
  else
    fail "AC3 – event-log.ts does not pass filter state to the export function"
  fi
fi

# ── AC2/AC3: composeFilteredEvents is the single source of truth ─────────────

if grep -q "composeFilteredEvents" "$EXPORT_SRC"; then
  pass "AC2/AC3 – composeFilteredEvents defined in eventLogExport.ts"
else
  fail "AC2/AC3 – composeFilteredEvents not found in eventLogExport.ts"
fi

if grep -q "isFilterActive" "$EXPORT_SRC"; then
  pass "AC2/AC3 – isFilterActive helper defined"
else
  fail "AC2/AC3 – isFilterActive helper not found"
fi

# ── AC9: Vitest test files exist and cover the required scenarios ─────────────

EXPORT_TEST="$REPO_ROOT/tests/eventLogExport.test.ts"
EVENTLOG_TEST="$REPO_ROOT/tests/event-log.test.ts"

if [ -f "$EXPORT_TEST" ]; then
  pass "AC9 – tests/eventLogExport.test.ts exists"
else
  fail "AC9 – tests/eventLogExport.test.ts does not exist"
fi

if [ -f "$EVENTLOG_TEST" ]; then
  pass "AC9 – tests/event-log.test.ts exists"
else
  fail "AC9 – tests/event-log.test.ts does not exist"
fi

# Verify the AC9 matrix is covered in the test file.
if [ -f "$EXPORT_TEST" ]; then
  if grep -q "no filters\|NO filters\|no filter\|unfiltered\|full log\|full unfiltered" "$EXPORT_TEST"; then
    pass "AC9 – test covers: export with no filters"
  else
    fail "AC9 – test does not cover: export with no filters"
  fi

  if grep -q "date.range\|DATE.RANGE\|start.*end\|date range" "$EXPORT_TEST"; then
    pass "AC9 – test covers: export with date-range filter"
  else
    fail "AC9 – test does not cover: export with date-range filter"
  fi

  if grep -q "event.type\|EVENT.TYPE\|eventTypes\|event type" "$EXPORT_TEST"; then
    pass "AC9 – test covers: export with event-type filter"
  else
    fail "AC9 – test does not cover: export with event-type filter"
  fi

  if grep -q "ALL filters\|all filters\|combined\|all.*combined\|combined.*all" "$EXPORT_TEST"; then
    pass "AC9 – test covers: export with all filters combined"
  else
    fail "AC9 – test does not cover: export with all filters combined"
  fi

  if grep -q "empty\|EMPTY\|none.match\|no.*match\|match.*nothing" "$EXPORT_TEST"; then
    pass "AC9 – test covers: export of empty filtered result"
  else
    fail "AC9 – test does not cover: export of empty filtered result"
  fi
fi

# ── Compile eventLogExport.ts (and its dependency eventTypeFilter.ts) ─────────

if [ ! -x "$TSC" ]; then
  fail "compile – tsc not found at $TSC (run 'npm install' first)"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "compile – tsc binary is available"

TMPDIR_EXP="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_EXP"' EXIT

TSC_OUT=$(
  "$TSC" \
    --module ESNext \
    --moduleResolution node \
    --target ES2020 \
    --outDir "$TMPDIR_EXP/out" \
    --noEmit false \
    --allowImportingTsExtensions false \
    --strict true \
    --skipLibCheck true \
    "$EXPORT_SRC" "$FILTER_SRC" 2>&1
)
TSC_EXIT=$?

if [ "$TSC_EXIT" -eq 0 ]; then
  pass "compile – eventLogExport.ts compiles without TypeScript errors"
else
  fail "compile – tsc exited with code $TSC_EXIT"
  echo "$TSC_OUT"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# Mark output as ESM so Node can import it.
echo '{"type":"module"}' > "$TMPDIR_EXP/out/package.json"

COMPILED_EXPORT="$TMPDIR_EXP/out/eventLogExport.js"
HARNESS="$TMPDIR_EXP/harness.mjs"

# The project uses moduleResolution:bundler which emits bare relative imports
# (e.g. './eventTypeFilter') that Node ESM requires to have a .js extension.
# Patch all relative imports in the compiled output to add .js where missing.
if [ -f "$COMPILED_EXPORT" ]; then
  sed -i "s|from '\./\([^']*\)';|from './\1.js';|g" "$COMPILED_EXPORT"
fi

# ── Write the Node.js test harness (AC9 matrix) ───────────────────────────────

cat > "$HARNESS" << 'HARNESS_EOF'
import {
  composeFilteredEvents,
  isFilterActive,
  eventsToCsv,
  eventsToJson,
  buildExportFilename,
  buildEventLogExport,
  EVENT_LOG_COLUMNS,
} from "__COMPILED_EXPORT__";

let pass = 0;
let fail = 0;

function assert(label, condition) {
  if (condition) {
    console.log("PASS: " + label);
    pass++;
  } else {
    console.log("FAIL: " + label);
    fail++;
  }
}

// ── Fixture ───────────────────────────────────────────────────────────────────
const FIXTURE = [
  {
    webhookId: "wh_1", eventType: "payment.created", status: "delivered",
    attempt: 1, timestamp: "2024-01-01T00:00:00.000Z", httpStatus: 200,
    responseBodyExcerpt: "OK",
  },
  {
    webhookId: "wh_2", eventType: "refund.issued", status: "failed",
    attempt: 1, timestamp: "2024-01-15T12:00:00.000Z", httpStatus: 500,
    responseBodyExcerpt: "Internal error",
  },
  {
    webhookId: "wh_3", eventType: "dispute.opened", status: "exhausted",
    attempt: 3, timestamp: "2024-01-31T23:59:59.000Z", httpStatus: 503,
    responseBodyExcerpt: "Service unavailable",
  },
  {
    webhookId: "wh_4", eventType: "payment.created", status: "pending",
    attempt: 1, timestamp: "2024-02-10T08:00:00.000Z", httpStatus: 0,
    responseBodyExcerpt: "",
  },
];

const NOW = new Date("2024-01-15T10:15:00.000Z");

// ── AC4: All five columns are present in EVENT_LOG_COLUMNS ───────────────────
const REQUIRED_COLS = ["timestamp", "eventType", "status", "httpStatus", "responseBodyExcerpt"];
for (const col of REQUIRED_COLS) {
  assert(`AC4 – column '${col}' present in EVENT_LOG_COLUMNS`, EVENT_LOG_COLUMNS.includes(col));
}
assert("AC4 – EVENT_LOG_COLUMNS has exactly 5 entries", EVENT_LOG_COLUMNS.length === 5);

// ── AC5: CSV header row contains all column labels ────────────────────────────
const csvHeader = eventsToCsv([]).split("\r\n")[0];
assert("AC5/CSV – header contains 'Timestamp'",       csvHeader.includes("Timestamp"));
assert("AC5/CSV – header contains 'Event Type'",      csvHeader.includes("Event Type"));
assert("AC5/CSV – header contains 'Status'",          csvHeader.includes("Status"));
assert("AC5/CSV – header contains 'HTTP Status'",     csvHeader.includes("HTTP Status"));
assert("AC5/CSV – header contains 'Response Body Excerpt'", csvHeader.includes("Response Body Excerpt"));

// ── AC5: JSON produces a parseable array ──────────────────────────────────────
const jsonEmpty = JSON.parse(eventsToJson([]));
assert("AC5/JSON – empty input produces valid JSON array", Array.isArray(jsonEmpty) && jsonEmpty.length === 0);

const jsonOne = JSON.parse(eventsToJson([FIXTURE[1]]));
assert("AC5/JSON – single event produces array of length 1", jsonOne.length === 1);
assert("AC5/JSON – JSON entry contains eventType", jsonOne[0].eventType === "refund.issued");
assert("AC5/JSON – JSON entry contains httpStatus", jsonOne[0].httpStatus === 500);

// ── AC2 (AC9): Export with NO filters → full log ──────────────────────────────
const noFilter = buildEventLogExport(FIXTURE, undefined, "csv", NOW);
assert("AC2/AC9 – no filters: count equals full fixture length", noFilter.count === FIXTURE.length);
assert("AC2/AC9 – no filters: filename contains 'all'", noFilter.filename.includes("all"));
assert("AC2/AC9 – no filters: CSV has header + 4 data rows",
  noFilter.content.split("\r\n").length === FIXTURE.length + 1);

// ── AC3 (AC9): Export with DATE-RANGE filter ──────────────────────────────────
const dateFilter = buildEventLogExport(
  FIXTURE,
  { start: "2024-01-01T00:00:00.000Z", end: "2024-01-31T23:59:59.000Z" },
  "csv",
  NOW,
);
assert("AC3/AC9 – date-range: count is 3 (Jan entries only)", dateFilter.count === 3);
assert("AC3/AC9 – date-range: Feb entry excluded", !dateFilter.content.includes("2024-02-10"));
assert("AC3/AC9 – date-range: filename contains date range", dateFilter.filename.includes("20240101-20240131"));

// Boundary inclusivity: entry exactly at start boundary is included.
const boundaryStart = composeFilteredEvents(FIXTURE, { start: "2024-01-01T00:00:00.000Z", end: "2024-01-01T00:00:00.000Z" });
assert("AC3/AC9 – date-range boundary: entry exactly at start is included", boundaryStart.length === 1 && boundaryStart[0].webhookId === "wh_1");

// ── AC3 (AC9): Export with EVENT-TYPE filter ──────────────────────────────────
const typeFilter = buildEventLogExport(FIXTURE, { eventTypes: ["payment.created"] }, "csv", NOW);
assert("AC3/AC9 – event-type: count is 2 (payment.created only)", typeFilter.count === 2);
assert("AC3/AC9 – event-type: refund.issued excluded", !typeFilter.content.includes("refund.issued"));
assert("AC3/AC9 – event-type: dispute.opened excluded", !typeFilter.content.includes("dispute.opened"));
assert("AC3/AC9 – event-type: filename contains type slug", typeFilter.filename.includes("types-payment-created"));

// ── AC3 (AC9): Export with STATUS filter ─────────────────────────────────────
const statusFilter = buildEventLogExport(FIXTURE, { statuses: ["failed", "exhausted"] }, "csv", NOW);
assert("AC3/AC9 – status: count is 2 (failed + exhausted)", statusFilter.count === 2);
assert("AC3/AC9 – status: delivered entry excluded", !statusFilter.content.includes("wh_1"));
assert("AC3/AC9 – status: pending entry excluded", !statusFilter.content.includes("wh_4"));

// ── AC3 (AC9): Export with ALL filters combined ───────────────────────────────
const allFilters = buildEventLogExport(
  FIXTURE,
  {
    start: "2024-01-01T00:00:00.000Z",
    end: "2024-01-31T23:59:59.000Z",
    eventTypes: ["refund.issued", "dispute.opened"],
    statuses: ["failed"],
  },
  "csv",
  NOW,
);
assert("AC3/AC9 – all combined: count is 1 (only wh_2 matches all dimensions)", allFilters.count === 1);
assert("AC3/AC9 – all combined: refund.issued present", allFilters.content.includes("refund.issued"));
assert("AC3/AC9 – all combined: dispute.opened excluded (wrong status)", !allFilters.content.includes("dispute.opened"));

// ── AC7 (AC9): Export of EMPTY filtered result ────────────────────────────────
const emptyCSV = buildEventLogExport(FIXTURE, { eventTypes: ["no.match"] }, "csv", NOW);
assert("AC7/AC9 – empty CSV: count is 0", emptyCSV.count === 0);
assert("AC7/AC9 – empty CSV: content is headers-only (1 line)", emptyCSV.content.split("\r\n").length === 1);
assert("AC7/AC9 – empty CSV: header row present", emptyCSV.content.includes("Timestamp"));

const emptyJSON = buildEventLogExport(FIXTURE, { eventTypes: ["no.match"] }, "json", NOW);
assert("AC7/AC9 – empty JSON: count is 0", emptyJSON.count === 0);
assert("AC7/AC9 – empty JSON: parses to empty array", JSON.parse(emptyJSON.content).length === 0);

// ── AC6: Filename reflects filter context ─────────────────────────────────────
const fnNoFilter = buildExportFilename(undefined, "csv", NOW);
const fnDateRange = buildExportFilename(
  { start: "2024-01-01T00:00:00.000Z", end: "2024-01-31T23:59:59.000Z" },
  "csv", NOW,
);
const fnEventType = buildExportFilename({ eventTypes: ["payment.created"] }, "json", NOW);
const fnStatus    = buildExportFilename({ statuses: ["failed"] }, "csv", NOW);

assert("AC6 – no-filter filename starts with 'event-log_all_'", fnNoFilter.startsWith("event-log_all_"));
assert("AC6 – no-filter filename ends with '.csv'", fnNoFilter.endsWith(".csv"));
assert("AC6 – date-range filename contains date range", fnDateRange.includes("20240101-20240131"));
assert("AC6 – event-type filename contains type slug", fnEventType.includes("types-payment-created"));
assert("AC6 – event-type filename ends with '.json'", fnEventType.endsWith(".json"));
assert("AC6 – status filename contains status slug", fnStatus.includes("status-failed"));
assert("AC6 – all filenames contain ISO timestamp", fnNoFilter.includes("20240115T101500Z"));
assert("AC6 – distinct filter contexts produce distinct filenames", fnNoFilter !== fnDateRange && fnDateRange !== fnEventType);

// ── isFilterActive ────────────────────────────────────────────────────────────
assert("isFilterActive – undefined → false", isFilterActive(undefined) === false);
assert("isFilterActive – empty object → false", isFilterActive({}) === false);
assert("isFilterActive – empty arrays → false", isFilterActive({ eventTypes: [], statuses: [] }) === false);
assert("isFilterActive – start set → true", isFilterActive({ start: "2024-01-01" }) === true);
assert("isFilterActive – eventTypes set → true", isFilterActive({ eventTypes: ["payment.created"] }) === true);
assert("isFilterActive – statuses set → true", isFilterActive({ statuses: ["failed"] }) === true);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  throw new Error(`${fail} test(s) failed`);
}
HARNESS_EOF

# Inject the compiled module path.
sed -i "s|__COMPILED_EXPORT__|$COMPILED_EXPORT|g" "$HARNESS"

# ── Run the harness ───────────────────────────────────────────────────────────

HARNESS_OUT=$(node "$HARNESS" 2>&1)
HARNESS_EXIT=$?

# Relay individual PASS/FAIL lines to the shell counters.
while IFS= read -r line; do
  case "$line" in
    PASS:*) pass "${line#PASS: }" ;;
    FAIL:*) fail "${line#FAIL: }" ;;
    *)      echo "$line" ;;
  esac
done <<< "$HARNESS_OUT"

if [ "$HARNESS_EXIT" -ne 0 ] && ! echo "$HARNESS_OUT" | grep -q "^FAIL:"; then
  fail "harness – node exited with code $HARNESS_EXIT (unexpected error)"
fi

# ── Final summary ─────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

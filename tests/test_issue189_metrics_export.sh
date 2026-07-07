#!/usr/bin/env bash
# Acceptance-criteria tests for Issue #189: Metrics export to CSV or JSON.
#
# Verifies:
#   AC1  – a visible Export control is present in the metrics export module
#   AC2  – the control offers both CSV and JSON format choices
#   AC3  – exported content contains all aggregate metrics
#   AC5  – filename builder produces correct extension and prefix
#   AC6  – JSON export is valid, well-formed JSON
#   AC7  – CSV export has a header row and is parseable
#   AC9  – no backend call (no fetch/XMLHttpRequest in the export path)
#
# Strategy: compile src/metricsExport.ts with tsc and exercise the compiled
# module via a Node.js ESM harness.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSC="$REPO_ROOT/node_modules/.bin/tsc"
EXPORT_SRC="$REPO_ROOT/src/metricsExport.ts"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── Pre-flight checks ─────────────────────────────────────────────────────────

if [ ! -f "$EXPORT_SRC" ]; then
  fail "pre-flight – src/metricsExport.ts does not exist"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – src/metricsExport.ts exists"

# AC1: Export control factory is exported
if grep -q "export function createExportControl" "$EXPORT_SRC"; then
  pass "AC1 – createExportControl is exported from metricsExport.ts"
else
  fail "AC1 – createExportControl export not found in metricsExport.ts"
fi

# AC2: Both CSV and JSON format choices are present
if grep -q "'csv'" "$EXPORT_SRC" && grep -q "'json'" "$EXPORT_SRC"; then
  pass "AC2 – both 'csv' and 'json' format literals present in source"
else
  fail "AC2 – csv/json format literals not found in source"
fi

# AC5: Filename builder is exported
if grep -q "export function buildExportFilename" "$EXPORT_SRC"; then
  pass "AC5 – buildExportFilename is exported"
else
  fail "AC5 – buildExportFilename export not found"
fi

# AC6: JSON serialiser is exported
if grep -q "export function metricsToJson" "$EXPORT_SRC"; then
  pass "AC6 – metricsToJson is exported"
else
  fail "AC6 – metricsToJson export not found"
fi

# AC7: CSV serialiser is exported
if grep -q "export function metricsToCsv" "$EXPORT_SRC"; then
  pass "AC7 – metricsToCsv is exported"
else
  fail "AC7 – metricsToCsv export not found"
fi

# AC9: No fetch or XMLHttpRequest calls in the export module
if grep -qE "\bfetch\b|\bXMLHttpRequest\b" "$EXPORT_SRC"; then
  fail "AC9 – fetch or XMLHttpRequest found in metricsExport.ts (must be client-side only)"
else
  pass "AC9 – no fetch/XMLHttpRequest in metricsExport.ts (client-side only)"
fi

# CSV header row check in source
if grep -q "eventType,successRate,avgRetryCount" "$EXPORT_SRC" || \
   grep -q "CSV_HEADERS" "$EXPORT_SRC"; then
  pass "AC7 – CSV header row definition present in source"
else
  fail "AC7 – CSV header row definition not found in source"
fi

if [ ! -x "$TSC" ]; then
  fail "pre-flight – tsc not found at $TSC (run 'npm install' first)"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – tsc binary is available"

# ── Compile to a temp directory ───────────────────────────────────────────────

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
    --lib "ES2020,DOM" \
    "$EXPORT_SRC" 2>&1
)
TSC_EXIT=$?

if [ "$TSC_EXIT" -eq 0 ]; then
  pass "compile – metricsExport.ts compiles without TypeScript errors"
else
  fail "compile – tsc exited with code $TSC_EXIT"
  echo "$TSC_OUT"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

echo '{"type":"module"}' > "$TMPDIR_EXP/out/package.json"

COMPILED="$TMPDIR_EXP/out/metricsExport.js"
HARNESS="$TMPDIR_EXP/harness.mjs"

# ── Write the Node.js test harness ───────────────────────────────────────────

cat > "$HARNESS" << 'EOF'
// Node.js ESM harness for metricsExport acceptance tests.
// Runs without a DOM — we only test the pure serialisation functions here.
// createExportControl and downloadMetrics require a DOM and are covered by
// the Vitest suite (tests/metrics-export.test.ts).

import { metricsToJson, metricsToCsv, buildExportFilename } from "__COMPILED__";

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
const snapshot = {
  exportedAt: "2024-06-15T10:30:00.000Z",
  overall: {
    successRate: 0.85,
    avgRetryCount: 1.25,
    ttd: { medianMs: 1200, p95Ms: 8500 },
  },
  byEventType: [
    {
      eventType: "payment.created",
      successRate: 0.9,
      avgRetryCount: 1.0,
      ttd: { medianMs: 1000, p95Ms: 7000 },
    },
    {
      eventType: "refund.issued",
      successRate: 0.75,
      avgRetryCount: 1.6,
      ttd: { medianMs: 1500, p95Ms: 10000 },
    },
  ],
};

// ── AC6: JSON export is valid, well-formed JSON ───────────────────────────────
const json = metricsToJson(snapshot);
let parsed;
try {
  parsed = JSON.parse(json);
  assert("AC6 – metricsToJson returns valid JSON", true);
} catch (e) {
  assert("AC6 – metricsToJson returns valid JSON", false);
  parsed = null;
}

if (parsed) {
  assert("AC6 – JSON contains exportedAt", parsed.exportedAt === "2024-06-15T10:30:00.000Z");
  assert("AC6 – JSON contains overall.successRate", parsed.overall.successRate === 0.85);
  assert("AC6 – JSON contains overall.avgRetryCount", parsed.overall.avgRetryCount === 1.25);
  assert("AC6 – JSON contains overall.ttd.medianMs", parsed.overall.ttd.medianMs === 1200);
  assert("AC6 – JSON contains overall.ttd.p95Ms", parsed.overall.ttd.p95Ms === 8500);
  assert("AC6 – JSON contains byEventType array", Array.isArray(parsed.byEventType));
  assert("AC6 – JSON byEventType has 2 entries", parsed.byEventType.length === 2);

  // AC3: all aggregate metrics present
  const pc = parsed.byEventType.find(r => r.eventType === "payment.created");
  assert("AC3 – JSON: payment.created successRate present", pc && pc.successRate === 0.9);
  assert("AC3 – JSON: payment.created avgRetryCount present", pc && pc.avgRetryCount === 1.0);
  assert("AC3 – JSON: payment.created ttd.medianMs present", pc && pc.ttd.medianMs === 1000);
  assert("AC3 – JSON: payment.created ttd.p95Ms present", pc && pc.ttd.p95Ms === 7000);
}

// ── AC7: CSV export has a header row and is parseable ─────────────────────────
const csv = metricsToCsv(snapshot);
const lines = csv.split("\r\n");

assert("AC7 – CSV uses CRLF line endings", csv.includes("\r\n"));
assert("AC7 – CSV has at least 3 rows (header + overall + 1 event type)", lines.length >= 3);
assert("AC7 – CSV header row is correct",
  lines[0] === "eventType,successRate,avgRetryCount,medianTtdMs,p95TtdMs");

// Overall row
const overallFields = lines[1].split(",");
assert("AC7 – CSV overall row eventType is 'overall'", overallFields[0] === "overall");
assert("AC7 – CSV overall row successRate is numeric", !isNaN(parseFloat(overallFields[1])));
assert("AC7 – CSV overall row avgRetryCount is numeric", !isNaN(parseFloat(overallFields[2])));
assert("AC7 – CSV overall row medianTtdMs is numeric", !isNaN(parseFloat(overallFields[3])));
assert("AC7 – CSV overall row p95TtdMs is numeric", !isNaN(parseFloat(overallFields[4])));

// AC3: per-event-type rows
const pcRow = lines.find(l => l.startsWith("payment.created,"));
assert("AC3 – CSV: payment.created row present", !!pcRow);
if (pcRow) {
  const f = pcRow.split(",");
  assert("AC3 – CSV: payment.created successRate correct", Math.abs(parseFloat(f[1]) - 0.9) < 0.0001);
  assert("AC3 – CSV: payment.created avgRetryCount correct", Math.abs(parseFloat(f[2]) - 1.0) < 0.0001);
  assert("AC3 – CSV: payment.created medianTtdMs correct", Math.abs(parseFloat(f[3]) - 1000) < 0.01);
  assert("AC3 – CSV: payment.created p95TtdMs correct", Math.abs(parseFloat(f[4]) - 7000) < 0.01);
}

// ── AC5: Filename builder ─────────────────────────────────────────────────────
const csvName = buildExportFilename("csv", "2024-06-15T10:30:00.000Z");
assert("AC5 – CSV filename starts with 'webhook-metrics-'", csvName.startsWith("webhook-metrics-"));
assert("AC5 – CSV filename ends with '.csv'", csvName.endsWith(".csv"));
assert("AC5 – CSV filename contains no colons", !csvName.includes(":"));

const jsonName = buildExportFilename("json", "2024-06-15T10:30:00.000Z");
assert("AC5 – JSON filename starts with 'webhook-metrics-'", jsonName.startsWith("webhook-metrics-"));
assert("AC5 – JSON filename ends with '.json'", jsonName.endsWith(".json"));

// ── Edge cases ────────────────────────────────────────────────────────────────
// Zero deliveries
const emptySnapshot = {
  exportedAt: "2024-06-15T10:30:00.000Z",
  overall: { successRate: 0, avgRetryCount: 0, ttd: { medianMs: 0, p95Ms: 0 } },
  byEventType: [],
};
const emptyJson = metricsToJson(emptySnapshot);
const emptyParsed = JSON.parse(emptyJson);
assert("edge – zero deliveries: JSON valid", emptyParsed.byEventType.length === 0);

const emptyCsv = metricsToCsv(emptySnapshot);
const emptyLines = emptyCsv.split("\r\n");
assert("edge – zero deliveries: CSV has header + overall only (2 rows)", emptyLines.length === 2);

// 100% failure
const failSnapshot = {
  exportedAt: "2024-06-15T10:30:00.000Z",
  overall: { successRate: 0, avgRetryCount: 5, ttd: { medianMs: 0, p95Ms: 0 } },
  byEventType: [
    { eventType: "payment.created", successRate: 0, avgRetryCount: 5, ttd: { medianMs: 0, p95Ms: 0 } },
  ],
};
const failCsv = metricsToCsv(failSnapshot);
const failLines = failCsv.split("\r\n");
const failOverall = failLines[1].split(",");
assert("edge – 100% failure: overall successRate is 0", parseFloat(failOverall[1]) === 0);

// Single attempt
const singleSnapshot = {
  exportedAt: "2024-06-15T10:30:00.000Z",
  overall: { successRate: 1, avgRetryCount: 0, ttd: { medianMs: 500, p95Ms: 500 } },
  byEventType: [
    { eventType: "payment.created", successRate: 1, avgRetryCount: 0, ttd: { medianMs: 500, p95Ms: 500 } },
  ],
};
const singleJson = metricsToJson(singleSnapshot);
const singleParsed = JSON.parse(singleJson);
assert("edge – single attempt: avgRetryCount is 0", singleParsed.overall.avgRetryCount === 0);

// AC8: Simulator-style data
const simSnapshot = {
  exportedAt: "2024-06-15T12:00:00.000Z",
  overall: { successRate: 0.6, avgRetryCount: 2.3, ttd: { medianMs: 3600000, p95Ms: 28800000 } },
  byEventType: [
    { eventType: "payment.created", successRate: 0.7, avgRetryCount: 1.8, ttd: { medianMs: 60000, p95Ms: 7200000 } },
    { eventType: "refund.issued", successRate: 0.5, avgRetryCount: 3.0, ttd: { medianMs: 1800000, p95Ms: 28800000 } },
  ],
};
const simJson = metricsToJson(simSnapshot);
const simParsed = JSON.parse(simJson);
assert("AC8 – simulator data: JSON valid with 2 event types", simParsed.byEventType.length === 2);
const simCsv = metricsToCsv(simSnapshot);
const simLines = simCsv.split("\r\n");
assert("AC8 – simulator data: CSV has 4 rows (header + overall + 2 types)", simLines.length === 4);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  throw new Error(`${fail} test(s) failed`);
}
EOF

sed -i "s|__COMPILED__|$COMPILED|g" "$HARNESS"

# ── Run the harness ───────────────────────────────────────────────────────────

HARNESS_OUT=$(node "$HARNESS" 2>&1)
HARNESS_EXIT=$?

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

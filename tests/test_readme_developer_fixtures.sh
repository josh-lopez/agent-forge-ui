#!/usr/bin/env bash
# Tests for Issue #80 (AC5, AC6): README documents the webhook delivery
# simulator under a "Developer fixtures" section, including how to enable the
# env flag and configure successRate / maxAttempts.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
README="$REPO_ROOT/README.md"

PASS=0
FAIL=0
pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

if [ -f "$README" ]; then
  pass "README.md exists"
else
  fail "README.md does not exist"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# AC5: a "Developer fixtures" section heading exists.
if grep -qiE '^#{2,3}[[:space:]]+Developer fixtures' "$README"; then
  pass "AC5 – README has a 'Developer fixtures' section heading"
else
  fail "AC5 – README is missing a 'Developer fixtures' section heading"
fi

# Extract just the Developer fixtures section so later assertions are scoped.
SECTION="$(awk '
  /^#{2,3}[[:space:]]+Developer fixtures/ { capture=1; print; next }
  capture && /^## / { exit }
  capture { print }
' "$README")"

check_section() {
  local desc="$1" pattern="$2"
  if echo "$SECTION" | grep -qiE "$pattern"; then
    pass "$desc"
  else
    fail "$desc"
  fi
}

# AC5: documents the environment flag.
check_section "AC5 – documents the VITE_USE_WEBHOOK_SIMULATOR env flag" \
  'VITE_USE_WEBHOOK_SIMULATOR'

# AC5: shows how to set it (=true).
check_section "AC5 – shows enabling the flag (=true)" \
  'VITE_USE_WEBHOOK_SIMULATOR=true'

# AC5: documents successRate (the parameter and its 0.0-1.0 range).
check_section "AC5 – documents the successRate option" \
  'successRate|SUCCESS_RATE'
check_section "AC5 – documents the successRate range (0.0-1.0)" \
  '0\.0.*1\.0|0\.0–1\.0|0\.0..1\.0'

# AC5: documents maxAttempts.
check_section "AC5 – documents the maxAttempts option" \
  'maxAttempts|MAX_ATTEMPTS'

# AC6: documents other relevant dev-mode behaviour (build-time vs runtime,
# tree-shaking / production exclusion, or the DI seam wiring).
check_section "AC6 – documents build-time vs runtime configuration boundary" \
  'build[- ]time|runtime'
check_section "AC6 – notes simulator is excluded from production / tree-shaken" \
  'tree-shak|production build|production bundle'

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -gt 0 ] && exit 1
exit 0

#!/usr/bin/env bash
# Discovers and runs all test_*.sh files in the same directory as this script.
# Exits non-zero if any test script fails.

set -uo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd)"

PASS=0
FAIL=0
ERRORS=()

for test_script in "$TESTS_DIR"/test_*.sh; do
  [ -f "$test_script" ] || continue
  echo "──────────────────────────────────────────"
  echo "Running: $(basename "$test_script")"
  echo "──────────────────────────────────────────"
  if bash "$test_script"; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    ERRORS+=("$(basename "$test_script")")
  fi
  echo ""
done

echo "=========================================="
echo "Test suites: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  echo "FAILED suites: ${ERRORS[*]}"
  exit 1
fi
exit 0

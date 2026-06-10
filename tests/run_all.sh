#!/usr/bin/env bash
# Master test runner — executes every test script in tests/ and reports results.
# Exit code is non-zero if any test script fails.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TESTS_DIR="$REPO_ROOT/tests"

TOTAL_PASS=0
TOTAL_FAIL=0
FAILED_SCRIPTS=()

# Run every test_*.sh script in the tests/ directory (excluding this runner).
for script in "$TESTS_DIR"/test_*.sh; do
  [ -f "$script" ] || continue
  echo "──────────────────────────────────────────"
  echo "Running: $(basename "$script")"
  echo "──────────────────────────────────────────"
  if bash "$script"; then
    TOTAL_PASS=$((TOTAL_PASS + 1))
  else
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    FAILED_SCRIPTS+=("$(basename "$script")")
  fi
  echo ""
done

echo "══════════════════════════════════════════"
echo "Suite results: $TOTAL_PASS passed, $TOTAL_FAIL failed"

if [ "${#FAILED_SCRIPTS[@]}" -gt 0 ]; then
  echo "Failed scripts:"
  for s in "${FAILED_SCRIPTS[@]}"; do
    echo "  - $s"
  done
  echo "══════════════════════════════════════════"
  exit 1
fi

echo "All test scripts passed."
echo "══════════════════════════════════════════"
exit 0

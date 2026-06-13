#!/usr/bin/env bash
# Run all test scripts in the tests/ directory.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TESTS_DIR="$REPO_ROOT/tests"

PASS=0
FAIL=0

for script in "$TESTS_DIR"/test_*.sh; do
  if [ -x "$script" ]; then
    echo "==> Running $script"
    if bash "$script"; then
      PASS=$((PASS + 1))
    else
      FAIL=$((FAIL + 1))
    fi
    echo ""
  fi
done

echo "Test suites: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

#!/usr/bin/env bash
# Tests for Issue #10: Automated test suite for the front-end.
# Covers all six acceptance criteria.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: npm test script is defined in package.json ──────────────────────────
PACKAGE_JSON="$REPO_ROOT/package.json"

if [ ! -f "$PACKAGE_JSON" ]; then
  fail "AC1 – package.json does not exist"
else
  pass "AC1 – package.json exists"

  # Verify "test" script is present
  if grep -q '"test"' "$PACKAGE_JSON"; then
    pass "AC1 – \"test\" script is defined in package.json"
  else
    fail "AC1 – \"test\" script is NOT defined in package.json"
  fi

  # Verify "test" script is non-empty / non-trivial (not just "echo" or "true")
  TEST_SCRIPT_VALUE=$(node -e "const p=require('$PACKAGE_JSON'); console.log(p.scripts && p.scripts.test || '')" 2>/dev/null || true)
  if [ -n "$TEST_SCRIPT_VALUE" ] && \
     [ "$TEST_SCRIPT_VALUE" != "echo" ] && \
     [ "$TEST_SCRIPT_VALUE" != "true" ] && \
     [ "$TEST_SCRIPT_VALUE" != "exit 0" ]; then
    pass "AC1 – \"test\" script has a meaningful command: $TEST_SCRIPT_VALUE"
  else
    fail "AC1 – \"test\" script is empty or trivial: '$TEST_SCRIPT_VALUE'"
  fi
fi

# ── AC1 (continued): test runner exits non-zero on failure ───────────────────
# Verify run_all.sh propagates a non-zero exit code when a test script fails.
# We create a temporary repo-like structure with a failing test script and
# run run_all.sh from within it (run_all.sh resolves TESTS_DIR from $0 location).
RUN_ALL_SH="$REPO_ROOT/tests/run_all.sh"
if [ -f "$RUN_ALL_SH" ]; then
  TMPDIR_RUNNER="$(mktemp -d)"
  # run_all.sh computes TESTS_DIR as the directory containing $0, so we place
  # it and the failing test script in the same temp directory.
  mkdir -p "$TMPDIR_RUNNER/tests"
  cp "$RUN_ALL_SH" "$TMPDIR_RUNNER/tests/run_all.sh"
  cat > "$TMPDIR_RUNNER/tests/test_always_fail.sh" <<'FAILSCRIPT'
#!/usr/bin/env bash
echo "FAIL: deliberate failure for exit-code test"
exit 1
FAILSCRIPT
  chmod +x "$TMPDIR_RUNNER/tests/test_always_fail.sh"

  if bash "$TMPDIR_RUNNER/tests/run_all.sh" > /dev/null 2>&1; then
    fail "AC1 – test runner did NOT exit non-zero when a test script failed"
  else
    pass "AC1 – test runner exits non-zero when a test script fails"
  fi
  rm -rf "$TMPDIR_RUNNER"
else
  fail "AC1 – tests/run_all.sh does not exist"
fi

# ── AC3: Running against a deliberately broken HTML file exits non-zero ───────
HTMLHINT="$REPO_ROOT/node_modules/.bin/htmlhint"
HTMLHINTRC="$REPO_ROOT/.htmlhintrc"

if [ ! -x "$HTMLHINT" ]; then
  echo "SKIP: htmlhint not found — run 'npm install' first (skipping AC3 check)"
else
  TMPDIR_HTML="$(mktemp -d)"
  trap 'rm -rf "$TMPDIR_HTML"' EXIT

  # Create a broken HTML file: missing DOCTYPE, missing title, unclosed tags
  BROKEN_HTML="$TMPDIR_HTML/broken.html"
  cat > "$BROKEN_HTML" <<'BROKEN'
<html>
  <head></head>
  <body>
    <p>Missing DOCTYPE, missing title, unclosed div
    <div>
  </body>
</html>
BROKEN

  if "$HTMLHINT" --config "$HTMLHINTRC" "$BROKEN_HTML" > /dev/null 2>&1; then
    fail "AC3 – htmlhint did NOT exit non-zero for a broken HTML file (expected failure)"
  else
    pass "AC3 – htmlhint exits non-zero for a broken HTML file (missing DOCTYPE, missing title)"
  fi

  # Also verify a valid HTML file passes
  VALID_HTML="$TMPDIR_HTML/valid.html"
  cat > "$VALID_HTML" <<'VALID'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Valid Page</title>
  </head>
  <body>
    <p>Hello, world!</p>
  </body>
</html>
VALID

  if "$HTMLHINT" --config "$HTMLHINTRC" "$VALID_HTML" > /dev/null 2>&1; then
    pass "AC3 – htmlhint exits zero for a valid HTML file"
  else
    fail "AC3 – htmlhint unexpectedly failed on a valid HTML file"
  fi
fi

# ── AC2: Running on a clean checkout passes without errors ───────────────────
# Run each peer test script and confirm they all pass.
PEER_SCRIPTS_FAILED=0
for script in "$REPO_ROOT/tests"/test_*.sh; do
  [ -f "$script" ] || continue
  # Skip this script to avoid recursion
  [ "$(basename "$script")" = "$(basename "$0")" ] && continue
  if ! bash "$script" > /dev/null 2>&1; then
    fail "AC2 – $(basename "$script") fails on a clean checkout"
    PEER_SCRIPTS_FAILED=$((PEER_SCRIPTS_FAILED + 1))
  fi
done
if [ "$PEER_SCRIPTS_FAILED" -eq 0 ]; then
  pass "AC2 – all peer test scripts pass on a clean checkout"
fi

# ── AC4: CI/build configuration (if present) invokes the test script ─────────
# The acceptance criterion says "(if present)" — if a CI config exists it MUST
# invoke npm test; if none exists we note the gap but do not hard-fail.
CI_CONFIGS_FOUND=0
CI_INVOKES_TEST=0

for ci_file in \
  "$REPO_ROOT/.github/workflows/"*.yml \
  "$REPO_ROOT/.github/workflows/"*.yaml \
  "$REPO_ROOT/.travis.yml" \
  "$REPO_ROOT/Jenkinsfile" \
  "$REPO_ROOT/.circleci/config.yml" \
  "$REPO_ROOT/azure-pipelines.yml" \
  "$REPO_ROOT/bitbucket-pipelines.yml" \
  "$REPO_ROOT/.gitlab-ci.yml"; do
  [ -f "$ci_file" ] || continue
  CI_CONFIGS_FOUND=$((CI_CONFIGS_FOUND + 1))
  if grep -qE "npm (run )?test" "$ci_file" 2>/dev/null; then
    CI_INVOKES_TEST=$((CI_INVOKES_TEST + 1))
    pass "AC4 – CI config $(basename "$ci_file") invokes npm test"
  else
    fail "AC4 – CI config $(basename "$ci_file") exists but does NOT invoke npm test"
  fi
done

if [ "$CI_CONFIGS_FOUND" -eq 0 ]; then
  # No CI config present — criterion is "(if present)" so this is a warning, not a failure.
  echo "WARN: AC4 – No CI/build configuration file found; criterion is conditional ('if present')"
  echo "      Consider adding .github/workflows/ci.yml that runs 'npm test'."
else
  if [ "$CI_INVOKES_TEST" -eq "$CI_CONFIGS_FOUND" ]; then
    pass "AC4 – all $CI_CONFIGS_FOUND CI config(s) invoke npm test"
  fi
fi

# ── AC5: HTML validation covers index.html and src/ ──────────────────────────
HTML_LINT_SCRIPT="$REPO_ROOT/tests/test_html_lint.sh"

if [ -f "$HTML_LINT_SCRIPT" ]; then
  pass "AC5 – tests/test_html_lint.sh exists"

  # Check it references index.html
  if grep -q "index.html" "$HTML_LINT_SCRIPT"; then
    pass "AC5 – test_html_lint.sh covers index.html"
  else
    fail "AC5 – test_html_lint.sh does NOT reference index.html"
  fi

  # Check it references src/
  if grep -q "src" "$HTML_LINT_SCRIPT"; then
    pass "AC5 – test_html_lint.sh covers src/ directory"
  else
    fail "AC5 – test_html_lint.sh does NOT reference src/ directory"
  fi
else
  fail "AC5 – tests/test_html_lint.sh does NOT exist"
fi

# Verify lint:html npm script exists and targets HTML files
if [ -f "$PACKAGE_JSON" ]; then
  if grep -q '"lint:html"' "$PACKAGE_JSON"; then
    LINT_HTML_CMD=$(node -e "const p=require('$PACKAGE_JSON'); console.log(p.scripts && p.scripts['lint:html'] || '')" 2>/dev/null || true)
    if echo "$LINT_HTML_CMD" | grep -q "\.html\|htmlhint"; then
      pass "AC5 – lint:html npm script targets HTML files via htmlhint"
    else
      fail "AC5 – lint:html npm script does not appear to target HTML files"
    fi
  else
    fail "AC5 – lint:html npm script is NOT defined in package.json"
  fi
fi

# Verify .htmlhintrc exists and has rules
if [ -f "$HTMLHINTRC" ]; then
  pass "AC5 – .htmlhintrc configuration file exists"
  # Count rules (JSON booleans: ": true" or ": false")
  RULE_COUNT=$(grep -c ': true\|: false' "$HTMLHINTRC" 2>/dev/null || echo "0")
  if [ "${RULE_COUNT:-0}" -gt 0 ]; then
    pass "AC5 – .htmlhintrc contains $RULE_COUNT lint rule(s)"
  else
    fail "AC5 – .htmlhintrc appears to have no rules"
  fi
else
  fail "AC5 – .htmlhintrc does NOT exist"
fi

# ── AC6: README documents how to run the test suite locally ──────────────────
README="$REPO_ROOT/README.md"

if [ ! -f "$README" ]; then
  fail "AC6 – README.md does not exist"
else
  pass "AC6 – README.md exists"

  # Check for npm test instruction
  if grep -q "npm test" "$README"; then
    pass "AC6 – README.md documents 'npm test'"
  else
    fail "AC6 – README.md does NOT document 'npm test'"
  fi

  # Check for npm install instruction
  if grep -q "npm install" "$README"; then
    pass "AC6 – README.md documents 'npm install' (dependency setup)"
  else
    fail "AC6 – README.md does NOT document 'npm install'"
  fi

  # Check for a section heading about tests/running
  if grep -qiE "^## .*(test|lint|running)" "$README"; then
    pass "AC6 – README.md has a section heading covering tests/lint"
  else
    fail "AC6 – README.md has no section heading about tests or linting"
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

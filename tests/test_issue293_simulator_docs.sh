#!/usr/bin/env bash
# Tests for Issue #293: Document webhook simulator activation via environment flag
# Verifies that the simulator activation flag is documented in README and docs/simulator.md,
# that the documented flag name matches the implementation, and that the docs are discoverable.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
README="$REPO_ROOT/README.md"
SIMULATOR_DOC="$REPO_ROOT/docs/simulator.md"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: README.md (or a dedicated dev-docs file) contains a named environment flag ──────────
if grep -qE "VITE_SIMULATOR" "$README"; then
  pass "AC1 – README.md contains the VITE_SIMULATOR environment flag name"
else
  fail "AC1 – README.md does NOT contain the VITE_SIMULATOR environment flag name"
fi

if [ -f "$SIMULATOR_DOC" ]; then
  pass "AC1 – docs/simulator.md exists as a dedicated dev-docs file"
  if grep -qE "VITE_SIMULATOR" "$SIMULATOR_DOC"; then
    pass "AC1 – docs/simulator.md contains the VITE_SIMULATOR environment flag name"
  else
    fail "AC1 – docs/simulator.md does NOT contain the VITE_SIMULATOR environment flag name"
  fi
else
  fail "AC1 – docs/simulator.md does NOT exist"
fi

# ── AC2: Documentation explains how to set the flag for local development ────────────────────
# Must include either a CLI invocation or a dotenv file example
if grep -qE "VITE_SIMULATOR=true" "$SIMULATOR_DOC"; then
  pass "AC2 – docs/simulator.md shows how to set VITE_SIMULATOR=true"
else
  fail "AC2 – docs/simulator.md does NOT show how to set VITE_SIMULATOR=true"
fi

if grep -qE "npm run dev" "$SIMULATOR_DOC"; then
  pass "AC2 – docs/simulator.md references 'npm run dev' for local development"
else
  fail "AC2 – docs/simulator.md does NOT reference 'npm run dev' for local development"
fi

# Check for dotenv / .local file guidance (without using the literal .env string that README test forbids)
if grep -qiE "local.*file|dotenv|\.local" "$SIMULATOR_DOC"; then
  pass "AC2 – docs/simulator.md explains the local dotenv file option"
else
  fail "AC2 – docs/simulator.md does NOT explain the local dotenv file option"
fi

# ── AC3: Documentation states that the flag has no effect in production builds ───────────────
if grep -qiE "production" "$SIMULATOR_DOC"; then
  pass "AC3 – docs/simulator.md mentions production builds"
else
  fail "AC3 – docs/simulator.md does NOT mention production builds"
fi

if grep -qiE "excluded|tree.shak|not.*present|no.*impact|inert" "$SIMULATOR_DOC"; then
  pass "AC3 – docs/simulator.md states the simulator is excluded/inert in production"
else
  fail "AC3 – docs/simulator.md does NOT state the simulator is excluded/inert in production"
fi

# ── AC4: A usage example (code snippet or shell command) is included ─────────────────────────
# Check for a fenced code block containing the activation command
if grep -qE "VITE_SIMULATOR=true npm run dev" "$SIMULATOR_DOC"; then
  pass "AC4 – docs/simulator.md contains a CLI usage example (VITE_SIMULATOR=true npm run dev)"
else
  fail "AC4 – docs/simulator.md does NOT contain a CLI usage example"
fi

# Check README also has a usage example
if grep -qE "VITE_SIMULATOR=true npm run dev" "$README"; then
  pass "AC4 – README.md contains a CLI usage example (VITE_SIMULATOR=true npm run dev)"
else
  fail "AC4 – README.md does NOT contain a CLI usage example"
fi

# ── AC5: Documented flag name matches the actual flag name used in the implementation ────────
# The implementation lives in src/main.ts; check it uses VITE_SIMULATOR
MAIN_TS="$REPO_ROOT/src/main.ts"
if [ -f "$MAIN_TS" ]; then
  if grep -qE "VITE_SIMULATOR" "$MAIN_TS"; then
    pass "AC5 – src/main.ts uses VITE_SIMULATOR (matches documented flag name)"
  else
    fail "AC5 – src/main.ts does NOT use VITE_SIMULATOR (flag name mismatch with docs)"
  fi
else
  # If main.ts doesn't exist, check any src/ file for the flag
  if grep -rqE "VITE_SIMULATOR" "$REPO_ROOT/src/"; then
    pass "AC5 – src/ contains VITE_SIMULATOR (matches documented flag name)"
  else
    fail "AC5 – src/ does NOT contain VITE_SIMULATOR (flag name mismatch with docs)"
  fi
fi

# Ensure no other conflicting flag names are used in the implementation
if grep -rqE "VITE_USE_SIMULATOR|VITE_USE_WEBHOOK_SIMULATOR" "$REPO_ROOT/src/" 2>/dev/null; then
  fail "AC5 – src/ contains a conflicting simulator flag name (VITE_USE_SIMULATOR or VITE_USE_WEBHOOK_SIMULATOR) that differs from the documented VITE_SIMULATOR"
else
  pass "AC5 – No conflicting simulator flag names found in src/"
fi

# ── AC6: Documentation is discoverable from the top-level README.md ──────────────────────────
if grep -qE "docs/simulator\.md" "$README"; then
  pass "AC6 – README.md links to docs/simulator.md"
else
  fail "AC6 – README.md does NOT link to docs/simulator.md"
fi

# README must have a section heading for the simulator
if grep -qiE "simulator" "$README"; then
  pass "AC6 – README.md has a section referencing the simulator"
else
  fail "AC6 – README.md does NOT have a section referencing the simulator"
fi

# ── Summary ──────────────────────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

#!/usr/bin/env bash
# Tests for Issue #1: MIT LICENSE file at repository root
# Covers all five acceptance criteria.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LICENSE_FILE="$REPO_ROOT/LICENSE"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: A file named LICENSE (no extension) exists at the repo root ──────────
if [ -f "$LICENSE_FILE" ]; then
  pass "AC1 – LICENSE file exists at repo root"
else
  fail "AC1 – LICENSE file does NOT exist at repo root"
fi

# ── AC2: The file contains standard MIT licence text ─────────────────────────
# Check for the canonical MIT permission grant sentence and header.
if grep -q "Permission is hereby granted, free of charge" "$LICENSE_FILE" && \
   grep -q "THE SOFTWARE IS PROVIDED \"AS IS\"" "$LICENSE_FILE" && \
   grep -q "MIT License" "$LICENSE_FILE"; then
  pass "AC2 – LICENSE contains standard MIT licence text"
else
  fail "AC2 – LICENSE does NOT contain standard MIT licence text"
fi

# ── AC3: The copyright year is 2026 ──────────────────────────────────────────
if grep -q "2026" "$LICENSE_FILE"; then
  pass "AC3 – Copyright year is 2026"
else
  fail "AC3 – Copyright year 2026 NOT found in LICENSE"
fi

# ── AC4: The copyright holder is exactly 'Versent' ───────────────────────────
if grep -q "Versent" "$LICENSE_FILE"; then
  pass "AC4 – Copyright holder 'Versent' found in LICENSE"
else
  fail "AC4 – Copyright holder 'Versent' NOT found in LICENSE"
fi

# Verify the full copyright line is exactly as expected
EXPECTED_COPYRIGHT="Copyright (c) 2026 Versent"
if grep -qF "$EXPECTED_COPYRIGHT" "$LICENSE_FILE"; then
  pass "AC4 – Full copyright line matches 'Copyright (c) 2026 Versent'"
else
  fail "AC4 – Full copyright line does NOT match 'Copyright (c) 2026 Versent'"
fi

# ── AC5: No other licence files are added or modified ────────────────────────
# Find all files that look like licence files (case-insensitive), excluding .git
# and node_modules (which may contain licence files from third-party packages).
OTHER_LICENSE_FILES=$(find "$REPO_ROOT" \
  -not -path "$REPO_ROOT/.git/*" \
  -not -path "$REPO_ROOT/node_modules/*" \
  \( -iname "license*" -o -iname "licence*" -o -iname "copying*" \) \
  ! -path "$LICENSE_FILE" \
  2>/dev/null)

if [ -z "$OTHER_LICENSE_FILES" ]; then
  pass "AC5 – No other licence files exist in the repository"
else
  fail "AC5 – Unexpected licence file(s) found: $OTHER_LICENSE_FILES"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

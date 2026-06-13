#!/usr/bin/env bash
# Tests for Issue #10: HTML lint/validation of authored HTML files.
# Uses htmlhint (installed via npm) to validate index.html and src/**/*.html.
# Passes when no HTML files exist yet (nothing to validate).

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── Locate htmlhint ───────────────────────────────────────────────────────────
HTMLHINT="$REPO_ROOT/node_modules/.bin/htmlhint"
if [ ! -x "$HTMLHINT" ]; then
  # Fall back to a globally installed htmlhint if available
  HTMLHINT="$(command -v htmlhint 2>/dev/null || true)"
fi

if [ -z "$HTMLHINT" ] || [ ! -x "$HTMLHINT" ]; then
  echo "SKIP: htmlhint not found — run 'npm install' first"
  exit 0
fi

HTMLHINTRC="$REPO_ROOT/.htmlhintrc"

# ── Collect authored HTML files ───────────────────────────────────────────────
# Scope: index.html at repo root and any *.html under src/
# Excludes node_modules, .git, and any generated/vendor output.
HTML_FILES=()

if [ -f "$REPO_ROOT/index.html" ]; then
  HTML_FILES+=("$REPO_ROOT/index.html")
fi

if [ -d "$REPO_ROOT/src" ]; then
  while IFS= read -r -d '' f; do
    HTML_FILES+=("$f")
  done < <(find "$REPO_ROOT/src" -name "*.html" -print0 2>/dev/null)
fi

# ── AC: No HTML files yet — nothing to validate ───────────────────────────────
if [ "${#HTML_FILES[@]}" -eq 0 ]; then
  pass "HTML lint – no authored HTML files found; nothing to validate (will run once index.html / src/ exist)"
  echo ""
  echo "Results: $PASS passed, $FAIL failed"
  exit 0
fi

# ── AC: Validate each HTML file with htmlhint ─────────────────────────────────
ALL_CLEAN=true
for html_file in "${HTML_FILES[@]}"; do
  rel="${html_file#"$REPO_ROOT/"}"
  if "$HTMLHINT" --config "$HTMLHINTRC" "$html_file" 2>&1; then
    pass "HTML lint – $rel passes htmlhint"
  else
    fail "HTML lint – $rel has htmlhint violations"
    ALL_CLEAN=false
  fi
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

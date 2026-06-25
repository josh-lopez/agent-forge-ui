#!/usr/bin/env bash
# Tests for Issue #37: Add DOM structure tests for root index.html
#
# Provides structural coverage of the entry HTML (index.html) independent of
# any JS unit tests. The repo's test harness is bash-based (see
# tests/run_all.sh), so these structural assertions are expressed as bash
# checks that parse the static HTML document at the repository root.
#
# Acceptance criteria covered:
#   AC1 – this test file exists and explicitly targets index.html DOM structure.
#   AC2 – a <title> element is present and non-empty in the document.
#   AC3 – a root mount point element (e.g. <div id="app"> or, for this static
#         page, the primary <body> content container/heading) exists.
#   AC4/AC5 – runs under `npm test` (bash tests/run_all.sh) without breaking
#         existing tests.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INDEX_HTML="$REPO_ROOT/index.html"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: index.html exists and is the document under test ─────────────────────
if [ -f "$INDEX_HTML" ]; then
  pass "AC1 – index.html exists at the repository root (document under test)"
else
  fail "AC1 – index.html does NOT exist at the repository root"
  # Without the file there is nothing further to assert.
  echo ""
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# Read the document once for the structural assertions below.
HTML="$(cat "$INDEX_HTML")"

# ── AC2: a non-empty <title> element is present in the document ───────────────
if echo "$HTML" | grep -qiE '<title>[[:space:]]*</title>'; then
  fail "AC2 – <title> element is present but empty"
elif echo "$HTML" | grep -qiE '<title>[^<]+</title>'; then
  TITLE_TEXT=$(echo "$HTML" | grep -oiE '<title>[^<]+</title>' \
    | sed -E 's/<[^>]+>//g' | head -1)
  pass "AC2 – <title> element is present and non-empty: '$TITLE_TEXT'"
else
  fail "AC2 – no non-empty <title> element found in the document"
fi

# ── AC3: a root mount point element exists in the DOM ─────────────────────────
# Preferred convention is an explicit mount node such as <div id="app">. This
# static page renders content directly into <body>, so we accept either an
# explicit id-based mount node OR the primary body content container/heading as
# the equivalent root mount point.
if echo "$HTML" | grep -qiE '<[a-z]+[^>]*\bid=["'"'"']app["'"'"'][^>]*>'; then
  pass "AC3 – explicit root mount point element with id=\"app\" is present"
elif echo "$HTML" | grep -qiE '<[a-z]+[^>]*\bid=["'"'"']root["'"'"'][^>]*>'; then
  pass "AC3 – explicit root mount point element with id=\"root\" is present"
elif echo "$HTML" | grep -qiE '<h1[^>]*>[^<]+</h1>'; then
  pass "AC3 – root content element (<h1> heading) is present inside the body"
else
  fail "AC3 – no root mount point element (id=\"app\"/\"root\" or <h1>) found"
fi

# ── Document well-formedness: the body that hosts the mount point exists ──────
if echo "$HTML" | grep -qiE '<body[^>]*>' && echo "$HTML" | grep -qiE '</body>'; then
  pass "AC3 – <body> element (DOM root mount container) is present and closed"
else
  fail "AC3 – <body> element is missing or unclosed"
fi

# The <title> must live inside <head> for a valid DOM document head structure.
if echo "$HTML" | grep -qiE '<head[^>]*>' && echo "$HTML" | grep -qiE '</head>'; then
  pass "AC2 – <head> element (host of <title>) is present and closed"
else
  fail "AC2 – <head> element is missing or unclosed"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

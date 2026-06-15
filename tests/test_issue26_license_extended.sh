#!/usr/bin/env bash
# Extended tests for Issue #26: Add a licence file to the repository
# Supplements test_issue26_license.sh with additional edge-case checks.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LICENSE_FILE="$REPO_ROOT/LICENSE"
LICENCE_FILE="$REPO_ROOT/LICENCE"
PACKAGE_JSON="$REPO_ROOT/package.json"
README="$REPO_ROOT/README.md"
CONTRIBUTING="$REPO_ROOT/CONTRIBUTING.md"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# Resolve which licence file is present
FOUND_LICENSE=""
if [ -f "$LICENSE_FILE" ]; then
  FOUND_LICENSE="$LICENSE_FILE"
elif [ -f "$LICENCE_FILE" ]; then
  FOUND_LICENSE="$LICENCE_FILE"
fi

# ── AC1: Licence file is non-empty ────────────────────────────────────────────
if [ -n "$FOUND_LICENSE" ]; then
  FILE_SIZE=$(wc -c < "$FOUND_LICENSE")
  if [ "$FILE_SIZE" -gt 0 ]; then
    pass "AC1 – Licence file is non-empty ($FILE_SIZE bytes)"
  else
    fail "AC1 – Licence file exists but is empty"
  fi
else
  fail "AC1 – No LICENSE or LICENCE file found at repo root"
fi

# ── AC2: Licence file is readable text (has printable lines) ──────────────────
if [ -n "$FOUND_LICENSE" ]; then
  # A valid text licence file should have multiple readable lines
  LINE_COUNT=$(grep -c "." "$FOUND_LICENSE" 2>/dev/null || echo 0)
  if [ "$LINE_COUNT" -ge 5 ]; then
    pass "AC2 – Licence file has $LINE_COUNT non-empty lines (readable text)"
  else
    fail "AC2 – Licence file has too few readable lines ($LINE_COUNT) — may not be valid text"
  fi
fi

# ── AC3: Copyright line has no template tokens (extended set) ─────────────────
if [ -n "$FOUND_LICENSE" ]; then
  # Check for angle-bracket style tokens like <year>, <author>
  if grep -qE "<year>|<author>|<name>|<owner>|<copyright holder>" "$FOUND_LICENSE"; then
    fail "AC3 – Licence file contains angle-bracket template tokens (e.g. <year>, <author>)"
  else
    pass "AC3 – Licence file contains no angle-bracket template tokens"
  fi

  # Verify the copyright year is a plausible year (2000–2099)
  if grep -qE "Copyright.*20[0-9]{2}" "$FOUND_LICENSE"; then
    YEAR=$(grep -oE "20[0-9]{2}" "$FOUND_LICENSE" | head -1)
    pass "AC3 – Copyright year ($YEAR) is in the plausible range 2000–2099"
  else
    fail "AC3 – Copyright year is not in the plausible range 2000–2099"
  fi
fi

# ── AC4: README.md references the LICENSE file ────────────────────────────────
# The README should mention the licence so users know the project's terms.
if [ -f "$README" ]; then
  if grep -qiE "license|licence" "$README"; then
    pass "AC4 – README.md references the licence"
  else
    fail "AC4 – README.md does not reference the licence at all"
  fi

  # README should link to or name the LICENSE file
  if grep -qE "\[LICENSE\]|\[LICENCE\]|LICENSE|LICENCE" "$README"; then
    pass "AC4 – README.md explicitly names the LICENSE file"
  else
    fail "AC4 – README.md does not explicitly name the LICENSE file"
  fi
else
  pass "AC4 – No README.md present; licence reference check not applicable"
fi

# ── AC4: package.json license field is a recognised SPDX identifier ───────────
if [ -f "$PACKAGE_JSON" ]; then
  PKG_LICENSE=$(grep '"license"' "$PACKAGE_JSON" | sed 's/.*"license"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

  if [ -n "$PKG_LICENSE" ]; then
    case "$PKG_LICENSE" in
      MIT|Apache-2.0|GPL-2.0|GPL-3.0|BSD-2-Clause|BSD-3-Clause|ISC|MPL-2.0|LGPL-2.1|LGPL-3.0)
        pass "AC4 – package.json license field '$PKG_LICENSE' is a recognised SPDX identifier"
        ;;
      *)
        fail "AC4 – package.json license field '$PKG_LICENSE' is not a standard SPDX identifier"
        ;;
    esac
  fi
fi

# ── AC5: CONTRIBUTING.md does not contradict the declared licence ──────────────
if [ -f "$CONTRIBUTING" ] && [ -f "$PACKAGE_JSON" ]; then
  PKG_LICENSE=$(grep '"license"' "$PACKAGE_JSON" | sed 's/.*"license"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

  if [ -n "$PKG_LICENSE" ]; then
    case "$PKG_LICENSE" in
      MIT)
        # CONTRIBUTING.md should not claim a different licence
        if grep -qiE "(Apache|GPL|BSD|LGPL|MPL)[[:space:]]+(License|Licence)" "$CONTRIBUTING"; then
          fail "AC5 – CONTRIBUTING.md mentions a licence that contradicts declared $PKG_LICENSE"
        else
          pass "AC5 – CONTRIBUTING.md does not contradict the declared $PKG_LICENSE licence"
        fi
        # If CONTRIBUTING.md mentions MIT, that's consistent
        if grep -qi "MIT" "$CONTRIBUTING"; then
          pass "AC5 – CONTRIBUTING.md explicitly references MIT licence (consistent)"
        fi
        ;;
      Apache-2.0)
        if grep -qiE "(MIT|GPL|BSD|LGPL|MPL)[[:space:]]+(License|Licence)" "$CONTRIBUTING"; then
          fail "AC5 – CONTRIBUTING.md mentions a licence that contradicts declared $PKG_LICENSE"
        else
          pass "AC5 – CONTRIBUTING.md does not contradict the declared $PKG_LICENSE licence"
        fi
        ;;
      *)
        pass "AC5 – CONTRIBUTING.md licence consistency check skipped for licence: $PKG_LICENSE"
        ;;
    esac
  fi
elif [ ! -f "$CONTRIBUTING" ]; then
  pass "AC5 – No CONTRIBUTING.md present; consistency check not applicable"
fi

# ── AC5: No conflicting licence declarations in .github/ directory ─────────────
GITHUB_DIR="$REPO_ROOT/.github"
if [ -d "$GITHUB_DIR" ] && [ -f "$PACKAGE_JSON" ]; then
  PKG_LICENSE=$(grep '"license"' "$PACKAGE_JSON" | sed 's/.*"license"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

  if [ -n "$PKG_LICENSE" ]; then
    CONFLICTING=$(find "$GITHUB_DIR" -type f \
      \( -name "*.yml" -o -name "*.yaml" -o -name "*.md" \) \
      -exec grep -lE "SPDX-License-Identifier:[[:space:]]*[A-Za-z0-9.+-]+" {} \; 2>/dev/null | \
      while read -r f; do
        SPDX_ID=$(grep -oE "SPDX-License-Identifier:[[:space:]]*[A-Za-z0-9.+-]+" "$f" | \
                  sed 's/SPDX-License-Identifier:[[:space:]]*//')
        if [ "$SPDX_ID" != "$PKG_LICENSE" ]; then
          echo "$f: $SPDX_ID"
        fi
      done)

    if [ -z "$CONFLICTING" ]; then
      pass "AC5 – No conflicting SPDX-License-Identifier in .github/ files"
    else
      fail "AC5 – Conflicting SPDX-License-Identifier in .github/ files: $CONFLICTING"
    fi
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

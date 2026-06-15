#!/usr/bin/env bash
# Issue #26: Licence file integrity checks
# Verifies the full canonical MIT licence body is present and unmodified,
# and that the package.json license field (if present) is consistent.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LICENSE_FILE="$REPO_ROOT/LICENSE"
LICENCE_FILE="$REPO_ROOT/LICENCE"
PACKAGE_JSON="$REPO_ROOT/package.json"

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

# ── AC1: Licence file exists at repo root ─────────────────────────────────────
if [ -n "$FOUND_LICENSE" ]; then
  pass "AC1 – Licence file found at repo root: $(basename "$FOUND_LICENSE")"
else
  fail "AC1 – No LICENSE or LICENCE file found at repo root"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# ── AC2: Full canonical MIT licence body text is present ──────────────────────
# Check each key clause of the MIT licence individually to ensure the full
# text is present and not truncated or corrupted.

MIT_CLAUSES=(
  "Permission is hereby granted, free of charge"
  "to use, copy, modify, merge, publish, distribute, sublicense"
  "The above copyright notice and this permission notice shall be included"
  "THE SOFTWARE IS PROVIDED .AS IS."
  "WITHOUT WARRANTY OF ANY KIND"
  "IN NO EVENT SHALL"
  "LIABILITY, WHETHER IN AN ACTION OF CONTRACT"
)

ALL_CLAUSES_PRESENT=1
for clause in "${MIT_CLAUSES[@]}"; do
  if grep -qE "$clause" "$FOUND_LICENSE"; then
    pass "AC2 – MIT clause present: '$clause'"
  else
    fail "AC2 – MIT clause MISSING: '$clause'"
    ALL_CLAUSES_PRESENT=0
  fi
done

if [ "$ALL_CLAUSES_PRESENT" -eq 1 ]; then
  pass "AC2 – All canonical MIT licence clauses are present"
else
  fail "AC2 – One or more canonical MIT licence clauses are missing"
fi

# ── AC3: Copyright line has a real year and holder (no template tokens) ────────
# Check for square-bracket tokens
if grep -qiE "\[year\]|\[yyyy\]|\[author\]|\[name\]|\[fullname\]|\[owner\]|\[copyright holder\]" "$FOUND_LICENSE"; then
  fail "AC3 – Licence file contains unfilled square-bracket template tokens"
else
  pass "AC3 – No square-bracket template tokens found"
fi

# Check for angle-bracket tokens
if grep -qE "<year>|<author>|<name>|<owner>|<copyright holder>" "$FOUND_LICENSE"; then
  fail "AC3 – Licence file contains unfilled angle-bracket template tokens"
else
  pass "AC3 – No angle-bracket template tokens found"
fi

# Verify a complete copyright line: "Copyright (c) YYYY SomeName"
if grep -qE "Copyright \(c\) [0-9]{4} .{2,}" "$FOUND_LICENSE"; then
  COPYRIGHT_LINE=$(grep -E "Copyright \(c\) [0-9]{4}" "$FOUND_LICENSE" | head -1)
  pass "AC3 – Complete copyright line found: '$COPYRIGHT_LINE'"
else
  fail "AC3 – No complete copyright line of the form 'Copyright (c) YYYY <holder>' found"
fi

# ── AC4: package.json license field consistency ────────────────────────────────
if [ -f "$PACKAGE_JSON" ]; then
  PKG_LICENSE=$(grep '"license"' "$PACKAGE_JSON" \
    | sed 's/.*"license"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' \
    | head -1)

  if [ -z "$PKG_LICENSE" ]; then
    pass "AC4 – package.json has no 'license' field; no inconsistency possible"
  else
    pass "AC4 – package.json declares license: '$PKG_LICENSE'"

    # Verify the LICENSE file content matches the declared SPDX identifier
    case "$PKG_LICENSE" in
      MIT)
        if grep -q "MIT License" "$FOUND_LICENSE" && \
           grep -q "Permission is hereby granted, free of charge" "$FOUND_LICENSE"; then
          pass "AC4 – LICENSE file content is consistent with package.json 'license': 'MIT'"
        else
          fail "AC4 – LICENSE file content does NOT match package.json 'license': 'MIT'"
        fi
        ;;
      Apache-2.0)
        if grep -q "Apache License" "$FOUND_LICENSE" && \
           grep -q "Version 2.0" "$FOUND_LICENSE"; then
          pass "AC4 – LICENSE file content is consistent with package.json 'license': 'Apache-2.0'"
        else
          fail "AC4 – LICENSE file content does NOT match package.json 'license': 'Apache-2.0'"
        fi
        ;;
      *)
        if grep -qi "$PKG_LICENSE" "$FOUND_LICENSE"; then
          pass "AC4 – LICENSE file mentions the identifier '$PKG_LICENSE' from package.json"
        else
          fail "AC4 – LICENSE file does not mention the identifier '$PKG_LICENSE' from package.json"
        fi
        ;;
    esac
  fi
else
  pass "AC4 – No package.json present; consistency check not applicable"
fi

# ── AC5: No conflicting SPDX identifiers in tracked source files ──────────────
# Determine the effective licence identifier from the file content
EFFECTIVE_LICENSE=""
if grep -q "MIT License" "$FOUND_LICENSE" && \
   grep -q "Permission is hereby granted, free of charge" "$FOUND_LICENSE"; then
  EFFECTIVE_LICENSE="MIT"
elif grep -q "Apache License" "$FOUND_LICENSE" && \
     grep -q "Version 2.0" "$FOUND_LICENSE"; then
  EFFECTIVE_LICENSE="Apache-2.0"
fi

if [ -n "$EFFECTIVE_LICENSE" ]; then
  pass "AC5 – Effective licence identified as: $EFFECTIVE_LICENSE"

  # Scan all tracked source/config files for SPDX-License-Identifier declarations
  CONFLICTING_FILES=""
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    SPDX_LINE=$(grep -oE "SPDX-License-Identifier:[[:space:]]*[A-Za-z0-9.+-]+" "$f" 2>/dev/null | head -1)
    if [ -n "$SPDX_LINE" ]; then
      SPDX_ID=$(echo "$SPDX_LINE" | sed 's/SPDX-License-Identifier:[[:space:]]*//')
      if [ "$SPDX_ID" != "$EFFECTIVE_LICENSE" ]; then
        CONFLICTING_FILES="$CONFLICTING_FILES $f($SPDX_ID)"
      fi
    fi
  done < <(find "$REPO_ROOT" \
    -not -path "$REPO_ROOT/.git/*" \
    -not -path "$REPO_ROOT/node_modules/*" \
    -type f \
    \( -name "*.ts" -o -name "*.js" -o -name "*.html" \
       -o -name "*.css" -o -name "*.md" -o -name "*.json" \
       -o -name "*.yml" -o -name "*.yaml" \) \
    2>/dev/null)

  if [ -z "$CONFLICTING_FILES" ]; then
    pass "AC5 – No files contain a conflicting SPDX-License-Identifier"
  else
    fail "AC5 – Files with conflicting SPDX-License-Identifier:$CONFLICTING_FILES"
  fi

  # Check README.md does not name a different licence
  README="$REPO_ROOT/README.md"
  if [ -f "$README" ]; then
    case "$EFFECTIVE_LICENSE" in
      MIT)
        if grep -qiE "(Apache|GPL|BSD|LGPL|MPL|CDDL|EPL)[[:space:]]+(License|Licence)" "$README"; then
          fail "AC5 – README.md names a licence other than MIT"
        else
          pass "AC5 – README.md does not name a licence that contradicts MIT"
        fi
        ;;
      Apache-2.0)
        if grep -qiE "(MIT|GPL|BSD|LGPL|MPL|CDDL|EPL)[[:space:]]+(License|Licence)" "$README"; then
          fail "AC5 – README.md names a licence other than Apache-2.0"
        else
          pass "AC5 – README.md does not name a licence that contradicts Apache-2.0"
        fi
        ;;
    esac
  else
    pass "AC5 – No README.md to check for conflicting licence mentions"
  fi
else
  pass "AC5 – Could not determine effective licence identifier; skipping SPDX conflict scan"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

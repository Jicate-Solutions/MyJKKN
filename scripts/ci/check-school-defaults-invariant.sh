#!/usr/bin/env bash
# SchoolDefaultsService invariant — DELTA gate (advisory).
#
# SchoolDefaultsService is the SINGLE source of truth for the K-12 virtual
# records (degree_code 'K12', department_code 'ACAD') and enforces school
# students' auto-assignment ("prevents manual override"). If other code
# creates/identifies those virtual records by hand, the single-source-of-truth
# invariant breaks and manual override becomes possible.
#
# This flags NEW lines (delta-only) OUTSIDE the authorized files that reference
# the virtual-record CODE identity ('K12' / 'ACAD' as quoted literals). The
# display NAME "K-12 Program" is deliberately NOT matched — it's legitimate UI
# label text in ~12 files. Baseline references in the authorized list are
# grandfathered.
#
# Advisory: writes markdown to $1, ALWAYS exits 0. GITHUB_TOKEN only.
# Usage: check-school-defaults-invariant.sh <OUT_FILE> <BASE_SHA> <HEAD_SHA>
set -euo pipefail
OUT="${1:?out}"; BASE="${2:?base}"; HEAD="${3:?head}"
: > "$OUT"

# Files allowed to author/look-up the virtual-record identity directly.
AUTHORIZED='^(lib/services/school-defaults-service\.ts|lib/services/school-defaults-admin-service\.ts|scripts/batch-autofill-school-learners\.ts)$'
# The create-identity literals (quoted), NOT the display name.
IDENTITY="['\"](K12|ACAD)['\"]"

# Walk this PR's added lines in TS/TSX, capture (file, newline, text).
hits=""
cur=""; nl=0
while IFS= read -r line; do
  case "$line" in
    "+++ b/"*) cur="${line#+++ b/}";;
    "@@"*) nl=$(sed -E 's/^@@ -[0-9,]+ \+([0-9]+).*/\1/' <<<"$line");;
    "+"*)
      text="${line:1}"
      if [[ "$cur" =~ \.(ts|tsx)$ ]] && ! [[ "$cur" =~ $AUTHORIZED ]]; then
        if grep -qE "$IDENTITY" <<<"$text"; then
          hits+="| \`$cur:$nl\` | ${text//|/\\|} |"$'\n'
        fi
      fi
      nl=$((nl+1));;
    "-"*) :;;
    *) nl=$((nl+1));;
  esac
done < <(git diff --unified=0 --no-color "$BASE...$HEAD" -- '*.ts' '*.tsx' || true)

[ -z "$hits" ] && exit 0

{
  echo "<!-- jkkn-school-defaults -->"
  echo "## 🏫 SchoolDefaultsService invariant (advisory)"
  echo ""
  echo "New code references the K-12 virtual-record identity (\`K12\`/\`ACAD\` codes) **outside SchoolDefaultsService**. These records are the service's single source of truth — creating or identifying them by hand can bypass the enforced auto-assignment for school learners."
  echo ""
  echo "| Location | Line |"
  echo "| --- | --- |"
  printf '%s' "$hits" | head -20
  echo ""
  echo "**Fix:** go through \`SchoolDefaultsService\` (e.g. \`getOrCreateSchoolDegree\` / \`enforceSchoolDefaults\`). If this file genuinely must reference the identity, add it to the AUTHORIZED list in \`scripts/ci/check-school-defaults-invariant.sh\` with a rationale."
  echo ""
  echo "_Advisory — merge not blocked. Applies to ALL \`entity_type='school'\` institutions, not specific schools._"
} > "$OUT"

#!/usr/bin/env bash
# CARRE coverage — DELTA gate (advisory).
#
# The CARRE Coverage Map (/audit/care/coverage) tracks every PEOPLE-FACING module
# from lib/constants/carre-auditable-modules.ts. A top-level module is either
# AUDITABLE (a learner/staff member experiences it — in CARRE_AUDITABLE_MODULES)
# or explicitly EXCLUDED (infra/back-office — in CARRE_EXCLUDED_MODULES). A
# brand-new module that is NEITHER is invisible to engagement compliance: it never
# shows as "needs first audit" and silently escapes the estate view. This nudges
# the author to classify it, at the cheapest moment.
#
# Also flags an auditable key whose route directory no longer exists — a phantom
# row on the coverage map after a rename/removal (only when the const changed).
#
# Advisory: writes a markdown report to $1 and ALWAYS exits 0 — never blocks.
# Pure git/grep, no secret beyond the workflow's GITHUB_TOKEN (used only to post).
# Twin of scripts/ci/check-smart-guide-coverage.sh.
#
# Usage: check-carre-coverage.sh <OUT_FILE> <BASE_SHA> <HEAD_SHA>
set -euo pipefail
OUT="${1:?out file}"; BASE="${2:?base sha}"; HEAD="${3:?head sha}"
: > "$OUT"

CONST="lib/constants/carre-auditable-modules.ts"
[ -f "$CONST" ] || exit 0

# Classified slugs = auditable keys ∪ explicitly-excluded slugs (both from the const).
mapfile -t AUDITABLE < <(grep -oE "key: '[^']*'" "$CONST" | sed -E "s/key: '([^']*)'/\1/" | sort -u || true)
mapfile -t EXCLUDED  < <(awk '/export const CARRE_EXCLUDED_MODULES/{f=1} f{print} f&&/^\];/{exit}' "$CONST" | grep -oE "'[^']*'" | tr -d "'" | sort -u || true)

is_classified() { local m="$1" x; for x in "${AUDITABLE[@]:-}" "${EXCLUDED[@]:-}"; do [ "$x" = "$m" ] && return 0; done; return 1; }

# ── 1. Brand-new top-level modules that aren't classified ──────────────────────
mapfile -t ADDED_PAGES < <(git diff --name-only --diff-filter=A "$BASE...$HEAD" -- 'app/(routes)/**/page.tsx' || true)
declare -A NEW_UNCLASSIFIED=()
for page in "${ADDED_PAGES[@]:-}"; do
  [ -z "$page" ] && continue
  rest="${page#app/(routes)/}"
  mod=""; IFS='/' read -ra segs <<< "$rest"
  for s in "${segs[@]}"; do
    case "$s" in \(*\)|@*|_*) continue ;; *) mod="$s"; break ;; esac
  done
  [ -z "$mod" ] && continue
  # brand-new = the module dir did not exist on BASE
  if ! git ls-tree -r --name-only "$BASE" -- "app/(routes)/$mod/" 2>/dev/null | grep -q .; then
    is_classified "$mod" || NEW_UNCLASSIFIED["$mod"]="$page"
  fi
done

# ── 2. Auditable keys whose route dir no longer exists (phantom rows) ──────────
# Delta-scoped: only when THIS PR edits the const — avoids flagging legacy drift.
PHANTOMS=()
if git diff --name-only "$BASE...$HEAD" | grep -qx "$CONST"; then
  for k in "${AUDITABLE[@]:-}"; do
    [ -z "$k" ] && continue
    git ls-tree -r --name-only "$HEAD" -- "app/(routes)/$k/" 2>/dev/null | grep -q . || PHANTOMS+=("$k")
  done
fi

[ "${#NEW_UNCLASSIFIED[@]}" -eq 0 ] && [ "${#PHANTOMS[@]}" -eq 0 ] && exit 0

{
  echo "<!-- jkkn-carre-coverage -->"
  echo "## 🫥 CARRE coverage (advisory)"
  echo ""
  if [ "${#NEW_UNCLASSIFIED[@]}" -gt 0 ]; then
    echo "New top-level module(s) not classified for the **CARRE Coverage Map** (\`/audit/care/coverage\`). Classify each so it can't silently escape engagement compliance:"
    echo ""
    for m in "${!NEW_UNCLASSIFIED[@]}"; do
      echo "- **$m** (e.g. \`${NEW_UNCLASSIFIED[$m]}\`) — if a learner/staff member experiences it, add \`{ key: '$m', label: '…' }\` to \`CARRE_AUDITABLE_MODULES\`; if it's infra/back-office, add \`'$m'\` to \`CARRE_EXCLUDED_MODULES\`. Both live in \`$CONST\`."
    done
    echo ""
  fi
  if [ "${#PHANTOMS[@]}" -gt 0 ]; then
    echo "Auditable key(s) with no matching route under \`app/(routes)/\` — a phantom row on the coverage map (renamed or removed module?):"
    echo ""
    for k in "${PHANTOMS[@]}"; do echo "- **$k** — remove from \`CARRE_AUDITABLE_MODULES\` or fix the key."; done
    echo ""
  fi
  echo "_Advisory — merge not blocked. See the \`carre-coverage\` gate in the \`/myjkkn\` chain._"
} > "$OUT"

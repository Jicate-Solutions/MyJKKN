#!/usr/bin/env bash
# Smart-guide coverage — DELTA gate (advisory).
#
# Guides are MODULE-scoped: each guide-enabled module has lib/<module>/guide/content.ts
# (today: ai-pulse, campus-living, pde). When a PR adds NEW pages under a module
# that HAS a guide but does NOT touch that module's guide content, the guide drifts
# behind the UI — new pages with no "Take me there" step. This nudges the author
# (via /smart-guide) at the cheapest moment. It also flags a brand-new top-level
# module as a guide candidate.
#
# Advisory: writes a markdown report to $1 and ALWAYS exits 0 — never blocks.
# Pure git/grep, no secrets beyond the workflow's GITHUB_TOKEN (used only to post).
#
# Usage: check-smart-guide-coverage.sh <OUT_FILE> <BASE_SHA> <HEAD_SHA>
set -euo pipefail
OUT="${1:?out file}"; BASE="${2:?base sha}"; HEAD="${3:?head sha}"
: > "$OUT"

# Guide-enabled modules = those with a guide content file (dynamic, not hardcoded).
mapfile -t GUIDE_MODS < <(ls lib/*/guide/content.ts 2>/dev/null | sed -E 's#lib/([^/]+)/guide/content.ts#\1#' | sort -u)
[ "${#GUIDE_MODS[@]}" -eq 0 ] && exit 0

is_guide_mod() { local m="$1"; for g in "${GUIDE_MODS[@]}"; do [ "$g" = "$m" ] && return 0; done; return 1; }

# Files this PR changed / added.
mapfile -t CHANGED < <(git diff --name-only "$BASE...$HEAD" || true)
mapfile -t ADDED_PAGES < <(git diff --name-only --diff-filter=A "$BASE...$HEAD" -- 'app/(routes)/**/page.tsx' || true)
[ "${#ADDED_PAGES[@]}" -eq 0 ] && exit 0

# Did the PR touch a given module's guide content?
guide_touched() { local m="$1"; printf '%s\n' "${CHANGED[@]}" | grep -qx "lib/$m/guide/content.ts"; }

declare -A NEEDS_GUIDE_STEP=()   # module -> count of new pages
declare -A NEW_MODULE_PAGES=()   # module -> sample page (brand-new module, no guide)

for page in "${ADDED_PAGES[@]}"; do
  # Strip app/(routes)/ prefix; take first NON-group segment as the module.
  rest="${page#app/(routes)/}"
  mod=""
  IFS='/' read -ra segs <<< "$rest"
  for s in "${segs[@]}"; do
    case "$s" in
      \(*\)|@*|_*) continue ;;   # route groups / parallel / private — not URL modules
      *) mod="$s"; break ;;
    esac
  done
  [ -z "$mod" ] && continue
  if is_guide_mod "$mod"; then
    guide_touched "$mod" || NEEDS_GUIDE_STEP["$mod"]=$(( ${NEEDS_GUIDE_STEP["$mod"]:-0} + 1 ))
  elif ! git ls-tree -r --name-only "$BASE" -- "app/(routes)/$mod/" 2>/dev/null | grep -q .; then
    # not guide-enabled AND the module didn't exist on base = brand-new module
    NEW_MODULE_PAGES["$mod"]="$page"
  fi
done

[ "${#NEEDS_GUIDE_STEP[@]}" -eq 0 ] && [ "${#NEW_MODULE_PAGES[@]}" -eq 0 ] && exit 0

{
  echo "<!-- jkkn-smart-guide -->"
  echo "## 🧭 Smart-guide coverage (advisory)"
  echo ""
  if [ "${#NEEDS_GUIDE_STEP[@]}" -gt 0 ]; then
    echo "This PR adds pages under module(s) that **have a smart guide**, but didn't update the guide — new pages won't have a \"Take me there\" step:"
    echo ""
    for m in "${!NEEDS_GUIDE_STEP[@]}"; do
      echo "- **$m** — ${NEEDS_GUIDE_STEP[$m]} new page(s); guide at \`lib/$m/guide/content.ts\` unchanged. Add a step (or note why not). Run \`/smart-guide $m\`."
    done
    echo ""
  fi
  if [ "${#NEW_MODULE_PAGES[@]}" -gt 0 ]; then
    echo "New top-level module(s) with no smart guide — consider \`/smart-guide\` if user-facing:"
    echo ""
    for m in "${!NEW_MODULE_PAGES[@]}"; do
      echo "- **$m** (e.g. \`${NEW_MODULE_PAGES[$m]}\`)"
    done
    echo ""
  fi
  echo "_Advisory — merge not blocked. Guides are module-scoped (\`lib/<module>/guide/content.ts\`)._"
} > "$OUT"

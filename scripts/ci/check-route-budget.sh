#!/usr/bin/env bash
# check-route-budget.sh — fail a PR before it can push production past Vercel's route cap.
#
# Vercel caps a deployment at 2048 routes ("too_many_routes"). The 2026-09-14 10:23
# production build reached 2061 and failed; the 2026-09-03 build failed at 2051.
# Nothing in the repo counted routes, so the wave found out from Vercel, after the merge.
#
# What counts (calibrated on two real builds, 2047 and 2061):
#   • every dynamic page/API file — a page.tsx or route.ts whose path has a [segment] — costs 2
#   • every next.config redirects() / rewrites() / headers() entry costs 1
#   • the framework adds a fixed ~50 (filesystem, _next/data, error handlers …)
# Middleware redirects (lib/auth/legacy-redirects.ts) cost nothing — put path redirects there.
#
# Rule (Director 2026-09-14): a PR fails only when the estimate is over the gate AND the PR
# made it worse than its base. A PR that adds no routes passes even while the repo is over
# the gate, so the families being folded do not block unrelated work; a PR that adds a
# dynamic route while over the gate is blocked until space is freed.
#
# Usage: bash scripts/ci/check-route-budget.sh [BASE_REF] [LIMIT]
#   BASE_REF  a git ref to compare against (CI passes origin/<base>); omit for a plain count
#   LIMIT     default 2000; Vercel's hard cap is 2048
set -euo pipefail
BASE="${1:-}"; LIMIT="${2:-2000}"; CAP=2048; FRAMEWORK=50
cd "$(git rev-parse --show-toplevel)"

estimate() {  # $1 = git ref ("" = working tree) → prints "est dyn cfg"
  local ref="$1" dyn cfg
  if [ -z "$ref" ]; then
    dyn=$(git ls-files -- app | grep -E '/(page\.tsx|route\.ts)$' | grep -c '\[' || true)
    cfg=$(awk '/async (redirects|rewrites|headers)\(\)/{on=1} on && /^[[:space:]]*source:/{n++} END{print n+0}' next.config.ts)
  else
    dyn=$(git ls-tree -r --name-only "$ref" -- app | grep -E '/(page\.tsx|route\.ts)$' | grep -c '\[' || true)
    cfg=$(git show "$ref:next.config.ts" 2>/dev/null | awk '/async (redirects|rewrites|headers)\(\)/{on=1} on && /^[[:space:]]*source:/{n++} END{print n+0}')
  fi
  echo "$(( dyn*2 + cfg + FRAMEWORK )) $dyn $cfg"
}

read -r est dyn cfg < <(estimate "")
echo "route budget (this tree): dynamic files=$dyn (×2=$((dyn*2))) + next.config entries=$cfg + framework=$FRAMEWORK = ~$est of $CAP (gate at $LIMIT)"
base_est=""
if [ -n "$BASE" ] && git rev-parse -q --verify "$BASE^{commit}" >/dev/null 2>&1; then
  read -r base_est bdyn bcfg < <(estimate "$BASE")
  echo "route budget (base $BASE): dynamic files=$bdyn + next.config entries=$bcfg = ~$base_est"
fi

if [ "$est" -gt "$LIMIT" ] && { [ -z "$base_est" ] || [ "$est" -gt "$base_est" ]; }; then
  over=$(( est - LIMIT ))
  echo "::error::estimated $est routes is over the $LIMIT gate by $over${base_est:+ and this PR adds $(( est - base_est ))} (Vercel refuses the deploy at $CAP). Fold a [id] family into one [[...slug]] handler (frees 2 per file removed) or move next.config redirects/headers into middleware (lib/auth/legacy-redirects.ts)."
  exit 1
fi
[ "$est" -gt "$LIMIT" ] && echo "::warning::repo is over the $LIMIT gate but this PR does not add to it — passing; fold a route family soon."
echo "OK"

#!/usr/bin/env bash
# Vercel ignoreCommand — decide whether to skip this deploy.
#
# Replaces the previous `git diff HEAD^ HEAD` form, which only saw the latest
# commit's diff. When a docs-only commit landed on top of unbuilt code commits,
# `HEAD^ HEAD` exited 0 and Vercel skipped the build, leaving prior code stuck.
#
# Correct frame: compare against the last commit Vercel actually built. Vercel
# exposes this as $VERCEL_GIT_PREVIOUS_SHA. Three cases:
#   1. Unset (first deploy / fresh ref) → build (exit 1).
#   2. Set but missing from shallow clone → try to fetch; if that fails, build.
#   3. Set and present → run the diff with the same exclude paths as before.
#
# Vercel exit-code semantics:
#   exit 0 = SKIP build
#   exit 1 = RUN  build
# Any unexpected error path falls through to "RUN build" (fail-open).

set -u

if [ -z "${VERCEL_GIT_PREVIOUS_SHA:-}" ]; then
  echo "[vercel-ignore] VERCEL_GIT_PREVIOUS_SHA unset — building (first deploy or fresh ref)."
  exit 1
fi

if ! git cat-file -e "$VERCEL_GIT_PREVIOUS_SHA" 2>/dev/null; then
  echo "[vercel-ignore] $VERCEL_GIT_PREVIOUS_SHA not in shallow clone — fetching..."
  if ! git fetch --depth=1 origin "$VERCEL_GIT_PREVIOUS_SHA" 2>&1; then
    echo "[vercel-ignore] Fetch failed — building (fail-open)."
    exit 1
  fi
fi

if git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- . \
  ':(exclude)supabase' \
  ':(exclude)docs' \
  ':(exclude)specs' \
  ':(exclude).claude' \
  ':(exclude).github' \
  ':(exclude)*.md'; then
  echo "[vercel-ignore] Only skip-eligible paths changed since $VERCEL_GIT_PREVIOUS_SHA — skipping build."
  exit 0
fi

echo "[vercel-ignore] Source-relevant changes since $VERCEL_GIT_PREVIOUS_SHA — building."
exit 1

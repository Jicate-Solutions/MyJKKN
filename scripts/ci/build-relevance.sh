#!/usr/bin/env bash
#
# scripts/ci/build-relevance.sh
#
# Answers one question for .github/workflows/production-build.yml: can this
# pull request's diff change the output of `next build`? When nothing it
# touches is readable by the build, the workflow skips a ~6 minute compile.
#
# ─── WHY THIS IS A SCRIPT AND NOT FOUR LINES INLINE IN THE WORKFLOW ──────────
#
# Because the inline version shipped a false green, and an inline version can
# be tested only by a human retyping it. Its first form was:
#
#     git diff --name-only --diff-filter=AM "$BASE"..."$HEAD"
#
# `AM` is Added + Modified. Deleted and Renamed files were invisible to it, so
# a PR that ONLY deletes source files produced an empty list, took the
# "nothing build-relevant changed" branch, never installed Node, never
# compiled — and reported SUCCESS, while printing "This PR touches no file
# that `next build` reads".
#
# Not hypothetical. Merged commit b30ea61049e4b7ab6de1858121b22b3837a723a2
# (PR #3295, "reclaim 36 routes of Vercel headroom") deletes 23
# `app/api/**/route.ts` files and changes nothing else:
#
#     $ git diff --name-status b30ea61049^...b30ea61049 | cut -c1 | sort | uniq -c
#          23 D
#
# Under the `AM` filter that PR scored count=0. Deleting a route is exactly the
# class this gate exists to compile: it moves `gen:routes`,
# `check:reachability` and the route manifest, all of which `npm run build`
# re-runs before `next build` is even reached.
#
# The filter lives here so scripts/ci/build-relevance.test.sh exercises the
# SAME code CI runs, byte for byte.
#
# ─── THE TWO FLAG DECISIONS, AND WHY NEITHER IS OPTIONAL ─────────────────────
#
# 1. NO `--diff-filter` AT ALL. Any allow-list of status letters is a list
#    somebody can under-fill, which is how `AM` happened. Every status git can
#    report (A, D, M, T, …) means the tree changed, and a changed tree is the
#    whole question. There is no letter worth excluding.
#
# 2. `--no-renames`, which is NOT redundant with (1). Rename detection is ON by
#    default (diff.renames, git >= 2.9) and for a rename `--name-only` prints
#    ONLY THE NEW PATH. So dropping `--diff-filter` on its own leaves a second
#    hole, measured:
#
#        $ git mv lib/helper.ts docs/helper.md
#        rename detection on  ->  docs/helper.md                 -> count=0  (skip!)
#        --no-renames         ->  docs/helper.md + lib/helper.ts -> count=1  (build)
#
#    Moving a source file out to a denied path breaks every importer, yet with
#    rename detection on it reads as a docs change. `--no-renames` reports a
#    rename the honest way — a delete plus an add — so BOTH sides are judged.
#
# Usage:
#   build-relevance.sh changed  <base-sha> <head-sha>   # every changed path
#   build-relevance.sh relevant <base-sha> <head-sha>   # the build-relevant subset
#
# Both modes print paths to stdout, one per line, and exit 0 whether or not
# anything matches. The CALLER decides what an empty list means — deciding it
# by exit code here would make "nothing relevant changed" indistinguishable
# from "the diff command failed", and this gate has already been burned once by
# a silent empty result.

set -euo pipefail

mode="${1:-}"
base="${2:-}"
head="${3:-}"

if [ -z "$mode" ] || [ -z "$base" ] || [ -z "$head" ]; then
  echo "usage: $0 <changed|relevant> <base-sha> <head-sha>" >&2
  exit 2
fi

# Paths that provably cannot affect `next build`. Everything else does —
# including .github/workflows, so a change to the gate itself builds and tests
# itself rather than shipping unexercised.
IRRELEVANT='(^docs/|^specs/|^supabase/|^artifacts/|^\.claude/|^\.screenshots/|\.md$|\.sql$)'

changed_paths() {
  # `...` (symmetric difference from the merge base) is what a PR diff means;
  # it needs full history, which the workflow gets via fetch-depth: 0.
  git diff --name-only --no-renames "${base}...${head}"
}

case "$mode" in
  changed)
    changed_paths
    ;;
  relevant)
    all="$(changed_paths)"
    # An empty diff must stay empty. `printf '%s\n' ""` emits ONE BLANK LINE,
    # and a blank line does not match the deny pattern, so piping it through
    # `grep -v` would report one "relevant" file for a PR that changed nothing.
    [ -n "$all" ] || exit 0
    # grep exits 1 when every line is filtered out. That is the docs-only case,
    # not an error, so it is swallowed here and nowhere wider.
    printf '%s\n' "$all" | { grep -vE "$IRRELEVANT" || true; }
    ;;
  *)
    echo "unknown mode: $mode (expected 'changed' or 'relevant')" >&2
    exit 2
    ;;
esac

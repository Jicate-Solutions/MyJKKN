#!/usr/bin/env bash
#
# scripts/ci/check-migration-version-cross-pr.sh
#
# CI guard, part two: a PR may not claim a migration version that another OPEN
# pull request is also claiming, or that a file already on the base branch holds.
#
# ─── WHY THIS EXISTS SEPARATELY FROM check-migration-version-collision.mjs ────
#
# The sibling guard (scripts/ci/check-migration-version-collision.mjs) is
# git-only: it compares the files THIS PR adds against the base branch tip. Its
# own header states the hole plainly and says it cannot close it:
#
#     "Two PRs open at the same time, each adding the same brand-new version,
#      both pass — neither branch contains the other's file and neither is on
#      main yet."
#
# That hole is not theoretical. Measured on this repository 2026-08-11, with
# the sibling guard green on every one of them:
#
#     20260810120000  claimed by #2959 (rebuild_attendance_student_ids_prefilter)
#                         and by #2961 (events_registrations_unique_per_form)
#                         and ALREADY ON MAIN
#                             (20260810120000_backfill_leadership_schedules_and_types.sql)
#     20260810130000  claimed by #2961 (event_form_manage_allow_creator)
#                         and ALREADY ON MAIN
#                             (20260810130000_google_connection_calendar_list_scope.sql)
#     20260817000000  claimed by #2936 (attendance_roster_provisional_freshers)
#                         and by #2945 (dashboard_counters_drop_acknowledgment_gate)
#
# ─── WHAT A DUPLICATE VERSION ACTUALLY COSTS ─────────────────────────────────
#
# `supabase_migrations.schema_migrations` keys on `version` ALONE — that column
# is the PRIMARY KEY. Two files sharing a version collapse to ONE ledger row.
# One of the two ends up with no record of having been applied and is skipped
# forever by any ledger-driven apply. There is no error to find afterwards;
# there is only a missing object, discovered weeks later.
#
# It has already happened on main. Version 20260816040000 is carried by BOTH
# `20260816040000_notification_expiry_director_categories.sql` (which owns the
# ledger row) and `20260816040000_fix_bds_deluxe_rule_semester_four_year.sql`
# (which now has no record of its own). Both were hand-applied, so nothing
# broke — that time.
#
# ─── FAIL OPEN, ON PURPOSE, AND LOUDLY ───────────────────────────────────────
#
# This guard needs the GitHub API to see sibling PRs, and an API that is down
# must NOT red a build. Two reasons, and they are not "APIs are flaky":
#
#   1. The hard, deterministic half of the guarantee does not live here. A
#      version already claimed on the base branch is caught by the git-only
#      sibling guard, which has no network dependency and fails CLOSED. Only
#      the EXTRA cross-PR sweep degrades when the API is unavailable.
#   2. A fail-closed cross-PR gate is non-deterministic by construction: its
#      verdict depends on what other people happen to have open at that
#      instant. Re-running the same commit could flip it. Blocking a merge on
#      that is the worst class of CI flake.
#
# But failing open is exactly how a guard becomes decorative, so the skip path
# is deliberately incapable of looking like a pass:
#
#   · It NEVER prints "no collisions". It prints "the cross-PR sweep did not
#     run" and says why.
#   · It emits ::warning::, which is visible in the checks UI, not a silent 0.
#   · An enumeration that returns ZERO open pull requests is treated as a
#     FAILED SWEEP, not as a clean repo. On this repository there are always
#     dozens open; zero means the query broke. This is a direct answer to a
#     real incident here — a sweep that silently collected zero rows and
#     cheerfully reported "no collisions".
#   · The success path always states its sample size ("swept N open PRs, M
#     carrying migrations"). A vacuous pass is then visible in the log rather
#     than indistinguishable from a real one.
#
# ─── WHAT COUNTS AS "CLAIMING" A VERSION ─────────────────────────────────────
#
# Identical rules to the sibling guard, so the two cannot disagree:
#
#   · Migrations are TOP-LEVEL supabase/migrations/*.sql only. `supabase db
#     push` never reads nested directories, so supabase/migrations/admission/*
#     is not a migration and must not be version-checked.
#   · The version is the filename token before the FIRST underscore — which is
#     what the Supabase CLI keys on — NOT the leading 14 digits. 444 live files
#     use the short `YYYYMMDD_` form and a couple carry a lettered suffix
#     (`...000008a_`). Read the sibling guard's header before changing this.
#   · claimed = versions(files added) MINUS versions(files removed). That
#     subtraction is what keeps a legitimate RENAME from being reported here:
#     renaming `V_old_name.sql` to `V_better_name.sql` adds and removes the
#     same version V, so V is not claimed and no finding is raised. Renames of
#     already-applied migrations are a different concern with its own gate
#     (.github/workflows/migration-rename-applied.yml) and are not duplicated
#     here.
#   · The same add-minus-remove rule is applied to every OTHER open PR, so a
#     sibling that merely renames a file is not reported as claiming its
#     version either.
#   · A PR is never compared against itself.
#
# The base-branch half of the report overlaps with the sibling guard by design.
# It is cheap (a git ls-tree, no network) and it means an author sees the whole
# picture in one message — "version X is on main AND #2959 wants it too" —
# instead of piecing it together from two separate red checks.
#
# ─── USAGE ───────────────────────────────────────────────────────────────────
#
#   # CI (versions come from the checked-out tree vs the base branch)
#   PR_NUMBER=123 scripts/ci/check-migration-version-cross-pr.sh --base origin/main
#
#   # Locally, reproduce CI's verdict for any open PR without checking it out.
#   # --as-pr takes the PR's claimed versions from the API instead of from the
#   # working tree, and excludes that PR from the sweep.
#   scripts/ci/check-migration-version-cross-pr.sh --as-pr 2959
#
#   # Tests: stand in for the GitHub API and the base branch entirely.
#   scripts/ci/check-migration-version-cross-pr.sh --fixture fx.txt --as-pr 1
#
# Requires `gh` (authenticated) and `awk`. Both are present on ubuntu-latest.
# `--fixture` needs neither `gh` nor a git repository.
#
# FIXTURE FORMAT — one record per line, whitespace-separated, '#' comments:
#
#     apifail                          the simulated API is unreachable
#     pr <number>                      start a PR record
#     file <status> <path> [<prev>]    a changed file on the most recent `pr`
#     base <path>                      a file already on the base branch
#
# Deliberately NOT JSON, unlike the sibling guard's fixture: parsing JSON from
# bash would mean adding a `jq` dependency to a CI guard purely to make it
# testable, and a guard should not grow a runtime dependency for the benefit of
# its own tests.
#
# Sibling of scripts/ci/check-migration-version-collision.mjs. Wired as its OWN
# job in .github/workflows/migration-version-collision.yml so it reports as its
# own status check and cannot change the pass/fail meaning of the existing one.

# NOTE: deliberately no `set -e`. Every failure path is handled explicitly so
# that an API outage degrades to a warning instead of aborting mid-script.
set -uo pipefail

MIG_PREFIX='supabase/migrations/'
REPO_SLUG="${GITHUB_REPOSITORY:-Jicate-Solutions/MyJKKN}"
PR_NUMBER="${PR_NUMBER:-}"
BASE_REF="${BASE_REF:-}"
AS_PR=""
FIXTURE=""
TAB="$(printf '\t')"

while [ $# -gt 0 ]; do
  case "$1" in
    --repo)    REPO_SLUG="$2"; shift 2 ;;
    --base)    BASE_REF="$2";  shift 2 ;;
    --pr)      PR_NUMBER="$2"; shift 2 ;;
    --as-pr)   AS_PR="$2"; PR_NUMBER="$2"; shift 2 ;;
    --fixture) FIXTURE="$2"; shift 2 ;;
    *) echo "::error::check-migration-version-cross-pr.sh: unknown argument '$1'"; exit 2 ;;
  esac
done

if [ -n "$FIXTURE" ] && [ ! -r "$FIXTURE" ]; then
  echo "::error::fixture '$FIXTURE' is not readable"; exit 2
fi
# A fixture carrying `apifail` stands in for a GitHub outage.
FIXTURE_API_DOWN=0
if [ -n "$FIXTURE" ] && grep -qE '^[[:space:]]*apifail[[:space:]]*$' "$FIXTURE"; then
  FIXTURE_API_DOWN=1
fi

tmp="$(mktemp -d)" || { echo "::warning::Could not create a temp dir; the cross-PR migration-version sweep did not run."; exit 0; }
trap 'rm -rf "$tmp"' EXIT

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

# stdin: arbitrary paths.
# stdout: "<version><TAB><path>" for top-level supabase/migrations/*.sql only.
# The version is the basename token before the FIRST underscore — what the
# Supabase CLI keys schema_migrations.version on. NOT the leading 14 digits.
version_table() {
  awk -v pre="$MIG_PREFIX" '
    index($0, pre) != 1 { next }                         # must be under the dir
    { rest = substr($0, length(pre) + 1) }
    rest ~ /\//        { next }                          # nested dirs are not migrations
    rest !~ /\.sql$/   { next }
    {
      b = substr(rest, 1, length(rest) - 4)              # strip ".sql"
      i = index(b, "_")
      v = (i > 0) ? substr(b, 1, i - 1) : b
      print v "\t" $0
    }'
}

# Resolve a usable base ref, preferring the canonical production remote. A
# stale base silently yields zero added migrations, i.e. a FALSE PASS — same
# reasoning as the sibling guard's defaultBaseRef().
resolve_base() {
  local cand
  for cand in "$BASE_REF" jicate/main origin/main main; do
    [ -z "$cand" ] && continue
    if git rev-parse --verify --quiet "$cand" >/dev/null 2>&1; then
      printf '%s\n' "$cand"
      return 0
    fi
  done
  return 1
}

# $1 = PR number -> "status<TAB>filename<TAB>previous_filename" lines.
# Non-zero on failure. The fixture branch stands in for the whole API.
pr_changed_files() {
  local n="$1"
  if [ -n "$FIXTURE" ]; then
    [ "$FIXTURE_API_DOWN" -eq 1 ] && return 1
    awk -v want="$n" '
      /^[[:space:]]*#/            { next }
      $1 == "pr"                  { cur = $2; next }
      $1 == "file" && cur == want { print $2 "\t" $3 "\t" ($4 == "" ? "-" : $4) }
    ' "$FIXTURE"
    return 0
  fi
  gh api "repos/${REPO_SLUG}/pulls/${n}/files" --paginate \
     --jq '.[] | [.status, .filename, (.previous_filename // "-")] | @tsv' \
     </dev/null 2>/dev/null
}

# -> "number<TAB>touches-migrations" lines for every OPEN pull request.
# Non-zero on failure.
list_open_prs() {
  if [ -n "$FIXTURE" ]; then
    [ "$FIXTURE_API_DOWN" -eq 1 ] && return 1
    awk -v pre="$MIG_PREFIX" '
      /^[[:space:]]*#/ { next }
      $1 == "pr" {
        if (cur != "") print cur "\t" (t ? "true" : "false")
        cur = $2; t = 0; next
      }
      $1 == "file" && index($3, pre) == 1 { t = 1 }
      END { if (cur != "") print cur "\t" (t ? "true" : "false") }
    ' "$FIXTURE"
    return 0
  fi
  # One GraphQL sweep to find which open PRs touch supabase/migrations/ at all —
  # cheap, two requests — then one precise REST call per such PR, because only
  # REST exposes `previous_filename` and therefore lets a rename be told apart
  # from a fresh claim. A PR whose file list is TRUNCATED by GraphQL (>100
  # files) is marked as touching migrations so it is never skipped on a
  # technicality.
  #
  # shellcheck disable=SC2016  # $owner/$repo/$endCursor are GraphQL variables,
  # not shell variables — they MUST reach the server unexpanded, so the single
  # quotes are load-bearing.
  gh api graphql --paginate \
    -F owner="${REPO_SLUG%%/*}" -F repo="${REPO_SLUG##*/}" \
    -f query='
      query($owner:String!, $repo:String!, $endCursor:String) {
        repository(owner:$owner, name:$repo) {
          pullRequests(states:OPEN, first:50, after:$endCursor) {
            pageInfo { hasNextPage endCursor }
            nodes {
              number
              files(first:100) {
                pageInfo { hasNextPage }
                nodes { path }
              }
            }
          }
        }
      }' \
    --jq '.data.repository.pullRequests.nodes[]
          | [ .number,
              ( ( [ .files.nodes[].path | select(startswith("supabase/migrations/")) ] | length > 0 )
                or .files.pageInfo.hasNextPage )
            ] | @tsv' \
    </dev/null 2>/dev/null
}

# -> every migration path on the base branch.
base_branch_files() {
  if [ -n "$FIXTURE" ]; then
    awk '/^[[:space:]]*#/ { next } $1 == "base" { print $2 }' "$FIXTURE"
    return 0
  fi
  git ls-tree -r --name-only "$base" -- "$MIG_PREFIX" 2>/dev/null
}

# $1 = PR number.
# Writes that PR's claimed versions (added minus removed), one per line, to
# stdout, and leaves the raw added/removed path lists in $tmp/pr_add /
# $tmp/pr_del. Returns non-zero if the file list could not be read.
#
# `renamed` feeds BOTH sides — it claims the new path and releases the old one
# — so a rename that keeps its version nets out to no claim at all.
pr_claimed_versions() {
  local n="$1" raw rc
  raw="$(pr_changed_files "$n")"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    return 1
  fi

  : > "$tmp/pr_add"
  : > "$tmp/pr_del"
  printf '%s\n' "$raw" | while IFS="$TAB" read -r status filename prev; do
    [ -z "${status:-}" ] && continue
    case "$status" in
      added|copied) printf '%s\n' "$filename" >> "$tmp/pr_add" ;;
      removed)      printf '%s\n' "$filename" >> "$tmp/pr_del" ;;
      renamed)      printf '%s\n' "$filename" >> "$tmp/pr_add"
                    printf '%s\n' "$prev"     >> "$tmp/pr_del" ;;
      *) : ;;  # modified / changed / unchanged: the file already existed
    esac
  done

  version_table < "$tmp/pr_add" | cut -f1 | sort -u > "$tmp/pr_addv"
  version_table < "$tmp/pr_del" | cut -f1 | sort -u > "$tmp/pr_delv"
  comm -23 "$tmp/pr_addv" "$tmp/pr_delv"
  return 0
}

# --------------------------------------------------------------------------
# Step 1 — what versions does THIS pull request claim?
# --------------------------------------------------------------------------

if [ -n "$FIXTURE" ]; then
  base="${BASE_REF:-main}"   # fixture mode never touches git
else
  base="$(resolve_base)"
  if [ -z "${base:-}" ]; then
    echo "::warning::No usable base ref (tried '${BASE_REF:-}', jicate/main, origin/main, main). The cross-PR migration-version sweep did not run."
    exit 0
  fi
fi

: > "$tmp/claimed"
: > "$tmp/self_removed"

if [ -n "$AS_PR" ]; then
  if ! pr_claimed_versions "$AS_PR" > "$tmp/claimed"; then
    echo "::warning::Could not read the file list of PR #${AS_PR} from the GitHub API. The cross-PR migration-version sweep did not run."
    exit 0
  fi
  cat "$tmp/pr_del" > "$tmp/self_removed"
  echo "::notice::Reproducing the cross-PR verdict for PR #${AS_PR} — claimed versions read from the API, not from the working tree."
else
  merge_base="$(git merge-base "$base" HEAD 2>/dev/null)"
  [ -z "$merge_base" ] && merge_base="$base"

  git ls-files "$MIG_PREFIX" 2>/dev/null | version_table | cut -f2 | sort -u > "$tmp/head_files"
  git ls-tree -r --name-only "$merge_base" -- "$MIG_PREFIX" 2>/dev/null | version_table | cut -f2 | sort -u > "$tmp/mb_files"

  comm -23 "$tmp/head_files" "$tmp/mb_files" > "$tmp/added_files"
  comm -13 "$tmp/head_files" "$tmp/mb_files" > "$tmp/self_removed"

  version_table < "$tmp/added_files"  | cut -f1 | sort -u > "$tmp/addv"
  version_table < "$tmp/self_removed" | cut -f1 | sort -u > "$tmp/delv"
  comm -23 "$tmp/addv" "$tmp/delv" > "$tmp/claimed"
fi

sort -u "$tmp/self_removed" -o "$tmp/self_removed"

claimed_count="$(grep -c . < "$tmp/claimed")"
if [ "$claimed_count" -eq 0 ]; then
  echo "::notice::This PR claims no new migration version — nothing for the cross-PR sweep to compare. (A rename that keeps its version is subtracted here on purpose; it is covered by the 'No rename of an already-applied migration' gate.)"
  exit 0
fi

echo "This PR claims ${claimed_count} migration version(s): $(tr '\n' ' ' < "$tmp/claimed")"

# --------------------------------------------------------------------------
# Step 2 — versions already held by a file on the base branch (git only, no API).
# --------------------------------------------------------------------------

# A file this PR DELETES is not a collision partner — it will not exist post-merge.
base_branch_files | sort -u > "$tmp/base_all"
comm -23 "$tmp/base_all" "$tmp/self_removed" | version_table > "$tmp/base_table"

awk -F"$TAB" 'NR==FNR { want[$0]=1; next } ($1 in want)' \
    "$tmp/claimed" "$tmp/base_table" > "$tmp/base_hits"

# --------------------------------------------------------------------------
# Step 3 — versions claimed by ANOTHER open pull request (needs the API).
# --------------------------------------------------------------------------

SWEEP_OK=1
SWEEP_NOTE=""
: > "$tmp/pr_hits"
open_total=0
migration_prs=0

gql_out="$(list_open_prs)"
gql_rc=$?

if [ "$gql_rc" -ne 0 ] || [ -z "$gql_out" ]; then
  SWEEP_OK=0
  SWEEP_NOTE="the GitHub API call that enumerates open pull requests failed or returned nothing"
else
  printf '%s\n' "$gql_out" | grep -c . > "$tmp/opencount"
  open_total="$(cat "$tmp/opencount")"
  printf '%s\n' "$gql_out" > "$tmp/open_prs"

  # A repository with ZERO open pull requests is not a clean repository here —
  # it is a broken query. Treat it as a failed sweep, never as a pass.
  if [ "$open_total" -eq 0 ]; then
    SWEEP_OK=0
    SWEEP_NOTE="the open-pull-request enumeration returned zero rows, which is implausible for this repository and means the query did not work"
  else
    while IFS="$TAB" read -r num touches; do
      [ -z "${num:-}" ] && continue
      [ "${touches:-}" != "true" ] && continue
      [ -n "$PR_NUMBER" ] && [ "$num" = "$PR_NUMBER" ] && continue   # never flag a PR against itself
      migration_prs=$((migration_prs + 1))
      if ! pr_claimed_versions "$num" > "$tmp/otherv"; then
        SWEEP_OK=0
        SWEEP_NOTE="the file list of open PR #${num} could not be read"
        break
      fi
      awk -F"$TAB" -v pr="$num" 'NR==FNR { want[$0]=1; next } ($0 in want) { print $0 "\t" pr }' \
          "$tmp/claimed" "$tmp/otherv" >> "$tmp/pr_hits"
    done < "$tmp/open_prs"
  fi
fi

# --------------------------------------------------------------------------
# Step 4 — report.
# --------------------------------------------------------------------------

base_hit_count="$(grep -c . < "$tmp/base_hits")"
pr_hit_count="$(grep -c . < "$tmp/pr_hits")"

if [ "$base_hit_count" -eq 0 ] && [ "$pr_hit_count" -eq 0 ]; then
  if [ "$SWEEP_OK" -eq 1 ]; then
    echo "::notice::Migration version cross-PR sweep passed — swept ${open_total} open pull request(s), ${migration_prs} of which carry migrations. None claims a version this PR claims, and none of this PR's versions is held on ${base}."
    exit 0
  fi
  echo "::warning::The cross-PR migration-version sweep did NOT run — ${SWEEP_NOTE}. This is NOT a statement that no collision exists; nothing was compared against sibling pull requests. The git-only sibling guard (job 'No new duplicate migration versions') still ran and still fails closed. Before merging, check by hand that no other open PR adds a file named $(head -1 "$tmp/claimed")_*.sql."
  exit 0
fi

echo ""
echo "::error::Migration version collision across pull requests. supabase_migrations.schema_migrations keys on 'version' ALONE — that column is the PRIMARY KEY — so two files sharing a version collapse to ONE ledger row and one of them is recorded as already applied and never runs. Silently."
echo ""

while IFS="$TAB" read -r v n; do
  [ -z "${v:-}" ] && continue
  echo "::error::Version ${v} is ALSO claimed by open pull request #${n} (https://github.com/${REPO_SLUG}/pull/${n}). Whichever of the two merges second loses its migration. One of you must renumber before either merges."
done < "$tmp/pr_hits"

while IFS="$TAB" read -r v p; do
  [ -z "${v:-}" ] && continue
  echo "::error::Version ${v} is ALREADY held on ${base} by ${p}. Your file cannot get its own ledger row; renumber it."
done < "$tmp/base_hits"

echo ""
echo "How to fix: pick a version that no file on ${base} and no open pull request holds, rename your migration to it, then update supabase/SQL_FILE_INDEX.md and any comment naming the old path. Do NOT just add one to the number you were given — that is exactly how these collisions were produced, four PRs at a time, each independently computing \"one tick after the newest version on main\"."
echo "Reproduce this locally for any open PR, without checking it out:  scripts/ci/check-migration-version-cross-pr.sh --as-pr <number>"

if [ "$SWEEP_OK" -eq 0 ]; then
  echo "::warning::The cross-PR sweep ALSO did not complete — ${SWEEP_NOTE}. There may be further collisions beyond the ones listed above."
fi

exit 1

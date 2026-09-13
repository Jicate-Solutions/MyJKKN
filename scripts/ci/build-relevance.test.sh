#!/usr/bin/env bash
#
# scripts/ci/build-relevance.test.sh
#
# Tests scripts/ci/build-relevance.sh, the build-relevance filter behind
# .github/workflows/production-build.yml.
#
# ─── WHY THE FIXTURE LIST LOOKS THE WAY IT DOES ──────────────────────────────
#
# The filter's first version WAS tested, with two fixtures: "docs-only -> 0"
# and "mixed code -> 3". Both were Added/Modified files, and the filter said
# `--diff-filter=AM`. The tests therefore exercised only paths that already
# passed, and the gate shipped blind to deletions and renames — the two
# statuses a build most needs to see, because deleting or moving a route
# changes `gen:routes`, `check:reachability` and the route manifest.
#
# So the rule this file encodes: every fixture below that ends in "-> BUILD"
# must be a case the OLD filter got WRONG. A fixture set that only proves the
# happy path is how the first one passed while the gate was broken.
#
# Pure bash + git, no npm install: the thing under test is a git invocation.

set -uo pipefail   # deliberately NOT -e: every case runs, then one verdict.

FILTER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/build-relevance.sh"
[ -x "$FILTER" ] || { echo "FATAL: $FILTER is missing or not executable"; exit 1; }

pass=0
fail=0

# count <base> <head>  -> number of build-relevant paths
count() { "$FILTER" relevant "$1" "$2" | grep -c . || true; }

assert() { # assert <description> <expected> <actual>
  if [ "$2" = "$3" ]; then
    printf '  ok    %-58s count=%s\n' "$1" "$3"
    pass=$((pass + 1))
  else
    printf '  FAIL  %-58s expected=%s actual=%s\n' "$1" "$2" "$3"
    fail=$((fail + 1))
  fi
}

repo="$(mktemp -d)"
trap 'chmod -R u+w "$repo" 2>/dev/null; /bin/rm -rf "$repo"' EXIT
cd "$repo"

git init -q .
git config user.email ci@test.local
git config user.name  ci-test
git config commit.gpgsign false

# ── baseline tree ────────────────────────────────────────────────────────────
mkdir -p app/api/keep app/api/doomed app/api/mover lib docs supabase/migrations
echo 'export const GET = () => new Response()' > app/api/keep/route.ts
echo 'export const GET = () => new Response()' > app/api/doomed/route.ts
echo 'export const GET = () => new Response()' > app/api/mover/route.ts
echo 'export const helper = 1'                 > lib/helper.ts
echo 'export const leaving = 1'                > lib/leaving.ts
echo '# doc'                                   > docs/guide.md
echo '# doc'                                   > docs/other.md
echo 'select 1;'                               > supabase/migrations/0001_x.sql
git add -A && git commit -qm baseline
BASE="$(git rev-parse HEAD)"

branch() { git checkout -q -b "$1" "$BASE"; }

echo "build-relevance filter"
echo

# ── 1. docs-only add/modify -> SKIP  (the original passing fixture, kept) ────
branch f-docs
echo 'more' >> docs/guide.md
echo '# new' > docs/added.md
git add -A && git commit -qm "docs only"
assert "docs-only add+modify                       -> skip" 0 "$(count "$BASE" HEAD)"

# ── 2. mixed code add/modify -> BUILD  (original passing fixture, kept) ──────
branch f-mixed
echo '// touched' >> app/api/keep/route.ts
echo 'export const fresh = 1' > lib/fresh.ts
echo 'more' >> docs/guide.md
git add -A && git commit -qm "mixed"
assert "code add+modify alongside docs             -> build" 2 "$(count "$BASE" HEAD)"

# ── 3. DELETION-ONLY of source files -> BUILD ────────────────────────────────
#    The defect. Old filter (--diff-filter=AM) scored this 0 and reported a
#    green "Production Build" that never compiled. Mirrors merged PR #3295,
#    which deleted 23 app/api/**/route.ts files and nothing else.
branch f-delete
git rm -q app/api/doomed/route.ts lib/leaving.ts
git commit -qm "delete source only"
assert "DELETION-ONLY of source files              -> build" 2 "$(count "$BASE" HEAD)"

# ── 4. RENAME of a source file -> BUILD ──────────────────────────────────────
#    Old filter scored 0: a rename is status R, which AM excludes.
branch f-rename
mkdir -p app/api/renamed
git mv app/api/mover/route.ts app/api/renamed/route.ts
git commit -qm "rename a route"
assert "RENAME source -> source (both sides seen)  -> build" 2 "$(count "$BASE" HEAD)"

# ── 5. RENAME of a source file OUT to a denied path -> BUILD ─────────────────
#    The second, subtler hole: dropping --diff-filter is NOT sufficient here.
#    With git's default rename detection --name-only prints only the NEW path
#    (docs/helper.md), which the deny-list eats, so the count is still 0 and a
#    change that breaks every importer of lib/helper.ts skips the build.
#    Only --no-renames surfaces the old path. If this case ever regresses to 0,
#    someone removed --no-renames.
branch f-rename-out
git mv lib/helper.ts docs/helper.md
git commit -qm "move a source file out to docs"
assert "RENAME source -> denied path (old side)    -> build" 1 "$(count "$BASE" HEAD)"

# ── 6. TYPECHANGE (file becomes a symlink) -> BUILD ──────────────────────────
#    Status T. Another letter an allow-list would have to remember; omitting
#    --diff-filter entirely is what covers it.
branch f-typechange
/bin/rm -f lib/fresh2.ts
git rm -q --cached lib/helper.ts 2>/dev/null || true
git checkout -q "$BASE" -- lib/helper.ts 2>/dev/null || true
/bin/rm -f lib/helper.ts
ln -s ../docs/guide.md lib/helper.ts
git add -A && git commit -qm "turn a source file into a symlink"
assert "TYPECHANGE source file -> symlink          -> build" 1 "$(count "$BASE" HEAD)"

# ── 7. deletion of docs/SQL only -> SKIP (the fix must not over-trigger) ─────
#    A fix that simply always builds would pass cases 3-6 and be useless.
branch f-delete-docs
git rm -q docs/other.md supabase/migrations/0001_x.sql
git commit -qm "delete docs and sql"
assert "DELETION-ONLY of docs + sql                -> skip" 0 "$(count "$BASE" HEAD)"

# ── 8. empty diff -> SKIP ────────────────────────────────────────────────────
#    Guards the blank-line trap: `printf '%s\n' ""` emits one empty line, and
#    an empty line does not match the deny pattern, so a careless pipeline
#    reports count=1 for a PR that changed nothing.
branch f-empty
git commit -q --allow-empty -m "no file changes"
assert "empty diff                                 -> skip" 0 "$(count "$BASE" HEAD)"

echo
if [ "$fail" -gt 0 ]; then
  echo "FAILED: $fail of $((pass + fail)) cases"
  exit 1
fi
echo "PASSED: $pass of $pass cases"

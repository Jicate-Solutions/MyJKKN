#!/bin/bash
# rebase-remaining.sh — after a merge, bring the OTHER approved PRs up to date so more than
# one can land per round.
#
# Why (Director 2026-09-05 23:40): every migration PR also appends a row to
# supabase/SQL_FILE_INDEX.md, a hand-edited ledger. The moment one of them merges, every
# sibling turns CONFLICTING on that one file — so the wave could land exactly ONE index PR per
# round, and seven approved PRs meant seven rounds (over an hour). Tonight it was worse:
# GitHub's cached verdict stayed CONFLICTING even when git merged the branch cleanly.
#
# This stage runs right after a merge pass: for each approved-but-not-merged PR it merges
# current main into the branch. The index file is resolved by UNION — both sides kept, every
# entry survives, never a dropped row (the ledger is append-only by rule). Any conflict outside
# that file is NOT touched: the branch is left alone for a helper tab and its author.
#
# It never merges a PR, never pushes to main, never force-pushes: the push is a plain
# fast-forward of the PR branch (a merge commit on top of its own head), so it fails safely
# if the author pushed in the meantime. Sourced by ship-wave.sh; defines
#   rebase_remaining <run-dir> "<merged_list>"   → 0 if at least one branch was updated, 1 if none

rebase_remaining() {
  local run="$1" merged_list="$2" updated=0 n br wt conf cands
  cands=$(APPROVE_NORMAL="${APPROVE_NORMAL:-}" APPROVE_HELD="${APPROVE_HELD:-}" MERGED="$merged_list" python3 - "$run/plan.json" <<'PY'
import json, os, sys
p = json.load(open(sys.argv[1]))
merged  = {int(x.lstrip('#')) for x in os.environ["MERGED"].split() if x.lstrip('#').isdigit()}
held_ok = {int(x) for x in os.environ["APPROVE_HELD"].replace(',', ' ').split() if x.isdigit()}
# ready AND conflicted: a PR an EARLIER round left DIRTY is exactly the one that needs bringing up to date
pool = p["ready"]["LOW"] + p["ready"]["NORMAL"] + p["ready"]["HELD"] + p.get("conflicted", [])
rows = [r for r in pool if r.get("tier") == "LOW"]
if os.environ["APPROVE_NORMAL"]: rows += [r for r in pool if r.get("tier") == "NORMAL"]
rows += [r for r in pool if r.get("tier") == "HELD" and r["number"] in held_ok]
seen = set()
for r in rows:
    if r["number"] in merged or r["number"] in seen or not r.get("branch"): continue
    seen.add(r["number"]); print(r["number"], r["branch"])
PY
)
  [ -n "$cands" ] || { say "  nothing to bring up to date — no approved PR is waiting behind a merge"; return 1; }
  say "  bringing the remaining approved PRs up to date with main (SQL_FILE_INDEX.md: both sides kept):"
  git -C "$LOCAL" fetch jicate main -q 2>/dev/null
  while read -r n br; do
    [ -n "$n" ] || continue
    wt="$run/rebase-$n"
    git -C "$LOCAL" fetch jicate "$br" -q 2>/dev/null || { say "    #$n — cannot fetch $br, skipped"; continue; }
    # detached: never collides with a helper tab that has the branch checked out somewhere
    git -C "$LOCAL" worktree add -q --detach "$wt" "jicate/$br" 2>/dev/null || { say "    #$n — cannot create a worktree, skipped"; continue; }
    if ! git -C "$wt" merge --no-commit --no-ff jicate/main >/dev/null 2>&1; then
      conf=$(git -C "$wt" diff --name-only --diff-filter=U)
      if [ "$conf" = "supabase/SQL_FILE_INDEX.md" ]; then
        # three-way union: ours (branch) · base · theirs (main). No base = both sides added the file.
        git -C "$wt" show :1:supabase/SQL_FILE_INDEX.md > "$wt/.idx.base" 2>/dev/null || : > "$wt/.idx.base"
        git -C "$wt" show :2:supabase/SQL_FILE_INDEX.md > "$wt/.idx.ours"
        git -C "$wt" show :3:supabase/SQL_FILE_INDEX.md > "$wt/.idx.theirs"
        git merge-file -p --union "$wt/.idx.ours" "$wt/.idx.base" "$wt/.idx.theirs" > "$wt/supabase/SQL_FILE_INDEX.md"
        rm -f "$wt/.idx.base" "$wt/.idx.ours" "$wt/.idx.theirs"
        git -C "$wt" add supabase/SQL_FILE_INDEX.md
      else
        git -C "$wt" merge --abort >/dev/null 2>&1
        say "    #$n — real conflict outside the index ($(printf '%s' "$conf" | tr '\n' ' ' | cut -c1-90)) → left for a helper tab"
        git -C "$LOCAL" worktree remove --force "$wt" >/dev/null 2>&1; continue
      fi
    fi
    if git -C "$wt" diff --cached --quiet 2>/dev/null; then
      say "    #$n — already up to date with main"
      git -C "$wt" merge --abort >/dev/null 2>&1; git -C "$LOCAL" worktree remove --force "$wt" >/dev/null 2>&1; continue
    fi
    if git -C "$wt" -c user.name="W12 ship wave" -c user.email="w12-ship-wave@jkkn.ai" commit -q \
         -m "Merge main into $br (W12: bring the approved PR up to date after a sibling merge; SQL_FILE_INDEX.md kept both sides)" \
       && git -C "$wt" push -q jicate "HEAD:refs/heads/$br" 2>"$run/rebase-$n.err"; then
      say "    #$n — updated and pushed ($br)"; updated=$((updated+1))
    else
      say "    #$n — push refused (author pushed meanwhile?): $(head -c 160 "$run/rebase-$n.err" 2>/dev/null)"
    fi
    git -C "$LOCAL" worktree remove --force "$wt" >/dev/null 2>&1
  done <<<"$cands"
  if [ "$updated" -gt 0 ]; then
    say "  $updated PR(s) brought up to date — GitHub re-checks them now; one more merge pass"
    sleep 20; return 0
  fi
  return 1
}

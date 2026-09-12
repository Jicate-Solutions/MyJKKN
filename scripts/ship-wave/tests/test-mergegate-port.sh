#!/opt/homebrew/bin/bash
# tests/test-mergegate-port.sh — regression proof for the five merge-gate fixes the EXECUTING copy of the wave has run since
# 2026-09-11 (MyJKKN-wt-ship-policy; it merged 8 approved PRs and applied 8 migrations with them), ported into this branch:
#   (a) merge_one: "OPEN UNSTABLE false main" whose ONLY red checks are named in $STATE/advisory-checks reads as CLEAN
#   (b) merge_one: the second red/pending count honours the same advisory list
#   (c) merge_one: the once-per-round SQL_FILE_INDEX.md quota is charged only AFTER a merge succeeded
#   (d) merge_tiers: "not in this run's ready-HELD list" is printed only for a PR that is not in that list
#   (e) top level: a pruned $WT jicate/main mirror is rebuilt before anything reads it
#
# Run from the worktree root:  bash scripts/ship-wave/tests/test-mergegate-port.sh
# Same harness shape as test-freeze-classes.sh: a copy of ship-wave.sh without its trailing dispatcher is SOURCED, so
# merge_one / merge_tiers / the top-level mirror check are the real code. gh / curl are shell functions that record every
# call; jicate/main and the ship-main mirror are real git repos in a temp dir. Every case runs under its own temp HOME —
# the live ~/.config/obsidian/.ship-wave is never touched. PASS/FAIL per case; exit 1 on any FAIL.
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"

ROOT=$(cd "$(dirname "$0")/../../.." && pwd); SW="$ROOT/scripts/ship-wave"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-mergegate.XXXXXX")
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf 'FAIL  %s\n      %s\n' "$1" "${2:-}"; }
check() { if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1" "$3"; fi; }
has()    { grep -qF -- "$2" "$1"; }
hasnot() { ! grep -qF -- "$2" "$1"; }

awk '/^if \[ -n "\$GOAL" \]; then$/ {exit} {print}' "$SW/ship-wave.sh" > "$TMP/wave.sh"
for f in "$SW"/*.sh "$SW"/*.py; do [ "$(basename "$f")" = ship-wave.sh ] || ln -s "$f" "$TMP/$(basename "$f")"; done
grep -q '^run_once() {' "$TMP/wave.sh" || { echo "FAIL  could not extract run_once from ship-wave.sh"; exit 1; }

export MYJKKN_LOCAL="$TMP/local"; WTDIR="$MYJKKN_LOCAL/.claude/worktrees/ship-main"
git init -q --bare "$TMP/origin.git"; mkdir -p "$(dirname "$WTDIR")"
git clone -q -o jicate "$TMP/origin.git" "$WTDIR" 2>/dev/null
gitc() { git -C "$WTDIR" -c user.name=t -c user.email=t@t "$@"; }
mkdir -p "$WTDIR/docs"; echo "# 0" > "$WTDIR/docs/zero.md"; gitc add -A >/dev/null; gitc commit -q -m genesis; gitc push -q jicate HEAD:main 2>/dev/null
SHA0=$(gitc rev-parse HEAD)

# plan fixture: $1 = out · $2 = JSON list of [number, tier, [files]] rows (all READY, green, quiet)
mk_plan() {
  ROWS="$2" python3 - "$1" <<'PY'
import json, os, sys
ready = {"LOW": [], "NORMAL": [], "HELD": []}
for n, t, files in json.loads(os.environ["ROWS"]):
    ready[t].append({"number": n, "title": f"pr {n}", "branch": f"b{n}", "tier": t,
                     "tier_reasons": (["migration: x"] if t == "HELD" else []), "ci": "OK", "ci_names": [],
                     "state": "CLEAN", "files": files, "age_min": 90, "base": "main"})
k = sum(len(v) for v in ready.values())
json.dump({"stacked": [], "draft": [], "conflicted": [], "blocked": [], "waiting_ci": [], "quiet_wait": [], "ready": ready, "clusters": {},
           "counts": {"open": k, "ready": k, "ready_low": len(ready["LOW"]), "ready_normal": len(ready["NORMAL"]), "ready_held": len(ready["HELD"]),
                      "conflicted": 0, "blocked": 0, "waiting_ci": 0, "quiet_wait": 0, "draft": 0, "stacked": 0, "clusters": 0}},
          open(sys.argv[1], "w"))
PY
}

# scenario <name> <rows-json> <advisory-checks content|"-" for no file> <approve-held content|""> <args…>
# per-PR behaviour via env: ST_<n> = the state line gh answers (default "OPEN CLEAN false main"), RED_<n> = red check names
scenario() {
  local name="$1" rows="$2" adv="$3" held="$4"; shift 4
  local S="$TMP/$name"; mkdir -p "$S/home/.config/obsidian/.ship-wave"
  local ST="$S/home/.config/obsidian/.ship-wave"
  [ "$adv" = "-" ] || printf '%s\n' "$adv" > "$ST/advisory-checks"
  [ -n "$held" ] && printf '%s\n' "$held" > "$ST/approve-held"
  mk_plan "$S/plan.json" "$rows"
  (
    export HOME="$S/home"; cd "$ROOT" || exit 9
    TRACE="$S/trace.txt"; : > "$TRACE"; export TRACE FIXPLAN="$S/plan.json" WTDIR
    set -- "$@"
    . "$TMP/wave.sh" >/dev/null 2>&1
    sweep() { cp "$FIXPLAN" "$1/plan.json"; }
    unblock_lanes() { :; }; dispatch_clusters() { :; }; alive_helpers() { printf 0; }; rebase_remaining() { return 0; }
    apply_migrations() { APPLY_RESULT="stubbed"; return 0; }
    vtok() { printf ''; }; sleep() { :; }; ask_director() { :; }
    gh() {
      echo "gh $*" >> "$TRACE"
      local v
      case "$*" in
        "auth token"|"auth status") return 0;;
        *"--json state,mergeStateStatus"*) v="ST_$3"; echo "${!v:-OPEN CLEAN false main}";;
        *"--json statusCheckRollup"*) v="RED_$3"; [ -n "${!v:-}" ] && printf '%s\n' "${!v}";;
        "pr merge "*) git -C "$WTDIR" -c user.name=t -c user.email=t@t commit -q --allow-empty -m "merged (#$3)" && git -C "$WTDIR" push -q jicate HEAD:main 2>/dev/null; return 0;;
        *"--json mergeCommit"*) :;;
        *"--json files"*) echo "docs/p$3.md";;
        *"--json headRefOid"*) echo "abcdef1234567890";;
        *"pr list"*) echo 0;;
      esac; return 0
    }
    curl() { echo "curl $*" >> "$TRACE"; case "$*" in *"-o /dev/null"*) echo 401;; *) echo '{}';; esac; return 0; }
    _REDIR_DONE=1
    run_once > "$S/receipt.txt" 2>&1; echo "rc=$?" >> "$TRACE"
  )
}
merged() { grep -c "^gh pr merge $2 " "$TMP/$1/trace.txt"; }

ADV="SDK multi-agent review"
echo "── (b) the merge-time red/pending count honours \$STATE/advisory-checks ──"
RED_2="$ADV" scenario b1 '[[2,"NORMAL",["app/x.ts"]]]' "$ADV" "" go --approve-normal
check "b1 NORMAL #2 red ONLY on an advisory check → merged" $([ "$(merged b1 2)" -eq 1 ] && has "$TMP/b1/receipt.txt" "MERGED NORMAL #2"; echo $?) "$(grep -E '#2' "$TMP/b1/receipt.txt")"
RED_2="$(printf '%s\n%s' "$ADV" "Build")" scenario b2 '[[2,"NORMAL",["app/x.ts"]]]' "$ADV" "" go --approve-normal
check "b2 #2 red on an advisory check AND 'Build' → HOLD, 1 non-advisory check counted" $([ "$(merged b2 2)" -eq 0 ] && has "$TMP/b2/receipt.txt" "HOLD   NORMAL #2 — 1 non-advisory check(s) failing/pending at merge time"; echo $?) "$(grep -E '#2' "$TMP/b2/receipt.txt")"
RED_2="$ADV" scenario b3 '[[2,"NORMAL",["app/x.ts"]]]' "-" "" go --approve-normal
check "b3 CONTROL no advisory-checks file → the same red check is a gate → HOLD" $([ "$(merged b3 2)" -eq 0 ] && has "$TMP/b3/receipt.txt" "HOLD   NORMAL #2 — 1 non-advisory check(s)"; echo $?) "$(grep -E '#2' "$TMP/b3/receipt.txt")"
scenario b4 '[[2,"NORMAL",["app/x.ts"]]]' "$ADV" "" go --approve-normal
check "b4 CONTROL no red check at all → merged (an empty answer counts 0, never 1)" $([ "$(merged b4 2)" -eq 1 ]; echo $?) "$(grep -E '#2' "$TMP/b4/receipt.txt")"

echo "── (a) the live state re-check: UNSTABLE only on advisory checks reads as CLEAN ──"
ST_2="OPEN UNSTABLE false main" RED_2="$ADV" scenario a1 '[[2,"NORMAL",["app/x.ts"]]]' "$ADV" "" go --approve-normal
check "a1 UNSTABLE, red only on advisory → note printed and merged" $([ "$(merged a1 2)" -eq 1 ] && has "$TMP/a1/receipt.txt" "UNSTABLE only on advisory checks (advice, not a gate) — merging"; echo $?) "$(grep -E '#2' "$TMP/a1/receipt.txt")"
ST_2="OPEN UNSTABLE false main" RED_2="Build" scenario a2 '[[2,"NORMAL",["app/x.ts"]]]' "$ADV" "" go --approve-normal
check "a2 UNSTABLE on a non-advisory check → HOLD, state named" $([ "$(merged a2 2)" -eq 0 ] && has "$TMP/a2/receipt.txt" "state now 'OPEN UNSTABLE false main'"; echo $?) "$(grep -E '#2' "$TMP/a2/receipt.txt")"

echo "── (c) the SQL_FILE_INDEX.md quota is charged only after MERGED ──"
IDX='"supabase/SQL_FILE_INDEX.md"'
ST_5="OPEN DIRTY false main" scenario c1 "[[5,\"NORMAL\",[$IDX]],[6,\"NORMAL\",[$IDX]]]" "-" "" go --approve-normal
check "c1 CONTROL index PR #5 refused on its state (before the index check) → index PR #6 merges" $([ "$(merged c1 5)" -eq 0 ] && [ "$(merged c1 6)" -eq 1 ] && hasnot "$TMP/c1/receipt.txt" "HOLD   NORMAL #6 — touches SQL_FILE_INDEX.md"; echo $?) "$(grep -E '#5|#6' "$TMP/c1/receipt.txt")"
RED_5="Build" scenario c2 "[[5,\"NORMAL\",[$IDX]],[6,\"NORMAL\",[$IDX]]]" "-" "" go --approve-normal
check "c2 index PR #5 refused on a red check → #6 merges" $([ "$(merged c2 5)" -eq 0 ] && [ "$(merged c2 6)" -eq 1 ]; echo $?) "$(grep -E '#5|#6' "$TMP/c2/receipt.txt")"
scenario c3 "[[5,\"NORMAL\",[$IDX]],[6,\"NORMAL\",[$IDX]]]" "-" "" go --approve-normal
check "c3 CONTROL both index PRs clean → #5 merges and #6 is held in that pass (one index PR per pass)" $([ "$(merged c3 5)" -eq 1 ] && has "$TMP/c3/receipt.txt" "HOLD   NORMAL #6 — touches SQL_FILE_INDEX.md and one index PR already merged this round"; echo $?) "$(grep -E '#5|#6' "$TMP/c3/receipt.txt")"

echo "── (d) 'not in this run's ready-HELD list' only for a PR outside that list ──"
ST_3="OPEN DIRTY false main" scenario d1 '[[3,"HELD",["supabase/migrations/1_t.sql"]]]' "-" "3" go
check "d1 approved HELD #3 IS ready but its state changed → HOLD with the state, no 'not in … list' line" $([ "$(merged d1 3)" -eq 0 ] && has "$TMP/d1/receipt.txt" "HOLD   HELD #3 — state now 'OPEN DIRTY false main'" && hasnot "$TMP/d1/receipt.txt" "HELD #3 — not in this run's ready-HELD list"; echo $?) "$(grep -E 'HELD' "$TMP/d1/receipt.txt")"
scenario d2 '[[3,"HELD",["supabase/migrations/1_t.sql"]]]' "-" "99" go
check "d2 approved #99 is not a ready HELD PR → 'not in this run's ready-HELD list, refusing'" $(has "$TMP/d2/receipt.txt" "HOLD   HELD #99 — not in this run's ready-HELD list, refusing"; echo $?) "$(grep -E 'HELD' "$TMP/d2/receipt.txt")"

echo "── (e) a pruned jicate/main mirror is rebuilt before anything reads it ──"
# a LOCAL checkout that knows jicate/main, and NO ship-main worktree under it (what the 16:49 prune left behind)
HEAL="$TMP/heal"; git clone -q -o jicate "$TMP/origin.git" "$HEAL" 2>/dev/null
( export HOME="$TMP/e1home" MYJKKN_LOCAL="$HEAL"; mkdir -p "$HOME"; cd "$ROOT" || exit 9; set -- --ledger; . "$TMP/wave.sh" >"$TMP/e1.out" 2>&1 )
EW="$HEAL/.claude/worktrees/ship-main"
check "e1 missing mirror → rebuilt as a git worktree of LOCAL" $([ -f "$EW/.git" ] && git -C "$HEAL" worktree list | grep -qF "$(cd "$EW" && pwd -P)"; echo $?) "$(ls -la "$EW" 2>&1 | head -3; cat "$TMP/e1.out")"
check "e1 … detached at jicate/main" $([ "$(git -C "$EW" rev-parse HEAD 2>/dev/null)" = "$(git -C "$HEAL" rev-parse jicate/main)" ]; echo $?) "HEAD=$(git -C "$EW" rev-parse HEAD 2>&1) main=$(git -C "$HEAL" rev-parse jicate/main)"
( export HOME="$TMP/e2home" MYJKKN_LOCAL="$HEAL" GTRACE="$TMP/e2.git"; mkdir -p "$HOME"; : > "$GTRACE"; cd "$ROOT" || exit 9
  git() { echo "git $*" >> "$GTRACE"; command git "$@"; }
  set -- --ledger; . "$TMP/wave.sh" >/dev/null 2>&1 )
check "e2 CONTROL mirror present → no worktree prune/add at all" $(! grep -qE 'worktree (prune|add)' "$TMP/e2.git"; echo $?) "$(cat "$TMP/e2.git")"
( export HOME="$TMP/e3home" MYJKKN_LOCAL="$TMP/not-a-repo"; mkdir -p "$HOME" "$MYJKKN_LOCAL"; cd "$ROOT" || exit 9; set -- --ledger; . "$TMP/wave.sh" >"$TMP/e3.out" 2>&1 ); echo "rc=$?" >> "$TMP/e3.out"
check "e3 LOCAL is not a repo → one warning on stderr, the script carries on (--ledger still exits 0)" $(has "$TMP/e3.out" "warn: could not rebuild the jicate/main mirror" && has "$TMP/e3.out" "rc=0"; echo $?) "$(cat "$TMP/e3.out")"

echo "── syntax ──"
for f in "$SW/ship-wave.sh" "$0"; do /opt/homebrew/bin/bash -n "$f" && ok "bash -n $(basename "$f")" || bad "bash -n $(basename "$f")"; done
echo; echo "=== $PASS passed · $FAIL failed · fixtures in $TMP ==="
[ "$PASS" -gt 0 ] && [ "$FAIL" -eq 0 ]

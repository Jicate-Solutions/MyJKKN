#!/opt/homebrew/bin/bash
# tests/test-deploy-pending-apply-fail.sh — regression proof for wave bug (f), found 2026-09-11:
#   a round whose migration step fails (apply_ok=0) never appended its merged files to $STATE/deploy-pending. A later batch
#   holding only database files then read as "migration/docs-only — nothing to deploy", so those merges' CODE never went live.
#   Fixed: whenever this round merged something and the apply failed, its merged files join deploy-pending before the
#   deploy step decides not to deploy.
#
# Run from the worktree root:  bash scripts/ship-wave/tests/test-deploy-pending-apply-fail.sh
# Same harness as test-freeze-classes.sh: a copy of ship-wave.sh without its trailing dispatcher is SOURCED (the deploy
# stage is the real code); sweep / apply_migrations / gh / curl are recording stubs; jicate/main is a temp git repo.
# Every case has its own temp HOME — nothing live is touched. PASS/FAIL per case; exit 1 on any FAIL.
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"

ROOT=$(cd "$(dirname "$0")/../../.." && pwd); SW="$ROOT/scripts/ship-wave"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-pending.XXXXXX")
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf 'FAIL  %s\n      %s\n' "$1" "${2:-}"; }
check() { if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1" "$3"; fi; }
has()    { grep -qF -- "$2" "$1"; }
posts()  { grep -c 'curl -s -X POST' "$1"; }

awk '/^if \[ -n "\$GOAL" \]; then$/ {exit} {print}' "$SW/ship-wave.sh" > "$TMP/wave.sh"
for f in "$SW"/*.sh "$SW"/*.py; do [ "$(basename "$f")" = ship-wave.sh ] || ln -s "$f" "$TMP/$(basename "$f")"; done
grep -q '^run_once() {' "$TMP/wave.sh" || { echo "FAIL  could not extract run_once from ship-wave.sh"; exit 1; }

export MYJKKN_LOCAL="$TMP/local"; WTDIR="$MYJKKN_LOCAL/.claude/worktrees/ship-main"
git init -q --bare "$TMP/origin.git"; mkdir -p "$(dirname "$WTDIR")"
git clone -q -o jicate "$TMP/origin.git" "$WTDIR" 2>/dev/null
gitc() { git -C "$WTDIR" -c user.name=t -c user.email=t@t "$@"; }
mkdir -p "$WTDIR/docs"; echo "# 0" > "$WTDIR/docs/zero.md"; gitc add -A >/dev/null; gitc commit -q -m genesis; gitc push -q jicate HEAD:main 2>/dev/null

# plan with ONE ready PR: #2 NORMAL (code) or #4 HELD (a migration only)
mk_plan() {  # $1 = out $2 = 2|4
  python3 - "$1" "$2" <<'PY'
import json, sys
n = int(sys.argv[2])
row = {"number": n, "title": f"pr {n}", "branch": f"b{n}", "tier": "NORMAL" if n == 2 else "HELD",
       "tier_reasons": [] if n == 2 else ["migration: supabase/migrations/20260911100000_t.sql"], "ci": "OK", "ci_names": [],
       "state": "CLEAN", "files": [], "age_min": 90, "base": "main"}
ready = {"LOW": [], "NORMAL": [row] if n == 2 else [], "HELD": [row] if n == 4 else []}
json.dump({"stacked": [], "draft": [], "conflicted": [], "blocked": [], "waiting_ci": [], "quiet_wait": [], "ready": ready, "clusters": {},
           "counts": {"open": 1, "ready": 1, "ready_low": 0, "ready_normal": len(ready["NORMAL"]), "ready_held": len(ready["HELD"]),
                      "conflicted": 0, "blocked": 0, "waiting_ci": 0, "quiet_wait": 0, "draft": 0, "stacked": 0, "clusters": 0}},
          open(sys.argv[1], "w"))
PY
}

# round <home> <label> <pr 2|4> <apply rc> [FINAL] -- <wave args…>: one run_once in <home> (state persists across calls)
round() {
  local H="$1" label="$2" pr="$3" arc="$4" final="$5"; shift 5
  mkdir -p "$H/.config/obsidian/.ship-wave"; mk_plan "$H/plan-$label.json" "$pr"
  (
    export HOME="$H"; cd "$ROOT" || exit 9
    TRACE="$H/trace-$label.txt"; : > "$TRACE"; export TRACE FIXPLAN="$H/plan-$label.json" WTDIR APPLY_RC="$arc"
    set -- "$@"
    . "$TMP/wave.sh" >/dev/null 2>&1
    sweep() { cp "$FIXPLAN" "$1/plan.json"; }
    unblock_lanes() { :; }; dispatch_clusters() { :; }; alive_helpers() { printf 0; }; rebase_remaining() { return 0; }
    # a failed apply in real life also freezes HARD; the Director lifts that stop before the next run merges. The stub
    # returns the failure only — the rounds below model the run AFTER the lift.
    apply_migrations() { echo "APPLY_CALLED rc=$APPLY_RC $(tr '\n' ' ' < "$1")" >> "$TRACE"; APPLY_RESULT="stub rc=$APPLY_RC"; return "$APPLY_RC"; }
    vtok() { printf ''; }; sleep() { :; }; ask_director() { :; }
    gh() {
      echo "gh $*" >> "$TRACE"
      case "$*" in
        "auth token"|"auth status") return 0;;
        *"--json state,mergeStateStatus"*) echo "OPEN CLEAN false main";;
        *"--json statusCheckRollup"*) :;;
        "pr merge "*) git -C "$WTDIR" -c user.name=t -c user.email=t@t commit -q --allow-empty -m "merged (#$3)" && git -C "$WTDIR" push -q jicate HEAD:main 2>/dev/null; return 0;;
        *"--json mergeCommit"*) :;;
        *"--json files"*) case "$3" in 2) echo "app/api/x/route.ts";; 4) printf '%s\n' supabase/migrations/20260911100000_t.sql supabase/SQL_FILE_INDEX.md;; esac;;
        *"--json headRefOid"*) echo "abcdef1234567890";;
        *"pr list"*) echo 0;;
      esac; return 0
    }
    curl() { echo "curl $*" >> "$TRACE"; case "$*" in *"-X POST"*) echo '{"job":{"id":"job-1"}}';; *"-o /dev/null"*) echo 401;; *) echo '{}';; esac; return 0; }
    _REDIR_DONE=1
    [ "$final" = FINAL ] && FINAL_DEPLOY=1
    run_once > "$H/receipt-$label.txt" 2>&1; echo "rc=$?" >> "$TRACE"
  )
}
pend() { cat "$1/.config/obsidian/.ship-wave/deploy-pending" 2>/dev/null; }

echo "── goal run: round 1 merges CODE and its apply fails → the code joins deploy-pending ──"
G="$TMP/goal"
round "$G" r1 2 1 "" go --goal --approve-normal
check "f1 apply failed → receipt says NOT deploying (unchanged behaviour)" $(has "$G/receipt-r1.txt" "NOT deploying — migration step failed"; echo $?) "$(grep -E 'deploy|migration' "$G/receipt-r1.txt")"
check "f2 … and #2's code file is in deploy-pending, so a later build carries it" $(pend "$G" | grep -qx 'app/api/x/route.ts'; echo $?) "deploy-pending: $(pend "$G" | tr '\n' ' ')"
round "$G" r2 4 0 "" go --goal --approve-held 4
check "f3 round 2 merges a DATABASE-ONLY PR, apply ok → deferred, deploy-pending now holds both rounds" $(pend "$G" | grep -qx 'app/api/x/route.ts' && pend "$G" | grep -qx 'supabase/migrations/20260911100000_t.sql'; echo $?) "deploy-pending: $(pend "$G" | tr '\n' ' ')"
round "$G" final 4 0 FINAL go --goal
check "f4 the end-of-run build FIRES (the batch is not docs-only: round 1's code is in it)" $([ "$(posts "$G/trace-final.txt")" -eq 1 ] && ! has "$G/receipt-final.txt" "nothing to deploy (migration/docs-only"; echo $?) "$(grep -E 'deploy|hook' "$G/receipt-final.txt")"

echo "── plain go: the same failure keeps the code for the next build too ──"
P="$TMP/plain"
round "$P" r1 2 1 "" go --approve-normal
check "f5 plain go, apply failed → code file kept in deploy-pending" $(pend "$P" | grep -qx 'app/api/x/route.ts'; echo $?) "deploy-pending: $(pend "$P" | tr '\n' ' '); $(grep -E 'deploy' "$P/receipt-r1.txt")"
round "$P" r2 4 0 "" go --approve-held 4
check "f6 next plain go merges a database-only PR → the leftover batch is flushed WITH it and the hook fires" $([ "$(posts "$P/trace-r2.txt")" -eq 1 ] && has "$P/.config/obsidian/v5-deploy-fires.tsv" "+earlier-batch" && ! has "$P/receipt-r2.txt" "nothing to deploy (migration/docs-only"; echo $?) "$(grep -E 'deploy|hook|batch' "$P/receipt-r2.txt"; cat "$P/.config/obsidian/v5-deploy-fires.tsv" 2>&1)"

echo "── controls ──"
C="$TMP/ctl"
round "$C" r1 2 0 "" go --goal --approve-normal
check "c1 CONTROL goal round, apply ok → the file is deferred ONCE (no double append)" $([ "$(pend "$C" | grep -cx 'app/api/x/route.ts')" -eq 1 ]; echo $?) "deploy-pending: $(pend "$C" | tr '\n' ' ')"
N="$TMP/none"
round "$N" r1 4 1 "" go --goal
check "c2 CONTROL nothing merged this round (HELD #4 not approved) → deploy-pending not created" $([ -z "$(pend "$N")" ]; echo $?) "deploy-pending: $(pend "$N" | tr '\n' ' ')"

echo "── syntax ──"
for f in "$SW/ship-wave.sh" "$0"; do /opt/homebrew/bin/bash -n "$f" && ok "bash -n $(basename "$f")" || bad "bash -n $(basename "$f")"; done
echo; echo "=== $PASS passed · $FAIL failed · fixtures in $TMP ==="
[ "$PASS" -gt 0 ] && [ "$FAIL" -eq 0 ]

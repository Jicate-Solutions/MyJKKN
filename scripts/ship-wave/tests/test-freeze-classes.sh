#!/opt/homebrew/bin/bash
# tests/test-freeze-classes.sh — proof for HUMAN-IN-THE-LOOP.md §B (freeze classes) and §C (ship while stopped),
# plus the regression cases for the three breaks the adversarial verifier found on 2026-09-10 (D2, F3, H1) and the
# spec gaps it listed (ledger_class as the freeze key, --freeze entry point, merge-commit hand merges, soft-row anchors,
# the deploy-pending receipt line at the end of a hard-frozen goal run).
#
# Run from the worktree root:  bash scripts/ship-wave/tests/test-freeze-classes.sh
# Prints PASS/FAIL per case, exits non-zero on any FAIL. Nothing reaches the network: gh / curl are shell
# functions that record every call in a trace file, Vercel answers from a canned JSON, and jicate/main is a
# real git repo in a temp dir (the hand-merge, main-ahead and "is this sha on main" logic reads git for real).
# $STATE is a temp HOME — the live ~/.config/obsidian/.ship-wave is never touched.
#
# HOW run_once IS DRIVEN — honestly: a copy of ship-wave.sh with its final dispatch block removed is SOURCED,
# so classify_freeze / freeze / freeze_class_now / deploy_allowed / merge_one / merge_tiers / the 3b-4-5 gates /
# the HTML report are the real code. Stubbed at the boundary only: sweep (writes a fixture plan.json), unblock_lanes,
# dispatch_clusters, alive_helpers, rebase_remaining, apply_migrations (records what it was handed), vtok, sleep.
# The `gh pr merge` stub PUSHES a commit "… (#n)" to the fixture main — a merge moves main in reality too, and
# without that the "production already runs main HEAD → no build" rule would zero every merge round in the harness.
# The curl stub answers the Vercel deployments query with $DJSON before the hook fires and $AFTER once a POST was
# seen (AFTER=auto → READY with meta.githubCommitSha = the fixture main HEAD, which is what a real build reports).
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"   # unblock-lanes.sh uses declare -A

ROOT=$(cd "$(dirname "$0")/../../.." && pwd); SW="$ROOT/scripts/ship-wave"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-freeze-test.XXXXXX")
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf 'FAIL  %s\n      %s\n' "$1" "${2:-}"; }
check() { # $1=name $2=condition-result(0/1) $3=detail
  if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1" "$3"; fi; }
has()    { grep -qF -- "$2" "$1"; }          # file has literal text
hasnot() { ! grep -qF -- "$2" "$1"; }
posts()  { grep -c 'curl -s -X POST' "$1"; } # how many times the deploy hook was fired

# ── the sourceable copy: everything except the trailing "if GOAL … run_once" dispatcher ──────────────
awk '/^if \[ -n "\$GOAL" \]; then$/ {exit} {print}' "$SW/ship-wave.sh" > "$TMP/wave.sh"
awk '/^if \[ -n "\$GOAL" \]; then$/ {p=1} p {print}' "$SW/ship-wave.sh" > "$TMP/goal-block.sh"   # the dispatcher alone, for (D2-final)
# the copy resolves its siblings from its own dirname — link the REAL failure-ledger / policy-learning /
# apply-migrations / rebase-remaining / unblock-lanes next to it so they are sourced, not silently skipped
for f in "$SW"/*.sh "$SW"/*.py; do [ "$(basename "$f")" = ship-wave.sh ] || ln -s "$f" "$TMP/$(basename "$f")"; done
grep -q '^run_once() {' "$TMP/wave.sh" || { echo "FAIL  could not extract run_once from ship-wave.sh"; exit 1; }
grep -q 'FINAL_DEPLOY=1; run_once' "$TMP/goal-block.sh" || { echo "FAIL  could not extract the goal block from ship-wave.sh"; exit 1; }

# ── git fixture: a bare "jicate" remote + the wave's ship-main worktree cloned from it ─────────────────
export MYJKKN_LOCAL="$TMP/local"; WTDIR="$MYJKKN_LOCAL/.claude/worktrees/ship-main"
git init -q --bare "$TMP/origin.git"; mkdir -p "$(dirname "$WTDIR")"
git clone -q -o jicate "$TMP/origin.git" "$WTDIR" 2>/dev/null
gitc() { git -C "$WTDIR" -c user.name=t -c user.email=t@t "$@"; }
mkdir -p "$WTDIR/app/api/x" "$WTDIR/docs"
echo "# 0" > "$WTDIR/docs/zero.md"; gitc add -A >/dev/null; gitc commit -q -m "genesis"; gitc push -q jicate HEAD:main 2>/dev/null
SHA_GENESIS=$(gitc rev-parse HEAD)
echo "export {}" > "$WTDIR/app/api/x/route.ts"; echo "# a" > "$WTDIR/docs/a.md"
gitc add -A >/dev/null; gitc commit -q -m "base"; gitc push -q jicate HEAD:main 2>/dev/null
SHA0=$(gitc rev-parse HEAD)
main_head() { git -C "$WTDIR" fetch jicate main -q 2>/dev/null; git -C "$WTDIR" rev-parse jicate/main; }
ready_at() { printf '{"deployments":[{"uid":"dpl_%s","readyState":"READY","meta":{"githubCommitSha":"%s"}}]}' "${2:-1}" "$1"; }

# ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────
mk_plan() {  # $1 = out file $2 = "low normal held" flags (1/0 each) → a plan.json in the classifier's shape
  python3 - "$1" $2 <<'PY'
import json,sys
out=sys.argv[1]; low,normal,held=(sys.argv[2]=="1"),(sys.argv[3]=="1"),(sys.argv[4]=="1")
def row(n,t,title,files,why): return {"number":n,"title":title,"branch":f"b{n}","tier":t,"tier_reasons":why,"ci":"OK","ci_names":[],"state":"CLEAN","files":files,"age_min":90,"base":"main"}
ready={"LOW":[],"NORMAL":[],"HELD":[]}
if low: ready["LOW"].append(row(1,"LOW","docs: readme",["docs/a.md"],["docs/types/tests only"]))
if normal: ready["NORMAL"].append(row(2,"NORMAL","feat: api x",["app/api/x/route.ts"],[]))
if held:
    ready["HELD"].append(row(3,"HELD","feat: fee ledger",["app/api/fees/route.ts"],["path: app/api/fees/route.ts"]))
    ready["HELD"].append(row(4,"HELD","feat: add table",["supabase/migrations/20260910100000_t.sql"],["migration: supabase/migrations/20260910100000_t.sql"]))
n=sum(len(v) for v in ready.values())
plan={"stacked":[],"draft":[],"conflicted":[],"blocked":[],"waiting_ci":[],"quiet_wait":[],"ready":ready,"clusters":{},
      "counts":{"open":n+2,"ready":n,"ready_low":len(ready["LOW"]),"ready_normal":len(ready["NORMAL"]),"ready_held":len(ready["HELD"]),
                "conflicted":0,"blocked":0,"waiting_ci":0,"quiet_wait":0,"draft":2,"stacked":0,"clusters":0}}
json.dump(plan,open(out,"w"))
PY
}

# ── one scenario = one subshell with its own HOME (→ its own $STATE), stubs, and a real run_once ─────
# usage: [PRE='shell run with $ST set'] [AFTER='<json>|auto'] scenario <name> <plan-flags> <freeze-line|""> <last-deployed-sha|""> <deploy-json> <approve-held-file-content> <args…>
scenario() {
  local name="$1" flags="$2" frozen_line="$3" lastdep="$4" djson="$5" held_file="$6"; shift 6
  local S="$TMP/$name"; mkdir -p "$S/home/.config/obsidian/.ship-wave"
  local ST="$S/home/.config/obsidian/.ship-wave"
  [ -n "$frozen_line" ] && printf '%b\n' "$frozen_line" > "$ST/FROZEN"
  [ -n "$lastdep" ] && printf '%s\n' "$lastdep" > "$ST/last-deployed"
  [ -n "$held_file" ] && printf '%s\n' "$held_file" > "$ST/approve-held"
  [ -n "${PRE:-}" ] && ( ST="$ST"; eval "$PRE" )
  mk_plan "$S/plan.json" "$flags"
  (
    export HOME="$S/home"; cd "$ROOT" || exit 9
    TRACE="$S/trace.txt"; : > "$TRACE"; export TRACE FIXPLAN="$S/plan.json" DJSON="$djson" DJSON_AFTER="${AFTER:-}" POSTED="$S/posted" WTDIR
    set -- "$@"
    # shellcheck disable=SC1090
    . "$TMP/wave.sh" >/dev/null 2>&1
    type -t ledger_on_freeze >/dev/null && type -t policy_active >/dev/null && type -t unblock_lanes >/dev/null || { echo "SIBLINGS_NOT_SOURCED" >> "$TRACE"; exit 9; }
    # ---- boundary stubs (the gates they guard are the real code) ----
    sweep() { cp "$FIXPLAN" "$1/plan.json"; }
    unblock_lanes() { echo "UNBLOCK_LANES_CALLED" >> "$TRACE"; }
    dispatch_clusters() { :; }; alive_helpers() { printf 0; }; rebase_remaining() { return 0; }
    apply_migrations() { echo "APPLY_CALLED $(tr '\n' ' ' < "$1")" >> "$TRACE"; APPLY_RESULT="stubbed"; return 0; }
    vtok() { printf 'tok'; }; sleep() { :; }
    gh() {
      echo "gh $*" >> "$TRACE"
      case "$*" in
        "auth token"|"auth status") return 0;;
        *"--json state,mergeStateStatus"*) echo "OPEN CLEAN false main";;
        *"--json statusCheckRollup"*) echo 0;;
        "pr merge "*) # a merge moves main: one squash commit "… (#n)" lands on the fixture remote
          git -C "$WTDIR" -c user.name=t -c user.email=t@t commit -q --allow-empty -m "merged by the wave (#$3)" && git -C "$WTDIR" push -q jicate HEAD:main 2>/dev/null; return 0;;
        *"--json files"*) case "$3" in 1) echo docs/a.md;; 2) echo app/api/x/route.ts;; 3) echo app/api/fees/route.ts;; 4) echo supabase/migrations/20260910100000_t.sql;; esac;;
        *"pr list"*) echo 4;;
      esac; return 0
    }
    curl() {
      echo "curl $*" >> "$TRACE"
      case "$*" in
        *"-X POST"*) : > "$POSTED"; echo '{"job":{"id":"job-1"}}';;
        *"v6/deployments"*)
          if [ -f "$POSTED" ] && [ -n "$DJSON_AFTER" ]; then
            if [ "$DJSON_AFTER" = auto ]; then printf '{"deployments":[{"uid":"dpl_new","readyState":"READY","meta":{"githubCommitSha":"%s"}}]}' "$(git -C "$WTDIR" rev-parse jicate/main)"
            else echo "$DJSON_AFTER"; fi
          else echo "$DJSON"; fi;;
        *"-o /dev/null"*) echo 401;;
      esac; return 0
    }
    ask_director() { printf 'ASK kind=%s class=%s title=%s\nASK-OPTS %s\n' "$1" "$2" "$3" "$5" >> "$TRACE"; }
    _REDIR_DONE=1
    run_once > "$S/receipt.txt" 2>&1; echo "rc=$?" >> "$TRACE"
    ls "$MYJKKN_LOCAL"/artifacts/ship-wave-*.html 2>/dev/null | tail -1 > "$S/html.path"
  )
}
marker() { cat "$TMP/$1/home/.config/obsidian/.ship-wave/last-deployed" 2>/dev/null; }

READY_UNKNOWN='{"deployments":[{"uid":"dpl_1","readyState":"READY","meta":{"githubCommitSha":"meta-sha-not-on-any-branch"}}]}'
READY_NOMETA='{"deployments":[{"uid":"dpl_2","readyState":"READY"}]}'
ERROR_JSON='{"deployments":[{"uid":"dpl_err","readyState":"ERROR","errorCode":"BUILD_FAILED"}]}'
T0=$(date -v-2M '+%F %T')   # a freeze that started two minutes ago (BSD date)

echo "── (1) soft freeze: LOW/NORMAL merge, HELD held, deploy + apply + sweep run; Vercel sha is the source of truth ──"
# Vercel's READY record = SHA0 (= main HEAD before this round's merges); the marker is stale on purpose (genesis)
AFTER=auto scenario s1 "1 1 1" "$T0\tmigration 20260908120000: 0 files on jicate/main match (need exactly 1)\tsoft" "$SHA_GENESIS" "$(ready_at "$SHA0")" "3" go --approve-normal
R="$TMP/s1/receipt.txt"; TR="$TMP/s1/trace.txt"; HEAD1=$(main_head)
check "1- harness: the real sibling files were sourced (ledger, policy, lanes)" $(hasnot "$TR" "SIBLINGS_NOT_SOURCED"; echo $?)
check "1a soft: LOW #1 merged (gh pr merge 1 in trace)"          $(has "$TR" "gh pr merge 1 "; echo $?)
check "1b soft: NORMAL #2 merged (--approve-normal honoured)"     $(has "$TR" "gh pr merge 2 "; echo $?)
check "1c soft: HELD #3 NOT merged although approved"            $(hasnot "$TR" "gh pr merge 3 "; echo $?)
check "1d soft: HELD #4 NOT merged"                              $(hasnot "$TR" "gh pr merge 4 "; echo $?)
check "1e soft: receipt says HELD held while stopped, approval kept" $(has "$R" "HELD: held while stopped (soft freeze)"; echo $?) "$(grep HELD "$R")"
check "1f soft: approve-held file still holds 3 (never a lost approval)" $(grep -qx 3 "$TMP/s1/home/.config/obsidian/.ship-wave/approve-held"; echo $?)
check "1g soft: unblock_lanes ran"                               $(has "$TR" "UNBLOCK_LANES_CALLED"; echo $?)
check "1h soft: apply step ran (apply_migrations handed this round's files)" $(has "$TR" "APPLY_CALLED"; echo $?)
check "1i soft: deploy hook fired exactly once"                  $([ "$(posts "$TR")" -eq 1 ]; echo $?) "$(posts "$TR") POSTs"
check "1j soft: last-deployed written from Vercel's post-build meta.githubCommitSha (= main HEAD after the merges)" $([ "$(marker s1)" = "$HEAD1" ] && [ "$HEAD1" != "$SHA0" ]; echo $?) "marker=$(marker s1) head=$HEAD1"
check "1k soft: banner says merging LOW/NORMAL, holding HELD"     $(has "$R" "FROZEN (soft) since:"; echo $?)
check "1l soft: scoreboard shows the class"                      $(has "$R" "frozen: soft (merging LOW/NORMAL, holding HELD)"; echo $?) "$(grep SCOREBOARD "$R")"
check "1m soft: sweep gate reached after READY (L2 probed the merged route)" $(has "$R" "L2 1 ok"; echo $?) "$(grep 'L2' "$R")"
check "1n soft: HTML banner carries the class"                   $(grep -qF "FROZEN (soft — merging LOW/NORMAL, holding HELD" "$(cat "$TMP/s1/html.path")"; echo $?)
check "1o soft: HELD question asked for #4 only (#3 is approved)" $(grep -q 'ASK kind=held class=held title=1 HELD PR ready for your OK: #4' "$TR"; echo $?) "$(grep ASK "$TR")"
check "1p H1: preflight rewrote the stale marker from Vercel's READY sha before comparing (Vercel primary, marker fallback)" $(grep -q "last-deployed ← ${SHA0:0:10}" "$R"; echo $?) "$(grep 'last-deployed' "$R")"

echo "── (2) hard freeze: no merge, no deploy, no lanes; one-line reason; HELD question still asked ──"
scenario s2 "1 1 1" "$T0\tmigration 20260910030000: destructive statement in 20260910030000_cron_run_log — a human applies this one after review\thard" "$SHA0" "$(ready_at "$SHA0")" "" go --approve-normal
R="$TMP/s2/receipt.txt"; TR="$TMP/s2/trace.txt"
check "2a hard: nothing merged"                                  $(hasnot "$TR" "gh pr merge"; echo $?)
check "2b hard: hook NOT fired"                                  $([ "$(posts "$TR")" -eq 0 ]; echo $?)
check "2c hard: unblock_lanes NOT run"                           $(hasnot "$TR" "UNBLOCK_LANES_CALLED"; echo $?)
check "2d hard: apply NOT run"                                   $(hasnot "$TR" "APPLY_CALLED"; echo $?)
check "2e hard: receipt names the class"                         $(has "$R" "FROZEN (hard) since:"; echo $?)
check "2f hard: merge stage says hard freeze"                    $(has "$R" "(plan mode or hard freeze — nothing merged)"; echo $?)
check "2g hard: HTML banner says nothing merges, nothing ships"  $(grep -qF "FROZEN (hard — nothing merges, nothing ships)" "$(cat "$TMP/s2/html.path")"; echo $?)
check "2h hard: HELD question asked with #3 #4, approve-all and none-today" $(grep -q 'ASK kind=held class=held title=2 HELD PRs ready for your OK: #3 #4' "$TR" && grep -q '"Approve all listed"' "$TR" && grep -q '"None today"' "$TR" && grep -q '"file": "approve-held", "value": "3"' "$TR"; echo $?) "$(grep ASK "$TR")"
check "2i hard + main ahead of Vercel's READY sha (s1's merges): one-line 'NOTHING ships' reason" $(grep -q '^  ⛔ hard freeze — main (.*) is ahead of production (.*) but NOTHING ships' "$R"; echo $?) "$(grep 'hard freeze' "$R")"

echo "── (3) soft freeze + main ahead of production, zero merges → deploy + apply + sweep; hand-merges listed ──"
# commits land on main AFTER the freeze started: #77 by hand (squash shape), #79 by hand (GitHub's merge-button shape),
# #78 by the wave (in a run's merged-map.tsv) — and s1's own merges #1 #2 are the wave's too
mkdir -p "$WTDIR/app/api/y" "$WTDIR/supabase/migrations"
echo "export {}" > "$WTDIR/app/api/y/route.ts"; echo "create table t(id int);" > "$WTDIR/supabase/migrations/20260910120000_hand.sql"
gitc add -A >/dev/null; gitc commit -q -m "feat: hand-merged thing (#77)"
echo "# b" > "$WTDIR/docs/b.md"; gitc add -A >/dev/null; gitc commit -q -m "docs: wave-merged thing (#78)"
echo "# d" > "$WTDIR/docs/d.md"; gitc add -A >/dev/null; gitc commit -q -m "Merge pull request #79 from someone/fix-thing"
gitc push -q jicate HEAD:main 2>/dev/null; SHA1=$(gitc rev-parse HEAD)
mkdir -p "$TMP/s3/home/.config/obsidian/.ship-wave/run-20260910-000000"; printf '1\tdocs/a.md\n2\tapp/api/x/route.ts\n78\tdocs/b.md\n' > "$TMP/s3/home/.config/obsidian/.ship-wave/run-20260910-000000/merged-map.tsv"
# Vercel has no commit sha → the marker (HEAD1, s1's result) is the fallback
scenario s3 "0 0 0" "$T0\tmigration 20260908120000: 0 files on jicate/main match (need exactly 1)\tsoft" "$HEAD1" "$READY_NOMETA" "" go --approve-normal
R="$TMP/s3/receipt.txt"; TR="$TMP/s3/trace.txt"
check "3a main-ahead: zero merges this round"                    $(has "$R" "merged this round: 0"; echo $?)
check "3b main-ahead: receipt says shipping what is already on main" $(has "$R" "main is ahead of production with zero merges this round"; echo $?) "$(grep -i 'main' "$R" | head -3)"
check "3c main-ahead: deploy hook fired once"                    $([ "$(posts "$TR")" -eq 1 ]; echo $?)
check "3d main-ahead: apply handed the hand-merged migration"    $(grep -q 'APPLY_CALLED.*supabase/migrations/20260910120000_hand.sql' "$TR"; echo $?) "$(grep APPLY "$TR")"
check "3e main-ahead: sweep probed the hand-merged route (L2)"   $(has "$R" "L2 1 ok"; echo $?) "$(grep L2 "$R")"
check "3f main-ahead: last-deployed advanced to main HEAD (fallback: no meta sha from Vercel → main at fire time)" $([ "$(marker s3)" = "$SHA1" ]; echo $?) "$(marker s3)"
check "3g hand-merged: #77 and #79 listed, #78 / #1 / #2 (the wave's own) not" $(grep -q 'merged by hand while stopped: #77 #79 *$' "$R"; echo $?) "$(grep 'by hand' "$R")"
check "3h hand-merged: HTML banner lists #77"                    $(grep -qF "merged by hand while stopped: #77" "$(cat "$TMP/s3/html.path")"; echo $?)
check "3i main-ahead: the file list came from the real diff (4 file(s), not 0)" $(grep -q 'ahead of production [0-9a-f]*: 4 file(s)' "$R"; echo $?) "$(grep 'ahead of production' "$R")"

echo "── (3x) hard freeze + main ahead → nothing ships, one-line reason ──"
scenario s3x "0 0 0" "$T0\tmigration 20260906213000: DRY-RUN failed — ERROR: 2BP01\thard" "$SHA0" "$READY_NOMETA" "" go
R="$TMP/s3x/receipt.txt"; TR="$TMP/s3x/trace.txt"
check "3x-a hard+ahead: hook NOT fired"                          $([ "$(posts "$TR")" -eq 0 ]; echo $?)
check "3x-b hard+ahead: one-line reason in the receipt"          $(grep -q '^  ⛔ hard freeze — main (.*) is ahead of production (.*) but NOTHING ships until the stop is lifted: migration 20260906213000: DRY-RUN failed' "$R"; echo $?) "$(grep 'hard freeze' "$R")"
check "3x-c hard+ahead: last-deployed untouched"                 $([ "$(marker s3x)" = "$SHA0" ]; echo $?)

echo "── (3y) not frozen, production == main HEAD (marker fallback), zero merges → no deploy ──"
scenario s3y "0 0 0" "" "$SHA1" "$READY_NOMETA" "" go
R="$TMP/s3y/receipt.txt"; TR="$TMP/s3y/trace.txt"
check "3y-a no-ahead: hook NOT fired"                            $([ "$(posts "$TR")" -eq 0 ]; echo $?)
check "3y-b no-ahead: receipt says production already runs main HEAD" $(has "$R" "nothing to deploy (production already runs main HEAD ${SHA1:0:7}"; echo $?) "$(grep -E 'nothing to deploy|main vs' "$R")"

echo "── (4) --unfreeze clears the file — latch and class together; --freeze writes a correctly classed line ──"
mkdir -p "$TMP/s4/home/.config/obsidian/.ship-wave"; printf '%s\tpeer hold on #3410\tsoft\n' "$T0" > "$TMP/s4/home/.config/obsidian/.ship-wave/FROZEN"
out=$(HOME="$TMP/s4/home" bash "$SW/ship-wave.sh" --unfreeze 2>&1)
check "4a --unfreeze removes FROZEN"                             $([ ! -e "$TMP/s4/home/.config/obsidian/.ship-wave/FROZEN" ]; echo $?)
check "4b --unfreeze reports the class it cleared"               $([ "$out" = "freeze cleared (was soft)" ]; echo $?) "$out"
# spec gap: the §B soft row "peer/Director hold" had no entry point — a hand-written 2-field line reads as HARD
out=$(HOME="$TMP/s4/home" bash "$SW/ship-wave.sh" --freeze "peer hold on #3410 — Director asked to wait" 2>&1)
FZ="$TMP/s4/home/.config/obsidian/.ship-wave/FROZEN"
check "4c --freeze 'peer hold …' writes a 5-field line (field 5 = sha1) classed soft" $([ "$(awk -F'\t' 'END{print NF" "$3}' "$FZ")" = "5 soft" ]; echo $?) "$(cat "$FZ")"
check "4d --freeze field 4 is the ledger_class slug of the message" $([ "$(awk -F'\t' 'END{print $4}' "$FZ")" = "peer hold on pr director asked to wait" ]; echo $?) "$(awk -F'\t' 'END{print $4}' "$FZ")"
check "4e --freeze printed the soft line (merges/ships nothing — no run happened)" $(grep -q 'FROZEN (soft): peer hold on #3410' <<<"$out"; echo $?) "$out"
out=$(HOME="$TMP/s4/home" bash "$SW/ship-wave.sh" --unfreeze 2>&1)
check "4f --unfreeze after --freeze reports soft"                $([ "$out" = "freeze cleared (was soft)" ]; echo $?) "$out"

echo "── (5) classify_freeze: one message from each ledger class lands in the right row ──"
(
  export HOME="$TMP/s5"; mkdir -p "$HOME"; cd "$ROOT" || exit 9
  set -- plan; . "$TMP/wave.sh" >/dev/null 2>&1
  t() { local got rc; got=$(classify_freeze "$2"); rc=$?; if [ "$got" = "$1" ] && [ "$rc" -eq "${3:-0}" ]; then echo "PASS  5 classify → $1${3:+ (rc $3)}: ${2:0:70}"; else echo "FAIL  5 classify → wanted $1 (rc ${3:-0}) got $got (rc $rc): ${2:0:70}"; fi; }
  t hard "deploy dpl_GWVMQfKoT7wX1kwgkCxRuX4EZmau → ERROR BUILD_FAILED; on main but NOT live: #3296"
  t hard "deploy failed TWICE (attempt 2 = dpl_x → ERROR -); on main but NOT live: #1"
  t hard "deploy dpl_abc → CANCELED -; on main but NOT live: #3296"
  t hard "migration APPLY failed run 33957269672"
  t hard "migration 20260906213000: APPLY failed — relation exists"
  t hard "migration 20260906213000: DRY-RUN failed — Failed to run sql query: ERROR:  2BP01"
  t hard "migration 20260910030000: destructive statement in 20260910030000_cron_run_log — a human applies this one after review"
  t hard "GATE ERROR: merge guard unreachable"
  t hard "migration gap: 20260901000000 on main but not in history"
  t hard "migration 20260908120000: cannot read supabase/migrations/x.sql from jicate/main"
  t hard "migration 20260908120000: the history query failed (401 = stale access token, not a missing table)"
  t hard "migration 20260908120000: APPLIED but the history insert failed — err (record it by hand, then --unfreeze)"
  t hard "migration 20260908120000: applied + recorded, but the verify read did not find it"
  t hard "broken page after deploy: 3 page×role load(s) returned 5xx; on main: #1"
  t hard "post-deploy sweep failed — L2: /api/x→500 L1: none · likely PRs: #1"
  t hard "baseline bounce after deploy — these loaded 200 before and now bounce to /auth/login: x; on main: #1"
  t soft "peer hold on #3410 — Director asked to wait"
  t soft "Director hold: wait for the board meeting"
  t soft "#3410 on hold until the fee schedule is signed"
  t soft "migration 20260908120000: 0 files on jicate/main match (need exactly 1)"
  t soft "conflict verdict UNRESOLVABLE for #3179 after two helper tabs"
  t soft "policy question P2 awaiting ratification"
  t soft "advisory check 'SDK multi-agent review' red on every PR"
  t hard "something nobody has seen before" 1
  # soft rows are anchored phrases: a future hard message containing "threshold" / "uphold" must not turn soft
  t hard "rate threshold exceeded, 5 pages 5xx" 1
  t hard "cannot uphold RLS on table x" 1
  # a HARD-shaped message that also contains a soft phrase stays hard (hard rows match first)
  t hard "migration 20260906213000: APPLY failed — policy violation: peer hold"
) | tee "$TMP/s5.out"
PASS=$((PASS + $(grep -c '^PASS' "$TMP/s5.out"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/s5.out")))

echo "── (6) freeze() writes class (field 3) + ledger_class (field 4); unknown → hard and says so; freeze asks with the ledger slug ──"
(
  export HOME="$TMP/s6"; mkdir -p "$HOME"; cd "$ROOT" || exit 9
  set -- plan; . "$TMP/wave.sh" >/dev/null 2>&1
  ASKLOG="$HOME/ask.log"; : > "$ASKLOG"
  ask_director() { printf 'kind=%s class=%s title=%s\nbody=%s\nopts=%s\n' "$1" "$2" "$3" "$4" "$5" >> "$ASKLOG"; }
  M1="migration 20260908120000: 0 files on jicate/main match (need exactly 1)"
  freeze "$M1" > "$HOME/f1.out"
  l=$(tail -1 "$FREEZE"); c=$(printf '%s' "$l" | awk -F'\t' '{print NF" "$3}')
  [ "$c" = "5 soft" ] && echo "PASS  6a freeze() wrote 5 tab-separated fields, class soft" || echo "FAIL  6a fields/class: $c"
  [ "$(printf '%s' "$l" | awk -F'\t' '{print $4}')" = "$(ledger_class "$M1")" ] && echo "PASS  6a2 field 4 == ledger_class(message) — the key the ledger and slice D use ($(ledger_class "$M1"))" || echo "FAIL  6a2 field4=$(printf '%s' "$l" | awk -F'\t' '{print $4}') ledger_class=$(ledger_class "$M1")"
  grep -q 'FROZEN (soft):.*merging LOW/NORMAL, holding HELD' "$HOME/f1.out" && echo "PASS  6b soft freeze line says merging LOW/NORMAL, holding HELD" || echo "FAIL  6b $(cat "$HOME/f1.out")"
  grep -q "^kind=freeze class=$(ledger_class "$M1") title=The ship wave paused" "$ASKLOG" && grep -q '"label":"Keep it stopped"' "$ASKLOG" && grep -q '"op":"unfreeze"' "$ASKLOG" && echo "PASS  6c freeze asked the Director (kind=freeze, class=<ledger slug>, soft title, Lift/Keep options)" || echo "FAIL  6c $(cat "$ASKLOG")"
  grep -q 'Allow this one migration' "$ASKLOG" && echo "FAIL  6d a non-destructive freeze must not offer the allow option" || echo "PASS  6d non-destructive freeze: no allow option"
  [ "$(freeze_class_now)" = soft ] && echo "PASS  6e freeze_class_now reads soft from the last line" || echo "FAIL  6e $(freeze_class_now)"
  : > "$ASKLOG"
  M2="migration 20260910030000: destructive statement in 20260910030000_cron_run_log — a human applies this one after review"
  freeze "$M2" > "$HOME/f2.out"
  [ "$(freeze_class_now)" = hard ] && echo "PASS  6f destructive statement → hard, and the LAST line wins" || echo "FAIL  6f $(freeze_class_now)"
  grep -q '"label":"Allow this one migration"' "$ASKLOG" && grep -q '"file":"allow-destructive","value":"20260910030000"' "$ASKLOG" && echo "PASS  6g destructive freeze offers 'Allow this one migration' with the parsed version" || echo "FAIL  6g $(cat "$ASKLOG")"
  grep -q "^kind=freeze class=$(ledger_class "$M2") title=The ship wave stopped: production or main may be broken" "$ASKLOG" && echo "PASS  6h destructive question carries the ledger slug as class and the hard title" || echo "FAIL  6h $(head -1 "$ASKLOG")"
  freeze "something nobody has seen before" > "$HOME/f3.out"
  grep -q 'matched no row of classify_freeze — treated as HARD' "$HOME/f3.out" && [ "$(freeze_class_now)" = hard ] && echo "PASS  6i unknown message → hard, and the receipt says it was unclassified" || echo "FAIL  6i $(cat "$HOME/f3.out")"
  printf '%s\told two-field line\n' "$T0" > "$FREEZE"
  [ "$(freeze_class_now)" = hard ] && echo "PASS  6j a pre-class two-field FROZEN line reads as hard (fail safe)" || echo "FAIL  6j $(freeze_class_now)"
  printf '%s\tpeer hold\tsoft\n' "$T0" > "$FREEZE"
  [ "$(freeze_class_now)" = soft ] && echo "PASS  6j2 a 3-field line from before the ledger_class field still reads its class" || echo "FAIL  6j2 $(freeze_class_now)"
  unset -f ask_director
  rm -f "$FREEZE"; freeze "peer hold on #1" > "$HOME/f4.out" 2>&1 && echo "PASS  6k freeze() runs without desk-questions.sh (ask_director absent)" || echo "FAIL  6k $(cat "$HOME/f4.out")"
) | tee "$TMP/s6.out"
PASS=$((PASS + $(grep -c '^PASS' "$TMP/s6.out"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/s6.out")))

echo "── (7) HELD question: asked once per set, re-asked only when the set changes ──"
(
  export HOME="$TMP/s7"; mkdir -p "$HOME/run"; cd "$ROOT" || exit 9
  set -- go; . "$TMP/wave.sh" >/dev/null 2>&1
  mk_plan "$HOME/run/plan.json" "0 0 1"
  N=0; ask_director() { N=$((N+1)); LAST_TITLE="$3"; LAST_OPTS="$5"; }
  APPROVE_HELD=""; ask_held_question "$HOME/run"
  [ "$N" -eq 1 ] && [ "$LAST_TITLE" = "2 HELD PRs ready for your OK: #3 #4" ] && echo "PASS  7a first sweep asks once, title lists #3 #4" || echo "FAIL  7a N=$N title=$LAST_TITLE"
  python3 -c '
import json,sys; o=json.loads(sys.argv[1]); labels=[x["label"] for x in o]
assert labels[:2]==["#3 feat: fee ledger","#4 feat: add table"], labels
assert labels[2:]==["Approve all listed","None today"], labels
assert o[0]["writes"]==[{"op":"append","file":"approve-held","value":"3"}], o[0]
assert o[2]["writes"]==[{"op":"append","file":"approve-held","value":"3"},{"op":"append","file":"approve-held","value":"4"}], o[2]
assert o[3]["writes"]==[{"op":"noop"}]
for x in o: assert len(x["label"])<=40 and all(w["op"] in ("append","noop") for w in x["writes"])' "$LAST_OPTS" && echo "PASS  7b options: one per PR (append approve-held n), Approve all (both appends), None today (noop)" || echo "FAIL  7b $LAST_OPTS"
  ask_held_question "$HOME/run"
  [ "$N" -eq 1 ] && echo "PASS  7c same set next round → not asked again" || echo "FAIL  7c N=$N"
  APPROVE_HELD="3"; ask_held_question "$HOME/run"
  [ "$N" -eq 2 ] && [ "$LAST_TITLE" = "1 HELD PR ready for your OK: #4" ] && echo "PASS  7d #3 approved → set changed to #4 → asked again" || echo "FAIL  7d N=$N title=$LAST_TITLE"
  APPROVE_HELD="3 4"; ask_held_question "$HOME/run"
  [ "$N" -eq 2 ] && echo "PASS  7e every HELD PR approved → nothing to ask" || echo "FAIL  7e N=$N"
) | tee "$TMP/s7.out"
PASS=$((PASS + $(grep -c '^PASS' "$TMP/s7.out"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/s7.out")))

# ═════ regression cases for the adversarial verifier's breaks (2026-09-10) — each FAILED on 5f04de8929 ═════
echo "── (D2) hard freeze + leftover deploy-pending + plain go: the flush must not ship ──"
# production (marker fallback) is behind main — exactly what a goal run leaves when it hard-freezes mid-run: the end-of-run
# build skipped, deploy-pending still on disk, and the next hand-typed plain `go` hits the flush branch
PRE='printf "app/api/x/route.ts\n" > "$ST/deploy-pending"' scenario d2 "0 0 0" "$T0\tmigration 1: APPLY failed — x\thard" "$SHA0" "$READY_NOMETA" "" go
R="$TMP/d2/receipt.txt"; TR="$TMP/d2/trace.txt"; PEND="$TMP/d2/home/.config/obsidian/.ship-wave/deploy-pending"
check "D2  hard + leftover batch + plain go: hook NOT fired"     $([ "$(posts "$TR")" -eq 0 ]; echo $?) "$(grep -E 'hook fired|earlier-batch' "$R")"
check "D2b hard + leftover batch: sweep gate NOT reached"        $(hasnot "$R" "L2 1 ok"; echo $?) "$(grep L2 "$R")"
check "D2c hard + leftover batch: last-deployed NOT advanced"    $([ "$(marker d2)" = "$SHA0" ]; echo $?) "$(marker d2)"
check "D2d hard + leftover batch: receipt says the batch was NOT flushed and why; the file stays for the first unfrozen go" $(has "$R" "NOT flushing the leftover batch — hard freeze" && [ -s "$PEND" ]; echo $?) "$(grep -E 'flush|deploy-pending' "$R")"
check "D2e hard + leftover batch: scoreboard deploy = skipped (hard freeze; leftover batch kept)" $(has "$R" "deploy: skipped (hard freeze; leftover batch kept)"; echo $?) "$(grep SCOREBOARD "$R")"
# control: the same batch under a SOFT freeze ships (§C) — proves D2 was a real gate, not a dead route
PRE='printf "app/api/x/route.ts\n" > "$ST/deploy-pending"' AFTER=auto scenario d2_soft "0 0 0" "$T0\tpeer hold on #9\tsoft" "$SHA0" "$READY_NOMETA" "" go
check "D2f CONTROL soft + leftover batch + plain go: hook fired once, +earlier-batch recorded in v5-deploy-fires.tsv, batch drained" $([ "$(posts "$TMP/d2_soft/trace.txt")" -eq 1 ] && has "$TMP/d2_soft/home/.config/obsidian/v5-deploy-fires.tsv" "+earlier-batch" && [ ! -e "$TMP/d2_soft/home/.config/obsidian/.ship-wave/deploy-pending" ]; echo $?) "$(grep -E 'hook|batch' "$TMP/d2_soft/receipt.txt"; cat "$TMP/d2_soft/home/.config/obsidian/v5-deploy-fires.tsv" 2>&1)"
# hard + leftover batch, but production already runs main HEAD → the batch is stale: cleared, never built, still no POST
PRE='printf "app/api/x/route.ts\n" > "$ST/deploy-pending"' scenario d2_live "0 0 0" "$T0\tmigration 1: APPLY failed — x\thard" "$(main_head)" "$READY_NOMETA" "" go
check "D2h hard + leftover batch already live (production == main HEAD): no POST, batch cleared as stale" $([ "$(posts "$TMP/d2_live/trace.txt")" -eq 0 ] && has "$TMP/d2_live/receipt.txt" "is already live" && [ ! -e "$TMP/d2_live/home/.config/obsidian/.ship-wave/deploy-pending" ]; echo $?) "$(grep -E 'hook|batch' "$TMP/d2_live/receipt.txt")"

echo "── (D2-final) goal run: the end-of-run build is skipped under hard WITH a receipt line; fires under soft ──"
(
  export HOME="$TMP/d2f"; mkdir -p "$HOME/.config/obsidian/.ship-wave"; cd "$ROOT" || exit 9
  set -- go --goal; . "$TMP/wave.sh" >/dev/null 2>&1
  GOAL_ROUNDS=1; sleep() { :; }
  run_once() { echo "RUN_ONCE final=${FINAL_DEPLOY:-}" >> "$HOME/calls"; echo 0 > "$STATE/last-open-count"; return 0; }
  printf 'app/api/x/route.ts\n' > "$STATE/deploy-pending"; printf '%s\tmigration 1: APPLY failed — x\thard\n' "$T0" > "$FREEZE"
  . "$TMP/goal-block.sh" > "$HOME/out.txt" 2>&1
  grep -q '^RUN_ONCE final=$' "$HOME/calls" && ! grep -q 'final=1' "$HOME/calls" && echo "PASS  D2-final-a hard: the FINAL_DEPLOY pass did not run" || echo "FAIL  D2-final-a $(cat "$HOME/calls")"
  grep -q 'end of run: ⛔ NOT building — hard freeze.*1 file(s) stay in .*deploy-pending' "$HOME/out.txt" && [ -s "$STATE/deploy-pending" ] && echo "PASS  D2-final-b hard: receipt says the batch stays on disk and why (no silent leftover)" || echo "FAIL  D2-final-b $(cat "$HOME/out.txt")"
  : > "$HOME/calls"; printf '%s\tpeer hold on #9\tsoft\n' "$T0" > "$FREEZE"
  . "$TMP/goal-block.sh" > "$HOME/out2.txt" 2>&1
  grep -q 'final=1' "$HOME/calls" && echo "PASS  D2-final-c soft: the FINAL_DEPLOY pass ran (what merged still ships)" || echo "FAIL  D2-final-c $(cat "$HOME/calls")"
) | tee "$TMP/d2f.out"
PASS=$((PASS + $(grep -c '^PASS' "$TMP/d2f.out"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/d2f.out")))

echo "── (D2-retry) deploy ERROR → one re-fire → freeze hard; marker not advanced ──"
AFTER="$ERROR_JSON" scenario d2r "0 1 0" "$T0\tpeer hold on #9\tsoft" "$SHA0" "$(ready_at "$(main_head)")" "" go --approve-normal
R="$TMP/d2r/receipt.txt"; TR="$TMP/d2r/trace.txt"; PRE_HEAD=$(git -C "$WTDIR" rev-parse jicate/main~1)
check "D2-retry-a ERROR: exactly two POSTs (the fire and ONE retry)" $([ "$(posts "$TR")" -eq 2 ]; echo $?) "$(posts "$TR")"
check "D2-retry-b second ERROR freezes HARD ('deploy failed TWICE')" $(grep -q 'deploy failed TWICE' "$TMP/d2r/home/.config/obsidian/.ship-wave/FROZEN" && [ "$(tail -1 "$TMP/d2r/home/.config/obsidian/.ship-wave/FROZEN" | cut -f3)" = hard ]; echo $?) "$(cat "$TMP/d2r/home/.config/obsidian/.ship-wave/FROZEN")"
check "D2-retry-c marker stays at what Vercel had READY before the merge (not advanced past a failed build)" $([ "$(marker d2r)" = "$PRE_HEAD" ]; echo $?) "marker=$(marker d2r) pre=$PRE_HEAD"

echo "── (F3) production sha unknown to the worktree: no build, no docs-only verdict, marker untouched ──"
scenario f3 "0 0 0" "$T0\tpeer hold on #9\tsoft" "0000000000000000000000000000000000000000" "$READY_NOMETA" "" go --approve-normal
R="$TMP/f3/receipt.txt"; TR="$TMP/f3/trace.txt"
check "F3  unknown marker sha + main has app+migration ahead: hook NOT fired" $([ "$(posts "$TR")" -eq 0 ]; echo $?)
check "F3b receipt says 'cannot tell what is deployed — … no build fired' and points at /deploy-myjkkn" $(has "$R" "cannot tell what is deployed" && has "$R" "no build fired" && has "$R" "/deploy-myjkkn"; echo $?) "$(grep 'main vs' "$R")"
check "F3c NOT read as a docs-only round"                       $(hasnot "$R" "nothing to deploy"; echo $?) "$(grep 'nothing to deploy' "$R")"
check "F3d marker untouched (still the unknown sha, not main HEAD)" $([ "$(marker f3)" = "0000000000000000000000000000000000000000" ]; echo $?) "$(marker f3)"
# the same shape via Vercel: READY meta sha that is on no branch, marker good → marker NOT overwritten, no main-ahead build
scenario f3v "0 0 0" "$T0\tpeer hold on #9\tsoft" "$SHA0" "$READY_UNKNOWN" "" go --approve-normal
R="$TMP/f3v/receipt.txt"; TR="$TMP/f3v/trace.txt"
check "F3e Vercel READY sha unknown to the worktree: marker (SHA0) NOT overwritten with junk" $([ "$(marker f3v)" = "$SHA0" ] && has "$R" "last-deployed NOT written"; echo $?) "$(marker f3v) · $(grep 'last-deployed' "$R")"
check "F3f Vercel READY sha unknown: hook NOT fired, 'cannot tell' in the receipt (Vercel is the truth; the marker is not used to guess)" $([ "$(posts "$TR")" -eq 0 ] && has "$R" "cannot tell what is deployed"; echo $?) "$(grep 'main vs' "$R")"
# …but this round's OWN merges still deploy: an unknown production sha only silences the main-ahead trigger
AFTER=auto scenario f3m "0 1 0" "$T0\tpeer hold on #9\tsoft" "$SHA0" "$READY_UNKNOWN" "" go --approve-normal
check "F3g Vercel sha unknown + NORMAL merge this round: the merge still ships (one POST) and the marker lands on main HEAD" $([ "$(posts "$TMP/f3m/trace.txt")" -eq 1 ] && [ "$(marker f3m)" = "$(main_head)" ]; echo $?) "$(posts "$TMP/f3m/trace.txt") POSTs · marker=$(marker f3m)"

echo "── (H1) Vercel's READY sha is the source of truth; the marker is the fallback ──"
HEADH=$(main_head)
PRE='printf "app/api/x/route.ts\n" > "$ST/deploy-pending"' scenario h1 "0 0 0" "$T0\tpeer hold on #9\tsoft" "$SHA0" "$(ready_at "$HEADH" 9)" "" go --approve-normal
R="$TMP/h1/receipt.txt"; TR="$TMP/h1/trace.txt"
check "H1  Vercel READY == main HEAD, marker stale (SHA0): hook NOT fired" $([ "$(posts "$TR")" -eq 0 ]; echo $?) "$(grep -E 'main is ahead|hook fired' "$R")"
check "H1b receipt: production already runs main HEAD; deploy = nothing to deploy" $(has "$R" "production already runs main HEAD ${HEADH:0:7}" && has "$R" "nothing to deploy (production already runs main HEAD"; echo $?) "$(grep -E 'main vs|nothing to deploy' "$R")"
check "H1c marker rewritten from Vercel to main HEAD"           $([ "$(marker h1)" = "$HEADH" ]; echo $?) "$(marker h1)"
check "H1d a leftover batch that is already live is cleared, not built" $([ ! -e "$TMP/h1/home/.config/obsidian/.ship-wave/deploy-pending" ] && has "$R" "leftover batch (1 file(s)) is already live"; echo $?) "$(grep 'leftover' "$R")"
# the other direction: marker claims main is deployed, Vercel says production is BEHIND → Vercel wins → main ships
AFTER=auto scenario h1b "0 0 0" "$T0\tpeer hold on #9\tsoft" "$HEADH" "$(ready_at "$SHA0" 8)" "" go --approve-normal
R="$TMP/h1b/receipt.txt"; TR="$TMP/h1b/trace.txt"
check "H1e marker == main HEAD but Vercel READY = SHA0 (behind): main-ahead trigger fires ONE build" $([ "$(posts "$TR")" -eq 1 ] && has "$R" "main is ahead of production with zero merges"; echo $?) "$(grep -E 'main vs|main is ahead|hook' "$R")"
check "H1f marker was first pulled back to Vercel's sha, then advanced by the READY build" $(grep -q "last-deployed ← ${SHA0:0:10}" "$R" && [ "$(marker h1b)" = "$(main_head)" ]; echo $?) "$(grep 'last-deployed' "$R")"
# a second tick after H1: Vercel reports main HEAD, marker equal → still quiet (no empty build, ever)
scenario h1c "0 0 0" "$T0\tpeer hold on #9\tsoft" "$(marker h1)" "$(ready_at "$HEADH" 9)" "" go --approve-normal
check "H1g second tick, everything equal: no POST"              $([ "$(posts "$TMP/h1c/trace.txt")" -eq 0 ]; echo $?)

echo "── (8) deploy_allowed(): the one predicate every fire passes through ──"
(
  export HOME="$TMP/s8"; mkdir -p "$HOME/.config/obsidian/.ship-wave"; cd "$ROOT" || exit 9
  set -- go; . "$TMP/wave.sh" >/dev/null 2>&1
  rm -f "$FREEZE"; deploy_allowed && echo "PASS  8a go, no freeze → allowed" || echo "FAIL  8a $DEPLOY_BLOCK"
  printf '%s\tpeer hold on #9\tsoft\n' "$T0" > "$FREEZE"; deploy_allowed && echo "PASS  8b soft freeze → allowed (§C: shipping still runs)" || echo "FAIL  8b $DEPLOY_BLOCK"
  printf '%s\tmigration 1: APPLY failed — x\thard\n' "$T0" > "$FREEZE"; ! deploy_allowed && [[ "$DEPLOY_BLOCK" == "hard freeze — nothing ships until the stop is lifted"* ]] && echo "PASS  8c hard freeze → refused, reason names the freeze" || echo "FAIL  8c $DEPLOY_BLOCK"
  printf '%s\tlegacy two fields\n' "$T0" > "$FREEZE"; ! deploy_allowed && echo "PASS  8d legacy 2-field line → refused (reads as hard)" || echo "FAIL  8d"
  rm -f "$FREEZE"; MODE=plan; ! deploy_allowed && [[ "$DEPLOY_BLOCK" == plan* ]] && echo "PASS  8e plan mode → refused" || echo "FAIL  8e $DEPLOY_BLOCK"
  MODE=go NO_DEPLOY=1; ! deploy_allowed && [ "$DEPLOY_BLOCK" = "--no-deploy" ] && echo "PASS  8f --no-deploy → refused" || echo "FAIL  8f $DEPLOY_BLOCK"
  # every `curl -s -X POST "$HOOK"` in ship-wave.sh sits inside a branch guarded by deploy_allowed — count both
  n_post=$(grep -c 'curl -s -X POST "\$HOOK"' "$SW/ship-wave.sh"); n_gate=$(grep -c 'deploy_allowed' "$SW/ship-wave.sh")
  [ "$n_post" -eq 2 ] && [ "$n_gate" -ge 6 ] && echo "PASS  8g source: $n_post hook POST sites, $n_gate deploy_allowed references (definition, fire line, retry, flush, refusal branch, goal block)" || echo "FAIL  8g posts=$n_post gates=$n_gate"
) | tee "$TMP/s8.out"
PASS=$((PASS + $(grep -c '^PASS' "$TMP/s8.out"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/s8.out")))

echo "── syntax ──"
for f in "$SW/ship-wave.sh" "$0"; do bash -n "$f" && ok "bash -n $(basename "$f")" || bad "bash -n $(basename "$f")"; done

echo; echo "=== $PASS passed · $FAIL failed · fixtures in $TMP ==="
[ "$FAIL" -eq 0 ]

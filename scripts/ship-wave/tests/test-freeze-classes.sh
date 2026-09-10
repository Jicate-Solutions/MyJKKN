#!/opt/homebrew/bin/bash
# tests/test-freeze-classes.sh — proof for HUMAN-IN-THE-LOOP.md §B (freeze classes) and §C (ship while stopped).
#
# Run from the worktree root:  bash scripts/ship-wave/tests/test-freeze-classes.sh
# Prints PASS/FAIL per case, exits non-zero on any FAIL. Nothing reaches the network: gh / curl are shell
# functions that record every call in a trace file, Vercel answers from a canned JSON, and jicate/main is a
# real git repo in a temp dir (the hand-merge and main-ahead logic reads git for real). $STATE is a temp dir.
#
# HOW run_once IS DRIVEN — honestly: a copy of ship-wave.sh with its final dispatch block removed is SOURCED,
# so classify_freeze / freeze / freeze_class_now / merge_one / merge_tiers / the 3b-4-5 gates / the HTML report
# are the real code. Stubbed at the boundary only: sweep (writes a fixture plan.json), unblock_lanes,
# dispatch_clusters, alive_helpers, rebase_remaining, apply_migrations (records what it was handed), vtok, sleep.
# Every "gate reached / not reached" assertion below reads the trace those stubs and the gh/curl functions leave.
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

# ── the sourceable copy: everything except the trailing "if GOAL … run_once" dispatcher ──────────────
awk '/^if \[ -n "\$GOAL" \]; then$/ {exit} {print}' "$SW/ship-wave.sh" > "$TMP/wave.sh"
# the copy resolves its siblings from its own dirname — link the REAL failure-ledger / policy-learning /
# apply-migrations / rebase-remaining / unblock-lanes next to it so they are sourced, not silently skipped
for f in "$SW"/*.sh "$SW"/*.py; do [ "$(basename "$f")" = ship-wave.sh ] || ln -s "$f" "$TMP/$(basename "$f")"; done
grep -q '^run_once() {' "$TMP/wave.sh" || { echo "FAIL  could not extract run_once from ship-wave.sh"; exit 1; }

# ── git fixture: a bare "jicate" remote + the wave's ship-main worktree cloned from it ─────────────────
export MYJKKN_LOCAL="$TMP/local"; WTDIR="$MYJKKN_LOCAL/.claude/worktrees/ship-main"
git init -q --bare "$TMP/origin.git"; mkdir -p "$(dirname "$WTDIR")"
git clone -q -o jicate "$TMP/origin.git" "$WTDIR" 2>/dev/null
gitc() { git -C "$WTDIR" -c user.name=t -c user.email=t@t "$@"; }
mkdir -p "$WTDIR/app/api/x" "$WTDIR/docs"
echo "export {}" > "$WTDIR/app/api/x/route.ts"; echo "# a" > "$WTDIR/docs/a.md"
gitc add -A >/dev/null; gitc commit -q -m "base"; gitc push -q jicate HEAD:main 2>/dev/null
SHA0=$(gitc rev-parse HEAD)

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
# usage: scenario <name> <plan-flags> <freeze-line|""> <last-deployed-sha|""> <deploy-json> <approve-held-file-content> <args…>
scenario() {
  local name="$1" flags="$2" frozen_line="$3" lastdep="$4" djson="$5" held_file="$6"; shift 6
  local S="$TMP/$name"; mkdir -p "$S/home/.config/obsidian/.ship-wave"
  local ST="$S/home/.config/obsidian/.ship-wave"
  [ -n "$frozen_line" ] && printf '%b\n' "$frozen_line" > "$ST/FROZEN"
  [ -n "$lastdep" ] && printf '%s\n' "$lastdep" > "$ST/last-deployed"
  [ -n "$held_file" ] && printf '%s\n' "$held_file" > "$ST/approve-held"
  mk_plan "$S/plan.json" "$flags"
  (
    export HOME="$S/home"; cd "$ROOT" || exit 9
    TRACE="$S/trace.txt"; : > "$TRACE"; export TRACE FIXPLAN="$S/plan.json" DJSON="$djson"
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
        "pr merge "*) return 0;;
        *"--json files"*) case "$3" in 1) echo docs/a.md;; 2) echo app/api/x/route.ts;; 3) echo app/api/fees/route.ts;; 4) echo supabase/migrations/20260910100000_t.sql;; esac;;
        *"pr list"*) echo 4;;
      esac; return 0
    }
    curl() {
      echo "curl $*" >> "$TRACE"
      case "$*" in
        *"-X POST"*) echo '{"job":{"id":"job-1"}}';;
        *"v6/deployments"*) echo "$DJSON";;
        *"-o /dev/null"*) echo 401;;
      esac; return 0
    }
    ask_director() { printf 'ASK kind=%s class=%s title=%s\nASK-OPTS %s\n' "$1" "$2" "$3" "$5" >> "$TRACE"; }
    _REDIR_DONE=1
    run_once > "$S/receipt.txt" 2>&1; echo "rc=$?" >> "$TRACE"
    ls "$MYJKKN_LOCAL"/artifacts/ship-wave-*.html 2>/dev/null | tail -1 > "$S/html.path"
  )
}

READY_META='{"deployments":[{"uid":"dpl_1","readyState":"READY","meta":{"githubCommitSha":"meta-sha-from-vercel"}}]}'
READY_NOMETA='{"deployments":[{"uid":"dpl_2","readyState":"READY"}]}'
T0=$(date -v-2M '+%F %T')   # a freeze that started two minutes ago (BSD date)

echo "── (1) soft freeze: LOW/NORMAL merge, HELD held, deploy + apply + sweep run ──"
scenario s1 "1 1 1" "$T0\tmigration 20260908120000: 0 files on jicate/main match (need exactly 1)\tsoft" "$SHA0" "$READY_META" "3" go --approve-normal
R="$TMP/s1/receipt.txt"; TR="$TMP/s1/trace.txt"
check "1- harness: the real sibling files were sourced (ledger, policy, lanes)" $(hasnot "$TR" "SIBLINGS_NOT_SOURCED"; echo $?)
check "1a soft: LOW #1 merged (gh pr merge 1 in trace)"          $(has "$TR" "gh pr merge 1 "; echo $?)
check "1b soft: NORMAL #2 merged (--approve-normal honoured)"     $(has "$TR" "gh pr merge 2 "; echo $?)
check "1c soft: HELD #3 NOT merged although approved"            $(hasnot "$TR" "gh pr merge 3 "; echo $?)
check "1d soft: HELD #4 NOT merged"                              $(hasnot "$TR" "gh pr merge 4 "; echo $?)
check "1e soft: receipt says HELD held while stopped, approval kept" $(has "$R" "HELD: held while stopped (soft freeze)"; echo $?) "$(grep HELD "$R")"
check "1f soft: approve-held file still holds 3 (never a lost approval)" $(grep -qx 3 "$TMP/s1/home/.config/obsidian/.ship-wave/approve-held"; echo $?)
check "1g soft: unblock_lanes ran"                               $(has "$TR" "UNBLOCK_LANES_CALLED"; echo $?)
check "1h soft: apply step ran (apply_migrations handed this round's files)" $(has "$TR" "APPLY_CALLED"; echo $?)
check "1i soft: deploy hook fired (curl -X POST)"                $(has "$TR" "curl -s -X POST"; echo $?)
check "1j soft: last-deployed written from Vercel meta.githubCommitSha" $([ "$(cat "$TMP/s1/home/.config/obsidian/.ship-wave/last-deployed")" = "meta-sha-from-vercel" ]; echo $?) "$(cat "$TMP/s1/home/.config/obsidian/.ship-wave/last-deployed" 2>&1)"
check "1k soft: banner says merging LOW/NORMAL, holding HELD"     $(has "$R" "FROZEN (soft) since:"; echo $?)
check "1l soft: scoreboard shows the class"                      $(has "$R" "frozen: soft (merging LOW/NORMAL, holding HELD)"; echo $?) "$(grep SCOREBOARD "$R")"
check "1m soft: sweep gate reached after READY (L2 probed the merged route)" $(has "$R" "L2 1 ok"; echo $?) "$(grep 'L2' "$R")"
check "1n soft: HTML banner carries the class"                   $(grep -qF "FROZEN (soft — merging LOW/NORMAL, holding HELD" "$(cat "$TMP/s1/html.path")"; echo $?)
check "1o soft: no HELD question — the only HELD PRs are #3 (approved) and #4 → asked for #4 only" $(grep -q 'ASK kind=held class=held title=1 HELD PR ready for your OK: #4' "$TR"; echo $?) "$(grep ASK "$TR")"

echo "── (2) hard freeze: no merge, no deploy, no lanes; one-line reason; HELD question still asked ──"
scenario s2 "1 1 1" "$T0\tmigration 20260910030000: destructive statement in 20260910030000_cron_run_log — a human applies this one after review\thard" "$SHA0" "$READY_META" "" go --approve-normal
R="$TMP/s2/receipt.txt"; TR="$TMP/s2/trace.txt"
check "2a hard: nothing merged"                                  $(hasnot "$TR" "gh pr merge"; echo $?)
check "2b hard: hook NOT fired"                                  $(hasnot "$TR" "curl -s -X POST"; echo $?)
check "2c hard: unblock_lanes NOT run"                           $(hasnot "$TR" "UNBLOCK_LANES_CALLED"; echo $?)
check "2d hard: apply NOT run"                                   $(hasnot "$TR" "APPLY_CALLED"; echo $?)
check "2e hard: receipt names the class"                         $(has "$R" "FROZEN (hard) since:"; echo $?)
check "2f hard: merge stage says hard freeze"                    $(has "$R" "(plan mode or hard freeze — nothing merged)"; echo $?)
check "2g hard: HTML banner says nothing merges, nothing ships"  $(grep -qF "FROZEN (hard — nothing merges, nothing ships)" "$(cat "$TMP/s2/html.path")"; echo $?)
check "2h hard: HELD question asked with #3 #4, approve-all and none-today" $(grep -q 'ASK kind=held class=held title=2 HELD PRs ready for your OK: #3 #4' "$TR" && grep -q '"Approve all listed"' "$TR" && grep -q '"None today"' "$TR" && grep -q '"file": "approve-held", "value": "3"' "$TR"; echo $?) "$(grep ASK "$TR")"

echo "── (3) soft freeze + main ahead of last-deployed, zero merges → deploy + apply + sweep; hand-merges listed ──"
# two commits land on main AFTER the freeze started: #77 by hand, #78 by the wave (recorded in a run's merged-map.tsv)
mkdir -p "$WTDIR/app/api/y" "$WTDIR/supabase/migrations"
echo "export {}" > "$WTDIR/app/api/y/route.ts"; echo "create table t(id int);" > "$WTDIR/supabase/migrations/20260910120000_hand.sql"
gitc add -A >/dev/null; gitc commit -q -m "feat: hand-merged thing (#77)"
echo "# b" > "$WTDIR/docs/b.md"; gitc add -A >/dev/null; gitc commit -q -m "docs: wave-merged thing (#78)"
gitc push -q jicate HEAD:main 2>/dev/null; SHA1=$(gitc rev-parse HEAD)
mkdir -p "$TMP/s3/home/.config/obsidian/.ship-wave/run-20260910-000000"; printf '78\tdocs/b.md\n' > "$TMP/s3/home/.config/obsidian/.ship-wave/run-20260910-000000/merged-map.tsv"
scenario s3 "0 0 0" "$T0\tmigration 20260908120000: 0 files on jicate/main match (need exactly 1)\tsoft" "$SHA0" "$READY_NOMETA" "" go --approve-normal
R="$TMP/s3/receipt.txt"; TR="$TMP/s3/trace.txt"
check "3a main-ahead: zero merges this round"                    $(has "$R" "merged this round: 0"; echo $?)
check "3b main-ahead: receipt says shipping what is already on main" $(has "$R" "main is ahead of production with zero merges this round"; echo $?) "$(grep -i 'main' "$R" | head -3)"
check "3c main-ahead: deploy hook fired"                         $(has "$TR" "curl -s -X POST"; echo $?)
check "3d main-ahead: apply handed the hand-merged migration"    $(grep -q 'APPLY_CALLED.*supabase/migrations/20260910120000_hand.sql' "$TR"; echo $?) "$(grep APPLY "$TR")"
check "3e main-ahead: sweep probed the hand-merged route (L2)"   $(has "$R" "L2 1 ok"; echo $?) "$(grep L2 "$R")"
check "3f main-ahead: last-deployed advanced to main HEAD (fallback: no meta sha from Vercel)" $([ "$(cat "$TMP/s3/home/.config/obsidian/.ship-wave/last-deployed")" = "$SHA1" ]; echo $?) "$(cat "$TMP/s3/home/.config/obsidian/.ship-wave/last-deployed")"
check "3g hand-merged: #77 listed, #78 (wave's own) not"        $(grep -q 'merged by hand while stopped: #77 *$' "$R"; echo $?) "$(grep 'by hand' "$R")"
check "3h hand-merged: HTML banner lists #77"                    $(grep -qF "merged by hand while stopped: #77" "$(cat "$TMP/s3/html.path")"; echo $?)

echo "── (3x) hard freeze + main ahead → nothing ships, one-line reason ──"
scenario s3x "0 0 0" "$T0\tmigration 20260906213000: DRY-RUN failed — ERROR: 2BP01\thard" "$SHA0" "$READY_NOMETA" "" go
R="$TMP/s3x/receipt.txt"; TR="$TMP/s3x/trace.txt"
check "3x-a hard+ahead: hook NOT fired"                          $(hasnot "$TR" "curl -s -X POST"; echo $?)
check "3x-b hard+ahead: one-line reason in the receipt"          $(grep -q '^  ⛔ hard freeze — main (.*) is ahead of production (.*) but NOTHING ships until the stop is lifted: migration 20260906213000: DRY-RUN failed' "$R"; echo $?) "$(grep 'hard freeze' "$R")"
check "3x-c hard+ahead: last-deployed untouched"                 $([ "$(cat "$TMP/s3x/home/.config/obsidian/.ship-wave/last-deployed")" = "$SHA0" ]; echo $?)

echo "── (3y) not frozen, main == last-deployed, zero merges → no deploy (the trigger is quiet when nothing is ahead) ──"
scenario s3y "0 0 0" "" "$SHA1" "$READY_NOMETA" "" go
R="$TMP/s3y/receipt.txt"; TR="$TMP/s3y/trace.txt"
check "3y-a no-ahead: hook NOT fired"                            $(hasnot "$TR" "curl -s -X POST"; echo $?)
check "3y-b no-ahead: receipt says nothing merged / no hook"     $(has "$R" "nothing merged / --no-deploy → no hook fired"; echo $?)

echo "── (4) --unfreeze clears the file — latch and class together ──"
mkdir -p "$TMP/s4/home/.config/obsidian/.ship-wave"; printf '%s\tpeer hold on #3410\tsoft\n' "$T0" > "$TMP/s4/home/.config/obsidian/.ship-wave/FROZEN"
out=$(HOME="$TMP/s4/home" bash "$SW/ship-wave.sh" --unfreeze 2>&1)
check "4a --unfreeze removes FROZEN"                             $([ ! -e "$TMP/s4/home/.config/obsidian/.ship-wave/FROZEN" ]; echo $?)
check "4b --unfreeze reports the class it cleared"               $([ "$out" = "freeze cleared (was soft)" ]; echo $?) "$out"

echo "── (5) classify_freeze: one message from each ledger class lands in the right row ──"
(
  export HOME="$TMP/s5"; mkdir -p "$HOME"; cd "$ROOT" || exit 9
  set -- plan; . "$TMP/wave.sh" >/dev/null 2>&1
  t() { local got rc; got=$(classify_freeze "$2"); rc=$?; if [ "$got" = "$1" ] && [ "$rc" -eq "${3:-0}" ]; then echo "PASS  5 classify → $1: ${2:0:70}"; else echo "FAIL  5 classify → wanted $1 (rc ${3:-0}) got $got (rc $rc): ${2:0:70}"; fi; }
  t hard "deploy dpl_GWVMQfKoT7wX1kwgkCxRuX4EZmau → ERROR BUILD_FAILED; on main but NOT live: #3296"
  t hard "deploy failed TWICE (attempt 2 = dpl_x → ERROR -); on main but NOT live: #1"
  t hard "migration APPLY failed run 33957269672"
  t hard "migration 20260906213000: APPLY failed — relation exists"
  t hard "migration 20260906213000: DRY-RUN failed — Failed to run sql query: ERROR:  2BP01"
  t hard "migration 20260910030000: destructive statement in 20260910030000_cron_run_log — a human applies this one after review"
  t hard "GATE ERROR: merge guard unreachable"
  t hard "migration gap: 20260901000000 on main but not in history"
  t hard "migration 20260908120000: cannot read supabase/migrations/x.sql from jicate/main"
  t hard "migration 20260908120000: the history query failed (401 = stale access token, not a missing table)"
  t hard "broken page after deploy: 3 page×role load(s) returned 5xx; on main: #1"
  t hard "post-deploy sweep failed — L2: /api/x→500 L1: none · likely PRs: #1"
  t soft "peer hold on #3410 — Director asked to wait"
  t soft "migration 20260908120000: 0 files on jicate/main match (need exactly 1)"
  t soft "conflict verdict UNRESOLVABLE for #3179 after two helper tabs"
  t soft "policy question P2 awaiting ratification"
  t soft "advisory check 'SDK multi-agent review' red on every PR"
  t hard "something nobody has seen before" 1
) | tee "$TMP/s5.out"
PASS=$((PASS + $(grep -c '^PASS' "$TMP/s5.out"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/s5.out")))

echo "── (6) freeze() writes the class as field 3; unknown → hard and says so; missing field reads as hard; freeze asks ──"
(
  export HOME="$TMP/s6"; mkdir -p "$HOME"; cd "$ROOT" || exit 9
  set -- plan; . "$TMP/wave.sh" >/dev/null 2>&1
  ASKLOG="$HOME/ask.log"; : > "$ASKLOG"
  ask_director() { printf 'kind=%s class=%s title=%s\nbody=%s\nopts=%s\n' "$1" "$2" "$3" "$4" "$5" >> "$ASKLOG"; }
  freeze "migration 20260908120000: 0 files on jicate/main match (need exactly 1)" > "$HOME/f1.out"
  l=$(tail -1 "$FREEZE"); c=$(printf '%s' "$l" | awk -F'\t' '{print NF" "$3}')
  [ "$c" = "3 soft" ] && echo "PASS  6a freeze() wrote 3 tab-separated fields, class soft" || echo "FAIL  6a fields/class: $c"
  grep -q 'FROZEN (soft):.*merging LOW/NORMAL, holding HELD' "$HOME/f1.out" && echo "PASS  6b soft freeze line says merging LOW/NORMAL, holding HELD" || echo "FAIL  6b $(cat "$HOME/f1.out")"
  grep -q '^kind=freeze class=soft title=' "$ASKLOG" && grep -q '"label":"Keep it stopped"' "$ASKLOG" && grep -q '"op":"unfreeze"' "$ASKLOG" && echo "PASS  6c freeze asked the Director (kind=freeze, class=soft, Lift/Keep options)" || echo "FAIL  6c $(cat "$ASKLOG")"
  grep -q 'Allow this one migration' "$ASKLOG" && echo "FAIL  6d a non-destructive freeze must not offer the allow option" || echo "PASS  6d non-destructive freeze: no allow option"
  [ "$(freeze_class_now)" = soft ] && echo "PASS  6e freeze_class_now reads soft from the last line" || echo "FAIL  6e $(freeze_class_now)"
  : > "$ASKLOG"
  freeze "migration 20260910030000: destructive statement in 20260910030000_cron_run_log — a human applies this one after review" > "$HOME/f2.out"
  [ "$(freeze_class_now)" = hard ] && echo "PASS  6f destructive statement → hard, and the LAST line wins" || echo "FAIL  6f $(freeze_class_now)"
  grep -q '"label":"Allow this one migration"' "$ASKLOG" && grep -q '"file":"allow-destructive","value":"20260910030000"' "$ASKLOG" && echo "PASS  6g destructive freeze offers 'Allow this one migration' with the parsed version" || echo "FAIL  6g $(cat "$ASKLOG")"
  grep -q '^kind=freeze class=hard' "$ASKLOG" && echo "PASS  6h destructive question carries class=hard" || echo "FAIL  6h $(head -1 "$ASKLOG")"
  freeze "something nobody has seen before" > "$HOME/f3.out"
  grep -q 'matched no row of classify_freeze — treated as HARD' "$HOME/f3.out" && [ "$(freeze_class_now)" = hard ] && echo "PASS  6i unknown message → hard, and the receipt says it was unclassified" || echo "FAIL  6i $(cat "$HOME/f3.out")"
  printf '%s\told two-field line\n' "$T0" > "$FREEZE"
  [ "$(freeze_class_now)" = hard ] && echo "PASS  6j a pre-class two-field FROZEN line reads as hard (fail safe)" || echo "FAIL  6j $(freeze_class_now)"
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

echo "── syntax ──"
for f in "$SW/ship-wave.sh" "$0"; do bash -n "$f" && ok "bash -n $(basename "$f")" || bad "bash -n $(basename "$f")"; done

echo; echo "=== $PASS passed · $FAIL failed · fixtures in $TMP ==="
[ "$FAIL" -eq 0 ]

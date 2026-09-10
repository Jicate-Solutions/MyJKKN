#!/opt/homebrew/bin/bash
# tests/verify-freeze-classes-adversarial-v2.sh — SECOND adversarial pass over HUMAN-IN-THE-LOOP.md §B/§C
# (slice B+C) at 65acbd8d14, written by a fresh verifier 2026-09-10. Re-attempts the round-1 breaks (D2, F3, H1,
# G3) with the same inputs, then hunts new ones. Same harness shape as test-freeze-classes.sh: the real run_once is
# sourced, gh/curl are stubs that record every call, jicate/main is a real bare repo in a temp dir, a merge MOVES
# main, $STATE is a temp HOME. Knobs this file adds: APPLY_MODE (the 3b stub can freeze soft/hard mid-round and
# return 0/1), DISPATCH_LOG, FILES_FAIL (one PR whose `--json files` answers nothing), SWEEP_FREEZE (a freeze that
# lands between preflight and the merge stage), DJSON_READY (a separate answer to the &state=READY query).
# FAIL lines prefixed BREAK are real property violations found in this pass; INFO lines are observations.
# Run from the worktree root:  bash scripts/ship-wave/tests/verify-freeze-classes-adversarial-v2.sh
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"

ROOT=$(cd "$(dirname "$0")/../../.." && pwd); SW="$ROOT/scripts/ship-wave"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-freeze-adv2.XXXXXX")
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf 'FAIL  %s\n      %s\n' "$1" "${2:-}"; }
check() { if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1" "$3"; fi; }
has()    { grep -qF -- "$2" "$1"; }
hasnot() { ! grep -qF -- "$2" "$1"; }
posts()  { grep -c 'curl -s -X POST' "$1"; }

awk '/^if \[ -n "\$GOAL" \]; then$/ {exit} {print}' "$SW/ship-wave.sh" > "$TMP/wave.sh"
awk '/^if \[ -n "\$GOAL" \]; then$/ {p=1} p {print}' "$SW/ship-wave.sh" > "$TMP/goal-block.sh"
for f in "$SW"/*.sh "$SW"/*.py; do [ "$(basename "$f")" = ship-wave.sh ] || ln -s "$f" "$TMP/$(basename "$f")"; done

export MYJKKN_LOCAL="$TMP/local"; WTDIR="$MYJKKN_LOCAL/.claude/worktrees/ship-main"
git init -q --bare "$TMP/origin.git"; mkdir -p "$(dirname "$WTDIR")"
git clone -q -o jicate "$TMP/origin.git" "$WTDIR" 2>/dev/null
gitc() { git -C "$WTDIR" -c user.name=t -c user.email=t@t "$@"; }
mkdir -p "$WTDIR/app/api/x" "$WTDIR/docs"
echo "# 0" > "$WTDIR/docs/zero.md"; gitc add -A >/dev/null; gitc commit -q -m "genesis"; gitc push -q jicate HEAD:main 2>/dev/null
SHA_G=$(gitc rev-parse HEAD)
echo "export {}" > "$WTDIR/app/api/x/route.ts"; echo "# a" > "$WTDIR/docs/a.md"
gitc add -A >/dev/null; gitc commit -q -m "base"; gitc push -q jicate HEAD:main 2>/dev/null
SHA0=$(gitc rev-parse HEAD)
main_head() { git -C "$WTDIR" fetch jicate main -q 2>/dev/null; git -C "$WTDIR" rev-parse jicate/main; }
ready_at() { printf '{"deployments":[{"uid":"dpl_%s","readyState":"READY","meta":{"githubCommitSha":"%s"}}]}' "${2:-1}" "$1"; }
UNKNOWN_SHA=0000000000000000000000000000000000000000

mk_plan() {
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

# [PRE=…] [AFTER=json|auto] [DJSON_READY=json] [APPLY_MODE=soft_fail|hard_fail|hard_ok] [DISPATCH_LOG=1] [FILES_FAIL=n] [SWEEP_FREEZE=line]
#   scenario <name> <plan-flags> <FROZEN-content(%b)|""> <last-deployed|""> <deploy-json> <approve-held-file|""> <args…>
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
    TRACE="$S/trace.txt"; : > "$TRACE"; export TRACE FIXPLAN="$S/plan.json" DJSON="$djson" DJSON_AFTER="${AFTER:-}" DJSON_READY="${DJSON_READY:-}" POSTED="$S/posted" WTDIR
    export APPLY_MODE="${APPLY_MODE:-}" DISPATCH_LOG="${DISPATCH_LOG:-}" FILES_FAIL="${FILES_FAIL:-}" SWEEP_FREEZE="${SWEEP_FREEZE:-}"
    set -- "$@"
    . "$TMP/wave.sh" >/dev/null 2>&1
    type -t ledger_on_freeze >/dev/null && type -t policy_active >/dev/null && type -t unblock_lanes >/dev/null || { echo "SIBLINGS_NOT_SOURCED" >> "$TRACE"; exit 9; }
    sweep() { cp "$FIXPLAN" "$1/plan.json"; [ -n "$SWEEP_FREEZE" ] && printf '%b\n' "$SWEEP_FREEZE" >> "$FREEZE"; return 0; }
    unblock_lanes() { echo "UNBLOCK_LANES_CALLED" >> "$TRACE"; }
    dispatch_clusters() { [ -n "$DISPATCH_LOG" ] && echo "DISPATCH_CALLED $1" >> "$TRACE"; :; }
    alive_helpers() { printf 0; }; rebase_remaining() { return 0; }
    apply_migrations() {
      echo "APPLY_CALLED $(tr '\n' ' ' < "$1")" >> "$TRACE"; APPLY_RESULT="stubbed"
      case "$APPLY_MODE" in
        soft_fail) freeze "migration 20260908120000: 0 files on jicate/main match (need exactly 1)"; APPLY_RESULT="FAILED at 20260908120000"; return 1;;
        hard_fail) freeze "migration 20260908120000: APPLY failed — relation exists"; APPLY_RESULT="FAILED at 20260908120000"; return 1;;
        hard_ok)   freeze "migration 20260908120000: APPLY failed — relation exists"; return 0;;   # a buggy apply: froze hard, then said ok
      esac; return 0
    }
    vtok() { printf 'tok'; }; sleep() { :; }
    gh() {
      echo "gh $*" >> "$TRACE"
      case "$*" in
        "auth token"|"auth status") return 0;;
        *"--json state,mergeStateStatus"*) echo "OPEN CLEAN false main";;
        *"--json statusCheckRollup"*) echo 0;;
        "pr merge "*) # a squash merge lands the PR's real content on main (not an empty commit): a later diff must see it
          case "$3" in 1) echo "# $RANDOM" >> "$WTDIR/docs/a.md";; 2) echo "// $RANDOM" >> "$WTDIR/app/api/x/route.ts";; 3) mkdir -p "$WTDIR/app/api/fees"; echo "// $RANDOM" >> "$WTDIR/app/api/fees/route.ts";; 4) mkdir -p "$WTDIR/supabase/migrations"; echo "select $RANDOM;" >> "$WTDIR/supabase/migrations/20260910100000_t.sql";; esac
          git -C "$WTDIR" -c user.name=t -c user.email=t@t add -A >/dev/null; git -C "$WTDIR" -c user.name=t -c user.email=t@t commit -q --allow-empty -m "merged by the wave (#$3)" && git -C "$WTDIR" push -q jicate HEAD:main 2>/dev/null; return 0;;
        *"--json files"*) [ "$3" = "$FILES_FAIL" ] && return 0; case "$3" in 1) echo docs/a.md;; 2) echo app/api/x/route.ts;; 3) echo app/api/fees/route.ts;; 4) echo supabase/migrations/20260910100000_t.sql;; esac;;
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
          elif [ -n "$DJSON_READY" ]; then case "$*" in *"state=READY"*) echo "$DJSON_READY";; *) echo "$DJSON";; esac
          else echo "$DJSON"; fi;;
        *"-o /dev/null"*) echo 401;;
      esac; return 0
    }
    ask_director() { printf 'ASK kind=%s class=%s title=%s\nASK-OPTS %s\n' "$1" "$2" "$3" "$5" >> "$TRACE"; }
    _REDIR_DONE=1
    run_once > "$S/receipt.txt" 2>&1; echo "rc=$?" >> "$TRACE"
  )
}
marker() { cat "$TMP/$1/home/.config/obsidian/.ship-wave/last-deployed" 2>/dev/null; }
frz()    { cat "$TMP/$1/home/.config/obsidian/.ship-wave/FROZEN" 2>/dev/null; }
READY_NOMETA='{"deployments":[{"uid":"dpl_2","readyState":"READY"}]}'
T0=$(date -v-2M '+%F %T')
HARD_LINE="$T0\tmigration 1: APPLY failed — x\thard"
SOFT_LINE="$T0\tpeer hold on #9\tsoft"

echo "══ R. round-1 breaks, re-attempted with the SAME inputs ══"
# R-D2: hard + leftover deploy-pending + plain go, production (marker fallback) behind main
PRE='printf "app/api/x/route.ts\n" > "$ST/deploy-pending"' scenario r_d2 "0 0 0" "$HARD_LINE" "$SHA_G" "$READY_NOMETA" "" go
check "R-D2  hard + leftover batch + plain go → hook NOT fired"   $([ "$(posts "$TMP/r_d2/trace.txt")" -eq 0 ]; echo $?) "$(grep -E 'hook|batch' "$TMP/r_d2/receipt.txt")"
check "R-D2b … batch kept on disk, marker untouched, receipt says why" $([ -s "$TMP/r_d2/home/.config/obsidian/.ship-wave/deploy-pending" ] && [ "$(marker r_d2)" = "$SHA_G" ] && has "$TMP/r_d2/receipt.txt" "NOT flushing the leftover batch — hard freeze"; echo $?) "$(grep -E 'flush' "$TMP/r_d2/receipt.txt")"
# R-F3: marker = a sha the worktree has never seen, main has app+migration ahead, soft
scenario r_f3 "0 0 0" "$SOFT_LINE" "$UNKNOWN_SHA" "$READY_NOMETA" "" go --approve-normal
check "R-F3  unknown marker sha → hook NOT fired, NOT read as docs-only, marker untouched" $([ "$(posts "$TMP/r_f3/trace.txt")" -eq 0 ] && hasnot "$TMP/r_f3/receipt.txt" "nothing to deploy" && [ "$(marker r_f3)" = "$UNKNOWN_SHA" ]; echo $?) "$(grep -E 'main vs|nothing to deploy' "$TMP/r_f3/receipt.txt")"
check "R-F3b receipt: 'cannot tell what is deployed' + /deploy-myjkkn"  $(has "$TMP/r_f3/receipt.txt" "cannot tell what is deployed" && has "$TMP/r_f3/receipt.txt" "/deploy-myjkkn"; echo $?)
# R-H1: Vercel READY sha == main HEAD, marker stale → nothing is ahead
HEADH=$(main_head)
scenario r_h1 "0 0 0" "$SOFT_LINE" "$SHA_G" "$(ready_at "$HEADH" 9)" "" go --approve-normal
check "R-H1  Vercel READY == main HEAD, marker stale → hook NOT fired, marker rewritten from Vercel" $([ "$(posts "$TMP/r_h1/trace.txt")" -eq 0 ] && [ "$(marker r_h1)" = "$HEADH" ]; echo $?) "$(grep -E 'main vs|hook' "$TMP/r_h1/receipt.txt")"
# R-G3: GitHub merge-button subject
echo "# d" > "$WTDIR/docs/d.md"; gitc add -A >/dev/null; gitc commit -q -m "Merge pull request #79 from someone/fix-thing"
echo "# e" > "$WTDIR/docs/e.md"; gitc add -A >/dev/null; gitc commit -q -m "docs: wave-merged thing (#78)"
echo "# f" > "$WTDIR/docs/f.md"; gitc add -A >/dev/null; gitc commit -q -m "feat: squash shape (#77)"; gitc push -q jicate HEAD:main 2>/dev/null; SHA1=$(gitc rev-parse HEAD)
PRE='mkdir -p "$ST/run-20260910-000000"; printf "78\tdocs/e.md\n" > "$ST/run-20260910-000000/merged-map.tsv"' scenario r_g3 "0 0 0" "$HARD_LINE" "$SHA1" "$(ready_at "$SHA1")" "" go
HM=$(grep 'merged by hand while stopped:' "$TMP/r_g3/receipt.txt")
check "R-G3  'Merge pull request #79' listed; squash #77 listed; the wave's #78 not" $(grep -q '#79' <<<"$HM" && grep -q '#77' <<<"$HM" && ! grep -q '#78' <<<"$HM"; echo $?) "$HM"
# R-D3 (INFO in round 1): soft + leftover batch + plain go → §C says ship
PRE='printf "app/api/x/route.ts\n" > "$ST/deploy-pending"' AFTER=auto scenario r_d3 "0 0 0" "$SOFT_LINE" "$SHA_G" "$READY_NOMETA" "" go
check "R-D3  CONTROL soft + leftover batch + plain go → fires once (§C: shipping still runs)" $([ "$(posts "$TMP/r_d3/trace.txt")" -eq 1 ]; echo $?)
echo "INFO  R-B4..B7 (round-1 INFO): 2-field peer hold / 'SOFT' / 'soft ' / trailing blank all still read as HARD (fail-safe) — asserted in N2 below"

echo "══ N1. spec table: every hard row → hard, every soft row → soft, unknown → hard — through freeze() + deploy_allowed, not only classify_freeze ══"
( export HOME="$TMP/n1"; mkdir -p "$HOME"; cd "$ROOT" || exit 9; set -- go; . "$TMP/wave.sh" >/dev/null 2>&1
  t() { # $1 want class · $2 message → drive freeze(), then read freeze_class_now and deploy_allowed
    rm -f "$FREEZE"; freeze "$2" >/dev/null; local c; c=$(freeze_class_now); deploy_allowed; local d=$?
    if [ "$c" = "$1" ] && { { [ "$1" = hard ] && [ $d -ne 0 ]; } || { [ "$1" = soft ] && [ $d -eq 0 ]; }; }; then printf 'PASS  N1 %s / deploy %s ← %s\n' "$c" "$( [ $d -eq 0 ] && echo allowed || echo refused)" "${2:0:72}"; else printf 'FAIL  N1 want %s got %s deploy_allowed=%s ← %s\n' "$1" "$c" "$d" "${2:0:90}"; fi; }
  t hard "deploy dpl_abc → ERROR BUILD_FAILED; on main but NOT live: #3296"
  t hard "deploy dpl_abc → CANCELED -; on main but NOT live: #3296"
  t hard "deploy failed TWICE (attempt 2 = dpl_x → ERROR -); on main but NOT live: #1"
  t hard "migration 20260906213000: APPLY failed — relation exists"
  t hard "migration 20260906213000: DRY-RUN failed — ERROR: 2BP01"
  t hard "migration 20260910030000: destructive statement in 20260910030000_cron.sql — a human applies this one after review"
  t hard "GATE ERROR: merge guard unreachable"
  t hard "migration gap: 20260901000000 on main but not in history"
  t hard "migration 20260908120000: cannot read supabase/migrations/x.sql from jicate/main"
  t hard "migration 20260908120000: the history query failed (401 = stale access token, not a missing table)"
  t hard "migration 20260908120000: APPLIED but the history insert failed — err (record it by hand, then --unfreeze)"
  t hard "migration 20260908120000: applied + recorded, but the verify read did not find it"
  t hard "broken page after deploy: 3 page×role load(s) returned 5xx (see run/l1.txt); on main: #1"
  t hard "baseline bounce after deploy — these loaded 200 before and now bounce to /auth/login: x; on main: #1"
  t hard "post-deploy sweep failed — L2: /api/x→500 L1: none · likely PRs: #1"
  t soft "peer hold on #3410 — Director asked to wait"
  t soft "Director hold: wait for the board meeting"
  t soft "#3410 on hold until the fee schedule is signed"
  t soft "migration 20260908120000: 0 files on jicate/main match (need exactly 1)"
  t soft "conflict verdict UNRESOLVABLE for #3179 after two helper tabs"
  t soft "policy question P2 awaiting ratification"
  t soft "advisory check 'SDK multi-agent review' red on every PR"
  t hard "something nobody has seen before"
  t hard "migration 20260906213000: APPLY failed — policy violation: peer hold"
  # the phone auto-capitalises the first letter of what he types into --freeze
  printf 'INFO  N1x phone-typed soft rows, capitalised: "Peer hold on #3410" → %s · "On hold: #3410" → %s · "PEER HOLD" → %s (case-sensitive anchors; fail-safe but the §B soft entry point misfires from an iPhone)\n' "$(classify_freeze "Peer hold on #3410")" "$(classify_freeze "On hold: #3410")" "$(classify_freeze "PEER HOLD on #3410")"
) | tee "$TMP/n1.out"; PASS=$((PASS + $(grep -c '^PASS' "$TMP/n1.out"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/n1.out")))

echo "══ N2. the FROZEN file itself: legacy, two lines, CRLF, odd class fields, empty, injected separators ══"
( export HOME="$TMP/n2"; mkdir -p "$HOME"; cd "$ROOT" || exit 9; set -- go; . "$TMP/wave.sh" >/dev/null 2>&1
  r() { local want="$1" label="$2"; local c; c=$(freeze_class_now); deploy_allowed; local d=$?
       if [ "$c" = "$want" ]; then printf 'PASS  N2 %s → %s (deploy %s)\n' "$label" "$c" "$( [ $d -eq 0 ] && echo allowed || echo refused)"; else printf 'FAIL  N2 %s → want %s got %s\n' "$label" "$want" "$c"; fi; }
  FREEZE="$TMP/n2/f"; printf '%s\tdeploy dpl_1 → ERROR; on main but NOT live: #5\n' "$T0" > "$FREEZE"; r hard "pre-change 2-field line"
  printf '%s\tpeer hold on #3410 — Director asked to wait\n' "$T0" > "$FREEZE"; r hard "2-field 'peer hold' (hand-written, old way) — fail-safe"
  printf '%s\tpeer hold on #1\tsoft\n%s\tmigration 1: APPLY failed — x\thard\n' "$T0" "$T0" > "$FREEZE"; r hard "soft then hard (LAST line wins)"
  printf '%s\tmigration 1: APPLY failed — x\thard\n%s\tpeer hold on #1\tsoft\n' "$T0" "$T0" > "$FREEZE"; r soft "hard then soft (LAST line wins — see N3 for why this is a break)"
  printf '%s\tpeer hold on #1\tsoft\r\n' "$T0" > "$FREEZE"; r hard "CRLF soft line ('soft\\r') — fail-safe"
  printf '%s\tmigration 1: APPLY failed — x\thard\r\n' "$T0" > "$FREEZE"; r hard "CRLF hard line"
  printf '%s\tmsg\tSOFT\n' "$T0" > "$FREEZE"; r hard "class field 'SOFT'"
  printf '%s\tmsg\tsoft \n' "$T0" > "$FREEZE"; r hard "class field 'soft ' (trailing space)"
  printf '%s\tmsg\tsoft\n\n' "$T0" > "$FREEZE"; r hard "trailing blank line after soft"
  : > "$FREEZE"; r hard "EMPTY FROZEN file (0 bytes) — latch on, class hard"
  printf '%s\tpeer hold on #1\tsoft\thard\n' "$T0" > "$FREEZE"; r soft "4 fields with field 4 = 'hard' (field 3 rules; field 4 is the ledger slug)"
  # separator injection THROUGH freeze() itself: a TAB inside a hard message shifts the class column
  rm -f "$FREEZE"; freeze $'migration 20260906213000: APPLY failed\tsoft' >/dev/null
  c=$(freeze_class_now); deploy_allowed; d=$?
  if [ "$c" = hard ] && [ $d -ne 0 ]; then echo "PASS  N2i tab inside a HARD message → still hard"; else printf 'FAIL  N2i BREAK a TAB inside a hard freeze message flips the class: freeze_class_now=%s deploy_allowed=%s · FROZEN line: %s\n' "$c" "$d" "$(tail -1 "$FREEZE" | tr '\t' '|')"; fi
  rm -f "$FREEZE"; freeze $'deploy dpl_1 → ERROR; on main but NOT live: #5\nsecond line\tx\tsoft' >/dev/null
  c=$(freeze_class_now); deploy_allowed; d=$?
  if [ "$c" = hard ] && [ $d -ne 0 ]; then echo "PASS  N2j newline inside a HARD message → still hard"; else printf 'FAIL  N2j BREAK a NEWLINE inside a hard freeze message makes an attacker-shaped last line: freeze_class_now=%s deploy_allowed=%s · last line: %s\n' "$c" "$d" "$(tail -1 "$FREEZE" | tr '\t' '|')"; fi
  # the writer's realistic input: resp_error() strips \n but not \t — so a Management-API message with a tab reaches freeze()
  rm -f "$FREEZE"; freeze $'migration 20260906213000: DRY-RUN failed — non-JSON response: <html>\t<body>502</body>' >/dev/null
  printf 'INFO  N2k realistic tab (an HTML 502 body through resp_error): class in force = %s (field 3 became "%s") — fail-safe here, but only because the injected token is not literally "soft"\n' "$(freeze_class_now)" "$(tail -1 "$FREEZE" | cut -f3 | cut -c1-20)"
) | tee "$TMP/n2.out"; PASS=$((PASS + $(grep -c '^PASS' "$TMP/n2.out"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/n2.out")))

echo "══ N3. hard freeze in force, then --freeze 'peer hold …' from the phone: does the appended soft line lift the hard stop? ══"
mkdir -p "$TMP/n3/home/.config/obsidian/.ship-wave"; printf '%s\tmigration 20260906213000: APPLY failed — relation exists\thard\n' "$T0" > "$TMP/n3/home/.config/obsidian/.ship-wave/FROZEN"
HOME="$TMP/n3/home" bash "$SW/ship-wave.sh" --freeze "peer hold on #3410 — Director asked to wait" > "$TMP/n3/cli.out" 2>&1
N3F="$TMP/n3/home/.config/obsidian/.ship-wave/FROZEN"
echo "INFO  N3 FROZEN after the CLI: $(wc -l < "$N3F") lines; last class field = $(tail -1 "$N3F" | cut -f3); first line still: $(head -1 "$N3F" | cut -f2,3 | tr '\t' '|')"
PRE='cp '"$N3F"' "$ST/FROZEN"' AFTER=auto scenario n3 "1 1 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "3" go --approve-normal
R="$TMP/n3/receipt.txt"; TR="$TMP/n3/trace.txt"
if [ "$(posts "$TR")" -eq 0 ] && hasnot "$TR" "gh pr merge"; then ok "N3 an appended soft line does NOT lift an unresolved hard stop"
else bad "N3 BREAK hard freeze (APPLY failed, unresolved) + --freeze 'peer hold' appended → the run is SOFT: merges=$(grep -c 'gh pr merge' "$TR") POSTs=$(posts "$TR") — code shipped on top of a failed migration (#1516 shape); the receipt banner reads: $(grep -m1 'FROZEN (' "$R" | cut -c1-90)" ""; fi
check "N3b … but HELD #3 still did not merge (soft gate held)" $(hasnot "$TR" "gh pr merge 3 "; echo $?)

echo "══ N4. hard freeze: every arm loaded — CLI + file HELD approvals, P1 ratified, migrations-pending, deploy-pending, main ahead ══"
PRE='printf "app/api/x/route.ts\n" > "$ST/deploy-pending"; echo 20260910120000 > "$ST/migrations-pending"; mkdir -p "$ST/policy"; echo ratified > "$ST/policy/AUTO_APPROVE_ADDITIVE_MIGRATIONS"' DISPATCH_LOG=1 scenario n4 "1 1 1" "$HARD_LINE" "$SHA_G" "$READY_NOMETA" "3
4" go --approve-normal --approve-held 3,4
R="$TMP/n4/receipt.txt"; TR="$TMP/n4/trace.txt"; ST4="$TMP/n4/home/.config/obsidian/.ship-wave"
check "N4a hard, everything armed: zero merges, zero POST, zero APPLY, lanes not run" $(hasnot "$TR" "gh pr merge" && [ "$(posts "$TR")" -eq 0 ] && hasnot "$TR" "APPLY_CALLED" && hasnot "$TR" "UNBLOCK_LANES_CALLED"; echo $?) "$(grep -E 'pr merge|POST|APPLY|UNBLOCK' "$TR")"
check "N4b hard: deploy-pending kept, migrations-pending kept, marker untouched, approve-held file intact" $([ -s "$ST4/deploy-pending" ] && [ -s "$ST4/migrations-pending" ] && [ "$(marker n4)" = "$SHA_G" ] && grep -qx 3 "$ST4/approve-held" && grep -qx 4 "$ST4/approve-held"; echo $?) "$(ls "$ST4"; marker n4)"
check "N4c hard: P1 not announced (frozen gate); no HELD question because every HELD PR is already in the approvals (they merge on the first unfrozen run)" $(hasnot "$R" "policy P1 (ratified)" && ! grep -q 'ASK kind=held' "$TR"; echo $?) "$(grep -E 'P1|ASK' "$R" "$TR")"
echo "INFO  N4d hard freeze: stage-2 dispatch_clusters (helper tabs · gh pr comment nudges · proven-SUPERSEDED auto-close) $(has "$TR" "DISPATCH_CALLED" && echo 'IS still called' || echo 'is not called') — inherited from the pre-slice code (never gated on frozen); the spec's hard row says 'sweep/report only'"
# the FINAL_DEPLOY route under hard, with the batch on disk (goal block sourced alone, run_once stubbed)
( export HOME="$TMP/n4f"; mkdir -p "$HOME/.config/obsidian/.ship-wave"; cd "$ROOT" || exit 9; set -- go --goal; . "$TMP/wave.sh" >/dev/null 2>&1
  GOAL_ROUNDS=1; sleep() { :; }; run_once() { echo "RUN_ONCE final=${FINAL_DEPLOY:-}" >> "$HOME/calls"; echo 0 > "$STATE/last-open-count"; return 0; }
  printf 'app/api/x/route.ts\n' > "$STATE/deploy-pending"; printf '%b\n' "$HARD_LINE" > "$FREEZE"
  . "$TMP/goal-block.sh" > "$HOME/out.txt" 2>&1
  ! grep -q 'final=1' "$HOME/calls" && grep -q 'NOT building — hard freeze' "$HOME/out.txt" && echo "PASS  N4e goal block under hard: FINAL_DEPLOY pass not run, receipt names the kept batch" || echo "FAIL  N4e $(cat "$HOME/calls"; cat "$HOME/out.txt")"
) | tee "$TMP/n4f.out"; PASS=$((PASS + $(grep -c '^PASS' "$TMP/n4f.out"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/n4f.out")))
# source trace: every hook POST sits inside a branch whose condition names deploy_allowed
awk '/curl -s -X POST "\$HOOK"/ {post[NR]=1} {line[NR]=$0} END {for (n in post) {g=0; for (i=n; i>n-8 && i>0; i--) if (line[i] ~ /(if|elif) .*deploy_allowed/) {g=1; break}; printf "%s %d\n", (g?"gated":"UNGATED"), n}}' "$SW/ship-wave.sh" > "$TMP/posts.txt"
check "N4f source: every hook POST site is inside an if/elif that names deploy_allowed ($(tr '\n' ';' < "$TMP/posts.txt"))" $([ "$(grep -c . "$TMP/posts.txt")" -eq 2 ] && ! grep -q UNGATED "$TMP/posts.txt"; echo $?) "$(cat "$TMP/posts.txt")"
check "N4g source: the only other POST in the wave family is apply-migrations' Management-API call, gated by 'hard' at stage 3b" $([ "$(grep -l -- '-X POST' "$SW"/*.sh | wc -l | tr -d ' ')" -eq 2 ] && grep -q 'if \[ "\$MODE" = "go" \] && \[ -z "\$hard" \] && { \[ "\$ship" -gt 0 \]' "$SW/ship-wave.sh"; echo $?) "$(grep -l -- '-X POST' "$SW"/*.sh)"

echo "══ N5. a freeze raised MID-round (after preflight) — apply freezes hard, apply lies, a soft freeze lands before the merge stage ══"
APPLY_MODE=hard_fail AFTER=auto scenario n5a "0 1 0" "$SOFT_LINE" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
check "N5a soft at preflight, apply freezes HARD and returns 1 → merged #2 but NO POST; receipt 'migration step failed'; FROZEN last = hard" $(has "$TMP/n5a/trace.txt" "gh pr merge 2 " && [ "$(posts "$TMP/n5a/trace.txt")" -eq 0 ] && has "$TMP/n5a/receipt.txt" "NOT deploying — migration step failed" && [ "$(frz n5a | tail -1 | cut -f3)" = hard ]; echo $?) "$(grep -E 'NOT deploying|hook' "$TMP/n5a/receipt.txt")"
APPLY_MODE=hard_ok AFTER=auto scenario n5b "0 1 0" "$SOFT_LINE" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
check "N5b apply freezes HARD but (buggy) returns 0 → deploy_allowed re-reads FROZEN → NO POST, 'NOT deploying — hard freeze'" $([ "$(posts "$TMP/n5b/trace.txt")" -eq 0 ] && has "$TMP/n5b/receipt.txt" "NOT deploying — hard freeze"; echo $?) "$(grep -E 'NOT deploying|hook' "$TMP/n5b/receipt.txt")"
SWEEP_FREEZE="$SOFT_LINE" AFTER=auto scenario n5c "0 0 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-held 3
echo "INFO  N5c a SOFT freeze that lands between preflight and the merge stage (e.g. --freeze from the phone mid-round): HELD #3 (approved) $(has "$TMP/n5c/trace.txt" "gh pr merge 3 " && echo 'STILL MERGED this round' || echo 'not merged') — \`frozen\` is read once at preflight; only the deploy gate re-reads the file"

echo "══ N6. soft freeze whose CAUSE is a migration: merges continue, deploy is blocked every round by the same apply failure ══"
APPLY_MODE=soft_fail AFTER=auto scenario n6 "1 1 0" "$T0\tmigration 20260908120000: 0 files on jicate/main match (need exactly 1)\tsoft" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
echo "INFO  N6 soft '0 files match' freeze + LOW/NORMAL ready: merges=$(grep -c 'gh pr merge' "$TMP/n6/trace.txt") POSTs=$(posts "$TMP/n6/trace.txt") · $(grep -m1 'NOT deploying' "$TMP/n6/receipt.txt" | sed 's/^ *//') · FROZEN now $(frz n6 | wc -l | tr -d ' ') lines — new merges land on main, nothing ships: the inverse of 'no NEW merges — shipping still runs' (the frozen migration blocks the whole apply)"

echo "══ N7. no empty builds / Vercel is the truth, marker the fallback — unreachable, garbage, in-flight ══"
mkdir -p "$WTDIR/app/api/z"; echo "export {}" > "$WTDIR/app/api/z/route.ts"; gitc add -A >/dev/null; gitc commit -q -m "feat: z by hand (#81)"; gitc push -q jicate HEAD:main 2>/dev/null
HEAD7=$(main_head)
scenario n7a "0 0 0" "$SOFT_LINE" "$UNKNOWN_SHA" "" "" go --approve-normal
check "N7a Vercel UNREACHABLE (empty answer) + marker unknown to the worktree → no build, marker NOT advanced" $([ "$(posts "$TMP/n7a/trace.txt")" -eq 0 ] && [ "$(marker n7a)" = "$UNKNOWN_SHA" ] && has "$TMP/n7a/receipt.txt" "cannot tell what is deployed"; echo $?) "$(grep -E 'main vs|last prod' "$TMP/n7a/receipt.txt")"
AFTER=auto scenario n7b "0 0 0" "$SOFT_LINE" "$SHA0" "" "" go --approve-normal
check "N7b Vercel UNREACHABLE + marker known (SHA0) + main ahead → ONE build, marker → main HEAD after READY" $([ "$(posts "$TMP/n7b/trace.txt")" -eq 1 ] && [ "$(marker n7b)" = "$(main_head)" ]; echo $?) "$(grep -E 'main is ahead|hook' "$TMP/n7b/receipt.txt"; marker n7b)"
scenario n7c "0 0 0" "$SOFT_LINE" "$UNKNOWN_SHA" "<html><body>502 Bad Gateway</body></html>" "" go --approve-normal
check "N7c Vercel answers HTML garbage + marker unknown → no build, marker untouched" $([ "$(posts "$TMP/n7c/trace.txt")" -eq 0 ] && [ "$(marker n7c)" = "$UNKNOWN_SHA" ]; echo $?)
scenario n7d "0 0 0" "$SOFT_LINE" "$SHA0" "" "" plan
echo "INFO  N7d PLAN mode with Vercel READY = main HEAD: marker before=SHA0 after=$( [ "$(marker n7d)" = "$SHA0" ] && echo 'unchanged' || echo "REWRITTEN to $(marker n7d | cut -c1-7)") (plan is documented as 'changes nothing'; writes to \$STATE only)"
DJSON_READY="$(ready_at "$HEAD7" 5)" scenario n7e "0 0 0" "$SOFT_LINE" "$SHA_G" '{"deployments":[{"uid":"dpl_b","readyState":"BUILDING"}]}' "" go --approve-normal
check "N7e latest Vercel record BUILDING, &state=READY record == main HEAD → no build (in-flight case reads the READY one)" $([ "$(posts "$TMP/n7e/trace.txt")" -eq 0 ] && has "$TMP/n7e/receipt.txt" "production already runs main HEAD" && grep -q 'state=READY' "$TMP/n7e/trace.txt"; echo $?) "$(grep -E 'main vs' "$TMP/n7e/receipt.txt")"
scenario n7f "0 0 0" "$SOFT_LINE" "$SHA_G" "$(ready_at "$HEAD7" 9)" "" go --approve-normal
check "N7f soft, zero merges, Vercel READY == main HEAD, marker stale → no build" $([ "$(posts "$TMP/n7f/trace.txt")" -eq 0 ]; echo $?)
# docs-only churn: Vercel keeps reporting the pre-docs sha (nothing was built), so every round says 'main is ahead' then 'nothing to deploy'
echo "# g" > "$WTDIR/docs/g.md"; gitc add -A >/dev/null; gitc commit -q -m "docs: g (#80)"; gitc push -q jicate HEAD:main 2>/dev/null; HEAD7b=$(gitc rev-parse HEAD)
scenario n7g1 "0 0 0" "$SOFT_LINE" "$HEAD7b" "$(ready_at "$HEAD7" 9)" "" go --approve-normal
scenario n7g2 "0 0 0" "$SOFT_LINE" "$(marker n7g1)" "$(ready_at "$HEAD7" 9)" "" go --approve-normal
check "N7g docs-only main-ahead, two rounds: 0 POST both rounds (no empty build)" $([ "$(posts "$TMP/n7g1/trace.txt")" -eq 0 ] && [ "$(posts "$TMP/n7g2/trace.txt")" -eq 0 ]; echo $?)
echo "INFO  N7g2 round 2 receipt still says: $(grep -m1 -E 'main is ahead|nothing to deploy' "$TMP/n7g2/receipt.txt" | cut -c1-100) — Vercel-primary pulls the marker back each preflight, so a docs-only advance never sticks (cosmetic churn, no build)"

echo "══ N8. 'merged by hand while stopped' vs the wave's own merges ══"
FILES_FAIL=2 AFTER=auto scenario n8a "0 1 0" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
echo "INFO  N8a the wave merged #2 while 'gh pr view 2 --json files' answered nothing: merged-map row for 2 = '$(cat "$TMP/n8a"/home/.config/obsidian/.ship-wave/run-*/merged-map.tsv | grep -c '^2	')' · deploy line: $(grep -m1 -E 'nothing to deploy|hook fired' "$TMP/n8a/receipt.txt" | sed 's/^ *//' | cut -c1-90) · POSTs=$(posts "$TMP/n8a/trace.txt")"
# every other wave merge on this fixture main (#1 #3 #78 from earlier scenarios) gets a merged-map row; n8a's #2 has none
PRE='cp -R '"$TMP"'/n8a/home/.config/obsidian/.ship-wave/run-* "$ST/"; mkdir -p "$ST/run-20260910-000001"; printf "1\tdocs/a.md\n3\tapp/api/fees/route.ts\n78\tdocs/e.md\n" > "$ST/run-20260910-000001/merged-map.tsv"' scenario n8b "0 0 0" "$SOFT_LINE" "$(main_head)" "$(ready_at "$(main_head)")" "" go
HM=$(grep 'merged by hand while stopped:' "$TMP/n8b/receipt.txt")
if grep -q '#2' <<<"$HM"; then bad "N8b BREAK the wave's OWN merge #2 is listed as 'merged by hand' after one transient gh failure on the file list — $HM" ""; else ok "N8b a wave merge whose file list failed to load is still not listed as hand-merged"; fi
check "N8c wave merges recorded in merged-map (#1 #3 #78) never listed; #77 #79 #80 #81 hand merges are" $(grep -q '#77' <<<"$HM" && grep -q '#79' <<<"$HM" && grep -q '#80' <<<"$HM" && grep -q '#81' <<<"$HM" && ! grep -qE '#(1|3|78) ' <<<"$HM "; echo $?) "$HM"
# N8d: the same transient failure makes a CODE merge read as docs-only → marker advanced without a build; sticky when Vercel has no sha
HEAD8=$(main_head)
FILES_FAIL=2 scenario n8d1 "0 1 0" "" "$HEAD8" "$READY_NOMETA" "" go --approve-normal
FILES=$(git -C "$WTDIR" diff --name-only "$HEAD8" "$(main_head)" | tr '\n' ' ')
scenario n8d2 "0 0 0" "" "$(marker n8d1)" "$READY_NOMETA" "" go --approve-normal
if [ "$(posts "$TMP/n8d1/trace.txt")" -eq 0 ] && [ "$(marker n8d1)" = "$(main_head)" ] && [ "$(posts "$TMP/n8d2/trace.txt")" -eq 0 ] && has "$TMP/n8d2/receipt.txt" "production already runs main HEAD"; then
  bad "N8d BREAK merged #2 (real diff: $FILES) with an EMPTY file list → read as docs-only → no build, marker advanced to main HEAD; next round (Vercel has no sha) says 'production already runs main HEAD' — the route change never ships" ""
else ok "N8d a merge whose file list failed is not read as docs-only"; fi
AFTER=auto scenario n8d3 "0 0 0" "" "$(marker n8d1)" "$(ready_at "$HEAD8" 3)" "" go --approve-normal
check "N8d-ctl CONTROL: when Vercel DOES report its sha (behind), the next round self-heals — main ahead → one build" $([ "$(posts "$TMP/n8d3/trace.txt")" -eq 1 ]; echo $?) "$(grep -E 'main vs|main is ahead|hook' "$TMP/n8d3/receipt.txt")"

echo "══ N9. --freeze CLI edge cases ══"
( export HOME="$TMP/n9"; mkdir -p "$HOME"; cd "$ROOT" || exit 9; set -- --freeze ""; . "$TMP/wave.sh" >/dev/null 2>&1
  printf 'INFO  N9a `ship-wave.sh --freeze ""` (a wrapped/lost phone message): FREEZE_MSG="%s" MODE=%s FROZEN written? %s — the ask to stop is silently a plan run\n' "${FREEZE_MSG:-}" "$MODE" "$( [ -f "$FREEZE" ] && echo yes || echo NO)" )
( export HOME="$TMP/n9b"; mkdir -p "$HOME"; cd "$ROOT" || exit 9; set -- --freeze; . "$TMP/wave.sh" >/dev/null 2>&1
  printf 'INFO  N9b `ship-wave.sh --freeze` (no message at all): MODE=%s FROZEN written? %s\n' "$MODE" "$( [ -f "$FREEZE" ] && echo yes || echo NO)" )
( export HOME="$TMP/n9c"; mkdir -p "$HOME"; cd "$ROOT" || exit 9; set -- go; . "$TMP/wave.sh" >/dev/null 2>&1
  long="migration 20260906213000: destructive statement in 20260906213000_a_very_long_file_name_that_keeps_going_and_going_for_the_ledger — a human applies this one after review"
  lc=$(ledger_class "$long"); printf 'INFO  N9c ledger_class cap: field-4 slug is %d chars; ask_director (slice A) caps class at 80 → the question carries "%s…" while FROZEN/ledger carry the 90-char slug — slice D keys on class\n' "${#lc}" "${lc:0:20}" )

echo "══ syntax ══"
for f in "$SW/ship-wave.sh" "$0"; do /bin/bash -n "$f" && ok "bash3.2 -n $(basename "$f")" || bad "bash -n $(basename "$f")"; done
echo; echo "=== $PASS passed · $FAIL failed · fixtures in $TMP ==="
[ "$FAIL" -eq 0 ]

#!/opt/homebrew/bin/bash
# tests/verify-freeze-classes-adversarial.sh — adversarial verification of HUMAN-IN-THE-LOOP.md §B/§C (slice BC).
# Written by the verifier, 2026-09-10. Same harness shape as test-freeze-classes.sh (real run_once, gh/curl stubbed,
# a real bare jicate remote in a temp dir, $STATE = a temp HOME). Every case is an ATTEMPT TO BREAK the safety
# property "a hard freeze ships nothing; a soft freeze never merges HELD; no empty builds".
# Run from the worktree root:  bash scripts/ship-wave/tests/verify-freeze-classes-adversarial.sh
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"

ROOT=$(cd "$(dirname "$0")/../../.." && pwd); SW="$ROOT/scripts/ship-wave"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-freeze-adv.XXXXXX")
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf 'FAIL  %s\n      %s\n' "$1" "${2:-}"; }
check() { if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1" "$3"; fi; }
has()    { grep -qF -- "$2" "$1"; }
hasnot() { ! grep -qF -- "$2" "$1"; }

awk '/^if \[ -n "\$GOAL" \]; then$/ {exit} {print}' "$SW/ship-wave.sh" > "$TMP/wave.sh"
for f in "$SW"/*.sh "$SW"/*.py; do [ "$(basename "$f")" = ship-wave.sh ] || ln -s "$f" "$TMP/$(basename "$f")"; done

export MYJKKN_LOCAL="$TMP/local"; WTDIR="$MYJKKN_LOCAL/.claude/worktrees/ship-main"
git init -q --bare "$TMP/origin.git"; mkdir -p "$(dirname "$WTDIR")"
git clone -q -o jicate "$TMP/origin.git" "$WTDIR" 2>/dev/null
gitc() { git -C "$WTDIR" -c user.name=t -c user.email=t@t "$@"; }
mkdir -p "$WTDIR/app/api/x" "$WTDIR/docs"
echo "export {}" > "$WTDIR/app/api/x/route.ts"; echo "# a" > "$WTDIR/docs/a.md"
gitc add -A >/dev/null; gitc commit -q -m "base"; gitc push -q jicate HEAD:main 2>/dev/null
SHA0=$(gitc rev-parse HEAD)

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

# scenario <name> <plan-flags> <frozen-file-content|""> <last-deployed|""> <deploy-json> <pre-hook (runs with ST set)> <args…>
scenario() {
  local name="$1" flags="$2" frozen_content="$3" lastdep="$4" djson="$5" prehook="$6"; shift 6
  local S="$TMP/$name"; mkdir -p "$S/home/.config/obsidian/.ship-wave"
  local ST="$S/home/.config/obsidian/.ship-wave"
  [ -n "$frozen_content" ] && printf '%b' "$frozen_content" > "$ST/FROZEN"
  [ -n "$lastdep" ] && printf '%s\n' "$lastdep" > "$ST/last-deployed"
  [ -n "$prehook" ] && ( ST="$ST"; eval "$prehook" )
  mk_plan "$S/plan.json" "$flags"
  (
    export HOME="$S/home"; cd "$ROOT" || exit 9
    TRACE="$S/trace.txt"; : > "$TRACE"; export TRACE FIXPLAN="$S/plan.json" DJSON="$djson"
    set -- "$@"
    . "$TMP/wave.sh" >/dev/null 2>&1
    type -t ledger_on_freeze >/dev/null && type -t policy_active >/dev/null || { echo "SIBLINGS_NOT_SOURCED" >> "$TRACE"; exit 9; }
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
  )
}
READY_META='{"deployments":[{"uid":"dpl_1","readyState":"READY","meta":{"githubCommitSha":"meta-sha-from-vercel"}}]}'
READY_NOMETA='{"deployments":[{"uid":"dpl_2","readyState":"READY"}]}'
T0=$(date -v-2M '+%F %T'); T1=$(date -v-1M '+%F %T')

# ── A. classify_freeze on EVERY real freeze() message in the codebase + the spec's soft rows + unknown ──
echo "── A. classify_freeze: real messages from the code, spec soft rows, unknown ──"
( export HOME="$TMP/homeA"; mkdir -p "$HOME"; . "$TMP/wave.sh" >/dev/null 2>&1 || { echo "FAIL  A harness: sourcing wave.sh exited $?"; exit 1; }
  t() { local want="$1" msg="$2" got rc; got=$(classify_freeze "$msg"); rc=$?; if [ "$got" = "$want" ]; then printf 'PASS  A %s ← %s%s\n' "$got" "${msg:0:80}" "$( [ $rc -ne 0 ] && printf ' (rc=%s unmatched→hard)' $rc)"; else printf 'FAIL  A want %s got %s ← %s\n' "$want" "$got" "${msg:0:100}"; fi; }
  t hard "deploy dpl_abc → ERROR BUILD_FAILED; on main but NOT live: #3296"
  t hard "deploy failed TWICE (attempt 2 = dpl_x → ERROR -); on main but NOT live: #1"
  t hard "deploy dpl_abc → CANCELED -; on main but NOT live: #3296"                                 # CANCELED freeze (ship-wave.sh:750)
  t hard "migration 20260906213000: APPLY failed — relation exists"
  t hard "migration 20260906213000: DRY-RUN failed — ERROR: 2BP01"
  t hard "migration 20260910030000: destructive statement in 20260910030000_cron.sql — a human applies this one after review"
  t hard "GATE ERROR: merge guard unreachable"
  t hard "migration gap: 20260901000000 on main but not in history"
  t hard "migration 20260908120000: cannot read supabase/migrations/x.sql from jicate/main"
  t hard "migration 20260908120000: the history query failed (401 = stale access token, not a missing table)"
  t hard "migration 20260908120000: APPLIED but the history insert failed — err (record it by hand, then --unfreeze)"   # apply-migrations.sh:97
  t hard "migration 20260908120000: applied + recorded, but the verify read did not find it"                           # apply-migrations.sh:102
  t hard "broken page after deploy: 3 page×role load(s) returned 5xx (see run/l1.txt); on main: #1"
  t hard "baseline bounce after deploy — these loaded 200 before and now bounce to /auth/login: x · likely PRs: #1; on main: #1"
  t hard "post-deploy sweep failed — L2: /api/x→500 L1: none · likely PRs: #1"
  t soft "peer hold on #3410 — Director asked to wait"
  t soft "migration 20260908120000: 0 files on jicate/main match (need exactly 1)"
  t soft "conflict verdict UNRESOLVABLE for #3179 after two helper tabs"
  t soft "policy question P2 awaiting ratification"
  t soft "advisory check 'SDK multi-agent review' red on every PR"
  t hard "something nobody has seen before"
  # adversarial: a HARD-shaped message that ALSO contains a soft keyword — hard rows are matched first, so must stay hard
  t hard "migration 20260906213000: APPLY failed — policy violation: hold on"
  t hard "deploy dpl_q → ERROR; on main but NOT live: #3410 (peer hold)"
  # adversarial: a soft keyword inside an otherwise-unknown message → SOFT (the pattern is *hold*)
  printf 'INFO  A "threshold" test: classify_freeze "rate threshold exceeded, 5 pages 5xx" → %s\n' "$(classify_freeze "rate threshold exceeded, 5 pages 5xx")"
  printf 'INFO  A "uphold" test: classify_freeze "cannot uphold RLS on table x" → %s\n' "$(classify_freeze "cannot uphold RLS on table x")"
) | tee "$TMP/A.txt"
PASS=$((PASS + $(grep -c '^PASS' "$TMP/A.txt"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/A.txt")))

# ── B. two-line FROZEN: last line wins, both directions; pre-change 2-field line → hard ──
echo "── B. FROZEN with two lines / legacy two fields ──"
( export HOME="$TMP/homeB"; mkdir -p "$HOME"; . "$TMP/wave.sh" >/dev/null 2>&1 || { echo "FAIL  B harness: sourcing wave.sh exited $?"; exit 1; }
  FREEZE="$TMP/frz1"; printf '%s\tpeer hold on #1\tsoft\n%s\tmigration 1: APPLY failed — x\thard\n' "$T0" "$T1" > "$FREEZE"
  [ "$(freeze_class_now)" = hard ] && echo "PASS  B1 soft then hard → hard ($(freeze_class_now))" || echo "FAIL  B1 soft then hard → $(freeze_class_now)"
  FREEZE="$TMP/frz2"; printf '%s\tmigration 1: APPLY failed — x\thard\n%s\tpeer hold on #1\tsoft\n' "$T0" "$T1" > "$FREEZE"
  # round 3 (N3): most severe wins — a soft line appended after a hard one (the phone's --freeze) never downgrades the stop
  [ "$(freeze_class_now)" = hard ] && echo "PASS  B2 hard then soft → hard (most severe wins: $(freeze_class_now))" || echo "FAIL  B2 hard then soft → $(freeze_class_now)"
  FREEZE="$TMP/frz3"; printf '%s\tdeploy dpl_1 → ERROR; on main but NOT live: #5\n' "$T0" > "$FREEZE"
  [ "$(freeze_class_now)" = hard ] && echo "PASS  B3 legacy 2-field line → hard" || echo "FAIL  B3 legacy 2-field → $(freeze_class_now)"
  FREEZE="$TMP/frz4"; printf '%s\tpeer hold on #3410 — Director asked to wait\n' "$T0" > "$FREEZE"
  echo "INFO  B4 a hand-written 2-field 'peer hold' line (the spec's soft example, written the old way) reads as: $(freeze_class_now)"
  FREEZE="$TMP/frz5"; printf '%s\tmsg\tSOFT\n' "$T0" > "$FREEZE"; echo "INFO  B5 class field 'SOFT' (upper) reads as: $(freeze_class_now)"
  FREEZE="$TMP/frz6"; printf '%s\tmsg\tsoft \n' "$T0" > "$FREEZE"; echo "INFO  B6 class field 'soft ' (trailing space) reads as: $(freeze_class_now)"
  FREEZE="$TMP/frz7"; printf '%s\tmsg\tsoft\n\n' "$T0" > "$FREEZE"; echo "INFO  B7 trailing blank line after a soft line reads as: $(freeze_class_now)"
) | tee "$TMP/B.txt"
PASS=$((PASS + $(grep -c '^PASS' "$TMP/B.txt"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/B.txt")))

# B-run: hard-then-soft file drives a real round → merges NOTHING (round 3: the hard line governs whatever follows it), legacy file drives a round → merges nothing
scenario b_hs "1 1 1" "$T0\tmigration 1: APPLY failed — x\thard\n$T1\tpeer hold on #1\tsoft\n" "$SHA0" "$READY_META" "" go --approve-normal
check "B8 hard→soft file: round runs as HARD (no merge at all, no hook — the appended soft line does not lift the stop)" $( hasnot "$TMP/b_hs/trace.txt" "gh pr merge" && hasnot "$TMP/b_hs/trace.txt" "curl -s -X POST"; echo $?) "$(grep -E 'pr merge|POST' "$TMP/b_hs/trace.txt")"
scenario b_legacy "1 1 1" "$T0\tdeploy dpl_1 → ERROR; on main but NOT live: #5\n" "$SHA0" "$READY_META" "" go --approve-normal --approve-held 3
check "B9 legacy 2-field file: round runs as HARD (no merge, no hook, no apply)" $( hasnot "$TMP/b_legacy/trace.txt" "gh pr merge" && hasnot "$TMP/b_legacy/trace.txt" "curl -s -X POST" && hasnot "$TMP/b_legacy/trace.txt" "APPLY_CALLED"; echo $?) "$(grep -E 'pr merge|POST|APPLY' "$TMP/b_legacy/trace.txt")"
check "B9b legacy file: receipt banner says hard"  $(has "$TMP/b_legacy/receipt.txt" "FROZEN (hard) since:"; echo $?) "$(grep FROZEN "$TMP/b_legacy/receipt.txt" | head -2)"

# ── C. soft freeze: every route by which a HELD PR could reach merge_one ──
echo "── C. soft freeze: HELD must not merge by ANY route ──"
scenario c_arg "1 1 1" "$T0\tpeer hold on #9\tsoft\n" "$SHA0" "$READY_META" "" go --approve-normal --approve-held 3,4
check "C1 soft + --approve-held 3,4 on the CLI: neither HELD PR merged"      $( hasnot "$TMP/c_arg/trace.txt" "gh pr merge 3 " && hasnot "$TMP/c_arg/trace.txt" "gh pr merge 4 "; echo $?) "$(grep 'pr merge' "$TMP/c_arg/trace.txt")"
check "C1b soft + CLI approvals: LOW/NORMAL still merged"                     $( has "$TMP/c_arg/trace.txt" "gh pr merge 1 " && has "$TMP/c_arg/trace.txt" "gh pr merge 2 "; echo $?)
scenario c_file "1 1 1" "$T0\tpeer hold on #9\tsoft\n" "$SHA0" "$READY_META" 'printf "3\n4\n" > "$ST/approve-held"' go --approve-normal
check "C2 soft + approve-held FILE lists 3 and 4: neither merged, file intact" $( hasnot "$TMP/c_file/trace.txt" "gh pr merge 3 " && hasnot "$TMP/c_file/trace.txt" "gh pr merge 4 " && grep -qx 3 "$TMP/c_file/home/.config/obsidian/.ship-wave/approve-held" && grep -qx 4 "$TMP/c_file/home/.config/obsidian/.ship-wave/approve-held"; echo $?) "$(grep 'pr merge' "$TMP/c_file/trace.txt"; cat "$TMP/c_file/home/.config/obsidian/.ship-wave/approve-held")"
scenario c_p1 "1 1 1" "$T0\tpeer hold on #9\tsoft\n" "$SHA0" "$READY_META" 'mkdir -p "$ST/policy"; echo ratified > "$ST/policy/AUTO_APPROVE_ADDITIVE_MIGRATIONS"' go --approve-normal
check "C3 soft + P1 AUTO_APPROVE_ADDITIVE_MIGRATIONS ratified: migration-only HELD #4 NOT merged" $( hasnot "$TMP/c_p1/trace.txt" "gh pr merge 4 " && hasnot "$TMP/c_p1/trace.txt" "gh pr merge 3 "; echo $?) "$(grep -E 'pr merge|policy P1' "$TMP/c_p1/trace.txt" "$TMP/c_p1/receipt.txt")"
check "C3b soft + P1: receipt does not announce a P1 approval"                $(hasnot "$TMP/c_p1/receipt.txt" "policy P1 (ratified)"; echo $?) "$(grep P1 "$TMP/c_p1/receipt.txt")"
# control: NOT frozen + P1 → #4 DOES merge (proves the P1 route is real and the freeze gate is what stopped it)
scenario c_p1_ctl "1 1 1" "" "$SHA0" "$READY_META" 'mkdir -p "$ST/policy"; echo ratified > "$ST/policy/AUTO_APPROVE_ADDITIVE_MIGRATIONS"' go --approve-normal
check "C3c CONTROL not frozen + P1: #4 merges (so C3 was a real gate, not a dead route)" $(has "$TMP/c_p1_ctl/trace.txt" "gh pr merge 4 "; echo $?) "$(grep -E 'pr merge|P1' "$TMP/c_p1_ctl/trace.txt" "$TMP/c_p1_ctl/receipt.txt")"

# ── D. hard freeze: every route by which the deploy hook could fire ──
echo "── D. hard freeze: deploy must not fire by ANY route ──"
mkdir -p "$WTDIR/app/api/y" "$WTDIR/supabase/migrations"
echo "export {}" > "$WTDIR/app/api/y/route.ts"; echo "create table t(id int);" > "$WTDIR/supabase/migrations/20260910120000_hand.sql"
gitc add -A >/dev/null; gitc commit -q -m "feat: hand-merged thing (#77)"; gitc push -q jicate HEAD:main 2>/dev/null; SHA1=$(gitc rev-parse HEAD)
scenario d_ahead "0 0 0" "$T0\tmigration 1: APPLY failed — x\thard\n" "$SHA0" "$READY_META" 'echo 20260910120000 > "$ST/migrations-pending"' go --approve-normal
check "D1 hard + main ahead + migrations-pending: hook NOT fired, apply NOT run" $( hasnot "$TMP/d_ahead/trace.txt" "curl -s -X POST" && hasnot "$TMP/d_ahead/trace.txt" "APPLY_CALLED"; echo $?) "$(grep -E 'POST|APPLY' "$TMP/d_ahead/trace.txt")"
check "D1b hard + main ahead: one-line reason, last-deployed untouched"        $( has "$TMP/d_ahead/receipt.txt" "hard freeze — main" && [ "$(cat "$TMP/d_ahead/home/.config/obsidian/.ship-wave/last-deployed")" = "$SHA0" ]; echo $?)
# the flush route: a goal run that hard-froze mid-way leaves $STATE/deploy-pending on disk (line ~902 skips the final build);
# the next PLAIN `go` (no --goal) — the shape /myjkkn-chain "ship it" and a hand-typed W12 use — hits the flush branch
scenario d_flush "0 0 0" "$T0\tmigration 1: APPLY failed — x\thard\n" "$SHA1" "$READY_META" 'printf "app/api/x/route.ts\n" > "$ST/deploy-pending"' go
check "D2 hard + leftover deploy-pending + plain go: hook NOT fired"           $(hasnot "$TMP/d_flush/trace.txt" "curl -s -X POST"; echo $?) "receipt: $(grep -E 'hook fired|earlier-batch|deployment ' "$TMP/d_flush/receipt.txt" | head -3)"
check "D2b hard + leftover deploy-pending: sweep gate NOT reached"             $(hasnot "$TMP/d_flush/receipt.txt" "L2 1 ok"; echo $?) "$(grep L2 "$TMP/d_flush/receipt.txt")"
check "D2c hard + leftover deploy-pending: last-deployed NOT advanced"         $([ "$(cat "$TMP/d_flush/home/.config/obsidian/.ship-wave/last-deployed")" = "$SHA1" ]; echo $?) "$(cat "$TMP/d_flush/home/.config/obsidian/.ship-wave/last-deployed")"
# same flush shape under a SOFT freeze is allowed by §C (ship what is on main) — record behaviour
scenario d_flush_soft "0 0 0" "$T0\tpeer hold on #9\tsoft\n" "$SHA1" "$READY_META" 'printf "app/api/x/route.ts\n" > "$ST/deploy-pending"' go
echo "INFO  D3 soft + leftover deploy-pending + plain go: hook fired? $(has "$TMP/d_flush_soft/trace.txt" "curl -s -X POST" && echo yes || echo no)"

# ── E. no empty builds ──
echo "── E. no empty builds ──"
scenario e_eq "0 0 0" "$T0\tpeer hold on #9\tsoft\n" "$SHA1" "$READY_META" "" go --approve-normal
check "E1 soft + zero merges + main == last-deployed: hook NOT fired"          $(hasnot "$TMP/e_eq/trace.txt" "curl -s -X POST"; echo $?) "$(grep -E 'main|hook' "$TMP/e_eq/receipt.txt" | head -3)"
check "E1b soft + equal: receipt says nothing merged / no hook"                $(has "$TMP/e_eq/receipt.txt" "nothing merged / --no-deploy → no hook fired"; echo $?)
# run it AGAIN with the same state: a second tick must stay quiet too (marker not disturbed by the quiet round)
scenario e_eq2 "0 0 0" "$T0\tpeer hold on #9\tsoft\n" "$(cat "$TMP/e_eq/home/.config/obsidian/.ship-wave/last-deployed")" "$READY_META" "" go --approve-normal
check "E1c second tick with the marker the first left: still no hook"          $(hasnot "$TMP/e_eq2/trace.txt" "curl -s -X POST"; echo $?)

# ── F. last-deployed missing entirely ──
echo "── F. last-deployed marker missing ──"
scenario f_nometa "0 0 0" "$T0\tpeer hold on #9\tsoft\n" "" "$READY_NOMETA" "" go --approve-normal
check "F1 no marker + Vercel READY without meta sha: no marker seeded, hook NOT fired" $( [ ! -s "$TMP/f_nometa/home/.config/obsidian/.ship-wave/last-deployed" ] && hasnot "$TMP/f_nometa/trace.txt" "curl -s -X POST"; echo $?) "$(grep -E 'last-deployed|main vs' "$TMP/f_nometa/receipt.txt")"
check "F1b receipt says last-deployed unknown, only merges can trigger"        $(has "$TMP/f_nometa/receipt.txt" "last-deployed unknown"; echo $?)
scenario f_notok "0 0 0" "$T0\tpeer hold on #9\tsoft\n" "" "$READY_META" "" go --approve-normal
# vtok is stubbed to 'tok' in scenario(); emulate no token by an empty Vercel answer
scenario f_notok "0 0 0" "$T0\tpeer hold on #9\tsoft\n" "" "" "" go --approve-normal
check "F2 no marker + Vercel unreadable: hook NOT fired"                       $(hasnot "$TMP/f_notok/trace.txt" "curl -s -X POST"; echo $?) "$(grep -E 'last prod|main vs' "$TMP/f_notok/receipt.txt")"
# a marker that names a sha the worktree does not have (Vercel meta sha for a commit not on main / garbage) with main "ahead"
scenario f_unknown "0 0 0" "$T0\tpeer hold on #9\tsoft\n" "0000000000000000000000000000000000000000" "$READY_NOMETA" "" go --approve-normal
echo "INFO  F3 marker = unknown sha, main has app+migration files ahead: hook fired? $(has "$TMP/f_unknown/trace.txt" "curl -s -X POST" && echo yes || echo no) · deploy line: $(grep -E '^  (nothing to deploy|hook fired|main is ahead)' "$TMP/f_unknown/receipt.txt" | head -2 | tr '\n' '|') · marker now: $(cut -c1-7 "$TMP/f_unknown/home/.config/obsidian/.ship-wave/last-deployed")"
check "F3 unknown last-deployed sha must not silently mark main as deployed without a build" $( ! { has "$TMP/f_unknown/receipt.txt" "nothing to deploy" && [ "$(cat "$TMP/f_unknown/home/.config/obsidian/.ship-wave/last-deployed")" = "$SHA1" ]; }; echo $?) "receipt says docs-only and advanced the marker to main HEAD although app/api/y/route.ts + a migration are what is ahead"

# ── G. hand-merged list ──
echo "── G. merged by hand while stopped ──"
echo "# b" > "$WTDIR/docs/b.md"; gitc add -A >/dev/null; gitc commit -q -m "docs: wave-merged thing (#78)"
echo "# c" > "$WTDIR/docs/c.md"; gitc add -A >/dev/null; gitc commit -q -m "feat: no pr number in subject"
echo "# d" > "$WTDIR/docs/d.md"; gitc add -A >/dev/null; gitc commit -q -m "feat: merge pull request #79 from x/y"   # merge-commit style, not squash
gitc push -q jicate HEAD:main 2>/dev/null; SHA2=$(gitc rev-parse HEAD)
scenario g "0 0 0" "$T0\tmigration 1: APPLY failed — x\thard\n" "$SHA2" "$READY_META" 'mkdir -p "$ST/run-20260910-000000"; printf "78\tdocs/b.md\n" > "$ST/run-20260910-000000/merged-map.tsv"' go
HM=$(grep "merged by hand while stopped:" "$TMP/g/receipt.txt")
check "G1 wave's own #78 NOT listed as hand-merged"     $( ! grep -q '#78' <<<"$HM"; echo $?) "$HM"
check "G2 hand-merged #77 IS listed"                    $(grep -q '#77' <<<"$HM"; echo $?) "$HM"
echo "INFO  G3 'Merge pull request #79' (merge-commit style, number not at end of subject) listed? $(grep -q '#79' <<<"$HM" && echo yes || echo no) — line: $HM"


# ── H. §C source of truth: spec says Vercel meta.githubCommitSha FIRST, marker as fallback ──
echo "── H. production already runs main HEAD (hand-fired hook), marker stale ──"
READY_AT_MAIN='{"deployments":[{"uid":"dpl_9","readyState":"READY","meta":{"githubCommitSha":"'"$(gitc rev-parse HEAD)"'"}}]}'
scenario h_stale "0 0 0" "$T0\tpeer hold on #9\tsoft\n" "$SHA0" "$READY_AT_MAIN" "" go --approve-normal
check "H1 Vercel READY meta sha == main HEAD, marker stale: hook NOT fired (nothing is ahead of production)" $(hasnot "$TMP/h_stale/trace.txt" "curl -s -X POST"; echo $?) "receipt: $(grep -E 'main is ahead|hook fired|last-deployed' "$TMP/h_stale/receipt.txt" | head -3 | tr '\n' '|')"

echo "── syntax ──"
bash -n "$SW/ship-wave.sh" && ok "bash -n ship-wave.sh" || bad "bash -n ship-wave.sh"
bash -n "$0" && ok "bash -n $(basename "$0")" || bad "bash -n self"
echo; echo "=== $PASS passed · $FAIL failed · fixtures in $TMP ==="
[ "$FAIL" -eq 0 ]

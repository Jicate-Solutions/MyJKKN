#!/opt/homebrew/bin/bash
# tests/test-freeze-round3.sh — regression tests for the round-3 breaks on HUMAN-IN-THE-LOOP.md §B/§C (slice B+C),
# found by the second adversarial pass (verify-freeze-classes-adversarial-v2.sh at 65acbd8d14 / 63fed69338):
#   N3   hard freeze + a later soft line (the phone's --freeze) → the class in force must stay HARD (most severe wins)
#   N2i  a TAB/CR/LF inside a freeze message must not shift the class column (freeze() sanitises; odd lines read hard)
#   N8b  the merged-map row is written from the MERGE (number + sha), never from the file-list call
#   N8d  an EMPTY file list after a successful merge is "files unknown → assume code", never docs-only
#   N5c  a freeze that lands between preflight and stage 3 gates the merge (HELD held; hard → nothing merges)
#   soft-row anchors: `policy` / `advisory` match only at the start of the reason; classify_freeze byte-identical to D's
# Each case FAILS on 63fed69338 and PASSES on the fix (proven by running this file from a scratch copy of that commit).
# Same harness shape as verify-freeze-classes-adversarial-v2.sh: the real run_once is sourced, gh/curl are recording
# stubs, jicate/main is a real bare repo in a temp dir, $STATE is a temp HOME. Knobs: FILES_FAIL (one PR whose
# `--json files` answers nothing, every time), MERGE_EMPTY (the squash lands an EMPTY commit — no diff on main),
# SWEEP_FREEZE (a freeze that lands between preflight and the merge stage).
# Run from the worktree root:  bash scripts/ship-wave/tests/test-freeze-round3.sh
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"

ROOT=$(cd "$(dirname "$0")/../../.." && pwd); SW="$ROOT/scripts/ship-wave"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-freeze-r3.XXXXXX")
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf 'FAIL  %s\n      %s\n' "$1" "${2:-}"; }
check() { if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1" "$3"; fi; }
has()    { grep -qF -- "$2" "$1"; }
hasnot() { ! grep -qF -- "$2" "$1"; }
posts()  { grep -c 'curl -s -X POST' "$1"; }

awk '/^if \[ -n "\$GOAL" \]; then$/ {exit} {print}' "$SW/ship-wave.sh" > "$TMP/wave.sh"
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
main_head() { git -C "$WTDIR" fetch jicate main -q 2>/dev/null; git -C "$WTDIR" rev-parse jicate/main; }
ready_at() { printf '{"deployments":[{"uid":"dpl_%s","readyState":"READY","meta":{"githubCommitSha":"%s"}}]}' "${2:-1}" "$1"; }
READY_NOMETA='{"deployments":[{"uid":"dpl_2","readyState":"READY"}]}'

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

# [PRE=…] [AFTER=json|auto] [FILES_FAIL=n] [MERGE_EMPTY=1] [SWEEP_FREEZE=line]
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
    TRACE="$S/trace.txt"; : > "$TRACE"; export TRACE FIXPLAN="$S/plan.json" DJSON="$djson" DJSON_AFTER="${AFTER:-}" POSTED="$S/posted" WTDIR
    export FILES_FAIL="${FILES_FAIL:-}" MERGE_EMPTY="${MERGE_EMPTY:-}" SWEEP_FREEZE="${SWEEP_FREEZE:-}"
    set -- "$@"
    . "$TMP/wave.sh" >/dev/null 2>&1
    type -t ledger_on_freeze >/dev/null && type -t policy_active >/dev/null && type -t unblock_lanes >/dev/null || { echo "SIBLINGS_NOT_SOURCED" >> "$TRACE"; exit 9; }
    sweep() { cp "$FIXPLAN" "$1/plan.json"; [ -n "$SWEEP_FREEZE" ] && printf '%b\n' "$SWEEP_FREEZE" >> "$FREEZE"; return 0; }
    unblock_lanes() { :; }; dispatch_clusters() { :; }; alive_helpers() { printf 0; }; rebase_remaining() { return 0; }
    apply_migrations() { echo "APPLY_CALLED $(tr '\n' ' ' < "$1")" >> "$TRACE"; APPLY_RESULT="stubbed"; return 0; }
    vtok() { printf 'tok'; }; sleep() { :; }
    gh() {
      echo "gh $*" >> "$TRACE"
      case "$*" in
        "auth token"|"auth status") return 0;;
        *"--json state,mergeStateStatus"*) echo "OPEN CLEAN false main";;
        *"--json statusCheckRollup"*) echo 0;;
        "pr merge "*) # a squash merge lands the PR's real content on main — unless MERGE_EMPTY asks for an empty commit
          if [ -z "$MERGE_EMPTY" ]; then case "$3" in 1) echo "# $RANDOM" >> "$WTDIR/docs/a.md";; 2) echo "// $RANDOM" >> "$WTDIR/app/api/x/route.ts";; 3) mkdir -p "$WTDIR/app/api/fees"; echo "// $RANDOM" >> "$WTDIR/app/api/fees/route.ts";; 4) mkdir -p "$WTDIR/supabase/migrations"; echo "select $RANDOM;" >> "$WTDIR/supabase/migrations/20260910100000_t.sql";; esac; fi
          git -C "$WTDIR" -c user.name=t -c user.email=t@t add -A >/dev/null; git -C "$WTDIR" -c user.name=t -c user.email=t@t commit -q --allow-empty -m "merged by the wave (#$3)" && git -C "$WTDIR" push -q jicate HEAD:main 2>/dev/null; return 0;;
        *"--json mergeCommit"*) return 0;;   # answers nothing → the wave falls back to post-merge main HEAD
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
          else echo "$DJSON"; fi;;
        *"-o /dev/null"*) echo 401;;
      esac; return 0
    }
    ask_director() { printf 'ASK kind=%s class=%s title=%s\n' "$1" "$2" "$3" >> "$TRACE"; }
    _REDIR_DONE=1
    run_once > "$S/receipt.txt" 2>&1; echo "rc=$?" >> "$TRACE"
  )
}
marker() { cat "$TMP/$1/home/.config/obsidian/.ship-wave/last-deployed" 2>/dev/null; }
mmap()   { cat "$TMP/$1"/home/.config/obsidian/.ship-wave/run-*/merged-map.tsv 2>/dev/null; }
T0=$(date -v-2M '+%F %T')
HARD_LINE="$T0\tmigration 1: APPLY failed — x\thard"
SOFT_LINE="$T0\tpeer hold on #9\tsoft"

echo "══ N3. most severe wins: any hard line in FROZEN → hard, whatever the order ══"
( export HOME="$TMP/n3u"; mkdir -p "$HOME"; cd "$ROOT" || exit 9; set -- go; . "$TMP/wave.sh" >/dev/null 2>&1
  r() { local want="$1" label="$2"; local c; c=$(freeze_class_now); deploy_allowed; local d=$?
       if [ "$c" = "$want" ] && { { [ "$want" = hard ] && [ $d -ne 0 ]; } || { [ "$want" = soft ] && [ $d -eq 0 ]; }; }; then printf 'PASS  %s → %s (deploy %s)\n' "$label" "$c" "$( [ $d -eq 0 ] && echo allowed || echo refused)"; else printf 'FAIL  %s → want %s got %s deploy_allowed=%s\n' "$label" "$want" "$c" "$d"; fi; }
  FREEZE="$TMP/n3u/f"
  printf '%s\tmigration 1: APPLY failed — x\thard\n%s\tpeer hold on #1\tsoft\n' "$T0" "$T0" > "$FREEZE"; r hard "N3a hard then soft"
  printf '%s\tpeer hold on #1\tsoft\n%s\tmigration 1: APPLY failed — x\thard\n' "$T0" "$T0" > "$FREEZE"; r hard "N3b soft then hard"
  printf '%s\tpeer hold on #1\tsoft\n' "$T0" > "$FREEZE"; r soft "N3c soft only"
  printf '%s\tpeer hold on #1\tsoft\n%s\tmigration 1: APPLY failed — x\thard\n%s\tDirector hold: wait\tsoft\n%s\ton hold #4\tsoft\n' "$T0" "$T0" "$T0" "$T0" > "$FREEZE"; r hard "N3d hard buried among three soft lines"
  printf '%s\tpeer hold on #1\tsoft\tpeer hold on n\n%s\tmigration 1: APPLY failed — x\thard\tmigration n apply failed x\n' "$T0" "$T0" > "$FREEZE"; r hard "N3e 4-field lines (ledger slug in field 4), soft then hard"
) | tee "$TMP/n3u.out"; PASS=$((PASS + $(grep -c '^PASS' "$TMP/n3u.out"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/n3u.out")))
# the REAL phone entry point: --freeze "peer hold …" on top of an unresolved hard line
mkdir -p "$TMP/n3c/home/.config/obsidian/.ship-wave"; N3F="$TMP/n3c/home/.config/obsidian/.ship-wave/FROZEN"
printf '%s\tmigration 20260906213000: APPLY failed — relation exists\thard\n' "$T0" > "$N3F"
HOME="$TMP/n3c/home" bash "$SW/ship-wave.sh" --freeze "peer hold on #3410 — Director asked to wait" > "$TMP/n3c/cli.out" 2>&1
check "N3f --freeze 'peer hold' appended over a hard line: 2 lines on disk, the soft line recorded, class in force still hard" $([ "$(grep -c . "$N3F")" -eq 2 ] && [ "$(tail -1 "$N3F" | cut -f3)" = soft ] && grep -q 'HARD stop still in force' "$TMP/n3c/cli.out"; echo $?) "$(cat "$TMP/n3c/cli.out"; tr '\t' '|' < "$N3F")"
PRE='cp '"$N3F"' "$ST/FROZEN"' AFTER=auto scenario n3 "1 1 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "3" go --approve-normal
check "N3g the next go --approve-normal with that file: zero merges, zero POST, zero APPLY (the run is HARD)" $(hasnot "$TMP/n3/trace.txt" "gh pr merge" && [ "$(posts "$TMP/n3/trace.txt")" -eq 0 ] && hasnot "$TMP/n3/trace.txt" "APPLY_CALLED"; echo $?) "$(grep -E 'pr merge|POST|APPLY' "$TMP/n3/trace.txt")"
check "N3h … and the receipt banner names the HARD cause, not the soft line" $(grep -m1 'FROZEN (hard)' "$TMP/n3/receipt.txt" | grep -q 'APPLY failed'; echo $?) "$(grep -m1 'FROZEN (' "$TMP/n3/receipt.txt")"

echo "══ N2i. separators inside a freeze message never reach the class column ══"
( export HOME="$TMP/n2i"; mkdir -p "$HOME"; cd "$ROOT" || exit 9; set -- go; . "$TMP/wave.sh" >/dev/null 2>&1
  FREEZE="$TMP/n2i/f"
  rm -f "$FREEZE"; freeze $'migration 20260906213000: APPLY failed\tsoft' >/dev/null
  c=$(freeze_class_now); deploy_allowed; d=$?; nf=$(awk -F'\t' '{print NF}' "$FREEZE" | head -1)
  if [ "$c" = hard ] && [ $d -ne 0 ] && [ "$nf" = 4 ] && [ "$(cut -f3 "$FREEZE")" = hard ]; then echo "PASS  N2i-a TAB inside a hard message → one 4-field line, field 3 = hard, deploy refused"; else printf 'FAIL  N2i-a class=%s deploy_allowed=%s NF=%s line=%s\n' "$c" "$d" "$nf" "$(tr '\t' '|' < "$FREEZE")"; fi
  rm -f "$FREEZE"; freeze $'deploy dpl_1 → ERROR; on main but NOT live: #5\nsecond line\tx\tsoft' >/dev/null
  c=$(freeze_class_now); deploy_allowed; d=$?
  if [ "$c" = hard ] && [ $d -ne 0 ] && [ "$(grep -c . "$FREEZE")" -eq 1 ]; then echo "PASS  N2i-b LF + TAB inside a hard message → ONE line written, hard, deploy refused"; else printf 'FAIL  N2i-b class=%s deploy_allowed=%s lines=%s\n' "$c" "$d" "$(grep -c . "$FREEZE")"; fi
  rm -f "$FREEZE"; freeze $'peer hold on #3410\r\n\tsoft' >/dev/null
  if [ "$(cut -f2 "$FREEZE")" = "peer hold on #3410   soft" ] && [ "$(freeze_class_now)" = soft ]; then echo "PASS  N2i-c CR/LF/TAB in a soft message each become one space; the line stays soft"; else printf 'FAIL  N2i-c line=%s class=%s\n' "$(tr '\t' '|' < "$FREEZE")" "$(freeze_class_now)"; fi
  printf '%s\tmsg\tsoft\textra\tmore\n' "$T0" > "$FREEZE"; c=$(freeze_class_now)
  [ "$c" = hard ] && echo "PASS  N2i-d a 5-field line (more than the expected fields) reads as hard" || echo "FAIL  N2i-d 5 fields → $c"
  printf '%s\tmigration 1: APPLY failed\tsoft\thard\tmigration\n' "$T0" > "$FREEZE"; c=$(freeze_class_now)
  [ "$c" = hard ] && echo "PASS  N2i-e the verifier's exact shifted line (5 fields, field 3 'soft') reads as hard" || echo "FAIL  N2i-e → $c"
) | tee "$TMP/n2i.out"; PASS=$((PASS + $(grep -c '^PASS' "$TMP/n2i.out"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/n2i.out")))

echo "══ N8b. the merged-map row comes from the merge (number + sha), never from the file-list call ══"
FILES_FAIL=2 AFTER=auto scenario n8b1 "0 1 0" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
HEAD_AFTER=$(main_head)
check "N8b-a wave merged #2 while 'gh pr view 2 --json files' answered nothing → merged-map has the row '2<TAB>@merge<TAB><merge sha>'" $(mmap n8b1 | grep -qx "2	@merge	$HEAD_AFTER"; echo $?) "$(mmap n8b1 | tr '\t' '|')"
# a hand merge lands on main too; the next frozen round must list ONLY the hand merge
echo "# h" > "$WTDIR/docs/h.md"; gitc add -A >/dev/null; gitc commit -q -m "docs: by hand (#77)"; gitc push -q jicate HEAD:main 2>/dev/null
PRE='cp -R '"$TMP"'/n8b1/home/.config/obsidian/.ship-wave/run-* "$ST/"' scenario n8b2 "0 0 0" "$SOFT_LINE" "$(main_head)" "$(ready_at "$(main_head)")" "" go
HM=$(grep 'merged by hand while stopped:' "$TMP/n8b2/receipt.txt")
check "N8b-b the wave's own #2 is NOT listed as merged by hand; the real hand merge #77 is" $(! grep -q '#2' <<<"$HM" && grep -q '#77' <<<"$HM"; echo $?) "$HM"
# keying on number + sha: a row for #2 with the WRONG sha does not claim the commit; a legacy 2-field row still counts by number
PRE='mkdir -p "$ST/run-20260910-000001"; printf "2\t@merge\t0000000000000000000000000000000000000000\n" > "$ST/run-20260910-000001/merged-map.tsv"' scenario n8b3 "0 0 0" "$SOFT_LINE" "$(main_head)" "$(ready_at "$(main_head)")" "" go
HM3=$(grep 'merged by hand while stopped:' "$TMP/n8b3/receipt.txt")
check "N8b-c a merged-map row for #2 carrying a DIFFERENT sha does not claim main's #2 commit (keyed on number + sha)" $(grep -q '#2' <<<"$HM3"; echo $?) "$HM3"
PRE='mkdir -p "$ST/run-20260910-000001"; printf "2\tapp/api/x/route.ts\n77\tdocs/h.md\n" > "$ST/run-20260910-000001/merged-map.tsv"' scenario n8b4 "0 0 0" "$SOFT_LINE" "$(main_head)" "$(ready_at "$(main_head)")" "" go
HM4=$(grep 'merged by hand while stopped:' "$TMP/n8b4/receipt.txt")
check "N8b-d legacy 2-field rows (older runs, no sha) still count by number: #2 and #77 not listed" $(grep -q 'stopped: none' <<<"$HM4"; echo $?) "$HM4"

echo "══ N8d. an EMPTY file list after a successful merge is never docs-only ══"
HEAD8=$(main_head)
FILES_FAIL=2 AFTER=auto scenario n8d1 "0 1 0" "" "$HEAD8" "$READY_NOMETA" "" go --approve-normal
check "N8d-a files call failed, real diff on main → file list from git diff (app/api/x/route.ts), ONE build, marker → main HEAD" $(grep -qx 'app/api/x/route.ts' "$TMP/n8d1"/home/.config/obsidian/.ship-wave/run-*/merged-files.txt && [ "$(posts "$TMP/n8d1/trace.txt")" -eq 1 ] && [ "$(marker n8d1)" = "$(main_head)" ]; echo $?) "$(cat "$TMP/n8d1"/home/.config/obsidian/.ship-wave/run-*/merged-files.txt; grep -E 'nothing to deploy|hook|files unknown' "$TMP/n8d1/receipt.txt")"
HEAD8b=$(main_head)
FILES_FAIL=2 MERGE_EMPTY=1 AFTER=auto scenario n8d2 "0 1 0" "" "$HEAD8b" "$READY_NOMETA" "" go --approve-normal
check "N8d-b files call failed ×3 AND the diff is empty → 'files unknown … assumed CODE' receipt line, NOT docs-only, ONE build" $(has "$TMP/n8d2/receipt.txt" "files unknown for #2" && hasnot "$TMP/n8d2/receipt.txt" "migration/docs-only" && [ "$(posts "$TMP/n8d2/trace.txt")" -eq 1 ]; echo $?) "$(grep -E 'nothing to deploy|hook|files unknown' "$TMP/n8d2/receipt.txt")"
check "N8d-c … the gh files call was retried 3 times before giving up" $([ "$(grep -c 'gh pr view 2 --repo .* --json files' "$TMP/n8d2/trace.txt")" -eq 3 ]; echo $?) "$(grep -c 'json files' "$TMP/n8d2/trace.txt")"
check "N8d-d … the merged-map row for #2 exists all the same (written from the merge)" $(mmap n8d2 | grep -q '^2	@merge	'; echo $?) "$(mmap n8d2)"
MERGE_EMPTY=1 AFTER=auto scenario n8d3 "1 0 0" "" "$(main_head)" "$READY_NOMETA" "" go
check "N8d-e CONTROL empty diff but gh files answers (docs/a.md) → fallback used, read as docs-only, no build" $(grep -qx 'docs/a.md' "$TMP/n8d3"/home/.config/obsidian/.ship-wave/run-*/merged-files.txt && [ "$(posts "$TMP/n8d3/trace.txt")" -eq 0 ] && has "$TMP/n8d3/receipt.txt" "migration/docs-only"; echo $?) "$(grep -E 'nothing to deploy|hook' "$TMP/n8d3/receipt.txt")"

echo "══ N5c. a freeze that lands between preflight and the merge stage ══"
SWEEP_FREEZE="$SOFT_LINE" AFTER=auto scenario n5c1 "1 0 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-held 3
check "N5c-a SOFT freeze mid-round: LOW #1 merged, approved HELD #3 NOT merged (HELD held while stopped)" $(has "$TMP/n5c1/trace.txt" "gh pr merge 1 " && hasnot "$TMP/n5c1/trace.txt" "gh pr merge 3 " && has "$TMP/n5c1/receipt.txt" "held while stopped (soft freeze)"; echo $?) "$(grep -E 'pr merge' "$TMP/n5c1/trace.txt"; grep HELD "$TMP/n5c1/receipt.txt")"
SWEEP_FREEZE="$HARD_LINE" AFTER=auto scenario n5c2 "1 1 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal --approve-held 3
check "N5c-b HARD freeze mid-round: no merge at all, no POST, no APPLY" $(hasnot "$TMP/n5c2/trace.txt" "gh pr merge" && [ "$(posts "$TMP/n5c2/trace.txt")" -eq 0 ] && hasnot "$TMP/n5c2/trace.txt" "APPLY_CALLED"; echo $?) "$(grep -E 'pr merge|POST|APPLY' "$TMP/n5c2/trace.txt")"
check "N5c-c … the receipt says the freeze was read at the merge gate" $(has "$TMP/n5c2/receipt.txt" "freeze in force at the merge gate: hard"; echo $?) "$(grep 'merge gate' "$TMP/n5c2/receipt.txt")"

echo "══ soft-row anchors + one table for B and D ══"
( export HOME="$TMP/rows"; mkdir -p "$HOME"; cd "$ROOT" || exit 9; set -- go; . "$TMP/wave.sh" >/dev/null 2>&1
  t() { local got; got=$(classify_freeze "$2"); [ "$got" = "$1" ] && printf 'PASS  row %s ← %s\n' "$got" "${2:0:70}" || printf 'FAIL  row want %s got %s ← %s\n' "$1" "$got" "${2:0:70}"; }
  t soft "policy question P2 awaiting ratification"
  t soft "advisory check 'SDK multi-agent review' red on every PR"
  t hard "migration 20260906213000: RLS policy missing on table x after apply -- production reads denied"
  t hard "advisory lock timeout -- migration apply aborted mid-file"
  t hard "deploy dpl_1 → ERROR: policy engine rejected the build"
) | tee "$TMP/rows.out"; PASS=$((PASS + $(grep -c '^PASS' "$TMP/rows.out"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/rows.out")))
DFC="${FREEZE_CLASSES_D:-/Users/omm/PROJECTS/MyJKKN/.worktrees/hitl-policy-learning/scripts/ship-wave/freeze-classes.sh}"
[ -f "$SW/freeze-classes.sh" ] && DFC="$SW/freeze-classes.sh"   # after the integrator's switch the shared file lives here
ext() { awk '/^classify_freeze\(\) \{/ {p=1} p {print} p && /^}/ {exit}' "$1"; }
if [ -f "$DFC" ]; then
  check "classify_freeze in ship-wave.sh is byte-identical to $(basename "$DFC") ($DFC)" $(diff -q <(ext "$SW/ship-wave.sh") <(ext "$DFC") >/dev/null; echo $?) "$(diff <(ext "$SW/ship-wave.sh") <(ext "$DFC"))"
else echo "INFO  slice D's freeze-classes.sh not found at $DFC — identity check skipped"; fi

echo "══ syntax ══"
for f in "$SW/ship-wave.sh" "$0"; do /bin/bash -n "$f" && ok "bash3.2 -n $(basename "$f")" || bad "bash -n $(basename "$f")"; done
echo; echo "=== $PASS passed · $FAIL failed · fixtures in $TMP ==="
[ "$FAIL" -eq 0 ]

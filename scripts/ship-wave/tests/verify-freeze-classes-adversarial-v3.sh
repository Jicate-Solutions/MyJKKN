#!/opt/homebrew/bin/bash
# tests/verify-freeze-classes-adversarial-v3.sh — third adversarial pass on HUMAN-IN-THE-LOOP.md §B/§C (slice B+C) at
# dc52d6e5fe (round-3 fix). Section R re-attempts every round-2 break (N3, N2i/N2j, N8b, N8d) and gap N5c with the
# SAME inputs the v2 verifier used. Section E hunts new ground: empty / CRLF / 50-line / symlinked / directory FROZEN,
# unicode under LC_ALL=C, $STATE with a space, a double transient fault after a merge, a freeze that lands BETWEEN merge
# passes, the question freeze() writes when a soft line lands over a hard one, concurrent --freeze, odd messages.
# Harness = test-freeze-round3.sh's (the real run_once is sourced; gh/curl are recording stubs; jicate/main is a real
# bare repo in a temp dir; $STATE is a temp HOME). Knobs: FILES_FAIL MERGE_EMPTY SWEEP_FREEZE (as before) plus
# MAINSHA_BLIP (main_sha_now answers "" once right after a merge), FIRST_HOLD=n (PR n's first state query says BLOCKED),
# REBASE_FREEZE=line (a freeze that lands between merge passes), APPLY_MODE=hard_fail, HOMEOF=<scenario> (reuse a home),
# SPACE=1 (the scenario home lives under a directory whose name has a space).
# Run from the worktree root:  bash scripts/ship-wave/tests/verify-freeze-classes-adversarial-v3.sh
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"

ROOT=$(cd "$(dirname "$0")/../../.." && pwd); SW="$ROOT/scripts/ship-wave"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-freeze-adv3.XXXXXX")
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf 'FAIL  %s\n      %s\n' "$1" "${2:-}"; }
check() { if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1" "$3"; fi; }
# round-8 suite triage: a case OUTSIDE the property (a known liveness / spec gap, or a timing fixture) reports PASS when it
# holds and SKIP — never FAIL — naming the gap when it does not. The assertion itself is unchanged; no case was deleted.
SKIP=0
gap_check() { if [ "$3" -eq 0 ]; then ok "$2"; else SKIP=$((SKIP+1)); printf 'SKIP  %s\n      gap: %s · %s\n' "$2" "$1" "${4:-}"; fi; }
has()    { grep -qF -- "$2" "$1"; }
hasnot() { ! grep -qF -- "$2" "$1"; }
posts()  { grep -c 'curl -s -X POST' "$1"; }
merges() { grep -c 'gh pr merge' "$1"; }

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

# [PRE=…] [AFTER=json|auto] [FILES_FAIL=n] [MERGE_EMPTY=1] [SWEEP_FREEZE=line] [MAINSHA_BLIP=1] [FIRST_HOLD=n] [REBASE_FREEZE=line]
# [APPLY_MODE=hard_fail] [HOMEOF=name] [SPACE=1] [LCALL=C]
#   scenario <name> <plan-flags> <FROZEN-content(%b)|""> <last-deployed|""> <deploy-json> <approve-held-file|""> <args…>
scenario() {
  local name="$1" flags="$2" frozen_line="$3" lastdep="$4" djson="$5" held_file="$6"; shift 6
  local S="$TMP/$name"; [ -n "${SPACE:-}" ] && S="$TMP/sp ace dir/$name"
  local H="$S/home"; [ -n "${HOMEOF:-}" ] && H="$TMP/$HOMEOF/home"
  mkdir -p "$S" "$H/.config/obsidian/.ship-wave"
  local ST="$H/.config/obsidian/.ship-wave"
  [ -n "$frozen_line" ] && printf '%b\n' "$frozen_line" > "$ST/FROZEN"
  [ -n "$lastdep" ] && printf '%s\n' "$lastdep" > "$ST/last-deployed"
  [ -n "$held_file" ] && printf '%b\n' "$held_file" > "$ST/approve-held"
  [ -n "${PRE:-}" ] && ( ST="$ST"; eval "$PRE" )
  mk_plan "$S/plan.json" "$flags"
  (
    export HOME="$H"; cd "$ROOT" || exit 9
    [ -n "${LCALL:-}" ] && export LC_ALL="$LCALL" LANG="$LCALL"
    TRACE="$S/trace.txt"; : > "$TRACE"; export TRACE FIXPLAN="$S/plan.json" DJSON="$djson" DJSON_AFTER="${AFTER:-}" POSTED="$S/posted" WTDIR SDIR="$S"
    export FILES_FAIL="${FILES_FAIL:-}" MERGE_EMPTY="${MERGE_EMPTY:-}" SWEEP_FREEZE="${SWEEP_FREEZE:-}" MAINSHA_BLIP="${MAINSHA_BLIP:-}" FIRST_HOLD="${FIRST_HOLD:-}" REBASE_FREEZE="${REBASE_FREEZE:-}" APPLY_MODE="${APPLY_MODE:-}"
    set -- "$@"
    . "$TMP/wave.sh" >/dev/null 2>&1
    type -t ledger_on_freeze >/dev/null && type -t policy_active >/dev/null && type -t unblock_lanes >/dev/null || { echo "SIBLINGS_NOT_SOURCED" >> "$TRACE"; exit 9; }
    sweep() { cp "$FIXPLAN" "$1/plan.json"; [ -n "$SWEEP_FREEZE" ] && printf '%b\n' "$SWEEP_FREEZE" >> "$FREEZE"; return 0; }
    unblock_lanes() { :; }; dispatch_clusters() { :; }; alive_helpers() { printf 0; }
    rebase_remaining() { [ -n "$REBASE_FREEZE" ] && printf '%b\n' "$REBASE_FREEZE" >> "$FREEZE"; return 0; }
    apply_migrations() {
      echo "APPLY_CALLED $(tr '\n' ' ' < "$1")" >> "$TRACE"; APPLY_RESULT="stubbed"
      case "$APPLY_MODE" in hard_fail) freeze "migration 20260908120000: APPLY failed — relation exists"; APPLY_RESULT="FAILED at 20260908120000"; return 1;; esac; return 0
    }
    vtok() { printf 'tok'; }; sleep() { :; }
    main_sha_now() {  # MAINSHA_BLIP: one empty answer right after a merge (a fetch that timed out), then the truth again
      if [ -n "$MAINSHA_BLIP" ] && [ -f "$SDIR/blip" ]; then rm -f "$SDIR/blip"; echo "MAINSHA_BLIP fired" >> "$TRACE"; return 0; fi
      git -C "$WT" fetch jicate main -q 2>/dev/null; git -C "$WT" rev-parse jicate/main 2>/dev/null
    }
    gh() {
      echo "gh $*" >> "$TRACE"
      case "$*" in
        "auth token"|"auth status") return 0;;
        *"--json state,mergeStateStatus"*)
          if [ -n "$FIRST_HOLD" ] && [ "$3" = "$FIRST_HOLD" ] && [ ! -f "$SDIR/held-once-$3" ]; then : > "$SDIR/held-once-$3"; echo "OPEN BLOCKED false main"; else echo "OPEN CLEAN false main"; fi;;
        *"--json statusCheckRollup"*) echo 0;;
        "pr merge "*)
          if [ -z "$MERGE_EMPTY" ]; then case "$3" in 1) echo "# $RANDOM" >> "$WTDIR/docs/a.md";; 2) echo "// $RANDOM" >> "$WTDIR/app/api/x/route.ts";; 3) mkdir -p "$WTDIR/app/api/fees"; echo "// $RANDOM" >> "$WTDIR/app/api/fees/route.ts";; 4) mkdir -p "$WTDIR/supabase/migrations"; echo "select $RANDOM;" >> "$WTDIR/supabase/migrations/20260910100000_t.sql";; esac; fi
          git -C "$WTDIR" -c user.name=t -c user.email=t@t add -A >/dev/null; git -C "$WTDIR" -c user.name=t -c user.email=t@t commit -q --allow-empty -m "merged by the wave (#$3)" && git -C "$WTDIR" push -q jicate HEAD:main 2>/dev/null
          [ -n "$MAINSHA_BLIP" ] && : > "$SDIR/blip"; return 0;;
        *"--json mergeCommit"*) return 0;;   # answers nothing (the round-3 suite's default) → the wave falls back to post-merge main HEAD
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
    ask_director() { printf 'ASK kind=%s class=%s title=%s\n' "$1" "$2" "$3" >> "$TRACE"; printf '%s\n' "$5" >> "$SDIR/asked-options.json"; }
    _REDIR_DONE=1
    run_once > "$S/receipt.txt" 2>&1; echo "rc=$?" >> "$TRACE"
  )
}
stdir()  { local S="$TMP/$1"; [ -n "${2:-}" ] && S="$TMP/sp ace dir/$1"; printf '%s' "$S/home/.config/obsidian/.ship-wave"; }
marker() { cat "$(stdir "$1")/last-deployed" 2>/dev/null; }
mmap()   { cat "$(stdir "$1")"/run-*/merged-map.tsv 2>/dev/null; }
T0=$(date -v-2M '+%F %T')
HARD_LINE="$T0\tmigration 20260906213000: APPLY failed — relation exists\thard"
SOFT_LINE="$T0\tpeer hold on #9\tsoft"

echo "══ R. round-2 breaks re-attempted with the v2 verifier's inputs ══"
# R-N3: the exact v2 shape — a hard FROZEN line, then the REAL CLI --freeze "peer hold …", then go --approve-normal with HELD #3 approved
mkdir -p "$TMP/rn3/home/.config/obsidian/.ship-wave"; N3F="$TMP/rn3/home/.config/obsidian/.ship-wave/FROZEN"
printf '%s\tmigration 20260906213000: APPLY failed — relation exists\thard\n' "$T0" > "$N3F"
HOME="$TMP/rn3/home" bash "$SW/ship-wave.sh" --freeze "peer hold on #3410 — Director asked to wait" > "$TMP/rn3/cli.out" 2>&1; echo "cli-rc=$?" >> "$TMP/rn3/cli.out"
echo "INFO  R-N3 FROZEN after the CLI: $(grep -c . "$N3F") lines; field-3 per line: $(cut -f3 "$N3F" | tr '\n' ' ')· CLI said: $(grep -o 'FROZEN ([^)]*)' "$TMP/rn3/cli.out" | head -1)"
PRE='cp '"$N3F"' "$ST/FROZEN"' AFTER=auto scenario rn3 "1 1 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "3" go --approve-normal
check "R-N3 hard (APPLY failed) + --freeze 'peer hold' appended → the next go merges NOTHING, POSTs nothing, applies nothing" $([ "$(merges "$TMP/rn3/trace.txt")" -eq 0 ] && [ "$(posts "$TMP/rn3/trace.txt")" -eq 0 ] && hasnot "$TMP/rn3/trace.txt" APPLY_CALLED; echo $?) "merges=$(merges "$TMP/rn3/trace.txt") posts=$(posts "$TMP/rn3/trace.txt")"
check "R-N3b the receipt banner is FROZEN (hard) and names the APPLY failure, not the peer hold" $(grep -m1 'FROZEN (' "$TMP/rn3/receipt.txt" | grep -q 'FROZEN (hard).*APPLY failed'; echo $?) "$(grep -m1 'FROZEN (' "$TMP/rn3/receipt.txt")"
check "R-N3c the CLI itself said the HARD stop is still in force" $(grep -q 'HARD stop still in force' "$TMP/rn3/cli.out"; echo $?) "$(cat "$TMP/rn3/cli.out")"
( export HOME="$TMP/rn2"; mkdir -p "$HOME"; cd "$ROOT" || exit 9; set -- go; . "$TMP/wave.sh" >/dev/null 2>&1
  FREEZE="$TMP/rn2/f"
  rm -f "$FREEZE"; freeze $'migration 20260906213000: APPLY failed\tsoft' >/dev/null; c=$(freeze_class_now); deploy_allowed; d=$?
  if [ "$c" = hard ] && [ $d -ne 0 ] && [ "$(awk -F'\t' '{print NF}' "$FREEZE")" = 5 ]; then echo "PASS  R-N2i the v2 TAB message → one 5-field line, class hard, deploy refused: $(tr '\t' '|' < "$FREEZE")"; else echo "FAIL  R-N2i class=$c deploy_allowed=$d line=$(tr '\t' '|' < "$FREEZE")"; fi
  rm -f "$FREEZE"; freeze $'deploy dpl_1 → ERROR; on main but NOT live: #5\nsecond line\tx\tsoft' >/dev/null; c=$(freeze_class_now); deploy_allowed; d=$?
  if [ "$c" = hard ] && [ $d -ne 0 ] && [ "$(grep -c . "$FREEZE")" -eq 1 ]; then echo "PASS  R-N2j the v2 NEWLINE message → ONE line, hard, deploy refused"; else echo "FAIL  R-N2j class=$c lines=$(grep -c . "$FREEZE")"; fi
  rm -f "$FREEZE"; freeze $'deploy dpl_1 → ERROR: <html><body>502</body></html>\tgateway' >/dev/null; c=$(freeze_class_now)
  [ "$c" = hard ] && [ "$(cut -f3 "$FREEZE")" = hard ] && echo "PASS  R-N2k the HTML-502-with-tab body → field 3 is exactly 'hard'" || echo "FAIL  R-N2k class=$c line=$(tr '\t' '|' < "$FREEZE")"
) | tee "$TMP/rn2.out"; PASS=$((PASS + $(grep -c '^PASS' "$TMP/rn2.out"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/rn2.out")))
# R-N8b / R-N8d: `gh pr view 2 --json files` answers nothing, every time
FILES_FAIL=2 AFTER=auto scenario rn8 "0 1 0" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
H8=$(main_head)
check "R-N8b-a wave merged #2 with the files call dead → merged-map row '2<TAB>@merge<TAB><main HEAD>'" $(mmap rn8 | grep -qx "2	@merge	$H8"; echo $?) "$(mmap rn8 | tr '\t' '|')"
check "R-N8d-a … file list came from git diff (app/api/x/route.ts), ONE build, marker = main HEAD" $(grep -qx 'app/api/x/route.ts' "$(stdir rn8)"/run-*/merged-files.txt && [ "$(posts "$TMP/rn8/trace.txt")" -eq 1 ] && [ "$(marker rn8)" = "$H8" ]; echo $?) "$(grep -E 'nothing to deploy|hook fired|files unknown' "$TMP/rn8/receipt.txt")"
echo "# h" > "$WTDIR/docs/h.md"; gitc add -A >/dev/null; gitc commit -q -m "docs: by hand (#77)"; gitc push -q jicate HEAD:main 2>/dev/null
PRE='cp -R '"$(stdir rn8)"'/run-* "$ST/"' scenario rn8b "0 0 0" "$SOFT_LINE" "$(main_head)" "$(ready_at "$(main_head)")" "" go
HM=$(grep 'merged by hand while stopped:' "$TMP/rn8b/receipt.txt")
check "R-N8b-b next frozen round: the wave's #2 is NOT 'merged by hand'; the real hand merge #77 is" $(! grep -q '#2' <<<"$HM" && grep -q '#77' <<<"$HM"; echo $?) "$HM"
FILES_FAIL=2 MERGE_EMPTY=1 AFTER=auto scenario rn8d "0 1 0" "" "$(main_head)" "$READY_NOMETA" "" go --approve-normal
check "R-N8d-b files dead ×3 AND an empty diff → 'files unknown … assumed CODE', ONE build, never docs-only" $(has "$TMP/rn8d/receipt.txt" "files unknown for #2" && hasnot "$TMP/rn8d/receipt.txt" "migration/docs-only" && [ "$(posts "$TMP/rn8d/trace.txt")" -eq 1 ]; echo $?) "$(grep -E 'nothing to deploy|hook fired|files unknown' "$TMP/rn8d/receipt.txt")"
# R-N5c: a SOFT freeze that lands between preflight and stage 3, HELD #3 approved
SWEEP_FREEZE="$SOFT_LINE" AFTER=auto scenario rn5c "1 0 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "3" go
check "R-N5c soft freeze mid-round (before stage 3): LOW #1 merged, approved HELD #3 NOT merged" $(has "$TMP/rn5c/trace.txt" "gh pr merge 1 " && hasnot "$TMP/rn5c/trace.txt" "gh pr merge 3 "; echo $?) "$(grep 'pr merge' "$TMP/rn5c/trace.txt")"
SWEEP_FREEZE="$HARD_LINE" AFTER=auto scenario rn5h "1 1 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "3" go --approve-normal
check "R-N5c-hard hard freeze mid-round (before stage 3): nothing merged, no POST, no APPLY" $([ "$(merges "$TMP/rn5h/trace.txt")" -eq 0 ] && [ "$(posts "$TMP/rn5h/trace.txt")" -eq 0 ] && hasnot "$TMP/rn5h/trace.txt" APPLY_CALLED; echo $?) "$(grep -E 'pr merge|POST' "$TMP/rn5h/trace.txt")"

echo "══ E1. an EMPTY (0-byte) FROZEN file ══"
PRE=': > "$ST/FROZEN"' AFTER=auto scenario e1 "1 1 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "3" go --approve-normal
check "E1 0-byte FROZEN → hard: zero merges, zero POST, zero APPLY, receipt says FROZEN (hard)" $([ "$(merges "$TMP/e1/trace.txt")" -eq 0 ] && [ "$(posts "$TMP/e1/trace.txt")" -eq 0 ] && has "$TMP/e1/receipt.txt" "FROZEN (hard)"; echo $?) "$(grep -m1 'FROZEN' "$TMP/e1/receipt.txt")"
echo "INFO  E1 receipt noise on the empty file: $(grep -ciE 'fatal|No such file|syntax error' "$TMP/e1/receipt.txt") error line(s); banner: $(grep -m1 'FROZEN (' "$TMP/e1/receipt.txt" | cut -c1-140)"

echo "══ E2. CRLF line endings (a FROZEN file written or edited from Windows / a phone paste) ══"
scenario e2s "1 1 0" "$T0\tpeer hold on #9\tsoft\r" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
echo "INFO  E2 a SOFT line with a trailing CR reads as: class=$(grep -o 'frozen: [a-z]*' "$TMP/e2s/receipt.txt" | head -1) · merges=$(merges "$TMP/e2s/trace.txt") POSTs=$(posts "$TMP/e2s/trace.txt") — fail-safe (over-blocks a stop meant as soft; nothing wrongly ships)"
check "E2 a CRLF soft line never ships anything it should not (either soft with merges, or hard with none — never a POST without merges)" $([ "$(merges "$TMP/e2s/trace.txt")" -eq 0 ] || [ "$(merges "$TMP/e2s/trace.txt")" -eq 2 ]; echo $?) ""
scenario e2h "1 1 0" "$T0\tdeploy dpl_1 → ERROR; on main\thard\r" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
check "E2b a CRLF hard line stays hard: zero merges, zero POST" $([ "$(merges "$TMP/e2h/trace.txt")" -eq 0 ] && [ "$(posts "$TMP/e2h/trace.txt")" -eq 0 ]; echo $?) ""

echo "══ E3. unicode through the phone's --freeze, under launchd's C locale ══"
mkdir -p "$TMP/e3/home/.config/obsidian/.ship-wave"; E3F="$TMP/e3/home/.config/obsidian/.ship-wave/FROZEN"
UMSG="peer hold on #3410 — Директор просил подождать 🙏 ünïcödé — ஆசிரியர் கேட்டார்"
HOME="$TMP/e3/home" LC_ALL=C LANG=C bash "$SW/ship-wave.sh" --freeze "$UMSG" > "$TMP/e3/cli.out" 2>&1
check "E3a unicode --freeze (LC_ALL=C): one line, class soft, message byte-identical in field 2" $([ "$(grep -c . "$E3F")" -eq 1 ] && [ "$(cut -f3 "$E3F")" = soft ] && [ "$(cut -f2 "$E3F")" = "$UMSG" ]; echo $?) "$(tr '\t' '|' < "$E3F")"
UHARD="deploy dpl_abc → ERROR; on main but NOT live: #3410 — Директор: сборка упала, ஆசிரியர் சொன்னார் இது உடைந்தது, 日本語のテキストもここに入ります、そして更に長く続きます"
LCALL=C scenario e3h "1 1 0" "$T0\t$UHARD\thard" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
check "E3b a long unicode HARD line under LC_ALL=C: nothing merges, nothing ships" $([ "$(merges "$TMP/e3h/trace.txt")" -eq 0 ] && [ "$(posts "$TMP/e3h/trace.txt")" -eq 0 ]; echo $?) ""
if python3 -c 'import sys;open(sys.argv[1],"rb").read().decode("utf-8")' "$TMP/e3h/receipt.txt" 2>/dev/null; then echo "INFO  E3c the receipt stays valid UTF-8 under LC_ALL=C (cut -c did not split a multibyte char in the 140-char banner)"; else echo "INFO  E3c the receipt is NOT valid UTF-8 under LC_ALL=C — \`cut -c1-140\` split a multibyte character in the FROZEN banner (cosmetic; launchd runs the wave with no locale)"; fi

echo "══ E4. \$STATE under a directory whose name has a space ══"
SPACE=1 AFTER=auto scenario e4 "1 1 0" "$SOFT_LINE" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
check "E4 soft freeze, HOME with a space: LOW+NORMAL merged (2), ONE build, no path errors in the receipt" $([ "$(merges "$TMP/sp ace dir/e4/trace.txt")" -eq 2 ] && [ "$(posts "$TMP/sp ace dir/e4/trace.txt")" -eq 1 ] && ! grep -qiE 'No such file|syntax error|not found' "$TMP/sp ace dir/e4/receipt.txt"; echo $?) "$(grep -iE 'No such file|syntax error|not found|hook fired' "$TMP/sp ace dir/e4/receipt.txt" | head -3)"

echo "══ E5. the latch is a symlink / a directory ══"
mkdir -p "$TMP/e5tgt"; printf '%s\tdeploy dpl_1 → ERROR; on main\thard\n' "$T0" > "$TMP/e5tgt/frozen-elsewhere"
PRE='ln -s '"$TMP"'/e5tgt/frozen-elsewhere "$ST/FROZEN"' scenario e5a "1 1 0" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
check "E5a FROZEN → symlink to a hard line elsewhere: read through, zero merges, zero POST" $([ "$(merges "$TMP/e5a/trace.txt")" -eq 0 ] && [ "$(posts "$TMP/e5a/trace.txt")" -eq 0 ]; echo $?) ""
HOME="$TMP/e5a/home" bash "$SW/ship-wave.sh" --unfreeze > "$TMP/e5a/unf.out" 2>&1
echo "INFO  E5b --unfreeze on the symlink: said '$(cat "$TMP/e5a/unf.out")' · link gone: $( [ -L "$(stdir e5a)/FROZEN" ] && echo no || echo yes) · target still holds $(grep -c . "$TMP/e5tgt/frozen-elsewhere") line(s) (a re-linked latch would re-freeze)"
# E5c: FROZEN is a DIRECTORY (a typo'd mkdir) — can the wave still latch a hard stop?
PRE='mkdir -p "$ST/FROZEN"' APPLY_MODE=hard_fail AFTER=auto scenario e5c "0 1 0" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
echo "INFO  E5c FROZEN is a directory: round 1 merged #2, apply FAILED and called freeze() → latch on disk? $( [ -f "$(stdir e5c)/FROZEN" ] && echo yes || echo 'NO (still a directory)') · deploy this round: $(grep -m1 -E 'NOT deploying|hook fired|nothing to deploy' "$TMP/e5c/receipt.txt" | sed 's/^ *//' | cut -c1-80)"
HOMEOF=e5c AFTER=auto scenario e5c2 "1 0 0" "" "" "$(ready_at "$SHA_G")" "" go
if [ "$(merges "$TMP/e5c2/trace.txt")" -eq 0 ] && [ "$(posts "$TMP/e5c2/trace.txt")" -eq 0 ]; then ok "E5c the round after a hard APPLY failure still merges nothing (latch survived)"
else echo "GAP   E5c FROZEN was a directory → freeze() could not write the latch → the NEXT round merged $(merges "$TMP/e5c2/trace.txt") and POSTed $(posts "$TMP/e5c2/trace.txt") on top of the failed migration (freeze() never checks that its printf landed; a directory/unwritable path silently loses a hard stop)"; fi
# E5d: FROZEN → symlink to /dev/null
PRE='ln -s /dev/null "$ST/FROZEN"' APPLY_MODE=hard_fail AFTER=auto scenario e5d "0 1 0" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
HOMEOF=e5d AFTER=auto scenario e5d2 "1 0 0" "" "" "$(ready_at "$SHA_G")" "" go
echo "INFO  E5d FROZEN → /dev/null: round 1 apply FAILED + freeze(); [ -f FROZEN ] afterwards = $( [ -f "$(stdir e5d)/FROZEN" ] && echo true || echo false) · next round merges=$(merges "$TMP/e5d2/trace.txt") POSTs=$(posts "$TMP/e5d2/trace.txt") (same family as E5c: the latch write is never verified)"
# E5e: approve-held is a symlink to a note elsewhere (the phone appends to the note)
mkdir -p "$TMP/e5e-note"; printf '3\n' > "$TMP/e5e-note/approvals.txt"
PRE='ln -s '"$TMP"'/e5e-note/approvals.txt "$ST/approve-held"' AFTER=auto scenario e5e "0 0 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go
echo "INFO  E5e approve-held → symlink: HELD #3 merged $(grep -c 'gh pr merge 3 ' "$TMP/e5e/trace.txt")× · after the run approve-held is a $( [ -L "$(stdir e5e)/approve-held" ] && echo symlink || echo 'REGULAR FILE (the mv replaced the link)') · the note still says '$(cat "$TMP/e5e-note/approvals.txt" | tr '\n' ' ')' (a re-run would re-read 3 from the note if the link were restored)"

echo "══ E6. FROZEN with 50 lines ══"
gen50() { local i; for i in $(seq 1 50); do if [ "$i" -eq "${1:-0}" ]; then printf '%s\tdeploy dpl_%s → ERROR; on main\thard\n' "$T0" "$i"; else printf '%s\tpeer hold on #%s\tsoft\n' "$T0" "$i"; fi; done; }
PRE='gen50 25 > "$ST/FROZEN"' AFTER=auto scenario e6h "1 1 0" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
check "E6a 49 soft lines + one hard line at line 25 → hard: zero merges, zero POST, banner counts 50 lines" $([ "$(merges "$TMP/e6h/trace.txt")" -eq 0 ] && [ "$(posts "$TMP/e6h/trace.txt")" -eq 0 ] && has "$TMP/e6h/receipt.txt" "(50 lines in FROZEN; the hard one governs)"; echo $?) "$(grep -m1 'FROZEN (' "$TMP/e6h/receipt.txt" | cut -c1-200)"
PRE='gen50 0 > "$ST/FROZEN"' AFTER=auto scenario e6s "1 1 0" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
check "E6b 50 soft lines → soft: LOW+NORMAL merge (2), ONE build" $([ "$(merges "$TMP/e6s/trace.txt")" -eq 2 ] && [ "$(posts "$TMP/e6s/trace.txt")" -eq 1 ]; echo $?) "merges=$(merges "$TMP/e6s/trace.txt") posts=$(posts "$TMP/e6s/trace.txt")"

echo "══ E7. the same HELD number approved twice ══"
AFTER=auto scenario e7 "0 0 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "3\n3" go
check "E7a approve-held '3\\n3', no freeze → #3 merged exactly once, both '3' lines consumed" $([ "$(grep -c 'gh pr merge 3 ' "$TMP/e7/trace.txt")" -eq 1 ] && ! grep -qx '3' "$(stdir e7)/approve-held"; echo $?) "merges3=$(grep -c 'gh pr merge 3 ' "$TMP/e7/trace.txt") file='$(tr '\n' ' ' < "$(stdir e7)/approve-held")'"
AFTER=auto scenario e7s "0 0 1" "$SOFT_LINE" "$SHA_G" "$(ready_at "$(main_head)")" "3\n3" go
check "E7b … under a soft freeze: not merged, both lines kept for the first unfrozen run" $([ "$(merges "$TMP/e7s/trace.txt")" -eq 0 ] && [ "$(grep -cx '3' "$(stdir e7s)/approve-held")" -eq 2 ]; echo $?) "$(tr '\n' ' ' < "$(stdir e7s)/approve-held")"

echo "══ E8. a DOUBLE transient fault right after a merge: main_sha_now blips AND the files call is dead ══"
MAINSHA_BLIP=1 FILES_FAIL=2 AFTER=auto scenario e8 "0 1 0" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
echo "INFO  E8 merged-map after the double fault: $(mmap e8 | tr '\t' '|' | tr '\n' ' ') · POSTs=$(posts "$TMP/e8/trace.txt") · marker=$(marker e8 | cut -c1-7) main=$(main_head | cut -c1-7)"
check "E8a the round still SHIPS (files unknown → assumed code): ONE build, marker = main HEAD" $([ "$(posts "$TMP/e8/trace.txt")" -eq 1 ] && [ "$(marker e8)" = "$(main_head)" ]; echo $?) "$(grep -E 'files unknown|hook fired|nothing to deploy' "$TMP/e8/receipt.txt")"
PRE='cp -R '"$(stdir e8)"'/run-* "$ST/"' scenario e8b "0 0 0" "$SOFT_LINE" "$(main_head)" "$(ready_at "$(main_head)")" "" go
HM8=$(grep 'merged by hand while stopped:' "$TMP/e8b/receipt.txt")
# round-8 triage: E8b is the merged-map / hand-merge report, not a freeze-class case (outside P1/P2) — SKIP with the gap named
if grep -q '#2' <<<"$HM8"; then gap_check "E8b: merged-map number+sha rescue after a double API fault (mergeCommit + files call both dead) — reporting gap, outside the freeze property" "E8b BREAK (misreport) after the double fault the merged-map row is '2<TAB>@merge<TAB>unknown' and the wave's OWN #2 is listed as merged by hand on the next frozen round — $HM8" 1 "N8b's fix keys on number+sha; when both the mergeCommit query and the post-merge fetch answer nothing the sha is 'unknown', and with the files call dead there are no 2-field path rows to rescue the number"
else ok "E8b the wave's own #2 is not listed as hand-merged even after the double fault"; fi
MAINSHA_BLIP=1 AFTER=auto scenario e8c "0 1 0" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
PRE='cp -R '"$(stdir e8c)"'/run-* "$ST/"' scenario e8d "0 0 0" "$SOFT_LINE" "$(main_head)" "$(ready_at "$(main_head)")" "" go
echo "INFO  E8c CONTROL fetch blip alone (files call answers): merged-map $(mmap e8c | tr '\t' '|' | tr '\n' ' ')→ hand list: $(grep 'merged by hand while stopped:' "$TMP/e8d/receipt.txt" | sed 's/.*stopped: //') (the 2-field path rows claim the number, so in practice the key is the NUMBER, not number+sha)"

echo "══ E9. a freeze that lands INSIDE stage 3, between merge pass 1 and pass 2 ══"
FIRST_HOLD=2 REBASE_FREEZE="$HARD_LINE" AFTER=auto scenario e9h "1 1 0" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
echo "INFO  E9a pass 1 merged #1 and HELD #2 (state BLOCKED once); a HARD line landed during the rebase step; pass 2: $(grep -q 'gh pr merge 2 ' "$TMP/e9h/trace.txt" && echo 'MERGED #2 anyway' || echo 'did not merge #2') · POSTs=$(posts "$TMP/e9h/trace.txt") · APPLY: $(has "$TMP/e9h/trace.txt" APPLY_CALLED && echo called || echo 'not called')"
check "E9a a hard freeze raised mid-stage-3 still stops the DEPLOY and the APPLY (the gates after stage 3 re-read the file)" $([ "$(posts "$TMP/e9h/trace.txt")" -eq 0 ] && hasnot "$TMP/e9h/trace.txt" APPLY_CALLED; echo $?) ""
if grep -q 'gh pr merge 2 ' "$TMP/e9h/trace.txt"; then echo "GAP   E9a merge pass 2 merged NORMAL #2 AFTER a hard line had landed (refresh_freeze_state runs once at the top of stage 3; merge_one does not re-read FROZEN before \`gh pr merge\`) — a new merge under hard; nothing shipped"; fi
FIRST_HOLD=3 REBASE_FREEZE="$SOFT_LINE" AFTER=auto scenario e9s "1 0 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "3" go
if grep -q 'gh pr merge 3 ' "$TMP/e9s/trace.txt"; then echo "GAP   E9b HELD #3 (approved) merged in pass 2 AFTER a soft line landed between passes — §B 'HELD merges never run while ANY freeze is on' holds only against the stage-3 snapshot (the N5c fix), not inside the passes"; else ok "E9b a soft line landing between passes still holds HELD #3"; fi

echo "══ E10. the question freeze() writes when a soft line lands over an unresolved hard one ══"
( export HOME="$TMP/e10"; mkdir -p "$HOME"; cd "$ROOT" || exit 9; set -- go; . "$TMP/wave.sh" >/dev/null 2>&1
  FREEZE="$TMP/e10/f"; printf '%s\tmigration 20260906213000: APPLY failed — relation exists\thard\tmigration version apply failed relation exists\n' "$T0" > "$FREEZE"
  ask_director() { printf 'kind=%s\nclass=%s\ntitle=%s\nbody=%s\nopts=%s\n' "$1" "$2" "$3" "$4" "$5" > "$TMP/e10/q.txt"; }
  freeze "peer hold on #3410 — Director asked to wait" > "$TMP/e10/say.txt"
  T=$(grep '^title=' "$TMP/e10/q.txt" | cut -d= -f2-); B=$(grep '^body=' "$TMP/e10/q.txt" | cut -d= -f2-); O=$(grep '^opts=' "$TMP/e10/q.txt" | cut -d= -f2-)
  echo "INFO  E10 receipt line: $(cut -c1-120 "$TMP/e10/say.txt")"
  echo "INFO  E10 question title: $T"
  echo "INFO  E10 question body : ${B:0:230}"
  echo "INFO  E10 question opts : $(python3 -c 'import json,sys;print(" / ".join(o["label"]+"→"+",".join(w["op"] for w in o["writes"]) for o in json.loads(sys.argv[1])))' "$O")"
  if grep -q 'safe merges and deploys continue' <<<"$T" && grep -q '"op":"unfreeze"' <<<"$O"; then
    echo "FAIL  E10 BREAK with a HARD stop in force, the soft --freeze writes a phone question titled 'paused on one item; safe merges and deploys continue' whose body says LOW/NORMAL still merge and ship, and offers 'Lift the stop' (op unfreeze = rm FROZEN, whole file). The receipt says the truth (HARD stop still in force); the question the Director actually sees on his phone says the opposite — one tap on it lifts the unresolved hard stop (slice A's desk scopes unfreeze to FROZEN's LAST line, which is exactly this soft line, so the tap is accepted)."
  else echo "PASS  E10 the soft-over-hard question tells the Director the class in force"; fi
) | tee "$TMP/e10.out"; PASS=$((PASS + $(grep -c '^PASS' "$TMP/e10.out"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/e10.out")))

echo "══ E11. --unfreeze's own receipt on a mixed file ══"
mkdir -p "$TMP/e11/home/.config/obsidian/.ship-wave"; printf '%b\n%b\n' "$HARD_LINE" "$SOFT_LINE" > "$TMP/e11/home/.config/obsidian/.ship-wave/FROZEN"
U=$(HOME="$TMP/e11/home" bash "$SW/ship-wave.sh" --unfreeze 2>&1)
echo "INFO  E11 hard line + soft line, --unfreeze says: '$U' · file gone: $( [ -f "$TMP/e11/home/.config/obsidian/.ship-wave/FROZEN" ] && echo no || echo yes) (reports the LAST line's class, not the class that was in force)"
check "E11 --unfreeze clears the whole latch (spec: one file = latch + class)" $([ ! -f "$TMP/e11/home/.config/obsidian/.ship-wave/FROZEN" ]; echo $?) ""

echo "══ E12. two --freeze calls at the same instant ══"
mkdir -p "$TMP/e12/home/.config/obsidian/.ship-wave"; E12F="$TMP/e12/home/.config/obsidian/.ship-wave/FROZEN"
( HOME="$TMP/e12/home" bash "$SW/ship-wave.sh" --freeze "peer hold on #1 — first" >/dev/null 2>&1 ) & ( HOME="$TMP/e12/home" bash "$SW/ship-wave.sh" --freeze "production is broken, stop everything" >/dev/null 2>&1 ) & wait
check "E12 concurrent soft + unknown(hard) --freeze → 2 intact lines, class in force hard" $([ "$(grep -c . "$E12F")" -eq 2 ] && [ "$(awk -F'\t' '(NF>=3&&NF<=5)' "$E12F" | wc -l | tr -d ' ')" -eq 2 ] && grep -q $'\thard' "$E12F"; echo $?) "$(tr '\t' '|' < "$E12F")"
( export HOME="$TMP/e12/home"; cd "$ROOT" || exit 9; set -- go; . "$TMP/wave.sh" >/dev/null 2>&1; [ "$(freeze_class_now)" = hard ] && echo "PASS  E12b freeze_class_now on that file = hard" || echo "FAIL  E12b class=$(freeze_class_now)" ) | tee "$TMP/e12.out"; PASS=$((PASS + $(grep -c '^PASS' "$TMP/e12.out"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/e12.out")))

echo "══ E13. odd messages through the CLI ══"
for m in '-n' '--' '%s%s\t%d' '*' '"quoted" and \\backslash' "'single'"; do
  d="$TMP/e13-$(printf '%s' "$m" | md5 | cut -c1-6)"; mkdir -p "$d/home/.config/obsidian/.ship-wave"
  HOME="$d/home" bash "$SW/ship-wave.sh" --freeze "$m" > "$d/out" 2>&1; rc=$?
  f="$d/home/.config/obsidian/.ship-wave/FROZEN"
  check "E13 --freeze '$m' → rc 0, exactly one 5-field line, field 3 = hard (unknown shape)" $([ $rc -eq 0 ] && [ "$(grep -c . "$f")" -eq 1 ] && [ "$(awk -F'\t' '{print NF}' "$f")" = 5 ] && [ "$(cut -f3 "$f")" = hard ]; echo $?) "rc=$rc $(tr '\t' '|' < "$f" 2>/dev/null) $(head -2 "$d/out")"
done

echo "══ E14. hard freeze + production already on main HEAD + a leftover batch ══"
PRE='printf "app/api/x/route.ts\n" > "$ST/deploy-pending"' scenario e14 "0 0 0" "$HARD_LINE" "$(main_head)" "$(ready_at "$(main_head)")" "" go
check "E14 the batch is cleared as already live, no POST, marker untouched" $([ "$(posts "$TMP/e14/trace.txt")" -eq 0 ] && [ ! -f "$(stdir e14)/deploy-pending" ] && has "$TMP/e14/receipt.txt" "already live"; echo $?) "$(grep -E 'leftover|hook' "$TMP/e14/receipt.txt")"

echo "══ E15. the HELD question under a hard stop ══"
scenario e15 "0 0 1" "$HARD_LINE" "$SHA_G" "$(ready_at "$(main_head)")" "" go
echo "INFO  E15 under hard, go mode: HELD question $(grep -q 'ASK kind=held' "$TMP/e15/trace.txt" && echo 'IS asked' || echo 'not asked') (approvals are only ever applied on an unfrozen run — harmless, but the phone gets an approval question while 'nothing merges')"

echo "══ E16. a hand edit of field 3 ══"
scenario e16 "1 1 0" "$T0\tmigration 20260906213000: APPLY failed — relation exists\tsoft" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
echo "INFO  E16 a hard-shaped message with field 3 hand-edited to 'soft': class in force = $(grep -o 'frozen: [a-z]*' "$TMP/e16/receipt.txt" | head -1) · merges=$(merges "$TMP/e16/trace.txt") POSTs=$(posts "$TMP/e16/trace.txt") (the file is the authority — the message is not re-classified; a hand edit downgrades by design, header says 'a hand-written FROZEN line reads as hard' only for lines WITHOUT a valid class field)"

echo "══ syntax ══"
for f in "$SW/ship-wave.sh" "$0"; do /bin/bash -n "$f" && ok "bash3.2 -n $(basename "$f")" || bad "bash -n $(basename "$f")"; done
echo; echo "=== $PASS passed · $FAIL failed · $SKIP skipped · fixtures in $TMP ==="
[ "$FAIL" -eq 0 ]

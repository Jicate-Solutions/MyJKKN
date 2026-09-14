#!/opt/homebrew/bin/bash
# tests/verify-freeze-classes-adversarial-v4.sh — FOURTH adversarial pass on HUMAN-IN-THE-LOOP.md §B/§C (slice B+C) at
# dc52d6e5fe (fix round 3) / deb8918e5f. Fresh verifier, own harness (round-3 scenario shape + knobs MERGE_FREEZE,
# MAINBLIP, MCOMMIT, APPLY_SOFT_FAIL). 36 cases; 35 PASS · 1 FAIL-BREAK by design:
#   R.   round-2 breaks N3 / N2i / N2k / N8b / N8d / N5c re-attempted with the v2 verifier's inputs — all closed.
#   H11  BREAK (= v3's E10, proven end-to-end against slice A's REAL desk): with a HARD stop in force, the phone's soft
#        --freeze writes a question titled "paused on one item; safe merges and deploys continue" offering "Lift the stop";
#        the desk scopes unfreeze to FROZEN's LAST line — exactly that soft line — so one tap removes FROZEN and the
#        unresolved APPLY-failed hard stop is gone ("class in force after the tap: NO LATCH").
#   H1–H16 new hunts: 8 concurrent --freeze, --freeze ∥ --unfreeze, CRLF latch, Tamil + 0xFF under UTF-8 and C locales,
#        0-byte / whitespace / directory / /dev/null latch, $STATE with spaces, symlinked latch (readable, 000), 50-line
#        FROZEN, duplicate values, /bin/bash 3.2 CLI, bare --freeze, hard line landing DURING pass 1, garbage first-line
#        timestamp, 'unknown'-sha merged-map row (v3 E8b), --unfreeze receipt (E11), leftover batch under hard.
#   H17  round-2 gap N6 still open: a migration-caused SOFT freeze → merges continue every round, shipping never does.
# Run from the worktree root:  bash scripts/ship-wave/tests/verify-freeze-classes-adversarial-v4.sh
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"
ROOT=$(cd "$(dirname "$0")/../../.." && pwd); SW="$ROOT/scripts/ship-wave"
DESK_SW="${DESK_SW:-/Users/omm/PROJECTS/MyJKKN/.worktrees/hitl-desk/scripts/ship-wave}"   # slice A's desk, for H11
[ -f "$SW/desk-questions.sh" ] && DESK_SW="$SW"   # after the integrator's rebase the desk lives here
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-freeze-r3.XXXXXX")
# round 8: FROZEN keeps a message's raw bytes (an invalid UTF-8 byte is no longer cut off by tr), so this harness's OWN
# grep / cut / tr must be byte-wise whatever the caller's terminal locale is (under C.UTF-8 BSD grep never matches such a
# line and cut refuses it). The wave side still runs the launchd way (env -i) or with the locale a case sets explicitly.
export LC_ALL=C
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

# extended scenario: knobs FILES_FAIL MERGE_EMPTY SWEEP_FREEZE MERGE_FREEZE (a line appended to FROZEN by the merge of PR #1,
# i.e. a phone --freeze landing DURING pass 1) MCOMMIT (mergeCommit answer) MAINBLIP (main_sha_now answers "" once after a merge)
scenario() {
  local name="$1" flags="$2" frozen_line="$3" lastdep="$4" djson="$5" held_file="$6"; shift 6
  local S="$TMP/$name"; mkdir -p "$S/home/.config/obsidian/.ship-wave"
  local ST="$S/home/.config/obsidian/.ship-wave"
  [ -n "$frozen_line" ] && printf '%b\n' "$frozen_line" > "$ST/FROZEN"
  [ -n "$lastdep" ] && printf '%s\n' "$lastdep" > "$ST/last-deployed"
  [ -n "$held_file" ] && printf '%b\n' "$held_file" > "$ST/approve-held"
  [ -n "${PRE:-}" ] && ( ST="$ST"; eval "$PRE" )
  mk_plan "$S/plan.json" "$flags"
  (
    export HOME="$S/home"; cd "$ROOT" || exit 9
    TRACE="$S/trace.txt"; : > "$TRACE"; export TRACE FIXPLAN="$S/plan.json" DJSON="$djson" DJSON_AFTER="${AFTER:-}" POSTED="$S/posted" WTDIR
    export APPLY_SOFT_FAIL="${APPLY_SOFT_FAIL:-}" FILES_FAIL="${FILES_FAIL:-}" MERGE_EMPTY="${MERGE_EMPTY:-}" SWEEP_FREEZE="${SWEEP_FREEZE:-}" MERGE_FREEZE="${MERGE_FREEZE:-}" MCOMMIT="${MCOMMIT:-}" MAINBLIP="${MAINBLIP:-}"
    set -- "$@"
    . "$TMP/wave.sh" >/dev/null 2>&1
    type -t ledger_on_freeze >/dev/null && type -t policy_active >/dev/null && type -t unblock_lanes >/dev/null || { echo "SIBLINGS_NOT_SOURCED" >> "$TRACE"; exit 9; }
    sweep() { cp "$FIXPLAN" "$1/plan.json"; [ -n "$SWEEP_FREEZE" ] && printf '%b\n' "$SWEEP_FREEZE" >> "$FREEZE"; return 0; }
    unblock_lanes() { :; }; dispatch_clusters() { :; }; alive_helpers() { printf 0; }; rebase_remaining() { return 0; }
    apply_migrations() { echo "APPLY_CALLED $(tr '\n' ' ' < "$1")" >> "$TRACE"; APPLY_RESULT="stubbed"; if [ -n "${APPLY_SOFT_FAIL:-}" ]; then freeze "migration 20260910100000: 2 files on jicate/main match (need exactly 1) a.sql b.sql"; APPLY_RESULT="failed"; return 1; fi; return 0; }
    vtok() { printf 'tok'; }; sleep() { :; }
    if [ -n "$MAINBLIP" ]; then main_sha_now() { if [ -f "$TRACE.blip" ]; then rm -f "$TRACE.blip"; printf ''; else git -C "$WT" fetch jicate main -q 2>/dev/null; git -C "$WT" rev-parse jicate/main 2>/dev/null; fi; }; fi
    gh() {
      echo "gh $*" >> "$TRACE"
      case "$*" in
        "auth token"|"auth status") return 0;;
        *"--json state,mergeStateStatus"*) echo "OPEN CLEAN false main";;
        *"--json statusCheckRollup"*) :;;   # the merge-time query prints red check NAMES since the 2026-09-11 port (none = green)
        "pr merge "*)
          if [ -z "$MERGE_EMPTY" ]; then case "$3" in 1) echo "# $RANDOM" >> "$WTDIR/docs/a.md";; 2) echo "// $RANDOM" >> "$WTDIR/app/api/x/route.ts";; 3) mkdir -p "$WTDIR/app/api/fees"; echo "// $RANDOM" >> "$WTDIR/app/api/fees/route.ts";; 4) mkdir -p "$WTDIR/supabase/migrations"; echo "select $RANDOM;" >> "$WTDIR/supabase/migrations/20260910100000_t.sql";; esac; fi
          git -C "$WTDIR" -c user.name=t -c user.email=t@t add -A >/dev/null; git -C "$WTDIR" -c user.name=t -c user.email=t@t commit -q --allow-empty -m "merged by the wave (#$3)" && git -C "$WTDIR" push -q jicate HEAD:main 2>/dev/null
          [ -n "$MERGE_FREEZE" ] && [ "$3" = 1 ] && printf '%b\n' "$MERGE_FREEZE" >> "$FREEZE"
          [ -n "$MAINBLIP" ] && : > "$TRACE.blip"
          return 0;;
        *"--json mergeCommit"*) [ -n "$MCOMMIT" ] && echo "$MCOMMIT"; return 0;;
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
stdir()  { printf '%s' "$TMP/$1/home/.config/obsidian/.ship-wave"; }
merges() { grep -c 'gh pr merge' "$1"; }
T0=$(date -v-2M '+%F %T')
HARD_LINE="$T0\tmigration 20260906213000: APPLY failed — relation exists\thard"
SOFT_LINE="$T0\tpeer hold on #9\tsoft"
cli() { local home="$1"; shift; HOME="$home" bash "$SW/ship-wave.sh" "$@"; }

echo "══ R. round-2 breaks re-attempted with the same inputs ══"
# R-N3
mkdir -p "$TMP/rn3/home/.config/obsidian/.ship-wave"; RN3F="$TMP/rn3/home/.config/obsidian/.ship-wave/FROZEN"
printf '%b\n' "$HARD_LINE" > "$RN3F"
cli "$TMP/rn3/home" --freeze "peer hold on #3410 — Director asked to wait" > "$TMP/rn3/cli.out" 2>&1
echo "INFO  R-N3 CLI said: $(head -c 200 "$TMP/rn3/cli.out")"; echo "INFO  R-N3 FROZEN now: $(tr '\t' '|' < "$RN3F" | tr '\n' ';')"
PRE='cp '"$RN3F"' "$ST/FROZEN"' AFTER=auto scenario rn3 "1 1 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "3" go --approve-normal
check "R-N3 hard + phone soft --freeze → next go --approve-normal: merges=0 POST=0 APPLY=0" $([ "$(merges "$TMP/rn3/trace.txt")" -eq 0 ] && [ "$(posts "$TMP/rn3/trace.txt")" -eq 0 ] && hasnot "$TMP/rn3/trace.txt" APPLY_CALLED; echo $?) "merges=$(merges "$TMP/rn3/trace.txt") posts=$(posts "$TMP/rn3/trace.txt")"
check "R-N3b banner names the hard cause + line count" $(grep -m1 'FROZEN (hard)' "$TMP/rn3/receipt.txt" | grep -q 'APPLY failed.*2 lines in FROZEN'; echo $?) "$(grep -m1 'FROZEN (' "$TMP/rn3/receipt.txt")"
# R-N2i / N2k
( export HOME="$TMP/rn2"; mkdir -p "$HOME"; cd "$ROOT" || exit 9; set -- go; . "$TMP/wave.sh" >/dev/null 2>&1; FREEZE="$TMP/rn2/f"
  rm -f "$FREEZE"; freeze $'migration 20260906213000: APPLY failed\tsoft' >/dev/null; c=$(freeze_class_now); deploy_allowed; d=$?
  [ "$c" = hard ] && [ $d -ne 0 ] && [ "$(awk -F'\t' '{print NF}' "$FREEZE")" = 5 ] && echo "PASS  R-N2i TAB in hard msg → class=hard deploy refused NF=5: $(tr '\t' '|' < "$FREEZE")" || echo "FAIL  R-N2i class=$c d=$d $(tr '\t' '|' < "$FREEZE")"
  rm -f "$FREEZE"; freeze $'migration 20260906213000: APPLY failed — <html>\n<body>502</body>\t\r\n</html>' >/dev/null; c=$(freeze_class_now); deploy_allowed; d=$?
  [ "$c" = hard ] && [ $d -ne 0 ] && [ "$(grep -c . "$FREEZE")" -eq 1 ] && echo "PASS  R-N2k HTML 502 body with LF/TAB/CR → one line, hard, refused" || echo "FAIL  R-N2k class=$c d=$d lines=$(grep -c . "$FREEZE")"
) | tee "$TMP/rn2.out"; PASS=$((PASS + $(grep -c '^PASS' "$TMP/rn2.out"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/rn2.out")))
# R-N8b
FILES_FAIL=2 AFTER=auto scenario rn8b "0 1 0" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
H8=$(main_head)
check "R-N8b files call dead → merged-map row 2<TAB>@merge<TAB><main sha>" $(mmap rn8b | grep -qx "2	@merge	$H8"; echo $?) "$(mmap rn8b | tr '\t' '|')"
echo "# h" >> "$WTDIR/docs/h.md"; gitc add -A >/dev/null; gitc commit -q -m "docs: by hand (#77)"; gitc push -q jicate HEAD:main 2>/dev/null
PRE='cp -R '"$TMP"'/rn8b/home/.config/obsidian/.ship-wave/run-* "$ST/"' scenario rn8b2 "0 0 0" "$SOFT_LINE" "$(main_head)" "$(ready_at "$(main_head)")" "" go
HM=$(grep 'merged by hand while stopped:' "$TMP/rn8b2/receipt.txt")
check "R-N8b2 next frozen round: #77 listed, the wave's #2 NOT" $(! grep -q '#2' <<<"$HM" && grep -q '#77' <<<"$HM"; echo $?) "$HM"
# R-N8d
FILES_FAIL=2 AFTER=auto scenario rn8d "0 1 0" "" "$(main_head)" "$READY_NOMETA" "" go --approve-normal
check "R-N8d files call dead, real code diff → ONE POST, no docs-only, marker=main HEAD" $([ "$(posts "$TMP/rn8d/trace.txt")" -eq 1 ] && hasnot "$TMP/rn8d/receipt.txt" "docs-only" && [ "$(marker rn8d)" = "$(main_head)" ]; echo $?) "$(grep -E 'nothing to deploy|hook fired|files unknown' "$TMP/rn8d/receipt.txt")"
FILES_FAIL=2 MERGE_EMPTY=1 AFTER=auto scenario rn8d2 "0 1 0" "" "$(main_head)" "$READY_NOMETA" "" go --approve-normal
check "R-N8d2 files dead ×3 AND empty diff → 'files unknown … assumed CODE', ONE POST, not read as a docs-only round" $(has "$TMP/rn8d2/receipt.txt" "files unknown for #2" && [ "$(posts "$TMP/rn8d2/trace.txt")" -eq 1 ] && hasnot "$TMP/rn8d2/receipt.txt" "migration/docs-only round"; echo $?) "$(grep -E 'nothing to deploy|hook fired|files unknown' "$TMP/rn8d2/receipt.txt")"
# R-N5c
SWEEP_FREEZE="$SOFT_LINE" AFTER=auto scenario rn5c "1 0 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-held 3
check "R-N5c soft lands between preflight and stage 3: #1 merged, approved HELD #3 held" $(has "$TMP/rn5c/trace.txt" "gh pr merge 1 " && hasnot "$TMP/rn5c/trace.txt" "gh pr merge 3 "; echo $?) "$(grep 'pr merge' "$TMP/rn5c/trace.txt")"
SWEEP_FREEZE="$HARD_LINE" AFTER=auto scenario rn5c2 "1 1 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal --approve-held 3
check "R-N5c2 hard lands between preflight and stage 3: merges=0 POST=0 APPLY=0" $([ "$(merges "$TMP/rn5c2/trace.txt")" -eq 0 ] && [ "$(posts "$TMP/rn5c2/trace.txt")" -eq 0 ] && hasnot "$TMP/rn5c2/trace.txt" APPLY_CALLED; echo $?) "$(grep -E 'pr merge|POST' "$TMP/rn5c2/trace.txt")"

echo "══ H1. concurrency: 8 simultaneous --freeze, then --freeze racing --unfreeze ══"
mkdir -p "$TMP/h1/home/.config/obsidian/.ship-wave"; H1F="$TMP/h1/home/.config/obsidian/.ship-wave/FROZEN"
for i in 1 2 3 4; do ( cli "$TMP/h1/home" --freeze "peer hold on #$i — concurrent" >/dev/null 2>&1 ) & ( cli "$TMP/h1/home" --freeze "stop everything now $i" >/dev/null 2>&1 ) & done; wait
check "H1a 8 concurrent --freeze → 8 lines, every line NF=5 with field3 ∈ soft|hard, class hard" $([ "$(grep -c . "$H1F")" -eq 8 ] && [ "$(awk -F'\t' 'NF==5 && ($3=="soft"||$3=="hard")' "$H1F" | wc -l | tr -d ' ')" -eq 8 ] && [ "$(awk -F'\t' '$3=="hard"' "$H1F" | wc -l | tr -d ' ')" -eq 4 ]; echo $?) "$(tr '\t' '|' < "$H1F")"
( export HOME="$TMP/h1/home"; cd "$ROOT"; set -- go; . "$TMP/wave.sh" >/dev/null 2>&1; [ "$(freeze_class_now)" = hard ] && echo "PASS  H1b class in force = hard" || echo "FAIL  H1b class=$(freeze_class_now)" ) | tee "$TMP/h1b.out"; PASS=$((PASS + $(grep -c '^PASS' "$TMP/h1b.out"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/h1b.out")))
mkdir -p "$TMP/h1c/home/.config/obsidian/.ship-wave"; H1CF="$TMP/h1c/home/.config/obsidian/.ship-wave/FROZEN"; printf '%b\n' "$HARD_LINE" > "$H1CF"
( cli "$TMP/h1c/home" --unfreeze >/dev/null 2>&1 ) & ( cli "$TMP/h1c/home" --freeze "peer hold on #5 — race" >/dev/null 2>&1 ) & wait
if [ -f "$H1CF" ]; then echo "INFO  H1c --unfreeze ∥ --freeze soft: file survives with $(grep -c . "$H1CF") line(s): $(tr '\t' '|' < "$H1CF" | tr '\n' ';') — every line intact: $( [ "$(awk -F'\t' 'NF==4' "$H1CF" | wc -l | tr -d ' ')" = "$(grep -c . "$H1CF")" ] && echo yes || echo NO)"; else echo "INFO  H1c --unfreeze ∥ --freeze soft: file gone (the unfreeze landed after the append — the soft hold typed on the phone is LOST silently)"; fi

echo "══ H2. CRLF in a hand-written FROZEN file ══"
printf '%s\tpeer hold on #1\tsoft\r\n' "$T0" > "$TMP/h2.f"
( export HOME="$TMP/h2"; mkdir -p "$HOME"; cd "$ROOT"; set -- go; . "$TMP/wave.sh" >/dev/null 2>&1; FREEZE="$TMP/h2.f"; c=$(freeze_class_now); echo "INFO  H2a 3-field soft line with CRLF → class=$c (CR glued to the class field; fail-safe direction)"
  printf '%s\tpeer hold on #1\tsoft\tpeer hold on pr\r\n' "$T0" > "$FREEZE"; c=$(freeze_class_now); echo "INFO  H2b 4-field soft line with CRLF (CR on the slug) → class=$c"
  printf '%s\tmigration 1: APPLY failed\thard\tslug\r\n' "$T0" > "$FREEZE"; c=$(freeze_class_now); [ "$c" = hard ] && echo "PASS  H2c 4-field hard line with CRLF → hard" || echo "FAIL  H2c → $c" ) | tee "$TMP/h2.out"; PASS=$((PASS + $(grep -c '^PASS' "$TMP/h2.out"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/h2.out")))
AFTER=auto scenario h2 "1 1 1" "$T0\tpeer hold on #1\tsoft\r" "$SHA_G" "$(ready_at "$(main_head)")" "3" go --approve-normal
echo "INFO  H2d run with that CRLF soft line: merges=$(merges "$TMP/h2/trace.txt") POSTs=$(posts "$TMP/h2/trace.txt") banner: $(grep -m1 'FROZEN (' "$TMP/h2/receipt.txt" | cut -c1-90)"

echo "══ H3. unicode + invalid UTF-8 byte inside the message, UTF-8 and C locales ══"
for loc in en_US.UTF-8 C; do
  d="$TMP/h3-$loc"; mkdir -p "$d/home/.config/obsidian/.ship-wave"; f="$d/home/.config/obsidian/.ship-wave/FROZEN"
  msg=$(printf 'peer hold on #3410 — தமிழ் ✓ bad byte \xff here')
  LANG=$loc LC_ALL=$loc cli "$d/home" --freeze "$msg" > "$d/out" 2>&1; rc=$?
  nf=$(awk -F'\t' '{print NF}' "$f" 2>/dev/null | head -1); f3=$(cut -f3 "$f" 2>/dev/null); f2len=$(cut -f2 "$f" 2>/dev/null | wc -c | tr -d ' ')
  check "H3 LANG=$loc --freeze with Tamil + U+2713 + 0xFF → rc0, one 5-field line, class soft, message kept (len>20)" $([ $rc -eq 0 ] && [ "$(grep -c . "$f")" -eq 1 ] && [ "$nf" = 5 ] && [ "$f3" = soft ] && [ "$f2len" -gt 20 ]; echo $?) "rc=$rc NF=$nf f3=$f3 f2len=$f2len out=$(head -c 300 "$d/out")"
done

echo "══ H4. empty / whitespace / directory / dev-null latch ══"
AFTER=auto scenario h4a "1 1 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "3" go --approve-normal --approve-held 3
: # (control, no FROZEN) then the real cases:
PRE=': > "$ST/FROZEN"' AFTER=auto scenario h4b "1 1 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "3" go --approve-normal
check "H4b 0-byte FROZEN → hard: merges=0 POST=0 (control h4a merged $(merges "$TMP/h4a/trace.txt"))" $([ "$(merges "$TMP/h4b/trace.txt")" -eq 0 ] && [ "$(posts "$TMP/h4b/trace.txt")" -eq 0 ]; echo $?) "$(grep -m1 'FROZEN (' "$TMP/h4b/receipt.txt")"
PRE='printf "   \n" > "$ST/FROZEN"' AFTER=auto scenario h4c "1 1 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "3" go --approve-normal
check "H4c whitespace-only FROZEN → hard: merges=0 POST=0" $([ "$(merges "$TMP/h4c/trace.txt")" -eq 0 ] && [ "$(posts "$TMP/h4c/trace.txt")" -eq 0 ]; echo $?) "$(grep -m1 'FROZEN (' "$TMP/h4c/receipt.txt")"
PRE='rm -f "$ST/FROZEN"; mkdir -p "$ST/FROZEN"' AFTER=auto scenario h4d "1 1 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "3" go --approve-normal
echo "INFO  H4d FROZEN is a DIRECTORY: merges=$(merges "$TMP/h4d/trace.txt") POSTs=$(posts "$TMP/h4d/trace.txt") frozen-banner: $(grep -c 'FROZEN (' "$TMP/h4d/receipt.txt") (v3 gap E5c: [ -f ] is false → the wave runs unfrozen)"
mkdir -p "$TMP/h4e/home/.config/obsidian/.ship-wave"; ln -s /dev/null "$TMP/h4e/home/.config/obsidian/.ship-wave/FROZEN"
cli "$TMP/h4e/home" --freeze "migration 1: APPLY failed — x" > "$TMP/h4e/out" 2>&1; rc=$?
echo "INFO  H4e FROZEN → symlink to /dev/null: --freeze rc=$rc said '$(head -c 80 "$TMP/h4e/out")'; latch readable lines: $(cat "$TMP/h4e/home/.config/obsidian/.ship-wave/FROZEN" 2>/dev/null | wc -l | tr -d ' ') (v3 gap E5d: hard stop silently lost, no receipt line says the write failed)"
cli "$TMP/h4b/home" --unfreeze > "$TMP/h4b/unf" 2>&1; echo "INFO  H4f --unfreeze on the 0-byte file: '$(cat "$TMP/h4b/unf")' file gone: $( [ -e "$TMP/h4b/home/.config/obsidian/.ship-wave/FROZEN" ] && echo no || echo yes)"

echo "══ H5. \$STATE with spaces ══"
SPH="$TMP/sp ace/ho me"; mkdir -p "$SPH/.config/obsidian/.ship-wave"
cli "$SPH" --freeze "production is broken — stop" > "$TMP/h5.cli" 2>&1; rc=$?
check "H5a --freeze with spaces in HOME: rc0, 1 line, hard" $([ $rc -eq 0 ] && [ "$(grep -c . "$SPH/.config/obsidian/.ship-wave/FROZEN")" -eq 1 ] && [ "$(cut -f3 "$SPH/.config/obsidian/.ship-wave/FROZEN")" = hard ]; echo $?) "rc=$rc $(cat "$TMP/h5.cli")"
mk_plan "$TMP/h5.plan" "1 1 1"
( export HOME="$SPH"; cd "$ROOT"; TRACE="$TMP/h5.trace"; : > "$TRACE"; export TRACE FIXPLAN="$TMP/h5.plan" DJSON="$(ready_at "$(main_head)")" DJSON_AFTER=auto POSTED="$TMP/h5.posted" WTDIR FILES_FAIL= MERGE_EMPTY= SWEEP_FREEZE= MERGE_FREEZE= MCOMMIT= MAINBLIP=
  set -- go --approve-normal; . "$TMP/wave.sh" >/dev/null 2>&1
  sweep() { cp "$FIXPLAN" "$1/plan.json"; return 0; }; unblock_lanes() { :; }; dispatch_clusters() { :; }; alive_helpers() { printf 0; }; rebase_remaining() { return 0; }
  apply_migrations() { echo "APPLY_CALLED" >> "$TRACE"; APPLY_RESULT=s; return 0; }; vtok() { printf tok; }; sleep() { :; }
  gh() { echo "gh $*" >> "$TRACE"; case "$*" in "auth token"|"auth status") return 0;; *"--json state,mergeStateStatus"*) echo "OPEN CLEAN false main";; *"--json statusCheckRollup"*) :;; *"pr list"*) echo 4;; esac; return 0; }
  curl() { echo "curl $*" >> "$TRACE"; case "$*" in *"-X POST"*) echo '{"job":{"id":"j"}}';; *v6/deployments*) echo "$DJSON";; esac; return 0; }
  ask_director() { :; }; _REDIR_DONE=1; run_once > "$TMP/h5.receipt" 2>&1; echo "rc=$?" >> "$TRACE" )
check "H5b go run under that hard freeze with spaces in \$STATE: merges=0 POST=0, banner present, hand-merged line present" $([ "$(merges "$TMP/h5.trace")" -eq 0 ] && [ "$(posts "$TMP/h5.trace")" -eq 0 ] && has "$TMP/h5.receipt" "FROZEN (hard)" && has "$TMP/h5.receipt" "merged by hand while stopped:"; echo $?) "$(grep -E 'FROZEN|by hand|rc=' "$TMP/h5.receipt" "$TMP/h5.trace" | head -5)"
cli "$SPH" --unfreeze > "$TMP/h5.unf" 2>&1; check "H5c --unfreeze with spaces: file gone" $([ ! -e "$SPH/.config/obsidian/.ship-wave/FROZEN" ]; echo $?) "$(cat "$TMP/h5.unf")"

echo "══ H6. the latch is a symlink ══"
mkdir -p "$TMP/h6/home/.config/obsidian/.ship-wave" "$TMP/h6/elsewhere"; printf '%b\n' "$HARD_LINE" > "$TMP/h6/elsewhere/real"; ln -s "$TMP/h6/elsewhere/real" "$TMP/h6/home/.config/obsidian/.ship-wave/FROZEN"
AFTER=auto scenario h6 "1 1 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "3" go --approve-normal
check "H6a FROZEN → symlink to a hard line elsewhere: read through, merges=0 POST=0" $([ "$(merges "$TMP/h6/trace.txt")" -eq 0 ] && [ "$(posts "$TMP/h6/trace.txt")" -eq 0 ]; echo $?) "$(grep -m1 'FROZEN (' "$TMP/h6/receipt.txt")"
cli "$TMP/h6/home" --unfreeze >/dev/null 2>&1
echo "INFO  H6b --unfreeze on the symlink: link gone: $( [ -L "$TMP/h6/home/.config/obsidian/.ship-wave/FROZEN" ] && echo no || echo yes); target still holds $(grep -c . "$TMP/h6/elsewhere/real") line(s) (harmless: the next freeze() creates a plain file)"
mkdir -p "$TMP/h6c/home/.config/obsidian/.ship-wave"; printf '%b\n' "$SOFT_LINE" > "$TMP/h6c/unreadable"; chmod 000 "$TMP/h6c/unreadable"; ln -s "$TMP/h6c/unreadable" "$TMP/h6c/home/.config/obsidian/.ship-wave/FROZEN"
( export HOME="$TMP/h6c/home"; cd "$ROOT"; set -- go; . "$TMP/wave.sh" >/dev/null 2>&1; c=$(freeze_class_now); [ "$c" = hard ] && echo "PASS  H6c unreadable (000) latch → hard (fail safe)" || echo "FAIL  H6c → $c" ) | tee "$TMP/h6c.out"; PASS=$((PASS + $(grep -c '^PASS' "$TMP/h6c.out"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/h6c.out"))); chmod 644 "$TMP/h6c/unreadable"

echo "══ H7. a 50-line FROZEN ══"
L50=""; for i in $(seq 1 50); do if [ $i -eq 25 ]; then L50="$L50$T0\tdeploy dpl_$i → ERROR; on main but NOT live: #$i\thard\tslug\n"; else L50="$L50$T0\tpeer hold on #$i\tsoft\tpeer hold on pr\n"; fi; done
AFTER=auto scenario h7 "1 1 1" "${L50%\\n}" "$SHA_G" "$(ready_at "$(main_head)")" "3" go --approve-normal
check "H7a 49 soft + 1 hard (line 25) → hard: merges=0 POST=0; banner names the ERROR line and says 50 lines" $([ "$(merges "$TMP/h7/trace.txt")" -eq 0 ] && [ "$(posts "$TMP/h7/trace.txt")" -eq 0 ] && grep -m1 'FROZEN (hard)' "$TMP/h7/receipt.txt" | grep -q 'dpl_25.*50 lines in FROZEN'; echo $?) "$(grep -m1 'FROZEN (' "$TMP/h7/receipt.txt" | cut -c1-200)"
L50s=""; for i in $(seq 1 50); do L50s="$L50s$T0\tpeer hold on #$i\tsoft\n"; done
AFTER=auto scenario h7b "1 1 1" "${L50s%\\n}" "$SHA_G" "$(ready_at "$(main_head)")" "3" go --approve-normal
check "H7b 50 soft lines → soft: #1 #2 merge, HELD #3 held, ONE POST" $(has "$TMP/h7b/trace.txt" "gh pr merge 1 " && has "$TMP/h7b/trace.txt" "gh pr merge 2 " && hasnot "$TMP/h7b/trace.txt" "gh pr merge 3 " && [ "$(posts "$TMP/h7b/trace.txt")" -eq 1 ]; echo $?) "merges=$(merges "$TMP/h7b/trace.txt") posts=$(posts "$TMP/h7b/trace.txt")"

echo "══ H8. the same value twice ══"
mkdir -p "$TMP/h8/home/.config/obsidian/.ship-wave"; cli "$TMP/h8/home" --freeze "peer hold on #3410 — wait" >/dev/null 2>&1; cli "$TMP/h8/home" --freeze "peer hold on #3410 — wait" >/dev/null 2>&1
check "H8a identical soft --freeze twice → 2 lines, still soft" $([ "$(grep -c . "$TMP/h8/home/.config/obsidian/.ship-wave/FROZEN")" -eq 2 ] && [ "$(HOME=$TMP/h8/home bash -c 'cd '"$ROOT"'; set -- go; . '"$TMP"'/wave.sh >/dev/null 2>&1; freeze_class_now')" = soft ]; echo $?) ""
AFTER=auto scenario h8b "0 0 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "3\n3\n3" go
check "H8b approve-held '3 3 3' (no freeze) → gh pr merge 3 exactly once" $([ "$(grep -c 'gh pr merge 3 ' "$TMP/h8b/trace.txt")" -eq 1 ]; echo $?) "$(grep 'pr merge' "$TMP/h8b/trace.txt")"

echo "══ H9. /bin/bash 3.2 drives the CLI ══"
mkdir -p "$TMP/h9/home/.config/obsidian/.ship-wave"
HOME="$TMP/h9/home" /bin/bash "$SW/ship-wave.sh" --freeze "peer hold on #1 — from bash3" > "$TMP/h9/out" 2>&1; rc=$?
check "H9a /bin/bash 3.2 --freeze soft → rc0, one 5-field soft line, no error text" $([ $rc -eq 0 ] && [ "$(awk -F'\t' '{print NF}' "$TMP/h9/home/.config/obsidian/.ship-wave/FROZEN")" = 5 ] && [ "$(cut -f3 "$TMP/h9/home/.config/obsidian/.ship-wave/FROZEN")" = soft ] && ! grep -qi 'error\|syntax\|bad substitution' "$TMP/h9/out"; echo $?) "rc=$rc $(cat "$TMP/h9/out")"
HOME="$TMP/h9/home" /bin/bash "$SW/ship-wave.sh" --unfreeze > "$TMP/h9/unf" 2>&1; rc=$?
check "H9b /bin/bash 3.2 --unfreeze → rc0, file gone" $([ $rc -eq 0 ] && [ ! -e "$TMP/h9/home/.config/obsidian/.ship-wave/FROZEN" ]; echo $?) "$(cat "$TMP/h9/unf")"

echo "══ H10. bare --freeze / --freeze '' (round-2 gap N9a/N9b) ══"
for args in "--freeze" "--freeze ''" "--freeze '   '"; do
  out=$( export HOME="$TMP/h10"; mkdir -p "$HOME"; cd "$ROOT"; eval "set -- $args"; . "$TMP/wave.sh" >/dev/null 2>&1; printf 'MODE=%s FREEZE_MSG=[%s] latch=%s' "$MODE" "${FREEZE_MSG:-}" "$( [ -f "$HOME/.config/obsidian/.ship-wave/FROZEN" ] && echo written || echo none)" )
  echo "INFO  H10 ship-wave.sh $args → $out"
done

echo "══ H11. E10 end-to-end with the REAL desk (slice A): the question B writes over a hard stop ══"
E10S="$TMP/e10/state"; mkdir -p "$E10S"; printf '%s\tmigration 20260906213000: APPLY failed — relation exists\thard\tmigration version apply failed relation exists\n' "$T0" > "$E10S/FROZEN"
( export STATE="$E10S" HOME="$TMP/e10"; cd "$ROOT"; set -- go; . "$TMP/wave.sh" >/dev/null 2>&1
  STATE="$E10S"; FREEZE="$E10S/FROZEN"; QUESTIONS_DIR="$E10S/questions"; QUESTIONS_LOG="$E10S/questions.log"; LEDGER="$E10S/ledger.jsonl"
  . "$DESK_SW/desk-questions.sh" >/dev/null 2>&1
  freeze "peer hold on #3410 — Director asked to wait" > "$TMP/e10/say.txt" 2>&1
  q=$(ls "$E10S"/questions/q-*.json 2>/dev/null | head -1); echo "$q" > "$TMP/e10/qpath"
  python3 - "$q" <<'PY'
import json,sys; q=json.load(open(sys.argv[1]))
print("INFO  H11 question title :", q["title"]); print("INFO  H11 question body  :", q["body"][:200]); print("INFO  H11 frozen_line     :", q.get("frozen_line"))
print("INFO  H11 options        :", " / ".join(o["label"]+"→"+",".join(w["op"] for w in o["writes"]) for o in q["options"]))
PY
) | tee "$TMP/e10.out"
Q=$(basename "$(cat "$TMP/e10/qpath")" .json)
echo "INFO  H11 receipt line: $(cut -c1-140 "$TMP/e10/say.txt" | head -1)"
LIFT=$(python3 -c 'import json,sys;q=json.load(open(sys.argv[1]));print([i for i,o in enumerate(q["options"]) if any(w["op"]=="unfreeze" for w in o["writes"])][0])' "$(cat "$TMP/e10/qpath")")
ANS=$(STATE="$E10S" HOME="$TMP/e10" SHIP_WAVE_DIR="$DESK_SW" bash "$DESK_SW/desk/v5-w12-desk.sh" answer "$Q" "$LIFT" 2>&1); rc=$?
if [ ! -e "$E10S/FROZEN" ]; then echo "FAIL  H11 BREAK: one tap on 'Lift the stop' of the soft-titled question (written while a HARD stop was in force) removed FROZEN — the unresolved APPLY-failed hard stop is gone. desk rc=$rc: $(printf '%s' "$ANS" | head -c 200)"; FAIL=$((FAIL+1)); else echo "PASS  H11 the tap did not lift the hard stop (rc=$rc: $(printf '%s' "$ANS" | head -c 200))"; PASS=$((PASS+1)); fi
( export HOME="$TMP/e10"; cd "$ROOT"; set -- go; . "$TMP/wave.sh" >/dev/null 2>&1; FREEZE="$E10S/FROZEN"; echo "INFO  H11 class in force after the tap: $( [ -f "$FREEZE" ] && freeze_class_now || echo 'NO LATCH — wave will merge and deploy next go')" )

echo "══ H12. a HARD line landing DURING pass 1 (phone --freeze while the wave merges) ══"
MERGE_FREEZE="$HARD_LINE" AFTER=auto scenario h12 "1 1 1" "" "$SHA_G" "$(ready_at "$(main_head)")" "3" go --approve-normal --approve-held 3
echo "INFO  H12 hard line appended right after #1 merged: merges=$(merges "$TMP/h12/trace.txt") ($(grep 'pr merge' "$TMP/h12/trace.txt" | awk '{print "#"$4}' | tr '\n' ' ')) POSTs=$(posts "$TMP/h12/trace.txt") APPLY=$(grep -c APPLY_CALLED "$TMP/h12/trace.txt") deploy-line: $(grep -E 'NOT deploying|hook fired' "$TMP/h12/receipt.txt" | head -1 | cut -c1-120)"
check "H12b …but nothing SHIPS under that hard line (no POST, no APPLY)" $([ "$(posts "$TMP/h12/trace.txt")" -eq 0 ] && [ "$(grep -c APPLY_CALLED "$TMP/h12/trace.txt")" -eq 0 ]; echo $?) "$(grep -E 'hook|APPLY' "$TMP/h12/trace.txt")"

echo "══ H13. garbage timestamp in a hand-written first line → hand-merged list ══"
echo "# h2" >> "$WTDIR/docs/h.md"; gitc add -A >/dev/null; gitc commit -q -m "docs: by hand again (#78)"; gitc push -q jicate HEAD:main 2>/dev/null
scenario h13 "0 0 0" "now\tpeer hold on #1\tsoft" "$(main_head)" "$(ready_at "$(main_head)")" "" go
echo "INFO  H13 first-line ts='now': $(grep 'merged by hand while stopped:' "$TMP/h13/receipt.txt") (hand merges #77 #78 exist on main since — git log --since=now yields nothing → misreport 'none')"
scenario h13b "0 0 0" "\tpeer hold on #1\tsoft" "$(main_head)" "$(ready_at "$(main_head)")" "" go
echo "INFO  H13b first-line ts EMPTY: $(grep 'merged by hand while stopped:' "$TMP/h13b/receipt.txt")"

echo "══ H14. E8b re-check: a row whose sha is 'unknown' ══"
PRE='mkdir -p "$ST/run-20260910-000001"; printf "78\t@merge\tunknown\n" > "$ST/run-20260910-000001/merged-map.tsv"' scenario h14 "0 0 0" "$SOFT_LINE" "$(main_head)" "$(ready_at "$(main_head)")" "" go
echo "INFO  H14 merged-map row '78 @merge unknown' for a commit the wave DID merge: $(grep 'merged by hand while stopped:' "$TMP/h14/receipt.txt") (v3 E8b: the wave's own merge listed as by hand when both sha sources blipped)"
MAINBLIP=1 FILES_FAIL=2 AFTER=auto scenario h14b "0 1 0" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
echo "INFO  H14b live double fault (mergeCommit empty + post-merge fetch blip + files dead): merged-map row = $(mmap h14b | tr '\t' '|' | head -1) · POSTs=$(posts "$TMP/h14b/trace.txt")"

echo "══ H15. --unfreeze receipt on a mixed file (E11) + literal class words as messages ══"
mkdir -p "$TMP/h15/home/.config/obsidian/.ship-wave"; printf '%b\n%b\n' "$HARD_LINE" "$SOFT_LINE" > "$TMP/h15/home/.config/obsidian/.ship-wave/FROZEN"
echo "INFO  H15a hard+soft file, --unfreeze says: '$(cli "$TMP/h15/home" --unfreeze 2>&1)' (class in force WAS hard)"
for m in hard soft "soft	hard" ; do d="$TMP/h15-$(printf '%s' "$m" | md5 | cut -c1-5)"; mkdir -p "$d/home/.config/obsidian/.ship-wave"; cli "$d/home" --freeze "$m" >/dev/null 2>&1; f="$d/home/.config/obsidian/.ship-wave/FROZEN"
  check "H15b --freeze '$(printf '%s' "$m" | tr '\t' '#')' → one 5-field line, class hard (unknown shape)" $([ "$(grep -c . "$f")" -eq 1 ] && [ "$(awk -F'\t' '{print NF}' "$f")" = 5 ] && [ "$(cut -f3 "$f")" = hard ]; echo $?) "$(tr '\t' '|' < "$f")"; done

echo "══ H16. hard freeze + FINAL_DEPLOY-style leftover batch + main ahead (belt and braces) ══"
PRE='printf "app/api/x/route.ts\n" > "$ST/deploy-pending"' AFTER=auto scenario h16 "0 0 0" "$HARD_LINE" "$SHA_G" "$(ready_at "$SHA_G")" "" go
check "H16 hard + leftover batch + main ahead: no POST, batch kept, marker untouched" $([ "$(posts "$TMP/h16/trace.txt")" -eq 0 ] && [ -s "$(stdir h16)/deploy-pending" ] && [ "$(marker h16)" = "$SHA_G" ]; echo $?) "$(grep -E 'NOT|hook|ahead' "$TMP/h16/receipt.txt" | head -3)"

echo "══ H17. round-2 gap N6: a migration-caused SOFT freeze (ref race) — merges continue, shipping does not ══"
APPLY_SOFT_FAIL=1 AFTER=auto scenario h17a "1 1 0" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
APPLY_SOFT_FAIL=1 PRE='cp '"$(stdir h17a)"'/FROZEN "$ST/FROZEN" 2>/dev/null || true' AFTER=auto scenario h17b "1 1 0" "" "$SHA_G" "$(ready_at "$(main_head)")" "" go --approve-normal
echo "INFO  H17 round 1: merges=$(merges "$TMP/h17a/trace.txt") POSTs=$(posts "$TMP/h17a/trace.txt") FROZEN lines=$(grep -c . "$(stdir h17a)/FROZEN" 2>/dev/null) class=$(cut -f3 "$(stdir h17a)/FROZEN" | head -1) · round 2 (same stuck version): merges=$(merges "$TMP/h17b/trace.txt") POSTs=$(posts "$TMP/h17b/trace.txt") FROZEN lines=$(grep -c . "$(stdir h17b)/FROZEN" 2>/dev/null) · deploy line: $(grep -E 'NOT deploying' "$TMP/h17b/receipt.txt" | head -1) (§C inversion: NEW merges yes, shipping no; main accumulates undeployed code)"

echo "══ syntax ══"
for f in "$SW/ship-wave.sh" "$0"; do /bin/bash -n "$f" && ok "bash3.2 -n $(basename "$f")" || bad "bash -n $(basename "$f")"; done
echo; echo "=== $PASS passed · $FAIL failed · fixtures in $TMP ==="
[ "$FAIL" -eq 0 ]

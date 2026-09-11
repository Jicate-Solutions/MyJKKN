#!/opt/homebrew/bin/bash
# tests/verify-freeze-classes-adversarial-v7.sh — seventh adversarial pass on slice B's freeze classes (round 7 fix
# 1ce586c988: N5a read-back, N12 empty --freeze, N1b/N7b malformed-but-hard honesty) against slice A's REAL desk.
# Shape (as v6): B's ship-wave.sh truncated before `if [ -n "$GOAL" ]` + B's siblings + A's desk-questions.sh symlinked
# into one dir. The WAVE side runs the launchd way — `env -i PATH HOME /opt/homebrew/bin/bash ship-wave.sh --freeze …`
# (C locale, nothing inherited) — and every tap goes through A's real desk/v5-w12-desk.sh under the same env -i.
# Fresh temp HOME per case ($STATE is HOME-derived); the live ~/.config/obsidian/.ship-wave is never touched.
# PART 1 re-attempts N5a, N12, N1b/N7b with the round-6 inputs. PART 2 hunts new breaks. PART 3: class downgrade without
# --unfreeze (empty FROZEN, glued append). Labels: PROPERTY = the stated property · HONESTY / LIVENESS / CONTRIVED = informational.
# Helpers source the truncated copy in PLAN mode (MODE=go is set only to ask the deploy predicate). PASS/FAIL per case, rc≠0 on any FAIL.
# Run from the worktree root:  bash scripts/ship-wave/tests/verify-freeze-classes-adversarial-v7.sh   (DESK_SW=<dir> to override)
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"

ROOT=$(cd "$(dirname "$0")/../../.." && pwd); SW="$ROOT/scripts/ship-wave"
DESK_SW="${DESK_SW:-/Users/omm/PROJECTS/MyJKKN/.worktrees/hitl-desk/scripts/ship-wave}"
[ -f "$SW/desk-questions.sh" ] && DESK_SW="$SW"
[ -f "$DESK_SW/desk-questions.sh" ] || { echo "no desk at $DESK_SW"; exit 2; }
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-freeze-v7.XXXXXX")
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf 'FAIL  %s\n      %s\n' "$1" "${2:-}"; }
check() { if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1" "$3"; fi; }
info() { printf 'INFO  %s\n' "$*"; }
_contains() { case "$1" in *"$2"*) return 0;; *) return 1;; esac; }

echo "INFO  B ship-wave.sh @ $(git -C "$ROOT" rev-parse --short HEAD) · desk @ $(git -C "$(dirname "$DESK_SW")" rev-parse --short HEAD 2>/dev/null || echo '?') ($DESK_SW)"
awk '/^if \[ -n "\$GOAL" \]; then$/ {exit} {print}' "$SW/ship-wave.sh" > "$TMP/ship-wave.sh"
[ "$(grep -c 'freeze "\$FREEZE_MSG"; exit 0' "$TMP/ship-wave.sh")" -eq 1 ] || { echo "truncated script lost the --freeze gate"; exit 2; }
for f in "$SW"/*.sh "$SW"/*.py; do [ "$(basename "$f")" = ship-wave.sh ] || ln -s "$f" "$TMP/$(basename "$f")"; done
[ -e "$TMP/desk-questions.sh" ] || ln -s "$DESK_SW/desk-questions.sh" "$TMP/desk-questions.sh"
DESK="$DESK_SW/desk/v5-w12-desk.sh"
PLAIN_PATH="/opt/homebrew/bin:/usr/bin:/bin"
LIVE_FROZEN_BEFORE=$( [ -e "$HOME/.config/obsidian/.ship-wave/FROZEN" ] && echo present || echo absent )

newcase() { C="$TMP/$1"; HM="$C/home"; ST="$HM/.config/obsidian/.ship-wave"; mkdir -p "$ST"; : > "$C/say.txt"; }
# the launchd shape: nothing inherited, /opt/homebrew/bin/bash, the script RUN (not sourced)
wave() { env -i PATH="$PLAIN_PATH" HOME="$HM" /opt/homebrew/bin/bash "$TMP/ship-wave.sh" "$@" >> "$C/say.txt" 2>&1; CLI_RC=$?; }
# same, bounded — for shapes that could hang (a FIFO without a reader)
wave_bounded() { /opt/homebrew/bin/timeout 15 env -i PATH="$PLAIN_PATH" HOME="$HM" /opt/homebrew/bin/bash "$TMP/ship-wave.sh" "$@" >> "$C/say.txt" 2>&1; CLI_RC=$?; }
# the run-internal shape: functions sourced under a temp HOME (no run happens — the script is truncated before the goal block)
wave_fn() { ( a=("$@"); export HOME="$HM"; cd "$ROOT"; set -- plan; . "$TMP/ship-wave.sh" >/dev/null 2>&1; "${a[@]}" ); }
cls_now() { wave_fn freeze_class_now 2>/dev/null; echo; }
# what a run's start sees (ship-wave.sh: `if [ -f "$FREEZE" ]; then frozen=1; freeze_class=$(freeze_class_now) …`)
run_view() { ( export HOME="$HM"; cd "$ROOT"; set -- plan; . "$TMP/ship-wave.sh" >/dev/null 2>&1; if [ -f "$FREEZE" ]; then echo "frozen=1 class=$(freeze_class_now)"; else echo "frozen=0 class=none"; fi ); }
deploy_gate() { ( export HOME="$HM"; cd "$ROOT"; set -- plan; . "$TMP/ship-wave.sh" >/dev/null 2>&1; MODE=go; if deploy_allowed; then echo "ALLOWED"; else echo "REFUSED: $DEPLOY_BLOCK"; fi ); }
qcount() { ls "$ST/questions" 2>/dev/null | grep -c 'q-.*\.json'; }
qlist() { python3 - "$ST/questions" <<'PY'
import json,glob,os,sys
for f in sorted(glob.glob(os.path.join(sys.argv[1],"q-*.json")), key=lambda p: json.load(open(p))["asked_at"]):
    q=json.load(open(f)); print(q["id"]+"\t"+q["title"]+"\t"+str(q.get("frozen_line")))
PY
}
qid_by_title() { qlist 2>/dev/null | awk -F'\t' -v pat="$1" '$2 ~ pat {print $1}' | tail -1; }
qid_hard() { qid_by_title 'stopped: production'; }
qid_behind() { qid_by_title 'HARD stop is already in force'; }
qfield() { python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get(sys.argv[2]))' "$ST/questions/$1.json" "$2"; }
q_ops() { python3 -c 'import json,sys;q=json.load(open(sys.argv[1]));print(" ".join(sorted({w["op"] for o in q["options"] for w in o["writes"]})))' "$ST/questions/$1.json"; }
q_nopts() { python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))["options"]))' "$ST/questions/$1.json"; }
lift_idx() { python3 -c 'import json,sys;q=json.load(open(sys.argv[1]));print([i for i,o in enumerate(q["options"]) if any(w["op"]=="unfreeze" for w in o["writes"])][0])' "$ST/questions/$1.json"; }
tap() { local id="$1" idx="$2"; ANS=$(env -i PATH="$PLAIN_PATH" HOME="$HM" STATE="$ST" SHIP_WAVE_DIR="$TMP" /opt/homebrew/bin/bash "$DESK" answer "$id" "$idx" 2>&1); RC=$?; }
desk_pending() { env -i PATH="$PLAIN_PATH" HOME="$HM" STATE="$ST" SHIP_WAVE_DIR="$TMP" /opt/homebrew/bin/bash "$DESK" pending 2>&1; }
hard_lines() { [ -f "$ST/FROZEN" ] && awk -F'\t' 'NF>=3 && NF<=5 && $3=="hard"' "$ST/FROZEN" | wc -l | tr -d ' ' || echo 0; }
soft_lines() { [ -f "$ST/FROZEN" ] && awk -F'\t' 'NF>=3 && NF<=5 && $3=="soft"' "$ST/FROZEN" | wc -l | tr -d ' ' || echo 0; }
nlines() { [ -f "$ST/FROZEN" ] && grep -c '' "$ST/FROZEN" || echo 0; }
valid_utf8() { python3 -c 'import sys;open(sys.argv[1],"rb").read().decode("utf-8")' "$1" 2>/dev/null; }
lock_left() { [ -e "$HM/.config/obsidian/.ship-wave.lock" ] && echo yes || echo no; }
HARD_MSG="migration 20260906213000: APPLY failed — relation exists"
SOFT_MSG="peer hold on #3410 — Director asked to wait"
MAL='a malformed stop line reads as hard (line '

echo "════ PART 1 · RE-ATTEMPTS with the round-6 inputs, launchd shape, real desk ════"
echo "══ R-N5a. FROZEN = symlink → /dev/null, then --freeze <hard> ══"
newcase r-n5a; ln -s /dev/null "$ST/FROZEN"
wave --freeze "$HARD_MSG"
info "R-N5a rc=$CLI_RC · $(tr '\n' '|' < "$C/say.txt" | cut -c1-160)"
check "R-N5a-1 rc≠0 and EXACTLY one '⛔ could not record the stop (FROZEN is not a regular file)' line, no other output" $([ "$CLI_RC" -ne 0 ] && [ "$(grep -c 'could not record the stop (FROZEN is not a regular file)' "$C/say.txt")" -eq 1 ] && [ "$(grep -c '' "$C/say.txt")" -eq 1 ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
check "R-N5a-2 no '⛔ FROZEN (hard)' claim, 0 questions, no question dir entry, no lock left" $(! grep -q 'FROZEN (hard)' "$C/say.txt" && [ "$(qcount)" -eq 0 ] && [ "$(lock_left)" = no ]; echo $?) "q=$(qcount) lock=$(lock_left)"
check "R-N5a-3 /dev/null received nothing that reads back; FROZEN is still the symlink; the class reader is fail-safe hard" $([ -L "$ST/FROZEN" ] && [ "$(cls_now)" = hard ]; echo $?) "$(ls -l "$ST/FROZEN")"
info "R-N5a run view afterwards: $(run_view) · deploy: $(deploy_gate)   (accepted shape: the stop lives in this run's exit code only — same as X1h)"

echo "══ R-N12. --freeze with an empty / missing / blank message, incl. 'go --freeze \"\"' ══"
for spelling in empty missing blank go-empty; do
  newcase "r-n12-$spelling"
  case "$spelling" in
    empty)    wave --freeze "";;
    missing)  wave --freeze;;
    blank)    wave --freeze "   ";;
    go-empty) wave go --freeze "";;
  esac
  check "R-N12 ($spelling) rc=2, exactly one line '--freeze needs a message', no FROZEN, no lock, 0 questions, no receipt written" $([ "$CLI_RC" -eq 2 ] && [ "$(grep -c -- '--freeze needs a message' "$C/say.txt")" -eq 1 ] && [ "$(grep -c '' "$C/say.txt")" -eq 1 ] && [ ! -e "$ST/FROZEN" ] && [ "$(lock_left)" = no ] && [ "$(qcount)" -eq 0 ] && [ ! -e "$HM/.config/obsidian/v5-myjkkn-ship-last.txt" ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt") lock=$(lock_left)"
done

echo "══ R-N1b. CRLF FROZEN (hard line) + soft --freeze → receipt and behind-question quote the malformed hard line, never the soft hold ══"
newcase r-n1b
( export HOME="$HM"; cd "$ROOT"; set -- plan; . "$TMP/ship-wave.sh" >/dev/null 2>&1; freeze "$HARD_MSG" >/dev/null 2>&1 ); sed -i '' 's/$/\r/' "$ST/FROZEN"; L1V=$(sed -n 1p "$ST/FROZEN" | cat -v)
wave --freeze "$SOFT_MSG"; QB=$(qid_behind)
info "R-N1b rc=$CLI_RC · receipt: $(grep 'soft line added' "$C/say.txt" | cut -c1-200)"
check "R-N1b-1 rc=0, class hard, ONE behind-question (noop-only), deploy REFUSED quoting '${MAL}1)'" $([ "$CLI_RC" -eq 0 ] && [ "$(cls_now)" = hard ] && [ -n "$QB" ] && [ "$(qcount)" -eq 2 ] && [ "$(q_ops "$QB")" = noop ] && _contains "$(deploy_gate)" "REFUSED: hard freeze" && _contains "$(deploy_gate)" "${MAL}1)"; echo $?) "$(cls_now) q=$(qcount) $(deploy_gate)"
check "R-N1b-2 body: 'HARD stop is in force: ${MAL}1): …APPLY failed…' and NOT '…in force: $SOFT_MSG'" $(_contains "$(qfield "$QB" body)" "HARD stop is in force: ${MAL}1): " && _contains "$(qfield "$QB" body)" "APPLY failed" && ! _contains "$(qfield "$QB" body)" "HARD stop is in force: $SOFT_MSG"; echo $?) "$(qfield "$QB" body | cut -c1-220)"
check "R-N1b-3 receipt: exactly one 'unresolved: ${MAL}1)' and no 'unresolved: $SOFT_MSG'" $([ "$(grep -c "unresolved: ${MAL}1)" "$C/say.txt")" -eq 1 ] && ! grep -q "unresolved: $SOFT_MSG" "$C/say.txt"; echo $?) "$(cat "$C/say.txt" | cut -c1-240)"
check "R-N1b-4 line 1 byte-identical (still ^M), 2 lines, question valid UTF-8 and listed by the real desk" $([ "$(sed -n 1p "$ST/FROZEN" | cat -v)" = "$L1V" ] && [ "$(nlines)" -eq 2 ] && valid_utf8 "$ST/questions/$QB.json" && [ "$(desk_pending | grep -c "$QB")" -ge 1 ]; echo $?) "$(cat -v "$ST/FROZEN")"
n=$(q_nopts "$QB"); i=0; before=$(cat "$ST/FROZEN")
while [ "$i" -lt "$n" ]; do
  tap "$QB" "$i"; check "R-N1b-5.$i tap option $i via the real desk: rc=0, FROZEN byte-identical, class hard" $([ "$RC" -eq 0 ] && [ "$(cat "$ST/FROZEN")" = "$before" ] && [ "$(cls_now)" = hard ]; echo $?) "rc=$RC $ANS"
  [ "$((i+1))" -lt "$n" ] && wave --freeze "$SOFT_MSG" && QB=$(qid_behind) && before=$(cat "$ST/FROZEN"); i=$((i+1))
done

echo "══ R-N7b. hand-written hard line with a TAB in its message + soft --freeze ══"
newcase r-n7b
printf '%s\tmigration 1: APPLY failed\trelation exists\thard\tmigration\n' "$(date '+%F %T')" > "$ST/FROZEN"; L1=$(sed -n 1p "$ST/FROZEN")
wave --freeze "$SOFT_MSG"; QB=$(qid_behind)
check "R-N7b-1 rc=0, class hard, behind-question noop-only, deploy REFUSED naming the malformed line" $([ "$CLI_RC" -eq 0 ] && [ "$(cls_now)" = hard ] && [ -n "$QB" ] && [ "$(q_ops "$QB")" = noop ] && _contains "$(deploy_gate)" "REFUSED: hard freeze" && _contains "$(deploy_gate)" "${MAL}1)"; echo $?) "$(cls_now) $QB $(deploy_gate)"
check "R-N7b-2 body quotes the flattened shifted line, not the soft hold" $(_contains "$(qfield "$QB" body)" "HARD stop is in force: ${MAL}1): " && _contains "$(qfield "$QB" body)" "migration 1: APPLY failed relation exists hard migration" && ! _contains "$(qfield "$QB" body)" "HARD stop is in force: $SOFT_MSG"; echo $?) "$(qfield "$QB" body | cut -c1-220)"
check "R-N7b-3 receipt quotes it too (once), the line is untouched, 2 lines" $([ "$(grep -c "unresolved: ${MAL}1): .*migration 1: APPLY failed relation exists" "$C/say.txt")" -eq 1 ] && [ "$(sed -n 1p "$ST/FROZEN")" = "$L1" ] && [ "$(nlines)" -eq 2 ]; echo $?) "$(cat -v "$ST/FROZEN")"
tap "$QB" 1; check "R-N7b-4 the 'Noted' tap via the real desk: rc=0, FROZEN 2 lines, class hard" $([ "$RC" -eq 0 ] && [ "$(nlines)" -eq 2 ] && [ "$(cls_now)" = hard ]; echo $?) "rc=$RC $ANS"

echo "════ PART 2 · NEW HUNTS ════"
echo "══ H1. FROZEN is a DIRECTORY (launchd shape) ══"
newcase h1; mkdir "$ST/FROZEN"; : > "$ST/FROZEN/keep"
wave --freeze "$HARD_MSG"
check "H1a rc=5, one 'not a regular file' line, 0 questions, no lock, the directory untouched" $([ "$CLI_RC" -eq 5 ] && [ "$(grep -c 'not a regular file' "$C/say.txt")" -eq 1 ] && [ "$(qcount)" -eq 0 ] && [ "$(lock_left)" = no ] && [ -d "$ST/FROZEN" ] && [ -f "$ST/FROZEN/keep" ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
info "H1 run view: $(run_view) · deploy: $(deploy_gate)   (-f gates the run's frozen flag; accepted shape)"

echo "══ H2. FROZEN is a FIFO with NO reader — must refuse without blocking ══"
newcase h2; mkfifo "$ST/FROZEN"
wave_bounded --freeze "$HARD_MSG"
check "H2a returned within 15 s (rc=5, not 124), one 'not a regular file' line, 0 questions" $([ "$CLI_RC" -eq 5 ] && [ "$(grep -c 'not a regular file' "$C/say.txt")" -eq 1 ] && [ "$(qcount)" -eq 0 ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
# the run-internal shape too (freeze() sourced): no hang, shell ends non-zero, lock released by the trap
out=$( /opt/homebrew/bin/timeout 15 env -i PATH="$PLAIN_PATH" HOME="$HM" /opt/homebrew/bin/bash -c 'R=$1 S=$2 M=$3; cd "$R"; set -- plan; . "$S" >/dev/null 2>&1; freeze "$M"; echo CONTINUED' _ "$ROOT" "$TMP/ship-wave.sh" "$HARD_MSG" 2>&1 ); rc=$?
check "H2b freeze() inside a sourced run with a reader-less FIFO: no hang, rc=5, nothing after freeze() ran, lock released" $([ "$rc" -eq 5 ] && ! _contains "$out" CONTINUED && _contains "$out" "not a regular file" && [ "$(lock_left)" = no ]; echo $?) "rc=$rc lock=$(lock_left) out=$out"

echo "══ H3. FROZEN is a DANGLING symlink ══"
newcase h3a; mkdir -p "$C/else"; ln -s "$C/else/F" "$ST/FROZEN"     # target absent, its directory exists
wave --freeze "$HARD_MSG"
check "H3a dangling link into an existing dir: the append creates the target, the line reads back, rc=0, 1 hard line, 1 question, run view frozen=1 hard, deploy REFUSED" $([ "$CLI_RC" -eq 0 ] && [ -f "$C/else/F" ] && [ "$(hard_lines)" -eq 1 ] && [ "$(qcount)" -eq 1 ] && [ "$(run_view)" = "frozen=1 class=hard" ] && _contains "$(deploy_gate)" "REFUSED: hard freeze"; echo $?) "rc=$CLI_RC $(cat "$C/say.txt") $(run_view)"
QH=$(qid_hard); tap "$QH" "$(lift_idx "$QH")"
check "H3a-2 the hard question's Lift via the real desk: rc=0, FROZEN gone (the link replaced/removed), run view frozen=0" $([ "$RC" -eq 0 ] && [ ! -e "$ST/FROZEN" ] && [ "$(run_view)" = "frozen=0 class=none" ]; echo $?) "rc=$RC $ANS $(ls -l "$ST/FROZEN" 2>&1)"
newcase h3b; ln -s "$C/missing-dir/F" "$ST/FROZEN"                  # target's directory absent
wave --freeze "$HARD_MSG"
check "H3b dangling link into a MISSING dir: rc=5, '⛔ could not write FROZEN (…No such file…)', 0 questions, no lock" $([ "$CLI_RC" -eq 5 ] && grep -q 'could not write FROZEN (.*No such file' "$C/say.txt" && [ "$(qcount)" -eq 0 ] && [ "$(lock_left)" = no ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"

echo "══ H4. '--freeze' as the LAST argv, after a mode word; '--freeze=\"\"'; '--freeze=x' ══"
newcase h4a; wave plan --freeze
check "H4a 'plan --freeze' (last argv): rc=2, '--freeze needs a message', no FROZEN, no lock, no receipt" $([ "$CLI_RC" -eq 2 ] && [ "$(grep -c -- '--freeze needs a message' "$C/say.txt")" -eq 1 ] && [ ! -e "$ST/FROZEN" ] && [ "$(lock_left)" = no ] && [ ! -e "$HM/.config/obsidian/v5-myjkkn-ship-last.txt" ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
newcase h4b; wave --freeze=""
check "H4b '--freeze=\"\"': refused as an unknown arg (rc=2, 'unknown arg: --freeze='), no run, no FROZEN, no lock" $([ "$CLI_RC" -eq 2 ] && [ "$(grep -c 'unknown arg: --freeze=' "$C/say.txt")" -eq 1 ] && [ ! -e "$ST/FROZEN" ] && [ "$(lock_left)" = no ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
newcase h4c; wave go --freeze=peer-hold
check "H4c 'go --freeze=peer-hold': rc=2 unknown arg — no live run started (no lock, no receipt), no FROZEN" $([ "$CLI_RC" -eq 2 ] && grep -q 'unknown arg: --freeze=peer-hold' "$C/say.txt" && [ ! -e "$ST/FROZEN" ] && [ "$(lock_left)" = no ] && [ ! -e "$HM/.config/obsidian/v5-myjkkn-ship-last.txt" ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
newcase h4d; wave --freeze --goal
check "H4d '--freeze --goal' (a flag eaten as the message): recorded as a HARD stop named '--goal' (fail-safe direction), rc=0, 1 hard line, 1 question, no lock" $([ "$CLI_RC" -eq 0 ] && [ "$(hard_lines)" -eq 1 ] && [ "$(cut -f2 "$ST/FROZEN")" = "--goal" ] && [ "$(qcount)" -eq 1 ] && [ "$(lock_left)" = no ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt") $(cat "$ST/FROZEN" 2>/dev/null)"

echo "══ H5. a hard line whose message is ONLY whitespace / EMPTY (hand-written, otherwise well-formed) ══"
newcase h5a; printf '%s\t   \thard\tmigration\n' "$(date '+%F %T')" > "$ST/FROZEN"
wave --freeze "$SOFT_MSG"; QB=$(qid_behind)
check "H5a class hard, behind-question noop-only, deploy REFUSED, soft hold NOT named as the hard stop, question valid UTF-8" $([ "$CLI_RC" -eq 0 ] && [ "$(cls_now)" = hard ] && [ -n "$QB" ] && [ "$(q_ops "$QB")" = noop ] && _contains "$(deploy_gate)" "REFUSED: hard freeze" && ! _contains "$(qfield "$QB" body)" "HARD stop is in force: $SOFT_MSG" && valid_utf8 "$ST/questions/$QB.json"; echo $?) "$(cls_now) $QB body=$(qfield "$QB" body | cut -c1-120)"
info "H5a body: $(qfield "$QB" body | cut -c1-140)"
newcase h5b; printf '%s\t\thard\tmigration\n' "$(date '+%F %T')" > "$ST/FROZEN"
wave --freeze "$SOFT_MSG"; QB=$(qid_behind)
check "H5b EMPTY message field: class hard, behind-question noop-only, deploy REFUSED, soft hold not named as the hard stop" $([ "$CLI_RC" -eq 0 ] && [ "$(cls_now)" = hard ] && [ -n "$QB" ] && [ "$(q_ops "$QB")" = noop ] && _contains "$(deploy_gate)" "REFUSED: hard freeze" && ! _contains "$(qfield "$QB" body)" "HARD stop is in force: $SOFT_MSG"; echo $?) "$(cls_now) $QB body=$(qfield "$QB" body | cut -c1-120)"
tap "$QB" 0; check "H5b-2 Keep tap via the real desk: FROZEN still 2 lines, class hard" $([ "$RC" -eq 0 ] && [ "$(nlines)" -eq 2 ] && [ "$(cls_now)" = hard ]; echo $?) "rc=$RC $ANS"

echo "══ H6. CRLF + TAB combined in one hard line; whole-file CRLF over hard+soft, then a third (LF) soft ══"
newcase h6a; printf '%s\tmigration 1: APPLY failed\trelation exists\thard\tmigration\r\n' "$(date '+%F %T')" > "$ST/FROZEN"; L1V=$(cat -v "$ST/FROZEN")
wave --freeze "$SOFT_MSG"; QB=$(qid_behind)
check "H6a class hard, deploy REFUSED naming line 1, body quotes it flattened (no TAB/CR in the body), line 1 untouched" $([ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "${MAL}1)" && _contains "$(qfield "$QB" body)" "${MAL}1): " && _contains "$(qfield "$QB" body)" "migration 1: APPLY failed relation exists hard migration" && ! _contains "$(qfield "$QB" body)" "$(printf '\r')" && [ "$(sed -n 1p "$ST/FROZEN" | cat -v)" = "$(printf '%s' "$L1V")" ]; echo $?) "$(qfield "$QB" body | cut -c1-200)"
newcase h6b
( export HOME="$HM"; cd "$ROOT"; set -- plan; . "$TMP/ship-wave.sh" >/dev/null 2>&1; freeze "$HARD_MSG" >/dev/null 2>&1; freeze "$SOFT_MSG" >/dev/null 2>&1 ); sed -i '' 's/$/\r/' "$ST/FROZEN"   # a Windows editor re-saved the whole file
wave --freeze "peer hold on #3411 — second hold"; QB=$(qid_behind)
info "H6b (both earlier lines CRLF) reason: $(wave_fn freeze_reason_now | cut -c1-160)"
check "H6b class hard, deploy REFUSED, the quoted line is a MALFORMED one (line 2 = the last malformed), the new LF soft hold is NOT named as the hard stop" $([ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "${MAL}2)" && ! _contains "$(qfield "$QB" body)" "HARD stop is in force: peer hold on #3411" && [ "$(nlines)" -eq 3 ]; echo $?) "$(qfield "$QB" body | cut -c1-200)"
info "H6b note: with EVERY earlier line malformed, freeze_reason_now quotes the LAST malformed line — here the CRLF soft line (line 2), not the CRLF hard line (line 1). Honest wording ('a malformed stop line reads as hard'), but the hard text is not the one shown."

echo "══ H7. C locale via env -i: multibyte chars straddling the byte slices (160 in the behind body; 120 in freeze_reason_now's cut) ══"
newcase h7
P=$(printf 'x%.0s' $(seq 1 118)); HM7="migration 20260906213000: APPLY failed ${P}—→× tail"   # '—' begins at byte ~158-160 of the reason, past 120 for the cut
( export HOME="$HM"; cd "$ROOT"; set -- plan; . "$TMP/ship-wave.sh" >/dev/null 2>&1; freeze "$HM7" >/dev/null 2>&1 )
wave --freeze "$SOFT_MSG"; QB=$(qid_behind)
check "H7a under env -i /opt/homebrew/bin/bash: receipt valid UTF-8, behind-question written and valid UTF-8, listed by the real desk" $([ "$CLI_RC" -eq 0 ] && valid_utf8 "$C/say.txt" && [ -n "$QB" ] && valid_utf8 "$ST/questions/$QB.json" && [ "$(desk_pending | grep -c "$QB")" -ge 1 ]; echo $?) "rc=$CLI_RC q=$QB $(cat "$C/say.txt" | cut -c1-200)"
newcase h7b; printf '%s\t%s\r\n' "$(date '+%F %T')" "migration 1: APPLY failed ${P}—→× tail	hard	migration" > "$ST/FROZEN"   # malformed (CR) AND multibyte across the 120 cut
wave --freeze "$SOFT_MSG"; QB=$(qid_behind)
check "H7b malformed line with '—' across the 120-byte cut: receipt + question valid UTF-8 (iconv -c guard), class hard, deploy REFUSED" $([ "$CLI_RC" -eq 0 ] && valid_utf8 "$C/say.txt" && [ -n "$QB" ] && valid_utf8 "$ST/questions/$QB.json" && [ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "REFUSED"; echo $?) "rc=$CLI_RC $(cat "$C/say.txt" | cut -c1-200)"
# /bin/bash 3.2 under env -i: the known N6c gap — byte slicing at 160 can cut '—'; record what happens, informational
newcase h7c; ( export HOME="$HM"; cd "$ROOT"; set -- plan; . "$TMP/ship-wave.sh" >/dev/null 2>&1; freeze "$HM7" >/dev/null 2>&1 )
env -i PATH="/usr/bin:/bin" HOME="$HM" /bin/bash "$TMP/ship-wave.sh" --freeze "$SOFT_MSG" >> "$C/say.txt" 2>&1; rc32=$?
info "H7c /bin/bash 3.2 env -i: rc=$rc32 questions=$(qcount) receipt-utf8=$(valid_utf8 "$C/say.txt" && echo ok || echo INVALID) $( [ -n "$(qid_behind)" ] && { valid_utf8 "$ST/questions/$(qid_behind).json" && echo q-utf8=ok || echo q-utf8=INVALID; } || echo 'no behind-question' )  (N6c: shebang is #!/bin/bash; launchd wrapper execs bash 5.3 — informational)"

echo "══ H8. FROZEN hand-edited WITHOUT a trailing newline: the append glues onto the last line ══"
newcase h8; printf '%s\t%s\thard\tmigration' "$(date '+%F %T')" "$HARD_MSG" > "$ST/FROZEN"   # no \n at EOF
wave --freeze "$SOFT_MSG"
info "H8 rc=$CLI_RC · $(tr '\n' '|' < "$C/say.txt" | cut -c1-200) · lines=$(nlines) class=$(cls_now) fields=$(awk -F'\t' '{print NF}' "$ST/FROZEN" | tr '\n' ,)"
check "H8a SAFETY: the class reads hard and the deploy gate refuses (the glued line is malformed → fail-safe)" $([ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "REFUSED: hard freeze"; echo $?) "$(cls_now) $(deploy_gate)"
check "H8b HONESTY (expected to FAIL on 1ce586c9): the soft hold's line was glued onto the hard line — freeze() should record it on its own line (rc=0, 2 lines) or refuse with a TRUE reason, not '…is not a regular file'" $([ "$CLI_RC" -eq 0 ] && [ "$(nlines)" -eq 2 ] && [ "$(soft_lines)" -eq 1 ]; echo $?) "rc=$CLI_RC lines=$(nlines) soft=$(soft_lines) receipt='$(cat "$C/say.txt" | cut -c1-140)'"

echo "══ H9. a message carrying an INVALID UTF-8 byte: read-back and message fidelity under C vs UTF-8 locale ══"
newcase h9a; BADMSG="$(printf 'deploy dpl_1 \xe2\x80 ERROR bad-byte\xff tail')"
wave --freeze "$BADMSG"
check "H9a launchd C locale: recorded whole (the tail after the bad byte kept), rc=0, 1 hard line, class hard, deploy REFUSED" $([ "$CLI_RC" -eq 0 ] && [ "$(hard_lines)" -eq 1 ] && grep -q 'tail' "$ST/FROZEN" && [ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "REFUSED: hard freeze"; echo $?) "rc=$CLI_RC $(cat -v "$ST/FROZEN")"
check "H9a-2 the missing question is LOUD, not silent: the receipt says 'ask_director refused'" $(grep -q 'ask_director refused' "$C/say.txt"; echo $?) "$(cat "$C/say.txt")"
check "H9a-3 (LIVENESS, informational — expected to FAIL: A's validator refuses a non-UTF-8 question, so a hard stop whose message carries a bad byte reaches no phone) a question was asked" $([ "$(qcount)" -eq 1 ]; echo $?) "questions=$(qcount) · $(grep 'ask_director' "$C/say.txt")"
newcase h9b
env -i PATH="$PLAIN_PATH" HOME="$HM" LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 /opt/homebrew/bin/bash "$TMP/ship-wave.sh" --freeze "$BADMSG" >> "$C/say.txt" 2>&1; CLI_RC=$?
info "H9b UTF-8 terminal locale: rc=$CLI_RC lines=$(nlines) msg='$(cut -f2 "$ST/FROZEN" 2>/dev/null | cat -v)' receipt='$(tr '\n' '|' < "$C/say.txt" | cut -c1-160)'"
check "H9b SAFETY under a UTF-8 terminal locale: either recorded (a hard line reads back, rc=0) or refused loudly (rc≠0, ⛔ line) — never rc=0 with nothing recorded" $( if [ "$CLI_RC" -eq 0 ]; then [ "$(hard_lines)" -ge 1 ] && [ "$(qcount)" -eq 1 ]; else grep -q '⛔' "$C/say.txt" && [ "$(qcount)" -eq 0 ]; fi; echo $?) "rc=$CLI_RC $(cat -v "$ST/FROZEN" 2>/dev/null) $(cat "$C/say.txt")"
check "H9b-2 FIDELITY (informational; BSD tr stops at an illegal byte under UTF-8): the recorded message still carries the text after the bad byte" $(grep -q 'tail' "$ST/FROZEN" 2>/dev/null; echo $?) "msg='$(cut -f2 "$ST/FROZEN" 2>/dev/null | cat -v)'"

echo "══ H10. run-internal path: freeze() that cannot record ends the run non-zero AND releases the single-flight lock ══"
newcase h10; ln -s /dev/null "$ST/FROZEN"
out=$( env -i PATH="$PLAIN_PATH" HOME="$HM" /opt/homebrew/bin/bash -c 'R=$1 S=$2 M=$3; cd "$R"; set -- plan; . "$S" >/dev/null 2>&1; [ -d "$LOCK" ] && echo LOCK-HELD; freeze "$M"; echo CONTINUED' _ "$ROOT" "$TMP/ship-wave.sh" "$HARD_MSG" 2>&1 ); rc=$?
check "H10a the sourced (plan) shell held the lock, freeze() exited 5, nothing ran after it, the lock is released (trap)" $([ "$rc" -eq 5 ] && _contains "$out" LOCK-HELD && ! _contains "$out" CONTINUED && [ "$(lock_left)" = no ]; echo $?) "rc=$rc lock=$(lock_left) out=$out"
newcase h10b; ln -s /dev/null "$ST/FROZEN"
wave --freeze "$HARD_MSG"; wave --freeze "$HARD_MSG"
check "H10b two refused --freeze calls in a row: both rc=5 (the first left no lock that would turn the second into 'another ship wave is running')" $([ "$(grep -c 'not a regular file' "$C/say.txt")" -eq 2 ] && ! grep -q 'another ship wave is running' "$C/say.txt"; echo $?) "$(cat "$C/say.txt")"

echo "══ H11. two --freeze at once (soft + hard, same second): both recorded, both read back, both asked ══"
newcase h11
sleep "$(python3 -c 'import time;print(round(1-time.time()%1+0.02,3))')"
( env -i PATH="$PLAIN_PATH" HOME="$HM" /opt/homebrew/bin/bash "$TMP/ship-wave.sh" --freeze "$SOFT_MSG" > "$C/a.txt" 2>&1 ) & p1=$!
( env -i PATH="$PLAIN_PATH" HOME="$HM" /opt/homebrew/bin/bash "$TMP/ship-wave.sh" --freeze "$HARD_MSG" > "$C/b.txt" 2>&1 ) & p2=$!
wait $p1; r1=$?; wait $p2; r2=$?
check "H11a both rc=0, FROZEN has exactly 2 lines (1 soft + 1 hard), each with a sha1 that equals its own fields 1-4, 2 questions" $([ "$r1" -eq 0 ] && [ "$r2" -eq 0 ] && [ "$(nlines)" -eq 2 ] && [ "$(hard_lines)" -eq 1 ] && [ "$(soft_lines)" -eq 1 ] && [ "$(qcount)" -eq 2 ] && [ "$(awk -F'\t' '{print $5}' "$ST/FROZEN" | sort -u | wc -l | tr -d ' ')" -eq 2 ]; echo $?) "r1=$r1 r2=$r2 $(cat "$ST/FROZEN")"
check "H11b class hard, deploy REFUSED" $([ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "REFUSED: hard freeze"; echo $?) "$(cls_now)"

echo "══ H12. the sha read-back is exact: a pre-existing IDENTICAL line (same second, same text) does not fool the check ══"
newcase h12
( export HOME="$HM"; cd "$ROOT"; set -- plan; . "$TMP/ship-wave.sh" >/dev/null 2>&1; freeze "$HARD_MSG" >/dev/null 2>&1 )
L=$(cat "$ST/FROZEN"); printf '%s\n%s\n' "$L" "$L" > "$ST/FROZEN"       # two byte-identical lines
check "H12a a byte-identical duplicate: class hard, 2 hard lines" $([ "$(cls_now)" = hard ] && [ "$(hard_lines)" -eq 2 ]; echo $?) "$(cat "$ST/FROZEN")"
QH=$(qid_hard); tap "$QH" "$(lift_idx "$QH")"
check "H12b the hard question's Lift via the real desk removes BOTH identical lines (same sha) → file gone; nothing else was there to keep" $([ "$RC" -eq 0 ] && [ ! -e "$ST/FROZEN" ]; echo $?) "rc=$RC $ANS $(cat "$ST/FROZEN" 2>/dev/null)"


echo "════ PART 3 · CLASS DOWNGRADE WITHOUT --unfreeze (empty FROZEN, glued append) ════"
echo "══ H13. FROZEN is EMPTY (0 bytes): reads HARD — a phone '--freeze <soft>' must not turn that into soft, and no tap may then remove it ══"
newcase h13; : > "$ST/FROZEN"
check "H13a precondition: an empty FROZEN reads hard, deploy REFUSED ('FROZEN is empty — reads as hard')" $([ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "FROZEN is empty"; echo $?) "$(cls_now) $(deploy_gate)"
wave --freeze "$SOFT_MSG"; QS=$(qid_by_title 'paused on one item'); QB=$(qid_behind)
info "H13 rc=$CLI_RC · $(tr '\n' '|' < "$C/say.txt" | cut -c1-200) · class=$(cls_now) · $(deploy_gate | cut -c1-90) · soft-q=${QS:-none} behind-q=${QB:-none}"
check "H13b (PROPERTY) after the soft --freeze the class in force is still HARD and the deploy gate still refuses" $([ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "REFUSED: hard freeze"; echo $?) "class=$(cls_now) · $(deploy_gate)"
check "H13c (PROPERTY) the question written is the noop-only behind-question — none carries an unfreeze op" $([ -z "$QS" ] && [ -n "$QB" ] && [ "$(q_ops "$QB")" = noop ]; echo $?) "soft-q=${QS:-none} behind-q=${QB:-none} $( [ -n "$QS" ] && q_ops "$QS")"
if [ -n "$QS" ]; then tap "$QS" "$(lift_idx "$QS")"; else RC=99; ANS="no Lift-capable question (correct)"; fi
check "H13d (PROPERTY, end-to-end via the real desk) no tap leaves the wave unfrozen after a stop that read HARD" $([ -e "$ST/FROZEN" ] && [ "$(cls_now)" = hard ]; echo $?) "tap rc=$RC $ANS · FROZEN $([ -e "$ST/FROZEN" ] && echo present || echo GONE) · $(run_view) · $(deploy_gate | cut -c1-60)"

echo "══ H14. a REAL origin for the empty FROZEN: a HARD freeze whose append fails after the open (EFBIG — the disk-full shape) ══"
newcase h14
# the receipt goes through a PIPE: under `ulimit -f 0` a receipt redirected into a file could not be written either
env -i PATH="$PLAIN_PATH" HOME="$HM" /opt/homebrew/bin/bash -c 'trap "" XFSZ; ulimit -f 0; exec /opt/homebrew/bin/bash "$1" --freeze "$2"' _ "$TMP/ship-wave.sh" "$HARD_MSG" 2>&1 | cat >> "$C/say.txt"; CLI_RC=${PIPESTATUS[0]}
check "H14a the failed hard freeze exits 5 loudly ('could not write FROZEN'), writes no question — and leaves a 0-byte FROZEN that reads hard" $([ "$CLI_RC" -eq 5 ] && grep -q 'could not write FROZEN' "$C/say.txt" && [ "$(qcount)" -eq 0 ] && [ -f "$ST/FROZEN" ] && [ ! -s "$ST/FROZEN" ] && [ "$(cls_now)" = hard ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt") bytes=$(wc -c < "$ST/FROZEN" 2>/dev/null)"
wave --freeze "$SOFT_MSG"
check "H14b (PROPERTY) the Director's later phone '--freeze <soft>' leaves the class HARD (the lost hard stop is not downgraded)" $([ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "REFUSED: hard freeze"; echo $?) "class=$(cls_now) · $(deploy_gate)"

echo "══ H15. FROZEN whose last line has NO trailing newline: the append glues onto it ══"
newcase h15a; printf '2026-09-1' > "$ST/FROZEN"     # a partial write that stopped inside field 1
check "H15a precondition: the fragment reads hard, deploy REFUSED" $([ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "REFUSED: hard freeze"; echo $?) "$(cls_now)"
wave --freeze "$SOFT_MSG"
info "H15a rc=$CLI_RC · $(cat "$C/say.txt" | head -1) · FROZEN: $(cat -v "$ST/FROZEN" | cut -c1-120) · NF=$(awk -F'\t' '{print NF}' "$ST/FROZEN")"
check "H15b (PROPERTY) the glued append leaves the class HARD (it must not fuse into one well-formed SOFT line)" $([ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "REFUSED: hard freeze"; echo $?) "class=$(cls_now) · $(deploy_gate) · $(cat -v "$ST/FROZEN")"
check "H15c (HONESTY) a refusal names a TRUE reason — the file IS a regular file" $(! grep -q 'FROZEN is not a regular file' "$C/say.txt" || [ ! -f "$ST/FROZEN" ]; echo $?) "$(cat "$C/say.txt")"
newcase h15b; ( export HOME="$HM"; cd "$ROOT"; set -- plan; . "$TMP/ship-wave.sh" >/dev/null 2>&1; freeze "$HARD_MSG" >/dev/null 2>&1 )
QH=$(qid_hard); printf '%s' "$(cat "$ST/FROZEN")" > "$ST/FROZEN.x" && mv "$ST/FROZEN.x" "$ST/FROZEN"   # hand-saved without the final newline
wave --freeze "$SOFT_MSG"
check "H15d glued onto a full hard line: class stays hard, deploy REFUSED (safe)" $([ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "REFUSED: hard freeze"; echo $?) "$(cls_now)"
tap "$QH" "$(lift_idx "$QH")"
check "H15e (LIVENESS, informational) the hard question's own Lift still lifts its stop after the glue" $([ "$RC" -eq 0 ] && [ ! -e "$ST/FROZEN" ]; echo $?) "rc=$RC $ANS"

echo "══ H16. --freeze with a message made only of NON-ASCII / other whitespace (\\v, \\f, NBSP, U+3000) ══"
for m in "$(printf '\v')" "$(printf '\f\f')" "$(printf '\xc2\xa0')" "$(printf '\xe3\x80\x80')"; do
  tag=$(printf '%s' "$m" | od -An -tx1 | tr -d ' \n'); newcase "h16-$tag"; wave go --freeze "$m"
  check "H16 ($tag) 'go --freeze <blank-looking>': never a run — either refused rc=2, or recorded as a HARD line (rc=0); no lock, no receipt file" $( { [ "$CLI_RC" -eq 2 ] || { [ "$CLI_RC" -eq 0 ] && [ "$(hard_lines)" -eq 1 ]; }; } && [ "$(lock_left)" = no ] && [ ! -e "$HM/.config/obsidian/v5-myjkkn-ship-last.txt" ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt" | head -1)"
done

echo "══ H17. (CONTRIVED) a UTF-8 terminal locale + an invalid byte: BSD tr truncates the message before classify_freeze ══"
newcase h17; M17="$(printf 'peer hold note: deploy dpl_9 \xff ERROR')"
env -i PATH="$PLAIN_PATH" HOME="$HM" LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 /opt/homebrew/bin/bash "$TMP/ship-wave.sh" --freeze "$M17" >> "$C/say.txt" 2>&1; CLI_RC=$?
check "H17 (CONTRIVED, informational) a 'deploy … ERROR' message is recorded HARD under a UTF-8 locale too (launchd's C locale records it hard)" $([ "$(cls_now)" = hard ]; echo $?) "recorded: $(cut -f2,3 "$ST/FROZEN" | cat -v) · $(grep -c 'Illegal byte' "$C/say.txt") 'tr: Illegal byte sequence' line(s)"

echo "══ SAFETY ══"
check "S1 live ~/.config/obsidian/.ship-wave/FROZEN unchanged by this run (was: $LIVE_FROZEN_BEFORE)" $([ "$( [ -e "$HOME/.config/obsidian/.ship-wave/FROZEN" ] && echo present || echo absent )" = "$LIVE_FROZEN_BEFORE" ]; echo $?) "live FROZEN state changed"
check "S2 no live lock left at ~/.config/obsidian/.ship-wave.lock by this harness (every case used a temp HOME)" $([ ! -e "$HOME/.config/obsidian/.ship-wave.lock" ] || [ "$(stat -f %m "$HOME/.config/obsidian/.ship-wave.lock")" -lt "$(stat -f %m "$TMP")" ]; echo $?) "a lock newer than this run exists"

echo "=== $PASS passed · $FAIL failed · fixtures in $TMP ==="
[ "$FAIL" -eq 0 ]

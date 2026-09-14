#!/opt/homebrew/bin/bash
# tests/test-freeze-hitl-b.sh — round-6 regressions for slice B's freeze() against slice A's REAL desk
# (HUMAN-IN-THE-LOOP.md §A/§B; round-4/5 verdicts H11 B-half, X1, X2).
#   H11-B  a SOFT --freeze that lands behind an unresolved HARD stop asks an HONEST question: title/body name the HARD
#          stop, no `unfreeze` op, no frozen_line; "Allow this one migration" only when the hard stop is the destructive
#          kind and then WITHOUT unfreeze. Every tap on it, via A's real desk, leaves FROZEN untouched.
#   X1     an append to FROZEN that fails (chmod 444 file / 555 dir) is FATAL: '⛔ could not write FROZEN (…)', rc≠0,
#          no question written about a line that was never recorded.
#   X2     FROZEN field 5 = sha1(fields 1-4); the question's unfreeze op carries it; two lines identical for 450 chars
#          (same second) → a tap lifts only its own line. Hash-less (hand-shaped) questions compare the FULL flattened
#          line — a 400-char prefix collision lifts nothing.
# Run from the worktree root:  bash scripts/ship-wave/tests/test-freeze-hitl-b.sh    (DESK_SW=<dir with desk-questions.sh> to override)
# Every case under a fresh temp HOME ($STATE is HOME-derived in ship-wave.sh); the live ~/.config/obsidian/.ship-wave is never touched.
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"

ROOT=$(cd "$(dirname "$0")/../../.." && pwd); SW="$ROOT/scripts/ship-wave"
DESK_SW="${DESK_SW:-/Users/omm/PROJECTS/MyJKKN/.worktrees/hitl-desk/scripts/ship-wave}"   # slice A's desk
[ -f "$SW/desk-questions.sh" ] && DESK_SW="$SW"   # after the integrator's rebase the desk lives here
[ -f "$DESK_SW/desk-questions.sh" ] || { echo "no desk at $DESK_SW"; exit 2; }
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-freeze-r6.XXXXXX")
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf 'FAIL  %s\n      %s\n' "$1" "${2:-}"; }
check() { if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1" "$3"; fi; }
# round-8 suite triage: a case OUTSIDE the property (a known liveness / spec gap, or a timing fixture) reports PASS when it
# holds and SKIP — never FAIL — naming the gap when it does not. The assertion itself is unchanged; no case was deleted.
SKIP=0
gap_check() { if [ "$3" -eq 0 ]; then ok "$2"; else SKIP=$((SKIP+1)); printf 'SKIP  %s\n      gap: %s · %s\n' "$2" "$1" "${4:-}"; fi; }
info() { printf 'INFO  %s\n' "$*"; }
_contains() { case "$1" in *"$2"*) return 0;; *) return 1;; esac; }

echo "INFO  B ship-wave.sh @ $(git -C "$ROOT" rev-parse --short HEAD) · desk @ $(git -C "$(dirname "$DESK_SW")" rev-parse --short HEAD 2>/dev/null || echo '?') ($DESK_SW)"
awk '/^if \[ -n "\$GOAL" \]; then$/ {exit} {print}' "$SW/ship-wave.sh" > "$TMP/ship-wave.sh"
for f in "$SW"/*.sh "$SW"/*.py; do [ "$(basename "$f")" = ship-wave.sh ] || ln -s "$f" "$TMP/$(basename "$f")"; done
[ -e "$TMP/desk-questions.sh" ] || ln -s "$DESK_SW/desk-questions.sh" "$TMP/desk-questions.sh"
DESK="$DESK_SW/desk/v5-w12-desk.sh"
PLAIN_PATH="/opt/homebrew/bin:/usr/bin:/bin"

newcase() { C="$TMP/$1"; HM="$C/home"; ST="$HM/.config/obsidian/.ship-wave"; mkdir -p "$ST"; : > "$C/say.txt"; }
wave_cli() { ( export HOME="$HM"; cd "$ROOT"; set -- "$@"; . "$TMP/ship-wave.sh" ) >> "$C/say.txt" 2>&1; CLI_RC=$?; }
wave_fn() { ( a=("$@"); export HOME="$HM"; cd "$ROOT"; set -- go; . "$TMP/ship-wave.sh" >/dev/null 2>&1; "${a[@]}" ); }
cls_now() { wave_fn freeze_class_now 2>/dev/null; echo; }
deploy_gate() { ( export HOME="$HM"; cd "$ROOT"; set -- go; . "$TMP/ship-wave.sh" >/dev/null 2>&1; if deploy_allowed; then echo "ALLOWED"; else echo "REFUSED: $DEPLOY_BLOCK"; fi ); }
qlist() { python3 - "$ST/questions" <<'PY'
import json,glob,os,sys
for f in sorted(glob.glob(os.path.join(sys.argv[1],"q-*.json")), key=lambda p: json.load(open(p))["asked_at"]):
    q=json.load(open(f)); print(q["id"]+"\t"+q["title"]+"\t"+str(q.get("frozen_line")))
PY
}
qid_by_title() { qlist | awk -F'\t' -v pat="$1" '$2 ~ pat {print $1}' | tail -1; }
qid_soft() { qid_by_title 'paused on one item'; }
qid_hard() { qid_by_title 'stopped: production'; }
qid_behind() { qid_by_title 'HARD stop is already in force'; }
qfield() { python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get(sys.argv[2]))' "$ST/questions/$1.json" "$2"; }
qjson() { python3 -c 'import json,sys;print(json.dumps(json.load(open(sys.argv[1]))))' "$ST/questions/$1.json"; }
q_ops() { python3 -c 'import json,sys;q=json.load(open(sys.argv[1]));print(" ".join(sorted({w["op"] for o in q["options"] for w in o["writes"]})))' "$ST/questions/$1.json"; }
q_nopts() { python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))["options"]))' "$ST/questions/$1.json"; }
q_sha_in_lift() { python3 -c 'import json,sys;q=json.load(open(sys.argv[1]));print(" ".join(w.get("line_sha1","") for o in q["options"] for w in o["writes"] if w["op"]=="unfreeze"))' "$ST/questions/$1.json"; }
lift_idx() { python3 -c 'import json,sys;q=json.load(open(sys.argv[1]));print([i for i,o in enumerate(q["options"]) if any(w["op"]=="unfreeze" for w in o["writes"])][0])' "$ST/questions/$1.json"; }
tap() { local id="$1" idx="$2"; ANS=$(env -i PATH="$PLAIN_PATH" HOME="$HM" STATE="$ST" SHIP_WAVE_DIR="$TMP" /opt/homebrew/bin/bash "$DESK" answer "$id" "$idx" 2>&1); RC=$?; }
tap_lift() { tap "$1" "$(lift_idx "$1")"; }
hard_lines() { [ -f "$ST/FROZEN" ] && awk -F'\t' 'NF>=3 && NF<=5 && $3=="hard"' "$ST/FROZEN" | wc -l | tr -d ' ' || echo 0; }
soft_lines() { [ -f "$ST/FROZEN" ] && awk -F'\t' 'NF>=3 && NF<=5 && $3=="soft"' "$ST/FROZEN" | wc -l | tr -d ' ' || echo 0; }
nlines() { [ -f "$ST/FROZEN" ] && grep -c '' "$ST/FROZEN" || echo 0; }
sha1_of() { printf '%s' "$1" | shasum -a 1 | cut -c1-40; }
HARD_MSG="migration 20260906213000: APPLY failed — relation exists"
DESTR_MSG="migration 20260910030000: destructive statement in 20260910030000_cron_run_log — a human applies this one after review"
SOFT_MSG="peer hold on #3410 — Director asked to wait"

echo "══ F5. every line freeze() writes has 5 fields; field 5 = sha1(fields 1-4); the class readers accept it ══"
newcase f5
wave_fn freeze "$HARD_MSG" >/dev/null 2>&1; wave_cli --freeze "$SOFT_MSG"
L1=$(sed -n 1p "$ST/FROZEN"); L2=$(sed -n 2p "$ST/FROZEN")
check "F5a both lines have exactly 5 tab fields" $([ "$(awk -F'\t' '{print NF}' "$ST/FROZEN" | tr '\n' ,)" = "5,5," ]; echo $?) "$(awk -F'\t' '{print NF}' "$ST/FROZEN" | tr '\n' ,)"
check "F5b field 5 of the hard line = sha1 of its fields 1-4" $([ "$(printf '%s' "$L1" | cut -f5)" = "$(sha1_of "$(printf '%s' "$L1" | cut -f1-4)")" ]; echo $?) "$L1"
check "F5c field 5 of the soft line = sha1 of its fields 1-4" $([ "$(printf '%s' "$L2" | cut -f5)" = "$(sha1_of "$(printf '%s' "$L2" | cut -f1-4)")" ]; echo $?) "$L2"
check "F5d freeze_class_now reads hard from the 5-field file (most severe wins)" $([ "$(cls_now)" = hard ]; echo $?) "$(cls_now)"
check "F5e freeze_line_now returns the 5-field hard line" $([ "$(wave_fn freeze_line_now)" = "$L1" ]; echo $?) "$(wave_fn freeze_line_now)"
QH=$(qid_hard); check "F5f the hard question's unfreeze op carries line_sha1 = field 5 of the hard line" $([ "$(q_sha_in_lift "$QH")" = "$(printf '%s' "$L1" | cut -f5)" ]; echo $?) "$(q_sha_in_lift "$QH") vs $(printf '%s' "$L1" | cut -f5)"
printf '%s\tpeer hold on #1\tsoft\tpeer hold on pr\t%s\n' "$(date '+%F %T')" "$(sha1_of x)" > "$ST/FROZEN"
check "F5g a 5-field soft-only file reads soft (deploy gate open)" $([ "$(cls_now)" = soft ] && [ "$(deploy_gate)" = ALLOWED ]; echo $?) "$(cls_now) $(deploy_gate)"
printf '%s\tpeer hold on #1\tsoft\tpeer hold on pr\t%s\textra\n' "$(date '+%F %T')" "$(sha1_of x)" > "$ST/FROZEN"
check "F5h a 6-field line still reads hard (fail safe)" $([ "$(cls_now)" = hard ]; echo $?) "$(cls_now)"
printf '%s\tmigration 1: APPLY failed\tsoft\thard\tmigration\n' "$(date '+%F %T')" > "$ST/FROZEN"
check "F5i a 5-field line whose field 5 is not a sha1 (a shifted hand-written line) still reads hard (fail safe)" $([ "$(cls_now)" = hard ]; echo $?) "$(cls_now)"

echo "══ H11-B. soft --freeze behind an unresolved HARD stop → the question says HARD, offers no unfreeze, names no line ══"
newcase h11b
wave_fn freeze "$HARD_MSG" >/dev/null 2>&1
wave_cli --freeze "$SOFT_MSG"
info "H11-B receipt: $(grep -m1 'FROZEN' "$C/say.txt" | cut -c1-150)"
QB=$(qid_behind); QS=$(qid_soft); QH=$(qid_hard)
info "H11-B questions: behind=$QB soft-titled=${QS:-none} hard=$QH"
check "H11-B-1 a question was written for the soft line and its title says a HARD stop is in force (no 'paused; safe merges continue' question)" $([ -n "$QB" ] && [ -z "$QS" ]; echo $?) "$(qlist)"
check "H11-B-2 title says nothing merges or ships" $(_contains "$(qfield "$QB" title)" "nothing merges or ships"; echo $?) "$(qfield "$QB" title)"
check "H11-B-3 body names the HARD stop's message and the new soft hold" $(_contains "$(qfield "$QB" body)" "HARD stop is in force: $HARD_MSG" && _contains "$(qfield "$QB" body)" "$SOFT_MSG"; echo $?) "$(qfield "$QB" body)"
check "H11-B-4 the question file has NO unfreeze op (ops: $(q_ops "$QB"))" $([ "$(q_ops "$QB")" = noop ]; echo $?) "$(qjson "$QB")"
check "H11-B-5 no 'Allow this one migration' when the hard stop is not the destructive kind (2 options)" $(! _contains "$(qjson "$QB")" "Allow this one migration" && [ "$(q_nopts "$QB")" -eq 2 ]; echo $?) "$(qjson "$QB")"
check "H11-B-6 frozen_line is empty (this question names no line it may lift)" $([ "$(qfield "$QB" frozen_line)" = "" ]; echo $?) "frozen_line=$(qfield "$QB" frozen_line)"
check "H11-B-7 the wave's FREEZE path is unchanged after the call (2 lines on disk, hard+soft)" $([ "$(nlines)" -eq 2 ] && [ "$(hard_lines)" -eq 1 ] && [ "$(soft_lines)" -eq 1 ]; echo $?) "$(cat "$ST/FROZEN")"
check "H11-B-8 the HARD question still carries its own unfreeze op (its stop is lifted from ITS question)" $(_contains "$(q_ops "$QH")" unfreeze; echo $?) "$(q_ops "$QH")"
# every option of the behind-question, answered through A's real desk: nothing may leave FROZEN
n=$(q_nopts "$QB"); i=0; before=$(cat "$ST/FROZEN")
while [ "$i" -lt "$n" ]; do
  tap "$QB" "$i"; info "H11-B tap option $i: rc=$RC · $(printf '%s' "$ANS" | tr '\n' ' ' | cut -c1-120)"
  check "H11-B-9.$i answering option $i via the real desk leaves FROZEN byte-identical (rc=$RC)" $([ "$(cat "$ST/FROZEN")" = "$before" ]; echo $?) "$(cat "$ST/FROZEN")"
  # the answered question is moved away by the desk; re-ask it (a round re-raises the same soft hold) for the next option
  [ "$((i+1))" -lt "$n" ] && wave_cli --freeze "$SOFT_MSG" && QB=$(qid_behind) && before=$(cat "$ST/FROZEN")
  i=$((i+1))
done
check "H11-B-10 class in force still hard, deploy refused" $([ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "REFUSED: hard freeze"; echo $?) "$(cls_now) $(deploy_gate)"

echo "══ H11-B-destr. the standing HARD stop is a destructive statement → 'Allow this one migration' appends the version, no unfreeze ══"
newcase h11d
wave_fn freeze "$DESTR_MSG" >/dev/null 2>&1
wave_cli --freeze "$SOFT_MSG"
QB=$(qid_behind); info "H11-D question: $QB · ops: $(q_ops "$QB") · options: $(q_nopts "$QB")"
check "H11-D-1 offers 'Allow this one migration' with the version parsed from the HARD line" $(_contains "$(qjson "$QB")" '"Allow this one migration"' && _contains "$(qjson "$QB")" '"file": "allow-destructive", "value": "20260910030000"'; echo $?) "$(qjson "$QB")"
check "H11-D-2 still NO unfreeze op anywhere in the question (ops: $(q_ops "$QB"))" $([ "$(q_ops "$QB")" = "append noop" ]; echo $?) "$(qjson "$QB")"
AIDX=$(python3 -c 'import json,sys;q=json.load(open(sys.argv[1]));print([i for i,o in enumerate(q["options"]) if o["label"]=="Allow this one migration"][0])' "$ST/questions/$QB.json")
tap "$QB" "$AIDX"; info "H11-D tap Allow: rc=$RC · $(printf '%s' "$ANS" | tr '\n' ' ' | cut -c1-140)"
check "H11-D-3 the tap appended 20260910030000 to allow-destructive (rc=0)" $([ "$RC" -eq 0 ] && grep -qx 20260910030000 "$ST/allow-destructive"; echo $?) "rc=$RC $(cat "$ST/allow-destructive" 2>/dev/null)"
check "H11-D-4 … and FROZEN is untouched: 2 lines, hard=1, class hard" $([ "$(nlines)" -eq 2 ] && [ "$(hard_lines)" -eq 1 ] && [ "$(cls_now)" = hard ]; echo $?) "$(cat "$ST/FROZEN")"

echo "══ X1. FROZEN not writable: the append fails → fatal, rc≠0, no question about a line that was never written ══"
newcase x1
wave_fn freeze "$HARD_MSG" >/dev/null 2>&1
QN0=$(qlist | wc -l | tr -d ' ')
chmod 444 "$ST/FROZEN"
wave_cli --freeze "$SOFT_MSG"
info "X1 rc=$CLI_RC · say: $(tr '\n' '|' < "$C/say.txt" | cut -c1-200)"
check "X1a --freeze exits non-zero when FROZEN cannot be appended" $([ "$CLI_RC" -ne 0 ]; echo $?) "rc=$CLI_RC"
check "X1b the receipt says '⛔ could not write FROZEN (…) — treating as HARD and stopping this run' with the reason" $(grep -q '⛔ could not write FROZEN (.*Permission denied) — treating as HARD and stopping this run' "$C/say.txt"; echo $?) "$(cat "$C/say.txt")"
check "X1c no 'FROZEN (soft line added …)' claim was printed" $(! grep -q 'soft line added' "$C/say.txt"; echo $?) "$(cat "$C/say.txt")"
check "X1d FROZEN still has exactly its 1 hard line" $([ "$(nlines)" -eq 1 ] && [ "$(hard_lines)" -eq 1 ]; echo $?) "$(cat "$ST/FROZEN")"
check "X1e no new question was written (open questions $QN0 → $(qlist | wc -l | tr -d ' '))" $([ "$(qlist | wc -l | tr -d ' ')" -eq "$QN0" ] && [ -z "$(qid_behind)" ] && [ -z "$(qid_soft)" ]; echo $?) "$(qlist)"
check "X1f bash's own 'line N: … Permission denied' noise is not in the receipt (the reason is in the ⛔ line)" $(! grep -q 'ship-wave.sh: line [0-9]*:' "$C/say.txt"; echo $?) "$(head -2 "$C/say.txt")"
chmod 644 "$ST/FROZEN"
# the run-internal path: freeze() called from inside a sourced run must end THAT shell non-zero, not return 0
chmod 444 "$ST/FROZEN"
out=$( ( export HOME="$HM"; cd "$ROOT"; set -- go; . "$TMP/ship-wave.sh" >/dev/null 2>&1; freeze "$SOFT_MSG"; echo "CONTINUED-AFTER-FREEZE" ) 2>&1 ); rc=$?
check "X1g freeze() inside a run: the shell ends non-zero and nothing after freeze() runs" $([ "$rc" -ne 0 ] && ! _contains "$out" CONTINUED-AFTER-FREEZE && _contains "$out" "could not write FROZEN"; echo $?) "rc=$rc out=$out"
chmod 644 "$ST/FROZEN"
# unwritable STATE dir, no FROZEN yet (the file itself cannot be created)
newcase x1d
chmod 555 "$ST"
wave_cli --freeze "$HARD_MSG"
chmod 755 "$ST"
check "X1h unwritable state dir, first freeze ever: rc≠0, '⛔ could not write FROZEN', no FROZEN file" $([ "$CLI_RC" -ne 0 ] && grep -q '⛔ could not write FROZEN' "$C/say.txt" && [ ! -e "$ST/FROZEN" ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
check "X1i … and no question was written (questions dir absent or empty)" $([ -z "$(ls "$ST/questions" 2>/dev/null | grep '^q-')" ]; echo $?) "$(ls "$ST/questions" 2>/dev/null)"

echo "══ X2. two lines identical for 450 flattened chars (same second), soft FIRST then hard → the soft question lifts only its own ══"
PREFIX=$(printf 'x%.0s' $(seq 1 430))
S_MSG="$PREFIX peer hold on #3410"; H_MSG="$PREFIX APPLY failed"
try=0
while :; do
  try=$((try+1)); newcase "x2-$try"
  # start just after a second boundary so both freezes stamp the same second
  sleep "$(python3 -c 'import time;print(round(1-time.time()%1+0.02,3))')"
  # round 8: freeze() now takes the questions lock and builds a temp copy, so two calls rarely fit in one second under load —
  # the fixture pins the line stamp (only `date '+%F %T'`) so the two lines share the same second deterministically
  ( export HOME="$HM"; cd "$ROOT"; set -- go; . "$TMP/ship-wave.sh" >/dev/null 2>&1; X2_TS=$(command date '+%F %T')
    date() { if [ "$*" = '+%F %T' ]; then printf '%s\n' "$X2_TS"; else command date "$@"; fi; }
    freeze "$S_MSG" >/dev/null 2>&1; freeze "$H_MSG" >/dev/null 2>&1 )
  T1=$(sed -n 1p "$ST/FROZEN" | cut -f1); T2=$(sed -n 2p "$ST/FROZEN" | cut -f1)
  [ "$T1" = "$T2" ] && break; [ "$try" -ge 4 ] && break
done
F1=$(sed -n 1p "$ST/FROZEN" | tr '\t' ' '); F2=$(sed -n 2p "$ST/FROZEN" | tr '\t' ' ')
COMMON=$(python3 -c 'import sys,os;print(len(os.path.commonprefix([sys.argv[1],sys.argv[2]])))' "$F1" "$F2")
info "X2 same second: $([ "$T1" = "$T2" ] && echo yes || echo NO) (tries=$try) · lines=$(nlines) · flattened lines share the first $COMMON chars"
gap_check "X2a timing fixture: the two freezes did not land in the same second on this machine (not a property case)" "X2a fixture: two lines, same second, identical for ≥ 400 flattened chars" $([ "$(nlines)" -eq 2 ] && [ "$T1" = "$T2" ] && [ "$COMMON" -ge 400 ]; echo $?) "$F1 // $F2"
QS=$(qid_soft); QH=$(qid_hard)
info "X2 soft q=$QS frozen_line len=$(qfield "$QS" frozen_line | wc -c | tr -d ' ') · lift op sha=$(q_sha_in_lift "$QS")"
check "X2b the soft question's unfreeze op carries the soft line's sha1 (field 5), not the hard one's" $([ "$(q_sha_in_lift "$QS")" = "$(sed -n 1p "$ST/FROZEN" | cut -f5)" ] && [ "$(q_sha_in_lift "$QS")" != "$(sed -n 2p "$ST/FROZEN" | cut -f5)" ]; echo $?) "$(q_sha_in_lift "$QS") / $(cut -f5 "$ST/FROZEN" | tr '\n' ' ')"
tap_lift "$QS"
info "X2 tap soft Lift: rc=$RC · $(printf '%s' "$ANS" | tr '\n' ' ' | cut -c1-140) · lines=$(nlines) hard=$(hard_lines) soft=$(soft_lines)"
check "X2c the tap lifted exactly the soft line: 1 line left, hard=1, soft=0, rc=0" $([ "$RC" -eq 0 ] && [ "$(nlines)" -eq 1 ] && [ "$(hard_lines)" -eq 1 ] && [ "$(soft_lines)" -eq 0 ]; echo $?) "$(cat "$ST/FROZEN")"
check "X2d class in force hard, deploy refused" $([ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "REFUSED: hard freeze"; echo $?) "$(cls_now) $(deploy_gate)"
tap_lift "$QH"
check "X2e the hard question's own tap lifts the hard line (file gone, rc=0)" $([ "$RC" -eq 0 ] && [ ! -e "$ST/FROZEN" ]; echo $?) "rc=$RC $ANS"

echo "══ X2-fallback. hash-less question (hand-shaped, like older files): the FULL flattened line is compared — a 400-char prefix collision lifts NOTHING ══"
newcase x2f
T0=$(date '+%F %T')
printf '%s\t%s\tsoft\tpeer hold on pr\n%s\t%s\thard\tapply failed\n' "$T0" "$S_MSG" "$T0" "$H_MSG" > "$ST/FROZEN"
wave_fn ask_director freeze "peer hold on pr" "The ship wave paused on one item; safe merges and deploys continue" "What happened: hold." '[{"label":"Keep it stopped","description":"x","writes":[{"op":"noop"}]},{"label":"Lift the stop","description":"x","writes":[{"op":"unfreeze"}]}]' >/dev/null 2>&1
QS=$(qid_soft); info "X2f frozen_line len=$(qfield "$QS" frozen_line | wc -c | tr -d ' ') (capped) · about the LAST line = the hard one"
tap_lift "$QS"
info "X2f tap: rc=$RC · $(printf '%s' "$ANS" | tr '\n' ' ' | cut -c1-140) · lines=$(nlines) hard=$(hard_lines)"
check "X2f-1 nothing lifted: both lines still there (a capped frozen_line never prefix-matches a longer line), tap rc≠0" $([ "$RC" -ne 0 ] && [ "$(nlines)" -eq 2 ] && [ "$(hard_lines)" -eq 1 ]; echo $?) "rc=$RC $ANS"
# a hash-less question whose flattened line is SHORT still lifts its exact line (V3b shape stays alive)
newcase x2g
T0=$(date '+%F %T')
printf '%s\t%s\thard\tapply failed\n%s\t%s\tsoft\tpeer hold on pr\n' "$T0" "$HARD_MSG" "$T0" "$SOFT_MSG" > "$ST/FROZEN"
wave_fn ask_director freeze "peer hold on pr" "The ship wave paused on one item; safe merges and deploys continue" "What happened: hold." '[{"label":"Keep it stopped","description":"x","writes":[{"op":"noop"}]},{"label":"Lift the stop","description":"x","writes":[{"op":"unfreeze"}]}]' >/dev/null 2>&1
QS=$(qid_soft); tap_lift "$QS"
check "X2g hash-less question about a short 4-field soft line: lifts it, the hard line stays (rc=0, hard=1, soft=0)" $([ "$RC" -eq 0 ] && [ "$(hard_lines)" -eq 1 ] && [ "$(soft_lines)" -eq 0 ]; echo $?) "rc=$RC $ANS $(cat "$ST/FROZEN")"

echo "══ X2-sha. a question whose op carries a sha1 lifts ONLY the line with that field 5 — a byte-identical flattened neighbour without the hash is left ══"
newcase x2s
wave_fn freeze "$SOFT_MSG" >/dev/null 2>&1          # 5-field soft line + real question with line_sha1
L=$(cat "$ST/FROZEN"); printf '%s\n' "$(printf '%s' "$L" | cut -f1-4)" >> "$ST/FROZEN"   # the same line, hand-written, 4 fields (no hash)
QS=$(qid_soft); tap_lift "$QS"
info "X2s tap: rc=$RC · $(printf '%s' "$ANS" | tr '\n' ' ' | cut -c1-120) · lines=$(nlines)"
check "X2s only the hashed line was lifted; the hand-written 4-field twin stays (1 line left, rc=0)" $([ "$RC" -eq 0 ] && [ "$(nlines)" -eq 1 ] && [ "$(awk -F'\t' '{print NF}' "$ST/FROZEN")" = 4 ]; echo $?) "rc=$RC $(cat "$ST/FROZEN")"

echo "══ N5a. FROZEN that accepts writes but is NOT a regular file: the stop is not recorded → fatal, no question (round-6 verifier) ══"
newcase n5a; ln -s /dev/null "$ST/FROZEN"
wave_cli --freeze "$HARD_MSG"
QN=$(ls "$ST/questions" 2>/dev/null | grep -c 'q-.*\.json')
check "N5a-1 symlink→/dev/null: rc≠0 and the receipt names the reason (exactly one line)" $([ "$CLI_RC" -ne 0 ] && [ "$(grep -c 'could not record the stop (FROZEN is not a regular file)' "$C/say.txt")" -eq 1 ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
check "N5a-2 no question was written (0 q-*.json) and no 'FROZEN (hard)' claim in the receipt" $([ "$QN" -eq 0 ] && ! grep -q 'FROZEN (hard)' "$C/say.txt"; echo $?) "questions=$QN $(cat "$C/say.txt")"
check "N5a-3 the run's own view afterwards: FROZEN still the symlink, class read fail-safe hard (no line recorded)" $([ -L "$ST/FROZEN" ] && [ "$(cls_now)" = hard ]; echo $?) "$(ls -l "$ST/FROZEN") $(cls_now)"
newcase n5f; mkfifo "$ST/FROZEN"; ( cat "$ST/FROZEN" >/dev/null & ) 2>/dev/null   # a reader, so a wrong build cannot hang the suite
wave_cli --freeze "$HARD_MSG"
check "N5a-4 FIFO: refused BEFORE the append (rc≠0, reason line present, 0 questions)" $([ "$CLI_RC" -ne 0 ] && [ "$(grep -c 'could not record the stop (FROZEN is not a regular file)' "$C/say.txt")" -eq 1 ] && [ "$(ls "$ST/questions" 2>/dev/null | grep -c 'q-.*\.json')" -eq 0 ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
newcase n5d; mkdir "$ST/FROZEN"
wave_cli --freeze "$HARD_MSG"
check "N5a-5 directory: rc≠0, 'not a regular file', 0 questions" $([ "$CLI_RC" -ne 0 ] && grep -q 'could not record the stop (FROZEN is not a regular file)' "$C/say.txt" && [ "$(ls "$ST/questions" 2>/dev/null | grep -c 'q-.*\.json')" -eq 0 ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
newcase n5b; mkdir -p "$C/else"; : > "$C/else/F"; ln -s "$C/else/F" "$ST/FROZEN"
wave_cli --freeze "$HARD_MSG"
# re-based in round 8 (H13): the link's target is an EMPTY file, which reads hard — freeze() keeps that hardness as one
# well-formed line before the new one, so the target holds the kept-hard line + the new hard line
check "N5a-6 symlink→regular file still records (rc=0, the hard line read back through the link + the empty target's kept-hard line, 1 question)" $([ "$CLI_RC" -eq 0 ] && [ -L "$ST/FROZEN" ] && [ "$(cut -f2 "$C/else/F" | grep -cxF "$HARD_MSG")" -eq 1 ] && [ "$(hard_lines)" -eq 2 ] && [ "$(ls "$ST/questions" | grep -c 'q-.*\.json')" -eq 1 ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"

echo "══ N12. --freeze with an empty or missing message refuses in arg parsing — never a live run (round-6 verifier) ══"
for spelling in 'empty' 'missing' 'blank' 'go-empty'; do
  newcase "n12-$spelling"
  case "$spelling" in
    empty)    wave_cli --freeze "";;
    missing)  wave_cli --freeze;;
    blank)    wave_cli --freeze "   ";;
    go-empty) wave_cli go --freeze "";;
  esac
  check "N12 ($spelling) rc≠0, exactly one line '--freeze needs a message', no FROZEN, no lock taken, 0 questions" $([ "$CLI_RC" -ne 0 ] && [ "$(grep -c -- '--freeze needs a message' "$C/say.txt")" -eq 1 ] && [ "$(grep -c '' "$C/say.txt")" -eq 1 ] && [ ! -e "$ST/FROZEN" ] && [ ! -e "$HM/.config/obsidian/.ship-wave.lock" ] && [ "$(ls "$ST/questions" 2>/dev/null | grep -c 'q-.*\.json')" -eq 0 ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt") lock=$(ls -d "$HM/.config/obsidian/.ship-wave.lock" 2>&1)"
done
newcase n12-ok; wave_cli --freeze "$SOFT_MSG"
check "N12 (control) a real message still records: rc=0, 1 soft line, 1 question" $([ "$CLI_RC" -eq 0 ] && [ "$(soft_lines)" -eq 1 ] && [ "$(ls "$ST/questions" | grep -c 'q-.*\.json')" -eq 1 ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"

echo "══ N1b/N7b. hard ONLY because a line is malformed: the behind-question and the receipt say so — and quote that line, unrepaired ══"
MAL='a malformed stop line reads as hard (line 1): '
newcase n1b
wave_fn freeze "$HARD_MSG" >/dev/null 2>&1; sed -i '' 's/$/\r/' "$ST/FROZEN"; L1V=$(sed -n 1p "$ST/FROZEN" | cat -v)
wave_cli --freeze "$SOFT_MSG"; QB=$(qid_behind)
info "N1b body: $(qfield "$QB" body | cut -c1-200)"
check "N1b-1 CRLF file: class hard, behind-question asked (noop-only), deploy REFUSED naming the malformed line" $([ "$(cls_now)" = hard ] && [ -n "$QB" ] && [ "$(q_ops "$QB")" = noop ] && _contains "$(deploy_gate)" "REFUSED: hard freeze" && _contains "$(deploy_gate)" "$MAL"; echo $?) "$(cls_now) $QB $(deploy_gate)"
check "N1b-2 the body says 'HARD stop is in force: ${MAL}…' quoting the CRLF hard line (APPLY failed), NOT the soft hold" $(_contains "$(qfield "$QB" body)" "HARD stop is in force: ${MAL}$(date '+%F')" && _contains "$(qfield "$QB" body)" "APPLY failed" && ! _contains "$(qfield "$QB" body)" "HARD stop is in force: $SOFT_MSG"; echo $?) "$(qfield "$QB" body | cut -c1-220)"
check "N1b-3 the receipt says 'unresolved: ${MAL}…' (once), not the soft message" $([ "$(grep -c "unresolved: $MAL" "$C/say.txt")" -eq 1 ] && ! grep -q "unresolved: $SOFT_MSG" "$C/say.txt"; echo $?) "$(grep 'soft line added' "$C/say.txt" | cut -c1-240)"
check "N1b-4 the malformed line was NOT repaired: line 1 byte-identical (still ends in ^M), line 2 = the LF soft line, 2 lines" $([ "$(sed -n 1p "$ST/FROZEN" | cat -v)" = "$L1V" ] && _contains "$L1V" '^M' && [ "$(nlines)" -eq 2 ] && [ "$(sed -n 2p "$ST/FROZEN" | cut -f3)" = soft ]; echo $?) "$(cat -v "$ST/FROZEN")"
check "N1b-5 freeze_line_now returns the malformed line 1, never the soft line" $([ "$(wave_fn freeze_line_now | cat -v)" = "$L1V" ]; echo $?) "$(wave_fn freeze_line_now | cat -v)"
newcase n7b
printf '%s\tmigration 1: APPLY failed\trelation exists\thard\tmigration\n' "$(date '+%F %T')" > "$ST/FROZEN"; L1=$(sed -n 1p "$ST/FROZEN")
wave_cli --freeze "$SOFT_MSG"; QB=$(qid_behind)
info "N7b body: $(qfield "$QB" body | cut -c1-200)"
check "N7b-1 tab-shifted hard line: class hard, behind-question noop-only, deploy REFUSED" $([ "$(cls_now)" = hard ] && [ -n "$QB" ] && [ "$(q_ops "$QB")" = noop ] && _contains "$(deploy_gate)" "REFUSED: hard freeze"; echo $?) "$(cls_now) $QB $(deploy_gate)"
check "N7b-2 the body quotes the shifted line flattened ('migration 1: APPLY failed relation exists hard migration'), not the soft hold" $(_contains "$(qfield "$QB" body)" "HARD stop is in force: ${MAL}" && _contains "$(qfield "$QB" body)" "migration 1: APPLY failed relation exists hard migration" && ! _contains "$(qfield "$QB" body)" "HARD stop is in force: $SOFT_MSG"; echo $?) "$(qfield "$QB" body | cut -c1-220)"
check "N7b-3 the receipt too: 'unresolved: ${MAL}…migration 1: APPLY failed relation exists'" $(grep -q "unresolved: ${MAL}.*migration 1: APPLY failed relation exists" "$C/say.txt" && ! grep -q "unresolved: $SOFT_MSG" "$C/say.txt"; echo $?) "$(grep 'soft line added' "$C/say.txt" | cut -c1-240)"
check "N7b-4 line 1 untouched (5 fields, the TAB still in the message), 2 lines" $([ "$(sed -n 1p "$ST/FROZEN")" = "$L1" ] && [ "$(nlines)" -eq 2 ]; echo $?) "$(cat -v "$ST/FROZEN")"
check "N7b-5 the question file is valid UTF-8 and lists as pending on A's desk" $(python3 -c 'import sys;open(sys.argv[1],"rb").read().decode("utf-8")' "$ST/questions/$QB.json" 2>/dev/null && env -i PATH="$PLAIN_PATH" HOME="$HM" STATE="$ST" SHIP_WAVE_DIR="$TMP" /opt/homebrew/bin/bash "$DESK" pending 2>/dev/null | grep -q "$QB"; echo $?) "$(env -i PATH="$PLAIN_PATH" HOME="$HM" STATE="$ST" SHIP_WAVE_DIR="$TMP" /opt/homebrew/bin/bash "$DESK" pending 2>&1 | head -3)"
# control: a WELL-FORMED hard line behind the soft one is still quoted by its message (no 'malformed' wording)
newcase n7c; wave_fn freeze "$HARD_MSG" >/dev/null 2>&1; wave_cli --freeze "$SOFT_MSG"; QB=$(qid_behind)
check "N7b-6 (control) well-formed hard line: body 'HARD stop is in force: $HARD_MSG', no 'malformed' wording anywhere" $(_contains "$(qfield "$QB" body)" "HARD stop is in force: $HARD_MSG" && ! _contains "$(qfield "$QB" body)" "malformed" && ! grep -q malformed "$C/say.txt"; echo $?) "$(qfield "$QB" body | cut -c1-200)"

echo "══ SAFETY. the live state was never touched ══"
check "S1 live ~/.config/obsidian/.ship-wave/FROZEN was not created by this run" $([ ! -e "$HOME/.config/obsidian/.ship-wave/FROZEN" ] || [ "$(stat -f %m "$HOME/.config/obsidian/.ship-wave/FROZEN")" -lt "$(stat -f %m "$TMP")" ]; echo $?) "live FROZEN mtime newer than this run"

echo "=== $PASS passed · $FAIL failed · $SKIP skipped · fixtures in $TMP ==="
[ "$FAIL" -eq 0 ]

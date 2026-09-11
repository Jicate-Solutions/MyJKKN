#!/opt/homebrew/bin/bash
# tests/verify-freeze-classes-adversarial-v6.sh — SIXTH adversarial pass on slice B's freeze() (hitl-freeze-classes
# @ 85a24d4071) against slice A's REAL desk (hitl-desk @ ea0c188879). Fresh verifier; not the author of round 6.
#   R*  re-attempts of the round-5 open items with the same inputs: H11 B-half, X1, X2 — END-TO-END through the real desk
#   N*  new hunts: CRLF FROZEN · 5 hard + 3 soft · soft raised twice · --freeze while FROZEN is a symlink (/dev/null,
#       regular file, dangling, directory) · C locale via env -i on the WAVE side · a hard line with a TAB in it ·
#       the desk answering the hard line's own question while a soft exists · FREEZE var restored after the .none call ·
#       forged field 5 · blank line in FROZEN · empty --freeze message
# PROPERTY under test: no tap can remove or downgrade a HARD stop it was not asked about, and freeze() can never
# SILENTLY fail to record one.
# Run from the worktree root:  bash scripts/ship-wave/tests/verify-freeze-classes-adversarial-v6.sh
# Every case under a fresh temp HOME ($STATE is HOME-derived in ship-wave.sh); the live state is never touched.
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"

ROOT=$(cd "$(dirname "$0")/../../.." && pwd); SW="$ROOT/scripts/ship-wave"
DESK_SW="${DESK_SW:-/Users/omm/PROJECTS/MyJKKN/.worktrees/hitl-desk/scripts/ship-wave}"
[ -f "$SW/desk-questions.sh" ] && DESK_SW="$SW"
[ -f "$DESK_SW/desk-questions.sh" ] || { echo "no desk at $DESK_SW"; exit 2; }
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-freeze-v6.XXXXXX")
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf 'FAIL  %s\n      %s\n' "$1" "${2:-}"; }
check() { if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1" "$3"; fi; }
info() { printf 'INFO  %s\n' "$*"; }
_contains() { case "$1" in *"$2"*) return 0;; *) return 1;; esac; }

echo "INFO  B ship-wave.sh @ $(git -C "$ROOT" rev-parse --short HEAD) · desk @ $(git -C "$(dirname "$DESK_SW")" rev-parse --short HEAD 2>/dev/null || echo '?') ($DESK_SW)"
awk '/^if \[ -n "\$GOAL" \]; then$/ {exit} {print}' "$SW/ship-wave.sh" > "$TMP/ship-wave.sh"
for f in "$SW"/*.sh "$SW"/*.py; do [ "$(basename "$f")" = ship-wave.sh ] || ln -s "$f" "$TMP/$(basename "$f")"; done
[ -e "$TMP/desk-questions.sh" ] || ln -s "$DESK_SW/desk-questions.sh" "$TMP/desk-questions.sh"
DESK="$DESK_SW/desk/v5-w12-desk.sh"
PLAIN_PATH="/opt/homebrew/bin:/usr/bin:/bin"

newcase() { C="$TMP/$1"; HM="$C/home"; ST="$HM/.config/obsidian/.ship-wave"; mkdir -p "$ST"; : > "$C/say.txt"; }
# the launchd shape for the WAVE side too: env -i, PATH+HOME only, C locale, /opt/homebrew/bin/bash (the fleet wrapper
# does `exec bash …` with /opt/homebrew/bin first in PATH). Runs the truncated copy as a SCRIPT (exits at the --freeze line).
wave_cli() { ( cd "$ROOT"; env -i PATH="$PLAIN_PATH" HOME="$HM" /opt/homebrew/bin/bash "$TMP/ship-wave.sh" "$@" ) >> "$C/say.txt" 2>&1; CLI_RC=$?; }
wave_fn() { ( a=("$@"); export HOME="$HM"; cd "$ROOT"; set -- go; . "$TMP/ship-wave.sh" >/dev/null 2>&1; "${a[@]}" ); }
cls_now() { wave_fn freeze_class_now 2>/dev/null; echo; }
deploy_gate() { ( export HOME="$HM"; cd "$ROOT"; set -- go; . "$TMP/ship-wave.sh" >/dev/null 2>&1; if deploy_allowed; then echo "ALLOWED"; else echo "REFUSED: $DEPLOY_BLOCK"; fi ); }
# what a run's start sees (ship-wave.sh:632 refresh_freeze_state): frozen?/class/hard from the -f test + class reader
run_view() { ( export HOME="$HM"; cd "$ROOT"; set -- go; . "$TMP/ship-wave.sh" >/dev/null 2>&1; frozen=""; freeze_class=""; hard=""; if [ -f "$FREEZE" ]; then frozen=1; freeze_class=$(freeze_class_now); [ "$freeze_class" = hard ] && hard=1; fi; echo "frozen=${frozen:-0} class=${freeze_class:-none} hard=${hard:-0}" ); }
qlist() { python3 - "$ST/questions" <<'PY'
import json,glob,os,sys
for f in sorted(glob.glob(os.path.join(sys.argv[1],"q-*.json")), key=lambda p: json.load(open(p))["asked_at"]):
    q=json.load(open(f)); print(q["id"]+"\t"+q["title"]+"\t"+str(q.get("frozen_line")))
PY
}
qcount() { qlist 2>/dev/null | grep -c . ; }
qid_by_title() { qlist | awk -F'\t' -v pat="$1" '$2 ~ pat {print $1}' | tail -1; }
qid_soft() { qid_by_title 'paused on one item'; }
qid_hard() { qid_by_title 'stopped: production'; }
qid_behind() { qid_by_title 'HARD stop is already in force'; }
qfield() { python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get(sys.argv[2]))' "$ST/questions/$1.json" "$2"; }
qjson() { python3 -c 'import json,sys;print(json.dumps(json.load(open(sys.argv[1]))))' "$ST/questions/$1.json"; }
q_ops() { python3 -c 'import json,sys;q=json.load(open(sys.argv[1]));print(" ".join(sorted({w["op"] for o in q["options"] for w in o["writes"]})))' "$ST/questions/$1.json"; }
q_nopts() { python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))["options"]))' "$ST/questions/$1.json"; }
q_valid_utf8() { python3 -c 'import sys;open(sys.argv[1],"rb").read().decode("utf-8")' "$ST/questions/$1.json" 2>/dev/null; }
q_sha_in_lift() { python3 -c 'import json,sys;q=json.load(open(sys.argv[1]));print(" ".join(w.get("line_sha1","") for o in q["options"] for w in o["writes"] if w["op"]=="unfreeze"))' "$ST/questions/$1.json"; }
lift_idx() { python3 -c 'import json,sys;q=json.load(open(sys.argv[1]));l=[i for i,o in enumerate(q["options"]) if any(w["op"]=="unfreeze" for w in o["writes"])];print(l[0] if l else -1)' "$ST/questions/$1.json"; }
tap() { local id="$1" idx="$2"; ANS=$(env -i PATH="$PLAIN_PATH" HOME="$HM" STATE="$ST" SHIP_WAVE_DIR="$TMP" /opt/homebrew/bin/bash "$DESK" answer "$id" "$idx" 2>&1); RC=$?; }
tap_lift() { tap "$1" "$(lift_idx "$1")"; }
hard_lines() { [ -f "$ST/FROZEN" ] && awk -F'\t' 'NF>=3 && NF<=5 && $3=="hard"' "$ST/FROZEN" | wc -l | tr -d ' ' || echo 0; }
soft_lines() { [ -f "$ST/FROZEN" ] && awk -F'\t' 'NF>=3 && NF<=5 && $3=="soft"' "$ST/FROZEN" | wc -l | tr -d ' ' || echo 0; }
nlines() { [ -f "$ST/FROZEN" ] && grep -c '' "$ST/FROZEN" || echo 0; }
sha1_of() { printf '%s' "$1" | shasum -a 1 | cut -c1-40; }
HARD_MSG="migration 20260906213000: APPLY failed — relation exists"
DESTR_MSG="migration 20260910030000: destructive statement in 20260910030000_cron_run_log — a human applies this one after review"
SOFT_MSG="peer hold on #3410 — Director asked to wait"

echo "══ R1. H11 (B half) RE-ATTEMPT, launchd shape on both sides: hard via the wave, soft --freeze under env -i ══"
newcase r1
wave_fn freeze "$HARD_MSG" >/dev/null 2>&1
wave_cli --freeze "$SOFT_MSG"
info "R1 --freeze rc=$CLI_RC · $(grep -m1 '⛔' "$C/say.txt" | cut -c1-160)"
QB=$(qid_behind); QS=$(qid_soft); QH=$(qid_hard)
check "R1a --freeze soft behind hard under env -i: rc=0, receipt says 'soft line added, HARD stop still in force'" $([ "$CLI_RC" -eq 0 ] && grep -q 'soft line added, HARD stop still in force' "$C/say.txt"; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
check "R1b the question asked is the HARD-in-force one; no 'paused on one item' question exists" $([ -n "$QB" ] && [ -z "$QS" ]; echo $?) "$(qlist)"
check "R1c its file is valid UTF-8 (C locale did not byte-slice the body) and the desk lists it as pending" $(q_valid_utf8 "$QB" && env -i PATH="$PLAIN_PATH" HOME="$HM" STATE="$ST" SHIP_WAVE_DIR="$TMP" /opt/homebrew/bin/bash "$DESK" pending 2>/dev/null | grep -q "$QB"; echo $?) "$(env -i PATH="$PLAIN_PATH" HOME="$HM" STATE="$ST" SHIP_WAVE_DIR="$TMP" /opt/homebrew/bin/bash "$DESK" pending 2>&1 | head -3)"
check "R1d ops of the behind-question are noop only; frozen_line empty; 2 options" $([ "$(q_ops "$QB")" = noop ] && [ "$(qfield "$QB" frozen_line)" = "" ] && [ "$(q_nopts "$QB")" -eq 2 ]; echo $?) "$(qjson "$QB")"
before=$(cat "$ST/FROZEN"); n=$(q_nopts "$QB"); i=0
while [ "$i" -lt "$n" ]; do
  tap "$QB" "$i"; info "R1 tap behind option $i: rc=$RC · $(printf '%s' "$ANS" | tr '\n' ' ' | cut -c1-110)"
  check "R1e.$i tap option $i via the real desk: FROZEN byte-identical, class hard, deploy REFUSED" $([ "$(cat "$ST/FROZEN")" = "$before" ] && [ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "REFUSED: hard freeze"; echo $?) "$(cat "$ST/FROZEN") // $(deploy_gate)"
  [ "$((i+1))" -lt "$n" ] && wave_cli --freeze "$SOFT_MSG" && QB=$(qid_behind) && before=$(cat "$ST/FROZEN")
  i=$((i+1))
done
# N9 — the desk answers the HARD line's own question while the soft line exists
tap_lift "$QH"; info "R1 hard question's own Lift: rc=$RC · $(printf '%s' "$ANS" | tr '\n' ' ' | cut -c1-120)"
# (the option loop re-raised the soft hold once per option, so 2 soft lines are on file here)
check "R1f the hard question's own Lift lifts the hard line only: hard=0, the soft lines stay, class soft, deploy ALLOWED" $([ "$RC" -eq 0 ] && [ "$(hard_lines)" -eq 0 ] && [ "$(soft_lines)" -ge 1 ] && [ "$(nlines)" -eq "$(soft_lines)" ] && [ "$(cls_now)" = soft ] && [ "$(deploy_gate)" = ALLOWED ]; echo $?) "$(cat "$ST/FROZEN") $(cls_now) $(deploy_gate)"
# liveness after that: is there ANY open question that can lift the remaining soft hold from the phone?
LIFTABLE=$(for q in $(qlist | cut -f1); do [ "$(lift_idx "$q")" -ge 0 ] && echo "$q"; done)
info "R1 open questions after the hard Lift: $(qcount) · with an unfreeze op: ${LIFTABLE:-none}"
check "R1g (LIVENESS, informational) the soft hold that landed behind the hard stop has a phone path to be lifted after the hard stop goes" $([ -n "$LIFTABLE" ]; echo $?) "no open question carries unfreeze — the soft line ($(cut -f2 "$ST/FROZEN")) stays until a terminal --unfreeze"

echo "══ R2. X1 RE-ATTEMPT under env -i: FROZEN chmod 444 → fatal, nothing claimed, no question, hard question untouched ══"
newcase r2
wave_fn freeze "$HARD_MSG" >/dev/null 2>&1; QH=$(qid_hard); QH_BEFORE=$(qjson "$QH"); QN0=$(qcount)
chmod 444 "$ST/FROZEN"; wave_cli --freeze "$SOFT_MSG"; chmod 644 "$ST/FROZEN"
info "R2 rc=$CLI_RC · $(tr '\n' '|' < "$C/say.txt" | cut -c1-200)"
check "R2a rc=5, '⛔ could not write FROZEN (Permission denied…)', no 'soft line added', no bash line noise" $([ "$CLI_RC" -eq 5 ] && grep -q '⛔ could not write FROZEN (.*Permission denied' "$C/say.txt" && ! grep -q 'soft line added' "$C/say.txt" && ! grep -q 'line [0-9]*:' "$C/say.txt"; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
check "R2b FROZEN still exactly 1 hard line; question count unchanged; the hard question's file byte-identical (not refreshed)" $([ "$(nlines)" -eq 1 ] && [ "$(hard_lines)" -eq 1 ] && [ "$(qcount)" -eq "$QN0" ] && [ "$(qjson "$QH")" = "$QH_BEFORE" ]; echo $?) "$(qlist)"
# unwritable dir, no FROZEN yet, under env -i
newcase r2d; chmod 555 "$ST"; wave_cli --freeze "$HARD_MSG"; chmod 755 "$ST"
check "R2c unwritable state dir, first freeze: rc=5, ⛔ line, no FROZEN, no question" $([ "$CLI_RC" -eq 5 ] && grep -q '⛔ could not write FROZEN' "$C/say.txt" && [ ! -e "$ST/FROZEN" ] && [ "$(qcount)" -eq 0 ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"

echo "══ R3. X2 RE-ATTEMPT: same second, 430-char shared prefix, soft first then hard → the soft tap lifts only its line ══"
PREFIX=$(printf 'x%.0s' $(seq 1 430)); S_MSG="$PREFIX peer hold on #3410"; H_MSG="$PREFIX APPLY failed"
try=0
while :; do
  try=$((try+1)); newcase "r3-$try"
  sleep "$(python3 -c 'import time;print(round(1-time.time()%1+0.02,3))')"
  ( export HOME="$HM"; cd "$ROOT"; set -- go; . "$TMP/ship-wave.sh" >/dev/null 2>&1; freeze "$S_MSG" >/dev/null 2>&1; freeze "$H_MSG" >/dev/null 2>&1 )
  T1=$(sed -n 1p "$ST/FROZEN" | cut -f1); T2=$(sed -n 2p "$ST/FROZEN" | cut -f1)
  [ "$T1" = "$T2" ] && break; [ "$try" -ge 4 ] && break
done
QS=$(qid_soft); QH=$(qid_hard)
check "R3a fixture: 2 lines same second (tries=$try); the soft question's frozen_line is the capped HARD line (tail -1) yet its op carries the SOFT sha" $([ "$T1" = "$T2" ] && [ "$(q_sha_in_lift "$QS")" = "$(sed -n 1p "$ST/FROZEN" | cut -f5)" ]; echo $?) "$(qlist)"
tap_lift "$QS"
check "R3b soft Lift: rc=0, hard=1 soft=0, class hard, deploy REFUSED" $([ "$RC" -eq 0 ] && [ "$(hard_lines)" -eq 1 ] && [ "$(soft_lines)" -eq 0 ] && [ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "REFUSED: hard freeze"; echo $?) "rc=$RC $ANS $(cat "$ST/FROZEN")"

echo "══ N1. CRLF FROZEN: the whole file rewritten with CRLF after the wave wrote it, then soft --freeze ══"
newcase n1
wave_fn freeze "$HARD_MSG" >/dev/null 2>&1; QH=$(qid_hard); SHA_H=$(cut -f5 "$ST/FROZEN")
sed -i '' 's/$/\r/' "$ST/FROZEN"
wave_cli --freeze "$SOFT_MSG"
QB=$(qid_behind)
check "N1a class in force hard (CR in field 5 → 41 chars → fail-safe hard); behind-question asked; deploy REFUSED" $([ "$(cls_now)" = hard ] && [ -n "$QB" ] && _contains "$(deploy_gate)" "REFUSED"; echo $?) "$(cls_now) $QB $(deploy_gate)"
info "N1 receipt: $(grep -m1 'soft line added' "$C/say.txt" | cut -c1-200)"
info "N1 behind body: $(qfield "$QB" body | cut -c1-160)"
check "N1b (HONESTY) the receipt and the behind-question name the HARD line's message, not the soft one's (freeze_line_now on a malformed-but-hard file)" $(_contains "$(qfield "$QB" body)" "HARD stop is in force: $HARD_MSG" && grep -q "unresolved: $HARD_MSG" "$C/say.txt"; echo $?) "body: $(qfield "$QB" body | cut -c1-120) // receipt: $(grep -m1 'soft line added' "$C/say.txt" | cut -c1-200)"
tap "$QB" 0; check "N1c Keep-it-stopped tap: FROZEN unchanged (CRLF hard + LF soft), still hard" $([ "$(nlines)" -eq 2 ] && [ "$(cls_now)" = hard ]; echo $?) "$(cat -v "$ST/FROZEN")"
tap_lift "$QH"; info "N1 hard Lift on the CRLF line: rc=$RC · $(printf '%s' "$ANS" | tr '\n' ' ' | cut -c1-120)"
check "N1d the hard question's own Lift finds its line through the CR (tr -d) and lifts it; soft stays; class soft" $([ "$RC" -eq 0 ] && [ "$(hard_lines)" -eq 0 ] && [ "$(nlines)" -eq 1 ] && [ "$(cls_now)" = soft ]; echo $?) "rc=$RC $ANS $(cat -v "$ST/FROZEN")"

echo "══ N2. 5 hard (distinct classes) + 3 soft lines, mixed order; soft --freeze last ══"
newcase n2
H1="$HARD_MSG"; H2="deploy dpl_1 → ERROR; on main but NOT live: #1"; H3="broken page after deploy: 2 page×role load(s) returned 5xx"; H4="post-deploy sweep failed — L2: /x L1: none"; H5="migration 20260907000000: history insert failed"
( export HOME="$HM"; cd "$ROOT"; set -- go; . "$TMP/ship-wave.sh" >/dev/null 2>&1
  freeze "$H1"; freeze "peer hold on #1 — a"; freeze "$H2"; freeze "$H3"; freeze "Director hold on #2 — b"; freeze "$H4"; freeze "$H5"; freeze "peer hold on #3 — c" ) >/dev/null 2>&1
check "N2a 8 lines: hard=5 soft=3, class hard, deploy REFUSED" $([ "$(nlines)" -eq 8 ] && [ "$(hard_lines)" -eq 5 ] && [ "$(soft_lines)" -eq 3 ] && [ "$(cls_now)" = hard ]; echo $?) "$(cut -f2,3 "$ST/FROZEN")"
NH=$(qlist | grep -c 'stopped: production'); NB=$(qlist | grep -c 'HARD stop is already'); NS=$(qlist | grep -c 'paused on one item')
info "N2 questions: hard=$NH behind=$NB soft=$NS (behind de-dups by ledger_class of the soft msg)"
check "N2b every hard line has its own question (5); no soft line got a 'paused; safe merges continue' question" $([ "$NH" -eq 5 ] && [ "$NS" -eq 0 ] && [ "$NB" -ge 1 ]; echo $?) "$(qlist)"
QB=$(qid_behind); check "N2c the behind-question names the LAST hard line (freeze_line_now = last hard)" $(_contains "$(qfield "$QB" body)" "HARD stop is in force: $H5"; echo $?) "$(qfield "$QB" body | cut -c1-200)"
for q in $(qlist | awk -F'\t' '$2 ~ /stopped: production/ {print $1}'); do tap_lift "$q"; [ "$RC" -eq 0 ] || info "N2 hard Lift $q rc=$RC $ANS"; done
check "N2d lifting all 5 hard questions in turn: hard=0, soft=3 remain, class soft, deploy ALLOWED" $([ "$(hard_lines)" -eq 0 ] && [ "$(soft_lines)" -eq 3 ] && [ "$(cls_now)" = soft ] && [ "$(deploy_gate)" = ALLOWED ]; echo $?) "$(cut -f2,3 "$ST/FROZEN") $(cls_now) $(deploy_gate)"
LIFTABLE=$(for q in $(qlist | cut -f1); do [ "$(lift_idx "$q")" -ge 0 ] && echo "$q"; done)
check "N2e (LIVENESS, informational) some open question can lift the 3 remaining soft holds from the phone" $([ -n "$LIFTABLE" ]; echo $?) "open: $(qcount) question(s), none with unfreeze — 3 soft holds need a terminal --unfreeze"
tap "$QB" 0; check "N2f the stale behind-question (title still says HARD in force) is a noop on tap; FROZEN unchanged" $([ "$RC" -eq 0 ] && [ "$(nlines)" -eq 3 ]; echo $?) "rc=$RC $ANS"

echo "══ N3. 5 hard lines of the SAME ledger_class → one question refreshed; its Lift lifts ONE line ══"
newcase n3
( export HOME="$HM"; cd "$ROOT"; set -- go; . "$TMP/ship-wave.sh" >/dev/null 2>&1; for i in 1 2 3 4 5; do freeze "migration 2026090621300$i: APPLY failed — relation exists"; done ) >/dev/null 2>&1
QH=$(qid_hard); info "N3 questions open: $(qcount) · asked_times=$(qfield "$QH" asked_times) · lift sha=$(q_sha_in_lift "$QH") · last line sha=$(tail -1 "$ST/FROZEN" | cut -f5)"
check "N3a 5 hard lines, ONE hard question (refreshed), its unfreeze op carries the LAST line's sha" $([ "$(hard_lines)" -eq 5 ] && [ "$(qcount)" -eq 1 ] && [ "$(q_sha_in_lift "$QH")" = "$(tail -1 "$ST/FROZEN" | cut -f5)" ]; echo $?) "$(qlist) $(cut -f5 "$ST/FROZEN")"
tap_lift "$QH"
check "N3b the tap lifts exactly 1 hard line; 4 hard remain; class hard; deploy REFUSED (no downgrade)" $([ "$RC" -eq 0 ] && [ "$(hard_lines)" -eq 4 ] && [ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "REFUSED"; echo $?) "rc=$RC $ANS $(cut -f2 "$ST/FROZEN")"
check "N3c (LIVENESS, informational) an open question remains for the 4 hard lines still in force" $([ "$(qcount)" -ge 1 ]; echo $?) "0 open questions; 4 hard lines: the phone has nothing to tap — terminal --unfreeze only"

echo "══ N4. soft raised twice (different seconds, no hard) → refreshed question; Lift lifts the LAST line only ══"
newcase n4
wave_fn freeze "$SOFT_MSG" >/dev/null 2>&1; sleep 1.1; wave_fn freeze "$SOFT_MSG" >/dev/null 2>&1
QS=$(qid_soft); check "N4a 2 soft lines, 1 question asked_times=2, op sha = line 2's sha" $([ "$(soft_lines)" -eq 2 ] && [ "$(qcount)" -eq 1 ] && [ "$(qfield "$QS" asked_times)" = 2 ] && [ "$(q_sha_in_lift "$QS")" = "$(sed -n 2p "$ST/FROZEN" | cut -f5)" ]; echo $?) "$(qlist)"
tap_lift "$QS"
check "N4b Lift lifted 1; 1 soft line stays; class soft (never hard from a soft-only file)" $([ "$RC" -eq 0 ] && [ "$(soft_lines)" -eq 1 ] && [ "$(cls_now)" = soft ]; echo $?) "rc=$RC $ANS"
check "N4c (LIVENESS, informational) the earlier identical soft hold still has an open question" $([ "$(qcount)" -ge 1 ]; echo $?) "0 open questions; 1 soft hold orphaned (HELD PRs held) until a terminal --unfreeze"

echo "══ N5. --freeze while FROZEN is a SYMLINK ══"
# 5a → /dev/null: the append 'succeeds', nothing is recorded, -f is false
newcase n5a; ln -s /dev/null "$ST/FROZEN"
wave_cli --freeze "$HARD_MSG"
info "N5a rc=$CLI_RC · $(grep -m1 '⛔' "$C/say.txt" | cut -c1-120) · run view: $(run_view) · deploy: $(deploy_gate)"
check "N5a-1 (PROPERTY) a freeze that recorded nothing must not claim FROZEN: rc≠0 or a '⛔ could not write' line, and no question written" $( { [ "$CLI_RC" -ne 0 ] || grep -q 'could not write FROZEN' "$C/say.txt"; } && [ "$(qcount)" -eq 0 ]; echo $?) "rc=$CLI_RC · receipt claims: $(grep -m1 '⛔' "$C/say.txt" | cut -c1-100) · questions=$(qcount) · $(run_view) · $(deploy_gate)"
check "N5a-2 (PROPERTY) after the 'freeze' the run sees a freeze in force and the deploy gate refuses" $(_contains "$(run_view)" "frozen=1" && _contains "$(deploy_gate)" "REFUSED"; echo $?) "$(run_view) · $(deploy_gate)"
# 5b → a regular file elsewhere (writable): recorded through the link; the desk's mv replaces the link
newcase n5b; mkdir -p "$C/else"; : > "$C/else/F"; ln -s "$C/else/F" "$ST/FROZEN"
wave_cli --freeze "$HARD_MSG"; QH=$(qid_hard)
check "N5b-1 recorded through the symlink: 1 hard line, class hard, question asked" $([ "$CLI_RC" -eq 0 ] && [ "$(hard_lines)" -eq 1 ] && [ "$(cls_now)" = hard ] && [ -n "$QH" ]; echo $?) "rc=$CLI_RC $(cat "$C/else/F")"
wave_cli --freeze "$SOFT_MSG"; tap_lift "$QH"
check "N5b-2 hard Lift through the symlink: hard gone, soft stays, what the wave READS at \$STATE/FROZEN is consistent (class soft)" $([ "$RC" -eq 0 ] && [ "$(hard_lines)" -eq 0 ] && [ "$(soft_lines)" -eq 1 ] && [ "$(cls_now)" = soft ]; echo $?) "rc=$RC $ANS · $(ls -l "$ST/FROZEN" | cut -c1-60) · target: $(cat "$C/else/F")"
# 5c → dangling into a missing dir: the append cannot create the target
newcase n5c; ln -s "$C/nope/F" "$ST/FROZEN"
wave_cli --freeze "$HARD_MSG"
check "N5c dangling symlink into a missing dir: rc=5, ⛔ could not write, no question" $([ "$CLI_RC" -eq 5 ] && grep -q 'could not write FROZEN' "$C/say.txt" && [ "$(qcount)" -eq 0 ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
# 5d → a directory
newcase n5d; mkdir "$ST/FROZEN"
wave_cli --freeze "$HARD_MSG"
check "N5d FROZEN is a directory: rc=5, ⛔ could not write (Is a directory), no question" $([ "$CLI_RC" -eq 5 ] && grep -q 'could not write FROZEN (.*Is a directory' "$C/say.txt" && [ "$(qcount)" -eq 0 ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
info "N5d run view with a directory at FROZEN: $(run_view) · deploy: $(deploy_gate) (fail-safe reading is hard, but -f gates the run's frozen flag)"

echo "══ N6. C locale on the WAVE side: a multibyte char straddling the body's slice points (160 for the HARD msg in the behind body, 220 in the normal body) ══"
newcase n6
HM160="APPLY failed $(printf 'x%.0s' $(seq 1 145))—relation exists"      # '—' occupies chars 158..158 (bytes 158..160)
wave_fn freeze "$HM160" >/dev/null 2>&1; QH=$(qid_hard)
wave_cli --freeze "$SOFT_MSG"; QB=$(qid_behind)
check "N6a behind-question written under env -i (C locale) and its file is valid UTF-8" $([ -n "$QB" ] && q_valid_utf8 "$QB"; echo $?) "$(cat "$C/say.txt" | tail -3)"
M220="deploy dpl_abc → ERROR$(printf 'x%.0s' $(seq 1 196))—on main but NOT live: #1"
newcase n6b; wave_cli --freeze "$M220"; QH=$(qid_hard)
check "N6b normal hard question under env -i with a multibyte char at the 220 boundary: written, valid UTF-8" $([ -n "$QH" ] && q_valid_utf8 "$QH"; echo $?) "$(cat "$C/say.txt" | tail -3)"
# what /bin/bash 3.2 would do with the same slice (the shebang is #!/bin/bash; the fleet wrapper runs `exec bash` = homebrew)
B32=$(env -i PATH=/usr/bin:/bin HOME="$HM" /bin/bash -c 'm="$1"; s="${m:0:160}"; printf "%s" "$s" | python3 -c "import sys; sys.stdin.buffer.read().decode(\"utf-8\")" 2>/dev/null && echo VALID || echo INVALID' _ "$HM160")
info "N6c /bin/bash 3.2 byte-slices the same message: $B32 (informational: ship-wave.sh has no BASH_VERSINFO re-exec guard; the launchd wrapper's 'exec bash' resolves to /opt/homebrew/bin/bash via PATH)"

echo "══ N7. a hand-written HARD line with a TAB in its message (columns shifted right), then soft --freeze ══"
newcase n7
printf '%s\tmigration 1: APPLY failed\trelation exists\thard\tmigration\n' "$(date '+%F %T')" > "$ST/FROZEN"
wave_cli --freeze "$SOFT_MSG"; QB=$(qid_behind)
check "N7a shifted line reads hard; soft landed behind; behind-question asked; deploy REFUSED" $([ "$(cls_now)" = hard ] && [ -n "$QB" ] && _contains "$(deploy_gate)" "REFUSED"; echo $?) "$(cls_now) $QB"
info "N7 behind body: $(qfield "$QB" body | cut -c1-150)"
check "N7b (HONESTY) the behind-question names the shifted hard line's text, not the soft hold, as the stop in force" $(_contains "$(qfield "$QB" body)" "HARD stop is in force: migration 1: APPLY failed"; echo $?) "$(qfield "$QB" body | cut -c1-160)"
tap "$QB" 0; tap "$QB" 1 2>/dev/null
check "N7c taps on it leave both lines; class hard" $([ "$(nlines)" -eq 2 ] && [ "$(cls_now)" = hard ]; echo $?) "$(cat "$ST/FROZEN")"

echo "══ N8. the FREEZE variable is restored after the FREEZE=\$FREEZE.none call; a leftover FROZEN.none file changes nothing that matters ══"
newcase n8
wave_fn freeze "$HARD_MSG" >/dev/null 2>&1
printf 'stale\tstale line\thard\tstale\n' > "$ST/FROZEN.none"
out=$( ( export HOME="$HM"; cd "$ROOT"; set -- go; . "$TMP/ship-wave.sh" >/dev/null 2>&1; freeze "$SOFT_MSG" >/dev/null 2>&1; echo "FREEZE=$FREEZE"; [ -f "$FREEZE" ] && echo "lines=$(grep -c '' "$FREEZE")" ) )
QB=$(qid_behind)
check "N8a after freeze() the shell's FREEZE is \$STATE/FROZEN again (2 lines), not FROZEN.none" $(_contains "$out" "FREEZE=$ST/FROZEN" && _contains "$out" "lines=2" && ! _contains "$out" ".none"; echo $?) "$out"
info "N8 behind frozen_line with a stale FROZEN.none present: '$(qfield "$QB" frozen_line)' · ops: $(q_ops "$QB")"
check "N8b even with a stale FROZEN.none the behind-question carries no unfreeze op (nothing to lift)" $([ "$(q_ops "$QB")" = noop ]; echo $?) "$(qjson "$QB")"

echo "══ N9. soft question open (with Lift) → hard lands after → the soft tap lifts only the soft line ══"
newcase n9
wave_fn freeze "$SOFT_MSG" >/dev/null 2>&1; QS=$(qid_soft); wave_fn freeze "$HARD_MSG" >/dev/null 2>&1
tap_lift "$QS"
check "N9a soft Lift with a hard line landed after: soft gone, hard stays, class hard, deploy REFUSED" $([ "$RC" -eq 0 ] && [ "$(soft_lines)" -eq 0 ] && [ "$(hard_lines)" -eq 1 ] && [ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "REFUSED"; echo $?) "rc=$RC $ANS"

echo "══ N10. forged field 5 (needs write access to FROZEN — documents the trust boundary, not a tap-only break) ══"
newcase n10
wave_fn freeze "$SOFT_MSG" >/dev/null 2>&1; QS=$(qid_soft); SHA_S=$(cut -f5 "$ST/FROZEN")
printf '%s\t%s\thard\tapply failed\t%s\n' "$(date '+%F %T')" "$HARD_MSG" "$SHA_S" >> "$ST/FROZEN"
tap_lift "$QS"
info "N10 soft Lift with a hand-written hard line carrying the soft line's sha: rc=$RC · $(printf '%s' "$ANS" | tr '\n' ' ' | cut -c1-100) · hard left=$(hard_lines)"
check "N10 (informational) a hand-forged sha on a hard line is NOT lifted by the soft question's tap" $([ "$(hard_lines)" -eq 1 ]; echo $?) "the desk matches field 5 alone (not class); anyone who can forge FROZEN can also rm it — not a phone-tap exposure"

echo "══ N11. a blank line in FROZEN (hand edit) ══"
newcase n11
wave_fn freeze "$HARD_MSG" >/dev/null 2>&1; QH=$(qid_hard); printf '\n' >> "$ST/FROZEN"
check "N11a blank line: class hard (fail-safe)" $([ "$(cls_now)" = hard ]; echo $?) "$(cls_now)"
tap_lift "$QH"; info "N11 hard Lift with a blank line present: rc=$RC · $(printf '%s' "$ANS" | tr '\n' ' ' | cut -c1-120) · run view: $(run_view)"
check "N11b (informational) after lifting the only real hard line, the wave is not left stuck-hard on a blank line" $([ "$(cls_now)" != hard ] || [ ! -e "$ST/FROZEN" ]; echo $?) "FROZEN=$(cat -A "$ST/FROZEN" 2>/dev/null) class=$(cls_now): a blank line keeps the wave hard with no question — terminal --unfreeze only"

echo "══ N12. --freeze with an EMPTY message ══"
newcase n12; wave_cli --freeze ""
info "N12 rc=$CLI_RC · $(tr '\n' '|' < "$C/say.txt" | cut -c1-160) · lines=$(nlines) hard=$(hard_lines) q=$(qcount)"
check "N12 an empty --freeze either records a HARD line and asks, or records nothing and says so — never a silent no-op with rc=0" $( { [ "$(hard_lines)" -eq 1 ] && [ "$(qcount)" -eq 1 ]; } || { [ "$CLI_RC" -ne 0 ] && [ "$(nlines)" -eq 0 ]; }; echo $?) "rc=$CLI_RC lines=$(nlines) q=$(qcount) $(cat "$C/say.txt")"

echo "══ SAFETY ══"
check "S1 live ~/.config/obsidian/.ship-wave/FROZEN was not created by this run" $([ ! -e "$HOME/.config/obsidian/.ship-wave/FROZEN" ] || [ "$(stat -f %m "$HOME/.config/obsidian/.ship-wave/FROZEN")" -lt "$(stat -f %m "$TMP")" ]; echo $?) "live FROZEN mtime newer than this run"

echo "=== $PASS passed · $FAIL failed · fixtures in $TMP ==="
[ "$FAIL" -eq 0 ]

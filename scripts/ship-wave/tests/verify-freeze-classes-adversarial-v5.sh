#!/opt/homebrew/bin/bash
# tests/verify-freeze-classes-adversarial-v5.sh — FIFTH pass, ONE hole: H11 (v3 E10 / v4 H11) re-run END-TO-END against
# slice A's REAL desk at 16e68344b3 ("a tap lifts one line, never a hard stop") with slice B's ship-wave.sh at dc52d6e5fe.
# Integration shape: B's ship-wave.sh (truncated before the goal loop) + B's siblings + A's desk-questions.sh symlinked into
# ONE dir — exactly what the integrated tree looks like — so `--freeze` goes through the REAL `ask_director`, and the tap
# is applied by A's REAL v5-w12-desk.sh (SHIP_WAVE_DIR = that same dir). Temp $STATE/$HOME everywhere; nothing live.
#
# Property under test: a HARD latch can never be removed by a tap that was not asked about that hard line.
#   H11   hard via freeze() → soft via --freeze → tap "Lift the stop" on the SOFT question → hard line still there,
#         freeze_class_now=hard, deploy_allowed refused.
#   V1    CRLF: (a) the hard line has CRLF endings; (b) a hand-written CRLF soft line is what the question is about.
#   V2    TABs inside the soft message.
#   V3    two identical soft --freeze lines (different second; and byte-identical same-second by hand).
#   V4    the hard line is the LAST line (soft first): tap on the soft question keeps the hard; tap on the hard question lifts it.
#   V5    the question is about the hard line itself while a soft line exists: that tap lifts the hard (it was asked about it).
#   X1    FROZEN read-only: --freeze soft cannot append → the soft-titled question is written about the HARD line (hunt).
#   X2    400-char frozen_line cap collision: hard + soft lines sharing the first 400 flattened chars (same second, hand-written).
# Run from the worktree root:  bash scripts/ship-wave/tests/verify-freeze-classes-adversarial-v5.sh
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"
ROOT=$(cd "$(dirname "$0")/../../.." && pwd); SW="$ROOT/scripts/ship-wave"
DESK_SW="${DESK_SW:-/Users/omm/PROJECTS/MyJKKN/.worktrees/hitl-desk/scripts/ship-wave}"   # slice A's desk
[ -f "$SW/desk-questions.sh" ] && DESK_SW="$SW"   # after the integrator's rebase the desk lives here
[ -f "$DESK_SW/desk-questions.sh" ] || { echo "no desk at $DESK_SW"; exit 2; }
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-freeze-r5.XXXXXX")
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf 'FAIL  %s\n      %s\n' "$1" "${2:-}"; }
check() { if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1" "$3"; fi; }
info() { printf 'INFO  %s\n' "$*"; }
_starts() { case "$1" in "$2"*) return 0;; *) return 1;; esac; }
_contains() { case "$1" in *"$2"*) return 0;; *) return 1;; esac; }

echo "INFO  B ship-wave.sh @ $(git -C "$ROOT" rev-parse --short HEAD) · desk @ $(git -C "$(dirname "$DESK_SW")" rev-parse --short HEAD 2>/dev/null || echo '?') ($DESK_SW)"
# the integrated dir: B's wave (no goal loop) + B's siblings + A's desk-questions.sh
awk '/^if \[ -n "\$GOAL" \]; then$/ {exit} {print}' "$SW/ship-wave.sh" > "$TMP/ship-wave.sh"
for f in "$SW"/*.sh "$SW"/*.py; do [ "$(basename "$f")" = ship-wave.sh ] || ln -s "$f" "$TMP/$(basename "$f")"; done
[ -e "$TMP/desk-questions.sh" ] || ln -s "$DESK_SW/desk-questions.sh" "$TMP/desk-questions.sh"
DESK="$DESK_SW/desk/v5-w12-desk.sh"
PLAIN_PATH="/opt/homebrew/bin:/usr/bin:/bin"

# case dirs
# $STATE is HOME-derived inside ship-wave.sh ($HOME/.config/obsidian/.ship-wave) — the case's temp HOME IS the isolation
newcase() { C="$TMP/$1"; HM="$C/home"; ST="$HM/.config/obsidian/.ship-wave"; mkdir -p "$ST"; }
# wave_cli <args…> : run B's CLI (sourced, subshell) under the case's temp HOME/STATE, receipt → $C/say.txt (appended)
wave_cli() { ( export HOME="$HM"; cd "$ROOT"; set -- "$@"; . "$TMP/ship-wave.sh" ) >> "$C/say.txt" 2>&1; }
# wave_fn <fn> <args…> : source the wave as `go`, point every path at the case, then call one function; stdout kept
wave_fn() { ( a=("$@"); export HOME="$HM"; cd "$ROOT"; set -- go; . "$TMP/ship-wave.sh" >/dev/null 2>&1; "${a[@]}" ); }
cls_now() { wave_fn freeze_class_now 2>/dev/null; echo; }
deploy_gate() { ( export HOME="$HM"; cd "$ROOT"; set -- go; . "$TMP/ship-wave.sh" >/dev/null 2>&1; if deploy_allowed; then echo "ALLOWED"; else echo "REFUSED: $DEPLOY_BLOCK"; fi ); }
# questions: id<TAB>title<TAB>frozen_line for every OPEN freeze question, oldest first
qlist() { python3 - "$ST/questions" <<'PY'
import json,glob,os,sys
for f in sorted(glob.glob(os.path.join(sys.argv[1],"q-*.json")), key=lambda p: json.load(open(p))["asked_at"]):
    q=json.load(open(f)); print(q["id"]+"\t"+q["title"]+"\t"+str(q.get("frozen_line")))
PY
}
qid_soft() { qlist | awk -F'\t' '$2 ~ /paused on one item/ {print $1}' | tail -1; }
qid_hard() { qlist | awk -F'\t' '$2 ~ /stopped: production/ {print $1}' | tail -1; }
qfield() { python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get(sys.argv[2]))' "$ST/questions/$1.json" "$2"; }
lift_idx() { python3 -c 'import json,sys;q=json.load(open(sys.argv[1]));print([i for i,o in enumerate(q["options"]) if any(w["op"]=="unfreeze" for w in o["writes"])][0])' "$ST/questions/$1.json"; }
# the REAL desk, launchd-shaped environment (PATH+HOME only, C locale) + the two knobs tests may set
tap_lift() { local id="$1" idx; idx=$(lift_idx "$id"); ANS=$(env -i PATH="$PLAIN_PATH" HOME="$HM" STATE="$ST" SHIP_WAVE_DIR="$TMP" /opt/homebrew/bin/bash "$DESK" answer "$id" "$idx" 2>&1); RC=$?; }
hard_lines() { [ -f "$ST/FROZEN" ] && awk -F'\t' '(NF>=3&&NF<=5) && $3=="hard"' "$ST/FROZEN" | wc -l | tr -d ' ' || echo 0; }
soft_lines() { [ -f "$ST/FROZEN" ] && awk -F'\t' '(NF>=3&&NF<=5) && $3=="soft"' "$ST/FROZEN" | wc -l | tr -d ' ' || echo 0; }
nlines() { [ -f "$ST/FROZEN" ] && grep -c '' "$ST/FROZEN" || echo 0; }
HARD_MSG="migration 20260906213000: APPLY failed — relation exists"
SOFT_MSG="peer hold on #3410 — Director asked to wait"
expect_hard_holds() {  # $1 = label — after the tap: hard line present, class hard, deploy refused
  local c d; c=$(cls_now); d=$(deploy_gate)
  info "$1 after tap: FROZEN lines=$(nlines) hard=$(hard_lines) soft=$(soft_lines) · class=$c · deploy: $(printf '%s' "$d" | cut -c1-110) · desk rc=$RC: $(printf '%s' "$ANS" | tr '\n' ' ' | cut -c1-160)"
  check "$1 hard line still in FROZEN" $([ "$(hard_lines)" -ge 1 ] && [ -f "$ST/FROZEN" ]; echo $?) "FROZEN: $(cat "$ST/FROZEN" 2>/dev/null)"
  check "$1 class in force = hard" $([ "$c" = hard ]; echo $?) "class=$c"
  check "$1 deploy_allowed refuses (hard freeze)" $(_starts "$d" "REFUSED: hard freeze"; echo $?) "$d"
}

echo "══ H11. hard via freeze() → soft via --freeze → tap 'Lift the stop' on the SOFT question (REAL desk) ══"
newcase h11
wave_fn freeze "$HARD_MSG" > "$C/hard.txt" 2>&1
wave_cli --freeze "$SOFT_MSG"
info "H11 receipt (hard): $(head -1 "$C/hard.txt" | cut -c1-120)"
info "H11 receipt (soft): $(grep -m1 'FROZEN' "$C/say.txt" | cut -c1-160)"
info "H11 FROZEN before tap ($(nlines) lines): $(cut -f2,3 "$ST/FROZEN" | tr '\n' '|')"
QS=$(qid_soft); QH=$(qid_hard)
info "H11 soft question: $QS · title: $(qfield "$QS" title)"
info "H11 soft question frozen_line: $(qfield "$QS" frozen_line | cut -c1-140)"
info "H11 hard question: $QH · frozen_line: $(qfield "$QH" frozen_line | cut -c1-140)"
check "H11 the soft question is about the soft line (frozen_line names the soft class)" $(_contains "$(qfield "$QS" frozen_line)" " soft "; echo $?) "$(qfield "$QS" frozen_line)"
tap_lift "$QS"
expect_hard_holds "H11"
check "H11 the soft line itself was lifted (soft=0, 1 hard line left)" $([ "$(soft_lines)" -eq 0 ] && [ "$(nlines)" -eq 1 ]; echo $?) "$(cat "$ST/FROZEN")"
check "H11 desk receipt says a HARD stop is still in force" $(printf '%s' "$ANS" | grep -q 'HARD stop is still in force'; echo $?) "$ANS"
info "H11 ledger last record: $(tail -1 "$ST/failure-ledger.jsonl" 2>/dev/null | cut -c1-200)"
# the ORIGINAL hard question's Lift is no longer refused (round-3 noted it was) — and it lifts only the hard line
tap_lift "$QH"
info "H11b tap on the HARD question after the soft was lifted: rc=$RC · $(printf '%s' "$ANS" | tr '\n' ' ' | cut -c1-140) · FROZEN exists: $([ -e "$ST/FROZEN" ] && echo yes || echo no)"
check "H11b a tap asked about the hard line lifts it (file gone, rc=0)" $([ "$RC" -eq 0 ] && [ ! -e "$ST/FROZEN" ]; echo $?) "rc=$RC $ANS"

echo "══ V1a. CRLF: the HARD line has CRLF endings; soft --freeze on top; tap the soft question ══"
newcase v1a
wave_fn freeze "$HARD_MSG" >/dev/null 2>&1
printf '%s\r\n' "$(cat "$ST/FROZEN")" > "$ST/FROZEN.n"; mv "$ST/FROZEN.n" "$ST/FROZEN"
wave_cli --freeze "$SOFT_MSG"
info "V1a FROZEN bytes: $(od -c "$ST/FROZEN" | grep -c '\\r') CR(s) · lines=$(nlines) · class before tap=$(cls_now)"
QS=$(qid_soft); tap_lift "$QS"
expect_hard_holds "V1a"
check "V1a the CRLF hard line is intact (still ends in CR)" $(tail -c2 "$ST/FROZEN" | od -c | grep -q '\\r'; echo $?) "$(od -c "$ST/FROZEN" | tail -2)"

echo "══ V1b. CRLF: a hand-written CRLF SOFT line is what the question is about ══"
newcase v1b
wave_fn freeze "$HARD_MSG" >/dev/null 2>&1
printf '%s\t%s\tsoft\tpeer hold on pr director asked to wait\r\n' "$(date '+%F %T')" "$SOFT_MSG" >> "$ST/FROZEN"
# the wave re-asks about the last line (what a round does): call the REAL ask_director with the soft question shape
wave_fn ask_director freeze "peer hold on pr director asked to wait" "The ship wave paused on one item; safe merges and deploys continue" "What happened: $SOFT_MSG." '[{"label":"Keep it stopped","description":"x","writes":[{"op":"noop"}]},{"label":"Lift the stop","description":"x","writes":[{"op":"unfreeze"}]}]' >/dev/null 2>&1
QS=$(qid_soft); info "V1b frozen_line: $(qfield "$QS" frozen_line | cut -c1-140) · class before tap=$(cls_now)"
tap_lift "$QS"
expect_hard_holds "V1b"
check "V1b the CRLF soft line was lifted (soft=0)" $([ "$(soft_lines)" -eq 0 ]; echo $?) "$(cat "$ST/FROZEN")"

echo "══ V2. TABs inside the soft message ══"
newcase v2
wave_fn freeze "$HARD_MSG" >/dev/null 2>&1
wave_cli --freeze "$(printf 'peer hold on #3410\tDirector\tasked to wait\tsoft')"
info "V2 soft line NF=$(tail -1 "$ST/FROZEN" | awk -F'\t' '{print NF}') · $(tail -1 "$ST/FROZEN" | cut -f2,3) · class before tap=$(cls_now)"
QS=$(qid_soft); info "V2 frozen_line: $(qfield "$QS" frozen_line | cut -c1-140)"
tap_lift "$QS"
expect_hard_holds "V2"
check "V2 the tabbed soft line was lifted (soft=0)" $([ "$(soft_lines)" -eq 0 ]; echo $?) "$(cat "$ST/FROZEN")"

echo "══ V3a. two identical soft --freeze lines (different seconds) ══"
newcase v3a
wave_fn freeze "$HARD_MSG" >/dev/null 2>&1
wave_cli --freeze "$SOFT_MSG"; sleep 1.1; wave_cli --freeze "$SOFT_MSG"
info "V3a FROZEN lines=$(nlines) soft=$(soft_lines) · open questions: $(qlist | wc -l | tr -d ' ') · soft q asked_times=$(qfield "$(qid_soft)" asked_times)"
QS=$(qid_soft); tap_lift "$QS"
expect_hard_holds "V3a"
info "V3a soft lines left after the tap: $(soft_lines) (the question was refreshed to the LAST soft line; the first stays a soft hold)"

echo "══ V3b. two byte-identical soft lines (same second, hand-written) ══"
newcase v3b
wave_fn freeze "$HARD_MSG" >/dev/null 2>&1
L="$(date '+%F %T')	$SOFT_MSG	soft	peer hold on pr director asked to wait"
printf '%s\n%s\n' "$L" "$L" >> "$ST/FROZEN"
wave_fn ask_director freeze "peer hold on pr director asked to wait" "The ship wave paused on one item; safe merges and deploys continue" "What happened: $SOFT_MSG." '[{"label":"Keep it stopped","description":"x","writes":[{"op":"noop"}]},{"label":"Lift the stop","description":"x","writes":[{"op":"unfreeze"}]}]' >/dev/null 2>&1
QS=$(qid_soft); tap_lift "$QS"
expect_hard_holds "V3b"
info "V3b both identical soft lines lifted by one tap: soft left=$(soft_lines) · $(printf '%s' "$ANS" | grep -o 'lifted [0-9]* line(s)')"

echo "══ V4. the HARD line is the LAST line (soft first, then hard) ══"
newcase v4
wave_cli --freeze "$SOFT_MSG"
wave_fn freeze "$HARD_MSG" >/dev/null 2>&1
info "V4 FROZEN: $(cut -f3 "$ST/FROZEN" | tr '\n' ',') · class before tap=$(cls_now)"
QS=$(qid_soft); QH=$(qid_hard)
info "V4 soft q frozen_line: $(qfield "$QS" frozen_line | cut -c1-100) · hard q frozen_line: $(qfield "$QH" frozen_line | cut -c1-100)"
tap_lift "$QS"
expect_hard_holds "V4"
tap_lift "$QH"
info "V4b then the tap on the HARD question: rc=$RC · $(printf '%s' "$ANS" | tr '\n' ' ' | cut -c1-120) · FROZEN exists: $([ -e "$ST/FROZEN" ] && echo yes || echo no)"
check "V4b the hard question's own tap lifts the hard line (it was asked about it)" $([ "$RC" -eq 0 ] && [ ! -e "$ST/FROZEN" ]; echo $?) "rc=$RC"

echo "══ V5. the question asked about the HARD line itself while a soft line exists (hard first, then soft) ══"
newcase v5
wave_fn freeze "$HARD_MSG" >/dev/null 2>&1
wave_cli --freeze "$SOFT_MSG"
QH=$(qid_hard); info "V5 hard q frozen_line: $(qfield "$QH" frozen_line | cut -c1-120) · FROZEN: $(cut -f3 "$ST/FROZEN" | tr '\n' ',')"
tap_lift "$QH"
c=$(cls_now); d=$(deploy_gate)
info "V5 after the HARD question's tap: lines=$(nlines) hard=$(hard_lines) soft=$(soft_lines) · class=$c · deploy: $(printf '%s' "$d" | cut -c1-80) · rc=$RC · $(printf '%s' "$ANS" | tr '\n' ' ' | cut -c1-140)"
check "V5 the hard line is lifted by ITS question (asked about it), the soft hold stays" $([ "$RC" -eq 0 ] && [ "$(hard_lines)" -eq 0 ] && [ "$(soft_lines)" -eq 1 ]; echo $?) "$(cat "$ST/FROZEN" 2>/dev/null)"
check "V5 class in force is now soft (deploy may fire — spec §B soft)" $([ "$c" = soft ] && [ "$d" = ALLOWED ]; echo $?) "class=$c deploy=$d"
check "V5 desk receipt says soft line(s) still on" $(printf '%s' "$ANS" | grep -q 'soft line(s) still on'; echo $?) "$ANS"

echo "══ X1. hunt: FROZEN read-only — --freeze soft cannot append; what does the question say it is about? ══"
newcase x1
wave_fn freeze "$HARD_MSG" >/dev/null 2>&1
chmod 444 "$ST/FROZEN"
wave_cli --freeze "$SOFT_MSG"
info "X1 receipt: $(grep -m1 'FROZEN' "$C/say.txt" | cut -c1-140)"
info "X1 FROZEN lines=$(nlines) (append $( [ "$(nlines)" -eq 1 ] && echo FAILED || echo landed)) · stderr: $(grep -m1 -i 'permission' "$C/say.txt" | cut -c1-100)"
QS=$(qid_soft); info "X1 soft-titled question frozen_line: $(qfield "$QS" frozen_line | cut -c1-140)"
tap_lift "$QS"
c=$(cls_now); d=$(deploy_gate)
info "X1 after tap on the soft-titled question: rc=$RC · $(printf '%s' "$ANS" | tr '\n' ' ' | cut -c1-140) · FROZEN exists: $([ -e "$ST/FROZEN" ] && echo yes || echo no) · class=$c"
check "X1 a soft-titled question must not carry the HARD line as its frozen_line (or must not lift it)" $([ -e "$ST/FROZEN" ] && [ "$(hard_lines)" -ge 1 ]; echo $?) "the tap on a question titled 'paused on one item; safe merges and deploys continue' removed the APPLY-failed hard line: frozen_line=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("frozen_line"))' "$ST/questions/answered/$QS.json" | cut -c1-120)"
chmod 644 "$ST/FROZEN" 2>/dev/null

echo "══ X2. hunt: 400-char frozen_line cap — hard + soft lines identical in their first 400 flattened chars ══"
newcase x2
TS=$(date '+%F %T'); LONG=$(printf 'x%.0s' $(seq 1 420))
printf '%s\t%s\thard\tlong\n' "$TS" "$LONG" > "$ST/FROZEN"
printf '%s\t%s peer hold\tsoft\tlong peer hold\n' "$TS" "$LONG" >> "$ST/FROZEN"
info "X2 class before tap=$(cls_now) · lines=$(nlines)"
wave_fn ask_director freeze "long peer hold" "The ship wave paused on one item; safe merges and deploys continue" "What happened: long hold." '[{"label":"Keep it stopped","description":"x","writes":[{"op":"noop"}]},{"label":"Lift the stop","description":"x","writes":[{"op":"unfreeze"}]}]' >/dev/null 2>&1
QS=$(qid_soft); info "X2 frozen_line (capped at 400 chars): $(qfield "$QS" frozen_line | wc -c | tr -d ' ') chars"
tap_lift "$QS"
c=$(cls_now)
info "X2 after tap: rc=$RC · $(printf '%s' "$ANS" | tr '\n' ' ' | cut -c1-120) · FROZEN exists: $([ -e "$ST/FROZEN" ] && echo yes || echo no) · hard=$(hard_lines) · class=$c"
check "X2 the hard line survives a tap on the soft question whose frozen_line collides at the 400-char cap" $([ -e "$ST/FROZEN" ] && [ "$(hard_lines)" -ge 1 ]; echo $?) "one tap lifted $(printf '%s' "$ANS" | grep -o 'lifted [0-9]* line(s)\|unfreeze ✓') — hard line gone"

echo; echo "=== $PASS passed · $FAIL failed ==="; echo "INFO  temp dir: $TMP"
[ "$FAIL" -eq 0 ]

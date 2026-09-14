#!/opt/homebrew/bin/bash
# tests/test-freeze-round8.sh — proof for the round-8 freeze fix (verifier round 7: H13 / H14 / H15 / H9a-3 / H16 / H17 and
# integrator item 1). The CLASS fixed: "a write to FROZEN changes what FROZEN reads". freeze() now builds the new content in a
# temp file beside the real target, keeps any HARD reading that no well-formed hard line carries as ONE synthetic hard line,
# refuses (exit 5, nothing replaced) when the new content would read a LOWER class than the one in force before the call,
# renames it over FROZEN, and reads the exact line back. Readers treat a FROZEN that EXISTS but is not a regular file as HARD.
# Shape (as v7): B's ship-wave.sh truncated before `if [ -n "$GOAL" ]` + its siblings + A's desk-questions.sh in ONE dir; the
# wave runs the launchd way (env -i PATH HOME /opt/homebrew/bin/bash, C locale); every tap goes through A's REAL desk.
# Fresh temp HOME per case ($STATE is HOME-derived); the live ~/.config/obsidian/.ship-wave is never touched.
# Run from the worktree root:  bash scripts/ship-wave/tests/test-freeze-round8.sh   (DESK_SW=<dir> to override)
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"

ROOT=$(cd "$(dirname "$0")/../../.." && pwd); SW="$ROOT/scripts/ship-wave"
DESK_SW="${DESK_SW:-/Users/omm/PROJECTS/MyJKKN/.worktrees/hitl-desk/scripts/ship-wave}"
[ -f "$SW/desk-questions.sh" ] && DESK_SW="$SW"
[ -f "$DESK_SW/desk-questions.sh" ] || { echo "no desk at $DESK_SW"; exit 2; }
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-freeze-r8.XXXXXX")
# FROZEN keeps raw bytes (R8-12/13): this harness's own grep / cut / tr are byte-wise whatever the caller's locale is
export LC_ALL=C
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf 'FAIL  %s\n      %s\n' "$1" "${2:-}"; }
check() { if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1" "$3"; fi; }
info() { printf 'INFO  %s\n' "$*"; }
_contains() { case "$1" in *"$2"*) return 0;; *) return 1;; esac; }

echo "INFO  B ship-wave.sh @ $(git -C "$ROOT" rev-parse --short HEAD) (+ working tree) · desk @ $(git -C "$(dirname "$DESK_SW")" rev-parse --short HEAD 2>/dev/null || echo '?')"
awk '/^if \[ -n "\$GOAL" \]; then$/ {exit} {print}' "$SW/ship-wave.sh" > "$TMP/ship-wave.sh"
[ "$(grep -c 'freeze "\$FREEZE_MSG"; exit 0' "$TMP/ship-wave.sh")" -eq 1 ] || { echo "truncated script lost the --freeze gate"; exit 2; }
for f in "$SW"/*.sh "$SW"/*.py; do [ "$(basename "$f")" = ship-wave.sh ] || ln -s "$f" "$TMP/$(basename "$f")"; done
[ -e "$TMP/desk-questions.sh" ] || ln -s "$DESK_SW/desk-questions.sh" "$TMP/desk-questions.sh"
DESK="$DESK_SW/desk/v5-w12-desk.sh"
PLAIN_PATH="/opt/homebrew/bin:/usr/bin:/bin"
TO=/opt/homebrew/bin/timeout
LIVE_FROZEN_BEFORE=$( [ -e "$HOME/.config/obsidian/.ship-wave/FROZEN" ] && echo present || echo absent )

newcase() { C="$TMP/$1"; HM="$C/home"; ST="$HM/.config/obsidian/.ship-wave"; mkdir -p "$ST"; : > "$C/say.txt"; }
wave() { env -i PATH="$PLAIN_PATH" HOME="$HM" /opt/homebrew/bin/bash "$TMP/ship-wave.sh" "$@" >> "$C/say.txt" 2>&1; CLI_RC=$?; }
wave_bounded() { $TO 15 env -i PATH="$PLAIN_PATH" HOME="$HM" /opt/homebrew/bin/bash "$TMP/ship-wave.sh" "$@" >> "$C/say.txt" 2>&1; CLI_RC=$?; }
# a sourced shell (plan mode, launchd env) that runs arbitrary code after sourcing — for function overrides
wave_src() { $TO 30 env -i PATH="$PLAIN_PATH" HOME="$HM" /opt/homebrew/bin/bash -c 'R=$1 S=$2 CODE=$3; cd "$R"; set -- plan; . "$S" >/dev/null 2>&1; eval "$CODE"' _ "$ROOT" "$TMP/ship-wave.sh" "$1" >> "$C/say.txt" 2>&1; SRC_RC=$?; }
wave_fn() { ( a=("$@"); export HOME="$HM"; cd "$ROOT"; set -- plan; . "$TMP/ship-wave.sh" >/dev/null 2>&1; "${a[@]}" ); }
cls_now() { $TO 10 /opt/homebrew/bin/bash -c 'H=$1 R=$2 S=$3; export HOME="$H"; cd "$R"; set -- plan; . "$S" >/dev/null 2>&1; freeze_class_now' _ "$HM" "$ROOT" "$TMP/ship-wave.sh" 2>/dev/null; local rc=$?; [ "$rc" -eq 124 ] && printf 'TIMEOUT'; echo; }
deploy_gate() { $TO 10 /opt/homebrew/bin/bash -c 'H=$1 R=$2 S=$3; export HOME="$H"; cd "$R"; set -- plan; . "$S" >/dev/null 2>&1; MODE=go; if deploy_allowed; then echo "ALLOWED"; else echo "REFUSED: $DEPLOY_BLOCK"; fi' _ "$HM" "$ROOT" "$TMP/ship-wave.sh" 2>/dev/null || echo "TIMEOUT-OR-ERROR"; }
qcount() { ls "$ST/questions" 2>/dev/null | grep -c 'q-.*\.json'; }
qlist() { python3 - "$ST/questions" <<'PY'
import json,glob,os,sys
for f in sorted(glob.glob(os.path.join(sys.argv[1],"q-*.json")), key=lambda p: json.load(open(p))["asked_at"]):
    q=json.load(open(f)); print(q["id"]+"\t"+q["title"]+"\t"+str(q.get("frozen_line")))
PY
}
qid_by_title() { qlist 2>/dev/null | awk -F'\t' -v pat="$1" '$2 ~ pat {print $1}' | tail -1; }
qid_hard() { qid_by_title 'stopped: production'; }
qid_soft() { qid_by_title 'paused on one item'; }
qid_behind() { qid_by_title 'HARD stop is already in force'; }
qfield() { python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get(sys.argv[2]))' "$ST/questions/$1.json" "$2"; }
q_ops() { python3 -c 'import json,sys;q=json.load(open(sys.argv[1]));print(" ".join(sorted({w["op"] for o in q["options"] for w in o["writes"]})))' "$ST/questions/$1.json"; }
q_nopts() { python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))["options"]))' "$ST/questions/$1.json"; }
lift_idx() { python3 -c 'import json,sys;q=json.load(open(sys.argv[1]));print([i for i,o in enumerate(q["options"]) if any(w["op"]=="unfreeze" for w in o["writes"])][0])' "$ST/questions/$1.json"; }
tap() { local id="$1" idx="$2"; ANS=$(env -i PATH="$PLAIN_PATH" HOME="$HM" STATE="$ST" SHIP_WAVE_DIR="$TMP" /opt/homebrew/bin/bash "$DESK" answer "$id" "$idx" 2>&1); RC=$?; }
desk_pending() { env -i PATH="$PLAIN_PATH" HOME="$HM" STATE="$ST" SHIP_WAVE_DIR="$TMP" /opt/homebrew/bin/bash "$DESK" pending 2>&1; }
wf_hard() { [ -f "$ST/FROZEN" ] && awk -F'\t' 'NF>=3 && NF<=5 && $3=="hard" && !(NF==5 && (length($5)!=40 || $5 !~ /^[0-9a-f]+$/))' "$ST/FROZEN" | wc -l | tr -d ' ' || echo 0; }
wf_soft() { [ -f "$ST/FROZEN" ] && awk -F'\t' 'NF>=3 && NF<=5 && $3=="soft" && !(NF==5 && (length($5)!=40 || $5 !~ /^[0-9a-f]+$/))' "$ST/FROZEN" | wc -l | tr -d ' ' || echo 0; }
nlines() { [ -f "$ST/FROZEN" ] && grep -c '' "$ST/FROZEN" || echo 0; }
line_n() { sed -n "${1}p" "$ST/FROZEN"; }
sha_ok() { local l; l=$(line_n "$1"); [ "$(printf '%s' "$(printf '%s' "$l" | cut -f1-4)" | shasum -a 1 | cut -c1-40)" = "$(printf '%s' "$l" | cut -f5)" ]; }
tmp_left() { find "$1" -name '.FROZEN.tmp.*' 2>/dev/null | wc -l | tr -d ' '; }
valid_utf8() { python3 -c 'import sys;open(sys.argv[1],"rb").read().decode("utf-8")' "$1" 2>/dev/null; }
lock_left() { [ -e "$HM/.config/obsidian/.ship-wave.lock" ] && echo yes || echo no; }
cks() { cksum < "$1" 2>/dev/null; }
HARD_MSG="migration 20260906213000: APPLY failed — relation exists"
SOFT_MSG="peer hold on #3410 — Director asked to wait"
EMPTY_SYN="FROZEN was empty or cut short, reads as hard (fail safe)"
MAL='a malformed stop line reads as hard (line '
NOTREG='could not record the stop (FROZEN is not a regular file)'

echo "════ R8-1 · READER SIDE: a FROZEN that EXISTS but is not a regular file reads HARD (integrator item 1) ════"
for shape in dir fifo devnull; do
  newcase "r1-$shape"
  case "$shape" in dir) mkdir "$ST/FROZEN"; : > "$ST/FROZEN/keep";; fifo) mkfifo "$ST/FROZEN";; devnull) ln -s /dev/null "$ST/FROZEN";; esac
  c=$(cls_now); d=$(deploy_gate)
  check "R8-1a ($shape) freeze_class_now = hard, returned without blocking" $([ "$c" = hard ]; echo $?) "class=$c"
  check "R8-1b ($shape) deploy_allowed REFUSED: hard freeze, naming 'FROZEN is not a regular file'" $(_contains "$d" "REFUSED: hard freeze" && _contains "$d" "FROZEN is not a regular file"; echo $?) "$d"
  r=$($TO 10 /opt/homebrew/bin/bash -c 'H=$1 R=$2 S=$3; export HOME="$H"; cd "$R"; set -- plan; . "$S" >/dev/null 2>&1; freeze_reason_now; printf "|"; freeze_line_now | cut -f2,3; freeze_bad_line_no' _ "$HM" "$ROOT" "$TMP/ship-wave.sh" 2>&1); rc=$?
  check "R8-1c ($shape) freeze_reason_now / freeze_line_now / freeze_bad_line_no return (no read of the path) and name it honestly" $([ "$rc" -eq 0 ] && _contains "$r" "FROZEN is not a regular file — reads as hard (fail safe)|FROZEN is not a regular file" && _contains "$r" "hard"; echo $?) "rc=$rc $r"
done
newcase r1-unfreeze-dir; mkdir "$ST/FROZEN"; : > "$ST/FROZEN/keep"
wave_bounded --unfreeze
check "R8-1d --unfreeze on a DIRECTORY: rc=1, one 'freeze NOT cleared' line (never 'freeze cleared'), the directory untouched, class still hard" $([ "$CLI_RC" -eq 1 ] && [ "$(grep -c 'freeze NOT cleared' "$C/say.txt")" -eq 1 ] && ! grep -q '^freeze cleared' "$C/say.txt" && [ -f "$ST/FROZEN/keep" ] && [ "$(cls_now)" = hard ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
newcase r1-unfreeze-fifo; mkfifo "$ST/FROZEN"
wave_bounded --unfreeze
check "R8-1e --unfreeze on a FIFO: returns (rc=0, not a hang), 'freeze cleared', the FIFO is gone" $([ "$CLI_RC" -eq 0 ] && grep -q '^freeze cleared' "$C/say.txt" && [ ! -e "$ST/FROZEN" ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"

echo "════ R8-2 · H13: EMPTY FROZEN (reads hard) + phone '--freeze <soft>' ════"
newcase r2; : > "$ST/FROZEN"
wave --freeze "$SOFT_MSG"; QB=$(qid_behind)
check "R8-2a rc=0; 2 lines: line 1 a well-formed HARD line '$EMPTY_SYN' with a valid sha, line 2 the soft hold" $([ "$CLI_RC" -eq 0 ] && [ "$(nlines)" -eq 2 ] && [ "$(line_n 1 | cut -f2,3)" = "$EMPTY_SYN	hard" ] && sha_ok 1 && [ "$(line_n 2 | cut -f2,3)" = "$SOFT_MSG	soft" ] && sha_ok 2; echo $?) "rc=$CLI_RC $(cat -v "$ST/FROZEN")"
check "R8-2b (P1) class hard, deploy REFUSED naming the synthetic line" $([ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "REFUSED: hard freeze" && _contains "$(deploy_gate)" "$EMPTY_SYN"; echo $?) "$(cls_now) $(deploy_gate)"
check "R8-2c (P1) exactly ONE question, the noop-only behind-question (no Lift anywhere); body names '$EMPTY_SYN'" $([ "$(qcount)" -eq 1 ] && [ -n "$QB" ] && [ "$(q_ops "$QB")" = noop ] && _contains "$(qfield "$QB" body)" "HARD stop is in force: $EMPTY_SYN"; echo $?) "q=$(qcount) $(qlist)"
check "R8-2d receipt says the hardness was kept as a line of its own (once), and claims the soft hold only as 'behind' a hard stop" $([ "$(grep -c 'kept as a hard line of its own' "$C/say.txt")" -eq 1 ] && grep -q 'soft line added, HARD stop still in force' "$C/say.txt" && ! grep -q '⛔ FROZEN (soft):' "$C/say.txt"; echo $?) "$(cat "$C/say.txt")"
n=$(q_nopts "$QB"); i=0
while [ "$i" -lt "$n" ]; do
  before=$(cks "$ST/FROZEN"); tap "$QB" "$i"
  check "R8-2e.$i (P1, real desk) tapping option $i leaves FROZEN byte-identical and hard" $([ "$RC" -eq 0 ] && [ "$(cks "$ST/FROZEN")" = "$before" ] && [ "$(cls_now)" = hard ]; echo $?) "rc=$RC $ANS"
  [ "$((i+1))" -lt "$n" ] && wave --freeze "$SOFT_MSG" && QB=$(qid_behind)
  i=$((i+1))
done
check "R8-2f a second soft --freeze adds NO second synthetic line (a well-formed hard line now exists)" $([ "$(grep -c "$EMPTY_SYN" "$ST/FROZEN")" -eq 1 ] && [ "$(wf_hard)" -eq 1 ]; echo $?) "$(cat "$ST/FROZEN")"

echo "════ R8-3 · EMPTY FROZEN + a HARD freeze: the hard question's own Lift cannot take the empty-file hardness with it ════"
newcase r3; : > "$ST/FROZEN"
wave --freeze "$HARD_MSG"; QH=$(qid_hard)
check "R8-3a rc=0, 2 well-formed hard lines (synthetic + the new one), 1 question with a Lift" $([ "$CLI_RC" -eq 0 ] && [ "$(nlines)" -eq 2 ] && [ "$(wf_hard)" -eq 2 ] && [ "$(qcount)" -eq 1 ] && [ -n "$QH" ]; echo $?) "rc=$CLI_RC $(cat "$ST/FROZEN")"
tap "$QH" "$(lift_idx "$QH")"
check "R8-3b (P1, real desk) the Lift removes ITS line only: rc=0, 1 line left = the synthetic hard line, class hard, deploy REFUSED" $([ "$RC" -eq 0 ] && [ "$(nlines)" -eq 1 ] && [ "$(line_n 1 | cut -f2)" = "$EMPTY_SYN" ] && [ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "REFUSED"; echo $?) "rc=$RC $ANS $(cat "$ST/FROZEN" 2>/dev/null)"

echo "════ R8-4 · H14: a freeze whose write fails (EFBIG, the disk-full shape) never creates, truncates or replaces FROZEN ════"
efbig() { env -i PATH="$PLAIN_PATH" HOME="$HM" /opt/homebrew/bin/bash -c 'trap "" XFSZ; ulimit -f 0; exec /opt/homebrew/bin/bash "$1" --freeze "$2"' _ "$TMP/ship-wave.sh" "$1" 2>&1 | cat >> "$C/say.txt"; CLI_RC=${PIPESTATUS[0]}; }
newcase r4a; efbig "$HARD_MSG"
check "R8-4a no FROZEN before: rc=5, '⛔ could not write FROZEN (File too large)', FROZEN NOT created, no temp file left, 0 questions" $([ "$CLI_RC" -eq 5 ] && grep -q '⛔ could not write FROZEN (.*File too large' "$C/say.txt" && [ ! -e "$ST/FROZEN" ] && [ "$(tmp_left "$ST")" -eq 0 ] && [ "$(qcount)" -eq 0 ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt") $(ls -a "$ST")"
newcase r4b; wave --freeze "$HARD_MSG"; B4=$(cks "$ST/FROZEN"); Q4=$(qcount)
efbig "$SOFT_MSG"
check "R8-4b a hard line before: rc=5, FROZEN byte-identical, no temp left, no new question, class hard" $([ "$CLI_RC" -eq 5 ] && [ "$(cks "$ST/FROZEN")" = "$B4" ] && [ "$(tmp_left "$ST")" -eq 0 ] && [ "$(qcount)" -eq "$Q4" ] && [ "$Q4" -eq 1 ] && [ "$(cls_now)" = hard ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
newcase r4c; : > "$ST/FROZEN"; efbig "$SOFT_MSG"
check "R8-4c an EMPTY FROZEN before: rc=5, FROZEN still 0 bytes (not replaced by a soft-only copy), class hard" $([ "$CLI_RC" -eq 5 ] && [ -f "$ST/FROZEN" ] && [ ! -s "$ST/FROZEN" ] && [ "$(tmp_left "$ST")" -eq 0 ] && [ "$(cls_now)" = hard ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"

echo "════ R8-5 · H15: a partial line with no trailing newline ('2026-09-1') + soft --freeze ════"
newcase r5; printf '2026-09-1' > "$ST/FROZEN"
wave --freeze "$SOFT_MSG"; QB=$(qid_behind)
check "R8-5a rc=0; 3 lines: the fragment byte-identical, then the synthetic hard line, then the soft hold — nothing fused" $([ "$CLI_RC" -eq 0 ] && [ "$(nlines)" -eq 3 ] && [ "$(line_n 1)" = "2026-09-1" ] && [ "$(line_n 2 | cut -f2,3)" = "$EMPTY_SYN	hard" ] && [ "$(line_n 3 | cut -f2,3)" = "$SOFT_MSG	soft" ]; echo $?) "rc=$CLI_RC $(cat -v "$ST/FROZEN")"
check "R8-5b (P1) class hard, deploy REFUSED, behind-question noop-only" $([ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "REFUSED: hard freeze" && [ -n "$QB" ] && [ "$(q_ops "$QB")" = noop ]; echo $?) "$(cls_now) $(qlist)"
check "R8-5c (HONESTY) no 'not a regular file' claim about a regular file" $(! grep -q 'not a regular file' "$C/say.txt" && [ -f "$ST/FROZEN" ]; echo $?) "$(cat "$C/say.txt")"

echo "════ R8-6 · a FULL hard line saved without its final newline + soft --freeze: the soft hold lands on its OWN line ════"
newcase r6; wave --freeze "$HARD_MSG"; QH=$(qid_hard); L1=$(cat "$ST/FROZEN"); printf '%s' "$L1" > "$ST/FROZEN"
wave --freeze "$SOFT_MSG"
check "R8-6a rc=0, 2 lines, line 1 byte-identical to the hard line, line 2 the soft hold with a valid sha, NO synthetic line" $([ "$CLI_RC" -eq 0 ] && [ "$(nlines)" -eq 2 ] && [ "$(line_n 1)" = "$L1" ] && [ "$(line_n 2 | cut -f3)" = soft ] && sha_ok 2 && ! grep -q "$EMPTY_SYN" "$ST/FROZEN"; echo $?) "rc=$CLI_RC $(cat -v "$ST/FROZEN")"
check "R8-6b class hard, deploy REFUSED" $([ "$(cls_now)" = hard ] && _contains "$(deploy_gate)" "REFUSED: hard freeze"; echo $?) "$(cls_now)"
tap "$QH" "$(lift_idx "$QH")"
check "R8-6c the hard question's OWN Lift (the stop it was asked about) works: rc=0, the hard line gone, the soft hold kept, class soft" $([ "$RC" -eq 0 ] && [ "$(nlines)" -eq 1 ] && [ "$(wf_soft)" -eq 1 ] && [ "$(cls_now)" = soft ]; echo $?) "rc=$RC $ANS $(cat "$ST/FROZEN" 2>/dev/null)"

echo "════ R8-7 · only a TERMINATED malformed hard line (CRLF) + soft --freeze: no kept-hard line is needed — the CRLF line stays, and its own Lift still works ════"
newcase r7; wave --freeze "$HARD_MSG"; QH=$(qid_hard); sed -i '' 's/$/\r/' "$ST/FROZEN"; L1V=$(line_n 1 | cat -v)
wave --freeze "$SOFT_MSG"; QB=$(qid_behind)
check "R8-7a rc=0, 2 lines: the CRLF line byte-identical (unrepaired), then the soft hold with a valid sha — no kept-hard line" $([ "$CLI_RC" -eq 0 ] && [ "$(nlines)" -eq 2 ] && [ "$(line_n 1 | cat -v)" = "$L1V" ] && _contains "$L1V" '^M' && [ "$(line_n 2 | cut -f2,3)" = "$SOFT_MSG	soft" ] && sha_ok 2 && ! grep -q "$EMPTY_SYN" "$ST/FROZEN" && ! grep -q 'kept as a hard line of its own' "$C/say.txt"; echo $?) "$(cat -v "$ST/FROZEN")"
check "R8-7b class hard; behind-question noop-only, body quotes the malformed hard line, valid UTF-8, no CR in the body" $([ "$(cls_now)" = hard ] && [ "$(q_ops "$QB")" = noop ] && _contains "$(qfield "$QB" body)" "HARD stop is in force: ${MAL}1): " && _contains "$(qfield "$QB" body)" "APPLY failed" && valid_utf8 "$ST/questions/$QB.json" && ! _contains "$(qfield "$QB" body)" "$(printf '\r')"; echo $?) "$(qfield "$QB" body | cut -c1-200)"
tap "$QH" "$(lift_idx "$QH")"
check "R8-7c (liveness kept) the hard question's OWN Lift finds its CRLF line and lifts it: rc=0, the soft hold stays, class soft" $([ "$RC" -eq 0 ] && [ "$(nlines)" -eq 1 ] && [ "$(wf_soft)" -eq 1 ] && [ "$(cls_now)" = soft ]; echo $?) "rc=$RC $ANS $(cat -v "$ST/FROZEN" 2>/dev/null)"

echo "════ R8-8 · the INVARIANT itself: a copy that would read LOWER is refused, nothing replaced ════"
newcase r8; : > "$ST/FROZEN"
# force the synthetic-line step off, so the temp copy would read soft over an empty (hard) file
wave_src "_freeze_well_formed_hard() { return 0; }; freeze '$SOFT_MSG'; echo CONTINUED"
check "R8-8a rc=5, '⛔ could not record the stop (the new FROZEN would read soft, lower than the hard in force now) — nothing replaced', nothing ran after freeze()" $([ "$SRC_RC" -eq 5 ] && grep -q 'could not record the stop (the new FROZEN would read soft, lower than the hard in force now) — nothing replaced' "$C/say.txt" && ! grep -q CONTINUED "$C/say.txt"; echo $?) "rc=$SRC_RC $(cat "$C/say.txt")"
check "R8-8b FROZEN still 0 bytes (reads hard), no temp left, 0 questions, lock released" $([ -f "$ST/FROZEN" ] && [ ! -s "$ST/FROZEN" ] && [ "$(tmp_left "$ST")" -eq 0 ] && [ "$(qcount)" -eq 0 ] && [ "$(cls_now)" = hard ] && [ "$(lock_left)" = no ]; echo $?) "$(ls -la "$ST")"

echo "════ R8-9 · TRUE reasons, each distinct ════"
newcase r9a; mkdir "$ST/FROZEN"; wave --freeze "$HARD_MSG"
check "R8-9a directory → rc=5, exactly '$NOTREG', 0 questions" $([ "$CLI_RC" -eq 5 ] && [ "$(grep -c "$NOTREG" "$C/say.txt")" -eq 1 ] && [ "$(grep -c '' "$C/say.txt")" -eq 1 ] && [ "$(qcount)" -eq 0 ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
newcase r9b; wave --freeze "$HARD_MSG"; chmod 444 "$ST/FROZEN"; B9=$(cks "$ST/FROZEN"); wave --freeze "$SOFT_MSG"; chmod 644 "$ST/FROZEN"
check "R8-9b read-only FROZEN → rc=5, '⛔ could not write FROZEN (Permission denied)', not 'not a regular file', FROZEN byte-identical" $([ "$CLI_RC" -eq 5 ] && grep -q '⛔ could not write FROZEN (Permission denied)' "$C/say.txt" && ! grep -q 'not a regular file' "$C/say.txt" && [ "$(cks "$ST/FROZEN")" = "$B9" ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
newcase r9c; ln -s "$C/missing-dir/F" "$ST/FROZEN"; wave --freeze "$HARD_MSG"
check "R8-9c dangling link into a missing dir → rc=5, '⛔ could not write FROZEN (No such file or directory)', 0 questions" $([ "$CLI_RC" -eq 5 ] && grep -q '⛔ could not write FROZEN (No such file or directory)' "$C/say.txt" && [ "$(qcount)" -eq 0 ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
newcase r9d; wave_src "mv() { command rm -f \"\$2\"; return 0; }; freeze '$HARD_MSG'; echo CONTINUED"
check "R8-9d the rename 'succeeds' but the line is not in FROZEN → rc=5, '⛔ could not record the stop (the write did not read back from FROZEN)', 0 questions" $([ "$SRC_RC" -eq 5 ] && grep -q '⛔ could not record the stop (the write did not read back from FROZEN)' "$C/say.txt" && ! grep -q CONTINUED "$C/say.txt" && [ "$(qcount)" -eq 0 ]; echo $?) "rc=$SRC_RC $(cat "$C/say.txt")"
newcase r9e; wave_src "mv() { echo \"mv: rename \$2 to \$3: Device busy\" >&2; return 1; }; freeze '$HARD_MSG'; echo CONTINUED"
check "R8-9e the rename fails → rc=5, '⛔ could not write FROZEN (Device busy)', no FROZEN, no temp left" $([ "$SRC_RC" -eq 5 ] && grep -q '⛔ could not write FROZEN (Device busy)' "$C/say.txt" && [ ! -e "$ST/FROZEN" ] && [ "$(tmp_left "$ST")" -eq 0 ]; echo $?) "rc=$SRC_RC $(cat "$C/say.txt")"

echo "════ R8-10 · serialised: concurrent --freeze calls and a busy desk lock never lose a line ════"
newcase r10
M1="peer hold on #1 — a"; M2="peer hold on #2 — b"; M3="migration 1: APPLY failed — c"; M4="deploy dpl_4 ERROR — d"
for m in "$M1" "$M2" "$M3" "$M4"; do ( env -i PATH="$PLAIN_PATH" HOME="$HM" /opt/homebrew/bin/bash "$TMP/ship-wave.sh" --freeze "$m" > "$C/p-$(printf '%s' "$m" | cksum | cut -d' ' -f1).txt" 2>&1; echo $? >> "$C/rcs" ) & done; wait
check "R8-10a 4 concurrent --freeze: all rc=0, exactly 4 lines, each message once, every sha valid, no temp left" $([ "$(grep -c '^0$' "$C/rcs")" -eq 4 ] && [ "$(nlines)" -eq 4 ] && for m in "$M1" "$M2" "$M3" "$M4"; do [ "$(cut -f2 "$ST/FROZEN" | grep -cxF "$m")" -eq 1 ] || exit 1; done && sha_ok 1 && sha_ok 2 && sha_ok 3 && sha_ok 4 && [ "$(tmp_left "$ST")" -eq 0 ]; echo $?) "rcs=$(tr '\n' ' ' < "$C/rcs") $(cat "$ST/FROZEN")"
check "R8-10b class hard with 2 hard + 2 soft lines" $([ "$(cls_now)" = hard ] && [ "$(wf_hard)" -eq 2 ] && [ "$(wf_soft)" -eq 2 ]; echo $?) "$(cls_now)"
newcase r10c; mkdir -p "$ST/questions"
python3 -c 'import fcntl,sys,time
f=open(sys.argv[1],"a"); fcntl.flock(f,fcntl.LOCK_EX); open(sys.argv[2],"w").close(); time.sleep(2.5)' "$ST/questions/.lock" "$C/locked" & LP=$!
for _ in $(seq 1 50); do [ -e "$C/locked" ] && break; sleep 0.1; done
t0=$(python3 -c 'import time;print(time.time())'); wave --freeze "$HARD_MSG"; t1=$(python3 -c 'import time;print(time.time())'); wait "$LP"
check "R8-10c the desk holds the questions lock for 2.5 s: freeze waits for it (≥ 1.5 s), then records (rc=0, 1 hard line, 1 question)" $([ -e "$C/locked" ] && python3 -c "import sys;sys.exit(0 if $t1-$t0>=1.5 else 1)" && [ "$CLI_RC" -eq 0 ] && [ "$(wf_hard)" -eq 1 ] && [ "$(qcount)" -eq 1 ]; echo $?) "rc=$CLI_RC waited=$(python3 -c "print(round($t1-$t0,2))") $(cat "$C/say.txt")"
check "R8-10d after freeze returns the lock is free (a non-blocking flock succeeds at once)" $(python3 -c 'import fcntl,sys;f=open(sys.argv[1],"a");fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)' "$ST/questions/.lock" 2>/dev/null; echo $?) "lock still held"

echo "════ R8-11 · H16: a --freeze message made only of \\v, \\f, NBSP, U+3000 (alone or mixed) is refused as empty ════"
for m in "$(printf '\v')" "$(printf '\f\f')" "$(printf '\302\240')" "$(printf '\343\200\200')" "$(printf ' \v\302\240\t\343\200\200\f ')"; do
  tag=$(printf '%s' "$m" | od -An -tx1 | tr -d ' \n'); newcase "r11-$tag"; wave go --freeze "$m"
  check "R8-11 ($tag) rc=2, exactly one line '--freeze needs a message', no FROZEN, no lock, no receipt, 0 questions" $([ "$CLI_RC" -eq 2 ] && [ "$(grep -c -- '--freeze needs a message' "$C/say.txt")" -eq 1 ] && [ "$(grep -c '' "$C/say.txt")" -eq 1 ] && [ ! -e "$ST/FROZEN" ] && [ "$(lock_left)" = no ] && [ ! -e "$HM/.config/obsidian/v5-myjkkn-ship-last.txt" ] && [ "$(qcount)" -eq 0 ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt" | head -2)"
done
newcase r11-control; wave --freeze "$(printf 'x\v')"
check "R8-11-control a message with ONE visible character plus \\v is recorded (rc=0, 1 hard line)" $([ "$CLI_RC" -eq 0 ] && [ "$(wf_hard)" -eq 1 ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"

echo "════ R8-12 · H9a-3: a message with an INVALID UTF-8 byte still reaches the phone; FROZEN keeps the raw bytes ════"
BADMSG="$(printf 'deploy dpl_1 \342\200 ERROR bad-byte\377 tail')"
newcase r12a; wave --freeze "$BADMSG"; QH=$(qid_hard)
check "R8-12a rc=0, 1 hard line, FROZEN field 2 keeps the raw 0xFF byte and the tail, exactly 1 question, valid UTF-8, listed by the real desk, no 'ask_director refused'" $([ "$CLI_RC" -eq 0 ] && [ "$(wf_hard)" -eq 1 ] && [ "$(LC_ALL=C grep -ac "$(printf '\377') tail" "$ST/FROZEN")" -eq 1 ] && [ "$(qcount)" -eq 1 ] && [ -n "$QH" ] && valid_utf8 "$ST/questions/$QH.json" && [ "$(desk_pending | grep -c "$QH")" -ge 1 ] && ! grep -q 'ask_director refused' "$C/say.txt"; echo $?) "rc=$CLI_RC q=$(qcount) $(grep 'desk' "$C/say.txt")"
check "R8-12b the question body carries the text on both sides of the bad bytes" $(_contains "$(qfield "$QH" body)" "deploy dpl_1 " && _contains "$(qfield "$QH" body)" " tail"; echo $?) "$(qfield "$QH" body | cut -c1-160)"
newcase r12b; wave --freeze "$HARD_MSG"; wave --freeze "$(printf 'peer hold on #9 \377 odd byte')"; QB=$(qid_behind)
check "R8-12c the same byte in a soft hold behind a hard stop: behind-question written, valid UTF-8, listed by the desk" $([ "$CLI_RC" -eq 0 ] && [ -n "$QB" ] && valid_utf8 "$ST/questions/$QB.json" && [ "$(desk_pending | grep -c "$QB")" -ge 1 ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"

echo "════ R8-13 · H17: under a UTF-8 terminal locale an invalid byte no longer truncates a hard message to soft ════"
newcase r13
env -i PATH="$PLAIN_PATH" HOME="$HM" LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 /opt/homebrew/bin/bash "$TMP/ship-wave.sh" --freeze "$(printf 'peer hold note: deploy dpl_9 \377 ERROR')" >> "$C/say.txt" 2>&1; CLI_RC=$?
check "R8-13 rc=0, recorded HARD with the full text (ERROR kept), no 'Illegal byte sequence'" $([ "$CLI_RC" -eq 0 ] && [ "$(cls_now)" = hard ] && [ "$(wf_hard)" -eq 1 ] && LC_ALL=C grep -aq 'dpl_9 .* ERROR$' "$ST/FROZEN" 2>/dev/null || LC_ALL=C grep -aq 'dpl_9 .* ERROR	' "$ST/FROZEN" && ! LC_ALL=C grep -aq 'Illegal byte' "$C/say.txt"; echo $?) "rc=$CLI_RC $(cut -f2,3 "$ST/FROZEN" | cat -v) $(cat "$C/say.txt" | head -2)"

echo "════ R8-14 · symlinks: the rename replaces the FILE a link names, never the link ════"
newcase r14a; mkdir -p "$C/else"; wave --freeze "$HARD_MSG"; mv "$ST/FROZEN" "$C/else/F"; ln -s "$C/else/F" "$ST/FROZEN"
wave --freeze "$SOFT_MSG"
check "R8-14a link → regular file: rc=0, FROZEN is still the link, the target holds 2 lines, no temp left beside the target or in STATE" $([ "$CLI_RC" -eq 0 ] && [ -L "$ST/FROZEN" ] && [ "$(grep -c '' "$C/else/F")" -eq 2 ] && [ "$(tmp_left "$C/else")" -eq 0 ] && [ "$(tmp_left "$ST")" -eq 0 ] && [ "$(cls_now)" = hard ]; echo $?) "rc=$CLI_RC $(ls -l "$ST/FROZEN") $(cat "$C/say.txt")"
newcase r14b; mkdir -p "$C/else"; ln -s "../../../../else/G" "$ST/FROZEN"      # RELATIVE, dangling, into an existing dir
wave --freeze "$HARD_MSG"
check "R8-14b relative dangling link into an existing dir: rc=0, the target is created, the link intact, 1 hard line, 1 question" $([ "$CLI_RC" -eq 0 ] && [ -L "$ST/FROZEN" ] && [ -f "$C/else/G" ] && [ "$(wf_hard)" -eq 1 ] && [ "$(qcount)" -eq 1 ]; echo $?) "rc=$CLI_RC $(ls -l "$ST/FROZEN") $(cat "$C/say.txt")"

echo "════ R8-15 · a BLANK-only FROZEN (reads hard) + soft --freeze: the hardness is kept as a real line ════"
newcase r15; printf '\n \t\n' > "$ST/FROZEN"
wave --freeze "$SOFT_MSG"; QB=$(qid_behind)
check "R8-15 rc=0; the blank bytes kept, then '$EMPTY_SYN' (hard, valid sha), then the soft hold; class hard; behind-question noop-only" $([ "$CLI_RC" -eq 0 ] && [ "$(nlines)" -eq 4 ] && [ "$(line_n 3 | cut -f2,3)" = "$EMPTY_SYN	hard" ] && sha_ok 3 && [ "$(line_n 4 | cut -f3)" = soft ] && [ "$(cls_now)" = hard ] && [ -n "$QB" ] && [ "$(q_ops "$QB")" = noop ]; echo $?) "rc=$CLI_RC $(cat -v "$ST/FROZEN")"

echo "════ R8-16 · no rename without the questions lock: a lock that cannot be opened refuses, nothing written ════"
newcase r16; wave --freeze "$HARD_MSG"; B16=$(cks "$ST/FROZEN"); mv "$ST/questions" "$ST/questions.away"; : > "$ST/questions"
wave --freeze "$SOFT_MSG"
check "R8-16 rc=5, '⛔ could not write FROZEN (the questions lock could not be opened: …)', FROZEN byte-identical, no temp left, class hard" $([ "$CLI_RC" -eq 5 ] && grep -q '⛔ could not write FROZEN (the questions lock could not be opened' "$C/say.txt" && [ "$(cks "$ST/FROZEN")" = "$B16" ] && [ "$(tmp_left "$ST")" -eq 0 ] && [ "$(cls_now)" = hard ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"

echo "══ SAFETY ══"
ncases=$(find "$TMP" -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d ' ')
check "S0 across all $ncases case dirs: no '.FROZEN.tmp.*' left anywhere (and > 20 cases ran)" $([ "$ncases" -gt 20 ] && [ "$(tmp_left "$TMP")" -eq 0 ]; echo $?) "$(find "$TMP" -name '.FROZEN.tmp.*')"
check "S1 live ~/.config/obsidian/.ship-wave/FROZEN unchanged by this run (was: $LIVE_FROZEN_BEFORE)" $([ "$( [ -e "$HOME/.config/obsidian/.ship-wave/FROZEN" ] && echo present || echo absent )" = "$LIVE_FROZEN_BEFORE" ]; echo $?) "live FROZEN state changed"
check "S2 no live lock left at ~/.config/obsidian/.ship-wave.lock by this harness" $([ ! -e "$HOME/.config/obsidian/.ship-wave.lock" ] || [ "$(stat -f %m "$HOME/.config/obsidian/.ship-wave.lock")" -lt "$(stat -f %m "$TMP")" ]; echo $?) "a lock newer than this run exists"
for f in "$SW/ship-wave.sh" "$0"; do /opt/homebrew/bin/bash -n "$f" && ok "bash -n $(basename "$f")" || bad "bash -n $(basename "$f")"; done

echo "=== $PASS passed · $FAIL failed · fixtures in $TMP ==="
[ "$FAIL" -eq 0 ]

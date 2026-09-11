#!/opt/homebrew/bin/bash
# tests/verify-freeze-classes-adversarial-v8.sh — EIGHTH adversarial pass on slice B (freeze classes) at 39c528e96f × slice A's
# real desk (hitl-desk @ ea0c188879). Part 1 re-attempts H13 / H14 / H15 and the reader-side fail-safe with the SAME inputs as
# v7, end to end (env -i, temp HOME/$STATE, the real desk for every tap). Part 2 attacks the round-8 INVARIANT itself:
# kill -9 between the temp write and the rename, ulimit -f and a REAL ENOSPC (a 4 MB HFS+ RAM disk) during the temp write,
# a read-only directory, FROZEN replaced between the class read and the rename, racing --freeze commands, soft→hard(full
# disk)→soft, an empty file + a hard --freeze, an unterminated hard line + a soft --freeze — and the desk's own rewrite on a
# full disk. PROPERTY (P1) no phone tap / phone --freeze removes or downgrades a stop whose class reads HARD; (P2) freeze()
# never leaves the wave reading a LOWER class than before the call and never reports a stop recorded when it was not.
# A case named "BREAK?" asserts the property: a FAIL there is a property break (this pass: I7c on B, D2 on A's desk; D2 (HONESTY)
# is the desk's receipt miscounting on the same full disk). INFO / SKIP lines are informational (spec gaps, liveness, honesty).
# Run from the worktree root:  bash scripts/ship-wave/tests/verify-freeze-classes-adversarial-v8.sh
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"

ROOT=$(cd "$(dirname "$0")/../../.." && pwd); SW="$ROOT/scripts/ship-wave"
DESK_SW="${DESK_SW:-/Users/omm/PROJECTS/MyJKKN/.worktrees/hitl-desk/scripts/ship-wave}"
[ -f "$SW/desk-questions.sh" ] && DESK_SW="$SW"
[ -f "$DESK_SW/desk-questions.sh" ] || { echo "no desk at $DESK_SW"; exit 2; }
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-freeze-v8.XXXXXX")
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

skip() { printf 'SKIP  %s\n' "$*"; }
wave_to() { local out="$1"; shift; env -i PATH="$PLAIN_PATH" HOME="$HM" /opt/homebrew/bin/bash "$TMP/ship-wave.sh" "$@" > "$out" 2>&1; echo $? >> "$out.rc"; }
efbig_n() { local lim="$1" xfsz="$2"; shift 2; env -i PATH="$PLAIN_PATH" HOME="$HM" /opt/homebrew/bin/bash -c 'L=$1 X=$2; shift 2; [ "$X" = ignore ] && trap "" XFSZ; ulimit -f "$L"; exec /opt/homebrew/bin/bash "$@"' _ "$lim" "$xfsz" "$TMP/ship-wave.sh" "$@" 2>&1 | cat >> "$C/say.txt"; CLI_RC=${PIPESTATUS[0]}; }
run_view() { printf 'FROZEN=%s class=%s gate=%s' "$([ -e "$ST/FROZEN" ] && echo present || echo GONE)" "$([ -e "$ST/FROZEN" ] && cls_now | tr -d '\n' || echo none)" "$(deploy_gate | cut -c1-70)"; }
# the wave's own view: a FROZEN that does not exist is "not frozen" (every gate asks -e first)
wave_class() { if [ -e "$ST/FROZEN" ]; then cls_now | tr -d '\n'; else printf none; fi; }
rank() { case "$1" in hard) echo 2;; soft) echo 1;; *) echo 0;; esac; }
long_soft() { printf 'peer hold %s' "$(head -c "$1" /dev/zero | tr '\0' a)"; }   # a soft hold whose FROZEN line is 168+$1 bytes

echo "════════ PART 1 · RE-ATTEMPT H13 / H14 / H15 + the reader fail-safe (same inputs as v7) ════════"
echo "══ V1 · H13: EMPTY FROZEN + phone '--freeze <soft>'; every option of every open question tapped through the real desk ══"
newcase v1-probe; : > "$ST/FROZEN"; wave --freeze "$SOFT_MSG"; QB=$(qid_behind); NOPT=$(q_nopts "$QB")
check "V1a (P1) class hard, deploy REFUSED, only the noop behind-question exists (no Lift anywhere)" $([ "$CLI_RC" -eq 0 ] && [ "$(wave_class)" = hard ] && _contains "$(deploy_gate)" "REFUSED: hard freeze" && [ "$(qcount)" -eq 1 ] && [ "$(q_ops "$QB")" = noop ]; echo $?) "rc=$CLI_RC $(run_view) $(qlist)"
i=0; while [ "$i" -lt "${NOPT:-0}" ]; do
  newcase "v1-opt$i"; : > "$ST/FROZEN"; wave --freeze "$SOFT_MSG"; QB=$(qid_behind); B=$(cks "$ST/FROZEN")
  tap "$QB" "$i"
  check "V1b.$i BREAK? (P1, real desk) option $i of the behind-question: FROZEN byte-identical, class hard, deploy REFUSED" $([ "$(cks "$ST/FROZEN")" = "$B" ] && [ "$(wave_class)" = hard ] && _contains "$(deploy_gate)" REFUSED; echo $?) "rc=$RC $ANS $(run_view)"
  i=$((i+1))
done
echo "══ V2 · H14: a HARD freeze whose write fails (EFBIG), then the 0-byte leftover + a soft --freeze ══"
newcase v2a; efbig_n 0 ignore --freeze "$HARD_MSG"
check "V2a rc=5, 'could not write FROZEN', no FROZEN created, no temp, no question, never 'FROZEN (hard)'" $([ "$CLI_RC" -eq 5 ] && grep -q 'could not write FROZEN' "$C/say.txt" && [ ! -e "$ST/FROZEN" ] && [ "$(tmp_left "$ST")" -eq 0 ] && [ "$(qcount)" -eq 0 ] && ! grep -q '⛔ FROZEN (hard)' "$C/say.txt"; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
newcase v2b; efbig_n 0 default --freeze "$HARD_MSG"
info "V2b launchd default (SIGXFSZ not ignored): rc=$CLI_RC · $(tr '\n' '|' < "$C/say.txt" | cut -c1-160) · FROZEN $([ -e "$ST/FROZEN" ] && echo present || echo absent) · temps left=$(tmp_left "$ST")"
check "V2b (P2) default SIGXFSZ: no FROZEN created, never reported recorded ('FROZEN (hard)' absent), no question" $([ "$CLI_RC" -ne 0 ] && [ ! -e "$ST/FROZEN" ] && ! grep -q '⛔ FROZEN (hard)' "$C/say.txt" && [ "$(qcount)" -eq 0 ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
newcase v2c; : > "$ST/FROZEN"; wave --freeze "$SOFT_MSG"
check "V2c BREAK? (P1) the 0-byte leftover + phone soft --freeze: class HARD, deploy REFUSED" $([ "$(wave_class)" = hard ] && _contains "$(deploy_gate)" "REFUSED: hard freeze"; echo $?) "$(run_view)"
echo "══ V3 · H15: '2026-09-1' (no newline) + soft --freeze; a full hard line without newline + soft --freeze ══"
newcase v3a; printf '2026-09-1' > "$ST/FROZEN"; wave --freeze "$SOFT_MSG"; QB=$(qid_behind)
check "V3a BREAK? (P1) the fragment is kept on its own line, class HARD, deploy REFUSED; no false 'not a regular file'" $([ "$CLI_RC" -eq 0 ] && [ "$(line_n 1)" = "2026-09-1" ] && [ "$(wave_class)" = hard ] && _contains "$(deploy_gate)" REFUSED && ! grep -q 'not a regular file' "$C/say.txt"; echo $?) "rc=$CLI_RC $(cat -v "$ST/FROZEN") $(cat "$C/say.txt")"
NOPT=$(q_nopts "$QB"); i=0; while [ "$i" -lt "${NOPT:-0}" ]; do
  newcase "v3a-opt$i"; printf '2026-09-1' > "$ST/FROZEN"; wave --freeze "$SOFT_MSG"; QB=$(qid_behind); B=$(cks "$ST/FROZEN"); tap "$QB" "$i"
  check "V3b.$i BREAK? (P1, real desk) option $i: FROZEN byte-identical and hard" $([ "$(cks "$ST/FROZEN")" = "$B" ] && [ "$(wave_class)" = hard ]; echo $?) "rc=$RC $ANS $(run_view)"
  i=$((i+1))
done
newcase v3c; wave --freeze "$HARD_MSG"; QH=$(qid_hard); printf '%s' "$(cat "$ST/FROZEN")" > "$ST/FROZEN.x" && mv "$ST/FROZEN.x" "$ST/FROZEN"
wave --freeze "$SOFT_MSG"
check "V3c BREAK? (P1) a full hard line without newline + soft: 2 separate well-formed lines, class hard" $([ "$CLI_RC" -eq 0 ] && [ "$(nlines)" -eq 2 ] && [ "$(wf_hard)" -eq 1 ] && [ "$(wf_soft)" -eq 1 ] && [ "$(wave_class)" = hard ]; echo $?) "rc=$CLI_RC $(cat -v "$ST/FROZEN")"
tap "$QH" "$(lift_idx "$QH")"
check "V3d the hard question's OWN Lift lifts exactly its line; the soft hold stays (class soft — the stop asked about was lifted)" $([ "$RC" -eq 0 ] && [ "$(nlines)" -eq 1 ] && [ "$(wf_soft)" -eq 1 ] && [ "$(wave_class)" = soft ]; echo $?) "rc=$RC $ANS"
echo "══ V4 · reader fail-safe: a FROZEN that exists but is not a regular file ══"
for shape in dir fifo devnull link-dir link-fifo; do
  newcase "v4-$shape"; mkdir -p "$C/else"
  case "$shape" in dir) mkdir "$ST/FROZEN";; fifo) mkfifo "$ST/FROZEN";; devnull) ln -s /dev/null "$ST/FROZEN";;
    link-dir) mkdir "$C/else/D"; ln -s "$C/else/D" "$ST/FROZEN";; link-fifo) mkfifo "$C/else/P"; ln -s "$C/else/P" "$ST/FROZEN";; esac
  c=$(wave_class); d=$(deploy_gate)
  gl=$($TO 10 /opt/homebrew/bin/bash -c 'H=$1 R=$2 S=$3; export HOME="$H"; cd "$R"; set -- plan; . "$S" >/dev/null 2>&1; frozen=""; freeze_class=""; hard=""; if [ -e "$FREEZE" ]; then frozen=1; freeze_class=$(freeze_class_now); [ "$freeze_class" = hard ] && hard=1; fi; printf "run_once:%s|" "${hard:-not-hard}"; if [ -e "$FREEZE" ]; then [ "$(freeze_class_now)" = hard ] && printf goal:ends || printf goal:continues; else printf goal:unfrozen; fi' _ "$HM" "$ROOT" "$TMP/ship-wave.sh" 2>&1)
  check "V4a ($shape) BREAK? the wave's gates read HARD without blocking: class=hard, deploy REFUSED, run_once hard=1, goal loop ends" $([ "$c" = hard ] && _contains "$d" "REFUSED: hard freeze" && [ "$gl" = "run_once:1|goal:ends" ]; echo $?) "class=$c · $d · $gl"
  wave_bounded --freeze "$SOFT_MSG"
  check "V4b ($shape) a soft --freeze onto it: rc=5 with a TRUE refusal, nothing reported recorded, still hard" $([ "$CLI_RC" -eq 5 ] && grep -q 'could not \(record the stop\|write FROZEN\)' "$C/say.txt" && ! grep -q '⛔ FROZEN (' "$C/say.txt" && [ "$(wave_class)" = hard ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
done
newcase v4-dangling; ln -s "$C/nowhere/F" "$ST/FROZEN"
info "V4c (spec gap) a DANGLING symlink FROZEN reads: -e=$([ -e "$ST/FROZEN" ] && echo true || echo false) → wave view '$(wave_class)' · $(deploy_gate | cut -c1-40) (only a hand-made link can dangle: freeze() creates the target, the desk removes the link itself)"
newcase v4-loop; ln -s "$ST/FROZEN" "$ST/FROZEN" 2>/dev/null
info "V4d (spec gap) a self-looping symlink FROZEN reads: -e=$([ -e "$ST/FROZEN" ] && echo true || echo false) → wave view '$(wave_class)' · $(deploy_gate | cut -c1-40)"

echo "════════ PART 2 · the round-8 INVARIANT under crash, full disk, permissions, replacement and races ════════"
echo "══ I1 · kill -9 between the temp write and the rename ══"
newcase i1a; wave --freeze "$HARD_MSG"; B=$(cks "$ST/FROZEN"); Q0=$(qcount); : > "$C/say.txt"
wave_src "chmod() { kill -9 \$\$; }; freeze '$SOFT_MSG'; echo CONTINUED"
check "I1a BREAK? (P2) killed at the rename: FROZEN byte-identical (hard), nothing reported recorded, no new question" $([ "$SRC_RC" -eq 137 ] && [ "$(cks "$ST/FROZEN")" = "$B" ] && [ "$(wave_class)" = hard ] && ! grep -q '⛔ FROZEN (' "$C/say.txt" && [ "$(qcount)" -eq "$Q0" ]; echo $?) "rc=$SRC_RC $(cat "$C/say.txt") $(run_view)"
info "I1a stale temp files left beside FROZEN after the kill: $(tmp_left "$ST") (readers never read them)"
t0=$(date +%s); wave_bounded --freeze "$SOFT_MSG"; t1=$(date +%s)
check "I1b the lock died with the process: the next --freeze records in < 15 s, class still hard, the stale temp does not change the class" $([ "$CLI_RC" -eq 0 ] && [ $((t1-t0)) -lt 15 ] && [ "$(wf_soft)" -eq 1 ] && [ "$(wave_class)" = hard ]; echo $?) "rc=$CLI_RC $((t1-t0))s $(cat "$C/say.txt" | tail -3)"
newcase i1c; : > "$ST/FROZEN"
wave_src "chmod() { kill -9 \$\$; }; freeze '$HARD_MSG'; echo CONTINUED"
check "I1c killed at the rename on an EMPTY FROZEN (synthetic-line path): still 0 bytes, hard, nothing reported" $([ "$SRC_RC" -eq 137 ] && [ -f "$ST/FROZEN" ] && [ ! -s "$ST/FROZEN" ] && [ "$(wave_class)" = hard ] && ! grep -q '⛔ FROZEN (' "$C/say.txt"; echo $?) "rc=$SRC_RC $(run_view)"
newcase i1d; wave --freeze "$HARD_MSG"; Q0=$(qcount); : > "$C/say.txt"
wave_src "grep() { if [ \"\${@: -1}\" = \"\$FREEZE\" ]; then kill -9 \$\$; fi; command grep \"\$@\"; }; freeze '$SOFT_MSG'; echo CONTINUED"
check "I1d killed AFTER the rename, before the read-back: the line IS in FROZEN, class hard, and nothing claimed it was recorded" $([ "$SRC_RC" -eq 137 ] && [ "$(wf_soft)" -eq 1 ] && [ "$(wave_class)" = hard ] && ! grep -q '⛔ FROZEN (' "$C/say.txt"; echo $?) "rc=$SRC_RC $(cat -v "$ST/FROZEN") $(cat "$C/say.txt")"
info "I1d (liveness) questions after a kill between rename and ask: $(qcount) (was $Q0) — the recorded soft hold has no question of its own"

echo "══ I2 · ulimit -f during the temp write ══"
newcase i2a; wave --freeze "$HARD_MSG"; wave --freeze "$(long_soft 1200)"; B=$(cks "$ST/FROZEN"); Q0=$(qcount); : > "$C/say.txt"
efbig_n 1 ignore --freeze "Director hold on the calendar module"
check "I2a BREAK? (P2) old content (>1 KB) cannot be copied under ulimit -f 1: rc=5, FROZEN byte-identical, no temp, never reported, no question" $([ "$CLI_RC" -eq 5 ] && [ "$(cks "$ST/FROZEN")" = "$B" ] && [ "$(tmp_left "$ST")" -eq 0 ] && ! grep -q '⛔ FROZEN (' "$C/say.txt" && [ "$(qcount)" -eq "$Q0" ] && [ "$(wave_class)" = hard ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
newcase i2b; wave --freeze "$HARD_MSG"; wave --freeze "$(long_soft 1200)"; B=$(cks "$ST/FROZEN"); : > "$C/say.txt"
efbig_n 1 default --freeze "Director hold on the calendar module"
check "I2b same, SIGXFSZ at its launchd default: FROZEN byte-identical, class hard, never reported" $([ "$CLI_RC" -ne 0 ] && [ "$(cks "$ST/FROZEN")" = "$B" ] && ! grep -q '⛔ FROZEN (' "$C/say.txt" && [ "$(wave_class)" = hard ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
info "I2b rc=$CLI_RC temps left=$(tmp_left "$ST") say=$(tr '\n' '|' < "$C/say.txt" | cut -c1-160)"
newcase i2c; wave --freeze "$(long_soft 700)"; wave --freeze "$HARD_MSG"; B=$(cks "$ST/FROZEN"); sz=$(wc -c < "$ST/FROZEN" | tr -d ' '); : > "$C/say.txt"
efbig_n 1 ignore --freeze "Director hold on the calendar module"
check "I2c the copy fits ($sz B) but the NEW line crosses 1 KB: rc=5, FROZEN byte-identical, class hard, never reported" $([ "$CLI_RC" -eq 5 ] && [ "$(cks "$ST/FROZEN")" = "$B" ] && [ "$(tmp_left "$ST")" -eq 0 ] && ! grep -q '⛔ FROZEN (' "$C/say.txt" && [ "$(wave_class)" = hard ]; echo $?) "rc=$CLI_RC sz=$sz $(cat "$C/say.txt")"

echo "══ I3 · a read-only directory ══"
newcase i3a; wave --freeze "$HARD_MSG"; B=$(cks "$ST/FROZEN"); Q0=$(qcount); : > "$C/say.txt"; chmod 555 "$ST"
wave --freeze "$SOFT_MSG"; chmod 755 "$ST"
check "I3a BREAK? (P2) STATE read-only, FROZEN itself writable: rc=5 'could not write FROZEN (Permission denied)', FROZEN identical, hard, never reported" $([ "$CLI_RC" -eq 5 ] && grep -q 'could not write FROZEN (Permission denied)' "$C/say.txt" && [ "$(cks "$ST/FROZEN")" = "$B" ] && [ "$(wave_class)" = hard ] && ! grep -q '⛔ FROZEN (' "$C/say.txt" && [ "$(qcount)" -eq "$Q0" ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
newcase i3b; mkdir -p "$ST/questions"; chmod 555 "$ST"
wave --freeze "$HARD_MSG"; chmod 755 "$ST"
check "I3b no FROZEN + read-only STATE + a HARD freeze: rc=5, no FROZEN, never reported recorded" $([ "$CLI_RC" -eq 5 ] && [ ! -e "$ST/FROZEN" ] && ! grep -q '⛔ FROZEN (' "$C/say.txt"; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
info "I3b (spec gap, X1) after the refused HARD freeze the wave's next run reads '$(wave_class)' — the stop could not be recorded, so nothing on disk says hard"

echo "══ I4 · FROZEN replaced by another process between the class read and the rename (hook in mktemp) ══"
# I4a: a LOCK-RESPECTING writer — the real desk lifting a soft line — fires inside the window; it must wait, then lift only its line
newcase i4a; wave --freeze "Director hold on the calendar module"; QS0=$(qid_soft)
wave_src "mktemp() { ( exec 7>&-; env -i PATH=\"$PLAIN_PATH\" HOME=\"$HM\" STATE=\"$ST\" SHIP_WAVE_DIR=\"$TMP\" /opt/homebrew/bin/bash \"$DESK\" answer \"$QS0\" 1 > \"$C/desk.out\" 2>&1; echo \"desk-done\" >> \"$C/order\" ) </dev/null >/dev/null 2>&1 & sleep 1; command mktemp \"\$@\"; }; freeze '$HARD_MSG'; echo \"freeze-done\" >> \"$C/order\"; wait"
sleep 1
check "I4a BREAK? (P1) a soft Lift tapped INSIDE a hard freeze's window: the desk waited for the lock, lifted only its soft line; the hard line is in FROZEN, class hard" $([ "$SRC_RC" -eq 0 ] && _contains "$(cat "$C/desk.out")" "lifted 1 line(s); 1 still on — a HARD stop is still in force" && [ "$(wf_hard)" -eq 1 ] && [ "$(wf_soft)" -eq 0 ] && [ "$(wave_class)" = hard ] && _contains "$(deploy_gate)" REFUSED; echo $?) "rc=$SRC_RC order=$(tr '\n' ' ' < "$C/order") desk=$(cat "$C/desk.out") $(cat -v "$ST/FROZEN")"
# I4b: a LOCKLESS remover — `--unfreeze` — fires inside the window, at two points
for hook in mktemp chmod; do
  newcase "i4b-$hook"; wave --freeze "$HARD_MSG"; : > "$C/say.txt"
  wave_src "$hook() { env -i PATH=\"$PLAIN_PATH\" HOME=\"$HM\" /opt/homebrew/bin/bash \"$TMP/ship-wave.sh\" --unfreeze > \"$C/unfreeze.out\" 2>&1; command $hook \"\$@\"; }; freeze '$SOFT_MSG'"
  if grep -q '⛔ FROZEN (' "$C/say.txt"; then claimed=1; else claimed=0; fi
  check "I4b.$hook (P2) --unfreeze inside a soft freeze's window: a stop reported recorded IS in FROZEN (by its exact message); a refused one is not claimed" $( { [ "$claimed" -eq 1 ] && [ "$SRC_RC" -eq 0 ] && [ "$(awk -F'\t' -v m="$SOFT_MSG" '$2==m' "$ST/FROZEN" 2>/dev/null | wc -l | tr -d ' ')" -eq 1 ]; } || { [ "$claimed" -eq 0 ] && [ "$SRC_RC" -eq 5 ]; }; echo $?) "rc=$SRC_RC claimed=$claimed $(cat "$C/say.txt" | head -2) $(run_view)"
  info "I4b.$hook (honesty/spec gap) freeze rc=$SRC_RC '$(grep -m1 '⛔' "$C/say.txt" | cut -c1-120)' · --unfreeze printed '$(cat "$C/unfreeze.out")' · afterwards the wave reads '$(wave_class)' with $(nlines) line(s)"
done
# I4c: a LOCKLESS hand writer replaces FROZEN with an extra hard line inside the window (no wave writer does this)
for hook in mktemp chmod; do
  newcase "i4c-$hook"; wave --freeze "Director hold on the calendar module"
  wave_src "$hook() { { cat \"\$FREEZE\"; printf '%s\t%s\thard\tx\n' '2026-09-11 00:00:00' 'hand-added APPLY failed'; } > \"\$FREEZE.hand\"; mv \"\$FREEZE.hand\" \"\$FREEZE\"; command $hook \"\$@\"; }; freeze '$SOFT_MSG'"
  info "I4c.$hook (spec gap) a lockless HAND-written hard line landing inside the window: wave reads '$(wave_class)', hand line present=$(grep -c 'hand-added' "$ST/FROZEN")"
done

echo "══ I5 · racing --freeze commands (and a racing desk tap) ══"
for trial in 1 2 3 4; do
  newcase "i5-$trial"; [ $((trial % 2)) -eq 0 ] && wave --freeze "$HARD_MSG"; base=$(nlines)
  for p in a b c d; do
    case $p in a|c) m="peer hold on #34$trial$p trial race";; b) m="Director hold race $trial";; d) m="migration 2026090621300$trial: APPLY failed — race $p";; esac
    printf '%s\n' "$m" > "$C/msg.$p"; wave_to "$C/out.$p" --freeze "$m" &
  done; wait
  okn=0; lost=0; bad=0
  for p in a b c d; do
    r=$(cat "$C/out.$p.rc"); m=$(cat "$C/msg.$p")
    if [ "$r" -eq 0 ]; then okn=$((okn+1)); [ "$(awk -F'\t' -v m="$m" '$2==m' "$ST/FROZEN" | wc -l | tr -d ' ')" -eq 1 ] || lost=$((lost+1))
    elif [ "$r" -ne 5 ] || grep -q '⛔ FROZEN (' "$C/out.$p"; then bad=$((bad+1)); fi
  done
  check "I5.$trial BREAK? (P2) 4 concurrent --freeze (2 soft, 1 soft, 1 hard; base $base): every rc=0 line reads back exactly once, no rc=5 claims a record, class hard, lines = base+recorded, no temp" $([ "$lost" -eq 0 ] && [ "$bad" -eq 0 ] && [ "$okn" -ge 1 ] && [ "$(nlines)" -eq $((base+okn)) ] && [ "$(wave_class)" = hard ] && [ "$(tmp_left "$ST")" -eq 0 ]; echo $?) "ok=$okn lost=$lost bad=$bad lines=$(nlines) class=$(wave_class) rcs=$(cat "$C"/out.*.rc | tr '\n' ' ')"
done
newcase i5-desk; wave --freeze "Director hold on the calendar module"; QS0=$(qid_soft)
( tap "$QS0" 1; echo "$RC $ANS" > "$C/tap.out" ) & wave_to "$C/out.h" --freeze "$HARD_MSG" & wait
check "I5-desk BREAK? (P1) a soft Lift tap racing a HARD --freeze: the hard line survives, class hard, deploy REFUSED" $([ "$(cat "$C/out.h.rc")" -eq 0 ] && [ "$(wf_hard)" -eq 1 ] && [ "$(wave_class)" = hard ] && _contains "$(deploy_gate)" REFUSED; echo $?) "tap=$(cat "$C/tap.out") $(cat -v "$ST/FROZEN")"

echo "══ I6 · soft → hard (full disk: EFBIG) → soft ══"
newcase i6; wave --freeze "Director hold on the calendar module"; B=$(cks "$ST/FROZEN"); c1=$(wave_class)
efbig_n 0 ignore --freeze "$HARD_MSG"; rc2=$CLI_RC; c2=$(wave_class); B2=$(cks "$ST/FROZEN")
wave --freeze "$SOFT_MSG"; c3=$(wave_class)
check "I6 (P2) each call: class never lower than before it ($c1 → $c2 → $c3), the failed hard freeze rc=5 and never reported recorded, FROZEN untouched by it" $([ "$(rank "$c2")" -ge "$(rank "$c1")" ] && [ "$(rank "$c3")" -ge "$(rank "$c2")" ] && [ "$rc2" -eq 5 ] && [ "$B2" = "$B" ] && ! grep -q '⛔ FROZEN (hard)' "$C/say.txt"; echo $?) "$(cat "$C/say.txt")"
info "I6 (spec gap, X1) the hard stop that could not be recorded leaves the wave reading '$c3' — deploy gate: $(deploy_gate | cut -c1-60)"

echo "══ I7 · an EMPTY FROZEN + a HARD --freeze ══"
newcase i7a; : > "$ST/FROZEN"; wave --freeze "$HARD_MSG"; QH=$(qid_hard)
check "I7a synthetic hard line + the new hard line, class hard" $([ "$CLI_RC" -eq 0 ] && [ "$(nlines)" -eq 2 ] && [ "$(line_n 1 | cut -f2)" = "$EMPTY_SYN" ] && [ "$(wave_class)" = hard ]; echo $?) "$(cat -v "$ST/FROZEN")"
tap "$QH" "$(lift_idx "$QH")"
check "I7b BREAK? (P1) the hard question's Lift removes its own line only: the empty-file hardness stays, deploy REFUSED" $([ "$RC" -eq 0 ] && [ "$(nlines)" -eq 1 ] && [ "$(wave_class)" = hard ] && _contains "$(deploy_gate)" REFUSED; echo $?) "rc=$RC $ANS $(run_view)"
newcase i7c; : > "$ST/FROZEN"; wave --freeze "$EMPTY_SYN"; QH=$(qid_hard)
info "I7c FROZEN after a phone --freeze whose text is the synthetic line's own text: $(nlines) lines, distinct sha1s=$(cut -f5 "$ST/FROZEN" | sort -u | wc -l | tr -d ' ')"
tap "$QH" "$(lift_idx "$QH")"
check "I7c BREAK? (P1) EMPTY FROZEN + phone --freeze \"$EMPTY_SYN\": the Lift on the question asked about the NEW stop must not also remove the empty-file hardness" $([ -e "$ST/FROZEN" ] && [ "$(wave_class)" = hard ] && _contains "$(deploy_gate)" REFUSED; echo $?) "tap rc=$RC $ANS · $(run_view)"

newcase i7d; printf '\n' > "$ST/FROZEN"; wave --freeze "$EMPTY_SYN"; QH=$(qid_hard); tap "$QH" "$(lift_idx "$QH")"
check "I7d the same collision on a BLANK-only FROZEN (not 0 bytes): the blank line stays, still hard (the break needs exactly 0 bytes)" $([ -e "$ST/FROZEN" ] && [ "$(wave_class)" = hard ]; echo $?) "tap rc=$RC $ANS · $(run_view)"
info "I7e (context) a 0-byte FROZEN is also what a rename-without-fsync can leave after a power loss on some filesystems — NOT reproduced here; the round-8 fix itself treats the 0-byte file as reachable (R8-2/R8-3/R8-4c)"

echo "══ I8 · an UNTERMINATED hard line + a soft --freeze ══"
newcase i8a; wave --freeze "$HARD_MSG"; QH=$(qid_hard); printf '%s' "$(cat "$ST/FROZEN")" > "$ST/F.x"; mv "$ST/F.x" "$ST/FROZEN"
wave --freeze "$SOFT_MSG"; QB=$(qid_behind)
check "I8a BREAK? (P1) the hard line keeps its own line, class hard, behind-question noop-only" $([ "$CLI_RC" -eq 0 ] && [ "$(wf_hard)" -eq 1 ] && [ "$(wf_soft)" -eq 1 ] && [ "$(wave_class)" = hard ] && [ "$(q_ops "$QB")" = noop ]; echo $?) "$(cat -v "$ST/FROZEN")"
B=$(cks "$ST/FROZEN"); tap "$QB" 0; tap "$(qid_behind)" 1 2>/dev/null
check "I8b BREAK? (P1, real desk) the behind-question's taps change nothing" $([ "$(cks "$ST/FROZEN")" = "$B" ] && [ "$(wave_class)" = hard ]; echo $?) "rc=$RC $ANS"
for cut in sha class; do
  newcase "i8-$cut"; wave --freeze "$HARD_MSG"; QH=$(qid_hard); L=$(cat "$ST/FROZEN")
  case $cut in sha) printf '%s' "${L:0:$((${#L}-20))}" > "$ST/FROZEN";; class) printf '%s' "$(printf '%s' "$L" | cut -f1,2)	ha" > "$ST/FROZEN";; esac
  wave --freeze "$SOFT_MSG"; tap "$QH" "$(lift_idx "$QH")"
  check "I8c ($cut cut short, unterminated) BREAK? (P1) + soft --freeze + the ORIGINAL hard question's Lift: still hard, deploy REFUSED" $([ "$(wave_class)" = hard ] && _contains "$(deploy_gate)" REFUSED; echo $?) "rc=$RC $ANS $(cat -v "$ST/FROZEN" | cut -c1-200)"
done
newcase i8-nul; printf '2026-09-11 21:00:00\tmigration 1: APPLY fai\0\0\0\0' > "$ST/FROZEN"; wave --freeze "$HARD_MSG"
info "I8d (honesty) a zero-filled tail (crash shape) + a HARD --freeze: rc=$CLI_RC · $(grep -m1 '⛔' "$C/say.txt" | cut -c1-140) · class=$(wave_class)"

echo "════════ PART 3 · a REAL full disk (4 MB HFS+ RAM disk, 4 KB blocks) ════════"
RAMDEV=""; RAMMNT="$TMP/ram"; mkdir -p "$RAMMNT"
if command -v hdiutil >/dev/null && RAMDEV=$(hdiutil attach -nomount ram://8192 2>/dev/null | awk '/^\/dev\//{print $1; exit}') && [ -n "$RAMDEV" ] \
   && newfs_hfs -v w12v8 -b 4096 "$RAMDEV" >/dev/null 2>&1 && mount -t hfs "$RAMDEV" "$RAMMNT" 2>/dev/null; then
  ramcase() { C="$TMP/$1"; mkdir -p "$C"; HM="$RAMMNT/$1/home"; ST="$HM/.config/obsidian/.ship-wave"; mkdir -p "$ST"; : > "$C/say.txt"; }   # receipts off the RAM disk
  fill_to() {  # $1 = blocks to leave free
    dd if=/dev/zero of="$RAMMNT/filler" bs=4096 2>/dev/null
    python3 -c 'import os,sys;p=sys.argv[1];os.truncate(p,max(0,os.path.getsize(p)-4096*int(sys.argv[2])))' "$RAMMNT/filler" "$1"; sync
  }
  free_all() { rm -f "$RAMMNT/filler"; }
  echo "══ D1 · freeze() on a full disk ══"
  ramcase d1; wave --freeze "$HARD_MSG"; B=$(cks "$ST/FROZEN"); fill_to 0; : > "$C/say.txt"
  wave --freeze "$SOFT_MSG"; free_all
  check "D1a BREAK? (P2) ENOSPC, 0 blocks free: rc=5 'could not write FROZEN (No space left on device)', FROZEN identical, hard, never reported" $([ "$CLI_RC" -eq 5 ] && grep -q 'No space left' "$C/say.txt" && [ "$(cks "$ST/FROZEN")" = "$B" ] && [ "$(wave_class)" = hard ] && ! grep -q '⛔ FROZEN (' "$C/say.txt" && [ "$(tmp_left "$ST")" -eq 0 ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
  ramcase d1b; wave --freeze "$HARD_MSG"; wave --freeze "$(long_soft $((4096-168-$(wc -c < "$ST/FROZEN"))))"; sz=$(wc -c < "$ST/FROZEN" | tr -d ' '); B=$(cks "$ST/FROZEN"); fill_to 1; : > "$C/say.txt"
  wave --freeze "Director hold on the calendar module"; free_all
  check "D1b BREAK? (P2) FROZEN = exactly one block ($sz B), 1 block free: the copy fits, the new line needs a 2nd block → rc=5, FROZEN identical, hard" $([ "$CLI_RC" -eq 5 ] && [ "$(cks "$ST/FROZEN")" = "$B" ] && [ "$(wave_class)" = hard ] && ! grep -q '⛔ FROZEN (' "$C/say.txt" && [ "$(tmp_left "$ST")" -eq 0 ]; echo $?) "rc=$CLI_RC sz=$sz $(cat "$C/say.txt")"
  echo "══ D2 · the DESK's scoped unfreeze on a full disk (slice A: v5-w12-desk.sh apply_write unfreeze) ══"
  ramcase d2; wave --freeze "Director hold on the calendar module"; QS0=$(qid_soft)
  wave --freeze "$(long_soft 3928)"; L2=$(line_n 2 | wc -c | tr -d ' ')
  wave --freeze "$HARD_MSG"; QH=$(qid_hard)
  check "D2 precondition: FROZEN = soft S0 (its own Lift question) · soft S1 (exactly 4096 B, got $L2) · HARD H; class hard" $([ "$(nlines)" -eq 3 ] && [ "$L2" -eq 4096 ] && [ "$(wave_class)" = hard ] && [ -n "$QS0" ] && [ "$(q_ops "$QS0")" = "noop unfreeze" ]; echo $?) "$(cut -f2,3 "$ST/FROZEN" | cut -c1-60)"
  fill_to 1; tap "$QS0" "$(lift_idx "$QS0")"; free_all
  check "D2 BREAK? (P1, real desk, ENOSPC) the Lift on S0's question (asked while soft) must not remove the HARD line H: class hard, deploy REFUSED" $([ "$(wf_hard)" -eq 1 ] && [ "$(wave_class)" = hard ] && _contains "$(deploy_gate)" REFUSED; echo $?) "tap rc=$RC · $(printf '%s' "$ANS" | tr '\n' ' ' | cut -c1-260) · now: $(nlines) line(s) $(cut -f3 "$ST/FROZEN" | tr '\n' ' ') · $(run_view)"
  check "D2 (HONESTY) the desk receipt's line count matches FROZEN" $(_contains "$ANS" "$(( $(nlines) )) soft line(s) still on" || _contains "$ANS" "$(( $(nlines) )) still on"; echo $?) "receipt: $(printf '%s' "$ANS" | grep 'unfreeze' | cut -c1-200) · FROZEN has $(nlines) line(s)"
  ramcase d3; wave --freeze "Director hold on the calendar module"; QS0=$(qid_soft)
  wave --freeze "migration 20260906213000: APPLY failed — $(head -c 6000 /dev/zero | tr '\0' b)"; QH=$(qid_hard)
  fill_to 1; tap "$QS0" "$(lift_idx "$QS0")"; free_all
  D3B=$(wc -c < "$ST/FROZEN" 2>/dev/null | tr -d ' ')
  info "D3 S0 + a 6 KB HARD line, 1 block free, S0's Lift: FROZEN now ${D3B:-absent} B, class=$(wave_class) · receipt: $(printf '%s' "$ANS" | grep unfreeze | cut -c1-140)"
  if [ "${D3B:-x}" = 0 ]; then
    wave --freeze "$EMPTY_SYN"; QX=$(qid_hard); tap "$QX" "$(lift_idx "$QX")"
    check "D3 BREAK? (P1) chain from a 0-byte FROZEN the desk itself left on a full disk → phone --freeze \"$EMPTY_SYN\" → its Lift: still hard" $([ -e "$ST/FROZEN" ] && [ "$(wave_class)" = hard ] && _contains "$(deploy_gate)" REFUSED; echo $?) "tap rc=$RC $(printf '%s' "$ANS" | grep unfreeze) · $(run_view)"
  else
    skip "D3 chain — the desk's full-disk rewrite left ${D3B:-no} bytes, not 0, on this volume (a partial line reads hard): I7c covers the 0-byte start"
  fi
  umount "$RAMMNT" 2>/dev/null || diskutil unmount force "$RAMMNT" >/dev/null 2>&1; hdiutil detach "$RAMDEV" >/dev/null 2>&1
else
  skip "PART 3 — could not attach/format/mount a RAM disk (hdiutil/newfs_hfs/mount unavailable); ENOSPC cases not run"
  [ -n "$RAMDEV" ] && hdiutil detach "$RAMDEV" >/dev/null 2>&1
fi

echo "══ SAFETY ══"
check "S1 live ~/.config/obsidian/.ship-wave/FROZEN unchanged by this run (was: $LIVE_FROZEN_BEFORE)" $([ "$( [ -e "$HOME/.config/obsidian/.ship-wave/FROZEN" ] && echo present || echo absent )" = "$LIVE_FROZEN_BEFORE" ]; echo $?) "live FROZEN state changed"
for f in "$SW/ship-wave.sh" "$0"; do /opt/homebrew/bin/bash -n "$f" && ok "bash -n $(basename "$f")" || bad "bash -n $(basename "$f")"; done
echo "=== $PASS passed · $FAIL failed · fixtures in $TMP ==="
[ "$FAIL" -eq 0 ]

#!/opt/homebrew/bin/bash
# tests/verify-freeze-classes-adversarial-v9.sh — NINTH (fresh) adversarial pass over slice A (desk, round-8 D2 fix ad9b634019) and
# slice B (freeze classes, round-9 I7c fix 88510777c8) TOGETHER. The wave is B's REAL ship-wave.sh (a full copy) run under
# env -i PATH HOME (C locale); every tap goes through A's REAL `v5-w12-desk.sh answer`. Temp HOME/$STATE only.
# Part 1 re-attempts I7c and D2 with the SAME inputs (D2 on ulimit -f in both SIGXFSZ modes AND on a real 8 MB HFS+ RAM disk,
# detached at the end). Part 2 attacks the two fixes: the desk rewrite failing on the first / middle / last kept line, at the
# exact byte boundary, on a rename that fails, through relative and full-volume symlinks, under a UTF-8 terminal locale with raw
# bytes; a Lift racing a wave freeze() in both orders; 18 phone --freeze spellings of the reserved kept-hard text; the kept-hard
# line against every option of every question on 16 wave-reachable shapes. PROPERTY (P1) no phone tap / phone --freeze removes
# or downgrades a stop whose class reads HARD; (P2) no FROZEN writer lowers the class except by removing exactly the line the
# Director chose to lift, and none reports a change it did not make. "BREAK?" cases assert the property; INFO = spec-gap probes.
# Run from the worktree root:  bash scripts/ship-wave/tests/verify-freeze-classes-adversarial-v9.sh   (DESK_SW=<desk ship-wave dir>)
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"
BROOT=$(cd "$(dirname "$0")/../../.." && pwd); B="$BROOT/scripts/ship-wave"
A="${DESK_SW:-/Users/omm/PROJECTS/MyJKKN/.worktrees/hitl-desk/scripts/ship-wave}"
[ -f "$B/desk-questions.sh" ] && A="$B"
[ -f "$A/desk/v5-w12-desk.sh" ] && [ -f "$A/desk-questions.sh" ] || { echo "no desk at $A"; exit 2; }
export LC_ALL=C
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-freeze-v9.XXXXXX")
W="$TMP/wave"; D="$TMP/deskdir"; mkdir -p "$W" "$D"
cp "$B/ship-wave.sh" "$W/ship-wave.sh"
for f in "$B"/*.sh "$B"/*.py; do [ "$(basename "$f")" = ship-wave.sh ] || ln -s "$f" "$W/$(basename "$f")"; done
ln -s "$A/desk-questions.sh" "$W/desk-questions.sh"
awk '/^if \[ -n "\$GOAL" \]; then$/ {exit} {print}' "$B/ship-wave.sh" > "$W/sw-src.sh"
for f in failure-ledger.sh policy-learning.sh desk-questions.sh; do ln -s "$A/$f" "$D/$f"; done
DESK="$A/desk/v5-w12-desk.sh"
PLAIN_PATH="/opt/homebrew/bin:/usr/bin:/bin"; TO=/opt/homebrew/bin/timeout
LIVE_BEFORE=$(cksum < "$HOME/.config/obsidian/.ship-wave/FROZEN" 2>/dev/null || echo absent)
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'FAIL  %s\n      %s\n' "$1" "${2:-}"; }
check() { if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1" "$3"; fi; }
info() { printf 'INFO  %s\n' "$*"; }
has() { case "$1" in *"$2"*) return 0;; *) return 1;; esac; }
newcase() { C="$TMP/c/$1"; HM="${2:-$C/home}"; ST="$HM/.config/obsidian/.ship-wave"; mkdir -p "$ST" "$C"; : > "$C/say.txt"; }
wave() { env -i PATH="$PLAIN_PATH" HOME="$HM" /opt/homebrew/bin/bash "$W/ship-wave.sh" "$@" >> "$C/say.txt" 2>&1; CLI_RC=$?; }
src() { $TO 20 env -i PATH="$PLAIN_PATH" HOME="$HM" /opt/homebrew/bin/bash -c 'R=$1 S=$2 CODE=$3; cd "$R"; set -- plan; . "$S" >/dev/null 2>&1; eval "$CODE"' _ "$BROOT" "$W/sw-src.sh" "$1" 2>/dev/null; }
wave_class() { [ -e "$ST/FROZEN" ] || [ -L "$ST/FROZEN" ] || { printf none; return; }; src 'freeze_class_now'; }
gate() { src 'MODE=go; if deploy_allowed; then echo ALLOWED; else echo "REFUSED: $DEPLOY_BLOCK"; fi'; }
tap() { ANS=$(env -i PATH="$PLAIN_PATH" HOME="$HM" STATE="$ST" SHIP_WAVE_DIR="$D" FLEET_MD="$C/fleet.md" /opt/homebrew/bin/bash "$DESK" answer "$1" "$2" 2>&1); RC=$?; }
# tap under a file-size limit: $1 KB, $2 ignore|default
tap_lim() { local lim="$1" x="$2"; shift 2
  ANS=$(env -i PATH="$PLAIN_PATH" HOME="$HM" STATE="$ST" SHIP_WAVE_DIR="$D" FLEET_MD="$C/fleet.md" /opt/homebrew/bin/bash -c 'L=$1 X=$2; shift 2; [ "$X" = ignore ] && trap "" XFSZ; ulimit -f "$L"; exec /opt/homebrew/bin/bash "$@"' _ "$lim" "$x" "$DESK" answer "$@" 2>&1); RC=$?; }
qlist() { python3 - "$ST/questions" <<'PY'
import json,glob,os,sys
for f in sorted(glob.glob(os.path.join(sys.argv[1],"q-*.json")), key=lambda p: (json.load(open(p))["asked_at"], p)):
    q=json.load(open(f)); ops=[w.get("line_sha1","") for o in q["options"] for w in o["writes"] if w["op"]=="unfreeze"]
    print(q["id"]+"\t"+q["title"]+"\t"+(ops[0] if ops else "-")+"\t"+str(len(q["options"])))
PY
}
qid_t() { qlist 2>/dev/null | awk -F'\t' -v pat="$1" '$2 ~ pat {print $1}' | tail -1; }
qid_hard() { qid_t 'stopped: production'; }
qid_soft() { qid_t 'paused on one item'; }
qid_behind() { qid_t 'HARD stop is already in force'; }
q_nopts() { python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))["options"]))' "$ST/questions/$1.json"; }
lift_idx() { python3 -c 'import json,sys;q=json.load(open(sys.argv[1]));print([i for i,o in enumerate(q["options"]) if any(w["op"]=="unfreeze" for w in o["writes"])][0])' "$ST/questions/$1.json"; }
all_q_shas() { cat "$ST/questions"/q-*.json "$ST/questions"/answered/q-*.json 2>/dev/null | grep -oE '"line_sha1": *"[0-9a-f]{40}"' | grep -oE '[0-9a-f]{40}' | sort -u; }
nlines() { [ -f "$ST/FROZEN" ] && grep -c '' "$ST/FROZEN" || echo 0; }
cks() { cksum < "$1" 2>/dev/null || echo absent; }
tmp_left() { find "$1" -name '.FROZEN.tmp.*' 2>/dev/null | wc -l | tr -d ' '; }
wf() { [ -f "$ST/FROZEN" ] && awk -F'\t' -v c="$1" 'NF>=3 && NF<=5 && $3==c && !(NF==5 && (length($5)!=40 || $5 !~ /^[0-9a-f]+$/))' "$ST/FROZEN" | wc -l | tr -d ' ' || echo 0; }
kept_n() { [ -f "$ST/FROZEN" ] && awk -F'\t' '$4=="kept-hard" && $3=="hard"' "$ST/FROZEN" | wc -l | tr -d ' ' || echo 0; }
kept_sha() { awk -F'\t' '$4=="kept-hard" {print $5}' "$ST/FROZEN" 2>/dev/null | head -1; }
view() { printf 'FROZEN=%s lines=%s class=%s gate=%s' "$([ -e "$ST/FROZEN" ] && echo present || echo GONE)" "$(nlines)" "$(wave_class)" "$(gate | cut -c1-60)"; }
hard_ok() { [ "$(wave_class)" = hard ] && has "$(gate)" REFUSED; }
FORKN=0
fork_home() { FORKN=$((FORKN+1)); mkdir -p "$C/fork-$FORKN"; cp -R "$SNAP" "$C/fork-$FORKN/home"; HM="$C/fork-$FORKN/home"; ST="$HM/.config/obsidian/.ship-wave"; }
snap_home() { SNAPN=$((SNAPN+1)); SNAP="$C/snap$SNAPN"; cp -R "$HM" "$SNAP"; SNAPST="$SNAP/.config/obsidian/.ship-wave"; }
SNAPN=0
snap_qids() { ( ST="$SNAPST"; qlist | cut -f1 ); }
snap_nopts() { python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))["options"]))' "$SNAPST/questions/$1.json"; }
long_soft() { printf 'peer hold %s' "$(head -c "$1" /dev/zero | tr '\0' a)"; }
HARD_MSG="migration 20260906213000: APPLY failed — relation exists"
DESTR_MSG="migration 20260906213000: destructive statement awaiting allow (DROP COLUMN)"
SOFT_MSG="peer hold on #3410 — Director asked to wait"
S0_MSG="Director hold on the calendar module"
KEPT="FROZEN was empty or cut short, reads as hard (fail safe)"
echo "INFO  A desk @ $(git -C "$A" rev-parse --short HEAD) · B wave @ $(git -C "$B" rev-parse --short HEAD) · tmp $TMP"

echo "════ 1 · RE-ATTEMPT I7c (same input) ════"
newcase i7c; : > "$ST/FROZEN"; wave --freeze "$KEPT"
check "I7c-1 0-byte FROZEN + phone --freeze \"$KEPT\": refused rc=2, FROZEN still 0 bytes, no question, class hard, deploy REFUSED" \
  $([ "$CLI_RC" -eq 2 ] && grep -q 'reserved for the wave' "$C/say.txt" && [ -f "$ST/FROZEN" ] && [ ! -s "$ST/FROZEN" ] && [ -z "$(qlist 2>/dev/null)" ] && hard_ok; echo $?) "rc=$CLI_RC $(cat "$C/say.txt") $(view)"
# the round-8 break chain: the WAVE's own freeze onto 0 bytes, then the phone look-alikes in the same second
newcase i7c-chain; : > "$ST/FROZEN"; wave --freeze "$HARD_MSG"; QH=$(qid_hard)
check "I7c-2 0-byte + wave HARD freeze: kept-hard line (field4 kept-hard, 5 fields, valid sha) + H; exactly 1 question, not about the kept-hard line" \
  $([ "$CLI_RC" -eq 0 ] && [ "$(kept_n)" -eq 1 ] && [ "$(nlines)" -eq 2 ] && [ "$(wf hard)" -eq 2 ] && ! all_q_shas | grep -qx "$(kept_sha)" && [ -n "$QH" ]; echo $?) "rc=$CLI_RC $(cat -v "$ST/FROZEN") $(qlist)"
tap "$QH" "$(lift_idx "$QH")"
check "I7c-3 BREAK? (P1) the Lift on H's question leaves the kept-hard line; class hard; deploy REFUSED; receipt says a HARD stop is still in force" \
  $([ "$RC" -eq 0 ] && [ "$(kept_n)" -eq 1 ] && [ "$(nlines)" -eq 1 ] && hard_ok && has "$ANS" "HARD stop is still in force"; echo $?) "rc=$RC $ANS $(view)"

echo "════ 2 · RE-ATTEMPT D2 with ulimit -f (same S0/S1/H shape) ════"
for x in ignore default; do
  newcase "d2u-$x"; wave --freeze "$S0_MSG"; QS0=$(qid_soft); wave --freeze "$(long_soft 1850)"; wave --freeze "$HARD_MSG"
  s1=$(sed -n 2p "$ST/FROZEN" | wc -c | tr -d ' '); s1h=$(sed -n 2,3p "$ST/FROZEN" | wc -c | tr -d ' '); B0=$(cks "$ST/FROZEN")
  check "D2u-$x.0 precondition 3 lines S0 soft/S1 soft ($s1 B)/H hard; S1 fits 2 KB, S1+H ($s1h B) does not; S0 question has a Lift" \
    $([ "$(nlines)" -eq 3 ] && [ "$s1" -lt 2048 ] && [ "$s1h" -gt 2048 ] && [ -n "$QS0" ] && [ "$(wave_class)" = hard ]; echo $?) "$(qlist)"
  tap_lim 2 "$x" "$QS0" "$(lift_idx "$QS0")"
  check "D2u-$x.1 BREAK? (P1) S0's Lift on a 2 KB limit (SIGXFSZ $x): FROZEN byte-identical, class hard, deploy REFUSED, no temp left" \
    $([ "$(cks "$ST/FROZEN")" = "$B0" ] && hard_ok && [ "$(tmp_left "$ST")" -eq 0 ]; echo $?) "rc=$RC $ANS $(view)"
  check "D2u-$x.2 (P2 honesty) the receipt claims nothing lifted and no line count (or the desk died before claiming anything)" \
    $(! has "$ANS" "unfreeze (lifted" && ! has "$ANS" "still on" && { has "$ANS" "nothing lifted" || [ "$RC" -ge 128 ]; }; echo $?) "rc=$RC $ANS"
done

echo "════ 3 · RE-ATTEMPT D2 + attack on a REAL full disk (HFS+ RAM disk) ════"
RAMDEV=""; RAMMNT="$TMP/ram"; mkdir -p "$RAMMNT"
if RAMDEV=$(hdiutil attach -nomount ram://16384 2>/dev/null | awk '/^\/dev\//{print $1; exit}') && [ -n "$RAMDEV" ] \
   && newfs_hfs -v w12r9 -b 4096 "$RAMDEV" >/dev/null 2>&1 && mount -t hfs "$RAMDEV" "$RAMMNT" 2>/dev/null; then
  echo "INFO  RAM disk $RAMDEV at $RAMMNT"
  fill_to() { dd if=/dev/zero of="$RAMMNT/filler" bs=4096 2>/dev/null; python3 -c 'import os,sys;p=sys.argv[1];os.truncate(p,max(0,os.path.getsize(p)-4096*int(sys.argv[2])))' "$RAMMNT/filler" "$1"; sync; }
  free_all() { rm -f "$RAMMNT/filler"; sync; }
  # home ON the RAM disk: FROZEN, questions, ledger all on the full volume
  newcase d2r "$RAMMNT/d2r/home"; wave --freeze "$S0_MSG"; QS0=$(qid_soft)
  wave --freeze "$(long_soft 3928)"; L2=$(sed -n 2p "$ST/FROZEN" | wc -c | tr -d ' '); wave --freeze "$HARD_MSG"; B0=$(cks "$ST/FROZEN")
  check "D2r.0 precondition S0 soft · S1 soft exactly 4096 B (got $L2) · H hard; class hard" $([ "$(nlines)" -eq 3 ] && [ "$L2" -eq 4096 ] && [ "$(wave_class)" = hard ]; echo $?) "$(cut -f3 "$ST/FROZEN" | tr '\n' ' ')"
  fill_to 1; tap "$QS0" "$(lift_idx "$QS0")"; ANS_FULL="$ANS"; RC_FULL=$RC; CK_FULL=$(cks "$ST/FROZEN"); TMPL=$(tmp_left "$RAMMNT"); free_all
  check "D2r.1 BREAK? (P1, ENOSPC, 1 block free) S0's Lift: FROZEN byte-identical, class hard, deploy REFUSED, no temp left" \
    $([ "$CK_FULL" = "$B0" ] && hard_ok && [ "$TMPL" -eq 0 ]; echo $?) "rc=$RC_FULL $ANS_FULL $(view) temps=$TMPL"
  check "D2r.2 (P2 honesty) receipt: 'nothing lifted: could not rewrite the stop file (No space left on device)' ✗ rc 4, no count" \
    $([ "$RC_FULL" -eq 4 ] && has "$ANS_FULL" "nothing lifted: could not rewrite the stop file" && has "$ANS_FULL" "No space left" && ! has "$ANS_FULL" "still on"; echo $?) "rc=$RC_FULL $ANS_FULL"
  info "D2r bookkeeping on the full disk: answered record $(ls "$ST/questions/answered" 2>/dev/null | wc -l | tr -d ' ') · ledger lines $(wc -l < "$ST/failure-ledger.jsonl" 2>/dev/null | tr -d ' ') · open questions $(ls "$ST/questions"/q-*.json 2>/dev/null | wc -l | tr -d ' ')"
  # 0 blocks free
  newcase d2r0 "$RAMMNT/d2r0/home"; wave --freeze "$S0_MSG"; QS0=$(qid_soft); wave --freeze "$SOFT_MSG"; wave --freeze "$HARD_MSG"; B0=$(cks "$ST/FROZEN")
  fill_to 0; tap "$QS0" "$(lift_idx "$QS0")"; A0="$ANS"; R0=$RC; CK0=$(cks "$ST/FROZEN"); T0=$(tmp_left "$RAMMNT"); free_all
  check "D2r0 BREAK? (P1, 0 blocks free) S0's Lift: FROZEN either byte-identical or S0 exactly removed; never lower than hard; receipt matches FROZEN" \
    $(hard_ok && [ "$T0" -eq 0 ] && { { [ "$CK0" = "$B0" ] && ! has "$A0" "still on"; } || { [ "$(nlines)" -eq 2 ] && has "$A0" "2 still on"; }; }; echo $?) "rc=$R0 $A0 $(view) temps=$T0"
  # ATTACK: FROZEN in the (non-full) state dir is a SYMLINK to a file on the full RAM disk
  newcase symfull; mkdir -p "$RAMMNT/symfull"; wave --freeze "$S0_MSG"; QS0=$(qid_soft); wave --freeze "$(long_soft 3928)"; wave --freeze "$HARD_MSG"
  mv "$ST/FROZEN" "$RAMMNT/symfull/FROZEN.real"; ln -s "$RAMMNT/symfull/FROZEN.real" "$ST/FROZEN"; B0=$(cks "$ST/FROZEN")
  fill_to 1; tap "$QS0" "$(lift_idx "$QS0")"; AS="$ANS"; RS=$RC; CKS=$(cks "$ST/FROZEN"); TS=$(tmp_left "$RAMMNT"); free_all
  check "SYM-1 BREAK? (P1) FROZEN -> symlink onto a full volume, S0's Lift: target byte-identical, link intact, class hard, deploy REFUSED, no temp" \
    $([ -L "$ST/FROZEN" ] && [ "$CKS" = "$B0" ] && hard_ok && [ "$TS" -eq 0 ]; echo $?) "rc=$RS $AS $(view) temps=$TS"
  # ATTACK: kept-hard line + its successor on a full disk, every option of the HARD question
  newcase kfull "$RAMMNT/kfull/home"; : > "$ST/FROZEN"; wave --freeze "$DESTR_MSG"; QH=$(qid_hard); NO=$(q_nopts "$QH"); B0=$(cks "$ST/FROZEN")
  i=0; while [ "$i" -lt "${NO:-0}" ]; do
    newcase "kfull-$i" "$RAMMNT/kfull$i/home"; : > "$ST/FROZEN"; wave --freeze "$DESTR_MSG"; QH=$(qid_hard)
    fill_to 0; tap "$QH" "$i"; AK="$ANS"; free_all
    check "KFULL.$i BREAK? (P1, 0 blocks free) option $i of the destructive HARD question on a kept-hard file: kept-hard line stays, class hard" \
      $([ "$(kept_n)" -eq 1 ] && hard_ok; echo $?) "rc=$RC $AK $(view)"
    i=$((i+1))
  done
  sync; umount "$RAMMNT" 2>/dev/null || diskutil unmount force "$RAMMNT" >/dev/null 2>&1; hdiutil detach "$RAMDEV" >/dev/null 2>&1 || hdiutil detach -force "$RAMDEV" >/dev/null 2>&1
  hdiutil info | grep -q "^$RAMDEV" && bad "RAM disk $RAMDEV still attached" "" || ok "RAM disk $RAMDEV detached"
else
  printf 'SKIP  PART 3 — could not attach/format/mount a RAM disk\n'; [ -n "$RAMDEV" ] && hdiutil detach "$RAMDEV" >/dev/null 2>&1
fi

echo "════ 4 · the desk rewrite failing on the FIRST / MIDDLE / LAST kept line (ulimit -f, both SIGXFSZ modes) ════"
# FROZEN = S0 (asked) · K1 · K2 · K3 — class hard via H at a chosen position. Limit 4 KB. Sizes make the write fail at K1 / K2 / K3.
mk4() {  # $1 position of H among the kept lines (1|2|3), $2 size of the kept lines before failure
  newcase "$3"; wave --freeze "$S0_MSG"; QS0=$(qid_soft)
  local k
  for k in 1 2 3; do
    if [ "$k" -eq "$1" ]; then wave --freeze "migration 2026090621300$k: APPLY failed — $(head -c "$4" /dev/zero | tr '\0' b)"
    else wave --freeze "$(long_soft "$4")"; fi
  done
}
for pos in first middle last; do
  case $pos in first) hp=1; sz=4300;; middle) hp=2; sz=2300;; last) hp=3; sz=1500;; esac
  for x in ignore default; do
    mk4 "$hp" "$sz" "rw-$pos-$x" "$sz"; B0=$(cks "$ST/FROZEN"); tot=$(sed -n 2,4p "$ST/FROZEN" | wc -c | tr -d ' ')
    tap_lim 4 "$x" "$QS0" "$(lift_idx "$QS0")"
    check "RW-$pos-$x BREAK? (P1) write of the kept lines ($tot B > 4 KB, fails at the $pos kept line, H at kept #$hp): FROZEN identical, hard, no temp, no false count" \
      $([ "$(cks "$ST/FROZEN")" = "$B0" ] && hard_ok && [ "$(tmp_left "$ST")" -eq 0 ] && ! has "$ANS" "still on"; echo $?) "rc=$RC $(printf '%s' "$ANS" | tr '\n' ' ' | cut -c1-300) $(view)"
  done
done
# the H line itself is the one asked about, and the rewrite fails: must refuse, not half-lift
newcase rw-hq; wave --freeze "$HARD_MSG"; QH=$(qid_hard); wave --freeze "$(long_soft 2500)"; wave --freeze "$DESTR_MSG"; B0=$(cks "$ST/FROZEN")
tap_lim 2 ignore "$QH" "$(lift_idx "$QH")"
check "RW-hq BREAK? (P1/P2) H's own Lift with the second HARD line past the limit: FROZEN identical (the other HARD line kept), hard" \
  $([ "$(cks "$ST/FROZEN")" = "$B0" ] && hard_ok && [ "$(tmp_left "$ST")" -eq 0 ]; echo $?) "rc=$RC $ANS $(view)"
tap "$QH" "$(lift_idx "$QH")" 2>/dev/null
info "RW-hq follow-up: the refused question was consumed (failed:1); a second tap on the same id → rc=$RC $(printf '%s' "$ANS" | head -1 | cut -c1-120)"

echo "════ 5 · symlinked FROZEN (desk + wave) ════"
newcase sym; mkdir -p "$C/elsewhere"; wave --freeze "$S0_MSG"; QS0=$(qid_soft); wave --freeze "$HARD_MSG"; QH=$(qid_hard)
mv "$ST/FROZEN" "$C/elsewhere/F"; ln -s ../../../../elsewhere/F "$ST/FROZEN"
check "SYM-2.0 relative symlink resolves; class hard" $([ -f "$ST/FROZEN" ] && [ "$(wave_class)" = hard ]; echo $?) "$(ls -l "$ST/FROZEN")"
tap "$QS0" "$(lift_idx "$QS0")"
check "SYM-2.1 BREAK? (P1) S0's Lift through a relative symlink: link kept, target has exactly H, class hard, deploy REFUSED, receipt '1 still on'" \
  $([ -L "$ST/FROZEN" ] && [ "$(nlines)" -eq 1 ] && [ "$(wf hard)" -eq 1 ] && hard_ok && has "$ANS" "1 still on" && [ "$(tmp_left "$C")" -eq 0 ]; echo $?) "rc=$RC $ANS $(view) $(ls -l "$ST/FROZEN")"
wave --freeze "$SOFT_MSG"; QB=$(qid_behind)
check "SYM-2.2 wave freeze() through the symlink appends behind the HARD line; link kept; behind-question noop only" $([ "$CLI_RC" -eq 0 ] && [ -L "$ST/FROZEN" ] && [ "$(nlines)" -eq 2 ] && [ "$(wave_class)" = hard ] && [ -n "$QB" ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt" | tail -2) $(view)"
tap "$QH" "$(lift_idx "$QH")"
check "SYM-2.3 H's own Lift through the symlink: exactly H removed, soft hold stays, receipt '1 soft line(s) still on'" $([ "$RC" -eq 0 ] && [ "$(nlines)" -eq 1 ] && [ "$(wave_class)" = soft ] && has "$ANS" "1 soft line(s) still on"; echo $?) "rc=$RC $ANS $(view)"
# symlink cycle and dangling: consistent readers, nothing lowered
newcase symloop; wave --freeze "$S0_MSG"; QS0=$(qid_soft); wave --freeze "$HARD_MSG"; rm -f "$ST/FROZEN"; ln -s FROZEN "$ST/FROZEN"
tap "$QS0" "$(lift_idx "$QS0")"
info "SYM-3 FROZEN -> itself (a loop; hand-made): desk rc=$RC $(printf '%s' "$ANS" | head -1 | cut -c1-120) · wave class=$(wave_class) gate=$(gate | cut -c1-50) (-e false: the wave reads 'no stop')"

echo "════ 6 · a Lift RACING a wave freeze() (both take questions/.lock) ════"
for r in 1 2 3; do
  newcase "race$r"; wave --freeze "$S0_MSG"; QS0=$(qid_soft)
  for k in $(seq 1 60); do printf '2026-09-11 10:%02d:%02d\tpeer hold %s\tsoft\tpeer hold\t%s\n' $((k/60)) $((k%60)) "$k" "$(printf '2026-09-11 10:%02d:%02d\tpeer hold %s\tsoft\tpeer hold' $((k/60)) $((k%60)) "$k" | shasum -a 1 | cut -c1-40)"; done >> "$ST/FROZEN"
  [ "$(wave_class)" = soft ] || bad "race$r precondition" "$(view)"
  ( tap "$QS0" "$(lift_idx "$QS0")"; printf '%s\n%s\n' "$RC" "$ANS" > "$C/tap.out" ) &
  tp=$!
  sleep "0.$((r*3))"; wave --freeze "$HARD_MSG"; wait "$tp"
  RC=$(head -1 "$C/tap.out"); ANS=$(tail -n +2 "$C/tap.out")
  check "RACE-$r BREAK? (P1/P2) S0's Lift (61-line file, slow loop) racing a wave HARD freeze() started 0.$((r*3)) s in: H present, S0 gone, class hard, deploy REFUSED, both receipts true" \
    $([ "$(wf hard)" -eq 1 ] && ! grep -q "$S0_MSG" "$ST/FROZEN" && [ "$(nlines)" -eq 61 ] && hard_ok && grep -q '⛔ FROZEN (hard)' "$C/say.txt" && [ "$RC" -eq 0 ] && { has "$ANS" "60 soft line(s) still on" || has "$ANS" "61 still on"; }; echo $?) \
    "tapRC=$RC $(printf '%s' "$ANS" | grep unfreeze) · wave rc=$CLI_RC $(grep '⛔' "$C/say.txt" | head -2) · $(view)"
done

echo "════ 7 · phone --freeze trying to reproduce the reserved line (case / whitespace / CRLF / NBSP / invalid UTF-8 / zero-width) ════"
NB=$(printf '\302\240'); ZW=$(printf '\342\200\213'); BAD=$(printf '\377')
v=0
while IFS= read -r -d $'\x1e' spelled; do
  v=$((v+1))
  newcase "res$v"; : > "$ST/FROZEN"; wave --freeze "$spelled"; rc1=$CLI_RC; shown=$(printf '%s' "$spelled" | od -c | head -2 | tr -s ' ' | tr '\n' ' ' | cut -c1-90)
  if [ "$rc1" -eq 2 ]; then
    check "RES-$v refused (rc 2): FROZEN 0 bytes, no question, class hard, deploy REFUSED [$shown]" $([ ! -s "$ST/FROZEN" ] && [ -z "$(qlist 2>/dev/null)" ] && hard_ok; echo $?) "$(view)"
    continue
  fi
  nsha=$(cut -f5 "$ST/FROZEN" | sort -u | wc -l | tr -d ' ')
  check "RES-$v accepted (rc $rc1): kept-hard line + a distinct-sha new line; no question carries the kept-hard sha [$shown]" \
    $([ "$rc1" -eq 0 ] && [ "$(kept_n)" -eq 1 ] && [ "$nsha" -eq 2 ] && ! all_q_shas | grep -qx "$(kept_sha)"; echo $?) "rc=$rc1 $(cat -v "$ST/FROZEN" | cut -c1-200) $(qlist)"
  # every option of every open question, each from a fresh copy of this state
  snap_home
  for qid in $(snap_qids); do
    n=$(snap_nopts "$qid"); i=0
    while [ "$i" -lt "$n" ]; do
      fork_home; tap "$qid" "$i"
      check "RES-$v q=${qid##*-} opt $i BREAK? (P1) kept-hard line survives, class hard, deploy REFUSED" $([ "$(kept_n)" -eq 1 ] && hard_ok; echo $?) "rc=$RC $ANS $(view)"
      i=$((i+1))
    done
  done
done < <(printf '%s\x1e' \
  "$KEPT" "frozen was empty or cut short, reads as hard (fail safe)" "FROZEN WAS EMPTY OR CUT SHORT, READS AS HARD (FAIL SAFE)" \
  " $KEPT " "$KEPT"$'\r\n' $'\t'"$KEPT"$'\t' "$KEPT"$'\v' $'\f'"$KEPT" "${NB}${KEPT}${NB}" "$(printf '%s' "$KEPT" | sed "s/ /$NB/g")" \
  "$KEPT$BAD" "$BAD$KEPT" "$ZW$KEPT" "$KEPT$ZW" "FROZEN was empty or cut short,  reads as hard (fail safe)" "$(printf '%s' "$KEPT" | tr ' ' '\t')" \
  "FROZEN was empty or cut short, reads as hard (fail safe)"$'\n'"peer hold" "$KEPT	hard	kept-hard" )

echo "════ 8 · kept-hard line vs every option of every question the desk offers (wave-reachable shapes) ════"
shape_prep() {  # $1 shape → FROZEN before the freeze
  case "$1" in
    empty) : > "$ST/FROZEN";;
    blank) printf '\n\n' > "$ST/FROZEN";;
    frag) printf '2026-09-1' > "$ST/FROZEN";;
    cut-hard) wave --freeze "$HARD_MSG"; L=$(cat "$ST/FROZEN"); printf '%s' "${L:0:$((${#L}-20))}" > "$ST/FROZEN";;
    soft-then-empty) : > "$ST/FROZEN";;
  esac
}
for shape in empty blank frag cut-hard; do
  for msg in "$HARD_MSG" "$DESTR_MSG" "$SOFT_MSG" "$KEPT x"; do
    tag="$shape-$(printf '%s' "$msg" | cksum | cut -c1-6)"
    newcase "k8-$tag"; shape_prep "$shape"; wave --freeze "$msg"; rc1=$CLI_RC
    wave --freeze "$S0_MSG"   # a second, soft, stop on top
    kn=$(kept_n); ksha=$(kept_sha)
    if [ "$kn" -ne 1 ]; then info "K8 $tag: rc=$rc1 no kept-hard line written (FROZEN: $(cut -f3,4 "$ST/FROZEN" | tr '\n\t' '| ' | cut -c1-120)) class=$(wave_class)"; fi
    snap_home
    for qid in $(snap_qids); do
      n=$(snap_nopts "$qid"); i=0
      while [ "$i" -lt "$n" ]; do
        fork_home; tap "$qid" "$i"
        if [ "$kn" -eq 1 ]; then
          check "K8 $tag q=${qid##*-} opt $i BREAK? (P1) kept-hard survives + class hard + deploy REFUSED" $([ "$(kept_n)" -eq 1 ] && [ "$(kept_sha)" = "$ksha" ] && hard_ok; echo $?) "rc=$RC $ANS $(view)"
        else
          check "K8 $tag q=${qid##*-} opt $i BREAK? (P1) no kept-hard line: the malformed/hard content keeps the class hard" $(hard_ok || ! has "$ANS" unfreeze; echo $?) "rc=$RC $ANS $(view)"
        fi
        i=$((i+1))
      done
    done
    # then tap every question in sequence on one copy (the Director answers them all, Lift wherever offered)
    fork_home
    for qid in $(snap_qids); do li=$(python3 -c 'import json,sys;q=json.load(open(sys.argv[1]));l=[i for i,o in enumerate(q["options"]) if any(w["op"]=="unfreeze" for w in o["writes"])];print(l[0] if l else 0)' "$ST/questions/$qid.json"); tap "$qid" "$li"; done
    [ "$kn" -eq 1 ] && check "K8 $tag ALL-LIFT BREAK? (P1) every question answered with its Lift: kept-hard line stays, hard" $([ "$(kept_n)" -eq 1 ] && hard_ok; echo $?) "$(view) $(cat -v "$ST/FROZEN" | cut -c1-200)"
  done
done

echo "════ 9 · same-second identical stops (P2 scope probe) ════"
newcase dup; wave --freeze "$SOFT_MSG"
# two identical HARD freezes: the wave's and the phone's, forced into the same second
for t in 1 2 3 4 5; do
  s=$(date +%S); while [ "$(date +%S)" = "$s" ]; do :; done
  wave --freeze "$HARD_MSG" & wave --freeze "$HARD_MSG"; wait
  [ "$(cut -f5 "$ST/FROZEN" | sort | uniq -d | wc -l | tr -d ' ')" -ge 1 ] && break
done
dups=$(cut -f5 "$ST/FROZEN" | sort | uniq -d | wc -l | tr -d ' ')
if [ "$dups" -ge 1 ]; then
  QH=$(qid_hard); nh=$(wf hard); tap "$QH" "$(lift_idx "$QH")"
  info "DUP two identical same-second HARD lines ($nh hard, one sha, questions: $(qlist | wc -l | tr -d ' ')); its Lift → rc=$RC $(printf '%s' "$ANS" | grep unfreeze) · $(view)"
else
  info "DUP could not land two identical lines in one second in 5 tries"
fi

echo "════ 10 · more attacks on the desk rewrite ════"
# 10a · the desk under a UTF-8 terminal locale (a Claude tab), FROZEN lines holding raw invalid bytes + multibyte text
U8="en_US.UTF-8"
tap_u8() { ANS=$(env -i PATH="$PLAIN_PATH" HOME="$HM" LANG="$U8" LC_ALL="$U8" STATE="$ST" SHIP_WAVE_DIR="$D" FLEET_MD="$C/fleet.md" /opt/homebrew/bin/bash "$DESK" answer "$1" "$2" 2>&1); RC=$?; }
tap_u8_lim() { local lim="$1"; shift
  ANS=$(env -i PATH="$PLAIN_PATH" HOME="$HM" LANG="$U8" LC_ALL="$U8" STATE="$ST" SHIP_WAVE_DIR="$D" FLEET_MD="$C/fleet.md" /opt/homebrew/bin/bash -c 'L=$1; shift; trap "" XFSZ; ulimit -f "$L"; exec /opt/homebrew/bin/bash "$@"' _ "$lim" "$DESK" answer "$@" 2>&1); RC=$?; }
newcase u8; wave --freeze "Director hold on caf$(printf '\303\251') module $(printf '\377\376') x"; QS0=$(qid_soft)
wave --freeze "peer hold $(printf '\342\200\224') $(printf '\377')ab$(printf '\303')"; wave --freeze "migration 20260906213000: APPLY failed — $(printf '\377') r$(printf '\303\251')lation"
check "U8.0 precondition 3 lines (raw bytes kept), class hard, S0 has a Lift" $([ "$(nlines)" -eq 3 ] && [ "$(wave_class)" = hard ] && [ -n "$QS0" ]; echo $?) "$(cat -v "$ST/FROZEN" | cut -c1-200) $(qlist)"
L23=$(sed -n 2,3p "$ST/FROZEN" | cksum); tap_u8 "$QS0" "$(lift_idx "$QS0")"
check "U8.1 BREAK? (P1/P2) S0's Lift under LC_ALL=$U8: exactly S0 removed, lines 2-3 byte-identical, class hard, receipt '2 still on'" \
  $([ "$RC" -eq 0 ] && [ "$(nlines)" -eq 2 ] && [ "$(cksum < "$ST/FROZEN")" = "$L23" ] && hard_ok && has "$ANS" "2 still on"; echo $?) "rc=$RC $ANS $(view) $(cat -v "$ST/FROZEN" | cut -c1-160)"
newcase u8full; wave --freeze "Director hold $(printf '\377')"; QS0=$(qid_soft); wave --freeze "$(long_soft 1850)$(printf '\303\251')"; wave --freeze "migration 20260906213000: APPLY failed $(printf '\303')"; B0=$(cks "$ST/FROZEN")
tap_u8_lim 2 "$QS0" "$(lift_idx "$QS0")"
check "U8.2 BREAK? (P1) UTF-8 locale + 2 KB limit + raw bytes: FROZEN identical, hard, no false count" $([ "$(cks "$ST/FROZEN")" = "$B0" ] && hard_ok && ! has "$ANS" "still on" && [ "$(tmp_left "$ST")" -eq 0 ]; echo $?) "rc=$RC $ANS $(view)"
# 10b · exact boundary: the kept copy is exactly the limit (must succeed) / one byte over (must refuse)
for over in 0 1; do
  newcase "bnd$over"; wave --freeze "$S0_MSG"; QS0=$(qid_soft); wave --freeze "$HARD_MSG"
  hl=$(sed -n 2p "$ST/FROZEN" | wc -c | tr -d ' '); wave --freeze "$(long_soft $((4096 - hl - 168 + over)))"
  kept=$(sed -n 2,3p "$ST/FROZEN" | wc -c | tr -d ' '); B0=$(cks "$ST/FROZEN"); L23=$(sed -n 2,3p "$ST/FROZEN" | cksum)
  tap_lim 4 ignore "$QS0" "$(lift_idx "$QS0")"
  if [ "$kept" -le 4096 ]; then
    check "BND-$over kept copy $kept B <= 4096: the Lift succeeds, exactly S0 gone, rest byte-identical, hard, '2 still on'" $([ "$RC" -eq 0 ] && [ "$(cksum < "$ST/FROZEN")" = "$L23" ] && hard_ok && has "$ANS" "2 still on"; echo $?) "rc=$RC $ANS $(view)"
  else
    check "BND-$over kept copy $kept B > 4096 by $((kept-4096)): refused, FROZEN identical, hard" $([ "$(cks "$ST/FROZEN")" = "$B0" ] && hard_ok && has "$ANS" "nothing lifted" && [ "$(tmp_left "$ST")" -eq 0 ]; echo $?) "rc=$RC $ANS $(view)"
  fi
done
# 10c · the rename itself fails (target immutable): FROZEN identical, honest refusal, temp removed
newcase immut; wave --freeze "$S0_MSG"; QS0=$(qid_soft); wave --freeze "$HARD_MSG"; B0=$(cks "$ST/FROZEN")
chflags uchg "$ST/FROZEN"; tap "$QS0" "$(lift_idx "$QS0")"; chflags nouchg "$ST/FROZEN"
check "IMM (error path; hand-made immutable flag) rename fails: FROZEN identical, hard, 'nothing lifted', no temp" $([ "$(cks "$ST/FROZEN")" = "$B0" ] && hard_ok && has "$ANS" "nothing lifted" && [ "$RC" -eq 4 ] && [ "$(tmp_left "$ST")" -eq 0 ]; echo $?) "rc=$RC $ANS $(view)"
# 10d · freeze() starts FIRST, the Lift 50 ms later (the other ordering)
for r in 1 2 3; do
  newcase "race-wf$r"; wave --freeze "$S0_MSG"; QS0=$(qid_soft)
  for k in $(seq 1 40); do l=$(printf '2026-09-11 11:00:%02d\tpeer hold %s\tsoft\tpeer hold' "$k" "$k"); printf '%s\t%s\n' "$l" "$(printf '%s' "$l" | shasum -a 1 | cut -c1-40)"; done >> "$ST/FROZEN"
  ( wave --freeze "$HARD_MSG"; echo "$CLI_RC" > "$C/wave.rc" ) & wp=$!
  sleep "0.0$((r*2))"; tap "$QS0" "$(lift_idx "$QS0")"; wait "$wp"
  check "RACE-WF-$r BREAK? (P1/P2) wave HARD freeze first, S0's Lift 0.0$((r*2)) s later: H present, S0 gone, 41 lines, hard, receipt matches FROZEN" \
    $([ "$(wf hard)" -eq 1 ] && ! grep -q "$S0_MSG" "$ST/FROZEN" && [ "$(nlines)" -eq 41 ] && hard_ok && [ "$RC" -eq 0 ] && { has "$ANS" "40 soft line(s) still on" || has "$ANS" "41 still on"; } && [ "$(cat "$C/wave.rc")" -eq 0 ]; echo $?) \
    "tapRC=$RC $(printf '%s' "$ANS" | grep unfreeze) wave rc=$(cat "$C/wave.rc") $(view)"
  info "RACE-WF-$r ordering: $(printf '%s' "$ANS" | grep -oE '[0-9]+ (soft line\(s\) )?still on')"
done

echo "════ SAFETY ════"
check "live FROZEN untouched" $([ "$(cksum < "$HOME/.config/obsidian/.ship-wave/FROZEN" 2>/dev/null || echo absent)" = "$LIVE_BEFORE" ]; echo $?) ""
echo "=== $PASS passed · $FAIL failed · fixtures in $TMP ==="
[ "$FAIL" -eq 0 ]

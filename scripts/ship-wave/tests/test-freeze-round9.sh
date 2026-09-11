#!/opt/homebrew/bin/bash
# tests/test-freeze-round9.sh — proof for the round-9 freeze fix (verifier round 8: I7c). The break: on a 0-byte FROZEN, a phone
# `--freeze "FROZEN was empty or cut short, reads as hard (fail safe)"` made freeze() write the kept-hard line and the new line
# with the same timestamp, message, class and field 4, so both carried the same field-5 sha1; the Lift on the NEW stop's question
# removed both, FROZEN was deleted and deploy_allowed said ALLOWED. The fix: the kept-hard line's field 4 is the reserved slug
# 'kept-hard' (ledger_class strips every '-', and a message line whose slug would equal it falls back to its class), field 4 is
# inside the sha, and --freeze refuses the reserved text (exit 2). These cases prove: the exact I7c input is refused; every
# same-second attempt with fields 1-3 equal gets a DIFFERENT sha; a Lift on the new line leaves the kept-hard line and class hard;
# the real desk reads the kept-hard line as HARD and no question it holds can lift it.
# Shape (as round 8): B's ship-wave.sh truncated before `if [ -n "$GOAL" ]` + its siblings + A's desk-questions.sh in ONE dir; the
# wave runs the launchd way (env -i PATH HOME /opt/homebrew/bin/bash, C locale); every tap goes through A's REAL desk.
# Fresh temp HOME per case ($STATE is HOME-derived); the live ~/.config/obsidian/.ship-wave is never touched.
# Run from the worktree root:  bash scripts/ship-wave/tests/test-freeze-round9.sh   (DESK_SW=<dir> to override)
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"

ROOT=$(cd "$(dirname "$0")/../../.." && pwd); SW="$ROOT/scripts/ship-wave"
DESK_SW="${DESK_SW:-/Users/omm/PROJECTS/MyJKKN/.worktrees/hitl-desk/scripts/ship-wave}"
[ -f "$SW/desk-questions.sh" ] && DESK_SW="$SW"
[ -f "$DESK_SW/desk-questions.sh" ] || { echo "no desk at $DESK_SW"; exit 2; }
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-freeze-r9.XXXXXX")
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
# a sourced shell (plan mode, launchd env) that runs arbitrary code after sourcing — calls freeze() the way the wave's own code does
wave_src() { $TO 30 env -i PATH="$PLAIN_PATH" HOME="$HM" /opt/homebrew/bin/bash -c 'R=$1 S=$2 CODE=$3; cd "$R"; set -- plan; . "$S" >/dev/null 2>&1; eval "$CODE"' _ "$ROOT" "$TMP/ship-wave.sh" "$1" >> "$C/say.txt" 2>&1; SRC_RC=$?; }
cls_now() { $TO 10 /opt/homebrew/bin/bash -c 'H=$1 R=$2 S=$3; export HOME="$H"; cd "$R"; set -- plan; . "$S" >/dev/null 2>&1; freeze_class_now' _ "$HM" "$ROOT" "$TMP/ship-wave.sh" 2>/dev/null; echo; }
reason_now() { $TO 10 /opt/homebrew/bin/bash -c 'H=$1 R=$2 S=$3; export HOME="$H"; cd "$R"; set -- plan; . "$S" >/dev/null 2>&1; freeze_reason_now' _ "$HM" "$ROOT" "$TMP/ship-wave.sh" 2>/dev/null; }
deploy_gate() { $TO 10 /opt/homebrew/bin/bash -c 'H=$1 R=$2 S=$3; export HOME="$H"; cd "$R"; set -- plan; . "$S" >/dev/null 2>&1; MODE=go; if deploy_allowed; then echo "ALLOWED"; else echo "REFUSED: $DEPLOY_BLOCK"; fi' _ "$HM" "$ROOT" "$TMP/ship-wave.sh" 2>/dev/null || echo "TIMEOUT-OR-ERROR"; }
wave_class() { if [ -e "$ST/FROZEN" ]; then cls_now | tr -d '\n'; else printf none; fi; }
qcount() { ls "$ST/questions" 2>/dev/null | grep -c 'q-.*\.json'; }
qlist() { python3 - "$ST/questions" <<'PY'
import json,glob,os,sys
for f in sorted(glob.glob(os.path.join(sys.argv[1],"q-*.json")), key=lambda p: json.load(open(p))["asked_at"]):
    q=json.load(open(f)); print(q["id"]+"\t"+q["title"]+"\t"+str(q.get("frozen_line")))
PY
}
qid_by_title() { qlist 2>/dev/null | awk -F'\t' -v pat="$1" '$2 ~ pat {print $1}' | tail -1; }
qid_hard() { qid_by_title 'stopped: production'; }
lift_idx() { python3 -c 'import json,sys;q=json.load(open(sys.argv[1]));print([i for i,o in enumerate(q["options"]) if any(w["op"]=="unfreeze" for w in o["writes"])][0])' "$ST/questions/$1.json"; }
tap() { local id="$1" idx="$2"; ANS=$(env -i PATH="$PLAIN_PATH" HOME="$HM" STATE="$ST" SHIP_WAVE_DIR="$TMP" /opt/homebrew/bin/bash "$DESK" answer "$id" "$idx" 2>&1); RC=$?; }
# every line_sha1 any question (open or answered) carries in an unfreeze op
all_unfreeze_shas() { python3 - "$ST/questions" <<'PY'
import json,glob,os,sys
for f in glob.glob(os.path.join(sys.argv[1],"**","*.json"), recursive=True):
    try: q=json.load(open(f))
    except Exception: continue
    for o in q.get("options") or []:
        for w in o.get("writes") or []:
            if w.get("op")=="unfreeze": print(w.get("line_sha1") or "NO-SHA")
PY
}
nlines() { [ -f "$ST/FROZEN" ] && grep -c '' "$ST/FROZEN" || echo 0; }
kh_lines() { [ -f "$ST/FROZEN" ] && awk -F'\t' 'NF==5 && $3=="hard" && $4=="kept-hard"' "$ST/FROZEN" | wc -l | tr -d ' ' || echo 0; }
kh_sha() { awk -F'\t' 'NF==5 && $4=="kept-hard" {print $5}' "$ST/FROZEN" 2>/dev/null | tail -1; }
line_n() { sed -n "${1}p" "$ST/FROZEN"; }
sha_ok() { local l; l=$(line_n "$1"); [ "$(printf '%s' "$(printf '%s' "$l" | cut -f1-4)" | shasum -a 1 | cut -c1-40)" = "$(printf '%s' "$l" | cut -f5)" ]; }
distinct_shas() { cut -f5 "$ST/FROZEN" | sort -u | wc -l | tr -d ' '; }
cks() { cksum < "$1" 2>/dev/null; }
EMPTY_SYN="FROZEN was empty or cut short, reads as hard (fail safe)"
REFUSE='--freeze: that text is reserved for the wave'
HARD_MSG="migration 20260906213000: APPLY failed — relation exists"
SOFT_MSG="peer hold on #3410 — Director asked to wait"

echo "════ R9-1 · the EXACT I7c input: a 0-byte FROZEN + phone --freeze \"$EMPTY_SYN\" ════"
newcase r1; : > "$ST/FROZEN"; wave --freeze "$EMPTY_SYN"
check "R9-1a refused: rc=2, prints '$REFUSE', nothing else" $([ "$CLI_RC" -eq 2 ] && [ "$(cat "$C/say.txt")" = "$REFUSE" ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
check "R9-1b FROZEN untouched (still 0 bytes, regular file), no question, no temp, no lock left" $([ -f "$ST/FROZEN" ] && [ ! -s "$ST/FROZEN" ] && [ "$(qcount)" -eq 0 ] && [ "$(find "$ST" -name '.FROZEN.tmp.*' | wc -l | tr -d ' ')" -eq 0 ] && [ ! -e "$HM/.config/obsidian/.ship-wave.lock" ]; echo $?) "$(ls -la "$ST")"
check "R9-1c (P1) class hard, deploy REFUSED: hard freeze" $([ "$(wave_class)" = hard ] && _contains "$(deploy_gate)" "REFUSED: hard freeze"; echo $?) "class=$(wave_class) $(deploy_gate)"

echo "════ R9-2 · look-alike spellings --freeze refuses (outer blanks, TAB/CR/LF as freeze() would flatten them) ════"
i=0
for v in "$EMPTY_SYN " " $EMPTY_SYN" "$EMPTY_SYN"$'\n' $'\t'"$EMPTY_SYN"$'\t' "  $EMPTY_SYN"$'\r\n'; do
  i=$((i+1)); newcase "r2-$i"; : > "$ST/FROZEN"; wave --freeze "$v"
  check "R9-2.$i '$(printf '%s' "$v" | cat -v | tr '\n' '~')' refused rc=2, FROZEN still 0 bytes, class hard" $([ "$CLI_RC" -eq 2 ] && grep -qxF -- "$REFUSE" "$C/say.txt" && [ ! -s "$ST/FROZEN" ] && [ "$(wave_class)" = hard ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
done
newcase r2-absent; wave --freeze "$EMPTY_SYN"
check "R9-2.abs no FROZEN at all: refused rc=2 and no FROZEN created" $([ "$CLI_RC" -eq 2 ] && [ ! -e "$ST/FROZEN" ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"
newcase r2-soft; wave --freeze "$SOFT_MSG"; B=$(cks "$ST/FROZEN"); Q0=$(qcount); : > "$C/say.txt"; wave --freeze "$EMPTY_SYN"
check "R9-2.soft onto a soft stop: refused rc=2, FROZEN byte-identical, no new question" $([ "$CLI_RC" -eq 2 ] && [ "$(cks "$ST/FROZEN")" = "$B" ] && [ "$(qcount)" -eq "$Q0" ]; echo $?) "rc=$CLI_RC $(cat "$C/say.txt")"

echo "════ R9-3 · spellings that get THROUGH --freeze: a different sha, and the new stop's Lift leaves the kept-hard line ════"
i=0
for v in "$EMPTY_SYN." "frozen was empty or cut short, reads as hard (fail safe)" "FROZEN was empty or cut short,  reads as hard (fail safe)" "FROZEN was empty or cut short, reads as hard (fail safe) #3410"; do
  i=$((i+1)); newcase "r3-$i"; : > "$ST/FROZEN"; wave --freeze "$v"; QH=$(qid_hard)
  check "R9-3.$i '$v' recorded: kept-hard line + new line, same second, 2 distinct shas, both shas = sha1(fields 1-4)" $([ "$CLI_RC" -eq 0 ] && [ "$(nlines)" -eq 2 ] && [ "$(kh_lines)" -eq 1 ] && [ "$(line_n 1 | cut -f1)" = "$(line_n 2 | cut -f1)" ] && [ "$(distinct_shas)" -eq 2 ] && sha_ok 1 && sha_ok 2 && [ -n "$QH" ]; echo $?) "rc=$CLI_RC $(cat -v "$ST/FROZEN")"
  KH=$(kh_sha)
  check "R9-3.$i no question carries the kept-hard line's sha" $([ -n "$KH" ] && ! all_unfreeze_shas | grep -qxF "$KH"; echo $?) "kh=$KH shas=$(all_unfreeze_shas | tr '\n' ' ')"
  tap "$QH" "$(lift_idx "$QH")"
  check "R9-3.$i (P1, real desk) the new stop's Lift removes its own line only: kept-hard line stays, class hard, deploy REFUSED, desk says HARD still in force" $([ "$RC" -eq 0 ] && [ "$(nlines)" -eq 1 ] && [ "$(kh_lines)" -eq 1 ] && [ "$(wave_class)" = hard ] && _contains "$(deploy_gate)" "REFUSED: hard freeze" && _contains "$ANS" "a HARD stop is still in force"; echo $?) "rc=$RC $ANS $(cat -v "$ST/FROZEN" 2>/dev/null)"
done

echo "════ R9-4 · same-second collision attempts inside freeze() itself: fields 1-3 equal, only the reserved field differs ════"
# the wave's own code (not the CLI) calling freeze() with the reserved text: no refusal there — the sha must still differ
for start in empty blank cut; do
  newcase "r4-$start"
  case $start in empty) : > "$ST/FROZEN";; blank) printf '\n \n' > "$ST/FROZEN";; cut) printf '2026-09-1' > "$ST/FROZEN";; esac
  wave_src "freeze '$EMPTY_SYN'"; QH=$(qid_hard)
  L1=$(awk -F'\t' '$4=="kept-hard"' "$ST/FROZEN"); L2=$(awk -F'\t' 'NF==5 && $4!="kept-hard"' "$ST/FROZEN" | tail -1)
  check "R9-4.$start freeze() recorded both lines: fields 1,2,3 EQUAL, field 4 kept-hard vs '$(printf '%s' "$L2" | cut -f4)', field-5 shas DIFFER" $([ "$SRC_RC" -eq 0 ] && [ -n "$L1" ] && [ -n "$L2" ] && [ "$(printf '%s' "$L1" | cut -f1-3)" = "$(printf '%s' "$L2" | cut -f1-3)" ] && [ "$(printf '%s' "$L2" | cut -f4)" != kept-hard ] && [ "$(printf '%s' "$L1" | cut -f5)" != "$(printf '%s' "$L2" | cut -f5)" ]; echo $?) "rc=$SRC_RC $(cat -v "$ST/FROZEN")"
  tap "$QH" "$(lift_idx "$QH")"
  check "R9-4.$start (P1, real desk) Lift on that new stop: the kept-hard line survives, class hard, deploy REFUSED" $([ "$RC" -eq 0 ] && [ "$(kh_lines)" -eq 1 ] && [ "$(wave_class)" = hard ] && _contains "$(deploy_gate)" "REFUSED: hard freeze"; echo $?) "rc=$RC $ANS $(cat -v "$ST/FROZEN" 2>/dev/null)"
done
# a future ledger_class that DID return the reserved slug for the reserved text: field 4 of the message line falls back to its class
newcase r4-slug; : > "$ST/FROZEN"
wave_src "ledger_class() { printf 'kept-hard'; }; freeze '$EMPTY_SYN'"; QH=$(qid_hard)
check "R9-4.slug ledger_class forced to answer 'kept-hard': the message line's field 4 is NOT kept-hard, exactly one kept-hard line, 2 distinct shas" $([ "$SRC_RC" -eq 0 ] && [ "$(nlines)" -eq 2 ] && [ "$(kh_lines)" -eq 1 ] && [ "$(distinct_shas)" -eq 2 ] && sha_ok 1 && sha_ok 2; echo $?) "rc=$SRC_RC $(cat -v "$ST/FROZEN")"
tap "$QH" "$(lift_idx "$QH")"
check "R9-4.slug (P1, real desk) Lift on that new stop: the kept-hard line survives, class hard" $([ "$RC" -eq 0 ] && [ "$(kh_lines)" -eq 1 ] && [ "$(wave_class)" = hard ]; echo $?) "rc=$RC $ANS"
# a hand-written line carrying 'kept-hard' is never written by the wave — informational: it reads by its class field like any line
M=$(env -i PATH="$PLAIN_PATH" HOME="$HM" STATE="$ST" /opt/homebrew/bin/bash -c '. "$1" >/dev/null 2>&1; shift; for m in "$@"; do ledger_class "$m"; echo; done' _ "$SW/failure-ledger.sh" "$EMPTY_SYN" "$EMPTY_SYN." "kept-hard" "KEPT-HARD" "kept hard" "a-kept-hard-b" "--kept-hard--" 2>/dev/null)
check "R9-4.lc ledger_class never yields 'kept-hard' for the reserved text or kept-hard look-alikes (it strips every '-')" $([ "$(printf '%s\n' "$M" | grep -c .)" -eq 7 ] && ! printf '%s\n' "$M" | grep -qxF kept-hard; echo $?) "$(printf '%s' "$M" | tr '\n' '|')"

echo "════ R9-5 · the kept-hard line is HARD for every reader, and nothing offers to lift it ════"
newcase r5; : > "$ST/FROZEN"; wave --freeze "$HARD_MSG"; QH=$(qid_hard); KH=$(kh_sha)
check "R9-5a kept-hard line: well-formed 5 fields, class hard, field 4 'kept-hard', sha = sha1(fields 1-4), the text is the reserved text" $([ "$CLI_RC" -eq 0 ] && [ "$(kh_lines)" -eq 1 ] && sha_ok 1 && [ "$(line_n 1 | cut -f2)" = "$EMPTY_SYN" ] && [ "$(line_n 1 | cut -f4)" = kept-hard ]; echo $?) "$(cat -v "$ST/FROZEN")"
check "R9-5b no question carries its sha (only the new hard line's question exists)" $([ "$(qcount)" -eq 1 ] && [ -n "$KH" ] && ! all_unfreeze_shas | grep -qxF "$KH" && [ "$(all_unfreeze_shas | grep -c .)" -ge 1 ]; echo $?) "kh=$KH shas=$(all_unfreeze_shas | tr '\n' ' ')"
LI=$(lift_idx "$QH"); tap "$QH" "$LI"
check "R9-5c after the Lift: only the kept-hard line, the wave reads hard and names it, deploy REFUSED; the desk receipt says a HARD stop is still in force" $([ "$RC" -eq 0 ] && [ "$(nlines)" -eq 1 ] && [ "$(kh_lines)" -eq 1 ] && [ "$(wave_class)" = hard ] && [ "$(reason_now)" = "$EMPTY_SYN" ] && _contains "$(deploy_gate)" "REFUSED: hard freeze" && _contains "$ANS" "a HARD stop is still in force"; echo $?) "rc=$RC $ANS reason=$(reason_now)"
# the desk's own fail-safe reader(s), verbatim from slice A: every awk program in the desk that applies the class rule
# ($3 must be exactly soft|hard) is run on this FROZEN — each must print hard (slice A is read-only here; its text may move)
: > "$C/desk-readers"; python3 - "$DESK" "$C/desk-readers" <<'PY'
import re,sys
t=open(sys.argv[1],encoding="utf-8").read()
progs=[m.group(1) for m in re.finditer(r"awk -F'\\t' '([^']*)'", t) if '$3!="soft"' in m.group(1) and "print c" in m.group(1)]
open(sys.argv[2],"w").write("".join(x+"\n" for x in progs))
PY
DR=0; DH=0; while IFS= read -r prog; do [ -n "$prog" ] || continue; DR=$((DR+1)); [ "$(awk -F'\t' "$prog" "$ST/FROZEN" 2>/dev/null)" = hard ] && DH=$((DH+1)); done < "$C/desk-readers"
check "R9-5d slice A's own fail-safe reader(s) ($DR found in the desk) all read the kept-hard-only FROZEN as hard" $([ "$DR" -ge 1 ] && [ "$DH" -eq "$DR" ]; echo $?) "readers=$DR hard=$DH"
# re-tap the same Lift (the question is answered now): nothing lifts the kept-hard line
B=$(cks "$ST/FROZEN"); tap "$QH" "$LI"
check "R9-5e the same Lift tapped again: refused or nothing lifted, FROZEN byte-identical, class hard" $([ "$(cks "$ST/FROZEN")" = "$B" ] && [ "$(wave_class)" = hard ]; echo $?) "rc=$RC $ANS"
wave --freeze "$SOFT_MSG"
check "R9-5f a soft --freeze behind it: class hard, and still no question carries the kept-hard sha" $([ "$CLI_RC" -eq 0 ] && [ "$(wave_class)" = hard ] && ! all_unfreeze_shas | grep -qxF "$KH"; echo $?) "rc=$CLI_RC shas=$(all_unfreeze_shas | tr '\n' ' ')"

echo "══ SAFETY ══"
check "S1 live ~/.config/obsidian/.ship-wave/FROZEN unchanged by this run (was: $LIVE_FROZEN_BEFORE)" $([ "$( [ -e "$HOME/.config/obsidian/.ship-wave/FROZEN" ] && echo present || echo absent )" = "$LIVE_FROZEN_BEFORE" ]; echo $?) "live FROZEN state changed"
for f in "$SW/ship-wave.sh" "$0"; do /opt/homebrew/bin/bash -n "$f" && ok "bash -n $(basename "$f")" || bad "bash -n $(basename "$f")"; done
echo "=== $PASS passed · $FAIL failed · fixtures in $TMP ==="
[ "$FAIL" -eq 0 ] && [ "$PASS" -gt 0 ]

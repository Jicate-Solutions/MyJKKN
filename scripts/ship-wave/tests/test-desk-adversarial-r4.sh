#!/bin/bash
# test-desk-adversarial-r4.sh — round-4 adversarial cases for the desk (HUMAN-IN-THE-LOOP §A), written against
# 6d7875f886 (round-2 fixes verified: NEW-1..6 all closed). Every case here FAILED on that commit; a fix makes it
# pass. Ordered by what it lets happen: 1 downgrades a hard stop, 2 feeds slice D false evidence, 3 loses a question,
# 4–7 hygiene (a lying receipt, an un-askable question, a destroyed record).
# Run from the worktree root:  bash scripts/ship-wave/tests/test-desk-adversarial-r4.sh
# Temp $STATE, fixture Fleet.md, touches nothing live. PASS/FAIL per case, exit 1 on any FAIL.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; SW="$HERE/.."; DESK="$SW/desk/v5-w12-desk.sh"
export STATE; STATE="$(mktemp -d "${TMPDIR:-/tmp}/desk-r4.XXXXXX")"
export FLEET_MD="$STATE/Fleet.md" SHIP_WAVE_DIR="$SW"
trap 'chmod -R u+w "$STATE" 2>/dev/null; find "$STATE" -delete' EXIT
fails=0; pass() { printf 'PASS  %s\n' "$*"; }; fail() { printf 'FAIL  %s\n' "$*"; fails=$((fails+1)); }
say() { :; }
. "$SW/failure-ledger.sh"; . "$SW/policy-learning.sh"; . "$SW/desk-questions.sh"
NOW=$(python3 -c 'import datetime;print(datetime.datetime.now().astimezone().isoformat(timespec="seconds"))')
mkq() { local fl=""; [ -n "${6:-}" ] && fl=",\"frozen_line\":$6"
  printf '{"id":"%s","asked_at":"%s","kind":"%s","class":"c","title":"t","body":"b","options":%s,"recommended":0,"expires_after_h":%s%s}' \
    "$1" "${4:-$NOW}" "${3:-freeze}" "$2" "${5:-48}" "$fl" > "$QUESTIONS_DIR/$1.json"; }
clean() { find "$QUESTIONS_DIR" -name '*.json' -delete; find "$QUESTIONS_DIR" -type l -delete; : > "$QUESTIONS_LOG"; : > "$LEDGER"; : > "$FLEET_MD"
          chmod u+w "$STATE/approve-held" 2>/dev/null; rm -f "$STATE/FROZEN" "$STATE/approve-held" "$STATE/allow-destructive" "$STATE/advisory-checks" "$STATE/outside.json"; }
UNF='[{"label":"Lift the stop","description":"l","writes":[{"op":"unfreeze"}]},{"label":"Keep","description":"k","writes":[{"op":"noop"}]}]'
NOOP='[{"label":"Keep","description":"d","writes":[{"op":"noop"}]},{"label":"Also keep","description":"d","writes":[{"op":"noop"}]}]'
APP='[{"label":"Approve #3410","description":"d","writes":[{"op":"append","file":"approve-held","value":"3410"}]},{"label":"Not now","description":"d","writes":[{"op":"noop"}]}]'

# ── 1: FROZEN is append-only (ship-wave.sh freeze() uses >>; B's --freeze "peer hold …" from the phone appends a SOFT
#      line on top of a HARD one). A question about the LAST line passes the scoped check, then `rm -f FROZEN` removes
#      EVERY line — the hard 'deploy ERROR' latch above it is gone. "Lifts exactly that stop" must remove only its line.
clean; printf '2026-09-10 07:00:00\tdeploy ERROR build failed\thard\n' > "$STATE/FROZEN"
printf '2026-09-10 08:00:00\tpeer hold on PR #1\tsoft\n' >> "$STATE/FROZEN"
ask_director freeze peer-hold "Lift the stop?" b "$UNF"; id=$ASK_DIRECTOR_ID
"$DESK" answer "$id" 0 >"$STATE/o" 2>&1; rc=$?
if [ -f "$STATE/FROZEN" ] && grep -q 'deploy ERROR' "$STATE/FROZEN"; then pass "1a 'Lift the stop' on the soft (last) line keeps the hard line above it (rc $rc)"
else fail "1a 'Lift the stop' on the soft (last) line removed the HARD 'deploy ERROR' line too — FROZEN now: [$(cat "$STATE/FROZEN" 2>/dev/null | tr '\n' '|')] rc=$rc: $(cat "$STATE/o")"; fi
clean; for i in 1 2 3; do printf '2026-09-10 01:00:00\tstop %d\thard\n' $i >> "$STATE/FROZEN"; done; printf 'x\tlast soft\tsoft\n' >> "$STATE/FROZEN"
ask_director freeze last "Lift?" b "$UNF"; id=$ASK_DIRECTOR_ID; "$DESK" answer "$id" 0 >/dev/null 2>&1
left=0; [ -f "$STATE/FROZEN" ] && left=$(wc -l < "$STATE/FROZEN" | tr -d ' ')
[ "$left" = 3 ] && pass "1b 4-line FROZEN, question about line 4: exactly the 3 other lines remain" || fail "1b 4-line FROZEN: $left line(s) remain (want 3)"

# ── 2: an answer whose every write FAILED/was REFUSED (rc 4, failed:1, nothing lifted) still lands a ledger record
#      {"outcome":"resolved",…} — slice D counts resolved records per class+writes-shape (PROPOSE_AFTER=2), so two
#      refused taps propose AUTO_<CLASS>_UNFREEZE from decisions that applied nothing. A failed answer is not a resolution.
clean; printf '2026-09-10 06:00:00\tpeer hold on PR #1\tsoft\n' > "$STATE/FROZEN"
ask_director freeze peer-hold "Lift the stop?" b "$UNF"; id=$ASK_DIRECTOR_ID
printf '2026-09-10 07:00:00\tdeploy ERROR build failed\thard\n' > "$STATE/FROZEN"
"$DESK" answer "$id" 0 >/dev/null 2>&1; rc=$?
[ "$rc" -eq 4 ] && [ -f "$STATE/FROZEN" ] || fail "2-pre refused unfreeze expected rc 4 + FROZEN kept, got rc=$rc"
[ "$(grep -c '"resolved"' "$LEDGER")" -eq 0 ] && pass "2a a REFUSED unfreeze (stop changed, nothing lifted) writes NO 'resolved' ledger record" \
  || fail "2a a REFUSED unfreeze wrote a 'resolved' ledger record: $(cat "$LEDGER")"
clean; printf '1\n' > "$STATE/approve-held"; chmod 444 "$STATE/approve-held"; mkq q-20260910-001901-ro "$APP" freeze
"$DESK" answer q-20260910-001901-ro 0 >/dev/null 2>&1; rc=$?; chmod 644 "$STATE/approve-held"
[ "$rc" -eq 4 ] && [ "$(grep -c '"resolved"' "$LEDGER")" -eq 0 ] && pass "2b a FAILED append (knob unwritable, rc 4) writes NO 'resolved' ledger record" \
  || fail "2b failed append rc=$rc, ledger resolved records: $(grep -c '"resolved"' "$LEDGER")"

# ── 3: the wave runs under launchd with NO LANG (plist sets only PATH+HOME → C locale). bash's ${title:0:110} then
#      cuts by BYTES: a title with a multibyte character straddling byte 110 (an em-dash, Tamil) produces a file that is
#      not UTF-8. ask_director says "question written" (rc 0), but pending SKIPS it, the mirror lists it nowhere (not
#      even under ⚠ invalid) and questions_open_count says 0 — the question is silently lost while a PR stays HELD.
clean; TT="$(python3 -c 'print("x"*109+"—tail")')"
( export LC_ALL=C LANG=C; unset LC_CTYPE; say(){ :; }; . "$SW/failure-ledger.sh"; . "$SW/policy-learning.sh"; . "$SW/desk-questions.sh"
  ask_director held held "$TT" b "$NOOP" >/dev/null; echo $? > "$STATE/rc3" )
f=$(ls "$QUESTIONS_DIR"/q-*.json 2>/dev/null | head -1)
if [ -z "$f" ]; then
  [ "$(cat "$STATE/rc3")" != 0 ] && pass "3a C locale, em-dash at byte 110: refused (no file, rc $(cat "$STATE/rc3"))" || fail "3a C locale: no file written yet rc 0"
else
  python3 -c 'import sys;open(sys.argv[1],encoding="utf-8").read()' "$f" 2>/dev/null && pass "3a C locale, em-dash at byte 110: the question file is valid UTF-8" \
    || fail "3a C locale: question file is NOT valid UTF-8 (byte-sliced title) — ask_director rc $(cat "$STATE/rc3") claimed success"
  n=$(LC_ALL=en_US.UTF-8 "$DESK" pending 2>/dev/null | python3 -c 'import json,sys;print(len(json.load(sys.stdin)))')
  LC_ALL=en_US.UTF-8 "$DESK" mirror >/dev/null 2>&1
  [ "$n" -eq 1 ] || grep -q '⚠' "$FLEET_MD" && pass "3b the desk lists it (pending $n) or the mirror flags it" || fail "3b pending lists $n, mirror flags nothing — the question vanished silently"
fi

# ── 4: an option with an EMPTY writes list passes the validator; answering it applies nothing, prints NO receipt line
#      (spec §A2.5: one receipt per answer) and, on a freeze question, lands a 'resolved' ledger record with writes [].
clean; mkq q-20260910-001000-empty '[{"label":"Nothing","description":"d","writes":[]},{"label":"Keep","description":"k","writes":[{"op":"noop"}]}]' freeze
out=$("$DESK" answer q-20260910-001000-empty 0 2>&1); rc=$?
if [ "$rc" -ne 0 ]; then pass "4a empty writes list refused (rc $rc)"; elif [ -n "$out" ]; then pass "4a empty writes list answered with a receipt line: $out"
else fail "4a empty writes list: rc 0, NO receipt line, ledger: $(cat "$LEDGER")"; fi

# ── 5: the ✓/✗ on the receipt must come from the op's result, not from the words in an applied value
clean; mkq q-20260910-001302-adv '[{"label":"Advisory","description":"d","writes":[{"op":"append","file":"advisory-checks","value":"SDK review FAILED gate"}]},{"label":"Keep","description":"k","writes":[{"op":"noop"}]}]' freeze
out=$("$DESK" answer q-20260910-001302-adv 0 2>/dev/null); rc=$?
[ "$rc" -eq 0 ] && [ "$(cat "$STATE/advisory-checks")" = "SDK review FAILED gate" ] && case "$out" in *✗*) fail "5a applied (rc 0, knob written) but receipted ✗: $out";; *) pass "5a an applied value containing the word FAILED is receipted ✓";; esac \
  || fail "5a advisory append rc=$rc knob=[$(cat "$STATE/advisory-checks" 2>/dev/null)]"

# ── 6: AskUserQuestion takes 2–4 options (spec Amendments); a 1- or 5-option question can never be asked and the skill
#      may not add/remove options, so it is re-listed every pass forever. The validator must refuse it (reported, not asked).
clean; mkq q-20260910-002000-one '[{"label":"only","description":"d","writes":[{"op":"noop"}]}]' held
mkq q-20260910-002001-five '[{"label":"a","writes":[{"op":"noop"}]},{"label":"b","writes":[{"op":"noop"}]},{"label":"c","writes":[{"op":"noop"}]},{"label":"d","writes":[{"op":"noop"}]},{"label":"e","writes":[{"op":"noop"}]}]' held
n=$("$DESK" pending 2>/dev/null | python3 -c 'import json,sys;print(len(json.load(sys.stdin)))')
[ "$n" -eq 0 ] && pass "6a 1-option and 5-option questions are not listed as askable" || fail "6a pending lists $n un-askable question(s) (1 and 5 options; AskUserQuestion allows 2–4)"

# ── 7: a question file that is a SYMLINK: the id resolves outside <id>.json. Relative link to its own answered copy →
#      mv puts a self-pointing link over the answered record (destroyed), 9 tracebacks, rc 0, a second 'answered' log line.
clean; echo 'soft x' > "$STATE/FROZEN"; mkq q-20260910-001100-sym "$UNF" freeze "$NOW" 48 '"soft x"'
"$DESK" answer q-20260910-001100-sym 0 >/dev/null 2>&1; echo 'soft x' > "$STATE/FROZEN"
ln -s "answered/q-20260910-001100-sym.json" "$QUESTIONS_DIR/q-20260910-001100-sym.json"
"$DESK" answer q-20260910-001100-sym 0 >"$STATE/o" 2>"$STATE/e"; rc=$?
[ "$rc" -ne 0 ] && [ "$(grep -c Traceback "$STATE/e")" -eq 0 ] && pass "7a symlink question → its own answered copy: refused (rc $rc), no traceback" || fail "7a symlink question: rc=$rc tracebacks=$(grep -c Traceback "$STATE/e")"
python3 -c 'import json,sys;json.load(open(sys.argv[1]))' "$QUESTIONS_DIR/answered/q-20260910-001100-sym.json" 2>/dev/null && pass "7b the answered record survives" || fail "7b the answered record was destroyed (a self-pointing symlink sits where it was)"
[ "$(grep -c $'\tanswered\t' "$QUESTIONS_LOG")" -eq 1 ] && pass "7c only the real answer is logged" || fail "7c questions.log has $(grep -c $'\tanswered\t' "$QUESTIONS_LOG") 'answered' lines (want 1)"

echo; [ "$fails" -eq 0 ] && { echo "ALL PASS"; exit 0; } || { echo "$fails FAIL"; exit 1; }

#!/bin/bash
# test-desk-adversarial-r5.sh — round-5 adversarial cases for the desk (HUMAN-IN-THE-LOOP §A), written against 16e68344b3
# (round-4 fixes: line-scoped unfreeze, ledger resolved/refused, character caps, 2–4 options, ≥1 write, symlink refusal).
# Cases 1–5 HOLD on that commit and guard what round 4 built; case 6 FAILS on it: two FROZEN lines that agree for their
# first 400 flattened characters but differ after (one hard, one soft) are indistinguishable to the scoped `unfreeze`
# because BOTH sides cap at 400 — the soft line's question removes the hard line too. Contrived (same second, ≥379 shared
# message chars, different class) but it is the one input that still lets a tap remove a hard stop.
# Run from the worktree root:  bash scripts/ship-wave/tests/test-desk-adversarial-r5.sh
# Temp $STATE WITH A SPACE in its path, fixture Fleet note, touches nothing live. PASS/FAIL per case, exit 1 on any FAIL.
[ "${DESK_TEST_ENV_I:-}" = 1 ] || exec env -i PATH="$PATH" HOME="$HOME" DESK_TEST_ENV_I=1 bash "$0" "$@"
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; SW="$HERE/.."; DESK="$SW/desk/v5-w12-desk.sh"
ROOT="$(mktemp -d "${TMPDIR:-/tmp}/desk-r5.XXXXXX")"; export STATE="$ROOT/state with space"; mkdir -p "$STATE"
export FLEET_MD="$STATE/Fleet note.md" SHIP_WAVE_DIR="$SW"
trap 'chmod -R u+w "$ROOT" 2>/dev/null; find "$ROOT" -delete' EXIT
fails=0; pass() { printf 'PASS  %s\n' "$*"; }; fail() { printf 'FAIL  %s\n' "$*"; fails=$((fails+1)); }
say() { :; }
. "$SW/failure-ledger.sh"; . "$SW/policy-learning.sh"; . "$SW/desk-questions.sh"
FREEZE="$STATE/FROZEN"
# slice B's reader, verbatim (hitl-freeze-classes ship-wave.sh freeze_class_now) — what the wave will do with what remains
fcn() { local v; v=$(awk -F'\t' 'BEGIN{c="soft";n=0} {n++; if ((NF!=3 && NF!=4) || ($3!="soft" && $3!="hard")) {c="hard"; exit} if ($3=="hard") c="hard"} END{if (n==0) c="hard"; print c}' "$FREEZE" 2>/dev/null); case "$v" in soft|hard) printf '%s' "$v";; *) printf 'hard';; esac; }
NOW=$(python3 -c 'import datetime;print(datetime.datetime.now().astimezone().isoformat(timespec="seconds"))')
flat() { printf '%s' "$1" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read().replace(chr(9)," ")))'; }
mkq() { local fl=""; [ -n "${6:-}" ] && fl=",\"frozen_line\":$6"
  printf '{"id":"%s","asked_at":"%s","kind":"%s","class":"c","title":"t","body":"b","options":%s,"recommended":0,"expires_after_h":%s%s}' \
    "$1" "${4:-$NOW}" "${3:-freeze}" "$2" "${5:-48}" "$fl" > "$QUESTIONS_DIR/$1.json"; }
clean() { find "$QUESTIONS_DIR" -name '*.json' -delete; : > "$QUESTIONS_LOG"; : > "$LEDGER"; : > "$FLEET_MD"; rm -f "$FREEZE" "$STATE/approve-held"; }
UNF='[{"label":"Lift the stop","description":"l","writes":[{"op":"unfreeze"}]},{"label":"Keep","description":"k","writes":[{"op":"noop"}]}]'
APP='[{"label":"Approve #3410","description":"d","writes":[{"op":"append","file":"approve-held","value":"3410"}]},{"label":"Not now","description":"d","writes":[{"op":"noop"}]}]'
H1=$(printf 'a\tdeploy ERROR build failed\thard'); H2=$(printf 'b\tAPPLY failed 20260906213000\thard'); H3=$(printf 'c\tGATE ERROR x\thard')
S1=$(printf 'd\tpeer hold on PR #1\tsoft'); S2=$(printf 'e\tDirector hold on PR #2\tsoft')

# ── 1: 3 hard + 2 soft; a question about soft line 4 lifts exactly it; the 3 hard lines and the other soft stay in order
clean; printf '%s\n%s\n%s\n%s\n%s\n' "$H1" "$H2" "$H3" "$S1" "$S2" > "$FREEZE"
mkq q-20260910-001000-s1 "$UNF" freeze "$NOW" 48 "$(flat "$S1")"
out=$("$DESK" answer q-20260910-001000-s1 0 2>&1); rc=$?
[ "$rc" -eq 0 ] && [ "$(cat "$FREEZE")" = "$(printf '%s\n%s\n%s\n%s' "$H1" "$H2" "$H3" "$S2")" ] && [ "$(fcn)" = hard ] \
  && case "$out" in *"lifted 1 line(s); 4 still on — a HARD stop is still in force"*✓*) pass "1a 3 hard + 2 soft: only the asked soft line goes, order kept, class hard, receipt says so";; *) fail "1a receipt: $out";; esac \
  || fail "1a rc=$rc FROZEN=[$(tr '\n' '|' <"$FREEZE")]"
# a question about hard line H2 while H1 and H3 are also on: only H2 goes, the class stays hard
mkq q-20260910-001100-h2 "$UNF" freeze "$NOW" 48 "$(flat "$H2")"
out=$("$DESK" answer q-20260910-001100-h2 0 2>&1); rc=$?
[ "$rc" -eq 0 ] && [ "$(cat "$FREEZE")" = "$(printf '%s\n%s\n%s' "$H1" "$H3" "$S2")" ] && [ "$(fcn)" = hard ] && case "$out" in *"HARD stop is still in force"*) pass "1b a hard line's question with other hard lines on: only it goes, still hard";; *) fail "1b receipt: $out";; esac \
  || fail "1b rc=$rc FROZEN=[$(tr '\n' '|' <"$FREEZE")]"
# the last hard line's question, with a soft line left: the receipt turns soft (B would read soft — correct)
mkq q-20260910-001200-h1 "$UNF" freeze "$NOW" 48 "$(flat "$H1")"; "$DESK" answer q-20260910-001200-h1 0 >/dev/null 2>&1
mkq q-20260910-001201-h3 "$UNF" freeze "$NOW" 48 "$(flat "$H3")"; out=$("$DESK" answer q-20260910-001201-h3 0 2>&1)
[ "$(cat "$FREEZE")" = "$S2" ] && [ "$(fcn)" = soft ] && case "$out" in *"1 soft line(s) still on"*✓*) pass "1c last hard lifted, one soft left: receipt soft, B reads soft";; *) fail "1c receipt: $out";; esac || fail "1c FROZEN=[$(cat "$FREEZE")]"

# ── 2: a malformed remaining line (2 fields) must be read back as HARD — the same fail-safe as B's freeze_class_now
clean; printf 'z\tno class here\n%s\n' "$S1" > "$FREEZE"; mkq q-20260910-001300-mal "$UNF" freeze "$NOW" 48 "$(flat "$S1")"
out=$("$DESK" answer q-20260910-001300-mal 0 2>&1); case "$out" in *"HARD stop is still in force"*) pass "2a a malformed leftover line is reported as a HARD stop (in step with B)";; *) fail "2a receipt: $out";; esac

# ── 3: a $STATE path with a space, a title of exactly 110 multibyte characters and a class of 80 — under the C locale
clean; T110=$(python3 -c 'print("—"*110)'); C80=$(python3 -c 'print("ஆ"*80)')
ask_director held "$C80" "$T110" "b" "$APP"; id=$ASK_DIRECTOR_ID
r=$(python3 -c 'import json,sys;q=json.load(open(sys.argv[1]));print(len(q["title"]),len(q["class"]),q["title"]==sys.argv[2],q["class"]==sys.argv[3])' "$QUESTIONS_DIR/$id.json" "$T110" "$C80")
[ "$r" = "110 80 True True" ] && pass "3a 110 multibyte title and 80 multibyte class stored whole (C locale, space in \$STATE)" || fail "3a $r"
ask_director held "k" "$(python3 -c 'print("—"*111)')" "b" "$APP"
p=$("$DESK" pending 2>/dev/null | python3 -c 'import json,sys;print(sorted(len(q["title"]) for q in json.load(sys.stdin)))')
[ "$p" = "[110, 110]" ] && pass "3b pending lists both; the 111-char title was capped to 110 characters, not bytes" || fail "3b $p"
"$DESK" mirror >/dev/null 2>&1 && [ "$(grep -c '^\*\*[0-9]' "$FLEET_MD")" -eq 2 ] && grep -q -- "$T110" "$FLEET_MD" && pass "3c mirror lists both in a Fleet note whose path has a space" || fail "3c mirror"
out=$("$DESK" answer "$id" 0 2>&1); rc=$?; [ "$rc" -eq 0 ] && [ "$(cat "$STATE/approve-held")" = 3410 ] && pass "3d answer applies through the space path" || fail "3d rc=$rc $out"

# ── 4: concurrency — two desks answer two different soft questions at once; 8 refresh-asks race one answer
clean; printf '%s\n%s\n%s\n' "$H1" "$S1" "$S2" > "$FREEZE"
mkq q-20260910-001800-p1 "$UNF" freeze "$NOW" 48 "$(flat "$S1")"; mkq q-20260910-001801-p2 "$UNF" freeze "$NOW" 48 "$(flat "$S2")"
"$DESK" answer q-20260910-001800-p1 0 >"$ROOT/p1" 2>&1 & "$DESK" answer q-20260910-001801-p2 0 >"$ROOT/p2" 2>&1 & wait
[ "$(cat "$FREEZE")" = "$H1" ] && grep -q '✓' "$ROOT/p1" && grep -q '✓' "$ROOT/p2" && pass "4a two concurrent unfreezes about two lines: both soft lines gone, the hard line kept" || fail "4a FROZEN=[$(tr '\n' '|' <"$FREEZE")] p1=$(cat "$ROOT/p1") p2=$(cat "$ROOT/p2")"
clean; printf '%s\n%s\n' "$H1" "$S1" > "$FREEZE"; ask_director freeze peer-hold "T-race" "b" "$UNF"; id=$ASK_DIRECTOR_ID
for i in 1 2 3 4 5 6 7 8; do ( . "$SW/failure-ledger.sh"; . "$SW/policy-learning.sh"; . "$SW/desk-questions.sh"; ask_director freeze peer-hold "T-race" "b" "$UNF" ) >/dev/null 2>&1 & done
"$DESK" answer "$id" 0 >/dev/null 2>&1; rc=$?; wait
[ "$rc" -eq 0 ] && [ "$(cat "$FREEZE")" = "$H1" ] && [ ! -e "$QUESTIONS_DIR/$id.json" ] && [ "$(ls "$QUESTIONS_DIR/answered" | wc -l | tr -d ' ')" -eq 1 ] \
  && pass "4b 8 refresh-asks racing one answer: the answered id is not resurrected, one record, hard kept" || fail "4b rc=$rc open=[$(ls "$QUESTIONS_DIR"/q-*.json 2>/dev/null)]"

# ── 5: the same hard cause re-fires every round (freeze() appends, ask_director refreshes): one tap lifts ONE line, and the
#      receipt must say a HARD stop is still in force — the safe direction (a stop is never lifted more than asked)
clean; for i in 1 2 3; do printf '2026-09-11 10:0%s:00\tdeploy ERROR build failed\thard\tdeploy error build failed\n' "$i" >> "$FREEZE"
  ask_director freeze "deploy error build failed" "The ship wave stopped: production or main may be broken" "b" "$UNF"; done; id=$ASK_DIRECTOR_ID
[ "$(ls "$QUESTIONS_DIR"/q-*.json | wc -l | tr -d ' ')" -eq 1 ] || fail "5a three re-fires should be ONE refreshed question"
out=$("$DESK" answer "$id" 0 2>&1); rc=$?
[ "$rc" -eq 0 ] && [ "$(wc -l <"$FREEZE" | tr -d ' ')" -eq 2 ] && [ "$(fcn)" = hard ] && case "$out" in *"lifted 1 line(s); 2 still on — a HARD stop is still in force"*) pass "5a a re-fired cause: one tap lifts one line, two identical-cause lines remain, receipt says HARD (safe; needs N taps)";; *) fail "5a receipt: $out";; esac \
  || fail "5a rc=$rc lines=$(wc -l <"$FREEZE")"

# ── 6: two lines that agree for 400 flattened characters but differ after — one HARD, one soft (the question's line).
#      frozen_line and the comparison both cap at 400, so the hard line is indistinguishable and is removed as well.
clean; LONG=$(python3 -c 'print("m"*420)'); printf 'same\t%s\thard\nsame\t%s\tsoft\n' "$LONG" "$LONG" > "$FREEZE"
ask_director freeze cls "The ship wave paused on one item; safe merges and deploys continue" "b" "$UNF"; id=$ASK_DIRECTOR_ID
out=$("$DESK" answer "$id" 0 2>&1); rc=$?
if [ -e "$FREEZE" ] && grep -q $'\thard$' "$FREEZE"; then pass "6a a hard line that shares the soft line's first 400 characters survives the soft line's question"
else fail "6a BOTH lines lifted (rc $rc, FROZEN exists: $([ -e "$FREEZE" ] && echo yes || echo no)) — the 400-character cap made a hard line equal to the soft line asked about: $out"; fi

echo; [ "$fails" -eq 0 ] && { echo "ALL PASS"; exit 0; } || { echo "$fails FAIL"; exit 1; }

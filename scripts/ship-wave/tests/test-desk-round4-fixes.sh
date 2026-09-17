#!/bin/bash
# test-desk-round4-fixes.sh — regression cases for the round-4 desk breaks (HUMAN-IN-THE-LOOP §A / §D), one block
# per break: NEW-A (line-scoped unfreeze — a tap never removes a hard stop; = the wave side's H11), NEW-B (ledger
# 'resolved' only when something applied), NEW-C (title/class/frozen_line capped by CHARACTERS under the C locale),
# NEW-D (≥1 write per option), NEW-E (receipt ✓/✗ from the op's rc), NEW-F (2–4 options), NEW-G (symlink question
# refused unread) + the re-used-id overwrite the untracked r3 file found. Every case FAILED on 5b7358b5a1.
# Run from the worktree root:  bash scripts/ship-wave/tests/test-desk-round4-fixes.sh
# Runs itself under `env -i PATH HOME` — the C locale launchd gives the wave — so a byte-slicing bug fails here.
# Temp $STATE, fixture Fleet.md, touches nothing live. PASS/FAIL per case, exit 1 on any FAIL.
[ "${DESK_TEST_ENV_I:-}" = 1 ] || exec env -i PATH="$PATH" HOME="$HOME" DESK_TEST_ENV_I=1 bash "$0" "$@"
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; SW="$HERE/.."; DESK="$SW/desk/v5-w12-desk.sh"
export STATE; STATE="$(mktemp -d "${TMPDIR:-/tmp}/desk-r4fix.XXXXXX")"
export FLEET_MD="$STATE/Fleet.md" SHIP_WAVE_DIR="$SW"
trap 'chmod -R u+w "$STATE" 2>/dev/null; find "$STATE" -delete' EXIT
fails=0; pass() { printf 'PASS  %s\n' "$*"; }; fail() { printf 'FAIL  %s\n' "$*"; fails=$((fails+1)); }
say() { :; }
. "$SW/failure-ledger.sh"; . "$SW/policy-learning.sh"; . "$SW/desk-questions.sh"
FREEZE="$STATE/FROZEN"
NOW=$(python3 -c 'import datetime;print(datetime.datetime.now().astimezone().isoformat(timespec="seconds"))')
mkq() { local fl=""; [ -n "${6:-}" ] && fl=",\"frozen_line\":$6"
  printf '{"id":"%s","asked_at":"%s","kind":"%s","class":"c","title":"t","body":"b","options":%s,"recommended":0,"expires_after_h":%s%s}' \
    "$1" "${4:-$NOW}" "${3:-freeze}" "$2" "${5:-48}" "$fl" > "$QUESTIONS_DIR/$1.json"; }
clean() { find "$QUESTIONS_DIR" -name '*.json' -delete; find "$QUESTIONS_DIR" -type l -delete; : > "$QUESTIONS_LOG"; : > "$LEDGER"; : > "$FLEET_MD"
          chmod u+w "$STATE/approve-held" 2>/dev/null; rm -f "$STATE/FROZEN" "$STATE/approve-held" "$STATE/allow-destructive" "$STATE/advisory-checks" "$STATE/outside.json"; }
ledger_n() { grep -c "\"outcome\": \"$1\"" "$LEDGER"; }
UNF='[{"label":"Lift the stop","description":"l","writes":[{"op":"unfreeze"}]},{"label":"Keep","description":"k","writes":[{"op":"noop"}]}]'
NOOP='[{"label":"Keep","description":"d","writes":[{"op":"noop"}]},{"label":"Also keep","description":"d","writes":[{"op":"noop"}]}]'
APP='[{"label":"Approve #3410","description":"d","writes":[{"op":"append","file":"approve-held","value":"3410"}]},{"label":"Not now","description":"d","writes":[{"op":"noop"}]}]'

# the wave's reading of FROZEN, copied verbatim from slice B (hitl-freeze-classes ship-wave.sh freeze_class_now):
# HARD if ANY live line is hard — most severe wins; malformed lines and an empty file read hard (fail-safe)
freeze_class_now() {
  local v; v=$(awk -F'\t' 'BEGIN{c="soft";n=0} {n++; if ((NF!=3 && NF!=4) || ($3!="soft" && $3!="hard")) {c="hard"; exit} if ($3=="hard") c="hard"} END{if (n==0) c="hard"; print c}' "$FREEZE" 2>/dev/null)
  case "$v" in soft|hard) printf '%s' "$v";; *) printf 'hard';; esac
}

# ── NEW-A: unfreeze is LINE-SCOPED. FROZEN = hard line, then soft line (the phone's --freeze on top of an unresolved
#    hard stop); the question is about the soft line (tail -1); the tap removes ONLY that line, the hard line stays,
#    and the wave's freeze_class_now on what remains is still hard — shipping stays blocked.
clean; printf '2026-09-10 07:00:00\tdeploy ERROR build failed\thard\n' > "$FREEZE"
printf '2026-09-10 08:00:00\tpeer hold on PR #1\tsoft\n' >> "$FREEZE"
ask_director freeze peer-hold "Lift the stop?" b "$UNF"; id=$ASK_DIRECTOR_ID
out=$("$DESK" answer "$id" 0 2>&1); rc=$?
[ "$(cat "$FREEZE" 2>/dev/null)" = "$(printf '2026-09-10 07:00:00\tdeploy ERROR build failed\thard')" ] \
  && pass "NEW-A-1 FROZEN contains ONLY the hard line after the soft line's question is answered (rc $rc)" \
  || fail "NEW-A-1 FROZEN after: [$(cat "$FREEZE" 2>/dev/null | tr '\n' '|')] rc=$rc: $out"
[ "$(freeze_class_now)" = hard ] && pass "NEW-A-2 slice B's freeze_class_now on what remains: hard — shipping stays blocked" || fail "NEW-A-2 freeze_class_now = $(freeze_class_now)"
[ "$rc" -eq 0 ] && case "$out" in *"→ unfreeze (lifted 1 line(s); 1 still on — a HARD stop is still in force"*✓*) pass "NEW-A-3 receipt says what was lifted and that a HARD stop is still in force: ✓";; *) fail "NEW-A-3 receipt: $out";; esac \
  || fail "NEW-A-3 rc=$rc: $out"
[ "$(ledger_n resolved)" -eq 1 ] && pass "NEW-A-4 the soft stop's decision is on the ledger as resolved (it did apply)" || fail "NEW-A-4 ledger resolved=$(ledger_n resolved)"
# the hard line's OWN question still lifts the hard line (frozen_line = the only line now) → file removed
ask_director freeze deploy-error "Lift the hard stop?" b "$UNF"; id2=$ASK_DIRECTOR_ID
out=$("$DESK" answer "$id2" 0 2>&1); rc=$?
[ "$rc" -eq 0 ] && [ ! -e "$FREEZE" ] && pass "NEW-A-5 the hard line's own question lifts it; no line left → FROZEN removed" || fail "NEW-A-5 rc=$rc FROZEN=$(cat "$FREEZE" 2>/dev/null): $out"
# 4-line file (3 hard + 1 soft), question about line 4: exactly the 3 hard lines remain, in order, still hard
clean; for i in 1 2 3; do printf '2026-09-10 01:00:00\tstop %d\thard\n' $i >> "$FREEZE"; done; printf 'x\tlast soft\tsoft\n' >> "$FREEZE"
ask_director freeze last "Lift?" b "$UNF"; id=$ASK_DIRECTOR_ID; "$DESK" answer "$id" 0 >/dev/null 2>&1
[ "$(cut -f2 "$FREEZE" | tr '\n' ',')" = "stop 1,stop 2,stop 3," ] && [ "$(freeze_class_now)" = hard ] \
  && pass "NEW-A-6 4-line FROZEN, question about line 4: the 3 hard lines remain in order, class hard" || fail "NEW-A-6 FROZEN: [$(cat "$FREEZE" 2>/dev/null | tr '\n' '|')]"
# a question about a line that is no longer there (already lifted / replaced) is refused, nothing removed
clean; printf 'a\tpeer hold on PR #1\tsoft\n' > "$FREEZE"; ask_director freeze peer-hold "Lift?" b "$UNF"; id=$ASK_DIRECTOR_ID
printf 'b\tdeploy ERROR build failed\thard\n' > "$FREEZE"
out=$("$DESK" answer "$id" 0 2>&1); rc=$?
[ "$rc" -eq 4 ] && [ "$(cat "$FREEZE")" = "$(printf 'b\tdeploy ERROR build failed\thard')" ] && case "$out" in *"the stop has changed since you were asked — nothing lifted"*✗*) pass "NEW-A-7 no matching line: refused (rc 4), FROZEN untouched, ✗";; *) fail "NEW-A-7 receipt: $out";; esac \
  || fail "NEW-A-7 rc=$rc FROZEN=[$(cat "$FREEZE" | tr '\n' '|')]: $out"
# a duplicate of the asked line: both copies of that ONE stop go, nothing else
clean; printf 'a\tsame stop\tsoft\nb\tother\thard\na\tsame stop\tsoft\n' > "$FREEZE"; ask_director freeze same "Lift?" b "$UNF"; id=$ASK_DIRECTOR_ID
"$DESK" answer "$id" 0 >/dev/null 2>&1; [ "$(cat "$FREEZE")" = "$(printf 'b\tother\thard')" ] && pass "NEW-A-8 duplicate lines of the asked stop both go; the other hard line stays" || fail "NEW-A-8 FROZEN: [$(cat "$FREEZE" 2>/dev/null | tr '\n' '|')]"
[ ! -e "$FREEZE.tmp."* ] 2>/dev/null; ls "$STATE"/FROZEN.tmp.* >/dev/null 2>&1 && fail "NEW-A-9 a FROZEN.tmp.* file was left behind" || pass "NEW-A-9 no temp file left behind"

# ── NEW-B: the ledger says 'resolved' ONLY when ≥1 write applied and none failed; otherwise 'refused' (chosen/reason)
clean; printf '2026-09-10 06:00:00\tpeer hold on PR #1\tsoft\n' > "$FREEZE"
ask_director freeze peer-hold "Lift the stop?" b "$UNF"; id=$ASK_DIRECTOR_ID
printf '2026-09-10 07:00:00\tdeploy ERROR build failed\thard\n' > "$FREEZE"
"$DESK" answer "$id" 0 >/dev/null 2>&1; rc=$?
[ "$rc" -eq 4 ] && [ "$(ledger_n resolved)" -eq 0 ] && [ "$(ledger_n refused)" -eq 1 ] \
  && pass "NEW-B-1 refused unfreeze (stop changed): ledger has 0 resolved, 1 refused" || fail "NEW-B-1 rc=$rc resolved=$(ledger_n resolved) refused=$(ledger_n refused): $(cat "$LEDGER")"
python3 - "$LEDGER" <<'PY' && pass "NEW-B-2 the refused record carries class, chosen and a reason naming the refusal" || fail "NEW-B-2 refused record shape: $(cat "$LEDGER")"
import json, sys
r = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]; r = [x for x in r if x["outcome"] == "refused"]
assert len(r) == 1 and r[0]["class"] == "peer-hold" and r[0]["chosen"] == "Lift the stop" and "the stop has changed" in r[0]["reason"] and r[0]["failed"] == 1 and "writes" not in r[0], r
PY
clean; printf '1\n' > "$STATE/approve-held"; chmod 444 "$STATE/approve-held"; mkq q-20260910-001901-ro "$APP" freeze
"$DESK" answer q-20260910-001901-ro 0 >/dev/null 2>&1; rc=$?; chmod 644 "$STATE/approve-held"
[ "$rc" -eq 4 ] && [ "$(ledger_n resolved)" -eq 0 ] && [ "$(ledger_n refused)" -eq 1 ] \
  && pass "NEW-B-3 failed append (knob unwritable, rc 4): 0 resolved, 1 refused" || fail "NEW-B-3 rc=$rc resolved=$(ledger_n resolved) refused=$(ledger_n refused)"
clean; printf 'a\tpeer hold\tsoft\n' > "$FREEZE"; ask_director freeze peer-hold "Lift?" b "$UNF"; id=$ASK_DIRECTOR_ID
"$DESK" answer "$id" 0 >/dev/null 2>&1; rc=$?
[ "$rc" -eq 0 ] && [ ! -e "$FREEZE" ] && [ "$(ledger_n resolved)" -eq 1 ] && [ "$(ledger_n refused)" -eq 0 ] \
  && pass "NEW-B-4 control: an unfreeze that applied is still recorded resolved (1) and never refused" || fail "NEW-B-4 rc=$rc resolved=$(ledger_n resolved) refused=$(ledger_n refused)"
clean; mkq q-20260910-001902-keep "$NOOP" freeze; "$DESK" answer q-20260910-001902-keep 0 >/dev/null 2>&1
[ "$(ledger_n resolved)" -eq 1 ] && pass "NEW-B-5 control: 'Keep' (noop) is a decision that applied — resolved" || fail "NEW-B-5 noop: resolved=$(ledger_n resolved)"
clean; mkq q-20260910-001903-held "$APP" held; "$DESK" answer q-20260910-001903-held 0 >/dev/null 2>&1
[ "$(wc -c < "$LEDGER" | tr -d ' ')" -eq 0 ] && pass "NEW-B-6 a non-freeze answer still writes no ledger record" || fail "NEW-B-6 ledger: $(cat "$LEDGER")"

# ── NEW-C: the cap is by CHARACTERS. Title 'é' + 107×'x' + '漢' + 'tail': 漢 occupies BYTES 109–111, so a byte slice
#    at 110 cut it in half. This whole file runs under env -i (C locale), exactly as launchd runs the wave.
[ -z "${LANG:-}${LC_ALL:-}${LC_CTYPE:-}" ] && pass "NEW-C-0 this test runs with no LANG/LC_* (C locale, as launchd)" || fail "NEW-C-0 locale leaked in: LANG=${LANG:-} LC_ALL=${LC_ALL:-}"
clean; TT="$(python3 -c 'print("é"+"x"*107+"漢tail")')"; WANT="$(python3 -c 'print("é"+"x"*107+"漢t")')"
ask_director held held "$TT" b "$NOOP" >/dev/null; rc=$?; f=$(ls "$QUESTIONS_DIR"/q-*.json 2>/dev/null | head -1)
[ "$rc" -eq 0 ] && [ -n "$f" ] && python3 -c 'import sys;open(sys.argv[1],encoding="utf-8").read()' "$f" 2>/dev/null \
  && pass "NEW-C-1 C locale, CJK at bytes 109–111: rc 0 and the file is valid UTF-8" || fail "NEW-C-1 rc=$rc file=${f:-none} utf8=$([ -n "$f" ] && python3 -c 'import sys;open(sys.argv[1],encoding="utf-8").read()' "$f" 2>/dev/null && echo yes || echo NO)"
[ -n "$f" ] && [ "$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["title"])' "$f")" = "$WANT" ] && pass "NEW-C-2 title is the first 110 CHARACTERS (é and 漢 intact)" || fail "NEW-C-2 title: $(python3 -c 'import json,sys;t=json.load(open(sys.argv[1]))["title"];print(len(t),repr(t[-4:]))' "$f" 2>&1)"
n=$("$DESK" pending 2>/dev/null | python3 -c 'import json,sys;print(len(json.load(sys.stdin)))'); [ "$n" -eq 1 ] && pass "NEW-C-3 the desk (also C locale) lists it: pending 1" || fail "NEW-C-3 pending lists $n"
[ "$(questions_open_count)" -eq 1 ] && pass "NEW-C-4 questions_open_count (the receipt's number) says 1" || fail "NEW-C-4 questions_open_count=$(questions_open_count)"
"$DESK" mirror >/dev/null 2>&1; grep -q "漢" "$FLEET_MD" && pass "NEW-C-5 the mirror carries the title intact" || fail "NEW-C-5 mirror: $(cat "$FLEET_MD")"
# class (80) and frozen_line (400) go through the same cap — a Tamil class of 50 chars (150 bytes) is kept whole
clean; CT="$(python3 -c 'print("அ"*50)')"; ask_director policy "$CT" "Rule?" b "$NOOP" >/dev/null; f=$(ls "$QUESTIONS_DIR"/q-*.json | head -1)
[ "$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["class"])' "$f")" = "$CT" ] && pass "NEW-C-6 a 50-char Tamil class (150 bytes) is kept whole under the 80-char cap" || fail "NEW-C-6 class cut: $(python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))["class"]))' "$f")"
clean; FL="$(python3 -c 'print("x\t"+"தமிழ்"*30+"\tsoft")')"; printf '%s\n' "$FL" > "$FREEZE"; ask_director freeze tamil "Lift?" b "$UNF"; id=$ASK_DIRECTOR_ID
"$DESK" answer "$id" 0 >/dev/null 2>&1; rc=$?; [ "$rc" -eq 0 ] && [ ! -e "$FREEZE" ] && pass "NEW-C-7 a multibyte frozen_line round-trips: the C-locale desk lifts it" || fail "NEW-C-7 rc=$rc FROZEN=$(cat "$FREEZE" 2>/dev/null | cut -c1-60)"
# a file that is NOT UTF-8 (written by an older wave) is refused by the validator and flagged by the mirror, not lost
clean; printf '{"id":"q-20260910-003000-bad-utf8","asked_at":"%s","kind":"held","class":"c","title":"x\xe2\x80","body":"b","options":%s,"recommended":0,"expires_after_h":48}' "$NOW" "$NOOP" > "$QUESTIONS_DIR/q-20260910-003000-bad-utf8.json"
why=$(question_file_valid "$QUESTIONS_DIR/q-20260910-003000-bad-utf8.json"); rc=$?
[ "$rc" -ne 0 ] && case "$why" in *"not valid UTF-8"*) pass "NEW-C-8 a non-UTF-8 question file is refused by the validator: $why";; *) fail "NEW-C-8 refused for another reason: $why";; esac || fail "NEW-C-8 accepted a non-UTF-8 file"
"$DESK" mirror >/dev/null 2>&1; grep -q '⚠ invalid question, not askable: q-20260910-003000-bad-utf8' "$FLEET_MD" && pass "NEW-C-9 the mirror flags it under ⚠ invalid" || fail "NEW-C-9 mirror: $(cat "$FLEET_MD")"

# ── NEW-D: an option needs ≥1 write (noop is a write; [] is not) — invalid, refused, reported
clean; EMPTY='[{"label":"Nothing","description":"d","writes":[]},{"label":"Keep","description":"k","writes":[{"op":"noop"}]}]'
why=$(question_writes_valid "$EMPTY"); rc=$?; [ "$rc" -ne 0 ] && case "$why" in *"option 0: writes is empty"*) pass "NEW-D-1 validator: empty writes list → invalid ($why)";; *) fail "NEW-D-1 wrong reason: $why";; esac || fail "NEW-D-1 validator accepted an empty writes list"
ask_director freeze e "Nothing?" b "$EMPTY" >/dev/null; rc=$?; [ "$rc" -ne 0 ] && [ -z "$(ls "$QUESTIONS_DIR"/q-*.json 2>/dev/null)" ] && grep -q $'\trefused\t' "$QUESTIONS_LOG" && pass "NEW-D-2 ask_director refuses to write it (rc $rc, logged refused)" || fail "NEW-D-2 rc=$rc files=$(ls "$QUESTIONS_DIR"/q-*.json 2>/dev/null)"
mkq q-20260910-001000-empty "$EMPTY" freeze
n=$("$DESK" pending 2>"$STATE/e" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)))'); grep -q 'desk: invalid question q-20260910-001000-empty — .*writes is empty' "$STATE/e" && [ "$n" -eq 0 ] && pass "NEW-D-3 pending: not listed, reported on stderr" || fail "NEW-D-3 pending=$n stderr: $(cat "$STATE/e")"
out=$("$DESK" answer q-20260910-001000-empty 0 2>&1); rc=$?
[ "$rc" -eq 3 ] && [ -f "$QUESTIONS_DIR/q-20260910-001000-empty.json" ] && [ "$(wc -c < "$LEDGER" | tr -d ' ')" -eq 0 ] && case "$out" in *REFUSED*"writes is empty"*) pass "NEW-D-4 answer: refused (rc 3), file left in place, no ledger record";; *) fail "NEW-D-4 output: $out";; esac || fail "NEW-D-4 rc=$rc ledger=$(cat "$LEDGER")"
[ "$(printf '%s' "$NOOP" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)[0]["writes"]))')" -eq 1 ] && question_writes_valid "$NOOP" >/dev/null && pass "NEW-D-5 control: a single noop is a valid write" || fail "NEW-D-5 noop-only option refused"

# ── NEW-E: ✓/✗ comes from apply_write's return code, never from the words in the value
clean; mkq q-20260910-001302-adv '[{"label":"Advisory","description":"d","writes":[{"op":"append","file":"advisory-checks","value":"SDK review FAILED gate"}]},{"label":"Keep","description":"k","writes":[{"op":"noop"}]}]' freeze
out=$("$DESK" answer q-20260910-001302-adv 0 2>/dev/null); rc=$?
[ "$rc" -eq 0 ] && [ "$(cat "$STATE/advisory-checks")" = "SDK review FAILED gate" ] && [ "$out" = "q-20260910-001302-adv → append advisory-checks SDK review FAILED gate ✓" ] \
  && pass "NEW-E-1 an applied value containing FAILED is receipted ✓" || fail "NEW-E-1 rc=$rc knob=[$(cat "$STATE/advisory-checks" 2>/dev/null)] out: $out"
clean; printf '1\n' > "$STATE/approve-held"; chmod 444 "$STATE/approve-held"; mkq q-20260910-001303-ro "$APP" held
out=$("$DESK" answer q-20260910-001303-ro 0 2>/dev/null); rc=$?; chmod 644 "$STATE/approve-held"
[ "$rc" -eq 4 ] && case "$out" in *"append approve-held"*✗) pass "NEW-E-2 a write that really failed (rc 1) is receipted ✗";; *) fail "NEW-E-2 out: $out";; esac || fail "NEW-E-2 rc=$rc: $out"
clean; printf '1\n' > "$STATE/approve-held"; chmod 444 "$STATE/approve-held"
mkq q-20260910-001304-mix '[{"label":"Both","description":"d","writes":[{"op":"append","file":"advisory-checks","value":"ok check"},{"op":"append","file":"approve-held","value":"3410"}]},{"label":"Keep","description":"k","writes":[{"op":"noop"}]}]' freeze
out=$("$DESK" answer q-20260910-001304-mix 0 2>/dev/null); rc=$?; chmod 644 "$STATE/approve-held"
[ "$rc" -eq 4 ] && [ "$(printf '%s' "$out" | grep -c '✓$')" -eq 1 ] && [ "$(printf '%s' "$out" | grep -c '✗$')" -eq 1 ] && [ "$(ledger_n refused)" -eq 1 ] && [ "$(ledger_n resolved)" -eq 0 ] \
  && pass "NEW-E-3 two writes, one ok one failed: one ✓ line, one ✗ line, rc 4, ledger refused (partly failed ≠ resolved)" || fail "NEW-E-3 rc=$rc resolved=$(ledger_n resolved) refused=$(ledger_n refused) out: $out"

# ── NEW-F: 2–4 options; 1 or 5 can never be asked (AskUserQuestion's range) — invalid, reported, never listed
clean; mkq q-20260910-002000-one '[{"label":"only","description":"d","writes":[{"op":"noop"}]}]' held
mkq q-20260910-002001-five '[{"label":"a","writes":[{"op":"noop"}]},{"label":"b","writes":[{"op":"noop"}]},{"label":"c","writes":[{"op":"noop"}]},{"label":"d","writes":[{"op":"noop"}]},{"label":"e","writes":[{"op":"noop"}]}]' held
mkq q-20260910-002002-two "$NOOP" held
mkq q-20260910-002003-four '[{"label":"a","writes":[{"op":"noop"}]},{"label":"b","writes":[{"op":"noop"}]},{"label":"c","writes":[{"op":"noop"}]},{"label":"d","writes":[{"op":"noop"}]}]' held
ids=$("$DESK" pending 2>"$STATE/e" | python3 -c 'import json,sys;print(" ".join(q["id"] for q in json.load(sys.stdin)))')
[ "$ids" = "q-20260910-002002-two q-20260910-002003-four" ] && pass "NEW-F-1 pending lists the 2- and 4-option questions only" || fail "NEW-F-1 pending: $ids"
[ "$(grep -c 'option(s): a question needs 2–4' "$STATE/e")" -eq 2 ] && pass "NEW-F-2 the 1- and 5-option files are reported on stderr, not asked" || fail "NEW-F-2 stderr: $(cat "$STATE/e")"
"$DESK" answer q-20260910-002000-one 0 >/dev/null 2>&1; rc=$?; [ "$rc" -eq 3 ] && pass "NEW-F-3 answering the 1-option file is refused (rc 3)" || fail "NEW-F-3 rc=$rc"
ask_director held held "one?" b '[{"label":"only","writes":[{"op":"noop"}]}]' >/dev/null; rc=$?; [ "$rc" -ne 0 ] && pass "NEW-F-4 ask_director refuses to write a 1-option question (rc $rc)" || fail "NEW-F-4 rc 0"
"$DESK" mirror >/dev/null 2>&1; [ "$(grep -c '⚠ invalid question' "$FLEET_MD")" -eq 2 ] && pass "NEW-F-5 the mirror flags both under ⚠ invalid" || fail "NEW-F-5 mirror: $(grep -c '⚠' "$FLEET_MD") flags"

# ── NEW-G: a question file that is a SYMLINK is refused unread — relative (its own answered copy) and absolute (outside)
clean; printf 'a\tsoft x\tsoft\n' > "$FREEZE"; mkq q-20260910-001100-sym "$UNF" freeze "$NOW" 48 '"a soft x soft"'
"$DESK" answer q-20260910-001100-sym 0 >/dev/null 2>&1; rc=$?; [ "$rc" -eq 0 ] || fail "NEW-G-pre first answer rc=$rc"
printf 'a\tsoft x\tsoft\n' > "$FREEZE"
ln -s "answered/q-20260910-001100-sym.json" "$QUESTIONS_DIR/q-20260910-001100-sym.json"
"$DESK" answer q-20260910-001100-sym 0 >"$STATE/o" 2>"$STATE/e"; rc=$?
[ "$rc" -eq 3 ] && [ "$(grep -c Traceback "$STATE/e")" -eq 0 ] && grep -q 'is a symlink' "$STATE/o" && pass "NEW-G-1 symlink → its own answered copy: refused (rc 3), no traceback" || fail "NEW-G-1 rc=$rc tracebacks=$(grep -c Traceback "$STATE/e") out: $(cat "$STATE/o")"
[ ! -L "$QUESTIONS_DIR/answered/q-20260910-001100-sym.json" ] && python3 -c 'import json,sys;assert json.load(open(sys.argv[1]))["chosen"]=="Lift the stop"' "$QUESTIONS_DIR/answered/q-20260910-001100-sym.json" 2>/dev/null && pass "NEW-G-2 the answered record survives, a real file" || fail "NEW-G-2 the answered record was destroyed"
[ "$(grep -c $'\tanswered\t' "$QUESTIONS_LOG")" -eq 1 ] && [ -f "$FREEZE" ] && pass "NEW-G-3 only the real answer is logged; FROZEN untouched" || fail "NEW-G-3 answered lines=$(grep -c $'\tanswered\t' "$QUESTIONS_LOG") FROZEN=$([ -f "$FREEZE" ] && echo kept || echo GONE)"
clean; printf 'a\tsoft x\tsoft\n' > "$FREEZE"
printf '{"id":"q-20260910-001101-out","asked_at":"%s","kind":"freeze","class":"c","title":"t","body":"b","options":%s,"recommended":0,"expires_after_h":48,"frozen_line":"a soft x soft"}' "$NOW" "$UNF" > "$STATE/outside.json"
ln -s "$STATE/outside.json" "$QUESTIONS_DIR/q-20260910-001101-out.json"
"$DESK" answer q-20260910-001101-out 0 >/dev/null 2>&1; rc=$?
[ "$rc" -eq 3 ] && [ -f "$FREEZE" ] && [ -f "$STATE/outside.json" ] && pass "NEW-G-4 symlink to a valid question OUTSIDE questions/: refused, FROZEN kept, outside file untouched" || fail "NEW-G-4 rc=$rc FROZEN=$([ -f "$FREEZE" ] && echo kept || echo GONE)"
n=$("$DESK" pending 2>"$STATE/e" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)))'); grep -q 'q-20260910-001101-out — is a symlink' "$STATE/e" && [ "$n" -eq 0 ] && pass "NEW-G-5 pending skips the symlink and says why" || fail "NEW-G-5 pending=$n stderr: $(cat "$STATE/e")"
"$DESK" mirror >/dev/null 2>&1; grep -q '⚠ invalid question, not askable: q-20260910-001101-out: is a symlink' "$FLEET_MD" && pass "NEW-G-6 the mirror flags it" || fail "NEW-G-6 mirror: $(cat "$FLEET_MD")"
# the re-used-id overwrite (untracked r3 case 5): answered/<id>.json already exists → refused, record kept
clean; mkq q-20260910-001700-re "$APP" held; "$DESK" answer q-20260910-001700-re 0 >/dev/null 2>&1
mkq q-20260910-001700-re "$NOOP" held; out=$("$DESK" answer q-20260910-001700-re 0 2>&1); rc=$?
[ "$rc" -eq 3 ] && [ "$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["chosen"])' "$QUESTIONS_DIR/answered/q-20260910-001700-re.json")" = "Approve #3410" ] && [ -f "$QUESTIONS_DIR/q-20260910-001700-re.json" ] \
  && pass "NEW-G-7 a re-used id is refused (rc 3); the earlier answered record and the new file both survive" || fail "NEW-G-7 rc=$rc: $out"
[ "$(grep -c 3410 "$STATE/approve-held")" -eq 1 ] && pass "NEW-G-8 …and nothing was applied twice" || fail "NEW-G-8 approve-held: $(cat "$STATE/approve-held")"

echo; [ "$fails" -eq 0 ] && { echo "ALL PASS"; exit 0; } || { echo "$fails FAIL"; exit 1; }

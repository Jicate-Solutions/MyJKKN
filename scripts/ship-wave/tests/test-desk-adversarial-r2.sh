#!/bin/bash
# test-desk-adversarial-r2.sh — round-2 attempts to BREAK the desk (HUMAN-IN-THE-LOOP §A), written against 683a4a7760
# after the round-1 fixes held. Every case here FAILED on that commit; each says what the fix must be.
# Run from the worktree root:  bash scripts/ship-wave/tests/test-desk-adversarial-r2.sh
# Temp $STATE, fixture Fleet.md, touches nothing live. PASS/FAIL per case, exit 1 on any FAIL.
# Runs itself under `env -i PATH HOME` — the C locale launchd gives the wave — so a byte-counting bug fails here (round 4).
[ "${DESK_TEST_ENV_I:-}" = 1 ] || exec env -i PATH="$PATH" HOME="$HOME" DESK_TEST_ENV_I=1 bash "$0" "$@"
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; SW="$HERE/.."; DESK="$SW/desk/v5-w12-desk.sh"
export STATE; STATE="$(mktemp -d "${TMPDIR:-/tmp}/desk-adv2.XXXXXX")"
export FLEET_MD="$STATE/Fleet.md" SHIP_WAVE_DIR="$SW"
trap 'rm -rf "$STATE"' EXIT
fails=0; pass() { printf 'PASS  %s\n' "$*"; }; fail() { printf 'FAIL  %s\n' "$*"; fails=$((fails+1)); }
say() { :; }
. "$SW/failure-ledger.sh"; . "$SW/policy-learning.sh"; . "$SW/desk-questions.sh"
NOW=$(python3 -c 'import datetime;print(datetime.datetime.now().astimezone().isoformat(timespec="seconds"))')
mkq() { # <id> <options-json> [kind] [asked_at] [expires] → raw question file, bypassing ask_director
  printf '{"id":"%s","asked_at":"%s","kind":"%s","class":"c","title":"t","body":"b","options":%s,"recommended":0,"expires_after_h":%s}' \
    "$1" "${4:-$NOW}" "${3:-freeze}" "$2" "${5:-48}" > "$QUESTIONS_DIR/$1.json"; }
HEAD='## W12 desk — waiting on you'
OPTS='[{"label":"Lift the stop","description":"lifts","writes":[{"op":"unfreeze"}]},{"label":"Keep","description":"keeps","writes":[{"op":"noop"}]}]'

# ── 1. one tap, two desk processes: the write must land ONCE ─────────────────
# (BREAK) fix: cmd_answer must claim the file atomically (mv to <id>.json.claiming or mkdir lock) before applying;
# the loser exits 2 "already answered" and writes no knob line, no log line, no ledger record.
: > "$STATE/approve-held"; : > "$LEDGER"
mkq q-20260910-000120-race '[{"label":"ok","description":"d","writes":[{"op":"append","file":"approve-held","value":"7777"}]},{"label":"Keep","writes":[{"op":"noop"}]}]'
( "$DESK" answer q-20260910-000120-race 0 >/dev/null 2>&1; echo $? > "$STATE/r1.rc" ) & ( "$DESK" answer q-20260910-000120-race 0 >/dev/null 2>&1; echo $? > "$STATE/r2.rc" ) & wait
n=$(grep -c 7777 "$STATE/approve-held"); l=$(grep -c '"resolved"' "$LEDGER"); a=$(grep -c $'\tanswered\t' "$QUESTIONS_LOG")
[ "$n" -eq 1 ] && [ "$l" -eq 1 ] && [ "$a" -eq 1 ] && pass "1a two concurrent answers on one id: one append, one ledger record, one log line" \
  || fail "1a (BREAK) two concurrent answers both applied: approve-held has $n × 7777, ledger has $l resolved records (D's PROPOSE_AFTER=2 is met by ONE tap), log has $a answered lines; rcs $(cat "$STATE/r1.rc") $(cat "$STATE/r2.rc")"
rm -f "$QUESTIONS_DIR"/q-*.json "$QUESTIONS_DIR"/answered/*.json

# ── 2. a knob whose last line has no trailing newline ────────────────────────
# (BREAK) fix: before appending, if the knob file is non-empty and its last byte is not '\n', write '\n' first
# (or rewrite the file line-wise). ship-wave.sh reads approve-held with tr ',\n' '  '; apply-migrations.sh reads
# allow-destructive with grep -qx — a concatenated line approves NOTHING and destroys the previous allow.
printf '3273' > "$STATE/approve-held"
mkq q-20260910-000400-nl '[{"label":"Approve #3410","description":"d","writes":[{"op":"append","file":"approve-held","value":"3410"}]},{"label":"Keep","writes":[{"op":"noop"}]}]' held
"$DESK" answer q-20260910-000400-nl 0 >/dev/null 2>&1
toks=$(tr ',\n' '  ' < "$STATE/approve-held" | tr -s ' ' | sed 's/^ //; s/ $//')
[ "$toks" = "3273 3410" ] && pass "2a append to approve-held without a trailing newline keeps 3273 and adds 3410" \
  || fail "2a (BREAK) approve-held now reads '$toks' as ship-wave.sh splits it — #3273's approval is gone and #3410 was never approved"
printf '20260906213000' > "$STATE/allow-destructive"
mkq q-20260910-000401-nl '[{"label":"Allow","description":"d","writes":[{"op":"append","file":"allow-destructive","value":"20260910030000"}]},{"label":"Keep","writes":[{"op":"noop"}]}]'
"$DESK" answer q-20260910-000401-nl 0 >/dev/null 2>&1
grep -qx 20260906213000 "$STATE/allow-destructive" && grep -qx 20260910030000 "$STATE/allow-destructive" \
  && pass "2b append to allow-destructive without a trailing newline keeps both versions as whole lines" \
  || fail "2b (BREAK) allow-destructive is now '$(tr '\n' '|' < "$STATE/allow-destructive")' — apply-migrations.sh (grep -qx) matches neither version"
rm -f "$QUESTIONS_DIR"/q-*.json "$QUESTIONS_DIR"/answered/*.json

# ── 3. two different questions, same kind+class, same second ─────────────────
# (BREAK) fix: the id must be unique per question — add a counter/suffix when $QUESTIONS_DIR/<id>.json (or
# answered/<id>.json) already exists, or refuse with a clear message. Never overwrite an open question.
for try in 1 2 3 4 5 6; do   # the two asks must share a wall-clock second; retry when they straddle one
  rm -f "$QUESTIONS_DIR"/q-*.json; : > "$QUESTIONS_LOG"
  s0=$(date +%S); ask_director policy policy "Make it a rule: A" b "$OPTS"; a=$ASK_DIRECTOR_ID
  ask_director policy policy "Make it a rule: B" b "$OPTS"; b=$ASK_DIRECTOR_ID; s1=$(date +%S)
  [ "$s0" = "$s1" ] && break; sleep 0.3
done
nf=$(ls "$QUESTIONS_DIR"/q-*.json 2>/dev/null | wc -l | tr -d ' ')
if [ "$nf" -eq 2 ] && [ "$a" != "$b" ]; then pass "3a two same-second asks with different titles → two files, two ids"
else fail "3a (BREAK) same-second id collision: ids '$a' / '$b', $nf file(s) — title on disk '$(python3 -c 'import json,sys,glob;print(json.load(open(glob.glob(sys.argv[1]+"/q-*.json")[0]))["title"])' "$QUESTIONS_DIR")' while questions.log claims $(grep -c $'\tasked\t' "$QUESTIONS_LOG") were asked"; fi
rm -f "$QUESTIONS_DIR"/q-*.json

# ── 4. one odd-but-valid file must not blind the whole desk ──────────────────
# (BREAK) fix: question_writes_valid must require an offset-aware asked_at (reject naive) and cap expires_after_h
# (e.g. ≤ 8760), AND cmd_pending/cmd_mirror must skip-and-report a file whose expiry cannot be computed instead of
# dying on it — one bad file hid every other question and left the Fleet note stale.
ask_director freeze cls1 "Good question" "Body." "$OPTS"; good=$ASK_DIRECTOR_ID
mkq q-20260910-000200-naive "$OPTS" freeze "2026-09-10T06:45:00"
out=$("$DESK" pending 2>/dev/null); rc=$?
printf '%s' "$out" | python3 -c 'import json,sys; qs=json.load(sys.stdin); sys.exit(0 if [q["id"] for q in qs]==[sys.argv[1]] else 1)' "$good" 2>/dev/null && [ $rc -eq 0 ] \
  && pass "4a pending survives a timezone-naive asked_at beside it and still lists the good question" \
  || fail "4a (BREAK) pending rc=$rc with a naive asked_at file present — output: $(printf '%s' "$out" | head -c 80 | tr '\n' ' ')… (every question hidden)"
printf '# Fleet\n\n%s\n\nstale line from an earlier pass\n\n## Blocked\n\nb1\n' "$HEAD" > "$FLEET_MD"
"$DESK" mirror >/dev/null 2>&1; rc=$?
[ $rc -eq 0 ] && grep -q 'Good question' "$FLEET_MD" && ! grep -q 'stale line' "$FLEET_MD" \
  && pass "4b mirror still rewrites its section with that file present" \
  || fail "4b (BREAK) mirror rc=$rc — the Fleet note kept its stale section (phone shows old questions)"
rm -f "$QUESTIONS_DIR"/q-20260910-000200-naive.json
mkq q-20260910-000201-huge "$OPTS" freeze "$NOW" 1000000000000
out=$("$DESK" pending 2>/dev/null); rc=$?
printf '%s' "$out" | python3 -c 'import json,sys; qs=json.load(sys.stdin); sys.exit(0 if [q["id"] for q in qs]==[sys.argv[1]] else 1)' "$good" 2>/dev/null && [ $rc -eq 0 ] \
  && pass "4c pending survives expires_after_h=1e12 beside it (refused as invalid or skipped)" \
  || fail "4c (BREAK) pending rc=$rc with expires_after_h=1000000000000 present — OverflowError hides every question"
rm -f "$QUESTIONS_DIR"/q-*.json

# ── 5. an unclosed code fence above the stale section ────────────────────────
# (BREAK) fix: when the desk heading is found only inside an unclosed fence (fence never closes before EOF), treat
# the fence as not a fence (CommonMark closes it at EOF, so the heading IS a heading) — never append a second copy.
ask_director freeze cls1 "Q" "B" "$OPTS"
printf '# Fleet\n\n```\nsomeone forgot to close this\n\n%s\n\nstale\n\n## Blocked\n\nb1\n' "$HEAD" > "$FLEET_MD"
"$DESK" mirror >/dev/null 2>&1; s1=$(stat -f %z "$FLEET_MD"); "$DESK" mirror >/dev/null 2>&1; "$DESK" mirror >/dev/null 2>&1; s3=$(stat -f %z "$FLEET_MD")
h=$(grep -c "^$HEAD" "$FLEET_MD")
[ "$s1" -eq "$s3" ] && [ "$h" -le 2 ] && pass "5a unclosed fence before the section: size stable across passes, no runaway headings" \
  || fail "5a (BREAK) unclosed fence: the section is never recognised, so every pass appends another — $s1 → $s3 bytes, $h desk headings after 3 mirrors"
rm -f "$QUESTIONS_DIR"/q-*.json

echo; [ $fails -eq 0 ] && echo "ALL PASS" || echo "$fails FAIL"; exit $(( fails > 0 ))

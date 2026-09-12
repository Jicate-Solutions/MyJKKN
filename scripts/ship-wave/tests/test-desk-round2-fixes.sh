#!/bin/bash
# test-desk-round2-fixes.sh — regression tests for the round-2 adversarial findings on the desk (HUMAN-IN-THE-LOOP §A),
# one case group per break, named after it. Every group FAILED on dfb6b42b82 (the commit before the fixes) and
# passes after; the fix each one pins is named in its comment.
# Run from the worktree root:  bash scripts/ship-wave/tests/test-desk-round2-fixes.sh
# Temp $STATE, fixture Fleet.md, touches nothing live. PASS/FAIL per case, exit 1 on any FAIL.
# Runs itself under `env -i PATH HOME` — the C locale launchd gives the wave — so a byte-counting bug fails here (round 4).
[ "${DESK_TEST_ENV_I:-}" = 1 ] || exec env -i PATH="$PATH" HOME="$HOME" DESK_TEST_ENV_I=1 bash "$0" "$@"
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; SW="$HERE/.."; DESK="$SW/desk/v5-w12-desk.sh"
export STATE; STATE="$(mktemp -d "${TMPDIR:-/tmp}/desk-r2fix.XXXXXX")"
export FLEET_MD="$STATE/Fleet.md" SHIP_WAVE_DIR="$SW"
trap 'rm -rf "$STATE"' EXIT
fails=0; pass() { printf 'PASS  %s\n' "$*"; }; fail() { printf 'FAIL  %s\n' "$*"; fails=$((fails+1)); }
say() { :; }
. "$SW/failure-ledger.sh"; . "$SW/policy-learning.sh"; . "$SW/desk-questions.sh"
NOW=$(python3 -c 'import datetime;print(datetime.datetime.now().astimezone().isoformat(timespec="seconds"))')
jq_() { python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(eval(sys.argv[2], {"d": d}))' "$1" "$2"; }
mkq() { # <id> <options-json> [kind] [asked_at] [expires] [frozen_line-json-or-empty] → raw question file, bypassing ask_director
  local fl=""; [ -n "${6:-}" ] && fl=",\"frozen_line\":$6"
  printf '{"id":"%s","asked_at":"%s","kind":"%s","class":"c","title":"t","body":"b","options":%s,"recommended":0,"expires_after_h":%s%s}' \
    "$1" "${4:-$NOW}" "${3:-freeze}" "$2" "${5:-48}" "$fl" > "$QUESTIONS_DIR/$1.json"; }
HEAD='## W12 desk — waiting on you'
OPTS='[{"label":"Lift the stop","description":"lifts","writes":[{"op":"unfreeze"}]},{"label":"Keep","description":"keeps","writes":[{"op":"noop"}]}]'
clean() { rm -f "$QUESTIONS_DIR"/q-*.json "$QUESTIONS_DIR"/answered/*.json; : > "$QUESTIONS_LOG"; : > "$LEDGER"; }

# ── NEW-1: one tap, six desk processes at once → applied ONCE ─────────────────────────────────────────────────
# fix: cmd_answer claims the file with an atomic mv into answered/ BEFORE applying (+ flock on questions/.lock);
# losers exit 2 "already answered" and write no knob line, no log line, no ledger record.
clean; : > "$STATE/approve-held"
mkq q-20260910-000120-race '[{"label":"ok","description":"d","writes":[{"op":"append","file":"approve-held","value":"7777"}]},{"label":"Keep","writes":[{"op":"noop"}]}]'
for i in 1 2 3 4 5 6; do ( "$DESK" answer q-20260910-000120-race 0 > "$STATE/race.$i.out" 2>&1; echo $? > "$STATE/race.$i.rc" ) & done; wait
n=$(grep -c 7777 "$STATE/approve-held"); l=$(grep -c '"resolved"' "$LEDGER"); a=$(grep -c $'\tanswered\t' "$QUESTIONS_LOG")
rcs=$(cat "$STATE"/race.*.rc | sort | tr '\n' ' '); tb=$(cat "$STATE"/race.*.out | grep -c Traceback)
[ "$n" -eq 1 ] && [ "$l" -eq 1 ] && [ "$a" -eq 1 ] && pass "NEW-1a six concurrent answers on one id: ONE 7777 in the knob, ONE ledger record, ONE 'answered' log line" \
  || fail "NEW-1a concurrent answers applied more than once: knob 7777 × $n, ledger resolved × $l, log answered × $a (rcs: $rcs)"
[ "$rcs" = "0 2 2 2 2 2 " ] && [ "$tb" -eq 0 ] && pass "NEW-1b exactly one winner (rc 0), five losers exit 2, no traceback" \
  || fail "NEW-1b rcs '$rcs' (want '0 2 2 2 2 2 '), tracebacks: $tb"
grep -q "already answered" "$STATE"/race.*.out && pass "NEW-1c a loser says 'already answered'" || fail "NEW-1c losers gave no 'already answered'"
[ -f "$QUESTIONS_DIR/answered/q-20260910-000120-race.json" ] && [ "$(jq_ "$QUESTIONS_DIR/answered/q-20260910-000120-race.json" 'd["chosen"]+"|"+";".join(d["applied"])')" = "ok|append approve-held 7777" ] \
  && pass "NEW-1d the answered copy records chosen + applied once" || fail "NEW-1d answered record wrong or missing"

# ── NEW-2: a knob whose last line has no trailing newline ────────────────────────────────────────────────────
# fix: apply_write emits '\n' first when the knob is non-empty and its last byte is not '\n'.
clean; printf '3273' > "$STATE/approve-held"
mkq q-20260910-000400-nl '[{"label":"Approve #3410","description":"d","writes":[{"op":"append","file":"approve-held","value":"3410"}]},{"label":"Keep","writes":[{"op":"noop"}]}]' held
"$DESK" answer q-20260910-000400-nl 0 >/dev/null 2>&1
[ "$(od -An -c "$STATE/approve-held" | tr -s ' \n' ' ')" = " 3 2 7 3 \\n 3 4 1 0 \\n " ] && pass "NEW-2a approve-held '3273' (no newline) + Approve #3410 → bytes are exactly '3273\\n3410\\n'" \
  || fail "NEW-2a approve-held bytes: $(od -An -c "$STATE/approve-held" | tr -s ' \n' ' ')"
printf '20260906213000' > "$STATE/allow-destructive"
mkq q-20260910-000401-nl '[{"label":"Allow","description":"d","writes":[{"op":"append","file":"allow-destructive","value":"20260910030000"}]},{"label":"Keep","writes":[{"op":"noop"}]}]'
"$DESK" answer q-20260910-000401-nl 0 >/dev/null 2>&1
[ "$(cat "$STATE/allow-destructive")" = $'20260906213000\n20260910030000' ] && pass "NEW-2b allow-destructive keeps both versions as whole lines (grep -qx finds each)" \
  || fail "NEW-2b allow-destructive: '$(tr '\n' '|' < "$STATE/allow-destructive")'"
printf '3273\n' > "$STATE/approve-held"
mkq q-20260910-000402-nl '[{"label":"Approve #3410","description":"d","writes":[{"op":"append","file":"approve-held","value":"3410"}]},{"label":"Keep","writes":[{"op":"noop"}]}]' held
"$DESK" answer q-20260910-000402-nl 0 >/dev/null 2>&1
[ "$(cat "$STATE/approve-held")" = $'3273\n3410' ] && pass "NEW-2c a knob that already ends in a newline gets no blank line" || fail "NEW-2c extra blank line: '$(tr '\n' '|' < "$STATE/approve-held")'"

# ── NEW-3: two different questions, same kind+class, same second ─────────────────────────────────────────────
# fix: id = q-<ts>-<slug>-<4 hex of sha1(kind+class+title)>, then -2, -3… while the name is taken; created O_EXCL.
for try in 1 2 3 4 5 6; do   # the two asks must share a wall-clock second; retry when they straddle one
  clean
  s0=$(date +%S); ask_director policy policy "Make it a rule: A" b "$OPTS"; a=$ASK_DIRECTOR_ID
  ask_director policy policy "Make it a rule: B" b "$OPTS"; b=$ASK_DIRECTOR_ID; s1=$(date +%S)
  [ "$s0" = "$s1" ] && break; sleep 0.3
done
nf=$(ls "$QUESTIONS_DIR"/q-*.json 2>/dev/null | wc -l | tr -d ' ')
pend=$("$DESK" pending 2>/dev/null | python3 -c 'import json,sys;print(" ".join(sorted(q["title"] for q in json.load(sys.stdin))))')
[ "$nf" -eq 2 ] && [ "$a" != "$b" ] && [ "$pend" = "Make it a rule: A Make it a rule: B" ] && pass "NEW-3a two same-second asks with different titles → two files, two ids, both listed by pending" \
  || fail "NEW-3a same-second collision: ids '$a' / '$b', $nf file(s), pending titles '$pend'"
RE='^q-[0-9]{8}-[0-9]{6}-[a-z0-9][a-z0-9-]{0,39}$'
[[ "$a" =~ $RE ]] && [[ "$b" =~ $RE ]] && pass "NEW-3b both ids still match the id shape rule" || fail "NEW-3b id shape broken: '$a' '$b'"
# the same name taken by an ANSWERED file is a collision too (answering would overwrite that record)
clean; ask_director held held "Same second twice" b '[{"label":"ok","writes":[{"op":"noop"}]},{"label":"Keep","writes":[{"op":"noop"}]}]'; c=$ASK_DIRECTOR_ID
"$DESK" answer "$c" 0 >/dev/null 2>&1
# force the same second by rewriting the answered file's name to the id the next ask will mint
h=$(printf 'held\037held\037Same second twice' | python3 -c 'import hashlib,sys;print(hashlib.sha1(sys.stdin.buffer.read()).hexdigest()[:4])')
nxt="q-$(date '+%Y%m%d-%H%M%S')-held-held-$h"; mv "$QUESTIONS_DIR/answered/$c.json" "$QUESTIONS_DIR/answered/$nxt.json" 2>/dev/null
ask_director held held "Same second twice" b '[{"label":"ok","writes":[{"op":"noop"}]},{"label":"Keep","writes":[{"op":"noop"}]}]'; d=$ASK_DIRECTOR_ID
[ "$d" != "$nxt" ] && [ -f "$QUESTIONS_DIR/$d.json" ] && [ -f "$QUESTIONS_DIR/answered/$nxt.json" ] \
  && pass "NEW-3c a name already used in answered/ is skipped (-2), the answered record survives" \
  || fail "NEW-3c re-used an answered name: new id '$d' vs answered '$nxt' (may be a second-boundary flake)"
clean; for i in 1 2 3 4; do ( ask_director policy policy "Title $i" b "$OPTS" ) & done; wait
[ "$(ls "$QUESTIONS_DIR"/q-*.json | wc -l | tr -d ' ')" -eq 4 ] && pass "NEW-3d four concurrent asks, four titles → four files" || fail "NEW-3d concurrent asks lost files: $(ls "$QUESTIONS_DIR"/q-*.json | wc -l)"
clean; for i in 1 2 3 4; do ( ask_director policy policy "Same title" b "$OPTS" ) & done; wait
[ "$(ls "$QUESTIONS_DIR"/q-*.json | wc -l | tr -d ' ')" -eq 1 ] && pass "NEW-3e four concurrent asks of the SAME question → still one file (de-dup holds under the lock)" || fail "NEW-3e de-dup lost under concurrency: $(ls "$QUESTIONS_DIR"/q-*.json | wc -l) files"

# ── NEW-4: one odd file must not blind the whole desk ───────────────────────────────────────────────────────
# fix: validator refuses a tz-naive asked_at and expires_after_h outside 1..8760; pending/mirror compute expiry
# per file inside try/except → report that ONE file on stderr, skip it, never abort the pass.
clean; ask_director freeze cls1 "Good question" "Body." "$OPTS"; good=$ASK_DIRECTOR_ID
mkq q-20260910-000200-naive "$OPTS" freeze "2026-09-10T06:45:00"
mkq q-20260910-000201-huge "$OPTS" freeze "$NOW" 1000000000000
out=$("$DESK" pending 2>"$STATE/err"); rc=$?
ids=$(printf '%s' "$out" | python3 -c 'import json,sys;print(" ".join(q["id"] for q in json.load(sys.stdin)))' 2>/dev/null)
[ $rc -eq 0 ] && [ "$ids" = "$good" ] && pass "NEW-4a pending rc 0 and lists ONLY the good question beside a naive asked_at and a 1e12-hour expiry" \
  || fail "NEW-4a pending rc=$rc ids='$ids' — out: $(printf '%s' "$out" | head -c 100 | tr '\n' ' ')"
grep -q 'q-20260910-000200-naive' "$STATE/err" && grep -q 'q-20260910-000201-huge' "$STATE/err" && pass "NEW-4b each odd file is named on stderr" || fail "NEW-4b stderr: $(tr '\n' '|' < "$STATE/err")"
[ "$(questions_open_count)" -eq 1 ] && pass "NEW-4c questions_open_count agrees: 1" || fail "NEW-4c questions_open_count=$(questions_open_count)"
printf '# Fleet\n\n%s\n\nstale line from an earlier pass\n\n## Blocked\n\nb1\n' "$HEAD" > "$FLEET_MD"
"$DESK" mirror >/dev/null 2>&1; rc=$?
[ $rc -eq 0 ] && grep -q 'Good question' "$FLEET_MD" && ! grep -q 'stale line' "$FLEET_MD" && grep -q 'invalid question, not askable: q-20260910-000200-naive' "$FLEET_MD" \
  && pass "NEW-4d mirror rc 0, section rewritten, the naive file is listed as invalid" || fail "NEW-4d mirror rc=$rc"
"$DESK" answer q-20260910-000200-naive 0 >/dev/null 2>&1; rc=$?
[ $rc -eq 3 ] && [ -f "$QUESTIONS_DIR/q-20260910-000200-naive.json" ] && pass "NEW-4e answering the naive file is refused (exit 3), file left in place" || fail "NEW-4e naive file answered rc=$rc"
# the skip path itself (not just the validator): a file the validator accepts but whose expiry blows up
clean; ask_director freeze cls1 "Good question" "Body." "$OPTS"; good=$ASK_DIRECTOR_ID
question_file_valid() { return 0; }; export -f question_file_valid   # simulate a validator that lets a bad stamp through
mkq q-20260910-000202-bad "$OPTS" freeze "not-a-date"
st=$(question_open_state "$QUESTIONS_DIR/q-20260910-000202-bad.json"); rc=$?
[ $rc -eq 1 ] && printf '%s' "$st" | grep -q 'cannot compute expiry' && pass "NEW-4f question_open_state reports an uncomputable expiry (rc 1) instead of raising" || fail "NEW-4f rc=$rc '$st'"
st=$(question_open_state "$QUESTIONS_DIR/$good.json"); rc=$?
[ $rc -eq 0 ] && [ "${st%% *}" = open ] && pass "NEW-4g question_open_state: 'open <epoch>' for a live question" || fail "NEW-4g '$st'"
unset -f question_file_valid; . "$SW/desk-questions.sh"; clean

# ── NEW-5: an unclosed code fence above the stale section ───────────────────────────────────────────────────
# fix: the section START is the exact heading line; fence awareness counts only CLOSED fences (an unclosed fence
# is not a fence), and a fence opened inside the section that never closes ends the section at the next heading/EOF.
ask_director freeze cls1 "Q" "B" "$OPTS"
printf '# Fleet\n\n```\nsomeone forgot to close this\n\n%s\n\nstale\n\n## Blocked\n\nb1\n' "$HEAD" > "$FLEET_MD"
"$DESK" mirror >/dev/null 2>&1; s1=$(stat -f %z "$FLEET_MD")
for i in 2 3 4 5; do "$DESK" mirror >/dev/null 2>&1; done; s5=$(stat -f %z "$FLEET_MD")
h=$(grep -c "^$HEAD" "$FLEET_MD")
[ "$s1" -eq "$s5" ] && [ "$h" -eq 1 ] && pass "NEW-5a unclosed fence above the section: size stable over 5 passes ($s1 bytes), exactly one heading" \
  || fail "NEW-5a unclosed fence: $s1 → $s5 bytes, $h headings after 5 mirrors"
grep -q '^```$' "$FLEET_MD" && grep -q 'someone forgot' "$FLEET_MD" && ! grep -q '^stale$' "$FLEET_MD" && grep -q '^## Blocked' "$FLEET_MD" \
  && pass "NEW-5b the human's text above is untouched, 'stale' replaced, '## Blocked' ends the section" || fail "NEW-5b rest of the note damaged"
# a fence opened INSIDE the stale section and never closed must not swallow '## Blocked'
printf '# Fleet\n\n%s\n\nstale\n~~~\nforgot\n\n## Blocked\n\nb1\n' "$HEAD" > "$FLEET_MD"
"$DESK" mirror >/dev/null 2>&1; "$DESK" mirror >/dev/null 2>&1
[ "$(grep -c '^## Blocked' "$FLEET_MD")" -eq 1 ] && ! grep -q '^stale$' "$FLEET_MD" && [ "$(grep -c "^$HEAD" "$FLEET_MD")" -eq 1 ] \
  && pass "NEW-5c unclosed fence inside the section: it ends at '## Blocked', which survives once" || fail "NEW-5c: Blocked × $(grep -c '^## Blocked' "$FLEET_MD"), headings × $(grep -c "^$HEAD" "$FLEET_MD")"
# a closed fenced EXAMPLE of the heading is still not the section (round-1 GAP-6f must keep holding)
printf '# Fleet\n\n```\n%s\nexample\n```\n\n## Blocked\n\nb1\n' "$HEAD" > "$FLEET_MD"
"$DESK" mirror >/dev/null 2>&1; "$DESK" mirror >/dev/null 2>&1
[ "$(grep -c '^```' "$FLEET_MD")" -eq 2 ] && [ "$(grep -c "^$HEAD" "$FLEET_MD")" -eq 2 ] && pass "NEW-5d a CLOSED fenced example of the heading is left alone; the real section is appended once" || fail "NEW-5d closed fence handling regressed"
# the exact-heading rule: a neighbouring '## W12 desk — waiting on you-archive' section is not ours
printf '# Fleet\n\n%s-archive\n\narchived stuff\n\n%s\n\nstale\n\n## Blocked\n\nb1\n' "$HEAD" "$HEAD" > "$FLEET_MD"
"$DESK" mirror >/dev/null 2>&1
grep -q '^archived stuff' "$FLEET_MD" && grep -q "^$HEAD-archive" "$FLEET_MD" && ! grep -q '^stale$' "$FLEET_MD" && pass "NEW-5e '…-archive' section is somebody else's and survives" || fail "NEW-5e the -archive section was eaten"
clean

# ── NEW-6: an expired question is not applied ───────────────────────────────────────────────────────────────
# fix: answer refuses an expired question (exit 5, 'expired — nothing applied') unless DESK_ALLOW_EXPIRED=1.
printf 'x\n' > "$STATE/FROZEN"
mkq q-20200101-000000-old "$OPTS" freeze "2020-01-01T00:00:00+05:30" 1 '"x"'
out=$("$DESK" answer q-20200101-000000-old 0 2>&1); rc=$?
[ $rc -eq 5 ] && printf '%s' "$out" | grep -q 'expired — nothing applied' && [ -f "$STATE/FROZEN" ] && [ -f "$QUESTIONS_DIR/q-20200101-000000-old.json" ] \
  && pass "NEW-6a answering an expired question: exit 5, 'expired — nothing applied', FROZEN kept, file left in place" || fail "NEW-6a rc=$rc out='$out' FROZEN $([ -f "$STATE/FROZEN" ] && echo kept || echo GONE)"
grep -q $'\trefused\tq-20200101-000000-old\texpired' "$QUESTIONS_LOG" && pass "NEW-6b the refusal is logged" || fail "NEW-6b no refused/expired log line"
out=$(DESK_ALLOW_EXPIRED=1 "$DESK" answer q-20200101-000000-old 0 2>&1); rc=$?
[ $rc -eq 0 ] && [ ! -e "$STATE/FROZEN" ] && [ -f "$QUESTIONS_DIR/answered/q-20200101-000000-old.json" ] && pass "NEW-6c DESK_ALLOW_EXPIRED=1: a human may still answer it — applied, moved to answered/" || fail "NEW-6c rc=$rc out='$out'"
clean

# ── GAP unfreeze: 'Lift the stop' lifts the stop it was ASKED about, not whatever is on now ─────────────────
# fix: ask_director stores FROZEN's last line as frozen_line; the unfreeze op compares it with FROZEN's current
# last line and refuses ('the stop has changed since you were asked — nothing lifted'), leaving failed:1.
printf '2026-09-10 07:00:00\tpeer hold on #3410\tsoft\n' > "$STATE/FROZEN"
ask_director freeze "peer hold on PR" "Lift the stop?" "A peer asked for a hold." "$OPTS"; soft=$ASK_DIRECTOR_ID
[ "$(jq_ "$QUESTIONS_DIR/$soft.json" 'd["frozen_line"]')" = "2026-09-10 07:00:00 peer hold on #3410 soft" ] && pass "GAP-unfreeze-a the freeze question carries frozen_line (FROZEN's last line, flattened)" \
  || fail "GAP-unfreeze-a frozen_line='$(jq_ "$QUESTIONS_DIR/$soft.json" 'd.get("frozen_line")')'"
printf '2026-09-10 08:00:00\tdeploy ERROR dpl_abc\thard\n' >> "$STATE/FROZEN"
out=$("$DESK" answer "$soft" 0 2>&1); rc=$?
# round 4 (NEW-A / H11) FLIPPED this case: unfreeze is LINE-SCOPED. The soft question's own line goes; the hard line that
# landed after it STAYS (the wave's most-severe-wins class is still hard, so nothing ships) — exit 0, receipt says so.
[ $rc -eq 0 ] && [ "$(cat "$STATE/FROZEN")" = "$(printf '2026-09-10 08:00:00\tdeploy ERROR dpl_abc\thard')" ] && printf '%s' "$out" | grep -q 'a HARD stop is still in force' \
  && pass "GAP-unfreeze-b a soft question answered after a hard line landed: its own line lifted, the hard line stays (exit 0, receipt names the hard stop)" \
  || fail "GAP-unfreeze-b rc=$rc FROZEN=[$(cat "$STATE/FROZEN" 2>/dev/null | tr '\n' '|')] out='$out'"
[ "$(jq_ "$QUESTIONS_DIR/answered/$soft.json" 'd.get("failed")')" = None ] && pass "GAP-unfreeze-c the question is answered clean (no failed key) — it did what it was asked" || fail "GAP-unfreeze-c failed=$(jq_ "$QUESTIONS_DIR/answered/$soft.json" 'd.get("failed")')"
grep -q '"outcome": "resolved"' "$LEDGER" && pass "GAP-unfreeze-d the resolution is still on the ledger (the Director did decide)" || fail "GAP-unfreeze-d no ledger record"
ask_director freeze "deploy ERROR" "Production build failed. Lift the stop?" "…" "$OPTS"; hard=$ASK_DIRECTOR_ID
"$DESK" answer "$hard" 0 >/dev/null 2>&1; rc=$?
[ $rc -eq 0 ] && [ ! -e "$STATE/FROZEN" ] && pass "GAP-unfreeze-e a question asked about the CURRENT stop lifts it" || fail "GAP-unfreeze-e rc=$rc FROZEN $([ -e "$STATE/FROZEN" ] && echo still-on || echo gone)"
printf 'y\n' > "$STATE/FROZEN"
mkq q-20260910-000500-nofl "$OPTS" freeze
"$DESK" answer q-20260910-000500-nofl 0 >/dev/null 2>&1; rc=$?
[ $rc -eq 4 ] && [ -f "$STATE/FROZEN" ] && pass "GAP-unfreeze-f a hand-written question with no frozen_line cannot lift any stop (exit 4, FROZEN kept)" || fail "GAP-unfreeze-f rc=$rc FROZEN $([ -f "$STATE/FROZEN" ] && echo kept || echo GONE)"
rm -f "$STATE/FROZEN"
ask_director freeze "asked before" "Asked while no stop was on" "" "$OPTS"; pre=$ASK_DIRECTOR_ID
printf 'z\n' > "$STATE/FROZEN"
"$DESK" answer "$pre" 0 >/dev/null 2>&1; rc=$?
[ $rc -eq 4 ] && [ -f "$STATE/FROZEN" ] && pass "GAP-unfreeze-g asked when no stop was on (frozen_line ''), a stop landed later → refused" || fail "GAP-unfreeze-g rc=$rc"
clean; rm -f "$STATE/FROZEN"

# ── GAP de-dup: a refresh REPLACES options/body/recommended, keeps id + history ─────────────────────────────
: > "$STATE/approve-held"
ask_director held held "Approve #9?" "old body" '[{"label":"Approve #9","description":"d","writes":[{"op":"append","file":"approve-held","value":"9"}]},{"label":"Not now","writes":[{"op":"noop"}]}]'; hid=$ASK_DIRECTOR_ID
first=$(jq_ "$QUESTIONS_DIR/$hid.json" 'd["asked_at"]')
sleep 1
Q_RECOMMENDED=1 ask_director held held "Approve #9?" "new body" '[{"label":"Approve #9 (rebased)","description":"d","writes":[{"op":"append","file":"approve-held","value":"9"}]},{"label":"Not now","writes":[{"op":"noop"}]},{"label":"Approve #9 and #10","writes":[{"op":"append","file":"approve-held","value":"9"},{"op":"append","file":"approve-held","value":"10"}]}]'; hid2=$ASK_DIRECTOR_ID
[ "$hid2" = "$hid" ] && [ "$(ls "$QUESTIONS_DIR"/q-*.json | wc -l | tr -d ' ')" -eq 1 ] && pass "GAP-dedup-a same kind+class+title → same id, still one file" || fail "GAP-dedup-a ids '$hid' / '$hid2'"
[ "$(jq_ "$QUESTIONS_DIR/$hid.json" 'str(len(d["options"]))+"|"+d["options"][2]["label"]+"|"+d["body"]+"|"+str(d["recommended"])')" = "3|Approve #9 and #10|new body|1" ] \
  && pass "GAP-dedup-b refresh replaced options (new option on disk), body and recommended" || fail "GAP-dedup-b on disk: $(jq_ "$QUESTIONS_DIR/$hid.json" 'str(len(d["options"]))+"|"+d["body"]+"|"+str(d["recommended"])')"
[ "$(jq_ "$QUESTIONS_DIR/$hid.json" 'd["first_asked_at"]')" = "$first" ] && [ "$(jq_ "$QUESTIONS_DIR/$hid.json" 'd["asked_times"]')" = 2 ] && [ "$(jq_ "$QUESTIONS_DIR/$hid.json" 'd["asked_at"]')" != "$first" ] \
  && pass "GAP-dedup-c history kept: first_asked_at = the original stamp, asked_times 2, asked_at refreshed" || fail "GAP-dedup-c history lost"
"$DESK" answer "$hid" 2 >/dev/null 2>&1
[ "$(tr '\n' ' ' < "$STATE/approve-held")" = "9 10 " ] && pass "GAP-dedup-d answering the NEW option applies the new writes" || fail "GAP-dedup-d approve-held '$(tr '\n' ' ' < "$STATE/approve-held")'"
clean
# a refresh whose new options are invalid is refused and the open question is left as it was
ask_director held held "Stays" "b" '[{"label":"ok","writes":[{"op":"noop"}]},{"label":"Keep","writes":[{"op":"noop"}]}]'; sid=$ASK_DIRECTOR_ID
ask_director held held "Stays" "b2" '[{"label":"bad","writes":[{"op":"merge"}]},{"label":"Keep","writes":[{"op":"noop"}]}]' >/dev/null 2>&1; rc=$?
[ $rc -ne 0 ] && [ "$(jq_ "$QUESTIONS_DIR/$sid.json" 'd["body"]+"|"+d["options"][0]["label"]')" = "b|ok" ] && pass "GAP-dedup-e a refresh with invalid writes is refused; the open question is unchanged" || fail "GAP-dedup-e rc=$rc"
clean

# ── nothing outside the contract was created in $STATE ───────────────────────────────────────────────────────
[ -z "$(ls "$STATE" | grep -vE '^(questions|questions.log|approve-held|allow-destructive|advisory-checks|failure-ledger.jsonl|policy|policy.jsonl|Fleet.md|err|race\..*)$')" ] \
  && [ -z "$(ls -A "$QUESTIONS_DIR" | grep -vE '^(answered|\.lock)$')" ] && pass "SCOPE only the contract's files exist in \$STATE (plus questions/.lock)" || fail "SCOPE stray files: $(ls "$STATE" | tr '\n' ' ') / $(ls -A "$QUESTIONS_DIR" | tr '\n' ' ')"

echo; [ $fails -eq 0 ] && echo "ALL PASS" || echo "$fails FAIL"; exit $(( fails > 0 ))

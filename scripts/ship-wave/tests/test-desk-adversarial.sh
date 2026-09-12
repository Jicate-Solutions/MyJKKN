#!/bin/bash
# test-desk-adversarial.sh — the verifier's attempts to BREAK the desk's safety contract (HUMAN-IN-THE-LOOP §A):
# "the desk applies exactly the writes in the file, nothing else; it reads and writes nothing outside
# $STATE/questions/ + the three knobs + unfreeze + ratify; mirror touches only its own section."
# Run from the worktree root:  bash scripts/ship-wave/tests/test-desk-adversarial.sh
# Temp $STATE, fixture Fleet.md, touches nothing live. PASS/FAIL per case, exit 1 on any FAIL.
# Written 2026-09-10 against fb0bd5a0ae; the cases marked (BREAK) fail on that commit and describe the fix.
# All 18 pass since the fix commit that followed (id shape · per-knob value shape · single-line title/class · fenced/quoted mirror).
# Runs itself under `env -i PATH HOME` — the C locale launchd gives the wave — so a byte-counting bug fails here (round 4).
[ "${DESK_TEST_ENV_I:-}" = 1 ] || exec env -i PATH="$PATH" HOME="$HOME" DESK_TEST_ENV_I=1 bash "$0" "$@"
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; SW="$HERE/.."; DESK="$SW/desk/v5-w12-desk.sh"
export STATE; STATE="$(mktemp -d "${TMPDIR:-/tmp}/desk-adv.XXXXXX")"
export FLEET_MD="$STATE/Fleet.md" SHIP_WAVE_DIR="$SW"
trap 'rm -rf "$STATE"' EXIT
fails=0; pass() { printf 'PASS  %s\n' "$*"; }; fail() { printf 'FAIL  %s\n' "$*"; fails=$((fails+1)); }
say() { :; }
. "$SW/failure-ledger.sh"; . "$SW/policy-learning.sh"; . "$SW/desk-questions.sh"
NOW=$(python3 -c 'import datetime;print(datetime.datetime.now().astimezone().isoformat(timespec="seconds"))')
mkq() { # <id> <options-json> [kind] → raw question file, bypassing ask_director (a bad question file is the threat)
  printf '{"id":"%s","asked_at":"%s","kind":"%s","class":"c","title":"t","body":"b","options":%s,"recommended":0,"expires_after_h":48}' \
    "$1" "$NOW" "${3:-freeze}" "$2" > "$QUESTIONS_DIR/$1.json"; }
HEAD='## W12 desk — waiting on you'
rest() { python3 -c '
import sys; H="## W12 desk — waiting on you"; rows=open(sys.argv[1],encoding="utf-8").read().split("\n"); out=[]; i=0
while i<len(rows):
    if rows[i].startswith(H):
        i+=1
        while i<len(rows) and not rows[i].startswith("## "): i+=1
        continue
    out.append(rows[i]); i+=1
sys.stdout.write("\n".join(out))' "$1"; }

# ── 1. forbidden ops: refused, nothing applied ────────────────────────────────
printf 'x\n' > "$STATE/FROZEN"
for op in delete sql merge run shell git; do
  mkq "q-20260910-000001-$op" "[{\"label\":\"x\",\"description\":\"d\",\"writes\":[{\"op\":\"$op\",\"file\":\"approve-held\",\"value\":\"1\"}]},{\"label\":\"Keep\",\"writes\":[{\"op\":\"noop\"}]}]"
done
out=$("$DESK" pending 2>/dev/null); [ "$out" = "[]" ] && pass "1a pending hides all six forbidden-op questions" || fail "1a pending listed a forbidden-op question: $out"
ok=1; for op in delete sql merge run shell git; do "$DESK" answer "q-20260910-000001-$op" 0 >/dev/null 2>&1; [ $? -eq 3 ] || ok=0; done
[ $ok -eq 1 ] && pass "1b answer refuses each with exit 3" || fail "1b some forbidden op was not refused with exit 3"
[ -f "$STATE/FROZEN" ] && [ ! -e "$STATE/approve-held" ] && pass "1c nothing applied (FROZEN kept, no knob created)" || fail "1c something was applied"
mkq q-20260910-000002-mixed '[{"label":"clean","description":"d","writes":[{"op":"append","file":"approve-held","value":"1111"}]},{"label":"dirty","description":"d","writes":[{"op":"merge"}]}]'
"$DESK" answer q-20260910-000002-mixed 0 >/dev/null 2>&1; rc=$?
[ $rc -eq 3 ] && [ ! -e "$STATE/approve-held" ] && pass "1d a forbidden op in ANOTHER option poisons the whole question (clean option 0 not applied)" || fail "1d clean option applied beside a dirty one (rc=$rc)"

# ── 2. path traversal in append.file ──────────────────────────────────────────
ok=1; i=0
for f in '../FROZEN' 'approve-held/../x' '/etc/passwd' 'APPROVE-HELD' 'approve-held ' 'questions/answered/x' ''; do
  i=$((i+1)); mkq "q-20260910-00001$i-trav" "[{\"label\":\"x\",\"description\":\"d\",\"writes\":[{\"op\":\"append\",\"file\":\"$f\",\"value\":\"pwned\"}]},{\"label\":\"Keep\",\"writes\":[{\"op\":\"noop\"}]}]"
  "$DESK" answer "q-20260910-00001$i-trav" 0 >/dev/null 2>&1; [ $? -eq 3 ] || ok=0
done
[ $ok -eq 1 ] && [ -z "$(grep -rl pwned "$STATE" | grep -v /questions/)" ] && pass "2a every traversal / spoofed knob name refused, 'pwned' landed nowhere" || fail "2a traversal got through"

# ── 3. value hygiene: one value must be ONE knob entry as the wave reads it ───
python3 - "$QUESTIONS_DIR" "$NOW" <<'PY'
import json, sys
for k, v in {"nl": "3410\n3411", "tab": "3410\t3411", "sp": "3410 3411,3412", "cr": "3410\r3411", "esc": "3410\x1b[31m"}.items():
    q = {"id": f"q-20260910-000040-{k}", "asked_at": sys.argv[2], "kind": "held", "class": "held", "title": "t", "body": "b",
         "options": [{"label": "Approve #3410", "description": "d", "writes": [{"op": "append", "file": "approve-held", "value": v}]}],
         "recommended": 0, "expires_after_h": 48}
    open(f"{sys.argv[1]}/{q['id']}.json", "w").write(json.dumps(q))
PY
: > "$STATE/approve-held"
"$DESK" answer q-20260910-000040-nl 0 >/dev/null 2>&1; [ $? -eq 3 ] && pass "3a newline in value refused" || fail "3a newline in value accepted"
for k in tab sp cr esc; do "$DESK" answer "q-20260910-000040-$k" 0 >/dev/null 2>&1; done
n=$(tr ',\n' '  ' < "$STATE/approve-held" | wc -w | tr -d ' ')
# (BREAK) fix: validator should require value =~ ^[0-9]+$ for approve-held, ^[0-9]{14}$ for allow-destructive,
# and reject any control character (not only \n) for advisory-checks — the wave splits approve-held on ',' and whitespace.
[ "$n" -eq 0 ] && pass "3b tab/space/comma/CR/ESC values refused — one label never becomes several approvals" \
  || fail "3b (BREAK) four options labelled 'Approve #3410' put $n approval tokens into approve-held as ship-wave.sh reads it: $(tr ',\n' '  ' < "$STATE/approve-held" | tr -c '0-9 ' '?')"

# ── 4. answer twice / id as a path ────────────────────────────────────────────
: > "$STATE/approve-held"
mkq q-20260910-000050-twice '[{"label":"ok","description":"d","writes":[{"op":"append","file":"approve-held","value":"5555"}]},{"label":"Keep","writes":[{"op":"noop"}]}]'
"$DESK" answer q-20260910-000050-twice 0 >/dev/null 2>&1; "$DESK" answer q-20260910-000050-twice 0 >/dev/null 2>&1; rc=$?
[ $rc -eq 2 ] && [ "$(grep -c 5555 "$STATE/approve-held")" -eq 1 ] && pass "4a plain second answer: exit 2, applied once" || fail "4a second answer re-applied (rc=$rc)"
"$DESK" answer answered/q-20260910-000050-twice 0 >/dev/null 2>&1; rc=$?
# (BREAK) fix: cmd_answer must validate the id against ^q-[0-9]{8}-[0-9]{6}-[a-z0-9-]+$ before touching a path.
[ $rc -ne 0 ] && [ "$(grep -c 5555 "$STATE/approve-held")" -eq 1 ] && pass "4b id 'answered/<id>' cannot re-apply an answered question" \
  || fail "4b (BREAK) 'answer answered/<id> 0' re-applied the writes (rc=$rc, approve-held now has $(grep -c 5555 "$STATE/approve-held") × 5555)"
cp "$(find "$QUESTIONS_DIR" -name 'q-20260910-000050-twice.json' | head -1)" "$STATE/stray.json"
"$DESK" answer ../stray 0 >/dev/null 2>&1; rc=$?
[ $rc -ne 0 ] && [ -f "$STATE/stray.json" ] && pass "4c id '../stray' cannot read/move a file outside questions/" \
  || fail "4c (BREAK) 'answer ../stray 0' applied writes from \$STATE/stray.json and moved it into questions/ (rc=$rc)"

# ── 5. other free text ────────────────────────────────────────────────────────
printf 'x\n' > "$STATE/FROZEN"; : > "$STATE/approve-held"
mkq q-20260910-000060-other '[{"label":"ok","description":"d","writes":[{"op":"unfreeze"}]},{"label":"Keep","writes":[{"op":"noop"}]}]'
"$DESK" answer q-20260910-000060-other other '{"op":"unfreeze"} ; append approve-held 3410 ; $(rm -rf /) ; unfreeze' >/dev/null 2>&1
[ -f "$STATE/FROZEN" ] && [ ! -s "$STATE/approve-held" ] && [ -f "$QUESTIONS_DIR/answered/q-20260910-000060-other.json" ] \
  && pass "5a op-looking free text stored, nothing applied" || fail "5a other text had an effect"

# ── 6. mirror: only its own section changes ───────────────────────────────────
rm -f "$QUESTIONS_DIR"/q-*.json
OPTS='[{"label":"Lift the stop","description":"lifts","writes":[{"op":"unfreeze"}]},{"label":"Keep","description":"keeps","writes":[{"op":"noop"}]}]'
ask_director freeze cls1 "Question one" "Body one." "$OPTS"
printf '# Fleet\n\nintro\n\n## Blocked\n\nb1 no newline at end' > "$FLEET_MD"; cp "$FLEET_MD" "$FLEET_MD.o"; "$DESK" mirror >/dev/null
python3 -c 'import sys;o=open(sys.argv[1],"rb").read();n=open(sys.argv[2],"rb").read();sys.exit(0 if n.startswith(o) else 1)' "$FLEET_MD.o" "$FLEET_MD" \
  && pass "6a absent section + no trailing newline: original bytes are a prefix" || fail "6a original bytes altered"
printf '# Fleet\n\n%s (1)\n\nold A\n\n## Blocked\n\nb1\n\n%s\n\nold B\n\n## Tail\n\nt1\n' "$HEAD" "$HEAD" > "$FLEET_MD"; cp "$FLEET_MD" "$FLEET_MD.o"
"$DESK" mirror >/dev/null; "$DESK" mirror >/dev/null
diff <(rest "$FLEET_MD.o") <(rest "$FLEET_MD") >/dev/null && pass "6b section present twice: everything outside desk sections byte-identical" || fail "6b rest changed"
[ "$(grep -c "^$HEAD" "$FLEET_MD")" -eq 1 ] && pass "6c section present twice: collapsed to one heading" || fail "6c (gap) second stale desk heading left in place: $(grep -c "^$HEAD" "$FLEET_MD") headings, 'old B' $(grep -c 'old B' "$FLEET_MD")"
rm -f "$QUESTIONS_DIR"/q-*.json
ask_director freeze cls2 "Leaky body" $'What happened.\n## Fake heading from the body\nmore' "$OPTS"
printf '# Fleet\n\n%s\n\nstale\n\n## Blocked\n\nb1\n' "$HEAD" > "$FLEET_MD"; cp "$FLEET_MD" "$FLEET_MD.o"
"$DESK" mirror >/dev/null; s1=$(stat -f %z "$FLEET_MD"); "$DESK" mirror >/dev/null; "$DESK" mirror >/dev/null; s3=$(stat -f %z "$FLEET_MD")
# (BREAK) fix: mirror must neutralise line-leading '#' in title/body (indent or replace "\n" with " "), or bound the
# section with an explicit end marker instead of "the next ## line".
diff <(rest "$FLEET_MD.o") <(rest "$FLEET_MD") >/dev/null && [ "$s1" -eq "$s3" ] && pass "6d a '## ' line inside a question body stays inside the section" \
  || fail "6d (BREAK) body line '## …' ends the section early: 3 mirrors grew the file $s1 → $s3 bytes and left $(grep -c '^## Fake' "$FLEET_MD") stray headings outside the section"
rm -f "$QUESTIONS_DIR"/q-*.json; ask_director freeze cls3 $'Two-line title\n## Injected' "b" "$OPTS"
printf '# Fleet\n\n%s\n\nstale\n\n## Blocked\n\nb1\n' "$HEAD" > "$FLEET_MD"; cp "$FLEET_MD" "$FLEET_MD.o"; "$DESK" mirror >/dev/null; "$DESK" mirror >/dev/null
diff <(rest "$FLEET_MD.o") <(rest "$FLEET_MD") >/dev/null && pass "6e a newline in a question title stays inside the section" \
  || fail "6e (BREAK) title newline + '## ' leaks outside the section ($(grep -c '^## Injected' "$FLEET_MD") stray headings); ask_director should reject or flatten newlines in title"
rm -f "$QUESTIONS_DIR"/q-*.json; ask_director freeze cls1 "Question one" "Body one." "$OPTS"
printf '# Fleet\n\n```\n%s\nexample in a code block\n```\n\n## Blocked\n\nb1\n' "$HEAD" > "$FLEET_MD"; "$DESK" mirror >/dev/null
[ "$(grep -c '^```' "$FLEET_MD")" -eq 2 ] && pass "6f heading text inside a code fence is not treated as the section" || fail "6f (gap) heading inside a code fence: closing fence eaten ($(grep -c '^```' "$FLEET_MD") fences left of 2)"

# ── 7. de-dup ─────────────────────────────────────────────────────────────────
rm -f "$QUESTIONS_DIR"/q-*.json
for i in 1 2 3 4; do ( ask_director freeze race "Race title" b "$OPTS" ) & done; wait
[ "$(ls "$QUESTIONS_DIR"/q-*.json | wc -l | tr -d ' ')" -eq 1 ] && pass "7a four concurrent same-key asks → one open file" || fail "7a duplicates under concurrency"

echo; [ $fails -eq 0 ] && echo "ALL PASS" || echo "$fails FAIL"; exit $(( fails > 0 ))

#!/bin/bash
# test-desk-questions.sh — proof for HUMAN-IN-THE-LOOP §A (question channel + desk).
# Run from the worktree root:  bash scripts/ship-wave/tests/test-desk-questions.sh
# Uses a temp $STATE and a fixture Fleet.md; touches nothing live. Prints PASS/FAIL per case, exits 1 on any FAIL.
# Runs itself under `env -i PATH HOME` — the C locale launchd gives the wave — so a byte-counting bug fails here (round 4).
[ "${DESK_TEST_ENV_I:-}" = 1 ] || exec env -i PATH="$PATH" HOME="$HOME" DESK_TEST_ENV_I=1 bash "$0" "$@"
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SW="$HERE/.."
DESK="$SW/desk/v5-w12-desk.sh"
export STATE; STATE="$(mktemp -d "${TMPDIR:-/tmp}/desk-test.XXXXXX")"
export FLEET_MD="$STATE/Fleet.md"
export SHIP_WAVE_DIR="$SW"
trap 'rm -rf "$STATE"' EXIT
fails=0
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; fails=$((fails+1)); }
check() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then pass "$name"; else fail "$name"; fi; }
jq_() { python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(eval(sys.argv[2], {"d": d}))' "$1" "$2"; }

# the wave's side: source the same way ship-wave.sh will
say() { :; }
. "$SW/failure-ledger.sh"
. "$SW/policy-learning.sh"
. "$SW/desk-questions.sh"
# the check() helper runs assertions in `bash -c` sub-shells — hand them the functions they call
export -f jq_ say question_writes_valid question_id_valid question_file_valid question_open_state _q_one_line ask_director _ask_director_locked questions_open_count policy_active
export QUESTIONS_DIR QUESTIONS_LOG POLICY_DIR QUESTION_ID_RE

FREEZE_OPTS='[
 {"label":"Allow this one migration","description":"Adds 20260906213000 to allow-destructive and lifts the stop.",
  "writes":[{"op":"append","file":"allow-destructive","value":"20260906213000"},{"op":"unfreeze"}]},
 {"label":"Lift the stop","description":"Removes the freeze; the migration stays refused.","writes":[{"op":"unfreeze"}]},
 {"label":"Keep it stopped","description":"Nothing changes.","writes":[{"op":"noop"}]}]'

# ── 1. write a freeze question ────────────────────────────────────────────────
printf '2026-09-10 06:45:00\tdestructive statement in 20260906213000\tdestructive statement in VERSION\n' > "$STATE/FROZEN"
ask_director freeze "destructive statement in VERSION" "A migration wants to drop a column. Allow it?" \
      "The wave refused 20260906213000 because it drops a column. Allowing applies it on the next run." "$FREEZE_OPTS"; id=$ASK_DIRECTOR_ID
check "1a ask_director writes \$STATE/questions/<id>.json" test -f "$STATE/questions/$id.json"
check "1b id has the q-<stamp>-<slug> shape" bash -c "case '$id' in q-[0-9]*-[0-9]*-freeze-*) exit 0;; *) exit 1;; esac"
check "1c title/kind/class/recommended/expires stored" bash -c "[ \"\$(jq_ '$STATE/questions/$id.json' 'd[\"kind\"]+\"|\"+str(d[\"recommended\"])+\"|\"+str(d[\"expires_after_h\"])+\"|\"+d[\"class\"]')\" = 'freeze|0|48|destructive statement in VERSION' ]"
check "1d questions.log has one 'asked' line" bash -c "[ \"\$(grep -c $'\tasked\t' '$STATE/questions.log')\" = 1 ]"

# ── 2. pending lists it ───────────────────────────────────────────────────────
pend=$("$DESK" pending)
check "2a pending lists the question" bash -c "printf '%s' \"\$0\" | python3 -c 'import json,sys; qs=json.load(sys.stdin); sys.exit(0 if len(qs)==1 and qs[0][\"id\"]==\"$id\" else 1)'" "$pend"
check "2b pending carries the options verbatim" bash -c "printf '%s' \"\$0\" | python3 -c 'import json,sys; qs=json.load(sys.stdin); sys.exit(0 if qs[0][\"options\"]==json.loads(sys.argv[1]) else 1)' \"\$1\"" "$pend" "$FREEZE_OPTS"

# ── 3. de-dup: same kind+class+title does not write twice ─────────────────────
first_asked=$(jq_ "$STATE/questions/$id.json" 'd["asked_at"]')
sleep 1
ask_director freeze "destructive statement in VERSION" "A migration wants to drop a column. Allow it?" "body v2" "$FREEZE_OPTS"; id2=$ASK_DIRECTOR_ID
check "3a de-dup returns the same id" test "$id2" = "$id"
check "3b still exactly one open question file" bash -c "[ \"\$(ls '$STATE/questions'/q-*.json | wc -l | tr -d ' ')\" = 1 ]"
check "3c asked_at refreshed" test "$(jq_ "$STATE/questions/$id.json" 'd["asked_at"]')" != "$first_asked"
check "3d questions.log has a 'refreshed' line, still one 'asked'" bash -c "[ \"\$(grep -c $'\trefreshed\t' '$STATE/questions.log')\" = 1 ] && [ \"\$(grep -c $'\tasked\t' '$STATE/questions.log')\" = 1 ]"

# ── 4. answer option 0 applies exactly its writes ─────────────────────────────
out=$("$DESK" answer "$id" 0); rc=$?
check "4a answer exits 0" test "$rc" = 0
check "4b allow-destructive contains exactly the value" bash -c "[ \"\$(cat '$STATE/allow-destructive')\" = 20260906213000 ]"
check "4c FROZEN removed (unfreeze op)" test ! -e "$STATE/FROZEN"
check "4d the other knobs were NOT touched" bash -c "[ ! -e '$STATE/approve-held' ] && [ ! -e '$STATE/advisory-checks' ]"
check "4e file moved to questions/answered/" bash -c "[ -f '$STATE/questions/answered/$id.json' ] && [ ! -e '$STATE/questions/$id.json' ]"
check "4f answered_at / chosen / applied recorded" bash -c "[ \"\$(jq_ '$STATE/questions/answered/$id.json' 'd[\"chosen\"]+\"|\"+str(d[\"chosen_index\"])+\"|\"+\";\".join(d[\"applied\"])+\"|\"+str(bool(d[\"answered_at\"]))')\" = 'Allow this one migration|0|append allow-destructive 20260906213000;unfreeze|True' ]"
check "4g receipt line per write" bash -c "printf '%s' \"\$0\" | grep -q 'append allow-destructive 20260906213000 ✓' && printf '%s' \"\$0\" | grep -q 'unfreeze ✓'" "$out"
check "4h ledger got a 'resolved' record with class, chosen and writes" python3 - "$STATE/failure-ledger.jsonl" <<'PY'
import json, sys
recs = [json.loads(l) for l in open(sys.argv[1])]
r = [x for x in recs if x["outcome"] == "resolved"]
assert len(r) == 1, r
assert r[0]["class"] == "destructive statement in VERSION" and r[0]["chosen"] == "Allow this one migration"
assert [w["op"] for w in r[0]["writes"]] == ["append", "unfreeze"]
PY
check "4i pending is now empty" bash -c "[ \"\$('$DESK' pending 2>/dev/null | python3 -c 'import json,sys;print(len(json.load(sys.stdin)))')\" = 0 ]"
check "4j answering again reports already answered, exit 2" bash -c "'$DESK' answer '$id' 0 | grep -q 'already answered'; [ \"\${PIPESTATUS[0]}\" = 2 ]"

# ── 5. a forbidden op is refused and reported, not applied ────────────────────
for bad in '{"op":"delete","file":"approve-held"}' '{"op":"sql","value":"DROP TABLE x"}' '{"op":"append","file":"FROZEN","value":"x"}' '{"op":"merge","value":"3410"}'; do
  bid="q-20260910-070000-bad-$(printf '%s' "$bad" | python3 -c 'import json,sys;print(json.load(sys.stdin)["op"])')"
  cat > "$STATE/questions/$bid.json" <<EOF
{"id":"$bid","asked_at":"$(python3 -c 'import datetime;print(datetime.datetime.now().astimezone().isoformat(timespec="seconds"))')",
 "kind":"held","class":"held","title":"bad question","body":"",
 "options":[{"label":"Do it","description":"","writes":[$bad]},{"label":"No","description":"","writes":[{"op":"noop"}]}],
 "recommended":0,"expires_after_h":48}
EOF
  op=$(printf '%s' "$bad" | python3 -c 'import json,sys;print(json.load(sys.stdin)["op"])')
  # assert on the validator's own words, not just a non-zero exit — a missing function also exits non-zero
  check "5a [$op] question_writes_valid rejects it, exit 1, names the op" bash -c "question_writes_valid \"\$(cat '$STATE/questions/$bid.json')\" > '$STATE/why'; [ \$? = 1 ] && grep -Eq 'not allowed|not a knob' '$STATE/why'"
  check "5b [$op] pending does not list it and reports it on stderr" bash -c "'$DESK' pending 2>'$STATE/err' > '$STATE/pend'; ! grep -q '$bid' '$STATE/pend' && grep -q 'invalid question $bid' '$STATE/err'"
  "$DESK" answer "$bid" 0 > "$STATE/out" 2>&1; rc=$?
  check "5c [$op] answer refuses with exit 3 and says REFUSED" bash -c "[ $rc = 3 ] && grep -q 'REFUSED $bid' '$STATE/out'"
  check "5d [$op] nothing applied, file left in place" bash -c "[ ! -e '$STATE/approve-held' ] && [ ! -e '$STATE/FROZEN' ] && [ -f '$STATE/questions/$bid.json' ] && [ ! -e '$STATE/questions/answered/$bid.json' ]"
  rm -f "$STATE/questions/$bid.json"
done
check "5e ask_director itself refuses invalid writes (no file written)" bash -c "! ask_director held held 'x' 'y' '[{\"label\":\"a\",\"writes\":[{\"op\":\"delete\"}]},{\"label\":\"Keep\",\"writes\":[{\"op\":\"noop\"}]}]' >/dev/null && [ \"\$(ls '$STATE/questions'/q-*.json 2>/dev/null | wc -l | tr -d ' ')\" = 0 ]"
check "5f question_writes_valid accepts every allowed op" question_writes_valid '[{"label":"a","writes":[{"op":"append","file":"approve-held","value":"3410"},{"op":"append","file":"allow-destructive","value":"20260906213000"},{"op":"append","file":"advisory-checks","value":"SDK multi-agent review"},{"op":"unfreeze"},{"op":"ratify","value":"P3"},{"op":"noop"}]},{"label":"Keep","writes":[{"op":"noop"}]}]'

# ── 6. "other" stores the text and applies nothing ────────────────────────────
HELD_OPTS='[{"label":"#3410 — fees export","description":"Merges #3410.","writes":[{"op":"append","file":"approve-held","value":"3410"}]},
 {"label":"#3412 — grade sync","description":"Merges #3412.","writes":[{"op":"append","file":"approve-held","value":"3412"}]},
 {"label":"Approve all listed","description":"Merges both.","writes":[{"op":"append","file":"approve-held","value":"3410"},{"op":"append","file":"approve-held","value":"3412"}]},
 {"label":"None today","description":"Nothing merges.","writes":[{"op":"noop"}]}]'
Q_RECOMMENDED=3 ask_director held held "2 HELD PRs are ready. Which may merge?" "Both touch money/grades." "$HELD_OPTS"; hid=$ASK_DIRECTOR_ID
"$DESK" answer "$hid" other "ask the fees team first, then 3410 only" > "$STATE/out"; rc=$?
check "6a other: exit 0" test "$rc" = 0
check "6b other: nothing applied — no knob file created" bash -c "[ ! -e '$STATE/approve-held' ]"
check "6c other: stored verbatim as chosen=other" bash -c "[ \"\$(jq_ '$STATE/questions/answered/$hid.json' 'd[\"chosen\"]+\"|\"+d[\"other_text\"]+\"|\"+str(d[\"applied\"])')\" = 'other|ask the fees team first, then 3410 only|[]' ]"
check "6d other: no ledger 'resolved' record for a non-freeze" bash -c "[ \"\$(grep -c '\"outcome\": \"resolved\"' '$STATE/failure-ledger.jsonl')\" = 1 ]"

# ── 7. multi-append option lands both numbers, in order ───────────────────────
ask_director held held "2 HELD PRs are ready (set b). Which may merge?" "…" "$HELD_OPTS"; hid=$ASK_DIRECTOR_ID
"$DESK" answer "$hid" 2 >/dev/null
check "7a approve-held has 3410 then 3412" bash -c "[ \"\$(tr '\n' ' ' < '$STATE/approve-held')\" = '3410 3412 ' ]"
check "7b recommended index clamps into range" bash -c "[ \"\$(jq_ '$STATE/questions/answered/$hid.json' 'd[\"recommended\"]')\" = 0 ]"

# ── 8. an expired question is not listed ──────────────────────────────────────
xid="q-20260901-000000-freeze-old"
cat > "$STATE/questions/$xid.json" <<EOF
{"id":"$xid","asked_at":"2026-09-01T00:00:00+05:30","kind":"freeze","class":"old","title":"old","body":"",
 "options":[{"label":"Lift the stop","description":"","writes":[{"op":"unfreeze"}]},{"label":"Keep","description":"","writes":[{"op":"noop"}]}],"recommended":0,"expires_after_h":48}
EOF
check "8a expired question absent from pending" bash -c "! '$DESK' pending | grep -q '$xid'"
check "8b questions_open_count ignores it" test "$(questions_open_count)" = 0
check "8c refresh via ask_director revives it (same id, unexpired)" bash -c "ask_director freeze old old '' '[{\"label\":\"Lift the stop\",\"writes\":[{\"op\":\"unfreeze\"}]},{\"label\":\"Keep\",\"writes\":[{\"op\":\"noop\"}]}]'; [ \"\$ASK_DIRECTOR_ID\" = '$xid' ] && '$DESK' pending | grep -q '$xid'"
rm -f "$STATE/questions/$xid.json"

# ── 9. ratify applies through policy_ratify ───────────────────────────────────
printf '%s\n' '{"at":"2026-09-09 01:00:00","outcome":"round","class":"round","message":"merged=6 held=5"}' >> "$STATE/failure-ledger.jsonl"
ask_director policy "P1 AUTO_APPROVE_ADDITIVE_MIGRATIONS" "Make additive-migration approvals a rule?" "5 HELD merges, 0 migration-caused freezes." \
      '[{"label":"Make this a rule","description":"Ratifies P1.","writes":[{"op":"ratify","value":"P1"}]},{"label":"Not yet","description":"","writes":[{"op":"noop"}]}]'; pid=$ASK_DIRECTOR_ID
"$DESK" answer "$pid" 0 > "$STATE/out"; rc=$?
check "9a ratify: exit 0" test "$rc" = 0
check "9b ratify: rule flag exists and policy_active sees it" bash -c "[ -e '$STATE/policy/AUTO_APPROVE_ADDITIVE_MIGRATIONS' ] && policy_active AUTO_APPROVE_ADDITIVE_MIGRATIONS"
check "9c ratify: policy.jsonl has the P1 line" grep -q '"id": "P1"' "$STATE/policy.jsonl"
check "9d ratify: applied[] says 'ratify P1'" bash -c "[ \"\$(jq_ '$STATE/questions/answered/$pid.json' 'd[\"applied\"][0]')\" = 'ratify P1' ]"
ask_director policy "P9 NOPE" "Ratify a proposal that does not exist?" "" '[{"label":"Make this a rule","writes":[{"op":"ratify","value":"P9"}]},{"label":"Not yet","writes":[{"op":"noop"}]}]'; pid2=$ASK_DIRECTOR_ID
"$DESK" answer "$pid2" 0 > "$STATE/out" 2>&1; rc=$?
check "9e ratify of an unknown proposal: exit 4, FAILED recorded, still moved to answered" bash -c "[ $rc = 4 ] && grep -q 'FAILED' '$STATE/out' && [ -f '$STATE/questions/answered/$pid2.json' ]"

# ── 10. mirror rewrites only its own section ──────────────────────────────────
mk_fleet() {  # $1 = with-section?
  {
    printf '# Claude Fleet\n\nintro line — must not change\n\n## ☀️ Today'"'"'s queue (2)\n- item a\n- item b\n\n'
    [ "$1" = yes ] && printf '## W12 desk — waiting on you\n\nstale content that must be replaced\n- old option\n\n'
    printf '## 🔴 Blocked — waiting on you (1)\n- 🟢 **something** `real`\n    - “quoted”\n\n## 🟡 Ready for review (0)\n\ntail line without newline'
  } > "$FLEET_MD"
}
strip_section() { python3 - "$1" <<'PY'
import sys
rows = open(sys.argv[1], encoding="utf-8").read().split("\n")
out, skip = [], False
for r in rows:
    if r.startswith("## W12 desk — waiting on you"): skip = True; continue
    if skip and r.startswith("## "): skip = False
    if not skip: out.append(r)
sys.stdout.write("\n".join(out))
PY
}
ask_director freeze "deploy error" "Production build failed. Lift the stop?" "Vercel said ERROR at 06:40. Lifting lets the next round merge again." \
      '[{"label":"Lift the stop","description":"Removes the freeze.","writes":[{"op":"unfreeze"}]},{"label":"Keep it stopped","description":"Nothing changes.","writes":[{"op":"noop"}]}]'; qid=$ASK_DIRECTOR_ID
mk_fleet yes; strip_section "$FLEET_MD" > "$STATE/rest-before"
"$DESK" mirror >/dev/null
strip_section "$FLEET_MD" > "$STATE/rest-after"
check "10a mirror (section present): everything outside the section is byte-identical" cmp -s "$STATE/rest-before" "$STATE/rest-after"
check "10b mirror: stale content gone, question + numbered options present" bash -c "! grep -q 'stale content' '$FLEET_MD' && grep -q 'Production build failed' '$FLEET_MD' && grep -q '1. \*\*Lift the stop\*\* (Recommended)' '$FLEET_MD' && grep -q '2. \*\*Keep it stopped\*\*' '$FLEET_MD'"
check "10c mirror: section sits where it was (before Blocked)" bash -c "[ \"\$(grep -n '^## ' '$FLEET_MD' | sed -n 2p | cut -d: -f2 | cut -c1-12)\" = '## W12 desk ' ]"
check "10d mirror: exactly one desk heading" bash -c "[ \"\$(grep -c '^## W12 desk' '$FLEET_MD')\" = 1 ]"
"$DESK" mirror >/dev/null; strip_section "$FLEET_MD" > "$STATE/rest-again"
check "10e mirror twice: still one heading, rest unchanged" bash -c "cmp -s '$STATE/rest-before' '$STATE/rest-again' && [ \"\$(grep -c '^## W12 desk' '$FLEET_MD')\" = 1 ]"
mk_fleet no; cp "$FLEET_MD" "$STATE/fleet-orig"
"$DESK" mirror >/dev/null
check "10f mirror (section absent): appended, original bytes are a prefix" bash -c "[ \"\$(head -c \$(wc -c < '$STATE/fleet-orig') '$FLEET_MD' | cmp - '$STATE/fleet-orig' && echo same)\" = same ] && grep -q '^## W12 desk' '$FLEET_MD'"
"$DESK" answer "$qid" 1 >/dev/null
mk_fleet yes; "$DESK" mirror >/dev/null
check "10g mirror with nothing pending says 'nothing waiting'" bash -c "grep -q '^nothing waiting' '$FLEET_MD' && ! grep -q 'Production build failed' '$FLEET_MD'"
check "10h ledger: noop 'Keep it stopped' on a freeze is still a resolution on record" bash -c "grep -q '\"chosen\": \"Keep it stopped\"' '$STATE/failure-ledger.jsonl'"

# ── 11. the desk never touched anything live ──────────────────────────────────
check "11a no stray files outside the contract in \$STATE" bash -c "[ -z \"\$(ls '$STATE' | grep -vE '^(questions|questions.log|approve-held|allow-destructive|advisory-checks|failure-ledger.jsonl|policy|policy.jsonl|Fleet.md|fleet-orig|rest-before|rest-after|rest-again|out|err|why|pend|b4-.*|b5-.*|g6c-.*|g6f-.*)$')\" ]"

# ── 12. regressions from the adversarial verification of fb0bd5a0ae (2026-09-10) ──────────────────────
# Each case is named after the break it closes. Every one FAILED before the fix commit and passes after it.
mkq() {  # <id> <options-json> [kind] [title] → a raw question file, bypassing ask_director (a bad file IS the threat)
  python3 - "$STATE/questions/$1.json" "$1" "$2" "${3:-freeze}" "${4:-t}" <<'PY'
import json, sys, datetime
p, qid, opts, kind, title = sys.argv[1:6]
q = {"id": qid, "asked_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"), "kind": kind, "class": "c",
     "title": title, "body": "b", "options": json.loads(opts), "recommended": 0, "expires_after_h": 48}
open(p, "w").write(json.dumps(q, ensure_ascii=False))
PY
}
export -f mkq
one_append() { printf '[{"label":"Approve #3410","description":"d","writes":[{"op":"append","file":"%s","value":%s}]},{"label":"Keep","writes":[{"op":"noop"}]}]' "$1" "$2"; }
rm -f "$STATE/questions"/q-*.json; : > "$STATE/approve-held"; rm -f "$STATE/allow-destructive" "$STATE/advisory-checks"

# BREAK 1 — one append value must be ONE knob entry as ship-wave.sh reads it (approve-held is split on ',' and whitespace)
i=0; ok=1; bad_list=""
for v in '"3410\t3411"' '"3410 3411,3412"' '"3410\r3411"' '"3410\u001b[31mRED"' '"34103410341"' '"abc"' '""' '" 3410"' '"3410/1"'; do
  i=$((i+1)); qid="q-20260910-000100-b1a$i"; mkq "$qid" "$(one_append approve-held "$v")" held
  question_writes_valid "$(cat "$STATE/questions/$qid.json")" >/dev/null && ok=0
  "$DESK" answer "$qid" 0 >/dev/null 2>&1; rc=$?; [ $rc -eq 3 ] || { ok=0; bad_list="$bad_list ${v}→rc${rc}"; }
done
n=$(tr ',\n' '  ' < "$STATE/approve-held" | wc -w | tr -d ' ')
[ $ok -eq 1 ] && [ "$n" -eq 0 ] && pass "BREAK-1a approve-held value must match ^[0-9]{1,7}\$ — tab/space/comma/CR/ESC/long/alpha/empty/slash all refused (exit 3), 0 tokens landed" \
  || fail "BREAK-1a approve-held shape not enforced: $n tokens landed;$bad_list"
i=0; ok=1
for v in '"2026090621300"' '"20260906213000x"' '"3410"' '"20260906213000\n1"' '"2026090621300a"'; do
  i=$((i+1)); qid="q-20260910-000101-b1b$i"; mkq "$qid" "$(one_append allow-destructive "$v")"
  "$DESK" answer "$qid" 0 >/dev/null 2>&1; [ $? -eq 3 ] || ok=0
done
[ $ok -eq 1 ] && [ ! -e "$STATE/allow-destructive" ] && pass "BREAK-1b allow-destructive value must match ^[0-9]{14}\$ — 13/15 digits, PR number, alpha refused, nothing written" || fail "BREAK-1b allow-destructive shape not enforced"
mkq q-20260910-000102-b1c1 "$(one_append allow-destructive '"20260906213000"')"; "$DESK" answer q-20260910-000102-b1c1 0 >/dev/null 2>&1; rc=$?
[ $rc -eq 0 ] && [ "$(cat "$STATE/allow-destructive")" = 20260906213000 ] && pass "BREAK-1c a 14-digit allow-destructive value is still accepted and lands once" || fail "BREAK-1c valid 14-digit value refused (rc=$rc)"
i=0; ok=1
for v in '"a\tb"' '"a\rb"' '"a\u001bb"' "\"$(printf 'x%.0s' $(seq 81))\"" '"   "' '"a\u0000b"'; do
  i=$((i+1)); qid="q-20260910-000103-b1d$i"; mkq "$qid" "$(one_append advisory-checks "$v")"
  "$DESK" answer "$qid" 0 >/dev/null 2>&1; [ $? -eq 3 ] || ok=0
done
[ $ok -eq 1 ] && [ ! -e "$STATE/advisory-checks" ] && pass "BREAK-1d advisory-checks value must be one printable line 1–80 chars — tab/CR/ESC/81 chars/blank/NUL refused" || fail "BREAK-1d advisory-checks shape not enforced"
mkq q-20260910-000104-b1e1 "$(one_append advisory-checks '"SDK multi-agent review / lint"')"; "$DESK" answer q-20260910-000104-b1e1 0 >/dev/null 2>&1; rc=$?
[ $rc -eq 0 ] && [ "$(cat "$STATE/advisory-checks")" = "SDK multi-agent review / lint" ] && pass "BREAK-1e a plain check name (with a slash) is accepted for advisory-checks" || fail "BREAK-1e plain advisory check name refused (rc=$rc)"
check "BREAK-1f the validator names the offending value" bash -c "question_writes_valid '$(one_append approve-held '"3410 3411"')' | grep -q '3410 3411'"

# BREAK 2 — a path-shaped id must never re-apply an answered question
: > "$STATE/approve-held"
mkq q-20260910-000110-twice '[{"label":"ok","description":"d","writes":[{"op":"append","file":"approve-held","value":"5555"}]},{"label":"Keep","writes":[{"op":"noop"}]}]' held
"$DESK" answer q-20260910-000110-twice 0 >/dev/null 2>&1
"$DESK" answer answered/q-20260910-000110-twice 0 > "$STATE/out" 2>&1; rc=$?
[ $rc -eq 3 ] && [ "$(grep -c 5555 "$STATE/approve-held")" -eq 1 ] && [ -f "$STATE/questions/answered/q-20260910-000110-twice.json" ] && ! grep -q Traceback "$STATE/out" \
  && pass "BREAK-2a 'answer answered/<id> 0' is refused (exit 3), applied nothing, no traceback" || fail "BREAK-2a path-shaped id re-applied (rc=$rc, 5555 × $(grep -c 5555 "$STATE/approve-held"))"
"$DESK" answer q-20260910-000110-twice 0 >/dev/null 2>&1; rc=$?
[ $rc -eq 2 ] && [ "$(grep -c 5555 "$STATE/approve-held")" -eq 1 ] && pass "BREAK-2b re-running the literal id still finds no open file: exit 2, nothing applied" || fail "BREAK-2b literal re-answer rc=$rc"
ok=1; bad_list=""
for bad in 'Q-20260910-000110-twice' 'q-20260910-000110-Twice' 'q-20260910-000110-' 'q-20260910-000110--x' 'q-2026091-000110-x' "q-20260910-000110-$(printf 'a%.0s' $(seq 41))" 'q-20260910-000110-x/../y' 'q-20260910-000110-x.json' './q-20260910-000110-twice' 'q-20260910-000110-x y' '..' '.'; do
  "$DESK" answer "$bad" 0 >/dev/null 2>&1; rc=$?; [ $rc -eq 3 ] || { ok=0; bad_list="$bad_list [${bad}→rc${rc}]"; }
done
[ $ok -eq 1 ] && [ "$(grep -c 5555 "$STATE/approve-held")" -eq 1 ] && pass "BREAK-2c every id outside ^q-[0-9]{8}-[0-9]{6}-[a-z0-9][a-z0-9-]{0,39}\$ is refused with exit 3 before any path is built" || fail "BREAK-2c id shape not enforced:$bad_list"
check "BREAK-2d an id at the 40-char slug ceiling is still accepted by the shape rule" bash -c "mkq 'q-20260910-000111-$(printf 'a%.0s' $(seq 40))' '[{\"label\":\"ok\",\"writes\":[{\"op\":\"noop\"}]},{\"label\":\"Keep\",\"writes\":[{\"op\":\"noop\"}]}]' held && '$DESK' answer 'q-20260910-000111-$(printf 'a%.0s' $(seq 40))' 0"

# BREAK 3 — the desk never reads, applies or moves a file outside $STATE/questions/
cp "$STATE/questions/answered/q-20260910-000110-twice.json" "$STATE/stray.json"
"$DESK" answer ../stray 0 >/dev/null 2>&1; rc=$?
[ $rc -eq 3 ] && [ -f "$STATE/stray.json" ] && [ ! -e "$STATE/questions/stray.json" ] && [ "$(grep -c 5555 "$STATE/approve-held")" -eq 1 ] \
  && pass "BREAK-3 'answer ../stray 0' refused: \$STATE/stray.json untouched, not moved into questions/, nothing applied" || fail "BREAK-3 a file outside questions/ was read/applied/moved (rc=$rc)"
rm -f "$STATE/stray.json"

# BREAK 4 — a body line starting '## ' stays inside the mirror section (byte-compare the rest, three passes)
rm -f "$STATE/questions"/q-*.json
OPTS2='[{"label":"Lift the stop","description":"lifts","writes":[{"op":"unfreeze"}]},{"label":"Keep","description":"keeps","writes":[{"op":"noop"}]}]'
ask_director freeze cls2 "Leaky body" $'What happened.\n## fake\n# also fake\n```\nfence in body\nmore' "$OPTS2"
printf '# Fleet\n\n## W12 desk — waiting on you\n\nstale\n\n## Blocked\n\nb1\n\n### sub\n\nend\n' > "$FLEET_MD"; cp "$FLEET_MD" "$STATE/b4-orig"
"$DESK" mirror >/dev/null; s1=$(wc -c < "$FLEET_MD"); "$DESK" mirror >/dev/null; "$DESK" mirror >/dev/null; s3=$(wc -c < "$FLEET_MD")
strip_section "$STATE/b4-orig" > "$STATE/b4-rest-before"; strip_section "$FLEET_MD" > "$STATE/b4-rest-after"
cmp -s "$STATE/b4-rest-before" "$STATE/b4-rest-after" && [ "$s1" -eq "$s3" ] && [ "$(grep -c '^## fake' "$FLEET_MD")" -eq 0 ] && [ "$(grep -c '^# also' "$FLEET_MD")" -eq 0 ] && [ "$(grep -c '^```' "$FLEET_MD")" -eq 0 ] \
  && pass "BREAK-4a body with '## fake', '# also fake' and a fence: rest byte-identical after 3 mirrors, size stable ($s1), no stray heading or fence" \
  || fail "BREAK-4a body leaked out of the section: size $s1 → $s3, stray '## fake' × $(grep -c '^## fake' "$FLEET_MD")"
check "BREAK-4b body lines are rendered as a quote ('> ## fake'), the question is still shown" bash -c "grep -q '^> ## fake' '$FLEET_MD' && grep -q 'Leaky body' '$FLEET_MD' && grep -q '1. \*\*Lift the stop\*\*' '$FLEET_MD'"
check "BREAK-4c section still sits where it was and '## Blocked' + '### sub' survive once each" bash -c "[ \"\$(grep -n '^## ' '$FLEET_MD' | sed -n 1p | cut -d: -f2 | cut -c1-12)\" = '## W12 desk ' ] && [ \"\$(grep -c '^## Blocked' '$FLEET_MD')\" = 1 ] && [ \"\$(grep -c '^### sub' '$FLEET_MD')\" = 1 ]"

# BREAK 5 — title and class are single plain lines; a hand-written multi-line title is invalid
rm -f "$STATE/questions"/q-*.json; : > "$STATE/questions.log"
ask_director freeze $'cls\t3' $'Two-line title\n## Injected' "b" "$OPTS2"; tid=$ASK_DIRECTOR_ID
check "BREAK-5a ask_director flattens the title to one line (no LF/tab stored)" bash -c "[ \"\$(jq_ '$STATE/questions/$tid.json' 'd[\"title\"]')\" = 'Two-line title ## Injected' ]"
check "BREAK-5b ask_director flattens a tab in the class; questions.log stays a 6-field TSV" bash -c "[ \"\$(jq_ '$STATE/questions/$tid.json' 'd[\"class\"]')\" = 'cls 3' ] && [ \"\$(awk -F'\t' '{print NF}' '$STATE/questions.log' | sort -u)\" = 6 ]"
printf '# Fleet\n\n## W12 desk — waiting on you\n\nstale\n\n## Blocked\n\nb1\n' > "$FLEET_MD"; strip_section "$FLEET_MD" > "$STATE/b5-before"
"$DESK" mirror >/dev/null; "$DESK" mirror >/dev/null; strip_section "$FLEET_MD" > "$STATE/b5-after"
cmp -s "$STATE/b5-before" "$STATE/b5-after" && [ "$(grep -c '^## Injected' "$FLEET_MD")" -eq 0 ] && pass "BREAK-5c title cannot leak a heading outside the section" || fail "BREAK-5c title leaked ($(grep -c '^## Injected' "$FLEET_MD") stray headings)"
mkq q-20260910-000120-b5d '[{"label":"ok","writes":[{"op":"noop"}]},{"label":"Keep","writes":[{"op":"noop"}]}]' freeze $'line one\n## two'
"$DESK" pending 2>"$STATE/err" > "$STATE/pend"; "$DESK" answer q-20260910-000120-b5d 0 >/dev/null 2>&1; rc=$?
! grep -q b5d "$STATE/pend" && grep -q 'invalid question q-20260910-000120-b5d' "$STATE/err" && [ $rc -eq 3 ] && pass "BREAK-5d a hand-written file with a newline in the title is invalid: hidden by pending, answer exit 3" || fail "BREAK-5d multi-line title accepted (rc=$rc)"
rm -f "$STATE/questions/q-20260910-000120-b5d.json"
mkq q-20260910-000121-b5e '[{"label":"a\nb","writes":[{"op":"noop"}]},{"label":"Keep","writes":[{"op":"noop"}]}]' freeze
"$DESK" answer q-20260910-000121-b5e 0 >/dev/null 2>&1; rc=$?
[ $rc -eq 3 ] && pass "BREAK-5e a newline inside an option label is invalid too (it is a mirror line)" || fail "BREAK-5e label with newline accepted (rc=$rc)"
rm -f "$STATE/questions/q-20260910-000121-b5e.json"

# GAP 6c — the section present twice collapses to one, at the first position; the rest is byte-identical
rm -f "$STATE/questions"/q-*.json; ask_director freeze cls1 "Question one" "Body one." "$OPTS2"
printf '# Fleet\n\n## W12 desk — waiting on you (1)\n\nold A\n\n## Blocked\n\nb1\n\n## W12 desk — waiting on you\n\nold B\n\n## Tail\n\nt1\n' > "$FLEET_MD"; strip_section "$FLEET_MD" > "$STATE/g6c-before"
"$DESK" mirror >/dev/null; "$DESK" mirror >/dev/null; strip_section "$FLEET_MD" > "$STATE/g6c-after"
cmp -s "$STATE/g6c-before" "$STATE/g6c-after" && [ "$(grep -c '^## W12 desk' "$FLEET_MD")" -eq 1 ] && ! grep -q 'old B' "$FLEET_MD" && [ "$(grep -n '^## ' "$FLEET_MD" | sed -n 1p | cut -d: -f2 | cut -c1-12)" = '## W12 desk ' ] \
  && pass "GAP-6c duplicate desk sections collapse to one at the first position; 'old B' gone; rest byte-identical" || fail "GAP-6c duplicates left: $(grep -c '^## W12 desk' "$FLEET_MD") headings, old B $(grep -c 'old B' "$FLEET_MD")"

# GAP 6f — the heading text inside a code fence is not the section; a '## ' inside a fence does not end it
printf '# Fleet\n\n```\n## W12 desk — waiting on you\nexample in a code block\n```\n\n## Blocked\n\nb1\n' > "$FLEET_MD"; cp "$FLEET_MD" "$STATE/g6f-orig"
"$DESK" mirror >/dev/null
python3 -c 'import sys;o=open(sys.argv[1],"rb").read();n=open(sys.argv[2],"rb").read();sys.exit(0 if n.startswith(o) else 1)' "$STATE/g6f-orig" "$FLEET_MD" \
  && [ "$(grep -c '^```' "$FLEET_MD")" -eq 2 ] && [ "$(grep -c '^## W12 desk' "$FLEET_MD")" -eq 2 ] && pass "GAP-6f heading inside a code fence ignored: fences intact, real section appended at EOF" || fail "GAP-6f fence eaten ($(grep -c '^```' "$FLEET_MD") fences)"
printf '# Fleet\n\n## W12 desk — waiting on you\n\nstale\n\n~~~\n## not a heading, fenced\n~~~\n\n## Blocked\n\nb1\n' > "$FLEET_MD"
"$DESK" mirror >/dev/null
[ "$(grep -c '^~~~' "$FLEET_MD")" -eq 0 ] && grep -q '^## Blocked' "$FLEET_MD" && ! grep -q 'not a heading' "$FLEET_MD" && pass "GAP-6f2 a fenced block that was INSIDE the stale section is replaced with it; the next real heading ends the section" || fail "GAP-6f2 fence handling inside the section wrong"

# GAP consistency — questions_open_count agrees with pending; a file whose id ≠ its name is invalid, not silently skipped
rm -f "$STATE/questions"/q-*.json
mkq q-20260910-000130-inv '[{"label":"x","writes":[{"op":"delete"}]},{"label":"Keep","writes":[{"op":"noop"}]}]' held
python3 - "$STATE/questions/q-20260910-000131-mism.json" <<'PY'
import json, sys, datetime
json.dump({"id": "q-20260910-000199-other", "asked_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"), "kind": "held", "class": "c",
           "title": "t", "body": "", "options": [{"label": "x", "writes": [{"op": "noop"}]}], "recommended": 0, "expires_after_h": 48}, open(sys.argv[1], "w"))
PY
printf '{"id":"bad name","asked_at":"x","kind":"held","class":"c","title":"t","options":[{"label":"x","writes":[{"op":"noop"}]}]}' > "$STATE/questions/q-badname.json"
ask_director held held "Real one" "" '[{"label":"ok","writes":[{"op":"noop"}]},{"label":"Keep","writes":[{"op":"noop"}]}]'
"$DESK" pending 2>"$STATE/err" > "$STATE/pend"
[ "$(python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))))' "$STATE/pend")" -eq 1 ] && [ "$(questions_open_count)" -eq 1 ] \
  && grep -q 'invalid question q-20260910-000130-inv' "$STATE/err" && grep -q 'invalid question q-20260910-000131-mism' "$STATE/err" && grep -q 'invalid question q-badname' "$STATE/err" \
  && pass "GAP-count pending=1 and questions_open_count=1 with 3 invalid files beside it (forbidden op · id≠name · bad file name), each reported" \
  || fail "GAP-count pending=$(python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))))' "$STATE/pend") open_count=$(questions_open_count) err=$(cat "$STATE/err" | tr '\n' '|')"
"$DESK" answer q-20260910-000131-mism 0 >/dev/null 2>&1; rc=$?
[ $rc -eq 3 ] && [ -f "$STATE/questions/q-20260910-000131-mism.json" ] && pass "GAP-count2 answering the id≠name file is refused (exit 3), file left in place" || fail "GAP-count2 rc=$rc"
rm -f "$STATE/questions"/q-*.json
check "GAP-id ask_director with a punctuation-only class still mints a shape-valid id" bash -c "ask_director freeze '!!!' 'Odd class' '' '[{\"label\":\"ok\",\"writes\":[{\"op\":\"noop\"}]},{\"label\":\"Keep\",\"writes\":[{\"op\":\"noop\"}]}]'; RE='^q-[0-9]{8}-[0-9]{6}-[a-z0-9][a-z0-9-]{0,39}\$'; [[ \$ASK_DIRECTOR_ID =~ \$RE ]]"

echo
if [ "$fails" -eq 0 ]; then echo "ALL PASS"; exit 0; else echo "$fails FAIL"; exit 1; fi

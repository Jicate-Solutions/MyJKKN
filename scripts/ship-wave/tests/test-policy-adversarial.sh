#!/bin/bash
# test-policy-adversarial.sh — the verifier's attempts to BREAK HUMAN-IN-THE-LOOP.md §D (2026-09-10).
# Property under attack: a destructive class never becomes a rule; only IDENTICAL decisions count; noop is
# never a rule; junk in the ledger cannot crash or fake a proposal; P<n> never shifts; unknown ids are refused;
# a proposal is asked exactly once. Temp $STATE only; ask_director is a stub writing files, never the real desk.
# Run from the worktree root: bash scripts/ship-wave/tests/test-policy-adversarial.sh
#
# VERIFIER RESULT at commit 1cc2f819 (2026-09-10): the FAIL lines below were CONFIRMED BREAKS, kept failing on purpose
# until the builder fixed them. FIXED in the follow-up commit (policy-learning.sh: identity by sha1 key, NEVER_RULE on
# the action, malformed lines warned and skipped) — this file now passes in full; the per-break regression tests live
# in test-policy-threshold.sh. Two cases were adjusted for decisions that arrived with the fix (marked ADJUSTED below):
#   8   the DRY-RUN classes are HARD (§B) and an unfreeze on a hard class is now never proposable (integrator), so the
#       collision fixture uses two REAL soft classes (apply-migrations.sh:51 with two different paths) instead
#   8b  P1 is asked once whether or not its warrant holds (integrator: "the Director asked to see it"), so the
#       question count excludes P1
# Original break list —
#   4c  a writes item with no "op" ({"file":"approve-held"}) is counted as an approve-held append → junk becomes P<n>
#   4e  one resolved line without a "class" key kills the whole scan (KeyError) → zero proposals, zero questions, ratify refused
#   4f/4g/4h  a round without "message", a froze without "class", or a bare JSON scalar line does the same (4f-4h pre-date §D)
#   8a/8b  two DIFFERENT classes sharing the first 40 chars + the same shape collapse into ONE rule name and ONE P<n>:
#          one tap ratifies both; policy-proposals.jsonl records only one of the classes (realistic: DRY-RUN $err tails)
#   9a  NEVER_RULE looks only at the class/message text, never at what the rule WRITES — a shape that appends to
#       allow-destructive is proposed as AUTO_…_ALLOW_DESTRUCTIVE when the class text lacks the keywords
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE="$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-policy-adv.XXXXXX")"; export STATE
LEDGER="$STATE/failure-ledger.jsonl"; export LEDGER
QDIR="$STATE/questions"
say() { printf '%s\n' "$*"; }
# a desk-shaped stub: one file per (kind,class,title), like A1's de-dup
ask_director() { mkdir -p "$QDIR"; printf '%s\n' "$5" > "$QDIR/q-$(printf '%s%s%s' "$1" "$2" "$3" | cksum | cut -d' ' -f1).json"; }

. "$HERE/failure-ledger.sh"
. "$HERE/policy-learning.sh"

fail=0
pass() { echo "PASS  $1"; }
flunk() { echo "FAIL  $1"; [ -n "${2:-}" ] && printf '      %s\n' "$2"; fail=1; }
check() { if eval "$2"; then pass "$1"; else flunk "$1" "${3:-}"; fi; }   # ${3:-}: a failing two-arg check must report FAIL, not abort under set -u
reset_state() { find "$STATE" -mindepth 1 -delete; mkdir -p "$POLICY_DIR"; }
resolve() { ledger_record resolved "$1" "$2" "$3" "$4"; }
# Every freeze the Director decided has a `froze` line first (freeze() → ledger_on_freeze, raw message) and
# classify_freeze judges THAT text — an unfreeze on a class with no froze line, or on a hard one, is never a rule
# (spec amendment, verifier NEW-9). Fixtures that only name a class register one SOFT freeze under it.
soft_freeze() { ledger_record froze "peer hold on #3410 by reviewer (fixture: $1)" "$1"; }
RAW_RACE="files on jicate/main match for 20260906213000 after merge of #3410"   # ledger_class → CLS_RACE (soft row)
W_UNFREEZE='[{"op":"unfreeze"}]'
W_HELD='[{"op":"append","file":"approve-held","value":"3410"}]'
W_ALLOW='[{"op":"append","file":"allow-destructive","value":"20260906213000"}]'

# ── 1. NEVER_RULE: keyword mid-text, different case, and the REAL freeze strings ─────────────
reset_state
resolve "Lift?" "wave stopped because Delete From users failed on prod" "Lift the stop" "$W_UNFREEZE"
resolve "Lift?" "wave stopped because Delete From users failed on prod" "Lift the stop" "$W_UNFREEZE"
resolve "Lift?" "$(ledger_class 'page broke after we ran DROP INDEX idx_x')" "Lift the stop" "$W_UNFREEZE"
resolve "Lift?" "$(ledger_class 'page broke after we ran DROP INDEX idx_x')" "Lift the stop" "$W_UNFREEZE"
out=$(policy_proposals)
check "1a mid-text mixed-case 'Delete From' is excluded" '! grep -q "AUTO_WAVE_STOPPED" <<<"$out" && grep -q "skipped wave stopped.*NEVER_RULE (Delete From)" <<<"$out"' "$out"
check "1b lowercased slug 'drop index' is excluded" '! grep -q "AUTO_PAGE_BROKE" <<<"$out" && grep -q "skipped page broke.*NEVER_RULE (drop)" <<<"$out"' "$out"
# the real hard-class messages the wave actually emits (ship-wave.sh:597/599, apply-migrations.sh:71/94)
reset_state
for m in "deploy failed TWICE (attempt 2 = dpl_AbC123 → ERROR); on main but NOT live: #3410 #3411" \
         "deploy dpl_AbC123 → ERROR; on main but NOT live: #3410" \
         "migration 20260910030000: destructive statement in 20260910030000_x.sql — a human applies this one after review" \
         "migration 20260910030000: APPLY failed — ERROR: relation x does not exist"; do
  c=$(ledger_class "$m"); resolve "Lift?" "$c" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "$c" "Lift the stop" "$W_UNFREEZE"
done
out=$(policy_proposals)
check "1c none of the 4 REAL hard-class freeze strings becomes a rule" '! grep -Eq "^  P[0-9]+ +AUTO" <<<"$out" && [ "$(grep -c "NEVER_RULE" <<<"$out")" = 4 ]' "$out"
check "1d nothing was numbered in policy-proposals.jsonl" '[ ! -s "$POLICY_PROPOSALS" ] || ! grep -q "\"rule\"" "$POLICY_PROPOSALS"' "$(cat "$POLICY_PROPOSALS" 2>/dev/null)"

# ── 2. same op, different files → NOT identical ───────────────────────────────────────────
reset_state
resolve "Q" "peer hold on PR by reviewer" "Approve" "$W_HELD"
resolve "Q" "peer hold on PR by reviewer" "Allow" "$W_ALLOW"
out=$(policy_proposals)
check "2a append approve-held + append allow-destructive (1 each) → no proposal" '! grep -Eq "^  P[0-9]+ +AUTO" <<<"$out"' "$out"
resolve "Q" "peer hold on PR by reviewer" "Approve" "$W_HELD"
out=$(policy_proposals)
check "2b a second approve-held makes ONLY the APPROVE_HELD rule (allow-destructive stays at 1)" \
  '[ "$(grep -Ec "^  P[0-9]+ +AUTO" <<<"$out")" = 1 ] && grep -q "_APPROVE_HELD$" <<<"$out"' "$out"

# ── 3. noop never becomes a rule ─────────────────────────────────────────────────────────
reset_state
for i in 1 2 3; do resolve "Lift?" "stale ref after merge" "Keep it stopped" '[{"op":"noop"}]'; done
for i in 1 2; do resolve "Lift?" "empty writes class" "Whatever" '[]'; done
out=$(policy_proposals)
check "3a noop ×3 → no rule, and the skip says so" '! grep -q "AUTO_STALE" <<<"$out" && grep -q "skipped stale ref.*noop" <<<"$out"' "$out"
check "3b writes=[] ×2 → no rule" '! grep -q "AUTO_EMPTY" <<<"$out"' "$out"
check "3c nothing numbered" '! grep -qs "\"rule\"" "$POLICY_PROPOSALS"' "$(cat "$POLICY_PROPOSALS" 2>/dev/null)"

# ── 4. junk in the ledger: ignored, no crash, real proposals still appear ─────────────────
reset_state
soft_freeze "good class here"
resolve "Lift?" "good class here" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "good class here" "Lift the stop" "$W_UNFREEZE"
{ echo '{not json'
  echo '{"outcome":"resolved","class":"no writes at all","message":"x"}'
  echo '{"outcome":"resolved","class":"writes is a string","message":"x","writes":"[{\"op\":\"unfreeze\"}]"}'
  echo '{"outcome":"resolved","class":"writes is a dict","message":"x","writes":{"op":"unfreeze"}}'
  echo '{"outcome":"resolved","class":"writes has strings","message":"x","writes":["unfreeze","unfreeze"]}'
  echo '{"outcome":"resolved","class":"writes has strings","message":"x","writes":["unfreeze","unfreeze"]}'
  echo '{"outcome":"resolved","class":"op missing","message":"x","writes":[{"file":"approve-held"}]}'
  echo '{"outcome":"resolved","class":"op missing","message":"x","writes":[{"file":"approve-held"}]}'
  echo ''
} >> "$LEDGER"
resolve "Lift?" "good class here" "Lift the stop" "$W_UNFREEZE"
out=$(policy_proposals 2>&1); rc=$?
check "4a wrong-typed writes / missing writes do not crash the scan (rc=0, no Traceback)" '[ "$rc" = 0 ] && ! grep -q Traceback <<<"$out"' "$out"
check "4b the genuine proposal (good class ×3) still appears" 'grep -q "AUTO_GOOD_CLASS_HERE_UNFREEZE" <<<"$out" && grep -q "resolved 3x" <<<"$out"' "$out"
check "4c no junk class became a proposal" '! grep -Eq "AUTO_(WRITES|NO_|OP_MISSING|UNKNOWN)" <<<"$out"' "$out"
check "4d ledger_record with unparsable writes-json still writes a line and does not crash" \
  'ledger_record resolved "m" "c" "ch" "{oops" && tail -1 "$LEDGER" | grep -q "\"writes\": \"{oops\""' "$(tail -1 "$LEDGER")"
# one resolved line that has writes but NO class key (a writer other than ledger_record)
cp "$LEDGER" "$STATE/ledger.bak"
echo '{"outcome":"resolved","message":"no class key","writes":[{"op":"unfreeze"}]}' >> "$LEDGER"
out=$(policy_proposals 2>&1); rc=$?
check "4e a resolved line with writes but no class key does not kill the scan" '[ "$rc" = 0 ] && ! grep -q Traceback <<<"$out" && grep -q "AUTO_GOOD_CLASS_HERE_UNFREEZE" <<<"$out"' "$(grep -E "Error|Traceback" <<<"$out")"
cp "$STATE/ledger.bak" "$LEDGER"
echo '{"outcome":"round"}' >> "$LEDGER"
out=$(policy_proposals 2>&1); rc=$?
check "4f a round line with no message does not kill the scan" '[ "$rc" = 0 ] && ! grep -q Traceback <<<"$out" && grep -q "AUTO_GOOD_CLASS_HERE_UNFREEZE" <<<"$out"' "$(grep -E "Error|Traceback" <<<"$out")"
cp "$STATE/ledger.bak" "$LEDGER"
echo '{"outcome":"froze"}' >> "$LEDGER"
out=$(policy_proposals 2>&1); rc=$?
check "4g a froze line with no class does not kill the scan" '[ "$rc" = 0 ] && ! grep -q Traceback <<<"$out" && grep -q "AUTO_GOOD_CLASS_HERE_UNFREEZE" <<<"$out"' "$(grep -E "Error|Traceback" <<<"$out")"
# non-object JSON scalars (valid JSON, not a record)
for junk in null '[]' 42 '"str"'; do
  cp "$STATE/ledger.bak" "$LEDGER"; echo "$junk" >> "$LEDGER"
  out=$(policy_proposals 2>&1); rc=$?
  check "4h a bare JSON line '$junk' in the ledger does not kill the scan" '[ "$rc" = 0 ] && ! grep -q Traceback <<<"$out" && grep -q "AUTO_GOOD_CLASS_HERE_UNFREEZE" <<<"$out"' "$(grep -E "Error|Traceback" <<<"$out")"
done
cp "$STATE/ledger.bak" "$LEDGER"

# ── 5. numbering across policy.jsonl and policy-proposals.jsonl ──────────────────────────
reset_state
echo '{"id":"P1","rule":"AUTO_APPROVE_ADDITIVE_MIGRATIONS","evidence":"e","at":"2026-09-06 07:00","by":"Director"}' > "$POLICY_LOG"
echo '{"id":"P3","rule":"AUTO_OLD_THING_UNFREEZE","class":"old thing","shape":[["unfreeze",""]],"proposed_at":"2026-09-09 10:00"}' > "$POLICY_PROPOSALS"
soft_freeze "brand new class"; resolve "Lift?" "brand new class" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "brand new class" "Lift the stop" "$W_UNFREEZE"
out=$(policy_proposals)
check "5a policy.jsonl P1 + proposals P3 → the new rule is P4 (not P2)" 'grep -q "^  P4   AUTO_BRAND_NEW_CLASS_UNFREEZE" <<<"$out"' "$out"
reset_state
echo '{"id":"P7","rule":"AUTO_GONE_UNFREEZE","evidence":"e","at":"2026-09-06 07:00","by":"Director"}' > "$POLICY_LOG"
soft_freeze "brand new class"; resolve "Lift?" "brand new class" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "brand new class" "Lift the stop" "$W_UNFREEZE"
out=$(policy_proposals)
check "5b only policy.jsonl P7 on disk (proposals file lost) → next is P8" 'grep -q "^  P8   AUTO_BRAND_NEW" <<<"$out"' "$out"
out2=$(policy_proposals); out3=$(policy_proposals)
check "5c three more scans never renumber and append no second numbering line" \
  '[ "$out2" = "$out" ] && [ "$out3" = "$out" ] && [ "$(grep -c "\"rule\"" "$POLICY_PROPOSALS")" = 1 ]' "$(cat "$POLICY_PROPOSALS")"

# ── 6. ratify of unknown / malformed ids ─────────────────────────────────────────────────
reset_state
soft_freeze "brand new class"; resolve "Lift?" "brand new class" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "brand new class" "Lift the stop" "$W_UNFREEZE"
policy_proposals >/dev/null   # P2 now numbered
for bad in P9 P P2x "P2 " "P1?" "P02" "" "../x" "AUTO_BRAND_NEW_CLASS_UNFREEZE" "P2;touch $STATE/pwned"; do
  if policy_ratify "$bad" >/dev/null 2>&1; then flunk "6 ratify '$bad' was ACCEPTED"; fi
done
check "6a ten unknown/malformed ids all refused, no flag created, policy.jsonl untouched" \
  '[ -z "$(ls "$POLICY_DIR")" ] && [ ! -e "$STATE/pwned" ] && [ ! -s "$POLICY_LOG" ]' "$(ls "$POLICY_DIR")"
check "6b P1 while not warranted is refused (not currently proposed)" '! policy_ratify P1 >/dev/null 2>&1 && ! policy_active AUTO_APPROVE_ADDITIVE_MIGRATIONS'
policy_ratify P2 >/dev/null
check "6c ratifying P2 twice is refused the second time (already ratified → no longer proposed)" \
  '! policy_ratify P2 >/dev/null 2>&1 && [ "$(wc -l < "$POLICY_LOG" | tr -d " ")" = 1 ]' "$(cat "$POLICY_LOG")"

# ── 7. P1 re-emission: three passes → exactly one question file ──────────────────────────
reset_state
for i in 1 2 3; do ledger_record round "merged=3 held=2 low=1 normal=0 open=10"; done
policy_emit_questions >/dev/null; policy_emit_questions >/dev/null; policy_emit_questions >/dev/null
check "7a three passes → exactly one question file, and it ratifies P1" \
  '[ "$(ls "$QDIR" | wc -l | tr -d " ")" = 1 ] && grep -q "\"value\": \"P1\"" "$QDIR"/*.json' "$(ls "$QDIR"; cat "$QDIR"/*.json)"
check "7b exactly one asked_at line for P1" '[ "$(grep -c "\"asked_at\"" "$POLICY_PROPOSALS")" = 1 ]' "$(cat "$POLICY_PROPOSALS")"
# a failing desk must not count as asked
reset_state
ask_director() { return 1; }
for i in 1 2 3; do ledger_record round "merged=3 held=2 low=1 normal=0 open=10"; done
out=$(policy_emit_questions)
check "7c ask_director failing → NOT marked asked, retry announced" '! grep -qs asked_at "$POLICY_PROPOSALS" && grep -q "could not ask about P1" <<<"$out"' "$out"
ask_director() { mkdir -p "$QDIR"; printf '%s\n' "$5" > "$QDIR/q-$(printf '%s%s%s' "$1" "$2" "$3" | cksum | cut -d' ' -f1).json"; }
# a rule ratified by hand (--ratify) before the desk ran → never asked
reset_state
for i in 1 2 3; do ledger_record round "merged=3 held=2 low=1 normal=0 open=10"; done
policy_ratify P1 >/dev/null; policy_emit_questions >/dev/null
check "7d P1 ratified by hand first → no question ever written" '[ ! -d "$QDIR" ] || [ -z "$(ls "$QDIR")" ]' "$(ls "$QDIR" 2>/dev/null)"

# ── 8. rule-name collision: two classes sharing a 40-char prefix and the same shape ──
# ADJUSTED: DRY-RUN failed is a HARD class → unfreeze on it is never proposable now (see 9b in the threshold test);
# the same 40-char collision exists in a SOFT class — apply-migrations.sh:51 with two different matched paths.
reset_state
CA=$(ledger_class "migration 20260910030000: 2 files on jicate/main match (need exactly 1) supabase/migrations/a.sql")
CB=$(ledger_class "migration 20260910030000: 2 files on jicate/main match (need exactly 1) supabase/migrations/b.sql")
ledger_record froze "migration 20260910030000: 2 files on jicate/main match (need exactly 1) supabase/migrations/a.sql"
ledger_record froze "migration 20260910030000: 2 files on jicate/main match (need exactly 1) supabase/migrations/b.sql"
resolve "Lift?" "$CA" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "$CA" "Lift the stop" "$W_UNFREEZE"
resolve "Lift?" "$CB" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "$CB" "Lift the stop" "$W_UNFREEZE"
out=$(policy_proposals); policy_emit_questions >/dev/null
check "8a two DIFFERENT classes get two DIFFERENT rule names / numbers" \
  '[ "$(grep -E "^  P[0-9]+ +AUTO" <<<"$out" | awk "{print \$2}" | sort -u | wc -l | tr -d " ")" = 2 ]' "$out"
# ADJUSTED: P1 is asked once too (unwarranted here) — count the learned questions only
check "8b …and two learned questions, each ratifying its own P<n>" \
  '[ "$(grep -L "\"value\": \"P1\"" "$QDIR"/*.json | wc -l | tr -d " ")" = 2 ] && [ "$(cat "$QDIR"/*.json | grep -o "\"value\": \"P[0-9]*\"" | grep -v P1 | sort -u | wc -l | tr -d " ")" = 2 ]' "$(cat "$QDIR"/*.json)"

# ── 9. a shape that WRITES the destructive knob under a class that does not say 'destructive' ─
reset_state
resolve "Allow?" "migration VERSION statement refused in body" "Allow this one migration" "$W_ALLOW"
resolve "Allow?" "migration VERSION statement refused in body" "Allow this one migration" "$W_ALLOW"
out=$(policy_proposals)
check "9a append allow-destructive ×2 under a non-matching class → still never a rule" \
  '! grep -q "ALLOW_DESTRUCTIVE" <<<"$out"' "$out"

find "$STATE" -delete
if [ "$fail" = 0 ]; then echo "ALL PASS"; exit 0; else echo "SOME FAILED"; exit 1; fi

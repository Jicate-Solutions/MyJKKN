#!/bin/bash
# test-policy-threshold.sh — proof for HUMAN-IN-THE-LOOP.md §D (repeated decisions become rules he approves once).
# Run from the worktree root: bash scripts/ship-wave/tests/test-policy-threshold.sh
# Uses a temp $STATE and a fake ledger; ask_director is a stub that records its calls. Nothing live is touched.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE="$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-policy-test.XXXXXX")"; export STATE
LEDGER="$STATE/failure-ledger.jsonl"; export LEDGER
ASKED="$STATE/asked.tsv"
say() { printf '%s\n' "$*"; }
ask_director() { printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$5" >> "$ASKED"; }   # kind class title options-json

. "$HERE/failure-ledger.sh"
. "$HERE/policy-learning.sh"

fail=0
pass() { echo "PASS  $1"; }
flunk() { echo "FAIL  $1"; [ -n "${2:-}" ] && echo "      $2"; fail=1; }
check() { if eval "$2"; then pass "$1"; else flunk "$1" "$3"; fi; }
# empty the temp STATE between scenarios (find -delete: the temp dir itself stays, nothing outside it is touched)
reset_state() { find "$STATE" -mindepth 1 -delete; mkdir -p "$POLICY_DIR"; : > "$ASKED"; }

# a resolved record exactly as the desk writes it (class, chosen, writes)
resolve() { ledger_record resolved "$1" "$2" "$3" "$4"; }
CLS_RACE="files on jicate main match for VERSION after merge of PR"
CLS_DESTR="migration VERSION destructive statement refused delete from in body"
W_UNFREEZE='[{"op":"unfreeze"}]'
W_ALLOW='[{"op":"append","file":"allow-destructive","value":"20260906213000"},{"op":"unfreeze"}]'

# ── 0. the ledger record shape ───────────────────────────────────────────────
reset_state
resolve "Lift the stop?" "$CLS_RACE" "Lift the stop" "$W_UNFREEZE"
ledger_record froze "files on jicate/main match for 20260906213000 after merge of #3410"
ledger_record resolved "guards added: 1 after 'x'" "policy-guard"
check "resolved record stores class/chosen/writes (writes parsed as JSON)" \
  '[ "$(python3 -c "import json,sys;r=json.loads(open(sys.argv[1]).readline());print(r[\"outcome\"],r[\"class\"],r[\"chosen\"],r[\"writes\"][0][\"op\"])" "$LEDGER")" = "resolved $CLS_RACE Lift the stop unfreeze" ]' \
  "$(head -1 "$LEDGER")"
check "older callers still produce the old shape (no chosen/writes keys)" \
  '! sed -n "2,3p" "$LEDGER" | grep -Eq "\"(chosen|writes)\""' "$(sed -n 2,3p "$LEDGER")"
resolve "Lift the stop?" "$CLS_RACE" "Second one" "$W_UNFREEZE"
check "ledger_resolutions prints only that class, newest first" \
  '[ "$(ledger_resolutions "$CLS_RACE" | python3 -c "import json,sys;print([json.loads(l)[\"chosen\"] for l in sys.stdin])")" = "['"'"'Second one'"'"', '"'"'Lift the stop'"'"']" ]' \
  "$(ledger_resolutions "$CLS_RACE")"

# ── 1. one resolution → no proposal ──────────────────────────────────────────
reset_state
resolve "Lift the stop?" "$CLS_RACE" "Lift the stop" "$W_UNFREEZE"
out=$(policy_proposals)
check "one identical resolution → no learned proposal (PROPOSE_AFTER=$PROPOSE_AFTER)" \
  '! grep -q "AUTO_FILES_ON" <<<"$out"' "$out"

# ── 2. two identical resolutions → exactly one proposal ──────────────────────
resolve "Lift the stop?" "$CLS_RACE" "Lift the stop" "$W_UNFREEZE"
out=$(policy_proposals)
check "two identical resolutions → exactly one proposal" \
  '[ "$(grep -c "AUTO_FILES_ON_JICATE_MAIN_MATCH_FOR_VERSION_UNFREEZE" <<<"$out")" = 1 ]' "$out"
check "the proposal is numbered P2 (P1 stays reserved) with dated evidence" \
  'grep -q "^  P2   AUTO_FILES_ON" <<<"$out" && grep -A2 "^  P2 " <<<"$out" | grep -q "evidence: resolved 2x the same way: 20"' "$out"
# a different value, same shape, still counts as the same decision
resolve "Lift the stop?" "$CLS_RACE" "Lift the stop" '[{"op":"unfreeze","value":"anything"}]'
out=$(policy_proposals)
check "value ignored: a third resolution with a different value joins the same proposal (still one)" \
  '[ "$(grep -c "AUTO_FILES_ON" <<<"$out")" = 1 ] && grep -q "resolved 3x" <<<"$out"' "$out"

# ── 3. NEVER_RULE class with 10 identical resolutions → none, with a reason ──
for i in 1 2 3 4 5 6 7 8 9 10; do resolve "Allow this migration?" "$CLS_DESTR" "Allow this one migration" "$W_ALLOW"; done
out=$(policy_proposals)
check "destructive class ×10 → no proposal" '! grep -q "AUTO_MIGRATION_VERSION_DESTRUCTIVE" <<<"$out"' "$out"
check "…and the output says why (NEVER_RULE)" 'grep -q "skipped .*destructive.*NEVER_RULE" <<<"$out"' "$out"
check "the destructive class never entered policy-proposals.jsonl" \
  '! grep -q "DESTRUCTIVE" "$POLICY_PROPOSALS"' "$(cat "$POLICY_PROPOSALS")"

# ── 4. numbering stable across runs ──────────────────────────────────────────
first=$(policy_proposals | grep "AUTO_FILES_ON" | awk '{print $1}')
# a second learned class arrives; the first keeps its number
resolve "Approve?" "peer hold on PR by reviewer" "Approve it" '[{"op":"append","file":"approve-held","value":"3410"}]'
resolve "Approve?" "peer hold on PR by reviewer" "Approve it" '[{"op":"append","file":"approve-held","value":"3411"}]'
out=$(policy_proposals); second=$(policy_proposals | grep "AUTO_FILES_ON" | awk '{print $1}')
check "P<n> for the first proposal is the same on the next run" '[ "$first" = "P2" ] && [ "$second" = "P2" ]' "first=$first second=$second"
check "the new class gets the next free number (P3) and is APPROVE_HELD" 'grep -q "^  P3   AUTO_PEER_HOLD_ON_PR_BY_REVIEWER_APPROVE_HELD" <<<"$out"' "$out"
check "exactly one numbering line per rule in policy-proposals.jsonl" \
  '[ "$(grep -c "\"rule\"" "$POLICY_PROPOSALS")" = 2 ]' "$(cat "$POLICY_PROPOSALS")"

# ── 5. questions: emitted once, never twice ──────────────────────────────────
policy_emit_questions >/dev/null
check "policy_emit_questions asks about P2 and P3 via ask_director (kind=policy)" \
  '[ "$(grep -c "^policy	" "$ASKED")" = 2 ] && grep -q "	$CLS_RACE	" "$ASKED"' "$(cat "$ASKED")"
check "options are exactly Make this a rule → ratify P2 / Not yet → noop" \
  'grep "	$CLS_RACE	" "$ASKED" | cut -f4 | python3 -c "
import json,sys; o=json.load(sys.stdin)
assert [x[\"label\"] for x in o]==[\"Make this a rule\",\"Not yet\"], o
assert o[0][\"writes\"]==[{\"op\":\"ratify\",\"value\":\"P2\"}], o
assert o[1][\"writes\"]==[{\"op\":\"noop\"}], o"' "$(cut -f4 "$ASKED")"
check "the title is one plain line ≤110 chars" \
  '[ "$(cut -f3 "$ASKED" | awk "{ if (length(\$0) > 110) bad=1 } END { print bad+0 }")" = 0 ]' "$(cut -f3 "$ASKED")"
policy_emit_questions >/dev/null; policy_emit_questions >/dev/null
check "a second and third pass ask nothing new" '[ "$(wc -l < "$ASKED" | tr -d " ")" = 2 ]' "$(cat "$ASKED")"

# ── 6. ratify writes the flag; policy_active sees it ─────────────────────────
check "policy_active is false before ratify" '! policy_active AUTO_PEER_HOLD_ON_PR_BY_REVIEWER_APPROVE_HELD'
out=$(policy_ratify P3); rc=$?
check "policy_ratify P3 succeeds" '[ "$rc" = 0 ]' "$out"
check "the rule flag exists and policy_active sees it" \
  '[ -e "$POLICY_DIR/AUTO_PEER_HOLD_ON_PR_BY_REVIEWER_APPROVE_HELD" ] && policy_active AUTO_PEER_HOLD_ON_PR_BY_REVIEWER_APPROVE_HELD'
check "policy.jsonl holds P3 with its evidence and date" \
  'python3 -c "import json,sys;p=json.loads(open(sys.argv[1]).read().strip().splitlines()[-1]);assert p[\"id\"]==\"P3\" and \"resolved 2x\" in p[\"evidence\"] and p[\"at\"]" "$POLICY_LOG"' "$(cat "$POLICY_LOG")"
out=$(policy_proposals)
check "a ratified rule is no longer proposed; P2 keeps its number" '! grep -q "P3" <<<"$out" && grep -q "^  P2   AUTO_FILES_ON" <<<"$out"' "$out"
check "ratify of an unknown id is refused" '! policy_ratify P9 >/dev/null'

# ── 7. P1 (AUTO_APPROVE_ADDITIVE_MIGRATIONS) re-emitted as a question exactly once ──
reset_state
check "P1 not warranted → not asked" 'policy_emit_questions >/dev/null; [ ! -s "$ASKED" ]' "$(cat "$ASKED")"
for i in 1 2 3; do ledger_record round "merged=3 held=2 low=1 normal=0 open=10"; done   # held=6 ≥ 5, no migration freezes
out=$(policy_proposals)
check "P1 is proposed on throughput evidence (unchanged 2026-09-06 rule)" 'grep -q "^  P1   AUTO_APPROVE_ADDITIVE_MIGRATIONS" <<<"$out"' "$out"
policy_emit_questions >/dev/null
check "P1 is asked once (ratify P1 / noop)" \
  '[ "$(wc -l < "$ASKED" | tr -d " ")" = 1 ] && grep -q "\"value\": \"P1\"" "$ASKED"' "$(cat "$ASKED")"
policy_emit_questions >/dev/null
check "P1 is not asked twice" '[ "$(wc -l < "$ASKED" | tr -d " ")" = 1 ]' "$(cat "$ASKED")"
policy_ratify P1 >/dev/null
check "ratify P1 writes the flag as before" 'policy_active AUTO_APPROVE_ADDITIVE_MIGRATIONS'

# ── 8. ask_director absent → printed, not lost, not marked asked ─────────────
reset_state
unset -f ask_director
resolve "Lift the stop?" "$CLS_RACE" "Lift the stop" "$W_UNFREEZE"; resolve "Lift the stop?" "$CLS_RACE" "Lift the stop" "$W_UNFREEZE"
out=$(policy_emit_questions)
check "without ask_director the proposal is printed instead" 'grep -q "proposal P2 AUTO_FILES_ON.*desk not loaded" <<<"$out"' "$out"
check "…and is NOT marked asked (printing is not asking)" '! grep -q asked_at "$POLICY_PROPOSALS"' "$(cat "$POLICY_PROPOSALS")"

find "$STATE" -delete
if [ "$fail" = 0 ]; then echo "ALL PASS"; exit 0; else echo "SOME FAILED"; exit 1; fi

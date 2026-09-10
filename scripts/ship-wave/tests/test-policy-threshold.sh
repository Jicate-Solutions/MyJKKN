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
# P1 is asked once too, warranted or not (integrator 2026-09-10: "the Director asked to see it") — so 3 here
policy_emit_questions >/dev/null
check "policy_emit_questions asks about P2 and P3 via ask_director (kind=policy), plus P1 once" \
  '[ "$(grep -c "^policy	" "$ASKED")" = 3 ] && grep -q "	$CLS_RACE	" "$ASKED" && grep -q "\"value\": \"P1\"" "$ASKED"' "$(cat "$ASKED")"
check "options are exactly Make this a rule → ratify P2 / Not yet → noop" \
  'grep "	$CLS_RACE	" "$ASKED" | cut -f4 | python3 -c "
import json,sys; o=json.load(sys.stdin)
assert [x[\"label\"] for x in o]==[\"Make this a rule\",\"Not yet\"], o
assert o[0][\"writes\"]==[{\"op\":\"ratify\",\"value\":\"P2\"}], o
assert o[1][\"writes\"]==[{\"op\":\"noop\"}], o"' "$(cut -f4 "$ASKED")"
check "the title is one plain line ≤110 chars" \
  '[ "$(cut -f3 "$ASKED" | awk "{ if (length(\$0) > 110) bad=1 } END { print bad+0 }")" = 0 ]' "$(cut -f3 "$ASKED")"
policy_emit_questions >/dev/null; policy_emit_questions >/dev/null
check "a second and third pass ask nothing new" '[ "$(wc -l < "$ASKED" | tr -d " ")" = 3 ]' "$(cat "$ASKED")"

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

# ── 7. P1 (AUTO_APPROVE_ADDITIVE_MIGRATIONS) re-emitted as a question exactly once — warranted or not ──
reset_state
out=$(policy_proposals)
check "P1 not warranted → listed as P1? (ratify still needs the warrant)" 'grep -q "^  P1?  AUTO_APPROVE" <<<"$out"' "$out"
policy_emit_questions >/dev/null
check "P1 not warranted → STILL asked exactly once (the Director asked to see it), body says the wave's own bar is not met" \
  '[ "$(wc -l < "$ASKED" | tr -d " ")" = 1 ] && grep -q "\"value\": \"P1\"" "$ASKED" && grep -q "\"asked_at\"" "$POLICY_PROPOSALS"' "$(cat "$ASKED")"
check "…and ratify P1 while unwarranted is still refused" '! policy_ratify P1 >/dev/null 2>&1 && ! policy_active AUTO_APPROVE_ADDITIVE_MIGRATIONS'
for i in 1 2 3; do ledger_record round "merged=3 held=2 low=1 normal=0 open=10"; done   # held=6 ≥ 5, no migration freezes
out=$(policy_proposals)
check "P1 is proposed on throughput evidence (unchanged 2026-09-06 rule)" 'grep -q "^  P1   AUTO_APPROVE_ADDITIVE_MIGRATIONS" <<<"$out"' "$out"
policy_emit_questions >/dev/null; policy_emit_questions >/dev/null
check "P1 is not asked a second time once warranted (asked once, ever)" '[ "$(wc -l < "$ASKED" | tr -d " ")" = 1 ]' "$(cat "$ASKED")"
policy_ratify P1 >/dev/null
check "ratify P1 writes the flag as before" 'policy_active AUTO_APPROVE_ADDITIVE_MIGRATIONS'
# fresh state, warranted from the start: still exactly one question
reset_state
for i in 1 2 3; do ledger_record round "merged=3 held=2 low=1 normal=0 open=10"; done
policy_emit_questions >/dev/null; policy_emit_questions >/dev/null
check "P1 warranted from the start → asked once (ratify P1 / noop)" \
  '[ "$(wc -l < "$ASKED" | tr -d " ")" = 1 ] && grep -q "\"value\": \"P1\"" "$ASKED"' "$(cat "$ASKED")"

# ── 8. ask_director absent → printed, not lost, not marked asked ─────────────
reset_state
unset -f ask_director
resolve "Lift the stop?" "$CLS_RACE" "Lift the stop" "$W_UNFREEZE"; resolve "Lift the stop?" "$CLS_RACE" "Lift the stop" "$W_UNFREEZE"
out=$(policy_emit_questions)
check "without ask_director the proposal is printed instead" 'grep -q "proposal P2 AUTO_FILES_ON.*desk not loaded" <<<"$out"' "$out"
check "…and is NOT marked asked (printing is not asking)" '! grep -q asked_at "$POLICY_PROPOSALS"' "$(cat "$POLICY_PROPOSALS")"


# ═══ regression tests for the adversarial verifier's breaks (2026-09-10), named after the break ids ═══
ask_director() { printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$5" >> "$ASKED"; }   # the desk stub is back (section 8 removed it)

# ── BREAK 9a: NEVER_RULE applies to the ACTION — a shape that writes allow-destructive is never a rule ──
reset_state
CLS_QUIET="migration VERSION statement refused in body"   # no NEVER_RULE keyword in the text
resolve "Allow?" "$CLS_QUIET" "Allow this one migration" '[{"op":"append","file":"allow-destructive","value":"20260906213000"}]'
resolve "Allow?" "$CLS_QUIET" "Allow this one migration" '[{"op":"append","file":"allow-destructive","value":"20260906213000"}]'
out=$(policy_proposals)
check "9a append allow-destructive ×2 under a class with no keyword → NO proposal" \
  '! grep -Eq "^  P[0-9]+ +AUTO" <<<"$out" && ! grep -q "ALLOW_DESTRUCTIVE" <<<"$out"' "$out"
check "9a …and a printed reason names the file and the Director" \
  'grep -q "skipped migration VERSION statement refused.*would write allow-destructive.*never become a rule.*Director" <<<"$out"' "$out"
check "9a nothing numbered in policy-proposals.jsonl, nothing asked" \
  '! grep -qs "\"rule\"" "$POLICY_PROPOSALS" && policy_emit_questions >/dev/null && ! grep -q "$CLS_QUIET" "$ASKED"' "$(cat "$POLICY_PROPOSALS" 2>/dev/null)"
# same shape mixed with an unfreeze (the real "Allow this one migration" option) → still never
resolve "Allow?" "$CLS_QUIET" "Allow this one migration" "$W_ALLOW"; resolve "Allow?" "$CLS_QUIET" "Allow this one migration" "$W_ALLOW"
out=$(policy_proposals)
check "9a append allow-destructive + unfreeze ×2 → still no proposal" '! grep -Eq "^  P[0-9]+ +AUTO" <<<"$out"' "$out"

# ── BREAK 9b: unfreeze on a HARD class (DRY-RUN failed / GATE ERROR / migration gap — not in NEVER_RULE's text) ──
reset_state
for m in "migration 20260910030000: DRY-RUN failed — ERROR: relation public.foo does not exist (SQLSTATE 42P01)" \
         "migration 20260910030000: GATE ERROR — history query returned nothing" \
         "migration gap: 3 versions on main are missing from prod history"; do
  c=$(ledger_class "$m"); resolve "Lift?" "$c" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "$c" "Lift the stop" "$W_UNFREEZE"
done
out=$(policy_proposals)
check "9b unfreeze ×2 on dry-run-failed / gate-error / migration-gap → no proposal, three printed reasons" \
  '! grep -Eq "^  P[0-9]+ +AUTO" <<<"$out" && [ "$(grep -c "would lift a HARD stop" <<<"$out")" = 3 ]' "$out"
# the soft classes keep learning: a ref race resolved by unfreeze is proposable
resolve "Lift?" "$CLS_RACE" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "$CLS_RACE" "Lift the stop" "$W_UNFREEZE"
out=$(policy_proposals)
check "9b …while unfreeze on a SOFT class (ref race) is still proposed" 'grep -q "^  P2   AUTO_FILES_ON_JICATE_MAIN_MATCH_FOR_VERSION_UNFREEZE" <<<"$out"' "$out"

# ── BREAK 8a/8b: two classes sharing the first 40 chars must never share a P<n> ──
reset_state
CA=$(ledger_class "migration 20260910030000: 2 files on jicate/main match (need exactly 1) supabase/migrations/a.sql")
CB=$(ledger_class "migration 20260910030000: 2 files on jicate/main match (need exactly 1) supabase/migrations/b.sql")
check "8 fixture: two REAL ledger_class outputs, different, same 40-char rule prefix" \
  '[ "$CA" != "$CB" ] && [ "$(cut -c1-40 <<<"$CA")" = "$(cut -c1-40 <<<"$CB")" ]' "$CA / $CB"
resolve "Lift?" "$CA" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "$CA" "Lift the stop" "$W_UNFREEZE"
resolve "Lift?" "$CB" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "$CB" "Lift the stop" "$W_UNFREEZE"
out=$(policy_proposals)
check "8a two different classes → two P<n> (P2, P3) with two different rule names" \
  '[ "$(grep -E "^  P[0-9]+ +AUTO" <<<"$out" | awk "{print \$1}" | sort -u | wc -l | tr -d " ")" = 2 ] && [ "$(grep -E "^  P[0-9]+ +AUTO" <<<"$out" | awk "{print \$2}" | sort -u | wc -l | tr -d " ")" = 2 ]' "$out"
check "8a each numbering line carries a 40-hex sha1 key and the FULL class; the two keys differ" \
  'python3 -c "
import json,sys,hashlib
ps=[json.loads(l) for l in open(sys.argv[1]) if \"rule\" in l]
assert len(ps)==2, ps
assert {p[\"class\"] for p in ps}=={sys.argv[2],sys.argv[3]}, ps
assert all(len(p[\"key\"])==40 for p in ps) and ps[0][\"key\"]!=ps[1][\"key\"], ps
for p in ps: assert p[\"key\"]==hashlib.sha1(json.dumps([p[\"class\"],p[\"shape\"]]).encode()).hexdigest(), p" "$POLICY_PROPOSALS" "$CA" "$CB"' "$(cat "$POLICY_PROPOSALS")"
policy_emit_questions >/dev/null
check "8b two questions, each ratifying its own P<n>" \
  '[ "$(grep -c -e "	$CA	" -e "	$CB	" "$ASKED")" = 2 ] && [ "$(grep -o "\"value\": \"P[23]\"" "$ASKED" | sort -u | wc -l | tr -d " ")" = 2 ]' "$(cat "$ASKED")"
policy_ratify P2 >/dev/null
out=$(policy_proposals)
check "8b ratifying P2 leaves P3 proposed (one tap = one decision) and policy.jsonl records P2's key" \
  '! grep -q "^  P2 " <<<"$out" && grep -q "^  P3 " <<<"$out" && grep -q "\"key\"" "$POLICY_LOG" && [ "$(ls "$POLICY_DIR" | wc -l | tr -d " ")" = 1 ]' "$out"
check "8b P<n> is stable: a rescan renumbers nothing and appends no new numbering line" \
  '[ "$(policy_proposals)" = "$out" ] && [ "$(grep -c "\"rule\"" "$POLICY_PROPOSALS")" = 2 ]' "$(cat "$POLICY_PROPOSALS")"

# ── BREAK 4c: a writes item with no op is malformed — warned, never a proposal ──
reset_state
echo '{"at":"2026-09-10 01:00:00","outcome":"resolved","class":"op missing","message":"x","writes":[{"file":"approve-held"}]}' >> "$LEDGER"
echo '{"at":"2026-09-10 01:01:00","outcome":"resolved","class":"op missing","message":"x","writes":[{"file":"approve-held"}]}' >> "$LEDGER"
echo '{"at":"2026-09-10 01:02:00","outcome":"resolved","class":"bad op","message":"x","writes":[{"op":"merge"}]}' >> "$LEDGER"
echo '{"at":"2026-09-10 01:02:00","outcome":"resolved","class":"bad op","message":"x","writes":[{"op":"merge"}]}' >> "$LEDGER"
echo '{"at":"2026-09-10 01:03:00","outcome":"resolved","class":"append no file","message":"x","writes":[{"op":"append","value":"3410"}]}' >> "$LEDGER"
echo '{"at":"2026-09-10 01:03:00","outcome":"resolved","class":"append no file","message":"x","writes":[{"op":"append","value":"3410"}]}' >> "$LEDGER"
out=$(policy_proposals 2>&1); rc=$?
check "4c op-missing / unknown op / append-without-file ×2 each → no proposal, rc=0" \
  '[ "$rc" = 0 ] && ! grep -Eq "^  P[0-9]+ +AUTO" <<<"$out" && ! grep -Eq "AUTO_(OP|BAD|APPEND)" <<<"$out"' "$out"
check "4c one warning per malformed line (6), each naming the line and the reason" \
  '[ "$(grep -c "^proposals: warning — ledger line [0-9]* skipped" <<<"$out")" = 6 ] && grep -q "line 1 skipped (resolved writes malformed: writes item without op)" <<<"$out" && grep -q "unknown op .merge" <<<"$out" && grep -q "append without file" <<<"$out"' "$out"

# ── BREAK 4e/4f/4g/4h: one malformed line never kills the scan; the genuine proposal still prints ──
reset_state
resolve "Lift?" "good class here" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "good class here" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "good class here" "Lift the stop" "$W_UNFREEZE"
cp "$LEDGER" "$STATE/ledger.bak"
for junk in '{"outcome":"resolved","message":"no class key","writes":[{"op":"unfreeze"}]}' \
            '{"outcome":"round"}' '{"outcome":"froze"}' 'null' '[]' '42' '"str"' '{not json' \
            '{"outcome":"resolved","class":"writes is a string","message":"x","writes":"[{\"op\":\"unfreeze\"}]"}' \
            '{"outcome":"resolved","class":"writes is a dict","message":"x","writes":{"op":"unfreeze"}}' \
            '{"outcome":"resolved","class":"","message":"x","writes":[{"op":"unfreeze"}]}'; do
  cp "$STATE/ledger.bak" "$LEDGER"; echo "$junk" >> "$LEDGER"
  out=$(policy_proposals 2>&1); rc=$?
  check "4e-4h junk line $(cut -c1-45 <<<"$junk") → rc=0, no Traceback, ONE warning for line 4, genuine 3x proposal still printed" \
    '[ "$rc" = 0 ] && ! grep -q Traceback <<<"$out" && [ "$(grep -c "^proposals: warning" <<<"$out")" = 1 ] && grep -q "ledger line 4 skipped" <<<"$out" && grep -q "^  P2   AUTO_GOOD_CLASS_HERE_UNFREEZE" <<<"$out" && grep -q "resolved 3x" <<<"$out"' "$out"
done
cp "$STATE/ledger.bak" "$LEDGER"
echo '{"outcome":"resolved","message":"no class key","writes":[{"op":"unfreeze"}]}' >> "$LEDGER"
policy_emit_questions >/dev/null 2>&1
check "4e with a malformed line present, the genuine proposal is still ASKED and ratifiable" \
  'grep -q "\"value\": \"P2\"" "$ASKED" && policy_ratify P2 >/dev/null && policy_active AUTO_GOOD_CLASS_HERE_UNFREEZE' "$(cat "$ASKED"; policy_proposals)"
# old-shape lines are not malformed: a 3-arg resolved (guards) and an 'unblocked' outcome draw no warning
reset_state
ledger_record resolved "guards added: 1 after 'x'" "policy-guard"
echo '{"at":"2026-09-10 01:00:00","outcome":"unblocked","class":"lane","message":"x"}' >> "$LEDGER"
echo '' >> "$LEDGER"
out=$(policy_proposals 2>&1)
check "4x the old three-arg resolved shape, other outcomes and blank lines are NOT warned about" '! grep -q "warning" <<<"$out"' "$out"

# ── noop-only shapes are never proposed (kept from slice D) ──
reset_state
for i in 1 2 3; do resolve "Lift?" "stale ref after merge" "Keep it stopped" '[{"op":"noop"}]'; done
for i in 1 2; do resolve "Lift?" "empty writes class" "Whatever" '[]'; done
out=$(policy_proposals)
check "noop ×3 and writes=[] ×2 → no proposal, the noop skip says so, nothing numbered" \
  '! grep -Eq "^  P[0-9]+ +AUTO" <<<"$out" && grep -q "skipped stale ref after merge.*noop.*nothing to automate" <<<"$out" && ! grep -qs "\"rule\"" "$POLICY_PROPOSALS"' "$out"

# ── titles and bodies for the Director: plain English, no slug / SQL / regex / path in the title ──
reset_state
CLS_SLUG="migration version n files on jicate main match need exactly n supabase migrations a sql"
resolve "Lift the stop?" "$CLS_SLUG" "Lift the stop" "$W_UNFREEZE"; resolve "Lift the stop?" "$CLS_SLUG" "Lift the stop" "$W_UNFREEZE"
resolve "Approve?" "peer hold on PR by reviewer" "Approve it" '[{"op":"append","file":"approve-held","value":"3410"}]'
resolve "Approve?" "peer hold on PR by reviewer" "Approve it" '[{"op":"append","file":"approve-held","value":"3411"}]'
ask_director() { printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" "$5" >> "$ASKED"; }   # keep the body this time
policy_emit_questions >/dev/null
t_slug=$(grep "	$CLS_SLUG	" "$ASKED" | cut -f3); b_slug=$(grep "	$CLS_SLUG	" "$ASKED" | cut -f4)
t_hold=$(grep "	peer hold on PR by reviewer	" "$ASKED" | cut -f3); b_hold=$(grep "	peer hold on PR by reviewer	" "$ASKED" | cut -f4)
check "title follows the template: You've answered the same way N times — make it a rule?" \
  '[ "$t_slug" = "You'"'"'ve answered the same way 2 times — make it a rule?" ] && [ "$t_hold" = "$t_slug" ]' "$t_slug / $t_hold"
check "title carries no ledger slug, no path, no SQL, no regex" \
  '! grep -Eqi "jicate|supabase|sql|migration|/|\\||\[|AUTO_|select|drop" <<<"$t_slug"' "$t_slug"
check "body (known remedy): what the stop was from ledger_remedy's first sentence, what he chose, what the rule would do" \
  'grep -q "The wave stopped 2 times on the same thing. What we know about it: fetch jicate/main before resolving the file. Each time you chose '"'"'Lift the stop'"'"' (20" <<<"$b_slug" && grep -q "the wave will lift the stop itself from now on" <<<"$b_slug" && grep -q "Nothing that deletes or drops data can ever become a rule" <<<"$b_slug"' "$b_slug"
check "body (no remedy on record): falls back to the class, action in plain words" \
  'grep -q "The stop was: peer hold on PR by reviewer\." <<<"$b_hold" && grep -q "you chose '"'"'Approve it'"'"'" <<<"$b_hold" && grep -q "the wave will approve the held PR itself" <<<"$b_hold"' "$b_hold"
check "the --policy list still shows the rule slug for the terminal reader" 'policy_proposals | grep -q "AUTO_PEER_HOLD_ON_PR_BY_REVIEWER_APPROVE_HELD"'

find "$STATE" -delete
if [ "$fail" = 0 ]; then echo "ALL PASS"; exit 0; else echo "SOME FAILED"; exit 1; fi

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
check() { if eval "$2"; then pass "$1"; else flunk "$1" "${3:-}"; fi; }   # ${3:-}: a failing two-arg check must report FAIL, not abort under set -u
# empty the temp STATE between scenarios (find -delete: the temp dir itself stays, nothing outside it is touched)
reset_state() { find "$STATE" -mindepth 1 -delete; mkdir -p "$POLICY_DIR"; : > "$ASKED"; }

# a resolved record exactly as the desk writes it (class, chosen, writes)
resolve() { ledger_record resolved "$1" "$2" "$3" "$4"; }
# Every freeze the Director decided has a `froze` line first (freeze() → ledger_on_freeze, raw message) and
# classify_freeze judges THAT text — an unfreeze on a class with no froze line, or on a hard one, is never a rule
# (spec amendment, verifier NEW-9). Fixtures that only name a class register one SOFT freeze under it.
soft_freeze() { ledger_record froze "peer hold on #3410 by reviewer (fixture: $1)" "$1"; }
RAW_RACE="files on jicate/main match for 20260906213000 after merge of #3410"   # ledger_class → CLS_RACE (soft row)
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
ledger_record froze "$RAW_RACE"
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
  '[ "$(grep -c "^policy	" "$ASKED")" = 3 ] && grep -q "	Rule P2: " "$ASKED" && grep -q "	Rule P3: " "$ASKED" && grep -q "\"value\": \"P1\"" "$ASKED"' "$(cat "$ASKED")"
check "options are exactly Make this a rule → ratify P2 / Not yet → noop" \
  'grep "	Rule P2: " "$ASKED" | cut -f4 | python3 -c "
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
ledger_record froze "$RAW_RACE"
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
ledger_record froze "$RAW_RACE"
resolve "Lift?" "$CLS_RACE" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "$CLS_RACE" "Lift the stop" "$W_UNFREEZE"
out=$(policy_proposals)
check "9b …while unfreeze on a SOFT class (ref race) is still proposed" 'grep -q "^  P2   AUTO_FILES_ON_JICATE_MAIN_MATCH_FOR_VERSION_UNFREEZE" <<<"$out"' "$out"

# ── BREAK 8a/8b: two classes sharing the first 40 chars must never share a P<n> ──
reset_state
CA=$(ledger_class "migration 20260910030000: 2 files on jicate/main match (need exactly 1) supabase/migrations/a.sql")
CB=$(ledger_class "migration 20260910030000: 2 files on jicate/main match (need exactly 1) supabase/migrations/b.sql")
check "8 fixture: two REAL ledger_class outputs, different, same 40-char rule prefix" \
  '[ "$CA" != "$CB" ] && [ "$(cut -c1-40 <<<"$CA")" = "$(cut -c1-40 <<<"$CB")" ]' "$CA / $CB"
ledger_record froze "migration 20260910030000: 2 files on jicate/main match (need exactly 1) supabase/migrations/a.sql"
ledger_record froze "migration 20260910030000: 2 files on jicate/main match (need exactly 1) supabase/migrations/b.sql"
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
  '[ "$(grep -c -e "	Rule P2: " -e "	Rule P3: " "$ASKED")" = 2 ] && [ "$(grep -o "\"value\": \"P[23]\"" "$ASKED" | sort -u | wc -l | tr -d " ")" = 2 ]' "$(cat "$ASKED")"
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
soft_freeze "good class here"
resolve "Lift?" "good class here" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "good class here" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "good class here" "Lift the stop" "$W_UNFREEZE"
cp "$LEDGER" "$STATE/ledger.bak"
for junk in '{"outcome":"resolved","message":"no class key","writes":[{"op":"unfreeze"}]}' \
            '{"outcome":"round"}' '{"outcome":"froze"}' 'null' '[]' '42' '"str"' '{not json' \
            '{"outcome":"resolved","class":"writes is a string","message":"x","writes":"[{\"op\":\"unfreeze\"}]"}' \
            '{"outcome":"resolved","class":"writes is a dict","message":"x","writes":{"op":"unfreeze"}}' \
            '{"outcome":"resolved","class":"","message":"x","writes":[{"op":"unfreeze"}]}'; do
  cp "$STATE/ledger.bak" "$LEDGER"; echo "$junk" >> "$LEDGER"
  out=$(policy_proposals 2>&1); rc=$?
  check "4e-4h junk line $(cut -c1-45 <<<"$junk") → rc=0, no Traceback, ONE warning for line 5, genuine 3x proposal still printed" \
    '[ "$rc" = 0 ] && ! grep -q Traceback <<<"$out" && [ "$(grep -c "^proposals: warning" <<<"$out")" = 1 ] && grep -q "ledger line 5 skipped" <<<"$out" && grep -q "^  P2   AUTO_GOOD_CLASS_HERE_UNFREEZE" <<<"$out" && grep -q "resolved 3x" <<<"$out"' "$out"
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
ledger_record froze "migration 20260910030000: 2 files on jicate/main match (need exactly 1) supabase/migrations/a.sql"   # ledger_class → CLS_SLUG
resolve "Lift the stop?" "$CLS_SLUG" "Lift the stop" "$W_UNFREEZE"; resolve "Lift the stop?" "$CLS_SLUG" "Lift the stop" "$W_UNFREEZE"
resolve "Approve?" "peer hold on PR by reviewer" "Approve it" '[{"op":"append","file":"approve-held","value":"3410"}]'
resolve "Approve?" "peer hold on PR by reviewer" "Approve it" '[{"op":"append","file":"approve-held","value":"3411"}]'
ask_director() { printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" "$5" >> "$ASKED"; }   # keep the body this time
policy_emit_questions >/dev/null
# groups are scanned in class order: "migration …" is P2, "peer hold …" is P3; the ASKED class column is the proposal key
t_slug=$(grep "	Rule P2: " "$ASKED" | cut -f3); b_slug=$(grep "	Rule P2: " "$ASKED" | cut -f4)
t_hold=$(grep "	Rule P3: " "$ASKED" | cut -f3); b_hold=$(grep "	Rule P3: " "$ASKED" | cut -f4)
check "title follows the amended template: Rule P<n>: you've answered the same way N times — make it a rule? (unique per proposal)" \
  '[ "$t_slug" = "Rule P2: you'"'"'ve answered the same way 2 times — make it a rule?" ] && [ "$t_hold" = "Rule P3: you'"'"'ve answered the same way 2 times — make it a rule?" ]' "$t_slug / $t_hold"
check "title carries no ledger slug, no path, no SQL, no regex" \
  '! grep -Eqi "jicate|supabase|sql|migration|/|\\||\[|AUTO_|select|drop" <<<"$t_slug"' "$t_slug"
check "body (known remedy): what the stop was from ledger_remedy's first sentence, what he chose, what the rule would do" \
  'grep -q "The wave stopped 2 times on the same thing. What we know about it: fetch jicate/main before resolving the file. Each time you chose '"'"'Lift the stop'"'"' (20" <<<"$b_slug" && grep -q "the wave will lift the stop itself from now on" <<<"$b_slug" && grep -q "Nothing that deletes or drops data can ever become a rule" <<<"$b_slug"' "$b_slug"
check "body (no remedy on record): falls back to the class, action in plain words" \
  'grep -q "The stop was: peer hold on PR by reviewer\." <<<"$b_hold" && grep -q "you chose '"'"'Approve it'"'"'" <<<"$b_hold" && grep -q "the wave will approve the held PR itself" <<<"$b_hold"' "$b_hold"
check "the --policy list still shows the rule slug for the terminal reader" 'policy_proposals | grep -q "AUTO_PEER_HOLD_ON_PR_BY_REVIEWER_APPROVE_HELD"'

# ═══ regression tests for the SECOND adversarial pass (verifier 2026-09-10, hitl-fix.json §D new_breaks) ═══
# Each fails on c032cfa10b and passes after the fix; named after the break. Rules from the spec's "Amendments
# from the build": knob names compared lowercased/trimmed, one shared hard-class table, unique titles + key class.
ask_director() { printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$5" >> "$ASKED"; }
CLS_QUIET="migration VERSION statement refused in body"

# ── NEW-2: allow-destructive in any spelling/case/whitespace is the same file on APFS — never a rule ──
for f in 'Allow-Destructive' 'ALLOW-DESTRUCTIVE' 'allow-destructive ' ' Allow-destructive'; do
  reset_state
  resolve "Allow?" "$CLS_QUIET" "Allow this one migration" "[{\"op\":\"append\",\"file\":\"$f\",\"value\":\"20260906213000\"}]"
  resolve "Allow?" "$CLS_QUIET" "Allow this one migration" "[{\"op\":\"append\",\"file\":\"$f\",\"value\":\"20260906213000\"}]"
  out=$(policy_proposals); policy_emit_questions >/dev/null
  check "NEW-2 append '$f' ×2 → no proposal, the skip names allow-destructive, nothing numbered, nothing asked" \
    '! grep -Eq "^  P[0-9]+ +AUTO" <<<"$out" && grep -q "would write allow-destructive" <<<"$out" && ! grep -qs "\"rule\"" "$POLICY_PROPOSALS" && ! grep -q "Rule P" "$ASKED"' "$out"
done
for f in './allow-destructive' 'allow_destructive' '/allow-destructive' 'allow-destructive/'; do
  reset_state
  resolve "Allow?" "$CLS_QUIET" "Allow this one migration" "[{\"op\":\"append\",\"file\":\"$f\",\"value\":\"20260906213000\"}]"
  resolve "Allow?" "$CLS_QUIET" "Allow this one migration" "[{\"op\":\"append\",\"file\":\"$f\",\"value\":\"20260906213000\"}]"
  out=$(policy_proposals)
  check "NEW-2 append '$f' ×2 → not a knob: warned once per line, never a proposal" \
    '! grep -Eq "^  P[0-9]+ +AUTO" <<<"$out" && [ "$(grep -c "is not a knob" <<<"$out")" = 2 ] && ! grep -qs "\"rule\"" "$POLICY_PROPOSALS"' "$out"
done

# ── NEW-3: append.file must be exactly one of the three §A1 knobs — anything else is malformed ──
for f in 'frozen' '../frozen' 'policy/AUTO_APPROVE_ADDITIVE_MIGRATIONS' 'last-deployed' 'approve-held/../frozen' 'questions'; do
  reset_state
  resolve "Q?" "peer hold on PR by reviewer" "Do it" "[{\"op\":\"append\",\"file\":\"$f\",\"value\":\"x\"}]"
  resolve "Q?" "peer hold on PR by reviewer" "Do it" "[{\"op\":\"append\",\"file\":\"$f\",\"value\":\"x\"}]"
  out=$(policy_proposals); policy_emit_questions >/dev/null
  check "NEW-3 append to '$f' ×2 → warned (not a knob, the three knobs named), no proposal, nothing numbered or asked" \
    '! grep -Eq "^  P[0-9]+ +AUTO" <<<"$out" && grep -q "proposals: warning — ledger line 1 skipped (resolved writes malformed: append to .* is not a knob (advisory-checks | allow-destructive | approve-held))" <<<"$out" && ! grep -qs "\"rule\"" "$POLICY_PROPOSALS" && ! grep -q "Rule P" "$ASKED"' "$out"
done
# the two learnable knobs still learn, in any case/whitespace, and the stored shape is the normalised knob name
reset_state
resolve "Approve?" "peer hold on PR by reviewer" "Approve it" '[{"op":"append","file":"Approve-Held","value":"3410"}]'
resolve "Approve?" "peer hold on PR by reviewer" "Approve it" '[{"op":"append","file":" approve-held ","value":"3411"}]'
resolve "Advice?" "advisory check red on PR sdk review" "Treat as advice" '[{"op":"append","file":"ADVISORY-CHECKS","value":"SDK review"}]'
resolve "Advice?" "advisory check red on PR sdk review" "Treat as advice" '[{"op":"append","file":"advisory-checks","value":"SDK review"}]'
out=$(policy_proposals)
check "NEW-3 Approve-Held / ' approve-held ' / ADVISORY-CHECKS ×2 → two proposals with the normalised knob in name and stored shape" \
  'grep -q "AUTO_PEER_HOLD_ON_PR_BY_REVIEWER_APPROVE_HELD" <<<"$out" && grep -q "AUTO_ADVISORY_CHECK_RED_ON_PR_SDK_REVIEW_ADVISORY_CHECKS" <<<"$out" && ! grep -q "warning" <<<"$out" && [ "$(grep -o "\[\"append\", \"[a-z-]*\"\]" "$POLICY_PROPOSALS" | sort -u | tr "\n" " ")" = "[\"append\", \"advisory-checks\"] [\"append\", \"approve-held\"] " ]' "$out $(cat "$POLICY_PROPOSALS")"

# ── NEW-9: ONE hard/soft table — freeze-classes.sh — shared with ship-wave.sh; no HARD_CLASS copy here ──
check "NEW-9 classify_freeze is loaded from freeze-classes.sh (the shared file) and policy-learning.sh keeps no HARD_CLASS list" \
  '[ "$(type -t classify_freeze)" = function ] && [ -f "$HERE/freeze-classes.sh" ] && grep -q "^classify_freeze()" "$HERE/freeze-classes.sh" && ! grep -q "^HARD_CLASS=" "$HERE/policy-learning.sh" && grep -q "freeze-classes.sh" "$HERE/policy-learning.sh"' "$(type -t classify_freeze)"
check "NEW-9 the table answers as B's does: hard rows hard, soft rows soft, unknown → hard with rc=1" \
  '[ "$(classify_freeze "broken page after deploy: 3 page×role load(s) returned 5xx")" = hard ] && [ "$(classify_freeze "deploy dpl_x → CANCELED; on main but NOT live: #3410")" = hard ] && [ "$(classify_freeze "peer hold on #3410 by reviewer")" = soft ] && [ "$(classify_freeze "files on jicate/main match for 20260906213000")" = soft ] && ! classify_freeze "some brand new freeze nobody has classified yet" >/dev/null && [ "$(classify_freeze "some brand new freeze nobody has classified yet")" = hard ]'
# (a) the production path: freeze() records the raw message on a froze line, the desk records the answer under its class
HARD_MSGS='broken page after deploy: 3 page×role load(s) returned 5xx (see run/l1.txt); on main: #3410
migration 20260906213000: APPLIED but the history insert failed — ERROR: duplicate key (record it by hand, then --unfreeze)
migration 20260906213000: applied + recorded, but the verify read did not find it
deploy dpl_abc123 → CANCELED; on main but NOT live: #3410
migration 20260906213000: cannot read supabase/migrations/x.sql from jicate/main
migration gate: the history query failed — HTTP 500
baseline bounce after deploy — these loaded 200 before and now bounce to /auth/login: /admin/x; on main: #3410
post-deploy sweep failed — L2: /x L1: none · likely PRs: 3410
gh not authenticated after 3 tries
some brand new freeze nobody has classified yet'
reset_state; n=0
while IFS= read -r m; do
  ledger_record froze "$m"; c=$(ledger_class "$m"); n=$((n+1))
  resolve "Lift the stop?" "$c" "Lift the stop" "$W_UNFREEZE"; resolve "Lift the stop?" "$c" "Lift the stop" "$W_UNFREEZE"
done <<<"$HARD_MSGS"
out=$(policy_proposals); policy_emit_questions >/dev/null
check "NEW-9 (a) unfreeze ×2 on each of $n B-hard freezes (froze line + desk answers) → $n refusals naming classify_freeze, no proposal, nothing asked" \
  '! grep -Eq "^  P[0-9]+ +AUTO" <<<"$out" && [ "$(grep -c "would lift a HARD stop (classify_freeze says HARD\|would lift a HARD stop (its freeze message matched no row" <<<"$out")" = "$n" ] && ! grep -qs "\"rule\"" "$POLICY_PROPOSALS" && ! grep -q "Rule P" "$ASKED"' "$out"
# (b) the same classes with NO froze line on record (hand-edited ledger): judged from the slug, unknown → hard
reset_state
while IFS= read -r m; do
  c=$(ledger_class "$m"); resolve "Lift the stop?" "$c" "Lift the stop" "$W_UNFREEZE"; resolve "Lift the stop?" "$c" "Lift the stop" "$W_UNFREEZE"
done <<<"$HARD_MSGS"
out=$(policy_proposals)
check "NEW-9 (b) the same $n classes with no froze line → still $n refusals (slug judged case-insensitively; no row → HARD, fail safe)" \
  '! grep -Eq "^  P[0-9]+ +AUTO" <<<"$out" && [ "$(grep -c "would lift a HARD stop" <<<"$out")" = "$n" ]' "$out"
# (c) soft rows keep learning — every soft row of the table, through the production path
reset_state; n=0
while IFS= read -r m; do
  ledger_record froze "$m"; c=$(ledger_class "$m"); n=$((n+1))
  resolve "Lift the stop?" "$c" "Lift the stop" "$W_UNFREEZE"; resolve "Lift the stop?" "$c" "Lift the stop" "$W_UNFREEZE"
done <<'MSGS'
peer hold on #3410 by reviewer
Director hold on #3411: wait for the demo
files on jicate/main match for 20260906213000 after merge of #3410
advisory check red on #3412: SDK multi-agent review
UNRESOLVABLE conflict in #3413 after 3 rebases
MSGS
out=$(policy_proposals)
check "NEW-9 (c) unfreeze ×2 on each of $n SOFT freezes → $n proposals, no HARD refusal" \
  '[ "$(grep -Ec "^  P[0-9]+ +AUTO" <<<"$out")" = "$n" ] && ! grep -q "HARD stop" <<<"$out"' "$out"
# (d) the desk cuts a question's class at 80 chars, ledger_class at 90: the resolved class is a PREFIX of the froze class
reset_state
M90="broken page after deploy: 3 page×role load(s) returned 5xx (see run/l1.txt); on main: #3410 #3411 #3412 #3413"
C90=$(ledger_class "$M90"); C80="${C90:0:80}"
ledger_record froze "$M90"
resolve "Lift the stop?" "$C80" "Lift the stop" "$W_UNFREEZE"; resolve "Lift the stop?" "$C80" "Lift the stop" "$W_UNFREEZE"
out=$(policy_proposals)
check "NEW-9 (d) a resolved class truncated to 80 by the desk still finds its 90-char froze line → HARD, refused" \
  '[ "${#C90}" -gt 80 ] && ! grep -Eq "^  P[0-9]+ +AUTO" <<<"$out" && grep -q "would lift a HARD stop (classify_freeze says HARD" <<<"$out"' "${#C90} / $out"
# (e) a mixed history: one soft freeze and one hard freeze recorded under the same class → hard wins
reset_state
ledger_record froze "peer hold on #3410 by reviewer" "mixed class"
ledger_record froze "deploy dpl_x → ERROR; on main but NOT live: #3410" "mixed class"
resolve "Lift?" "mixed class" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "mixed class" "Lift the stop" "$W_UNFREEZE"
out=$(policy_proposals)
check "NEW-9 (e) a class with one soft and one hard froze message → refused (any hard verdict wins)" \
  '! grep -Eq "^  P[0-9]+ +AUTO" <<<"$out" && grep -q "would lift a HARD stop" <<<"$out"' "$out"

# ── NEW-10: two proposals of ONE freeze class must be two questions under the desk's kind+class+title de-dup ──
reset_state; QDIR="$STATE/questions"; mkdir -p "$QDIR"
# a desk-faithful stub: one file per (kind, class, title); a second call with the same three only "refreshes"
ask_director() { local k; k=$(printf '%s%s%s' "$1" "$2" "$3" | cksum | cut -d' ' -f1); printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$5" >> "$ASKED"
                 if [ -e "$QDIR/q-$k.json" ]; then echo "  desk: question already open, refreshed — q-$k"; else printf '%s\n' "$5" > "$QDIR/q-$k.json"; fi; }
CLS_ADV="advisory check red on PR sdk multi agent review"
ledger_record froze "advisory check red on #3412: SDK multi-agent review" "$CLS_ADV"
resolve "Lift?" "$CLS_ADV" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "$CLS_ADV" "Lift the stop" "$W_UNFREEZE"
resolve "Advice?" "$CLS_ADV" "Treat as advice" '[{"op":"append","file":"advisory-checks","value":"SDK multi-agent review"}]'
resolve "Advice?" "$CLS_ADV" "Treat as advice" '[{"op":"append","file":"advisory-checks","value":"SDK multi-agent review"}]'
out=$(policy_proposals)
check "NEW-10 fixture: one class, two shapes → P2 and P3 both proposed" \
  'grep -q "^  P2   AUTO_ADVISORY_CHECK_RED_ON_PR_SDK_MULTI_AGENT_ADVISORY_CHECKS" <<<"$out" && grep -q "^  P3   AUTO_ADVISORY_CHECK_RED_ON_PR_SDK_MULTI_AGENT_UNFREEZE" <<<"$out"' "$out"
emit=$(policy_emit_questions)
check "NEW-10 three question FILES (P1, P2, P3) — no proposal collapsed into another's question" \
  '[ "$(ls "$QDIR" | wc -l | tr -d " ")" = 3 ] && [ "$(cat "$QDIR"/*.json | grep -o "\"value\": \"P[0-9]*\"" | sort -u | wc -l | tr -d " ")" = 3 ] && ! grep -q refreshed <<<"$emit"' "$(ls "$QDIR"; echo "$emit")"
check "NEW-10 the two titles differ and carry their P<n>; the class sent is the 12-hex proposal key, never the ledger slug" \
  '[ "$(grep -c "	Rule P2: you.ve answered the same way 2 times — make it a rule?	" "$ASKED")" = 1 ] && [ "$(grep -c "	Rule P3: you.ve answered the same way 2 times — make it a rule?	" "$ASKED")" = 1 ] && [ "$(cut -f2 "$ASKED" | grep -Ec "^[0-9a-f]{12}$")" = 3 ] && [ "$(cut -f2 "$ASKED" | sort -u | wc -l | tr -d " ")" = 3 ] && ! grep -q "	$CLS_ADV	" "$ASKED"' "$(cut -f2,3 "$ASKED")"
check "NEW-10 the key sent as class is the prefix of the sha1 key stored for that P<n>" \
  'python3 -c "
import json,sys
props={json.loads(l)[\"id\"]:json.loads(l) for l in open(sys.argv[1]) if \"\\\"rule\\\"\" in l}
asked={l.split(\"\t\")[2].split(\":\")[0].replace(\"Rule \",\"\"):l.split(\"\t\")[1] for l in open(sys.argv[2]) if \"Rule P\" in l}
assert asked and all(props[p][\"key\"].startswith(k) and len(k)==12 for p,k in asked.items()), (asked, props)" "$POLICY_PROPOSALS" "$ASKED"' "$(cat "$POLICY_PROPOSALS"; cat "$ASKED")"
check "NEW-10 asked_at recorded exactly once per proposal (3), and a second pass asks nothing" \
  '[ "$(grep -c "\"asked_at\"" "$POLICY_PROPOSALS")" = 3 ] && policy_emit_questions >/dev/null && [ "$(wc -l < "$ASKED" | tr -d " ")" = 3 ]' "$(cat "$POLICY_PROPOSALS")"
check "NEW-10 ratify P3 from its own question leaves P2 proposed (one tap = one decision)" \
  'policy_ratify P3 >/dev/null && policy_active AUTO_ADVISORY_CHECK_RED_ON_PR_SDK_MULTI_AGENT_UNFREEZE && policy_proposals | grep -q "^  P2 " && ! policy_proposals | grep -q "^  P3 "'
ask_director() { printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$5" >> "$ASKED"; }

# ── NEW-1: the desk's ledger_record call (slice A's 4th-arg extra-json) must be learned from too ──
reset_state
ledger_record froze "$RAW_RACE"
for i in 1 2; do ledger_record resolved "desk: The ship wave paused on one item → Lift the stop" "$CLS_RACE" '{"chosen":"Lift the stop","writes":[{"op":"unfreeze"}]}'; done
check "NEW-1 the desk's exact call writes chosen + parsed writes (no nested JSON string, base keys intact)" \
  'python3 -c "
import json,sys
r=json.loads(open(sys.argv[1]).read().strip().splitlines()[-1])
assert r[\"outcome\"]==\"resolved\" and r[\"class\"]==sys.argv[2] and r[\"chosen\"]==\"Lift the stop\" and r[\"writes\"]==[{\"op\":\"unfreeze\"}] and r[\"message\"].startswith(\"desk:\"), r" "$LEDGER" "$CLS_RACE"' "$(tail -1 "$LEDGER")"
out=$(policy_proposals)
check "NEW-1 two desk-shaped answers → the proposal is learned (P2 … UNFREEZE), no 'no writes' notice" \
  'grep -q "^  P2   AUTO_FILES_ON_JICATE_MAIN_MATCH_FOR_VERSION_UNFREEZE" <<<"$out" && grep -q "resolved 2x" <<<"$out" && ! grep -q "record a decision but no writes" <<<"$out"' "$out"
# D's own 5-arg shape and A's 4-arg shape count as the SAME decision
resolve "Lift the stop?" "$CLS_RACE" "Lift the stop" "$W_UNFREEZE"
check "NEW-1 a 5-arg (D) answer joins the 4-arg (A) answers: resolved 3x, still one proposal" \
  'policy_proposals | grep -q "resolved 3x" && [ "$(policy_proposals | grep -Ec "^  P[0-9]+ +AUTO")" = 1 ]' "$(policy_proposals)"
# extra-json can never override the four base keys
ledger_record resolved "m" "real class" '{"outcome":"froze","class":"hijack","message":"x","at":"1999","chosen":"x","writes":[{"op":"noop"}]}'
check "NEW-1 extra-json keys never override outcome/class/message/at" \
  'python3 -c "
import json,sys
r=json.loads(open(sys.argv[1]).read().strip().splitlines()[-1])
assert r[\"outcome\"]==\"resolved\" and r[\"class\"]==\"real class\" and r[\"message\"]==\"m\" and r[\"at\"].startswith(\"20\") and r[\"chosen\"]==\"x\", r" "$LEDGER"' "$(tail -1 "$LEDGER")"
# a label that is not JSON stays a label; a 4th arg that is a JSON object with no chosen/writes is just merged
ledger_record resolved "m" "c" "Keep it stopped"
check "NEW-1 a plain label 4th arg is still 'chosen'" 'tail -1 "$LEDGER" | grep -q "\"chosen\": \"Keep it stopped\"" && ! tail -1 "$LEDGER" | grep -q writes' "$(tail -1 "$LEDGER")"
# the silent state is now said once: a decision recorded with no writes (the old mismatched-signature shape)
reset_state
echo '{"at":"2026-09-10 01:00:00","outcome":"resolved","class":"c","message":"desk: T → Lift the stop","chosen":"{\"chosen\": \"Lift the stop\", \"writes\": [{\"op\": \"unfreeze\"}]}"}' >> "$LEDGER"
echo '{"at":"2026-09-10 01:00:00","outcome":"resolved","class":"c","message":"desk: T → Lift the stop","chosen":"{\"chosen\": \"Lift the stop\", \"writes\": [{\"op\": \"unfreeze\"}]}"}' >> "$LEDGER"
ledger_record resolved "guards added: 1 after 'x'" "policy-guard"
out=$(policy_proposals)
check "NEW-1 two decisions recorded without writes → ONE receipt line naming the count (2); the guards line is not counted" \
  '[ "$(grep -c "record a decision but no writes" <<<"$out")" = 1 ] && grep -q "proposals: 2 resolved line(s) record a decision but no writes" <<<"$out"' "$out"

# ── robustness (verifier notes): concurrent scans, and the P1 dead-end says why ──
reset_state
soft_freeze "concurrent class"
resolve "Lift?" "concurrent class" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "concurrent class" "Lift the stop" "$W_UNFREEZE"
for round in 1 2 3 4; do
  policy_proposals >/dev/null & policy_proposals >/dev/null & policy_proposals >/dev/null & wait
  soft_freeze "class $round"; resolve "Lift?" "class $round" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "class $round" "Lift the stop" "$W_UNFREEZE"
done
policy_proposals >/dev/null & policy_proposals >/dev/null & policy_proposals >/dev/null & wait
check "flock: 5 rounds × 3 concurrent scans → one numbering line per key, no P<n> with two keys, no key with two P<n>" \
  'python3 -c "
import json,sys,collections
ps=[json.loads(l) for l in open(sys.argv[1]) if \"\\\"rule\\\"\" in l]
ids=collections.Counter(p[\"id\"] for p in ps); keys=collections.Counter(p[\"key\"] for p in ps)
assert len(ps)==5 and max(ids.values())==1 and max(keys.values())==1, ps" "$POLICY_PROPOSALS"' "$(cat "$POLICY_PROPOSALS")"
reset_state
out=$(policy_ratify P1); rc=$?
check "P1 unwarranted: a 'Make this a rule' tap is refused WITH the reason (the bar), nothing ratified" \
  '[ "$rc" = 1 ] && grep -q "P1 is proposed but not yet warranted" <<<"$out" && grep -q "5 HELD merges" <<<"$out" && ! policy_active AUTO_APPROVE_ADDITIVE_MIGRATIONS' "$out"

find "$STATE" -delete
if [ "$fail" = 0 ]; then echo "ALL PASS"; exit 0; else echo "SOME FAILED"; exit 1; fi

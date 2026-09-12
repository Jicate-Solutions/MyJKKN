#!/bin/bash
# test-policy-adversarial-v3.sh -- third adversarial pass on section D (verifier 2026-09-10, at 3b263922).
# Run from the worktree root: bash scripts/ship-wave/tests/test-policy-adversarial-v3.sh -- temp STATE only, nothing live touched.
# Re-attempts NEW-1/2/3/9/10 with the same inputs the second pass used, plus own hunts; every case PASSES at 3b263922.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# the REAL ask_director (slice A): a sibling desk-questions.sh after integration, else the hitl-desk worktree, read-only
DESK_SH="$HERE/desk-questions.sh"; [ -f "$DESK_SH" ] || DESK_SH=/Users/omm/PROJECTS/MyJKKN/.worktrees/hitl-desk/scripts/ship-wave/desk-questions.sh
STATE="$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-policy-v3.XXXXXX")"; export STATE
LEDGER="$STATE/failure-ledger.jsonl"; export LEDGER
ASKED="$STATE/asked.tsv"
say() { printf '%s\n' "$*"; }
ask_director() { printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" "$5" >> "$ASKED"; }
. "$HERE/failure-ledger.sh"; . "$HERE/policy-learning.sh"
fail=0; np=0
pass() { echo "PASS  $1"; np=$((np+1)); }
flunk() { echo "FAIL  $1"; [ -n "${2:-}" ] && printf '      %s\n' "$2"; fail=1; }
check() { if eval "$2"; then pass "$1"; else flunk "$1" "${3:-}"; fi; }
reset_state() { find "$STATE" -mindepth 1 -delete; mkdir -p "$POLICY_DIR"; : > "$ASKED"; }
resolve() { ledger_record resolved "$1" "$2" "$3" "$4"; }
SOFT_RAW="peer hold on #3410 by reviewer"; SOFT_CLS=$(ledger_class "$SOFT_RAW")
W_UNFREEZE='[{"op":"unfreeze"}]'

echo "### 1. NEW-2 re-attempt: allow-destructive spelling variants"
for f in 'Allow-Destructive' 'ALLOW-DESTRUCTIVE' ' allow-destructive ' 'allow-destructive ' 'aLLOW-dESTRUCTIVE'; do
  reset_state; ledger_record froze "migration 20260906213000: statement refused in body"
  CLS="migration VERSION statement refused in body"
  for i in 1 2; do resolve "Allow?" "$CLS" "Allow this one migration" "[{\"op\":\"append\",\"file\":\"$f\",\"value\":\"20260906213000\"}]"; done
  out=$(policy_proposals); policy_emit_questions >/dev/null 2>&1
  check "NEW-2 [$f] x2 -> no P2, skip names allow-destructive, nothing numbered, nothing asked but P1" \
    '! grep -q "^  P2" <<<"$out" && grep -q "would write allow-destructive" <<<"$out" && ! grep -qs "\"rule\"" "$POLICY_PROPOSALS" && [ "$(grep -c . "$ASKED")" = 1 ] && grep -q "P1" "$ASKED"' \
    "$(grep -E '^  P|skipped|warning' <<<"$out"; cat "$ASKED")"
  r=$(policy_ratify P2 2>&1); check "NEW-2 [$f] ratify P2 refused: '$r'" '[ "$r" = "unknown proposal: P2" ] && [ ! -e "$POLICY_DIR/AUTO_MIGRATION_VERSION_STATEMENT_REFUSED_IN_ALLOW_DESTRUCTIVE" ]'
done
for f in './allow-destructive' 'allow_destructive' '/allow-destructive' 'allow-destructive/' 'ALLOW-DESTRUCTİVE' 'allow‐destructive' 'allow-destructive.' '$STATE/allow-destructive'; do
  reset_state; CLS="migration VERSION statement refused in body"
  for i in 1 2; do resolve "Allow?" "$CLS" "Allow" "[{\"op\":\"append\",\"file\":\"$f\",\"value\":\"20260906213000\"}]"; done
  out=$(policy_proposals)
  check "NEW-2/3 path-shaped [$f] x2 -> warned not a knob, no P2" \
    '! grep -q "^  P2" <<<"$out" && [ "$(grep -c "not a knob" <<<"$out")" = 2 ] && ! grep -qs "\"rule\"" "$POLICY_PROPOSALS"' "$(grep -E '^  P|skipped|warning' <<<"$out")"
done

echo "### 2. NEW-3 re-attempt: non-knob files"
for f in 'frozen' '../frozen' 'policy/AUTO_APPROVE_ADDITIVE_MIGRATIONS' 'last-deployed' ' ' 'approve-held\n' 'approve-held ' 'approve-heldx' 'approve-hel' 'approve held'; do
  reset_state; ledger_record froze "$SOFT_RAW"
  for i in 1 2; do resolve "Q?" "$SOFT_CLS" "Do it" "[{\"op\":\"append\",\"file\":\"$f\",\"value\":\"x\"}]"; done
  out=$(policy_proposals); policy_emit_questions >/dev/null 2>&1
  if [ "$f" = 'approve-held ' ] || [ "$f" = 'approve-held\n' ]; then want=P2; else want=none; fi   # both trim to the knob
  if [ "$want" = none ]; then
    check "NEW-3 [$f] x2 -> 2 warnings, no P2, not numbered, not asked" \
      '! grep -q "^  P2" <<<"$out" && [ "$(grep -c "warning" <<<"$out")" = 2 ] && ! grep -qs "\"rule\"" "$POLICY_PROPOSALS" && ! grep -q "P2" "$ASKED"' "$(grep -E '^  P|skipped|warning' <<<"$out")"
  else
    check "NEW-3 [$f] (trailing space/newline = knob after trim, per amendment) x2 -> P2 approve-held proposed with normalised file" \
      'grep -q "^  P2   AUTO_PEER_HOLD_ON_PR_BY_REVIEWER_APPROVE_HELD" <<<"$out" && grep -q "\[\"append\", \"approve-held\"\]" "$POLICY_PROPOSALS"' "$out"
  fi
done
reset_state; ledger_record froze "$SOFT_RAW"
for i in 1 2; do resolve "Q?" "$SOFT_CLS" "Do it" '[{"op":"append","file":"","value":"x"}]'; done
out=$(policy_proposals)
check "NEW-3 empty file '' x2 -> 'append without file' x2, no P2" '! grep -q "^  P2" <<<"$out" && [ "$(grep -c "append without file" <<<"$out")" = 2 ]' "$out"
reset_state; ledger_record froze "$SOFT_RAW"
resolve "Q?" "$SOFT_CLS" "Approve" '[{"op":"append","file":"Approve-Held","value":"3410"}]'
resolve "Q?" "$SOFT_CLS" "Approve" '[{"op":"append","file":" approve-held ","value":"3411"}]'
resolve "Q?" "$SOFT_CLS" "Advise" '[{"op":"append","file":"ADVISORY-CHECKS","value":"x"}]'
resolve "Q?" "$SOFT_CLS" "Advise" '[{"op":"append","file":"advisory-checks","value":"y"}]'
out=$(policy_proposals)
check "NEW-3 positive: Approve-Held/' approve-held ' and ADVISORY-CHECKS/advisory-checks -> two proposals, normalised shapes" \
  'grep -q "^  P2   AUTO_PEER_HOLD_ON_PR_BY_REVIEWER_ADVISORY_CHECKS" <<<"$out" && grep -q "^  P3   AUTO_PEER_HOLD_ON_PR_BY_REVIEWER_APPROVE_HELD" <<<"$out" && grep -q "\[\"append\", \"approve-held\"\]" "$POLICY_PROPOSALS" && ! grep -q "Approve-Held\| approve-held \|ADVISORY-CHECKS" "$POLICY_PROPOSALS"' "$out
$(cat "$POLICY_PROPOSALS")"

echo "### 3. NEW-9 re-attempt: unfreeze x2 on every hard class (froze line present) and slug-only"
HARD_MSGS=(
"deploy dpl_abc123 -> ERROR: build failed; on main but NOT live: #3410"
"deploy dpl_abc123 -> CANCELED; on main but NOT live: #3410"
"deploy failed: Vercel hook returned 500"
"migration 20260906213000: APPLY failed -- ERROR: relation public.foo does not exist"
"migration 20260906213000: DRY-RUN failed -- ERROR: syntax error at or near"
"migration 20260906213000: destructive statement refused (DROP TABLE) -- echo version >> allow-destructive"
"GATE ERROR: history query returned nothing for 20260906213000"
"migration gap: 20260906213000 merged but never applied"
"migration 20260906213000: cannot read supabase/migrations/x.sql from jicate/main"
"the history query failed for 20260906213000"
"migration 20260906213000: APPLIED but the history insert failed -- ERROR: duplicate key"
"migration 20260906213000: applied + recorded, but the verify read did not find it"
"broken page after deploy: 3 page x role load(s) returned 5xx; on main: #3410"
"post-deploy sweep failed -- L2: /x L1: none - likely PRs: 3410"
"baseline bounce after deploy -- these loaded 200 before and now bounce to /auth/login: /admin/x"
"gh not authenticated after 3 tries"
"some brand new freeze nobody has classified yet #3410"
)
for msg in "${HARD_MSGS[@]}"; do
  cls=$(ledger_class "$msg")
  reset_state; ledger_record froze "$msg"
  for i in 1 2; do resolve "Lift?" "$cls" "Lift the stop" "$W_UNFREEZE"; done
  out=$(policy_proposals); policy_emit_questions >/dev/null 2>&1
  check "NEW-9 froze+unfreeze x2 '${msg:0:44}' -> refused (HARD/NEVER_RULE), no P2, not asked" \
    '! grep -q "^  P2" <<<"$out" && grep -Eq "HARD stop|NEVER_RULE" <<<"$out" && ! grep -qs "\"rule\"" "$POLICY_PROPOSALS" && ! grep -q "P2" "$ASKED"' "$(grep -E '^  P2|skipped' <<<"$out")"
  reset_state; cls80="${cls:0:80}"
  for i in 1 2; do resolve "Lift?" "$cls80" "Lift the stop" "$W_UNFREEZE"; done
  out=$(policy_proposals)
  check "NEW-9 slug-only unfreeze x2 '${cls80:0:44}' -> refused, no P2" \
    '! grep -q "^  P2" <<<"$out" && grep -Eq "HARD|NEVER_RULE" <<<"$out"' "$(grep -E '^  P2|skipped' <<<"$out")"
  reset_state; ledger_record froze "$msg"
  for i in 1 2; do resolve "Lift?" "$cls" "Lift" '[{"op":"append","file":"advisory-checks","value":"x"},{"op":"unfreeze"}]'; done
  out=$(policy_proposals)
  check "NEW-9 froze + [advisory-checks,unfreeze] x2 '${msg:0:36}' -> refused" '! grep -q "^  P2" <<<"$out"' "$(grep -E '^  P2|skipped' <<<"$out")"
done
reset_state; ledger_record froze "deploy dpl_abc123 -> ERROR: build failed"
for i in 1 2; do resolve "Lift?" "  Deploy   DEPLOY Error  Build FAILED " "Lift the stop" "$W_UNFREEZE"; done
out=$(policy_proposals)
check "NEW-9 class case/whitespace variant of a hard froze class -> refused" '! grep -q "^  P2" <<<"$out" && grep -q "skipped" <<<"$out"' "$out"
reset_state; printf '{"at":"2026-09-01 00:00:00","outcome":"froze","class":"%s","message":""}\n' "$SOFT_CLS" >> "$LEDGER"
for i in 1 2; do resolve "Lift?" "$SOFT_CLS" "Lift the stop" "$W_UNFREEZE"; done
out=$(policy_proposals)
check "NEW-9 froze line with empty message -> matched no row -> HARD fail-safe, no P2" '! grep -q "^  P2" <<<"$out" && grep -q "matched no row" <<<"$out"' "$out"
for raw in "peer hold on #3410 by reviewer" "files on jicate/main match for 20260906213000 after merge of #3410" "conflict verdict UNRESOLVABLE for #3410 vs #3411" "Director hold on #3410" "PR #3410 on hold by author"; do
  reset_state; ledger_record froze "$raw"; cls=$(ledger_class "$raw")
  for i in 1 2; do resolve "Lift?" "$cls" "Lift the stop" "$W_UNFREEZE"; done
  out=$(policy_proposals)
  check "soft '${raw:0:40}' + froze -> PROPOSED as P2" 'grep -q "^  P2   AUTO_" <<<"$out"' "$out"
done
for raw in "peer hold on #3410 by reviewer" "files on jicate/main match for 20260906213000 after merge of #3410" "conflict verdict UNRESOLVABLE for #3410 vs #3411"; do
  reset_state; cls=$(ledger_class "$raw")
  for i in 1 2; do resolve "Lift?" "$cls" "Lift the stop" "$W_UNFREEZE"; done
  out=$(policy_proposals)
  echo "INFO  soft slug-only (no froze line) '${cls:0:40}' -> $(grep -E '^  P2|skipped' <<<"$out" | head -1)"
done

echo "### 4. two distinct classes, same shape -> two P<n>, two titles, two files via the REAL ask_director"
reset_state
RAW_A="peer hold on #3410 by reviewer"; RAW_B="files on jicate/main match for 20260906213000 after merge of #3410"
ledger_record froze "$RAW_A"; ledger_record froze "$RAW_B"
for i in 1 2; do resolve "Lift?" "$(ledger_class "$RAW_A")" "Lift the stop" "$W_UNFREEZE"; resolve "Lift?" "$(ledger_class "$RAW_B")" "Lift the stop" "$W_UNFREEZE"; done
if [ -f "$DESK_SH" ]; then
unset -f ask_director
. "$DESK_SH"
out=$(policy_proposals)
emit=$(policy_emit_questions 2>&1)
nfiles=$(ls "$QUESTIONS_DIR"/q-*.json 2>/dev/null | wc -l | tr -d ' ')
titles=$(for f in "$QUESTIONS_DIR"/q-*.json; do python3 -c 'import json,sys;q=json.load(open(sys.argv[1]));print(q["title"],"|",q["class"],"|",[w for o in q["options"] for w in o["writes"]])' "$f"; done)
check "4 two classes same shape -> P2 and P3 listed with different rule names" \
  'grep -q "^  P2   AUTO_FILES_ON_JICATE_MAIN_MATCH_FOR_VERSION_UNFREEZE" <<<"$out" && grep -q "^  P3   AUTO_PEER_HOLD_ON_PR_BY_REVIEWER_UNFREEZE" <<<"$out"' "$out"
check "4 real ask_director wrote 3 question files (P1 + P2 + P3), none 'refreshed'" \
  '[ "$nfiles" = 3 ] && ! grep -q refreshed <<<"$emit" && [ "$(grep -c "question written" <<<"$emit")" = 3 ]' "$emit"
check "4 the two learned titles differ and each carries its own P<n>; classes are key prefixes, not slugs" \
  '[ "$(grep -c "Rule P2:" <<<"$titles")" = 1 ] && [ "$(grep -c "Rule P3:" <<<"$titles")" = 1 ] && ! grep -q "peer hold\|jicate" <<<"$(cut -d"|" -f2 <<<"$titles")"' "$titles"
check "4 each file ratifies exactly its own P<n>" \
  "grep -q \"Rule P2:.*'ratify', 'value': 'P2'\" <<<\"\$titles\" && grep -q \"Rule P3:.*'ratify', 'value': 'P3'\" <<<\"\$titles\" && ! grep -q \"Rule P2:.*'P3'\" <<<\"\$titles\""
emit2=$(policy_emit_questions 2>&1); nfiles2=$(ls "$QUESTIONS_DIR"/q-*.json | wc -l | tr -d ' ')
check "4 second run asks nothing new (still 3 files, no output)" '[ "$nfiles2" = 3 ] && [ -z "$emit2" ]' "$emit2"
r=$(policy_ratify P2); out=$(policy_proposals)
check "4 ratify P2 -> flag exists, P3 still listed, P2 gone" '[ -e "$POLICY_DIR/AUTO_FILES_ON_JICATE_MAIN_MATCH_FOR_VERSION_UNFREEZE" ] && ! grep -q "^  P2 " <<<"$out" && grep -q "^  P3 " <<<"$out"' "$r
$out"
echo "INFO  question files:"; echo "$titles"
reset_state; mkdir -p "$QUESTIONS_DIR/answered"; RAW_ADV="advisory check red on #3410: SDK multi-agent review"; ledger_record froze "$RAW_ADV"; cls=$(ledger_class "$RAW_ADV")
for i in 1 2; do resolve "Lift?" "$cls" "Lift the stop" "$W_UNFREEZE"; resolve "Advise?" "$cls" "Treat as advice" '[{"op":"append","file":"advisory-checks","value":"SDK multi-agent review"}]'; done
out=$(policy_proposals); emit=$(policy_emit_questions 2>&1); nfiles=$(ls "$QUESTIONS_DIR"/q-*.json | wc -l | tr -d ' ')
askedlines=$(grep -c asked_at "$POLICY_PROPOSALS")
check "NEW-10 same class two shapes -> P2+P3, 3 files written, 3 asked_at lines, no 'refreshed'" \
  '[ "$nfiles" = 3 ] && [ "$askedlines" = 3 ] && ! grep -q refreshed <<<"$emit" && grep -q "^  P2 " <<<"$out" && grep -q "^  P3 " <<<"$out"' "$emit
$(cat "$POLICY_PROPOSALS")"
echo "INFO  NEW-10 emit:"; echo "$emit"
unset -f ask_director
ask_director() { printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" "$5" >> "$ASKED"; }
else echo "SKIP  section 4: no desk-questions.sh found (slice A) — real ask_director checks not run"; fi

echo "### 5. numbering across runs; ratify unknown ids"
reset_state; ledger_record froze "$RAW_A"; ledger_record froze "$RAW_B"
for i in 1 2; do resolve "Lift?" "$(ledger_class "$RAW_A")" "Lift the stop" "$W_UNFREEZE"; done
out1=$(policy_proposals)
for i in 1 2; do resolve "Lift?" "$(ledger_class "$RAW_B")" "Lift the stop" "$W_UNFREEZE"; done
out2=$(policy_proposals); out3=$(policy_proposals)
check "5 run1 P2=PEER_HOLD; run2 keeps P2 and adds P3=FILES_ON (no renumber), run3 identical" \
  'grep -q "^  P2   AUTO_PEER_HOLD" <<<"$out1" && grep -q "^  P2   AUTO_PEER_HOLD" <<<"$out2" && grep -q "^  P3   AUTO_FILES_ON" <<<"$out2" && [ "$out2" = "$out3" ] && [ "$(grep -c "\"rule\"" "$POLICY_PROPOSALS")" = 2 ]' "$out2"
NL=$'\n'
for bad in P99 P Pabc "P2 " " P2" P02 "P2?" "P-2" "" "../x" "P1?" "P3;touch $STATE/pwned" 'P2$(touch '"$STATE"'/pwned2)' "AUTO_PEER_HOLD_ON_PR_BY_REVIEWER_UNFREEZE" "P2${NL}P3"; do
  r=$(policy_ratify "$bad" 2>&1); rc=$?
  check "5 ratify [$(printf '%s' "$bad" | tr '\n' '~')] refused rc=$rc: '$(printf '%s' "$r" | tr '\n' '~')'" '[ "$rc" != 0 ] && [ ! -e "$STATE/pwned" ] && [ ! -e "$STATE/pwned2" ] && [ "$(ls "$POLICY_DIR" | wc -l | tr -d " ")" = 0 ]'
done
check "5 policy.jsonl untouched by refused ratifies" '[ ! -s "$POLICY_LOG" ]' "$(cat "$POLICY_LOG" 2>/dev/null)"

echo "### 6. malformed ledger lines mixed with valid ones"
reset_state; ledger_record froze "$RAW_A"
resolve "Lift?" "$(ledger_class "$RAW_A")" "Lift the stop" "$W_UNFREEZE"
cat >> "$LEDGER" <<'J'
{not json
null
[]
42
"str"
{"outcome":"resolved","class":"","message":"x","writes":[{"op":"unfreeze"}]}
{"outcome":"resolved","message":"no class","writes":[{"op":"unfreeze"}]}
{"outcome":"resolved","class":"peer hold on PR by reviewer","message":"x","writes":"unfreeze"}
{"outcome":"resolved","class":"peer hold on PR by reviewer","message":"x","writes":{"op":"unfreeze"}}
{"outcome":"resolved","class":"peer hold on PR by reviewer","message":"x","writes":[null]}
{"outcome":"resolved","class":"peer hold on PR by reviewer","message":"x","writes":[{"op":"Unfreeze"}]}
{"outcome":"resolved","class":"peer hold on PR by reviewer","message":"x","writes":[{"op":["unfreeze"]}]}
{"outcome":"resolved","class":"peer hold on PR by reviewer","message":"x","writes":[{"op":"append","file":["allow-destructive"],"value":"1"}]}
{"outcome":"resolved","class":"peer hold on PR by reviewer","message":"x","writes":[{"op":"append","file":5,"value":"1"}]}
{"outcome":"resolved","class":5,"message":"x","writes":[{"op":"unfreeze"}]}
{"outcome":"froze","message":"no class"}
{"outcome":"froze","class":"   ","message":"blank class"}
{"outcome":"round"}
{"outcome":"round","message":42}
{"outcome":"resolved","class":"peer hold on PR by reviewer","message":"desk: old shape","chosen":"Lift the stop"}
{"outcome":"resolved","class":"policy-guard","message":"guards added: 1"}
{"outcome":"unblocked","message":"whatever"}

J
resolve "Lift?" "$(ledger_class "$RAW_A")" "Lift the stop" "$W_UNFREEZE"
out=$(policy_proposals 2>&1); rc=$?
nwarn=$(grep -c "ledger line" <<<"$out")
check "6 rc=0, no traceback, exactly 19 per-line warnings, genuine P2 still proposed, 1 'decision but no writes' notice" \
  '[ $rc = 0 ] && ! grep -q Traceback <<<"$out" && [ "$nwarn" = 19 ] && grep -q "^  P2   AUTO_PEER_HOLD" <<<"$out" && grep -q "1 resolved line(s) record a decision but no writes" <<<"$out"' "$out"
check "6 'Unfreeze' (capital) op is refused as unknown op, not silently accepted" 'grep -q "unknown op .Unfreeze" <<<"$out"'
j=$(_policy_scan json 2>"$STATE/err"); check "6 json mode: warnings on stderr only, stdout is clean JSON lines" \
  '[ "$(grep -c "ledger line" "$STATE/err")" = 19 ] && python3 -c "import sys,json;[json.loads(l) for l in sys.stdin if l.strip()]" <<<"$j"' "$(head -3 "$STATE/err")"
policy_emit_questions >/dev/null 2>&1; r=$(policy_ratify P2)
check "6 genuine P2 asked and ratifiable despite the junk" 'grep -q "P2" "$ASKED" && grep -q "^ratified P2" <<<"$r" && [ -e "$POLICY_DIR/AUTO_PEER_HOLD_ON_PR_BY_REVIEWER_UNFREEZE" ]' "$r"

echo "### 7. noop-only shapes"
reset_state; ledger_record froze "$RAW_A"; cls=$(ledger_class "$RAW_A")
for w in '[{"op":"noop"}]' '[{"op":"noop"},{"op":"noop"}]' '[]'; do
  for i in 1 2 3; do resolve "Keep?" "$cls" "Keep it stopped" "$w"; done
done
out=$(policy_proposals)
check "7 noop / noop,noop / [] x3 each -> never proposed, 'nothing to automate' printed, nothing numbered" \
  '! grep -q "^  P2" <<<"$out" && grep -q "nothing to automate" <<<"$out" && ! grep -qs "\"rule\"" "$POLICY_PROPOSALS"' "$out"
reset_state; ledger_record froze "$RAW_A"
for i in 1 2; do resolve "R?" "$cls" "Make rule" '[{"op":"ratify","value":"P1"}]'; done
out=$(policy_proposals); check "7 ratify-shape x2 -> never proposed" '! grep -q "^  P2" <<<"$out" && grep -q "a rule that makes rules" <<<"$out"' "$out"

echo "### 8. NEW-1 re-attempt: the desk's exact ledger_record shape learns"
reset_state; ledger_record froze "$RAW_A"
for i in 1 2; do ledger_record resolved "desk: Lift the stop? -> Lift the stop" "$cls" "$(L="Lift the stop" W="$W_UNFREEZE" python3 -c 'import json,os;print(json.dumps({"chosen":os.environ["L"],"writes":json.loads(os.environ["W"])}))')"; done
line=$(tail -1 "$LEDGER"); out=$(policy_proposals)
check "NEW-1 desk-shape x2 -> record has chosen+writes keys and P2 is proposed" \
  'python3 -c "import json,sys;r=json.loads(sys.argv[1]);assert r[\"chosen\"]==\"Lift the stop\" and r[\"writes\"]==[{\"op\":\"unfreeze\"}] and r[\"class\"]==sys.argv[2]" "$line" "$cls" && grep -q "^  P2   AUTO_PEER_HOLD" <<<"$out"' "$line
$out"
reset_state; ledger_record froze "$RAW_A"
ledger_record resolved "desk: Lift? -> Lift the stop" "$cls" '{"chosen":"Lift the stop","writes":[{"op":"unfreeze"}]}'
resolve "Lift?" "$cls" "Lift the stop" "$W_UNFREEZE"
out=$(policy_proposals); check "NEW-1 one desk-shape + one 5-arg shape -> same group -> P2" 'grep -q "^  P2   AUTO_PEER_HOLD" <<<"$out" && grep -q "resolved 2x" <<<"$out"' "$out"
reset_state; ledger_record froze "$RAW_A"
for i in 1 2; do ledger_record resolved "desk: x" "$cls" '{"chosen":"Lift","writes":[{"op":"unfreeze"}],"outcome":"froze","class":"deploy error","at":"1999"}'; done
line=$(tail -1 "$LEDGER")
check "NEW-1 extra-json cannot override outcome/class/at" 'python3 -c "import json,sys;r=json.loads(sys.argv[1]);assert r[\"outcome\"]==\"resolved\" and r[\"class\"]==sys.argv[2] and r[\"at\"]!=\"1999\"" "$line" "$cls"' "$line"
reset_state; ledger_record froze "$RAW_A"
ledger_record resolved "desk: x" "$cls" '{"a":1}' "$W_UNFREEZE"
line=$(tail -1 "$LEDGER"); echo "INFO  label that IS a JSON object -> record: $line"
ledger_record resolved "desk: x" "$cls" '{Lift the stop}' "$W_UNFREEZE"
line=$(tail -1 "$LEDGER"); check "NEW-1 label '{Lift the stop}' (not JSON) stays the chosen label" 'grep -q "\"chosen\": \"{Lift the stop}\"" <<<"$line"' "$line"

echo "### 9. own hunts"
reset_state; msg="deploy failed: Vercel hook returned 500"; ledger_record froze "$msg"; c=$(ledger_class "$msg")
for i in 1 2; do resolve "x" "$c" "Approve" '[{"op":"append","file":"approve-held","value":"3410"}]'; done
out=$(policy_proposals); echo "INFO  approve-held x2 under HARD 'deploy failed' -> $(grep -E '^  P2|skipped' <<<"$out" | head -1)"
reset_state; msg="broken page after deploy: 3 page x role load(s) returned 5xx"; ledger_record froze "$msg"; c=$(ledger_class "$msg")
for i in 1 2; do resolve "x" "$c" "Advice" '[{"op":"append","file":"advisory-checks","value":"x"}]'; done
out=$(policy_proposals); echo "INFO  advisory-checks x2 under HARD 'broken page' -> $(grep -E '^  P2|skipped' <<<"$out" | head -1)"
reset_state; ledger_record froze "$RAW_A"
for i in 1 2; do resolve "x" "$cls" "see evidence: 'none' \"q\"" "$W_UNFREEZE"; done
policy_proposals >/dev/null; r=$(policy_ratify P2); ev=$(python3 -c 'import json,sys;print(json.loads(open(sys.argv[1]).readline())["evidence"])' "$POLICY_LOG")
check "9b label containing 'evidence:' -> ratify P2 works, evidence is the evidence line" 'grep -q "^ratified P2" <<<"$r" && grep -q "^resolved 2x" <<<"$ev"' "$r
$ev"
reset_state; ledger_record froze "$RAW_A"
for i in 1 2; do resolve "x" "peer" "Lift the stop" "$W_UNFREEZE"; done
out=$(policy_proposals); echo "INFO  resolved class 'peer' (prefix of soft froze class) -> $(grep -E '^  P2|skipped' <<<"$out" | head -1)"
reset_state; ledger_record froze "peer hold on #3410 by reviewer" "$cls"; ledger_record froze "deploy dpl_x -> ERROR" "$cls"
for i in 1 2; do resolve "x" "$cls" "Lift the stop" "$W_UNFREEZE"; done
out=$(policy_proposals); check "9d one hard froze message under an otherwise soft class -> refused" '! grep -q "^  P2" <<<"$out" && grep -q "HARD stop" <<<"$out"' "$out"
reset_state; ledger_record froze "$RAW_A"
for i in 1 2; do resolve "x" "$cls" "Lift the stop" "$W_UNFREEZE"; done
out=$(FREEZE_CLASSES_SH=/nonexistent/freeze-classes.sh policy_proposals)
check "9e classifier unavailable -> unfreeze rule refused (fail safe), not proposed" '! grep -q "^  P2" <<<"$out" && grep -q "skipped" <<<"$out"' "$out"
reset_state; ledger_record froze "$RAW_ADV"; c=$(ledger_class "$RAW_ADV")
resolve "x" "$c" "A" '[{"op":"unfreeze"},{"op":"append","file":"advisory-checks","value":"one"}]'
resolve "x" "$c" "A" '[{"op":"append","file":"Advisory-Checks","value":"two"},{"op":"unfreeze"},{"op":"unfreeze"}]'
out=$(policy_proposals); check "9f order/dup/value/case variants of one shape -> one proposal (resolved 2x)" '[ "$(grep -c "^  P2" <<<"$out")" = 1 ] && grep -q "resolved 2x" <<<"$out" && ! grep -q "^  P3" <<<"$out"' "$out"
reset_state; CLS="migration VERSION statement refused in body"; ledger_record froze "migration 20260906213000: statement refused in body"
for i in 1 2; do resolve "Allow?" "$CLS" "Allow" '[{"op":"append","file":"ALLOW-DESTRUCTIVE","value":"20260906213000"}]'; done
j=$(_policy_scan json 2>/dev/null); check "9g json mode never emits an ALLOW_DESTRUCTIVE proposal (only P1)" '! grep -q ALLOW_DESTRUCTIVE <<<"$j" && [ "$(grep -c "\"id\"" <<<"$j")" = 1 ]' "$j"
reset_state; ledger_record froze "$RAW_A"; for i in 1 2; do resolve "x" "$cls" "Lift the stop" "$W_UNFREEZE"; done
ask_director() { return 1; }; e=$(policy_emit_questions); check "9h ask_director failing -> nothing marked asked, retry message" '! grep -qs asked_at "$POLICY_PROPOSALS" && grep -q "will retry" <<<"$e"' "$e"
ask_director() { printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" "$5" >> "$ASKED"; }
reset_state; long="peer hold on #3410 by reviewer because the reviewer wants one more look at the very long title of it"; ledger_record froze "$long"; c=$(ledger_class "$long"); c80="${c:0:80}"
for i in 1 2; do resolve "x" "$c80" "Lift the stop" "$W_UNFREEZE"; done
out=$(policy_proposals); check "9i desk-cut 80-char class still finds its 90-char froze line (soft) -> proposed" 'grep -q "^  P2 " <<<"$out"' "$out
[$c] vs [$c80]"
# 9j the soft rows 'policy' / 'advisory' are bare substrings: a novel hard-sounding message with one of those words
for raw in "migration 20260906213000: RLS policy missing on table x after apply -- production reads denied" "advisory lock timeout -- migration apply aborted mid-file"; do
  reset_state; ledger_record froze "$raw"; c=$(ledger_class "$raw")
  for i in 1 2; do resolve "x" "$c" "Lift the stop" "$W_UNFREEZE"; done
  out=$(policy_proposals); echo "INFO  bare-substring soft row: '${raw:0:60}' -> $(grep -E '^  P2|skipped' <<<"$out" | head -1)"
done

find "$STATE" -mindepth 1 -delete; rmdir "$STATE"
echo "PASS=$np"; if [ "$fail" = 0 ]; then echo "ALL PASS"; else echo "SOME FAILED"; exit 1; fi

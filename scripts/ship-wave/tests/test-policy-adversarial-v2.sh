#!/bin/bash
# test-policy-adversarial-v2.sh — second adversarial pass on §D after the c032cfa1 fix round (verifier 2026-09-10).
# Run from the worktree root: bash scripts/ship-wave/tests/test-policy-adversarial-v2.sh
# Temp $STATE only. Cases marked EXPECTED-FAIL on c032cfa1 are the new breaks; they must PASS after the next fix.
#   NEW-2  NEVER_RULE_FILES is an exact-match set: 'Allow-Destructive', './allow-destructive', 'allow-destructive '
#          slip past and are proposed as AUTO_…_ALLOW_DESTRUCTIVE (APFS is case-insensitive: same file).
#   NEW-3  append to a file outside the §A1 knob list (frozen, ../frozen, policy/…) is a valid shape and is proposed.
#   NEW-9  HARD_CLASS covers 4 of B+C's 14 hard rows (hitl-freeze-classes 65acbd8d classify_freeze): unfreeze ×2 on
#          'broken page after deploy', 'history insert failed', 'deploy … CANCELED', 'cannot read', or any
#          unclassified message (B+C default = hard) becomes a proposable rule.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE="$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-policy-adv2.XXXXXX")"; export STATE
LEDGER="$STATE/failure-ledger.jsonl"; export LEDGER
say() { printf '%s\n' "$*"; }
. "$HERE/failure-ledger.sh"; . "$HERE/policy-learning.sh"
fail=0
pass() { echo "PASS  $1"; }
flunk() { echo "FAIL  $1"; [ -n "${2:-}" ] && echo "      $2"; fail=1; }
check() { if eval "$2"; then pass "$1"; else flunk "$1" "${3:-}"; fi; }   # ${3:-}: a failing two-arg check must report FAIL, not abort under set -u
reset_state() { find "$STATE" -mindepth 1 -delete; mkdir -p "$POLICY_DIR"; }
resolve() { ledger_record resolved "$1" "$2" "$3" "$4"; }
CLS="migration VERSION statement refused in body"

for f in 'Allow-Destructive' './allow-destructive' 'allow-destructive '; do
  reset_state
  for i in 1 2; do resolve "Allow?" "$CLS" "Allow this one migration" "[{\"op\":\"append\",\"file\":\"$f\",\"value\":\"20260906213000\"}]"; done
  out=$(policy_proposals)
  check "NEW-2 append file '$f' ×2 → no proposal (same file as allow-destructive on APFS)" \
    '! grep -q "^  P2 " <<<"$out" && ! grep -q "ALLOW_DESTRUCTIVE" "$POLICY_PROPOSALS" 2>/dev/null' "$(grep -E "^  P2|skipped|warning" <<<"$out")"
done

for f in 'frozen' '../frozen' 'policy/AUTO_APPROVE_ADDITIVE_MIGRATIONS' 'last-deployed'; do
  reset_state
  for i in 1 2; do resolve "Q?" "peer hold on PR by reviewer" "Do it" "[{\"op\":\"append\",\"file\":\"$f\",\"value\":\"x\"}]"; done
  out=$(policy_proposals)
  check "NEW-3 append to non-knob '$f' ×2 → malformed (warned), never a proposal" \
    '! grep -q "^  P2 " <<<"$out" && grep -q "warning" <<<"$out"' "$(grep -E "^  P2|skipped|warning" <<<"$out")"
done

while IFS= read -r msg; do
  reset_state; cls=$(ledger_class "$msg")
  for i in 1 2; do resolve "Lift the stop?" "$cls" "Lift the stop" '[{"op":"unfreeze"}]'; done
  out=$(policy_proposals)
  check "NEW-9 unfreeze ×2 on B+C HARD class '${msg:0:48}' → refused as a HARD stop" \
    '! grep -q "^  P2 " <<<"$out" && grep -q "HARD stop\|NEVER_RULE" <<<"$out"' "$(grep -E "^  P2|skipped" <<<"$out")"
done <<'MSGS'
broken page after deploy: 3 page×role load(s) returned 5xx (see run/l1.txt); on main: #3410
migration 20260906213000: APPLIED but the history insert failed — ERROR: duplicate key (record it by hand, then --unfreeze)
migration 20260906213000: applied + recorded, but the verify read did not find it
deploy dpl_abc123 → CANCELED; on main but NOT live: #3410
migration 20260906213000: cannot read supabase/migrations/x.sql from jicate/main
baseline bounce after deploy — these loaded 200 before and now bounce to /auth/login: /admin/x; on main: #3410
post-deploy sweep failed — L2: /x L1: none · likely PRs: 3410
MSGS

find "$STATE" -mindepth 1 -delete; rmdir "$STATE"
if [ "$fail" = 0 ]; then echo "ALL PASS"; else echo "SOME FAILED"; exit 1; fi

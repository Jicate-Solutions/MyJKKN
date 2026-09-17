#!/opt/homebrew/bin/bash
# tests/test-review-bypass.sh — regression proof for R11 (Director 2026-09-17 06:12 / 14:01):
#   branch protection on main requires 1 approving review and the identity the wave merges as is listed in that
#   rule's bypass_pull_request_allowances.users. GitHub still reports every unreviewed PR as BLOCKED with
#   reviewDecision=REVIEW_REQUIRED, the sweep read that as unmergeable, and four consecutive runs on 2026-09-17
#   merged ZERO PRs while lane A said "required checks never ran on this head" about PRs whose required checks
#   were all green. Fixed: BLOCKED + REVIEW_REQUIRED + nothing failing + our login in the bypass list is
#   classified exactly like CLEAN; with the login NOT in that list nothing moves.
#
# Run from the worktree root:  bash scripts/ship-wave/tests/test-review-bypass.sh
# Harness as in test-sweep-dynamic-routes.sh: a copy of ship-wave.sh without its trailing dispatcher is SOURCED, so
# classify() and unblock_lanes() under test are the REAL code; gh is a stub; temp HOME per case; nothing is merged.
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"

ROOT=$(cd "$(dirname "$0")/../../.." && pwd); SW="$ROOT/scripts/ship-wave"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-reviewbypass.XXXXXX")
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf 'FAIL  %s\n      %s\n' "$1" "${2:-}"; }
check() { if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1" "$3"; fi; }

awk '/^if \[ -n "\$GOAL" \]; then$/ {exit} {print}' "$SW/ship-wave.sh" > "$TMP/wave.sh"
for f in "$SW"/*.sh "$SW"/*.py; do [ "$(basename "$f")" = ship-wave.sh ] || ln -s "$f" "$TMP/$(basename "$f")"; done
grep -q '^classify() {' "$TMP/wave.sh" || { echo "FAIL  could not extract classify from ship-wave.sh"; exit 1; }

# four PRs, all pushed long ago so the 30-min quiet rule never hides the answer
python3 - "$TMP/prs.json" <<'PY'
import json, sys, datetime
old = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=6)).isoformat().replace("+00:00", "Z")
def pr(n, state, review, checks, files=("lib/students/format.ts",)):
    return {"number": n, "title": f"feat: thing {n}", "mergeStateStatus": state, "reviewDecision": review,
            "isDraft": False, "headRefName": f"b{n}", "baseRefName": "main", "updatedAt": old, "headCommittedAt": old,
            "files": [{"path": f} for f in files], "statusCheckRollup": checks}
green = [{"name": "TypeCheck (PR-scoped)", "status": "COMPLETED", "conclusion": "SUCCESS"}]
red = [{"name": "TypeCheck (PR-scoped)", "status": "COMPLETED", "conclusion": "FAILURE"}]
running = [{"name": "TypeCheck (PR-scoped)", "status": "IN_PROGRESS", "conclusion": None}]
json.dump([pr(10, "BLOCKED", "REVIEW_REQUIRED", green),   # the PR this fix is about
           pr(11, "BLOCKED", "REVIEW_REQUIRED", red),     # control: a real red still blocks
           pr(12, "CLEAN",   "REVIEW_REQUIRED", green),   # control: CLEAN is unaffected
           pr(13, "BLOCKED", "",                green),   # control: BLOCKED for some other reason still blocks
           pr(14, "BLOCKED", "REVIEW_REQUIRED", running)  # still blocked (CI running) — lane A must not misreport it
           ], open(sys.argv[1], "w"))
PY

# run_case <name> <login gh api user returns> <bypass users JSON array>
run_case() {
  local S="$TMP/$1"; mkdir -p "$S/home/.config/obsidian/.ship-wave" "$S/run"
  (
    export HOME="$S/home"; cd "$ROOT" || exit 9
    export ME="$2" BYPASS_USERS="$3"
    set -- plan
    . "$TMP/wave.sh" >/dev/null 2>&1
    gh() {
      echo "gh $*" >> "$S/trace.txt"
      case "$*" in
        "api user --jq .login") printf '%s\n' "$ME";;
        "api repos/"*"/branches/main/protection/required_pull_request_reviews")
          [ -n "$BYPASS_USERS" ] || return 1   # an empty list here means the read itself failed
          printf '{"required_approving_review_count":1,"bypass_pull_request_allowances":{"users":%s}}\n' "$BYPASS_USERS";;
      esac; return 0
    }
    sleep() { :; }; ask_director() { :; }; codex_second_opinion() { :; }
    classify "$TMP/prs.json" "$S/run/plan.json" > "$S/classify.txt" 2>&1
    unblock_lanes "$S/run" > "$S/lanes.txt" 2>&1
  )
}

# where did a PR land? prints e.g. "ready.NORMAL" / "blocked" / "waiting_ci"
where() {
  python3 - "$1" "$2" <<'PY'
import json, sys
p = json.load(open(sys.argv[1])); n = int(sys.argv[2])
for t in ("LOW", "NORMAL", "HELD"):
    if any(r["number"] == n for r in p["ready"][t]): print(f"ready.{t}"); raise SystemExit
for b in ("blocked", "waiting_ci", "quiet_wait", "conflicted", "draft", "stacked"):
    if any(r["number"] == n for r in p[b]): print(b); raise SystemExit
print("nowhere")
PY
}
is() { [ "$(where "$1" "$2")" = "$3" ]; }

echo "── the merging login IS in main's bypass list ──"
run_case yes "w12-ship-wave" '[{"login":"w12-ship-wave"}]'
P="$TMP/yes/run/plan.json"; L="$TMP/yes/lanes.txt"; C="$TMP/yes/classify.txt"
check "r1 #10 BLOCKED+REVIEW_REQUIRED, all green → READY NORMAL (not blocked)" $(is "$P" 10 ready.NORMAL; echo $?) "landed in $(where "$P" 10)"
check "r2 … and it is printed as READY with its tier, like any CLEAN PR" $(grep -q 'READY NORMAL #10' "$C"; echo $?) "$(cat "$C")"
check "r3 the bypass read is announced once" $(grep -q "review-bypass: w12-ship-wave is in main's bypass list" "$C"; echo $?) "$(cat "$C")"
check "r4 the two gh reads happen ONCE, not per classify call" $([ "$(grep -c 'api repos/.*required_pull_request_reviews' "$TMP/yes/trace.txt")" = 1 ]; echo $?) "$(grep -c 'required_pull_request_reviews' "$TMP/yes/trace.txt") reads"
check "r5 CONTROL #11 red on a required check stays blocked" $(is "$P" 11 blocked; echo $?) "landed in $(where "$P" 11)"
check "r6 CONTROL #12 CLEAN is READY as before" $(is "$P" 12 ready.NORMAL; echo $?) "landed in $(where "$P" 12)"
check "r7 CONTROL #13 BLOCKED with no REVIEW_REQUIRED stays blocked" $(is "$P" 13 blocked; echo $?) "landed in $(where "$P" 13)"
check "r8 CONTROL #14 BLOCKED with CI still running stays blocked" $(is "$P" 14 blocked; echo $?) "landed in $(where "$P" 14)"
check "r9 lane A no longer claims 'required checks never ran' for #14 (review-required, bypass applies)" \
      $(grep -q 'N  #14  review-required, bypass applies' "$L" && ! grep -q 'A  #14' "$L"; echo $?) "$(cat "$L")"
check "r10 lane A says nothing at all about #10 — the sweep owns it now" $(! grep -q '#10' "$L"; echo $?) "$(cat "$L")"

echo "── the merging login is NOT in the bypass list ──"
run_case no "w12-ship-wave" '[{"login":"someone-else"}]'
P="$TMP/no/run/plan.json"; L="$TMP/no/lanes.txt"; C="$TMP/no/classify.txt"
check "n1 #10 BLOCKED+REVIEW_REQUIRED stays blocked — nothing to bypass with" $(is "$P" 10 blocked; echo $?) "landed in $(where "$P" 10)"
check "n2 … and nothing is announced about a bypass" $(! grep -q "is in main's bypass list" "$C"; echo $?) "$(cat "$C")"
check "n3 lane A behaves exactly as before for #10" $(grep -q 'A  #10  would merge main into b10 (required checks never ran on this head)' "$L"; echo $?) "$(cat "$L")"
check "n4 CONTROL #12 CLEAN is still READY" $(is "$P" 12 ready.NORMAL; echo $?) "landed in $(where "$P" 12)"

echo "── the protection read fails (unknown ⇒ today's behaviour) ──"
run_case unreadable "w12-ship-wave" ''
P="$TMP/unreadable/run/plan.json"; C="$TMP/unreadable/classify.txt"
check "u1 #10 stays blocked when main's review rule cannot be read" $(is "$P" 10 blocked; echo $?) "landed in $(where "$P" 10)"
check "u2 … and the wave says why" $(grep -q "review-bypass: could not read main's review rule" "$C"; echo $?) "$(cat "$C")"

echo "── syntax ──"
for f in "$SW/ship-wave.sh" "$SW/unblock-lanes.sh" "$0"; do
  /opt/homebrew/bin/bash -n "$f" && ok "bash -n $(basename "$f")" || bad "bash -n $(basename "$f")"
done
echo; echo "=== $PASS passed · $FAIL failed · fixtures in $TMP ==="
[ "$PASS" -gt 0 ] && [ "$FAIL" -eq 0 ]

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

# ── the merge CALL (2026-09-19) ───────────────────────────────────────────────
# The fix above taught the SWEEP and merge_one's live re-check that BLOCKED+REVIEW_REQUIRED is mergeable under the
# bypass — but the merge CALL stayed `gh pr merge --squash --delete-branch`. gh refuses a BLOCKED PR locally, before
# the API is touched, unless --admin is given ("the base branch policy prohibits the merge … add the --admin flag"),
# so the runs at 2026-09-19 00:23 and 02:23 IST printed the R11 note for #3878 and #3915 and then failed on that
# refusal: zero merges for six hours. --admin ALSO skips required status checks, so these cases pin both halves —
# it is on exactly when the fence holds (bypass read + live BLOCKED/REVIEW_REQUIRED + the wave's verdict OK) and
# off everywhere else, including on an ordinary CLEAN merge in a run where the bypass does apply.
# Harness: the same wave.sh copy is SOURCED and the REAL run_once/merge_one run; gh is a stub that records every
# invocation, so the assertion is on the recorded command line itself, not on a message about it.
MTMP="$TMP/mergecall"; MWT="$MTMP/local/.claude/worktrees/ship-main"
git init -q --bare "$MTMP/origin.git"
git clone -q -o jicate "$MTMP/origin.git" "$MWT" 2>/dev/null
mkdir -p "$MWT/docs"; echo "# 0" > "$MWT/docs/zero.md"
git -C "$MWT" add -A >/dev/null
git -C "$MWT" -c user.name=t -c user.email=t@t commit -q -m genesis
git -C "$MWT" push -q jicate HEAD:main 2>/dev/null

# merge_case <name> <bypass users JSON> <live state line> <reviewDecision> <red check names> <pending check names>
merge_case() {
  # two statements on purpose: `local a=$1 b=$a` expands $a BEFORE the builtin assigns it, so b would be empty
  local name="$1"; local S="$MTMP/$name"; mkdir -p "$S/home/.config/obsidian/.ship-wave"
  python3 - "$S/plan.json" <<'PY'
import json, sys
row = {"number": 10, "title": "feat: thing 10", "branch": "b10", "tier": "NORMAL", "tier_reasons": [], "ci": "OK",
       "ci_names": [], "state": "CLEAN", "files": ["lib/students/format.ts"], "age_min": 90, "base": "main"}
json.dump({"stacked": [], "draft": [], "conflicted": [], "blocked": [], "waiting_ci": [], "quiet_wait": [],
           "ready": {"LOW": [], "NORMAL": [row], "HELD": []}, "clusters": {},
           "counts": {"open": 1, "ready": 1, "ready_low": 0, "ready_normal": 1, "ready_held": 0, "conflicted": 0,
                      "blocked": 0, "waiting_ci": 0, "quiet_wait": 0, "draft": 0, "stacked": 0, "clusters": 0}},
          open(sys.argv[1], "w"))
PY
  (
    export HOME="$S/home" MYJKKN_LOCAL="$MTMP/local"; cd "$ROOT" || exit 9
    export ME="w12-ship-wave" BYPASS_USERS="$2" ST10="$3" REV10="$4" RED10="$5" PEND10="$6"
    TRACE="$S/trace.txt"; : > "$TRACE"; export TRACE FIXPLAN="$S/plan.json" MWT
    set -- go --approve-normal
    . "$TMP/wave.sh" >/dev/null 2>&1
    # the real review_bypass_read runs here, against the stubbed gh — REVIEW_BYPASS is never set by hand
    sweep() { cp "$FIXPLAN" "$1/plan.json"; review_bypass_read; }
    unblock_lanes() { :; }; dispatch_clusters() { :; }; alive_helpers() { printf 0; }; rebase_remaining() { return 0; }
    apply_migrations() { APPLY_RESULT="stubbed"; return 0; }
    vtok() { printf ''; }; sleep() { :; }; ask_director() { :; }; codex_second_opinion() { :; }
    gh() {
      echo "gh $*" >> "$TRACE"
      case "$*" in
        "auth token"|"auth status") return 0;;
        "api user --jq .login") printf '%s\n' "$ME";;
        "api repos/"*"required_pull_request_reviews")
          [ -n "$BYPASS_USERS" ] || return 1
          printf '{"required_approving_review_count":1,"bypass_pull_request_allowances":{"users":%s}}\n' "$BYPASS_USERS";;
        *"--json state,mergeStateStatus"*) printf '%s\n' "$ST10";;
        *"--json reviewDecision"*) printf '%s\n' "$REV10";;
        # the merge-time failing/pending count is the only statusCheckRollup query naming IN_PROGRESS;
        # the R11 fence's own query names CANCELLED and never IN_PROGRESS — that is how the two are told apart
        *IN_PROGRESS*) [ -n "$RED10" ] && printf '%s\n' "$RED10"; [ -n "$PEND10" ] && printf '%s\n' "$PEND10";;
        *"--json statusCheckRollup"*) [ -n "$RED10" ] && printf '%s\n' "$RED10";;
        "pr merge "*) git -C "$MWT" -c user.name=t -c user.email=t@t commit -q --allow-empty -m "merged (#$3)" \
                      && git -C "$MWT" push -q jicate HEAD:main 2>/dev/null; return 0;;
        *"--json mergeCommit"*) :;;
        *"--json files"*) echo "lib/students/format.ts";;
        *"--json headRefOid"*) echo "abcdef1234567890";;
        *"pr list"*) echo 0;;
      esac; return 0
    }
    curl() { echo "curl $*" >> "$TRACE"; case "$*" in *"-o /dev/null"*) echo 401;; *) echo '{}';; esac; return 0; }
    _REDIR_DONE=1
    run_once > "$S/receipt.txt" 2>&1; echo "rc=$?" >> "$TRACE"
  )
}
merges()       { grep -c "^gh pr merge 10 " "$TMP/mergecall/$1/trace.txt"; }
admin_merges() { grep -c "^gh pr merge 10 .*--admin" "$TMP/mergecall/$1/trace.txt"; }
any_admin()    { grep -c -- "--admin" "$TMP/mergecall/$1/trace.txt"; }
NOTE='  note   #10 — review required, bypass applies, checks OK — merging with the bypass'

echo "── the merge call: --admin only behind the fence (2026-09-19) ──"
merge_case m1 '[{"login":"w12-ship-wave"}]' "OPEN BLOCKED false main" "REVIEW_REQUIRED" "" ""
check "m1 bypass + BLOCKED/REVIEW_REQUIRED + checks OK → the gh call carries --admin (#3878/#3915 would merge)" \
      $([ "$(merges m1)" -eq 1 ] && [ "$(admin_merges m1)" -eq 1 ]; echo $?) "$(grep '^gh pr merge' "$TMP/mergecall/m1/trace.txt")"
check "m2 … and the receipt says so in one line" \
      $(grep -qF -- "$NOTE" "$TMP/mergecall/m1/receipt.txt"; echo $?) "$(grep -E '#10' "$TMP/mergecall/m1/receipt.txt")"
check "m3 … and the PR actually merges" \
      $(grep -q 'MERGED NORMAL #10' "$TMP/mergecall/m1/receipt.txt"; echo $?) "$(grep -E '#10' "$TMP/mergecall/m1/receipt.txt")"

merge_case m4 '[{"login":"w12-ship-wave"}]' "OPEN BLOCKED false main" "REVIEW_REQUIRED" "Build" ""
check "m4 bypass but a non-advisory red → NOT merged, and --admin appears nowhere in the run" \
      $([ "$(merges m4)" -eq 0 ] && [ "$(any_admin m4)" -eq 0 ]; echo $?) "$(grep -E '#10' "$TMP/mergecall/m4/receipt.txt")"

merge_case m5 '[{"login":"w12-ship-wave"}]' "OPEN BLOCKED false main" "REVIEW_REQUIRED" "" "Build"
check "m5 bypass but a required check still running → NOT merged, no --admin (the wait is not skipped)" \
      $([ "$(merges m5)" -eq 0 ] && [ "$(any_admin m5)" -eq 0 ] \
        && grep -q 'HOLD   NORMAL #10 — 1 non-advisory check(s) failing/pending at merge time' "$TMP/mergecall/m5/receipt.txt"; echo $?) \
      "$(grep -E '#10' "$TMP/mergecall/m5/receipt.txt")"

merge_case m6 '[{"login":"someone-else"}]' "OPEN BLOCKED false main" "REVIEW_REQUIRED" "" ""
check "m6 no bypass → nothing merges and no --admin (a BLOCKED PR is still blocked)" \
      $([ "$(merges m6)" -eq 0 ] && [ "$(any_admin m6)" -eq 0 ]; echo $?) "$(grep -E '#10' "$TMP/mergecall/m6/receipt.txt")"

merge_case m7 '[{"login":"someone-else"}]' "OPEN CLEAN false main" "" "" ""
check "m7 no bypass, CLEAN PR → merged by the call it has always used, no --admin" \
      $([ "$(merges m7)" -eq 1 ] && [ "$(any_admin m7)" -eq 0 ]; echo $?) "$(grep '^gh pr merge' "$TMP/mergecall/m7/trace.txt")"

merge_case m8 '[{"login":"w12-ship-wave"}]' "OPEN CLEAN false main" "REVIEW_REQUIRED" "" ""
check "m8 CLEAN PR in a run where the bypass DOES apply → still no --admin (the flag does not leak)" \
      $([ "$(merges m8)" -eq 1 ] && [ "$(any_admin m8)" -eq 0 ]; echo $?) "$(grep '^gh pr merge' "$TMP/mergecall/m8/trace.txt")"

echo "── syntax ──"
for f in "$SW/ship-wave.sh" "$SW/unblock-lanes.sh" "$0"; do
  /opt/homebrew/bin/bash -n "$f" && ok "bash -n $(basename "$f")" || bad "bash -n $(basename "$f")"
done
echo; echo "=== $PASS passed · $FAIL failed · fixtures in $TMP ==="
[ "$PASS" -gt 0 ] && [ "$FAIL" -eq 0 ]

#!/opt/homebrew/bin/bash
# tests/test-advisory-pending.sh — regression proof for R16 (Director 2026-09-19, amended: "PR build stays as
# ADVICE, never required"): a check named in $STATE/advisory-checks is advice, and advice that has NOT FINISHED
# is still advice. merge_one already honoured that for red AND pending checks (its failing/pending count pipes the
# names through grep -vxF -f advisory-checks); the SWEEP honoured it only for red and cancelled ones, so on
# 2026-09-19 05:19 five PRs sat out the run on a check that is not a gate:
#   #3889 tier HELD   ci PENDING ci_names ['Production Build']  state UNSTABLE  → "blocked"
#         (all 4 required checks green, the Director's approval already given → merge_tiers then refused it
#          with "not in this run's ready-HELD list")
#   #3890 tier NORMAL ci PENDING ['Production Build'] · #3928, #3918 tier HELD, same · #3926 tier NORMAL
#         ci PENDING ['Production Build', 'Claude Review (advisory)']
# The Production Build takes 30-60 minutes, is often cancelled by the runner, and re-runs every time a draft is
# marked Ready — so every PR waited up to an hour on advice. Fixed in classify()'s ci(): the pending list is
# filtered by the same ADVISORY set the red list already used. Nothing else moves: a NON-advisory pending check
# still holds the PR, and with the advisory file missing or empty the behaviour is exactly today's.
#
# Run from the worktree root:  bash scripts/ship-wave/tests/test-advisory-pending.sh
# Harness as in test-review-bypass.sh (part 1: classify() on a prs.json fixture) and test-mergegate-port.sh
# (part 2: the real run_once, with sweep() calling the REAL classify, gh a stub, a temp git mirror, temp HOME).
# Nothing is merged for real and the live ~/.config/obsidian/.ship-wave is never touched.
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"

ROOT=$(cd "$(dirname "$0")/../../.." && pwd); SW="$ROOT/scripts/ship-wave"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-advpending.XXXXXX")
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf 'FAIL  %s\n      %s\n' "$1" "${2:-}"; }
check() { if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1" "$3"; fi; }
has()    { grep -qF -- "$2" "$1"; }

awk '/^if \[ -n "\$GOAL" \]; then$/ {exit} {print}' "$SW/ship-wave.sh" > "$TMP/wave.sh"
for f in "$SW"/*.sh "$SW"/*.py; do [ "$(basename "$f")" = ship-wave.sh ] || ln -s "$f" "$TMP/$(basename "$f")"; done
grep -q '^classify() {' "$TMP/wave.sh" || { echo "FAIL  could not extract classify from ship-wave.sh"; exit 1; }
grep -q '^run_once() {' "$TMP/wave.sh" || { echo "FAIL  could not extract run_once from ship-wave.sh"; exit 1; }

ADV="$(printf 'Production Build\nClaude Review (advisory)')"

# ── the fixture: every shape the 05:19 plan.json showed, plus the controls ────
python3 - "$TMP/prs.json" <<'PY'
import json, sys, datetime
old = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=6)).isoformat().replace("+00:00", "Z")
def pr(n, state, checks, files=("app/x.ts",)):
    return {"number": n, "title": f"feat: thing {n}", "mergeStateStatus": state, "reviewDecision": "",
            "isDraft": False, "headRefName": f"b{n}", "baseRefName": "main", "updatedAt": old, "headCommittedAt": old,
            "files": [{"path": f} for f in files], "statusCheckRollup": checks}
def chk(name, status, concl=None): return {"name": name, "status": status, "conclusion": concl}
tc_ok    = chk("TypeCheck (PR-scoped)", "COMPLETED", "SUCCESS")
vt_ok    = chk("Vitest (gated subset — lib + services)", "COMPLETED", "SUCCESS")
build_ip = chk("Production Build", "IN_PROGRESS")                  # the 30-60 min advisory job
build_q  = chk("Production Build", "QUEUED")
rev_ip   = chk("Claude Review (advisory)", "IN_PROGRESS")
tc_ip    = chk("TypeCheck (PR-scoped)", "IN_PROGRESS")             # a REQUIRED check still running
tc_red   = chk("TypeCheck (PR-scoped)", "COMPLETED", "FAILURE")
build_x  = chk("Production Build", "COMPLETED", "CANCELLED")
vt_x     = chk("Vitest (gated subset — lib + services)", "COMPLETED", "CANCELLED")
MIG = ("supabase/migrations/20260919000000_thing.sql",)
json.dump([
  pr(101, "UNSTABLE", [tc_ok, vt_ok, build_ip]),               # p1  — the #3889/#3890 shape
  pr(109, "CLEAN",    [tc_ok, vt_ok, build_q, rev_ip]),        # p1b — the #3926 shape (two advisory, both pending)
  pr(102, "UNSTABLE", [vt_ok, build_ip, tc_ip]),               # p2  — advisory pending + a REQUIRED one pending
  pr(112, "CLEAN",    [vt_ok, build_ip, tc_ip]),               # p2b — same, from a CLEAN state
  pr(103, "CLEAN",    [vt_ok, tc_ip]),                         # p3  — non-advisory pending only (regression guard)
  pr(104, "UNSTABLE", [tc_ok, vt_ok, build_ip], MIG),          # p5  — the #3889 case: HELD + advisory pending
  pr(105, "CLEAN",    [tc_ok, vt_ok]),                         # control — all green, untouched by this change
  pr(106, "UNSTABLE", [vt_ok, build_ip, tc_red]),              # control — a real red still blocks
  pr(107, "UNSTABLE", [vt_ok, build_x]),                       # control — advisory CANCELLED (2026-09-14 rule)
  pr(108, "CLEAN",    [tc_ok, vt_x]),                          # control — UNVERIFIED: a REQUIRED check cancelled
], open(sys.argv[1], "w"))
PY

# ── part 1: classification ───────────────────────────────────────────────────
# run_case <name> <advisory-checks content | "-" no file | "" empty file>
run_case() {
  local S="$TMP/$1"; mkdir -p "$S/home/.config/obsidian/.ship-wave" "$S/run"
  local ST="$S/home/.config/obsidian/.ship-wave"
  case "$1" in *) :;; esac
  if [ "$2" = "-" ]; then :; elif [ -z "$2" ]; then : > "$ST/advisory-checks"; else printf '%s\n' "$2" > "$ST/advisory-checks"; fi
  (
    export HOME="$S/home"; cd "$ROOT" || exit 9
    set -- plan
    . "$TMP/wave.sh" >/dev/null 2>&1
    gh() { return 0; }                       # no login, no protection rule ⇒ no review bypass in play
    sleep() { :; }; ask_director() { :; }
    classify "$TMP/prs.json" "$S/run/plan.json" > "$S/classify.txt" 2>&1
  )
}
where() {   # prints e.g. "ready.NORMAL" / "blocked" / "waiting_ci"
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
ciof() {    # prints e.g. "PENDING TypeCheck (PR-scoped)"  — the ci verdict and names the sweep recorded
  python3 - "$1" "$2" <<'PY'
import json, sys
p = json.load(open(sys.argv[1])); n = int(sys.argv[2])
rows = [r for k in ("blocked","waiting_ci","quiet_wait","conflicted","draft","stacked") for r in p[k]] \
     + [r for t in ("LOW","NORMAL","HELD") for r in p["ready"][t]]
for r in rows:
    if r["number"] == n: print(r["ci"], "|".join(r["ci_names"])); raise SystemExit
print("nowhere")
PY
}
is()   { [ "$(where "$1" "$2")" = "$3" ]; }
isci() { [ "$(ciof  "$1" "$2")" = "$3" ]; }

echo "── p1-p3 · the advisory list is honoured for PENDING checks, exactly as for red ones ──"
run_case adv "$ADV"
P="$TMP/adv/run/plan.json"; C="$TMP/adv/classify.txt"
check "p1 #101 UNSTABLE, only-pending check is advisory (Production Build IN_PROGRESS) → READY NORMAL" \
      $(is "$P" 101 ready.NORMAL; echo $?) "landed in $(where "$P" 101)  ci=$(ciof "$P" 101)"
check "p1 … and its ci reads OK with no names — the advisory run is not recorded as a blocker" \
      $(isci "$P" 101 "OK "; echo $?) "ci=$(ciof "$P" 101)"
check "p1 … and it is printed as READY, like any green PR" $(has "$C" "READY NORMAL #101"; echo $?) "$(cat "$C")"
check "p1b #109 CLEAN with TWO advisory checks pending (QUEUED + IN_PROGRESS) → READY NORMAL" \
      $(is "$P" 109 ready.NORMAL; echo $?) "landed in $(where "$P" 109)  ci=$(ciof "$P" 109)"
check "p2 #102 advisory pending AND a required check pending → still waits (blocked, as before)" \
      $(is "$P" 102 blocked && isci "$P" 102 "PENDING TypeCheck (PR-scoped)"; echo $?) "landed in $(where "$P" 102)  ci=$(ciof "$P" 102)"
check "p2b #112 the same mix from CLEAN → waiting_ci, named by the REQUIRED check only" \
      $(is "$P" 112 waiting_ci && isci "$P" 112 "PENDING TypeCheck (PR-scoped)"; echo $?) "landed in $(where "$P" 112)  ci=$(ciof "$P" 112)"
check "p3 #103 non-advisory pending only → waiting_ci exactly as before (regression guard)" \
      $(is "$P" 103 waiting_ci && isci "$P" 103 "PENDING TypeCheck (PR-scoped)"; echo $?) "landed in $(where "$P" 103)  ci=$(ciof "$P" 103)"
check "p5a #104 HELD with only an advisory check pending → READY HELD (the #3889 case)" \
      $(is "$P" 104 ready.HELD; echo $?) "landed in $(where "$P" 104)  ci=$(ciof "$P" 104)"
check "c1 CONTROL #105 all green → READY NORMAL, untouched" $(is "$P" 105 ready.NORMAL; echo $?) "landed in $(where "$P" 105)"
check "c2 CONTROL #106 red on a required check → blocked, named by the red one" \
      $(is "$P" 106 blocked && isci "$P" 106 "FAIL TypeCheck (PR-scoped)"; echo $?) "landed in $(where "$P" 106)  ci=$(ciof "$P" 106)"
check "c3 CONTROL #107 advisory check CANCELLED → READY NORMAL (the 2026-09-14 rule, unchanged)" \
      $(is "$P" 107 ready.NORMAL; echo $?) "landed in $(where "$P" 107)  ci=$(ciof "$P" 107)"
check "c4 CONTROL #108 a REQUIRED check cancelled → UNVERIFIED, still waiting (not this defect)" \
      $(is "$P" 108 waiting_ci && isci "$P" 108 "UNVERIFIED Vitest (gated subset — lib + services)"; echo $?) "landed in $(where "$P" 108)  ci=$(ciof "$P" 108)"

echo "── p4 · no advisory list ⇒ today's behaviour, unchanged ──"
run_case noadv "-"
Q="$TMP/noadv/run/plan.json"
check "p4 no advisory-checks file: #101 stays blocked on 'Production Build'" \
      $(is "$Q" 101 blocked && isci "$Q" 101 "PENDING Production Build"; echo $?) "landed in $(where "$Q" 101)  ci=$(ciof "$Q" 101)"
check "p4 … #109 stays waiting_ci, #104 stays blocked" \
      $(is "$Q" 109 waiting_ci && is "$Q" 104 blocked; echo $?) "#109 $(where "$Q" 109) · #104 $(where "$Q" 104)"
check "p4 … #103 and #105 are unaffected either way" \
      $(is "$Q" 103 waiting_ci && is "$Q" 105 ready.NORMAL; echo $?) "#103 $(where "$Q" 103) · #105 $(where "$Q" 105)"
run_case emptyadv ""
E="$TMP/emptyadv/run/plan.json"
check "p4 EMPTY advisory-checks file: same as no file — #101 blocked, #109 waiting_ci" \
      $(is "$E" 101 blocked && is "$E" 109 waiting_ci; echo $?) "#101 $(where "$E" 101) · #109 $(where "$E" 109)"

# ── part 2: does it actually merge? (real run_once, real classify, stubbed gh) ─
export MYJKKN_LOCAL="$TMP/local"; WTDIR="$MYJKKN_LOCAL/.claude/worktrees/ship-main"
git init -q --bare "$TMP/origin.git"; mkdir -p "$(dirname "$WTDIR")"
git clone -q -o jicate "$TMP/origin.git" "$WTDIR" 2>/dev/null
gitc() { git -C "$WTDIR" -c user.name=t -c user.email=t@t "$@"; }
mkdir -p "$WTDIR/docs"; echo "# 0" > "$WTDIR/docs/zero.md"; gitc add -A >/dev/null; gitc commit -q -m genesis; gitc push -q jicate HEAD:main 2>/dev/null

# scenario <name> <advisory content|"-"> <approve-held content|""> <args…>
# per-PR behaviour via env: ST_<n> = the live state line (default "OPEN CLEAN false main" — the advisory build
# finished between the sweep and the merge), RED_<n> = names the failures-only query answers,
# PENDING_<n> = names the merge-time failing-OR-pending count answers.
scenario() {
  local name="$1" adv="$2" held="$3"; shift 3
  local S="$TMP/$name"; mkdir -p "$S/home/.config/obsidian/.ship-wave"
  local ST="$S/home/.config/obsidian/.ship-wave"
  [ "$adv" = "-" ] || printf '%s\n' "$adv" > "$ST/advisory-checks"
  [ -n "$held" ] && printf '%s\n' "$held" > "$ST/approve-held"
  (
    export HOME="$S/home"; cd "$ROOT" || exit 9
    TRACE="$S/trace.txt"; : > "$TRACE"; export TRACE FIXPRS="$TMP/prs.json" WTDIR
    set -- "$@"
    . "$TMP/wave.sh" >/dev/null 2>&1
    sweep() { classify "$FIXPRS" "$1/plan.json"; }     # the REAL classifier is what is under test here
    unblock_lanes() { :; }; dispatch_clusters() { :; }; alive_helpers() { printf 0; }; rebase_remaining() { return 0; }
    apply_migrations() { APPLY_RESULT="stubbed"; return 0; }
    vtok() { printf ''; }; sleep() { :; }; ask_director() { :; }
    gh() {
      echo "gh $*" >> "$TRACE"
      local v
      case "$*" in
        "auth token"|"auth status") return 0;;
        *"--json state,mergeStateStatus"*) v="ST_$3"; echo "${!v:-OPEN CLEAN false main}";;
        # the two statusCheckRollup queries differ: merge_one's count asks about IN_PROGRESS too,
        # advisory_only()'s and R11's ask about failures only. Answer each from its own variable.
        *"--json statusCheckRollup"*IN_PROGRESS*) v="PENDING_$3"; [ -n "${!v:-}" ] && printf '%s\n' "${!v}";;
        *"--json statusCheckRollup"*) v="RED_$3"; [ -n "${!v:-}" ] && printf '%s\n' "${!v}";;
        *"--json mergeCommit"*) :;;
        *"--json files"*) echo "app/p$3.ts";;
        *"--json headRefOid"*) echo "abcdef1234567890";;
        *"pr list"*) echo 0;;
      esac; return 0
    }
    curl() { echo "curl $*" >> "$TRACE"; case "$*" in *"-o /dev/null"*) echo 401;; *) echo '{}';; esac; return 0; }
    _REDIR_DONE=1
    run_once > "$S/receipt.txt" 2>&1; echo "rc=$?" >> "$TRACE"
  )
}
merged() { grep -c "^gh pr merge $2 " "$TMP/$1/trace.txt"; }

echo "── p1 · with --approve-normal the advisory-pending PR actually merges ──"
PENDING_101="Production Build" PENDING_109="Production Build" scenario m1 "$ADV" "" go --approve-normal
check "p1m #101 reached the merge and merged (its advisory name is filtered from the merge-time count too)" \
      $([ "$(merged m1 101)" -eq 1 ] && has "$TMP/m1/receipt.txt" "MERGED NORMAL #101"; echo $?) "$(grep -E '#101' "$TMP/m1/receipt.txt")"
check "p1m #109 (two advisory checks pending) merged as well" $([ "$(merged m1 109)" -eq 1 ]; echo $?) "$(grep -E '#109' "$TMP/m1/receipt.txt")"
check "p2m CONTROL #102 and #103 (a required check pending) were never merged" \
      $([ "$(merged m1 102)" -eq 0 ] && [ "$(merged m1 103)" -eq 0 ]; echo $?) "#102=$(merged m1 102) #103=$(merged m1 103)"
check "p2m CONTROL #106 (red on a required check) was never merged" $([ "$(merged m1 106)" -eq 0 ]; echo $?) "#106=$(merged m1 106)"
check "p2m CONTROL #108 (UNVERIFIED — a required check cancelled) was never merged" $([ "$(merged m1 108)" -eq 0 ]; echo $?) "#108=$(merged m1 108)"

echo "── p5 · the #3889 case: a HELD PR with its number in approve-held ──"
PENDING_104="Production Build" scenario m2 "$ADV" "104" go
check "p5 #104 is listed READY HELD" $(has "$TMP/m2/receipt.txt" "READY HELD   #104"; echo $?) "$(grep -E 'HELD' "$TMP/m2/receipt.txt")"
check "p5 … and merges, instead of 'not in this run's ready-HELD list'" \
      $([ "$(merged m2 104)" -eq 1 ] && has "$TMP/m2/receipt.txt" "MERGED HELD #104" \
        && ! grep -qF "HELD #104 — not in this run's ready-HELD list" "$TMP/m2/receipt.txt"; echo $?) "$(grep -E '#104' "$TMP/m2/receipt.txt")"
check "p5 … and no NORMAL PR merged on a HELD-only approval" $([ "$(merged m2 101)" -eq 0 ]; echo $?) "#101=$(merged m2 101)"

echo "── p4 · with no advisory list the merge path is unchanged ──"
PENDING_101="Production Build" scenario m3 "-" "104" go --approve-normal
check "p4m #101 never merges without the advisory list" $([ "$(merged m3 101)" -eq 0 ]; echo $?) "#101=$(merged m3 101)"
check "p4m #104 is refused with 'not in this run's ready-HELD list'" \
      $([ "$(merged m3 104)" -eq 0 ] && has "$TMP/m3/receipt.txt" "HOLD   HELD #104 — not in this run's ready-HELD list, refusing"; echo $?) "$(grep -E '#104' "$TMP/m3/receipt.txt")"
check "p4m CONTROL #105 (all green) still merges — the run is not dead, the advisory PRs are just held" \
      $([ "$(merged m3 105)" -eq 1 ]; echo $?) "#105=$(merged m3 105)"

echo "── guard · the sweep never overrides merge_one's live re-check ──"
# out of scope for this fix on purpose: if the advisory build is STILL running at merge time GitHub may still say
# UNSTABLE, and advisory_only() looks at failures only, so merge_one holds on the state. The sweep fix must not
# force that merge — it only stops the wave from parking the PR for an hour before it ever gets there.
ST_101="OPEN UNSTABLE false main" PENDING_101="Production Build" scenario m4 "$ADV" "" go --approve-normal
check "g1 #101 READY in the plan but UNSTABLE at merge time → HOLD on the state, not merged" \
      $([ "$(merged m4 101)" -eq 0 ] && has "$TMP/m4/receipt.txt" "HOLD   NORMAL #101 — state now 'OPEN UNSTABLE false main'"; echo $?) "$(grep -E '#101' "$TMP/m4/receipt.txt")"

echo "── syntax ──"
for f in "$SW/ship-wave.sh" "$0"; do /opt/homebrew/bin/bash -n "$f" && ok "bash -n $(basename "$f")" || bad "bash -n $(basename "$f")"; done
echo; echo "=== $PASS passed · $FAIL failed · fixtures in $TMP ==="
[ "$PASS" -gt 0 ] && [ "$FAIL" -eq 0 ]

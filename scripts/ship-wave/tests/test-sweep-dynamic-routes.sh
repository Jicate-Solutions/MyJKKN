#!/opt/homebrew/bin/bash
# tests/test-sweep-dynamic-routes.sh — regression proof for wave bug (g), found 2026-09-11:
#   the post-deploy sweep's L1/L2 lists dropped every path holding a '[' (grep -v '\['), so a deploy that changed only
#   dynamic routes and pages reported "L2 0 ok · 0 fail of 0 routes" and "L1 no page changed" — a pass nobody had run.
#   Fixed: L2 probes a dynamic API route with a zero UUID in each [param] segment (401/403/404/405 = pass, 5xx = FAIL);
#   L1, which cannot load a page without a real id, says 'skipped N dynamic paths' instead of a bare zero.
#
# Run from the worktree root:  bash scripts/ship-wave/tests/test-sweep-dynamic-routes.sh
# Same harness as test-freeze-classes.sh: a copy of ship-wave.sh without its trailing dispatcher is SOURCED (stage 5 is
# the real code); gh / curl are recording stubs; Vercel answers READY; jicate/main is a temp git repo. Temp HOME per case.
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"

ROOT=$(cd "$(dirname "$0")/../../.." && pwd); SW="$ROOT/scripts/ship-wave"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-dynroutes.XXXXXX")
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf 'FAIL  %s\n      %s\n' "$1" "${2:-}"; }
check() { if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1" "$3"; fi; }
has()    { grep -qF -- "$2" "$1"; }
hasnot() { ! grep -qF -- "$2" "$1"; }

awk '/^if \[ -n "\$GOAL" \]; then$/ {exit} {print}' "$SW/ship-wave.sh" > "$TMP/wave.sh"
for f in "$SW"/*.sh "$SW"/*.py; do [ "$(basename "$f")" = ship-wave.sh ] || ln -s "$f" "$TMP/$(basename "$f")"; done
grep -q '^run_once() {' "$TMP/wave.sh" || { echo "FAIL  could not extract run_once from ship-wave.sh"; exit 1; }

export MYJKKN_LOCAL="$TMP/local"; WTDIR="$MYJKKN_LOCAL/.claude/worktrees/ship-main"
git init -q --bare "$TMP/origin.git"; mkdir -p "$(dirname "$WTDIR")"
git clone -q -o jicate "$TMP/origin.git" "$WTDIR" 2>/dev/null
gitc() { git -C "$WTDIR" -c user.name=t -c user.email=t@t "$@"; }
mkdir -p "$WTDIR/docs"; echo "# 0" > "$WTDIR/docs/zero.md"; gitc add -A >/dev/null; gitc commit -q -m genesis; gitc push -q jicate HEAD:main 2>/dev/null
SHA0=$(gitc rev-parse HEAD)

python3 - "$TMP/plan.json" <<'PY'
import json, sys
row = {"number": 2, "title": "feat: students", "branch": "b2", "tier": "NORMAL", "tier_reasons": [], "ci": "OK", "ci_names": [],
       "state": "CLEAN", "files": [], "age_min": 90, "base": "main"}
json.dump({"stacked": [], "draft": [], "conflicted": [], "blocked": [], "waiting_ci": [], "quiet_wait": [],
           "ready": {"LOW": [], "NORMAL": [row], "HELD": []}, "clusters": {},
           "counts": {"open": 1, "ready": 1, "ready_low": 0, "ready_normal": 1, "ready_held": 0, "conflicted": 0, "blocked": 0,
                      "waiting_ci": 0, "quiet_wait": 0, "draft": 0, "stacked": 0, "clusters": 0}}, open(sys.argv[1], "w"))
PY

# scenario <name> <http code the site answers> <files #2 changed, one per line>
scenario() {
  local name="$1" code="$2" files="$3"; local S="$TMP/$name"; mkdir -p "$S/home/.config/obsidian/.ship-wave"
  (
    export HOME="$S/home"; cd "$ROOT" || exit 9
    TRACE="$S/trace.txt"; : > "$TRACE"; export TRACE WTDIR CODE="$code" FILES="$files" POSTED="$S/posted" SHA0 TMP
    set -- go --approve-normal
    . "$TMP/wave.sh" >/dev/null 2>&1
    sweep() { cp "$TMP/plan.json" "$1/plan.json"; }
    unblock_lanes() { :; }; dispatch_clusters() { :; }; alive_helpers() { printf 0; }; rebase_remaining() { return 0; }
    apply_migrations() { APPLY_RESULT="stubbed"; return 0; }
    vtok() { printf tok; }; sleep() { :; }; ask_director() { :; }
    gh() {
      echo "gh $*" >> "$TRACE"
      case "$*" in
        "auth token"|"auth status") return 0;;
        *"--json state,mergeStateStatus"*) echo "OPEN CLEAN false main";;
        *"--json statusCheckRollup"*) :;;
        "pr merge "*) git -C "$WTDIR" -c user.name=t -c user.email=t@t commit -q --allow-empty -m "merged (#$3)" && git -C "$WTDIR" push -q jicate HEAD:main 2>/dev/null; return 0;;
        *"--json mergeCommit"*) :;;
        *"--json files"*) printf '%s\n' "$FILES";;
        *"--json headRefOid"*) echo "abcdef1234567890";;
        *"pr list"*) echo 0;;
      esac; return 0
    }
    curl() {
      echo "curl $*" >> "$TRACE"
      case "$*" in
        *"-X POST"*) : > "$POSTED"; echo '{"job":{"id":"job-1"}}';;
        *"v6/deployments"*)
          if [ -f "$POSTED" ]; then printf '{"deployments":[{"uid":"dpl_new","readyState":"READY","meta":{"githubCommitSha":"%s"}}]}' "$(git -C "$WTDIR" rev-parse jicate/main)"
          else printf '{"deployments":[{"uid":"dpl_old","readyState":"READY","meta":{"githubCommitSha":"%s"}}]}' "$SHA0"; fi;;
        *"-o /dev/null"*) echo "$CODE";;
      esac; return 0
    }
    _REDIR_DONE=1
    run_once > "$S/receipt.txt" 2>&1; echo "rc=$?" >> "$TRACE"
  )
}
Z="00000000-0000-0000-0000-000000000000"

echo "── only dynamic paths changed, the site answers 404 for the zero id ──"
scenario dyn404 404 "$(printf '%s\n' 'app/api/students/[id]/route.ts' 'app/(routes)/admin/students/[id]/page.tsx')"
R="$TMP/dyn404/receipt.txt"; TR="$TMP/dyn404/trace.txt"
check "g0 harness: the deploy went READY, so stage 5 ran" $(has "$R" "deployment dpl_new → READY"; echo $?) "$(grep -E 'deploy|L1|L2' "$R")"
check "g1 L2 probed the dynamic route with a zero UUID in its [id] segment" $(has "$TR" "https://www.jkkn.ai/api/students/$Z"; echo $?) "$(grep -- '-o /dev/null' "$TR")"
check "g2 404 on the zero id is a PASS: 'L2 1 ok · 0 fail of 1 routes'" $(has "$R" "L2 1 ok · 0 fail of 1 routes"; echo $?) "$(grep -E 'L2' "$R")"
check "g3 never the bare zero: no 'of 0 routes' line" $(hasnot "$R" "of 0 routes"; echo $?) "$(grep -E 'L2' "$R")"
check "g4 L1 names what it could not load: 'skipped 1 dynamic path'" $(grep -qE 'L1 .*skipped 1 dynamic path' "$R"; echo $?) "$(grep -E 'L1' "$R")"
check "g5 not frozen (404 is a pass for a zero id)" $([ ! -e "$TMP/dyn404/home/.config/obsidian/.ship-wave/FROZEN" ]; echo $?) "$(cat "$TMP/dyn404/home/.config/obsidian/.ship-wave/FROZEN" 2>/dev/null)"

echo "── a catch-all and a nested param, the site answers 500 ──"
scenario dyn500 500 "$(printf '%s\n' 'app/api/files/[...path]/route.ts' 'app/api/orgs/[orgId]/members/[memberId]/route.ts')"
R="$TMP/dyn500/receipt.txt"; TR="$TMP/dyn500/trace.txt"; FZ="$TMP/dyn500/home/.config/obsidian/.ship-wave/FROZEN"
check "g6 both segments of a nested route get the zero UUID" $(has "$TR" "https://www.jkkn.ai/api/orgs/$Z/members/$Z"; echo $?) "$(grep -- '-o /dev/null' "$TR")"
check "g7 a catch-all [...path] segment gets it too" $(has "$TR" "https://www.jkkn.ai/api/files/$Z"; echo $?) "$(grep -- '-o /dev/null' "$TR")"
check "g8 5xx on a dynamic route is a FAIL: 'L2 0 ok · 2 fail of 2 routes'" $(has "$R" "L2 0 ok · 2 fail of 2 routes"; echo $?) "$(grep -E 'L2' "$R")"
check "g9 … and the wave freezes on it, naming the PR that touched the route file" $(grep -q 'post-deploy sweep failed' "$FZ" 2>/dev/null && grep -q '#2' "$FZ"; echo $?) "$(cat "$FZ" 2>&1)"

echo "── controls ──"
scenario st401 401 "app/api/x/route.ts"
R="$TMP/st401/receipt.txt"
check "c1 CONTROL a static route answering 401 is still '1 ok · 0 fail of 1 routes'" $(has "$R" "L2 1 ok · 0 fail of 1 routes"; echo $?) "$(grep -E 'L2' "$R")"
scenario st404 404 "app/api/x/route.ts"
R="$TMP/st404/receipt.txt"
check "c2 CONTROL a STATIC route answering 404 is not a pass (it should exist after the deploy): WARN, 0 ok" $(has "$R" "L2 WARN /api/x → 404" && has "$R" "L2 0 ok · 0 fail of 1 routes"; echo $?) "$(grep -E 'L2' "$R")"
scenario none 401 "lib/students/format.ts"
R="$TMP/none/receipt.txt"
check "c3 CONTROL no route and no page changed → says so, no 'skipped' line" $(hasnot "$R" "skipped" && grep -qE 'L1 no page changed' "$R"; echo $?) "$(grep -E 'L1|L2' "$R")"

echo "── syntax ──"
for f in "$SW/ship-wave.sh" "$0"; do /opt/homebrew/bin/bash -n "$f" && ok "bash -n $(basename "$f")" || bad "bash -n $(basename "$f")"; done
echo; echo "=== $PASS passed · $FAIL failed · fixtures in $TMP ==="
[ "$PASS" -gt 0 ] && [ "$FAIL" -eq 0 ]

#!/bin/bash
# scripts/ship-wave/ship-wave.sh — W12 🚀 "Ship MyJKKN": drain the open-PR count toward ZERO.
#
# WHY (Director 2026-09-05): ~30 fleet tabs each build something in MyJKKN and he was
# hand-typing "merge #a #b, fire the deploy hook" into each one. The goal of this wave is
# that the number of pending PRs stays at zero. /admin/orchestration is the system of
# record (merge guard, deploy lock, audit log); this script is the fleet's hands: it sweeps
# every open PR, sorts by readiness and RISK TIER, dispatches a fleet tab per conflict
# cluster, merges what policy allows, fires the deploy hook, and runs a three-layer sweep
# on what shipped. One receipt + one HTML report per round. Lives in the repo so the policy
# and the tool that applies it are reviewed together (PR #3289).
#
# RISK TIERS (Director's policy, decided by interview 2026-09-05 11:12–11:30 —
# same rules as lib/services/orchestration/risk-tier.ts):
#   HELD   money / grades / any migration / UNREADABLE file list → merged ONLY when listed in --approve-held "n,m"
#   LOW    docs, types, lint, tests only                          → merged UNATTENDED in `go` mode (the ONLY auto tier)
#   NORMAL everything else                                        → merged only with --approve-normal (his one tap)
#   The standing no-auto-merge rule is overridden for LOW ONLY, on record here (Director, 2026-09-05).
#   STANDING RUN (Director 2026-09-06 06:31, by interview): launchd job com.omm.myjkkn-ship-wave fires
#   `go --goal --approve-normal --max-dispatch 2` every 2 hours (xx:23). So NORMAL merges UNATTENDED when its
#   checks are green — a second, explicit override of the no-auto-merge rule. HELD (money / grades / any
#   migration) still needs his number in $STATE/approve-held. Helper tabs: at most 2 per round.
#
# EDGE RULES (same interview):
#   • a PR updated in the last QUIET_MIN (30) minutes is left alone — its author may still be typing
#   • after each merge the conflict list is re-read; a PR that just turned DIRTY gets a helper tab this round
#   • deploy ERROR → FREEZE: marker file written, later rounds merge NOTHING until `--unfreeze`
#   • post-deploy sweep finds a broken page → FREEZE, with page + role + the PR that touched it
#   • trigger is manual ("W12"); `--goal` loops rounds until open PRs == 0 or GOAL_ROUNDS (6) — a goal loop
#   • a goal run fires ONE production build at its end for everything it merged (Director 2026-09-06 — Vercel minutes)
#   • HELD approvals arrive as numbers the Director replies with in the fleet tab → `--approve-held`
#
# USAGE   ship-wave.sh                 # plan (dry run) — sweep + report, changes nothing
#         ship-wave.sh go              # one round: dispatch helpers + merge LOW + deploy + sweep
#         ship-wave.sh go --goal       # goal loop: rounds until open==0 or 6 rounds (what "W12" means)
#         ship-wave.sh go --approve-normal            # …and merge every ready NORMAL PR
#         ship-wave.sh go --approve-held "3101,3102"  # …and these specific HELD PRs (or one number per line in $STATE/approve-held)
#         --max-dispatch N   conflict clusters to send fleet tabs for per round (default 3; 0 = none)
#         --no-deploy        merge but do not fire the hook       --no-sweep   skip the post-deploy sweep
#         --only N,M         restrict the whole run to these PR numbers
#         --unfreeze         clear a FREEZE after the Director has looked
# RECEIPT ~/.config/obsidian/v5-myjkkn-ship-last.txt   REPORT  <repo>/artifacts/ship-wave-<ts>.html
# REQUIRES gh (authenticated), python3, curl; tmux -L obsidian for dispatch; Vercel CLI login for deploy verdicts.
# FRONT DOOR for Claude tabs: /myjkkn-chain (W12 rows: run · approve HELD · unfreeze · conflict lane). Helper tabs are told to
# invoke it first, so they inherit the chain's rules (production source = jicate/main, pr-preflight, verification methodology).
set -uo pipefail
_CFG="$HOME/.config/obsidian"
T="/opt/homebrew/bin/tmux -L obsidian"
CLAUDE="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
REPO="Jicate-Solutions/MyJKKN"
LOCAL="${MYJKKN_LOCAL:-/Users/omm/PROJECTS/MyJKKN}"     # local checkout is far behind prod — NEVER read code from it
WT="$LOCAL/.claude/worktrees/ship-main"                  # jicate/main mirror used for the sweep + persona harness
SITE="https://www.jkkn.ai"
HOOK="${MYJKKN_DEPLOY_HOOK:-https://api.vercel.com/v1/integrations/deploy/prj_yH37MwPX0aAAUXNjZX1YlOHoowRM/Y0RfATZ0rv}"
VPROJ="prj_yH37MwPX0aAAUXNjZX1YlOHoowRM"; VTEAM="team_NKABdbcCWNZRLX7PkHx27JU5"
STATE="$_CFG/.ship-wave"; mkdir -p "$STATE/dispatched" "$STATE/nudged"
# script-global sibling-dir path. `here` is local to sweep(), so any helper called from another
# function must use THIS (2026-09-06: the L1 baseline check silently no-op'd on an empty $here —
# an empty path made the comparison print nothing, which reads exactly like "no regression").
SW_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RECEIPT="$_CFG/v5-myjkkn-ship-last.txt"; RUNLOG="$_CFG/v5-myjkkn-ship-run.log"
LOCK="$_CFG/.ship-wave.lock"; FREEZE="$STATE/FROZEN"
QUIET_MIN=30; GOAL_ROUNDS=6; GOAL_PAUSE_MIN=10
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

MODE="plan"; APPROVE_NORMAL=""; APPROVE_HELD=""; MAX_DISPATCH=3; NO_DEPLOY=""; NO_SWEEP=""; GOAL=""; ONLY=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    go|plan) MODE="$1";;
    --approve-normal) APPROVE_NORMAL=1;;
    --approve-held) APPROVE_HELD="${2:-}"; shift;;
    --max-dispatch) MAX_DISPATCH="${2:-3}"; shift;;
    --no-deploy) NO_DEPLOY=1;;
    --no-sweep) NO_SWEEP=1;;
    --goal) GOAL=1;;
    --only) ONLY="${2:-}"; shift;;
    --ledger) LEDGER_REPORT=1;;
    --policy|--guards) POLICY_SHOW=1;;
    --ratify) POLICY_RATIFY="${2:-}"; shift;;
    --unguard) UNGUARD="${2:-}"; shift;;
    --unfreeze) rm -f "$FREEZE"; echo "freeze cleared"; exit 0;;
    *) echo "unknown arg: $1"; exit 2;;
  esac; shift
done

# Director 2026-09-05 13:45: a long --approve-held list wraps when pasted from the phone/Obsidian and the
# flag silently gets no value. So approvals can also live in a FILE — one PR number per line (or comma /
# space separated); the flag and the file are merged. Approve from the phone with:
#   echo 3273 >> ~/.config/obsidian/.ship-wave/approve-held
# A HELD PR that merges is removed from the file automatically; the file is never a standing permission.
if [ -s "$STATE/approve-held" ]; then
  APPROVE_HELD="$APPROVE_HELD $(tr ',\n' '  ' < "$STATE/approve-held")"; APPROVE_HELD="${APPROVE_HELD# }"
fi

vtok() {
  # The CLI token is short-lived (auth.json carries expiresAt + refreshToken) and only the CLI refreshes it.
  # 2026-09-06 01:53: nobody had run the CLI for an hour, the token lapsed, the API answered 403, and the
  # wave polled a blank verdict for 13 minutes on a build that had succeeded. Refresh through the CLI first.
  local f="$HOME/Library/Application Support/com.vercel.cli/auth.json"
  # expiresAt is epoch SECONDS in this CLI version (not ms) — refresh when within 2 minutes of it, or if the file is unreadable
  if python3 -c "import json,sys,time;d=json.load(open(sys.argv[1]));e=d.get('expiresAt') or 0;e=e/1000 if e>1e11 else e;sys.exit(0 if e < time.time()+120 else 1)" "$f" 2>/dev/null; then
    (cd "$LOCAL" && timeout 30 vercel whoami >/dev/null 2>&1) || true
  fi
  python3 -c "import json;print(json.load(open('$f'))['token'])" 2>/dev/null
}
say() { printf '%s\n' "$*"; }
unlock() { rm -f "$LOCK/pid"; rmdir "$LOCK" 2>/dev/null; }
freeze() {
  printf '%s\t%s\n' "$(date '+%F %T')" "$*" >> "$FREEZE"
  say "  ⛔ FROZEN: $* — no further merges until: ship-wave.sh --unfreeze"
  # the wave used to stop mute here and a human had to reconstruct why from a
  # receipt that overwrote itself. Now it says what this cost last time.
  type -t ledger_on_freeze >/dev/null 2>&1 && ledger_on_freeze "$*"
  # tighten alone: what shipped in this round becomes HELD until a human clears it (policy-learning.sh)
  type -t guard_add_from_freeze >/dev/null 2>&1 && guard_add_from_freeze "$*" "${run:-}"
}

# The ledger is sourced BEFORE the single-flight lock on purpose: --ledger is a
# read-only report, and being unable to read what already went wrong *because a
# wave is currently running* is exactly backwards.
# shellcheck source=scripts/ship-wave/failure-ledger.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/failure-ledger.sh"
if [ -n "${LEDGER_REPORT:-}" ]; then ledger_report; exit 0; fi
# shellcheck source=scripts/ship-wave/policy-learning.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/policy-learning.sh"
if [ -n "${POLICY_SHOW:-}" ]; then policy_show; exit 0; fi
if [ -n "${POLICY_RATIFY:-}" ]; then policy_ratify "$POLICY_RATIFY"; exit $?; fi
if [ -n "${UNGUARD:-}" ]; then guard_remove "$UNGUARD"; exit 0; fi

# ── single-flight: two ship waves merging at once would race main ─────────────
if ! mkdir "$LOCK" 2>/dev/null; then
  pid=$(cat "$LOCK/pid" 2>/dev/null); if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then echo "another ship wave is running (pid $pid) — refusing"; exit 3; fi
  unlock; mkdir "$LOCK"
fi
echo $$ > "$LOCK/pid"; trap unlock EXIT

# ── the classifier, shared by the sweep and the post-merge re-cluster ─────────
classify() {  # $1=prs.json $2=plan.json  (ONLY / QUIET_MIN from env)
  ONLY="$ONLY" QUIET_MIN="$QUIET_MIN" GUARDS_ENV="$(guards_env 2>/dev/null)" python3 - "$1" "$2" <<'PY'
import json, sys, os, re, datetime
GUARDS = [g for g in os.environ.get("GUARDS_ENV", "").split() if g]
from collections import Counter, defaultdict
prs = json.load(open(sys.argv[1]))
only = {int(x) for x in os.environ.get("ONLY","").replace(" ","").split(",") if x}
if only: prs = [p for p in prs if p["number"] in only]
quiet = int(os.environ.get("QUIET_MIN","30")); now = datetime.datetime.now(datetime.timezone.utc)
HELD_WORDS = r"(fee|fees|billing|bill|invoice|payment|payroll|salary|refund|ledger|scholarship|score|scores|mark|marks|grade|grades|grading|result|results|exam|assessment|transcript)"
HELD_RX = re.compile(r"(^|[^a-z])" + HELD_WORDS + r"([^a-z]|$)", re.I)
LOW_RX = re.compile(r"(\.md$|^docs/|\.d\.ts$|^types/|^__tests__/|\.test\.tsx?$|\.spec\.ts$|^\.eslintrc|^\.prettierrc|^eslint\.config\.)")
def tier(p):
    files = [f["path"] for f in (p.get("files") or [])]
    if not files: return "HELD", ["file list unreadable — held for the Director"]   # interview: unknown risk = HELD
    reasons = []
    for f in files:
        if f.startswith("supabase/migrations/") or f.endswith(".sql"): reasons.append(f"migration: {f}")
        # the fleet's own tooling is not a money/grades domain: scripts/ship-wave/failure-ledger.sh is not the
        # fee ledger. The word match below is for app/lib/supabase paths (Director 2026-09-06 06:30, #3297/#3306)
        if f.startswith(("scripts/", ".claude/")): continue
        elif f.startswith(".github/workflows/"): reasons.append(f"CI gate change: {f}")   # #2724 turned main red for every PR (2026-09-05)
        elif f.startswith("__tests__/") or ".test." in f or ".spec." in f: continue         # a test cannot move money or grades
        # a money/grades word must be a WHOLE path segment (…/score/route.ts, app/(routes)/fees/…), never a fragment of a
        # filename — "summarize-routine-result.ts" held #2932 for the word "result" (2026-09-05 14:30)
        elif any(re.fullmatch(HELD_WORDS, seg, re.I) for seg in re.split(r"[/]", f)): reasons.append(f"path: {f}")
        # guards learned from a deploy/page freeze (policy-learning.sh) — checked after the tier rules, never inside them
        for g in GUARDS:
            if f == g or f.startswith(g + "/"): reasons.append(f"guard: {g} (froze the wave once — HELD until --unguard)")
    m = HELD_RX.search(p["title"] or "")
    if m: reasons.append(f"title: {m.group(2)}")
    if reasons: return "HELD", reasons[:4]
    if not p["isDraft"] and all(LOW_RX.search(f) and not f.startswith(".github/") for f in files):
        return "LOW", ["docs/types/tests only"]
    return "NORMAL", []
def ci(p):
    runs = p.get("statusCheckRollup") or []
    bad = [r.get("name") for r in runs if (r.get("conclusion") or "").upper() in ("FAILURE","TIMED_OUT","ACTION_REQUIRED","STARTUP_FAILURE","ERROR")]
    if bad: return "FAIL", bad[:3]
    pend = [r.get("name") for r in runs if (r.get("status") or "").upper() in ("IN_PROGRESS","QUEUED","PENDING","EXPECTED") or ((r.get("status") or "").upper()=="COMPLETED" and r.get("conclusion") is None)]
    if pend: return "PENDING", pend[:3]
    canc = [r.get("name") for r in runs if (r.get("conclusion") or "").upper()=="CANCELLED"]
    if canc: return "UNVERIFIED", canc[:3]   # cancelled has no verdict — the live guard treats it the same
    return "OK", []
def minutes_since(iso):
    try: return (now - datetime.datetime.fromisoformat(iso.replace("Z","+00:00"))).total_seconds()/60
    except Exception: return 1e9
plan = {"stacked":[], "draft":[], "conflicted":[], "blocked":[], "waiting_ci":[], "quiet_wait":[], "ready":{"LOW":[], "NORMAL":[], "HELD":[]}}
for p in prs:
    # age = minutes since the last real PUSH (head commit), not since anything touched the PR — a CI re-run
    # or a comment moves updatedAt and used to restart the 30-min quiet wait (Director 2026-09-05 23:40)
    t, why = tier(p); v, names = ci(p); age = minutes_since(p.get("headCommittedAt") or p.get("updatedAt",""))
    row = {"number":p["number"], "title":p["title"], "branch":p["headRefName"], "tier":t, "tier_reasons":why,
           "ci":v, "ci_names":names, "state":p["mergeStateStatus"], "files":[f["path"] for f in (p.get("files") or [])], "age_min":int(age),
           "base":p.get("baseRefName") or "?"}
    # 2026-09-05 15:30: three PRs (#2806 #3009 #3200) targeted a FEATURE branch, not main — "merging" them shipped
    # nothing (one is stranded on a closed branch with a migration the apply step could never find on main). A PR
    # whose base is not main is its author's stack, never the wave's: listed, never merged, never counted.
    if row["base"] != "main": plan["stacked"].append(row)
    elif p["isDraft"]: plan["draft"].append(row)
    elif p["mergeStateStatus"]=="DIRTY": plan["conflicted"].append(row)
    elif p["mergeStateStatus"]!="CLEAN": plan["blocked"].append(row)
    elif v!="OK": plan["waiting_ci"].append(row)
    elif age < quiet: plan["quiet_wait"].append(row)          # interview: author may still be typing
    else: plan["ready"][t].append(row)
def key(row):   # conflict clusters: PRs that touch the same module dir go to ONE tab
    c = Counter("/".join(f.split("/")[:3]) if f.startswith("app/") else "/".join(f.split("/")[:2]) for f in row["files"])
    return c.most_common(1)[0][0] if c else "misc"
clusters = defaultdict(list)
for r in plan["conflicted"]: clusters[key(r)].append(r["number"])
plan["clusters"] = dict(sorted(clusters.items(), key=lambda kv: -len(kv[1])))
plan["counts"] = {"open":len(prs), "ready":sum(len(v) for v in plan["ready"].values()), "ready_low":len(plan["ready"]["LOW"]),
                  "ready_normal":len(plan["ready"]["NORMAL"]), "ready_held":len(plan["ready"]["HELD"]), "conflicted":len(plan["conflicted"]),
                  "blocked":len(plan["blocked"]), "waiting_ci":len(plan["waiting_ci"]), "quiet_wait":len(plan["quiet_wait"]),
                  "draft":len(plan["draft"]), "stacked":len(plan["stacked"]), "clusters":len(clusters)}
json.dump(plan, open(sys.argv[2],"w"), indent=1)
c = plan["counts"]
print(f"  open={c['open']}  ready={c['ready']} (LOW {c['ready_low']} · NORMAL {c['ready_normal']} · HELD {c['ready_held']})  "
      f"conflicted={c['conflicted']} in {c['clusters']} clusters  waiting-ci={c['waiting_ci']}  quiet<{quiet}m={c['quiet_wait']}  blocked={c['blocked']}  drafts={c['draft']}  stacked(base≠main)={c['stacked']}")
for r in plan["stacked"]: print(f"  STACKED base={r['base']:<32} #{r['number']:<5} {r['title'][:50]}  (author's stack — the wave never merges it)")
for t in ("LOW","NORMAL","HELD"):
    for r in plan["ready"][t]: print(f"  READY {t:<6} #{r['number']:<5} {r['title'][:64]}" + (f"   [{'; '.join(r['tier_reasons'])}]" if t=="HELD" else ""))
for k,v in plan["clusters"].items(): print(f"  CONFLICT cluster {k:<40} {' '.join('#'+str(n) for n in v)}")
for r in plan["quiet_wait"]: print(f"  QUIET  {r['age_min']:>3}m ago #{r['number']:<5} {r['title'][:50]}")
for r in plan["waiting_ci"]: print(f"  WAIT  {r['ci']:<10} #{r['number']:<5} {r['title'][:50]}  ({', '.join(r['ci_names'])})")
PY
}

sweep() {  # $1=run dir → writes prs.json + plan.json
  # One GraphQL call for 100+ PRs × files × checks 504s at GitHub (seen 2026-09-05). So: light list
  # first (retried), then files + checks hydrated per PR in parallel with retries (hydrate.py merges).
  local i ok="" here; here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  for i in 1 2 3; do
    gh pr list --repo "$REPO" --state open --limit 200 --json number,title,mergeStateStatus,isDraft,headRefName,baseRefName,updatedAt > "$1/light.json" 2>"$1/prs.err" && ok=1 && break
    sleep $((i*5))
  done
  [ -n "$ok" ] || { say "SWEEP FAIL: $(head -c 300 "$1/prs.err")"; return 1; }
  mkdir -p "$1/pr"
  python3 -c "import json;[print(p['number']) for p in json.load(open('$1/light.json'))]" \
    | REPO="$REPO" OUT="$1/pr" xargs -P 8 -n 1 bash "$here/hydrate-one.sh"
  python3 "$here/hydrate.py" "$1" || { say "SWEEP FAIL: hydrate"; return 1; }
  classify "$1/prs.json" "$1/plan.json"
  [ -s "$1/plan.json" ] || { say "SWEEP FAIL: no plan produced"; return 1; }
}

# Director 2026-09-06 (walk-mode interview): at most 4 helper tabs ALIVE at once. --max-dispatch (≤2)
# bounds ONE ROUND; this bounds the FLEET — four concurrent helpers is what the Mac and the quota carry.
# "Alive" reuses the spinner-stamp busy detector (its verb is random — never match words), so a tab that
# has finished but not been cleaned up does not hold a slot.
HELPER_CAP="${HELPER_CAP:-4}"
alive_helpers() {
  local n=0 m prev
  for m in "$STATE"/dispatched/*; do
    [ -f "$m" ] || continue
    prev=$(cat "$m" 2>/dev/null); [ -n "$prev" ] || continue
    $T has-session -t "$prev" 2>/dev/null || continue
    if $T capture-pane -p -t "$prev:0.0" 2>/dev/null | grep -qE '… \([0-9]+m? ?[0-9]*s ·|esc to interrupt|Running…|Waiting…|tok/s|thinking'; then n=$((n+1)); fi
  done
  printf '%s' "$n"
}

dispatch_clusters() {  # $1=plan.json $2=run dir → prints DISPATCHED lines; echoes count into $DISPATCHED
  while IFS=$'\t' read -r ckey cprs; do
    [ -n "$ckey" ] || continue
    [ "$DISPATCHED" -ge "$MAX_DISPATCH" ] && break
    local nalive; nalive=$(alive_helpers)
    if [ "$nalive" -ge "$HELPER_CAP" ]; then
      say "  waiting — helper tabs alive: $nalive/$HELPER_CAP; $ckey queued for a later round"; break
    fi
    local slug; slug=$(printf '%s' "$ckey" | sed 's/[^A-Za-z0-9]/-/g;s/--*/-/g;s/^-//;s/-$//')
    local mark="$STATE/dispatched/$slug"
    # Director 2026-09-05 13:05: keep sending a tab every round until the cluster is clean — but never
    # a SECOND tab while the previous one is still working on it. The mark file holds that tab's session.
    if [ -f "$mark" ]; then
      local prev; prev=$(cat "$mark" 2>/dev/null)
      # busy = the spinner's elapsed-time stamp "… (9m 56s ·" is on screen (its verb is random — never match words)
      if [ -n "$prev" ] && $T has-session -t "$prev" 2>/dev/null && $T capture-pane -p -t "$prev:0.0" 2>/dev/null | grep -qE '… \([0-9]+m? ?[0-9]*s ·|esc to interrupt|Running…|Waiting…|tok/s|thinking'; then
        say "  skip $ckey — its tab $prev is still working"; continue
      fi
      # a helper that concluded SUPERSEDED / UNRESOLVABLE leaves "W12-VERDICT: …" in its PR comment — that PR is the
      # Director's to close or fix by hand; sending another tab burns quota on a settled question (#3179, 3 tabs, 14:30)
      local human="" pr; for pr in $cprs; do
        v=$(gh pr view "${pr#\#}" --repo "$REPO" --json comments -q '[.comments[].body | capture("W12-VERDICT: (?<v>[A-Z]+)")?.v] | last // ""' 2>/dev/null)
        case "$v" in SUPERSEDED|UNRESOLVABLE) human="$human $pr($v)";; esac
      done
      # Director 2026-09-06: an UNRESOLVABLE PR gets ONE polite rebase nudge to its author and is NEVER
      # closed by the loop — only its author knows which side of the overlapping logic is right. The mark
      # file makes it once-only; a PR can sit UNRESOLVABLE for days without the loop nagging it again.
      local _n _nm
      for pr in $cprs; do
        case " $human " in *"$pr(UNRESOLVABLE)"*) ;; *) continue;; esac
        _n="${pr#\#}"; _nm="$STATE/nudged/$_n"
        [ -f "$_nm" ] && continue
        if [ "$MODE" = "go" ]; then
          if gh pr comment "$_n" --repo "$REPO" --body "A W12 helper tab tried to rebase this PR onto \`jicate/main\` and could not: the conflict is real overlapping logic, not a mechanical clash, so only you can say which side is right.

Could you rebase onto \`jicate/main\` and resolve it? The ship wave will pick the PR up automatically once \`mergeStateStatus\` is CLEAN — it will not close it, and it will not ask again." >/dev/null 2>&1; then
            : > "$_nm"; say "  nudged $pr — asked its author to rebase onto main (once only)"
          else say "  nudge FAILED for $pr (gh comment) — left untouched"; fi
        else say "  would nudge $pr — one rebase request to its author (never closed)"; fi
      done
      # Director 2026-09-06: a helper's "SUPERSEDED" verdict is a CLAIM, not proof. The loop closes such a
      # PR only when it can PROVE main already contains the change: merging the PR head into main produces
      # a tree identical to main's own tree, i.e. the merge is a no-op. Anything less stays NEEDS A HUMAN
      # (that is how #3093 was handled by hand). A wrong auto-close silently discards someone's work.
      local _s _st _mt
      for pr in $cprs; do
        case " $human " in *"$pr(SUPERSEDED)"*) ;; *) continue;; esac
        _s="${pr#\#}"
        _st=$(git -C "$WT" rev-parse "jicate/main^{tree}" 2>/dev/null)
        _mt=$(git -C "$WT" merge-tree --write-tree jicate/main "$(gh pr view "$_s" --repo "$REPO" --json headRefOid -q .headRefOid 2>/dev/null)" 2>/dev/null | head -1)
        if [ -n "$_st" ] && [ "$_st" = "$_mt" ]; then
          if [ "$MODE" = "go" ]; then
            gh pr comment "$_s" --repo "$REPO" --body "Closing as superseded — proven, not assumed: merging this branch into \`jicate/main\` produces a tree identical to main's own (\`git merge-tree --write-tree\` = \`$_st\`), so every line of this change is already on main. Reopen if you disagree." >/dev/null 2>&1
            gh pr close "$_s" --repo "$REPO" >/dev/null 2>&1 && say "  auto-closed $pr — main provably contains it (tree $_st)"
          else say "  would auto-close $pr — main provably contains it (tree match)"; fi
        else
          say "  $pr claims SUPERSEDED but main does NOT contain it (tree differs) — left for a human"
        fi
      done
      if [ -n "$human" ] && [ "$(wc -w <<<"$human")" -eq "$(wc -w <<<"$cprs")" ]; then say "  NEEDS A HUMAN  $ckey —$human (UNRESOLVABLE nudged once; SUPERSEDED closed only when proven)"; continue; fi
      [ -n "$prev" ] && say "  re-dispatching $ckey — previous tab $prev has finished, PRs still conflicted"
    fi
    local u8 uuid sname nm
    uuid=$(/usr/bin/uuidgen | tr '[:upper:]' '[:lower:]'); u8="${uuid:0:8}"; sname="v5-jkknkb-$u8"; nm="⚙ W12 · fixing conflicts in $ckey ($cprs)"   # phone rows: robots announce themselves (Director 2026-09-06 07:01)
    printf '%s\t%s\t%s\t%s\n' "" "$LOCAL" "$(date -u +%FT%TZ)" "JKKNKB" > "$_CFG/v5-tab-sessions/$u8"   # sid filled by the tab's own hooks
    printf '%s @ %s\n' "$nm" "$LOCAL" > "$_CFG/v5-tab-names/$u8"
    local prompt="First invoke the /myjkkn-chain skill and take its CONFLICT LANE — every rule of that skill applies to you. You own ONE job: make these conflicted MyJKKN PRs mergeable again — $cprs (all touch $ckey). Repo Jicate-Solutions/MyJKKN, production remote 'jicate', branch 'main'. For EACH PR, in ONE Bash call: cd $LOCAL && git fetch jicate main && git fetch jicate <headRefName> && git worktree add $LOCAL/.claude/worktrees/ship-<n> <headRefName> ; then inside that worktree rebase onto jicate/main, resolve every conflict keeping BOTH sides' intent (never drop the other author's change; if the file is a shared registry/list, keep every entry; supabase/SQL_FILE_INDEX.md is APPEND-ONLY — on conflict keep BOTH sides, every entry survives, never drop a row), run the repo's typecheck and the scoped unit tests, force-push with --force-with-lease to the PR branch, and leave a PR comment summarising what conflicted and how you resolved it. NEVER merge, never push to main, never touch any database. The local checkout at $LOCAL is far behind production — only trust jicate/main and the worktree. When every PR shows mergeStateStatus CLEAN (gh pr view <n> --json mergeStateStatus), or one is genuinely unresolvable, finish with ONE summary: per PR → CLEAN / still DIRTY + why. For every PR you could NOT make CLEAN, your PR comment MUST end with one line exactly of the form 'W12-VERDICT: SUPERSEDED' (main already contains it) or 'W12-VERDICT: UNRESOLVABLE' (real overlapping logic, needs its author) — the wave reads that line and stops sending tabs. Then run /remote-control so the Director can see you from the phone."
    printf '%s' "$prompt" > "$2/prompt-$slug.txt"
    $T -f "$_CFG/tmux-obsidian.conf" new-session -d -s "$sname" -c "$LOCAL" \
      "bash -c 'export PATH=\"/opt/homebrew/bin:/usr/local/bin:\$HOME/.local/bin:\$PATH\" OBS_TAB_UUID=\"$uuid\" OBS_TAB_VAULT=\"JKKNKB\" CLAUDE_REMOTE_CONTROL_SESSION_NAME_PREFIX=\"JKKNKB $u8\"; \"$CLAUDE\" --name \"$nm\" \"\$(cat \"$2/prompt-$slug.txt\")\"; exec /opt/homebrew/bin/bash -i'"
    local booted=""
    for i in $(seq 1 25); do sleep 2; $T capture-pane -p -t "$sname:0.0" 2>/dev/null | grep -q "❯" && { booted=1; break; }; done
    local snap; snap=$($T capture-pane -p -t "$sname:0.0" 2>/dev/null)
    if grep -q "Settings Warning" <<<"$snap" && grep -q "❯ 1. Continue" <<<"$snap"; then $T send-keys -t "$sname:0.0" Enter; sleep 3; fi
    if [ -n "$booted" ]; then printf '%s' "$sname" > "$mark"; DISPATCHED=$((DISPATCHED+1)); say "  DISPATCHED  $sname  '$nm'  → $cprs"
    else say "  FAILED to boot $sname for $ckey — left for inspection"; fi
  done < <(python3 -c "import json;[print(k+'\t'+' '.join('#'+str(n) for n in v)) for k,v in json.load(open('$1'))['clusters'].items()]")
}

# ── migrations: stage 3b lives in its own file (Director 2026-09-05 14:20 / 15:30) ───
# One approval covers merge + APPLY + deploy + verify. The GitHub workflow "Apply Supabase migrations" can never
# apply anything (1,616 out-of-band history versions make `supabase db push` refuse — the 14:41 freeze), so the
# stage applies each pending file through the Supabase Management API: history check → destructive refusal →
# BEGIN…ROLLBACK dry-run → BEGIN…COMMIT → record → pgrst reload → verify. Runs BEFORE deploy; any failure FREEZES.
# shellcheck source=scripts/ship-wave/apply-migrations.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/apply-migrations.sh"
# shellcheck source=scripts/ship-wave/rebase-remaining.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/rebase-remaining.sh"

run_once() {
  local ts; ts=$(date '+%Y%m%d-%H%M%S')
  local run="$STATE/run-$ts"; mkdir -p "$run"
  # Redirect ONCE per process. In a --goal loop this used to re-exec every round, stacking a live
  # tee per round; each new tee truncated $RECEIPT while the older ones kept flushing their copy,
  # so the receipt held the same header N times and no round's real output survived
  # (2026-09-05 19:47: six identical headers, zero readable history).
  if [ -z "${_REDIR_DONE:-}" ]; then
    _REDIR_DONE=1
    # BSD tee stops parsing options at the first file name, so `tee "$RECEIPT" -a "$RUNLOG"` treated -a as a
    # FILE: a stray "-a" appeared in the CWD and the run log was never appended (under launchd, CWD is / and it
    # errored aloud — 2026-09-06 06:32). Truncate the receipt first, then append to both.
    : > "$RECEIPT"
    exec > >(tee -a "$RECEIPT" "$RUNLOG") 2>&1
  fi
  say "=== W12 ship wave · mode=$MODE · approve-normal=${APPROVE_NORMAL:-no} · approve-held=${APPROVE_HELD:-none} · max-dispatch=$MAX_DISPATCH · $(date '+%F %T') ==="

  # ── 0. preflight ───────────────────────────────────────────────────────────
  # Two different failures used to share one message. `gh auth status` is a LIVE API call, so a
  # GitHub/network blip reads as "not authenticated" — on 2026-09-05 that killed a goal run for 2.5 h,
  # and on 2026-09-06 08:44 it ended round 5/6 after three tries inside 30 s, while rounds 1-4 of the
  # same launchd process had passed and `gh auth status` was green again by 09:27. Keep them apart:
  #   • credential (offline): `gh auth token` reads the keyring, no network — missing = HARD FAIL (return 1).
  #   • reachability (online): back off for up to ~4 min; still down = SKIP THIS ROUND (return 2) — the goal
  #     loop pauses and tries the next round instead of ending the whole run.
  if ! gh auth token >/dev/null 2>&1; then
    say "PREFLIGHT FAIL: no gh credential in the keyring — run 'gh auth login' at the Mac"; return 1
  fi
  local gh_ok="" gh_try gh_wait
  for gh_try in 1 2 3 4 5 6; do
    if gh auth status >/dev/null 2>&1; then gh_ok=1; break; fi
    gh_wait=$((gh_try*15))   # 15+30+45+60+75 = 225 s of waiting before the round is skipped
    if [ "$gh_try" -lt 6 ]; then
      say "  preflight: GitHub unreachable (attempt $gh_try/6) — credential present, retrying in ${gh_wait}s"
      sleep "$gh_wait"
    fi
  done
  [ -n "$gh_ok" ] || { say "PREFLIGHT SKIP: GitHub unreachable for ~4 min (credential present) — this round is skipped, the run continues"; return 2; }
  local frozen=""; if [ -f "$FREEZE" ]; then frozen=1; say "  ⛔ FROZEN since: $(head -1 "$FREEZE") — this round merges NOTHING (sweep/report only). Clear with --unfreeze."; fi
  local tok; tok=$(vtok); [ -n "$tok" ] || say "  warn: no Vercel CLI token — deploy verification will be blind"
  if [ -n "$tok" ]; then
    local last; last=$(curl -s -H "Authorization: Bearer $tok" "https://api.vercel.com/v6/deployments?projectId=$VPROJ&teamId=$VTEAM&limit=1&target=production" \
      | python3 -c 'import json,sys;d=json.load(sys.stdin)["deployments"][0];print(d.get("readyState") or d.get("state"),d.get("errorCode") or "-",d["uid"])' 2>/dev/null)
    say "  last prod deployment: $last"
    case "$last" in ERROR*) say "PREFLIGHT HARD STOP: the deploy pipeline is broken ($last) — nothing merged now can go live. Fix the deploy first."; return 1;; esac
  fi

  # ── 1. sweep + classify ────────────────────────────────────────────────────
  say; say "--- 1. sweep: every open PR on $REPO ---"
  sweep "$run" || return 1
  local c_open c_ready c_conf; c_open=$(python3 -c "import json;print(json.load(open('$run/plan.json'))['counts']['open'])")
  c_ready=$(python3 -c "import json;print(json.load(open('$run/plan.json'))['counts']['ready'])")
  c_conf=$(python3 -c "import json;print(json.load(open('$run/plan.json'))['counts']['conflicted'])")

  # ── 2. conflict clusters → one fleet tab each ──────────────────────────────
  say; say "--- 2. conflicts: [helper tabs alive: $(alive_helpers)/$HELPER_CAP] dispatch ≤$MAX_DISPATCH fleet tabs (one per cluster; a new tab only when the previous one has finished) ---"
  DISPATCHED=0
  if [ "$MODE" = "go" ] && [ "$MAX_DISPATCH" -gt 0 ]; then dispatch_clusters "$run/plan.json" "$run"
  else say "  (plan mode / --max-dispatch 0 — nothing dispatched)"; fi

  # ── 3. merge by tier ───────────────────────────────────────────────────────
  say; say "--- 3. merge: LOW unattended · NORMAL needs --approve-normal · HELD needs --approve-held ---"
  local merged=0 merged_list="" merged_files="$run/merged-files.txt" m_low=0 m_normal=0 m_held=0; : > "$merged_files"; : > "$run/merged-map.tsv"
  INDEX_MERGED=0
  merge_one() {  # $1=number $2=tier — re-verify the instant before the irreversible step
    local n="$1" t="$2" st i
    for i in 1 2 3 4 5 6; do
      st=$(gh pr view "$n" --repo "$REPO" --json state,mergeStateStatus,isDraft,baseRefName -q '"\(.state) \(.mergeStateStatus) \(.isDraft) \(.baseRefName)"')
      [ "$st" = "OPEN UNKNOWN false main" ] && { sleep 10; continue; }; break
    done
    if [ "$st" != "OPEN CLEAN false main" ]; then say "  HOLD   $t #$n — state now '$st' (changed since sweep), not merging"; return 1; fi
    # Director 14:45: SQL_FILE_INDEX.md is a hand-edited append-only ledger — every merge that touches it re-conflicts
    # every other PR touching it. So at most ONE index-touching PR merges per round; the rest wait for the next sweep.
    if python3 -c "import json,sys;p=json.load(open('$run/plan.json'));rows=[r for b in ('LOW','NORMAL','HELD') for r in p['ready'][b]]+p['quiet_wait'];sys.exit(0 if any(r['number']==$n and 'supabase/SQL_FILE_INDEX.md' in r['files'] for r in rows) else 1)" 2>/dev/null; then
      if [ "${INDEX_MERGED:-0}" -ge 1 ]; then say "  HOLD   $t #$n — touches SQL_FILE_INDEX.md and one index PR already merged this round (next round)"; return 1; fi
      INDEX_MERGED=$(( ${INDEX_MERGED:-0} + 1 ))
    fi
    local runs; runs=$(gh pr view "$n" --repo "$REPO" --json statusCheckRollup -q '[.statusCheckRollup[]? | select((.conclusion // "" | ascii_upcase) as $c | $c=="FAILURE" or $c=="TIMED_OUT" or $c=="ACTION_REQUIRED" or ((.status // "" | ascii_upcase) as $s | $s=="IN_PROGRESS" or $s=="QUEUED" or $s=="PENDING"))] | length')
    [ "${runs:-0}" != "0" ] && { say "  HOLD   $t #$n — $runs check(s) failing/pending at merge time"; return 1; }
    if gh pr merge "$n" --repo "$REPO" --squash --delete-branch >/dev/null 2>"$run/merge-$n.err"; then
      say "  MERGED $t #$n"; gh pr view "$n" --repo "$REPO" --json files -q '.files[].path' | tee -a "$merged_files" | sed "s/^/$n\t/" >> "$run/merged-map.tsv"; sleep 4; return 0
    else say "  FAILED $t #$n — $(head -c 200 "$run/merge-$n.err")"; return 1; fi
  }
  already_merged() { case " $merged_list " in *" #$1 "*) return 0;; *) return 1;; esac; }
  merge_tiers() {  # one pass LOW → NORMAL → HELD; bumps merged / merged_list (bash dynamic scope)
    for n in $(python3 -c "import json;print(' '.join(str(r['number']) for r in json.load(open('$run/plan.json'))['ready']['LOW']))"); do already_merged "$n" || { merge_one "$n" LOW && { merged=$((merged+1)); m_low=$((m_low+1)); merged_list="$merged_list #$n"; }; }; done
    if [ -n "$APPROVE_NORMAL" ]; then
      for n in $(python3 -c "import json;print(' '.join(str(r['number']) for r in json.load(open('$run/plan.json'))['ready']['NORMAL']))"); do already_merged "$n" || { merge_one "$n" NORMAL && { merged=$((merged+1)); m_normal=$((m_normal+1)); merged_list="$merged_list #$n"; }; }; done
    else say "  NORMAL: $(python3 -c "import json;print(len(json.load(open('$run/plan.json'))['ready']['NORMAL']))") ready — waiting for your tap (run again with --approve-normal)"; fi
    if [ -n "$APPROVE_HELD" ]; then
      for n in $(printf '%s' "$APPROVE_HELD" | tr ', ' '  '); do
        already_merged "$n" && continue
        python3 -c "import json,sys;sys.exit(0 if $n in [r['number'] for r in json.load(open('$run/plan.json'))['ready']['HELD']] else 1)" \
          && { merge_one "$n" HELD && { merged=$((merged+1)); m_held=$((m_held+1)); merged_list="$merged_list #$n"; [ -f "$STATE/approve-held" ] && { grep -vxE "\s*$n\s*" "$STATE/approve-held" || true; } > "$STATE/approve-held.new" && mv "$STATE/approve-held.new" "$STATE/approve-held"; }; } \
          || say "  HOLD   HELD #$n — not in this run's ready-HELD list, refusing"
      done
    else
      local held; held=$(python3 -c "import json;print(' '.join('#'+str(r['number'])+' '+r['title'][:40].replace(' ','_') for r in json.load(open('$run/plan.json'))['ready']['HELD']))")
      [ -n "$held" ] && say "  HELD waiting for your reply (reply with the numbers to ship): $held" || say "  HELD: none ready"
    fi
  }
  if policy_active AUTO_APPROVE_ADDITIVE_MIGRATIONS && [ -z "${FINAL_DEPLOY:-}" ]; then
    local auto; auto=$(python3 -c "import json;p=json.load(open('$run/plan.json'));print(' '.join(str(r['number']) for r in p['ready']['HELD'] if r['tier_reasons'] and all(x.startswith('migration: supabase/migrations/') for x in r['tier_reasons'])))" 2>/dev/null)
    [ -n "$auto" ] && { say "  policy P1 (ratified): HELD PRs whose only reason is a migration are approved this run: $auto"; APPROVE_HELD="${APPROVE_HELD:+$APPROVE_HELD }$auto"; }
  fi
  if [ -n "${FINAL_DEPLOY:-}" ]; then say "  (end-of-run deploy pass — merging nothing)"
  elif [ "$MODE" = "go" ] && [ -z "$frozen" ]; then
    # Director 2026-09-05 23:40: up to three merge passes per round. After a pass that merged something,
    # the remaining approved PRs are brought up to date with main (rebase-remaining.sh — the SQL index is
    # the usual conflict and is kept both-sides), then the pass repeats. The one-index-PR-per-pass gate
    # still holds inside a pass; it resets between passes because the rebase has absorbed the merge.
    local pass before_pass
    for pass in 1 2 3; do
      before_pass=$merged; INDEX_MERGED=0
      [ "$pass" -gt 1 ] && say "  merge pass $pass"
      merge_tiers
      # pass 1 always tries the rebase: approved PRs left DIRTY by an EARLIER round are candidates too;
      # later passes only repeat after a pass that actually merged something
      if [ "$merged" -gt "$before_pass" ] || [ "$pass" -eq 1 ]; then rebase_remaining "$run" "$merged_list" || break; else break; fi
    done
    # interview: a merge can turn another PR DIRTY — re-read and send helpers for the NEW conflicts this round
    if [ "$merged" -gt 0 ] && [ "$MAX_DISPATCH" -gt 0 ]; then
      say "  re-checking conflicts after $merged merge(s)…"; sleep 15
      mkdir -p "$run/post"; sweep "$run/post" >/dev/null 2>&1 && {
        python3 - "$run/plan.json" "$run/post/plan.json" "$run/post/new.json" <<'PY'
import json,sys
before={r['number'] for r in json.load(open(sys.argv[1]))['conflicted']}
post=json.load(open(sys.argv[2])); new={k:[n for n in v if n not in before] for k,v in post['clusters'].items()}
new={k:v for k,v in new.items() if v}; post['clusters']=new; json.dump(post,open(sys.argv[3],'w'))
print("  newly conflicted:", sum(len(v) for v in new.values()), "→", {k:v for k,v in new.items()} if new else "none")
PY
        dispatch_clusters "$run/post/new.json" "$run"; }
    fi
  else say "  (plan mode or frozen — nothing merged)"; fi
  say "  merged this round: $merged$merged_list"

  # ── 3b. migrations: apply + verify BEFORE deploy ────────────────────────────
  local APPLY_RESULT="n/a" apply_ok=1
  if [ "$MODE" = "go" ] && [ -z "$frozen" ] && { [ "$merged" -gt 0 ] || [ -f "$STATE/migrations-pending" ]; }; then
    say; say "--- 3b. migrations (one approval = merge + apply + deploy + verify) ---"
    apply_migrations "$merged_files" || apply_ok=0
  fi

  # ── 4. deploy ──────────────────────────────────────────────────────────────
  local deploy="skipped" dpl="" pending="$STATE/deploy-pending"; DEPLOY_DEFERRED=""
  say; say "--- 4. deploy ---"
  # Director 2026-09-06 00:52: a goal run fires ONE production build at the end for everything it merged —
  # tonight the one-migration-PR-per-round cascade had turned "deploy per round" into a ~4-minute build per
  # PR. Safe because 3b has already applied the (additive-only) migrations: schema ahead of code is the
  # harmless direction. A plain `go` (no --goal) still deploys immediately, and flushes any leftover batch.
  if [ -n "${FINAL_DEPLOY:-}" ]; then
    merged_files="$pending"; merged=$(grep -c . "$pending" 2>/dev/null || echo 0); merged_list=" (batched: $merged file(s) merged this run)"
  elif [ -n "$GOAL" ] && [ "$merged" -gt 0 ] && [ "$apply_ok" -ne 0 ] && [ -z "$NO_DEPLOY" ]; then
    cat "$merged_files" >> "$pending"; DEPLOY_DEFERRED=1
    deploy="deferred — goal runs deploy ONCE at the end ($(grep -c . "$pending") file(s) waiting; migrations already applied)"
    say "  $deploy"
  elif [ "$MODE" = "go" ] && [ -z "$GOAL" ] && [ -s "$pending" ]; then
    cat "$pending" >> "$merged_files"; merged=$((merged+1)); merged_list="$merged_list +earlier-batch"
  fi
  # 2026-09-06 07:55: a read-only `plan` sweep fired a production build through the flush branch above —
  # the deploy stage must never act outside `go`, whatever the batch file holds.
  if [ "$MODE" != "go" ]; then deploy="skipped (plan mode)"; DEPLOY_DEFERRED=1; fi
  if [ -n "$DEPLOY_DEFERRED" ]; then :
  elif [ "$apply_ok" -eq 0 ]; then say "  NOT deploying — migration step failed; the previous deploy stays live"; deploy="skipped (migration failed)"
  elif [ "$merged" -gt 0 ] && [ -z "$NO_DEPLOY" ] && [ "$(grep -vE '^[[:space:]]*$' "$merged_files" | grep -cvE '^(supabase|docs|specs|\.claude|\.github)/|\.md$')" -eq 0 ]; then
    # Mirrors vercel.json's ignoreCommand: when every merged file sits under supabase/, docs/, specs/,
    # .claude/, .github/ or is *.md, Vercel has nothing to build — its ignoreCommand exits 0 and the
    # deployment comes back CANCELED with no errorCode. 2026-09-05 22:50: #3296 (one migration + the
    # index) did exactly that, the wave read the CANCELED as a failed deploy and froze, and two manual
    # re-fires cancelled the same way. Migrations were already applied in 3b; there is nothing to make live.
    # Counted with `grep -c`, not `grep -qv`: on this grep, -q with -v keys its exit on whether any line
    # MATCHED, which inverts the answer for exactly the mixed and empty cases (proven 2026-09-05 22:56).
    deploy="nothing to deploy (migration/docs-only round — Vercel's ignoreCommand skips the build)"
    say "  $deploy"
  elif [ "$merged" -gt 0 ] && [ -z "$NO_DEPLOY" ]; then
    local r; r=$(curl -s -X POST "$HOOK"); dpl=$(python3 -c "import json,sys;print(json.load(sys.stdin)['job']['id'])" <<<"$r" 2>/dev/null)
    printf '%s\t%s\t%s\n' "$(date '+%F %T')" "W12 ship$merged_list" "$dpl" >> "$_CFG/v5-deploy-fires.tsv"
    say "  hook fired: job $dpl — polling the deployment (verdict read from .errorCode, never the GitHub record)"
    if [ -n "$tok" ]; then
      sleep 25; local uid; uid=""
      for i in $(seq 1 40); do
        local d; d=$(curl -s -H "Authorization: Bearer $tok" "https://api.vercel.com/v6/deployments?projectId=$VPROJ&teamId=$VTEAM&limit=1&target=production")
        uid=$(python3 -c 'import json,sys;print(json.load(sys.stdin)["deployments"][0]["uid"])' <<<"$d" 2>/dev/null)
        deploy=$(python3 -c 'import json,sys;x=json.load(sys.stdin)["deployments"][0];print((x.get("readyState") or x.get("state"))+" "+(x.get("errorCode") or "-"))' <<<"$d" 2>/dev/null)
        case "$deploy" in READY*|ERROR*|CANCELED*) break;; esac; sleep 20
      done
      [ -n "$deploy" ] || { deploy="UNVERIFIED"; say "  deploy verdict unavailable — the Vercel API answered nothing readable for 13 min (token expired? run: vercel whoami). The build may well be fine; the batch stays in $STATE/deploy-pending — check with 'vercel ls my-jkkn --scope jicate-solutions' before firing again"; }
      say "  deployment $uid → $deploy"
      # Director 2026-09-06 (walk-mode interview): a build ERROR gets ONE re-fire before the wave freezes —
      # most single ERRORs are a flaky install/timeout, and freezing the loop for one is expensive. The
      # second attempt is the verdict: two ERRORs in a row is a real broken build. Never a third re-fire,
      # and CANCELED is NOT retried (it means Vercel's ignoreCommand found nothing to build — see above).
      case "$deploy" in
        ERROR*)
          if [ -z "${DEPLOY_RETRIED:-}" ]; then
            DEPLOY_RETRIED=1
            say "  build ERROR on $uid — re-firing the hook ONCE (attempt 2 of 2)"
            printf '%s\t%s\t%s\n' "$(date '+%F %T')" "W12 ship RETRY$merged_list" "$dpl" >> "$_CFG/v5-deploy-fires.tsv"
            local r2; r2=$(curl -s -X POST "$HOOK"); dpl=$(python3 -c "import json,sys;print(json.load(sys.stdin)['job']['id'])" <<<"$r2" 2>/dev/null)
            tok=$(vtok)   # the first poll can outlive the token (auth.json dies after ~1h of CLI silence)
            sleep 25
            for i in $(seq 1 40); do
              local d2; d2=$(curl -s -H "Authorization: Bearer $tok" "https://api.vercel.com/v6/deployments?projectId=$VPROJ&teamId=$VTEAM&limit=1&target=production")
              uid=$(python3 -c 'import json,sys;print(json.load(sys.stdin)["deployments"][0]["uid"])' <<<"$d2" 2>/dev/null)
              deploy=$(python3 -c 'import json,sys;x=json.load(sys.stdin)["deployments"][0];print((x.get("readyState") or x.get("state"))+" "+(x.get("errorCode") or "-"))' <<<"$d2" 2>/dev/null)
              case "$deploy" in READY*|ERROR*|CANCELED*) break;; esac; sleep 20
            done
            say "  retry deployment $uid → $deploy"
            case "$deploy" in ERROR*) freeze "deploy failed TWICE (attempt 2 = $uid → $deploy); on main but NOT live:$merged_list";; esac
          else
            freeze "deploy $uid → $deploy; on main but NOT live:$merged_list"
          fi;;
        CANCELED*) freeze "deploy $uid → $deploy; on main but NOT live:$merged_list";;
      esac
    else deploy="fired (unverified — no Vercel token)"; fi
  else say "  nothing merged / --no-deploy → no hook fired"; fi

  if [ -z "$DEPLOY_DEFERRED" ] && { [[ "$deploy" == READY* ]] || [[ "$deploy" == nothing* ]]; }; then rm -f "$pending"; fi

  # ── 5. three-layer sweep on what shipped ───────────────────────────────────
  say; say "--- 5. sweep (L1 pages as real roles · L2 API routes unauth · L3 tables touched) ---"
  local l1="n/a" l2="n/a" l3="n/a"
  if [ "$merged" -gt 0 ] && [ -z "$NO_SWEEP" ] && [[ "$deploy" == READY* ]]; then
    local pages apis migs
    pages=$(grep -E '^app/\(routes\)/.*/page\.tsx$' "$merged_files" | grep -v '\[' | sed -E 's#^app/\(routes\)##; s#/page\.tsx$##; s#/\([^)]*\)##g' | sort -u | head -8)
    apis=$(grep -E '^app/api/.*/route\.ts$' "$merged_files" | grep -v '\[' | sed -E 's#^app##; s#/route\.ts$##' | sort -u | head -15)
    migs=$(grep -E '^supabase/migrations/' "$merged_files" | sort -u)
    # L2 — every touched API route, unauthenticated: 401/403/405 = correct, 5xx = FAIL, 200 = WARN (public?)
    local l2f=0 l2p=0 l2bad=""; for a in $apis; do local code; code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE$a"); case "$code" in 5*) l2f=$((l2f+1)); l2bad="$l2bad $a→$code"; say "  L2 FAIL $a → $code";; 401|403|405|400) l2p=$((l2p+1));; *) say "  L2 WARN $a → $code";; esac; done
    l2="$l2p ok · $l2f fail of $(echo "$apis" | grep -c .) routes"
    # L1-lite — Lightpanda sweep (Director 2026-09-06 07:33): every changed page as every persona, sessions minted
    # by admin magiclink (no PERSONA_PASSWORD). Judges status / wrong bounce / JS exception / timeout / crash — never
    # what a person sees (no layout engine). 5xx after a deploy = broken page = FREEZE (and the guard stage holds the
    # shipped directories); everything else is reported. Tooling failure = "L1-lite unavailable", never a freeze.
    local l1bad=0
    if [ -n "$pages" ]; then
      local wave_root; wave_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
      local sweep="$wave_root/scripts/persona-harness/lightpanda-sweep.mjs"
      [ -f "$wave_root/.env.local" ] || cp "$LOCAL/.env.local" "$wave_root/.env.local" 2>/dev/null
      [ -e "$wave_root/node_modules" ] || ln -s "$LOCAL/node_modules" "$wave_root/node_modules" 2>/dev/null
      if [ -f "$sweep" ]; then
        ( cd "$wave_root" && timeout 900 node "$sweep" --pages "$(printf '%s' "$pages" | tr ' \n' ',,' | sed 's/,,*/,/g; s/^,//; s/,$//')" --out "$run/l1.json" ) > "$run/l1.txt" 2>&1
        local l1rc=$?
        if [ "$l1rc" -eq 2 ] || [ "$l1rc" -eq 3 ]; then l1="UNAVAILABLE — $(head -1 "$run/l1.txt")"
        elif [ "$l1rc" -ne 0 ]; then l1="UNAVAILABLE — sweep exited $l1rc (see $run/l1.txt); pages NOT verified as roles"
        else
          l1="$(grep -m1 '^L1-lite:' "$run/l1.txt" | sed 's/^L1-lite: //')"
          l1bad=$(python3 -c "import json;print(json.load(open('$run/l1.json'))['sum']['s5xx'])" 2>/dev/null || echo 0)
          grep -E '^  (s5xx|bounces|jsErr|timeouts|failed):' "$run/l1.txt" | head -8 | sed 's/^/  L1 /' | while read -r line; do say "$line"; done
          if [ "${l1bad:-0}" -gt 0 ]; then freeze "broken page after deploy: $l1bad page×role load(s) returned 5xx (see $run/l1.txt); on main:$merged_list"; fi
          # Director 2026-09-06: a role×page that used to load 200 without bouncing and now bounces to
          # /auth/login is a BROKEN PAGE (freeze, naming page + role + PR). A page that ALREADY bounced in
          # the baseline is the role gate working correctly and stays quiet — that distinction is the whole
          # point; without it every correctly-gated page would look like a regression. Baseline is seeded
          # once from the 4 scale-*.json sweeps (1,143 loads × 4 roles) and refreshed from every clean run.
          local base="$STATE/l1-baseline.json"
          local regress; regress=$(python3 "$SW_DIR/l1-baseline.py" "$base" "$run/l1.json" 2>/dev/null)
          if [ -n "$regress" ]; then
            local rprs; rprs=$(for rp in $regress; do grep -F "app${rp#*:}" "$run/merged-map.tsv" 2>/dev/null | cut -f1 | sort -u | sed 's/^/#/'; done | tr '\n' ' ')
            freeze "baseline bounce after deploy — these loaded 200 before and now bounce to /auth/login: $regress · likely PRs: ${rprs:-see merged-map.tsv}; on main:$merged_list"
          elif [ ! -f "$STATE/FROZEN" ]; then
            cp "$run/l1.json" "$base" 2>/dev/null && say "  L1 baseline refreshed from this clean sweep"
          fi
        fi
      else l1="UNAVAILABLE — $sweep not found"; fi
    else l1="no page changed"; fi
    # L3 — tables touched by merged migrations (v1: inventory + the authed persona pass above exercises RLS; a per-role probe is not automated yet)
    if [ -n "$migs" ]; then l3="PARTIAL: $(for m in $migs; do git -C "$WT" show "jicate/main:$m" 2>/dev/null | grep -oiE '(create table|alter table|create policy)[^(]*' | head -3; done | tr '\n' ';' | cut -c1-200)"; else l3="no migration shipped"; fi
    say "  L1 $l1"; say "  L2 $l2"; say "  L3 $l3"
    # interview: a broken page/route after deploy FREEZES the wave, naming the page + role + the PR that touched it
    if [ "$l2f" -gt 0 ] || [ "${l1bad:-0}" -gt 0 ]; then
      local blame; blame=$(grep -iE '/unauthorized|/auth/login|error' "$run/l1.txt" 2>/dev/null | head -3 | tr '\n' ' ')
      local prs_blame; prs_blame=$(for a in $l2bad; do p=${a%%→*}; grep -F "app${p}/route.ts" "$run/merged-map.tsv" | cut -f1 | sort -u | sed 's/^/#/'; done | tr '\n' ' ')
      freeze "post-deploy sweep failed — L2:${l2bad:- none} L1:${blame:- none} · likely PRs: ${prs_blame:-see merged-map.tsv}"
    fi
  else say "  (nothing shipped / deploy not READY / --no-sweep)"; fi

  # ── 6. scoreboard + HTML report ────────────────────────────────────────────
  local after; after=$(gh pr list --repo "$REPO" --state open --limit 200 --json number -q 'length' 2>/dev/null || echo "?")
  say; say "=== SCOREBOARD · open PRs: $c_open → $after (target 0) · ready left: $([ -n "${FINAL_DEPLOY:-}" ] && echo "$c_ready" || echo $((c_ready-merged))) · conflicted: $c_conf ($DISPATCHED tabs sent) · merged: $([ -n "${FINAL_DEPLOY:-}" ] && echo "0 (final pass: $merged file(s) built)" || echo "$merged") · migrations: $APPLY_RESULT · deploy: $deploy · frozen: $([ -f "$FREEZE" ] && echo YES || echo no) ==="
  type -t ledger_record >/dev/null 2>&1 && ledger_record round \
    "merged=$merged low=$m_low normal=$m_normal held=$m_held open=$c_open->$after ready=$c_ready conflicted=$c_conf dispatched=$DISPATCHED migrations=$APPLY_RESULT deploy=$deploy"
  local html="$LOCAL/artifacts/ship-wave-$ts.html"; mkdir -p "$LOCAL/artifacts"
  RUN="$run" TS="$ts" OPEN="$c_open" AFTER="$after" MERGED="$merged" MLIST="$merged_list" DEPLOY="$deploy" L1="$l1" L2="$l2" L3="migrations: $APPLY_RESULT · $l3" DISP="$DISPATCHED" MODE="$MODE" RECEIPT="$RECEIPT" FROZEN="$( [ -f "$FREEZE" ] && tail -1 "$FREEZE" || echo "")" python3 - "$html" <<'PY'
import json, os, sys, html as H
run=os.environ["RUN"]; plan=json.load(open(f"{run}/plan.json")); c=plan["counts"]; e=H.escape
def rows(lst, extra=lambda r:""): return "".join(f"<tr><td><a href='https://github.com/Jicate-Solutions/MyJKKN/pull/{r['number']}'>#{r['number']}</a></td><td>{e(r['title'])}</td><td><span class='t {r['tier']}'>{r['tier']}</span></td><td>{e(extra(r))}</td></tr>" for r in lst) or "<tr><td colspan=4 class=m>none</td></tr>"
ready=[*plan["ready"]["LOW"],*plan["ready"]["NORMAL"],*plan["ready"]["HELD"]]
clusters="".join(f"<li><b>{e(k)}</b> → {' '.join('#'+str(n) for n in v)}</li>" for k,v in plan["clusters"].items()) or "<li class=m>none</li>"
dep=os.environ['DEPLOY']; depcls='ok' if dep.startswith('READY') else ('m' if dep=='skipped' else 'bad')
frozen=os.environ.get('FROZEN',''); banner=f"<div class=frz>⛔ FROZEN — {e(frozen)} — clear with <code>ship-wave.sh --unfreeze</code></div>" if frozen else ""
page=f"""<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Ship wave {os.environ['TS']}</title>
<style>:root{{--bg:#fbfaf7;--fg:#1c1b19;--mu:#6b6862;--ln:#e6e2da;--ok:#1f7a4d;--bad:#b3261e;--card:#fff}}
@media(prefers-color-scheme:dark){{:root{{--bg:#151412;--fg:#ece9e2;--mu:#9a968e;--ln:#2b2925;--card:#1e1c19}}}}
body{{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,Inter,system-ui,sans-serif}}main{{max-width:960px;margin:0 auto;padding:28px 18px 60px}}
h1{{font-size:1.5rem;margin:0 0 4px}}.sub{{color:var(--mu);margin:0 0 22px}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:0 0 26px}}
.k{{background:var(--card);border:1px solid var(--ln);border-radius:12px;padding:14px}}.k b{{display:block;font-size:1.7rem;line-height:1.1}}.k span{{color:var(--mu);font-size:.85rem}}
.frz{{background:#fde8e6;color:var(--bad);border:1px solid var(--bad);border-radius:12px;padding:12px 14px;margin:0 0 18px;font-weight:600}}
h2{{font-size:1.05rem;margin:26px 0 8px}}table{{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--ln);border-radius:12px;overflow:hidden;font-size:.9rem}}
td{{padding:8px 10px;border-top:1px solid var(--ln);vertical-align:top}}tr:first-child td{{border-top:0}}.m{{color:var(--mu)}}a{{color:inherit}}
.t{{font-size:.72rem;padding:2px 7px;border-radius:99px;border:1px solid var(--ln)}}.HELD{{background:#fde8e6;color:var(--bad)}}.LOW{{background:#eef0ee;color:var(--mu)}}.NORMAL{{background:#e9f0fb}}
.ok{{color:var(--ok)}}.bad{{color:var(--bad)}}.wrap{{overflow-x:auto}}footer{{margin-top:40px;color:var(--mu);font-size:.8rem;border-top:1px solid var(--ln);padding-top:12px}}</style>
<main><h1>🚀 W12 Ship MyJKKN — {os.environ['TS']}</h1><p class=sub>mode <b>{os.environ['MODE']}</b> · goal: open PRs → 0</p>{banner}
<div class=grid><div class=k><b>{os.environ['OPEN']} → {os.environ['AFTER']}</b><span>open PRs before → after</span></div>
<div class=k><b>{os.environ['MERGED']}</b><span>merged this round{e(os.environ['MLIST'])}</span></div>
<div class=k><b>{c['ready']}</b><span>were ready · LOW {c['ready_low']} · NORMAL {c['ready_normal']} · HELD {c['ready_held']}</span></div>
<div class=k><b>{c['conflicted']}</b><span>conflicted in {c['clusters']} clusters · {os.environ['DISP']} tabs sent</span></div>
<div class=k><b>{c['quiet_wait']}</b><span>left alone — updated &lt;30 min ago</span></div>
<div class=k><b class="{depcls}">{e(dep)}</b><span>deploy</span></div></div>
<h2>Sweep on what shipped</h2><div class=wrap><table><tr><td>L1 pages as real roles</td><td>{e(os.environ['L1'])}</td></tr><tr><td>L2 API routes (unauth)</td><td>{e(os.environ['L2'])}</td></tr><tr><td>L3 tables / RLS</td><td>{e(os.environ['L3'])}</td></tr></table></div>
<h2>Ready at sweep time ({len(ready)})</h2><div class=wrap><table>{rows(ready, lambda r: '; '.join(r['tier_reasons']))}</table></div>
<h2>Conflict clusters ({c['clusters']})</h2><ul>{clusters}</ul>
<h2>Author may still be typing ({c['quiet_wait']})</h2><div class=wrap><table>{rows(plan['quiet_wait'], lambda r: f"updated {r['age_min']} min ago")}</table></div>
<h2>Waiting on CI ({c['waiting_ci']})</h2><div class=wrap><table>{rows(plan['waiting_ci'], lambda r: r['ci']+': '+', '.join(r['ci_names']))}</table></div>
<h2>Blocked ({c['blocked']}) · Drafts ({c['draft']})</h2><div class=wrap><table>{rows(plan['blocked'], lambda r: r['state'])}</table></div>
<footer>Policy: HELD = money/grades/migrations/unreadable, explicit per-PR approval · LOW = docs/types/tests, unattended · NORMAL = one tap · quiet 30 min · freeze on failed deploy or broken page. Receipt: {e(os.environ['RECEIPT'])}<br>
<!-- session-provenance v1 --><span>Built by session <b>google chrome setup</b> · <a href="https://claude.ai/code/session_015MShroHA7qe5UvpmCSoXsR">reopen the authoring session</a> · file ship-wave-{os.environ['TS']}.html</span></footer></main></html>"""
open(sys.argv[1],"w").write(page); print("  report:", sys.argv[1])
PY
  LAST_MERGED=$merged   # read by the goal loop: two merge-less rounds in a row end the run
  echo "$after" > "$STATE/last-open-count"
  return 0
}

if [ -n "$GOAL" ]; then
  # goal loop (Director 2026-09-05): rounds until open PRs == 0, or GOAL_ROUNDS, or a freeze
  for round in $(seq 1 $GOAL_ROUNDS); do
    run_once; rc=$?
    if [ "$rc" -eq 2 ]; then
      # reachability blip (preflight return 2): skip this round only — pause, then try the next one
      say "=== round $round skipped (GitHub unreachable) — pausing ${GOAL_PAUSE_MIN} min, then the next round tries again ==="
      [ "$round" -lt "$GOAL_ROUNDS" ] && sleep $((GOAL_PAUSE_MIN*60))
      continue
    fi
    [ "$rc" -eq 0 ] || { say "=== round $round aborted before it could plan — goal loop ends (nothing was merged) ==="; break; }
    left=$(cat "$STATE/last-open-count" 2>/dev/null || echo 1)
    movable=$(python3 -c "import json,glob;p=sorted(glob.glob('$STATE/run-*/plan.json'))[-1];c=json.load(open(p))['counts'];print(c['ready']+c['conflicted']+c['quiet_wait'])" 2>/dev/null || echo 1)
    say "=== goal round $round/$GOAL_ROUNDS · open=$left · movable=$movable ==="
    [ "$left" = "0" ] && { say "=== GOAL MET: open PRs = 0 ==="; break; }
    [ -f "$FREEZE" ] && { say "=== FROZEN — goal loop ends; Director must look, then --unfreeze ==="; break; }
    [ "$movable" = "0" ] && { say "=== nothing left this wave can move (rest needs CI, authors, or your approval) — loop ends ==="; break; }
    # Director 2026-09-05 23:40: a round that merges nothing is usually a round whose blockers need a
    # human (stale GitHub verdicts, approvals, CI). Sweeping four more times an hour apart changes
    # nothing — tonight it burned 40 minutes. Two empty rounds in a row end the run.
    # …but a round is not "empty" while approved PRs are only waiting out the 30-minute quiet window
    # (00:16: the four just-unstuck PRs sat in quiet_wait and this rule would have ended the run before
    # they became eligible). Count an empty round only when nothing is about to become ready.
    quiet_now=$(python3 -c "import json,glob;p=sorted(glob.glob('$STATE/run-*/plan.json'))[-1];print(json.load(open(p))['counts']['quiet_wait'])" 2>/dev/null || echo 0)
    if [ "${LAST_MERGED:-0}" -eq 0 ] && [ "${quiet_now:-0}" -eq 0 ]; then EMPTY_ROUNDS=$(( ${EMPTY_ROUNDS:-0} + 1 )); else EMPTY_ROUNDS=0; fi
    [ "${EMPTY_ROUNDS:-0}" -ge 2 ] && { say "=== two rounds in a row merged nothing — loop ends; what is left needs a human (see the plan above) ==="; break; }
    [ "$round" -lt "$GOAL_ROUNDS" ] && sleep $((GOAL_PAUSE_MIN*60))
  done
  if [ -s "$STATE/deploy-pending" ] && [ ! -f "$FREEZE" ]; then
    say; say "=== end of run: ONE production build for everything merged this run (batched to save Vercel build minutes) ==="
    FINAL_DEPLOY=1; run_once; FINAL_DEPLOY=""
  fi
else
  run_once
fi

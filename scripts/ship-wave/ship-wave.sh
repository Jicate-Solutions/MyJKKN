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
#
# EDGE RULES (same interview):
#   • a PR updated in the last QUIET_MIN (30) minutes is left alone — its author may still be typing
#   • after each merge the conflict list is re-read; a PR that just turned DIRTY gets a helper tab this round
#   • deploy ERROR → FREEZE: marker file written, later rounds merge NOTHING until `--unfreeze`
#   • post-deploy sweep finds a broken page → FREEZE, with page + role + the PR that touched it
#   • trigger is manual ("W12"); `--goal` loops rounds until open PRs == 0 or GOAL_ROUNDS (6) — a goal loop
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
STATE="$_CFG/.ship-wave"; mkdir -p "$STATE/dispatched"
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

vtok() { python3 -c "import json;print(json.load(open('$HOME/Library/Application Support/com.vercel.cli/auth.json'))['token'])" 2>/dev/null; }
say() { printf '%s\n' "$*"; }
unlock() { rm -f "$LOCK/pid"; rmdir "$LOCK" 2>/dev/null; }
freeze() { printf '%s\t%s\n' "$(date '+%F %T')" "$*" >> "$FREEZE"; say "  ⛔ FROZEN: $* — no further merges until: ship-wave.sh --unfreeze"; }

# ── single-flight: two ship waves merging at once would race main ─────────────
if ! mkdir "$LOCK" 2>/dev/null; then
  pid=$(cat "$LOCK/pid" 2>/dev/null); if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then echo "another ship wave is running (pid $pid) — refusing"; exit 3; fi
  unlock; mkdir "$LOCK"
fi
echo $$ > "$LOCK/pid"; trap unlock EXIT

# ── the classifier, shared by the sweep and the post-merge re-cluster ─────────
classify() {  # $1=prs.json $2=plan.json  (ONLY / QUIET_MIN from env)
  ONLY="$ONLY" QUIET_MIN="$QUIET_MIN" python3 - "$1" "$2" <<'PY'
import json, sys, os, re, datetime
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
        elif f.startswith(".github/workflows/"): reasons.append(f"CI gate change: {f}")   # #2724 turned main red for every PR (2026-09-05)
        elif HELD_RX.search(f): reasons.append(f"path: {f}")
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
plan = {"draft":[], "conflicted":[], "blocked":[], "waiting_ci":[], "quiet_wait":[], "ready":{"LOW":[], "NORMAL":[], "HELD":[]}}
for p in prs:
    t, why = tier(p); v, names = ci(p); age = minutes_since(p.get("updatedAt",""))
    row = {"number":p["number"], "title":p["title"], "branch":p["headRefName"], "tier":t, "tier_reasons":why,
           "ci":v, "ci_names":names, "state":p["mergeStateStatus"], "files":[f["path"] for f in (p.get("files") or [])], "age_min":int(age)}
    if p["isDraft"]: plan["draft"].append(row)
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
                  "draft":len(plan["draft"]), "clusters":len(clusters)}
json.dump(plan, open(sys.argv[2],"w"), indent=1)
c = plan["counts"]
print(f"  open={c['open']}  ready={c['ready']} (LOW {c['ready_low']} · NORMAL {c['ready_normal']} · HELD {c['ready_held']})  "
      f"conflicted={c['conflicted']} in {c['clusters']} clusters  waiting-ci={c['waiting_ci']}  quiet<{quiet}m={c['quiet_wait']}  blocked={c['blocked']}  drafts={c['draft']}")
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
    gh pr list --repo "$REPO" --state open --limit 200 --json number,title,mergeStateStatus,isDraft,headRefName,updatedAt > "$1/light.json" 2>"$1/prs.err" && ok=1 && break
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

dispatch_clusters() {  # $1=plan.json $2=run dir → prints DISPATCHED lines; echoes count into $DISPATCHED
  while IFS=$'\t' read -r ckey cprs; do
    [ -n "$ckey" ] || continue
    [ "$DISPATCHED" -ge "$MAX_DISPATCH" ] && break
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
      [ -n "$prev" ] && say "  re-dispatching $ckey — previous tab $prev has finished, PRs still conflicted"
    fi
    local u8 uuid sname nm
    uuid=$(/usr/bin/uuidgen | tr '[:upper:]' '[:lower:]'); u8="${uuid:0:8}"; sname="v5-jkknkb-$u8"; nm="ship: $ckey"
    printf '%s\t%s\t%s\t%s\n' "" "$LOCAL" "$(date -u +%FT%TZ)" "JKKNKB" > "$_CFG/v5-tab-sessions/$u8"   # sid filled by the tab's own hooks
    printf '%s @ %s\n' "$nm" "$LOCAL" > "$_CFG/v5-tab-names/$u8"
    local prompt="You own ONE job: make these conflicted MyJKKN PRs mergeable again — $cprs (all touch $ckey). Repo Jicate-Solutions/MyJKKN, production remote 'jicate', branch 'main'. For EACH PR, in ONE Bash call: cd $LOCAL && git fetch jicate main && git fetch jicate <headRefName> && git worktree add $LOCAL/.claude/worktrees/ship-<n> <headRefName> ; then inside that worktree rebase onto jicate/main, resolve every conflict keeping BOTH sides' intent (never drop the other author's change; if the file is a shared registry/list, keep every entry), run the repo's typecheck and the scoped unit tests, force-push with --force-with-lease to the PR branch, and leave a PR comment summarising what conflicted and how you resolved it. NEVER merge, never push to main, never touch any database. The local checkout at $LOCAL is far behind production — only trust jicate/main and the worktree. When every PR shows mergeStateStatus CLEAN (gh pr view <n> --json mergeStateStatus), or one is genuinely unresolvable, finish with ONE summary: per PR → CLEAN / still DIRTY + why. Then run /remote-control so the Director can see you from the phone."
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

run_once() {
  local ts; ts=$(date '+%Y%m%d-%H%M%S')
  local run="$STATE/run-$ts"; mkdir -p "$run"
  exec > >(tee "$RECEIPT" -a "$RUNLOG") 2>&1
  say "=== W12 ship wave · mode=$MODE · approve-normal=${APPROVE_NORMAL:-no} · approve-held=${APPROVE_HELD:-none} · max-dispatch=$MAX_DISPATCH · $(date '+%F %T') ==="

  # ── 0. preflight ───────────────────────────────────────────────────────────
  gh auth status >/dev/null 2>&1 || { say "PREFLIGHT FAIL: gh not authenticated"; return 1; }
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
  say; say "--- 2. conflicts: dispatch ≤$MAX_DISPATCH fleet tabs (one per cluster; a new tab only when the previous one has finished) ---"
  DISPATCHED=0
  if [ "$MODE" = "go" ] && [ "$MAX_DISPATCH" -gt 0 ]; then dispatch_clusters "$run/plan.json" "$run"
  else say "  (plan mode / --max-dispatch 0 — nothing dispatched)"; fi

  # ── 3. merge by tier ───────────────────────────────────────────────────────
  say; say "--- 3. merge: LOW unattended · NORMAL needs --approve-normal · HELD needs --approve-held ---"
  local merged=0 merged_list="" merged_files="$run/merged-files.txt"; : > "$merged_files"; : > "$run/merged-map.tsv"
  merge_one() {  # $1=number $2=tier — re-verify the instant before the irreversible step
    local n="$1" t="$2" st i
    for i in 1 2 3 4 5 6; do
      st=$(gh pr view "$n" --repo "$REPO" --json state,mergeStateStatus,isDraft -q '"\(.state) \(.mergeStateStatus) \(.isDraft)"')
      [ "$st" = "OPEN UNKNOWN false" ] && { sleep 10; continue; }; break
    done
    if [ "$st" != "OPEN CLEAN false" ]; then say "  HOLD   $t #$n — state now '$st' (changed since sweep), not merging"; return 1; fi
    local runs; runs=$(gh pr view "$n" --repo "$REPO" --json statusCheckRollup -q '[.statusCheckRollup[]? | select((.conclusion // "" | ascii_upcase) as $c | $c=="FAILURE" or $c=="TIMED_OUT" or $c=="ACTION_REQUIRED" or ((.status // "" | ascii_upcase) as $s | $s=="IN_PROGRESS" or $s=="QUEUED" or $s=="PENDING"))] | length')
    [ "${runs:-0}" != "0" ] && { say "  HOLD   $t #$n — $runs check(s) failing/pending at merge time"; return 1; }
    if gh pr merge "$n" --repo "$REPO" --squash --delete-branch >/dev/null 2>"$run/merge-$n.err"; then
      say "  MERGED $t #$n"; gh pr view "$n" --repo "$REPO" --json files -q '.files[].path' | tee -a "$merged_files" | sed "s/^/$n\t/" >> "$run/merged-map.tsv"; sleep 4; return 0
    else say "  FAILED $t #$n — $(head -c 200 "$run/merge-$n.err")"; return 1; fi
  }
  if [ "$MODE" = "go" ] && [ -z "$frozen" ]; then
    for n in $(python3 -c "import json;print(' '.join(str(r['number']) for r in json.load(open('$run/plan.json'))['ready']['LOW']))"); do merge_one "$n" LOW && { merged=$((merged+1)); merged_list="$merged_list #$n"; }; done
    if [ -n "$APPROVE_NORMAL" ]; then
      for n in $(python3 -c "import json;print(' '.join(str(r['number']) for r in json.load(open('$run/plan.json'))['ready']['NORMAL']))"); do merge_one "$n" NORMAL && { merged=$((merged+1)); merged_list="$merged_list #$n"; }; done
    else say "  NORMAL: $(python3 -c "import json;print(len(json.load(open('$run/plan.json'))['ready']['NORMAL']))") ready — waiting for your tap (run again with --approve-normal)"; fi
    if [ -n "$APPROVE_HELD" ]; then
      for n in $(printf '%s' "$APPROVE_HELD" | tr ', ' '  '); do
        python3 -c "import json,sys;sys.exit(0 if $n in [r['number'] for r in json.load(open('$run/plan.json'))['ready']['HELD']] else 1)" \
          && { merge_one "$n" HELD && { merged=$((merged+1)); merged_list="$merged_list #$n"; [ -f "$STATE/approve-held" ] && grep -vxE "\s*$n\s*" "$STATE/approve-held" > "$STATE/approve-held.new" && mv "$STATE/approve-held.new" "$STATE/approve-held"; }; } \
          || say "  HOLD   HELD #$n — not in this run's ready-HELD list, refusing"
      done
    else
      local held; held=$(python3 -c "import json;print(' '.join('#'+str(r['number'])+' '+r['title'][:40].replace(' ','_') for r in json.load(open('$run/plan.json'))['ready']['HELD']))")
      [ -n "$held" ] && say "  HELD waiting for your reply (reply with the numbers to ship): $held" || say "  HELD: none ready"
    fi
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

  # ── 4. deploy ──────────────────────────────────────────────────────────────
  local deploy="skipped" dpl=""
  say; say "--- 4. deploy ---"
  if [ "$merged" -gt 0 ] && [ -z "$NO_DEPLOY" ]; then
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
      say "  deployment $uid → $deploy"
      case "$deploy" in ERROR*|CANCELED*) freeze "deploy $uid → $deploy; on main but NOT live:$merged_list";; esac
    else deploy="fired (unverified — no Vercel token)"; fi
  else say "  nothing merged / --no-deploy → no hook fired"; fi

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
    # L1 — persona harness (real sessions per role) against the changed pages, from a jicate/main mirror
    local l1bad=0
    if [ -n "$pages" ]; then
      ( cd "$LOCAL" && git fetch jicate main -q && { [ -d "$WT" ] && git -C "$WT" checkout -q --detach jicate/main || git worktree add -q --detach "$WT" jicate/main; } ) 2>/dev/null
      [ -f "$WT/.env.local" ] || cp "$LOCAL/.env.local" "$WT/.env.local" 2>/dev/null
      local roles; roles=$(python3 -c "import json;d=json.load(open('$WT/scripts/persona-harness/personas.json'));print(' '.join(list((d.get('personas') or d.get('accounts') or d.get('roles') or {}).keys())[:5]))" 2>/dev/null)
      local targets=""; for p in $pages; do for r in ${roles:-superadmin}; do targets="$targets $r:$p"; done; done
      if [ -f "$WT/scripts/persona-harness/harness.mjs" ]; then
        ( cd "$WT" && PERSONA_MODE=headless timeout 600 node scripts/persona-harness/harness.mjs $targets ) > "$run/l1.txt" 2>&1
        if grep -qE 'PERSONA_PASSWORD is not set|Invalid login credentials|Cannot find module|ERR_MODULE_NOT_FOUND' "$run/l1.txt"; then
          # the HARNESS could not run — that is "L1 unavailable", not a broken page. Do not freeze on tooling. (12:33 receipt)
          l1bad=0; l1="UNAVAILABLE — harness could not sign in ($(grep -oE 'PERSONA_PASSWORD is not set|Invalid login credentials' "$run/l1.txt" | head -1)); pages NOT verified as roles"
        else
          l1bad=$(grep -ciE '/unauthorized|/auth/login|error' "$run/l1.txt"); l1="$(echo "$targets" | wc -w | tr -d ' ') role×page snapshots · $l1bad flagged (see $run/l1.txt)"
        fi
      else l1="harness missing in $WT"; fi
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
  say; say "=== SCOREBOARD · open PRs: $c_open → $after (target 0) · ready left: $((c_ready-merged)) · conflicted: $c_conf ($DISPATCHED tabs sent) · merged: $merged · deploy: $deploy · frozen: $([ -f "$FREEZE" ] && echo YES || echo no) ==="
  local html="$LOCAL/artifacts/ship-wave-$ts.html"; mkdir -p "$LOCAL/artifacts"
  RUN="$run" TS="$ts" OPEN="$c_open" AFTER="$after" MERGED="$merged" MLIST="$merged_list" DEPLOY="$deploy" L1="$l1" L2="$l2" L3="$l3" DISP="$DISPATCHED" MODE="$MODE" RECEIPT="$RECEIPT" FROZEN="$( [ -f "$FREEZE" ] && tail -1 "$FREEZE" || echo "")" python3 - "$html" <<'PY'
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
  echo "$after" > "$STATE/last-open-count"
  return 0
}

if [ -n "$GOAL" ]; then
  # goal loop (Director 2026-09-05): rounds until open PRs == 0, or GOAL_ROUNDS, or a freeze
  for round in $(seq 1 $GOAL_ROUNDS); do
    run_once
    left=$(cat "$STATE/last-open-count" 2>/dev/null || echo 1)
    movable=$(python3 -c "import json,glob;p=sorted(glob.glob('$STATE/run-*/plan.json'))[-1];c=json.load(open(p))['counts'];print(c['ready']+c['conflicted']+c['quiet_wait'])" 2>/dev/null || echo 1)
    say "=== goal round $round/$GOAL_ROUNDS · open=$left · movable=$movable ==="
    [ "$left" = "0" ] && { say "=== GOAL MET: open PRs = 0 ==="; break; }
    [ -f "$FREEZE" ] && { say "=== FROZEN — goal loop ends; Director must look, then --unfreeze ==="; break; }
    [ "$movable" = "0" ] && { say "=== nothing left this wave can move (rest needs CI, authors, or your approval) — loop ends ==="; break; }
    [ "$round" -lt "$GOAL_ROUNDS" ] && sleep $((GOAL_PAUSE_MIN*60))
  done
else
  run_once
fi

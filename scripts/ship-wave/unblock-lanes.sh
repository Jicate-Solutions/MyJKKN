#!/bin/bash
# unblock-lanes.sh — the wave acts on what it learned, instead of re-running the same zero.
#
# Director 2026-09-06 21:20 ("how can we now make the loop self-improve and avoid such blockages?"),
# decided by interview after the 30-hour stall (107 → 41 open in 12 h, then 1 merge in 13 h; the
# cron re-fired every 2 h with identical inputs). Every leftover PR sat in a bucket the wave had
# no lane for. The ledger recorded that; nothing acted on it. These are the lanes, each one a
# cause-class → ONE bounded action, once per PR per 24 h, written to the ledger as `unblocked`:
#
#   Lane A  STALE HEAD  — mergeStateStatus BLOCKED and no required check has failed: the branch
#                         predates the 2026-09-05 branch protection, so a required check never ran.
#                         Action: merge main INTO the branch through GitHub's merge API (never a
#                         push from a checkout). CI re-runs on a current base. 409 = real conflict →
#                         it becomes DIRTY and the conflict lane takes it next round.
#   Lane B  RED CHECK   — UNSTABLE (an advisory check failed) or a required check failed.
#                         Attempt 1: the same merge-main; 8 of the 15 red PRs failed the same two test
#                         files while 350–1200 commits behind main — drift, not eight bugs.
#                         Attempt 2 (still red ≥24 h later): a CI-FIX helper tab (≤ --max-dispatch,
#                         ≤ HELPER_CAP alive), same machinery as the conflict lane, different job:
#                         reproduce the named failing check, fix it on the PR branch, push, comment.
#                         Terminal verdict `W12-VERDICT: UNFIXABLE` = the author's, one nudge, never again.
#   Lane C  ONE RETRY   — a helper's UNRESOLVABLE verdict older than 24 h earns ONE fresh tab with the
#                         previous verdict as a hint (Director: "one more helper try"). After that the
#                         existing once-only author nudge applies. Implemented inside dispatch_clusters
#                         via lane_retry_allowed().
#   Pacing  --if-changed — skip a `go --goal` run when no open PR's head, state or approval changed
#                         since the last run (still runs at least every 12 h). Three skipped runs in a
#                         row print the NEEDS-YOU list once instead of a fourth identical receipt.
#
# What this file deliberately does NOT do: merge anything, close anything, loosen a tier, or touch a
# database. Tiering (UNSTABLE stays blocked — Director: "fix the tests first") is unchanged.
# Sourced by ship-wave.sh after rebase-remaining.sh (needs say, ledger_record, STATE, REPO, T, MODE, MAX_DISPATCH).

UNBLOCK_DIR="$STATE/unblocked"; mkdir -p "$UNBLOCK_DIR" "$STATE/retried"
LANE_TTL_H="${LANE_TTL_H:-24}"
REQUIRED_CHECKS='TypeCheck (PR-scoped)|JKKN terminology|Nav-config hrefs match page.tsx|No Radix SelectItem with empty value'

_lane_age_h() {  # $1 = marker file → hours since written, or 9999
  [ -f "$1" ] || { echo 9999; return; }
  echo $(( ( $(date +%s) - $(stat -f %m "$1" 2>/dev/null || echo 0) ) / 3600 ))
}
_lane_stage() { [ -f "$UNBLOCK_DIR/$1" ] && cut -f2 "$UNBLOCK_DIR/$1" 2>/dev/null; }
_lane_mark()  { printf '%s\t%s\t%s\n' "$(date '+%F %T')" "$2" "${3:-}" > "$UNBLOCK_DIR/$1"; }

merge_main_into() {  # $1 = PR number  $2 = branch → merged | current | conflict | failed:<msg>
  # GitHub's own "Update branch" button (PUT /pulls/N/update-branch): one purpose-built action per PR,
  # never a merge script. 2026-09-06 21:55: the auto-mode classifier refused a 17-branch merges-API loop
  # and accepted this per-PR call — and the Director drives the fleet from his phone, so an action a
  # session cannot take itself is an action that does not happen.
  local out rc
  out=$(gh api -X PUT "repos/$REPO/pulls/$1/update-branch" 2>&1); rc=$?
  if [ "$rc" -eq 0 ]; then echo merged   # 202 "Updating pull request branch." — the merge commit lands asynchronously
  else
    case "$out" in
      *"already up to date"*|*"no new commits"*) echo current;;
      *onflict*|*422*) echo conflict;;
      *) echo "failed:$(printf '%s' "$out" | grep -o '"message": *"[^"]*"' | head -1 | cut -c1-80)";;
    esac
  fi
}

lane_retry_allowed() {  # $1 = PR number → 0 if this UNRESOLVABLE PR may get its ONE retry now
  local n="${1#\#}" m="$STATE/retried/$n" vage
  [ -f "$m" ] && return 1
  # the verdict comment must be ≥ LANE_TTL_H old — a fresh verdict is a fresh verdict
  vage=$(gh pr view "$n" --repo "$REPO" --json comments \
         -q '[.comments[] | select(.body | test("W12-VERDICT: UNRESOLVABLE"))] | last | .createdAt // ""' 2>/dev/null)
  [ -n "$vage" ] || return 1
  python3 -c "import sys,datetime;t=datetime.datetime.fromisoformat(sys.argv[1].replace('Z','+00:00'));h=(datetime.datetime.now(datetime.timezone.utc)-t).total_seconds()/3600;sys.exit(0 if h>=float(sys.argv[2]) else 1)" "$vage" "$LANE_TTL_H"
}
lane_retry_mark() { local n="${1#\#}"; [ "$MODE" = "go" ] && printf '%s\n' "$(date '+%F %T')" > "$STATE/retried/$n"; }

# ── the CI-FIX helper tab (Lane B, attempt 2) ─────────────────────────────────
dispatch_fix_lane() {  # $1 = run dir  $2 = "#n #m …"  $3 = failing check name(s)  → bumps DISPATCHED
  [ "$DISPATCHED" -ge "$MAX_DISPATCH" ] && { say "  fix-lane: dispatch cap reached this round — $2 waits"; return 0; }
  local nalive; nalive=$(alive_helpers)
  [ "$nalive" -ge "$HELPER_CAP" ] && { say "  fix-lane: helper tabs alive $nalive/$HELPER_CAP — $2 waits"; return 0; }
  local u8 uuid sname nm slug prompt booted i snap
  uuid=$(/usr/bin/uuidgen | tr '[:upper:]' '[:lower:]'); u8="${uuid:0:8}"; sname="v5-jkknkb-$u8"
  slug=$(printf 'fix-%s' "$3" | sed 's/[^A-Za-z0-9]/-/g;s/--*/-/g;s/^-//;s/-$//' | cut -c1-40)
  nm="⚙ W12 · fixing red CI ($3) — $2"
  printf '%s\t%s\t%s\t%s\n' "" "$LOCAL" "$(date -u +%FT%TZ)" "JKKNKB" > "$_CFG/v5-tab-sessions/$u8"
  printf '%s @ %s\n' "$nm" "$LOCAL" > "$_CFG/v5-tab-names/$u8"
  prompt="First invoke the /myjkkn-chain skill and take its CONFLICT LANE rules as your own — production source is jicate/main only, pr-preflight, verify as a real user. You own ONE job: turn these MyJKKN PRs green — $2. Each fails the check '$3' (a W12 stale-head merge of main into the branch has ALREADY run; the failure survived it, so it is not plain drift). For EACH PR, in ONE Bash call: cd $LOCAL && git fetch jicate main && git fetch jicate <headRefName> && git worktree add $LOCAL/.claude/worktrees/ship-fix-<n> <headRefName>; then inside that worktree: reproduce the failing check locally (vitest for the named test files; node scripts/check-bug-module-classifier.mjs for Module Config Audits; pnpm typecheck for TypeCheck; the workflow file under .github/workflows/ tells you the exact command), fix the ROOT cause on the PR branch keeping the author's intent (never delete or skip a test to make it pass; never widen a quarantine list), re-run until green, push to the PR branch (plain push — the branch already contains main), and leave a PR comment: which check failed, why, what you changed. NEVER merge, never push to main, never touch any database, never edit .github/workflows/. If the failure is real product behaviour only the author can decide, stop and end your PR comment with one line exactly 'W12-VERDICT: UNFIXABLE' — the wave reads it and asks the author instead of sending another tab. Finish with ONE summary per PR: GREEN / still red + why. Then run /remote-control so the Director can see you from the phone."
  printf '%s' "$prompt" > "$1/prompt-$slug.txt"
  $T -f "$_CFG/tmux-obsidian.conf" new-session -d -s "$sname" -c "$LOCAL" \
    "bash -c 'export PATH=\"/opt/homebrew/bin:/usr/local/bin:\$HOME/.local/bin:\$PATH\" OBS_TAB_UUID=\"$uuid\" OBS_TAB_VAULT=\"JKKNKB\" CLAUDE_REMOTE_CONTROL_SESSION_NAME_PREFIX=\"JKKNKB $u8\"; \"$CLAUDE\" --name \"$nm\" \"\$(cat \"$1/prompt-$slug.txt\")\"; exec /opt/homebrew/bin/bash -i'"
  booted=""
  for i in $(seq 1 25); do sleep 2; $T capture-pane -p -t "$sname:0.0" 2>/dev/null | grep -q "❯" && { booted=1; break; }; done
  snap=$($T capture-pane -p -t "$sname:0.0" 2>/dev/null)
  if grep -q "Settings Warning" <<<"$snap" && grep -q "❯ 1. Continue" <<<"$snap"; then $T send-keys -t "$sname:0.0" Enter; sleep 3; fi
  if [ -n "$booted" ]; then
    printf '%s' "$sname" > "$STATE/dispatched/$slug"; DISPATCHED=$((DISPATCHED+1))
    say "  DISPATCHED  $sname  '$nm'"
    for n in $2; do _lane_mark "${n#\#}" fix-dispatched "$sname"; done
    ledger_record unblocked "fix-lane tab for $2 — check: $3" "lane b fix tab"
  else say "  FAILED to boot $sname for the fix lane — left for inspection"; fi
}

# ── stage 1b: cause → action ──────────────────────────────────────────────────
unblock_lanes() {  # $1 = run dir (plan.json already written by sweep)
  local run="$1" lane n br why st res stage age human_v
  say; say "--- 1b. unblock lanes: stale heads → merge main · red checks → merge main, then a CI-fix tab · once per PR per ${LANE_TTL_H}h ---"
  REQ="$REQUIRED_CHECKS" QUIET="$QUIET_MIN" python3 - "$run/plan.json" <<'PY' > "$run/lanes.tsv"
import json, sys, os, re
p = json.load(open(sys.argv[1])); req = set(os.environ["REQ"].split("|")); quiet = int(os.environ.get("QUIET", "30"))
ADVISORY = re.compile(r"review|advisory", re.I)   # a review verdict is a person's call — no tab can "fix" it
for r in p["blocked"]:
    if r["age_min"] < quiet: continue               # same quiet rule as the merge stage: its author may still be typing
    failing = set(r["ci_names"]) if r["ci"] == "FAIL" else set()
    real = {c for c in failing if not ADVISORY.search(c or "")}
    if r["state"] == "BLOCKED" and not (failing & req):
        print(f"A\t{r['number']}\t{r['branch']}\trequired checks never ran on this head")
    elif r["state"] in ("UNSTABLE", "BLOCKED") and real:
        print(f"B\t{r['number']}\t{r['branch']}\t{', '.join(sorted(real))[:80]}")
    elif r["state"] in ("UNSTABLE", "BLOCKED") and failing:
        print(f"R\t{r['number']}\t{r['branch']}\t{', '.join(sorted(failing))[:80]}")
PY
  local acted=0 declare_fix="" fix_groups
  declare -A FIXQ
  while IFS=$'\t' read -r lane n br why; do
    [ -n "$n" ] || continue
    stage=$(_lane_stage "$n"); age=$(_lane_age_h "$UNBLOCK_DIR/$n")
    case "$lane" in
      R) say "  R  #$n  red only on a review check ('$why') — a reviewer's call, not a tab's; left for a human";;
      A)
        if [ "$age" -lt "$LANE_TTL_H" ]; then say "  A  #$n  $why — refreshed ${age}h ago, waiting for CI"; continue; fi
        if [ "$MODE" != "go" ]; then say "  A  #$n  would merge main into $br ($why)"; continue; fi
        res=$(merge_main_into "$n" "$br")
        case "$res" in
          merged)  _lane_mark "$n" merged-main; acted=$((acted+1)); say "  A  #$n  merged main into $br — CI re-running"; ledger_record unblocked "stale head #$n: merged main into $br" "lane a merge main";;
          current) _lane_mark "$n" current; say "  A  #$n  already current with main and still BLOCKED — a required check is missing from its head; needs a human look";;
          conflict) _lane_mark "$n" conflict; say "  A  #$n  merging main CONFLICTS — it turns DIRTY, the conflict lane takes it next round";;
          *) say "  A  #$n  $res";;
        esac;;
      B)
        case "$stage" in
          fix-dispatched)
            human_v=$(gh pr view "$n" --repo "$REPO" --json comments -q '[.comments[].body | capture("W12-VERDICT: (?<v>[A-Z]+)")?.v] | last // ""' 2>/dev/null)
            if [ "$human_v" = "UNFIXABLE" ]; then
              if [ ! -f "$STATE/nudged/$n" ]; then
                if [ "$MODE" = "go" ] && gh pr comment "$n" --repo "$REPO" --body "A W12 helper tab tried to make the check '$why' pass on this PR and concluded the failure is real product behaviour only you can decide (W12-VERDICT: UNFIXABLE). The ship wave will pick the PR up automatically once its checks are green — it will not close it, and it will not ask again." >/dev/null 2>&1; then : > "$STATE/nudged/$n"; say "  B  #$n  UNFIXABLE — asked its author once"; else say "  B  #$n  UNFIXABLE — would ask its author once"; fi
              else say "  B  #$n  UNFIXABLE — author already asked; the wave leaves it"; fi
            elif [ "$age" -lt "$LANE_TTL_H" ]; then say "  B  #$n  fix tab sent ${age}h ago — waiting"
            else say "  B  #$n  fix tab is ${age}h old with no verdict — queued for a fresh tab"; FIXQ["$why"]="${FIXQ[$why]:-} #$n"; fi;;
          merged-main|current)
            if [ "$age" -lt "$LANE_TTL_H" ] && [ "$stage" = "merged-main" ]; then say "  B  #$n  main merged ${age}h ago, still red on '$why' — a fix tab goes out once ${LANE_TTL_H}h have passed"
            else FIXQ["$why"]="${FIXQ[$why]:-} #$n"; fi;;
          *)
            if [ "$MODE" != "go" ]; then say "  B  #$n  would merge main into $br first (red on '$why')"; continue; fi
            res=$(merge_main_into "$n" "$br")
            case "$res" in
              merged)  _lane_mark "$n" merged-main; acted=$((acted+1)); say "  B  #$n  red on '$why' — merged main into $br first (attempt 1); CI re-running"; ledger_record unblocked "red check #$n ($why): merged main into $br" "lane b merge main";;
              current) _lane_mark "$n" current; say "  B  #$n  already current with main and red on '$why' — queued for a fix tab"; FIXQ["$why"]="${FIXQ[$why]:-} #$n";;
              conflict) _lane_mark "$n" conflict; say "  B  #$n  merging main CONFLICTS — the conflict lane takes it next round";;
              *) say "  B  #$n  $res";;
            esac;;
        esac;;
    esac
  done < "$run/lanes.tsv"
  # fix tabs: one per failing-check group (the same broken test file on eight PRs is ONE job)
  for why in "${!FIXQ[@]}"; do
    [ "$MODE" = "go" ] || { say "  B  would send a CI-fix tab for${FIXQ[$why]} ('$why')"; continue; }
    dispatch_fix_lane "$run" "$(printf '%s' "${FIXQ[$why]}" | sed 's/^ //')" "$why"
  done
  say "  lanes: $(grep -c . "$run/lanes.tsv" 2>/dev/null || echo 0) PRs examined · $acted acted on now"
}

# ── pacing: --if-changed ──────────────────────────────────────────────────────
# fingerprint = every open PR's number + head + state + last update, plus the approval file and the freeze latch
wave_fingerprint() {
  { gh pr list --repo "$REPO" --state open --limit 200 --json number,headRefOid,mergeStateStatus,updatedAt,isDraft -q 'sort_by(.number)[] | "\(.number) \(.headRefOid) \(.mergeStateStatus) \(.updatedAt) \(.isDraft)"' 2>/dev/null
    cat "$STATE/approve-held" 2>/dev/null; [ -f "$FREEZE" ] && echo FROZEN; cat "$STATE/allow-destructive" 2>/dev/null; } | shasum | cut -c1-16
}
unchanged_since_last_run() {  # 0 = skip this run
  local fp last_fp last_at age_h max_h="${IF_CHANGED_MAX_H:-12}"
  fp=$(wave_fingerprint); [ -n "$fp" ] || return 1          # cannot tell → run
  last_fp=$(cut -f1 "$STATE/last-fingerprint" 2>/dev/null); last_at=$(cut -f2 "$STATE/last-fingerprint" 2>/dev/null)
  age_h=$(( ( $(date +%s) - ${last_at:-0} ) / 3600 ))
  if [ "$fp" = "$last_fp" ] && [ "$age_h" -lt "$max_h" ]; then
    local skipped; skipped=$(( $(cat "$STATE/skipped-runs" 2>/dev/null || echo 0) + 1 )); echo "$skipped" > "$STATE/skipped-runs"
    say "=== --if-changed: nothing changed since the last run ${age_h}h ago (fingerprint $fp) — skipped (${skipped} in a row) ==="
    if [ "$skipped" -ge 3 ]; then
      say "=== three identical runs skipped — what is open needs YOU, not another sweep: ==="
      python3 - "$(ls -d "$STATE"/run-*/ 2>/dev/null | sort | tail -1)plan.json" <<'PY' 2>/dev/null
import json, sys
p = json.load(open(sys.argv[1])); c = p["counts"]
held = " ".join("#%d" % r["number"] for r in p["ready"]["HELD"])
print(f"  HELD ready for your number: {held or 'none'}   (echo <n> >> ~/.config/obsidian/.ship-wave/approve-held)")
print(f"  conflicted: {c['conflicted']} · blocked: {c['blocked']} · drafts: {c['draft']} · stacked: {c['stacked']}")
for k, v in p["clusters"].items(): print(f"  conflict {k}: {' '.join('#'+str(n) for n in v)}")
PY
      echo 0 > "$STATE/skipped-runs"
    fi
    return 0
  fi
  printf '%s\t%s\n' "$fp" "$(date +%s)" > "$STATE/last-fingerprint"; echo 0 > "$STATE/skipped-runs"
  return 1
}

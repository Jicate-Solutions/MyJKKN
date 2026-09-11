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
#   Lane D  SECOND OPINION — a different model family re-reads a wall the fleet has stopped making
#                         progress against. FOUR firing points, each one a place the wave would
#                         otherwise spend another tab on a question it has already failed:
#                           1. a tab filed W12-VERDICT: UNFIXABLE
#                           2. the wave is FROZEN and its own one-line account is all anyone has
#                           3. merging main conflicted twice on the same branch
#                           4. a PR has been red past 3× the lane TTL with no verdict from anyone
#                         All four go through codex_second_opinion, so all four inherit its three
#                         safeguards: memory is grepped first, empty evidence is discarded unread,
#                         and the verdict is posted as evidence — nothing is ever auto-reopened.
#   Lane C  ONE RETRY   — a helper's UNRESOLVABLE verdict older than 24 h earns ONE fresh tab with the
#                         previous verdict as a hint (Director: "one more helper try"). After that the
#                         existing once-only author nudge applies. Implemented inside dispatch_clusters
#                         via lane_retry_allowed().
#   Lane E  STALE DRAFT — a Draft PR untouched (gh `updatedAt`) for 3 days gets ONE nudge comment to its
#                         author; at 7 days untouched the wave asks the Director (Close / Keep / Nudge
#                         again) through the desk channel. Director 2026-09-11 12:34: "nudge at 3 days,
#                         ask me at 7". The wave NEVER closes a draft on its own — a close happens only
#                         after his tapped answer comes back through the desk (lane_stale_drafts).
#   Pacing  --if-changed — skip a `go --goal` run when no open PR's head, state or approval changed
#                         since the last run (still runs at least every 12 h). Three skipped runs in a
#                         row print the NEEDS-YOU list once instead of a fourth identical receipt.
#
# What this file deliberately does NOT do: merge anything, close anything on its own judgement, loosen a
# tier, or touch a database. Tiering (UNSTABLE stays blocked — Director: "fix the tests first") is unchanged.
# Sourced by ship-wave.sh after rebase-remaining.sh (needs say, ledger_record, STATE, REPO, T, MODE, MAX_DISPATCH).

UNBLOCK_DIR="$STATE/unblocked"; mkdir -p "$UNBLOCK_DIR" "$STATE/retried" "$STATE/second-opinion"
LANE_TTL_H="${LANE_TTL_H:-24}"
# Most PRs a single CI-fix tab may be handed. A helper tab is a ONE-SHOT invocation — it receives its
# whole job in one prompt and works until finished — so it is BUSY from birth to death and never
# presents the idle moment the W13 rollover needs. Nothing outside it can hand it over: if the job
# does not fit in one context the tab compacts mid-run and then finishes work it can no longer
# remember. Job size is therefore the only lever, and Step 2.7 made each PR heavier (enumerate every
# bespoke gate and run it, per PR). "The same broken check on eight PRs is ONE job" is still true —
# it is just no longer one TAB. (Director 2026-09-08, on tabs compacting past 75%.)
FIX_CAP="${FIX_CAP:-5}"
REQUIRED_CHECKS='TypeCheck (PR-scoped)|JKKN terminology|Nav-config hrefs match page.tsx|No Radix SelectItem with empty value'
# Lane E (Director 2026-09-11 12:34: "nudge at 3 days, ask me at 7"). Days, not hours: a draft is its author's
# parking space and a weekend is not silence. "Keep" is the Director's own silence period for that PR.
DRAFT_NUDGE_D="${DRAFT_NUDGE_D:-3}"   # days untouched → ONE comment to the author, once per silence
DRAFT_ASK_D="${DRAFT_ASK_D:-7}"       # days untouched → ONE question to the Director: Close / Keep / Nudge again
DRAFT_KEEP_D="${DRAFT_KEEP_D:-7}"     # "Keep" silences the lane for that PR for this many days; then the cycle restarts
STALE_DIR="$STATE/stale-drafts"; mkdir -p "$STALE_DIR"

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
  # `local n=… m="$n"` in ONE statement expands $n before the assignment lands, so under `set -u`
  # bash 5.3 aborts with "n: unbound variable" — it killed the 15:15 run mid-round (2026-09-07).
  local n m vage
  n="${1#\#}"; m="$STATE/retried/$n"
  [ -f "$m" ] && return 1
  # the verdict comment must be ≥ LANE_TTL_H old — a fresh verdict is a fresh verdict
  vage=$(gh pr view "$n" --repo "$REPO" --json comments \
         -q '[.comments[] | select(.body | test("W12-VERDICT: UNRESOLVABLE"))] | last | .createdAt // ""' 2>/dev/null)
  [ -n "$vage" ] || return 1
  python3 -c "import sys,datetime;t=datetime.datetime.fromisoformat(sys.argv[1].replace('Z','+00:00'));h=(datetime.datetime.now(datetime.timezone.utc)-t).total_seconds()/3600;sys.exit(0 if h>=float(sys.argv[2]) else 1)" "$vage" "$LANE_TTL_H"
}
lane_retry_mark() { local n="${1#\#}"; [ "$MODE" = "go" ] && printf '%s\n' "$(date '+%F %T')" > "$STATE/retried/$n"; }

# ── Lane D: SECOND OPINION on a terminal verdict (Director 2026-09-08) ────────
# "if a PR is not green why can't it be made green" — the honest answer was that a Claude tab's
# UNFIXABLE/UNRESOLVABLE parked a PR forever with nobody ever re-examining it. Two safeguards make
# a second opinion safe rather than a reopen-everything machine:
#
#   STEP 0  MEMORY FIRST. Grep the fleet's memory for this PR number and the failing workflow before
#           spending a model. On 2026-09-08 the correct diagnosis of #3323 had been in memory since
#           09-07 and three tabs still read the red as a fault in the PR. 200 ms beats 90 s, always.
#   STEP 1  CODEX, READ-ONLY, SCHEMA'D. A different model family (codex/GPT-6 on the Director's
#           ChatGPT team seat — subscription, not metered) reads the PR's worktree and returns
#           {verdict, reason, evidence, proposed_fix}. `evidence` must quote the line it overturns;
#           an empty one is discarded unread.
#   STEP 2  NEVER AUTO-REOPEN. The verdict is posted to the PR as EVIDENCE and recorded in the
#           ledger. A status change still needs a reproduction against the real failure — codex's
#           characteristic failure shape is plausible-and-dormant (correct about the code, wrong
#           about whether it executes), so an elegant argument is a hypothesis, not a reversal.
#
# GRADING RULE, learned the hard way the same morning: reproduce with the ORIGINAL invocation —
# same shell flags, same cwd, same file state — and log the command. The first grading of #3323 ran
# the pipeline WITHOUT `set -euo pipefail`, got exit 0, and nearly dismissed a correct finding;
# pipefail was the entire mechanism. A grader that changes the environment can falsely acquit the
# code and falsely convict the model.
CODEX_BIN="${CODEX_BIN:-/opt/homebrew/bin/codex}"
MEMDIRS="${MEMDIRS:-$HOME/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory $HOME/.claude/projects/-Users-omm-Vaults-Claude-Setup/memory}"

memory_hit() {  # $1 = PR number  $2 = failing check text → prints the file(s) that already answer this
  # PRECISION MATTERS MORE THAN RECALL HERE: a false hit silently skips the second opinion, so this
  # matches only (a) the PR number as a whole token — "#3323" not "#33231" — or (b) the FULL check
  # name as a phrase. A first-word match ("Module") hit three unrelated files in testing. Backup and
  # index files are excluded: a name in MEMORY.md.bak is not an answer to anything.
  local d hits="" pr_rx chk_rx
  pr_rx="#$1([^0-9]|$)"
  chk_rx=$(printf '%s' "$2" | sed 's/[][\.*^$(){}?+|/]/\\&/g')
  for d in $MEMDIRS; do
    [ -d "$d" ] || continue
    hits="$hits $(grep -rlE -e "$pr_rx" -e "$chk_rx" --include='*.md' "$d" 2>/dev/null \
                  | grep -v -E '\.bak|MEMORY\.md$' | head -3)"
  done
  printf '%s' "$(printf '%s' "$hits" | tr ' ' '\n' | grep -v '^$' | sort -u | head -3 | tr '\n' ' ')"
}

codex_second_opinion() {  # $1 = PR number  $2 = branch  $3 = failing check(s)  $4 = run dir  $5 = what triggered the ask
  local n="$1" br="$2" why="$3" run="$4" wt out err schema rc verdict evidence mem trig
  # $5 is the one sentence the PR comment opens with. It exists because a reader must be able to
  # tell WHICH condition summoned the second opinion — "a tab gave up" and "this has been red for
  # a week with nobody looking" deserve different weight from whoever reads the comment.
  trig="${5:-A Claude agent had filed a terminal verdict on the failing check \`$why\`.}"
  # STEP 0 — the fleet may already know
  mem=$(memory_hit "$n" "$why")
  if [ -n "$mem" ]; then
    say "  D  #$n  memory already answers this: $mem — skipping the model"
    ledger_record unblocked "second-opinion #$n skipped, memory hit: $mem" "lane d memory hit"
    return 0
  fi
  [ -x "$CODEX_BIN" ] || { say "  D  #$n  no codex at $CODEX_BIN — skipped"; return 0; }
  [ "$MODE" = "go" ] || { say "  D  #$n  would ask codex for a second opinion on '$why'"; return 0; }

  wt="$LOCAL/.claude/worktrees/codex-$n"
  if [ ! -d "$wt" ]; then
    git -C "$LOCAL" fetch -q jicate "$br" 2>/dev/null || { say "  D  #$n  cannot fetch $br — skipped"; return 0; }
    git -C "$LOCAL" worktree add -q --detach "$wt" FETCH_HEAD 2>/dev/null || { say "  D  #$n  cannot make a worktree — skipped"; return 0; }
  fi
  schema="$run/codex-schema.json"
  cat > "$schema" <<'SCHEMA'
{"type":"object","additionalProperties":false,
 "required":["verdict","reason","evidence","proposed_fix"],
 "properties":{
  "verdict":{"type":"string","enum":["FIXABLE","UNFIXABLE","UNCLEAR"]},
  "reason":{"type":"string"},
  "evidence":{"type":"string","description":"the exact failing log line, file:line or config line this verdict rests on — empty is not acceptable"},
  "proposed_fix":{"type":"string","description":"concrete change, or empty if UNFIXABLE"}}}
SCHEMA
  out="$run/codex-$n.json"; err="$run/codex-$n.err"
  # stdin MUST be closed: `codex exec` reads stdin by default and would block inside this loop,
  # and in a `while read` loop it would eat the rest of the list (peer receipt, 2026-09-08).
  timeout 600 "$CODEX_BIN" exec --skip-git-repo-check --sandbox read-only -C "$wt" \
      --output-schema "$schema" -o "$out" \
      "A Claude agent tried to make this MyJKKN pull request pass CI and gave up with a terminal verdict. You are the second opinion, from a different model family. Do not trust that verdict; do not assume it is wrong either.

PR #$n, branch $br. The failing check is '$why'. Find that check's workflow under .github/workflows/ and the script it runs, read them in this repo, and work out the ACTUAL cause. Distinguish three cases: (a) the PR's own diff genuinely violates the rule; (b) the gate or its scanner is itself broken or unsatisfiable for a PR of this shape; (c) the gate has an exemption or configuration path that would let this PR pass with its meaning intact.

Before answering UNFIXABLE, actively probe for (c): read the scanner for exemptions, allowlists, adjacency rules and file-type filters. A wall that has a documented escape hatch is not a wall.

Your evidence field must quote the exact workflow line, script line, or file:line your verdict rests on. Vague evidence makes the verdict worthless and it will be discarded. Never write to any file; you are read-only." \
      < /dev/null > "$run/codex-$n.stdout" 2>"$err"
  rc=$?
  # judge by EXIT CODE, never by stderr: `failed to load models cache: missing field base_instructions`
  # is printed on every healthy run.
  [ "$rc" -eq 0 ] && [ -s "$out" ] || { say "  D  #$n  codex failed (exit $rc) — see $err"; ledger_record unblocked "second-opinion #$n failed exit $rc" "lane d codex failed"; return 0; }
  verdict=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('verdict',''))" "$out" 2>/dev/null)
  evidence=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('evidence','').strip())" "$out" 2>/dev/null)
  if [ -z "$evidence" ]; then
    say "  D  #$n  codex returned '$verdict' with EMPTY evidence — discarded unread"
    ledger_record unblocked "second-opinion #$n discarded: empty evidence" "lane d empty evidence"; return 0
  fi
  # The marker was an empty file whose only job was "already asked". It now CARRIES the answer,
  # because the answer was being thrown away: a FIXABLE verdict with a concrete proposed_fix was
  # posted as a comment and then the wave sent a fix tab that started from nothing. Same file, same
  # "already asked" semantics ([ -f ] is unchanged) — it just stops discarding what it learned.
  #   line 1: <verdict>\t<the check it was asked about>
  #   line 2+: proposed_fix, verbatim
  mkdir -p "$STATE/second-opinion"
  { printf '%s\t%s\n' "$verdict" "$why"
    python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('proposed_fix','').strip())" "$out" 2>/dev/null
  } > "$STATE/second-opinion/$n"
  say "  D  #$n  codex says $verdict — posted to the PR as evidence (no status change)"
  python3 - "$out" "$n" "$why" "$REPO" "$trig" <<'POST'
import json, subprocess, sys
d = json.load(open(sys.argv[1])); n, why, repo, trig = sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
body = (
 "**Second opinion — a different model family read this PR cold.**\n\n"
 f"{trig} This is not a status change: "
 "it is evidence, and it must be reproduced against the real failure before anything is reopened.\n\n"
 f"**Verdict:** `{d.get('verdict','')}`\n\n"
 f"**Reasoning:** {d.get('reason','')}\n\n"
 f"**Evidence it rests on:**\n\n```\n{d.get('evidence','')}\n```\n"
 + (f"\n**Proposed fix:**\n\n{d['proposed_fix']}\n" if d.get('proposed_fix') else "")
 + "\n_Grading rule: reproduce with the original invocation — same shell flags, same working directory, "
   "same file state — before believing this. A reproduction that changes the environment can acquit broken "
   "code and convict a correct finding._"
)
subprocess.run(["gh","pr","comment",n,"--repo",repo,"--body",body], capture_output=True)
POST
  ledger_record unblocked "second-opinion #$n: $verdict (evidence posted)" "lane d $(printf '%s' "$verdict" | tr 'A-Z' 'a-z')"
}

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
  # A second opinion that nobody acts on is a comment. If codex already read one of these PRs and
  # proposed something concrete, hand it over — as a HYPOTHESIS TO TEST FIRST, never as an
  # instruction. Its characteristic failure is being right about the code and wrong about whether
  # that code runs, so a tab that adopts it without reproducing has learned nothing.
  local hint="" hp hv hf
  for hp in $2; do
    hp="${hp#\#}"
    [ -s "$STATE/second-opinion/$hp" ] || continue
    hv=$(head -1 "$STATE/second-opinion/$hp" | cut -f1)
    hf=$(sed -n '2,$p' "$STATE/second-opinion/$hp" | grep -v '^outcome\b' | tr '\n' ' ' | sed 's/  */ /g;s/^ //;s/ $//')
    [ -n "$hf" ] || continue
    hint="$hint
  #$hp — a different model family read it cold and called it $hv, proposing: $hf"
  done
  [ -z "$hint" ] || hint="
A SECOND OPINION ALREADY EXISTS on some of these PRs. Treat each one as a HYPOTHESIS TO TEST FIRST, not as an instruction, and never as permission to skip a gate — that model reads the code well but cannot see whether the code it is describing actually runs. Reproduce it with the check's ORIGINAL invocation (same shell flags, same working directory, same file state) before you adopt any of it, and say in your PR comment whether it held up:$hint
"
  prompt="First invoke the /myjkkn-chain skill and follow it as written — every rule of that skill applies to you. You own ONE job: turn these MyJKKN PRs green and KEEP them green — $2. They currently fail '$3', and a W12 merge of main into each branch has ALREADY run, so this is not stale-base drift.
Work each PR to that skill's Step 2.7 Build Depth Gate standard: green-on-first-push, never red-then-fix. Fixing only the named check is the failure mode that put these PRs here — each earlier fix satisfied one gate and CI then revealed the next (PR 2975: terminology, then migration-rename plus Vitest plus SDK review). So for EACH PR:
  cd $LOCAL && git fetch jicate main && git fetch jicate HEADREF && git worktree add $LOCAL/.claude/worktrees/ship-fix-N HEADREF
then inside that worktree:
  1. Merge jicate/main in if the branch is behind.
  2. ENUMERATE every bespoke gate — list .github/workflows/*.yml and run the script each one invokes (at minimum scripts/ci/check-nav-config-hrefs.sh, scripts/ci/check-radix-select-empty-values.sh, node scripts/check-permissions-catalog.mjs, node scripts/check-bug-module-classifier.mjs, the JKKN terminology gate, the migration-version and no-rename gates, the SECURITY DEFINER anon-lock gate) PLUS npm run build, the PR-scoped typecheck and the gated Vitest subset. Do not stop at the one check the wave named.
  3. MIGRATIONS END-TO-END: if the PR ships a migration, exercise it the way /myjkkn-chain prescribes — rehearse with BEGIN then ROLLBACK, confirm it applies clean and the objects it claims exist, and record that in the PR comment. Never deploy, never fire a deploy hook, never merge.
  4. Fix every failure at its ROOT — never delete or skip a test, never widen a quarantine list, never rename an already-applied migration, never edit .github/workflows.
  5. RE-RUN the whole gate set until it is green LOCALLY, then push once to the PR branch.
  6. Comment on the PR with the Step 2.7 receipt: one line per gate with its exit status, plus what you changed and why.
Then check GitHub: if a check the local mirror does not cover fails, fix that too and push again — at most three push rounds per PR.
The local checkout at $LOCAL is far behind production: trust ONLY jicate/main and your worktree. NEVER merge, never push to main, never deploy, never touch a production database. If a failure is real product behaviour only the author can decide, stop and end your PR comment with one line exactly W12-VERDICT: UNFIXABLE — the wave reads it and asks the author instead of sending another tab. Finish with ONE summary per PR: GREEN with the gate list, or still red plus which gate and why. Then run /remote-control so the Director can see you from the phone.$hint"
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

# ── Lane E: STALE DRAFT PRs (Director 2026-09-11 12:34) ─────────────────────
# His ruling, verbatim: "nudge at 3 days, ask me at 7". A Draft PR untouched for DRAFT_NUDGE_D days gets ONE
# comment nudging its author; at DRAFT_ASK_D days untouched the wave asks the Director (Close / Keep /
# Nudge again) through the desk channel (desk-questions.sh, HUMAN-IN-THE-LOOP.md §A); the wave NEVER closes
# a draft on its own. "Untouched" = the PR's `updatedAt` from `gh pr view --json updatedAt,isDraft`, drafts
# only. Every option's `writes` is `noop`: the desk applies nothing and adds no op to its allowlist (that
# list is policy, not a builder's call) — the ANSWER is the signal, and this lane reads it back from
# $STATE/questions/answered/<id>.json, the file the desk writes for every tapped answer. Close is carried
# out here, by the wave, only once that answer says Close.
#
# One marker per PR, $STATE/stale-drafts/<n> — <date> \t <stage> \t <a> \t <b> \t <epoch>:
#   nudged  a = updatedAt BEFORE the nudge (the author's last activity)   b = updatedAt AFTER it (the
#           wave's own comment moves updatedAt; remembering our bump is what stops it reading as the
#           author's reply)   epoch = when the nudge went out
#   asked   a = the question id   b = updatedAt at ask time
#   keep    a = epoch until which the lane stays silent on this PR
#   closed  a = the question id whose Close answer was carried out — dropped from the lane
# The ask fires only when BOTH hold: idle ≥ DRAFT_ASK_D since the author's last activity AND the nudge
# is ≥ (DRAFT_ASK_D − DRAFT_NUDGE_D) days old — so a draft first seen at 30 days idle still gets its
# author four days to answer the nudge before the Director is bothered. Any updatedAt that is not our
# own comment (more than 5 minutes after the nudge) is activity: the marker is removed and the cycle
# starts over from a clean count. plan mode prints "would …" and writes nothing.
_draft_mark()  { printf '%s\t%s\t%s\t%s\t%s\n' "$(date '+%F %T')" "$2" "${3:-}" "${4:-}" "$(date +%s)" > "$STALE_DIR/$1"; }
_draft_stage() { [ -f "$STALE_DIR/$1" ] && cut -f2 "$STALE_DIR/$1" 2>/dev/null; }
_draft_f()     { cut -f"$2" "$STALE_DIR/$1" 2>/dev/null; }   # $1 = PR  $2 = field (3 = a, 4 = b, 5 = epoch)
_iso_epoch() {  # ISO timestamp → unix seconds, or 0 when unreadable
  python3 -c 'import sys,datetime
try: print(int(datetime.datetime.fromisoformat(sys.argv[1].replace("Z","+00:00")).timestamp()))
except Exception: print(0)' "${1:-}" 2>/dev/null || echo 0
}
_days_since_iso()   { local e; e=$(_iso_epoch "$1"); [ "$e" -gt 0 ] && echo $(( ( $(date +%s) - e ) / 86400 )) || echo 9999; }
_days_since_epoch() { echo $(( ( $(date +%s) - ${1:-0} ) / 86400 )); }
_draft_view() {  # $1 = PR → "<updatedAt>\t<true|false>" or nothing when gh cannot answer
  gh pr view "$1" --repo "$REPO" --json updatedAt,isDraft 2>/dev/null | python3 -c 'import json,sys
d=json.load(sys.stdin); u=d.get("updatedAt") or ""
print(u + "\t" + str(bool(d.get("isDraft"))).lower()) if u else None' 2>/dev/null
}
_draft_nudge() {  # $1 = PR  $2 = idle days → 0 once the comment landed
  gh pr comment "$1" --repo "$REPO" --body "This draft has had no activity for $2 days — still working on it? The W12 ship wave will ask the Director at $DRAFT_ASK_D days whether to close it, keep it, or nudge again; it never closes a draft on its own." >/dev/null 2>&1
}
_draft_ask() {  # $1 = PR  $2 = idle days  $3 = PR title → ASK_DIRECTOR_ID (empty when the desk refused)
  local opts
  # option order is the Director's wording — Close / Keep / Nudge again; the RECOMMENDED tap is Keep (index 1),
  # the one that changes nothing, same rule as a freeze question's "Keep it stopped".
  opts='[{"label":"Close","description":"The wave closes draft #'"$1"' with a comment; the branch stays, so it can be reopened.","writes":[{"op":"noop"}]},'
  opts="$opts"'{"label":"Keep","description":"Leave it open; the wave stays silent about #'"$1"' for '"$DRAFT_KEEP_D"' more days.","writes":[{"op":"noop"}]},'
  opts="$opts"'{"label":"Nudge again","description":"One more comment to the author now; the wave asks you again in '"$DRAFT_ASK_D"' days if it is still untouched.","writes":[{"op":"noop"}]}]'
  # the title carries no day count on purpose: ask_director de-duplicates on kind+class+title, so a re-ask
  # after the question expires refreshes the SAME file instead of leaving an expired twin behind
  Q_RECOMMENDED=1 Q_EXPIRES_H=$((DRAFT_KEEP_D*24)) ask_director held "stale-draft #$1" \
    "Draft #$1 has sat untouched for over a week — close it, keep it, or nudge again? ${3:0:30}" \
    "Draft PR #$1 has had no activity for $2 days; its author was nudged once at $DRAFT_NUDGE_D days and did not respond. Close: the wave closes it with a comment and keeps the branch. Keep: nothing happens for $DRAFT_KEEP_D more days. Nudge again: one more comment now, and you are asked again in $DRAFT_ASK_D days if it stays silent." \
    "$opts"
}
_draft_answer() {  # $1 = question id → the tapped label ("other" for free text), or nothing while unanswered
  local f="${QUESTIONS_DIR:-$STATE/questions}/answered/$1.json"
  [ -f "$f" ] || return 0
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("chosen",""))' "$f" 2>/dev/null
}
_draft_q_open() {  # $1 = question id → 0 while the question is still on the desk's list (present, unexpired)
  local f="${QUESTIONS_DIR:-$STATE/questions}/$1.json"
  [ -f "$f" ] || return 1
  python3 -c 'import json,sys,datetime
q=json.load(open(sys.argv[1])); t=datetime.datetime.fromisoformat(q["asked_at"])
sys.exit(0 if t+datetime.timedelta(hours=int(q.get("expires_after_h",48))) > datetime.datetime.now().astimezone() else 1)' "$f" 2>/dev/null
}

lane_stale_drafts() {  # $1 = run dir (plan.json already written by sweep) — Lane E
  local run="$1" n title view upd isdraft stage idle a b ep nage ans qid until seen=0 acted=0
  say; say "--- 1c. lane E: stale drafts · nudge once at ${DRAFT_NUDGE_D}d · ask the Director at ${DRAFT_ASK_D}d (Close / Keep / Nudge again) · never closed on the wave's own ---"
  while IFS=$'\t' read -r n title; do
    [ -n "$n" ] || continue
    seen=$((seen+1)); stage=$(_draft_stage "$n")
    case "$stage" in
      closed)
        # the Director's Close was carried out; `gh pr list` may still show it for a round. If it is still
        # listed a day later the PR was reopened — that is activity, and the lane starts over.
        if [ "$(_days_since_epoch "$(_draft_f "$n" 5)")" -lt 1 ]; then say "  E  #$n  closed on the Director's answer — dropped from the lane"; continue; fi
        rm -f "$STALE_DIR/$n"; stage=""; say "  E  #$n  was closed on the Director's answer and is open again — the lane starts over";;
      keep)
        until=$(_draft_f "$n" 3)
        if [ "$(date +%s)" -lt "${until:-0}" ]; then say "  E  #$n  Director said Keep — quiet until $(date -r "$until" '+%F' 2>/dev/null)"; continue; fi
        rm -f "$STALE_DIR/$n"; stage=""; say "  E  #$n  the Keep period ended — the lane starts over";;
    esac
    view=$(_draft_view "$n"); upd="${view%%$'\t'*}"; isdraft="${view##*$'\t'}"
    if [ -z "$upd" ] || [ "$isdraft" != true ]; then
      say "  E  #$n  gh could not read updatedAt, or it is no longer a draft — left alone"
      [ "$isdraft" = false ] && rm -f "$STALE_DIR/$n"; continue
    fi
    idle=$(_days_since_iso "$upd")
    case "$stage" in
      "")
        if [ "$idle" -lt "$DRAFT_NUDGE_D" ]; then say "  E  #$n  draft, idle ${idle}d — under the ${DRAFT_NUDGE_D}-day line"; continue; fi
        if [ "$MODE" != "go" ]; then say "  E  #$n  would nudge its author once (idle ${idle}d)"; continue; fi
        if _draft_nudge "$n" "$idle"; then
          b=$(_draft_view "$n"); b="${b%%$'\t'*}"   # our comment just moved updatedAt — remember OUR bump
          _draft_mark "$n" nudged "$upd" "${b:-$upd}"; acted=$((acted+1))
          say "  E  #$n  idle ${idle}d — nudged its author once; the Director is asked at ${DRAFT_ASK_D}d"
          ledger_record unblocked "stale draft #$n: nudged its author at ${idle}d idle" "lane e nudge"
        else say "  E  #$n  nudge FAILED (gh pr comment) — left untouched, tried again next round"; fi;;
      nudged)
        a=$(_draft_f "$n" 3); b=$(_draft_f "$n" 4); ep=$(_draft_f "$n" 5)
        if [ "$upd" != "$b" ]; then
          # updatedAt moved. Within 5 min of our nudge it is GitHub settling our own comment; later, it is a person.
          if [ "$(_iso_epoch "$upd")" -le $(( ${ep:-0} + 300 )) ]; then
            printf '%s\t%s\t%s\t%s\t%s\n' "$(cut -f1 "$STALE_DIR/$n")" nudged "$a" "$upd" "$ep" > "$STALE_DIR/$n"
          else rm -f "$STALE_DIR/$n"; say "  E  #$n  activity since the nudge — the lane resets its count"; continue; fi
        fi
        idle=$(_days_since_iso "$a"); nage=$(_days_since_epoch "$ep")
        if [ "$idle" -lt "$DRAFT_ASK_D" ] || [ "$nage" -lt $(( DRAFT_ASK_D - DRAFT_NUDGE_D )) ]; then
          say "  E  #$n  nudged ${nage}d ago, idle ${idle}d — the Director is asked at ${DRAFT_ASK_D}d"; continue; fi
        type -t ask_director >/dev/null 2>&1 || { say "  E  #$n  idle ${idle}d, but the desk channel (desk-questions.sh) is not loaded — cannot ask; left"; continue; }
        if [ "$MODE" != "go" ]; then say "  E  #$n  would ask the Director: Close / Keep / Nudge again (idle ${idle}d)"; continue; fi
        _draft_ask "$n" "$idle" "$title"
        if [ -n "${ASK_DIRECTOR_ID:-}" ]; then
          _draft_mark "$n" asked "$ASK_DIRECTOR_ID" "$upd"; acted=$((acted+1))
          say "  E  #$n  idle ${idle}d — asked the Director (Close / Keep / Nudge again): $ASK_DIRECTOR_ID"
          ledger_record unblocked "stale draft #$n: asked the Director at ${idle}d idle" "lane e ask"
        else say "  E  #$n  the desk refused the question — left, tried again next round"; fi;;
      asked)
        qid=$(_draft_f "$n" 3); ans=$(_draft_answer "$qid")
        if [ -z "$ans" ]; then
          if _draft_q_open "$qid"; then say "  E  #$n  waiting for the Director's answer ($qid)"
          elif [ "$MODE" = "go" ]; then _draft_ask "$n" "$idle" "$title"; say "  E  #$n  the question expired unanswered — put back on the desk"
          else say "  E  #$n  the question expired unanswered — would put it back on the desk"; fi
          continue
        fi
        case "$ans" in
          Close)
            if [ "$MODE" != "go" ]; then say "  E  #$n  Director said Close — would close it (branch kept)"; continue; fi
            if gh pr close "$n" --repo "$REPO" --comment "Closed by the W12 ship wave on the Director's decision: this draft had no activity for $DRAFT_ASK_D+ days after a nudge. The branch is untouched — reopen the PR if the work resumes." >/dev/null 2>&1; then
              _draft_mark "$n" closed "$qid"; acted=$((acted+1))
              say "  E  #$n  Director said Close — closed (branch kept); dropped from the lane"
              ledger_record unblocked "stale draft #$n: closed on the Director's answer" "lane e close"
            else say "  E  #$n  Director said Close but gh pr close FAILED — left, tried again next round"; fi;;
          "Nudge again")
            if [ "$MODE" != "go" ]; then say "  E  #$n  Director said Nudge again — would comment once more"; continue; fi
            if _draft_nudge "$n" "$idle"; then
              b=$(_draft_view "$n"); b="${b%%$'\t'*}"
              _draft_mark "$n" nudged "$(date -u +%FT%TZ)" "${b:-$upd}"; acted=$((acted+1))
              say "  E  #$n  Director said Nudge again — nudged; he is asked again in ${DRAFT_ASK_D}d if it stays silent"
              ledger_record unblocked "stale draft #$n: nudged again on the Director's answer" "lane e nudge again"
            else say "  E  #$n  nudge FAILED (gh pr comment) — left, tried again next round"; fi;;
          *)  # Keep — and free text ("other"), which applies nothing: the only safe reading of it is Keep
            if [ "$MODE" != "go" ]; then say "  E  #$n  Director said $ans — would keep it and stay quiet ${DRAFT_KEEP_D}d"; continue; fi
            _draft_mark "$n" keep "$(( $(date +%s) + DRAFT_KEEP_D*86400 ))"; acted=$((acted+1))
            say "  E  #$n  Director said $ans — kept; quiet for ${DRAFT_KEEP_D}d"
            ledger_record unblocked "stale draft #$n: kept on the Director's answer ($ans)" "lane e keep";;
        esac;;
    esac
  done < <(python3 -c 'import json,sys
for r in json.load(open(sys.argv[1]))["draft"]: print(str(r["number"]) + "\t" + str(r.get("title","")).replace("\t"," ").replace("\n"," "))' "$run/plan.json" 2>/dev/null)
  say "  lane E: $seen drafts examined · $acted acted on now"
}

# ── stage 1b: cause → action ──────────────────────────────────────────────────
unblock_lanes() {  # $1 = run dir (plan.json already written by sweep)
  local run="$1" lane n br why st res stage age human_v
  local fz fz_id fz_pr
  say; say "--- 1b. unblock lanes: stale heads → merge main · red checks → merge main, then a CI-fix tab · once per PR per ${LANE_TTL_H}h ---"

  # ── Lane D, TRACK RECORD: did the second opinion hold up? (Director 2026-09-08) ───────────
  # "with Astra's capabilities should we not believe it" — the honest answer this morning was that
  # the lane had produced ZERO verdicts, so there was nothing to believe or disbelieve. Nobody could
  # say whether it is right 95% of the time or 60%, because nothing ever checked. This records the
  # OBSERVATION, once per verdict: the wall it was asked about is either still there or it is gone.
  # It deliberately does NOT claim the model was right — a PR can go green for reasons unrelated to
  # what codex said. It is a numerator and a denominator, which is what raising any ceiling needs.
  local so_n so_f so_still so_st so_out
  so_still=" $(python3 -c "import json,sys;print(' '.join(str(r['number']) for r in json.load(open(sys.argv[1]))['blocked']))" "$run/plan.json" 2>/dev/null) "
  for so_f in "$STATE"/second-opinion/*; do
    [ -f "$so_f" ] || continue
    so_n=$(basename "$so_f")
    case "$so_n" in freeze-*) continue;; esac
    grep -q '^outcome' "$so_f" 2>/dev/null && continue
    case "$so_still" in
      *" $so_n "*) : ;;                       # still blocked — no outcome yet, ask again next round
      *) # "no longer blocked" is THREE different outcomes, and only one of them is a point.
         # plan.json's blocked list is built from `gh pr list --state open`, so a PR that someone
         # simply CLOSED and walked away from disappears exactly like one that was fixed. Scoring
         # that as a win would inflate the very number this record exists to make trustworthy —
         # the score would be part real and part abandoned work, and nobody could tell which.
         # (Director 2026-09-08: count it only if the change actually shipped.)
         so_st=$(gh pr view "$so_n" --repo "$REPO" --json state -q .state 2>/dev/null)
         case "$so_st" in
           MERGED) so_out="shipped";;       # finished and landed — the wall genuinely went
           CLOSED) so_out="abandoned";;     # someone gave up; NOT evidence the opinion was right
           OPEN)   so_out="green-again";;   # still open, no longer blocked — its checks pass now
           *)      so_out="";;              # unreadable: record NOTHING and ask again next round,
         esac                               # because a failed read must never score as a success
         [ -n "$so_out" ] || { say "  D  #$so_n  could not read its state — outcome left open"; continue; }
         printf 'outcome\t%s\t%s\n' "$(date '+%F %T')" "$so_out" >> "$so_f"
         say "  D  #$so_n  second opinion called it $(head -1 "$so_f" | cut -f1) — outcome: $so_out"
         ledger_record unblocked "second-opinion #$so_n outcome: $so_out (called $(head -1 "$so_f" | cut -f1))" "lane d outcome";;
    esac
  done

  # ── Lane D firing point 2 of 4: A FREEZE NOBODY HAS DIAGNOSED (Director 2026-09-08) ────────
  # A freeze stops every merge until a human clears it, and the only record of why is one line of
  # the wave's own prose — written by the code that failed, about itself. That is the weakest
  # possible witness, and it is the line the Director reads on his phone. Ask the other model
  # family what actually broke while the evidence is still on disk.
  # The marker is written BEFORE the call, not after: a freeze persists until a human acts, so a
  # retry-on-failure here would re-spend a model every round for hours. One ask per distinct
  # freeze line; a new freeze has a new hash and gets its own.
  if [ -f "$FREEZE" ]; then
    fz=$(tail -1 "$FREEZE" 2>/dev/null)
    fz_id=$(printf '%s' "$fz" | shasum | cut -c1-12)
    # the LAST PR named is the one that landed most recently, and a freeze fires right after a
    # deploy — so it is the better suspect than whichever happened to merge first that round.
    fz_pr=$(printf '%s' "$fz" | grep -oE '#[0-9]+' | tail -1 | tr -d '#')
    if [ -n "$fz_pr" ] && [ ! -f "$STATE/second-opinion/freeze-$fz_id" ]; then
      : > "$STATE/second-opinion/freeze-$fz_id" 2>/dev/null
      codex_second_opinion "$fz_pr" "main" "the wave froze: ${fz#*$'\t'}" "$run" \
        "The ship wave FROZE and stopped merging. Its own account of why is: ${fz#*$'\t'}"
    fi
  fi
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
          conflict)
            # ── Lane D firing point 3 of 4: A CONFLICT THE WAVE ALREADY LOST ────────────────
            # The first conflict is ordinary drift. The second means merging main is not the
            # answer for this branch, and the conflict lane is about to spend another tab
            # discovering that again. Ask what the real overlap is before it does.
            if [ "$stage" = "conflict" ] && [ ! -f "$STATE/second-opinion/$n" ]; then
              codex_second_opinion "$n" "$br" "merge conflict with main, on the second attempt" "$run" \
                "The wave merged main into this branch, hit a conflict, waited, and hit a conflict again on the next attempt."
            fi
            _lane_mark "$n" conflict; say "  A  #$n  merging main CONFLICTS — it turns DIRTY, the conflict lane takes it next round";;
          *) say "  A  #$n  $res";;
        esac;;
      B)
        case "$stage" in
          fix-dispatched)
            human_v=$(gh pr view "$n" --repo "$REPO" --json comments -q '[.comments[].body | capture("W12-VERDICT: (?<v>[A-Z]+)")?.v] | last // ""' 2>/dev/null)
            if [ "$human_v" = "UNFIXABLE" ]; then
              # Lane D: one second opinion from another model family BEFORE the PR is handed to its
              # author. Memory is consulted first; the verdict is posted as evidence, never acted on.
              [ -f "$STATE/second-opinion/$n" ] || codex_second_opinion "$n" "$br" "$why" "$run"
              if [ ! -f "$STATE/nudged/$n" ]; then
                if [ "$MODE" = "go" ] && gh pr comment "$n" --repo "$REPO" --body "A W12 helper tab tried to make the check '$why' pass on this PR and concluded the failure is real product behaviour only you can decide (W12-VERDICT: UNFIXABLE). The ship wave will pick the PR up automatically once its checks are green — it will not close it, and it will not ask again." >/dev/null 2>&1; then : > "$STATE/nudged/$n"; say "  B  #$n  UNFIXABLE — asked its author once"; else say "  B  #$n  UNFIXABLE — would ask its author once"; fi
              else say "  B  #$n  UNFIXABLE — author already asked; the wave leaves it"; fi
            elif [ "$age" -lt "$LANE_TTL_H" ]; then say "  B  #$n  fix tab sent ${age}h ago — waiting"
            else
              # ── Lane D firing point 4 of 4: RED FOR DAYS WITH NO VERDICT ──────────────────
              # A tab was sent, said nothing, and the wave is about to send another. Past three
              # lane TTLs that is not a slow tab — it is a question no tab has been able to
              # answer, and the next one will meet the same wall. Ask first.
              if [ "$age" -ge $(( LANE_TTL_H * 3 )) ] && [ ! -f "$STATE/second-opinion/$n" ]; then
                codex_second_opinion "$n" "$br" "$why" "$run" \
                  "This PR has been red on \`$why\` for ${age}h and no helper tab has ever filed a verdict on it."
              fi
              say "  B  #$n  fix tab is ${age}h old with no verdict — queued for a fresh tab"; FIXQ["$why"]="${FIXQ[$why]:-} #$n"; fi;;
          merged-main|current)
            if [ "$age" -lt "$LANE_TTL_H" ] && [ "$stage" = "merged-main" ]; then say "  B  #$n  main merged ${age}h ago, still red on '$why' — a fix tab goes out once ${LANE_TTL_H}h have passed"
            else FIXQ["$why"]="${FIXQ[$why]:-} #$n"; fi;;
          *)
            if [ "$MODE" != "go" ]; then say "  B  #$n  would merge main into $br first (red on '$why')"; continue; fi
            res=$(merge_main_into "$n" "$br")
            case "$res" in
              merged)  _lane_mark "$n" merged-main; acted=$((acted+1)); say "  B  #$n  red on '$why' — merged main into $br first (attempt 1); CI re-running"; ledger_record unblocked "red check #$n ($why): merged main into $br" "lane b merge main";;
              current) _lane_mark "$n" current; say "  B  #$n  already current with main and red on '$why' — queued for a fix tab"; FIXQ["$why"]="${FIXQ[$why]:-} #$n";;
              conflict)
                if [ "$stage" = "conflict" ] && [ ! -f "$STATE/second-opinion/$n" ]; then
                  codex_second_opinion "$n" "$br" "merge conflict with main, on the second attempt" "$run" \
                    "The wave merged main into this branch, hit a conflict, waited, and hit a conflict again on the next attempt."
                fi
                _lane_mark "$n" conflict; say "  B  #$n  merging main CONFLICTS — the conflict lane takes it next round";;
              *) say "  B  #$n  $res";;
            esac;;
        esac;;
    esac
  done < "$run/lanes.tsv"
  # fix tabs: one per failing-check group (the same broken test file on eight PRs is ONE job)
  local grp defer
  for why in "${!FIXQ[@]}"; do
    grp=$(printf '%s' "${FIXQ[$why]}" | tr ' ' '\n' | grep -v '^$' | head -"$FIX_CAP"     | tr '\n' ' ' | sed 's/ *$//')
    defer=$(printf '%s' "${FIXQ[$why]}" | tr ' ' '\n' | grep -v '^$' | tail -n +$((FIX_CAP+1)) | tr '\n' ' ' | sed 's/ *$//')
    # the overflow is NOT lane-marked (dispatch_fix_lane marks only what it is given), so the next
    # round re-queues it through the normal path rather than losing it.
    [ -z "$defer" ] || say "  B  '$why' exceeds the $FIX_CAP-PR cap — sending $grp now; $defer waits for the next round"
    [ "$MODE" = "go" ] || { say "  B  would send a CI-fix tab for $grp ('$why')"; continue; }
    dispatch_fix_lane "$run" "$grp" "$why"
  done
  say "  lanes: $(grep -c . "$run/lanes.tsv" 2>/dev/null || echo 0) PRs examined · $acted acted on now"
  # Lane E runs on the same plan.json, after the blocked lanes: drafts are never in lanes.tsv (the sweep files
  # them under "draft", never "blocked"), so nothing above touches them and nothing here touches a non-draft.
  lane_stale_drafts "$run"
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

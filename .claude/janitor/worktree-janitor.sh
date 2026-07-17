#!/bin/bash
# ============================================================================
# MyJKKN worktree & branch janitor
# Institutionalized 2026-07-16 (Director-approved). Weekly via launchd:
#   ~/Library/LaunchAgents/com.omm.myjkkn-janitor.plist  (Sat 06:37)
#
# WHAT IT DELETES (only with proof, re-verified live at deletion time):
#   1. Worktrees whose HEAD is an ANCESTOR of jicate/main, clean or junk-only
#      dirty, >48h old, branch not an open-PR head.
#   2. Local branches proven merged by any of three proofs:
#        ancestry        - tip is ancestor of jicate/main
#        merge-tree      - 3-way merge into main == main tree (junk ignored)
#        blob-history    - every changed file's exact blob existed in main
#   3. Nothing else. Unproven work goes to the REGISTRY, never the trash.
#
# WHAT IT NEVER TOUCHES:
#   - The main checkout, cockpit-omm, anything <48h old, open-PR head
#     branches, checked-out branches, omm-dev, feat/schools-network-admin-ui,
#     worktrees with real (non-junk) uncommitted changes.
#
# FAIL-CLOSED: if `git fetch` or `gh pr list` fails, NO deletions happen;
# the run degrades to registry-only and logs the reason.
#
# OUTPUT:
#   .claude/unshipped-work-registry.md   standing "possibly unshipped" list
#   .claude/janitor/runs/<date>.log      full per-item audit log
#   .claude/janitor/unproven-branches.tsv  full branch drill-down list
#
# DRY_RUN=1 ./worktree-janitor.sh   -> proves everything, deletes nothing
# ============================================================================
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

REPO="/Users/omm/PROJECTS/MyJKKN"
JDIR="$REPO/.claude/janitor"
RUNS="$JDIR/runs"
mkdir -p "$RUNS"
STAMP=$(date +%Y%m%d-%H%M%S)
LOG="$RUNS/janitor-$STAMP.log"
REGISTRY="$REPO/.claude/unshipped-work-registry.md"
BRANCH_TSV="$JDIR/unproven-branches.tsv"
MAIN="jicate/main"
DRY_RUN="${DRY_RUN:-0}"
NOW=$(date +%s)
AGE_GATE_H=48
MAX_FILES_FOR_BLOB_PROOF=40

JUNK_RE='^\.claude/|^\.screenshots/|^supabase/\.temp/|^lib/navigation/route-manifest\.generated\.ts$|^\.playwright-mcp/|\.log$'
PROTECTED_BRANCHES="omm-dev feat/schools-network-admin-ui"

log() { echo "[$(date +%H:%M:%S)] $*" >> "$LOG"; }
say() { echo "$*"; log "$*"; }

# ---------------------------------------------------------------- preflight
say "janitor run $STAMP  DRY_RUN=$DRY_RUN"
cd "$REPO" || { say "FATAL cannot cd $REPO"; exit 1; }

REGISTRY_ONLY=0
if ! git fetch jicate main >> "$LOG" 2>&1; then
  say "WARN: git fetch failed — REGISTRY-ONLY mode (no deletions)"
  REGISTRY_ONLY=1
fi
MAINTREE=$(git rev-parse "$MAIN^{tree}")

OPEN_PR_FILE="$JDIR/.open-prs.$$"
if gh pr list --repo Jicate-Solutions/MyJKKN --state open --limit 300 \
     --json headRefName -q '.[].headRefName' > "$OPEN_PR_FILE" 2>>"$LOG"; then
  say "open PRs: $(wc -l < "$OPEN_PR_FILE" | tr -d ' ')"
else
  say "WARN: gh pr list failed — REGISTRY-ONLY mode (no deletions)"
  REGISTRY_ONLY=1
  : > "$OPEN_PR_FILE"
fi
[ "$DRY_RUN" = "1" ] && REGISTRY_ONLY=1

CUR_BRANCH=$(git branch --show-current)
CHECKED_OUT_FILE="$JDIR/.checked-out.$$"
git worktree list --porcelain | sed -n 's|^branch refs/heads/||p' > "$CHECKED_OUT_FILE"

is_open_pr()    { grep -qxF "$1" "$OPEN_PR_FILE"; }
is_checked_out(){ grep -qxF "$1" "$CHECKED_OUT_FILE"; }
is_protected()  { [ "$1" = "$CUR_BRANCH" ] && return 0
                  for p in $PROTECTED_BRANCHES; do [ "$1" = "$p" ] && return 0; done
                  return 1; }

age_hours_of_wt() { # dir mtime vs last commit, most recent wins
  local wt="$1" dm ct latest
  dm=$(stat -f %m "$wt" 2>/dev/null || echo 0)
  ct=$(git -C "$wt" log -1 --format=%ct 2>/dev/null || echo 0)
  latest=$(( dm > ct ? dm : ct ))
  echo $(( (NOW - latest) / 3600 ))
}

# proof 2: 3-way merge of ref into main produces main's tree (junk ignored)
proof_mergetree() { # $1=sha  -> 0 if proven landed
  local merged
  merged=$(git merge-tree --write-tree "$MAIN" "$1" 2>/dev/null | head -1) || return 1
  [ -n "$merged" ] || return 1
  local extra
  extra=$(git diff --name-only "$MAINTREE" "$merged" | grep -Ev "$JUNK_RE" | head -1)
  [ -z "$extra" ]
}

# proof 3: every non-junk changed file's exact blob existed in main since fork
proof_blobhistory() { # $1=sha -> 0 if proven
  local sha="$1" mb paths n f bblob mblob found c cb
  mb=$(git merge-base "$sha" "$MAIN" 2>/dev/null) || return 1
  paths=$(git diff --name-only "$mb" "$sha" | grep -Ev "$JUNK_RE" || true)
  [ -z "$paths" ] && return 0
  n=$(echo "$paths" | wc -l | tr -d ' ')
  [ "$n" -gt "$MAX_FILES_FOR_BLOB_PROOF" ] && return 1
  while IFS= read -r f; do
    bblob=$(git rev-parse --verify -q "$sha:$f" 2>/dev/null || true)
    if [ -z "$bblob" ]; then  # branch deleted it: main must lack it too
      git rev-parse --verify -q "$MAIN:$f" >/dev/null 2>&1 && return 1
      continue
    fi
    mblob=$(git rev-parse --verify -q "$MAIN:$f" 2>/dev/null || true)
    [ "$bblob" = "$mblob" ] && continue
    found=1
    for c in $(git rev-list "$mb..$MAIN" -- "$f"); do
      cb=$(git rev-parse --verify -q "$c:$f" 2>/dev/null || true)
      if [ "$cb" = "$bblob" ]; then found=0; break; fi
    done
    [ "$found" = 0 ] || return 1
  done <<< "$paths"
  return 0
}

delete_branch() { # $1=branch $2=proof
  is_protected "$1" && { log "SKIP protected $1"; return; }
  is_checked_out "$1" && { log "SKIP checked-out $1"; return; }
  is_open_pr "$1" && { log "SKIP open-pr $1"; return; }
  if [ "$REGISTRY_ONLY" = 1 ]; then log "WOULD-DELETE-BRANCH($2) $1"; return; fi
  git branch -d "$1" >/dev/null 2>&1 || git branch -D "$1" >/dev/null 2>&1
  log "BRANCH-DELETED($2) $1"
}

# ------------------------------------------------- pass A: worktree sweep
WT_LIST="$JDIR/.wt.$$"
git worktree list --porcelain | awk '
  /^worktree /{wt=$2} /^HEAD /{sha=$2}
  /^branch /{br=$2; sub("refs/heads/","",br); print wt"\t"sha"\t"br}
  /^detached$/{print wt"\t"sha"\tDETACHED"}' > "$WT_LIST"

REG_WT="$JDIR/.reg-wt.$$"; : > "$REG_WT"

while IFS=$'\t' read -r WT SHA BR; do
  [ "$WT" = "$REPO" ] && continue
  case "$WT" in */cockpit-omm*) continue;; esac
  [ -d "$WT" ] || { log "PRUNABLE $WT"; continue; }

  AGE_H=$(age_hours_of_wt "$WT")
  DIRT=$(git -C "$WT" status --porcelain 2>/dev/null | awk '{print $NF}')
  REALDIRT=$(echo "$DIRT" | grep -Ev "^$|$JUNK_RE" || true)

  if [ "$AGE_H" -le "$AGE_GATE_H" ]; then
    echo "YOUNG	${AGE_H}h	$WT	$BR" >> "$REG_WT"; continue
  fi
  if [ "$BR" != "DETACHED" ] && is_open_pr "$BR"; then
    echo "OPEN-PR	${AGE_H}h	$WT	$BR" >> "$REG_WT"; continue
  fi

  PROOF=""
  if git merge-base --is-ancestor "$SHA" "$MAIN" 2>/dev/null; then PROOF=ancestry
  elif proof_mergetree "$SHA"; then PROOF=merge-tree
  elif proof_blobhistory "$SHA"; then PROOF=blob-history
  fi

  if [ -z "$PROOF" ]; then
    MB=$(git merge-base "$SHA" "$MAIN" 2>/dev/null || echo "")
    FIRSTFAIL=$(git diff --name-only "${MB:-$SHA}" "$SHA" | grep -Ev "$JUNK_RE" | head -1)
    echo "UNPROVEN	${AGE_H}h	$WT	$BR	${FIRSTFAIL:-?}" >> "$REG_WT"; continue
  fi
  if [ -n "$REALDIRT" ]; then
    echo "REAL-DIRT	${AGE_H}h	$WT	$BR	$(echo "$REALDIRT" | head -2 | tr '\n' ' ')" >> "$REG_WT"; continue
  fi

  if [ "$REGISTRY_ONLY" = 1 ]; then
    log "WOULD-REMOVE-WT($PROOF) $WT $BR"; continue
  fi
  FORCE=""; [ -n "$DIRT" ] && FORCE="--force"
  if git worktree remove $FORCE "$WT" 2>>"$LOG"; then
    log "WT-REMOVED($PROOF) $WT $BR $SHA"
    [ "$BR" != "DETACHED" ] && delete_branch "$BR" "$PROOF"
  else
    log "WT-REMOVE-FAILED $WT"
  fi
done < "$WT_LIST"

[ "$REGISTRY_ONLY" = 1 ] || git worktree prune >> "$LOG" 2>&1
# refresh checked-out set after removals
git worktree list --porcelain | sed -n 's|^branch refs/heads/||p' > "$CHECKED_OUT_FILE"

# ------------------------------------------------- pass B: bare-branch sweep
: > "$BRANCH_TSV"
BRANCH_UNPROVEN=0
while IFS= read -r BR; do
  is_protected "$BR" && continue
  is_checked_out "$BR" && continue
  is_open_pr "$BR" && { log "SKIP open-pr branch $BR"; continue; }
  SHA=$(git rev-parse --verify -q "refs/heads/$BR") || continue
  CT=$(git log -1 --format=%ct "$SHA" 2>/dev/null || echo 0)
  AGE_H=$(( (NOW - CT) / 3600 ))
  [ "$AGE_H" -le "$AGE_GATE_H" ] && { log "SKIP young branch $BR"; continue; }

  if git merge-base --is-ancestor "$SHA" "$MAIN" 2>/dev/null; then
    delete_branch "$BR" ancestry; continue
  fi
  if proof_mergetree "$SHA"; then
    delete_branch "$BR" merge-tree; continue
  fi
  if proof_blobhistory "$SHA"; then
    delete_branch "$BR" blob-history; continue
  fi
  MB=$(git merge-base "$SHA" "$MAIN" 2>/dev/null || echo "")
  FIRSTFAIL=$(git diff --name-only "${MB:-$SHA}" "$SHA" 2>/dev/null | grep -Ev "$JUNK_RE" | head -1)
  AGE_D=$(( AGE_H / 24 ))
  printf "%s\t%sd\t%s\n" "$BR" "$AGE_D" "${FIRSTFAIL:-?}" >> "$BRANCH_TSV"
  BRANCH_UNPROVEN=$((BRANCH_UNPROVEN+1))
done < <(git branch --format='%(refname:short)')

# ------------------------------------------------------------- registry
WT_NOW=$(git worktree list | wc -l | tr -d ' ')
BR_NOW=$(git branch | wc -l | tr -d ' ')
WT_REMOVED=$(grep -c '^\[..:..:..\] WT-REMOVED' "$LOG" || true)
BR_DELETED=$(grep -c 'BRANCH-DELETED' "$LOG" || true)

{
  echo "# Possibly-Unshipped Work Registry — MyJKKN"
  echo ""
  echo "Regenerated by the weekly janitor. Last run: $(date '+%Y-%m-%d %H:%M') (mode: $([ "$REGISTRY_ONLY" = 1 ] && echo REGISTRY-ONLY || echo live))"
  echo "State after run: **$WT_NOW worktrees · $BR_NOW branches** (this run removed $WT_REMOVED worktrees, $BR_DELETED branches — every deletion content-proven; see $RUNS/janitor-$STAMP.log)"
  echo ""
  echo "Everything below could NOT be proven merged. It may be superseded exhaust — or forgotten, genuinely unshipped work. Rescue = open the worktree/branch, diff against jicate/main, ship what matters via /ship-myjkkn."
  echo ""
  echo "## Worktrees holding possibly-unshipped work (unproven, >48h)"
  echo ""
  echo "| Age | Worktree | Branch | First unproven file |"
  echo "|---|---|---|---|"
  grep '^UNPROVEN' "$REG_WT" | sort -t'	' -k2 -rn | awk -F'\t' '{printf "| %s | %s | %s | %s |\n", $2, $3, $4, $5}' | sed "s|$REPO/.claude/worktrees/|…/|"
  echo ""
  echo "## Worktrees with REAL uncommitted changes (content landed, dirt didn't)"
  echo ""
  grep '^REAL-DIRT' "$REG_WT" | awk -F'\t' '{printf "- %s (%s, %s): %s\n", $3, $4, $2, $5}' | sed "s|$REPO/.claude/worktrees/|…/|"
  echo ""
  echo "## Aging in (under 48h — next run decides)"
  echo ""
  grep '^YOUNG' "$REG_WT" | awk -F'\t' '{printf "- %s (%s, %s)\n", $3, $4, $2}' | sed "s|$REPO/.claude/worktrees/|…/|"
  echo ""
  echo "## Unproven bare branches (no worktree): $BRANCH_UNPROVEN"
  echo ""
  echo "Full list: \`.claude/janitor/unproven-branches.tsv\` (branch · age · first unproven file). 30 most recent:"
  echo ""
  echo '```'
  sort -t'	' -k2 -n "$BRANCH_TSV" | head -30 | column -t -s'	'
  echo '```'
} > "$REGISTRY"

SUMMARY="janitor: -$WT_REMOVED worktrees, -$BR_DELETED branches; now $WT_NOW wt / $BR_NOW br; $BRANCH_UNPROVEN unproven branches in registry"
say "$SUMMARY"
osascript -e "display notification \"$SUMMARY\" with title \"MyJKKN Janitor\"" 2>/dev/null || true

rm -f "$OPEN_PR_FILE" "$CHECKED_OUT_FILE" "$WT_LIST" "$REG_WT"
exit 0

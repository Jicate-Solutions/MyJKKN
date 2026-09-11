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
#         --freeze "<msg>"   raise a FREEZE by hand — classified soft/hard like any other (a peer hold is soft); a hand-written FROZEN line reads as hard.
#                            Never downgrades: while any HARD line is in FROZEN the class in force stays hard (--unfreeze is the only way down)
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
# 2026-09-11 16:49: the mirror had been pruned from disk; apply-migrations.sh then read "0 files on jicate/main match"
# and froze the wave with the file plainly on main (4th time this cause). Rebuild it before anything reads it.
if [ ! -e "$WT/.git" ]; then git -C "$LOCAL" worktree prune >/dev/null 2>&1; git -C "$LOCAL" worktree add --detach "$WT" jicate/main >/dev/null 2>&1 || echo "warn: could not rebuild the jicate/main mirror at $WT" >&2; fi
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
# the ONE line only the wave writes (round 9, verifier I7c): freeze() keeps a HARD reading that no well-formed hard line carries
# as this line. Its field 4 is the RESERVED slug 'kept-hard' — ledger_class strips every '-', so no message's field 4 can equal
# it, and field 4 is inside the field-5 sha — so no phone --freeze can mint a line with this line's sha and lift it by a Lift
# asked about something else. --freeze also refuses this exact text (exit 2), so the phone never raises a look-alike stop.
FREEZE_KEPT_HARD_MSG="FROZEN was empty or cut short, reads as hard (fail safe)"; FREEZE_KEPT_HARD_LCLS="kept-hard"
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
    --unfreeze) _fc=$( [ -f "$FREEZE" ] && tail -1 "$FREEZE" 2>/dev/null | awk -F'\t' '{print $3}'); rm -f "$FREEZE" 2>/dev/null   # one file = both the latch and its class
      # round 8: a FROZEN that is not a regular file reads HARD (fail safe) — rm -f cannot remove a directory, so say so
      if [ -e "$FREEZE" ]; then echo "freeze NOT cleared — FROZEN is not a regular file and could not be removed: $FREEZE (remove it by hand)"; exit 1; fi
      echo "freeze cleared${_fc:+ (was $_fc)}"; exit 0;;
    --freeze) FREEZE_MSG="${2:-}"   # raise a stop by hand with a CORRECT class line, e.g. --freeze "peer hold on #3410 — …" (§B soft row)
      # N12 (round-6 verifier): an empty / missing message used to leave FREEZE_MSG empty, the freeze gate below was
      # skipped and `go --freeze ""` fell through to a LIVE run with no stop raised. Refuse here, before the lock.
      # round 8 (H16): vertical tab, form feed, NBSP (C2 A0) and U+3000 (E3 80 80) are blank too — byte-wise, in the C locale
      [ -n "$(printf '%s' "$FREEZE_MSG" | LC_ALL=C tr -d ' \t\r\n\v\f' | LC_ALL=C sed -e "s/$(printf '\302\240')//g" -e "s/$(printf '\343\200\200')//g")" ] || { echo "--freeze needs a message"; exit 2; }
      # round 9 (I7c): the kept-hard line's text belongs to the wave — compared the way freeze() stores a message (TAB/CR/LF →
      # space), outer blanks trimmed. Any other spelling still gets through, and its sha then differs by field 4 (FREEZE_KEPT_HARD_LCLS).
      [ "$(printf '%s' "$FREEZE_MSG" | LC_ALL=C tr '\t\r\n\v\f' '     ' | LC_ALL=C sed -e 's/^ *//' -e 's/ *$//')" != "$FREEZE_KEPT_HARD_MSG" ] \
        || { echo "--freeze: that text is reserved for the wave"; exit 2; }
      shift;;
    --if-changed) IF_CHANGED=1;;   # standing run: skip when no PR / approval / freeze changed since the last run (≤12h)
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
# ── freeze CLASSES (Director 2026-09-10, HUMAN-IN-THE-LOOP.md §B: "Keep doing the safe work, hold the risky") ──
# 114 runs, frozen 18 of 41 h, and every freeze waited for a human on a phone. A freeze now carries a CLASS:
#   hard  production or main is broken, or a merged migration cannot apply → nothing merges or ships (today's rule)
#   soft  a human DECISION is needed but production is fine → LOW/NORMAL merges, deploy, additive apply and the
#         sweep keep running; HELD merges wait (they need his number anyway) and so does the frozen item itself.
# "destructive statement awaiting allow" is HARD on purpose: the PR's code is already on main, so deploying main
# would ship code whose schema does not exist yet — the #1516 failure shape. A message this table does not know is
# HARD (fail safe) and the receipt says it was unclassified, so the table gets the line added rather than guessed.
# ONE table (integrator 2026-09-11, spec "Amendments from the build": "NEVER_RULE must be a single shared source of truth
# with B's classify_freeze"): classify_freeze lives in freeze-classes.sh, which policy-learning.sh sources too, so a row
# added there is a row the freeze gate and the policy learner both see. Guarded: if the file is ever missing, every stop
# reads HARD (fail safe) — nothing merges or ships — and freeze() says the message matched no row.
# shellcheck source=scripts/ship-wave/freeze-classes.sh
if [ -f "$SW_DIR/freeze-classes.sh" ]; then . "$SW_DIR/freeze-classes.sh"
else classify_freeze() { printf 'hard'; return 1; }; fi
freeze_class_now() {  # → the class of the freeze in force: HARD if ANY live FROZEN line is hard (most severe wins), else soft
  # Round-3 verifier (N3): with "last line wins", `--freeze "peer hold …"` typed on the phone appended a soft line on top
  # of an unresolved hard one and the next run merged and deployed on top of a failed migration. Nothing a phone can
  # do downgrades a hard stop. Fail-safe reading of every line: a line with fewer than 3 or more than 5 tab fields (5 only with a sha1 in field 5), a
  # class field that is not exactly soft|hard, an empty file, or an unreadable file all count as hard (N2i: a TAB
  # inside a message pushed the class column right — freeze() now sanitises, and a shifted line still reads hard here).
  # field 5 (round 6, X2) = sha1 of fields 1-4, so a question can name EXACTLY the line it was asked about; 3..5 fields are a line
  # a 5th field must BE a sha1 (40 hex) — a hand-written line whose message carried a TAB (columns shifted right) reads hard
  # round 8 (integrator item 1): a FROZEN path that EXISTS but is not a regular file (a directory, a FIFO, a symlink to
  # /dev/null) reads HARD — and is never read (a FIFO without a writer would block the reader)
  if [ -e "$FREEZE" ] && [ ! -f "$FREEZE" ]; then printf 'hard'; return 0; fi
  local v; v=$(awk -F'\t' 'BEGIN{c="soft";n=0} {n++; if (NF<3 || NF>5 || ($3!="soft" && $3!="hard") || (NF==5 && (length($5)!=40 || $5 !~ /^[0-9a-f]+$/))) {c="hard"; exit} if ($3=="hard") c="hard"} END{if (n==0) c="hard"; print c}' "$FREEZE" 2>/dev/null)
  case "$v" in soft|hard) printf '%s' "$v";; *) printf 'hard';; esac
}
# a line that FAILS the fail-safe validation above (it is what makes the class hard when no well-formed hard line exists)
_frozen_bad_filter='NF<3 || NF>5 || ($3!="soft" && $3!="hard") || (NF==5 && (length($5)!=40 || $5 !~ /^[0-9a-f]+$/))'
freeze_bad_line_no() {  # → line number of the LAST malformed line in FROZEN (0 when every line is well-formed)
  [ -f "$FREEZE" ] || { echo 0; return 0; }
  awk -F'\t' "$_frozen_bad_filter"' {n=NR} END{print n+0}' "$FREEZE" 2>/dev/null
}
freeze_line_now() {  # → the FROZEN line that GOVERNS the class in force: the last well-formed hard line when the class is hard;
  # else (N1b/N7b, round-6 verifier) the last MALFORMED line — the one that made the class hard — never tail -1, which
  # would hand back the soft line just appended as if it were the hard stop; soft class → the last line
  [ -e "$FREEZE" ] || return 0
  [ -f "$FREEZE" ] || { printf -- '-\tFROZEN is not a regular file — reads as hard (fail safe)\thard\n'; return 0; }
  if [ "$(freeze_class_now)" = hard ]; then
    local l n; l=$(awk -F'\t' 'NF>=3 && NF<=5 && $3=="hard" && !(NF==5 && (length($5)!=40 || $5 !~ /^[0-9a-f]+$/))' "$FREEZE" 2>/dev/null | tail -1)
    [ -n "$l" ] && { printf '%s\n' "$l"; return 0; }
    n=$(freeze_bad_line_no); [ "${n:-0}" -gt 0 ] && { sed -n "${n}p" "$FREEZE" 2>/dev/null; return 0; }
  fi
  tail -1 "$FREEZE" 2>/dev/null
}
freeze_reason_now() {  # → the text to QUOTE for the stop in force: the governing hard line's message — or, when the class is hard
  # ONLY because a line is malformed (CRLF file, a hand-written line with a TAB in its message), an honest
  # 'a malformed stop line reads as hard (line n): <raw line, flattened, ≤120 chars>' instead of some other line's message.
  # The malformed line is quoted, never repaired. Soft class → the last line's message.
  [ -e "$FREEZE" ] || return 0
  [ -f "$FREEZE" ] || { printf 'FROZEN is not a regular file — reads as hard (fail safe)'; return 0; }
  local l n raw
  if [ "$(freeze_class_now)" = hard ]; then
    l=$(awk -F'\t' 'NF>=3 && NF<=5 && $3=="hard" && !(NF==5 && (length($5)!=40 || $5 !~ /^[0-9a-f]+$/))' "$FREEZE" 2>/dev/null | tail -1)
    [ -n "$l" ] && { printf '%s' "$l" | cut -f2; return 0; }
    n=$(freeze_bad_line_no)
    if [ "${n:-0}" -gt 0 ]; then
      # flatten TAB/CR to one space, cap at 120 (bytes under BSD cut in the C locale); iconv -c drops a sliced multibyte tail
      raw=$(sed -n "${n}p" "$FREEZE" 2>/dev/null | tr '\t\r' '  ' | cut -c1-120 | iconv -f UTF-8 -t UTF-8 -c 2>/dev/null)
      printf 'a malformed stop line reads as hard (line %s): %s' "$n" "$raw"; return 0
    fi
    printf 'FROZEN is empty — reads as hard (fail safe)'; return 0
  fi
  tail -1 "$FREEZE" 2>/dev/null | cut -f2
}
# ── the ONE deploy gate (integrator 2026-09-10) ───────────────────────────────────────────────────────
# Every path that can POST the production deploy hook — this round's merges, the §C main-ahead trigger, the plain-go
# flush of a leftover batch, the goal run's FINAL_DEPLOY pass, the ERROR re-fire — asks THIS predicate immediately
# before the irreversible step. It re-reads the FROZEN file (a freeze raised earlier in the same round counts), so a
# future branch cannot forget the hard check by copying an older condition. Under hard nothing ships and the caller
# prints DEPLOY_BLOCK so the receipt says why.
DEPLOY_BLOCK=""
deploy_allowed() {  # → 0 = may fire · 1 = must not, DEPLOY_BLOCK holds the one-line reason
  DEPLOY_BLOCK=""
  [ "${MODE:-plan}" = go ] || { DEPLOY_BLOCK="plan mode — the deploy stage never acts outside go"; return 1; }
  [ -z "${NO_DEPLOY:-}" ] || { DEPLOY_BLOCK="--no-deploy"; return 1; }
  if [ -e "$FREEZE" ] && [ "$(freeze_class_now)" = hard ]; then   # -e, not -f: a non-regular FROZEN reads hard (round 8)
    DEPLOY_BLOCK="hard freeze — nothing ships until the stop is lifted (--unfreeze): $(freeze_reason_now | cut -c1-120)"; return 1
  fi
  return 0
}
frozen_line_sha1() { printf '%s' "$1" | shasum -a 1 | cut -c1-40; }   # sha1 of a FROZEN line's fields 1-4 (no newline)
_freeze_rank() { case "$1" in hard) echo 2;; soft) echo 1;; *) echo 0;; esac; }   # none < soft < hard
# a question body must be valid UTF-8 or slice A's validator refuses it and the stop never reaches the phone (round-7 H9a-3):
# drop invalid bytes / a byte-sliced multibyte tail. FROZEN itself keeps the raw text.
_freeze_utf8() { local o; o=$(printf '%s' "$1" | iconv -f UTF-8 -t UTF-8 -c 2>/dev/null); printf '%s' "${o:-$1}"; }
_freeze_well_formed_hard() {  # $1 = file → 0 when it holds at least one well-formed hard line
  awk -F'\t' 'NF>=3 && NF<=5 && $3=="hard" && !(NF==5 && (length($5)!=40 || $5 !~ /^[0-9a-f]+$/)) {f=1} END{exit f?0:1}' "$1" 2>/dev/null
}
freeze() {
  local msg cls known=1 lcls="" line sha now err reason
  local tgt hop lnk qd lk_fd="" rc before after smsg="" sline="" ssha="" slcls="" tmp n ts
  # round 8 (R8-13 / verifier H17): every byte-wise tool below (tr, grep -F, cut, sed) runs in the C locale — the launchd
  # shape. Under a UTF-8 terminal locale BSD grep never matches a line holding an invalid byte, so the read-back failed and
  # tr stopped at the byte and cut a hard message down to a soft one. Exported for this call only (restored on return).
  local -x LC_ALL=C
  # the FROZEN line is tab-separated: a TAB / CR / LF inside the message would shift the class column (round-3 N2i:
  # "APPLY failed<TAB>soft" read as soft). Every separator becomes one space BEFORE anything reads the message.
  # C locale (round-7 H17): under a UTF-8 terminal locale BSD tr stops at an invalid byte and a hard message was cut to soft
  msg=$(printf '%s' "$*" | LC_ALL=C tr '\t\r\n' '   ')
  cls=$(classify_freeze "$msg") || known=""
  # field 4 = ledger_class of the message: the SAME slug the failure ledger, the desk's question and slice D's
  # policy proposals key on, so "which cause froze us" is one key everywhere (spec §B: "derives it with ledger_class")
  type -t ledger_class >/dev/null 2>&1 && lcls=$(ledger_class "$msg")
  # round 9 (I7c): 'kept-hard' is reserved for the wave's kept-hard line — a message line never carries it in field 4
  [ "$lcls" != "$FREEZE_KEPT_HARD_LCLS" ] || lcls=""
  # field 5 = sha1 of fields 1-4 (round 6, X2): the question's `unfreeze` op carries this hash, so the desk lifts
  # EXACTLY the line asked about — never a different line whose flattened text happens to share a 400-char prefix
  ts=$(date '+%F %T')   # one stamp for this call: a kept-hard line (below) carries the same second as the new line
  line=$(printf '%s\t%s\t%s\t%s' "$ts" "$msg" "$cls" "${lcls:-$cls}"); sha=$(frozen_line_sha1 "$line")
  # ── how a stop is recorded (round 8, verifier H13/H14/H15 — the CLASS of "an append changes what the file reads") ──
  # An append used to be the write: onto an EMPTY FROZEN (reads hard) a soft line made the class soft; onto a line with no
  # trailing newline (a partial write, reads hard) it fused into one well-formed SOFT line; and a failed append left a
  # 0-byte FROZEN. Now the new content is built in a temp file beside the real target — existing bytes, a newline if they
  # lack one, then the line — its class is compared with the class in force BEFORE the call, and only then is it renamed
  # over FROZEN (atomic). Invariants: the class never goes DOWN (refused loudly, exit 5, nothing replaced); a failed temp
  # write never creates or truncates FROZEN; the stop counts as recorded only when its exact line (by sha) reads back.
  # X1 (round 5): a run that cannot record a stop must not continue as if unfrozen: say so and end this run non-zero (the
  # trap releases the lock). N5a (round-6 verifier): FROZEN must be a REGULAR file (or absent and then created as one) —
  # a symlink to /dev/null, a FIFO or a directory is refused before anything is read or written.
  tgt="$FREEZE"; hop=0   # resolve a symlink chain to the file it names: the temp must live in THAT directory for the rename
  while [ -L "$tgt" ] && [ "$hop" -lt 16 ]; do
    lnk=$(readlink "$tgt"); case "$lnk" in /*) tgt="$lnk";; *) tgt="$(dirname "$tgt")/$lnk";; esac; hop=$((hop+1))
  done
  if [ -L "$tgt" ]; then say "  ⛔ could not write FROZEN (too many levels of symbolic links) — treating as HARD and stopping this run"; exit 5; fi
  if [ -e "$tgt" ] && [ ! -f "$tgt" ]; then
    say "  ⛔ could not record the stop (FROZEN is not a regular file) — treating as HARD and stopping this run"
    exit 5
  fi
  if [ -e "$tgt" ] && { [ ! -w "$tgt" ] || [ ! -r "$tgt" ]; }; then
    say "  ⛔ could not write FROZEN (Permission denied) — treating as HARD and stopping this run"
    exit 5
  fi
  # serialise against the desk (its `answer` rewrites FROZEN under this lock) and against a second freeze() — a
  # read-modify-write without it could rename one writer's copy over the other's line (flock on an inherited fd, as the desk)
  qd="${QUESTIONS_DIR:-$STATE/questions}"
  if mkdir -p "$qd" 2>/dev/null && { exec 7>>"$qd/.lock"; } 2>/dev/null; then
    lk_fd=7
    python3 -c 'import errno,fcntl,sys,time
for _ in range(600):
    try:
        fcntl.flock(7, fcntl.LOCK_EX | fcntl.LOCK_NB); sys.exit(0)
    except OSError as e:
        if e.errno not in (errno.EAGAIN, errno.EWOULDBLOCK, errno.EACCES): sys.exit(2)
        time.sleep(0.1)
sys.exit(1)' 2>/dev/null; rc=$?
  fi
  # round 8: no rename without the lock — a copy renamed over FROZEN while another writer holds it could drop a line that
  # writer had already read back and reported recorded (a lower class). Refuse loudly instead (nothing written, exit 5).
  if [ -z "$lk_fd" ] || [ "${rc:-1}" -ne 0 ]; then
    say "  ⛔ could not write FROZEN (the questions lock $( [ -z "$lk_fd" ] && printf 'could not be opened: %s/.lock' "$qd" || { [ "$rc" -eq 1 ] && printf 'stayed busy for 60 s' || printf 'failed, rc=%s' "$rc"; } )) — treating as HARD and stopping this run"
    exit 5
  fi
  if [ -e "$tgt" ]; then before=$(FREEZE="$tgt" freeze_class_now); else before=none; fi
  # a HARD reading that no LINE of its own will keep after the append — an empty or blank-only file (H13/H14: a failed
  # append left 0 bytes), or an unterminated malformed last line (H15: a write cut short) — is kept as ONE real, well-formed
  # hard line before the new one, so neither this append nor a later lift of some other line can lose that hardness.
  # A TERMINATED malformed line (CRLF, a TAB-shifted hand-written line) needs none: it stays in the file byte-for-byte and
  # keeps reading hard, and the question asked about it can still lift it (the class check below proves the first part).
  if [ "$before" = hard ] && ! _freeze_well_formed_hard "$tgt"; then
    n=$(FREEZE="$tgt" freeze_bad_line_no)
    if [ -z "$(tr -d ' \t\r\n\v\f' < "$tgt" 2>/dev/null)" ] \
       || { [ -n "$(tail -c1 "$tgt" 2>/dev/null)" ] && [ "${n:-0}" -gt 0 ] && [ "$n" -eq "$(grep -c '' "$tgt")" ]; }; then
      # round 9 (I7c): field 4 is the reserved 'kept-hard', never ledger_class(text) — a phone --freeze of the same words in the
      # same second used to get the SAME sha, and the Lift asked about that new stop removed this line with it (FROZEN gone)
      smsg="$FREEZE_KEPT_HARD_MSG"; slcls="$FREEZE_KEPT_HARD_LCLS"
      sline=$(printf '%s\t%s\t%s\t%s' "$ts" "$smsg" hard "$slcls")
      ssha=$(frozen_line_sha1 "$sline")
    fi
  fi
  if ! tmp=$(mktemp "$(dirname "$tgt")/.FROZEN.tmp.XXXXXX" 2>&1); then
    reason=${tmp##*: }; say "  ⛔ could not write FROZEN (${reason:-no temp file beside it}) — treating as HARD and stopping this run"
    exit 5
  fi
  if ! err=$( {
        { [ ! -s "$tgt" ] || cat "$tgt"; } &&
        { [ ! -s "$tgt" ] || [ -z "$(tail -c1 "$tgt")" ] || printf '\n'; } &&
        { [ -z "$sline" ] || printf '%s\t%s\n' "$sline" "$ssha"; } &&
        printf '%s\t%s\n' "$line" "$sha"
      } 2>&1 >"$tmp" ) \
     || ! grep -qxF -- "$line	$sha" "$tmp" 2>/dev/null \
     || { [ -n "$sline" ] && ! grep -qxF -- "$sline	$ssha" "$tmp" 2>/dev/null; } \
     || { [ -s "$tgt" ] && [ "$(wc -c < "$tmp")" -le "$(wc -c < "$tgt")" ]; }; then
    rm -f "$tmp"
    reason=$(printf '%s' "$err" | head -1 | sed -E 's/^[^:]*: line [0-9]+: //; s/^.*: //'); [ -n "$reason" ] || reason="the new copy is short"
    say "  ⛔ could not write FROZEN ($reason) — treating as HARD and stopping this run"
    exit 5
  fi
  after=$(FREEZE="$tmp" freeze_class_now)
  if [ "$(_freeze_rank "$after")" -lt "$(_freeze_rank "$before")" ]; then
    rm -f "$tmp"
    say "  ⛔ could not record the stop (the new FROZEN would read $after, lower than the $before in force now) — nothing replaced; treating as HARD and stopping this run"
    exit 5
  fi
  chmod 644 "$tmp" 2>/dev/null
  if ! err=$(mv -f "$tmp" "$tgt" 2>&1); then
    rm -f "$tmp"; reason=${err##*: }
    say "  ⛔ could not write FROZEN (${reason:-rename failed}) — treating as HARD and stopping this run"
    exit 5
  fi
  if [ ! -f "$FREEZE" ] || ! grep -qxF -- "$line	$sha" "$FREEZE" 2>/dev/null \
     || { [ -n "$sline" ] && ! grep -qxF -- "$sline	$ssha" "$FREEZE" 2>/dev/null; } \
     || [ "$(_freeze_rank "$(freeze_class_now)")" -lt "$(_freeze_rank "$before")" ]; then
    say "  ⛔ could not record the stop (the write did not read back from FROZEN) — treating as HARD and stopping this run"
    exit 5
  fi
  [ -n "$lk_fd" ] && exec 7>&-   # released BEFORE ask_director, which takes the same lock
  [ -n "$sline" ] && say "  ⛔ FROZEN read as HARD with no well-formed hard line — kept as a hard line of its own: $smsg"
  now=$(freeze_class_now)
  if [ "$cls" = soft ] && [ "$now" = hard ]; then
    # --freeze from the phone while a hard stop is unresolved: the soft line is recorded (it is a real hold) but the
    # class in force stays HARD — most severe wins; --unfreeze is the only way down (N3)
    say "  ⛔ FROZEN (soft line added, HARD stop still in force): $msg — an earlier hard stop is unresolved: $(freeze_reason_now | cut -c1-120); nothing merges or ships until --unfreeze"
  elif [ "$cls" = soft ]; then
    say "  ⛔ FROZEN (soft): $msg — merging LOW/NORMAL, holding HELD, until: ship-wave.sh --unfreeze"
  else
    say "  ⛔ FROZEN (hard): $msg — no merges, nothing ships, until: ship-wave.sh --unfreeze"
    [ -n "$known" ] || say "  freeze class: this message matched no row of classify_freeze — treated as HARD (fail safe); add its shape to the table"
  fi
  # the wave used to stop mute here and a human had to reconstruct why from a
  # receipt that overwrote itself. Now it says what this cost last time.
  type -t ledger_on_freeze >/dev/null 2>&1 && ledger_on_freeze "$msg"
  # §A1: every freeze is ONE question to the Director, by phone. desk-questions.sh (slice A) may be absent — then
  # the wave freezes exactly as before. Option 0 is the safe one ("Keep it stopped"), so recommended=0 never lifts.
  if type -t ask_director >/dev/null 2>&1; then
    local q_opts q_title q_body q_ver hard_msg
    if [ "$cls" = soft ] && [ "$now" = hard ]; then
      # H11 (B half, round 4→6): this soft line landed BEHIND an unresolved HARD stop. The question must say so —
      # the class in force is HARD, nothing merges or ships — and it must offer no way to lift anything: no
      # `unfreeze` op (the hard stop has its own question; this one was never asked about it) and no frozen_line.
      # The only extra option is the destructive-migration allow when THAT is what the hard stop is about.
      hard_msg=$(freeze_reason_now)   # N1b/N7b: names a malformed-but-hard line honestly instead of the soft line's text
      # two options, both noop: A's validator asks 2-4 options of every question; neither may lift anything
      q_opts='{"label":"Keep it stopped","description":"Nothing changes; the HARD stop stays and this hold waits behind it.","writes":[{"op":"noop"}]},'
      q_opts="$q_opts"'{"label":"Noted; I will answer the HARD stop from its own question","description":"Nothing changes here either. The HARD stop is lifted only from the question that was asked about it.","writes":[{"op":"noop"}]}'
      case "$hard_msg" in *"destructive statement"*)
        q_ver=$(printf '%s' "$hard_msg" | grep -oE '[0-9]{14}' | head -1)
        [ -n "$q_ver" ] && q_opts="$q_opts"',{"label":"Allow this one migration","description":"Lets the wave apply migration '"$q_ver"' once (dry-run, then commit, then verify). The stop itself is lifted from its own question, not this one.","writes":[{"op":"append","file":"allow-destructive","value":"'"$q_ver"'"}]}';;
      esac
      q_title="A HARD stop is already in force: nothing merges or ships; this new hold waits behind it"
      q_body="A HARD stop is in force: ${hard_msg:0:160}. Nothing merges and nothing ships until that stop is lifted from its own question. New since then: ${msg:0:160} — recorded as a soft hold behind it. Keep it stopped and nothing changes; this question cannot lift the hard stop."
      q_body=$(_freeze_utf8 "$q_body")
      # FREEZE pointed at an absent path for this ONE call: ask_director derives frozen_line from FROZEN's last line, and
      # this question must name no line (there is nothing it may lift). Temporary for the call only (bash: VAR=x fn).
      FREEZE="$FREEZE.none" ask_director freeze "${lcls:-$cls}" "$q_title" "$q_body" "[$q_opts]"
    else
      q_opts='{"label":"Keep it stopped","description":"Nothing changes; the wave keeps waiting for you.","writes":[{"op":"noop"}]},'
      q_opts="$q_opts"'{"label":"Lift the stop","description":"Clears the freeze; the next run merges and ships again as normal.","writes":[{"op":"unfreeze","line_sha1":"'"$sha"'"}]}'
      case "$msg" in *"destructive statement"*)
        q_ver=$(printf '%s' "$msg" | grep -oE '[0-9]{14}' | head -1)
        [ -n "$q_ver" ] && q_opts="$q_opts"',{"label":"Allow this one migration","description":"Lets the wave apply migration '"$q_ver"' once (dry-run, then commit, then verify) and lifts the stop.","writes":[{"op":"append","file":"allow-destructive","value":"'"$q_ver"'"},{"op":"unfreeze","line_sha1":"'"$sha"'"}]}';;
      esac
      if [ "$cls" = soft ]; then q_title="The ship wave paused on one item; safe merges and deploys continue"
      else q_title="The ship wave stopped: production or main may be broken"; fi
      q_body="What happened: ${msg:0:220}. While stopped, $( [ "$cls" = soft ] && printf 'LOW and NORMAL PRs still merge and ship but HELD PRs wait' || printf 'nothing merges and nothing ships' ). Keep it stopped and nothing changes; lift it and the next run resumes fully."
      q_body=$(_freeze_utf8 "$q_body")
      # A1: the question's class is the ledger_class of the trigger (soft/hard rides in the title); same slug as field 4
      ask_director freeze "${lcls:-$cls}" "$q_title" "$q_body" "[$q_opts]"
    fi
  fi
  # tighten alone: what shipped in this round becomes HELD until a human clears it (policy-learning.sh)
  type -t guard_add_from_freeze >/dev/null 2>&1 && guard_add_from_freeze "$msg" "${run:-}"
  return 0   # the latch is written; an absent optional helper must not turn that into a failure code
}

# ── §A1 hook (c): the HELD list becomes ONE question, by phone ────────────────────────────────────────
# 14 drafts sat parked on questions nobody asked him. When ≥1 HELD PR is READY, ask once: up to 5 PRs as
# options (each = append approve-held <n>), plus "Approve all listed" and "None today". Re-asked only when the
# set changes — $STATE/held-last-set remembers the last set asked, and ask_director itself de-duplicates an
# identical open question. PRs already in this run's approvals are not asked about (they merge this run).
ask_held_question() {  # $1 = run dir (its plan.json)
  local set_now qjson
  set_now=$(APPROVED="${APPROVE_HELD:-}" python3 -c "
import json,os,sys
ap={x for x in os.environ['APPROVED'].replace(',',' ').split() if x}
rows=[r for r in json.load(open(sys.argv[1]))['ready']['HELD'] if str(r['number']) not in ap][:5]
print(' '.join(str(r['number']) for r in rows))" "$1/plan.json" 2>/dev/null)
  [ -n "$set_now" ] || return 0
  [ "$set_now" = "$(cat "$STATE/held-last-set" 2>/dev/null)" ] && return 0
  qjson=$(SET="$set_now" python3 - "$1/plan.json" <<'PYQ'
import json,os,sys
want=[int(x) for x in os.environ['SET'].split()]
rows={r['number']:r for r in json.load(open(sys.argv[1]))['ready']['HELD']}
opts=[]
for n in want:
    r=rows[n]; why='; '.join(r.get('tier_reasons') or [])[:120]
    opts.append({"label":(f"#{n} "+r['title'])[:40],"description":f"Merge #{n} on the next run — held because: {why}","writes":[{"op":"append","file":"approve-held","value":str(n)}]})
opts.append({"label":"Approve all listed","description":"Merge every PR above on the next run.","writes":[{"op":"append","file":"approve-held","value":str(n)} for n in want]})
opts.append({"label":"None today","description":"Nothing merges; the wave asks again only when the list changes.","writes":[{"op":"noop"}]})
title=(f"{len(want)} HELD PR{'s' if len(want)>1 else ''} ready for your OK: "+' '.join('#'+str(n) for n in want))[:110]
body=(f"These PRs touch money, grades or a migration, so the wave never merges them on its own. Each one's checks are green and it has been quiet 30 minutes. "
      f"Pick the ones to ship; they merge, apply and deploy on the next run. 'None today' leaves them where they are.")
json.dump({"title":title,"body":body,"options":opts}, sys.stdout)
PYQ
)
  [ -n "$qjson" ] || return 0
  printf '%s\n' "$set_now" > "$STATE/held-last-set"
  ask_director held held "$(python3 -c 'import json,sys;print(json.load(sys.stdin)["title"])' <<<"$qjson")" \
    "$(python3 -c 'import json,sys;print(json.load(sys.stdin)["body"])' <<<"$qjson")" \
    "$(python3 -c 'import json,sys;print(json.dumps(json.load(sys.stdin)["options"]))' <<<"$qjson")"
}

# ── §C (Director 2026-09-10): "Stopped means no NEW merges — shipping still runs" ──────────────────────
# While frozen, humans hand-merged 10 PRs that skipped the batched deploy, the apply and the sweep, and sat
# unshipped 12 h. So the deploy step gains a third trigger: main HEAD != the last commit production is running.
# $STATE/last-deployed holds that sha — Vercel's meta.githubCommitSha of the READY deployment when the API
# exposes it, else jicate/main at fire time. Written only after a deployment the wave saw go READY.
main_sha_now() { git -C "$WT" fetch jicate main -q 2>/dev/null; git -C "$WT" rev-parse jicate/main 2>/dev/null; }
sha_on_main() {  # is this sha in jicate/main's history? fetch first (once) when it is not — "unknown" must mean unknown AFTER a fetch
  [ -n "${1:-}" ] || return 1
  git -C "$WT" cat-file -e "$1^{commit}" 2>/dev/null && return 0
  git -C "$WT" fetch jicate main -q 2>/dev/null; git -C "$WT" cat-file -e "$1^{commit}" 2>/dev/null
}
record_last_deployed() {  # $1 = deployment JSON ("" allowed) · $2 = fallback sha (jicate/main at fire time)
  # The marker only ever holds a sha the worktree can diff against. A sha it does not know (Vercel built a ref that
  # is not on main, or the API returned junk) is NOT written: the next round would read it as "cannot tell" anyway,
  # and overwriting a good marker with junk loses the fallback (verifier's F3, 2026-09-10).
  local sha; sha=$(python3 -c 'import json,sys;print(((json.load(sys.stdin)["deployments"][0].get("meta") or {}).get("githubCommitSha") or ""))' <<<"$1" 2>/dev/null)
  sha_on_main "$sha" || sha="$2"
  sha_on_main "$sha" || { [ -n "$sha" ] && say "  last-deployed NOT written — ${sha:0:10} is not on jicate/main as fetched"; return 0; }
  [ "$(cat "$STATE/last-deployed" 2>/dev/null)" = "$sha" ] || { printf '%s\n' "$sha" > "$STATE/last-deployed"; say "  last-deployed ← ${sha:0:10}"; }
  return 0
}
hand_merged_since() {  # $1 = freeze timestamp → "#n #m " — PRs whose merge commit landed on main since then that the wave did NOT merge
  # the wave records its own merges in each run's merged-map.tsv — since round 3 as ONE `<n>\t@merge\t<sha>` row written
  # from the merge itself (never from the file-list call, which can fail: N8b listed the wave's own #2 as by hand). A
  # commit on main is "mine" when a row carries its PR number AND its sha; rows from older runs (2-field `<n>\t<path>`,
  # no sha) still count by number alone so a freeze that spans the upgrade does not list last week's wave merges.
  local mine_pairs mine_legacy n sha
  mine_pairs=$(cat "$STATE"/run-*/merged-map.tsv 2>/dev/null | awk -F'\t' 'NF>=3 && $2=="@merge" {print $1" "$3}' | sort -u)
  mine_legacy=$(cat "$STATE"/run-*/merged-map.tsv 2>/dev/null | awk -F'\t' 'NF==2 {print $1}' | sort -u)
  git -C "$WT" fetch jicate main -q 2>/dev/null   # the ref is only as fresh as the last stage that fetched it
  # two subject shapes: the squash button's "title (#n)" and the merge button's "Merge pull request #n from …"
  git -C "$WT" log jicate/main --since="$1" --format='%H %s' 2>/dev/null | while read -r sha subj; do
    n=$(printf '%s' "$subj" | grep -oiE '\(#[0-9]+\)$|merge pull request #[0-9]+' | grep -oE '[0-9]+' | head -1)
    [ -n "$n" ] || continue
    grep -qx "$n $sha" <<<"$mine_pairs" && continue
    grep -qx "$n" <<<"$mine_legacy" && continue
    printf '#%s ' "$n"
  done | tr ' ' '\n' | grep . | sort -u | tr '\n' ' '  
}

# The ledger is sourced BEFORE the single-flight lock on purpose: --ledger is a
# read-only report, and being unable to read what already went wrong *because a
# wave is currently running* is exactly backwards.
# shellcheck source=scripts/ship-wave/failure-ledger.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/failure-ledger.sh"
if [ -n "${LEDGER_REPORT:-}" ]; then ledger_report; exit 0; fi
# shellcheck source=scripts/ship-wave/policy-learning.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/policy-learning.sh"
# desk-questions.sh (HUMAN-IN-THE-LOOP.md §A, slice A) defines ask_director — the one channel from the wave to the
# Director's phone. Guarded: without the file the wave runs exactly as before, it just cannot ask.
[ -f "$SW_DIR/desk-questions.sh" ] && . "$SW_DIR/desk-questions.sh"
if [ -n "${POLICY_SHOW:-}" ]; then policy_show; exit 0; fi
if [ -n "${FREEZE_MSG:-}" ]; then run=""; freeze "$FREEZE_MSG"; exit 0; fi   # writes the latch + asks the Director; merges/ships nothing
if [ -n "${POLICY_RATIFY:-}" ]; then policy_ratify "$POLICY_RATIFY"; exit $?; fi
if [ -n "${UNGUARD:-}" ]; then guard_remove "$UNGUARD"; exit 0; fi

# ── pacing (Director 2026-09-06 21:20): a standing run that finds nothing changed is skipped, and three
# skipped runs in a row print the NEEDS-YOU list once instead of a fourth identical receipt ─────────────
# (the check itself now runs after unblock-lanes.sh is sourced -- it defines unchanged_since_last_run)

# ── single-flight: two ship waves merging at once would race main ─────────────
if ! mkdir "$LOCK" 2>/dev/null; then
  pid=$(cat "$LOCK/pid" 2>/dev/null); if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then echo "another ship wave is running (pid $pid) — refusing"; exit 3; fi
  unlock; mkdir "$LOCK"
fi
echo $$ > "$LOCK/pid"; trap unlock EXIT

# ── the classifier, shared by the sweep and the post-merge re-cluster ─────────
classify() {  # $1=prs.json $2=plan.json  (ONLY / QUIET_MIN from env)
  ONLY="$ONLY" QUIET_MIN="$QUIET_MIN" GUARDS_ENV="$(guards_env 2>/dev/null)" ADVISORY_CHECKS="$(cat "$STATE/advisory-checks" 2>/dev/null)" python3 - "$1" "$2" <<'PY'
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
# Director 2026-09-10 05:55 (interview): a check named in $STATE/advisory-checks (one exact name per
# line) is ADVICE, not a gate — its failure never moves a PR out of ready. Written for the two AI-review
# jobs ("SDK multi-agent review", "Deep review status") that went red on every PR when their subscription
# hit a spend limit; GitHub's own branch ruleset never required them, only the wave's all-green rule did.
# Delete the line from that file and the check is a gate again — no code change, same as allow-destructive.
ADVISORY = {l.strip() for l in os.environ.get("ADVISORY_CHECKS","").splitlines() if l.strip()}
def ci(p):
    runs = p.get("statusCheckRollup") or []
    bad = [r.get("name") for r in runs if (r.get("conclusion") or "").upper() in ("FAILURE","TIMED_OUT","ACTION_REQUIRED","STARTUP_FAILURE","ERROR") and (r.get("name") or "") not in ADVISORY]
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
    # GitHub says UNSTABLE when a NON-required check failed and the merge is still allowed. If every one of
    # those failures is on the advisory list (v=="OK" after filtering), the PR is not blocked — it falls through
    # to the same quiet/ready tests a CLEAN PR gets. Any real failure leaves v=="FAIL" and it stays blocked.
    elif p["mergeStateStatus"]!="CLEAN" and not (p["mergeStateStatus"]=="UNSTABLE" and v=="OK"): plan["blocked"].append(row)
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
      local human="" retry_hint="" pr; for pr in $cprs; do
        v=$(gh pr view "${pr#\#}" --repo "$REPO" --json comments -q '[.comments[].body | capture("W12-VERDICT: (?<v>[A-Z]+)")?.v] | last // ""' 2>/dev/null)
        case "$v" in
          # Lane C (Director 2026-09-06 21:20): an UNRESOLVABLE verdict ≥24h old earns ONE fresh tab, with the old
          # verdict as a hint. lane_retry_allowed() is once-only per PR ($STATE/retried/<n>); after that, the nudge.
          UNRESOLVABLE) if lane_retry_allowed "$pr"; then retry_hint="$retry_hint $pr"; lane_retry_mark "$pr"; say "  retry $pr — UNRESOLVABLE verdict is >${LANE_TTL_H}h old; one fresh tab (never again)"; else human="$human $pr($v)"; fi;;
          SUPERSEDED) human="$human $pr($v)";;
        esac
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
    [ -n "${retry_hint:-}" ] && prompt="$prompt HINT: a previous helper tab already tried${retry_hint} and answered UNRESOLVABLE — read its PR comment first, then try a different resolution (for a registry/list keep every entry of both sides; for overlapping logic prefer main's version and re-apply the PR's intent on top). If you also conclude UNRESOLVABLE, say so with the same verdict line; the wave will ask the author and not send a third tab."
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
# unblock lanes (Director 2026-09-06 21:20, by interview): stale heads → merge main; red checks → merge main then a
# CI-fix tab; one retry for an old UNRESOLVABLE verdict; --if-changed pacing. cause-class → bounded action, ledgered.
# shellcheck source=scripts/ship-wave/unblock-lanes.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/unblock-lanes.sh"

# Pacing, moved down from line 133 (2026-09-08): unchanged_since_last_run lives in
# unblock-lanes.sh, sourced just above, so the original call site ran 227 lines too early --
# every --if-changed run printed "unchanged_since_last_run: command not found" and then swept
# anyway. Everything between there and here is definitions and variable setup, so skipping
# here is still free.
if [ -n "${IF_CHANGED:-}" ] && [ "$MODE" = "go" ] && unchanged_since_last_run; then exit 0; fi

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
  # §B: one latch, two classes. `hard` gates what used to check `frozen`; `frozen` alone now only holds HELD merges.
  local frozen="" freeze_class="" hard="" hand_merged=""
  # §B: the latch is re-read at every gate, not only here — a freeze that lands mid-round (--freeze from the phone
  # between preflight and the merge stage, round-3 N5c) must hold HELD and, if hard, merge nothing at all
  refresh_freeze_state() { frozen=""; freeze_class=""; hard=""; if [ -e "$FREEZE" ]; then frozen=1; freeze_class=$(freeze_class_now); [ "$freeze_class" = hard ] && hard=1; fi; return 0; }
  # round 8: -e, not -f — a FROZEN that exists but is not a regular file reads HARD here too, and is never read
  if [ -e "$FREEZE" ]; then
    frozen=1; freeze_class=$(freeze_class_now); [ "$freeze_class" = hard ] && hard=1
    local fz_since="" fz_n=0
    if [ -f "$FREEZE" ]; then fz_since=$(head -1 "$FREEZE" | cut -f1); fz_n=$(grep -c . "$FREEZE"); fi
    if [ -n "$hard" ]; then say "  ⛔ FROZEN (hard) since: ${fz_since:-unknown} — $(freeze_reason_now | cut -c1-140) — nothing merges, nothing ships this round (sweep/report only). Clear with --unfreeze.$( [ "$fz_n" -gt 1 ] && printf ' (%s lines in FROZEN; the hard one governs)' "$fz_n")"
    else say "  ⛔ FROZEN (soft) since: $(head -1 "$FREEZE" | cut -f1,2) — merging LOW/NORMAL, holding HELD; deploy + apply + sweep still run. Clear with --unfreeze."; fi
    [ -n "$fz_since" ] && hand_merged=$(hand_merged_since "$fz_since" | sed "s/ *$//")
    say "  merged by hand while stopped: ${hand_merged:-none}"
  fi
  local tok; tok=$(vtok); [ -n "$tok" ] || say "  warn: no Vercel CLI token — deploy verification will be blind"
  # §C source of truth for "what is production running": Vercel's latest READY production deployment
  # (meta.githubCommitSha) is PRIMARY; $STATE/last-deployed is the FALLBACK for when Vercel is unreachable, and is
  # rewritten from the Vercel sha whenever one is available (integrator 2026-09-10; verifier's H1: with the marker
  # primary, a hand-fired deploy that already put main HEAD live earned a second, empty build).
  local prod_sha="" prod_src=""
  if [ -n "$tok" ]; then
    local dj last; dj=$(curl -s -H "Authorization: Bearer $tok" "https://api.vercel.com/v6/deployments?projectId=$VPROJ&teamId=$VTEAM&limit=1&target=production")
    last=$(python3 -c 'import json,sys;d=json.load(sys.stdin)["deployments"][0];print(d.get("readyState") or d.get("state"),d.get("errorCode") or "-",d["uid"])' <<<"$dj" 2>/dev/null)
    say "  last prod deployment: $last"
    case "$last" in ERROR*) say "PREFLIGHT HARD STOP: the deploy pipeline is broken ($last) — nothing merged now can go live. Fix the deploy first."; return 1;; esac
    # the latest record may be a build in flight — ask for the latest READY one separately
    case "$last" in READY*) ;; *) dj=$(curl -s -H "Authorization: Bearer $tok" "https://api.vercel.com/v6/deployments?projectId=$VPROJ&teamId=$VTEAM&limit=1&target=production&state=READY");; esac
    prod_sha=$(python3 -c 'import json,sys;d=json.load(sys.stdin)["deployments"][0];print(((d.get("meta") or {}).get("githubCommitSha") or "") if (d.get("readyState") or d.get("state"))=="READY" else "")' <<<"$dj" 2>/dev/null)
    [ -n "$prod_sha" ] && prod_src="Vercel"
  fi
  if [ -n "$prod_sha" ]; then
    record_last_deployed "" "$prod_sha"   # writes the marker only when the sha is on jicate/main; an unknown sha leaves it alone
  else
    prod_sha=$(cat "$STATE/last-deployed" 2>/dev/null); [ -n "$prod_sha" ] && prod_src="marker; Vercel gave no READY commit sha"
  fi

  # ── 1. sweep + classify ────────────────────────────────────────────────────
  say; say "--- 1. sweep: every open PR on $REPO ---"
  sweep "$run" || return 1
  # §A1 hook (c): ≥1 HELD PR is READY → ONE question to the Director listing up to 5 of them, re-asked only when the
  # set changes ($STATE/held-last-set). PRs already approved this run are not asked about. Only a `go` run asks —
  # `plan` is the dry run that changes nothing. ask_director is slice A's; absent, the HELD line below still prints.
  if type -t ask_director >/dev/null 2>&1 && [ "$MODE" = "go" ] && [ -z "${FINAL_DEPLOY:-}" ]; then ask_held_question "$run"; fi
  local c_open c_ready c_conf; c_open=$(python3 -c "import json;print(json.load(open('$run/plan.json'))['counts']['open'])")
  c_ready=$(python3 -c "import json;print(json.load(open('$run/plan.json'))['counts']['ready'])")
  c_conf=$(python3 -c "import json;print(json.load(open('$run/plan.json'))['counts']['conflicted'])")

  # ── 1b. unblock lanes: act on the buckets the sweep used to only report ────
  # (2026-09-06: 30 hours of identical 2-hourly runs — 15 red on an advisory check, 8 heads whose required
  # checks never ran, 4 parked conflicts. Nothing in the loop touched them. Now each has a bounded lane.)
  DISPATCHED=0
  if [ -z "$hard" ] && [ -z "${FINAL_DEPLOY:-}" ]; then unblock_lanes "$run"; fi

  # ── 2. conflict clusters → one fleet tab each ──────────────────────────────
  say; say "--- 2. conflicts: [helper tabs alive: $(alive_helpers)/$HELPER_CAP] dispatch ≤$MAX_DISPATCH fleet tabs (one per cluster; a new tab only when the previous one has finished) ---"
  # DISPATCHED carries over from 1b: a CI-fix tab and a conflict tab share the per-round cap
  if [ "$MODE" = "go" ] && [ "$MAX_DISPATCH" -gt 0 ]; then dispatch_clusters "$run/plan.json" "$run"
  else say "  (plan mode / --max-dispatch 0 — nothing dispatched)"; fi

  # ── 3. merge by tier ───────────────────────────────────────────────────────
  say; say "--- 3. merge: LOW unattended · NORMAL needs --approve-normal · HELD needs --approve-held ---"
  refresh_freeze_state   # N5c: a freeze raised since preflight gates THIS stage
  [ -n "$frozen" ] && say "  freeze in force at the merge gate: $freeze_class$( [ -n "$hard" ] && printf ' — nothing merges' || printf ' — HELD held')"
  local merged=0 merged_list="" merged_files="$run/merged-files.txt" m_low=0 m_normal=0 m_held=0; : > "$merged_files"; : > "$run/merged-map.tsv"
  INDEX_MERGED=0
  advisory_only() {  # $1=number → 0 only if EVERY red check on the PR is named in $STATE/advisory-checks
    [ -s "$STATE/advisory-checks" ] || return 1
    local bad c
    bad=$(gh pr view "$1" --repo "$REPO" --json statusCheckRollup -q '.statusCheckRollup[]? | select(((.conclusion // "") | ascii_upcase) as $k | $k=="FAILURE" or $k=="ERROR" or $k=="TIMED_OUT" or $k=="ACTION_REQUIRED" or $k=="STARTUP_FAILURE") | (.name // .context // "?")' 2>/dev/null)
    [ -n "$bad" ] || return 1
    while IFS= read -r c; do [ -z "$c" ] && continue; grep -qxF -- "$c" "$STATE/advisory-checks" || return 1; done <<< "$bad"
    return 0
  }
  merge_one() {  # $1=number $2=tier — re-verify the instant before the irreversible step
    local n="$1" t="$2" st i touches_index=0
    for i in 1 2 3 4 5 6; do
      st=$(gh pr view "$n" --repo "$REPO" --json state,mergeStateStatus,isDraft,baseRefName -q '"\(.state) \(.mergeStateStatus) \(.isDraft) \(.baseRefName)"')
      [ "$st" = "OPEN UNKNOWN false main" ] && { sleep 10; continue; }; break
    done
    # Director 2026-09-11 12:34 (interview): the AI-review checks are advice, not a gate — the SWEEP already lets a PR
    # red ONLY on checks named in $STATE/advisory-checks reach READY; this live re-check did not, so on 09-11 09:40 all
    # nine approved HELD PRs were listed READY and then refused here. Same rule, same knob, applied before the merge.
    if [ "$st" = "OPEN UNSTABLE false main" ] && advisory_only "$n"; then
      say "  note   $t #$n — UNSTABLE only on advisory checks (advice, not a gate) — merging"; st="OPEN CLEAN false main"
    fi
    if [ "$st" != "OPEN CLEAN false main" ]; then say "  HOLD   $t #$n — state now '$st' (changed since sweep), not merging"; return 1; fi
    # Director 14:45: SQL_FILE_INDEX.md is a hand-edited append-only ledger — every merge that touches it re-conflicts
    # every other PR touching it. So at most ONE index-touching PR merges per round; the rest wait for the next sweep.
    if python3 -c "import json,sys;p=json.load(open('$run/plan.json'));rows=[r for b in ('LOW','NORMAL','HELD') for r in p['ready'][b]]+p['quiet_wait'];sys.exit(0 if any(r['number']==$n and 'supabase/SQL_FILE_INDEX.md' in r['files'] for r in rows) else 1)" 2>/dev/null; then
      if [ "${INDEX_MERGED:-0}" -ge 1 ]; then say "  HOLD   $t #$n — touches SQL_FILE_INDEX.md and one index PR already merged this round (next round)"; return 1; fi
      touches_index=1   # 09-11 12:23: the quota was charged here, before the merge — one refused index PR then blocked five others while merged=0
    fi
    # Director 2026-09-11 12:34 ("Apply the fix and run the wave now"): this third count must honour the same
    # advisory list — on 09-11 12:23 it refused #3415/#3405/#3394 whose only red checks were the two advisory ones.
    local runs; runs=$(gh pr view "$n" --repo "$REPO" --json statusCheckRollup -q '.statusCheckRollup[]? | select((.conclusion // "" | ascii_upcase) as $c | $c=="FAILURE" or $c=="TIMED_OUT" or $c=="ACTION_REQUIRED" or ((.status // "" | ascii_upcase) as $s | $s=="IN_PROGRESS" or $s=="QUEUED" or $s=="PENDING")) | (.name // .context // "?")' 2>/dev/null \
      | { if [ -s "$STATE/advisory-checks" ]; then grep -vxF -f "$STATE/advisory-checks"; else cat; fi; } | grep -c .)
    [ "${runs:-0}" != "0" ] && { say "  HOLD   $t #$n — $runs non-advisory check(s) failing/pending at merge time"; return 1; }
    local pre_main; pre_main=$(main_sha_now)
    if gh pr merge "$n" --repo "$REPO" --squash --delete-branch >/dev/null 2>"$run/merge-$n.err"; then
      say "  MERGED $t #$n"; [ "$touches_index" = 1 ] && INDEX_MERGED=$(( ${INDEX_MERGED:-0} + 1 )); sleep 4
      # Round-3 verifier N8b/N8d: the merged-map row used to be a side effect of `gh pr view --json files`; one transient
      # empty answer left no row (the wave's own merge was later listed as "merged by hand") AND an empty file list
      # that read as docs-only (no build, marker advanced — a route change never shipped). Now:
      #   1. the row is written from the MERGE itself: PR number + merge commit sha (gh mergeCommit, else post-merge main HEAD)
      #   2. the file list comes from `git diff <pre-merge main>..<post-merge main>` first, `--json files` (3 tries) second
      #   3. an EMPTY list after a successful merge is "files unknown → assume code", never docs-only: one sentinel line
      #      keeps the deploy from being skipped and the receipt says so
      local msha post_main files=""
      msha=$(gh pr view "$n" --repo "$REPO" --json mergeCommit -q '.mergeCommit.oid' 2>/dev/null | tr -d '[:space:]')
      post_main=$(main_sha_now); [ -n "$msha" ] || msha="$post_main"
      printf '%s\t@merge\t%s\n' "$n" "${msha:-unknown}" >> "$run/merged-map.tsv"
      if [ -n "$pre_main" ] && [ -n "$post_main" ] && [ "$pre_main" != "$post_main" ]; then
        files=$(git -C "$WT" diff --name-only "$pre_main" "$post_main" 2>/dev/null)
      fi
      if [ -z "$files" ]; then
        local try; for try in 1 2 3; do
          files=$(gh pr view "$n" --repo "$REPO" --json files -q '.files[].path' 2>/dev/null); [ -n "$files" ] && break; sleep 2
        done
      fi
      if [ -n "$files" ]; then
        printf '%s\n' "$files" | grep . | tee -a "$merged_files" | sed "s/^/$n\t/" >> "$run/merged-map.tsv"
      else
        say "  files unknown for #$n (git diff empty, gh files empty ×3) — assumed CODE: this round deploys rather than reading the merge as docs-only"
        printf '?unknown-files #%s\n' "$n" >> "$merged_files"
      fi
      return 0
    else say "  FAILED $t #$n — $(head -c 200 "$run/merge-$n.err")"; return 1; fi
  }
  already_merged() { case " $merged_list " in *" #$1 "*) return 0;; *) return 1;; esac; }
  merge_tiers() {  # one pass LOW → NORMAL → HELD; bumps merged / merged_list (bash dynamic scope)
    for n in $(python3 -c "import json;print(' '.join(str(r['number']) for r in json.load(open('$run/plan.json'))['ready']['LOW']))"); do already_merged "$n" || { merge_one "$n" LOW && { merged=$((merged+1)); m_low=$((m_low+1)); merged_list="$merged_list #$n"; }; }; done
    if [ -n "$APPROVE_NORMAL" ]; then
      for n in $(python3 -c "import json;print(' '.join(str(r['number']) for r in json.load(open('$run/plan.json'))['ready']['NORMAL']))"); do already_merged "$n" || { merge_one "$n" NORMAL && { merged=$((merged+1)); m_normal=$((m_normal+1)); merged_list="$merged_list #$n"; }; }; done
    else say "  NORMAL: $(python3 -c "import json;print(len(json.load(open('$run/plan.json'))['ready']['NORMAL']))") ready — waiting for your tap (run again with --approve-normal)"; fi
    # §B: HELD merges never run while ANY freeze is on — soft included. They need his number anyway, and a stop is
    # the moment he is being asked something; the approvals stay in the file and merge on the first unfrozen run.
    if [ -n "$frozen" ]; then
      say "  HELD: held while stopped ($freeze_class freeze) — $(python3 -c "import json;print(len(json.load(open('$run/plan.json'))['ready']['HELD']))") ready, none merged${APPROVE_HELD:+; approvals kept: $APPROVE_HELD}"
    elif [ -n "$APPROVE_HELD" ]; then
      for n in $(printf '%s' "$APPROVE_HELD" | tr ', ' '  '); do
        already_merged "$n" && continue
        if python3 -c "import json,sys;sys.exit(0 if $n in [r['number'] for r in json.load(open('$run/plan.json'))['ready']['HELD']] else 1)"; then
          merge_one "$n" HELD && { merged=$((merged+1)); m_held=$((m_held+1)); merged_list="$merged_list #$n"; [ -f "$STATE/approve-held" ] && { grep -vxE "\s*$n\s*" "$STATE/approve-held" || true; } > "$STATE/approve-held.new" && mv "$STATE/approve-held.new" "$STATE/approve-held"; }
        else say "  HOLD   HELD #$n — not in this run's ready-HELD list, refusing"; fi
      done
    else
      local held; held=$(python3 -c "import json;print(' '.join('#'+str(r['number'])+' '+r['title'][:40].replace(' ','_') for r in json.load(open('$run/plan.json'))['ready']['HELD']))")
      [ -n "$held" ] && say "  HELD waiting for your reply (reply with the numbers to ship): $held" || say "  HELD: none ready"
    fi
  }
  if policy_active AUTO_APPROVE_ADDITIVE_MIGRATIONS && [ -z "${FINAL_DEPLOY:-}" ] && [ -z "$frozen" ]; then   # P1 is a HELD merge — held while frozen (§B)
    local auto; auto=$(python3 -c "import json;p=json.load(open('$run/plan.json'));print(' '.join(str(r['number']) for r in p['ready']['HELD'] if r['tier_reasons'] and all(x.startswith('migration: supabase/migrations/') for x in r['tier_reasons'])))" 2>/dev/null)
    [ -n "$auto" ] && { say "  policy P1 (ratified): HELD PRs whose only reason is a migration are approved this run: $auto"; APPROVE_HELD="${APPROVE_HELD:+$APPROVE_HELD }$auto"; }
  fi
  if [ -n "${FINAL_DEPLOY:-}" ]; then say "  (end-of-run deploy pass — merging nothing)"
  elif [ "$MODE" = "go" ] && [ -z "$hard" ]; then
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
  else say "  (plan mode or hard freeze — nothing merged)"; fi
  say "  merged this round: $merged$merged_list"
  # (f) what THIS round's merges put in merged-files.txt, counted before §C and the leftover-batch flush append to it
  local round_merged=$merged round_lines; round_lines=$(wc -l < "$merged_files" | tr -d ' ')

  # §C: the third deploy trigger — main HEAD != last-deployed. Files changed since the last deploy join merged_files,
  # so the apply (their migrations), the ignoreCommand check and the sweep all see what is actually about to go live.
  # `ship` is what the deploy/apply/sweep gates count from now on: this round's merges, plus 1 when main is ahead.
  # `prod_sha` came from preflight: Vercel's READY commit (primary) or the marker (fallback). Three honest outcomes:
  #   • production == main HEAD → NOTHING to build, whatever this round merged or left in deploy-pending (no empty builds)
  #   • production is on main but behind → main is ahead: ship it (soft/none) or say so in one line (hard)
  #   • production sha unknown to the worktree, even after a fetch → "cannot tell what is deployed": no build is fired on a
  #     guess and the marker is left alone. There is no knob for "build main now" (the desk's ops are approve-held /
  #     allow-destructive / advisory-checks / unfreeze / ratify / noop), so the receipt line is the whole answer — the
  #     Director fires by hand with /deploy-myjkkn when main should go live; this round's own merges still deploy.
  local ship=$merged ship_ahead="" prod_is_main="" prod_unknown="" main_sha=""
  refresh_freeze_state   # a freeze raised by the merge stage itself gates the main-ahead trigger and the apply (3b)
  if [ "$MODE" = "go" ]; then
    main_sha=$(main_sha_now)
    if [ -z "$main_sha" ]; then say "  main vs production: cannot read jicate/main — only this round's merges can trigger a deploy"
    elif [ -z "$prod_sha" ]; then say "  main vs production: last-deployed unknown (no marker yet, Vercel record had no commit sha) — only this round's merges can trigger a deploy"
    elif [ "$main_sha" = "$prod_sha" ]; then
      prod_is_main=1
      say "  main vs production: production already runs main HEAD (${main_sha:0:7}, $prod_src) — nothing to build"
    elif [ -n "$hard" ]; then
      say "  ⛔ hard freeze — main (${main_sha:0:7}) is ahead of production (${prod_sha:0:7}$(sha_on_main "$prod_sha" || printf ', not on main as fetched')) but NOTHING ships until the stop is lifted: $(freeze_reason_now | cut -c1-120)"
    elif ! sha_on_main "$prod_sha"; then
      prod_unknown=1
      say "  main vs production: cannot tell what is deployed — production reports ${prod_sha:0:10} ($prod_src), which is not on jicate/main as fetched; no build fired on a guess, marker untouched. To put main live by hand: /deploy-myjkkn"
    elif [ "$merged" -eq 0 ] && [ -z "${FINAL_DEPLOY:-}" ]; then
      # a failed diff is "unknown", never "no files" — an empty list would read as a docs-only round (verifier's F3)
      if git -C "$WT" diff --name-only "$prod_sha" "$main_sha" > "$run/ahead-files.txt" 2>/dev/null; then
        ship_ahead=1; ship=1; cat "$run/ahead-files.txt" >> "$merged_files"
        merged_list="$merged_list (main ${main_sha:0:7} ahead of production ${prod_sha:0:7}: $(grep -c . "$run/ahead-files.txt") file(s)${hand_merged:+; by hand: $hand_merged})"
        say "  main is ahead of production with zero merges this round — shipping what is already on main:$merged_list"
      else
        prod_unknown=1; say "  main vs production: cannot tell what changed between ${prod_sha:0:7} and ${main_sha:0:7} (git diff failed) — no build fired, marker untouched"
      fi
    fi
  fi

  # ── 3b. migrations: apply + verify BEFORE deploy ────────────────────────────
  local APPLY_RESULT="n/a" apply_ok=1
  if [ "$MODE" = "go" ] && [ -z "$hard" ] && { [ "$ship" -gt 0 ] || [ -f "$STATE/migrations-pending" ]; }; then
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
    # The deploy step drains $pending, but the L3 sweep below still needs the list.
    # Copy it into the run dir instead of pointing at the file that is about to vanish
    # (2026-09-08: three "deploy-pending: No such file" errors in every goal run's sweep).
    merged_files="$run/merged-files.txt"; cp "$pending" "$merged_files" 2>/dev/null || : > "$merged_files"
    merged=$(grep -c . "$merged_files" 2>/dev/null || echo 0); ship=$merged; merged_list=" (batched: $merged file(s) merged this run)"
  elif [ -n "$GOAL" ] && [ "$ship" -gt 0 ] && [ "$apply_ok" -ne 0 ] && [ -z "$NO_DEPLOY" ]; then
    cat "$merged_files" >> "$pending"; DEPLOY_DEFERRED=1
    deploy="deferred — goal runs deploy ONCE at the end ($(grep -c . "$pending") file(s) waiting; migrations already applied)"
    say "  $deploy"
  elif [ "$MODE" = "go" ] && [ -z "$GOAL" ] && [ -s "$pending" ]; then
    # the plain-go flush of a batch a goal run left behind — the same gate as every other fire (verifier's D2:
    # a goal run that hard-froze mid-way leaves deploy-pending on disk, and this branch used to ship it)
    if [ -n "$prod_is_main" ]; then
      say "  leftover batch ($(grep -c . "$pending") file(s)) is already live — production runs main HEAD; batch cleared"; rm -f "$pending"
    elif deploy_allowed; then
      cat "$pending" >> "$merged_files"; merged=$((merged+1)); ship=$((ship+1)); merged_list="$merged_list +earlier-batch"
    else
      say "  ⛔ NOT flushing the leftover batch — $DEPLOY_BLOCK · $(grep -c . "$pending") file(s) stay in $pending for the first unfrozen go"
      deploy="skipped (${DEPLOY_BLOCK%% —*}; leftover batch kept)"
    fi
  fi
  # 2026-09-06 07:55: a read-only `plan` sweep fired a production build through the flush branch above —
  # the deploy stage must never act outside `go`, whatever the batch file holds.
  if [ "$MODE" != "go" ]; then deploy="skipped (plan mode)"; DEPLOY_DEFERRED=1; fi
  if [ -n "$DEPLOY_DEFERRED" ]; then :
  elif [ "$apply_ok" -eq 0 ]; then
    # 2026-09-11 (wave bug f): a round whose migration step failed never wrote its merged files to deploy-pending — the
    # goal branch above appends only when the apply succeeded, and this branch just said "NOT deploying". A later batch of
    # only database files then read as "migration/docs-only — nothing to deploy", so those merges' CODE never went live.
    # Whenever this round merged something, its files join deploy-pending here, before this branch declines to deploy;
    # the first build that runs (goal end, a plain-go flush, or a lifted stop) carries them.
    if [ -z "${FINAL_DEPLOY:-}" ] && [ "${round_merged:-0}" -gt 0 ] && [ "${round_lines:-0}" -gt 0 ]; then
      head -n "$round_lines" "$merged_files" >> "$pending"
      say "  this round's $round_merged merge(s) kept in $pending ($round_lines file(s)) — their code ships with the first build that runs"
    fi
    say "  NOT deploying — migration step failed; the previous deploy stays live"; deploy="skipped (migration failed)"
  elif [ -n "$prod_is_main" ]; then
    # no empty builds: Vercel already runs main HEAD — whatever the marker or the batch file said (verifier's H1)
    deploy="nothing to deploy (production already runs main HEAD ${main_sha:0:7}; source: $prod_src)"; say "  $deploy"
    record_last_deployed "" "$main_sha"
  elif [ "$ship" -gt 0 ] && ! deploy_allowed; then
    # §B/§C: under a hard freeze nothing ships — this is where the receipt says so for merges and the main-ahead trigger
    say "  ⛔ NOT deploying — $DEPLOY_BLOCK"; deploy="skipped (${DEPLOY_BLOCK%% —*})"
  elif [ "$ship" -gt 0 ] && [ "$(grep -vE '^[[:space:]]*$' "$merged_files" | grep -cvE '^(supabase|docs|specs|\.claude|\.github)/|\.md$')" -eq 0 ]; then
    # Mirrors vercel.json's ignoreCommand: when every merged file sits under supabase/, docs/, specs/,
    # .claude/, .github/ or is *.md, Vercel has nothing to build — its ignoreCommand exits 0 and the
    # deployment comes back CANCELED with no errorCode. 2026-09-05 22:50: #3296 (one migration + the
    # index) did exactly that, the wave read the CANCELED as a failed deploy and froze, and two manual
    # re-fires cancelled the same way. Migrations were already applied in 3b; there is nothing to make live.
    # Counted with `grep -c`, not `grep -qv`: on this grep, -q with -v keys its exit on whether any line
    # MATCHED, which inverts the answer for exactly the mixed and empty cases (proven 2026-09-05 22:56).
    deploy="nothing to deploy (migration/docs-only round — Vercel's ignoreCommand skips the build)"
    say "  $deploy"
    # §C: production already runs this code; mark main as deployed so the main-ahead trigger does not re-fire every round
    record_last_deployed "" "$(main_sha_now)"
  elif [ "$ship" -gt 0 ] && deploy_allowed; then   # deploy_allowed re-checked ON the fire line: every POST passes through it
    local fire_sha; fire_sha=$(main_sha_now)   # §C fallback for last-deployed when Vercel's record carries no commit sha
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
          if [ -z "${DEPLOY_RETRIED:-}" ] && deploy_allowed; then
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
  else [ "$deploy" = skipped ] && say "  nothing merged / --no-deploy → no hook fired"; fi

  if [ -z "$DEPLOY_DEFERRED" ] && { [[ "$deploy" == READY* ]] || [[ "$deploy" == nothing* ]]; }; then rm -f "$pending"; fi
  # §C: a deployment the wave saw go READY moves the last-deployed marker (its commit sha if Vercel says, else main at fire time)
  if [ -z "$DEPLOY_DEFERRED" ] && [[ "$deploy" == READY* ]]; then record_last_deployed "${d2:-${d:-}}" "${fire_sha:-}"; fi

  # ── 5. three-layer sweep on what shipped ───────────────────────────────────
  say; say "--- 5. sweep (L1 pages as real roles · L2 API routes unauth · L3 tables touched) ---"
  local l1="n/a" l2="n/a" l3="n/a"
  if [ "$ship" -gt 0 ] && [ -z "$NO_SWEEP" ] && [[ "$deploy" == READY* ]]; then
    local pages apis migs dyn_pages dyn_apis zid="00000000-0000-0000-0000-000000000000"
    # 2026-09-11 (wave bug g): both lists used to `grep -v '\['`, dropping every dynamic route and page — a deploy of only
    # dynamic paths reported "L2 0 ok · 0 fail of 0 routes" and "L1 no page changed", a pass nobody had run. L2 now probes a
    # dynamic API route with a zero UUID in each [param] / [...param] / [[...param]] segment: no row has that id, so
    # 401/403/404/405 (and 400) mean the route is up and answering, 5xx = FAIL. L1 needs a real id to load a page, so it
    # still skips dynamic pages — and says how many, instead of a bare zero.
    pages=$(grep -E '^app/\(routes\)/.*/page\.tsx$' "$merged_files" | grep -v '\[' | sed -E 's#^app/\(routes\)##; s#/page\.tsx$##; s#/\([^)]*\)##g' | sort -u | head -8)
    dyn_pages=$(grep -E '^app/\(routes\)/.*/page\.tsx$' "$merged_files" | grep '\[' | sort -u | grep -c .)
    apis=$(grep -E '^app/api/.*/route\.ts$' "$merged_files" | sed -E 's#^app##; s#/route\.ts$##' | sort -u | head -15)
    # one row per route: <probe path> TAB <route as written> — the blame below greps merged-map.tsv for the file as written
    printf '%s\n' "$apis" | grep . | while IFS= read -r a; do printf '%s\t%s\n' "$(printf '%s' "$a" | sed -E "s#\[\[?[^]/]*\]\]?#$zid#g")" "$a"; done > "$run/l2-probes.tsv"
    dyn_apis=$(grep -c "$zid" "$run/l2-probes.tsv")
    migs=$(grep -E '^supabase/migrations/' "$merged_files" | sort -u)
    # L2 — every touched API route, unauthenticated: 401/403/405 = correct (404 too for a zero-id probe), 5xx = FAIL, 200 = WARN (public?)
    local l2f=0 l2p=0 l2bad="" a orig code
    while IFS=$'\t' read -r a orig; do
      [ -n "$a" ] || continue
      code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE$a")
      case "$code" in
        # ${orig}, braced: under launchd's locale bash read the first byte of '→' as part of the NAME ("orig\xe2: unbound
        # variable" under set -u) and the whole round died on the first 5xx instead of freezing on it (the unbraced
        # "$a→$code" before this change did the same — found by tests/test-sweep-dynamic-routes.sh g8/g9)
        5*) l2f=$((l2f+1)); l2bad="$l2bad ${orig}→${code}"; say "  L2 FAIL $a → $code";;
        401|403|405|400) l2p=$((l2p+1));;
        404) if [ "$a" != "$orig" ]; then l2p=$((l2p+1)); else say "  L2 WARN $a → $code"; fi;;
        *) say "  L2 WARN $a → $code";;
      esac
    done < "$run/l2-probes.tsv"
    l2="$l2p ok · $l2f fail of $(grep -c . "$run/l2-probes.tsv") routes$( [ "$dyn_apis" -gt 0 ] && printf ' (%s dynamic, probed with a zero id)' "$dyn_apis")"
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
          elif [ ! -e "$STATE/FROZEN" ]; then
            cp "$run/l1.json" "$base" 2>/dev/null && say "  L1 baseline refreshed from this clean sweep"
          fi
        fi
      else l1="UNAVAILABLE — $sweep not found"; fi
    else l1="no page changed"; fi
    # (g) never a bare "no page changed" when pages WERE changed but could not be loaded without a real id
    if [ "${dyn_pages:-0}" -gt 0 ]; then
      if [ -n "$pages" ]; then l1="$l1 · skipped $dyn_pages dynamic path(s) (a page needs a real id to load)"
      else l1="no static page changed — skipped $dyn_pages dynamic path(s) (a page needs a real id to load)"; fi
    fi
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
  say; say "=== SCOREBOARD · open PRs: $c_open → $after (target 0) · ready left: $([ -n "${FINAL_DEPLOY:-}" ] && echo "$c_ready" || echo $((c_ready-merged))) · conflicted: $c_conf ($DISPATCHED tabs sent) · merged: $([ -n "${FINAL_DEPLOY:-}" ] && echo "0 (final pass: $merged file(s) built)" || echo "$merged") · migrations: $APPLY_RESULT · deploy: $deploy · frozen: $([ -e "$FREEZE" ] && freeze_class_now || echo no)$([ -e "$FREEZE" ] && [ "$(freeze_class_now)" = soft ] && printf ' (merging LOW/NORMAL, holding HELD)') ==="
  type -t ledger_record >/dev/null 2>&1 && ledger_record round \
    "merged=$merged low=$m_low normal=$m_normal held=$m_held open=$c_open->$after ready=$c_ready conflicted=$c_conf dispatched=$DISPATCHED migrations=$APPLY_RESULT deploy=$deploy"
  local html="$LOCAL/artifacts/ship-wave-$ts.html"; mkdir -p "$LOCAL/artifacts"
  RUN="$run" TS="$ts" OPEN="$c_open" AFTER="$after" MERGED="$merged" MLIST="$merged_list" DEPLOY="$deploy" L1="$l1" L2="$l2" L3="migrations: $APPLY_RESULT · $l3" DISP="$DISPATCHED" MODE="$MODE" RECEIPT="$RECEIPT" FROZEN="$( [ -e "$FREEZE" ] && freeze_line_now | cut -f1,2 || echo "")" FROZEN_CLASS="$( [ -e "$FREEZE" ] && freeze_class_now || echo "")" HAND_MERGED="${hand_merged:-}" python3 - "$html" <<'PY'
import json, os, sys, html as H
run=os.environ["RUN"]; plan=json.load(open(f"{run}/plan.json")); c=plan["counts"]; e=H.escape
def rows(lst, extra=lambda r:""): return "".join(f"<tr><td><a href='https://github.com/Jicate-Solutions/MyJKKN/pull/{r['number']}'>#{r['number']}</a></td><td>{e(r['title'])}</td><td><span class='t {r['tier']}'>{r['tier']}</span></td><td>{e(extra(r))}</td></tr>" for r in lst) or "<tr><td colspan=4 class=m>none</td></tr>"
ready=[*plan["ready"]["LOW"],*plan["ready"]["NORMAL"],*plan["ready"]["HELD"]]
clusters="".join(f"<li><b>{e(k)}</b> → {' '.join('#'+str(n) for n in v)}</li>" for k,v in plan["clusters"].items()) or "<li class=m>none</li>"
dep=os.environ['DEPLOY']; depcls='ok' if dep.startswith('READY') else ('m' if dep=='skipped' else 'bad')
frozen=os.environ.get('FROZEN',''); fcls=os.environ.get('FROZEN_CLASS',''); hand=os.environ.get('HAND_MERGED','').strip()
fnote = "soft — merging LOW/NORMAL, holding HELD; deploy + apply + sweep still run" if fcls=="soft" else "hard — nothing merges, nothing ships"
banner=f"<div class=frz>⛔ FROZEN ({e(fnote)}) — {e(frozen)}{' — merged by hand while stopped: '+e(hand) if hand else ''} — clear with <code>ship-wave.sh --unfreeze</code></div>" if frozen else ""
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
    # Director 2026-09-07 05:55: drafts DO count toward the goal — he un-drafts them when they are ready to
    # ship, so the number he sees is the number he owns. (Excluding them was proposed and declined.)
    say "=== goal round $round/$GOAL_ROUNDS · open=$left · movable=$movable ==="
    [ "$left" = "0" ] && { say "=== GOAL MET: open PRs = 0 ==="; break; }
    # §B: a SOFT freeze keeps the safe work going, so the goal loop keeps rounding; only a HARD freeze ends it
    if [ -e "$FREEZE" ]; then
      if [ "$(freeze_class_now)" = hard ]; then say "=== FROZEN (hard) — goal loop ends; Director must look, then --unfreeze ==="; break
      else say "=== FROZEN (soft) — rounds continue: LOW/NORMAL merge and ship, HELD waits ==="; fi
    fi
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
  # §C: the end-of-run build fires unless the freeze is HARD — under a soft stop what merged still ships.
  # deploy_allowed is the same predicate the fire line inside run_once uses; asking it here too means the receipt
  # says where the batch went instead of leaving deploy-pending on disk in silence (verifier 2026-09-10).
  if [ -s "$STATE/deploy-pending" ]; then
    if deploy_allowed; then
      say; say "=== end of run: ONE production build for everything merged this run (batched to save Vercel build minutes) ==="
      FINAL_DEPLOY=1; run_once; FINAL_DEPLOY=""
    else
      say; say "=== end of run: ⛔ NOT building — $DEPLOY_BLOCK · $(grep -c . "$STATE/deploy-pending") file(s) stay in $STATE/deploy-pending and ship on the first unfrozen go ==="
    fi
  fi
else
  run_once
fi

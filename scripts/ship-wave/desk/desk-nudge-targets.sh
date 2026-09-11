#!/opt/homebrew/bin/bash
# desk-nudge-targets.sh — Lane E's reminders, desk side: find the Claude tab that opened a stale draft and say whether
# it is still open, so the desk tab can message it. The ship wave cannot message a tab (it runs under launchd); the
# desk tab is a Claude session and can.
#
# Director 2026-09-11 22:3x, verbatim: "Message the tab: the phone desk tab sends the reminder to the Claude tab that
# started the change. If that tab is closed, skip straight to asking you at 7 days."
# Spec: scripts/ship-wave/HUMAN-IN-THE-LOOP.md §E (amendment of 2026-09-11 22:3x).
#
# USAGE  desk-nudge-targets.sh
#            one line per PENDING request, oldest first:  <request>|<tab name>|live|dead|unknown|<message>
#            <request> is the file name under $STATE/nudges/ without .json; <message> is the one plain line to send,
#            written by the wave — send it verbatim. A tab name or message never contains '|' (turned into '/').
#        desk-nudge-targets.sh mark <request> delivered|tab-closed [reason] [tab name]
#            records what the desk did. Only a PENDING request changes; anything else is left and exits 2.
# EXIT   0 ok · 2 usage / no such pending request · 3 refused (a request name that is not a PR number or g-<slug>)
#
# How a draft finds its tab — only the fleet's existing records, read-only; nothing new is kept:
#   1. The request carries the claude.ai session id(s) found in the PR bodies (https://claude.ai/code/session_<id>,
#      also as a `Claude-Session:` trailer). The same id is a claude.ai row `cse_<id>`.
#   2. v5-row-status.json (pulled every 5 min by com.omm.obsidian-v5-rowstatus) joins a row to its tab key `u8`
#      when that row is the tab's CURRENT remote-control row.
#   3. Otherwise the tab transcripts named by v5-tab-sessions/<u8> (field 1 = session id) are searched for
#      "bridgeSessionId":"cse_<id>". A tab restarted since (W9/W10/W11 resume the same transcript) still carries its
#      old ids there — the same ownership proof v5-ghost-sweep.sh uses. ~20 s over the whole fleet, once per request.
#   4. The tab's name is the name spine v5-tab-names/<u8> (before " @ "). Live = a tmux session v5-…-<u8> exists on
#      the obsidian socket — matched by the key, not by the vault slug (a tab whose vault was renamed keeps its old
#      session name; 2026-09-11 129b12ef).
#   When the request names several sessions (parts of one build opened by more than one tab), they are tried in the
#   wave's order (most parts first) and the first LIVE tab wins; else the first tab found (dead); else unknown.
#
# ENV (tests)  STATE · NUDGES_DIR · V5_CFG (default ~/.config/obsidian) · CLAUDE_PROJECTS (default ~/.claude/projects)
#              DESK_TMUX (default "/opt/homebrew/bin/tmux -L obsidian")
set -uo pipefail

STATE="${STATE:-$HOME/.config/obsidian/.ship-wave}"
NUDGES_DIR="${NUDGES_DIR:-$STATE/nudges}"
V5_CFG="${V5_CFG:-$HOME/.config/obsidian}"
CLAUDE_PROJECTS="${CLAUDE_PROJECTS:-$HOME/.claude/projects}"
DESK_TMUX="${DESK_TMUX:-/opt/homebrew/bin/tmux -L obsidian}"
REQUEST_RE='^([0-9]{1,7}|g-[a-z0-9][a-z0-9-]{0,39})$'

_live_keys() {  # every tab key with a live tmux session v5-…-<u8>, one per line
  $DESK_TMUX list-sessions -F '#{session_name}' 2>/dev/null | sed -nE 's/^v5-.*-([0-9a-f]{8})$/\1/p' | sort -u
}

# resolve <session-id> → prints "<u8>" or nothing
_u8_for_session() {
  local sid="$1" u8="" f t tsid
  [[ "$sid" =~ ^[A-Za-z0-9]{8,64}$ ]] || return 0
  # 2. the row-status join (current rows)
  if [ -f "$V5_CFG/v5-row-status.json" ]; then
    u8=$(python3 - "$V5_CFG/v5-row-status.json" "cse_$sid" <<'PY' 2>/dev/null
import json, sys
try:
    for r in json.load(open(sys.argv[1])).get("rows") or []:
        if r.get("id") == sys.argv[2] and r.get("u8"): print(r["u8"]); break
except Exception: pass
PY
)
  fi
  [ -n "$u8" ] && { printf '%s' "$u8"; return 0; }
  # 3. the transcripts of every mapped tab, for the old id
  for f in "$V5_CFG"/v5-tab-sessions/*; do
    [ -f "$f" ] || continue
    tsid=$(cut -f1 "$f" 2>/dev/null)
    [[ "$tsid" =~ ^[0-9a-f-]{36}$ ]] || continue
    for t in "$CLAUDE_PROJECTS"/*/"$tsid".jsonl; do
      [ -f "$t" ] || continue
      if LC_ALL=C grep -qF "\"bridgeSessionId\":\"cse_$sid\"" "$t" 2>/dev/null; then
        printf '%s' "$(basename "$f")"; return 0
      fi
    done
  done
}

_tab_name() {  # <u8> → the spine name, '|' made safe
  local nm; nm=$(head -1 "$V5_CFG/v5-tab-names/$1" 2>/dev/null); nm="${nm%% @ *}"
  printf '%s' "${nm:-tab $1}" | tr '|\t\r\n' '/   '
}

cmd_list() {
  local f req sessions sid u8 live name state msg first_dead
  [ -d "$NUDGES_DIR" ] || return 0
  live=" $(_live_keys | tr '\n' ' ') "
  # \x1f, never a tab: IFS whitespace collapses an empty field (a request with no session id) into its neighbour
  while IFS=$'\x1f' read -r req sessions msg; do
    [ -n "$req" ] || continue
    [[ "$req" =~ $REQUEST_RE ]] || { echo "desk: skipped nudge request '$req' — not a PR number or g-<slug>" >&2; continue; }
    state=unknown; name="-"; first_dead=""
    for sid in $sessions; do
      u8=$(_u8_for_session "$sid")
      [ -n "$u8" ] || continue
      case "$live" in
        *" $u8 "*) state=live; name=$(_tab_name "$u8"); break;;
        *) [ -n "$first_dead" ] || first_dead="$u8";;
      esac
    done
    if [ "$state" != live ] && [ -n "$first_dead" ]; then state=dead; name=$(_tab_name "$first_dead"); fi
    printf '%s|%s|%s|%s\n' "$req" "$name" "$state" "$msg"
  done < <(python3 - "$NUDGES_DIR" <<'PY'
import json, os, sys, glob, re
rows = []
for p in glob.glob(os.path.join(sys.argv[1], "*.json")):
    try: q = json.load(open(p, encoding="utf-8"))
    except Exception as e:
        print(f"desk: skipped nudge request {os.path.basename(p)} — {type(e).__name__}", file=sys.stderr); continue
    if q.get("status") != "pending": continue
    name = os.path.basename(p)[:-5]
    sessions = [s for s in (q.get("sessions") or []) if isinstance(s, str) and re.fullmatch(r"[A-Za-z0-9]{8,64}", s)]
    msg = re.sub(r"[\x00-\x1f\x7f]+", " ", str(q.get("message") or "")).replace("|", "/").strip()
    rows.append((str(q.get("requested_at") or ""), name, " ".join(sessions), msg))
for r in sorted(rows):
    print(f"{r[1]}\x1f{r[2]}\x1f{r[3]}")
PY
)
}

cmd_mark() {
  local req="${1:-}" status="${2:-}" reason="${3:-}" tab="${4:-}"
  [[ "$req" =~ $REQUEST_RE ]] || { echo "desk: REFUSED — '$(printf '%s' "$req" | tr '\000-\037\177' '?' | cut -c1-60)' is not a nudge request name"; return 3; }
  case "$status" in delivered|tab-closed) ;; *) echo "usage: desk-nudge-targets.sh mark <request> delivered|tab-closed [reason] [tab name]"; return 2;; esac
  R="$reason" TAB="$tab" ST="$status" python3 - "$NUDGES_DIR/$req.json" <<'PY'
import json, os, sys, datetime, tempfile
p = sys.argv[1]
try: q = json.load(open(p, encoding="utf-8"))
except Exception:
    print(f"desk: no nudge request {os.path.basename(p)[:-5]}"); sys.exit(2)
if q.get("status") != "pending":
    print(f"desk: nudge request {os.path.basename(p)[:-5]} is {q.get('status')!r}, not pending — left as it is"); sys.exit(2)
now = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
q["status"] = os.environ["ST"]; q["resolved_at"] = now
if os.environ["ST"] == "delivered": q["delivered_at"] = now
if os.environ.get("R"): q["reason"] = " ".join(os.environ["R"].split())[:300]
if os.environ.get("TAB"): q["tab"] = " ".join(os.environ["TAB"].split())[:120]
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(p), prefix=".nudge.")
with os.fdopen(fd, "w", encoding="utf-8") as f: json.dump(q, f, indent=1, ensure_ascii=False)
os.replace(tmp, p)
print(f"{os.path.basename(p)[:-5]} → {os.environ['ST']}")
PY
}

case "${1:-}" in
  ""|list) cmd_list ;;
  mark)    shift; cmd_mark "$@" ;;
  *) sed -n '/^# USAGE/,/^# EXIT/p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac

#!/opt/homebrew/bin/bash
# v5-w12-desk.sh — the desk's file plumbing: list the wave's open questions, apply ONE chosen option, mirror
# them into the Fleet note. The /w12-desk skill (SKILL.md beside this file) does the asking with
# AskUserQuestion; this script does nothing a tap did not authorise.
#
# Director 2026-09-10 05:55 ("Use always AskUserQuestionTool when you need me") and 06:40. Spec:
# scripts/ship-wave/HUMAN-IN-THE-LOOP.md §A2 (answer), §A3 (mirror), §D "resolution memory".
#
# What this may touch — and nothing else:
#   $STATE/questions/**                      the question files and questions.log
#   $STATE/approve-held | allow-destructive | advisory-checks   the wave's three knobs (append only)
#   $STATE/FROZEN                            removed by the `unfreeze` op (= ship-wave.sh --unfreeze)
#   policy_ratify P<n>                       the `ratify` op (= ship-wave.sh --ratify)
#   $STATE/failure-ledger.jsonl              one "resolved" record per answered freeze question (append)
#   $FLEET_MD                                ONLY its "## W12 desk — waiting on you" section
# It never runs the wave. It never merges. It never invents an option: the writes in the file are the contract.
#
# USAGE  v5-w12-desk.sh pending                     JSON list of open questions (unanswered, unexpired), oldest first
#        v5-w12-desk.sh answer <id> <option-index>  apply that option's writes, file → questions/answered/
#        v5-w12-desk.sh answer <id> other "<text>"  store the free text verbatim; apply NOTHING
#        v5-w12-desk.sh mirror                      rewrite the desk section of $FLEET_MD
# ENV    STATE     (default ~/.config/obsidian/.ship-wave)   tests point this at a temp dir
#        FLEET_MD  (default the Fleet note synced to the phone)
# INSTALL  ln -sf <ship-policy checkout>/scripts/ship-wave/desk/v5-w12-desk.sh ~/.config/obsidian/v5-w12-desk.sh
set -uo pipefail

# resolve a symlink install back to the repo so the sibling scripts are found (macOS: no readlink -f on old bash)
_self="${BASH_SOURCE[0]}"
while [ -L "$_self" ]; do _t=$(readlink "$_self"); case "$_t" in /*) _self="$_t";; *) _self="$(dirname "$_self")/$_t";; esac; done
SW_DIR="${SHIP_WAVE_DIR:-$(cd "$(dirname "$_self")/.." && pwd)}"

STATE="${STATE:-$HOME/.config/obsidian/.ship-wave}"; mkdir -p "$STATE"
FLEET_MD="${FLEET_MD:-/Users/omm/Vaults/Claude Setup/Fleet/Claude Fleet.md}"
FREEZE="$STATE/FROZEN"
say() { printf '%s\n' "$*"; }

# the wave's own functions, so `ratify` and the ledger record are the wave's, not a re-implementation
. "$SW_DIR/failure-ledger.sh"      # ledger_class · ledger_record · LEDGER
. "$SW_DIR/policy-learning.sh"     # policy_ratify
. "$SW_DIR/desk-questions.sh"      # QUESTIONS_DIR · QUESTIONS_LOG · question_writes_valid

qlog() { printf '%s\t%s\n' "$(date '+%F %T')" "$*" >> "$QUESTIONS_LOG"; }

# ── pending ───────────────────────────────────────────────────────────────────
# Prints a JSON array of open, unexpired, VALID questions, oldest asked_at first. An invalid file (an op
# outside the allowlist) is reported on stderr and left where it is — it must not reach the phone.
cmd_pending() {
  local f why ids=""
  for f in "$QUESTIONS_DIR"/q-*.json; do
    [ -e "$f" ] || continue
    if why=$(question_writes_valid "$(cat "$f")"); then ids="$ids$(basename "$f" .json)
"
    else echo "desk: invalid question $(basename "$f" .json) — $why — not asked, not applied" >&2; fi
  done
  IDS="$ids" python3 - "$QUESTIONS_DIR" <<'PY'
import json, os, sys, datetime
now = datetime.datetime.now().astimezone(); out = []
for i in [i for i in os.environ["IDS"].split("\n") if i]:
    try:
        q = json.load(open(os.path.join(sys.argv[1], i + ".json"))); t = datetime.datetime.fromisoformat(q["asked_at"])
    except Exception:
        continue
    if t + datetime.timedelta(hours=int(q.get("expires_after_h", 48))) <= now:
        continue                    # expired: the moment passed; the wave re-asks (refreshes) if it still matters
    out.append((t, q))
out.sort(key=lambda x: x[0])
print(json.dumps([q for _, q in out], indent=1, ensure_ascii=False))
PY
}

# ── answer ────────────────────────────────────────────────────────────────────
apply_write() {  # $1 = one write as JSON → prints what it did; returns 1 if the op failed
  local op file value out
  op=$(printf '%s' "$1" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("op",""))')
  case "$op" in
    append)
      file=$(printf '%s' "$1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["file"])')
      value=$(printf '%s' "$1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["value"])')
      case "$file" in approve-held|allow-destructive|advisory-checks) ;; *) echo "append $file REFUSED (not a knob)"; return 1;; esac
      printf '%s\n' "$value" >> "$STATE/$file" && echo "append $file $value" ;;
    unfreeze)
      # what ship-wave.sh --unfreeze does. The freeze CLASS (spec §B) lives in the FROZEN line itself; a
      # sidecar, if the wave ever writes one, goes with it.
      rm -f "$FREEZE" "$FREEZE.class" && echo "unfreeze" ;;
    ratify)
      value=$(printf '%s' "$1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["value"])')
      if out=$(policy_ratify "$value" 2>&1); then echo "ratify $value"; else echo "ratify $value FAILED: $out"; return 1; fi ;;
    noop) echo "noop" ;;
    *) echo "op $op REFUSED"; return 1 ;;
  esac
}

cmd_answer() {
  local id="$1" choice="${2:-}" text="${3:-}" f why n idx label kind cls title writes applied="" failed=0 w rc
  f="$QUESTIONS_DIR/$id.json"
  [ -f "$f" ] || { echo "desk: no open question $id"; [ -f "$QUESTIONS_DIR/answered/$id.json" ] && echo "  (already answered)"; return 2; }
  # the allowlist is checked HERE, on the file as it is now — not on what pending showed earlier
  if ! why=$(question_writes_valid "$(cat "$f")"); then
    echo "desk: REFUSED $id — $why. Nothing applied; the file is left in place for a human to read."
    qlog "refused	$id	$why"; return 3
  fi
  kind=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["kind"])' "$f")
  cls=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("class",""))' "$f")
  title=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("title",""))' "$f")
  if [ "$choice" = "other" ]; then
    # free text: stored verbatim, applies NOTHING (spec §A2.4) — the next receipt surfaces it for a human
    CH=other TXT="$text" python3 - "$f" "$QUESTIONS_DIR/answered/$id.json" <<'PY'
import json, os, sys, datetime
q = json.load(open(sys.argv[1]))
q.update({"answered_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
          "chosen": "other", "other_text": os.environ["TXT"], "applied": []})
json.dump(q, open(sys.argv[2], "w"), indent=1, ensure_ascii=False); os.remove(sys.argv[1])
PY
    qlog "answered	$id	other	$(printf '%s' "$text" | tr '\n\t' '  ' | cut -c1-200)"
    echo "$id → other (stored, nothing applied): $(printf '%s' "$text" | cut -c1-80)"
    return 0
  fi
  case "$choice" in ''|*[!0-9]*) echo "desk: option index must be a number or 'other', got '$choice'"; return 2;; esac
  n=$(python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))["options"]))' "$f")
  [ "$choice" -lt "$n" ] || { echo "desk: $id has $n options (0..$((n-1))), got $choice"; return 2; }
  idx="$choice"
  label=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["options"][int(sys.argv[2])]["label"])' "$f" "$idx")
  writes=$(python3 -c 'import json,sys;print(json.dumps(json.load(open(sys.argv[1]))["options"][int(sys.argv[2])]["writes"]))' "$f" "$idx")
  # apply, one op at a time, in the order written — exactly these and no others
  while IFS= read -r w; do
    [ -n "$w" ] || continue
    if out=$(apply_write "$w"); then rc=0; else rc=1; failed=$((failed+1)); fi
    applied="$applied${applied:+
}$out"
  done < <(printf '%s' "$writes" | python3 -c 'import json,sys
for w in json.load(sys.stdin): print(json.dumps(w))')
  APPLIED="$applied" IDX="$idx" LABEL="$label" FAILED="$failed" python3 - "$f" "$QUESTIONS_DIR/answered/$id.json" <<'PY'
import json, os, sys, datetime
q = json.load(open(sys.argv[1]))
q.update({"answered_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
          "chosen": os.environ["LABEL"], "chosen_index": int(os.environ["IDX"]),
          "applied": [a for a in os.environ["APPLIED"].split("\n") if a]})
if int(os.environ["FAILED"]): q["failed"] = int(os.environ["FAILED"])
json.dump(q, open(sys.argv[2], "w"), indent=1, ensure_ascii=False); os.remove(sys.argv[1])
PY
  qlog "answered	$id	$idx	$label	$(printf '%s' "$applied" | tr '\n' ';')"
  # resolution memory (spec §D): a decided freeze becomes evidence the policy learner can count
  if [ "$kind" = "freeze" ]; then
    ledger_record resolved "desk: $title → $label" "$cls" \
      "$(L="$label" W="$writes" python3 -c 'import json,os;print(json.dumps({"chosen":os.environ["L"],"writes":json.loads(os.environ["W"])}))')"
  fi
  printf '%s\n' "$applied" | while IFS= read -r w; do [ -n "$w" ] && echo "$id → $w $( case "$w" in *FAILED*|*REFUSED*) echo ✗;; *) echo ✓;; esac)"; done
  [ "$failed" -eq 0 ] || return 4
}

# ── mirror ────────────────────────────────────────────────────────────────────
# Rewrites ONLY the "## W12 desk — waiting on you" section of $FLEET_MD (appended at the end when absent).
# Everything outside that section is left byte-for-byte. Phone visibility without the tab (spec §A3).
cmd_mirror() {
  local pend; pend=$(cmd_pending)
  local invalid=""; local f why
  for f in "$QUESTIONS_DIR"/q-*.json; do
    [ -e "$f" ] || continue
    why=$(question_writes_valid "$(cat "$f")") || invalid="$invalid$(basename "$f" .json): $why
"
  done
  [ -f "$FLEET_MD" ] || { mkdir -p "$(dirname "$FLEET_MD")"; : > "$FLEET_MD"; }
  PEND="$pend" INVALID="$invalid" python3 - "$FLEET_MD" <<'PY'
import json, os, sys, datetime
HEAD = "## W12 desk — waiting on you"
qs = json.loads(os.environ["PEND"]); inv = os.environ["INVALID"].strip().split("\n") if os.environ["INVALID"].strip() else []
lines = [HEAD + (f" ({len(qs)})" if qs else ""), ""]
if not qs:
    lines.append("nothing waiting")
for n, q in enumerate(qs, 1):
    lines.append(f"**{n}. [{q['kind']}] {q['title']}**")
    if q.get("body"): lines.append(q["body"])
    for i, o in enumerate(q["options"]):
        rec = " (Recommended)" if i == q.get("recommended", 0) else ""
        lines.append(f"  {i + 1}. **{o['label']}**{rec} — {o.get('description', '')}")
    lines.append(f"  answer in the desk tab: /w12-desk · id `{q['id']}` · asked {q['asked_at'][:16].replace('T', ' ')}")
    lines.append("")
for i in inv:
    lines.append(f"⚠ invalid question, not askable: {i}")
lines.append(f"_desk mirror {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}_")
section = "\n".join(lines).rstrip("\n") + "\n"
p = sys.argv[1]; src = open(p, encoding="utf-8").read()
rows = src.split("\n")
start = next((i for i, r in enumerate(rows) if r.startswith(HEAD)), None)
if start is None:
    out = src + ("" if src.endswith("\n") or not src else "\n") + ("\n" if src else "") + section
else:
    end = next((i for i in range(start + 1, len(rows)) if rows[i].startswith("## ")), None)
    before = "\n".join(rows[:start]) + ("\n" if start > 0 else "")
    if end is None:
        out = before + section
    else:
        out = before + section + "\n" + "\n".join(rows[end:])
open(p, "w", encoding="utf-8").write(out)
print(f"desk: mirrored {len(qs)} open question(s) into {os.path.basename(p)}")
PY
}

case "${1:-}" in
  pending) cmd_pending ;;
  answer)  [ -n "${2:-}" ] && [ -n "${3:-}" ] || { echo "usage: v5-w12-desk.sh answer <id> <option-index> | answer <id> other \"<text>\""; exit 2; }
           cmd_answer "$2" "$3" "${4:-}" ;;
  mirror)  cmd_mirror ;;
  *) sed -n '/^# USAGE/,/^# INSTALL/p' "$_self"; exit 2 ;;
esac

#!/bin/bash
# desk-questions.sh — the wave's side of the question channel: it ASKS, on disk, and a desk answers.
#
# Director 2026-09-10 05:55 ("Use always AskUserQuestionTool when you need me"): every freeze so far was
# correct, and every one waited for a human who was on a phone. The wave stopped mute in a receipt file;
# the human found a terminal hours later. This file turns "the wave needs a human" into a QUESTION FILE
# with numbered options, so a live Claude tab (/w12-desk, scripts/ship-wave/desk/) can put it in front of
# him as an AskUserQuestion and write the tap back. Spec: scripts/ship-wave/HUMAN-IN-THE-LOOP.md §A1.
#
# Contract that keeps this safe: an option's `writes` IS the whole effect of choosing it. The desk applies
# exactly those ops and nothing else, and only these ops exist:
#   append <file> <value>   file ∈ approve-held | allow-destructive | advisory-checks — the wave's existing knobs
#   unfreeze                rm $STATE/FROZEN (what --unfreeze does)
#   ratify P<n>             policy_ratify (policy-learning.sh) — a rule the Director approves once
#   noop                    "keep it as it is"
# NO op deletes data, runs SQL, merges, or touches git. A question carrying any other op is INVALID: the
# desk reports it and applies nothing (question_writes_valid below is that check, used on both sides).
#
# Sourced by ship-wave.sh after policy-learning.sh (needs $STATE, say). Also sourced by the desk helper.

QUESTIONS_DIR="${QUESTIONS_DIR:-$STATE/questions}"
QUESTIONS_LOG="${QUESTIONS_LOG:-$STATE/questions.log}"
mkdir -p "$QUESTIONS_DIR/answered"
type -t say >/dev/null 2>&1 || say() { printf '%s\n' "$*"; }

# question_writes_valid <json> → 0 if every option's writes uses ONLY the allowed ops; else prints why and returns 1.
# <json> may be a whole question, an options array, or a bare writes array. The allowlist is the spec's list,
# verbatim — adding an op here is a policy change and needs the Director, not a builder.
question_writes_valid() {
  Q="$1" python3 - <<'PY'
import json, os, re, sys
KNOBS = ("approve-held", "allow-destructive", "advisory-checks")
try:
    doc = json.loads(os.environ["Q"])
except Exception as e:
    print(f"not JSON: {e}"); sys.exit(1)
if isinstance(doc, dict):
    options = doc.get("options")
elif isinstance(doc, list) and doc and isinstance(doc[0], dict) and "op" in doc[0]:
    options = [{"label": "-", "writes": doc}]          # bare writes array
else:
    options = doc
if not isinstance(options, list) or not options:
    print("no options"); sys.exit(1)
for i, o in enumerate(options):
    w = o.get("writes") if isinstance(o, dict) else None
    if not isinstance(w, list):
        print(f"option {i}: writes missing"); sys.exit(1)
    for op in w:
        if not isinstance(op, dict):
            print(f"option {i}: write is not an object"); sys.exit(1)
        name = op.get("op")
        if name == "append":
            f, v = op.get("file"), op.get("value")
            if f not in KNOBS:
                print(f'option {i}: append to "{f}" is not a knob (allowed: {", ".join(KNOBS)})'); sys.exit(1)
            if not isinstance(v, str) or not v.strip() or "\n" in v or "/" in v:
                print(f'option {i}: append value must be one plain line, got {v!r}'); sys.exit(1)
        elif name == "ratify":
            if not re.fullmatch(r"P[0-9]+", str(op.get("value", ""))):
                print(f'option {i}: ratify value must be P<n>, got {op.get("value")!r}'); sys.exit(1)
        elif name in ("unfreeze", "noop"):
            pass
        else:
            print(f'option {i}: op "{name}" is not allowed (allowed: append, unfreeze, ratify, noop)'); sys.exit(1)
sys.exit(0)
PY
}

# ask_director <kind> <class> <title> <body> <options-json>
# Writes $QUESTIONS_DIR/q-<YYYYmmdd-HHMMSS>-<slug>.json, or — when an OPEN question already has the same
# kind+class+title — only refreshes its asked_at (a freeze re-fires every round; the Director must see one
# question, not one per round). One line per call lands in $QUESTIONS_LOG. The receipt line goes through
# `say` (stdout is the wave's receipt); the id is left in ASK_DIRECTOR_ID for a caller that needs it.
# Optional env: Q_RECOMMENDED (default 0), Q_EXPIRES_H (default 48).
# Refuses to write a question whose writes fail question_writes_valid — a bad question never reaches the phone.
ask_director() {
  local kind="$1" cls="$2" title="$3" body="$4" opts="$5" why id existing slug ts
  ASK_DIRECTOR_ID=""
  case "$kind" in freeze|held|policy|deploy) ;; *) say "  desk: ask_director refused — unknown kind '$kind'"; return 2;; esac
  if ! why=$(question_writes_valid "$opts"); then
    say "  desk: ask_director refused — invalid writes ($why)"
    printf '%s\trefused\t%s\t%s\t%s\n' "$(date '+%F %T')" "$kind" "$cls" "$why" >> "$QUESTIONS_LOG"
    return 1
  fi
  title="${title:0:110}"     # the spec's ceiling — a phone shows about that much on one line
  # same kind+class+title already open → refresh, do not duplicate
  existing=$(K="$kind" C="$cls" T="$title" python3 - "$QUESTIONS_DIR" <<'PY'
import json, os, sys, glob
d = sys.argv[1]
for f in sorted(glob.glob(os.path.join(d, "q-*.json"))):
    try: q = json.load(open(f))
    except Exception: continue
    if q.get("kind") == os.environ["K"] and q.get("class") == os.environ["C"] and q.get("title") == os.environ["T"]:
        print(q["id"]); break
PY
)
  ts=$(date '+%Y%m%d-%H%M%S')
  if [ -n "$existing" ]; then
    id="$existing"
    python3 - "$QUESTIONS_DIR/$id.json" <<'PY'
import json, sys, datetime
p = sys.argv[1]; q = json.load(open(p))
q["asked_at"] = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
q["asked_times"] = int(q.get("asked_times", 1)) + 1
json.dump(q, open(p, "w"), indent=1, ensure_ascii=False)
PY
    printf '%s\trefreshed\t%s\t%s\t%s\t%s\n' "$(date '+%F %T')" "$id" "$kind" "$cls" "$title" >> "$QUESTIONS_LOG"
    say "  desk: question already open, refreshed — $id"
    ASK_DIRECTOR_ID="$id"; return 0
  fi
  slug=$(printf '%s %s' "$kind" "${cls:-$title}" | tr 'A-Z' 'a-z' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' | cut -c1-32 | sed -E 's/-+$//')
  id="q-$ts-$slug"
  K="$kind" C="$cls" T="$title" B="$body" O="$opts" ID="$id" R="${Q_RECOMMENDED:-0}" E="${Q_EXPIRES_H:-48}" \
    python3 - "$QUESTIONS_DIR/$id.json" <<'PY'
import json, os, sys, datetime
e = os.environ
opts = json.loads(e["O"])
if isinstance(opts, dict): opts = opts["options"]
q = {
    "id": e["ID"],
    "asked_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
    "kind": e["K"], "class": e["C"], "title": e["T"], "body": e["B"],
    "options": opts,
    "recommended": max(0, min(int(e["R"] or 0), len(opts) - 1)),
    "expires_after_h": int(e["E"] or 48),
}
json.dump(q, open(sys.argv[1], "w"), indent=1, ensure_ascii=False)
PY
  printf '%s\tasked\t%s\t%s\t%s\t%s\n' "$(date '+%F %T')" "$id" "$kind" "$cls" "$title" >> "$QUESTIONS_LOG"
  say "  desk: question written for the Director — $id ($title)"
  ASK_DIRECTOR_ID="$id"
}

# questions_open_count → how many questions are waiting (unanswered, unexpired) — for the receipt line.
# (python -c, not a heredoc: bash 3.2 mangles an exported function whose heredoc is followed by `||`)
questions_open_count() {
  python3 -c '
import json, os, sys, glob, datetime
now = datetime.datetime.now().astimezone(); n = 0
for f in glob.glob(os.path.join(sys.argv[1], "q-*.json")):
    try:
        q = json.load(open(f)); t = datetime.datetime.fromisoformat(q["asked_at"])
        if t + datetime.timedelta(hours=int(q.get("expires_after_h", 48))) > now: n += 1
    except Exception: pass
print(n)' "$QUESTIONS_DIR" 2>/dev/null || echo 0
}

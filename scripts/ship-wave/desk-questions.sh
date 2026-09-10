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
# SHAPE RULES (2026-09-10, after the adversarial verification of fb0bd5a0ae — one tap must mean ONE thing):
#   id      ^q-[0-9]{8}-[0-9]{6}-[a-z0-9][a-z0-9-]{0,39}$  — the desk only ever resolves $STATE/questions/<id>.json;
#           a path-shaped id ("answered/q-…", "../stray") re-applied an answered question and read a file
#           outside questions/. Now it is refused before any path is built.
#   append value, per knob, exactly as the wave READS the knob:
#           approve-held      ^[0-9]{1,7}$      ship-wave.sh splits the file on ',' and whitespace — a value
#                                               "3410\t3411" under a label "Approve #3410" approved TWO PRs
#           allow-destructive ^[0-9]{14}$       apply-migrations.sh matches a whole line against a version
#           advisory-checks   one printable line, 1–80 chars, no tab/CR/LF/ESC/control (an exact check name)
#   title, class, label, description: one printable line, no tab/CR/LF/control; title ≤110, class ≤80.
#           A "\n## Injected" in a title leaked a heading OUT of the mirror's Fleet-note section every pass.
#   body:   CR/LF allowed (2–4 sentences); other control characters refused. The mirror quotes every body line.
#
# Sourced by ship-wave.sh after policy-learning.sh (needs $STATE, say). Also sourced by the desk helper.

QUESTIONS_DIR="${QUESTIONS_DIR:-$STATE/questions}"
QUESTIONS_LOG="${QUESTIONS_LOG:-$STATE/questions.log}"
QUESTION_ID_RE='^q-[0-9]{8}-[0-9]{6}-[a-z0-9][a-z0-9-]{0,39}$'
mkdir -p "$QUESTIONS_DIR/answered"
type -t say >/dev/null 2>&1 || say() { printf '%s\n' "$*"; }

# question_id_valid <id> → 0 if <id> has the q-<stamp>-<slug> shape (and so names exactly one file in questions/)
question_id_valid() { [[ "$1" =~ $QUESTION_ID_RE ]]; }

# question_writes_valid <json> [expected-id] → 0 if every option's writes uses ONLY the allowed ops AND every value
# has the shape the wave reads; else prints why and returns 1.
# <json> may be a whole question, an options array, or a bare writes array. When it is a whole question (it
# carries id/kind/title), those fields are checked too; with [expected-id] given, id/kind/title/asked_at/options
# are REQUIRED and id must equal it (that is the file-level check: question_file_valid).
# The op allowlist is the spec's list, verbatim — adding an op here is a policy change and needs the Director,
# not a builder.
question_writes_valid() {
  Q="$1" EXPECT="${2:-}" python3 - <<'PY'
import json, os, re, sys, datetime
KNOBS = ("approve-held", "allow-destructive", "advisory-checks")
KINDS = ("freeze", "held", "policy", "deploy")
ID_RE = re.compile(r"q-[0-9]{8}-[0-9]{6}-[a-z0-9][a-z0-9-]{0,39}")
CTRL = re.compile(r"[\x00-\x1f\x7f]")                       # every C0 control + DEL: tab, CR, LF, ESC included
BODY_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")  # body may hold \t \n \r, nothing else below 0x20
VALUE_RE = {"approve-held": re.compile(r"[0-9]{1,7}"), "allow-destructive": re.compile(r"[0-9]{14}")}
def die(m): print(m); sys.exit(1)
def one_line(name, s, maxlen, allow_empty=False):
    if not isinstance(s, str): die(f"{name} must be a string, got {type(s).__name__}")
    if not s.strip() and not allow_empty: die(f"{name} must not be blank")
    if CTRL.search(s): die(f"{name} must be one plain line (no tab/CR/LF/control characters), got {s!r}")
    if len(s) > maxlen: die(f"{name} longer than {maxlen} chars ({len(s)})")
try:
    doc = json.loads(os.environ["Q"])
except Exception as e:
    die(f"not JSON: {e}")
expect = os.environ.get("EXPECT", "")
if isinstance(doc, dict):
    options = doc.get("options")
    is_question = expect or any(k in doc for k in ("id", "kind", "title"))
    if expect:
        for k in ("id", "kind", "title", "asked_at", "options"):
            if k not in doc: die(f"question is missing {k!r}")
    if is_question:
        if "id" in doc:
            if not isinstance(doc["id"], str) or not ID_RE.fullmatch(doc["id"]):
                die(f"id {doc.get('id')!r} is not q-YYYYmmdd-HHMMSS-<slug> ([a-z0-9-], ≤40)")
            if expect and doc["id"] != expect: die(f"id {doc['id']!r} does not match the file name {expect!r}")
        if "kind" in doc and doc["kind"] not in KINDS: die(f"kind {doc.get('kind')!r} is not one of {', '.join(KINDS)}")
        if "title" in doc: one_line("title", doc["title"], 110)
        if "class" in doc: one_line("class", doc["class"], 80, allow_empty=True)
        if "body" in doc:
            if not isinstance(doc["body"], str): die("body must be a string")
            if BODY_CTRL.search(doc["body"]): die(f"body carries a control character other than tab/CR/LF")
        if "asked_at" in doc:
            try: datetime.datetime.fromisoformat(str(doc["asked_at"]))
            except Exception: die(f"asked_at {doc.get('asked_at')!r} is not an ISO timestamp")
        for k, lo in (("recommended", 0), ("expires_after_h", 1)):
            if k in doc and (not isinstance(doc[k], int) or isinstance(doc[k], bool) or doc[k] < lo):
                die(f"{k} must be an integer ≥ {lo}, got {doc.get(k)!r}")
elif isinstance(doc, list) and doc and isinstance(doc[0], dict) and "op" in doc[0]:
    options = [{"label": "-", "writes": doc}]          # bare writes array
else:
    options = doc
if not isinstance(options, list) or not options:
    die("no options")
for i, o in enumerate(options):
    if not isinstance(o, dict): die(f"option {i}: not an object")
    one_line(f"option {i} label", o.get("label"), 200)
    if "description" in o: one_line(f"option {i} description", o["description"], 400, allow_empty=True)
    w = o.get("writes")
    if not isinstance(w, list):
        die(f"option {i}: writes missing")
    for op in w:
        if not isinstance(op, dict):
            die(f"option {i}: write is not an object")
        name = op.get("op")
        if name == "append":
            f, v = op.get("file"), op.get("value")
            if f not in KNOBS:
                die(f'option {i}: append to {f!r} is not a knob (allowed: {", ".join(KNOBS)})')
            if not isinstance(v, str):
                die(f"option {i}: append value must be a string, got {v!r}")
            if f in VALUE_RE:
                if not VALUE_RE[f].fullmatch(v):
                    die(f"option {i}: append {f} value must match ^{VALUE_RE[f].pattern}$ (one {'PR number' if f == 'approve-held' else 'migration version'}), got {v!r}")
            else:  # advisory-checks: one exact check name
                if not v.strip() or CTRL.search(v) or len(v) > 80:
                    die(f"option {i}: append {f} value must be one printable line, 1–80 chars, no tab/CR/LF/control, got {v!r}")
        elif name == "ratify":
            if not re.fullmatch(r"P[0-9]+", str(op.get("value", ""))):
                die(f'option {i}: ratify value must be P<n>, got {op.get("value")!r}')
        elif name in ("unfreeze", "noop"):
            pass
        else:
            die(f'option {i}: op {name!r} is not allowed (allowed: append, unfreeze, ratify, noop)')
sys.exit(0)
PY
}

# question_file_valid <path> → 0 if the file is a well-formed, allowlisted question whose name is its id; else why + 1.
# Used by pending, mirror, questions_open_count and answer, so all four agree on what "a question" is.
question_file_valid() {
  local b; b=$(basename "$1" .json)
  question_id_valid "$b" || { printf '%s\n' "file name '$b' is not a question id (q-YYYYmmdd-HHMMSS-<slug>)"; return 1; }
  [ -f "$1" ] || { printf '%s\n' "no such file"; return 1; }
  question_writes_valid "$(cat "$1")" "$b"
}

# _q_one_line <text> → <text> with every control character (tab/CR/LF/ESC…) turned into a space, runs squeezed,
# ends trimmed. The wave composes titles from messages it did not write; a newline in one must not reach the file.
_q_one_line() { printf '%s' "$1" | tr '\000-\037\177' ' ' | tr -s ' ' | sed -E 's/^ +//; s/ +$//'; }

# ask_director <kind> <class> <title> <body> <options-json>
# Writes $QUESTIONS_DIR/q-<YYYYmmdd-HHMMSS>-<slug>.json, or — when an OPEN question already has the same
# kind+class+title — only refreshes its asked_at (a freeze re-fires every round; the Director must see one
# question, not one per round). One line per call lands in $QUESTIONS_LOG. The receipt line goes through
# `say` (stdout is the wave's receipt); the id is left in ASK_DIRECTOR_ID for a caller that needs it.
# Optional env: Q_RECOMMENDED (default 0), Q_EXPIRES_H (default 48).
# Title and class are flattened to one plain line (control characters → space) and capped (110 / 80).
# Refuses to write a question whose writes fail question_writes_valid — a bad question never reaches the phone.
ask_director() {
  local kind="$1" cls="$2" title="$3" body="$4" opts="$5" why id existing slug ts doc
  ASK_DIRECTOR_ID=""
  case "$kind" in freeze|held|policy|deploy) ;; *) say "  desk: ask_director refused — unknown kind '$kind'"; return 2;; esac
  title=$(_q_one_line "$title"); title="${title:0:110}"     # the spec's ceiling — a phone shows about that much on one line
  cls=$(_q_one_line "$cls"); cls="${cls:0:80}"
  [ -n "$title" ] || { say "  desk: ask_director refused — empty title"; return 1; }
  if ! why=$(question_writes_valid "$opts"); then
    say "  desk: ask_director refused — invalid writes ($why)"
    printf '%s\trefused\t%s\t%s\t%s\n' "$(date '+%F %T')" "$kind" "$cls" "$(_q_one_line "$why")" >> "$QUESTIONS_LOG"
    return 1
  fi
  # same kind+class+title already open → refresh, do not duplicate (only files whose name is a valid id count)
  existing=$(K="$kind" C="$cls" T="$title" python3 - "$QUESTIONS_DIR" <<'PY'
import json, os, sys, glob, re
d = sys.argv[1]; ID_RE = re.compile(r"q-[0-9]{8}-[0-9]{6}-[a-z0-9][a-z0-9-]{0,39}")
for f in sorted(glob.glob(os.path.join(d, "q-*.json"))):
    b = os.path.basename(f)[:-5]
    if not ID_RE.fullmatch(b): continue
    try: q = json.load(open(f))
    except Exception: continue
    if q.get("id") == b and q.get("kind") == os.environ["K"] and q.get("class") == os.environ["C"] and q.get("title") == os.environ["T"]:
        print(b); break
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
  [ -n "$slug" ] || slug="$kind"
  id="q-$ts-$slug"
  doc=$(K="$kind" C="$cls" T="$title" B="$body" O="$opts" ID="$id" R="${Q_RECOMMENDED:-0}" E="${Q_EXPIRES_H:-48}" python3 - <<'PY'
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
print(json.dumps(q, indent=1, ensure_ascii=False))
PY
)
  # the whole file must pass the same check the desk applies before answering — or it is never written
  if ! why=$(question_writes_valid "$doc" "$id"); then
    say "  desk: ask_director refused — question would be invalid ($why)"
    printf '%s\trefused\t%s\t%s\t%s\n' "$(date '+%F %T')" "$kind" "$cls" "$(_q_one_line "$why")" >> "$QUESTIONS_LOG"
    return 1
  fi
  printf '%s\n' "$doc" > "$QUESTIONS_DIR/$id.json"
  printf '%s\tasked\t%s\t%s\t%s\t%s\n' "$(date '+%F %T')" "$id" "$kind" "$cls" "$title" >> "$QUESTIONS_LOG"
  say "  desk: question written for the Director — $id ($title)"
  ASK_DIRECTOR_ID="$id"
}

# questions_open_count → how many VALID questions are waiting (unanswered, unexpired) — for the receipt line.
# Same validity rule as the desk's `pending`, so the receipt's number is the number the desk will ask.
questions_open_count() {
  local f n=0
  for f in "$QUESTIONS_DIR"/q-*.json; do
    [ -e "$f" ] || continue
    question_file_valid "$f" >/dev/null 2>&1 || continue
    python3 -c '
import json, sys, datetime
q = json.load(open(sys.argv[1])); t = datetime.datetime.fromisoformat(q["asked_at"])
sys.exit(0 if t + datetime.timedelta(hours=int(q.get("expires_after_h", 48))) > datetime.datetime.now().astimezone() else 1)' "$f" 2>/dev/null && n=$((n+1))
  done
  echo "$n"
}

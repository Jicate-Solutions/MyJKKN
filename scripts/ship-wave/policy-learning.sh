#!/bin/bash
# policy-learning.sh — the wave learns POLICY in one direction on its own and the other by ratification.
#
# Director 2026-09-06 06:36 ("why can't the loop learn policies, not just remedies?"), decided by interview:
#
#   TIGHTEN alone.  A freeze tied to shipped content adds a GUARD: the directories that shipped in that
#   round become HELD until a human clears them (--unguard). Learned from failure, it can only restrict —
#   restricting on a false alarm is the safe failure mode, and the receipt says exactly what was guarded.
#
#   LOOSEN by tap.  Success is not a licence. "40 migrations merged unattended and nothing broke" is the
#   evidence that precedes the one that damages live institutional data, and that cost never shows in a
#   ledger until it is too late. So evidence only ever becomes a numbered PROPOSAL (--policy), the Director
#   ratifies it (--ratify P<n>), and the ratification is written down with its evidence and date
#   (policy.jsonl) before the rule flag ($STATE/policy/<RULE>) exists. Every rule change stays auditable.
#
# Sourced by ship-wave.sh after failure-ledger.sh (needs say, ledger_class, ledger_record, LEDGER).
#
# 2026-09-10 (HUMAN-IN-THE-LOOP.md §D) — proposals now also come from the Director's OWN answers.
# The desk records every answer to a freeze question as a 'resolved' ledger line (class, chosen, writes).
# When he has resolved one freeze class the same way PROPOSE_AFTER times, that becomes a numbered proposal
# and reaches his phone as a question (policy_emit_questions → ask_director). One tap ratifies it. His words:
# "propose after 2 identical decisions, I approve each rule once".

GUARDS="${GUARDS_FILE:-$STATE/guards.tsv}"
POLICY_LOG="$STATE/policy.jsonl"
POLICY_DIR="$STATE/policy"; mkdir -p "$POLICY_DIR"
# proposals get their P<n> here and keep it — numbers must not shift between runs, or "ratify P3" from a
# question asked yesterday would ratify something else today. Also tracks which proposals have been ASKED.
POLICY_PROPOSALS="$STATE/policy-proposals.jsonl"

# Director 2026-09-10: "propose after 2 identical decisions, I approve each rule once"
PROPOSE_AFTER=2
# Director 2026-09-10: "Anything that deletes or drops data can never become a rule — that stays yours every
# single time." Matched case-insensitively against the freeze class AND its message; a class that matches is
# never proposed, however many times he resolved it identically, and the output says so.
NEVER_RULE='DROP|TRUNCATE|DELETE FROM|destructive|APPLY failed|deploy ERROR'
# The same sentence applies to what a rule would DO, not only to what its class says (verifier 2026-09-10, break 9a:
# a class whose text lacked every keyword was proposed as an auto "append allow-destructive"). Two shapes are never
# proposable whatever the text (spec, "Amendments from the build"):
#   · `append allow-destructive` — compared case-insensitively after trimming (verifier NEW-2: "Allow-Destructive",
#     "allow-destructive " walked past an exact-match set and are the SAME file on APFS);
#   · `unfreeze` on a class that classify_freeze calls HARD — the ONE table in freeze-classes.sh that ship-wave.sh
#     also sources (verifier NEW-9: a hand-copied HARD_CLASS regex here was 10 rows behind it). The class is judged
#     from the raw message on the ledger's `froze` line for that class (the same text freeze() classified); when no
#     froze line exists, from the slug itself; a message that matches no row is HARD, as B treats it.
# And `append.file` must be exactly one of the §A1 knobs (verifier NEW-3: "frozen", "../frozen", "policy/…" were
# accepted as a valid shape and proposed) — anything else is a malformed resolution: warned once, never proposed.
POLICY_KNOBS='approve-held allow-destructive advisory-checks'
NEVER_RULE_FILES='allow-destructive'
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/freeze-classes.sh"
FREEZE_CLASSES_SH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/freeze-classes.sh"

# ── guards (tighten) ──────────────────────────────────────────────────────────
guard_prefixes_from_files() {  # stdin: file paths → unique 2-segment prefixes worth guarding
  # domains already handled by tiering are skipped: supabase/ is HELD by the migration rule, docs/specs are LOW,
  # .github/ is HELD by rule, scripts/ and .claude/ are the fleet's own tooling
  # app/ is one level deeper (app/api/cron, app/(routes)/billing) — "app/api" would hold every API route after one bad cron deploy
  awk -F/ 'NF>=2 && $1!="supabase" && $1!="docs" && $1!="specs" && $1!=".github" && $1!=".claude" && $1!="scripts" {print ($1=="app" && NF>=3) ? $1"/"$2"/"$3 : $1"/"$2}' | sort -u
}
guard_add_from_freeze() {  # $1 = freeze message · $2 = run dir (its merged-files.txt names what shipped)
  local msg="$1" run="${2:-}" p cls now n=0
  [ -n "$run" ] && [ -s "$run/merged-files.txt" ] || return 0
  # only a freeze caused by SHIPPED CODE guards code directories (deploy error, broken page). A refused or
  # failed migration is a supabase/ matter, and supabase/ is HELD by rule already — guarding app/lib would be noise.
  case "$msg" in *deploy*|*page*) ;; *) return 0;; esac
  cls=$(ledger_class "$msg"); now=$(date '+%F %T')
  while read -r p; do
    [ -n "$p" ] || continue
    grep -q "^$p	" "$GUARDS" 2>/dev/null && continue
    printf '%s\t%s\t%s\n' "$p" "$now" "$cls" >> "$GUARDS"; n=$((n+1))
    say "  policy: GUARD added — $p is HELD until you clear it (ship-wave.sh --unguard '$p'); cause: $cls"
  done < <(guard_prefixes_from_files < "$run/merged-files.txt")
  [ "$n" -gt 0 ] && ledger_record resolved "guards added: $n after '$cls'" "policy-guard"
  return 0
}
guards_env()   { [ -s "$GUARDS" ] && cut -f1 "$GUARDS" | tr '\n' ' '; return 0; }   # for the classifier
guards_list()  { if [ -s "$GUARDS" ]; then echo "guards (HELD until cleared with --unguard):"; awk -F'\t' '{printf "  %-40s since %s  cause: %s\n",$1,$2,$3}' "$GUARDS"; else echo "guards: none"; fi; }
guard_remove() { [ -s "$GUARDS" ] || { echo "no guards"; return 0; }; grep -v "^$1	" "$GUARDS" > "$GUARDS.new"; mv "$GUARDS.new" "$GUARDS"; echo "guard cleared: $1"; }


# ── policies (loosen, by ratification) ────────────────────────────────────────
policy_active() { [ -e "$POLICY_DIR/$1" ]; }

# _policy_scan <list|json> — ONE scan of the evidence, two renderings.
#   list: the human text policy_show/--policy prints (policy_ratify greps its 'evidence:' lines verbatim)
#   json: one JSON object per current proposal, for policy_emit_questions
# Side effect: any NEW learned proposal is appended to $POLICY_PROPOSALS with the next free P<n>, so the number
# is fixed the first time it is ever printed. P1 is reserved for AUTO_APPROVE_ADDITIVE_MIGRATIONS (2026-09-06).
#
# Identity (verifier 2026-09-10, break 8): a proposal is keyed by sha1 of the FULL normalised class + the shape,
# never by its rule name — the rule name truncates the class to 40 chars, so two real DRY-RUN classes with
# different error tails collapsed into one name and one tap ratified two decisions. The key is what P<n> maps to,
# 1:1, in policy-proposals.jsonl; the rule name stays human-readable (and gets a short key suffix only when the
# truncated name is already taken by a different key).
#
# Robustness (break 4): a malformed ledger line — bad JSON, a bare JSON value, a round without message, a froze
# without class, a resolved line whose writes are not a list of {op[,file]} with a known op — is skipped with ONE
# printed warning (stdout in list mode, stderr in json mode) and never stops the valid proposals from printing.
# A resolved line with no writes key at all is the OLD three-arg shape (guards) — ignored, not malformed.
_policy_scan() {
  MODE="$1" PROPOSE_AFTER="$PROPOSE_AFTER" NEVER_RULE="$NEVER_RULE" NEVER_RULE_FILES="$NEVER_RULE_FILES" POLICY_KNOBS="$POLICY_KNOBS" \
  FREEZE_CLASSES_SH="$FREEZE_CLASSES_SH" SW_BASH="${BASH:-bash}" \
    python3 - "$LEDGER" "$POLICY_LOG" "$POLICY_PROPOSALS" <<'PY'
import json, sys, os, re, datetime, hashlib, subprocess, fcntl
led, plog, pfile = sys.argv[1], sys.argv[2], sys.argv[3]
mode = os.environ["MODE"]
after = int(os.environ["PROPOSE_AFTER"])
never = re.compile(os.environ["NEVER_RULE"], re.I)
never_files = set(os.environ["NEVER_RULE_FILES"].split())
knobs = set(os.environ["POLICY_KNOBS"].split())
ALLOWED_OPS = {"append", "unfreeze", "ratify", "noop"}
warnings = []
def warn(n, why): warnings.append(f"proposals: warning — ledger line {n} skipped ({why})")
def norm(c): return " ".join(str(c).lower().split())
def shape_error(writes):  # None when every item is {op[,file,value]} with a known op and a knob file; else why not.
    # Side effect: append.file is normalised in place (trimmed, lowercased) so the SHAPE compares the way APFS does.
    for w in writes:
        if not isinstance(w, dict): return "writes item is not an object"
        op = w.get("op")
        if not isinstance(op, str) or not op: return "writes item without op"
        if op not in ALLOWED_OPS: return f"unknown op '{op[:20]}'"
        if op == "append":
            f = w.get("file")
            if not (isinstance(f, str) and f.strip()): return "append without file"
            f = f.strip().lower()
            if f not in knobs: return f"append to '{f[:40]}' is not a knob ({' | '.join(sorted(knobs))})"
            w["file"] = f
    return None

# classify_freeze lives in freeze-classes.sh (bash) and is the ONE hard/soft table; ask it, never re-implement it.
# items: "R<raw message>" or "S<ledger slug>" → soft | hard | unknown (unknown = no row matched = hard, fail safe)
def classify_many(items):
    if not items: return []
    try:
        p = subprocess.run([os.environ["SW_BASH"], "-c", '. "$1"; classify_freeze_batch', "_", os.environ["FREEZE_CLASSES_SH"]],
                           input="".join(i + "\0" for i in items).encode(), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        res = p.stdout.decode(errors="replace").split("\n")
    except Exception:
        res = []
    res = [r.strip() for r in res]
    return [(res[i] if i < len(res) and res[i] in ("soft", "hard", "unknown") else "unknown") for i in range(len(items))]

rounds, freezes, resolved, decided_without_writes = [], [], [], 0
if os.path.exists(led):
    for n, line in enumerate(open(led), 1):
        s = line.strip()
        if not s: continue
        try: r = json.loads(s)
        except Exception: warn(n, "not JSON"); continue
        if not isinstance(r, dict): warn(n, "not a record — a bare JSON value"); continue
        o = r.get("outcome")
        if o in ("round", "backfill"):
            if not isinstance(r.get("message"), str): warn(n, f"{o} without message"); continue
            rounds.append(r)
        elif o == "froze":
            if not isinstance(r.get("class"), str) or not r["class"].strip(): warn(n, "froze without class"); continue
            freezes.append(r)
        elif o == "resolved":
            if "writes" not in r:
                # the OLD three-arg shape (guards etc.) is evidence of nothing and not a fault. But a line that records
                # a DECISION (chosen, or the desk's "desk:" message) with no writes is exactly how a silent no-learning
                # state hides (verifier NEW-1: the desk's ledger_record call through a mismatched signature) — counted,
                # said once below, never fatal.
                if "chosen" in r or str(r.get("message", "")).startswith("desk:"): decided_without_writes += 1
                continue
            cls, w = r.get("class"), r["writes"]
            if not isinstance(cls, str) or not cls.strip(): warn(n, "resolved without class"); continue
            if not isinstance(w, list): warn(n, "resolved writes is not a list"); continue
            why = shape_error(w)
            if why: warn(n, f"resolved writes malformed: {why}"); continue
            r["class"] = " ".join(cls.split()); r["_norm"] = norm(cls); resolved.append(r)
        # any other outcome (unblocked, future kinds) is not this scan's business

def shape_of(writes):  # same op + same file, value ignored → the SHAPE of a decision
    return sorted({(w["op"], w.get("file", "") if w["op"] == "append" else "") for w in writes})
def key_of(cls, shape):  # FULL normalised class + shape → the proposal's identity
    return hashlib.sha1(json.dumps([norm(cls), [list(x) for x in shape]]).encode()).hexdigest()

ratified_rules, ratified_keys = {}, set()
if os.path.exists(plog):
    for line in open(plog):
        try: p = json.loads(line)
        except Exception: continue
        if not isinstance(p, dict) or not p.get("rule"): continue
        ratified_rules[p["rule"]] = p
        if p.get("key"): ratified_keys.add(p["key"])
# the proposals file: {"id","key","rule","class","shape","proposed_at"} lines assign numbers; {"id","asked_at"} lines
# record that the question reached the desk. Merge by id, newest line wins per field.
props = {}
# One scan at a time may number proposals: the file is read AND appended under an exclusive flock, so two scans that
# both see a new resolved line cannot hand the same P<n> two keys (verifier 2026-09-10, robustness note).
pfh = open(pfile, "a+")
fcntl.flock(pfh, fcntl.LOCK_EX)
pfh.seek(0)
for line in pfh:
    try: p = json.loads(line)
    except Exception: continue
    if not isinstance(p, dict) or not isinstance(p.get("id"), str): continue
    props.setdefault(p["id"], {}).update(p)
for pid, p in props.items():   # numbering lines written before keys existed: derive the key from class + shape
    if p.get("rule") and not p.get("key") and isinstance(p.get("class"), str) and isinstance(p.get("shape"), list):
        try: p["key"] = key_of(p["class"], [tuple(x) for x in p["shape"]])
        except Exception: pass
by_key = {p["key"]: pid for pid, p in props.items() if p.get("rule") and p.get("key")}
names_taken = {p["rule"]: p.get("key") for p in props.values() if p.get("rule")}
for rule, p in ratified_rules.items(): names_taken.setdefault(rule, p.get("key"))
def pnum(pid):
    try: return int(str(pid).lstrip("P").rstrip("?"))
    except ValueError: return 0
next_n = max([1] + [pnum(x) for x in props] + [pnum(p.get("id", "")) for p in ratified_rules.values()]) + 1

# ── P1 (decided 2026-09-06): loosen the HELD gate for additive migrations, from throughput evidence ──
def total(key):
    t = 0
    for r in rounds:
        for tok in r["message"].split():
            if tok.startswith(key + "="):
                try: t += int(tok.split("=", 1)[1])
                except ValueError: pass
    return t
held = total("held")
# a migration-CAUSED freeze = the applied SQL itself failed. Tooling classes (stale ref, dead workflow) and the
# destructive-statement REFUSAL (the gate doing its job, later allowed by hand) are not evidence against P1.
mig_freezes = [f for f in freezes if "migration" in f["class"]
               and "files on jicate main match" not in f["class"] and "apply failed run" not in f["class"]
               and "destructive statement" not in f["class"]]
out, skipped = [], []
if "AUTO_APPROVE_ADDITIVE_MIGRATIONS" not in ratified_rules:
    ev = f"{held} HELD merges on record, {len(mig_freezes)} migration-caused freeze(s); every HELD approval so far was typed by hand"
    warranted = held >= 5 and not mig_freezes
    # §D: P1 is re-emitted as a question ONCE whether or not the warrant currently holds — the Director asked to see
    # it (2026-09-10). The list rendering keeps 'P1?' while unwarranted, so --ratify P1 still needs the warrant.
    p1 = {"id": "P1", "rule": "AUTO_APPROVE_ADDITIVE_MIGRATIONS", "class": "policy", "warranted": warranted, "evidence": ev,
          "title": "Make it a rule: merge PRs whose only hold is an ordinary migration?",
          "body": "You have approved every migration-only HELD PR by hand so far. " + ev + ". Ratifying lets the wave merge those on its own; drops, deletes, money and grade changes stay held for you."}
    if warranted:
        p1["text"] = "auto-approve HELD PRs whose ONLY hold reason is a migration (money/grade words, guards and workflows stay HELD; the destructive-SQL gate still refuses DROP/TRUNCATE/DELETE at apply time)"
    else:
        p1["text"] = "(not yet warranted — needs ≥5 HELD merges and 0 migration-caused freezes)"
        p1["body"] += " The wave's own bar for this rule is 5 held merges and no migration-caused stop; today it stands at " + ev.split(";")[0] + ", so the wave itself is not yet asking for it."
    out.append(p1)

# ── learned proposals (2026-09-10, §D): the same answer to the same freeze class PROPOSE_AFTER times ──
def action_name(shape):
    parts = []
    for op, f in shape:
        parts.append(re.sub(r"[^A-Z0-9]+", "_", (f or op).upper()).strip("_"))
    return "_AND_".join(parts) or "NOOP"
def class_name(cls):  # whole words only, ≤40 chars — a rule name that ends in half a word reads as a typo
    words, out_ = re.sub(r"[^A-Z0-9]+", " ", cls.upper()).split(), []
    for w in words:
        if len("_".join(out_ + [w])) > 40: break
        out_.append(w)
    return "_".join(out_) or "UNKNOWN"
PLAIN = {("unfreeze", ""): "lift the stop itself", ("append", "approve-held"): "approve the held PR itself",
         ("append", "advisory-checks"): "treat that check as advice, not a stop"}
def action_plain(shape, chosen):
    return " and ".join(PLAIN.get((op, f), f"apply '{chosen}' itself") for op, f in shape)
groups = {}   # identity = the FULL normalised class + the shape; the class is shown as it was written
for r in resolved:
    groups.setdefault((r["_norm"], tuple(shape_of(r["writes"]))), []).append(r)

# hard_reason(ncls, recs) → None when classify_freeze calls this class soft; else one phrase saying why it is HARD.
# The class on a resolved line is the question's class = ledger_class(<raw freeze message>), cut to 80 by the desk
# (ledger_class itself cuts at 90) — so the froze lines whose class STARTS with it carry the raw text freeze()
# classified. Judge those with classify_freeze (exact §B semantics). Any hard verdict → hard. No froze line at all
# → judge the slug case-insensitively; a slug that matches no row is hard, exactly as B treats an unknown message.
# A resolved line's own message ("desk: <title> → <label>") counts only when it POSITIVELY matches a hard row.
froze_by_norm = {}
for f in freezes:
    froze_by_norm.setdefault(norm(f["class"]), []).append(str(f.get("message", "")))
def hard_reason(ncls, recs):
    raws = [m for k, ms in froze_by_norm.items() if k.startswith(ncls) for m in ms]
    items = ["R" + m for m in raws] + ["R" + str(r.get("message", "")) for r in recs]
    if not raws: items.append("S" + ncls)
    verdicts = classify_many(items)
    for item, v in zip(items, verdicts):
        if v == "hard": return f'classify_freeze says HARD for "{item[1:][:60]}"'
    if not raws:
        v = verdicts[-1]
        if v == "unknown": return "the class matches no row of classify_freeze and no froze line records its message — HARD, fail safe"
        if v == "hard": return f'classify_freeze says HARD for "{ncls[:60]}"'
        return None
    if any(v == "unknown" for v in verdicts[:len(raws)]):
        return "its freeze message matched no row of classify_freeze — HARD, fail safe"
    return None

new_lines = []
for (ncls, shape), recs in sorted(groups.items()):
    if len(recs) < after: continue
    n, cls = len(recs), recs[0]["class"]
    hit = never.search(cls) or any(never.search(str(r.get("message", ""))) for r in recs)
    if hit:
        skipped.append(f"{cls[:60]} — resolved {n}x the same way but matches NEVER_RULE ({hit.group(0)}): never a rule, stays with the Director")
        continue
    # the ACTION is checked too (break 9a): what the rule would write, not only what its class says. shape_of() already
    # holds the trimmed, lowercased file, so Allow-Destructive / "allow-destructive " land here too (NEW-2).
    dfiles = [f for op, f in shape if op == "append" and f in never_files]
    if dfiles:
        skipped.append(f"{cls[:60]} — resolved {n}x the same way but the rule would write {', '.join(dfiles)}: anything that deletes or drops data can never become a rule, stays with the Director")
        continue
    if any(op == "unfreeze" for op, _ in shape):
        why = hard_reason(ncls, recs)
        if why:
            skipped.append(f"{cls[:60]} — resolved {n}x the same way but the rule would lift a HARD stop ({why}): production or main is broken there, never a rule, stays with the Director")
            continue
    if any(op == "ratify" for op, _ in shape):
        skipped.append(f"{cls[:60]} — resolved {n}x with 'ratify': a rule that makes rules is not one he approved once, never a rule")
        continue
    if all(op == "noop" for op, _ in shape):
        skipped.append(f"{cls[:60]} — resolved {n}x with 'noop' (kept stopped, nothing written): nothing to automate")
        continue
    key = key_of(cls, shape)
    if key in ratified_keys: continue
    base = f"AUTO_{class_name(cls)}_{action_name(shape)}"
    if base in ratified_rules and not ratified_rules[base].get("key"): continue   # ratified before keys existed
    pid = by_key.get(key)
    if pid is None:
        rule = base
        if rule in names_taken and names_taken[rule] != key:   # another class already owns that truncated name
            rule = f"{base}_{key[:6].upper()}"
        pid = f"P{next_n}"; next_n += 1
        rec = {"id": pid, "key": key, "rule": rule, "class": cls, "shape": [list(x) for x in shape],
               "proposed_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M")}
        props[pid] = rec; by_key[key] = pid; names_taken[rule] = key; new_lines.append(rec)
    rule = props[pid]["rule"]
    recs = sorted(recs, key=lambda r: str(r.get("at", "")))
    dated = " · ".join(f'{str(r.get("at","?"))[:16]} "{r.get("chosen","?")}"' for r in recs[-max(after, 2):])
    ops = ", ".join(f"{op} {f}".strip() for op, f in shape)
    chosen = str(recs[-1].get("chosen") or "the same option")
    out.append({"id": pid, "key": key, "rule": rule, "class": cls, "chosen": chosen, "n": n, "dated": dated, "ops": ops,
                "action_plain": action_plain(shape, chosen),
                "text": f"when the wave freezes on '{cls[:70]}', apply '{chosen}' ({ops}) without asking",
                "evidence": f"resolved {n}x the same way: {dated}; writes: {ops}",
                # title/body for the Director are built by policy_emit_questions in plain English (ledger_remedy lives in bash).
                # The title carries P<n> and the question's class is the proposal KEY (spec amendment, verifier NEW-10):
                # ask_director de-dups on kind+class+title, and a shared template collapsed two proposals into one question.
                "title": f"Rule {pid}: you've answered the same way {n} times — make it a rule?",
                "qclass": key[:12]})
if new_lines:
    pfh.seek(0, 2)
    for rec in new_lines: pfh.write(json.dumps(rec) + "\n")
    pfh.flush()
fcntl.flock(pfh, fcntl.LOCK_UN); pfh.close()
# P1 has no ledger key: its question class is a stable digest of its rule name, never a ledger slug (same amendment)
for o in out:
    o.setdefault("qclass", hashlib.sha1(o["rule"].encode()).hexdigest()[:12])
if decided_without_writes:
    warnings.append(f"proposals: {decided_without_writes} resolved line(s) record a decision but no writes — nothing can be learned from them (ledger_record called with the old shape?)")

if mode == "json":
    for w in warnings: print(w, file=sys.stderr)
    for o in out:
        o["asked"] = bool(props.get(o["id"], {}).get("asked_at"))
        print(json.dumps(o))
    sys.exit()
for w in warnings: print(w)
for s_ in skipped: print(f"proposals: skipped {s_}")
if not out:
    print("proposals: none — every learnable rule is already ratified"); sys.exit()
print("proposals (ratify with: ship-wave.sh --ratify P<n>):")
for o in out:
    pid = o["id"] if o.get("warranted", True) else o["id"] + "?"
    print(f"  {pid:<4} {o['rule']}\n       {o['text']}\n       evidence: {o['evidence']}")
PY
}

policy_proposals() { _policy_scan list; }   # evidence from the ledger → numbered proposals (prints only what the evidence supports)

# _policy_plain_stop <class> → one plain sentence saying what the stop was: the first sentence of the verified
# remedy when the ledger knows one (parentheticals with dates/commits dropped), else the class itself.
_policy_plain_stop() {
  local rem
  if rem=$(ledger_remedy "$1" 2>/dev/null) && [ -n "$rem" ]; then
    printf 'What we know about it: %s.' "$(printf '%s' "$rem" | sed -E 's/ \([^)]*\)//g; s/ (—|--|;|: |\. ).*//; s/\.$//' | cut -c1-140)"
  else
    printf 'The stop was: %s.' "$(printf '%s' "$1" | cut -c1-140)"
  fi
}

# policy_emit_questions — every proposal that is neither ratified nor already asked becomes ONE question on
# the Director's phone (A1: ask_director policy …), options exactly "Make this a rule" (ratify P<n>) /
# "Not yet" (noop). Asked once, tracked in $POLICY_PROPOSALS — including P1, which was decided 2026-09-06 and
# never actually reached him (§D: "re-emitted as a question once, so it finally reaches him") — once, warranted or
# not. If ask_director is not loaded (desk-questions.sh absent, or a test), the proposal is printed instead and
# still marked asked only when the question was really written — printing is not asking.
# Titles/bodies are plain English for a phone (A1: "no jargon"): no ledger slug, SQL, regex or path in the title.
policy_emit_questions() {
  local id asked rule cls qcls chosen n dated action title body opts stop
  while IFS= read -r id && IFS= read -r asked && IFS= read -r rule && IFS= read -r cls && IFS= read -r qcls && IFS= read -r chosen \
        && IFS= read -r n && IFS= read -r dated && IFS= read -r action && IFS= read -r title && IFS= read -r body; do
    [ -n "$id" ] || continue
    [ "$asked" = 0 ] || continue
    if [ -z "$body" ]; then   # a learned proposal: say what stopped the wave, what he chose, what the rule would do
      stop=$(_policy_plain_stop "$cls")
      body="The wave stopped $n times on the same thing. $stop Each time you chose '$chosen' ($dated). If this becomes a rule, the wave will $action from now on and the receipt will say when it did. Nothing that deletes or drops data can ever become a rule."
    fi
    opts=$(PID="$id" python3 -c 'import json,os;print(json.dumps([
      {"label":"Make this a rule","description":"The wave applies this answer itself from the next run; the receipt says when it did.","writes":[{"op":"ratify","value":os.environ["PID"]}]},
      {"label":"Not yet","description":"Keep asking me each time. The proposal stays listed under --policy.","writes":[{"op":"noop"}]}]))')
    if type -t ask_director >/dev/null 2>&1; then
      # the question's class is the proposal KEY (sha1 prefix), never the ledger slug: two proposals of one freeze
      # class must be two questions under ask_director's kind+class+title de-dup (spec amendment, verifier NEW-10)
      ask_director policy "$qcls" "$title" "$body" "$opts" || { say "  policy: could not ask about $id ($rule) — will retry next run"; continue; }
      say "  policy: asked the Director about $id ($rule)"
    else
      say "  policy: proposal $id $rule — $title (desk not loaded; not sent as a question)"
      continue   # printing is not asking — stays un-asked until the desk is loaded
    fi
    python3 -c 'import json,sys,datetime;print(json.dumps({"id":sys.argv[1],"asked_at":datetime.datetime.now().strftime("%Y-%m-%d %H:%M")}))' "$id" >> "$POLICY_PROPOSALS"
  done < <(_policy_scan json | python3 -c '
import json, sys
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try: o = json.loads(line)
    except Exception: continue
    one = lambda v: " ".join(str(v).split())   # every field on exactly one line
    for f in (o["id"], 1 if o.get("asked") else 0, o["rule"], o["class"], o.get("qclass", ""), o.get("chosen", ""), o.get("n", ""),
              o.get("dated", ""), o.get("action_plain", ""), o["title"], o.get("body", "")):
        print(one(f))')
  return 0
}

policy_show() {
  echo "ratified policies:"
  if [ -s "$POLICY_LOG" ]; then python3 -c "
import json, sys
for l in open(sys.argv[1]):
    try: p = json.loads(l)
    except Exception: continue
    print('  %-4s %-34s %s — %s' % (p.get('id','?'), p.get('rule','?'), p.get('at','?'), p.get('evidence','')[:100]))" "$POLICY_LOG"
  else echo "  none"; fi
  echo; guards_list; echo; policy_proposals
}

policy_ratify() {  # $1 = P<n> — only a currently-proposed id can be ratified; the evidence is captured verbatim
  local id="$1" rule key="" ev
  case "$id" in
    P1) rule=AUTO_APPROVE_ADDITIVE_MIGRATIONS;;
    P[0-9]*)  # learned proposals (2026-09-10) keep their number — and their key — in $POLICY_PROPOSALS
      rule=$([ -s "$POLICY_PROPOSALS" ] && PID="$id" python3 -c '
import json,os,sys
rule=key=""
for l in open(sys.argv[1]):
    try: p=json.loads(l)
    except Exception: continue
    if isinstance(p,dict) and p.get("id")==os.environ["PID"] and p.get("rule"): rule=p["rule"]; key=p.get("key","")
print(rule); print(key)' "$POLICY_PROPOSALS")
      key=$(printf '%s\n' "$rule" | sed -n 2p); rule=$(printf '%s\n' "$rule" | sed -n 1p)
      [ -n "$rule" ] || { echo "unknown proposal: $id"; return 2; };;
    *) echo "unknown proposal: $id"; return 2;;
  esac
  ev=$(policy_proposals | grep -A2 "^  $id " | grep 'evidence:' | sed 's/^ *evidence: //')
  if [ -z "$ev" ]; then
    # P1 is listed as "P1?" while the wave's own bar is not met; a tap on its question lands here — say WHY it is
    # refused, not just that it is (verifier 2026-09-10: the first policy question he ever sees dead-ended mute)
    if [ "$id" = P1 ] && policy_proposals | grep -q "^  P1? "; then
      echo "P1 is proposed but not yet warranted (the wave's bar: ≥5 HELD merges and 0 migration-caused freezes) — nothing ratified; see: ship-wave.sh --policy"; return 1
    fi
    echo "$id is not currently proposed — see: ship-wave.sh --policy"; return 1
  fi
  python3 -c "
import json, sys, datetime
rec = {'id': sys.argv[1], 'rule': sys.argv[2], 'evidence': sys.argv[3], 'at': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'), 'by': 'Director'}
if sys.argv[4]: rec['key'] = sys.argv[4]
print(json.dumps(rec))" "$id" "$rule" "$ev" "$key" >> "$POLICY_LOG"
  touch "$POLICY_DIR/$rule"
  echo "ratified $id → $rule is active from the next run (evidence recorded in $POLICY_LOG)"
}

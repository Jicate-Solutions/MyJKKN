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
_policy_scan() {
  MODE="$1" PROPOSE_AFTER="$PROPOSE_AFTER" NEVER_RULE="$NEVER_RULE" python3 - "$LEDGER" "$POLICY_LOG" "$POLICY_PROPOSALS" <<'PY'
import json, sys, os, re, datetime
led, plog, pfile = sys.argv[1], sys.argv[2], sys.argv[3]
mode = os.environ["MODE"]
after = int(os.environ["PROPOSE_AFTER"])
never = re.compile(os.environ["NEVER_RULE"], re.I)
rounds, freezes, resolved = [], [], []
if os.path.exists(led):
    for line in open(led):
        try: r = json.loads(line)
        except Exception: continue
        o = r.get("outcome")
        if o in ("round", "backfill"): rounds.append(r)
        elif o == "froze": freezes.append(r)
        elif o == "resolved" and isinstance(r.get("writes"), list): resolved.append(r)
ratified = {}
if os.path.exists(plog):
    for line in open(plog):
        try: p = json.loads(line); ratified[p["rule"]] = p
        except Exception: pass
# the proposals file: {"id","rule","class","shape","proposed_at"} lines assign numbers; {"id","asked_at"} lines
# record that the question reached the desk. Merge by id, newest line wins per field.
props = {}
if os.path.exists(pfile):
    for line in open(pfile):
        try: p = json.loads(line)
        except Exception: continue
        props.setdefault(p["id"], {}).update(p)
by_rule = {p["rule"]: pid for pid, p in props.items() if "rule" in p}
def pnum(pid):
    try: return int(pid.lstrip("P").rstrip("?"))
    except ValueError: return 0
next_n = max([1] + [pnum(x) for x in props] + [pnum(p.get("id", "")) for p in ratified.values()]) + 1

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
if "AUTO_APPROVE_ADDITIVE_MIGRATIONS" not in ratified:
    ev = f"{held} HELD merges on record, {len(mig_freezes)} migration-caused freeze(s); every HELD approval so far was typed by hand"
    if held >= 5 and not mig_freezes:
        out.append({"id": "P1", "rule": "AUTO_APPROVE_ADDITIVE_MIGRATIONS", "class": "policy",
                    "text": "auto-approve HELD PRs whose ONLY hold reason is a migration (money/grade words, guards and workflows stay HELD; the destructive-SQL gate still refuses DROP/TRUNCATE/DELETE at apply time)",
                    "evidence": ev, "title": "Make it a rule: merge PRs whose only hold is an ordinary migration?",
                    "body": "You have approved every migration-only HELD PR by hand so far. " + ev + ". Ratifying lets the wave merge those on its own; drops, deletes, money and grade changes stay held for you."})
    else:
        out.append({"id": "P1?", "rule": "AUTO_APPROVE_ADDITIVE_MIGRATIONS", "class": "policy",
                    "text": "(not yet warranted — needs ≥5 HELD merges and 0 migration-caused freezes)", "evidence": ev})

# ── learned proposals (2026-09-10, §D): the same answer to the same freeze class PROPOSE_AFTER times ──
def shape_of(writes):  # same op + same file, value ignored → the SHAPE of a decision
    return sorted({(w.get("op", ""), w.get("file", "")) for w in writes if isinstance(w, dict)})
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
groups = {}
for r in resolved:
    groups.setdefault((r["class"], tuple(shape_of(r["writes"]))), []).append(r)
new_lines = []
for (cls, shape), recs in sorted(groups.items()):
    if len(recs) < after: continue
    hit = never.search(cls) or any(never.search(r.get("message", "")) for r in recs)
    if hit:
        skipped.append(f"{cls[:60]} — resolved {len(recs)}x the same way but matches NEVER_RULE ({hit.group(0)}): never a rule, stays with the Director")
        continue
    if all(op == "noop" for op, _ in shape):
        skipped.append(f"{cls[:60]} — resolved {len(recs)}x with 'noop' (kept stopped): nothing to automate")
        continue
    rule = f"AUTO_{class_name(cls)}_{action_name(shape)}"
    if rule in ratified: continue
    pid = by_rule.get(rule)
    if pid is None:
        pid = f"P{next_n}"; next_n += 1
        rec = {"id": pid, "rule": rule, "class": cls, "shape": [list(x) for x in shape],
               "proposed_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M")}
        props[pid] = rec; by_rule[rule] = pid; new_lines.append(rec)
    recs = sorted(recs, key=lambda r: r.get("at", ""))
    dated = " · ".join(f'{r.get("at","?")[:16]} "{r.get("chosen","?")}"' for r in recs[-max(after, 2):])
    ops = ", ".join(f"{op} {f}".strip() for op, f in shape)
    chosen = recs[-1].get("chosen", "the same option")
    out.append({"id": pid, "rule": rule, "class": cls, "text": f"when the wave freezes on '{cls[:70]}', apply '{chosen}' ({ops}) without asking",
                "evidence": f"resolved {len(recs)}x the same way: {dated}; writes: {ops}",
                "title": (f"New rule? You chose '{chosen}' {len(recs)} times for: {cls}")[:110],
                "body": f"Each time the wave stopped on '{cls[:90]}' you answered '{chosen}' ({dated}). If this becomes a rule the wave applies that answer itself ({ops}) and tells you in the receipt. Nothing that deletes or drops data can become a rule."})
if new_lines:
    with open(pfile, "a") as fh:
        for rec in new_lines: fh.write(json.dumps(rec) + "\n")

if mode == "json":
    for o in out:
        o["asked"] = bool(props.get(o["id"], {}).get("asked_at"))
        print(json.dumps(o))
    sys.exit()
for s_ in skipped: print(f"proposals: skipped {s_}")
if not out:
    print("proposals: none — every learnable rule is already ratified"); sys.exit()
print("proposals (ratify with: ship-wave.sh --ratify P<n>):")
for o in out:
    print(f"  {o['id']:<4} {o['rule']}\n       {o['text']}\n       evidence: {o['evidence']}")
PY
}

policy_proposals() { _policy_scan list; }   # evidence from the ledger → numbered proposals (prints only what the evidence supports)

# policy_emit_questions — every proposal that is neither ratified nor already asked becomes ONE question on
# the Director's phone (A1: ask_director policy …), options exactly "Make this a rule" (ratify P<n>) /
# "Not yet" (noop). Asked once, tracked in $POLICY_PROPOSALS — including P1, which was decided 2026-09-06 and
# never actually reached him (§D: "re-emitted as a question once, so it finally reaches him"). If ask_director
# is not loaded (desk-questions.sh absent, or a test), the proposal is printed instead and still marked asked
# only when the question was really written — printing is not asking.
policy_emit_questions() {
  local line id rule cls title body asked opts n=0
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    id=$(printf '%s' "$line" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
    case "$id" in *'?') continue;; esac          # P1? = not yet warranted, nothing to ask
    asked=$(printf '%s' "$line" | python3 -c 'import json,sys;print(1 if json.load(sys.stdin)["asked"] else 0)')
    [ "$asked" = 0 ] || continue
    rule=$(printf '%s' "$line" | python3 -c 'import json,sys;print(json.load(sys.stdin)["rule"])')
    cls=$(printf '%s' "$line" | python3 -c 'import json,sys;print(json.load(sys.stdin)["class"])')
    title=$(printf '%s' "$line" | python3 -c 'import json,sys;print(json.load(sys.stdin)["title"])')
    body=$(printf '%s' "$line" | python3 -c 'import json,sys;print(json.load(sys.stdin)["body"])')
    opts=$(PID="$id" python3 -c 'import json,os;print(json.dumps([
      {"label":"Make this a rule","description":"The wave applies this answer itself from the next run; the receipt says when it did.","writes":[{"op":"ratify","value":os.environ["PID"]}]},
      {"label":"Not yet","description":"Keep asking me each time. The proposal stays listed under --policy.","writes":[{"op":"noop"}]}]))')
    if type -t ask_director >/dev/null 2>&1; then
      ask_director policy "$cls" "$title" "$body" "$opts" || { say "  policy: could not ask about $id ($rule) — will retry next run"; continue; }
      say "  policy: asked the Director about $id ($rule)"
    else
      say "  policy: proposal $id $rule — $title (desk not loaded; not sent as a question)"
      continue   # printing is not asking — stays un-asked until the desk is loaded
    fi
    python3 -c 'import json,sys,datetime;print(json.dumps({"id":sys.argv[1],"asked_at":datetime.datetime.now().strftime("%Y-%m-%d %H:%M")}))' "$id" >> "$POLICY_PROPOSALS"
    n=$((n+1))
  done < <(_policy_scan json)
  return 0
}

policy_show() {
  echo "ratified policies:"
  if [ -s "$POLICY_LOG" ]; then python3 -c "
import json, sys
for l in open(sys.argv[1]):
    p = json.loads(l); print('  %-4s %-34s %s — %s' % (p['id'], p['rule'], p['at'], p.get('evidence','')[:100]))" "$POLICY_LOG"
  else echo "  none"; fi
  echo; guards_list; echo; policy_proposals
}

policy_ratify() {  # $1 = P<n> — only a currently-proposed id can be ratified; the evidence is captured verbatim
  local id="$1" rule ev
  case "$id" in
    P1) rule=AUTO_APPROVE_ADDITIVE_MIGRATIONS;;
    P[0-9]*)  # learned proposals (2026-09-10) keep their number in $POLICY_PROPOSALS
      rule=$([ -s "$POLICY_PROPOSALS" ] && PID="$id" python3 -c '
import json,os,sys
rule=""
for l in open(sys.argv[1]):
    try: p=json.loads(l)
    except Exception: continue
    if p.get("id")==os.environ["PID"] and p.get("rule"): rule=p["rule"]
print(rule)' "$POLICY_PROPOSALS")
      [ -n "$rule" ] || { echo "unknown proposal: $id"; return 2; };;
    *) echo "unknown proposal: $id"; return 2;;
  esac
  ev=$(policy_proposals | grep -A2 "^  $id " | grep 'evidence:' | sed 's/^ *evidence: //')
  [ -n "$ev" ] || { echo "$id is not currently proposed — see: ship-wave.sh --policy"; return 1; }
  python3 -c "
import json, sys, datetime
print(json.dumps({'id': sys.argv[1], 'rule': sys.argv[2], 'evidence': sys.argv[3], 'at': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'), 'by': 'Director'}))" "$id" "$rule" "$ev" >> "$POLICY_LOG"
  touch "$POLICY_DIR/$rule"
  echo "ratified $id → $rule is active from the next run (evidence recorded in $POLICY_LOG)"
}

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

GUARDS="${GUARDS_FILE:-$STATE/guards.tsv}"
POLICY_LOG="$STATE/policy.jsonl"
POLICY_DIR="$STATE/policy"; mkdir -p "$POLICY_DIR"

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

policy_proposals() {  # evidence from the ledger → numbered proposals (prints only what the evidence supports)
  python3 - "$LEDGER" "$POLICY_LOG" <<'PY'
import json, sys, os
led, plog = sys.argv[1], sys.argv[2]
rounds, freezes = [], []
if os.path.exists(led):
    for line in open(led):
        try: r = json.loads(line)
        except Exception: continue
        if r.get("outcome") in ("round", "backfill"): rounds.append(r)
        elif r.get("outcome") == "froze": freezes.append(r)
ratified = {}
if os.path.exists(plog):
    for line in open(plog):
        try: p = json.loads(line); ratified[p["rule"]] = p
        except Exception: pass
def total(key):
    t = 0
    for r in rounds:
        for tok in r["message"].split():
            if tok.startswith(key + "="):
                try: t += int(tok.split("=", 1)[1])
                except ValueError: pass
    return t
held = total("held")
# a migration-CAUSED freeze = the applied SQL itself failed; the two tooling classes (stale ref, dead workflow) are not that
# a migration-CAUSED freeze = the applied SQL itself failed. Tooling classes (stale ref, dead workflow) and the
# destructive-statement REFUSAL (the gate doing its job, later allowed by hand) are not evidence against P1.
mig_freezes = [f for f in freezes if "migration" in f["class"]
               and "files on jicate main match" not in f["class"] and "apply failed run" not in f["class"]
               and "destructive statement" not in f["class"]]
out = []
if "AUTO_APPROVE_ADDITIVE_MIGRATIONS" not in ratified:
    ev = f"{held} HELD merges on record, {len(mig_freezes)} migration-caused freeze(s); every HELD approval so far was typed by hand"
    if held >= 5 and not mig_freezes:
        out.append(("P1", "AUTO_APPROVE_ADDITIVE_MIGRATIONS",
                    "auto-approve HELD PRs whose ONLY hold reason is a migration (money/grade words, guards and workflows stay HELD; the destructive-SQL gate still refuses DROP/TRUNCATE/DELETE at apply time)", ev))
    else:
        out.append(("P1?", "AUTO_APPROVE_ADDITIVE_MIGRATIONS", "(not yet warranted — needs ≥5 HELD merges and 0 migration-caused freezes)", ev))
if not out:
    print("proposals: none — every learnable rule is already ratified"); sys.exit()
print("proposals (ratify with: ship-wave.sh --ratify P<n>):")
for pid, rule, text, ev in out:
    print(f"  {pid:<4} {rule}\n       {text}\n       evidence: {ev}")
PY
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

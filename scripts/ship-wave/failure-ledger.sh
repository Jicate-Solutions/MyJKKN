#!/bin/bash
# failure-ledger.sh — what the wave has already learned the hard way.
#
# Why this exists (Director, 2026-09-05): W12 had durable memory of its POSITION
# (approve-held, dispatched, last-open-count, the FROZEN latch) but none of its
# OUTCOMES. It froze on the stale-ref bug at 22:32 and would have frozen
# identically the hundredth time; it burned six goal rounds on a two-second
# network blip. Every fix came from a human reading a receipt. Thirty run
# directories of plan data sat on disk and nothing ever read them again.
#
# This file is the smallest thing that changes that: an append-only record of
# every freeze and every round outcome, keyed by a CAUSE-CLASS rather than the
# raw message, plus the remedies already paid for. On the next freeze the wave
# says what it cost last time and what fixed it, instead of stopping mute.
#
# It deliberately does not act on its own. A ledger that silently retries is a
# ledger you cannot audit; this one reports, and the remedies it names are the
# ones a human already verified. Sourced by ship-wave.sh.

LEDGER="${LEDGER:-$STATE/failure-ledger.jsonl}"

# ledger_class <free text> → a stable slug
# Freeze messages carry PR numbers, 14-digit migration stamps, deploy ids and run
# ids. Those make every incident look unique — which is exactly what stops a
# ledger from ever matching anything. Strip the identifiers, keep the shape.
ledger_class() {
  printf '%s' "$1" \
    | sed -E 's/[0-9]{14}/VERSION/g' \
    | sed -E 's/#[0-9]+/PR/g' \
    | sed -E 's/dpl_[A-Za-z0-9]+/DEPLOY/g' \
    | sed -E 's/[0-9]+/N/g' \
    | sed -E 's/[^A-Za-z ]+/ /g; s/  +/ /g; s/^ +//; s/ +$//' \
    | tr 'A-Z' 'a-z' \
    | cut -c1-90
}

# ledger_record <outcome> <message> [class]
# outcome: froze | round | resolved
ledger_record() {
  local outcome="$1" msg="$2" cls="${3:-}"
  [ -n "$cls" ] || cls=$(ledger_class "$msg")
  OUT="$outcome" MSG="$msg" CLS="$cls" python3 - "$LEDGER" <<'PY' 2>/dev/null || true
import json, os, sys, datetime
rec = {
    "at": datetime.datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S"),
    "outcome": os.environ["OUT"],
    "class": os.environ["CLS"],
    "message": os.environ["MSG"][:400],
}
with open(sys.argv[1], "a") as fh:
    fh.write(json.dumps(rec) + "\n")
PY
}

# ledger_count <class> → how many times this cause-class has ALREADY frozen the wave
ledger_count() {
  [ -s "$LEDGER" ] || { echo 0; return; }
  CLS="$1" python3 - "$LEDGER" <<'PY' 2>/dev/null || echo 0
import json, os, sys
cls = os.environ["CLS"]
n = 0
for line in open(sys.argv[1]):
    try: r = json.loads(line)
    except Exception: continue
    if r.get("outcome") == "froze" and r.get("class") == cls:
        n += 1
print(n)
PY
}

# ledger_remedy <class> → prints the verified remedy, or returns 1 if none is known.
# Every line here was paid for by a real incident. Add one only after a human
# confirmed the fix actually worked — a guessed remedy is worse than none.
ledger_remedy() {
  case "$1" in
    *"files on jicate main match"*)
      echo "fetch jicate/main before resolving the file — the ref is one commit stale in the seconds right after a merge (fixed 2026-09-05, apply-migrations.sh)";;
    *"gh not authenticated"*)
      echo "gh auth status makes a live API call, so one network blip reads as a lost login — retry 3x with backoff before believing it (fixed 2026-09-05, ship-wave.sh)";;
    *"migration apply failed run"*)
      echo "the GitHub 'Apply Supabase migrations' workflow can NEVER apply here — prod history holds 1,616 versions with no repo files, so db push refuses. Use the Management API per file (replaced 2026-09-05)";;
    *"broken page"*|*"harness"*|*"persona"*)
      echo "a harness that cannot sign in is 'L1 unavailable', NOT a broken page — never freeze on it (fixed 2026-09-05, commit 4c27c077)";;
    *"deploy deploy canceled"*)
      echo "CANCELED with no errorCode = Vercel's ignoreCommand skipped a build with nothing deployable (every merged file under supabase/ docs/ specs/ .claude/ .github/ or *.md). NOT a failed deploy — production is still on the right code and the migration was applied in 3b. Check the merged files, then --unfreeze (fixed 2026-09-05: the deploy stage now detects this before firing the hook)";;
    *"verdict unavailable"*|*"unverified"*)
      echo "the Vercel CLI token (auth.json) expires; only the CLI refreshes it. vtok() now runs 'vercel whoami' when expiresAt is near — if you still see this, run it by hand and verify the build with 'vercel ls my-jkkn --scope jicate-solutions' before re-firing (2026-09-06 01:53: build was fine, poll was blind)";;
    *"destructive statement"*)
      echo "the apply stage refuses DROP TABLE/COLUMN/SCHEMA, TRUNCATE, DELETE FROM by hard rule — often a retention DELETE inside a function the same file creates (20260910030000_cron_run_log, 2026-09-06). Review the file; if safe: echo <version> >> \$STATE/allow-destructive, then --unfreeze; the wave applies it (dry-run → commit → verify) and logs the allow";;
    *"base is not main"*|*"stacked"*)
      echo "never merge a PR whose base is not main — it lands someone else's commits. List it, leave it to its author (fixed 2026-09-05)";;
    *) return 1;;
  esac
}

# ledger_on_freeze <raw freeze message> — what freeze() calls. Records, then says
# what this cost last time. Reporting only; it never decides to continue.
ledger_on_freeze() {
  local cls seen rem
  cls=$(ledger_class "$1")
  seen=$(ledger_count "$cls")
  ledger_record froze "$1" "$cls"
  if rem=$(ledger_remedy "$cls"); then
    if [ "${seen:-0}" -gt 0 ]; then
      say "  ledger: this cause has frozen the wave ${seen}x before. Known remedy: $rem"
    else
      say "  ledger: first time for this cause here, but the remedy is on record: $rem"
    fi
  elif [ "${seen:-0}" -gt 0 ]; then
    say "  ledger: this cause-class has frozen the wave ${seen}x before and STILL has no recorded remedy — that is the one worth fixing."
  else
    say "  ledger: new cause-class, no remedy on record. If you fix it, add it to ledger_remedy() so the next run is not blind."
  fi
}

# ledger_report — read-only summary: throughput per round, and repeat offenders.
# Merges-per-round trending to zero is how a structural stall (one append-only
# file re-conflicting every sibling) shows up before anyone notices by hand.
ledger_report() {
  if [ ! -s "$LEDGER" ]; then echo "failure ledger is empty: $LEDGER"; return 0; fi
  python3 - "$LEDGER" <<'PY'
import json, sys, collections
rounds, freezes = [], collections.Counter()
first, last = {}, {}
for line in open(sys.argv[1]):
    try: r = json.loads(line)
    except Exception: continue
    if r.get("outcome") == "round":
        rounds.append(r)
    elif r.get("outcome") == "froze":
        c = r["class"]; freezes[c] += 1
        first.setdefault(c, r["at"]); last[c] = r["at"]
print("=== W12 failure ledger ===")
print()
print("Freezes by cause-class (most repeated first):")
if not freezes:
    print("  none recorded")
for c, n in freezes.most_common():
    print("  %2dx  %s" % (n, c[:78]))
    print("       first %s · last %s" % (first[c], last[c]))
print()
print("Round outcomes (newest last) — merges trending to 0 means a structural stall:")
for r in rounds[-12:]:
    print("  %s  %s" % (r["at"], r["message"][:96]))
if not rounds:
    print("  none recorded")
PY
}

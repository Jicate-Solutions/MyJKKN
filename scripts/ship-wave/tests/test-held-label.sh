#!/opt/homebrew/bin/bash
# tests/test-held-label.sh — regression proof: an owner's explicit hold is HELD, whatever the path/word rules say.
# 2026-09-28 11:00: #4078 ("fix(attendance): a saved practical / specialisation hour shows as marked … [HELD]",
# label held-for-director) was rated NORMAL — "marked" is not the whole word "mark", and attendance paths carry
# no money/grade segment — so the 10:23 --approve-normal wave reached its merge step. The W12 desk converted it
# to draft seconds before; the wave logged "HOLD NORMAL #4078 — state now … (changed since sweep), not merging".
# classify() now reads the label (fetched by sweep's gh pr list) and a "[HELD]" title tag, first in the reasons.
#
# Run from the worktree root:  bash scripts/ship-wave/tests/test-held-label.sh
# Harness as in test-advisory-pending.sh part 1: the REAL classify() on a prs.json fixture, gh stubbed, temp HOME.
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"

ROOT=$(cd "$(dirname "$0")/../../.." && pwd); SW="$ROOT/scripts/ship-wave"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-heldlabel.XXXXXX")
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'FAIL  %s\n      %s\n' "$1" "${2:-}"; }

awk '/^if \[ -n "\$GOAL" \]; then$/ {exit} {print}' "$SW/ship-wave.sh" > "$TMP/wave.sh"
for f in "$SW"/*.sh "$SW"/*.py; do [ "$(basename "$f")" = ship-wave.sh ] || ln -s "$f" "$TMP/$(basename "$f")"; done
grep -q '^classify() {' "$TMP/wave.sh" || { echo "FAIL  could not extract classify from ship-wave.sh"; exit 1; }
grep -q 'updatedAt,labels >' "$SW/ship-wave.sh" || bad "sweep fetches labels" "gh pr list --json no longer asks for labels"

python3 - "$TMP/prs.json" <<'PY'
import json, sys, datetime
old = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=6)).isoformat().replace("+00:00", "Z")
green = [{"name": "TypeCheck (PR-scoped)", "status": "COMPLETED", "conclusion": "SUCCESS"}]
def pr(n, title, labels=(), files=("lib/services/academic/faculty-attendance-service.ts",)):
    return {"number": n, "title": title, "mergeStateStatus": "CLEAN", "reviewDecision": "", "isDraft": False,
            "headRefName": f"b{n}", "baseRefName": "main", "updatedAt": old, "headCommittedAt": old,
            "labels": [{"name": l} for l in labels], "files": [{"path": f} for f in files], "statusCheckRollup": green}
MIG = ("supabase/migrations/20270101000000_thing.sql",)
json.dump([
  pr(201, "fix(attendance): a saved practical hour shows as marked [HELD]", ["held-for-director"]),  # the #4078 shape
  pr(202, "fix(attendance): a saved practical hour shows as marked", ["held-for-director"]),         # label only
  pr(203, "fix(attendance): a saved practical hour shows as marked [HELD]"),                         # title tag only
  pr(204, "fix(attendance): a saved practical hour shows as marked"),                                # control: NORMAL
  pr(205, "fix(x): widen a policy", ["held-for-director"], MIG),                                      # label + migration
  pr(206, "fix(x): widen a policy", [], MIG),                                                         # control: migration only
  pr(207, "fix(attendance): a break slot", ["visual-proof-skip"]),                                    # other label: NORMAL
], open(sys.argv[1], "w"))
PY

S="$TMP/run"; mkdir -p "$S/home/.config/obsidian/.ship-wave" "$S/out"
(
  export HOME="$S/home"; cd "$ROOT" || exit 9
  set -- plan
  . "$TMP/wave.sh" >/dev/null 2>&1
  gh() { return 0; }; sleep() { :; }; ask_director() { :; }
  classify "$TMP/prs.json" "$S/out/plan.json" > "$S/classify.txt" 2>&1
)
[ -s "$S/out/plan.json" ] || { echo "FAIL  classify wrote no plan"; sed -n 1,20p "$S/classify.txt"; exit 1; }

row() {  # <n> → "<tier>|<reasons joined by ;>" or "nowhere"
  python3 - "$S/out/plan.json" "$1" <<'PY'
import json, sys
p = json.load(open(sys.argv[1])); n = int(sys.argv[2])
for t in ("LOW", "NORMAL", "HELD"):
    for r in p["ready"][t]:
        if r["number"] == n: print(t + "|" + ";".join(r.get("tier_reasons") or [])); raise SystemExit
print("nowhere")
PY
}
expect() {  # <name> <n> <tier> [reason substring]
  local got; got=$(row "$2")
  if [ "${got%%|*}" = "$3" ] && { [ -z "${4:-}" ] || [[ "$got" == *"$4"* ]]; }; then ok "$1"; else bad "$1" "got: $got"; fi
}
expect "#4078 shape (label + [HELD] tag) is HELD, label named"   201 HELD "label: held-for-director"
expect "held-for-director label alone is HELD"                    202 HELD "label: held-for-director"
expect "[HELD] title tag alone is HELD"                           203 HELD "title: [HELD]"
expect "control: same PR with no hold marker stays NORMAL"        204 NORMAL
expect "label + migration: HELD with the label reason FIRST"      205 HELD "label: held-for-director;migration:"
expect "control: migration-only stays HELD on the migration only" 206 HELD "migration: supabase/migrations/"
expect "an unrelated label changes nothing"                       207 NORMAL

# policy P1 auto-approves a HELD PR only when EVERY reason is a migration — the label must defeat that
p1=$(python3 -c "import json;p=json.load(open('$S/out/plan.json'));print(' '.join(str(r['number']) for r in p['ready']['HELD'] if r['tier_reasons'] and all(x.startswith('migration: supabase/migrations/') for x in r['tier_reasons'])))")
[ "$p1" = "206" ] && ok "P1 auto-approves #206 (migration only) and NOT #205 (labelled)" || bad "P1 selection" "got: '$p1'"

rm -rf "$TMP"
echo "---- $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]

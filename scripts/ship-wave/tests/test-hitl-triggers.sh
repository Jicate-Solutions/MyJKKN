#!/opt/homebrew/bin/bash
# tests/test-hitl-triggers.sh — proof for the integrator's wiring of HUMAN-IN-THE-LOOP.md into ship-wave.sh:
#   (b) ONE question per ready HELD PR (spec amendment): title "Approve #<n>? <PR title ≤60>", class "<n>-<7-char sha>",
#       options "Approve #<n>" (append approve-held <n>) / "Not now" (noop); asked only when no open question for that PR,
#       not re-asked after an answer until the head sha changes; never for an already-approved PR; never in plan mode
#   (c) after policy_proposals: policy_emit_questions — a learned proposal reaches the desk as a kind=policy question
#   (d) the receipt surfaces the desk's answers a human must read: chosen=="other" as 'Director wrote: …', a tap whose
#       writes did not apply as 'Director tapped … — nothing applied: <reason>' — each once
#   (e) approve-held hygiene: numbers whose PR is no longer open are dropped and named; never when the open list is unreadable
#       or at gh's 200 limit; plan mode only says what it would drop
#   (f) the receipt says 'desk silent since HH:MM' when questions wait unanswered
#
# Run from the worktree root:  bash scripts/ship-wave/tests/test-hitl-triggers.sh
# Harness as test-freeze-classes.sh — a copy of ship-wave.sh without its dispatcher is SOURCED — but ask_director is the
# REAL slice-A writer (desk-questions.sh) and answers go through the REAL desk (desk/v5-w12-desk.sh), all under a temp
# HOME/STATE per case. gh / curl are recording stubs. PASS/FAIL per case; exit 1 on any FAIL.
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"

ROOT=$(cd "$(dirname "$0")/../../.." && pwd); SW="$ROOT/scripts/ship-wave"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-triggers.XXXXXX")
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf 'FAIL  %s\n      %s\n' "$1" "${2:-}"; }
check() { if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1" "$3"; fi; }
has()    { grep -qF -- "$2" "$1"; }
hasnot() { ! grep -qF -- "$2" "$1"; }

awk '/^if \[ -n "\$GOAL" \]; then$/ {exit} {print}' "$SW/ship-wave.sh" > "$TMP/wave.sh"
for f in "$SW"/*.sh "$SW"/*.py; do [ "$(basename "$f")" = ship-wave.sh ] || ln -s "$f" "$TMP/$(basename "$f")"; done
grep -q '^run_once() {' "$TMP/wave.sh" || { echo "FAIL  could not extract run_once from ship-wave.sh"; exit 1; }
[ -f "$SW/desk-questions.sh" ] && [ -x "$SW/desk/v5-w12-desk.sh" ] || { echo "FAIL  desk-questions.sh / desk/v5-w12-desk.sh missing"; exit 1; }

export MYJKKN_LOCAL="$TMP/local"; WTDIR="$MYJKKN_LOCAL/.claude/worktrees/ship-main"
git init -q --bare "$TMP/origin.git"; mkdir -p "$(dirname "$WTDIR")"
git clone -q -o jicate "$TMP/origin.git" "$WTDIR" 2>/dev/null
gitc() { git -C "$WTDIR" -c user.name=t -c user.email=t@t "$@"; }
mkdir -p "$WTDIR/docs"; echo "# 0" > "$WTDIR/docs/zero.md"; gitc add -A >/dev/null; gitc commit -q -m genesis; gitc push -q jicate HEAD:main 2>/dev/null

LONG="fix(fees): recompute the hostel fee ledger when a refund is reversed after the semester closes"   # 94 chars
SHA3A=aaaaaaa1111111111111111111111111111111111; SHA3B=bbbbbbb2222222222222222222222222222222222; SHA4=ccccccc3333333333333333333333333333333333

# wave <home> <label> <args…> — one run_once in <home>; env READY_HELD="n n", OPEN="n n" (light.json), SHA_<n>, NO_PRJSON=1
wave() {
  local H="$1" label="$2"; shift 2
  mkdir -p "$H/.config/obsidian/.ship-wave"
  (
    export HOME="$H"; cd "$ROOT" || exit 9
    TRACE="$H/trace-$label.txt"; : > "$TRACE"; export TRACE WTDIR LONG
    set -- "$@"
    . "$TMP/wave.sh" >/dev/null 2>&1
    type -t ask_director >/dev/null || { echo "DESK_NOT_SOURCED" >> "$TRACE"; exit 9; }
    sweep() {
      READY_HELD="${READY_HELD:-}" OPEN="${OPEN:-}" NO_PRJSON="${NO_PRJSON:-}" python3 - "$1" <<'PY'
import json, os, sys
d = sys.argv[1]; os.makedirs(f"{d}/pr", exist_ok=True)
held = [int(x) for x in os.environ["READY_HELD"].split()]
rows = []
for n in held:
    rows.append({"number": n, "title": os.environ["LONG"] if n == 3 else f"feat(grades): pr {n}", "branch": f"b{n}", "tier": "HELD",
                 "tier_reasons": ["path: app/api/fees/route.ts"], "ci": "OK", "ci_names": [], "state": "CLEAN",
                 "files": ["app/api/fees/route.ts"], "age_min": 90, "base": "main"})
    if not os.environ["NO_PRJSON"]:
        json.dump({"number": n, "files": [], "statusCheckRollup": [], "commits": [{"oid": "0" * 40}, {"oid": os.environ.get(f"SHA_{n}", "d" * 40)}]}, open(f"{d}/pr/{n}.json", "w"))
json.dump([{"number": int(x)} for x in os.environ["OPEN"].split()], open(f"{d}/light.json", "w"))
json.dump({"stacked": [], "draft": [], "conflicted": [], "blocked": [], "waiting_ci": [], "quiet_wait": [],
           "ready": {"LOW": [], "NORMAL": [], "HELD": rows}, "clusters": {},
           "counts": {"open": len(held), "ready": len(held), "ready_low": 0, "ready_normal": 0, "ready_held": len(held), "conflicted": 0,
                      "blocked": 0, "waiting_ci": 0, "quiet_wait": 0, "draft": 0, "stacked": 0, "clusters": 0}}, open(f"{d}/plan.json", "w"))
PY
    }
    unblock_lanes() { :; }; dispatch_clusters() { :; }; alive_helpers() { printf 0; }; rebase_remaining() { return 0; }
    apply_migrations() { APPLY_RESULT="stubbed"; return 0; }
    vtok() { printf ''; }; sleep() { :; }
    gh() {
      echo "gh $*" >> "$TRACE"
      case "$*" in
        "auth token"|"auth status") return 0;;
        *"--json headRefOid"*) echo "eeeeeee4444444444444444444444444444444444";;
        *"--json state,mergeStateStatus"*) echo "OPEN DIRTY false main";;   # nothing merges in these cases
        *"pr list"*) echo 0;;
      esac; return 0
    }
    curl() { echo "curl $*" >> "$TRACE"; echo '{}'; return 0; }
    _REDIR_DONE=1
    run_once > "$H/receipt-$label.txt" 2>&1; echo "rc=$?" >> "$TRACE"
  )
}
QD() { printf '%s' "$1/.config/obsidian/.ship-wave/questions"; }
held_files() { grep -l '"kind": "held"' "$(QD "$1")"/q-*.json 2>/dev/null; }
count_held() { held_files "$1" | grep -c .; }
qfield() { python3 -c 'import json,sys;q=json.load(open(sys.argv[1]));print(eval(sys.argv[2],{"q":q}))' "$1" "$2"; }
desk() { STATE="$1/.config/obsidian/.ship-wave" FLEET_MD="$1/Fleet.md" HOME="$1" "$SW/desk/v5-w12-desk.sh" "${@:2}"; }

echo "── (b) one question per ready HELD PR ──"
H="$TMP/b"
READY_HELD="3 4" OPEN="3 4" SHA_3=$SHA3A SHA_4=$SHA4 wave "$H" r1 go
check "b0 harness: the real desk channel was sourced and run_once returned 0" $(hasnot "$H/trace-r1.txt" DESK_NOT_SOURCED && has "$H/trace-r1.txt" "rc=0"; echo $?) "$(tail -3 "$H/receipt-r1.txt")"
check "b1 two ready HELD PRs → exactly two held question files" $([ "$(count_held "$H")" -eq 2 ]; echo $?) "$(ls "$(QD "$H")")"
Q3=$(grep -l '"class": "3-aaaaaaa"' $(held_files "$H") 2>/dev/null | head -1)
check "b2 #3's class is '<n>-<7-char head sha>' = 3-aaaaaaa" $([ -n "$Q3" ]; echo $?) "$(for f in $(held_files "$H"); do qfield "$f" 'q["class"]'; done)"
check "b3 title = 'Approve #3? ' + the PR title cut to 60 characters" $([ "$(qfield "$Q3" 'q["title"]')" = "$(printf 'Approve #3? %s' "${LONG:0:60}" | sed 's/ *$//')" ]; echo $?) "got: $(qfield "$Q3" 'q["title"]')"
check "b4 options exactly: 'Approve #3' → append approve-held 3 · 'Not now' → noop" $(qfield "$Q3" '[(o["label"],o["writes"]) for o in q["options"]]==[("Approve #3",[{"op":"append","file":"approve-held","value":"3"}]),("Not now",[{"op":"noop"}])]' | grep -qx True; echo $?) "$(qfield "$Q3" 'q["options"]')"
check "b5 the recommended option is 'Not now' (the one that changes nothing)" $([ "$(qfield "$Q3" 'q["recommended"]')" = 1 ]; echo $?) "$(qfield "$Q3" 'q["recommended"]')"
check "b6 the desk accepts it: 'pending' lists both questions" $([ "$(desk "$H" pending | python3 -c 'import json,sys;print(sum(1 for q in json.load(sys.stdin) if q["kind"]=="held"))')" -eq 2 ]; echo $?) "$(desk "$H" pending 2>&1 | head -5)"
READY_HELD="3 4" OPEN="3 4" SHA_3=$SHA3A SHA_4=$SHA4 wave "$H" r2 go
check "b7 the next run with the same PRs asks nothing new and refreshes nothing (no open question is re-asked)" $([ "$(count_held "$H")" -eq 2 ] && [ "$(awk -F'\t' '$2=="asked" && $4=="held"' "$(QD "$H")/../questions.log" | grep -c .)" -eq 2 ] && [ "$(awk -F'\t' '$2=="refreshed" && $4=="held"' "$(QD "$H")/../questions.log" | grep -c .)" -eq 0 ]; echo $?) "$(cat "$(QD "$H")/../questions.log")"
ID3=$(basename "$Q3" .json)
desk "$H" answer "$ID3" 1 >/dev/null 2>&1
READY_HELD="3 4" OPEN="3 4" SHA_3=$SHA3A SHA_4=$SHA4 wave "$H" r3 go
check "b8 #3 answered 'Not now' → not re-asked while its head sha is unchanged" $([ -f "$(QD "$H")/answered/$ID3.json" ] && [ "$(grep -l '"class": "3-' "$(QD "$H")"/q-*.json 2>/dev/null | grep -c .)" -eq 0 ]; echo $?) "$(ls "$(QD "$H")" "$(QD "$H")/answered")"
READY_HELD="3 4" OPEN="3 4" SHA_3=$SHA3B SHA_4=$SHA4 wave "$H" r4 go
check "b9 #3 gets a new commit → asked again under class 3-bbbbbbb" $(grep -l '"class": "3-bbbbbbb"' "$(QD "$H")"/q-*.json >/dev/null 2>&1; echo $?) "$(for f in "$(QD "$H")"/q-*.json; do qfield "$f" 'q["class"]'; done)"
H="$TMP/b-approved"; printf '4\n' > /dev/null
mkdir -p "$H/.config/obsidian/.ship-wave"; printf '4\n' > "$H/.config/obsidian/.ship-wave/approve-held"
READY_HELD="3 4" OPEN="3 4" SHA_3=$SHA3A SHA_4=$SHA4 wave "$H" r1 go
check "b10 a PR already in approve-held is not asked about (it merges on this run)" $([ "$(count_held "$H")" -eq 1 ] && grep -l '"class": "3-aaaaaaa"' "$(QD "$H")"/q-*.json >/dev/null 2>&1; echo $?) "$(for f in $(held_files "$H"); do qfield "$f" 'q["class"]'; done)"
H="$TMP/b-plan"
READY_HELD="3 4" OPEN="3 4" SHA_3=$SHA3A SHA_4=$SHA4 wave "$H" r1 plan
check "b11 plan mode asks nothing (0 held question files)" $([ "$(count_held "$H")" -eq 0 ] && has "$H/trace-r1.txt" "rc=0"; echo $?) "$(ls "$(QD "$H")" 2>&1)"
H="$TMP/b-nopr"
NO_PRJSON=1 READY_HELD="3" OPEN="3" wave "$H" r1 go
check "b12 no hydrated pr/<n>.json → the head sha comes from gh headRefOid (class 3-eeeeeee)" $(grep -l '"class": "3-eeeeeee"' "$(QD "$H")"/q-*.json >/dev/null 2>&1 && has "$H/trace-r1.txt" "--json headRefOid"; echo $?) "$(ls "$(QD "$H")" 2>&1)"

echo "── (c) policy_emit_questions after policy_proposals ──"
H="$TMP/c"; mkdir -p "$H/.config/obsidian/.ship-wave"
( export STATE="$H/.config/obsidian/.ship-wave" LEDGER="$H/.config/obsidian/.ship-wave/failure-ledger.jsonl"
  say() { :; }; . "$SW/failure-ledger.sh"
  cls="peer hold on PR by reviewer"
  ledger_record froze "peer hold on #3410 by reviewer" "$cls"
  ledger_record resolved "desk: paused → Lift the stop" "$cls" '{"chosen":"Lift the stop","writes":[{"op":"unfreeze"}]}'
  ledger_record resolved "desk: paused → Lift the stop" "$cls" '{"chosen":"Lift the stop","writes":[{"op":"unfreeze"}]}' )
READY_HELD="" OPEN="" wave "$H" r1 go
PQ=$(grep -l '"kind": "policy"' "$(QD "$H")"/q-*.json 2>/dev/null | xargs grep -l '"op": "ratify"' 2>/dev/null | head -1)
check "c1 two identical resolutions → a kind=policy question with a ratify option is on the desk" $([ -n "$PQ" ]; echo $?) "$(ls "$(QD "$H")" 2>&1); $(grep -iE 'polic|proposal' "$H/receipt-r1.txt")"
check "c2 … and the receipt shows the proposals and says it asked" $(has "$H/receipt-r1.txt" "proposals" && has "$H/receipt-r1.txt" "policy: asked the Director about"; echo $?) "$(grep -iE 'polic|proposal' "$H/receipt-r1.txt")"
N1=$(grep -l '"kind": "policy"' "$(QD "$H")"/q-*.json 2>/dev/null | grep -c .)
READY_HELD="" OPEN="" wave "$H" r2 go
check "c3 the next run does not ask the same proposal again" $([ "$(grep -l '"kind": "policy"' "$(QD "$H")"/q-*.json 2>/dev/null | grep -c .)" -eq "$N1" ] && hasnot "$H/receipt-r2.txt" "policy: asked the Director about"; echo $?) "$(grep -iE 'policy:' "$H/receipt-r2.txt")"
H="$TMP/c-plan"; mkdir -p "$H/.config/obsidian/.ship-wave"; cp "$TMP/c/.config/obsidian/.ship-wave/failure-ledger.jsonl" "$H/.config/obsidian/.ship-wave/"
READY_HELD="" OPEN="" wave "$H" r1 plan
check "c4 plan mode: no policy question, no proposal numbering written" $([ "$(ls "$(QD "$H")"/q-*.json 2>/dev/null | grep -c .)" -eq 0 ] && [ ! -e "$H/.config/obsidian/.ship-wave/policy-proposals.jsonl" ]; echo $?) "$(ls "$H/.config/obsidian/.ship-wave")"

echo "── (d) the receipt surfaces 'other' answers and taps that applied nothing ──"
mk_answered() {  # $1 home $2 id $3 json-extra
  local d; d="$(QD "$1")/answered"; mkdir -p "$d"
  ID="$2" EXTRA="$3" python3 -c 'import json,os,sys
q={"id":os.environ["ID"],"asked_at":"2026-09-11T09:00:00+05:30","kind":"freeze","class":"x","title":"The ship wave stopped: production or main may be broken","body":"b",
   "options":[{"label":"Keep it stopped","description":"d","writes":[{"op":"noop"}]},{"label":"Lift the stop","description":"d","writes":[{"op":"unfreeze"}]}],"recommended":0,"expires_after_h":48}
q.update(json.loads(os.environ["EXTRA"])); json.dump(q,open(sys.argv[1],"w"))' "$d/$2.json"
}
H="$TMP/d"; mkdir -p "$H/.config/obsidian/.ship-wave"
mk_answered "$H" q-20260911-090000-freeze-a-0001 '{"answered_at":"2026-09-11T09:10:00+05:30","chosen":"other","other_text":"Wait for Kavin to finish the fee migration, then lift it.","applied":[]}'
mk_answered "$H" q-20260911-090100-freeze-b-0002 '{"answered_at":"2026-09-11T09:11:00+05:30","chosen":"Lift the stop","chosen_index":1,"applied":["unfreeze REFUSED — the stop changed since this question was asked"],"failed":1}'
mk_answered "$H" q-20260911-090200-freeze-c-0003 '{"answered_at":"2026-09-11T09:12:00+05:30","chosen":"Keep it stopped","chosen_index":0,"applied":["noop"]}'
READY_HELD="" OPEN="" wave "$H" p1 plan
check "d1 plan: 'Director wrote: <text>' is in the receipt" $(grep -qF "Director wrote" "$H/receipt-p1.txt" && has "$H/receipt-p1.txt" "Wait for Kavin to finish the fee migration, then lift it."; echo $?) "$(grep -i director "$H/receipt-p1.txt")"
check "d2 plan: 'Director tapped … — nothing applied: <reason>' is in the receipt" $(grep -qE "Director tapped 'Lift the stop' .* — nothing applied: unfreeze REFUSED — the stop changed" "$H/receipt-p1.txt"; echo $?) "$(grep -i director "$H/receipt-p1.txt")"
check "d3 an answer that applied is not surfaced as refused" $(! grep -q "Director tapped 'Keep it stopped'" "$H/receipt-p1.txt"; echo $?) "$(grep -i director "$H/receipt-p1.txt")"
READY_HELD="" OPEN="" wave "$H" g1 go
check "d4 plan did not mark them read — the first go shows both again" $(grep -qF "Director wrote" "$H/receipt-g1.txt" && grep -qF "Director tapped 'Lift the stop'" "$H/receipt-g1.txt"; echo $?) "$(grep -i director "$H/receipt-g1.txt")"
READY_HELD="" OPEN="" wave "$H" g2 go
check "d5 a go run shows each once: the next go shows neither" $(! grep -qE "Director (wrote|tapped)" "$H/receipt-g2.txt"; echo $?) "$(grep -i director "$H/receipt-g2.txt")"

echo "── (e) approve-held hygiene ──"
AH() { printf '%s' "$1/.config/obsidian/.ship-wave/approve-held"; }
H="$TMP/e"; mkdir -p "$H/.config/obsidian/.ship-wave"; printf '3\n77, 81\n' > "$(AH "$H")"
READY_HELD="" OPEN="3 4 5" wave "$H" p1 plan
check "e1 plan: says it would drop #77 #81, file untouched" $(grep -qE 'approve-held: would drop #77 #81' "$H/receipt-p1.txt" && [ "$(cat "$(AH "$H")")" = "$(printf '3\n77, 81')" ]; echo $?) "$(grep approve-held "$H/receipt-p1.txt"); file: $(cat "$(AH "$H")")"
READY_HELD="" OPEN="3 4 5" wave "$H" g1 go
check "e2 go: #77 #81 dropped and named, #3 kept" $(grep -qE 'approve-held: dropped #77 #81' "$H/receipt-g1.txt" && [ "$(grep -c . "$(AH "$H")")" -eq 1 ] && grep -qx 3 "$(AH "$H")"; echo $?) "$(grep approve-held "$H/receipt-g1.txt"); file: $(cat "$(AH "$H")")"
H="$TMP/e-limit"; mkdir -p "$H/.config/obsidian/.ship-wave"; printf '3\n999\n' > "$(AH "$H")"
READY_HELD="" OPEN="$(seq -s ' ' 1 200)" wave "$H" g1 go
check "e3 the open list is at gh's 200 limit → nothing dropped (cannot tell open from closed)" $(grep -qx 999 "$(AH "$H")" && hasnot "$H/receipt-g1.txt" "dropped #999"; echo $?) "$(grep approve-held "$H/receipt-g1.txt"); file: $(cat "$(AH "$H")")"
H="$TMP/e-empty"; mkdir -p "$H/.config/obsidian/.ship-wave"; printf '3\n' > "$(AH "$H")"
READY_HELD="" OPEN="3" wave "$H" g1 go
check "e4 CONTROL every approved PR is still open → nothing dropped, no hygiene line" $(grep -qx 3 "$(AH "$H")" && hasnot "$H/receipt-g1.txt" "approve-held: dropped"; echo $?) "$(grep approve-held "$H/receipt-g1.txt")"

echo "── (f) 'desk silent since HH:MM' ──"
open_q() {  # $1 home $2 minutes ago → one valid open question asked that long ago (written by the real ask_director)
  ( export STATE="$1/.config/obsidian/.ship-wave"; mkdir -p "$STATE"; say() { :; }; . "$SW/desk-questions.sh"
    ask_director freeze "peer hold x" "The ship wave paused on one item; safe merges and deploys continue" "b" \
      '[{"label":"Keep it stopped","description":"d","writes":[{"op":"noop"}]},{"label":"Lift the stop","description":"d","writes":[{"op":"noop"}]}]' >/dev/null
    python3 - "$QUESTIONS_DIR/$ASK_DIRECTOR_ID.json" "$2" <<'PY'
import json, sys, datetime
p, m = sys.argv[1], int(sys.argv[2]); q = json.load(open(p))
t = (datetime.datetime.now().astimezone() - datetime.timedelta(minutes=m)).isoformat(timespec="seconds")
q["asked_at"] = t; q["first_asked_at"] = t; json.dump(q, open(p, "w"), indent=1)
PY
  )
}
H="$TMP/f"; open_q "$H" 120
READY_HELD="" OPEN="" wave "$H" r1 plan
WHEN=$(date -v-120M '+%H:%M')
check "f1 a question waiting 2 h, nothing ever answered → 'desk silent since $WHEN'" $(grep -qE "desk silent since ($WHEN|$(date -v-121M '+%H:%M'))" "$H/receipt-r1.txt"; echo $?) "$(grep -i desk "$H/receipt-r1.txt")"
H="$TMP/f-fresh"; open_q "$H" 5
READY_HELD="" OPEN="" wave "$H" r1 plan
check "f2 CONTROL a question asked 5 min ago → no 'desk silent' line" $(hasnot "$H/receipt-r1.txt" "desk silent"; echo $?) "$(grep -i desk "$H/receipt-r1.txt")"
H="$TMP/f-answered"; open_q "$H" 120
mk_answered "$H" q-20260911-090300-held-z-0004 "{\"kind\":\"held\",\"answered_at\":\"$(date -v-10M '+%Y-%m-%dT%H:%M:%S%z' | sed -E 's/([0-9]{2})([0-9]{2})$/\1:\2/')\",\"chosen\":\"Not now\",\"chosen_index\":1,\"applied\":[\"noop\"]}"
READY_HELD="" OPEN="" wave "$H" r1 plan
check "f3 CONTROL the desk answered something 10 min ago (after that question) → not silent" $(hasnot "$H/receipt-r1.txt" "desk silent"; echo $?) "$(grep -i desk "$H/receipt-r1.txt")"

echo "── syntax ──"
for f in "$SW/ship-wave.sh" "$0"; do /opt/homebrew/bin/bash -n "$f" && ok "bash -n $(basename "$f")" || bad "bash -n $(basename "$f")"; done
echo; echo "=== $PASS passed · $FAIL failed · fixtures in $TMP ==="
[ "$PASS" -gt 0 ] && [ "$FAIL" -eq 0 ]

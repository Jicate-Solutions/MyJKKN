#!/bin/bash
# test-lane-e.sh — proof for unblock-lanes.sh Lane E (stale Draft PRs; HUMAN-IN-THE-LOOP.md §E).
# Director 2026-09-11 12:34: "nudge at 3 days, ask me at 7" — and the wave never closes a draft on its own.
#
# Run from the worktree root:  bash scripts/ship-wave/tests/test-lane-e.sh
# Uses a temp $STATE; touches nothing live. Prints PASS/FAIL per case, exits 1 on any FAIL.
# Nothing reaches the network: `gh` is a shell function that answers `pr view` from a fixture JSON per PR,
# records every call in a trace file, and — like GitHub — moves updatedAt to "now" when a comment lands.
# lane_stale_drafts is the REAL function, sourced from unblock-lanes.sh with the real failure-ledger.sh and
# desk-questions.sh beside it; the Director's taps go through the REAL desk script (v5-w12-desk.sh answer),
# so the answer path under test is the one production uses. Every assertion is on a positive count or an
# exact value — never on the absence of an error.
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"   # unblock-lanes.sh uses declare -A
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SW="$HERE/.."
DESK="$SW/desk/v5-w12-desk.sh"
export STATE; STATE="$(mktemp -d "${TMPDIR:-/tmp}/lane-e-test.XXXXXX")"
export SHIP_WAVE_DIR="$SW"
trap 'find "$STATE" -depth -delete 2>/dev/null' EXIT
fails=0
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; fails=$((fails+1)); }
check() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then pass "$name"; else fail "$name"; fi; }
eq()    { [ "$1" = "$2" ]; }

# ── what unblock-lanes.sh expects from ship-wave.sh ──────────────────────────
REPO="jicate/test"; MODE=go; MAX_DISPATCH=0; DISPATCHED=0; HELPER_CAP=1; T=:; CLAUDE=:; QUIET_MIN=30
LOCAL="$STATE/local"; _CFG="$STATE/cfg"; FREEZE="$STATE/FROZEN"; RUN="$STATE/run-test"; mkdir -p "$RUN" "$_CFG"
OUT="$STATE/receipt.txt"
say() { printf '%s\n' "$*" >> "$OUT"; }
. "$SW/failure-ledger.sh"
. "$SW/policy-learning.sh"
. "$SW/desk-questions.sh"
. "$SW/unblock-lanes.sh"

# ── the gh stub: fixtures + trace, no network ────────────────────────────────
FIX="$STATE/fix"; TRACE="$STATE/gh.trace"; mkdir -p "$FIX"; : > "$TRACE"
iso_ago() {  # $1 = days ago → ISO-8601 UTC, the shape gh returns
  python3 -c 'import sys,datetime; print((datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(days=float(sys.argv[1]))).strftime("%Y-%m-%dT%H:%M:%SZ"))' "$1"; }
epoch_ago() { echo $(( $(date +%s) - ${1}*86400 )); }
mkpr() {  # $1 = number  $2 = days idle  [$3 = isDraft true|false]
  printf '{"updatedAt":"%s","isDraft":%s,"state":"OPEN"}\n' "$(iso_ago "$2")" "${3:-true}" > "$FIX/pr-$1.json"; }
gh() {
  printf '%s\n' "$*" >> "$TRACE"
  case "${1:-} ${2:-}" in
    "pr view")    cat "$FIX/pr-$3.json" 2>/dev/null ;;
    "pr comment") python3 - "$FIX/pr-$3.json" <<'PY'
import json,sys,datetime
p=sys.argv[1]; d=json.load(open(p)); d["updatedAt"]=datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
json.dump(d,open(p,"w"))
PY
    ;;
    "pr close")   python3 - "$FIX/pr-$3.json" <<'PY'
import json,sys; p=sys.argv[1]; d=json.load(open(p)); d["state"]="CLOSED"; json.dump(d,open(p,"w"))
PY
    ;;
    *) return 1 ;;
  esac
}
mk_plan() {  # $@ = PR numbers → plan.json with those as drafts (the sweep's shape)
  python3 - "$RUN/plan.json" "$@" <<'PY'
import json,sys
rows=[{"number":int(n),"title":f"feat: draft {n}","branch":f"b{n}","tier":"NORMAL","tier_reasons":[],"ci":"OK","ci_names":[],"state":"CLEAN","files":[],"age_min":9999,"base":"main"} for n in sys.argv[2:]]
json.dump({"stacked":[],"draft":rows,"conflicted":[],"blocked":[],"waiting_ci":[],"quiet_wait":[],"ready":{"LOW":[],"NORMAL":[],"HELD":[]},"clusters":{},"counts":{"draft":len(rows)}},open(sys.argv[1],"w"))
PY
}
tick() { : > "$OUT"; lane_stale_drafts "$RUN"; }
comments() { grep -c "^pr comment $1 " "$TRACE"; }
closes()   { grep -c "^pr close $1 " "$TRACE"; }
lines()    { grep -cF -- "$1" "$OUT"; }                       # receipt lines carrying this text
qfiles()   { ls "$STATE/questions"/q-*.json 2>/dev/null | wc -l | tr -d ' '; }
asked_log(){ grep -c $'\tasked\t' "$STATE/questions.log" 2>/dev/null || echo 0; }
stage()    { cut -f2 "$STATE/stale-drafts/$1" 2>/dev/null; }
mark()     { printf '%s\t%s\t%s\t%s\t%s\n' "$(date '+%F %T')" "$2" "$3" "$4" "$5" > "$STATE/stale-drafts/$1"; }
qjson()    { python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(eval(sys.argv[2],{"d":d}))' "$1" "$2"; }
find_q()   { grep -l "\"class\": \"stale-draft #$1\"" "$STATE/questions"/q-*.json 2>/dev/null | head -1; }
ledger_n() { grep -c "$1" "$STATE/failure-ledger.jsonl" 2>/dev/null || echo 0; }
# the check() helper runs compound assertions in `bash -c` sub-shells — hand them the helpers and paths they read
export -f comments closes lines qfiles asked_log stage qjson ledger_n
export TRACE OUT FIX RUN

# ── 1. two days untouched → nothing (a positive line says so; zero comments) ────────────────────────
mkpr 11 2; mk_plan 11; tick
check "1a idle 2d: receipt says it is under the 3-day line"       eq "$(lines '#11  draft, idle 2d — under the 3-day line')" 1
check "1b idle 2d: zero comments posted on #11"                  eq "$(comments 11)" 0
check "1c idle 2d: no marker written"                            test ! -e "$STATE/stale-drafts/11"
check "1d idle 2d: lane examined exactly 1 draft"                eq "$(lines 'lane E: 1 drafts examined · 0 acted on now')" 1

# ── 2. three days untouched → exactly ONE nudge; the next tick does not comment again ───────────────
mkpr 12 3; mk_plan 11 12; tick
check "2a idle 3d: exactly one 'pr comment' on #12"              eq "$(comments 12)" 1
check "2b idle 3d: the nudge text is the plain sentence"         grep -q "^pr comment 12 --repo jicate/test --body This draft has had no activity for 3 days — still working on it?" "$TRACE"
check "2c idle 3d: marker stage is nudged"                       eq "$(stage 12)" nudged
check "2d idle 3d: marker remembers the wave's OWN updatedAt bump (field b == fixture now)" \
      eq "$(cut -f4 "$STATE/stale-drafts/12")" "$(python3 -c 'import json;print(json.load(open("'"$FIX"'/pr-12.json"))["updatedAt"])')"
check "2e idle 3d: one ledger record 'nudged its author'"        eq "$(ledger_n 'stale draft #12: nudged its author')" 1
check "2f idle 3d: receipt line 'nudged its author once'"        eq "$(lines '#12  idle 3d — nudged its author once')" 1
tick
check "2g second tick: still exactly one comment on #12"          eq "$(comments 12)" 1
check "2h second tick: receipt says nudged 0d ago, waiting for 7d" eq "$(lines '#12  nudged 0d ago, idle 3d — the Director is asked at 7d')" 1
check "2i second tick: #11 still untouched (0 comments)"          eq "$(comments 11)" 0

# ── 3. seven days untouched (nudged 4 days ago, no reply) → ONE ask_director; the next tick does not re-ask ──
mkpr 13 7; mark 13 nudged "$(iso_ago 7)" "$(iso_ago 7)" "$(epoch_ago 4)"; mk_plan 13; tick
Q13=$(find_q 13)
check "3a idle 7d: exactly one question file on the desk"        eq "$(qfiles)" 1
check "3b idle 7d: the question is for #13 (class stale-draft #13, kind held)" bash -c "[ -n '$Q13' ] && [ \"\$(qjson '$Q13' 'd[\"kind\"]')\" = held ]"
check "3c idle 7d: options are exactly Close / Keep / Nudge again, in that order" \
      eq "$(qjson "$Q13" '"|".join(o["label"] for o in d["options"])')" "Close|Keep|Nudge again"
check "3d idle 7d: every option's writes is noop only (the desk applies nothing; the wave reads the answer)" \
      eq "$(qjson "$Q13" 'all(o["writes"]==[{"op":"noop"}] for o in d["options"]) and len(d["options"])')" 3
check "3e idle 7d: recommended tap is Keep (index 1)"            eq "$(qjson "$Q13" 'd["recommended"]')" 1
check "3f idle 7d: the desk itself accepts the file (question_file_valid)" question_file_valid "$Q13"
check "3g idle 7d: marker stage is asked and carries the question id" eq "$(cut -f2,3 "$STATE/stale-drafts/13")" "asked	$(basename "$Q13" .json)"
check "3h idle 7d: questions.log has exactly one 'asked' line"   eq "$(asked_log)" 1
check "3i idle 7d: one ledger record 'asked the Director'"       eq "$(ledger_n 'stale draft #13: asked the Director')" 1
check "3j idle 7d: no comment posted at the ask (the nudge was already spent)" eq "$(comments 13)" 0
tick
check "3k second tick: still exactly one question file"          eq "$(qfiles)" 1
check "3l second tick: still one 'asked' line, zero 'refreshed'" bash -c "[ \"\$(asked_log)\" = 1 ] && [ \"\$(grep -c $'\trefreshed\t' '$STATE/questions.log')\" = 0 ]"
check "3m second tick: receipt says waiting for the Director"    eq "$(lines "#13  waiting for the Director's answer")" 1

# ── 3n. a nudge only 1 day old does NOT ask yet, even at 30 days idle — the author gets 4 days to reply ──
mkpr 19 30; mark 19 nudged "$(iso_ago 30)" "$(iso_ago 30)" "$(epoch_ago 1)"; mk_plan 19; tick
check "3n nudged 1d ago at 30d idle: no question yet, receipt says so" bash -c "[ \"\$(qfiles)\" = 1 ] && [ \"\$(lines '#19  nudged 1d ago, idle 30d')\" = 1 ]"

# ── 4. answer Keep (through the REAL desk) → silent for DRAFT_KEEP_D days ───────────────────────────
mk_plan 13
out=$("$DESK" answer "$(basename "$Q13" .json)" 1); rc=$?
check "4a desk applies the Keep tap (exit 0, noop)"              bash -c "[ $rc = 0 ] && printf '%s' \"\$0\" | grep -q 'noop ✓'" "$out"
tick
check "4b Keep: marker stage is keep"                            eq "$(stage 13)" keep
check "4c Keep: quiet-until is ~7 days out (field a within 60s of now+7d)" \
      bash -c "u=\$(cut -f3 '$STATE/stale-drafts/13'); d=\$(( u - $(date +%s) - 7*86400 )); [ \$d -ge -60 ] && [ \$d -le 60 ]"
check "4d Keep: receipt says kept, quiet for 7d"                 eq "$(lines '#13  Director said Keep — kept; quiet for 7d')" 1
check "4e Keep: one ledger record 'kept'"                        eq "$(ledger_n 'stale draft #13: kept on the Director')" 1
check "4f Keep: zero comments, zero closes on #13"               bash -c "[ \"\$(comments 13)\" = 0 ] && [ \"\$(closes 13)\" = 0 ]"
tick
check "4g Keep, next tick: one 'quiet until' line, nothing else"  bash -c "[ \"\$(lines '#13  Director said Keep — quiet until')\" = 1 ] && [ \"\$(comments 13)\" = 0 ] && [ \"\$(qfiles)\" = 0 ]"
# an expired Keep restarts the cycle
mark 13 keep "$(epoch_ago 1)" "" "$(epoch_ago 8)"; tick
check "4h Keep expired: marker gone → fresh nudge lands (1 comment) and stage is nudged again" \
      bash -c "[ \"\$(lines '#13  the Keep period ended — the lane starts over')\" = 1 ] && [ \"\$(comments 13)\" = 1 ] && [ \"\$(stage 13)\" = nudged ]"

# ── 5. answer Close (through the REAL desk) → the wave closes it ONCE and drops it from the lane ───
mkpr 14 9; mark 14 nudged "$(iso_ago 9)" "$(iso_ago 9)" "$(epoch_ago 5)"; mk_plan 14; tick
Q14=$(find_q 14)
check "5a #14 asked (one question, class stale-draft #14)"       bash -c "[ -n '$Q14' ] && [ \"\$(qfiles)\" = 1 ]"
check "5b nothing closed before the answer"                      eq "$(closes 14)" 0
out=$("$DESK" answer "$(basename "$Q14" .json)" 0); rc=$?
check "5c desk applies the Close tap (exit 0, noop — the desk itself closes nothing)" bash -c "[ $rc = 0 ] && [ \"\$(closes 14)\" = 0 ]"
check "5d the answer file says chosen=Close"                     eq "$(qjson "$STATE/questions/answered/$(basename "$Q14")" 'd["chosen"]')" Close
tick
check "5e Close: 'gh pr close 14' invoked exactly once"          eq "$(closes 14)" 1
check "5f Close: the close carries a comment explaining it"      grep -q "^pr close 14 --repo jicate/test --comment Closed by the W12 ship wave on the Director's decision" "$TRACE"
check "5g Close: marker stage is closed"                         eq "$(stage 14)" closed
check "5h Close: receipt says closed, dropped from the lane"     eq "$(lines '#14  Director said Close — closed (branch kept); dropped from the lane')" 1
check "5i Close: one ledger record 'closed on the Director'"     eq "$(ledger_n 'stale draft #14: closed on the Director')" 1
tick   # gh pr list may still show it for a round
check "5j Close, next tick while still listed: no second close, no comment, receipt says dropped" \
      bash -c "[ \"\$(closes 14)\" = 1 ] && [ \"\$(comments 14)\" = 0 ] && [ \"\$(lines '#14  closed on the Director'\\''s answer — dropped from the lane')\" = 1 ]"
mk_plan 11; tick
check "5k Close, once the sweep no longer lists it: lane examines 1 draft, close count still 1" \
      bash -c "[ \"\$(lines 'lane E: 1 drafts examined')\" = 1 ] && [ \"\$(closes 14)\" = 1 ]"

# ── 6. answer Nudge again → one more comment, re-armed for another 7 days ──────────────────────────
mkpr 15 8; mark 15 nudged "$(iso_ago 8)" "$(iso_ago 8)" "$(epoch_ago 5)"; mk_plan 15; tick
Q15=$(find_q 15); "$DESK" answer "$(basename "$Q15" .json)" 2 >/dev/null; tick
check "6a Nudge again: exactly one comment on #15"               eq "$(comments 15)" 1
check "6b Nudge again: marker back to nudged, a = now (re-armed), b = the wave's own bump" \
      bash -c "[ \"\$(stage 15)\" = nudged ] && [ \"\$(cut -f4 '$STATE/stale-drafts/15')\" = \"\$(python3 -c 'import json;print(json.load(open(\"$FIX/pr-15.json\"))[\"updatedAt\"])')\" ]"
check "6c Nudge again: receipt says asked again in 7d"           eq "$(lines '#15  Director said Nudge again — nudged; he is asked again in 7d')" 1
tick
check "6d Nudge again, next tick: still one comment, no new question" bash -c "[ \"\$(comments 15)\" = 1 ] && [ \"\$(qfiles)\" = 0 ]"

# ── 7. free-text "other" answer applies nothing and reads as Keep ─────────────────────────────────
mkpr 18 8; mark 18 nudged "$(iso_ago 8)" "$(iso_ago 8)" "$(epoch_ago 5)"; mk_plan 18; tick
Q18=$(find_q 18); "$DESK" answer "$(basename "$Q18" .json)" other "ask Priya first" >/dev/null; tick
check "7a other: marker stage keep, zero closes, zero comments"  bash -c "[ \"\$(stage 18)\" = keep ] && [ \"\$(closes 18)\" = 0 ] && [ \"\$(comments 18)\" = 0 ]"
check "7b other: receipt says kept"                              eq "$(lines '#18  Director said other — kept; quiet for 7d')" 1

# ── 8. author activity after the nudge resets the count; the wave's own bump does not ───────────────
mkpr 17 0; mark 17 nudged "$(iso_ago 4)" "$(iso_ago 1)" "$(epoch_ago 1)"; mk_plan 17; tick   # updatedAt = now ≠ b, a day after the nudge
check "8a a push after the nudge: marker removed, receipt says the lane resets" \
      bash -c "[ ! -e '$STATE/stale-drafts/17' ] && [ \"\$(lines '#17  activity since the nudge — the lane resets its count')\" = 1 ]"
mkpr 20 0.001; mark 20 nudged "$(iso_ago 5)" "$(iso_ago 0.002)" "$(epoch_ago 0)"; mk_plan 20; tick   # updatedAt moved ~90 s after our nudge
check "8b updatedAt settling within 5 min of our nudge is NOT activity: marker kept, b updated to it" \
      bash -c "[ \"\$(stage 20)\" = nudged ] && [ \"\$(cut -f4 '$STATE/stale-drafts/20')\" = \"\$(python3 -c 'import json;print(json.load(open(\"$FIX/pr-20.json\"))[\"updatedAt\"])')\" ] && [ \"\$(comments 20)\" = 0 ]"

# ── 9. not a draft any more / unreadable → left alone; plan mode writes nothing ─────────────────────
mkpr 21 10 false; mk_plan 21; tick
check "9a un-drafted PR: left alone (receipt line), no comment"  bash -c "[ \"\$(lines '#21  gh could not read updatedAt, or it is no longer a draft — left alone')\" = 1 ] && [ \"\$(comments 21)\" = 0 ]"
mkpr 22 3; mk_plan 22; MODE=plan tick; MODE=go
check "9b plan mode at 3d: 'would nudge' line, zero comments, no marker" \
      bash -c "[ \"\$(lines '#22  would nudge its author once (idle 3d)')\" = 1 ] && [ \"\$(comments 22)\" = 0 ] && [ ! -e '$STATE/stale-drafts/22' ]"
mkpr 23 7; mark 23 nudged "$(iso_ago 7)" "$(iso_ago 7)" "$(epoch_ago 4)"; mk_plan 23; MODE=plan tick; MODE=go
check "9c plan mode at 7d: 'would ask' line, zero question files, marker still nudged" \
      bash -c "[ \"\$(lines '#23  would ask the Director: Close / Keep / Nudge again (idle 7d)')\" = 1 ] && [ \"\$(qfiles)\" = 0 ] && [ \"\$(stage 23)\" = nudged ]"

# ── 10. the whole lane runs inside unblock_lanes (call site wired) ─────────────────────────────────
check "10a unblock_lanes calls lane_stale_drafts"                grep -q '^  lane_stale_drafts "\$run"$' "$SW/unblock-lanes.sh"
check "10b bash -n on unblock-lanes.sh"                          bash -n "$SW/unblock-lanes.sh"

echo; if [ "$fails" -eq 0 ]; then echo "ALL PASS"; else echo "FAILURES: $fails"; exit 1; fi

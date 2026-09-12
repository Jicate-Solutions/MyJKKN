#!/bin/bash
# test-lane-e-amendments.sh — proof for the Lane E amendments of 2026-09-11 22:3x (HUMAN-IN-THE-LOOP.md §E), the
# Director's four interview answers:
#   1 "Message the tab: the phone desk tab sends the reminder to the Claude tab that started the change. If that tab
#      is closed, skip straight to asking you at 7 days."
#   2 "One question per group: one question names every part. One tap decides them all, so you never close part 1
#      and leave parts 2 to 5 stuck."
#   3 "Ask again next week: the question comes back once a week. Nothing is ever closed without your tap."
#   4 "Keep = quiet for one week" — for the whole group.
#
# Run from the worktree root:  bash scripts/ship-wave/tests/test-lane-e-amendments.sh
# Temp $STATE, temp copies of the fleet's mapping files; touches nothing live. PASS/FAIL per case, exit 1 on any FAIL.
# Nothing reaches the network or a tab: `gh` is a shell function over fixture JSON with a call trace; tmux is a stub
# script that lists fixture sessions; SendMessage is a stub that appends to sent.log (a bash script cannot send one —
# in production the desk TAB calls SendMessage; this stub stands exactly where that call stands in desk/SKILL.md).
# lane_stale_drafts is the REAL function; the reminder resolution is the REAL desk/desk-nudge-targets.sh through the
# REAL v5-w12-desk.sh; the Director's taps go through the REAL `v5-w12-desk.sh answer`. Every assertion is on a
# positive count or an exact value.
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SW="$HERE/.."
DESK="$SW/desk/v5-w12-desk.sh"
export STATE; STATE="$(mktemp -d "${TMPDIR:-/tmp}/lane-e-amend.XXXXXX")"
export SHIP_WAVE_DIR="$SW"
trap 'find "$STATE" -depth -delete 2>/dev/null' EXIT
fails=0; passes=0
pass() { printf 'PASS  %s\n' "$*"; passes=$((passes+1)); }
fail() { printf 'FAIL  %s\n' "$*"; fails=$((fails+1)); }
check() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then pass "$name"; else fail "$name"; fi; }
eq()    { [ "$1" = "$2" ]; }

REPO="jicate/test"; MODE=go; MAX_DISPATCH=0; DISPATCHED=0; HELPER_CAP=1; T=:; CLAUDE=:; QUIET_MIN=30
LOCAL="$STATE/local"; _CFG="$STATE/cfg"; FREEZE="$STATE/FROZEN"; RUN="$STATE/run-test"; mkdir -p "$RUN" "$_CFG"
OUT="$STATE/receipt.txt"
say() { printf '%s\n' "$*" >> "$OUT"; }
. "$SW/failure-ledger.sh"
. "$SW/policy-learning.sh"
. "$SW/desk-questions.sh"
. "$SW/unblock-lanes.sh"

# ── the fleet's mapping files, as temp COPIES of their real shapes (never the live ones) ─────────────────────────
export V5_CFG="$STATE/v5cfg" CLAUDE_PROJECTS="$STATE/projects" DESK_TMUX="$STATE/tmux-stub"
mkdir -p "$V5_CFG/v5-tab-sessions" "$V5_CFG/v5-tab-names" "$CLAUDE_PROJECTS/-Users-omm-PROJECTS-MyJKKN"
: > "$STATE/tmux-sessions.txt"
cat > "$DESK_TMUX" <<STUB
#!/bin/bash
case "\$1" in list-sessions) cat "$STATE/tmux-sessions.txt";; *) exit 1;; esac
STUB
chmod +x "$DESK_TMUX"
# tab <u8> <session uuid> <vault> <name> — one fleet tab, as v5-tab-sessions / v5-tab-names hold it
tab() { printf '%s\t/Users/omm/PROJECTS/MyJKKN\t2026-09-07T18:29:57Z\t%s\n' "$2" "$3" > "$V5_CFG/v5-tab-sessions/$1"
        printf '%s @ /Users/omm/PROJECTS/MyJKKN\n' "$4" > "$V5_CFG/v5-tab-names/$1"; }
live() { printf '%s\n' "$1" >> "$STATE/tmux-sessions.txt"; }                    # a tmux session name that exists
bridge() { printf '{"type":"bridge-session","sessionId":"%s","bridgeSessionId":"cse_%s","lastSequenceNum":0}\n' "$1" "$2" \
             >> "$CLAUDE_PROJECTS/-Users-omm-PROJECTS-MyJKKN/$1.jsonl"; }       # <uuid> <claude.ai id> — a mint in a transcript
rowstatus() { python3 - "$V5_CFG/v5-row-status.json" "$@" <<'PY'
import json,sys
rows=[{"id":"cse_"+a.split("=")[0],"u8":(a.split("=")[1] or None),"connection_status":"connected"} for a in sys.argv[2:]]
json.dump({"fetched_at":"2026-09-12T00:00:00+05:30","accounts":[],"rows":rows},open(sys.argv[1],"w"))
PY
}
# the fleet today: a live OneMark builder whose CURRENT row is in row-status; a closed tab known only from its transcript
# (it was restarted, so its old row is no longer joined); a live tab whose vault was renamed (tmux name has the OLD slug)
tab aaaaaaaa 11111111-1111-1111-1111-111111111111 JKKNKB "onemark builder"
tab bbbbbbbb 22222222-2222-2222-2222-222222222222 JKKNKB "accreditation fixes"
tab cccccccc 33333333-3333-3333-3333-333333333333 "JICATE Solutions" "google chrome setup"
bridge 22222222-2222-2222-2222-222222222222 LIVEOLD0000000000000001    # an old mint of bbbbbbbb …
bridge 22222222-2222-2222-2222-222222222222 DEADSESS00000000000000001  # … and the one that opened the drafts
bridge 33333333-3333-3333-3333-333333333333 RENAMED000000000000000001
rowstatus "ONEMARKSESS0000000000001=aaaaaaaa" "ORPHANROW000000000000001="
live v5-jkknkb-aaaaaaaa; live v5-claude-setup-cccccccc; live v5-jkknkb-dddddddd

# ── gh stub: fixtures + trace, no network ────────────────────────────────────────────────────────────────────────
FIX="$STATE/fix"; TRACE="$STATE/gh.trace"; mkdir -p "$FIX"; : > "$TRACE"
iso_ago() { python3 -c 'import sys,datetime; print((datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(days=float(sys.argv[1]))).strftime("%Y-%m-%dT%H:%M:%SZ"))' "$1"; }
epoch_ago() { python3 -c 'import sys,time; print(int(time.time()-float(sys.argv[1])*86400))' "$1"; }
mkpr() {  # $1 = number  $2 = days idle  $3 = title  $4 = body  [$5 = isDraft]
  N="$1" U="$(iso_ago "$2")" TT="$3" B="$4" D="${5:-true}" python3 -c 'import json,os
e=os.environ; print(json.dumps({"updatedAt":e["U"],"isDraft":e["D"]=="true","state":"OPEN","title":e["TT"],"body":e["B"]}))' > "$FIX/pr-$1.json"; }
touchpr() { python3 - "$FIX/pr-$1.json" "$(iso_ago "$2")" <<'PY'
import json,sys; p=sys.argv[1]; d=json.load(open(p)); d["updatedAt"]=sys.argv[2]; json.dump(d,open(p,"w"))
PY
}
gh() {
  printf '%s\n' "$*" >> "$TRACE"
  case "${1:-} ${2:-}" in
    "pr view")    cat "$FIX/pr-$3.json" 2>/dev/null ;;
    "pr comment") return 0 ;;
    "pr close")   [ -f "$STATE/close-fails-$3" ] && return 1
                  python3 - "$FIX/pr-$3.json" <<'PY'
import json,sys; p=sys.argv[1]; d=json.load(open(p)); d["state"]="CLOSED"; json.dump(d,open(p,"w"))
PY
    ;;
    *) return 1 ;;
  esac
}
mk_plan() {  # $@ = PR numbers → plan.json listing them as drafts, titles from their fixtures
  python3 - "$RUN/plan.json" "$FIX" "$@" <<'PY'
import json,sys
rows=[]
for n in sys.argv[3:]:
    t=json.load(open(f"{sys.argv[2]}/pr-{n}.json")).get("title","")
    rows.append({"number":int(n),"title":t,"branch":f"b{n}","tier":"NORMAL","tier_reasons":[],"ci":"OK","ci_names":[],"state":"CLEAN","files":[],"age_min":9999,"base":"main"})
json.dump({"stacked":[],"draft":rows,"conflicted":[],"blocked":[],"waiting_ci":[],"quiet_wait":[],"ready":{"LOW":[],"NORMAL":[],"HELD":[]},"clusters":{},"counts":{"draft":len(rows)}},open(sys.argv[1],"w"))
PY
}
reset_all() { find "$STATE/stale-drafts" "$STATE/nudges" "$STATE/questions" -type f -delete 2>/dev/null; : > "$TRACE"; rm -f "$STATE/sent.log" "$STATE/questions.log" "$STATE"/close-fails-*; }
tick()     { : > "$OUT"; lane_stale_drafts "$RUN"; }
comments() { grep -c "^pr comment" "$TRACE"; }
closes()   { grep -c "^pr close ${1:-}" "$TRACE"; }
lines()    { grep -cF -- "$1" "$OUT"; }
nfiles()   { ls "$STATE/nudges"/*.json 2>/dev/null | wc -l | tr -d ' '; }
qfiles()   { ls "$STATE/questions"/q-*.json 2>/dev/null | wc -l | tr -d ' '; }
stage()    { cut -f2 "$STATE/stale-drafts/$1" 2>/dev/null; }
jget()     { python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(eval(sys.argv[2],{"d":d}))' "$1" "$2" 2>/dev/null; }
refreshed(){ cat "$STATE/questions.log" 2>/dev/null | awk -F'\t' '$2=="refreshed"{n++} END{print n+0}'; }
qfile_for(){ grep -l "\"class\": \"$1\"" "$STATE/questions"/q-*.json 2>/dev/null | head -1; }
send_message() { printf '%s|%s\n' "$1" "$2" >> "$STATE/sent.log"; }       # the SendMessage stub
desk_pass() {  # what desk/SKILL.md step 1 does, with SendMessage stubbed
  local line req rest tabn st msg
  while IFS= read -r line; do
    req="${line%%|*}"; rest="${line#*|}"; tabn="${rest%%|*}"; rest="${rest#*|}"; st="${rest%%|*}"; msg="${rest#*|}"
    if [ "$st" = live ]; then send_message "$tabn" "$msg" && "$DESK" nudge-mark "$req" delivered "" "$tabn" >/dev/null
    else "$DESK" nudge-mark "$req" tab-closed "$st" >/dev/null; fi
  done < <("$DESK" nudges 2>/dev/null)
}
export -f jget
S1="https://claude.ai/code/session_ONEMARKSESS0000000000001"

# ════ 1. the 3-day reminder is a REQUEST for the desk, never a GitHub comment ════════════════════════════════════
mkpr 101 3 "fix(events): re-read the proposal when the tab comes back" "Body.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

$S1"
mk_plan 101; tick
check "1a idle 3d: ZERO 'gh pr comment' calls"                              eq "$(comments)" 0
check "1b idle 3d: exactly one reminder request, nudges/101.json"           bash -c "[ \"$(nfiles)\" = 1 ] && [ -f '$STATE/nudges/101.json' ]"
check "1c the request is pending and carries the PR number, title, session id, first-seen and requested_at" \
      eq "$(jget "$STATE/nudges/101.json" 'd["status"], [p["number"] for p in d["prs"]], d["prs"][0]["title"][:10], d["session_id"], bool(d["first_seen"]), bool(d["requested_at"])')" \
         "('pending', [101], 'fix(events', 'ONEMARKSESS0000000000001', True, True)"
check "1d the message is the Director's plain line for one draft" \
      eq "$(jget "$STATE/nudges/101.json" 'd["message"]')" \
         "Your draft #101 'fix(events): re-read the proposal when the tab comes back' has had no activity for 3 days. Still working on it? The Director will be asked at 7 days."
check "1e marker stage nudged"                                              eq "$(stage 101)" nudged
check "1f receipt: the desk will remind the tab that opened it"            eq "$(lines '#101  idle 3d — the desk will remind the Claude tab that opened it')" 1
M1=$(stat -f %Fm "$STATE/nudges/101.json"); tick
check "1g second tick: still one request, the file not rewritten (same mtime), zero comments" \
      bash -c "[ \"$(nfiles)\" = 1 ] && [ \"$(comments)\" = 0 ] && [ \"\$(stat -f %Fm '$STATE/nudges/101.json')\" = '$M1' ]"
check "1h second tick: receipt says the reminder waits for the desk; exactly 1 'lane e nudge' ledger record" \
      bash -c "[ \"$(lines '#101  reminder waiting for the desk 0d ago, idle 3d — the Director is asked at 7d')\" = 1 ] && [ \"\$(grep -c '\"lane e nudge\"' '$STATE/failure-ledger.jsonl')\" = 1 ]"
check "1i the code path no longer holds a gh pr comment for Lane E"         bash -c "! sed -n '/^# ── Lane E/,/^# ── stage 1b/p' '$SW/unblock-lanes.sh' | grep -q 'gh pr comment'"

# ════ 2. the session id is read from both link forms ═════════════════════════════════════════════════════════════
reset_all
mkpr 111 3 "fix(a): one" "Summary.

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_TRAILERFORM000000000001"
mkpr 112 3 "fix(b): two" "Summary.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_BARELINKFORM00000000002"
mkpr 113 3 "fix(c): three" "Summary, opened in [this session](https://claude.ai/code/session_MARKDOWNLINK000000003)."
mkpr 114 3 "fix(d): four" "No session link in this body."
mk_plan 111 112 113 114; tick
check "2a trailer form 'Claude-Session: https://claude.ai/code/session_<id>'" eq "$(jget "$STATE/nudges/111.json" 'd["sessions"]')" "['TRAILERFORM000000000001']"
check "2b bare link form 'https://claude.ai/code/session_<id>'"             eq "$(jget "$STATE/nudges/112.json" 'd["sessions"]')" "['BARELINKFORM00000000002']"
check "2c markdown link form '[…](https://claude.ai/code/session_<id>)'"     eq "$(jget "$STATE/nudges/113.json" 'd["sessions"]')" "['MARKDOWNLINK000000003']"
check "2d no link: session_id is None, sessions empty"                       eq "$(jget "$STATE/nudges/114.json" 'd["session_id"], d["sessions"]')" "(None, [])"
check "2e four lone drafts → four requests"                                  eq "$(nfiles)" 4

# ════ 3. resolution: live / dead / unknown from the fleet's own records ═════════════════════════════════════════
reset_all
mkpr 121 3 "fix(e): live tab" "$S1"
mkpr 122 3 "fix(f): restarted then closed tab" "https://claude.ai/code/session_DEADSESS00000000000000001"
mkpr 123 3 "fix(g): a tab nobody knows" "https://claude.ai/code/session_NOBODYKNOWS0000000000001"
mkpr 124 3 "fix(h): renamed vault" "https://claude.ai/code/session_RENAMED000000000000000001"
mkpr 125 3 "fix(i): no link" "nothing here"
mkpr 126 3 "fix(j): row with no tab join" "https://claude.ai/code/session_ORPHANROW000000000000001"
mk_plan 121 122 123 124 125 126; tick
"$DESK" nudges > "$STATE/targets.txt" 2>/dev/null
tgt() { grep "^$1|" "$STATE/targets.txt" | cut -d'|' -f2,3; }
check "3a row-status join → live, spine name"                                 eq "$(tgt 121)" "onemark builder|live"
check "3b id found only in a mapped tab's transcript, tmux session gone → dead, spine name" eq "$(tgt 122)" "accreditation fixes|dead"
check "3c id in no record → unknown"                                          eq "$(tgt 123)" "-|unknown"
check "3d vault renamed: tmux name keeps the old slug, matched by key → live" eq "$(tgt 124)" "google chrome setup|live"
check "3e no session link at all → unknown"                                   eq "$(tgt 125)" "-|unknown"
check "3f a row with no tab join and no transcript → unknown"                 eq "$(tgt 126)" "-|unknown"
check "3g six pending requests → six lines, each with 4 '|' fields and the message last" \
      bash -c "[ \"\$(grep -c . '$STATE/targets.txt')\" = 6 ] && [ \"\$(grep -c '^[^|]*|[^|]*|[a-z]*|Your draft #' '$STATE/targets.txt')\" = 6 ]"
desk_pass
check "3h desk pass: exactly 2 messages sent (the two live tabs), each the wave's line verbatim" \
      bash -c "[ \"\$(grep -c . '$STATE/sent.log')\" = 2 ] && grep -qx \"onemark builder|Your draft #121 'fix(e): live tab' has had no activity for 3 days. Still working on it? The Director will be asked at 7 days.\" '$STATE/sent.log'"
check "3i live → delivered (with delivered_at and tab); dead/unknown → tab-closed (4)" \
      bash -c "[ \"\$(jget '$STATE/nudges/121.json' 'd[\"status\"], bool(d.get(\"delivered_at\")), d.get(\"tab\")')\" = \"('delivered', True, 'onemark builder')\" ] && [ \"\$(grep -l '\"status\": \"tab-closed\"' '$STATE'/nudges/*.json | wc -l | tr -d ' ')\" = 4 ]"
check "3j a second desk pass sends nothing more (nothing pending)"            bash -c "$(declare -f desk_pass send_message); DESK='$DESK'; STATE='$STATE'; desk_pass; [ \"\$(grep -c . '$STATE/sent.log')\" = 2 ]"
check "3k nudge-mark on a request that is no longer pending exits 2, changes nothing" \
      bash -c "'$DESK' nudge-mark 121 tab-closed x >/dev/null; [ \$? = 2 ] && [ \"\$(jget '$STATE/nudges/121.json' 'd[\"status\"]')\" = delivered ]"
check "3l nudge-mark refuses a path-shaped name (exit 3)"                      bash -c "'$DESK' nudge-mark ../questions/x delivered >/dev/null; [ \$? = 3 ]"
# a group opened by two tabs: the tab with most parts is dead, the other is live → the live one is messaged
reset_all
for n in 131 132; do mkpr $n 3 "feat(fees): Split invoices Lane $([ $n = 131 ] && echo A || echo B) — part" "https://claude.ai/code/session_DEADSESS00000000000000001"; done
mkpr 133 3 "feat(fees): Split invoices Lane C — part" "$S1"
mk_plan 131 132 133; tick; "$DESK" nudges > "$STATE/targets.txt" 2>/dev/null
check "3m group with a dead majority tab and a live minority tab → the live tab" \
      bash -c "[ \"\$(jget '$STATE/nudges/g-fees-split-invoices.json' 'd[\"sessions\"]')\" = \"['DEADSESS00000000000000001', 'ONEMARKSESS0000000000001']\" ] && [ \"\$(cut -d'|' -f2,3 '$STATE/targets.txt')\" = 'onemark builder|live' ]"

# ════ 4. eight OneMark-style drafts are ONE group: one reminder, then ONE question at 7 days ═════════════════════
reset_all
lanes="S3 A U D G L N T"; nums=""; i=140
for L in $lanes; do
  i=$((i+1)); nums="$nums $i"
  body="Spec: \`specs/onemark-wave3-2026-09-06.md\` → \"Lane $L\". See also specs/onemark-decisions-2026-09-02.md.

https://claude.ai/code/session_DEADSESS00000000000000001"
  mkpr "$i" 7 "feat(onemark): Wave 3 Lane $L — part $L of the build" "$body"
done
mkpr 150 7 "fix(onemark): the drafting prompt still documents an ids-only input" "Refers to specs/onemark-decisions-2026-09-02.md only.

https://claude.ai/code/session_DEADSESS00000000000000001"
# shellcheck disable=SC2086
mk_plan $nums 150; tick
check "4a 9 drafts → exactly 2 requests: one for the 8-part build, one for the unrelated onemark fix" \
      bash -c "[ \"$(nfiles)\" = 2 ] && [ -f '$STATE/nudges/g-onemark-wave-3.json' ] && [ -f '$STATE/nudges/150.json' ]"
check "4b the group request lists all 8 PRs, in order"                      eq "$(jget "$STATE/nudges/g-onemark-wave-3.json" '[p["number"] for p in d["prs"]]')" "[141, 142, 143, 144, 145, 146, 147, 148]"
check "4c the group message names every part and says one question for all 8" \
      bash -c "jget '$STATE/nudges/g-onemark-wave-3.json' 'd[\"message\"]' | grep -qF 'Your drafts #141, #142, #143, #144, #145, #146, #147, #148 (' && jget '$STATE/nudges/g-onemark-wave-3.json' 'd[\"message\"]' | grep -qF 'with one question for all 8.'"
check "4d one marker for the group, none per member"                        bash -c "[ \"\$(ls '$STATE/stale-drafts' | wc -l | tr -d ' ')\" = 2 ] && [ \"$(stage g-onemark-wave-3)\" = nudged ] && [ ! -e '$STATE/stale-drafts/141' ]"
desk_pass   # the tab that opened them is closed → tab-closed
check "4e desk: the tab that opened them is closed → tab-closed, nothing sent" \
      bash -c "[ \"\$(jget '$STATE/nudges/g-onemark-wave-3.json' 'd[\"status\"]')\" = tab-closed ] && [ ! -s '$STATE/sent.log' ]"
tick
Q=$(qfile_for "stale-drafts g-onemark-wave-3")
check "4f tab closed at 7 days idle → straight to ONE question for the group (2 questions total with the lone fix)" \
      bash -c "[ -n '$Q' ] && [ \"$(qfiles)\" = 2 ]"
check "4g the group question's options are exactly Close all / Keep all / Nudge again, Keep all recommended" \
      eq "$(jget "$Q" '"|".join(o["label"] for o in d["options"]), d["recommended"]')" "('Close all|Keep all|Nudge again', 1)"
check "4h every option writes noop only (the desk applies nothing)"       eq "$(jget "$Q" 'all(o["writes"]==[{"op":"noop"}] for o in d["options"])')" True
check "4h2 the desk accepts the group question file (question_file_valid)" question_file_valid "$Q"
check "4i the question names every one of the 8 parts"                     bash -c "b=\$(jget '$Q' 'd[\"body\"]'); for n in $nums; do printf '%s' \"\$b\" | grep -q \"#\$n \" || exit 1; done"
check "4j it comes back weekly: expires_after_h = 168"                      eq "$(jget "$Q" 'd["expires_after_h"]')" 168
check "4k the marker records exactly the 8 listed PRs"                     eq "$(cut -f2,6 "$STATE/stale-drafts/g-onemark-wave-3")" "$(printf 'asked\t141 142 143 144 145 146 147 148')"
tick
check "4l next tick: no second question, zero comments, zero closes"       bash -c "[ \"$(qfiles)\" = 2 ] && [ \"$(comments)\" = 0 ] && [ \"$(closes)\" = 0 ]"

# ════ 5. a "PR k/5" chain is one group; a different chain and a same-scope loner stay apart ════════════════════
reset_all
for k in 1 2 3 4 5; do mkpr $((160+k)) 3 "feat(fees): split invoices — PR $k/5 step $k" "https://claude.ai/code/session_CHAINSESS000000000000001"; done
mkpr 171 3 "feat(hr): leave balance — PR 1/2" "https://claude.ai/code/session_CHAINSESS000000000000002"
mkpr 172 3 "feat(hr): leave approvals — PR 2/2" "https://claude.ai/code/session_CHAINSESS000000000000002"
mkpr 173 3 "fix(fees): a typo on the invoice page" "https://claude.ai/code/session_CHAINSESS000000000000001"
mk_plan 161 162 163 164 165 171 172 173; tick
G5=$(ls "$STATE/nudges" | grep '^g-chain-fees-5' | head -1)
check "5a 8 drafts → 3 requests: the 5-part chain, the 2-part chain, the loner" eq "$(nfiles)" 3
check "5b the 5-part chain is one request listing 161..165"                 eq "$(jget "$STATE/nudges/$G5" '[p["number"] for p in d["prs"]]')" "[161, 162, 163, 164, 165]"
check "5c the 2-part hr chain is its own group; #173 stays alone"          bash -c "ls '$STATE/nudges' | grep -q '^g-chain-hr-2' && [ -f '$STATE/nudges/173.json' ]"

# ════ 6. an unanswered question comes back exactly once a week; nothing is ever closed without a tap ═════════════
reset_all
for n in 181 182 183; do mkpr $n 8 "feat(exam): Marks entry Lane $((n-180)) — part" "https://claude.ai/code/session_DEADSESS00000000000000001"; done
mk_plan 181 182 183
G6=g-exam-marks-entry
printf '%s\tnudged\t%s\t\t%s\t181 182 183\t\n' "$(date '+%F %T')" "$(epoch_ago 8)" "$(epoch_ago 5)" > "$STATE/stale-drafts/$G6"
tick
Q6=$(qfile_for "stale-drafts $G6")
check "6a nudged 5d ago at 8d idle → one question"                          bash -c "[ -n '$Q6' ] && [ \"$(qfiles)\" = 1 ]"
agedq() { python3 - "$Q6" "$1" <<'PY'
import json,sys,datetime; p=sys.argv[1]; d=json.load(open(p))
d["asked_at"]=(datetime.datetime.now().astimezone()-datetime.timedelta(days=float(sys.argv[2]))).isoformat(timespec="seconds"); json.dump(d,open(p,"w"),indent=1)
PY
}
agedq 6; tick
check "6b 6 days unanswered: still open — no re-ask (0 refreshed)"          bash -c "[ \"$(refreshed)\" = 0 ] && [ \"$(lines "waiting for the Director's answer")\" = 1 ]"
agedq 7.1; tick
check "6c a week unanswered: asked again — exactly 1 refresh, same file, asked_times 2" \
      bash -c "[ \"$(refreshed)\" = 1 ] && [ \"$(qfiles)\" = 1 ] && [ \"\$(jget '$Q6' 'd[\"asked_times\"]')\" = 2 ]"
tick
check "6d the next tick does not ask again (still 1 refresh)"               eq "$(refreshed)" 1
agedq 7.1; tick; tick
check "6e the week after: exactly one more (2 refreshes in 2 weeks)"        eq "$(refreshed)" 2
check "6f two weeks unanswered: ZERO closes, ZERO comments"                 bash -c "[ \"$(closes)\" = 0 ] && [ \"$(comments)\" = 0 ]"
agedq 7.1; touchpr 182 0; tick
check "6g expired, but a part moved since it was asked → the lane starts over instead of asking again" \
      bash -c "[ \"$(refreshed)\" = 2 ] && [ \"$(lines 'there was activity since it was asked — the lane starts over')\" = 1 ]"

# ════ 7. Keep all silences the whole group for 7 days ═══════════════════════════════════════════════════════════
reset_all
for n in 191 192 193; do mkpr $n 9 "feat(hostel): Room swap Lane $((n-190)) — part" "https://claude.ai/code/session_DEADSESS00000000000000001"; done
mk_plan 191 192 193; G7=g-hostel-room-swap
printf '%s\tnudged\t%s\t\t%s\t191 192 193\t\n' "$(date '+%F %T')" "$(epoch_ago 9)" "$(epoch_ago 5)" > "$STATE/stale-drafts/$G7"
tick; Q7=$(qfile_for "stale-drafts $G7")
"$DESK" answer "$(basename "$Q7" .json)" 1 >/dev/null
tick
check "7a Keep all: one group marker 'keep', ~7 days out"                    bash -c "[ \"$(stage $G7)\" = keep ] && u=\$(cut -f3 '$STATE/stale-drafts/$G7'); d=\$(( u - \$(date +%s) - 7*86400 )); [ \$d -ge -60 ] && [ \$d -le 60 ]"
check "7b Keep all: receipt names the group once"                          eq "$(lines "Director said Keep all — kept; quiet for 7d")" 1
: > "$TRACE"; for n in 191 192 193; do mkpr $n 30 "feat(hostel): Room swap Lane $((n-190)) — part" "x"; done; tick; tick
check "7c two more ticks at 30d idle: no request for any member, no new question, 0 comments, 0 closes" \
      bash -c "[ \"$(nfiles)\" = 0 ] && [ \"$(qfiles)\" = 0 ] && [ \"$(comments)\" = 0 ] && [ \"$(closes)\" = 0 ]"
check "7d each quiet tick prints ONE 'quiet until' line for the whole group" eq "$(lines 'Director said Keep — quiet until')" 1
mark_keep_ended() { printf '%s\tkeep\t%s\t\t%s\t191 192 193\t\n' "$(date '+%F %T')" "$(epoch_ago 0.01)" "$(epoch_ago 8)" > "$STATE/stale-drafts/$G7"; }
mark_keep_ended; tick
check "7e after the week: the cycle restarts with ONE reminder request for the group" \
      bash -c "[ \"$(nfiles)\" = 1 ] && [ -f '$STATE/nudges/$G7.json' ] && [ \"$(stage $G7)\" = nudged ]"

# ════ 8. Close all closes every PR in the group — and only those it listed ═══════════════════════════════════════
reset_all
for n in 201 202 203 204; do mkpr $n 9 "feat(transport): Bus pass Lane $((n-200)) — part" "https://claude.ai/code/session_DEADSESS00000000000000001"; done
mk_plan 201 202 203 204; G8=g-transport-bus-pass
printf '%s\tnudged\t%s\t\t%s\t201 202 203 204\t\n' "$(date '+%F %T')" "$(epoch_ago 9)" "$(epoch_ago 5)" > "$STATE/stale-drafts/$G8"
tick; Q8=$(qfile_for "stale-drafts $G8")
check "8a nothing closed before the tap"                                     eq "$(closes)" 0
"$DESK" answer "$(basename "$Q8" .json)" 0 >/dev/null
check "8b the desk's Close all applies noop — the desk closes nothing"      eq "$(closes)" 0
mkpr 204 9 "feat(transport): Bus pass Lane 4 — part" "x" false; mk_plan 201 202 203   # #204 marked ready before the tick
touch "$STATE/close-fails-203"; tick
check "8c Close all: #201 and #202 closed once each; #203's close failed; #204 (no longer a draft) not closed" \
      bash -c "[ \"$(closes 201)\" = 1 ] && [ \"$(closes 202)\" = 1 ] && [ \"$(closes 203)\" = 1 ] && [ \"$(closes 204)\" = 0 ]"
check "8d a failed close keeps the group on 'asked' with 201 202 recorded closed" eq "$(cut -f2,7 "$STATE/stale-drafts/$G8")" "$(printf 'asked\t201 202')"
rm -f "$STATE/close-fails-203"; tick
check "8e next tick: only #203 is retried (201/202 not closed twice); group now closed" \
      bash -c "[ \"$(closes 201)\" = 1 ] && [ \"$(closes 202)\" = 1 ] && [ \"$(closes 203)\" = 2 ] && [ \"$(stage $G8)\" = closed ]"
check "8f the close comment says it went with the other parts"             grep -q "^pr close 201 --repo jicate/test --comment Closed by the W12 ship wave on the Director's decision, with the other parts of this build" "$TRACE"
tick
check "8g still listed a round later: no more closes (4 total calls), receipt says dropped" \
      bash -c "[ \"$(closes)\" = 4 ] && [ \"$(lines 'closed on the Director'\''s answer — dropped from the lane')\" = 1 ]"

# ════ 9. a tab-closed request goes to the question at 7 days; a delivered one waits for the tab ═════════════════
reset_all
mkpr 211 7 "fix(k): delivered reminder" "$S1"
mkpr 212 7 "fix(l): closed tab" "https://claude.ai/code/session_DEADSESS00000000000000001"
mk_plan 211 212; tick
check "9a both at 7d idle with no marker: reminder requests first, no question yet" bash -c "[ \"$(nfiles)\" = 2 ] && [ \"$(qfiles)\" = 0 ]"
desk_pass; tick
check "9b tab-closed request, 0 days old, idle 7d → question asked for #212"  bash -c "[ -n \"\$(grep -l '\"class\": \"stale-draft #212\"' '$STATE'/questions/q-*.json)\" ] && [ \"$(stage 212)\" = asked ]"
check "9c delivered request, 0 days old, idle 7d → no question for #211; the tab gets 4 days" \
      bash -c "[ \"$(stage 211)\" = nudged ] && [ \"$(qfiles)\" = 1 ] && [ \"$(lines '#211  tab reminded 0d ago, idle 7d — the Director is asked at 7d')\" = 1 ]"
check "9d the #212 question tells him nobody could be reminded"            bash -c "jget \"\$(grep -l '\"class\": \"stale-draft #212\"' '$STATE'/questions/q-*.json)\" 'd[\"body\"]' | grep -q 'is closed, so nobody could be reminded'"
python3 - "$STATE/nudges/211.json" <<'PY'
import json,sys,datetime; p=sys.argv[1]; d=json.load(open(p))
d["delivered_at"]=(datetime.datetime.now().astimezone()-datetime.timedelta(days=4.1)).isoformat(timespec="seconds"); json.dump(d,open(p,"w"))
PY
tick
check "9e the delivered reminder is 4 days old → now #211 is asked too"     bash -c "[ \"$(stage 211)\" = asked ] && [ \"$(qfiles)\" = 2 ]"
reset_all; mkpr 213 8 "fix(m): pending forever" "$S1"; mk_plan 213; tick
python3 - "$STATE/nudges/213.json" <<'PY'
import json,sys,datetime; p=sys.argv[1]; d=json.load(open(p))
d["requested_at"]=(datetime.datetime.now().astimezone()-datetime.timedelta(days=4.1)).isoformat(timespec="seconds"); json.dump(d,open(p,"w"))
PY
python3 - "$STATE/stale-drafts/213" "$(epoch_ago 8)" <<'PY'
import sys; p=sys.argv[1]; f=open(p).read().rstrip("\n").split("\t"); f[2]=sys.argv[2]; open(p,"w").write("\t".join(f)+"\n")
PY
tick
check "9g pending 4 days (desk never ran), idle 8d → asked"                  eq "$(stage 213)" asked

# ════ 10. activity: a push on ONE part resets the whole group; a part leaving the drafts does not ═════════════════
reset_all
for n in 221 222 223; do mkpr $n 4 "feat(lib): Book loans Lane $((n-220)) — part" "x"; done
mk_plan 221 222 223; tick; G10=g-lib-book-loans
check "10a group nudged at 4d"                                                eq "$(stage $G10)" nudged
mkpr 223 4 "feat(lib): Book loans Lane 3 — part" "x" false; mk_plan 221 222; tick
check "10b #223 marked ready (leaves the drafts): not activity — the group stays nudged" eq "$(stage $G10)" nudged
touchpr 222 0; tick
check "10c a push on #222: the group resets; its pending request is withdrawn" \
      bash -c "[ ! -e '$STATE/stale-drafts/$G10' ] && [ \"\$(jget '$STATE/nudges/$G10.json' 'd[\"status\"]')\" = withdrawn ] && [ \"$(lines 'activity since the reminder — the lane resets its count')\" = 1 ]"
check "10d a withdrawn request is not offered to the desk"                    bash -c "[ -z \"\$('$DESK' nudges 2>/dev/null)\" ]"

# ════ 11. Nudge again writes a fresh reminder request, not a comment ════════════════════════════════════════════
reset_all
mkpr 231 9 "fix(n): nudge again" "$S1"; mk_plan 231
printf '%s\tnudged\t%s\t\t%s\t231\t\n' "$(date '+%F %T')" "$(epoch_ago 9)" "$(epoch_ago 5)" > "$STATE/stale-drafts/231"
printf '{"request":"231","prs":[{"number":231,"title":"x"}],"sessions":[],"session_id":null,"status":"delivered","requested_at":"2026-09-01T00:00:00+05:30","first_seen":"2026-09-01T00:00:00+05:30","message":"m"}\n' > "$STATE/nudges/231.json"
tick; Q11=$(qfile_for "stale-draft #231"); "$DESK" answer "$(basename "$Q11" .json)" 2 >/dev/null; tick
check "11a Nudge again: the request is pending again, first_seen kept, zero comments" \
      bash -c "[ \"\$(jget '$STATE/nudges/231.json' 'd[\"status\"], d[\"first_seen\"]')\" = \"('pending', '2026-09-01T00:00:00+05:30')\" ] && [ \"$(comments)\" = 0 ] && [ \"$(stage 231)\" = nudged ]"

# ════ 11b. a revived tab: a new key on the same transcript, the dead old key sorting first ═════════════════════
reset_all
tab eeeeeeee 44444444-4444-4444-4444-444444444444 JKKNKB "revived builder (eeee)"   # the old key, tmux gone
tab ffffffff 44444444-4444-4444-4444-444444444444 JKKNKB "revived builder"          # W8 --revive: new key, same transcript
bridge 44444444-4444-4444-4444-444444444444 REVIVEDSESS00000000000001
live v5-jkknkb-ffffffff
mkpr 236 3 "fix(o): revived tab" "https://claude.ai/code/session_REVIVEDSESS00000000000001"; mk_plan 236; tick
check "11b-1 one id, two keys on one transcript, only the newer live → live, the live key's name" \
      eq "$("$DESK" nudges 2>/dev/null | grep '^236|' | cut -d'|' -f2,3)" "revived builder|live"

# ════ 12. plan mode writes nothing; wiring ═════════════════════════════════════════════════════════════════════
reset_all
for n in 241 242; do mkpr $n 8 "feat(sports): Fixtures Lane $((n-240)) — part" "x"; done
mk_plan 241 242; MODE=plan tick; MODE=go
check "12a plan mode: 'would ask the desk to remind' line, zero requests, zero markers, zero questions" \
      bash -c "[ \"$(lines 'would ask the desk to remind the Claude tab that opened it')\" = 1 ] && [ \"$(nfiles)\" = 0 ] && [ -z \"\$(ls '$STATE/stale-drafts')\" ] && [ \"$(qfiles)\" = 0 ]"
check "12b desk SKILL.md has the reminder step (nudges → SendMessage → nudge-mark)" \
      bash -c "grep -q 'v5-w12-desk.sh nudges' '$SW/desk/SKILL.md' && grep -q 'SendMessage' '$SW/desk/SKILL.md' && grep -q 'nudge-mark' '$SW/desk/SKILL.md'"
check "12c bash -n: unblock-lanes.sh, desk-nudge-targets.sh, v5-w12-desk.sh" \
      bash -c "bash -n '$SW/unblock-lanes.sh' && /opt/homebrew/bin/bash -n '$SW/desk/desk-nudge-targets.sh' && /opt/homebrew/bin/bash -n '$SW/desk/v5-w12-desk.sh'"

echo; echo "lane-e-amendments: $passes passed, $fails failed"
if [ "$fails" -eq 0 ]; then echo "ALL PASS"; else echo "FAILURES: $fails"; exit 1; fi

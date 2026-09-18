#!/bin/bash
# test-shipped-notes.sh — proof for the shipped notes (Director 2026-09-16 06:14: "why don't the W12 update itself to
# inform the peer tab that it has merged or deployed a PR it shipped, so that tab is aware before moving to the next
# PR"): when the last-deployed marker moves, the wave writes ONE request per PR that move carried under
# $STATE/shipped/<pr>.json, and the desk lists / marks them through the SAME resolver the Lane E reminders use.
#
# Run from the worktree root:  bash scripts/ship-wave/tests/test-shipped-notes.sh
# Temp $STATE, a temp git repo standing in for the jicate/main mirror; touches nothing live. Nothing reaches the
# network or a tab: `gh` is a shell function over fixture JSON with a call trace; the fleet mapping dirs are empty
# temp dirs (so every tab resolves `unknown` — the resolver itself is proven by test-lane-e-amendments.sh).
# shipped_requests + record_last_deployed are the REAL functions, sourced from a copy of ship-wave.sh cut before its
# dispatcher (same harness as test-sweep-dynamic-routes.sh). Every assertion is on a positive count or an exact value.
[ "${BASH_VERSINFO[0]}" -ge 4 ] || exec /opt/homebrew/bin/bash "$0" "$@"
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; SW="$HERE/.."; ROOT="$(cd "$SW/../.." && pwd)"
DESK="$SW/desk/v5-w12-desk.sh"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ship-wave-shipped.XXXXXX"); trap 'find "$TMP" -depth -delete 2>/dev/null' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'FAIL  %s\n      %s\n' "$1" "${2:-}"; }
check() { if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1" "${3:-}"; fi; }
wipe() { find "$1" -depth -delete 2>/dev/null; }

awk '/^if \[ -n "\$GOAL" \]; then$/ {exit} {print}' "$SW/ship-wave.sh" > "$TMP/wave.sh"
for f in "$SW"/*.sh "$SW"/*.py; do [ "$(basename "$f")" = ship-wave.sh ] || ln -s "$f" "$TMP/$(basename "$f")"; done
grep -q '^shipped_requests() {' "$TMP/wave.sh" || { echo "FAIL  could not extract shipped_requests from ship-wave.sh"; exit 1; }

# a repo standing in for the jicate/main mirror: genesis → two squash-merged PRs, one merge-commit PR, one bare commit
export MYJKKN_LOCAL="$TMP/local"; WTDIR="$MYJKKN_LOCAL/.claude/worktrees/ship-main"
git init -q --bare "$TMP/origin.git"; mkdir -p "$(dirname "$WTDIR")"
git clone -q -o jicate "$TMP/origin.git" "$WTDIR" 2>/dev/null
gitc() { git -C "$WTDIR" -c user.name=t -c user.email=t@t "$@"; }
echo 0 > "$WTDIR/a"; gitc add -A >/dev/null; gitc commit -q -m genesis; SHA0=$(gitc rev-parse HEAD)
echo 1 > "$WTDIR/a"; gitc add -A >/dev/null; gitc commit -q -m "feat(x): first thing (#101)"
echo 2 > "$WTDIR/a"; gitc add -A >/dev/null; gitc commit -q -m "docs: a bare commit with no PR"
gitc checkout -q -b b102; echo 3 > "$WTDIR/b"; gitc add -A >/dev/null; gitc commit -q -m "second thing"; gitc checkout -q -; gitc merge -q --no-ff -m "Merge pull request #102 from t/b102" b102
echo 4 > "$WTDIR/a"; gitc add -A >/dev/null; gitc commit -q -m "fix(y): third | thing (#103)"
SHA1=$(gitc rev-parse HEAD); gitc push -q jicate HEAD:main 2>/dev/null

export HOME="$TMP/home"; mkdir -p "$HOME/.config/obsidian/.ship-wave" "$HOME/.config/obsidian/v5-tab-sessions" "$HOME/.config/obsidian/v5-tab-names" "$HOME/.claude/projects"
STATEDIR="$HOME/.config/obsidian/.ship-wave"; TRACE="$TMP/trace.txt"; : > "$TRACE"; OUT="$TMP/receipt.txt"; : > "$OUT"
run_wave() {  # $1 = mode · $2 = prev marker ("" = none) · $3 = deployment JSON · $4 = fallback sha
  local mode="$1" prev="$2" djson="$3" fb="$4"
  (
    cd "$ROOT" || exit 9; export TRACE WTDIR OUT
    set -- "$mode"; . "$TMP/wave.sh" >/dev/null 2>&1
    say() { printf '%s\n' "$*" >> "$OUT"; }
    gh() {
      echo "gh $*" >> "$TRACE"
      case "$*" in
        "pr view 101 "*) echo '{"title":"feat(x): first thing","url":"https://github.com/t/t/pull/101","body":"Built by https://claude.ai/code/session_01AAAAAAAAAAAAAAAAAAAAAA and\n\nClaude-Session: https://claude.ai/code/session_01BBBBBBBBBBBBBBBBBBBBBB"}';;
        "pr view 102 "*) echo '{"title":"second | thing\twith control","url":"https://github.com/t/t/pull/102","body":"opened by a human, no link"}';;
        "pr view 103 "*) return 1;;
        *) return 0;;
      esac
    }
    if [ -n "$prev" ]; then printf '%s\n' "$prev" > "$STATE/last-deployed"; else rm -f "$STATE/last-deployed"; fi
    record_last_deployed "$djson" "$fb"
  )
}
DJSON='{"deployments":[{"uid":"dpl_TEST123","meta":{"githubCommitSha":"'"$SHA1"'"}}]}'
py() { python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print($2)" "$STATEDIR/shipped/$1.json"; }

# 1. no previous marker → marker written, no note
run_wave go "" "$DJSON" "$SHA1"
check "1a marker written from the deployment sha" $([ "$(cat "$STATEDIR/last-deployed")" = "$SHA1" ] && echo 0 || echo 1) "$(cat "$STATEDIR/last-deployed" 2>/dev/null)"
check "1b no previous marker → no shipped file" $([ -z "$(ls "$STATEDIR/shipped" 2>/dev/null)" ] && echo 0 || echo 1)
check "1c receipt says why" $(grep -q 'shipped notes: no previous last-deployed marker' "$OUT" && echo 0 || echo 1) "$(cat "$OUT")"

# 2. marker moves genesis → HEAD: three PRs carried, the bare commit is not one
: > "$OUT"; wipe "$STATEDIR/shipped"
run_wave go "$SHA0" "$DJSON" "$SHA1"
check "2a one file per PR (#101 #102 #103)" $([ "$(ls "$STATEDIR/shipped" | sort | tr '\n' ' ')" = "101.json 102.json 103.json " ] && echo 0 || echo 1) "$(ls "$STATEDIR/shipped" 2>/dev/null | tr '\n' ' ')"
check "2b receipt lists the three" $(grep -q 'shipped notes for the desk: #101 #102 #103' "$OUT" && echo 0 || echo 1) "$(grep shipped "$OUT")"
check "2c #101 carries both session ids from its body, in order" $([ "$(py 101 "' '.join(d['sessions'])")" = "01AAAAAAAAAAAAAAAAAAAAAA 01BBBBBBBBBBBBBBBBBBBBBB" ] && echo 0 || echo 1) "$(py 101 "d['sessions']")"
check "2d #102 (human-opened) has no session id" $([ "$(py 102 "len(d['sessions'])")" = "0" ] && echo 0 || echo 1)
check "2e #103 (gh failed) still gets a note, untitled, pending" $([ "$(py 103 "d['status']+' '+d['title']")" = "pending " ] && echo 0 || echo 1) "$(py 103 "d")"
check "2f every note is pending and names the deploy + short sha" $([ "$(py 101 "d['status']+' '+d['deploy']+' '+d['sha'][:7]")" = "pending dpl_TEST123 ${SHA1:0:7}" ] && echo 0 || echo 1)
check "2g the message is one line, starts with [note], no '|', control chars gone" $([ "$(py 102 "('|' not in d['message']) and ('\n' not in d['message']) and ('\t' not in d['message']) and d['message'].startswith('[note] PR #102 is live (deploy verified): second / thing with control')")" = True ] && echo 0 || echo 1) "$(py 102 "d['message']")"
check "2h gh was asked for title,body,url once per PR" $([ "$(grep -c 'gh pr view' "$TRACE")" = 3 ] && echo 0 || echo 1) "$(grep -c 'gh pr view' "$TRACE")"

# 3. the same move again (marker unchanged) → nothing written, nothing re-asked
: > "$OUT"; : > "$TRACE"
run_wave go "$SHA1" "$DJSON" "$SHA1"
check "3a marker unchanged → shipped_requests not entered" $([ ! -s "$OUT" ] && [ "$(grep -c 'gh pr view' "$TRACE")" = 0 ] && echo 0 || echo 1) "$(cat "$OUT")"

# 4. a file that exists is never rewritten (even after the desk marked it), the receipt counts it
python3 - "$STATEDIR/shipped/101.json" <<'PY'
import json,sys; p=sys.argv[1]; d=json.load(open(p)); d["status"]="delivered"; json.dump(d, open(p,"w"), indent=1)
PY
: > "$OUT"; : > "$TRACE"; rm -f "$STATEDIR/shipped/102.json" "$STATEDIR/shipped/103.json"
run_wave go "$SHA0" "$DJSON" "$SHA1"
check "4a #101 kept as delivered, #102 #103 re-created" $([ "$(py 101 "d['status']")" = delivered ] && [ -f "$STATEDIR/shipped/102.json" ] && [ -f "$STATEDIR/shipped/103.json" ] && echo 0 || echo 1)
check "4b receipt: two written, one already noted" $(grep -q 'shipped notes for the desk: #102 #103 · 1 already noted' "$OUT" && echo 0 || echo 1) "$(grep shipped "$OUT")"

# 5. no build (docs/migration-only round): deployment JSON empty → the message says so, no deploy id
wipe "$STATEDIR/shipped"; : > "$OUT"
run_wave go "$SHA0" "" "$SHA1"
check "5a no-build move still writes the notes" $([ "$(ls "$STATEDIR/shipped" | wc -l | tr -d ' ')" = 3 ] && echo 0 || echo 1)
check "5b message names the no-build case, deploy field empty" $([ "$(py 101 "('no build needed' in d['message']) and d['deploy']==''")" = True ] && echo 0 || echo 1) "$(py 101 "d['message']")"

# 6. plan mode never writes (the marker is written by go only in practice; the function itself refuses too)
wipe "$STATEDIR/shipped"; : > "$OUT"
run_wave plan "$SHA0" "$DJSON" "$SHA1"
check "6a plan mode → no shipped file" $([ ! -d "$STATEDIR/shipped" ] && echo 0 || echo 1) "$(ls "$STATEDIR/shipped" 2>/dev/null)"

# 7. the desk side: list through the real desk script + resolver, then mark
wipe "$STATEDIR/shipped"; : > "$OUT"; run_wave go "$SHA0" "$DJSON" "$SHA1"
DENV=(STATE="$STATEDIR" DESK_TMUX="$TMP/no-tmux" V5_CFG="$HOME/.config/obsidian" CLAUDE_PROJECTS="$HOME/.claude/projects")
LIST=$(env "${DENV[@]}" NUDGES_DIR="$STATEDIR/shipped" /opt/homebrew/bin/bash "$SW/desk/desk-nudge-targets.sh" list 2>/dev/null)
check "7a resolver lists the three pending notes (no fleet files → unknown)" $([ "$(printf '%s\n' "$LIST" | grep -c .)" = 3 ] && printf '%s\n' "$LIST" | grep -q '^101|-|unknown|\[note\] PR #101 is live' && echo 0 || echo 1) "$LIST"
LIST2=$(env "${DENV[@]}" /opt/homebrew/bin/bash "$DESK" shipped 2>/dev/null)
check "7b v5-w12-desk.sh shipped = the same three lines" $([ "$LIST2" = "$LIST" ] && echo 0 || echo 1) "$LIST2"
M=$(STATE="$STATEDIR" /opt/homebrew/bin/bash "$DESK" shipped-mark 101 delivered "" "some tab" 2>&1)
check "7c shipped-mark 101 delivered" $([ "$M" = "101 → delivered" ] && [ "$(py 101 "d['status']+' '+d['tab']")" = "delivered some tab" ] && echo 0 || echo 1) "$M"
M=$(STATE="$STATEDIR" /opt/homebrew/bin/bash "$DESK" shipped-mark 102 tab-closed unknown 2>&1)
check "7d shipped-mark 102 tab-closed" $([ "$M" = "102 → tab-closed" ] && echo 0 || echo 1) "$M"
LIST3=$(env "${DENV[@]}" /opt/homebrew/bin/bash "$DESK" shipped 2>/dev/null)
check "7e only #103 still pending" $([ "$(printf '%s\n' "$LIST3" | grep -c .)" = 1 ] && printf '%s\n' "$LIST3" | grep -q '^103|' && echo 0 || echo 1) "$LIST3"
M=$(STATE="$STATEDIR" /opt/homebrew/bin/bash "$DESK" shipped-mark 101 delivered 2>&1); rc=$?
check "7f marking a non-pending note again is refused (exit 2), file untouched" $([ "$rc" = 2 ] && [ "$(py 101 "d['tab']")" = "some tab" ] && echo 0 || echo 1) "rc=$rc $M"
M=$(STATE="$STATEDIR" /opt/homebrew/bin/bash "$DESK" shipped-mark '../questions/x' delivered 2>&1); rc=$?
check "7g a path-shaped id is refused (exit 3)" $([ "$rc" = 3 ] && echo 0 || echo 1) "rc=$rc"
check "7h shipped/ and nudges/ do not mix: no nudge listed" $([ -z "$(env "${DENV[@]}" /opt/homebrew/bin/bash "$DESK" nudges 2>/dev/null)" ] && echo 0 || echo 1)

# 8. the wave's desk receipt counts what waits
: > "$OUT"
( cd "$ROOT" || exit 9; export OUT; set -- plan; . "$TMP/wave.sh" >/dev/null 2>&1; say() { printf '%s\n' "$*" >> "$OUT"; }; questions_open_count() { echo 0; }; desk_receipt )
check "8a desk receipt: 1 shipped note waiting" $(grep -q 'desk: 1 shipped note(s) waiting to be relayed' "$OUT" && echo 0 || echo 1) "$(cat "$OUT")"

for f in "$SW/ship-wave.sh" "$SW/desk/v5-w12-desk.sh" "$SW/desk/desk-nudge-targets.sh" "$0"; do /opt/homebrew/bin/bash -n "$f" && ok "bash -n $(basename "$f")" || bad "bash -n $(basename "$f")"; done
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"; [ "$FAIL" -eq 0 ]

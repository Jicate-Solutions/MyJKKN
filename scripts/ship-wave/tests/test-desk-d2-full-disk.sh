#!/bin/bash
# test-desk-d2-full-disk.sh — round-8 D2 (slice A): the desk's scoped `unfreeze` rewrite on a full disk.
# The bug (ea0c188879): the rewrite appended each kept line to a temp file with no error check and renamed the short copy
# over FROZEN. FROZEN = S0 (soft, its own Lift question) · S1 (soft, long) · H (HARD): a full disk after S1 dropped H, one
# tap left FROZEN soft (deploy allowed), and the receipt said "lifted 1 line(s); 2 soft line(s) still on" over a 1-line file.
# The fix follows slice B's freeze() rule: temp beside the resolved target, ONE checked redirect, verify the copy (count,
# every kept line byte-for-byte, class not lower), then rename; the receipt is read from FROZEN after the rename.
#
# The full disk is SIMULATED with `ulimit -f` (portable; SIGXFSZ ignored, so a write past the limit fails with EFBIG the
# way ENOSPC fails). Note (round-7 verifier): macOS checks an O_APPEND write against the limit by its own size, not its
# offset — the old per-line `>>` passed a limit a real disk would not. Cases marked [old-bug] use a single line bigger than
# the limit, which the old per-line append ALSO failed on, so they FAIL on ea0c188879; the S1+H-over-the-limit cases are the
# real-disk shape the new single redirect catches (the verifier's 4 MB RAM-disk D2 reproduces it for real).
# Run from the worktree root:  bash scripts/ship-wave/tests/test-desk-d2-full-disk.sh
# Temp $STATE, touches nothing live. PASS/FAIL per case, exit 1 on any FAIL. (DESK=<path> runs another desk copy.)
[ "${DESK_TEST_ENV_I:-}" = 1 ] || exec env -i PATH="$PATH" HOME="$HOME" DESK_TEST_ENV_I=1 ${DESK:+DESK="$DESK"} bash "$0" "$@"
set -uo pipefail
export LC_ALL=C
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; SW="$HERE/.."; DESK="${DESK:-$SW/desk/v5-w12-desk.sh}"
ROOT="$(mktemp -d "${TMPDIR:-/tmp}/desk-d2.XXXXXX")"; export STATE="$ROOT/state"; mkdir -p "$STATE"
export FLEET_MD="$STATE/Fleet note.md" SHIP_WAVE_DIR="$SW"
trap 'chmod -R u+w "$ROOT" 2>/dev/null; find "$ROOT" -delete' EXIT
fails=0; passes=0
pass() { printf 'PASS  %s\n' "$*"; passes=$((passes+1)); }
fail() { printf 'FAIL  %s\n' "$*"; fails=$((fails+1)); }
. "$SW/failure-ledger.sh"; . "$SW/policy-learning.sh"; . "$SW/desk-questions.sh"
FREEZE="$STATE/FROZEN"
# slice B's reader, verbatim (hitl-freeze-classes 39c528e96f freeze_class_now) — what the wave does with what remains
wave_cls() { local f="${1:-$FREEZE}"; [ -e "$f" ] || { printf none; return; }; [ -f "$f" ] || { printf hard; return; }
  local v; v=$(awk -F'\t' 'BEGIN{c="soft";n=0} {n++; if (NF<3 || NF>5 || ($3!="soft" && $3!="hard") || (NF==5 && (length($5)!=40 || $5 !~ /^[0-9a-f]+$/))) {c="hard"; exit} if ($3=="hard") c="hard"} END{if (n==0) c="hard"; print c}' "$f" 2>/dev/null)
  case "$v" in soft|hard) printf '%s' "$v";; *) printf hard;; esac; }
NOW=$(python3 -c 'import datetime;print(datetime.datetime.now().astimezone().isoformat(timespec="seconds"))')
# a FROZEN line exactly as freeze() writes it: ts TAB msg TAB class TAB ledger_class TAB sha1(fields 1-4)
fline() { local l; l=$(printf '%s\t%s\t%s\t%s' "$1" "$2" "$3" "$4"); printf '%s\t%s' "$l" "$(printf '%s' "$l" | shasum -a 1 | cut -c1-40)"; }
sha_of() { printf '%s' "$1" | cut -f5; }
mkq() {  # $1 id  $2 sha of the line asked about  $3 frozen_line text
  printf '{"id":"%s","asked_at":"%s","kind":"freeze","class":"c","title":"t","body":"b","options":[{"label":"Lift the stop","description":"l","writes":[{"op":"unfreeze","line_sha1":"%s"}]},{"label":"Keep it stopped","description":"k","writes":[{"op":"noop"}]}],"recommended":1,"expires_after_h":48,"frozen_line":%s}' \
    "$1" "$NOW" "$2" "$(printf '%s' "$3" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read().replace(chr(9)," ")[:400]))')" > "$QUESTIONS_DIR/$1.json"; }
clean() { find "$QUESTIONS_DIR" -name '*.json' -delete; : > "$QUESTIONS_LOG"; : > "$LEDGER"; rm -f "$FREEZE"; find "$ROOT" -name '.FROZEN.tmp.*' -delete; }
cks() { cksum < "$1" 2>/dev/null; }
tmp_left() { find "$ROOT" -name '.FROZEN.tmp.*' 2>/dev/null | wc -l | tr -d ' '; }
nlines() { grep -c '' "$FREEZE" 2>/dev/null || echo 0; }
last_outcome() { tail -1 "$LEDGER" 2>/dev/null | python3 -c 'import json,sys;r=json.loads(sys.stdin.read());print(r.get("outcome",""),"|",r.get("reason",""))' 2>/dev/null; }
q_failed() { python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("failed",0))' "$QUESTIONS_DIR/answered/$1.json" 2>/dev/null; }
# answer under a file-size limit of $1 KB; $2 = ignore|default for SIGXFSZ
answer_lim() { local lim="$1" x="$2" id="$3" idx="$4"
  OUT=$( ( [ "$x" = ignore ] && trap '' XFSZ; ulimit -f "$lim"; exec "$DESK" answer "$id" "$idx" ) 2>&1 ); RC=$?; }
answer() { OUT=$("$DESK" answer "$1" "$2" 2>&1); RC=$?; }
pad() { head -c "$1" /dev/zero | tr '\0' "$2"; }
has() { case "$1" in *"$2"*) return 0;; *) return 1;; esac; }
LIM=2   # KB (bash ulimit -f counts 1024-byte blocks outside posix mode)
( trap '' XFSZ; ulimit -f 1; printf '%s' "$(pad 1100 x)" > "$ROOT/probe" ) >/dev/null 2>&1
[ "$(wc -c < "$ROOT/probe" | tr -d ' ')" = 1024 ] \
  || { echo "SKIP  ulimit -f does not cap a plain write at 1024 bytes on this host — the simulation cannot run"; exit 1; }
rm -f "$ROOT/probe"

S0=$(fline "2026-09-11 20:00:00" "Director hold on the calendar module" soft director-hold)
S1=$(fline "2026-09-11 20:01:00" "peer hold $(pad 1900 a)" soft peer-hold)                      # ~2.0 KB: fits the limit alone
H=$(fline "2026-09-11 20:02:00" "migration 20260906213000: APPLY failed — relation exists" hard migration-apply-failed)
HBIG=$(fline "2026-09-11 20:02:00" "migration 20260906213000: APPLY failed — $(pad 2200 b)" hard migration-apply-failed)  # > the limit alone
H2=$(fline "2026-09-11 20:03:00" "deploy ERROR build failed" hard deploy-error)
NOLIFT="nothing lifted: could not rewrite the stop file ("

# ── 1 · the D2 shape: S0 / S1 / H, the write of H fails — FROZEN byte-identical, class hard, receipt says nothing lifted
clean; printf '%s\n%s\n%s\n' "$S0" "$S1" "$H" > "$FREEZE"; B=$(cks "$FREEZE")
[ "$(wave_cls)" = hard ] && [ "$(nlines)" -eq 3 ] && [ "$(printf '%s\n' "$S1" | wc -c)" -lt 2048 ] && [ "$(printf '%s\n%s\n' "$S1" "$H" | wc -c)" -gt 2048 ] \
  && pass "1.0 precondition: 3 lines, class hard; the copy after S0's Lift = S1 (fits the 2 KB limit) + H (does not)" || fail "1.0 precondition S1+H=$(printf '%s\n%s\n' "$S1" "$H" | wc -c)"
mkq q-20260911-200000-s0 "$(sha_of "$S0")" "$S0"
answer_lim "$LIM" ignore q-20260911-200000-s0 0
[ "$(cks "$FREEZE")" = "$B" ] && [ "$(wave_cls)" = hard ] && pass "1a S1+H past the limit: FROZEN byte-identical and still HARD" \
  || fail "1a FROZEN now $(nlines) line(s) class $(wave_cls) · $OUT"
[ "$RC" -eq 4 ] && has "$OUT" "$NOLIFT" && has "$OUT" "File too large" && has "$OUT" ✗ && ! has "$OUT" "lifted 1" && ! has "$OUT" "still on" \
  && pass "1b receipt: 'nothing lifted: could not rewrite the stop file (…File too large)' ✗, rc 4, no line count claimed" || fail "1b rc=$RC $OUT"
[ "$(tmp_left)" -eq 0 ] && pass "1c no temp copy left beside FROZEN" || fail "1c $(tmp_left) temp file(s) left"
lo=$(last_outcome); { has "$lo" "refused |" && has "$lo" "could not rewrite the stop file" && has "$lo" "File too large" && [ "$(q_failed q-20260911-200000-s0)" = 1 ]; } \
  && pass "1d ledger records outcome 'refused' with the true reason; the answered question carries failed:1" || fail "1d ledger=[$lo] failed=$(q_failed q-20260911-200000-s0)"

# ── 1e · [old-bug] the same shape with an H line bigger than the limit on its own (the old per-line append failed here too)
clean; printf '%s\n%s\n%s\n' "$S0" "$S1" "$HBIG" > "$FREEZE"; B=$(cks "$FREEZE")
mkq q-20260911-200001-s0 "$(sha_of "$S0")" "$S0"
answer_lim "$LIM" ignore q-20260911-200001-s0 0
[ "$(cks "$FREEZE")" = "$B" ] && [ "$(wave_cls)" = hard ] && [ "$RC" -eq 4 ] && has "$OUT" "$NOLIFT" && [ "$(tmp_left)" -eq 0 ] \
  && pass "1e [old-bug] a 2.3 KB hard line past the limit: FROZEN byte-identical, HARD, nothing lifted" || fail "1e FROZEN=$(nlines) line(s) class $(wave_cls) rc=$RC · $OUT"

# ── 1f · SIGXFSZ NOT ignored (the default action kills the writer): the copy dies mid-write — still refused, identical
clean; printf '%s\n%s\n%s\n' "$S0" "$S1" "$H" > "$FREEZE"; B=$(cks "$FREEZE")
mkq q-20260911-200002-s0 "$(sha_of "$S0")" "$S0"
answer_lim "$LIM" default q-20260911-200002-s0 0
[ "$(cks "$FREEZE")" = "$B" ] && [ "$(wave_cls)" = hard ] && [ "$RC" -eq 4 ] && has "$OUT" "$NOLIFT" && [ "$(tmp_left)" -eq 0 ] \
  && pass "1f SIGXFSZ kills the copy mid-write: refused $(printf '%s' "$OUT" | grep -o '(the copy[^)]*)' | head -1), FROZEN identical, HARD" || fail "1f rc=$RC class $(wave_cls) · $OUT"

# ── 2 · a HARD question's Lift when a DIFFERENT hard line sits past the block boundary: H1 · S1 · H2, lift H1, H2 fails
clean; H1=$(fline "2026-09-11 20:04:00" "GATE ERROR tsc failed" hard gate-error)
printf '%s\n%s\n%s\n' "$H1" "$S1" "$H2" > "$FREEZE"; B=$(cks "$FREEZE")
mkq q-20260911-200003-h1 "$(sha_of "$H1")" "$H1"
answer_lim "$LIM" ignore q-20260911-200003-h1 0
[ "$(cks "$FREEZE")" = "$B" ] && [ "$(wave_cls)" = hard ] && [ "$RC" -eq 4 ] && has "$OUT" "$NOLIFT" \
  && pass "2a hard H1's Lift with hard H2 past the limit: FROZEN identical, HARD (H2 not dropped), nothing lifted" || fail "2a FROZEN=$(nlines) class $(wave_cls) · $OUT"

# ── 3 · a normal Lift (no limit) still removes exactly its own line; the receipt counts what FROZEN holds
clean; printf '%s\n%s\n%s\n' "$S0" "$S1" "$H" > "$FREEZE"
mkq q-20260911-200004-s0 "$(sha_of "$S0")" "$S0"
answer q-20260911-200004-s0 0
[ "$RC" -eq 0 ] && [ "$(cat "$FREEZE")" = "$(printf '%s\n%s' "$S1" "$H")" ] && [ "$(wave_cls)" = hard ] && [ "$(tmp_left)" -eq 0 ] \
  && pass "3a normal Lift of S0: exactly S0 gone, S1 and H byte-for-byte in order, class hard" || fail "3a rc=$RC FROZEN=$(nlines) · $OUT"
has "$OUT" "lifted 1 line(s); 2 still on — a HARD stop is still in force" && has "$OUT" ✓ && [ "$(nlines)" -eq 2 ] \
  && pass "3b receipt 'lifted 1 line(s); 2 still on — a HARD stop…' ✓ matches the 2 lines FROZEN holds" || fail "3b $OUT"
lo=$(last_outcome); has "$lo" "resolved" && pass "3c ledger outcome 'resolved'" || fail "3c ledger=[$lo]"
[ "$(stat -f '%Lp' "$FREEZE")" = 644 ] && pass "3d the rewritten FROZEN is mode 644 (as freeze() leaves it)" || fail "3d mode $(stat -f '%Lp' "$FREEZE")"
# the soft path, and the file-deleted path
clean; printf '%s\n%s\n' "$S0" "$S1" > "$FREEZE"; mkq q-20260911-200005-s0 "$(sha_of "$S0")" "$S0"; answer q-20260911-200005-s0 0
[ "$RC" -eq 0 ] && [ "$(cat "$FREEZE")" = "$S1" ] && has "$OUT" "lifted 1 line(s); 1 soft line(s) still on" && [ "$(wave_cls)" = soft ] \
  && pass "3e soft path: S0 lifted, '1 soft line(s) still on', FROZEN = S1" || fail "3e rc=$RC · $OUT"
mkq q-20260911-200006-s1 "$(sha_of "$S1")" "$S1"; answer q-20260911-200006-s1 0
[ "$RC" -eq 0 ] && [ ! -e "$FREEZE" ] && has "$OUT" "→ unfreeze ✓" && pass "3f the last line lifted: FROZEN removed, receipt 'unfreeze' ✓" || fail "3f rc=$RC · $OUT"
# a normal Lift under the SAME limit when the copy fits: the limit alone does not refuse a legitimate tap
clean; printf '%s\n%s\n%s\n' "$S0" "$H" "$H2" > "$FREEZE"; mkq q-20260911-200007-s0 "$(sha_of "$S0")" "$S0"
answer_lim "$LIM" ignore q-20260911-200007-s0 0
[ "$RC" -eq 0 ] && [ "$(cat "$FREEZE")" = "$(printf '%s\n%s' "$H" "$H2")" ] && has "$OUT" "lifted 1 line(s); 2 still on" \
  && pass "3g under the limit with a copy that fits: the Lift goes through, exactly its line" || fail "3g rc=$RC · $OUT"

# ── 4 · a symlinked FROZEN: the temp lives beside the TARGET (atomic rename there), the link stays a link
clean; mkdir -p "$ROOT/elsewhere"; printf '%s\n%s\n%s\n' "$S0" "$S1" "$H" > "$ROOT/elsewhere/FROZEN.real"; ln -s "$ROOT/elsewhere/FROZEN.real" "$FREEZE"
mkq q-20260911-200008-s0 "$(sha_of "$S0")" "$S0"; answer q-20260911-200008-s0 0
[ "$RC" -eq 0 ] && [ -L "$FREEZE" ] && [ "$(cat "$ROOT/elsewhere/FROZEN.real")" = "$(printf '%s\n%s' "$S1" "$H")" ] && [ "$(tmp_left)" -eq 0 ] \
  && pass "4a symlinked FROZEN: the target rewritten in place of itself, the link kept, no temp left" || fail "4a rc=$RC link=$([ -L "$FREEZE" ] && echo y || echo n) · $OUT"
B=$(cks "$ROOT/elsewhere/FROZEN.real"); mkq q-20260911-200009-s1 "$(sha_of "$S1")" "$S1"
answer_lim "$LIM" ignore q-20260911-200009-s1 0   # the copy (H only) fits the limit → allowed; a failure is forced below
[ "$RC" -eq 0 ] && [ "$(cat "$ROOT/elsewhere/FROZEN.real")" = "$H" ] && pass "4b a second Lift through the link, under a limit the copy fits" || fail "4b rc=$RC · $OUT"
printf '%s\n%s\n%s\n' "$S0" "$S1" "$H" > "$ROOT/elsewhere/FROZEN.real"; B=$(cks "$ROOT/elsewhere/FROZEN.real")
mkq q-20260911-200010-s0 "$(sha_of "$S0")" "$S0"; answer_lim "$LIM" ignore q-20260911-200010-s0 0
[ "$(cks "$ROOT/elsewhere/FROZEN.real")" = "$B" ] && [ -L "$FREEZE" ] && [ "$(wave_cls)" = hard ] && has "$OUT" "$NOLIFT" && [ "$(tmp_left)" -eq 0 ] \
  && pass "4c symlinked FROZEN on a full disk: the target byte-identical, hard, no temp in either directory" || fail "4c · $OUT"

# ── 5 · a crash-left zero-filled tail (bash cannot hold a NUL): the desk refuses rather than write a different file
clean; { printf '%s\n' "$S0"; printf '2026-09-11 20:05:00\tmigration 1: APPLY fai\0\0\0\0'; } > "$FREEZE"; B=$(cks "$FREEZE")
mkq q-20260911-200011-s0 "$(sha_of "$S0")" "$S0"; answer q-20260911-200011-s0 0
[ "$(cks "$FREEZE")" = "$B" ] && [ "$(wave_cls)" = hard ] && [ "$RC" -eq 4 ] && has "$OUT" "$NOLIFT" && has "$OUT" "cannot copy exactly" \
  && pass "5a a NUL-filled tail: refused, FROZEN byte-identical, hard" || fail "5a rc=$RC class $(wave_cls) · $OUT"

# ── 6 · no temp file can be made beside FROZEN (directory not writable): refused with the true reason, identical
clean; mkdir -p "$ROOT/ro"; printf '%s\n%s\n%s\n' "$S0" "$S1" "$H" > "$ROOT/ro/FROZEN"; rm -f "$FREEZE"; ln -s "$ROOT/ro/FROZEN" "$FREEZE"
chmod 555 "$ROOT/ro"; B=$(cks "$ROOT/ro/FROZEN")
mkq q-20260911-200012-s0 "$(sha_of "$S0")" "$S0"; answer q-20260911-200012-s0 0; chmod 755 "$ROOT/ro"
[ "$(cks "$ROOT/ro/FROZEN")" = "$B" ] && [ "$RC" -eq 4 ] && has "$OUT" "$NOLIFT" && has "$OUT" "Permission denied" \
  && pass "6a no temp beside the target: 'nothing lifted … (Permission denied)', FROZEN identical" || fail "6a rc=$RC · $OUT"

# ── 7 · FROZEN keeps raw bytes (slice B): a line with an invalid UTF-8 byte, the desk run under a UTF-8 terminal locale —
#      a legitimate Lift still goes through and the kept lines come back byte-for-byte (BSD tr stops at such a byte, so the
#      raw line sits ABOVE the one lifted: a byte tool left in the terminal locale would miscount and refuse)
clean; SX=$(fline "2026-09-11 20:06:00" "$(printf 'peer hold on \377\376 caf\351')" soft peer-hold)
printf '%s\n%s\n%s\n' "$SX" "$S0" "$H" > "$FREEZE"; mkq q-20260911-200013-s0 "$(sha_of "$S0")" "$S0"
OUT=$(LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8 "$DESK" answer q-20260911-200013-s0 0 2>&1); RC=$?
[ "$RC" -eq 0 ] && [ "$(cks "$FREEZE")" = "$(printf '%s\n%s\n' "$SX" "$H" | cksum)" ] && [ "$(wave_cls)" = hard ] && has "$OUT" "lifted 1 line(s); 2 still on" \
  && pass "7a invalid bytes under a UTF-8 locale: S0 lifted, the raw-byte line and H kept byte-for-byte, class hard" || fail "7a rc=$RC · $OUT"

echo "desk-d2: $passes passed, $fails failed"
[ "$fails" -eq 0 ] || exit 1

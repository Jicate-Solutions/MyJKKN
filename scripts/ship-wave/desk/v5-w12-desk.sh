#!/opt/homebrew/bin/bash
# v5-w12-desk.sh — the desk's file plumbing: list the wave's open questions, apply ONE chosen option, mirror
# them into the Fleet note. The /w12-desk skill (SKILL.md beside this file) does the asking with
# AskUserQuestion; this script does nothing a tap did not authorise.
#
# Director 2026-09-10 05:55 ("Use always AskUserQuestionTool when you need me") and 06:40. Spec:
# scripts/ship-wave/HUMAN-IN-THE-LOOP.md §A2 (answer), §A3 (mirror), §D "resolution memory".
#
# What this may touch — and nothing else:
#   $STATE/questions/**                      the question files and questions.log
#   $STATE/approve-held | allow-destructive | advisory-checks   the wave's three knobs (append only)
#   $STATE/FROZEN                            the `unfreeze` op removes ONLY the line the question was asked about
#                                            (the file goes when no line remains; a hard line above it stays)
#   policy_ratify P<n>                       the `ratify` op (= ship-wave.sh --ratify)
#   $STATE/failure-ledger.jsonl              one record per answered freeze question (append): outcome "resolved"
#                                            when ≥1 write applied and none failed; outcome "refused" (fields
#                                            chosen/reason) when nothing applied — slice D counts ONLY "resolved"
#   $FLEET_MD                                ONLY its "## W12 desk — waiting on you" section
#   $STATE/nudges/<request>.json             Lane E reminders (HUMAN-IN-THE-LOOP.md §E amendments): `nudge-mark` changes a
#                                            PENDING request's status to delivered | tab-closed — nothing else
# It never runs the wave. It never merges. It never invents an option: the writes in the file are the contract.
# An <id> is accepted ONLY in the shape ^q-[0-9]{8}-[0-9]{6}-[a-z0-9][a-z0-9-]{0,39}$ and resolves ONLY to
# $STATE/questions/<id>.json — "answered/q-…" or "../stray" is refused (exit 3) before any path is built
# (2026-09-10: a path-shaped id re-applied an answered question and pulled a file in from outside questions/).
#
# USAGE  v5-w12-desk.sh pending                     JSON list of open questions (unanswered, unexpired), oldest first
#        v5-w12-desk.sh answer <id> <option-index>  apply that option's writes, file → questions/answered/
#                                                   exit 0 applied · 2 no such question / usage / already answered ·
#                                                   3 refused (bad id, op outside the allowlist, malformed value) ·
#                                                   4 partly failed (an unfreeze whose stop changed counts here) ·
#                                                   receipt ✓/✗ per write comes from the op's return code, never
#                                                   from words in the value ('… FAILED gate' applied is ✓) ·
#                                                   5 expired — nothing applied (DESK_ALLOW_EXPIRED=1 overrides)
#        v5-w12-desk.sh answer <id> other "<text>"  store the free text verbatim; apply NOTHING
#        v5-w12-desk.sh mirror                      rewrite the desk section of $FLEET_MD
#        v5-w12-desk.sh nudges                      one line per pending Lane E reminder: <request>|<tab name>|live|dead|unknown|<message>
#                                                   (desk/desk-nudge-targets.sh — how a draft finds the tab that opened it)
#        v5-w12-desk.sh nudge-mark <request> delivered|tab-closed [reason] [tab name]
#                                                   record what the desk did with that reminder · exit 2 not pending · 3 refused
# ENV    STATE     (default ~/.config/obsidian/.ship-wave)   tests point this at a temp dir
#        FLEET_MD  (default the Fleet note synced to the phone)
# INSTALL  ln -sf <ship-policy checkout>/scripts/ship-wave/desk/v5-w12-desk.sh ~/.config/obsidian/v5-w12-desk.sh
set -uo pipefail

# resolve a symlink install back to the repo so the sibling scripts are found (macOS: no readlink -f on old bash)
_self="${BASH_SOURCE[0]}"
while [ -L "$_self" ]; do _t=$(readlink "$_self"); case "$_t" in /*) _self="$_t";; *) _self="$(dirname "$_self")/$_t";; esac; done
SW_DIR="${SHIP_WAVE_DIR:-$(cd "$(dirname "$_self")/.." && pwd)}"

STATE="${STATE:-$HOME/.config/obsidian/.ship-wave}"; mkdir -p "$STATE"
FLEET_MD="${FLEET_MD:-/Users/omm/Vaults/Claude Setup/Fleet/Claude Fleet.md}"
FREEZE="$STATE/FROZEN"
say() { printf '%s\n' "$*"; }

# the wave's own functions, so `ratify` and the ledger record are the wave's, not a re-implementation
. "$SW_DIR/failure-ledger.sh"      # ledger_class · ledger_record · LEDGER
. "$SW_DIR/policy-learning.sh"     # policy_ratify
. "$SW_DIR/desk-questions.sh"      # QUESTIONS_DIR · QUESTIONS_LOG · question_writes_valid

qlog() { printf '%s\t%s\n' "$(date '+%F %T')" "$*" >> "$QUESTIONS_LOG"; }

# ── pending ───────────────────────────────────────────────────────────────────
# Prints a JSON array of open, unexpired, VALID questions, oldest asked_at first. An invalid file (an op
# outside the allowlist) is reported on stderr and left where it is — it must not reach the phone.
cmd_pending() {
  local f why st ids=""
  for f in "$QUESTIONS_DIR"/q-*.json; do
    [ -e "$f" ] || continue
    if ! why=$(question_file_valid "$f"); then
      echo "desk: invalid question $(basename "$f" .json) — $(printf '%s' "$why" | tr '\n\t' '  ') — not asked, not applied" >&2; continue
    fi
    # one file whose expiry cannot be computed is reported and SKIPPED — never lets the whole pass die (NEW-4)
    if ! st=$(question_open_state "$f"); then
      echo "desk: skipped question $(basename "$f" .json) — $(printf '%s' "$st" | tr '\n\t' '  ') — not asked, not applied" >&2; continue
    fi
    case "$st" in
      open*) ids="$ids${st#open } $(basename "$f" .json)
";;
      *) ;;                         # expired: the moment passed; the wave re-asks (refreshes) if it still matters
    esac
  done
  # oldest asked_at first (epoch, then id for a stable order)
  IDS="$(printf '%s' "$ids" | sort -n -k1,1 -k2,2 | awk '{print $2}')" python3 - "$QUESTIONS_DIR" <<'PY'
import json, os, sys
out = []
for i in [i for i in os.environ["IDS"].split("\n") if i]:
    try: out.append(json.load(open(os.path.join(sys.argv[1], i + ".json"))))
    except Exception as e: print(f"desk: skipped question {i} — {type(e).__name__}: {e}", file=sys.stderr)
print(json.dumps(out, indent=1, ensure_ascii=False))
PY
}

# ── answer ────────────────────────────────────────────────────────────────────
# the class a FROZEN copy reads (stdin) — the same fail-safe reading as ship-wave.sh freeze_class_now (slice B; keep in
# step): a line with <3 or >5 tab fields, a class that is not exactly soft|hard, a 5th field that is not a sha1, or no
# line at all counts as hard
_frozen_class_of() {
  local v; v=$(LC_ALL=C awk -F'\t' 'BEGIN{c="soft";n=0} {n++; if (NF<3 || NF>5 || ($3!="soft" && $3!="hard") || (NF==5 && (length($5)!=40 || $5 !~ /^[0-9a-f]+$/))) {c="hard"; exit} if ($3=="hard") c="hard"} END{if (n==0) c="hard"; print c}' 2>/dev/null)
  case "$v" in soft|hard) printf '%s' "$v";; *) printf 'hard';; esac
}
_frozen_rank() { case "$1" in hard) echo 2;; soft) echo 1;; *) echo 0;; esac; }
apply_write() {  # $1 = one write as JSON → prints what it did; returns 1 if the op failed
  local op file value out why
  # the shape rules again, on exactly the write about to be applied — not on what pending or a caller showed earlier
  if ! why=$(question_writes_valid "[$1]"); then echo "write REFUSED ($why)"; return 1; fi
  op=$(printf '%s' "$1" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("op",""))')
  case "$op" in
    append)
      file=$(printf '%s' "$1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["file"])')
      value=$(printf '%s' "$1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["value"])')
      case "$file" in approve-held|allow-destructive|advisory-checks) ;; *) echo "append $file REFUSED (not a knob)"; return 1;; esac
      # a knob edited by hand (phone, printf) may end without '\n'; appending straight on glued '3273'+'3410' into
      # one token that approved NOTHING and destroyed the earlier allow (NEW-2). Start a fresh line first.
      if [ -s "$STATE/$file" ] && [ -n "$(tail -c1 "$STATE/$file")" ]; then { printf '\n' >> "$STATE/$file"; } 2>/dev/null; fi
      # a failed write must SAY so on the receipt (an unwritable knob used to print nothing at all — the ✗ stood alone)
      if { printf '%s\n' "$value" >> "$STATE/$file"; } 2>/dev/null; then echo "append $file $value"
      else echo "append $file $value FAILED (cannot write $STATE/$file)"; return 1; fi ;;
    unfreeze)
      # what ship-wave.sh --unfreeze does — but scoped to the stop the question was ASKED about: the question carries
      # frozen_line (FROZEN's last line when it was written). LINE-SCOPED (round-4 NEW-A = the wave side's H11): FROZEN
      # is append-only, and the phone's `--freeze "peer hold …"` lands a SOFT line on top of an unresolved HARD one;
      # the question is then about the soft line. This op removes ONLY the line(s) equal to frozen_line (after the same
      # flattening on both sides), rewrites the file without them (tmp + mv, atomic) and deletes the file only when no
      # line remains. Consequence: with a hard line still present the wave's freeze_class_now (most-severe-wins,
      # slice B) stays HARD and nothing merges or ships — the desk lifted exactly what it was asked about. If no line
      # matches (a newer or harder stop replaced it, or it was already lifted) this tap lifts nothing: the refusal
      # counts as failed, the question is answered with failed:1, and the wave writes a fresh one for the stop on now.
      if [ "${Q_HAS_FROZEN_LINE:-0}" != 1 ]; then
        echo "unfreeze REFUSED (this question does not name the stop it was asked about — nothing lifted)"; return 1
      fi
      if [ ! -f "$FREEZE" ]; then
        if [ -z "${Q_FROZEN_LINE:-}" ]; then echo "unfreeze (no stop was on)"; return 0; fi
        echo "unfreeze REFUSED (the stop has changed since you were asked — nothing lifted; now: 'no stop on')"; return 1
      fi
      local tgt hop lnk tmp line flat gone=0 last="" q_sha f5 err rc reason="" n_orig n_want n_now want_cls tmp_cls now_cls i
      local -a orig=() keep=() got=()
      local nolift="unfreeze REFUSED — nothing lifted: could not rewrite the stop file"
      # round 6 (X2): the wave writes sha1(fields 1-4) as FROZEN field 5 and puts the same hash in this op as
      # `line_sha1`. When the op carries it, ONLY a line whose field 5 equals it is lifted — the exact line asked
      # about, never a neighbour sharing a flattened prefix. Without it (a hand-shaped question, older files) the
      # FULL flattened line is compared — no 400-char cap on the comparison; the cap is for what is displayed.
      q_sha=$(printf '%s' "$1" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("line_sha1") or "")')
      # round 8 (D2): the rewrite follows the SAME rule as the wave's freeze() (slice B 39c528e96f). It used to append each
      # kept line to a temp file with no error check and rename the short copy over FROZEN: on a full disk the HARD line
      # after a block boundary was silently dropped, one phone tap left FROZEN soft, and the receipt counted lines it never
      # wrote. Now: resolve FROZEN to the file it names (the temp lives in THAT directory, so the rename is atomic) → decide
      # in memory which lines go → write the copy through ONE checked redirect (every printf checked) → verify the copy
      # (line count = original − the chosen lines, every kept line byte-for-byte, class not lower than the original with
      # only those lines removed) → rename. Any failure removes the temp, leaves FROZEN byte-identical and says so.
      tgt="$FREEZE"; hop=0
      while [ -L "$tgt" ] && [ "$hop" -lt 16 ]; do
        lnk=$(readlink "$tgt"); case "$lnk" in /*) tgt="$lnk";; *) tgt="$(dirname "$tgt")/$lnk";; esac; hop=$((hop+1))
      done
      if [ -L "$tgt" ]; then echo "$nolift (too many levels of symbolic links)"; return 1; fi
      if [ ! -f "$tgt" ]; then echo "$nolift (it is not a regular file)"; return 1; fi
      while IFS= read -r line || [ -n "$line" ]; do
        orig+=("$line")
        flat=$(_q_one_line "$line"); last="${flat:0:400}"
        if [ -n "$q_sha" ]; then
          f5=$(printf '%s' "$line" | LC_ALL=C tr -d '\r' | LC_ALL=C awk -F'\t' 'NF>=5 {print $5}')
          if [ -n "$f5" ] && [ "$f5" = "$q_sha" ]; then gone=$((gone+1)); continue; fi
        elif [ -n "$flat" ] && [ "$flat" = "${Q_FROZEN_LINE:-}" ]; then gone=$((gone+1)); continue; fi
        keep+=("$line")
      done < "$tgt"
      if [ "$gone" -eq 0 ]; then
        echo "unfreeze REFUSED (the stop has changed since you were asked — nothing lifted; now: '${last:-no stop on}')"; return 1
      fi
      if [ "${#keep[@]}" -eq 0 ]; then
        # the freeze CLASS (spec §B) lives in the FROZEN line itself; a sidecar, if the wave ever writes one, goes with it
        rm -f "$FREEZE" "$FREEZE.class" 2>/dev/null
        if [ -e "$FREEZE" ] || [ -L "$FREEZE" ]; then echo "unfreeze REFUSED — nothing lifted: could not remove the stop file"; return 1; fi
        echo "unfreeze"; return 0
      fi
      # the in-memory read must hold EVERY byte of the file (bash cannot hold a NUL — a crash can leave a zero-filled
      # tail — and a copy without it would not be the same line): refuse rather than rewrite a different file
      n_orig=$(LC_ALL=C grep -c '' "$tgt" 2>/dev/null)
      if [ "${n_orig:-x}" != "${#orig[@]}" ] \
         || [ "$(printf '%s\n' "${orig[@]}" | wc -c | tr -d ' ')" -ne "$(( $(wc -c < "$tgt") + $( [ "$(tail -c1 "$tgt" | od -An -tx1 | tr -d ' \n')" = 0a ] && echo 0 || echo 1) ))" ]; then
        echo "$nolift (it holds bytes the desk cannot copy exactly — lift it at the Mac with ship-wave.sh --unfreeze)"; return 1
      fi
      # how many lines THIS choice removes, counted from the file itself (not from the loop above)
      if [ -n "$q_sha" ]; then
        n_want=$(( n_orig - $(LC_ALL=C tr -d '\r' < "$tgt" | LC_ALL=C awk -F'\t' -v s="$q_sha" 'NF>=5 && $5==s {n++} END{print n+0}') ))
      else
        n_want=$(( n_orig - gone ))
      fi
      want_cls=$(printf '%s\n' "${keep[@]}" | _frozen_class_of)   # the original with ONLY the chosen lines removed
      if ! tmp=$(mktemp "$(dirname "$tgt")/.FROZEN.tmp.XXXXXX" 2>&1); then
        reason=${tmp##*: }; echo "$nolift (${reason:-no temp file beside it})"; return 1
      fi
      # ONE redirect for the whole copy; inside it every printf is checked (a write that fails ends the copy non-zero)
      err=$( ( for line in "${keep[@]}"; do printf '%s\n' "$line" || exit 1; done ) 2>&1 >"$tmp" ); rc=$?
      if [ "$rc" -ne 0 ]; then
        reason=$(printf '%s' "$err" | head -1 | sed -E 's/^.*: //'); [ -n "$reason" ] || reason="the copy was cut short, rc=$rc"
      else
        while IFS= read -r line || [ -n "$line" ]; do got+=("$line"); done < "$tmp"
        if [ "${#got[@]}" -ne "$n_want" ] || [ "$(LC_ALL=C grep -c '' "$tmp")" -ne "$n_want" ] || [ "${#keep[@]}" -ne "$n_want" ]; then
          reason="the new copy has ${#got[@]} line(s), not $n_want"
        elif [ "$(wc -c < "$tmp" | tr -d ' ')" -ne "$(printf '%s\n' "${keep[@]}" | wc -c | tr -d ' ')" ]; then
          reason="the new copy is short"
        else
          for ((i = 0; i < n_want; i++)); do
            [ "${got[$i]}" == "${keep[$i]}" ] || { reason="line $((i+1)) of the new copy is not the stop file's line"; break; }
          done
          if [ -z "$reason" ]; then
            tmp_cls=$(_frozen_class_of < "$tmp")
            [ "$(_frozen_rank "$tmp_cls")" -ge "$(_frozen_rank "$want_cls")" ] || reason="the new copy would read $tmp_cls, lower than $want_cls"
          fi
        fi
      fi
      if [ -n "$reason" ]; then rm -f "$tmp"; echo "$nolift ($reason)"; return 1; fi
      chmod 644 "$tmp" 2>/dev/null
      if ! err=$(mv -f "$tmp" "$tgt" 2>&1); then
        rm -f "$tmp"; reason=${err##*: }; echo "$nolift (${reason:-the rename failed})"; return 1
      fi
      # the receipt is read from FROZEN itself after the rename — never from a counter
      n_now=$(LC_ALL=C grep -c '' "$tgt" 2>/dev/null); now_cls=$(_frozen_class_of < "$tgt")
      if [ "${n_now:-x}" != "$n_want" ] || [ "$(_frozen_rank "$now_cls")" -lt "$(_frozen_rank "$want_cls")" ]; then
        echo "unfreeze FAILED: FROZEN re-read after the rewrite holds ${n_now:-?} line(s) reading ${now_cls:-?}, not $n_want reading $want_cls"; return 1
      fi
      if [ "$now_cls" = hard ]; then
        echo "unfreeze (lifted $((n_orig - n_now)) line(s); $n_now still on — a HARD stop is still in force: nothing merges or ships until it is lifted)"
      else
        echo "unfreeze (lifted $((n_orig - n_now)) line(s); $n_now soft line(s) still on)"
      fi ;;
    ratify)
      value=$(printf '%s' "$1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["value"])')
      if out=$(policy_ratify "$value" 2>&1); then echo "ratify $value"; else echo "ratify $value FAILED: $out"; return 1; fi ;;
    noop) echo "noop" ;;
    *) echo "op $op REFUSED"; return 1 ;;
  esac
}

# cmd_answer holds one lock for the whole answer (belt) and CLAIMS the file by renaming it into answered/ before
# anything is applied (braces): rename(2) is atomic on one filesystem, so of two desk processes answering the
# same id at once exactly one owns the file — the other finds it gone and exits 2 with nothing written.
# (2026-09-10 NEW-1: two concurrent answers both appended, both logged, both hit the ledger — two identical
# "resolved" records is exactly what slice D turns into a rule proposal, so ONE tap could have proposed a rule.)
cmd_answer() {
  local rc
  mkdir -p "$QUESTIONS_DIR"
  exec 9>>"$QUESTIONS_DIR/.lock"
  # flock(2) on the inherited fd: the lock belongs to the open file description, so it outlives the python
  # child and is held until fd 9 is closed below (macOS ships no flock(1) binary)
  python3 -c 'import fcntl; fcntl.flock(9, fcntl.LOCK_EX)' 2>/dev/null || true
  _cmd_answer_locked "$@"; rc=$?
  exec 9>&-
  return $rc
}

_cmd_answer_locked() {
  local id="$1" choice="${2:-}" text="${3:-}" f ans why st n idx label kind cls title writes applied="" failed=0 ok=0 receipt="" w rc out
  # the id is a NAME, never a path: anything outside the shape is refused before a path is even built
  if ! question_id_valid "$id"; then
    echo "desk: REFUSED — '$(printf '%s' "$id" | tr '\000-\037\177' '?' | cut -c1-80)' is not a question id (q-YYYYmmdd-HHMMSS-<slug>, [a-z0-9-]). Nothing applied."
    qlog "refused	$(printf '%s' "$id" | tr '\000-\037\177' '?' | cut -c1-80)	not a question id"; return 3
  fi
  f="$QUESTIONS_DIR/$id.json"; ans="$QUESTIONS_DIR/answered/$id.json"
  # a symlink at <id>.json resolves OUTSIDE the question file (its own answered copy, a file outside questions/):
  # refused before it is read or moved (NEW-G: mv put a self-pointing link over the answered record)
  if [ -L "$f" ]; then
    echo "desk: REFUSED $id — questions/$id.json is a symlink, not a question file. Nothing applied."; qlog "refused	$id	symlink"; return 3
  fi
  [ -f "$f" ] || { echo "desk: no open question $id"; [ -f "$ans" ] && echo "  (already answered)"; return 2; }
  # an id that was answered before must not overwrite its record: a re-used id is refused, the new file left in place
  if [ -e "$ans" ] || [ -L "$ans" ]; then
    echo "desk: REFUSED $id — answered/$id.json already exists (this id was answered before; the record is kept). Nothing applied."; qlog "refused	$id	id re-used"; return 3
  fi
  # the allowlist and the shape rules are checked HERE, on the file as it is now — not on what pending showed earlier
  if ! why=$(question_file_valid "$f"); then
    why=$(printf '%s' "$why" | tr '\n\t' '  ')
    echo "desk: REFUSED $id — $why. Nothing applied; the file is left in place for a human to read."
    qlog "refused	$id	$why"; return 3
  fi
  # an expired question is a moment that passed: the desk never showed it, so a tap on it is a stale id typed by
  # hand or a race across the expiry instant (NEW-6). Refused unless a human says DESK_ALLOW_EXPIRED=1.
  if ! st=$(question_open_state "$f"); then
    echo "desk: REFUSED $id — $(printf '%s' "$st" | tr '\n\t' '  '). Nothing applied."; qlog "refused	$id	$st"; return 3
  fi
  case "$st" in
    expired*) if [ "${DESK_ALLOW_EXPIRED:-0}" != 1 ]; then
                echo "desk: $id expired — nothing applied (asked $(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["asked_at"])' "$f"); set DESK_ALLOW_EXPIRED=1 to answer it anyway)"
                qlog "refused	$id	expired"; return 5
              fi ;;
  esac
  case "$choice" in other) ;; ''|*[!0-9]*) echo "desk: option index must be a number or 'other', got '$choice'"; return 2;; esac
  if [ "$choice" != other ]; then
    n=$(python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))["options"]))' "$f")
    [ "$choice" -lt "$n" ] || { echo "desk: $id has $n options (0..$((n-1))), got $choice"; return 2; }
  fi
  # ── CLAIM: the move comes FIRST. If it fails the file is gone — another answer owns it. Apply nothing. ──
  if ! mv "$f" "$ans" 2>/dev/null; then
    echo "desk: no open question $id"; echo "  (already answered)"; return 2
  fi
  f="$ans"   # from here on, everything is read from and recorded into the claimed copy
  kind=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["kind"])' "$f")
  cls=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("class",""))' "$f")
  title=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("title",""))' "$f")
  if [ "$choice" = "other" ]; then
    # free text: stored verbatim, applies NOTHING (spec §A2.4) — the next receipt surfaces it for a human
    CH=other TXT="$text" python3 - "$f" <<'PY'
import json, os, sys, datetime
q = json.load(open(sys.argv[1]))
q.update({"answered_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
          "chosen": "other", "other_text": os.environ["TXT"], "applied": []})
json.dump(q, open(sys.argv[1], "w"), indent=1, ensure_ascii=False)
PY
    qlog "answered	$id	other	$(printf '%s' "$text" | tr '\n\t' '  ' | cut -c1-200)"
    echo "$id → other (stored, nothing applied): $(printf '%s' "$text" | cut -c1-80)"
    return 0
  fi
  idx="$choice"
  label=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["options"][int(sys.argv[2])]["label"])' "$f" "$idx")
  writes=$(python3 -c 'import json,sys;print(json.dumps(json.load(open(sys.argv[1]))["options"][int(sys.argv[2])]["writes"]))' "$f" "$idx")
  # the stop this question was asked about, for the scoped `unfreeze` (absent key ≠ empty string)
  Q_HAS_FROZEN_LINE=$(python3 -c 'import json,sys;print(1 if "frozen_line" in json.load(open(sys.argv[1])) else 0)' "$f")
  Q_FROZEN_LINE=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("frozen_line") or "")' "$f")
  export Q_HAS_FROZEN_LINE Q_FROZEN_LINE
  # apply, one op at a time, in the order written — exactly these and no others
  while IFS= read -r w; do
    [ -n "$w" ] || continue
    if out=$(apply_write "$w"); then rc=0; ok=$((ok+1)); else rc=1; failed=$((failed+1)); fi
    applied="$applied${applied:+
}$out"
    # ✓/✗ is the op's RETURN CODE — never a word match on the value ('SDK review FAILED gate' applied is ✓; NEW-E)
    receipt="$receipt$id → $out $([ "$rc" -eq 0 ] && echo ✓ || echo ✗)
"
  done < <(printf '%s' "$writes" | python3 -c 'import json,sys
for w in json.load(sys.stdin): print(json.dumps(w))')
  APPLIED="$applied" IDX="$idx" LABEL="$label" FAILED="$failed" python3 - "$f" <<'PY'
import json, os, sys, datetime
q = json.load(open(sys.argv[1]))
q.update({"answered_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
          "chosen": os.environ["LABEL"], "chosen_index": int(os.environ["IDX"]),
          "applied": [a for a in os.environ["APPLIED"].split("\n") if a]})
if int(os.environ["FAILED"]): q["failed"] = int(os.environ["FAILED"])
json.dump(q, open(sys.argv[1], "w"), indent=1, ensure_ascii=False)
PY
  qlog "answered	$id	$idx	$label	$(printf '%s' "$applied" | tr '\n' ';')"
  # resolution memory (spec §D): a decided freeze becomes evidence the policy learner can count — but ONLY a decision
  # that took effect. An answer whose writes all failed or were refused (stop changed, unwritable knob) records outcome
  # "refused" with chosen + reason instead (NEW-B: two refused taps proposed AUTO_<CLASS>_UNFREEZE from decisions that
  # applied nothing). Slice D counts "resolved" records only.
  if [ "$kind" = "freeze" ]; then
    if [ "$ok" -ge 1 ] && [ "$failed" -eq 0 ]; then
      ledger_record resolved "desk: $title → $label" "$cls" \
        "$(L="$label" W="$writes" python3 -c 'import json,os;print(json.dumps({"chosen":os.environ["L"],"writes":json.loads(os.environ["W"])}))')"
    else
      ledger_record refused "desk: $title → $label (nothing applied)" "$cls" \
        "$(L="$label" A="$applied" F="$failed" python3 -c 'import json,os;print(json.dumps({"chosen":os.environ["L"],"reason":" ; ".join(a for a in os.environ["A"].split("\n") if a)[:400],"failed":int(os.environ["F"])}))')"
    fi
  fi
  printf '%s' "$receipt"
  [ "$failed" -eq 0 ] || return 4
}

# ── mirror ────────────────────────────────────────────────────────────────────
# Rewrites ONLY the "## W12 desk — waiting on you" section of $FLEET_MD (appended at the end when absent).
# Everything outside that section is left byte-for-byte. Phone visibility without the tab (spec §A3).
# Section = from the EXACT heading line (optionally "(n)") to the next markdown heading (any `#…` line) or EOF;
# heading lines inside a CLOSED ``` / ~~~ fence do not count, so a fenced example of the heading is not the
# section and a fenced '## ' inside the stale section does not end it early. A fence that never closes is not
# a fence (it would otherwise swallow the section and grow the note every pass). If the heading appears twice,
# both copies are replaced by ONE.
# Every line the section emits from question text is a quote ("> …") or an indented list item, so no question
# body, title or label can ever START a heading or a fence and grow the note on the next pass (2026-09-10).
cmd_mirror() {
  local pend; pend=$(cmd_pending 2>/dev/null)
  local invalid=""; local f why
  for f in "$QUESTIONS_DIR"/q-*.json; do
    [ -e "$f" ] || continue
    why=$(question_file_valid "$f") || invalid="$invalid$(basename "$f" .json): $(printf '%s' "$why" | tr '\n\t' '  ')
"
  done
  [ -f "$FLEET_MD" ] || { mkdir -p "$(dirname "$FLEET_MD")"; : > "$FLEET_MD"; }
  PEND="$pend" INVALID="$invalid" python3 - "$FLEET_MD" <<'PY'
import json, os, re, sys, datetime
HEAD = "## W12 desk — waiting on you"
HEADING = re.compile(r"^ {0,3}#{1,6}( |\t|$)")           # any ATX heading, as markdown reads it
FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})")
CTRL = re.compile(r"[\x00-\x1f\x7f]+")
def flat(s):  # one line, no control characters — for anything rendered inline
    return CTRL.sub(" ", str(s)).strip()
qs = json.loads(os.environ["PEND"]); inv = os.environ["INVALID"].strip().split("\n") if os.environ["INVALID"].strip() else []
lines = [HEAD + (f" ({len(qs)})" if qs else ""), ""]
if not qs:
    lines.append("nothing waiting")
for n, q in enumerate(qs, 1):
    lines.append(f"**{n}. [{flat(q['kind'])}] {flat(q['title'])}**")
    body = str(q.get("body") or "").replace("\r\n", "\n").replace("\r", "\n")
    for b in body.split("\n"):
        if body.strip(): lines.append("> " + CTRL.sub(" ", b).rstrip())
    for i, o in enumerate(q["options"]):
        rec = " (Recommended)" if i == q.get("recommended", 0) else ""
        lines.append(f"  {i + 1}. **{flat(o['label'])}**{rec} — {flat(o.get('description', ''))}")
    lines.append(f"  answer in the desk tab: /w12-desk · id `{flat(q['id'])}` · asked {flat(q['asked_at'])[:16].replace('T', ' ')}")
    lines.append("")
for i in inv:
    lines.append(f"⚠ invalid question, not askable: {flat(i)}")
lines.append(f"_desk mirror {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}_")
# belt and braces: nothing the section emits may read as a heading or a fence to the next pass
sec = [lines[0]] + [("> " + l if (HEADING.match(l) or FENCE.match(l)) else l) for l in lines[1:]]
while sec and sec[-1] == "": sec.pop()
p = sys.argv[1]; src = open(p, encoding="utf-8").read()
rows = src.split("\n")
# classify rows: which are inside a CLOSED fence. A fence that never closes before EOF is not a fence here —
# otherwise one forgotten ``` above the section hid the section from this pass, and every pass appended a
# fresh copy (2026-09-10 NEW-5: 339 → 1387 bytes over 5 passes). A fenced EXAMPLE of the heading (closed) is
# still not the section.
in_fence = [False] * len(rows)
i = 0
while i < len(rows):
    m = FENCE.match(rows[i])
    if not m: i += 1; continue
    fence = m.group(1); close = None
    for j in range(i + 1, len(rows)):
        mc = FENCE.match(rows[j])
        if mc and mc.group(1)[0] == fence[0] and len(mc.group(1)) >= len(fence) and rows[j].strip() == mc.group(1): close = j; break
    if close is None: i += 1; continue          # unclosed: not a fence — its lines are plain lines
    for j in range(i, close + 1): in_fence[j] = True
    i = close + 1
# the section STARTS at the exact heading (optionally with the open count), nowhere else: '## W12 desk — waiting
# on you-archive' is somebody else's section
START = re.compile(r"^" + re.escape(HEAD) + r"( \(\d+\))?\s*$")
starts = [i for i, r in enumerate(rows) if not in_fence[i] and START.match(r)]
if not starts:
    out = src + ("" if src.endswith("\n") or not src else "\n") + ("\n" if src else "") + "\n".join(sec) + "\n"
else:
    keep = [True] * len(rows)
    for s0 in starts:
        e = next((j for j in range(s0 + 1, len(rows)) if not in_fence[j] and HEADING.match(rows[j])), len(rows))
        for j in range(s0, e): keep[j] = False
    first = starts[0]
    tail = [rows[j] for j in range(first, len(rows)) if keep[j]]
    out_rows = rows[:first] + sec + [""] + tail
    if not tail:                      # the section is last: end the file with exactly one newline
        out_rows = rows[:first] + sec + [""]
    out = "\n".join(out_rows)
open(p, "w", encoding="utf-8").write(out)
print(f"desk: mirrored {len(qs)} open question(s) into {os.path.basename(p)}")
PY
}

case "${1:-}" in
  pending) cmd_pending ;;
  answer)  [ -n "${2:-}" ] && [ -n "${3:-}" ] || { echo "usage: v5-w12-desk.sh answer <id> <option-index> | answer <id> other \"<text>\""; exit 2; }
           cmd_answer "$2" "$3" "${4:-}" ;;
  mirror)  cmd_mirror ;;
  # Lane E reminders (Director 2026-09-11 22:3x: "Message the tab …"): the resolution lives in one tested script beside
  # this one; the desk tab sends the line with SendMessage and records the result through nudge-mark
  nudges)     STATE="$STATE" "${BASH:-/opt/homebrew/bin/bash}" "$SW_DIR/desk/desk-nudge-targets.sh" list ;;
  nudge-mark) shift; STATE="$STATE" "${BASH:-/opt/homebrew/bin/bash}" "$SW_DIR/desk/desk-nudge-targets.sh" mark "$@" ;;
  *) sed -n '/^# USAGE/,/^# INSTALL/p' "$_self"; exit 2 ;;
esac

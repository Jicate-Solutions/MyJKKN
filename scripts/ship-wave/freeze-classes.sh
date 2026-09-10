#!/bin/bash
# freeze-classes.sh — the ONE table that says whether a freeze is soft or hard.
#
# Sourced by ship-wave.sh (freeze(), freeze_class_now, the merge/deploy gates — slice B) AND by
# policy-learning.sh (slice D: an "unfreeze" answer to a HARD class can never become a rule). HUMAN-IN-THE-LOOP.md,
# "Amendments from the build": "NEVER_RULE must be a single shared source of truth with B's classify_freeze. D must
# not keep its own HARD_CLASS list" — the verifier found D's hand-copied regex 10 rows behind this table (NEW-9).
# One file, one function, two readers: a row added here is a row both of them see.
#
# classify_freeze below is copied VERBATIM from ship-wave.sh in the hitl/freeze-classes worktree, commit 65acbd8d14
# ("fix(ship-wave): one deploy gate, Vercel as the truth for 'main ahead', ledger_class on the FROZEN line"). Edit it
# HERE only; ship-wave.sh sources this file instead of defining its own copy.
#
# Contract: `classify_freeze <raw freeze message>` prints soft|hard on stdout. rc=0 when a row matched; rc=1 when no
# row matched — the printed class is then `hard` (fail safe: an unknown stop is treated as production broken).

classify_freeze() {  # $1 = freeze message → prints soft|hard; returns 1 when the message matched no row (→ hard)
  case "$1" in
    *deploy*ERROR*|*deploy*CANCELED*|*"deploy failed"*|*"APPLY failed"*|*"DRY-RUN failed"*|*"destructive statement"*|*"GATE ERROR"*|*"migration gap"*|*"cannot read"*|*"history query failed"*)
      printf 'hard'; return 0;;
    # apply-migrations.sh: the SQL ran but the history row or the verify read did not — main and the schema disagree
    *"history insert failed"*|*"verify read did not find"*)
      printf 'hard'; return 0;;
    # a page or route that broke AFTER the deploy is production broken — the spec's own definition of hard
    *"broken page"*|*"post-deploy sweep failed"*|*"baseline bounce"*)
      printf 'hard'; return 0;;
    # soft rows are ANCHORED phrases, not bare substrings: `*hold*` used to turn "threshold"/"uphold" soft (verifier 2026-09-10)
    *"peer hold"*|*"Director hold"*|*"director hold"*|*"on hold"*|*"files on jicate/main match"*|*UNRESOLVABLE*|*policy*|*advisory*)
      printf 'soft'; return 0;;
    *) printf 'hard'; return 1;;
  esac
}

# classify_freeze_slug <ledger_class slug> → soft|hard, same rc contract as classify_freeze.
# The failure ledger, the desk's questions and the policy proposals key on ledger_class(message): lowercase, digits
# → N/VERSION/PR, every non-letter → space. The table above is written for the RAW message ("APPLY failed",
# "deploy … CANCELED"), so a slug only matches it case-insensitively — this wrapper turns nocasematch on for one call
# and restores it. Rows whose phrase carries punctuation ("DRY-RUN failed", "files on jicate/main match") cannot
# match a slug at all and fall to the default: hard, rc=1. Callers that hold the raw froze message (the ledger keeps
# it on the `froze` line) should prefer classify_freeze on that; this is the fallback when only the slug is known.
classify_freeze_slug() {
  local was r rc
  was=$(shopt -p nocasematch)          # "shopt -s nocasematch" or "shopt -u nocasematch" — restored below
  shopt -s nocasematch
  r=$(classify_freeze "$1"); rc=$?
  eval "$was"
  printf '%s' "$r"; return $rc
}

# classify_freeze_batch — stdin: NUL-separated items, each "R<raw message>" or "S<ledger slug>"; stdout: one line per
# item — soft | hard | unknown (unknown = matched no row; the table's own verdict for that is hard). For a caller
# in another language (policy-learning.sh's python scan) that must never re-implement the table.
classify_freeze_batch() {
  local s r
  while IFS= read -r -d '' s; do
    case "${s:0:1}" in
      S) if r=$(classify_freeze_slug "${s:1}"); then printf '%s\n' "$r"; else printf 'unknown\n'; fi;;
      *) if r=$(classify_freeze "${s:1}");      then printf '%s\n' "$r"; else printf 'unknown\n'; fi;;
    esac
  done
}

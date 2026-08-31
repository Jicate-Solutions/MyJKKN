#!/usr/bin/env bash
#
# scripts/ci/filter-tsc-scoped-errors.sh
#
# Reads the output of a `tsc --noEmit` run and fails ONLY on type errors in the
# files a pull request touched. Everything else in the ~1,400-error legacy
# baseline is ignored on purpose — see .github/workflows/typecheck-pr-scoped.yml
# for why the gate is PR-scoped rather than repo-wide.
#
# ─── WHY THIS IS A SCRIPT AND NOT SIX LINES OF INLINE YAML ────────────────────
#
# Because the six lines of inline YAML were wrong for their entire lifetime and
# nothing could tell us. This filter is the whole gate: get it wrong and the job
# still goes green, still prints a reassuring message, and still reports success.
# A gate whose failure mode is "passes" has to be executable outside CI so it can
# be driven against fixtures. __tests__/ci/filter-tsc-scoped-errors.test.ts does
# exactly that.
#
# ─── THE BUG THIS SCRIPT EXISTS TO FIX ───────────────────────────────────────
#
# `npm run typecheck` is `tsc --noEmit --pretty`. `--pretty` is an explicit flag,
# not a TTY probe, so tsc emits ANSI colour codes EVEN WHEN REDIRECTED TO A FILE.
# A real error line, byte for byte, is:
#
#     ESC[96mpath/file.ts ESC[0m : ESC[93m2 ESC[0m : ... - ESC[91merror ESC[0m ...
#
# (spaces added for readability; there are none in the real output).
#
# The old filter was `grep -E "^($escaped):"` against that raw text. It cannot
# match, for TWO independent reasons:
#   1. the `^` anchor lands on ESC, not on the first character of the path; and
#   2. even unanchored, `path:` fails because ESC[0m sits between the filename
#      and the colon.
# So scoped_count was ALWAYS 0, the gate always took its `exit 0` branch, and it
# always printed "none in PR-touched files. Pass."
#
# RECEIPT, not theory. PR #2891 (merged 2026-08-13, 8169b59d91) changed exactly
# one file, app/api/cron/aipulse-domain-starter-notify/route.ts, and left NINE
# type errors in it — six `TS2304: Cannot find name`, two TS18004, one TS2552 —
# while `TypeCheck (PR-scoped)` reported conclusion=success on head bed455df36.
# The PR head blob and main's blob are the same git object (0aab25de8d), so this
# was not lost in a merge; CI genuinely passed it. Re-measured 2026-08-16.
#
# THE FIX is to stop depending on tsc's output formatting at all: normalise the
# output first (strip ANSI, and rewrite tsc's other diagnostic shape into the one
# the filter reads), then match. Deleting `--pretty` from package.json would also
# have worked today, and would have left the gate one flag-change away from
# silently dying again — which is the failure mode we are here to end. Note that
# dropping the flag does not merely remove colour: it switches tsc to
# `path(LINE,COL): error` and would have broken the filter a second way.
#
# ─── THE SECOND WAY IT PASSED WITHOUT CHECKING ANYTHING ──────────────────────
#
# `tsc_exit` was captured and never read. If tsc CRASHES — this project OOMs at
# the default heap ("Abort trap: 6" locally) — the output holds a crash message,
# zero error lines, scoped_count is 0, and the gate passes identically. "tsc did
# not run" and "tsc found nothing" were the same silence.
#
# It cannot simply fail on a non-zero exit: tsc exits non-zero whenever ANY type
# error exists, and the baseline guarantees thousands. So the guard is the
# conjunction — non-zero exit AND not one line anywhere in the output shaped like
# a tsc diagnostic. That combination means tsc never got far enough to report,
# and it is the only combination that does.
#
# ─── USAGE ───────────────────────────────────────────────────────────────────
#
#   filter-tsc-scoped-errors.sh --tsc-output <file> --changed <file> --tsc-exit <n>
#
#   --tsc-output  raw captured stdout+stderr of the tsc run (ANSI or not)
#   --changed     newline-separated .ts/.tsx paths this PR added or modified
#   --tsc-exit    the exit status of that tsc run
#
# Exit 0 = no type errors in PR-touched files. Exit 1 = there are, or tsc died.

set -uo pipefail

tsc_output=""
changed=""
tsc_exit=""

while [ $# -gt 0 ]; do
  case "$1" in
    --tsc-output) tsc_output="${2:-}"; shift 2 ;;
    --changed)    changed="${2:-}";    shift 2 ;;
    --tsc-exit)   tsc_exit="${2:-}";   shift 2 ;;
    *) echo "::error::filter-tsc-scoped-errors.sh: unknown argument '$1'"; exit 1 ;;
  esac
done

for required in tsc_output changed tsc_exit; do
  if [ -z "${!required}" ]; then
    echo "::error::filter-tsc-scoped-errors.sh: --${required//_/-} is required."
    exit 1
  fi
done

if [ ! -f "$tsc_output" ]; then
  echo "::error::The typecheck produced no output file at '$tsc_output'. Treating as a crash, not a pass."
  exit 1
fi

# ── 1. Normalise the output: strip ANSI, and unify both diagnostic shapes ────
#
# (a) ANSI. A literal ESC byte rather than \x1b: GNU sed understands \x1b, BSD
#     sed (what a developer running these tests on a Mac has) does not, and a
#     filter that silently strips nothing on one platform is how this gate broke
#     in the first place.
#
# (b) tsc has TWO diagnostic formats and the flag alone decides which:
#         --pretty  →  path:LINE:COL - error TSnnnn: message
#         plain     →  path(LINE,COL): error TSnnnn: message
#     Verified against tsc 5.6.3 on 2026-08-16. Stripping colour is therefore not
#     enough on its own to make this gate flag-independent — dropping --pretty
#     from package.json would change the punctuation and the filter would go back
#     to matching nothing, silently, exactly as before. Rewriting the plain shape
#     into the pretty one costs one substitution and removes the flag from the
#     gate's correctness entirely. `.*` is greedy on purpose: `app/(routes)/…`
#     paths contain parentheses of their own, so the split must anchor on the
#     LAST "(digits,digits): error" in the line.
esc=$(printf '\033')
plain="${tsc_output}.plain"
sed -E \
  -e "s/${esc}\[[0-9;]*[a-zA-Z]//g" \
  -e 's/^(.*)\(([0-9]+),([0-9]+)\): (error|warning) /\1:\2:\3 - \4 /' \
  "$tsc_output" > "$plain"

# ── 2. Did tsc actually run to completion? ───────────────────────────────────
# Non-zero exit is NORMAL here (the legacy baseline guarantees it). Non-zero exit
# with no diagnostic anywhere in the output is not — that is a crash.
if [ "$tsc_exit" -ne 0 ] && ! grep -qE 'error TS[0-9]+' "$plain"; then
  echo "::error::The typecheck itself failed to run (tsc exited $tsc_exit and reported no diagnostics at all)."
  echo ""
  echo "This is NOT 'no type errors were found'. tsc never got far enough to look."
  echo "The usual cause on this repository is the compiler running out of heap"
  echo "(look for 'Abort trap', 'JavaScript heap out of memory', or a stack trace"
  echo "below); a broken tsconfig or a failed install do the same thing."
  echo ""
  echo "--- last 30 lines of the typecheck output ---"
  tail -30 "$plain"
  exit 1
fi

# ── 3. Build the regex of changed paths (escaped for grep -E) ────────────────
escaped=$(sed 's/[][\.*^$(){}?+|/]/\\&/g' "$changed" | tr '\n' '|' | sed 's/|$//')

if [ -z "$escaped" ]; then
  echo "::notice::No changed files to filter against. Pass."
  exit 0
fi

# ── 4. Keep only diagnostics whose path is one this PR touched ───────────────
# tsc errors look like:  path/file.tsx:LINE:COL - error TSnnn: message
# The `^` anchor matters beyond tidiness: tsc's trailing "Errors  Files" summary
# repeats every path INDENTED, and without the anchor each error would be counted
# twice.
scoped="${tsc_output}.scoped"
grep -E "^($escaped):" "$plain" > "$scoped" || true
scoped_count=$(wc -l < "$scoped" | tr -d ' ')

if [ "$scoped_count" -eq 0 ]; then
  echo "::notice::tsc found errors elsewhere (legacy baseline, ignored) but none in PR-touched files. Pass."
  echo "(tsc exited $tsc_exit — baseline state, not failing this PR.)"
  exit 0
fi

echo "::error::tsc found $scoped_count type error(s) in files this PR modified:"
echo ""
head -50 "$scoped" | while IFS= read -r line; do
  # Convert "path:LINE:COL - error TSnnn: msg" to a GitHub annotation
  file=$(echo "$line" | cut -d':' -f1)
  ln=$(echo "$line" | cut -d':' -f2)
  msg=$(echo "$line" | cut -d':' -f3-)
  echo "::error file=$file,line=$ln::$msg"
done

echo ""
echo "Note: next.config.ts has \`typescript.ignoreBuildErrors: true\` so the Vercel build will not fail on these. This gate exists BECAUSE of that mask. Fix or downgrade the type before merge."
exit 1

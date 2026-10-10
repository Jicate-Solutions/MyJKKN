#!/bin/bash
# Stacked rehearsal: 20270603090000 on top of the salary approvals that are
# already on main and live: 20270519090000 + #4140 (20270524090000) + #4190
# (20271007150103) + #4252 (20271007180207), on a THROWAWAY local PostgreSQL 16.
# Touches no real database: the only connection is 127.0.0.1:$PORT to a
# cluster this script creates and deletes.
#
# The stack is built exactly as supabase/tests/hr-salary-revision/run-targets.sh
# builds it (same real objects, same stubs and seed, read from that folder and
# not changed). Then:
#   1. #4140 + #4190's probe (probe.sql) and #4252's (probe-targets.sql), on the
#      stack WITHOUT and WITH this file. Every line that passes without it and
#      fails with it is printed; run.sh fails if one appears that is not on the
#      EXPECTED list below (each one is a refusal this PR adds on purpose).
#   2. coexist.sql on the stack with this file: both guards fire, and the
#      approvals job still sends an overdue yes back and writes the next one.
# Run: bash supabase/tests/hr-salary-no-backdating/run-stacked.sh  (PORT= to move it)
set -u
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
BIN=${PG_BIN:-${PGBIN:-/opt/homebrew/opt/postgresql@16/bin}}
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/../../.." && pwd)"
M="$SRC/supabase/migrations"
RV="$SRC/supabase/tests/hr-salary-revision"
FN="$SRC/supabase/setup/02_functions.sql"
MINE="${MIG:-$M/20270603090000_hr_salary_no_backdating.sql}"
PORT=${PORT:-54623}
WORK="$(mktemp -d)"
DATA="$WORK/pgdata"
PSQL=("$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d rehearsal -X -q)
cat "$M/20270519090000_hr_salary_revision_requests.sql" \
    "$M/20270524090000_hr_salary_revision_director_list.sql" \
    "$M/20271007150103_hr_salary_revision_no_self_decision.sql" \
    "$M/20271007180207_hr_salary_revision_target_gated_raises.sql" > "$WORK/stack.sql"
teardown() { "$BIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null 2>&1; rm -rf "$WORK"; }
trap teardown EXIT

# Lines of the approvals probes that this PR turns from PASS into FAIL ON
# PURPOSE. Each is named, so a new flip is never waved through. Read one by one
# on 8 Oct 2026; every one is a write by the HR head (H) or by a super admin
# who is not on the Director list (S):
#  a) STILL REFUSED, by a different rule. The probe compares the exact words of
#     #4190's refusal; with this PR the "Only the Director can change a
#     salary." check (function and table guard) answers first, so the words
#     differ. Nothing is written either way.
#  b) NOW REFUSED, on purpose (30 Sep 08:59 ruling: only the Director list
#     writes pay; the HR head only looks). #4190 let the HR head change an
#     ordinary person's pay and record a new joiner's first pay before the
#     record is linked; with this PR only the Director list can.
EXPECTED_FLIPS="$WORK/expected.txt"
cat > "$EXPECTED_FLIPS" <<'TXT'
a direct delete of one's own pay row, or a list member's, is still refused
nobody changes their own pay on Employee Salaries
the HR head cannot change the pay of someone on the Director list
unlinking your own record does not let you change your own pay
unlinking the Director's record does not let the HR head change his pay
nobody signed in changes the pay of a record linked to no account
nor does a super admin
the Director's pay cannot be changed by the HR head even when he is off the list
the HR head still changes an ordinary person's pay on Employee Salaries
HR still sets the pay of a new joiner with no account and nobody's email
a new joiner's first pay can be set before the record is linked, but not changed after
a linked ordinary person's pay is still changed by HR
TXT

"$BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null || exit 1
"$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" \
  -l "$WORK/pg.log" -w start >/dev/null || { cat "$WORK/pg.log"; exit 1; }
echo "== stacked: server $("$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -tAc 'select version()' | cut -c1-40)"

# The real objects the stack builds on, cut from the repo as run-targets.sh does.
{ sed -n '57,65p' "$FN"; sed -n '4119,4127p' "$FN"; sed -n '3422,3451p' "$FN"; sed -n '6740,6797p' "$FN"; } > "$WORK/helpers.sql"
[ "$(grep -c 'CREATE OR REPLACE FUNCTION' "$WORK/helpers.sql")" = 4 ] || { echo "   helper extraction failed"; exit 1; }
awk '/^CREATE OR REPLACE FUNCTION public.fn_my_staff_ids\(\)/,/^GRANT EXECUTE ON FUNCTION public.fn_my_staff_ids\(\) TO authenticated;/' \
  "$M/20260801002600_hr_leave_rls_permission_retrofit.sql" > "$WORK/my-staff-ids.sql"
awk '/^CREATE OR REPLACE FUNCTION public.fn_my_staff_institution_ids\(\)/,/^GRANT EXECUTE ON FUNCTION public.fn_my_staff_institution_ids\(\)/' \
  "$M/20270330090000_institution_department_contacts.sql" > "$WORK/my-staff-inst.sql"
sed -n '/^-- 5\. fn_hr_set_staff_salary/,/^-- 6\. hr_staff_salary_directory/p' \
  "$M/20260902100000_hr_tds_slabs_and_allowance.sql" > "$WORK/set-salary.sql"
cp "$M/20270520090000_the_director_list.sql" "$WORK/pr4121.sql" || exit 1
cat > "$WORK/salary-columns.sql" <<'SQL'
ALTER TABLE public.hr_staff_salaries
  ADD COLUMN IF NOT EXISTS epf_amount       numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS eligible_for_esi boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS esi_amount       numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.hr_staff_salaries
  ADD COLUMN IF NOT EXISTS allowance_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allowance_label  text;
SQL

build() {  # $1 = "mine" to apply this PR's file (twice) after the stack, $2 = "targets" for seed-targets.sql
  local PGOPTIONS="-c client_min_messages=warning"; export PGOPTIONS
  "$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -q -c "DROP DATABASE IF EXISTS rehearsal" -c "CREATE DATABASE rehearsal" || return 1
  local f
  for f in "$RV/stubs.sql" "$M/20260515001001_sync_staff_to_profiles_login_disabled.sql" \
           "$M/20251015_fix_staff_trigger_timing.sql" "$WORK/helpers.sql" "$WORK/my-staff-ids.sql" "$WORK/my-staff-inst.sql" \
           "$M/20260821191000_hr_staff_salaries.sql" "$M/20260821211000_hr_staff_salaries_superseded_by_deferrable.sql" \
           "$WORK/salary-columns.sql" "$WORK/set-salary.sql" "$WORK/pr4121.sql" \
           "$M/20270512090000_hr_salary_suggestion_inputs_rpc.sql" "$RV/roles.sql" "$RV/stubs-targets.sql"; do
    "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "   LOAD FAILED: $f"; return 1; }
  done
  "${PSQL[@]}" -c "GRANT EXECUTE ON FUNCTION public.fn_hr_set_staff_salary(uuid, uuid, numeric, date, text, text, numeric, boolean, boolean, boolean, boolean, boolean, text, numeric, boolean, numeric, numeric, text) TO authenticated, service_role" >/dev/null
  "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$WORK/stack.sql" >/dev/null || { echo "   STACK FAILED"; return 1; }
  if [ "${1:-}" = mine ]; then
    # As on production: the approvals stack is live, then this file, twice.
    "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$MINE" >/dev/null || { echo "   THIS PR'S MIGRATION FAILED on the stack"; return 1; }
    "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$MINE" >/dev/null || { echo "   THIS PR'S MIGRATION FAILED on its second apply"; return 1; }
  fi
  "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$RV/seed.sql" >/dev/null || { echo "   SEED FAILED"; return 1; }
  if [ "${2:-}" = targets ]; then
    "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$RV/seed-targets.sql" >/dev/null || { echo "   SEED-TARGETS FAILED"; return 1; }
  fi
}
filter() { grep -E "PASS|FAIL|ERROR" | sed 's/^.*NOTICE: *//; s/^psql:[^E]*//'; }
run_probe() { PGOPTIONS= "${PSQL[@]}" -f "$1" 2>&1 | filter; }
count() { echo "$(grep -c '^PASS' "$1") PASS, $(grep -c '^FAIL' "$1") FAIL, $(grep -c 'ERROR' "$1") ERROR"; }

BAD=0
# PASS lines (rule names, detail stripped) that turned into FAIL, and ERRORs that are new.
flips() {  # $1 without, $2 with
  sed -n 's/^PASS //p' "$1" | sort -u > "$WORK/p0"
  sed -n 's/^FAIL //p' "$2" | sed 's/  \[.*$//' | sort -u > "$WORK/f1"
  comm -12 "$WORK/p0" "$WORK/f1"
}
for P in probe probe-targets; do
  T=""; [ "$P" = probe-targets ] && T=targets
  build "" $T || exit 1;      run_probe "$RV/$P.sql" > "$WORK/$P.without.txt"
  build mine $T || exit 1;    run_probe "$RV/$P.sql" > "$WORK/$P.with.txt"
  echo "== hr-salary-revision/$P.sql   without this PR: $(count "$WORK/$P.without.txt")   with it: $(count "$WORK/$P.with.txt")"
  flips "$WORK/$P.without.txt" "$WORK/$P.with.txt" > "$WORK/$P.flips"
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    why="$(grep -F "FAIL $line" "$WORK/$P.with.txt" | head -1 | sed -n 's/^.*  \[\(.*\)\]$/\1/p')"
    if grep -qxF "$line" "$EXPECTED_FLIPS" && { [ -z "$why" ] || [ "$why" = "42501 Only the Director can change a salary." ]; }; then
      echo "   expected flip: $line${why:+   [$why]}"
    else
      echo "   UNEXPECTED flip: $line"; grep -F "FAIL $line" "$WORK/$P.with.txt" | head -1 | sed 's/^/      /'; BAD=$((BAD+1))
    fi
  done < "$WORK/$P.flips"
  if [ "$(grep -c 'ERROR' "$WORK/$P.with.txt")" -gt "$(grep -c 'ERROR' "$WORK/$P.without.txt")" ]; then
    echo "   NEW ERROR lines with this PR:"; diff <(grep ERROR "$WORK/$P.without.txt") <(grep ERROR "$WORK/$P.with.txt") | sed 's/^/      /'; BAD=$((BAD+1))
  fi
done

echo "== coexist.sql (this PR on the stack)"
build mine || exit 1
run_probe "$HERE/coexist.sql" > "$WORK/coexist.txt"
sed 's/^/   /' "$WORK/coexist.txt"
echo "   coexist: $(count "$WORK/coexist.txt")"
[ "$(grep -c '^FAIL\|ERROR' "$WORK/coexist.txt")" = 0 ] || BAD=$((BAD+1))
[ "$(grep -c '^PASS' "$WORK/coexist.txt")" -ge 20 ] || { echo "   too few coexist lines ran"; BAD=$((BAD+1)); }

echo "STACKED RESULT: $([ "$BAD" = 0 ] && echo PASS || echo "FAIL ($BAD problem(s))")"
[ "$BAD" = 0 ]

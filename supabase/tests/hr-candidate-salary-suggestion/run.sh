#!/bin/bash
# Throwaway-Postgres rehearsal of migration 20271008200600 (suggested salary
# for a recruitment candidate). Never touches production: no .env file is read;
# the only connection is 127.0.0.1:$PORT to a cluster this script creates.
#
# Loaded VERBATIM, never re-typed:
#   - the four permission helpers, cut from supabase/setup/02_functions.sql by
#     line range, each range checked to start with its own CREATE line;
#   - the two pure rule helpers, from migration 20270512080000;
#   - the candidate table's SELECT policy, from supabase/setup/03_policies.sql.
# Expected output: see the header of probe.sql. A line containing HOLE is a
# failure; the summary counts PASS and FAIL.
# Run: bash supabase/tests/hr-candidate-salary-suggestion/run.sh
set -u
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
BIN=${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/../../.." && pwd)"   # the repo; read-only
MIG="$SRC/supabase/migrations/20271008200600_hr_candidate_salary_suggestion_inputs.sql"
HELPERS_MIG="$SRC/supabase/migrations/20270512080000_hr_salary_rule_pure_helpers.sql"
FN="$SRC/supabase/setup/02_functions.sql"
POL="$SRC/supabase/setup/03_policies.sql"
PORT=${PORT:-54631}
WORK="$(mktemp -d)"
DATA="$WORK/pgdata"
PSQL=("$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d rehearsal -X -q -v ON_ERROR_STOP=1)
PASS=0; FAIL=0
check() { # $1 label, $2 expected substring, $3 actual text
  if printf '%s' "$3" | grep -qF -- "$2"; then PASS=$((PASS+1)); echo "   PASS  $1"; else FAIL=$((FAIL+1)); echo "   FAIL  $1 (expected: $2)"; fi
}

teardown() { "$BIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null 2>&1; python3 -c "import shutil,sys; shutil.rmtree(sys.argv[1], ignore_errors=True)" "$WORK"; echo "== torn down"; }
trap teardown EXIT

"$BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null || exit 1
"$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" \
  -l "$WORK/pg.log" -w start >/dev/null || { cat "$WORK/pg.log"; exit 1; }
"$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -q -c "CREATE DATABASE rehearsal" || exit 1

echo "== server: $("${PSQL[@]}" -tAc 'select version()' | cut -c1-40)"
echo "== stubs"; "${PSQL[@]}" -f "$HERE/stubs.sql" || exit 1

echo "== permission helpers, verbatim from supabase/setup/02_functions.sql"
cut_range() { # $1 first line, $2 last line, $3 expected start
  local first; first="$(sed -n "${1}p" "$FN")"
  case "$first" in "$3"*) sed -n "${1},${2}p" "$FN" ;; *) echo "RANGE MOVED at $1: $first" >&2; return 1 ;; esac
}
{ cut_range 57 65 'CREATE OR REPLACE FUNCTION public.is_super_admin()' \
  && cut_range 4119 4127 'CREATE OR REPLACE FUNCTION get_current_user_institution_id()' \
  && cut_range 3422 3451 'CREATE OR REPLACE FUNCTION public.user_has_permission(permission_name text)' \
  && cut_range 6740 6797 'CREATE OR REPLACE FUNCTION public.role_has_institution_access(check_institution_id uuid)'; } > "$WORK/helpers.sql" || exit 1
grep -c "CREATE OR REPLACE FUNCTION" "$WORK/helpers.sql" | sed 's/^/   functions loaded: /'
"${PSQL[@]}" -f "$WORK/helpers.sql" || exit 1

echo "== the candidate SELECT policy, verbatim from supabase/setup/03_policies.sql"
awk '/^CREATE POLICY "hr_recruitment_candidates_select_permission"/{on=1} on{print} on && /^  \);/{exit}' "$POL" > "$WORK/policy.sql"
grep -c "CREATE POLICY" "$WORK/policy.sql" | sed 's/^/   policies loaded: /'
"${PSQL[@]}" -f "$WORK/policy.sql" || exit 1

echo "== SECTION 0: this migration BEFORE the rule helpers must stop, changing nothing"
OUT="$("${PSQL[@]}" -f "$MIG" 2>&1)"
check "section 0 aborts without the rule helpers" "ABORT: hr_salary_rule_department_rate" "$OUT"
OUT="$("${PSQL[@]}" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_name='hr_recruitment_candidates' AND column_name IN ('designation_id','department_id','prior_experience_years')")"
check "no column was added by the aborted run" "0" "$OUT"

echo "== rule helpers (20270512080000, verbatim)"
"${PSQL[@]}" -f "$HELPERS_MIG" >/dev/null || exit 1
echo "== migration (repo file, unmodified), applied twice"
"${PSQL[@]}" -f "$MIG" || exit 1
"${PSQL[@]}" -f "$MIG" || exit 1

# The three inputs, written as the table owner (no RLS): A fully filled in,
# B with a department the Director left empty, S with nothing.
"${PSQL[@]}" -c "UPDATE public.hr_recruitment_candidates SET designation_id='00000000-0000-0000-0000-00000000de01', department_id='00000000-0000-0000-0000-0000000d00a1', prior_experience_years=4.5, prior_experience_source='CV page 2' WHERE id='00000000-0000-0000-0000-0000000ca0a1'" || exit 1
"${PSQL[@]}" -c "UPDATE public.hr_recruitment_candidates SET designation_id='00000000-0000-0000-0000-00000000de01', department_id='00000000-0000-0000-0000-0000000d00b2' WHERE id='00000000-0000-0000-0000-0000000ca0b2'" || exit 1

echo "== CHECK: negative years refused"
OUT="$("${PSQL[@]}" -c "UPDATE public.hr_recruitment_candidates SET prior_experience_years=-1 WHERE id='00000000-0000-0000-0000-0000000ca0a1'" 2>&1)"
check "prior_experience_years -1 is refused" "hr_recruitment_candidates_prior_experience_years_check" "$OUT"
echo "== FK: deleting a department clears the link, keeps the candidate"
OUT="$("${PSQL[@]}" -tAc "BEGIN; DELETE FROM public.departments WHERE id='00000000-0000-0000-0000-0000000d00b2'; SELECT coalesce(department_id::text,'cleared') FROM public.hr_recruitment_candidates WHERE id='00000000-0000-0000-0000-0000000ca0b2'; ROLLBACK;")"
check "department delete sets department_id NULL" "cleared" "$OUT"

probe() { "${PSQL[@]}" -f "$HERE/probe.sql" 2>&1 | grep -E "SEES|REFUSED|ERROR|HOLE|GRANTS" | sed 's/^.*NOTICE: *//; s/^ *//'; }

echo "== PROBE, each person as role authenticated"
P="$(probe)"; printf '%s\n' "$P" | sed 's/^/   /'
check "Director sees A with all inputs, its college name and CV note" "the Director     candidate A table=1 -> title=Typist dept=Dept A rate=100 round=500 prior=4.5 band=yes college=College A note=CV page 2" "$P"
check "Director: B's empty department reads rate=none (draft 999 ignored), no band" "the Director     candidate B table=1 -> title=Typist dept=Dept B rate=none round=500 prior=none band=no college=College B note=none" "$P"
check "super admin sees S" "super admin      candidate S table=1 -> title=none" "$P"
check "HR head sees own-college A" "HR head (A)      candidate A table=1 -> title=Typist" "$P"
check "HR head does not see college B" "HR head (A)      candidate B table=0 -> not visible" "$P"
check "salary-only holder does not see A (no recruitment view)" "Salary only (A)  candidate A table=0 -> not visible" "$P"
check "salary-only holder sees S, which they submitted" "Salary only (A)  candidate S table=1 -> title=none" "$P"
check "recruiter without salary view is refused" "REFUSED  Recruiter (A)    candidate A (hr.payroll.salary.view is required" "$P"
check "no-role caller is refused" "REFUSED  No role          candidate A" "$P"
check "anon is refused" "REFUSED  anon (permission denied" "$P"
check "grants: anon none, authenticated yes, no PUBLIC" "GRANTS   anon=f authenticated=t public_via_proacl=f" "$P"
if printf '%s' "$P" | grep -q "HOLE\|ERROR"; then FAIL=$((FAIL+1)); echo "   FAIL  a HOLE or ERROR line in the probe"; else PASS=$((PASS+1)); echo "   PASS  no HOLE or ERROR line"; fi

echo "== MUTATION 1: salary-key check removed; the recruiter must now get A (proves the check bites)"
sed "s/IF public.user_has_permission('hr.payroll.salary.view') IS NOT TRUE THEN/IF false THEN/" "$MIG" > "$WORK/m1.sql"
PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -f "$WORK/m1.sql" >/dev/null || exit 1
P="$(probe)"
check "mutation 1 bites" "SEES     Recruiter (A)    candidate A table=1 -> title=Typist" "$P"
PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -f "$MIG" >/dev/null || exit 1

echo "== MUTATION 2: visibility predicate removed; HR head must now get college B's candidate"
python3 - "$MIG" "$WORK/m2.sql" <<'PY'
import sys,re
s=open(sys.argv[1]).read()
s2=re.sub(r"\n     AND \(\n           public\.is_super_admin\(\) IS TRUE.*?\n         \);", ";", s, flags=re.S)
assert s2!=s
open(sys.argv[2],'w').write(s2)
PY
PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -f "$WORK/m2.sql" >/dev/null || exit 1
P="$(probe)"
check "mutation 2 bites" "HR head (A)      candidate B table=0 -> HOLE disagrees with the table" "$P"
PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -f "$MIG" >/dev/null || exit 1

echo "== MUTATION 3: published filter removed; the Director must now read the draft's 777 for A"
sed "/AND rg.publication_state <> 'draft_only'/d; s/hr_salary_rule_department_rate(rg.value, c.department_id)/hr_salary_rule_department_rate(COALESCE(rg.draft_value, rg.value), c.department_id)/" "$MIG" > "$WORK/m3.sql"
PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -f "$WORK/m3.sql" >/dev/null || exit 1
P="$(probe)"
check "mutation 3 bites" "the Director     candidate A table=1 -> title=Typist dept=Dept A rate=777" "$P"
PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -f "$MIG" >/dev/null || exit 1

echo "== MUTATION 4: the REVOKE removed (fresh function); anon must now hold EXECUTE"
"${PSQL[@]}" -c "DROP FUNCTION public.hr_candidate_salary_suggestion_inputs(uuid)" >/dev/null || exit 1
sed '/^REVOKE EXECUTE ON FUNCTION public.hr_candidate_salary_suggestion_inputs/d' "$MIG" > "$WORK/m4.sql"
PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -f "$WORK/m4.sql" >/dev/null || exit 1
P="$(probe)"
check "mutation 4 bites" "GRANTS   anon=t" "$P"
"${PSQL[@]}" -c "DROP FUNCTION public.hr_candidate_salary_suggestion_inputs(uuid)" >/dev/null || exit 1
PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -f "$MIG" >/dev/null || exit 1
P="$(probe)"
check "restored: anon refused again" "GRANTS   anon=f authenticated=t public_via_proacl=f" "$P"

echo "== RESULT: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = 0 ]

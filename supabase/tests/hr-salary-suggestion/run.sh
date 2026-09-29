#!/bin/bash
# Throwaway-Postgres rehearsal of hr_salary_suggestion_inputs(). Never touches production:
# no .env file is read; the only connection is 127.0.0.1:$PORT to a cluster this script creates.
# The four permission helpers are cut from supabase/setup/02_functions.sql by LINE RANGE; if that file
# moves, the "functions loaded" count below stops reading 4 and the run must not be trusted.
# Expected output: see the header of probe.sql. Run: bash supabase/tests/hr-salary-suggestion/run.sh
set -u
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
BIN=${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/../../.." && pwd)"   # the repo; read-only
MIG="$SRC/supabase/migrations/20270512090000_hr_salary_suggestion_inputs_rpc.sql"
FN="$SRC/supabase/setup/02_functions.sql"
PORT=${PORT:-5518}
WORK="$(mktemp -d)"   # cluster, log and generated SQL live outside the repo
DATA="$WORK/pgdata"
PSQL=("$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d rehearsal -X -q -v ON_ERROR_STOP=1)

teardown() { "$BIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null 2>&1; rm -rf "$WORK"; echo "== torn down"; }
trap teardown EXIT

rm -rf "$DATA"
"$BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null || exit 1
"$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" \
  -l "$WORK/pg.log" -w start >/dev/null || { cat "$WORK/pg.log"; exit 1; }
"$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -q -c "CREATE DATABASE rehearsal" || exit 1

echo "== server: $("${PSQL[@]}" -tAc 'select version()' | cut -c1-40)"
echo "== stubs";  "${PSQL[@]}" -f "$HERE/stubs.sql" || exit 1
echo "== permission helpers, verbatim from supabase/setup/02_functions.sql"
{ sed -n '57,65p' "$FN"; sed -n '4119,4127p' "$FN"; sed -n '3422,3451p' "$FN"; sed -n '6740,6797p' "$FN"; } > "$WORK/helpers.sql"
grep -c "CREATE OR REPLACE FUNCTION" "$WORK/helpers.sql" | sed 's/^/   functions loaded: /'
"${PSQL[@]}" -f "$WORK/helpers.sql" || exit 1

echo "== migration (repo file, unmodified), applied twice"
"${PSQL[@]}" -f "$MIG" || exit 1
"${PSQL[@]}" -f "$MIG" || exit 1

probe() { "${PSQL[@]}" -f "$HERE/probe.sql" 2>&1 | grep -E "SEES|REFUSED|ERROR|HOLE|GRANTS" | sed 's/^.*NOTICE: *//; s/^ *//; s/^/   /'; }

echo "== PROBE, each person as role authenticated"
probe

echo "== MUTATION CONTROL 1: the college filter removed; the own-scope holder must now see B and C"
sed 's/AND public.role_has_institution_access(s.institution_id);/;/' "$MIG" > "$WORK/m1.sql"
"${PSQL[@]}" -f "$WORK/m1.sql" || exit 1
probe | grep "own-scope holder  "

echo "== MUTATION CONTROL 2: the never-published filter removed; B must now read its draft (999) as a college rule"
"${PSQL[@]}" -f "$MIG" >/dev/null || exit 1
sed "/AND rc.publication_state <> 'draft_only'/d" "$MIG" > "$WORK/m2.sql"
"${PSQL[@]}" -f "$WORK/m2.sql" || exit 1
probe | grep "all-scope holder .*person B"

echo "== MUTATION CONTROL 3: the has-an-amount test removed; C must now read its amount-less row as its college rule"
"${PSQL[@]}" -f "$MIG" >/dev/null || exit 1
grep -c "AND public.hr_salary_rule_has_amount(rc.value)" "$MIG" | sed 's/^/   lines removed: /'
sed '/AND public.hr_salary_rule_has_amount(rc.value)/d' "$MIG" > "$WORK/m3.sql"
"${PSQL[@]}" -f "$WORK/m3.sql" || exit 1
probe | grep "all-scope holder .*person C"

PARITY_CASES="$HERE/rule-parity-cases.json"
parity() { "${PSQL[@]}" -tA -v cases="$(cat "$PARITY_CASES")" -f "$HERE/parity-probe.sql" 2>&1 | sed 's/^/   /'; }
"${PSQL[@]}" -f "$MIG" >/dev/null || exit 1
echo "== PARITY: hr_salary_rule_has_amount() vs the cases the TypeScript parser test reads (all must be ok)"
parity

echo "== MUTATION CONTROL 5: numeric strings accepted again (the old test); the string cases must now MISMATCH"
sed 's/strict \$.per_year_at_jkkn ? (@.type() == "number" \&\& @ >= 0)/$.per_year_at_jkkn ? (@.type() == "number" || @.type() == "string")/' "$MIG" > "$WORK/m5.sql"
grep -c '@.type() == "string"' "$WORK/m5.sql" | sed 's/^/   lines changed: /'
"${PSQL[@]}" -f "$WORK/m5.sql" >/dev/null || exit 1
parity | grep -E "MISMATCH|total"
"${PSQL[@]}" -f "$MIG" >/dev/null || exit 1

lock() { "${PSQL[@]}" -f "$HERE/lock-probe.sql" 2>&1 | grep -E "LOCK|ERROR|HOLE|REFUSED" | sed 's/^.*NOTICE: *//; s/^ *//; s/^/   /'; }
PR4111="$(ls "$SRC"/supabase/migrations/20270506090000_*.sql 2>/dev/null | head -1)"
if [ -n "$PR4111" ]; then
  awk '/^-- 1\. platform_policies/{on=1} /^-- 3\. fn_get_policy/{on=0} on' "$PR4111" > "$WORK/pr4111.sql"
  echo "== #4111's policies taken from the real migration: $PR4111"
else
  cp "$HERE/pr4111-policies.sql" "$WORK/pr4111.sql"
  echo "== #4111's policies taken from pr4111-policies.sql (verbatim copy; #4111 is not in this tree)"
fi
echo "== LOCK 1: without #4111 (expected false)"
lock
echo "== LOCK 2: #4111's two policies applied (expected true)"
"${PSQL[@]}" -f "$WORK/pr4111.sql" || exit 1
lock
echo "== LOCK 3: only the audit-log policy dropped (expected false)"
"${PSQL[@]}" -c "DROP POLICY hr_policy_audit_log_pay_keys_restricted ON public.hr_policy_audit_log" || exit 1
lock
echo "== LOCK 4: both back, but row level security switched off on platform_policies (expected false)"
"${PSQL[@]}" -f "$WORK/pr4111.sql" || exit 1
"${PSQL[@]}" -c "ALTER TABLE public.platform_policies DISABLE ROW LEVEL SECURITY" || exit 1
lock
echo "== LOCK 5: RLS back on, but the platform_policies policy re-created PERMISSIVE (expected false)"
"${PSQL[@]}" -c "ALTER TABLE public.platform_policies ENABLE ROW LEVEL SECURITY" || exit 1
sed 's/AS RESTRICTIVE/AS PERMISSIVE/' "$WORK/pr4111.sql" > "$WORK/pr4111-permissive.sql"
"${PSQL[@]}" -f "$WORK/pr4111-permissive.sql" || exit 1
lock
echo "== LOCK 6: #4111 exactly as written again (expected true)"
"${PSQL[@]}" -f "$WORK/pr4111.sql" || exit 1
lock
echo "== LOCK 7: #4111 with the salary rule key left out of its list (expected false)"
sed "s/, 'hr.salary_suggestion_rule')/)/" "$WORK/pr4111.sql" > "$WORK/pr4111-nokey.sql"
"${PSQL[@]}" -f "$WORK/pr4111-nokey.sql" || exit 1
lock
echo "== MUTATION CONTROL 6: the RLS test removed from the function; LOCK 4's state must now read true"
"${PSQL[@]}" -f "$WORK/pr4111.sql" || exit 1
"${PSQL[@]}" -c "ALTER TABLE public.platform_policies DISABLE ROW LEVEL SECURITY" || exit 1
sed '/AND c.relrowsecurity/d' "$MIG" > "$WORK/m6.sql"
"${PSQL[@]}" -f "$WORK/m6.sql" >/dev/null || exit 1
lock
"${PSQL[@]}" -c "ALTER TABLE public.platform_policies ENABLE ROW LEVEL SECURITY" || exit 1
"${PSQL[@]}" -f "$MIG" >/dev/null || exit 1
echo "== MUTATION CONTROL 7: the super-admin check removed; the non-super-admin must now get an answer (HOLE)"
sed "s/IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN/IF false THEN/" "$MIG" > "$WORK/m7.sql"
grep -c "IF false THEN" "$WORK/m7.sql" | sed 's/^/   lines changed: /'
"${PSQL[@]}" -f "$WORK/m7.sql" >/dev/null || exit 1
lock | grep -E "HOLE|REFUSED"
"${PSQL[@]}" -f "$MIG" >/dev/null || exit 1
echo "== grants on the two new functions"
"${PSQL[@]}" -tAc "SELECT format('GRANTS   lock anon=%s authenticated=%s  has_amount anon=%s', has_function_privilege('anon','public.fn_hr_salary_rule_lock_present()','EXECUTE'), has_function_privilege('authenticated','public.fn_hr_salary_rule_lock_present()','EXECUTE'), has_function_privilege('anon','public.hr_salary_rule_has_amount(jsonb)','EXECUTE'))" | sed 's/^/   /'

echo "== MUTATION CONTROL 4: the REVOKE removed (fresh function); anon must now get through"
"${PSQL[@]}" -c "DROP FUNCTION public.hr_salary_suggestion_inputs(uuid)" || exit 1
sed '/^REVOKE EXECUTE ON FUNCTION public.hr_salary_suggestion_inputs/d' "$MIG" > "$WORK/m4.sql"
"${PSQL[@]}" -f "$WORK/m4.sql" || exit 1
probe | grep -E "anon|GRANTS"

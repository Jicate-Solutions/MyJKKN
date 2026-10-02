#!/bin/bash
# Throwaway-Postgres rehearsal of migration 20270512090000 (salary suggestion:
# per-department amounts). Never touches production: no .env file is read; the
# only connection is 127.0.0.1:$PORT to a cluster this script creates.
#
# Loaded VERBATIM, never re-typed:
#   - the four permission helpers, cut from supabase/setup/02_functions.sql by
#     LINE RANGE (if that file moves, "functions loaded" stops reading 4 and the
#     run must not be trusted);
#   - #4121's migration (fn_is_the_director), from the tree or from the branch
#     jicate/feat/hr-who-is-the-director;
#   - #4111's read and write policies, from the tree or from the branch
#     jicate/fix/hr-pay-policies-not-readable-by-everyone.
# Expected output: see the headers of probe.sql, write-probe.sql, lock-probe.sql.
# Run: bash supabase/tests/hr-salary-suggestion/run.sh
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

# A sibling PR's migration: from this tree if it is merged in, else from its branch.
fetch_sibling() { # $1 = file glob in supabase/migrations, $2 = git ref, $3 = path, $4 = out
  local f; f="$(ls "$SRC"/supabase/migrations/$1 2>/dev/null | head -1)"
  if [ -n "$f" ]; then cp "$f" "$4"; echo "   from the tree: $f"; return 0; fi
  if git -C "$SRC" show "$2:$3" > "$4" 2>/dev/null; then echo "   from $2 ($(git -C "$SRC" rev-parse --short "$2"))"; return 0; fi
  return 1
}

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
"${PSQL[@]}" -f "$HERE/write-policies.sql" || exit 1
"${PSQL[@]}" -c "ALTER ROLE service_role BYPASSRLS" || exit 1   # as on Supabase

echo "== #4121's migration (the Director list)"
fetch_sibling '20270520090000_*.sql' jicate/feat/hr-who-is-the-director \
  supabase/migrations/20270520090000_the_director_list.sql "$WORK/pr4121.sql" || { echo "   MISSING: cannot rehearse"; exit 1; }
echo "== #4111's migration (pay-key read and write locks)"
fetch_sibling '20270506090000_*.sql' jicate/fix/hr-pay-policies-not-readable-by-everyone \
  supabase/migrations/20270506090000_hr_pay_policies_readable_only_with_salary_view.sql "$WORK/pr4111-full.sql" \
  || { echo "   MISSING: cannot rehearse"; exit 1; }
awk '/^-- 1\. platform_policies/{on=1} /^-- 3\. fn_get_policy/{on=0} on' "$WORK/pr4111-full.sql" > "$WORK/pr4111.sql"
awk '/^-- 6\. platform_policies writes/{on=1} /^NOTIFY pgrst/{on=0} on' "$WORK/pr4111-full.sql" > "$WORK/pr4111-writes.sql"
grep -c "CREATE POLICY" "$WORK/pr4111.sql" | sed 's/^/   read policies: /'
grep -c "CREATE POLICY" "$WORK/pr4111-writes.sql" | sed 's/^/   write policies: /'

echo "== SECTION 0: this migration BEFORE #4121 must stop, changing nothing"
"${PSQL[@]}" -f "$MIG" 2>&1 | grep -o "ABORT: .*" | sed 's/^/   /'
"${PSQL[@]}" -tAc "SELECT '   objects created anyway: ' || count(*) FROM pg_proc WHERE proname IN ('hr_salary_suggestion_inputs','hr_salary_rule_department_rate','fn_guard_salary_suggestion_rule_writes')"

"${PSQL[@]}" -f "$WORK/pr4121.sql" >/dev/null || exit 1
echo "== migration (repo file, unmodified), applied twice"
"${PSQL[@]}" -f "$MIG" || exit 1
"${PSQL[@]}" -f "$MIG" || exit 1

echo "== who is on the Director list (fn_is_the_director as each caller)"
"${PSQL[@]}" -c "DO \$\$ DECLARE u record; v boolean; BEGIN
  FOR u IN SELECT * FROM (VALUES ('the Director','00000000-0000-0000-0000-00000000aa06'),('super admin, not on it','00000000-0000-0000-0000-00000000aa04'),('no role','00000000-0000-0000-0000-00000000aa07')) x(l,uid) LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub',u.uid,'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated; v := public.fn_is_the_director(); RESET ROLE;
    RAISE NOTICE 'DIRECTOR % %', rpad(u.l, 24), v;
  END LOOP; END \$\$;" 2>&1 | grep -o "DIRECTOR.*" | sed 's/^/   /'

probe() { "${PSQL[@]}" -f "$HERE/probe.sql" 2>&1 | grep -E "SEES|REFUSED|ERROR|HOLE|GRANTS" | sed 's/^.*NOTICE: *//; s/^ *//; s/^/   /'; }

echo "== PROBE, each person as role authenticated"
probe

echo "== PROBE: the rule row set back to a never-published draft (draft_only); A must now read rate=none"
"${PSQL[@]}" -c "UPDATE public.platform_policies SET publication_state='draft_only' WHERE policy_key='hr.salary_suggestion_rule' AND scope_type='global'" || exit 1
probe | grep "all-scope holder .*person A "
echo "== MUTATION CONTROL 2: the never-published filter removed; A must now read 100 from the unpublished row"
sed "/AND rg.publication_state <> 'draft_only'/d" "$MIG" > "$WORK/m2.sql"
"${PSQL[@]}" -f "$WORK/m2.sql" >/dev/null || exit 1
probe | grep "all-scope holder .*person A "
"${PSQL[@]}" -f "$MIG" >/dev/null || exit 1
"${PSQL[@]}" -c "UPDATE public.platform_policies SET publication_state='draft_pending' WHERE policy_key='hr.salary_suggestion_rule' AND scope_type='global'" || exit 1

echo "== MUTATION CONTROL 1: the college filter removed; the own-scope holder must now see B and C"
sed 's/AND public.role_has_institution_access(s.institution_id);/;/' "$MIG" > "$WORK/m1.sql"
"${PSQL[@]}" -f "$WORK/m1.sql" >/dev/null || exit 1
probe | grep "own-scope holder  "
"${PSQL[@]}" -f "$MIG" >/dev/null || exit 1

echo "== MUTATION CONTROL 3: the pending draft read instead of the published value; A must read 777, B 999"
sed 's/hr_salary_rule_department_rate(rg.value, s.department_id)/hr_salary_rule_department_rate(COALESCE(rg.draft_value, rg.value), s.department_id)/' "$MIG" > "$WORK/m3.sql"
grep -c "COALESCE(rg.draft_value" "$WORK/m3.sql" | sed 's/^/   lines changed: /'
"${PSQL[@]}" -f "$WORK/m3.sql" >/dev/null || exit 1
probe | grep -E "all-scope holder .*person (A|B) "
"${PSQL[@]}" -f "$MIG" >/dev/null || exit 1

echo "== MUTATION CONTROL 8: the salary-key check removed; 'no key' must now get A's row (HOLE); 'no role' has no college, so still nothing"
sed "s/IF public.user_has_permission('hr.payroll.salary.view') IS NOT TRUE THEN/IF false THEN/" "$MIG" > "$WORK/m8.sql"
grep -c "IF false THEN" "$WORK/m8.sql" | sed 's/^/   lines changed: /'
"${PSQL[@]}" -f "$WORK/m8.sql" >/dev/null || exit 1
probe | grep -E "(no key|no staff row, no profile role) .*person A "
"${PSQL[@]}" -f "$MIG" >/dev/null || exit 1

PARITY_CASES="$HERE/rule-parity-cases.json"
parity() { "${PSQL[@]}" -tA -v cases="$(cat "$PARITY_CASES")" -f "$HERE/parity-probe.sql" 2>&1 | sed 's/^/   /'; }
echo "== PARITY: hr_salary_rule_department_rate() / hr_salary_rule_round_to() vs the TypeScript test's cases (all must be ok)"
parity

echo "== MUTATION CONTROL 5: numeric strings accepted as amounts; the string case must now MISMATCH"
sed "s/-> (p_department_id::text)) = 'number'/-> (p_department_id::text)) IN ('number', 'string')/" "$MIG" > "$WORK/m5.sql"
grep -c "IN ('number', 'string')" "$WORK/m5.sql" | sed 's/^/   lines changed: /'
"${PSQL[@]}" -f "$WORK/m5.sql" >/dev/null || exit 1
parity | grep -E "MISMATCH|total"
"${PSQL[@]}" -f "$MIG" >/dev/null || exit 1

lock() { "${PSQL[@]}" -f "$HERE/lock-probe.sql" 2>&1 | grep -E "LOCK|ERROR|HOLE|REFUSED" | sed 's/^.*NOTICE: *//; s/^ *//; s/^/   /'; }
echo "== LOCK 1: without #4111 (expected false; both non-super-admins refused)"
lock
echo "== LOCK 2: #4111's two read policies applied (expected true)"
"${PSQL[@]}" -f "$WORK/pr4111.sql" >/dev/null || exit 1
lock | grep LOCK
echo "== LOCK 3: only the audit-log policy dropped (expected false)"
"${PSQL[@]}" -c "DROP POLICY hr_policy_audit_log_pay_keys_restricted ON public.hr_policy_audit_log" || exit 1
lock | grep LOCK
echo "== LOCK 4: both back, but row level security switched off on platform_policies (expected false)"
"${PSQL[@]}" -f "$WORK/pr4111.sql" >/dev/null || exit 1
"${PSQL[@]}" -c "ALTER TABLE public.platform_policies DISABLE ROW LEVEL SECURITY" || exit 1
lock | grep LOCK
echo "== LOCK 5: RLS back on, but the platform_policies policy re-created PERMISSIVE (expected false)"
"${PSQL[@]}" -c "ALTER TABLE public.platform_policies ENABLE ROW LEVEL SECURITY" || exit 1
sed 's/AS RESTRICTIVE/AS PERMISSIVE/' "$WORK/pr4111.sql" > "$WORK/pr4111-permissive.sql"
"${PSQL[@]}" -f "$WORK/pr4111-permissive.sql" >/dev/null || exit 1
lock | grep LOCK
echo "== LOCK 6: #4111 exactly as written again (expected true)"
"${PSQL[@]}" -f "$WORK/pr4111.sql" >/dev/null || exit 1
lock | grep LOCK
echo "== LOCK 7: #4111 with the salary rule key left out of its list (expected false)"
sed "s/, 'hr.salary_suggestion_rule')/)/" "$WORK/pr4111.sql" > "$WORK/pr4111-nokey.sql"
"${PSQL[@]}" -f "$WORK/pr4111-nokey.sql" >/dev/null || exit 1
lock | grep LOCK
"${PSQL[@]}" -f "$WORK/pr4111.sql" >/dev/null || exit 1
echo "== MUTATION CONTROL 7: the super-admin/Director check removed; non-super-admins must now get an answer (HOLE)"
sed "s/     AND public.fn_is_the_director() IS NOT TRUE THEN/     AND false THEN/" "$MIG" > "$WORK/m7.sql"
grep -c "AND false THEN" "$WORK/m7.sql" | sed 's/^/   lines changed: /'
"${PSQL[@]}" -f "$WORK/m7.sql" >/dev/null || exit 1
lock | grep -E "HOLE|REFUSED"
"${PSQL[@]}" -f "$MIG" >/dev/null || exit 1

write() { "${PSQL[@]}" -f "$HERE/write-probe.sql" 2>&1 | grep -E "WRITE|ERROR" | sed 's/^.*NOTICE: *//; s/^ *//; s/^/   /'; }
echo "== WRITES, with #4111's read AND write locks and this PR's trigger"
"${PSQL[@]}" -f "$WORK/pr4111-writes.sql" >/dev/null || exit 1
write
echo "== MUTATION CONTROL W1: the Director check removed from the trigger; the other super admin must now be ALLOWED (HOLE)"
sed "s/    IF public.fn_is_the_director() IS NOT TRUE THEN/    IF false THEN/" "$MIG" > "$WORK/w1.sql"
grep -c "    IF false THEN" "$WORK/w1.sql" | sed 's/^/   lines changed: /'
"${PSQL[@]}" -f "$WORK/w1.sql" >/dev/null || exit 1
write | grep "super admin, not on the list"
"${PSQL[@]}" -f "$MIG" >/dev/null || exit 1
echo "== MUTATION CONTROL W2: the trigger looks only at the NEW row; delete and rename-out must now be ALLOWED for the other super admin (HOLE)"
sed "/OR (TG_OP IN ('UPDATE', 'DELETE') AND OLD.policy_key = c_key)) THEN/s/.*/       ) THEN/" "$MIG" > "$WORK/w2.sql"
grep -c "^       ) THEN" "$WORK/w2.sql" | sed 's/^/   lines changed: /'
"${PSQL[@]}" -f "$WORK/w2.sql" >/dev/null || exit 1
write | grep "super admin, not on the list" | grep -E "delete|OUT"
"${PSQL[@]}" -f "$MIG" >/dev/null || exit 1
echo "== MUTATION CONTROL W3: the trigger dropped; #4111 alone lets the other super admin write (HOLE)"
"${PSQL[@]}" -c "DROP TRIGGER trg_guard_salary_suggestion_rule_writes ON public.platform_policies" || exit 1
write | grep "super admin, not on the list" | grep "update the rule"
"${PSQL[@]}" -f "$MIG" >/dev/null || exit 1

echo "== grants on every new function (anon must be f everywhere)"
"${PSQL[@]}" -tAc "SELECT format('GRANTS   %s anon=%s authenticated=%s', p.oid::regprocedure, has_function_privilege('anon', p.oid, 'EXECUTE'), has_function_privilege('authenticated', p.oid, 'EXECUTE')) FROM pg_proc p WHERE p.proname IN ('hr_salary_rule_department_rate','hr_salary_rule_round_to','hr_salary_suggestion_inputs','fn_hr_salary_rule_lock_present','fn_guard_salary_suggestion_rule_writes') ORDER BY 1" | sed 's/^/   /'

echo "== MUTATION CONTROL 4: the REVOKE removed (fresh function); anon must now get through"
"${PSQL[@]}" -c "DROP FUNCTION public.hr_salary_suggestion_inputs(uuid)" || exit 1
sed '/^REVOKE EXECUTE ON FUNCTION public.hr_salary_suggestion_inputs/d' "$MIG" > "$WORK/m4.sql"
"${PSQL[@]}" -f "$WORK/m4.sql" >/dev/null || exit 1
probe | grep -E "anon|GRANTS"

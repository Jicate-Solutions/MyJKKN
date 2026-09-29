#!/usr/bin/env bash
# Rehearsal for supabase/migrations/20270521090000_hr_salary_no_backdating.sql
# on a THROWAWAY local PostgreSQL 16. Touches no real database.
#
#   bash supabase/tests/hr-salary-no-backdating/run.sh
#   MIG=/path/to/mutated.sql bash supabase/tests/hr-salary-no-backdating/run.sh   # mutation runs
#
# Order: Supabase-like roles and default grants -> main's real helpers loaded
# VERBATIM from the migrations folder -> the salary table, its RLS and main's
# newest fn_hr_set_staff_salary (the state production is in today) -> THIS
# migration, applied TWICE -> seed -> assert.sql as every relevant role.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
M="$ROOT/supabase/migrations"
MIG="${MIG:-$M/20270521090000_hr_salary_no_backdating.sql}"
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@16/bin}"
PORT="${PORT:-54417}"
export LC_ALL=C LANG=C   # else: "postmaster became multithreaded"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/hr-no-backdating.XXXXXX")"
# The socket needs a SHORT path (macOS caps it at 103 bytes).
SOCK="$(mktemp -d /tmp/hnb.XXXXXX)"
"$PGBIN/initdb" -D "$WORK/data" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $SOCK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null
trap '"$PGBIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true' EXIT

PSQL=("$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$SOCK" -p "$PORT" -U postgres -d postgres)

# Print one function definition from a migration file, verbatim: from the line
# that starts with $2 to the first line that closes the body ($$; or $function$;).
extract() {
  awk -v start="$2" 'index($0, start) == 1 { p = 1 }
                     p { print }
                     p && ($0 ~ /^\$\$;/ || $0 ~ /^\$function\$;/) { exit }' "$1"
}

echo "== postgres: $("${PSQL[@]}" -Atc 'show server_version')"
echo "== migration under test: ${MIG#$ROOT/}"

"${PSQL[@]}" -f "$HERE/stub-schema.sql"

# main's real helpers, verbatim
{
  extract "$M/20251210_optimize_rls_policies.sql" 'CREATE OR REPLACE FUNCTION is_super_admin()'
  extract "$M/20260927020000_user_has_permission_guard_is_active.sql" 'CREATE OR REPLACE FUNCTION public.user_has_permission(permission_name text)'
  extract "$M/20260801002600_hr_leave_rls_permission_retrofit.sql" 'CREATE OR REPLACE FUNCTION public.fn_my_staff_ids()'
} > "$WORK/helpers.sql"
grep -c '^CREATE OR REPLACE FUNCTION' "$WORK/helpers.sql" | grep -qx 3 || { echo "helper extraction failed"; exit 2; }
"${PSQL[@]}" -f "$WORK/helpers.sql"

# The salary table, its RLS and the salary grant to hr_head: the real files.
"${PSQL[@]}" -f "$M/20260821191000_hr_staff_salaries.sql"
"${PSQL[@]}" -f "$M/20260821211000_hr_staff_salaries_superseded_by_deferrable.sql"
# The later column additions, verbatim (their files also touch tables the
# rehearsal does not model, so only the hr_staff_salaries statements are taken).
perl -0ne 'print "$1\n" while /(ALTER TABLE public\.hr_staff_salaries\b.*?;)/sg' \
  "$M/20260901120000_hr_salary_epf_esi_values.sql" \
  "$M/20260902100000_hr_tds_slabs_and_allowance.sql" > "$WORK/columns.sql"
"${PSQL[@]}" -f "$WORK/columns.sql"

# main's NEWEST fn_hr_set_staff_salary (20260902100000 section 5) and its grants:
# the "before" state the migration replaces.
extract "$M/20260902100000_hr_tds_slabs_and_allowance.sql" 'DROP FUNCTION IF EXISTS public.fn_hr_set_staff_salary(' > "$WORK/before.sql"
cat >> "$WORK/before.sql" <<'SQL'
REVOKE ALL ON FUNCTION public.fn_hr_set_staff_salary(uuid, uuid, numeric, date, text, text, numeric, boolean, boolean, boolean, boolean, boolean, text, numeric, boolean, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_set_staff_salary(uuid, uuid, numeric, date, text, text, numeric, boolean, boolean, boolean, boolean, boolean, text, numeric, boolean, numeric, numeric, text) TO authenticated, service_role;
SQL
"${PSQL[@]}" -f "$WORK/before.sql"
"${PSQL[@]}" -Atc "select 'before: fn_hr_set_staff_salary args = ' || pronargs from pg_proc where proname = 'fn_hr_set_staff_salary'"

# THE MIGRATION, twice.
"${PSQL[@]}" -f "$MIG"
"${PSQL[@]}" -f "$MIG"
echo "== migration applied twice"

# Production has older rows with no start date (orchestrator's read, 30 Sep).
# The repo declares the column NOT NULL; production evidently does not enforce it.
"${PSQL[@]}" -c "ALTER TABLE public.hr_staff_salaries ALTER COLUMN effective_from DROP NOT NULL"

# Seed, as the owner (the trigger does not stop the owner, so history can be laid down).
"${PSQL[@]}" <<'SQL'
INSERT INTO public.hr_organizations VALUES ('00000000-0000-0000-0000-0000000000b1');
INSERT INTO public.staff (id)
  SELECT ('00000000-0000-0000-0000-000000000' || lpad(n::text, 3, '0'))::uuid FROM generate_series(1, 25) n;
INSERT INTO public.profiles (id, is_super_admin, role) VALUES
  ('00000000-0000-0000-0000-0000000000c1', false, 'hr_head'),   -- HR head
  ('00000000-0000-0000-0000-0000000000c2', true,  NULL),        -- super admin
  ('00000000-0000-0000-0000-0000000000c3', false, NULL);        -- signed in, no role, no staff row
-- 0...c4 has no profile at all.
INSERT INTO public.user_roles VALUES ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1');

-- Existing salaries (today in India):
--  staff 10: started 29 days ago, 7000 = what t.call sends (identical re-upload)
--  staff 11: started 29 days ago  (superseded from today; direct edit refused)
--  staff 12: NO start recorded    (superseded from today; direct edit refused)
--  staff 13: starts in 10 days    (direct edit allowed; moving it to the past refused)
INSERT INTO public.hr_staff_salaries (staff_id, hr_organization_id, monthly_gross, effective_from)
VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-0000000000b1', 7000, (now() AT TIME ZONE 'Asia/Kolkata')::date - 29),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000b1', 6000, (now() AT TIME ZONE 'Asia/Kolkata')::date - 29),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000b1', 6000, NULL),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-0000000000b1', 8000, (now() AT TIME ZONE 'Asia/Kolkata')::date + 10);
SQL

"${PSQL[@]}" -Atc "select 'hr_head holds hr.payroll.salary.manage via the table migration: ' || (permissions->>'hr.payroll.salary.manage') from custom_roles where role_key = 'hr_head'"

"${PSQL[@]}" -f "$HERE/assert.sql" > "$WORK/assert.out"

echo
"${PSQL[@]}" -At -F ' | ' -c "select case when ok then 'PASS' else 'FAIL' end, label, case when ok then '' else detail end from t.results order by n"
PASS=$("${PSQL[@]}" -Atc "select count(*) from t.results where ok")
FAIL=$("${PSQL[@]}" -Atc "select count(*) from t.results where not ok")
echo
echo "RESULT: $PASS PASS / $FAIL FAIL"
[ "$FAIL" = "0" ]

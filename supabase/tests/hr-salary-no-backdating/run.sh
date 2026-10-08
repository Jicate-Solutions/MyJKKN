#!/usr/bin/env bash
# Rehearsal for supabase/migrations/20270603090000_hr_salary_no_backdating.sql
# on a THROWAWAY local PostgreSQL 16. Touches no real database.
#
#   bash supabase/tests/hr-salary-no-backdating/run.sh
#   MIG=/path/to/mutated.sql bash supabase/tests/hr-salary-no-backdating/run.sh   # mutation runs
#
# The migration depends on 20270520090000_the_director_list.sql (Draft #4121,
# fn_is_the_director). Until #4121 merges, that file is read from its branch:
#   DIRECTOR_MIG=/path/to/file   use this copy instead
#   DIRECTOR_REF=<git ref>       default jicate/feat/hr-who-is-the-director
# Once the file exists in this checkout, the checkout's copy is used.
#
# Order: Supabase-like roles and default grants -> main's real helpers loaded
# VERBATIM from the migrations folder -> the salary table, its RLS and main's
# newest fn_hr_set_staff_salary (the state production is in today) -> people ->
# the precondition check (THIS migration must refuse to run without the
# Director list) -> the Director list migration (+ isvarya@) -> THIS migration,
# applied TWICE -> seed -> assert.sql as every relevant role.
# Then run-stacked.sh: this file on top of #4140 + #4190 + #4252 (both guards
# on hr_staff_salaries fire; the approvals job still sends an overdue yes back
# and writes the next one). PORT_STACKED= moves its cluster (default PORT+1).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
M="$ROOT/supabase/migrations"
MIG="${MIG:-$M/20270603090000_hr_salary_no_backdating.sql}"
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

# The Director list migration (#4121), verbatim.
DIR_FILE="$M/20270520090000_the_director_list.sql"
if [ -n "${DIRECTOR_MIG:-}" ]; then
  cp "$DIRECTOR_MIG" "$WORK/director.sql"
elif [ -f "$DIR_FILE" ]; then
  cp "$DIR_FILE" "$WORK/director.sql"
else
  git -C "$ROOT" show "${DIRECTOR_REF:-jicate/feat/hr-who-is-the-director}:supabase/migrations/20270520090000_the_director_list.sql" > "$WORK/director.sql"
fi
grep -q 'CREATE OR REPLACE FUNCTION public.fn_is_the_director()' "$WORK/director.sql" \
  || { echo "Director list migration not found"; exit 2; }

echo "== postgres: $("${PSQL[@]}" -Atc 'show server_version')"
echo "== migration under test: ${MIG#$ROOT/}"
echo "== Director list from: ${DIRECTOR_MIG:-$( [ -f "$DIR_FILE" ] && echo "${DIR_FILE#$ROOT/}" || echo "${DIRECTOR_REF:-jicate/feat/hr-who-is-the-director} ($(git -C "$ROOT" rev-parse --short "${DIRECTOR_REF:-jicate/feat/hr-who-is-the-director}"))" )}"

"${PSQL[@]}" -f "$HERE/stub-schema.sql"

# main's real helpers, verbatim
{
  extract "$M/20251210_optimize_rls_policies.sql" 'CREATE OR REPLACE FUNCTION is_super_admin()'
  extract "$ROOT/supabase/setup/02_functions.sql" 'CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid DEFAULT auth.uid())'
  extract "$M/20260927020000_user_has_permission_guard_is_active.sql" 'CREATE OR REPLACE FUNCTION public.user_has_permission(permission_name text)'
  extract "$M/20260801002600_hr_leave_rls_permission_retrofit.sql" 'CREATE OR REPLACE FUNCTION public.fn_my_staff_ids()'
} > "$WORK/helpers.sql"
grep -c '^CREATE OR REPLACE FUNCTION' "$WORK/helpers.sql" | grep -qx 4 || { echo "helper extraction failed"; exit 2; }
"${PSQL[@]}" -f "$WORK/helpers.sql"

# platform_policies (the Director list lives there): table + RLS, verbatim
# (the same line range #4121's own rehearsal loads).
sed -n '14,58p' "$M/20260429000002_platform_policies_substrate.sql" > "$WORK/platform_policies.sql"
grep -q 'CREATE TABLE IF NOT EXISTS platform_policies' "$WORK/platform_policies.sql" || { echo "platform_policies extraction failed"; exit 2; }
"${PSQL[@]}" -f "$WORK/platform_policies.sql"

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
# Drift stand-in: pretend production's copy had lost the anon revoke (Supabase's
# default grant), so the rehearsal proves THIS migration's own REVOKE removes it.
# CREATE OR REPLACE keeps an existing ACL, so without this the REVOKE could be
# deleted and nothing here would notice.
"${PSQL[@]}" -c "GRANT EXECUTE ON FUNCTION public.fn_hr_set_staff_salary(uuid, uuid, numeric, date, text, text, numeric, boolean, boolean, boolean, boolean, boolean, text, numeric, boolean, numeric, numeric, text) TO anon"
"${PSQL[@]}" -Atc "select 'before: fn_hr_set_staff_salary args = ' || pronargs from pg_proc where proname = 'fn_hr_set_staff_salary'"

# People. Profiles and logins first: the Director list seeds itself from the
# confirmed login whose email is director@jkkn.ac.in when it runs.
"${PSQL[@]}" <<'SQL'
INSERT INTO public.profiles (id, email, is_super_admin, role) VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'hr.head@jkkn.ac.in',         false, 'hr_head'),     -- HR head
  ('00000000-0000-0000-0000-0000000000c2', 'test.superadmin@jkkn.ac.in', true,  'super_admin'), -- super admin, NOT on the Director list
  ('00000000-0000-0000-0000-0000000000c3', 'blank@jkkn.ac.in',           false, NULL),          -- signed in, no role, no staff row
  ('00000000-0000-0000-0000-0000000000c5', 'director@jkkn.ac.in',        true,  'super_admin'), -- the Director (on the list)
  ('00000000-0000-0000-0000-0000000000c6', 'isvarya@jkkn.ac.in',         true,  'super_admin'), -- Isvarya (on the list; a super admin per memory, not verified here)
  ('00000000-0000-0000-0000-0000000000c7', 'listed.plain@jkkn.ac.in',    false, NULL);          -- on the list, but no super admin and no HR keys
-- 0...c4 is a signed-in user with no profile at all.
-- Every profile has a confirmed login with the same email.
INSERT INTO auth.users (id, email, email_confirmed_at) SELECT id, email, now() FROM public.profiles;
INSERT INTO public.user_roles VALUES ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1');
SQL

# Precondition: without the Director list, THIS migration must refuse to run.
if "${PSQL[@]}" -f "$MIG" > "$WORK/pre.out" 2>&1; then
  echo "PRECONDITION FAIL: the migration ran without fn_is_the_director()"; exit 1
fi
grep -q 'needs public.fn_is_the_director()' "$WORK/pre.out" \
  || { echo "PRECONDITION FAIL: unexpected error:"; cat "$WORK/pre.out"; exit 1; }
"${PSQL[@]}" -Atc "select 'precondition: refused without the Director list; fn_hr_set_staff_salary args still = ' || pronargs from pg_proc where proname = 'fn_hr_set_staff_salary'"

"${PSQL[@]}" -f "$WORK/director.sql"
# The 08:59 ruling names TWO accounts (director@ and isvarya@). #4121 round 3
# (083653e34e) seeds both; an older #4121 head seeded director@ only. Either
# way the rehearsal makes sure isvarya@ is there, and adds c7 (a listed account
# with no super admin / HR keys), as the SQL console would: an owner session
# with no signed-in user, which #4121's guard allows. Nothing is removed.
"${PSQL[@]}" <<'SQL'
SELECT set_config('request.jwt.claims', '', false);
UPDATE public.platform_policies
   SET value = (SELECT jsonb_agg(DISTINCT x ORDER BY x) FROM (
                  SELECT jsonb_array_elements_text(value) AS x
                  UNION SELECT '00000000-0000-0000-0000-0000000000c6'
                  UNION SELECT '00000000-0000-0000-0000-0000000000c7') ids)
 WHERE policy_key = 'platform.the_director_profile_ids';
SQL
"${PSQL[@]}" -Atc "select 'Director list = ' || value::text from platform_policies where policy_key = 'platform.the_director_profile_ids'"

# THE MIGRATION, twice.
"${PSQL[@]}" -f "$MIG"
"${PSQL[@]}" -f "$MIG"
echo "== migration applied twice"

# UNVERIFIED drift: the orchestrator's read of production (2026-09-30) saw older
# rows with no start date, while the repo declares the column NOT NULL. Whether
# production enforces NOT NULL was not checked; the rehearsal allows NULL so the
# no-start case can be tested.
"${PSQL[@]}" -c "ALTER TABLE public.hr_staff_salaries ALTER COLUMN effective_from DROP NOT NULL"

# Seed salaries, as the owner (the guard does not stop the owner, so history
# can be laid down).
"${PSQL[@]}" <<'SQL'
INSERT INTO public.hr_organizations VALUES ('00000000-0000-0000-0000-0000000000b1');
INSERT INTO public.staff (id)
  SELECT ('00000000-0000-0000-0000-000000000' || lpad(n::text, 3, '0'))::uuid FROM generate_series(1, 40) n;

-- Existing salaries (today in India = T):
--  staff 10: started T-29, 7000 = what t.call sends (identical save)
--  staff 11: started T-29  (superseded from today; direct edit refused)
--  staff 12: NO start      (superseded from today; direct edit refused)
--  staff 13: starts T+10   (direct edit allowed; moving it to the past refused)
--  staff 22: A (T-180, 40000) superseded by B (T-29, 50000, in force): the revive attack
--  staff 25: one row, for the staff-delete cascade
INSERT INTO public.hr_staff_salaries (id, staff_id, hr_organization_id, monthly_gross, effective_from) VALUES
  ('00000000-0000-0000-0000-00000000a010', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-0000000000b1', 7000, (now() AT TIME ZONE 'Asia/Kolkata')::date - 29),
  ('00000000-0000-0000-0000-00000000a011', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000b1', 6000, (now() AT TIME ZONE 'Asia/Kolkata')::date - 29),
  ('00000000-0000-0000-0000-00000000a012', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000b1', 6000, NULL),
  ('00000000-0000-0000-0000-00000000a013', '00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-0000000000b1', 8000, (now() AT TIME ZONE 'Asia/Kolkata')::date + 10),
  ('00000000-0000-0000-0000-00000000b022', '00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-0000000000b1', 50000, (now() AT TIME ZONE 'Asia/Kolkata')::date - 29),
  ('00000000-0000-0000-0000-00000000a025', '00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-0000000000b1', 5000, (now() AT TIME ZONE 'Asia/Kolkata')::date - 5);
INSERT INTO public.hr_staff_salaries (id, staff_id, hr_organization_id, monthly_gross, effective_from, superseded_by) VALUES
  ('00000000-0000-0000-0000-00000000a022', '00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-0000000000b1', 40000, (now() AT TIME ZONE 'Asia/Kolkata')::date - 180,
   '00000000-0000-0000-0000-00000000b022');
SQL

"${PSQL[@]}" -Atc "select 'hr_head holds hr.payroll.salary.manage via the table migration: ' || (permissions->>'hr.payroll.salary.manage') from custom_roles where role_key = 'hr_head'"

"${PSQL[@]}" -f "$HERE/assert.sql" > "$WORK/assert.out"

echo
"${PSQL[@]}" -At -F ' | ' -c "select case when ok then 'PASS' else 'FAIL' end, label, case when ok then '' else detail end from t.results order by n"
PASS=$("${PSQL[@]}" -Atc "select count(*) from t.results where ok")
FAIL=$("${PSQL[@]}" -Atc "select count(*) from t.results where not ok")
echo
echo "RESULT: $PASS PASS / $FAIL FAIL"
[ "$FAIL" = "0" ] || exit 1

# Second phase (8 Oct 2026): the same file on top of the salary approvals that
# are already on main and live (#4140, #4190, #4252), on its own throwaway
# cluster. See run-stacked.sh.
echo
PORT="${PORT_STACKED:-$((PORT + 1))}" MIG="$MIG" PGBIN="$PGBIN" bash "$HERE/run-stacked.sh"

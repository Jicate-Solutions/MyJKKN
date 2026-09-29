-- Assertions for 20270521090000_hr_salary_no_backdating.sql.
-- Run by run.sh as the cluster superuser, which SWITCHES ROLE per case:
--   SET ROLE authenticated / anon / service_role + request.jwt.claims
-- exactly as PostgREST does. Queries never run as the owner except in the two
-- "owner" cases, because an owner/superuser skips RLS and would prove nothing.
--
-- Every case writes one row to t.results. run.sh prints them and fails the run
-- on any FAIL.

\set UHR '00000000-0000-0000-0000-0000000000c1'
\set USA '00000000-0000-0000-0000-0000000000c2'
\set UNO '00000000-0000-0000-0000-0000000000c3'
\set UGH '00000000-0000-0000-0000-0000000000c4'

-- ---------------------------------------------------------------------------
-- Harness
-- ---------------------------------------------------------------------------
CREATE SCHEMA t;
GRANT USAGE ON SCHEMA t TO anon, authenticated, service_role;
CREATE TABLE t.results (n serial PRIMARY KEY, label text, ok boolean, detail text);
GRANT INSERT, SELECT ON t.results TO anon, authenticated, service_role;
GRANT USAGE ON SEQUENCE t.results_n_seq TO anon, authenticated, service_role;

CREATE FUNCTION t.today() RETURNS date LANGUAGE sql STABLE AS
  $$ SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date $$;

CREATE FUNCTION t.s(n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS
  $$ SELECT ('00000000-0000-0000-0000-000000000' || lpad(n::text, 3, '0'))::uuid $$;

CREATE FUNCTION t.expect_ok(p_label text, p_sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t.results (label, ok, detail) VALUES (p_label, false, 'raised: ' || SQLERRM);
    RETURN;
  END;
  INSERT INTO t.results (label, ok, detail) VALUES (p_label, true, 'ok');
END $$;

CREATE FUNCTION t.expect_err(p_label text, p_sql text, p_pattern text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t.results (label, ok, detail)
    VALUES (p_label, SQLERRM ~* p_pattern, 'raised: ' || SQLERRM);
    RETURN;
  END;
  INSERT INTO t.results (label, ok, detail) VALUES (p_label, false, 'did NOT raise');
END $$;

CREATE FUNCTION t.check(p_label text, p_cond boolean) RETURNS void LANGUAGE sql AS
  $$ INSERT INTO t.results (label, ok, detail) VALUES (p_label, coalesce(p_cond, false), '') $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO anon, authenticated, service_role;

-- A salary call, by staff number, date expression and optional flag.
CREATE FUNCTION t.call(n int, d text, flag text DEFAULT NULL) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT format(
    'SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, '
    'p_monthly_gross => 7000, p_effective_from => %s%s)',
    t.s(n), '00000000-0000-0000-0000-0000000000b1'::uuid, d,
    CASE WHEN flag IS NULL THEN '' ELSE ', p_allow_past => ' || flag END)
$$;
CREATE FUNCTION t.ins(n int, d text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT format(
    'INSERT INTO public.hr_staff_salaries (staff_id, hr_organization_id, monthly_gross, effective_from) '
    'VALUES (%L, %L, 5000, %s)', t.s(n), '00000000-0000-0000-0000-0000000000b1'::uuid, d)
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
SELECT t.check('structure: exactly one fn_hr_set_staff_salary (no overload left behind)',
  (SELECT count(*) FROM pg_proc WHERE proname = 'fn_hr_set_staff_salary') = 1);
SELECT t.check('structure: the one left takes 19 arguments, last is p_allow_past boolean default false',
  (SELECT pronargs = 19 AND proargnames[19] = 'p_allow_past'
          AND pg_get_function_arguments(oid) LIKE '%p_allow_past boolean DEFAULT false'
     FROM pg_proc WHERE proname = 'fn_hr_set_staff_salary'));
SELECT t.check('structure: fn_hr_set_staff_salary stays SECURITY INVOKER (RLS still decides who writes)',
  (SELECT NOT prosecdef FROM pg_proc WHERE proname = 'fn_hr_set_staff_salary'));
SELECT t.check('grants: anon cannot execute fn_hr_set_staff_salary',
  NOT has_function_privilege('anon', (SELECT oid FROM pg_proc WHERE proname = 'fn_hr_set_staff_salary'), 'EXECUTE'));
SELECT t.check('grants: PUBLIC holds no EXECUTE on fn_hr_set_staff_salary',
  NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
               WHERE p.proname = 'fn_hr_set_staff_salary' AND a.grantee = 0));
SELECT t.check('grants: authenticated and service_role can execute fn_hr_set_staff_salary',
  has_function_privilege('authenticated', (SELECT oid FROM pg_proc WHERE proname = 'fn_hr_set_staff_salary'), 'EXECUTE')
  AND has_function_privilege('service_role', (SELECT oid FROM pg_proc WHERE proname = 'fn_hr_set_staff_salary'), 'EXECUTE'));
SELECT t.check('grants: anon cannot execute the trigger function directly',
  NOT has_function_privilege('anon', 'public.hr_staff_salaries_refuse_past_start()', 'EXECUTE'));
SELECT t.check('structure: the trigger is on hr_staff_salaries, BEFORE INSERT OR UPDATE, enabled, once',
  (SELECT count(*) = 1 AND bool_and(tgenabled = 'O') FROM pg_trigger
    WHERE tgname = 'trg_hr_staff_salaries_refuse_past_start'
      AND tgrelid = 'public.hr_staff_salaries'::regclass));

-- ---------------------------------------------------------------------------
-- HR head (hr_head role, hr.payroll.salary.manage granted by the table migration)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('sub', :'UHR', 'role', 'authenticated')::text, false);
SET ROLE authenticated;

SELECT t.expect_err('HR head: a start YESTERDAY is refused',
  t.call(1, 't.today() - 1'), 'cannot start in the past');
SELECT t.expect_ok ('HR head: a start TODAY is allowed',   t.call(2, 't.today()'));
SELECT t.expect_ok ('HR head: a start NEXT MONTH is allowed', t.call(3, 't.today() + 30'));
SELECT t.expect_err('HR head: asking for the past-date exception is refused (past date)',
  t.call(4, 't.today() - 20', 'true'), 'only a super admin');
SELECT t.expect_err('HR head: asking for the past-date exception is refused even with a future date',
  t.call(4, 't.today() + 5', 'true'), 'only a super admin');
SELECT t.expect_ok ('HR head: p_allow_past => false behaves like no flag (future ok)',
  t.call(20, 't.today() + 3', 'false'));
SELECT t.expect_ok ('HR head: re-uploading an IDENTICAL already-started salary still succeeds (writes nothing)',
  t.call(10, 't.today() - 29'));
SELECT t.expect_ok ('HR head: a new salary from today supersedes a row that started in the past',
  t.call(11, 't.today()'));
SELECT t.expect_ok ('HR head: a new salary from today supersedes a row with no start recorded',
  t.call(12, 't.today()'));

-- Direct writes to the table: the route around the function.
SELECT t.expect_err('HR head: DIRECT insert starting yesterday is refused',
  t.ins(5, 't.today() - 1'), 'cannot start in the past');
SELECT t.expect_ok ('HR head: DIRECT insert starting next week is allowed (as before)',
  t.ins(6, 't.today() + 7'));
SELECT t.expect_err('HR head: DIRECT edit of the pay on a row that already started is refused',
  format('UPDATE public.hr_staff_salaries SET monthly_gross = 99999 WHERE staff_id = %L AND effective_from < t.today()', t.s(11)),
  'already started');
SELECT t.expect_err('HR head: DIRECT edit of the pay on a row with no start recorded is refused',
  format('UPDATE public.hr_staff_salaries SET monthly_gross = 99999 WHERE staff_id = %L AND effective_from IS NULL', t.s(12)),
  'already started');
SELECT t.expect_ok ('HR head: DIRECT edit of a row that starts in the future is allowed',
  format('UPDATE public.hr_staff_salaries SET monthly_gross = 8100 WHERE staff_id = %L', t.s(13)));
SELECT t.expect_err('HR head: DIRECT move of a future start to yesterday is refused',
  format('UPDATE public.hr_staff_salaries SET effective_from = t.today() - 1 WHERE staff_id = %L', t.s(13)),
  'already started');

-- The flag alone opens nothing: the trigger re-checks is_super_admin().
SELECT set_config('app.hr_salary_allow_past', 'on', false);
SELECT t.expect_err('HR head: setting the import flag by hand does not let a past DIRECT insert through',
  t.ins(7, 't.today() - 3'), 'cannot start in the past');
SELECT set_config('app.hr_salary_allow_past', '', false);
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Super admin
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('sub', :'USA', 'role', 'authenticated')::text, false);
SET ROLE authenticated;

SELECT t.expect_err('Super admin WITHOUT the import flag: a past start is refused',
  t.call(8, 't.today() - 60'), 'cannot start in the past');
SELECT t.expect_ok ('Super admin WITH the import flag: a past start is allowed (history import)',
  t.call(8, 't.today() - 60', 'true'));
SELECT t.expect_ok ('Super admin WITH the flag: a later past row supersedes the first (history in order)',
  t.call(8, 't.today() - 30', 'true'));
SELECT t.expect_err('Super admin: a DIRECT insert with a past start is refused (only the import path may)',
  t.ins(15, 't.today() - 2'), 'cannot start in the past');

-- The flag is cleared after the one insert it was set for.
BEGIN;
SELECT t.expect_ok ('Super admin: import of a past row, then in the SAME transaction ...',
  t.call(9, 't.today() - 10', 'true'));
SELECT t.expect_err('... a DIRECT past insert is still refused (flag was cleared)',
  t.ins(14, 't.today() - 10'), 'cannot start in the past');
COMMIT;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Signed-in user with NO staff row and NO role, and one with no profile at all
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('sub', :'UNO', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT t.expect_err('No-role user: a future start is refused (row-level security, as before)',
  t.call(16, 't.today() + 5'), 'row-level security');
SELECT t.expect_err('No-role user: a past start is refused',
  t.call(16, 't.today() - 5'), 'cannot start in the past|row-level security');
SELECT t.expect_err('No-role user: asking for the import flag is refused',
  t.call(16, 't.today() - 5', 'true'), 'only a super admin');
SELECT t.expect_err('No-role user: a DIRECT future insert is refused (row-level security, as before)',
  t.ins(16, 't.today() + 5'), 'row-level security');
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('sub', :'UGH', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT t.expect_err('User with no profile: a future start is refused (row-level security)',
  t.call(16, 't.today() + 5'), 'row-level security');
SELECT t.expect_err('User with no profile: asking for the import flag is refused',
  t.call(16, 't.today() - 5', 'true'), 'only a super admin');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- service_role (server jobs): the ruling has one exception, and it is not this
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
SET ROLE service_role;
SELECT t.expect_err('service_role: a past start is refused', t.call(17, 't.today() - 1'), 'cannot start in the past');
SELECT t.expect_ok ('service_role: a start today is allowed', t.call(17, 't.today()'));
SELECT t.expect_err('service_role: asking for the import flag is refused', t.call(17, 't.today() - 1', 'true'), 'only a super admin');
SELECT t.expect_err('service_role: a DIRECT past insert is refused', t.ins(21, 't.today() - 1'), 'cannot start in the past');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, false);
SET ROLE anon;
SELECT t.expect_err('anon: cannot execute fn_hr_set_staff_salary at all',
  t.call(18, 't.today() + 5'), 'permission denied for function');
SELECT t.expect_err('anon: a DIRECT insert is refused', t.ins(18, 't.today() + 5'), 'row-level security|permission denied');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- The database owner (migrations, an operator's repair). The function check
-- still applies to it; the table trigger deliberately does not.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '', false);
SELECT t.expect_err('owner: a past start through the FUNCTION is refused (function check, not the trigger)',
  t.call(19, 't.today() - 1'), 'cannot start in the past');
SELECT t.expect_ok ('owner: a DIRECT past insert is not stopped by the trigger (documented exemption)',
  t.ins(19, 't.today() - 1'));

-- ---------------------------------------------------------------------------
-- What landed
-- ---------------------------------------------------------------------------
SELECT t.check('refused calls wrote nothing (staff 1, 4, 5, 7, 14, 15, 16, 18, 21 have no salary rows)',
  NOT EXISTS (SELECT 1 FROM public.hr_staff_salaries
               WHERE staff_id IN (t.s(1), t.s(4), t.s(5), t.s(7), t.s(14), t.s(15), t.s(16), t.s(18), t.s(21))));
SELECT t.check('HR head today row is in force for staff 2 and starts today',
  (SELECT effective_from = t.today() FROM public.hr_staff_salaries WHERE staff_id = t.s(2) AND superseded_by IS NULL));
SELECT t.check('identical re-upload for staff 10 wrote no second row',
  (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = t.s(10)) = 1);
SELECT t.check('staff 11: the past row is superseded by the new one starting today',
  (SELECT count(*) = 2 AND count(*) FILTER (WHERE superseded_by IS NULL AND effective_from = t.today()) = 1
     FROM public.hr_staff_salaries WHERE staff_id = t.s(11)));
SELECT t.check('staff 11: the superseded past row kept its pay (the refused direct edit changed nothing)',
  (SELECT monthly_gross = 6000 FROM public.hr_staff_salaries WHERE staff_id = t.s(11) AND superseded_by IS NOT NULL));
SELECT t.check('staff 13: the allowed future edit stuck and the refused move did not',
  (SELECT monthly_gross = 8100 AND effective_from = t.today() + 10 FROM public.hr_staff_salaries WHERE staff_id = t.s(13)));
SELECT t.check('staff 8: super admin history import left two rows, the later one in force',
  (SELECT count(*) = 2 AND max(effective_from) FILTER (WHERE superseded_by IS NULL) = t.today() - 30
     FROM public.hr_staff_salaries WHERE staff_id = t.s(8)));
SELECT t.check('staff 9: the super admin import inside the transaction committed',
  (SELECT count(*) = 1 FROM public.hr_staff_salaries WHERE staff_id = t.s(9) AND effective_from = t.today() - 10));
SELECT t.check('staff 2: created_by is the HR head (auth.uid() from the JWT, unchanged)',
  (SELECT created_by = :'UHR'::uuid FROM public.hr_staff_salaries WHERE staff_id = t.s(2)));
SELECT t.check('the import flag is not left set on the session',
  coalesce(current_setting('app.hr_salary_allow_past', true), '') = '');

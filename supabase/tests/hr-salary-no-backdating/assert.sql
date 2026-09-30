-- Assertions for 20270521090000_hr_salary_no_backdating.sql.
-- Run by run.sh as the cluster superuser, which SWITCHES ROLE per case:
--   SET ROLE authenticated / anon / service_role + request.jwt.claims
-- exactly as PostgREST does. Queries never run as the owner except in the
-- "owner" cases, because an owner/superuser skips RLS and would prove nothing.
--
-- There is no faked clock: "today" is today in India when the run happens.
-- Every date below is relative to it (t.today()).
--
-- Every case writes one row to t.results. run.sh prints them and fails the run
-- on any FAIL.

\set UHR  '00000000-0000-0000-0000-0000000000c1'
\set USA  '00000000-0000-0000-0000-0000000000c2'
\set UNO  '00000000-0000-0000-0000-0000000000c3'
\set UGH  '00000000-0000-0000-0000-0000000000c4'
\set UDIR '00000000-0000-0000-0000-0000000000c5'

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

-- A salary call, by staff number, date expression, optional flag and gross.
CREATE FUNCTION t.call(n int, d text, flag text DEFAULT NULL, gross int DEFAULT 7000) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT format(
    'SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, '
    'p_monthly_gross => %s, p_effective_from => %s%s)',
    t.s(n), '00000000-0000-0000-0000-0000000000b1'::uuid, gross, d,
    CASE WHEN flag IS NULL THEN '' ELSE ', p_allow_past => ' || flag END)
$$;
CREATE FUNCTION t.ins(n int, d text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT format(
    'INSERT INTO public.hr_staff_salaries (staff_id, hr_organization_id, monthly_gross, effective_from) '
    'VALUES (%L, %L, 5000, %s)', t.s(n), '00000000-0000-0000-0000-0000000000b1'::uuid, d)
$$;
-- The row in force for a staff number (owner-side check helpers).
CREATE FUNCTION t.in_force(n int) RETURNS numeric LANGUAGE sql STABLE AS
  $$ SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = t.s(n) AND superseded_by IS NULL $$;
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
SELECT t.check('structure: the exception asks fn_is_the_director(), not is_super_admin()',
  (SELECT prosrc LIKE '%fn_is_the_director()%' AND prosrc NOT LIKE '%is_super_admin%'
     FROM pg_proc WHERE proname = 'fn_hr_set_staff_salary')
  AND (SELECT prosrc LIKE '%fn_is_the_director()%' AND prosrc NOT LIKE '%is_super_admin%'
     FROM pg_proc WHERE proname = 'hr_staff_salaries_refuse_past_start'));
SELECT t.check('grants: anon cannot execute fn_hr_set_staff_salary',
  NOT has_function_privilege('anon', (SELECT oid FROM pg_proc WHERE proname = 'fn_hr_set_staff_salary'), 'EXECUTE'));
SELECT t.check('grants: PUBLIC holds no EXECUTE on fn_hr_set_staff_salary',
  NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
               WHERE p.proname = 'fn_hr_set_staff_salary' AND a.grantee = 0));
SELECT t.check('grants: authenticated and service_role can execute fn_hr_set_staff_salary',
  has_function_privilege('authenticated', (SELECT oid FROM pg_proc WHERE proname = 'fn_hr_set_staff_salary'), 'EXECUTE')
  AND has_function_privilege('service_role', (SELECT oid FROM pg_proc WHERE proname = 'fn_hr_set_staff_salary'), 'EXECUTE'));
SELECT t.check('grants: anon and authenticated cannot execute the trigger function directly',
  NOT has_function_privilege('anon', 'public.hr_staff_salaries_refuse_past_start()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.hr_staff_salaries_refuse_past_start()', 'EXECUTE'));
-- tgtype bits: 2 = BEFORE, 4 = INSERT, 8 = DELETE, 16 = UPDATE, 1 = ROW.
SELECT t.check('structure: the trigger is on hr_staff_salaries, BEFORE INSERT OR UPDATE OR DELETE, per row, enabled, once',
  (SELECT count(*) = 1 AND bool_and(tgenabled = 'O') AND bool_and(tgtype & (1|2|4|8|16) = (1|2|4|8|16))
     FROM pg_trigger
    WHERE tgname = 'trg_hr_staff_salaries_refuse_past_start'
      AND tgrelid = 'public.hr_staff_salaries'::regclass));
SELECT t.check('structure: the Director list holds exactly the director@ profile',
  (SELECT value = jsonb_build_array(:'UDIR') FROM public.platform_policies
    WHERE policy_key = 'platform.the_director_profile_ids'));

-- ---------------------------------------------------------------------------
-- HR head (hr_head role, hr.payroll.salary.manage granted by the table migration)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('sub', :'UHR', 'role', 'authenticated')::text, false);
SET ROLE authenticated;

SELECT t.expect_err('HR head: a start YESTERDAY is refused',
  t.call(1, 't.today() - 1'), 'cannot start in the past');
SELECT t.expect_ok ('HR head: a start TODAY is allowed (a raise dated today still goes in)',   t.call(2, 't.today()'));
SELECT t.expect_ok ('HR head: a start NEXT MONTH is allowed', t.call(3, 't.today() + 30'));
SELECT t.expect_err('HR head: asking for the past-date exception is refused (past date)',
  t.call(4, 't.today() - 20', 'true'), 'only the director');
SELECT t.expect_err('HR head: asking for the past-date exception is refused even with a future date',
  t.call(4, 't.today() + 5', 'true'), 'only the director');
SELECT t.expect_ok ('HR head: p_allow_past => false behaves like no flag (future ok)',
  t.call(20, 't.today() + 3', 'false'));
SELECT t.expect_ok ('HR head: p_allow_past => NULL behaves like no flag (future ok)',
  t.call(26, 't.today() + 3', 'NULL'));
SELECT t.expect_ok ('HR head: re-uploading an IDENTICAL already-started salary still succeeds (writes nothing)',
  t.call(10, 't.today() - 29'));
SELECT t.expect_ok ('HR head: a new salary from today supersedes a row that started in the past',
  t.call(11, 't.today()'));
SELECT t.expect_ok ('HR head: a new salary from today supersedes a row with no start recorded',
  t.call(12, 't.today()'));

-- "Today" is India's today whatever the session's time zone says.
SET TIME ZONE 'America/Los_Angeles';
SELECT t.expect_err('HR head, session in Los Angeles time: India-yesterday is still refused',
  t.call(27, 't.today() - 1'), 'cannot start in the past');
SELECT t.expect_ok ('HR head, session in Los Angeles time: India-today is still allowed',
  t.call(27, 't.today()'));
RESET TIME ZONE;

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
SELECT t.expect_err('HR head: DIRECT clearing of a future start is refused',
  format('UPDATE public.hr_staff_salaries SET effective_from = NULL WHERE staff_id = %L', t.s(13)),
  'already started');

-- The revive attack (W12 review): A (old, 40000) superseded by B (in force, 50000).
SELECT t.expect_err('HR head: DIRECT re-point of the row in force (B.superseded_by = A) is refused',
  format('UPDATE public.hr_staff_salaries SET superseded_by = %L WHERE id = %L',
         '00000000-0000-0000-0000-00000000a022', '00000000-0000-0000-0000-00000000b022'),
  'can only change by recording a new salary');
SELECT t.expect_err('HR head: DIRECT revive of an old salary (A.superseded_by = NULL) is refused',
  format('UPDATE public.hr_staff_salaries SET superseded_by = NULL WHERE id = %L',
         '00000000-0000-0000-0000-00000000a022'),
  'can only change by recording a new salary');
SELECT t.expect_err('HR head: DIRECT re-point of an old salary to another row is refused',
  format('UPDATE public.hr_staff_salaries SET superseded_by = %L WHERE id = %L',
         '00000000-0000-0000-0000-00000000a010', '00000000-0000-0000-0000-00000000a022'),
  'can only change by recording a new salary');
SELECT t.expect_err('HR head: DIRECT retire of a future row that is in force is refused',
  format('UPDATE public.hr_staff_salaries SET superseded_by = %L WHERE staff_id = %L',
         '00000000-0000-0000-0000-00000000a010', t.s(13)),
  'can only change by recording a new salary');
-- Deletes in this order (unreferenced rows first) so that, if the guard were
-- missing, each case records a FAIL instead of the run stopping on the
-- superseded_by foreign key.
SELECT t.expect_err('HR head: DELETE of a future-dated salary is refused',
  format('DELETE FROM public.hr_staff_salaries WHERE staff_id = %L', t.s(13)),
  'cannot be deleted');
SELECT t.expect_err('HR head: DELETE of an old (superseded) salary is refused',
  format('DELETE FROM public.hr_staff_salaries WHERE id = %L', '00000000-0000-0000-0000-00000000a022'),
  'cannot be deleted');
SELECT t.expect_err('HR head: DELETE of the row in force is refused',
  format('DELETE FROM public.hr_staff_salaries WHERE id = %L', '00000000-0000-0000-0000-00000000b022'),
  'cannot be deleted');

-- The past-date setting alone opens nothing: the trigger re-checks the Director list.
SELECT set_config('app.hr_salary_allow_past', 'on', false);
SELECT t.expect_err('HR head: setting the import flag by hand does not let a past DIRECT insert through',
  t.ins(7, 't.today() - 3'), 'cannot start in the past');
SELECT set_config('app.hr_salary_allow_past', '', false);
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Super admin who is NOT on the Director list (e.g. the shared test account)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('sub', :'USA', 'role', 'authenticated')::text, false);
SET ROLE authenticated;

SELECT t.expect_err('Super admin (not listed) WITHOUT the flag: a past start is refused',
  t.call(15, 't.today() - 60'), 'cannot start in the past');
SELECT t.expect_err('Super admin (not listed) WITH the flag: refused, only the Director may',
  t.call(15, 't.today() - 60', 'true'), 'only the director');
SELECT t.expect_err('Super admin (not listed) WITH the flag and a future date: refused too',
  t.call(15, 't.today() + 5', 'true'), 'only the director');
SELECT t.expect_ok ('Super admin (not listed): a normal start today is allowed',
  t.call(28, 't.today()'));
SELECT t.expect_err('Super admin (not listed): a DIRECT past insert is refused',
  t.ins(15, 't.today() - 2'), 'cannot start in the past');
SELECT set_config('app.hr_salary_allow_past', 'on', false);
SELECT t.expect_err('Super admin (not listed): the flag set by hand still does not open a DIRECT past insert',
  t.ins(15, 't.today() - 2'), 'cannot start in the past');
SELECT set_config('app.hr_salary_allow_past', '', false);
SELECT t.expect_err('Super admin (not listed): DIRECT revive of an old salary is refused',
  format('UPDATE public.hr_staff_salaries SET superseded_by = NULL WHERE id = %L',
         '00000000-0000-0000-0000-00000000a022'),
  'can only change by recording a new salary');
SELECT t.expect_err('Super admin (not listed): DELETE is refused',
  format('DELETE FROM public.hr_staff_salaries WHERE id = %L', '00000000-0000-0000-0000-00000000a022'),
  'cannot be deleted');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- The Director (on the list)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('sub', :'UDIR', 'role', 'authenticated')::text, false);
SET ROLE authenticated;

SELECT t.expect_err('Director WITHOUT the flag: a past start is refused (the exception must be asked for)',
  t.call(8, 't.today() - 60'), 'cannot start in the past');
SELECT t.expect_ok ('Director WITH the flag: first salary for a person, past start, is recorded',
  t.call(8, 't.today() - 60', 'true', 6000));
SELECT t.expect_ok ('Director WITH the flag: a LATER past row (T-30) replaces it',
  t.call(8, 't.today() - 30', 'true', 6500));
SELECT t.expect_ok ('Director WITH the flag: an OLDER row (T-90) is filed as history',
  t.call(8, 't.today() - 90', 'true', 5000));
SELECT t.expect_ok ('Director WITH the flag: a row in between (T-45) is filed as history',
  t.call(8, 't.today() - 45', 'true', 6200));
SELECT t.expect_ok ('Director WITH the flag: the same T-90 history row again writes nothing',
  t.call(8, 't.today() - 90', 'true', 5000));
SELECT t.expect_ok ('Director WITH the flag: history against a row in force with NO start recorded',
  t.call(23, 't.today() - 40', 'true', 8000));
SELECT t.expect_ok ('Director WITH the flag: history against a row in force that started T-29 (staff 22)',
  t.call(22, 't.today() - 100', 'true', 45000));
SELECT t.expect_ok ('Director WITH the flag and a FUTURE date: a normal change',
  t.call(29, 't.today() + 5', 'true'));
SELECT t.expect_err('Director: a DIRECT past insert is refused (only the function may)',
  t.ins(24, 't.today() - 2'), 'cannot start in the past');
SELECT t.expect_err('Director: DIRECT revive of an old salary is refused',
  format('UPDATE public.hr_staff_salaries SET superseded_by = NULL WHERE id = %L',
         '00000000-0000-0000-0000-00000000a022'),
  'can only change by recording a new salary');
SELECT t.expect_err('Director: DIRECT edit of the pay on a row already started is refused',
  format('UPDATE public.hr_staff_salaries SET monthly_gross = 1 WHERE id = %L',
         '00000000-0000-0000-0000-00000000b022'),
  'already started');
SELECT t.expect_err('Director: DELETE is refused',
  format('DELETE FROM public.hr_staff_salaries WHERE id = %L', '00000000-0000-0000-0000-00000000a022'),
  'cannot be deleted');

-- The past-date setting is cleared after the one insert it was set for.
BEGIN;
SELECT t.expect_ok ('Director: import of a past row, then in the SAME transaction ...',
  t.call(9, 't.today() - 10', 'true'));
SELECT t.expect_err('... a DIRECT past insert is still refused (setting was cleared)',
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
SELECT t.expect_err('No-role user: asking for the exception is refused',
  t.call(16, 't.today() - 5', 'true'), 'only the director');
SELECT t.expect_err('No-role user: a DIRECT future insert is refused (row-level security, as before)',
  t.ins(16, 't.today() + 5'), 'row-level security');
-- RLS hides every row from this user, so an update or delete touches nothing.
SELECT t.expect_ok ('No-role user: DIRECT revive attempt touches nothing (rows are hidden)',
  format('UPDATE public.hr_staff_salaries SET superseded_by = NULL WHERE id = %L', '00000000-0000-0000-0000-00000000a022'));
SELECT t.expect_ok ('No-role user: DELETE attempt touches nothing (rows are hidden)',
  format('DELETE FROM public.hr_staff_salaries WHERE id = %L', '00000000-0000-0000-0000-00000000a022'));
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('sub', :'UGH', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT t.expect_err('User with no profile: a future start is refused (row-level security)',
  t.call(16, 't.today() + 5'), 'row-level security');
SELECT t.expect_err('User with no profile: asking for the exception is refused',
  t.call(16, 't.today() - 5', 'true'), 'only the director');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- service_role (server jobs): not on the Director list, so no exception
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
SET ROLE service_role;
SELECT t.expect_err('service_role: a past start is refused', t.call(17, 't.today() - 1'), 'cannot start in the past');
SELECT t.expect_ok ('service_role: a start today is allowed (a late job may still write a raise dated today)', t.call(17, 't.today()'));
SELECT t.expect_err('service_role: asking for the exception is refused', t.call(17, 't.today() - 1', 'true'), 'only the director');
SELECT t.expect_err('service_role: a DIRECT past insert is refused', t.ins(21, 't.today() - 1'), 'cannot start in the past');
SELECT t.expect_err('service_role: DIRECT revive of an old salary is refused',
  format('UPDATE public.hr_staff_salaries SET superseded_by = NULL WHERE id = %L', '00000000-0000-0000-0000-00000000a022'),
  'can only change by recording a new salary');
SELECT t.expect_err('service_role: DELETE of a salary row is refused',
  format('DELETE FROM public.hr_staff_salaries WHERE id = %L', '00000000-0000-0000-0000-00000000a022'),
  'cannot be deleted');
SELECT t.expect_ok ('service_role: deleting a STAFF record still removes their salaries (cascade runs as the owner)',
  format('DELETE FROM public.staff WHERE id = %L', t.s(25)));
RESET ROLE;

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, false);
SET ROLE anon;
SELECT t.expect_err('anon: cannot execute fn_hr_set_staff_salary at all',
  t.call(18, 't.today() + 5'), 'permission denied for function');
SELECT t.expect_err('anon: a DIRECT insert is refused', t.ins(18, 't.today() + 5'), 'row-level security|permission denied');
SELECT set_config('app.hr_salary_allow_past', 'on', false);
SELECT t.expect_err('anon: a DIRECT past insert with the flag set is refused (no Director check reachable)',
  t.ins(18, 't.today() - 5'), 'cannot start in the past|row-level security|permission denied');
SELECT set_config('app.hr_salary_allow_past', '', false);
SELECT t.expect_ok ('anon: DELETE attempt touches nothing (rows are hidden)',
  format('DELETE FROM public.hr_staff_salaries WHERE id = %L', '00000000-0000-0000-0000-00000000a022'));
RESET ROLE;

-- ---------------------------------------------------------------------------
-- The database owner (migrations, an operator's repair). The function check
-- still applies to it; the table trigger deliberately does not.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '', false);
SELECT t.expect_err('owner: a past start through the FUNCTION is refused (function check, not the trigger)',
  t.call(19, 't.today() - 1'), 'cannot start in the past');
SELECT t.expect_err('owner: asking for the exception through the FUNCTION is refused (no signed-in Director)',
  t.call(19, 't.today() - 1', 'true'), 'only the director');
SELECT t.expect_ok ('owner: a DIRECT past insert is not stopped by the trigger (documented exemption)',
  t.ins(19, 't.today() - 1'));

-- ---------------------------------------------------------------------------
-- What landed
-- ---------------------------------------------------------------------------
SELECT t.check('refused calls wrote nothing (staff 1, 4, 5, 7, 14, 15, 16, 18, 21, 24 have no salary rows)',
  NOT EXISTS (SELECT 1 FROM public.hr_staff_salaries
               WHERE staff_id IN (t.s(1), t.s(4), t.s(5), t.s(7), t.s(14), t.s(15), t.s(16), t.s(18), t.s(21), t.s(24))));
SELECT t.check('HR head today row is in force for staff 2 and starts today',
  (SELECT effective_from = t.today() FROM public.hr_staff_salaries WHERE staff_id = t.s(2) AND superseded_by IS NULL));
SELECT t.check('identical re-upload for staff 10 wrote no second row',
  (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = t.s(10)) = 1);
SELECT t.check('staff 11: the past row is superseded by the new one starting today',
  (SELECT count(*) = 2 AND count(*) FILTER (WHERE superseded_by IS NULL AND effective_from = t.today()) = 1
     FROM public.hr_staff_salaries WHERE staff_id = t.s(11)));
SELECT t.check('staff 11: the superseded past row kept its pay (the refused direct edit changed nothing)',
  (SELECT monthly_gross = 6000 FROM public.hr_staff_salaries WHERE staff_id = t.s(11) AND superseded_by IS NOT NULL));
SELECT t.check('staff 13: the allowed future edit stuck; the refused move, clear, retire and delete did not',
  (SELECT count(*) = 1 AND bool_and(monthly_gross = 8100 AND effective_from = t.today() + 10 AND superseded_by IS NULL)
     FROM public.hr_staff_salaries WHERE staff_id = t.s(13)));
SELECT t.check('staff 22: B (50000) is still in force and A is still superseded by B (revive refused, delete refused)',
  t.in_force(22) = 50000
  AND (SELECT superseded_by = '00000000-0000-0000-0000-00000000b022'::uuid FROM public.hr_staff_salaries
        WHERE id = '00000000-0000-0000-0000-00000000a022'));
SELECT t.check('staff 22: the Director''s T-100 history row sits between A and B, pointing at B; pay in force unchanged',
  (SELECT count(*) = 3 FROM public.hr_staff_salaries WHERE staff_id = t.s(22))
  AND (SELECT superseded_by = '00000000-0000-0000-0000-00000000b022'::uuid FROM public.hr_staff_salaries
        WHERE staff_id = t.s(22) AND monthly_gross = 45000 AND effective_from = t.today() - 100));
SELECT t.check('staff 8: four rows (T-90, T-60, T-45, T-30), the T-90 re-import wrote no fifth',
  (SELECT count(*) = 4 FROM public.hr_staff_salaries WHERE staff_id = t.s(8)));
SELECT t.check('staff 8: TODAY''S PAY KEPT: T-30 (6500) is still the row in force after two older imports',
  (SELECT monthly_gross = 6500 AND effective_from = t.today() - 30
     FROM public.hr_staff_salaries WHERE staff_id = t.s(8) AND superseded_by IS NULL));
SELECT t.check('staff 8: the chain in date order: T-90 -> T-60, T-60 -> T-30, T-45 -> T-30',
  (SELECT bool_and(CASE s.effective_from
            WHEN t.today() - 90 THEN n.effective_from = t.today() - 60
            WHEN t.today() - 60 THEN n.effective_from = t.today() - 30
            WHEN t.today() - 45 THEN n.effective_from = t.today() - 30
            ELSE true END)
     FROM public.hr_staff_salaries s
     LEFT JOIN public.hr_staff_salaries n ON n.id = s.superseded_by
    WHERE s.staff_id = t.s(8) AND s.superseded_by IS NOT NULL));
SELECT t.check('staff 23: the row with no start stays in force (9000); the T-40 history row points at it',
  t.in_force(23) = 9000
  AND (SELECT superseded_by = '00000000-0000-0000-0000-00000000a023'::uuid FROM public.hr_staff_salaries
        WHERE staff_id = t.s(23) AND effective_from = t.today() - 40));
SELECT t.check('staff 9: the Director''s import inside the transaction committed',
  (SELECT count(*) = 1 FROM public.hr_staff_salaries WHERE staff_id = t.s(9) AND effective_from = t.today() - 10));
SELECT t.check('staff 25: the staff delete cascaded to their salary row',
  NOT EXISTS (SELECT 1 FROM public.hr_staff_salaries WHERE staff_id = t.s(25)));
SELECT t.check('staff 2: created_by is the HR head (auth.uid() from the JWT, unchanged)',
  (SELECT created_by = :'UHR'::uuid FROM public.hr_staff_salaries WHERE staff_id = t.s(2)));
SELECT t.check('every staff member has at most one row in force',
  NOT EXISTS (SELECT 1 FROM public.hr_staff_salaries WHERE superseded_by IS NULL GROUP BY staff_id HAVING count(*) > 1));
SELECT t.check('neither setting is left set on the session',
  coalesce(current_setting('app.hr_salary_allow_past', true), '') = ''
  AND coalesce(current_setting('app.hr_salary_supersede', true), '') = '');

-- Assertions for 20270603090000_hr_salary_no_backdating.sql
-- (Director rulings of 30 Sep 2026, 08:59: only the Director list writes pay;
-- no salary change may start before today, for anybody; no exception).
--
-- Run by run.sh as the cluster superuser, which SWITCHES ROLE per case:
--   SET ROLE authenticated / anon / service_role + request.jwt.claims
-- exactly as PostgREST does. Queries never run as the owner except in the
-- "owner" cases, because an owner/superuser skips RLS and the trigger's API
-- check and would prove nothing.
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
\set UISV '00000000-0000-0000-0000-0000000000c6'
\set ULNS '00000000-0000-0000-0000-0000000000c7'

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

-- A salary call, by staff number, date expression and gross.
CREATE FUNCTION t.call(n int, d text, gross int DEFAULT 7000) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT format(
    'SELECT public.fn_hr_set_staff_salary(p_staff_id => %L, p_hr_organization_id => %L, '
    'p_monthly_gross => %s, p_effective_from => %s)',
    t.s(n), '00000000-0000-0000-0000-0000000000b1'::uuid, gross, d)
$$;
CREATE FUNCTION t.ins(n int, d text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT format(
    'INSERT INTO public.hr_staff_salaries (staff_id, hr_organization_id, monthly_gross, effective_from) '
    'VALUES (%L, %L, 5000, %s)', t.s(n), '00000000-0000-0000-0000-0000000000b1'::uuid, d)
$$;
-- The row in force for a staff number (owner-side check helper).
CREATE FUNCTION t.in_force(n int) RETURNS numeric LANGUAGE sql STABLE AS
  $$ SELECT monthly_gross FROM public.hr_staff_salaries WHERE staff_id = t.s(n) AND superseded_by IS NULL $$;

-- STAND-IN for the approvals job (Draft #4120, hr_salary_revision_apply_due_on
-- inside fn_hr_salary_revision_apply_due). The real one is SECURITY DEFINER,
-- owned by the database owner, and calls fn_hr_set_staff_salary with named
-- arguments and effective_from = the approved start date. This stand-in has
-- exactly that shape; #4120's own tables and checks are not loaded here.
CREATE FUNCTION t.approvals_job(n int, d date) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN public.fn_hr_set_staff_salary(
    p_staff_id           => t.s(n),
    p_hr_organization_id => '00000000-0000-0000-0000-0000000000b1'::uuid,
    p_monthly_gross      => 9500,
    p_effective_from     => d,
    p_notes              => 'Salary revision approved by the Director (rehearsal).');
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Structure and grants
-- ---------------------------------------------------------------------------
SELECT t.check('structure: exactly one fn_hr_set_staff_salary (no overload left behind)',
  (SELECT count(*) FROM pg_proc WHERE proname = 'fn_hr_set_staff_salary') = 1);
SELECT t.check('structure: it takes main''s 18 arguments; no p_allow_past parameter anywhere',
  (SELECT pronargs = 18 AND NOT ('p_allow_past' = ANY (proargnames))
     FROM pg_proc WHERE proname = 'fn_hr_set_staff_salary'));
SELECT t.check('structure: fn_hr_set_staff_salary stays SECURITY INVOKER',
  (SELECT NOT prosecdef FROM pg_proc WHERE proname = 'fn_hr_set_staff_salary'));
SELECT t.check('structure: no past-date door left: neither body mentions allow_past, and neither asks is_super_admin()',
  (SELECT prosrc NOT LIKE '%allow_past%' AND prosrc NOT LIKE '%is_super_admin%'
     FROM pg_proc WHERE proname = 'fn_hr_set_staff_salary')
  AND (SELECT prosrc NOT LIKE '%allow_past%' AND prosrc NOT LIKE '%is_super_admin%'
     FROM pg_proc WHERE proname = 'hr_staff_salaries_guard_writes'));
SELECT t.check('structure: both the function and the guard ask fn_is_the_director()',
  (SELECT prosrc LIKE '%fn_is_the_director()%' FROM pg_proc WHERE proname = 'fn_hr_set_staff_salary')
  AND (SELECT prosrc LIKE '%fn_is_the_director()%' FROM pg_proc WHERE proname = 'hr_staff_salaries_guard_writes'));
-- The 00:00-05:30 India window (UTC is still on the previous day). There is no
-- faked clock, so the rule is pinned two ways: both bodies compute "today"
-- with exactly this expression, and the expression gives India's date for a
-- fixed instant inside that window.
SELECT t.check('today in India: both bodies use (now() AT TIME ZONE ''Asia/Kolkata'')::date, and 19:00 UTC on 30 Sep is 1 Oct there',
  (SELECT prosrc LIKE '%(now() AT TIME ZONE ''Asia/Kolkata'')::date%' FROM pg_proc WHERE proname = 'fn_hr_set_staff_salary')
  AND (SELECT prosrc LIKE '%(now() AT TIME ZONE ''Asia/Kolkata'')::date%' FROM pg_proc WHERE proname = 'hr_staff_salaries_guard_writes')
  AND ('2026-09-30 19:00:00+00'::timestamptz AT TIME ZONE 'Asia/Kolkata')::date = DATE '2026-10-01'
  AND ('2026-09-30 18:29:00+00'::timestamptz AT TIME ZONE 'Asia/Kolkata')::date = DATE '2026-09-30');
SELECT t.check('grants: anon cannot execute fn_hr_set_staff_salary',
  NOT has_function_privilege('anon', (SELECT oid FROM pg_proc WHERE proname = 'fn_hr_set_staff_salary'), 'EXECUTE'));
SELECT t.check('grants: PUBLIC holds no EXECUTE on fn_hr_set_staff_salary',
  NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
               WHERE p.proname = 'fn_hr_set_staff_salary' AND a.grantee = 0));
SELECT t.check('grants: authenticated and service_role can execute fn_hr_set_staff_salary',
  has_function_privilege('authenticated', (SELECT oid FROM pg_proc WHERE proname = 'fn_hr_set_staff_salary'), 'EXECUTE')
  AND has_function_privilege('service_role', (SELECT oid FROM pg_proc WHERE proname = 'fn_hr_set_staff_salary'), 'EXECUTE'));
SELECT t.check('grants: anon and authenticated cannot execute the guard function directly',
  NOT has_function_privilege('anon', 'public.hr_staff_salaries_guard_writes()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.hr_staff_salaries_guard_writes()', 'EXECUTE'));
-- tgtype bits: 2 = BEFORE, 4 = INSERT, 8 = DELETE, 16 = UPDATE, 1 = ROW.
SELECT t.check('structure: the guard is on hr_staff_salaries, BEFORE INSERT OR UPDATE OR DELETE, per row, enabled, once',
  (SELECT count(*) = 1 AND bool_and(tgenabled = 'O') AND bool_and(tgtype & (1|2|4|8|16) = (1|2|4|8|16))
     FROM pg_trigger
    WHERE tgname = 'trg_hr_staff_salaries_guard_writes'
      AND tgrelid = 'public.hr_staff_salaries'::regclass));
SELECT t.check('structure: the earlier draft''s guard (refuse_past_start) is gone, trigger and function',
  NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_hr_staff_salaries_refuse_past_start')
  AND to_regprocedure('public.hr_staff_salaries_refuse_past_start()') IS NULL);
SELECT t.check('reads unchanged: the table keeps exactly its three row rules (service_role, select, write)',
  (SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies WHERE tablename = 'hr_staff_salaries')
  = ARRAY['hr_staff_salaries_select', 'hr_staff_salaries_service_role', 'hr_staff_salaries_write']);
SELECT t.check('reads unchanged: the select rule is still super admin OR salary.view OR your own pay',
  (SELECT qual LIKE '%is_super_admin()%' AND qual LIKE '%hr.payroll.salary.view%' AND qual LIKE '%fn_my_staff_ids()%'
     FROM pg_policies WHERE policyname = 'hr_staff_salaries_select'));
SELECT t.check('structure: the Director list holds director@, isvarya@ and the rehearsal''s listed plain account (c7)',
  (SELECT value @> jsonb_build_array(:'UDIR', :'UISV') AND jsonb_array_length(value) = 3
     FROM public.platform_policies WHERE policy_key = 'platform.the_director_profile_ids'));

-- ---------------------------------------------------------------------------
-- The Director (director@, on the list, super admin)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('sub', :'UDIR', 'role', 'authenticated')::text, false);
SET ROLE authenticated;

SELECT t.expect_err('Director: a start YESTERDAY is refused',
  t.call(1, 't.today() - 1'), 'cannot start in the past');
SELECT t.expect_err('Director: a start 60 days ago is refused (no exception, no parameter to ask for one)',
  t.call(1, 't.today() - 60'), 'cannot start in the past');
SELECT t.expect_ok ('Director: a start TODAY is allowed',            t.call(2, 't.today()'));
SELECT t.expect_ok ('Director: a start NEXT MONTH is allowed',       t.call(3, 't.today() + 30'));
SELECT t.expect_ok ('Director: saving an IDENTICAL already-started salary still succeeds (writes nothing)',
  t.call(10, 't.today() - 29'));
SELECT t.expect_ok ('Director: a new salary from today supersedes a row that started in the past',
  t.call(11, 't.today()'));
SELECT t.expect_ok ('Director: a new salary from today supersedes a row with no start recorded',
  t.call(12, 't.today()'));
SELECT t.expect_ok ('Director: a raise from the 1st of next month supersedes the row in force',
  t.call(22, $$(date_trunc('month', t.today()) + interval '1 month')::date$$, 52000));

-- "Today" is India's today whatever the session's time zone says.
SET TIME ZONE 'America/Los_Angeles';
SELECT t.expect_err('Director, session in Los Angeles time: India-yesterday is still refused',
  t.call(27, 't.today() - 1'), 'cannot start in the past');
SELECT t.expect_ok ('Director, session in Los Angeles time: India-today is still allowed',
  t.call(27, 't.today()'));
RESET TIME ZONE;

-- Direct writes to the table.
SELECT t.expect_err('Director: DIRECT insert starting yesterday is refused',
  t.ins(5, 't.today() - 1'), 'cannot start in the past');
SELECT t.expect_err('Director: DIRECT insert with no start is refused',
  t.ins(5, 'NULL'), 'cannot start in the past|null value');
SELECT t.expect_ok ('Director: DIRECT insert starting next week is allowed',
  t.ins(6, 't.today() + 7'));
SELECT t.expect_err('Director: DIRECT edit of the pay on a row that already started is refused',
  format('UPDATE public.hr_staff_salaries SET monthly_gross = 99999 WHERE id = %L', '00000000-0000-0000-0000-00000000a011'),
  'already started');
SELECT t.expect_err('Director: DIRECT edit of the pay on a row with no start recorded is refused',
  format('UPDATE public.hr_staff_salaries SET monthly_gross = 99999 WHERE id = %L', '00000000-0000-0000-0000-00000000a012'),
  'already started');
SELECT t.expect_ok ('Director: DIRECT edit of a row that starts in the future is allowed',
  format('UPDATE public.hr_staff_salaries SET monthly_gross = 8100 WHERE staff_id = %L', t.s(13)));
SELECT t.expect_err('Director: DIRECT move of a future start to yesterday is refused',
  format('UPDATE public.hr_staff_salaries SET effective_from = t.today() - 1 WHERE staff_id = %L', t.s(13)),
  'already started');
SELECT t.expect_err('Director: DIRECT clearing of a future start is refused',
  format('UPDATE public.hr_staff_salaries SET effective_from = NULL WHERE staff_id = %L', t.s(13)),
  'already started|null value');

-- The revive attack (W12 review): A (old, 40000) superseded by B (50000, which
-- the raise above has just superseded in turn).
SELECT t.expect_err('Director: DIRECT re-point of B.superseded_by back to A is refused',
  format('UPDATE public.hr_staff_salaries SET superseded_by = %L WHERE id = %L',
         '00000000-0000-0000-0000-00000000a022', '00000000-0000-0000-0000-00000000b022'),
  'can only change by recording a new salary');
SELECT t.expect_err('Director: DIRECT revive of an old salary (A.superseded_by = NULL) is refused',
  format('UPDATE public.hr_staff_salaries SET superseded_by = NULL WHERE id = %L',
         '00000000-0000-0000-0000-00000000a022'),
  'can only change by recording a new salary');
SELECT t.expect_err('Director: DIRECT re-point of an old salary to another row is refused',
  format('UPDATE public.hr_staff_salaries SET superseded_by = %L WHERE id = %L',
         '00000000-0000-0000-0000-00000000a010', '00000000-0000-0000-0000-00000000a022'),
  'can only change by recording a new salary');
SELECT t.expect_err('Director: DIRECT retire of a future row that is in force is refused',
  format('UPDATE public.hr_staff_salaries SET superseded_by = %L WHERE staff_id = %L',
         '00000000-0000-0000-0000-00000000a010', t.s(13)),
  'can only change by recording a new salary');
-- Deletes in this order (unreferenced rows first) so that, if the guard were
-- missing, each case records a FAIL instead of the run stopping on the
-- superseded_by foreign key.
SELECT t.expect_err('Director: DELETE of a future-dated salary is refused',
  format('DELETE FROM public.hr_staff_salaries WHERE staff_id = %L', t.s(13)),
  'cannot be deleted');
SELECT t.expect_err('Director: DELETE of an old (superseded) salary is refused',
  format('DELETE FROM public.hr_staff_salaries WHERE id = %L', '00000000-0000-0000-0000-00000000a022'),
  'cannot be deleted');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Isvarya (isvarya@, on the list, super admin)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('sub', :'UISV', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT t.expect_ok ('Isvarya: a start today is allowed',          t.call(30, 't.today()'));
SELECT t.expect_ok ('Isvarya: a start next month is allowed',     t.call(30, 't.today() + 30', 7500));
SELECT t.expect_err('Isvarya: a start yesterday is refused',      t.call(31, 't.today() - 1'), 'cannot start in the past');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- HR head (hr_head role, hr.payroll.salary.manage granted by the table
-- migration): LOOK ONLY now.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('sub', :'UHR', 'role', 'authenticated')::text, false);
SET ROLE authenticated;

SELECT t.check('HR head: can still READ the salaries (reads unchanged)',
  (SELECT count(*) > 0 FROM public.hr_staff_salaries));
SELECT t.expect_err('HR head: a start NEXT MONTH is refused (only the Director)',
  t.call(4, 't.today() + 30'), 'only the director');
SELECT t.expect_err('HR head: a start TODAY is refused (only the Director)',
  t.call(4, 't.today()'), 'only the director');
SELECT t.expect_err('HR head: a start YESTERDAY is refused',
  t.call(4, 't.today() - 1'), 'only the director');
SELECT t.expect_err('HR head: saving an identical salary is refused too (who is checked first)',
  t.call(10, 't.today() - 29'), 'only the director');
SELECT t.expect_err('HR head: DIRECT insert starting next week is refused',
  t.ins(4, 't.today() + 7'), 'only the director');
SELECT t.expect_err('HR head: DIRECT edit of a future row is refused',
  format('UPDATE public.hr_staff_salaries SET monthly_gross = 1 WHERE staff_id = %L', t.s(13)),
  'only the director');
SELECT t.expect_err('HR head: DIRECT revive of an old salary is refused',
  format('UPDATE public.hr_staff_salaries SET superseded_by = NULL WHERE id = %L',
         '00000000-0000-0000-0000-00000000a022'),
  'only the director');
SELECT t.expect_err('HR head: DELETE is refused',
  format('DELETE FROM public.hr_staff_salaries WHERE staff_id = %L', t.s(13)),
  'only the director');
-- The supersede setting cannot be set through the Data API; even set by hand
-- it opens nothing for someone not on the list.
SELECT set_config('app.hr_salary_supersede', '00000000-0000-0000-0000-00000000b022', false);
SELECT t.expect_err('HR head: the supersede setting set by hand does not let a retire through',
  format('UPDATE public.hr_staff_salaries SET superseded_by = %L WHERE id = %L',
         '00000000-0000-0000-0000-00000000a010', '00000000-0000-0000-0000-00000000b022'),
  'only the director');
SELECT set_config('app.hr_salary_supersede', '', false);
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Super admin who is NOT on the Director list (e.g. the shared test account)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('sub', :'USA', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT t.check('Super admin (not listed): can still READ the salaries (reads unchanged)',
  (SELECT count(*) > 0 FROM public.hr_staff_salaries));
SELECT t.expect_err('Super admin (not listed): a start today is refused',
  t.call(15, 't.today()'), 'only the director');
SELECT t.expect_err('Super admin (not listed): a future start is refused',
  t.call(15, 't.today() + 5'), 'only the director');
SELECT t.expect_err('Super admin (not listed): a DIRECT future insert is refused',
  t.ins(15, 't.today() + 2'), 'only the director');
SELECT t.expect_err('Super admin (not listed): DELETE is refused',
  format('DELETE FROM public.hr_staff_salaries WHERE id = %L', '00000000-0000-0000-0000-00000000a022'),
  'only the director');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- On the list but neither a super admin nor holding the HR salary keys: the
-- table's row rule (unchanged) still refuses. Documents that each listed
-- account must ALSO pass today's row rules; both named accounts are super
-- admins (not verified against production here).
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('sub', :'ULNS', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT t.expect_err('Listed but no super admin / HR keys: refused by the row rule (nothing written)',
  t.call(32, 't.today() + 5'), 'row-level security');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Signed-in user with NO staff row and NO role, and one with no profile at all
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('sub', :'UNO', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT t.expect_err('No-role user: a future start is refused',
  t.call(16, 't.today() + 5'), 'only the director');
SELECT t.expect_err('No-role user: a past start is refused',
  t.call(16, 't.today() - 5'), 'only the director');
SELECT t.expect_err('No-role user: a DIRECT future insert is refused',
  t.ins(16, 't.today() + 5'), 'only the director|row-level security');
-- RLS hides every row from this user, so an update or delete touches nothing.
SELECT t.expect_ok ('No-role user: DIRECT revive attempt touches nothing (rows are hidden)',
  format('UPDATE public.hr_staff_salaries SET superseded_by = NULL WHERE id = %L', '00000000-0000-0000-0000-00000000a022'));
SELECT t.expect_ok ('No-role user: DELETE attempt touches nothing (rows are hidden)',
  format('DELETE FROM public.hr_staff_salaries WHERE id = %L', '00000000-0000-0000-0000-00000000a022'));
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('sub', :'UGH', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT t.expect_err('User with no profile: a future start is refused',
  t.call(16, 't.today() + 5'), 'only the director');
SELECT t.expect_err('User with no profile: a DIRECT future insert is refused',
  t.ins(16, 't.today() + 5'), 'only the director|row-level security');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- The approvals job (stand-in with #4120's shape: SECURITY DEFINER, owned by
-- the owner). Whoever triggers it, it writes as trusted database code.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
SET ROLE service_role;
SELECT t.expect_ok ('Approvals job (from the schedule, service_role): an approved raise starting today is written',
  format('SELECT t.approvals_job(33, t.today())'));
SELECT t.expect_err('Approvals job (from the schedule): a start date already passed is refused (no exception)',
  format('SELECT t.approvals_job(34, t.today() - 1)'), 'cannot start in the past');
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('sub', :'UHR', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT t.expect_ok ('Approvals job run from the HR head''s session: the Director-approved raise is still written',
  format('SELECT t.approvals_job(35, t.today())'));
RESET ROLE;

-- ---------------------------------------------------------------------------
-- service_role (the server key)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
SET ROLE service_role;
SELECT t.expect_ok ('service_role: a FUTURE start is allowed', t.call(17, 't.today() + 5'));
SELECT t.expect_ok ('service_role: a start today is allowed',  t.call(20, 't.today()'));
SELECT t.expect_err('service_role: a past start is refused',   t.call(26, 't.today() - 1'), 'cannot start in the past');
SELECT t.expect_ok ('service_role: a DIRECT future insert is allowed', t.ins(21, 't.today() + 3'));
SELECT t.expect_err('service_role: a DIRECT past insert is refused', t.ins(26, 't.today() - 1'), 'cannot start in the past');
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
SELECT t.expect_err('anon: a DIRECT insert is refused', t.ins(18, 't.today() + 5'),
  'only the director|row-level security|permission denied');
SELECT t.expect_ok ('anon: DELETE attempt touches nothing (rows are hidden)',
  format('DELETE FROM public.hr_staff_salaries WHERE id = %L', '00000000-0000-0000-0000-00000000a022'));
RESET ROLE;

-- ---------------------------------------------------------------------------
-- The database owner (migrations, an operator's repair). The function's
-- past-date check still applies to it; the table guard deliberately does not.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '', false);
SELECT t.expect_err('owner: a past start through the FUNCTION is refused',
  t.call(19, 't.today() - 1'), 'cannot start in the past');
SELECT t.expect_ok ('owner: a start today through the FUNCTION is allowed', t.call(19, 't.today()'));
SELECT t.expect_ok ('owner: a DIRECT past insert is not stopped by the guard (documented exemption)',
  t.ins(24, 't.today() - 1'));

-- ---------------------------------------------------------------------------
-- What landed
-- ---------------------------------------------------------------------------
SELECT t.check('refused calls wrote nothing (staff 1, 4, 5, 15, 16, 18, 26, 31, 32, 34 have no salary rows)',
  NOT EXISTS (SELECT 1 FROM public.hr_staff_salaries
               WHERE staff_id IN (t.s(1), t.s(4), t.s(5), t.s(15), t.s(16), t.s(18), t.s(26), t.s(31), t.s(32), t.s(34))));
SELECT t.check('staff 2: the Director''s row starts today, is in force, created_by = the Director',
  (SELECT effective_from = t.today() AND created_by = :'UDIR'::uuid
     FROM public.hr_staff_salaries WHERE staff_id = t.s(2) AND superseded_by IS NULL));
SELECT t.check('staff 10: the identical save wrote no second row',
  (SELECT count(*) FROM public.hr_staff_salaries WHERE staff_id = t.s(10)) = 1);
SELECT t.check('staff 11: the past row is superseded by the new one starting today',
  (SELECT count(*) = 2 AND count(*) FILTER (WHERE superseded_by IS NULL AND effective_from = t.today()) = 1
     FROM public.hr_staff_salaries WHERE staff_id = t.s(11)));
SELECT t.check('staff 11: the superseded past row kept its pay (the refused direct edit changed nothing)',
  (SELECT monthly_gross = 6000 FROM public.hr_staff_salaries WHERE id = '00000000-0000-0000-0000-00000000a011'));
SELECT t.check('staff 13: the Director''s future edit stuck; the refused move, clear, retire, HR edit and deletes did not',
  (SELECT count(*) = 1 AND bool_and(monthly_gross = 8100 AND effective_from = t.today() + 10 AND superseded_by IS NULL)
     FROM public.hr_staff_salaries WHERE staff_id = t.s(13)));
SELECT t.check('staff 22: the raise from the 1st of next month is in force; B is superseded by it; A still points at B',
  t.in_force(22) = 52000
  AND (SELECT superseded_by IS NOT NULL FROM public.hr_staff_salaries WHERE id = '00000000-0000-0000-0000-00000000b022')
  AND (SELECT superseded_by = '00000000-0000-0000-0000-00000000b022'::uuid FROM public.hr_staff_salaries
        WHERE id = '00000000-0000-0000-0000-00000000a022'));
SELECT t.check('staff 30: Isvarya''s next-month row (7500) is in force, superseding her today row',
  t.in_force(30) = 7500
  AND (SELECT count(*) = 2 FROM public.hr_staff_salaries WHERE staff_id = t.s(30)));
SELECT t.check('staff 33 and 35: the approvals job wrote the approved raise (9500) in force from today',
  t.in_force(33) = 9500 AND t.in_force(35) = 9500);
SELECT t.check('staff 17, 20, 21: the service_role writes landed',
  t.in_force(17) = 7000 AND t.in_force(20) = 7000 AND t.in_force(21) = 5000);
SELECT t.check('staff 25: the staff delete cascaded to their salary row',
  NOT EXISTS (SELECT 1 FROM public.hr_staff_salaries WHERE staff_id = t.s(25)));
SELECT t.check('every staff member has at most one row in force',
  NOT EXISTS (SELECT 1 FROM public.hr_staff_salaries WHERE superseded_by IS NULL GROUP BY staff_id HAVING count(*) > 1));
SELECT t.check('the supersede setting is not left set on the session',
  coalesce(current_setting('app.hr_salary_supersede', true), '') = '');

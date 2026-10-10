-- Probe for section 3 of 20270603090000_hr_salary_no_backdating.sql:
-- hr_staff_salary_directory() shows the pay in force TODAY next to the newest
-- row (added 2026-10-09). Before: a change saved today for the 1st of next
-- month showed on Employee Salaries as today's pay.
--
-- Run by run.sh after assert.sql, on the same throwaway cluster, as the
-- cluster superuser, which SWITCHES ROLE per call exactly as PostgREST does.
-- No faked clock: "today" is today in India when the run happens.
--
-- STUBS (owner, before any case): the rehearsal does not model the roster, so
-- v_hr_staff, institutions, hr_staff_payroll and role_has_institution_access()
-- are minimal stand-ins. What is under test is the function's own body: the
-- permission RAISE (the real user_has_permission), the newest row, the walk
-- back to the row in force, and the row set.
--
-- Each case writes one row to td.results; run.sh prints them and fails the run
-- on any FAIL.

\set UNO  '00000000-0000-0000-0000-0000000000c3'
\set UDIR '00000000-0000-0000-0000-0000000000c5'

CREATE SCHEMA td;
CREATE TABLE td.results (n serial PRIMARY KEY, label text, ok boolean, detail text);

CREATE FUNCTION td.today() RETURNS date LANGUAGE sql STABLE AS
  $$ SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date $$;
CREATE FUNCTION td.s(n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS
  $$ SELECT ('00000000-0000-0000-0000-000000000' || lpad(n::text, 3, '0'))::uuid $$;
CREATE FUNCTION td.r(n int, k int) RETURNS uuid LANGUAGE sql IMMUTABLE AS
  $$ SELECT ('00000000-0000-0000-0000-0000000' || lpad(n::text, 3, '0') || 'd' || k)::uuid $$;
CREATE FUNCTION td.first_of_next_month() RETURNS date LANGUAGE sql STABLE AS
  $$ SELECT (date_trunc('month', td.today()) + interval '1 month')::date $$;

-- ---------------------------------------------------------------------------
-- Stubs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institutions (id uuid PRIMARY KEY, name text);
INSERT INTO public.institutions VALUES ('00000000-0000-0000-0000-0000000000e1', 'Test College')
  ON CONFLICT DO NOTHING;
ALTER TABLE public.hr_organizations ADD COLUMN IF NOT EXISTS name text;
CREATE TABLE IF NOT EXISTS public.hr_staff_payroll (staff_id uuid PRIMARY KEY, hr_organization_id uuid);
CREATE OR REPLACE VIEW public.v_hr_staff AS
  SELECT st.id,
         'S' || right(st.id::text, 3) AS staff_id,
         'Person'::text AS first_name,
         right(st.id::text, 3) AS last_name,
         'Teacher'::text AS designation,
         st.is_active,
         '00000000-0000-0000-0000-0000000000e1'::uuid AS institution_id
    FROM public.staff st;
CREATE OR REPLACE FUNCTION public.role_has_institution_access(p uuid)
  RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;

-- ---------------------------------------------------------------------------
-- Seed, as the owner (the write guard does not stop the owner, so history can
-- be laid down). Staff 41..46 are this probe's own; nothing else uses them.
--   41: A started T-29 (30000), replaced by B from the 1st of next month (35000)
--   42: one row with NO start (20000)
--   43: A with NO start (21000), replaced by B from the 1st of next month (26000)
--   44: a new joiner: only a row from the 1st of next month (18000)
--   45: A started T-60 (40000) -> B from T+5 (45000) -> C from T+20 (47000)
--   46: A started T-60 (10000), replaced by B from TODAY (12000)
-- ---------------------------------------------------------------------------
INSERT INTO public.staff (id) SELECT td.s(n) FROM generate_series(41, 46) n;

INSERT INTO public.hr_staff_salaries (id, staff_id, hr_organization_id, monthly_gross, allowance_amount, effective_from) VALUES
  (td.r(41, 2), td.s(41), '00000000-0000-0000-0000-0000000000b1', 35000, 500, td.first_of_next_month()),
  (td.r(42, 1), td.s(42), '00000000-0000-0000-0000-0000000000b1', 20000, 0,   NULL),
  (td.r(43, 2), td.s(43), '00000000-0000-0000-0000-0000000000b1', 26000, 0,   td.first_of_next_month()),
  (td.r(44, 1), td.s(44), '00000000-0000-0000-0000-0000000000b1', 18000, 0,   td.first_of_next_month()),
  (td.r(45, 3), td.s(45), '00000000-0000-0000-0000-0000000000b1', 47000, 0,   td.today() + 20),
  (td.r(46, 2), td.s(46), '00000000-0000-0000-0000-0000000000b1', 12000, 0,   td.today());
INSERT INTO public.hr_staff_salaries (id, staff_id, hr_organization_id, monthly_gross, allowance_amount, effective_from, superseded_by) VALUES
  (td.r(41, 1), td.s(41), '00000000-0000-0000-0000-0000000000b1', 30000, 250, td.today() - 29, td.r(41, 2)),
  (td.r(43, 1), td.s(43), '00000000-0000-0000-0000-0000000000b1', 21000, 0,   NULL,            td.r(43, 2)),
  (td.r(45, 2), td.s(45), '00000000-0000-0000-0000-0000000000b1', 45000, 0,   td.today() + 5,  td.r(45, 3)),
  (td.r(46, 1), td.s(46), '00000000-0000-0000-0000-0000000000b1', 10000, 0,   td.today() - 60, td.r(46, 2));
INSERT INTO public.hr_staff_salaries (id, staff_id, hr_organization_id, monthly_gross, allowance_amount, effective_from, superseded_by) VALUES
  (td.r(45, 1), td.s(45), '00000000-0000-0000-0000-0000000000b1', 40000, 0,   td.today() - 60, td.r(45, 2));

-- ---------------------------------------------------------------------------
-- The directory as the Director (signed in, on the list, super admin)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('sub', :'UDIR', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
CREATE TEMP TABLE dir AS SELECT * FROM public.hr_staff_salary_directory();
RESET ROLE;

INSERT INTO td.results (label, ok, detail)
SELECT label, ok, detail FROM (VALUES
  ('41 raise from the 1st of next month: the newest columns are the raise (35000, row B)',
   (SELECT salary_id = td.r(41, 2) AND monthly_gross = 35000 AND effective_from = td.first_of_next_month() FROM dir WHERE staff_uuid = td.s(41)),
   (SELECT format('salary_id=%s gross=%s from=%s', salary_id, monthly_gross, effective_from) FROM dir WHERE staff_uuid = td.s(41))),
  ('41 ... and the pay in force TODAY is the old one (30000 + 250, row A, from T-29)',
   (SELECT in_force_salary_id = td.r(41, 1) AND in_force_monthly_gross = 30000 AND in_force_allowance_amount = 250
           AND in_force_effective_from = td.today() - 29 AND in_force_annual_gross IS NOT DISTINCT FROM (SELECT annual_gross FROM public.hr_staff_salaries WHERE id = td.r(41, 1))
      FROM dir WHERE staff_uuid = td.s(41)),
   (SELECT format('in_force=%s gross=%s allow=%s from=%s', in_force_salary_id, in_force_monthly_gross, in_force_allowance_amount, in_force_effective_from) FROM dir WHERE staff_uuid = td.s(41))),
  ('42 a row with no start counts as in force',
   (SELECT in_force_salary_id = td.r(42, 1) AND in_force_monthly_gross = 20000 AND salary_id = td.r(42, 1) FROM dir WHERE staff_uuid = td.s(42)),
   (SELECT format('in_force=%s', in_force_salary_id) FROM dir WHERE staff_uuid = td.s(42))),
  ('43 no-start row replaced by a raise from next month: in force = the no-start row',
   (SELECT in_force_salary_id = td.r(43, 1) AND in_force_monthly_gross = 21000 AND in_force_effective_from IS NULL
           AND salary_id = td.r(43, 2) FROM dir WHERE staff_uuid = td.s(43)),
   (SELECT format('in_force=%s salary_id=%s', in_force_salary_id, salary_id) FROM dir WHERE staff_uuid = td.s(43))),
  ('44 new joiner whose first pay starts next month: salary recorded, nothing in force yet',
   (SELECT salary_id = td.r(44, 1) AND monthly_gross = 18000 AND in_force_salary_id IS NULL AND in_force_monthly_gross IS NULL FROM dir WHERE staff_uuid = td.s(44)),
   (SELECT format('salary_id=%s in_force=%s', salary_id, in_force_salary_id) FROM dir WHERE staff_uuid = td.s(44))),
  ('45 two rows queued after today: the walk goes back past both to row A (40000)',
   (SELECT in_force_salary_id = td.r(45, 1) AND in_force_monthly_gross = 40000 AND salary_id = td.r(45, 3) FROM dir WHERE staff_uuid = td.s(45)),
   (SELECT format('in_force=%s salary_id=%s', in_force_salary_id, salary_id) FROM dir WHERE staff_uuid = td.s(45))),
  ('46 a change that starts TODAY is in force today (12000, row B)',
   (SELECT in_force_salary_id = td.r(46, 2) AND in_force_monthly_gross = 12000 AND salary_id = td.r(46, 2) FROM dir WHERE staff_uuid = td.s(46)),
   (SELECT format('in_force=%s', in_force_salary_id) FROM dir WHERE staff_uuid = td.s(46))),
  ('13 (assert.sql seed) one row from T+10: nothing in force yet',
   (SELECT in_force_salary_id IS NULL AND salary_id IS NOT NULL FROM dir WHERE staff_uuid = td.s(13)),
   (SELECT format('salary_id=%s in_force=%s', salary_id, in_force_salary_id) FROM dir WHERE staff_uuid = td.s(13))),
  ('every row: the newest columns are still the row a save replaces (superseded_by IS NULL)',
   (SELECT bool_and(d.salary_id IS NOT DISTINCT FROM (SELECT x.id FROM public.hr_staff_salaries x WHERE x.staff_id = d.staff_uuid AND x.superseded_by IS NULL)) FROM dir d),
   NULL),
  ('every row with a started newest row: in force = newest',
   (SELECT bool_and(d.in_force_salary_id = d.salary_id) FROM dir d
     WHERE d.salary_id IS NOT NULL AND (d.effective_from IS NULL OR d.effective_from <= td.today())),
   NULL),
  ('the same people as before: one row per active person or person with a salary',
   (SELECT count(*) FROM dir) = (SELECT count(*) FROM public.v_hr_staff s
                                   LEFT JOIN public.hr_staff_salaries sal ON sal.staff_id = s.id AND sal.superseded_by IS NULL
                                  WHERE COALESCE(s.is_active, false) OR sal.id IS NOT NULL)
     AND (SELECT count(DISTINCT staff_uuid) FROM dir) = (SELECT count(*) FROM dir),
   (SELECT format('rows=%s', count(*)) FROM dir))
) v(label, ok, detail);

-- ---------------------------------------------------------------------------
-- The gate is unchanged
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_state text := 'no error';
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000c3', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM * FROM public.hr_staff_salary_directory();
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  RESET ROLE;
  INSERT INTO td.results (label, ok, detail)
  VALUES ('signed in without hr.payroll.salary.view: refused (42501), not an empty list', v_state = '42501', v_state);
END $$;

INSERT INTO td.results (label, ok, detail)
SELECT 'anon cannot run it; authenticated and service_role can',
       NOT has_function_privilege('anon', 'public.hr_staff_salary_directory()', 'EXECUTE')
       AND NOT has_function_privilege('public', 'public.hr_staff_salary_directory()', 'EXECUTE')
       AND has_function_privilege('authenticated', 'public.hr_staff_salary_directory()', 'EXECUTE')
       AND has_function_privilege('service_role', 'public.hr_staff_salary_directory()', 'EXECUTE'),
       NULL;

INSERT INTO td.results (label, ok, detail)
SELECT 'one definition only, SECURITY DEFINER, 32 columns',
       (SELECT count(*) FROM pg_proc WHERE proname = 'hr_staff_salary_directory') = 1
       AND (SELECT prosecdef FROM pg_proc WHERE proname = 'hr_staff_salary_directory')
       AND (SELECT cardinality(proallargtypes) FROM pg_proc WHERE proname = 'hr_staff_salary_directory') = 32,
       (SELECT format('defs=%s cols=%s', count(*), max(cardinality(proallargtypes))) FROM pg_proc WHERE proname = 'hr_staff_salary_directory');

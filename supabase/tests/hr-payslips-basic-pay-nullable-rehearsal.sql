-- ============================================================================
-- hr-payslips-basic-pay-nullable-rehearsal.sql                    (2026-09-30)
-- Rehearses 20270523090000 on a THROWAWAY local PostgreSQL 16 cluster, after
-- hr-payslips-basic-pay-nullable-run.sh has loaded the stub and the real
-- helper functions, table migration and policies. NEVER run on production.
--
-- Every check prints "PASS <n> ..." or stops the run with "FAIL <n> ...".
-- Run with ON_ERROR_STOP so the first failure ends it.
-- ============================================================================

\set sa     '''11111111-1111-1111-1111-111111111111'''
\set adm    '''22222222-2222-2222-2222-222222222222'''
\set hro    '''33333333-3333-3333-3333-333333333333'''
\set own    '''44444444-4444-4444-4444-444444444444'''
\set nobody '''55555555-5555-5555-5555-555555555555'''

-- ---------------------------------------------------------------------------
-- Fixture, written as the cluster owner (bypasses RLS).
-- ---------------------------------------------------------------------------
INSERT INTO public.institutions VALUES ('aaaaaaaa-0000-0000-0000-000000000001');
INSERT INTO public.hr_organizations VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', true);
INSERT INTO public.profiles (id, is_super_admin, role, institution_id) VALUES
  (:sa,  true,  'super_admin', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (:adm, false, 'admin',       'aaaaaaaa-0000-0000-0000-000000000001'),
  (:hro, false, 'staff',       'aaaaaaaa-0000-0000-0000-000000000001'),
  -- A signed-in person with a profile but NO role and no HR role_key.
  (:own, false, NULL,          'aaaaaaaa-0000-0000-0000-000000000001');
-- :nobody has NO profile row and NO staff row at all.
INSERT INTO public.staff (id, profile_id, institution_id, role_key) VALUES
  ('cccccccc-0000-0000-0000-000000000001', :hro, 'aaaaaaaa-0000-0000-0000-000000000001', 'hr_officer'),
  ('cccccccc-0000-0000-0000-000000000002', :own, 'aaaaaaaa-0000-0000-0000-000000000001', NULL),
  ('cccccccc-0000-0000-0000-000000000003', NULL, 'aaaaaaaa-0000-0000-0000-000000000001', NULL);
INSERT INTO public.hr_payroll_periods (id, hr_organization_id, institution_id, engine_type, period_year, period_month, total_calendar_days, working_days_count)
VALUES ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001', 'non_teaching', 2026, 8, 31, 22);

-- ---------------------------------------------------------------------------
-- BEFORE the migration: a payslip with no basic cannot be written at all.
-- ---------------------------------------------------------------------------
DO $t$ BEGIN
  BEGIN
    INSERT INTO public.hr_payslips (period_id, staff_id, engine_type, basic_pay, working_days_attended, gross_amount, total_deductions, net_amount)
    VALUES ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 'non_teaching', NULL, 22, 30000, 135, 29865);
    RAISE EXCEPTION 'FAIL 0 a NULL basic was accepted BEFORE the migration: the rehearsal is not testing the change';
  EXCEPTION WHEN not_null_violation THEN
    RAISE NOTICE 'PASS 0 before the migration a NULL basic is refused (23502)';
  END;
END $t$;

-- Snapshot of every row rule and grant, to prove the migration leaves them alone.
CREATE TEMP TABLE pre_policies AS
  SELECT policyname, permissive, cmd, roles::text AS roles, qual, with_check
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hr_payslips';
CREATE TEMP TABLE pre_acl AS
  SELECT relacl::text AS acl, relrowsecurity FROM pg_class WHERE oid = 'public.hr_payslips'::regclass;

-- ---------------------------------------------------------------------------
-- Apply the migration TWICE.
-- ---------------------------------------------------------------------------
\i supabase/migrations/20270523090000_hr_payslips_basic_pay_nullable.sql
\i supabase/migrations/20270523090000_hr_payslips_basic_pay_nullable.sql

DO $t$ BEGIN
  IF (SELECT is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'hr_payslips' AND column_name = 'basic_pay') <> 'YES' THEN
    RAISE EXCEPTION 'FAIL 1 basic_pay is still NOT NULL after the migration';
  END IF;
  RAISE NOTICE 'PASS 1 basic_pay allows NULL after applying the migration twice';

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.hr_payslips'::regclass AND contype = 'c'
                    AND pg_get_constraintdef(oid) LIKE '%basic_pay >= %') THEN
    RAISE EXCEPTION 'FAIL 2 the basic_pay >= 0 check is gone';
  END IF;
  RAISE NOTICE 'PASS 2 CHECK (basic_pay >= 0) still in place';

  IF EXISTS (
      (SELECT policyname, permissive, cmd, roles::text, qual, with_check
         FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hr_payslips'
       EXCEPT SELECT * FROM pre_policies)
      UNION ALL
      (SELECT * FROM pre_policies
       EXCEPT SELECT policyname, permissive, cmd, roles::text, qual, with_check
         FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hr_payslips')) THEN
    RAISE EXCEPTION 'FAIL 3 the migration changed a row rule on hr_payslips';
  END IF;
  IF (SELECT relacl::text FROM pg_class WHERE oid = 'public.hr_payslips'::regclass) IS DISTINCT FROM (SELECT acl FROM pre_acl)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hr_payslips'::regclass) THEN
    RAISE EXCEPTION 'FAIL 3 the migration changed grants or switched RLS off';
  END IF;
  RAISE NOTICE 'PASS 3 row rules (% of them), grants and RLS unchanged', (SELECT count(*) FROM pre_policies);
END $t$;

-- ---------------------------------------------------------------------------
-- As each role.
-- ---------------------------------------------------------------------------

-- Super admin: may write a payslip with no basic, and with a recorded basic;
-- a negative basic is still refused.
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :sa, 'role', 'authenticated')::text, false);
DO $t$ BEGIN
  INSERT INTO public.hr_payslips (period_id, staff_id, engine_type, basic_pay, working_days_attended, gross_amount, total_deductions, net_amount)
  VALUES ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 'non_teaching', NULL, 22, 30000, 135, 29865);
  INSERT INTO public.hr_payslips (period_id, staff_id, engine_type, basic_pay, working_days_attended, gross_amount, total_deductions, net_amount, correction_type, reason)
  VALUES ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 'non_teaching', 12000, 22, 30000, 1575, 28425, 'adjustment', 'rehearsal');
  RAISE NOTICE 'PASS 4 super admin writes a payslip with basic NULL and one with basic 12000';
  BEGIN
    INSERT INTO public.hr_payslips (period_id, staff_id, engine_type, basic_pay, working_days_attended, gross_amount, total_deductions, net_amount, correction_type, reason)
    VALUES ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 'non_teaching', -1, 22, 30000, 0, 30000, 'arrear', 'rehearsal');
    RAISE EXCEPTION 'FAIL 5 a negative basic was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS 5 a negative basic is still refused (23514)';
  END;
  IF (SELECT count(*) FROM public.hr_payslips) <> 2 THEN
    RAISE EXCEPTION 'FAIL 6 super admin should see 2 payslips, sees %', (SELECT count(*) FROM public.hr_payslips);
  END IF;
  RAISE NOTICE 'PASS 6 super admin reads both payslips';
END $t$;
RESET ROLE;

-- Admin (profiles.role = admin): same as before the change.
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :adm, 'role', 'authenticated')::text, false);
DO $t$ BEGIN
  INSERT INTO public.hr_payslips (period_id, staff_id, engine_type, basic_pay, working_days_attended, gross_amount, total_deductions, net_amount, correction_type, reason)
  VALUES ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 'non_teaching', NULL, 22, 30000, 135, 29865, 'backdated', 'rehearsal admin');
  RAISE NOTICE 'PASS 7 admin writes a payslip with basic NULL';
END $t$;
RESET ROLE;

-- HR officer (staff.role_key = hr_officer): allowed by the insert rule, as before.
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :hro, 'role', 'authenticated')::text, false);
DO $t$ BEGIN
  INSERT INTO public.hr_payslips (period_id, staff_id, engine_type, basic_pay, working_days_attended, gross_amount, total_deductions, net_amount, correction_type, reason)
  VALUES ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 'non_teaching', NULL, 22, 30000, 135, 29865, 'recovery', 'rehearsal hr');
  RAISE NOTICE 'PASS 8 hr_officer writes a payslip with basic NULL';
END $t$;
RESET ROLE;

-- A signed-in person with a profile but no role: cannot write, reads only
-- their OWN payslips, and sees their basic as NULL (not a number).
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :own, 'role', 'authenticated')::text, false);
DO $t$ DECLARE n int; nulls int; BEGIN
  BEGIN
    INSERT INTO public.hr_payslips (period_id, staff_id, engine_type, basic_pay, working_days_attended, gross_amount, total_deductions, net_amount, correction_type, reason)
    VALUES ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 'non_teaching', NULL, 22, 99999, 0, 99999, 'arrear', 'self-service');
    RAISE EXCEPTION 'FAIL 9 a no-role user wrote a payslip';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 9 a no-role user cannot write a payslip (42501)';
  END;
  SELECT count(*), count(*) FILTER (WHERE basic_pay IS NULL) INTO n, nulls FROM public.hr_payslips;
  IF n <> 2 OR nulls <> 2
     OR EXISTS (SELECT 1 FROM public.hr_payslips WHERE staff_id <> 'cccccccc-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FAIL 10 own-only read broken: sees % rows (% NULL basic)', n, nulls;
  END IF;
  RAISE NOTICE 'PASS 10 a no-role user reads only their own 2 payslips, basic NULL on both';
END $t$;
RESET ROLE;

-- Signed in, but NO profile and NO staff row at all.
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :nobody, 'role', 'authenticated')::text, false);
DO $t$ BEGIN
  BEGIN
    INSERT INTO public.hr_payslips (period_id, staff_id, engine_type, basic_pay, working_days_attended, gross_amount, total_deductions, net_amount, correction_type, reason)
    VALUES ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 'non_teaching', NULL, 22, 1, 0, 1, 'arrear', 'nobody');
    RAISE EXCEPTION 'FAIL 11 a user with no profile and no staff row wrote a payslip';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 11 no profile, no staff row: cannot write (42501)';
  END;
  IF (SELECT count(*) FROM public.hr_payslips) <> 0 THEN
    RAISE EXCEPTION 'FAIL 12 a user with no profile and no staff row reads % payslips', (SELECT count(*) FROM public.hr_payslips);
  END IF;
  RAISE NOTICE 'PASS 12 no profile, no staff row: reads 0 payslips';
END $t$;
RESET ROLE;

-- Signed out.
SET ROLE anon;
SELECT set_config('request.jwt.claims', '', false);
DO $t$ BEGIN
  BEGIN
    INSERT INTO public.hr_payslips (period_id, staff_id, engine_type, basic_pay, working_days_attended, gross_amount, total_deductions, net_amount, correction_type, reason)
    VALUES ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 'non_teaching', NULL, 22, 1, 0, 1, 'arrear', 'anon');
    RAISE EXCEPTION 'FAIL 13 anon wrote a payslip';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 13 anon cannot write a payslip (42501)';
  END;
  IF (SELECT count(*) FROM public.hr_payslips) <> 0 THEN
    RAISE EXCEPTION 'FAIL 14 anon reads % payslips', (SELECT count(*) FROM public.hr_payslips);
  END IF;
  RAISE NOTICE 'PASS 14 anon reads 0 payslips';
END $t$;
RESET ROLE;

-- Server routes (service_role bypasses RLS): the generator's own path.
SET ROLE service_role;
DO $t$ BEGIN
  INSERT INTO public.hr_payslips (period_id, staff_id, engine_type, basic_pay, working_days_attended, gross_amount, total_deductions, net_amount, correction_type, reason)
  VALUES ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'non_teaching', NULL, 22, 30000, 135, 29865, 'initial', NULL);
  RAISE NOTICE 'PASS 15 service_role writes a payslip with basic NULL';
END $t$;
RESET ROLE;

\echo 'REHEARSAL COMPLETE'

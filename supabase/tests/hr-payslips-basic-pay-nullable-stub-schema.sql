-- ============================================================================
-- hr-payslips-basic-pay-nullable-stub-schema.sql                  (2026-09-30)
-- Throwaway stub for rehearsing 20270523090000 on a LOCAL PostgreSQL 16
-- cluster. NEVER run against production.
--
-- Only the tables hr_payslips and its row rules depend on, with the columns
-- those rules read. Everything that decides access is NOT stubbed: the runner
-- (hr-payslips-basic-pay-nullable-run.sh) loads, verbatim from the repo,
--   * is_super_admin() and is_admin(uuid) from supabase/setup/02_functions.sql,
--   * the real 20260628000000 migration that creates hr_payslips and its policies,
--   * the 20260519000000 recursion fix, and main's final policy bodies
--     from rls_initplan_wrap_sweep.sql,
--   * the restrictive hr_included_gate and its helper from 20260906160000.
-- ============================================================================

DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  -- Another rehearsal on the same throwaway cluster may have created the role
  -- without the bypass; the real service_role has it.
  ALTER ROLE service_role BYPASSRLS;
END $r$;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Supabase's auth.uid(): the JWT subject, from either claim setting.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

-- Supabase hands anon and authenticated table grants by default; RLS is what
-- decides. Mirror that so the rehearsal tests RLS, not a missing grant.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

CREATE TABLE public.institutions (id uuid PRIMARY KEY);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  is_super_admin boolean DEFAULT false,
  role text,
  institution_id uuid
);
CREATE TABLE public.hr_organizations (
  id uuid PRIMARY KEY,
  institution_id uuid,
  included_in_hr boolean NOT NULL DEFAULT true
);
CREATE TABLE public.staff (
  id uuid PRIMARY KEY,
  profile_id uuid,
  institution_id uuid,
  role_key varchar(50),
  is_active boolean DEFAULT true
);
-- FK target only. Nothing writes it in production either.
CREATE TABLE public.hr_pay_scales (id uuid PRIMARY KEY);
-- The real 20260628000000 adds a FK from this table's slip_id to hr_payslips.
CREATE TABLE public.hr_payslip_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_id uuid NOT NULL
);

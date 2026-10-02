-- Minimum stand-in for the production objects hr_pay_band_policies() touches.
-- Throwaway local DB only. The four permission helpers are loaded separately,
-- VERBATIM from supabase/setup/02_functions.sql, by run.sh.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

-- Supabase's default: every new function in public is directly EXECUTE-able by anon.
-- Present here so the migration's REVOKE ... FROM anon is actually exercised.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE TABLE public.institutions (id uuid PRIMARY KEY, name text);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, full_name text, role text,
  is_super_admin boolean DEFAULT false, institution_id uuid REFERENCES public.institutions(id));
CREATE TABLE public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), role_key text UNIQUE,
  permissions jsonb DEFAULT '{}', institution_scope varchar(10) DEFAULT 'own');
CREATE TABLE public.user_roles (user_id uuid, role_id uuid REFERENCES public.custom_roles(id));
CREATE TABLE public.user_institution_access (
  user_id uuid, institution_id uuid, is_active boolean DEFAULT true);

-- platform_policies, with the SELECT policy main has today.
CREATE TABLE public.platform_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key text NOT NULL, scope_type text NOT NULL, scope_id uuid,
  value jsonb NOT NULL, updated_at timestamptz DEFAULT now());
ALTER TABLE public.platform_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_policies_select ON public.platform_policies
  FOR SELECT USING (auth.uid() IS NOT NULL);
GRANT SELECT ON public.platform_policies, public.institutions TO authenticated;

-- Seed. Colleges A, B, C.
INSERT INTO public.institutions VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'College A'),
  ('00000000-0000-0000-0000-0000000000b2', 'College B'),
  ('00000000-0000-0000-0000-0000000000c3', 'College C');

INSERT INTO public.custom_roles (role_key, permissions, institution_scope) VALUES
  ('own_scope_payroll', '{"hr.payroll.salary.view": true}', 'own'),
  ('all_scope_payroll', '{"hr.payroll.salary.view": true}', 'all'),
  ('own_scope_no_key',  '{"hr.payroll.view": true}',        'own');

-- Users. Only the user id is ever put in the JWT; nothing here passes a college id.
INSERT INTO public.profiles (id, full_name, role, is_super_admin, institution_id) VALUES
  ('00000000-0000-0000-0000-00000000aa01', 'Own-scope holder',          'x', false, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000aa02', 'All-scope holder',          'x', false, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000aa03', 'No key',                    'x', false, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000aa04', 'Super admin',               'x', true,  '00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-00000000aa05', 'Own-scope holder + grant C','x', false, '00000000-0000-0000-0000-0000000000a1');

INSERT INTO public.user_roles (user_id, role_id)
SELECT u, (SELECT id FROM public.custom_roles WHERE role_key = k) FROM (VALUES
  ('00000000-0000-0000-0000-00000000aa01'::uuid, 'own_scope_payroll'),
  ('00000000-0000-0000-0000-00000000aa02'::uuid, 'all_scope_payroll'),
  ('00000000-0000-0000-0000-00000000aa03'::uuid, 'own_scope_no_key'),
  ('00000000-0000-0000-0000-00000000aa05'::uuid, 'own_scope_payroll')) v(u, k);

INSERT INTO public.user_institution_access (user_id, institution_id) VALUES
  ('00000000-0000-0000-0000-00000000aa05', '00000000-0000-0000-0000-0000000000c3');

INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value) VALUES
  ('hr.pay_scales', 'institution', '00000000-0000-0000-0000-0000000000a1', '{"pay_matrix":[{"designation":"Typist","basic_pay":6500}]}'),
  ('hr.pay_scales', 'institution', '00000000-0000-0000-0000-0000000000b2', '{"pay_matrix":[{"designation":"Typist","basic_pay":7000}]}'),
  ('hr.pay_scales', 'institution', '00000000-0000-0000-0000-0000000000c3', '{"pay_matrix":[{"designation":"Typist","basic_pay":7500}]}'),
  -- A band row with no college: role_has_institution_access(NULL) is true, so it must be excluded explicitly.
  ('hr.pay_scales', 'institution', NULL,                                   '{"pay_matrix":[{"designation":"Typist","basic_pay":1}]}'),
  -- Another key for college A: must never come back from a pay band read.
  ('hr.allowances_and_increments', 'institution', '00000000-0000-0000-0000-0000000000a1', '{"x":1}');

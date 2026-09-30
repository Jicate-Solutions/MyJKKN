-- Minimum stand-in for the production objects hr_salary_suggestion_inputs() and
-- the rule's write guard touch. Throwaway local DB only. The four permission
-- helpers are loaded separately, VERBATIM from supabase/setup/02_functions.sql,
-- and fn_is_the_director() VERBATIM from #4121's migration, by run.sh.
-- is_admin() is a stand-in: it is not defined anywhere in the repo's SQL.
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
-- As Supabase's: the JWT's role claim, NULL for a session with no JWT.
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

CREATE TABLE public.institutions (id uuid PRIMARY KEY, name text);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, full_name text, role text, email text,
  is_super_admin boolean DEFAULT false, institution_id uuid REFERENCES public.institutions(id));
CREATE TABLE public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), role_key text UNIQUE,
  permissions jsonb DEFAULT '{}', institution_scope varchar(10) DEFAULT 'own');
CREATE TABLE public.user_roles (user_id uuid, role_id uuid REFERENCES public.custom_roles(id));
CREATE TABLE public.user_institution_access (
  user_id uuid, institution_id uuid, is_active boolean DEFAULT true);


-- platform_policies with the W3-M0 columns this function filters on, and the
-- SELECT policy main has today.
CREATE TABLE public.platform_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key text NOT NULL, scope_type text NOT NULL, scope_id uuid,
  value jsonb NOT NULL, draft_value jsonb,
  publication_state text NOT NULL DEFAULT 'published',
  is_active boolean DEFAULT true,
  description text, data_type text, is_system boolean DEFAULT false,
  updated_by uuid, updated_at timestamptz DEFAULT now());
-- The unique key #4121's seed's ON CONFLICT names.
CREATE UNIQUE INDEX platform_policies_key_scope_uq ON public.platform_policies
  (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));
ALTER TABLE public.platform_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_policies_select ON public.platform_policies
  FOR SELECT USING (auth.uid() IS NOT NULL);
-- Main's permissive write policies are created by write-policies.sql, after
-- run.sh has loaded is_super_admin() from supabase/setup/02_functions.sql.

-- hr_policy_audit_log with the columns #4111's restrictive policy reads, and
-- RLS on, as in production. is_admin() is a stand-in (nobody seeded here is an
-- admin); #4111's policies call it, fn_hr_salary_rule_lock_present() does not.
CREATE TABLE public.hr_policy_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), policy_id uuid,
  policy_key text, scope_type text, scope_id uuid, action text,
  old_value jsonb, new_value jsonb, reason text, edited_by uuid);
ALTER TABLE public.hr_policy_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY hr_policy_audit_log_select ON public.hr_policy_audit_log
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

-- The roster view the salary screen reads (production: staff JOIN
-- employment_categories JOIN hr_organizations WHERE both included_in_hr). The
-- stand-in keeps the columns the function reads and an `in_hr` flag for the gate.
CREATE TABLE public.departments (
  id uuid PRIMARY KEY, institution_id uuid REFERENCES public.institutions(id),
  department_name varchar(255) NOT NULL, is_active boolean DEFAULT true);
CREATE TABLE public.staff (
  id uuid PRIMARY KEY, institution_id uuid REFERENCES public.institutions(id),
  department_id uuid REFERENCES public.departments(id),
  first_name text, designation text, date_of_joining date,
  experience_years integer NOT NULL DEFAULT 0, has_extended_profile boolean NOT NULL DEFAULT false,
  qualifications jsonb NOT NULL DEFAULT '[]', research_papers integer NOT NULL DEFAULT 0,
  in_hr boolean NOT NULL DEFAULT true);
CREATE VIEW public.v_hr_staff AS SELECT * FROM public.staff WHERE in_hr;
CREATE TABLE public.hr_staff_salaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), staff_id uuid REFERENCES public.staff(id),
  monthly_gross numeric(12,2), superseded_by uuid);
GRANT SELECT ON public.platform_policies, public.institutions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.platform_policies TO authenticated, anon, service_role;
GRANT SELECT ON public.platform_policies TO anon, service_role;

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
  ('00000000-0000-0000-0000-00000000aa05', 'Own-scope holder + grant C','x', false, '00000000-0000-0000-0000-0000000000a1'),
  -- The Director: a super admin AND on the Director list (#4121 seeds the list by this email).
  ('00000000-0000-0000-0000-00000000aa06', 'The Director',              'director', true, '00000000-0000-0000-0000-0000000000a1'),
  -- Signed in, no staff row, and NO profile role at all.
  ('00000000-0000-0000-0000-00000000aa07', 'No role',                   NULL, false, NULL);
UPDATE public.profiles SET email = 'director@jkkn.ac.in' WHERE id = '00000000-0000-0000-0000-00000000aa06';

-- #4121 seeds the Director list from auth.users (a confirmed account with that
-- email and a profile), not from profiles.email.
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, deleted_at timestamptz);
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('00000000-0000-0000-0000-00000000aa06', 'director@jkkn.ac.in', now());

INSERT INTO public.user_roles (user_id, role_id)
SELECT u, (SELECT id FROM public.custom_roles WHERE role_key = k) FROM (VALUES
  ('00000000-0000-0000-0000-00000000aa01'::uuid, 'own_scope_payroll'),
  ('00000000-0000-0000-0000-00000000aa02'::uuid, 'all_scope_payroll'),
  ('00000000-0000-0000-0000-00000000aa03'::uuid, 'own_scope_no_key'),
  ('00000000-0000-0000-0000-00000000aa05'::uuid, 'own_scope_payroll')) v(u, k);

INSERT INTO public.user_institution_access (user_id, institution_id) VALUES
  ('00000000-0000-0000-0000-00000000aa05', '00000000-0000-0000-0000-0000000000c3');

-- One department per college. The rule below sets an amount for A's and C's,
-- and leaves B's empty.
INSERT INTO public.departments (id, institution_id, department_name) VALUES
  ('00000000-0000-0000-0000-0000000d00a1', '00000000-0000-0000-0000-0000000000a1', 'Dept A'),
  ('00000000-0000-0000-0000-0000000d00b2', '00000000-0000-0000-0000-0000000000b2', 'Dept B'),
  ('00000000-0000-0000-0000-0000000d00c3', '00000000-0000-0000-0000-0000000000c3', 'Dept C');

-- One person per college, one with NO department at college A, and one
-- outside the HR roster at college A.
INSERT INTO public.staff (id, institution_id, department_id, first_name, designation, date_of_joining,
                          experience_years, has_extended_profile, qualifications, research_papers, in_hr) VALUES
  ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000d00a1', 'Person A', 'Typist', '2018-06-01',
   10, true, '[{"degree":"Ph.D","institution":"X","year":"2015"}]', 3, true),
  ('00000000-0000-0000-0000-0000000005b2', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000d00b2', 'Person B', 'Typist', '2020-01-01',
   0, false, '[]', 0, true),
  ('00000000-0000-0000-0000-0000000005c3', '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000d00c3', 'Person C', 'Typist', '2021-01-01',
   0, false, '[]', 0, true),
  ('00000000-0000-0000-0000-0000000005e5', '00000000-0000-0000-0000-0000000000a1', NULL, 'No dept', 'Typist', '2021-01-01',
   0, false, '[]', 0, true),
  ('00000000-0000-0000-0000-0000000005d4', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000d00a1', 'Not in HR', 'Typist', '2021-01-01',
   0, false, '[]', 0, false);

-- Person A: an old salary superseded by the one in force. Only 6000 may come back.
INSERT INTO public.hr_staff_salaries (id, staff_id, monthly_gross, superseded_by) VALUES
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000005a1', 6000, NULL),
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000005a1', 5000, '00000000-0000-0000-0000-00000000f002');

INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, draft_value, publication_state) VALUES
  ('hr.pay_scales', 'institution', '00000000-0000-0000-0000-0000000000a1', '{"pay_matrix":[{"designation":"Typist","basic_pay":6500}]}', NULL, 'published'),
  ('hr.pay_scales', 'institution', '00000000-0000-0000-0000-0000000000b2', '{"pay_matrix":[{"designation":"Typist","basic_pay":7000}]}', NULL, 'published'),
  -- The one group-wide rule: Dept A 100, Dept C 50, Dept B EMPTY; round to 500.
  -- A pending draft (A 777, B 999) that must NOT be used.
  ('hr.salary_suggestion_rule', 'global', NULL,
   '{"per_year_by_department":{"00000000-0000-0000-0000-0000000d00a1":100,"00000000-0000-0000-0000-0000000d00c3":50},"round_to":500}',
   '{"per_year_by_department":{"00000000-0000-0000-0000-0000000d00a1":777,"00000000-0000-0000-0000-0000000d00b2":999}}',
   'draft_pending'),
  -- An old college-scoped row of the earlier design: must be ignored entirely.
  ('hr.salary_suggestion_rule', 'institution', '00000000-0000-0000-0000-0000000000b2',
   '{"per_year_by_department":{"00000000-0000-0000-0000-0000000d00b2":888}}', NULL, 'published');

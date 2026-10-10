-- Minimum stand-in for the production objects hr_candidate_salary_suggestion_inputs()
-- touches. Throwaway local DB only. The four permission helpers are loaded
-- separately, VERBATIM from supabase/setup/02_functions.sql, and the two rule
-- helpers VERBATIM from 20270512080000, by run.sh.
-- is_admin() is a stand-in: it is not defined anywhere in the repo's SQL.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;

-- Supabase's default: every new function in public is directly EXECUTE-able by anon.
-- Present here so the migration's REVOKE ... FROM anon is actually exercised.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
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
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

-- No unique index here ON PURPOSE: production has uq_platform_policies_key_scope
-- (one row per key and scope), and run.sh adds a second row anyway to prove
-- the function still returns one row per candidate without it.
CREATE TABLE public.platform_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key text NOT NULL, scope_type text NOT NULL, scope_id uuid,
  value jsonb NOT NULL, draft_value jsonb,
  publication_state text NOT NULL DEFAULT 'published',
  is_active boolean DEFAULT true, updated_at timestamptz DEFAULT now());

CREATE TABLE public.departments (
  id uuid PRIMARY KEY, institution_id uuid NOT NULL REFERENCES public.institutions(id),
  department_name varchar(255) NOT NULL, is_active boolean DEFAULT true);
CREATE TABLE public.hr_designations (
  id uuid PRIMARY KEY, hr_organization_id uuid NOT NULL, name text NOT NULL, is_active boolean NOT NULL DEFAULT true);
-- The candidate table, with the columns the function reads BEFORE this migration
-- adds its four. RLS on, with main's SELECT policy (03_policies.sql), so the
-- probe can compare the function with what the table itself admits.
CREATE TABLE public.hr_recruitment_candidates (
  id uuid PRIMARY KEY, hr_organization_id uuid NOT NULL, institution_id uuid REFERENCES public.institutions(id),
  name text NOT NULL, role_title text NOT NULL, submitted_by uuid NOT NULL);
ALTER TABLE public.hr_recruitment_candidates ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.hr_recruitment_candidates TO authenticated;

-- Seed. Colleges A and B.
INSERT INTO public.institutions VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'College A'),
  ('00000000-0000-0000-0000-0000000000b2', 'College B');

INSERT INTO public.custom_roles (role_key, permissions, institution_scope) VALUES
  ('hr_head_like',   '{"hr.payroll.salary.view": true, "hr.recruitment.view": true}', 'own'),
  ('recruiter_like', '{"hr.recruitment.view": true, "hr.recruitment.edit": true}',    'own'),
  ('salary_only',    '{"hr.payroll.salary.view": true}',                              'own');

INSERT INTO public.profiles (id, full_name, role, is_super_admin, institution_id) VALUES
  ('00000000-0000-0000-0000-00000000aa06', 'The Director',     'director', true,  '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000aa04', 'Super admin',      'x',        true,  '00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-00000000aa01', 'HR head (A)',      'x',        false, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000aa02', 'Recruiter (A)',    'x',        false, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000aa03', 'Salary only (A)',  'x',        false, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000aa07', 'No role',          NULL,       false, NULL);

INSERT INTO public.user_roles (user_id, role_id)
SELECT u, (SELECT id FROM public.custom_roles WHERE role_key = k) FROM (VALUES
  ('00000000-0000-0000-0000-00000000aa01'::uuid, 'hr_head_like'),
  ('00000000-0000-0000-0000-00000000aa02'::uuid, 'recruiter_like'),
  ('00000000-0000-0000-0000-00000000aa03'::uuid, 'salary_only')) v(u, k);

INSERT INTO public.departments (id, institution_id, department_name) VALUES
  ('00000000-0000-0000-0000-0000000d00a1', '00000000-0000-0000-0000-0000000000a1', 'Dept A'),
  ('00000000-0000-0000-0000-0000000d00b2', '00000000-0000-0000-0000-0000000000b2', 'Dept B');
INSERT INTO public.hr_designations (id, hr_organization_id, name) VALUES
  ('00000000-0000-0000-0000-00000000de01', '00000000-0000-0000-0000-00000000f0a1', 'Typist'),
  -- A job title of ANOTHER HR organisation: a candidate pointing at it is stale.
  ('00000000-0000-0000-0000-00000000de02', '00000000-0000-0000-0000-00000000f0b2', 'Clerk');

-- Candidate A at college A (submitted by the recruiter), candidate B at college
-- B, and candidate S at college B submitted by the salary-only holder.
INSERT INTO public.hr_recruitment_candidates (id, hr_organization_id, institution_id, name, role_title, submitted_by) VALUES
  ('00000000-0000-0000-0000-0000000ca0a1', '00000000-0000-0000-0000-00000000f0a1', '00000000-0000-0000-0000-0000000000a1', 'Candidate A', 'Typist', '00000000-0000-0000-0000-00000000aa02'),
  ('00000000-0000-0000-0000-0000000ca0b2', '00000000-0000-0000-0000-00000000f0a1', '00000000-0000-0000-0000-0000000000b2', 'Candidate B', 'Typist', '00000000-0000-0000-0000-00000000aa06'),
  ('00000000-0000-0000-0000-0000000ca0c3', '00000000-0000-0000-0000-00000000f0a1', '00000000-0000-0000-0000-0000000000b2', 'Candidate S', 'Typist', '00000000-0000-0000-0000-00000000aa03');

INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, draft_value, publication_state) VALUES
  ('hr.pay_scales', 'institution', '00000000-0000-0000-0000-0000000000a1', '{"pay_matrix":[{"designation":"Typist","basic_pay":6500}]}', NULL, 'published'),
  -- The one group-wide rule: Dept A 100, Dept B EMPTY; round to 500. A pending
  -- draft (A 777, B 999) that must NOT be used.
  ('hr.salary_suggestion_rule', 'global', NULL,
   '{"per_year_by_department":{"00000000-0000-0000-0000-0000000d00a1":100},"round_to":500}',
   '{"per_year_by_department":{"00000000-0000-0000-0000-0000000d00a1":777,"00000000-0000-0000-0000-0000000d00b2":999}}',
   'draft_pending');

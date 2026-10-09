-- Minimum stand-in for the production objects 20271009140000 touches. Throwaway
-- local database only. Loaded BEFORE the real files run.sh applies verbatim:
-- is_super_admin() (setup/02_functions.sql, by name; is_admin() is stubbed below),
-- fn_is_the_director() (20270520090000) and main's column guard
-- (20270501090100), both from the tree.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''),
                  (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text
$$;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, deleted_at timestamptz);
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TABLE public.institutions (id uuid PRIMARY KEY, name text);
CREATE TABLE public.departments (id uuid PRIMARY KEY, institution_id uuid, department_name text, head_of_department_id uuid);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, full_name text, role text, is_super_admin boolean DEFAULT false, institution_id uuid);
CREATE TABLE public.custom_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), role_key text UNIQUE, permissions jsonb DEFAULT '{}', institution_scope varchar(10) DEFAULT 'own', is_active boolean DEFAULT true, updated_at timestamptz DEFAULT now());
CREATE TABLE public.user_roles (user_id uuid, role_id uuid);
CREATE TABLE public.user_institution_access (user_id uuid, institution_id uuid, is_active boolean DEFAULT true);
CREATE TABLE public.staff (id uuid PRIMARY KEY, profile_id uuid, institution_id uuid, department_id uuid, is_active boolean DEFAULT true);
CREATE TABLE public.hr_performance_review_cycles (id uuid PRIMARY KEY, status text, institution_id uuid);
-- The columns 20260617 gives the reviews table (production shape).
CREATE TABLE public.hr_performance_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.hr_performance_review_cycles(id),
  staff_id uuid NOT NULL REFERENCES public.staff(id),
  self_appraisal_jsonb jsonb, supervisor_review_jsonb jsonb, sedc_review_jsonb jsonb,
  final_score numeric(5,2), final_remarks text, status text NOT NULL DEFAULT 'draft',
  self_submitted_at timestamptz, supervisor_reviewed_at timestamptz, sedc_reviewed_at timestamptz,
  final_approved_at timestamptz, final_approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
-- platform_policies as #4121 needs it (the Director list).
CREATE TABLE public.platform_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key text NOT NULL, scope_type text NOT NULL, scope_id uuid,
  value jsonb NOT NULL, draft_value jsonb, publication_state text NOT NULL DEFAULT 'published',
  is_active boolean DEFAULT true, description text, data_type text, is_system boolean DEFAULT false,
  updated_by uuid, updated_at timestamptz DEFAULT now());
CREATE UNIQUE INDEX platform_policies_key_scope_uq ON public.platform_policies
  (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));
-- The guard reads the college's appraisal policy through this; an empty policy
-- keeps every safeguard at its default (ON).
CREATE OR REPLACE FUNCTION public.fn_get_policy_json(p_key text, p_default jsonb DEFAULT NULL, p_scope_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
CREATE OR REPLACE FUNCTION public.user_has_permission(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
-- The guard calls the no-argument is_admin() (main's setup/02 defines it beside
-- the uuid form run.sh loads): true for the admin roles or a super admin.
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
                  AND (p.is_super_admin IS TRUE OR p.role IN ('admin', 'super_admin', 'administrator')))
$$;

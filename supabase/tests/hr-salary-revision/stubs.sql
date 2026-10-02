-- Minimum stand-in for the production objects the salary revision migration
-- touches. Throwaway local database only. Loaded BEFORE the real files that
-- run.sh applies verbatim: the permission helpers (setup/02_functions.sql),
-- fn_my_staff_ids / fn_my_staff_institution_ids, hr_staff_salaries and its
-- deferrable FK, fn_hr_set_staff_salary (main's newest, 20260902100000), and
-- #4119's migration (hr_salary_rule_has_amount).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

-- Supabase's defaults: every new function and table in public is directly
-- usable by anon and authenticated. Present so the migration's REVOKEs are
-- actually exercised.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TABLE public.institutions (id uuid PRIMARY KEY, name text);
CREATE TABLE public.departments (
  id uuid PRIMARY KEY, institution_id uuid REFERENCES public.institutions(id), department_name text);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, full_name text, role text,
  is_super_admin boolean DEFAULT false, institution_id uuid REFERENCES public.institutions(id));
CREATE TABLE public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), role_key text UNIQUE,
  permissions jsonb DEFAULT '{}', institution_scope varchar(10) DEFAULT 'own',
  is_active boolean DEFAULT true, updated_at timestamptz DEFAULT now());
CREATE TABLE public.user_roles (user_id uuid, role_id uuid REFERENCES public.custom_roles(id));
CREATE TABLE public.user_institution_access (
  user_id uuid, institution_id uuid, is_active boolean DEFAULT true);

CREATE TABLE public.employment_categories (id uuid PRIMARY KEY, included_in_hr boolean NOT NULL);
CREATE TABLE public.staff (
  id uuid PRIMARY KEY, profile_id uuid, institution_id uuid NOT NULL REFERENCES public.institutions(id),
  department_id uuid REFERENCES public.departments(id), category_id uuid REFERENCES public.employment_categories(id),
  first_name text, last_name text, staff_id text, designation text, is_active boolean DEFAULT true,
  date_of_joining date, experience_years integer NOT NULL DEFAULT 0,
  has_extended_profile boolean NOT NULL DEFAULT false, qualifications jsonb NOT NULL DEFAULT '[]',
  research_papers integer NOT NULL DEFAULT 0);
-- The view exactly as 20260827210000 defines it.
CREATE OR REPLACE VIEW public.v_hr_staff
WITH (security_invoker = true) AS
  SELECT s.*
    FROM public.staff s
    JOIN public.employment_categories ec ON ec.id = s.category_id
   WHERE ec.included_in_hr;

CREATE TABLE public.hr_organizations (id uuid PRIMARY KEY, institution_id uuid, name text);

-- Only the columns hr_salary_revision_start_date() reads.
CREATE TABLE public.hr_salary_register_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_organization_id uuid NOT NULL REFERENCES public.hr_organizations(id),
  institution_id uuid, period_year integer NOT NULL, period_month integer NOT NULL,
  superseded_by uuid);

-- notifications / user_notifications: setup/01_tables.sql columns, plus the
-- kind, idempotency_key and the partial unique index production has.
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, body text NOT NULL,
  url text, icon text, created_by uuid NOT NULL, targeting jsonb NOT NULL,
  priority text DEFAULT 'normal', metadata jsonb DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), category text DEFAULT 'general',
  sent_at timestamptz DEFAULT now(), expires_at timestamptz,
  kind text CHECK (kind IN ('announcement', 'work_item')), idempotency_key text);
CREATE UNIQUE INDEX idx_notifications_idempotency ON public.notifications (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE TABLE public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), notification_id uuid NOT NULL REFERENCES public.notifications(id),
  user_id uuid NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_notifications_notification_id_user_id_key UNIQUE (notification_id, user_id));

-- platform_policies with the columns #4119's functions filter on.
CREATE TABLE public.platform_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key text NOT NULL, scope_type text NOT NULL, scope_id uuid,
  value jsonb NOT NULL, draft_value jsonb,
  publication_state text NOT NULL DEFAULT 'published',
  is_active boolean DEFAULT true, updated_at timestamptz DEFAULT now());

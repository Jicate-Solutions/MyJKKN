-- Throwaway stand-ins for the production objects that
-- 20270521090000_hr_salary_no_backdating.sql and main's real helpers depend on.
--
-- Only what the helpers READ is modelled. The helpers themselves
-- (is_super_admin, is_admin, user_has_permission(text), fn_my_staff_ids), the
-- salary table and its RLS, main's newest fn_hr_set_staff_salary, the
-- platform_policies table and the Director list (#4121, which defines
-- fn_is_the_director) are loaded VERBATIM from the repo by run.sh, not written
-- here.
--
-- Two things here are stand-ins, stated plainly:
--   * public.set_updated_at() is referenced by the salary table's trigger but
--     is not defined anywhere in the repo (it predates the migrations folder).
--     The usual one-liner is used.
--   * public.fn_handover_grants_key() is the last resort inside
--     user_has_permission(text). Its real body needs the handover walls
--     (fn_handover_key_allowed_at_level, fn_handover_key_is_blocked) and their
--     config. The rehearsal has no handovers, so it answers false, which is
--     what the real one answers for a user with no handover rows.

-- Supabase's API roles. The migration REVOKEs from anon and GRANTs to
-- authenticated/service_role by name.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon NOLOGIN;          END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

-- Supabase's default privileges: every new table AND FUNCTION in public is
-- granted to anon, authenticated and service_role. Reproduced so the
-- migration's REVOKE ... FROM anon is tested against the grant it must undo.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- auth.uid(): Supabase's own definition.
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
-- auth.role(): Supabase's own definition. The Director-list guard (#4121) reads it.
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;
-- auth.users: only the columns the Director list's seed reads (#4121 looks the
-- Director up by confirmed login email, not by profiles.email).
CREATE TABLE auth.users (
  id                 uuid PRIMARY KEY,
  email              text,
  email_confirmed_at timestamptz,
  deleted_at         timestamptz
);

-- What the helpers read.
CREATE TABLE public.profiles (
  id                uuid PRIMARY KEY,
  email             text,
  is_super_admin    boolean NOT NULL DEFAULT false,
  is_active         boolean NOT NULL DEFAULT true,
  is_login_disabled boolean NOT NULL DEFAULT false,
  role              text,
  institution_id    uuid
);
CREATE TABLE public.custom_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key    varchar(50) UNIQUE NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}',
  is_active   boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role_id uuid NOT NULL REFERENCES public.custom_roles(id)
);
CREATE TABLE public.hr_organizations (id uuid PRIMARY KEY);
CREATE TABLE public.staff (
  id         uuid PRIMARY KEY,
  profile_id uuid,
  is_active  boolean NOT NULL DEFAULT true
);

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.fn_handover_grants_key(p_user_id uuid, p_key text)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

-- The HR head role must exist BEFORE the salary-table migration runs: that
-- migration's own UPDATE grants hr.payroll.salary.manage to hr_admin/hr_head/
-- hr_manager, and the rehearsal relies on that real grant, not one written here.
INSERT INTO public.custom_roles (id, role_key, permissions)
VALUES ('00000000-0000-0000-0000-0000000000a1', 'hr_head', '{}'::jsonb);

-- Throwaway PG16 stand-in for the pieces of Supabase the migration touches.
-- Only the platform roles, the auth.uid()/auth.role() helpers (copied from
-- Supabase's own auth schema), a minimal auth.users, and minimal profiles /
-- custom_roles / user_roles / internship overrides tables are written here.
-- platform_policies, its policies, the policy readers, hr_policy_audit_log and
-- is_super_admin()/is_admin() are loaded VERBATIM from the repo by run.sh.
--
-- Run as the cluster superuser. Everything the migration touches is then
-- created and owned by supa_owner: NOT a superuser and NO BYPASSRLS, so the
-- "owner skips RLS" paths are rehearsed the way a normal owner meets them,
-- not as a superuser that skips every check.

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE supa_owner LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

GRANT USAGE, CREATE ON SCHEMA public TO supa_owner;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, supa_owner;

-- Supabase's definitions (auth schema, current GoTrue release).
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

-- The GoTrue columns the seed reads (auth.users has many more).
CREATE TABLE auth.users (
  id                 uuid PRIMARY KEY,
  email              text,
  email_confirmed_at timestamptz,
  deleted_at         timestamptz
);
GRANT SELECT ON auth.users TO supa_owner;

-- Supabase's default privileges for objects the migration role creates: every
-- new table AND function in public is granted to anon/authenticated/
-- service_role. This is what makes an explicit REVOKE ... FROM anon necessary.
ALTER DEFAULT PRIVILEGES FOR ROLE supa_owner IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supa_owner IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- Auth accounts. d...01 is the Director: the auth email has stray spaces and
-- capitals (the seed trims and lower-cases). d...09 has EDITED their own
-- profiles.email to director@jkkn.ac.in; their auth email is their own.
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('d0000000-0000-4000-8000-000000000001', ' Director@JKKN.ac.in ',       now()),
  ('d0000000-0000-4000-8000-000000000002', 'dev.one@jkkn.ac.in',         now()),
  ('d0000000-0000-4000-8000-000000000003', 'test.superadmin@jkkn.ac.in', now()),
  ('d0000000-0000-4000-8000-000000000004', 'principal@jkkn.ac.in',       now()),
  ('d0000000-0000-4000-8000-000000000005', 'hod@jkkn.ac.in',             now()),
  ('d0000000-0000-4000-8000-000000000006', 'jointmd@jkkn.ac.in',         now()),
  ('d0000000-0000-4000-8000-000000000007', 'noprofile@jkkn.ac.in',       now()),
  ('d0000000-0000-4000-8000-000000000008', 'blank@jkkn.ac.in',           now()),
  ('d0000000-0000-4000-8000-000000000009', 'spoof@jkkn.ac.in',           now());

SET ROLE supa_owner;

CREATE TABLE public.profiles (
  id             uuid PRIMARY KEY,
  email          text,
  role           text,
  is_super_admin boolean DEFAULT false,
  is_active      boolean DEFAULT true,
  institution_id uuid,
  created_at     timestamptz DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- Production's profiles rules are narrower; a person reads their own row.
CREATE POLICY profiles_read_own ON public.profiles FOR SELECT USING (id = auth.uid());

-- Referenced by fn_get_policy's role-scope branch (LANGUAGE sql bodies are
-- checked when created) and by fn_internship_evaluate_policy's %ROWTYPE.
CREATE TABLE public.custom_roles (id uuid PRIMARY KEY);
CREATE TABLE public.user_roles (user_id uuid, role_id uuid);
CREATE TABLE public.internship_college_notification_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key text, college_id uuid, institution_id uuid,
  override_value jsonb, is_active boolean DEFAULT true
);

-- People (ids are fixed only inside this throwaway database).
INSERT INTO public.profiles (id, email, role, is_super_admin) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'Director@jkkn.ac.in',       'super_admin', true),  -- the Director
  ('d0000000-0000-4000-8000-000000000002', 'dev.one@jkkn.ac.in',        'super_admin', true),  -- a developer super admin
  ('d0000000-0000-4000-8000-000000000003', 'test.superadmin@jkkn.ac.in','super_admin', true),  -- the shared test account
  ('d0000000-0000-4000-8000-000000000004', 'principal@jkkn.ac.in',      'principal',   false),
  ('d0000000-0000-4000-8000-000000000005', 'hod@jkkn.ac.in',            'hod',         false),
  ('d0000000-0000-4000-8000-000000000006', 'jointmd@jkkn.ac.in',        'admin',       false),
  ('d0000000-0000-4000-8000-000000000008', 'blank@jkkn.ac.in',          NULL,          false), -- signed in, no role
  ('d0000000-0000-4000-8000-000000000009', 'director@jkkn.ac.in',       'hod',         false); -- edited own profile email
-- d...0007 is a signed-in auth user with NO profile row at all.

RESET ROLE;

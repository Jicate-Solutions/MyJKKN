-- Throwaway PG16 stand-in for the pieces of Supabase the migration touches.
-- Only the platform roles, the auth.uid()/auth.role() helpers (copied from
-- Supabase's own auth schema) and a minimal profiles table are written here.
-- platform_policies, its policies and is_super_admin()/is_admin() are loaded
-- VERBATIM from the repo by run.sh, not re-typed.

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

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

-- Supabase's default privileges: every new table AND function in public is
-- granted to anon/authenticated/service_role. This is what makes an explicit
-- REVOKE ... FROM anon necessary, so the rehearsal must have it too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id             uuid PRIMARY KEY,
  email          text,
  role           text,
  is_super_admin boolean DEFAULT false,
  is_active      boolean DEFAULT true
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_read ON public.profiles FOR SELECT USING (true);

-- People (ids are fixed only inside this throwaway database).
INSERT INTO public.profiles (id, email, role, is_super_admin) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'Director@jkkn.ac.in',       'super_admin', true),  -- the Director
  ('d0000000-0000-4000-8000-000000000002', 'dev.one@jkkn.ac.in',        'super_admin', true),  -- a developer super admin
  ('d0000000-0000-4000-8000-000000000003', 'test.superadmin@jkkn.ac.in','super_admin', true),  -- the shared test account
  ('d0000000-0000-4000-8000-000000000004', 'principal@jkkn.ac.in',      'principal',   false),
  ('d0000000-0000-4000-8000-000000000005', 'hod@jkkn.ac.in',            'hod',         false),
  ('d0000000-0000-4000-8000-000000000006', 'jointmd@jkkn.ac.in',        'admin',       false),
  ('d0000000-0000-4000-8000-000000000008', 'blank@jkkn.ac.in',          NULL,          false); -- signed in, no role
-- d...0007 is a signed-in auth user with NO profile row at all.

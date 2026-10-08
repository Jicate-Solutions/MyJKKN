-- Minimal stand-ins for the production objects ig_learner_post_claims depends on,
-- so both migrations can be applied and exercised on a throwaway cluster. Every
-- helper reads a GUC, which lets one session impersonate several callers.
CREATE SCHEMA IF NOT EXISTS auth;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_user')      THEN CREATE ROLE app_user LOGIN; END IF;
END $$;
-- app_user is an ordinary signed-in caller: a member of authenticated, NOT the
-- table owner. Owners and superusers bypass RLS, so asserting as postgres proves nothing.
GRANT authenticated TO app_user;
-- As in Supabase: the service role bypasses RLS and is granted every new table.
ALTER ROLE service_role BYPASSRLS;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
-- nullif() before the cast: an unset GUC reads '' and ''::boolean throws first.
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT coalesce(nullif(current_setting('test.super', true), '')::boolean, false) $$;
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT coalesce(nullif(current_setting('test.admin', true), '')::boolean, false) $$;
CREATE OR REPLACE FUNCTION public.user_has_permission(permission_name text) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT permission_name = ANY (coalesce(string_to_array(nullif(current_setting('test.perms', true), ''), ','), '{}')) $$;
CREATE OR REPLACE FUNCTION public.role_has_institution_access(check_institution_id uuid) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT check_institution_id = ANY (coalesce(string_to_array(nullif(current_setting('test.insts', true), ''), ',')::uuid[], '{}')) $$;

CREATE TABLE public.institutions      (id uuid PRIMARY KEY);
CREATE TABLE public.learners_profiles (id uuid PRIMARY KEY, institution_id uuid);
CREATE TABLE public.profiles          (id uuid PRIMARY KEY, learner_id uuid);
CREATE TABLE public.ig_posts          (id uuid PRIMARY KEY);
CREATE TABLE public.ig_post_metrics   (id bigserial PRIMARY KEY, post_id uuid, snapshot_at timestamptz,
                                       saves int, shares int, comments int, likes int, reach int);
CREATE INDEX idx_ig_post_metrics_post_time ON public.ig_post_metrics (post_id, snapshot_at DESC);

GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
GRANT SELECT ON public.profiles, public.learners_profiles TO authenticated;
-- As in production: the service role reads the Instagram tables (the view is security_invoker).
GRANT SELECT ON public.ig_posts, public.ig_post_metrics TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public, auth TO authenticated;

-- Institution I1 holds learners L1, L2; institution I2 exists to prove scoping.
INSERT INTO public.institutions VALUES ('11111111-0000-0000-0000-000000000001'), ('22222222-0000-0000-0000-000000000002');
INSERT INTO public.learners_profiles VALUES
  ('a1000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001');
-- Profiles: PL1 is learner L1's login; S1 and S2 are staff (no learner).
INSERT INTO public.profiles VALUES
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000001', NULL),
  ('c2000000-0000-0000-0000-000000000002', NULL);
INSERT INTO public.ig_posts VALUES ('d1000000-0000-0000-0000-000000000001'), ('d2000000-0000-0000-0000-000000000002');

-- supabase/tests/wa-bridge/stub-schema.sql
--
-- Minimum schema needed to load 20261211090000_wa_bridge_outbox.sql into a
-- throwaway PostgreSQL database and drive it as a low-privilege user.
--
-- WHY A STUB AND NOT A DUMP. The migration is FILE ONLY — it is applied to
-- production by the operator at merge, never from a worktree. Its RLS rule
-- therefore has to be provable somewhere else, and "I read the policy and it
-- looks right" is how the defect this file exists to catch got shipped in the
-- first place: the column COMMENT said one thing, the policy did the opposite,
-- and both passed review.
--
-- ⚠️ WHAT IS AND IS NOT FAITHFUL HERE.
-- public.role_has_institution_access(uuid) below is a REDUCED stand-in. Its
-- first branch —
--
--     IF check_institution_id IS NULL THEN RETURN true; END IF;
--
-- — is copied VERBATIM from the live definition (as last replaced by
-- supabase/migrations/20261201110000_counselling_code_blank_sibling_guard.sql),
-- because that branch IS the property under test. The rest of the live function
-- (multi-role scope='all', the legacy profiles.role fallback, CAS sibling
-- codes, user_institution_access grants) is replaced by a plain own-institution
-- comparison: every one of those branches can only ever return MORE rows, so a
-- leak this harness reports is real, and a leak it misses would be a leak the
-- live function makes worse rather than better.
--
-- Run with: supabase/tests/wa-bridge/run.sh

-- ---------------------------------------------------------------------------
-- Supabase's three client roles.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The identity the policy reads, carried in a GUC so a test can switch user.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('test.uid', true), '')::uuid;
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Referenced tables — only the columns the foreign keys and the stub functions
-- actually need.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institutions (
  id   uuid PRIMARY KEY,
  name text
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id              uuid PRIMARY KEY,
  institution_id  uuid REFERENCES public.institutions(id),
  is_super_admin  boolean NOT NULL DEFAULT false,
  role            text
);

CREATE TABLE IF NOT EXISTS public.admission_leads (
  id    uuid PRIMARY KEY,
  phone text
);

-- Which permission keys each test identity holds.
CREATE TABLE IF NOT EXISTS public.test_permissions (
  user_id uuid NOT NULL,
  perm    text NOT NULL,
  PRIMARY KEY (user_id, perm)
);

-- ---------------------------------------------------------------------------
-- Permission functions, SECURITY DEFINER exactly as in production.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT p.is_super_admin FROM public.profiles p WHERE p.id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT p.is_super_admin OR p.role IN ('admin', 'super_admin', 'administrator')
      FROM public.profiles p WHERE p.id = auth.uid()
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.user_has_permission(permission_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.test_permissions tp
     WHERE tp.user_id = auth.uid() AND tp.perm = permission_name
  );
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_institution_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.institution_id FROM public.profiles p WHERE p.id = auth.uid();
$$;

-- The function at the centre of the defect.
CREATE OR REPLACE FUNCTION public.role_has_institution_access(check_institution_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- VERBATIM from the live definition. This single branch is why the original
    -- policy leaked: a NULL institution answers `true` for every caller.
    IF check_institution_id IS NULL THEN
        RETURN true;
    END IF;

    IF is_super_admin() THEN
        RETURN true;
    END IF;

    IF check_institution_id = get_current_user_institution_id() THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.is_super_admin(),
  public.is_admin(),
  public.user_has_permission(text),
  public.get_current_user_institution_id(),
  public.role_has_institution_access(uuid),
  auth.uid()
TO anon, authenticated, service_role;

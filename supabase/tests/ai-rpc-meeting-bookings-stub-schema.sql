-- ============================================================================
-- ai-rpc-meeting-bookings-stub-schema.sql                         (2026-09-26)
-- Throwaway stub for rehearsing 20270402110000 on a LOCAL PostgreSQL 16 cluster.
-- NEVER run against production.
--
-- Columns are the ones ai_rpc_meeting_bookings reads, with the live types
-- (information_schema, 2026-09-26). is_admin(uuid), is_super_admin() and the
-- policy mb_host_select are copied verbatim from the live catalog, so the
-- rehearsal can compare the function's answer with what RLS gives the same
-- person on the table itself.
-- ============================================================================

DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $r$;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Supabase's auth.uid(): the JWT subject of the current request.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  is_super_admin boolean,
  institution_id uuid,
  role text NOT NULL
);

CREATE TABLE public.custom_roles (
  id uuid PRIMARY KEY,
  is_active boolean NOT NULL DEFAULT true,
  permissions jsonb DEFAULT '{}'::jsonb,
  institution_scope varchar DEFAULT 'own'
);

CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role_id uuid NOT NULL
);

CREATE TABLE public.jicate_booking_meeting_types (
  id uuid PRIMARY KEY,
  display_name text NOT NULL,
  host_profile_id uuid
);

CREATE TABLE public.meeting_bookings (
  id uuid PRIMARY KEY,
  meeting_type_id uuid,
  host_profile_id uuid NOT NULL,
  institution_id uuid,
  attendee_name text NOT NULL,
  attendee_email text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status text NOT NULL
);

-- Live bodies, verbatim (pg_get_functiondef, 2026-09-26).
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = user_id
        AND (
            is_super_admin = true
            OR role IN ('admin', 'super_admin', 'administrator')
        )
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(
        (SELECT is_super_admin FROM profiles WHERE id = (SELECT auth.uid())),
        false
    );
$function$;

-- The table's only policy, live (pg_policies, 2026-09-26).
ALTER TABLE public.meeting_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY mb_host_select ON public.meeting_bookings
  FOR SELECT TO public
  USING (( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid)));
GRANT SELECT ON public.meeting_bookings TO authenticated;

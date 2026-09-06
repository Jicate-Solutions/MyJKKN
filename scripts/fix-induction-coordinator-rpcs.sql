-- ============================================================================
-- Induction coordinators panel — repair script
--
-- WHY THIS EXISTS: /events/induction failed with
--   "Could not find the function public.fn_induction_<x> ... in the schema cache"
-- which is PostgREST's way of saying the function does not exist in the DB.
-- fn_induction_can_manage_coordinators existed but fn_induction_list_coordinators
-- did not, even though BOTH are defined in the same migration file — i.e.
-- 20260630010000 was only PARTIALLY applied to this database.
--
-- WHAT THIS IS: the verbatim contents of
--   supabase/migrations/20260630010000_induction_coordinators_management.sql
--   supabase/migrations/20260630020000_induction_running_colleges_rpc.sql
-- concatenated. Every statement is CREATE OR REPLACE / REVOKE / GRANT, so it is
-- idempotent — safe to run whole even where some functions already exist.
--
-- HOW TO RUN: paste into the Supabase SQL editor and execute. (supabase db push
-- does not work in this repo — no config.toml, CLI sees 0 local migrations.)
-- ============================================================================

-- ============================================================================
-- Manage induction coordinators from INSIDE the induction module
-- Date: 2026-06-30
--
-- The Induction Lead (or a super-admin) should appoint each college's Induction
-- Coordinator without leaving for the global Role Management page. These RPCs back
-- a "Coordinators" panel on /events/induction. Mirrors how session speakers are
-- assigned within induction (fn_induction_set_session_speakers).
--
-- Authority: ONLY super-admin OR a holder of the induction_lead role may manage
-- coordinators. An induction_coordinator (scope=own) canNOT appoint other
-- coordinators — both hold induction.manage, so we gate on the role_key, not the
-- permission. (Roles created 2026-06-29: induction_lead scope=all, induction_coordinator
-- scope=own — see project_induction_ownership_roles.)
-- ============================================================================

-- Internal: is the caller allowed to manage coordinators?
CREATE OR REPLACE FUNCTION public.fn_induction_can_manage_coordinators()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT is_super_admin() OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND cr.role_key = 'induction_lead' AND cr.is_active = true
  );
$$;

-- List current coordinators (with their college).
CREATE OR REPLACE FUNCTION public.fn_induction_list_coordinators()
 RETURNS TABLE (user_id uuid, full_name text, email text, institution_id uuid, institution_name text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.fn_induction_can_manage_coordinators() THEN
    RAISE EXCEPTION 'fn_induction_list_coordinators: not authorized';
  END IF;
  RETURN QUERY
    -- explicit ::text casts: institutions.name (and profiles text cols) are varchar;
    -- RETURNS TABLE declares text, and SECURITY DEFINER RETURN QUERY is strict (42804).
    SELECT p.id, p.full_name::text, p.email::text, p.institution_id, i.name::text
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id AND cr.role_key = 'induction_coordinator'
    JOIN public.profiles p ON p.id = ur.user_id
    LEFT JOIN public.institutions i ON i.id = p.institution_id
    ORDER BY i.name NULLS LAST, p.full_name;
END $$;

-- Search assignable staff of a college (to pick a coordinator). Excludes students.
CREATE OR REPLACE FUNCTION public.fn_induction_assignable_staff(p_institution_id uuid, p_query text DEFAULT NULL)
 RETURNS TABLE (id uuid, full_name text, email text, role text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.fn_induction_can_manage_coordinators() THEN
    RAISE EXCEPTION 'fn_induction_assignable_staff: not authorized';
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name, p.email, p.role
    FROM public.profiles p
    WHERE p.institution_id = p_institution_id
      AND COALESCE(p.role, '') <> 'student'
      AND p.learner_id IS NULL
      AND (
        p_query IS NULL OR p_query = ''
        OR p.full_name ILIKE '%' || p_query || '%'
        OR p.email ILIKE '%' || p_query || '%'
      )
    ORDER BY p.full_name
    LIMIT 25;
END $$;

-- Appoint a coordinator (grant the induction_coordinator role; their own college
-- = their profile institution, scope=own). Idempotent.
CREATE OR REPLACE FUNCTION public.fn_induction_assign_coordinator(p_user_id uuid)
 RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.fn_induction_can_manage_coordinators() THEN
    RAISE EXCEPTION 'fn_induction_assign_coordinator: not authorized';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'fn_induction_assign_coordinator: user_id required';
  END IF;
  INSERT INTO public.user_roles (user_id, role_id, is_primary, assigned_by)
  SELECT p_user_id, cr.id, false, auth.uid()
  FROM public.custom_roles cr
  WHERE cr.role_key = 'induction_coordinator'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user_id AND ur.role_id = cr.id
    );
END $$;

-- Remove a coordinator (revoke the induction_coordinator role).
CREATE OR REPLACE FUNCTION public.fn_induction_remove_coordinator(p_user_id uuid)
 RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.fn_induction_can_manage_coordinators() THEN
    RAISE EXCEPTION 'fn_induction_remove_coordinator: not authorized';
  END IF;
  DELETE FROM public.user_roles
  WHERE user_id = p_user_id
    AND role_id = (SELECT id FROM public.custom_roles WHERE role_key = 'induction_coordinator');
END $$;

-- Anon-lock all (SECURITY DEFINER — Supabase grants anon EXECUTE by default).
REVOKE EXECUTE ON FUNCTION public.fn_induction_can_manage_coordinators() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_induction_list_coordinators() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_induction_assignable_staff(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_induction_assign_coordinator(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_induction_remove_coordinator(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_induction_can_manage_coordinators() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_induction_list_coordinators() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_induction_assignable_staff(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_induction_assign_coordinator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_induction_remove_coordinator(uuid) TO authenticated;


-- ============================================================================
-- Coordinators panel: list ONLY induction-running colleges (not every institution)
-- Date: 2026-06-30
--
-- The Coordinators panel on /events/induction used to read the institutions table
-- directly (supabase.from('institutions')). Because the only viewers are super-admin
-- or the induction_lead role — both scope='all' — RLS returned EVERY institution,
-- including non-colleges like "JKKN Main Office", "Testing", "Jicate Solutions".
-- A coordinator is only meaningful for a college that is actually running an
-- induction, i.e. one that has a (non-blueprint) induction_programs row.
--
-- This RPC returns exactly that set, gated to the same manage-coordinators authority
-- as the other panel RPCs (20260630010000_induction_coordinators_management.sql) so
-- the institution list no longer bypasses that gate.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_induction_running_colleges()
 RETURNS TABLE (id uuid, name text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.fn_induction_can_manage_coordinators() THEN
    RAISE EXCEPTION 'fn_induction_running_colleges: not authorized';
  END IF;
  RETURN QUERY
    -- ::text cast: institutions.name is varchar but RETURNS TABLE declares text,
    -- and SECURITY DEFINER RETURN QUERY is strict (42804). Matches the sibling RPCs.
    SELECT i.id, i.name::text
    FROM public.institutions i
    WHERE EXISTS (
      SELECT 1 FROM public.induction_programs ip
      WHERE ip.institution_id = i.id          -- excludes the central blueprint (institution_id NULL)
        AND ip.is_blueprint = false           -- and any institution-scoped blueprint
    )
    ORDER BY i.name;
END $$;

-- Anon-lock (SECURITY DEFINER — Supabase grants anon EXECUTE by default).
REVOKE EXECUTE ON FUNCTION public.fn_induction_running_colleges() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_running_colleges() TO authenticated;

-- ============================================================================
-- Reload PostgREST's schema cache.
--
-- The original failure was literally "... in the schema cache": PostgREST
-- introspects pg_proc at connect time, so a function created after it started
-- stays invisible until the cache is refreshed. Supabase normally fires this
-- automatically via an event trigger, but issuing it explicitly costs nothing
-- and removes the "I ran the SQL and it still 404s" round trip.
-- ============================================================================
NOTIFY pgrst, 'reload schema';

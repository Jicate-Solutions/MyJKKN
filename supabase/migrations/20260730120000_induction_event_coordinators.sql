-- ============================================================================
-- Fresher Induction — per-event coordinators (additive to institution-wide roles)
-- File: 20260730120000_induction_event_coordinators.sql | Date: 2026-07-30
-- A coordinator can now be assigned to ONE SPECIFIC induction event, independent
-- of the institution-wide induction_lead/induction_coordinator roles. This is
-- ADDITIVE: fn_induction_is_event_coordinator() is OR'd into every existing
-- privileged RPC's auth check in Tasks 2-4 below — nothing currently working
-- (institution-wide coordinators) loses access. Who can ASSIGN an event
-- coordinator stays identical to the existing college-wide gate (super-admin or
-- induction_lead only) — mirrors fn_induction_can_manage_coordinators exactly.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.induction_event_coordinators (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by   UUID REFERENCES public.profiles(id),
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT induction_event_coordinators_event_user_uniq UNIQUE (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_iec_event ON public.induction_event_coordinators(event_id);
CREATE INDEX IF NOT EXISTS idx_iec_user  ON public.induction_event_coordinators(user_id);

ALTER TABLE public.induction_event_coordinators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS induction_event_coordinators_admin ON public.induction_event_coordinators;
CREATE POLICY induction_event_coordinators_admin ON public.induction_event_coordinators FOR ALL
  USING (is_super_admin() OR is_admin()) WITH CHECK (is_super_admin() OR is_admin());

-- ----------------------------------------------------------------------------
-- 1. the additive grant check — OR'd into every existing privileged RPC below.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_is_event_coordinator(p_event_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.induction_event_coordinators
    WHERE event_id = p_event_id AND user_id = p_user_id
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_is_event_coordinator(UUID, UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_is_event_coordinator(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. can the caller manage event-level coordinators? Identical gate to the
--    existing college-wide fn_induction_can_manage_coordinators (super-admin or
--    induction_lead only — a plain coordinator can't appoint others).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_can_manage_event_coordinators(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.fn_induction_can_manage_coordinators();
$$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_can_manage_event_coordinators(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_can_manage_event_coordinators(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. list coordinators assigned to ONE event.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_list_event_coordinators(p_event_id UUID)
RETURNS TABLE (user_id UUID, full_name TEXT, email TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_induction_can_manage_event_coordinators(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_list_event_coordinators: not authorized';
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name::text, p.email::text
    FROM public.induction_event_coordinators iec
    JOIN public.profiles p ON p.id = iec.user_id
    WHERE iec.event_id = p_event_id
    ORDER BY p.full_name;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_list_event_coordinators(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_list_event_coordinators(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. search assignable staff of THIS event's institution.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_assignable_event_staff(p_event_id UUID, p_query TEXT DEFAULT NULL)
RETURNS TABLE (id UUID, full_name TEXT, email TEXT, role TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  IF NOT public.fn_induction_can_manage_event_coordinators(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_assignable_event_staff: not authorized';
  END IF;
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_assignable_event_staff: not an induction event'; END IF;
  RETURN QUERY
    SELECT p.id, p.full_name, p.email, p.role
    FROM public.profiles p
    WHERE p.institution_id = v_inst
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
REVOKE EXECUTE ON FUNCTION public.fn_induction_assignable_event_staff(UUID, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_assignable_event_staff(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. assign / remove (idempotent upsert + plain delete).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_assign_event_coordinator(p_event_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  IF NOT public.fn_induction_can_manage_event_coordinators(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_assign_event_coordinator: not authorized';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'fn_induction_assign_event_coordinator: user_id required'; END IF;
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_assign_event_coordinator: not an induction event'; END IF;
  -- defense-in-depth: the picker UI (fn_induction_assignable_event_staff) only ever
  -- offers staff of this event's own institution — reject a direct-API call that
  -- tries to appoint someone from a different college as this event's coordinator.
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id AND p.institution_id = v_inst) THEN
    RAISE EXCEPTION 'fn_induction_assign_event_coordinator: that user is not a member of this induction''s college';
  END IF;
  INSERT INTO public.induction_event_coordinators (event_id, user_id, assigned_by)
  VALUES (p_event_id, p_user_id, auth.uid())
  ON CONFLICT (event_id, user_id) DO NOTHING;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_assign_event_coordinator(UUID, UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_assign_event_coordinator(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_remove_event_coordinator(p_event_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_induction_can_manage_event_coordinators(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_remove_event_coordinator: not authorized';
  END IF;
  DELETE FROM public.induction_event_coordinators WHERE event_id = p_event_id AND user_id = p_user_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_remove_event_coordinator(UUID, UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_remove_event_coordinator(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

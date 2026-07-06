-- ============================================================================
-- Fresher Induction — event-level "can manage" gate (server-truth for the UI)
-- File: 20260703121600_induction_can_manage_event_rpc.sql | Date: 2026-07-03
--
-- WHY: the sessions section computed canManage client-side as
--   isSuperAdmin || permissions['induction.manage'] || isEventCoordinator
-- which checks induction.manage WITHOUT the institution-scope test the SERVER
-- enforces. A resource person (e.g. cdc_coordinator / faculty) holding
-- induction.manage at scope='own' but with NO access to THIS event's institution
-- then saw poll / edit / delete / "Add session" / "Mark day attendance" on EVERY
-- row, while the DEFINER RPCs denied them everywhere except their own sessions →
-- "not authorized" → the tools looked broken.
--
-- This RPC mirrors the auth check the privileged induction RPCs already run, at
-- EVENT level, so the UI can render exactly what the server will allow:
--   is_super_admin() OR is_admin()
--   OR (user_has_permission('induction.manage') AND role_has_institution_access(<event institution>))
--   OR fn_induction_is_event_coordinator(p_event_id)
--
-- NOTE — event-level manage EXCLUDES per-session speakers on purpose. A resource
-- person still gets per-row tools (attendance / feedback kiosk / poll) on the
-- sessions they personally speak at, via the existing isMySession / canOperate
-- path in the UI — that stays untouched. This gate is only for the event-wide
-- authoring tools (add/edit/delete session, day attendance, feedback settings).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_induction_can_manage_event(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  -- platform admins manage everything
  IF is_super_admin() OR is_admin() THEN RETURN TRUE; END IF;
  -- a per-event appointed coordinator manages this event (additive grant)
  IF public.fn_induction_is_event_coordinator(p_event_id) THEN RETURN TRUE; END IF;
  -- otherwise require induction.manage WITH access to THIS event's institution.
  -- (A NULL institution = not an induction event → event-level manage is n/a;
  -- return FALSE rather than lean on role_has_institution_access(NULL) semantics.)
  SELECT ip.institution_id INTO v_inst
  FROM public.induction_programs ip
  WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RETURN FALSE; END IF;
  RETURN user_has_permission('induction.manage') AND role_has_institution_access(v_inst);
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_can_manage_event(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_can_manage_event(UUID) TO authenticated;

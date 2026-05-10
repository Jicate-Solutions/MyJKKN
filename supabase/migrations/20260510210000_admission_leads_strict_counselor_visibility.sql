-- ============================================================================
-- Tighten counselor visibility on admission_leads + admission_call_logs to
-- "directly-assigned only" — drop the source-mapping branch from the
-- counselor visibility predicate.
--
-- Why:
--   The 20260509130000 migration added a source-mapping branch:
--     "strict counselor sees leads where assigned_counselor_id = me OR
--      they're mapped to the lead's source via admission_counselor_sources"
--   This made counselor work-queues include unassigned leads from any
--   source they were mapped to. User reported this as confusing —
--   counselors were seeing too many leads, including ones not yet
--   theirs. The new model: counselors see ONLY leads explicitly given
--   to them (counselor_id or assigned_counselor_id). Source-mapping
--   becomes routing-only configuration, not a visibility grant.
--
--   The helper functions _user_can_view_lead_source and
--   _user_can_view_lead_for_call are KEPT (the routing engine
--   fn_auto_assign_counselor_v3 still uses _user_can_view_lead_source
--   for candidate selection during auto-assignment). Only the RLS
--   policies stop referencing them.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Rewrite admission_leads SELECT — drop _user_can_view_lead_source branch.
--    Strict counselors now visible only via assigned_counselor_id (or via
--    counselor_id if we route through admission_counselors lookup, but that
--    path lives in the API helper, not RLS).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS adm_leads_select ON admission_leads;

CREATE POLICY adm_leads_select ON admission_leads
FOR SELECT
USING (
  is_super_admin()
  OR is_admin()
  OR (
    user_has_permission('admission.leads.view'::text)
    AND role_has_institution_access(admission_leads.institution_id)
    AND NOT _user_is_strict_counselor(auth.uid())
  )
  -- Strict counselor: ONLY directly-assigned leads. Source-mapping no
  -- longer grants visibility — it's now routing-config only.
  OR (
    _user_is_strict_counselor(auth.uid())
    AND role_has_institution_access(admission_leads.institution_id)
    AND admission_leads.assigned_counselor_id = auth.uid()
  )
  -- Direct-assignment escape (covers users with no admission.leads.view
  -- whose only access path is being personally assigned to a lead).
  OR (admission_leads.assigned_counselor_id = auth.uid())
  -- Cross-institutional expo-team escape (preserved from prior policy).
  OR (
    admission_leads.expo_event_id IS NOT NULL
    AND admission_leads.expo_event_id IN (SELECT get_my_expo_team_event_ids())
  )
);

-- ----------------------------------------------------------------------------
-- 2. Rewrite admission_leads UPDATE — same tightening.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS adm_leads_update ON admission_leads;

CREATE POLICY adm_leads_update ON admission_leads
FOR UPDATE
USING (
  is_super_admin()
  OR is_admin()
  OR (
    user_has_permission('admission.leads.edit'::text)
    AND role_has_institution_access(admission_leads.institution_id)
    AND NOT _user_is_strict_counselor(auth.uid())
  )
  OR (
    _user_is_strict_counselor(auth.uid())
    AND role_has_institution_access(admission_leads.institution_id)
    AND admission_leads.assigned_counselor_id = auth.uid()
  )
  OR (admission_leads.assigned_counselor_id = auth.uid())
);

-- ----------------------------------------------------------------------------
-- 3. Tighten _user_can_view_lead_for_call (used by admission_call_logs RLS).
--    Strict counselors can view a lead's calls ONLY when directly assigned.
--    Source-mapping no longer grants call-log visibility either — same model
--    as the leads visibility above.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._user_can_view_lead_for_call(p_uid uuid, p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM admission_leads l
    WHERE l.id = p_lead_id
      AND l.assigned_counselor_id = p_uid
  );
$$;

COMMENT ON FUNCTION public._user_can_view_lead_for_call(uuid, uuid) IS
  'SECURITY DEFINER lookup: does this user have direct-assignment visibility on this lead? Source-mapping no longer grants visibility (changed 2026-05-10 — strict counselor visibility model).';

-- ----------------------------------------------------------------------------
-- 4. _user_can_view_lead_source is intentionally NOT modified. The routing
--    engine (fn_auto_assign_counselor_v3, _pick_counselor_for_source) still
--    uses it to identify candidate counselors during auto-assignment. We're
--    just removing it from the RLS visibility branches; the function itself
--    remains a valid building block for routing.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE 'Strict counselor visibility migration applied. Source-mapping no longer grants visibility on admission_leads or admission_call_logs.';
END $$;

COMMIT;

-- ============================================================================
-- Phase 5: Source-scoped RLS on admission_leads + admission_call_logs
-- ============================================================================
-- Goal:
--   Counselor users (admission_counselor, expo_counselor, learner_counselor,
--   staff_counselor) see leads/call_logs ONLY for sources they're mapped to
--   in admission_counselor_sources (active, not paused, within date window),
--   plus their directly-assigned leads.
--
--   Admission office (`admission` role), super_admin, admin, and any role
--   holding admission.leads.view that is NOT a strict counselor keep full
--   institution-scoped visibility.
--
-- Safety properties:
--   - The current 528 junction rows are seed-fan-out (every active counselor
--     mapped to every system source). Flipping this RLS on does NOT reduce
--     today's visibility — it only engages as admins curate the junction
--     via the new Phase 3 UI.
--   - Helpers are SECURITY DEFINER → no transitive RLS recursion through
--     custom_roles / user_roles / admission_leads (per project memory
--     `feedback_rls_transitive_recursion_via_exists.md`).
--   - Outer-table columns inside EXISTS / function args are fully qualified
--     (per project memory `feedback_rls_fully_qualify_outer_table_columns.md`).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Helper: is the user a "strict counselor"?
--    True iff they hold one of the 4 counselor role_keys AND do NOT hold a
--    broader admission/admin role. is_super_admin gets short-circuited
--    higher up in the policy, so we only need the role-key disjunction here.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._user_is_strict_counselor(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = p_uid
        AND cr.role_key IN (
          'admission_counselor',
          'expo_counselor',
          'learner_counselor',
          'staff_counselor'
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = p_uid
        AND cr.role_key IN ('admission', 'administrator')
    );
$$;

COMMENT ON FUNCTION public._user_is_strict_counselor(uuid) IS
  'Returns true if the user holds one of the 4 counselor role_keys AND no broader admission/admin role. Used by RLS to decide whether to apply per-source scoping.';

-- ----------------------------------------------------------------------------
-- 2. Helper: can this user view leads of a given enum source?
--    Walks admission_counselors → admission_counselor_sources → master,
--    enforcing is_active, !is_paused, and current-time within window.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._user_can_view_lead_source(p_uid uuid, p_src lead_source)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM admission_counselors ac
    JOIN admission_counselor_sources cs ON cs.counselor_id = ac.id
    JOIN admission_lead_sources_master m ON m.id = cs.source_id
    WHERE ac.user_id = p_uid
      AND ac.is_active = true
      AND m.enum_value = p_src
      AND m.is_active = true
      AND cs.is_paused = false
      AND (cs.effective_from IS NULL OR cs.effective_from <= now())
      AND (cs.effective_to   IS NULL OR cs.effective_to   >  now())
  );
$$;

COMMENT ON FUNCTION public._user_can_view_lead_source(uuid, lead_source) IS
  'Returns true if the user is currently mapped (active, not paused, in-window) to a master row whose enum_value matches the given source.';

-- ----------------------------------------------------------------------------
-- 3. Helper: can this user view a specific lead (used by call_logs which
--    has no source column of its own).
--    SECURITY DEFINER bypass on admission_leads avoids the transitive RLS
--    recursion classified as a known bug pattern in project memory.
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
      AND (
        l.assigned_counselor_id = p_uid
        OR _user_can_view_lead_source(p_uid, l.source)
      )
  );
$$;

COMMENT ON FUNCTION public._user_can_view_lead_for_call(uuid, uuid) IS
  'SECURITY DEFINER lookup: does this user have visibility on this lead via direct assignment or source mapping? Used by admission_call_logs RLS.';

-- ----------------------------------------------------------------------------
-- 4. Rewrite admission_leads SELECT policy with source-scoping
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS adm_leads_select ON admission_leads;

CREATE POLICY adm_leads_select ON admission_leads
FOR SELECT
USING (
  is_super_admin()
  OR is_admin()
  -- Non-counselor admission.leads.view holders (e.g. admission office) keep
  -- full institution-scoped visibility.
  OR (
    user_has_permission('admission.leads.view'::text)
    AND role_has_institution_access(admission_leads.institution_id)
    AND NOT _user_is_strict_counselor(auth.uid())
  )
  -- Strict counselor: must be directly assigned OR mapped to this source.
  OR (
    _user_is_strict_counselor(auth.uid())
    AND role_has_institution_access(admission_leads.institution_id)
    AND (
      admission_leads.assigned_counselor_id = auth.uid()
      OR _user_can_view_lead_source(auth.uid(), admission_leads.source)
    )
  )
  -- Direct-assignment escape (for users w/o admission.leads.view at all)
  OR (admission_leads.assigned_counselor_id = auth.uid())
  -- Cross-institutional expo-team escape (preserved from old policy)
  OR (
    admission_leads.expo_event_id IS NOT NULL
    AND admission_leads.expo_event_id IN (SELECT get_my_expo_team_event_ids())
  )
);

-- ----------------------------------------------------------------------------
-- 5. Rewrite admission_leads UPDATE policy with same scoping
--    INSERT and DELETE remain unchanged (counselors can't delete; insert
--    is gated by admission.leads.create which counselors don't hold).
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
    AND (
      admission_leads.assigned_counselor_id = auth.uid()
      OR _user_can_view_lead_source(auth.uid(), admission_leads.source)
    )
  )
  OR (admission_leads.assigned_counselor_id = auth.uid())
);

-- ----------------------------------------------------------------------------
-- 6. Rewrite admission_call_logs SELECT and UPDATE policies
--    No source column on call_logs — scope via the parent lead.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS adm_call_logs_select ON admission_call_logs;

CREATE POLICY adm_call_logs_select ON admission_call_logs
FOR SELECT
USING (
  is_super_admin()
  OR is_admin()
  OR (
    user_has_permission('admission.leads.view'::text)
    AND role_has_institution_access(admission_call_logs.institution_id)
    AND NOT _user_is_strict_counselor(auth.uid())
  )
  OR (
    _user_is_strict_counselor(auth.uid())
    AND role_has_institution_access(admission_call_logs.institution_id)
    AND _user_can_view_lead_for_call(auth.uid(), admission_call_logs.lead_id)
  )
);

DROP POLICY IF EXISTS adm_call_logs_update ON admission_call_logs;

CREATE POLICY adm_call_logs_update ON admission_call_logs
FOR UPDATE
USING (
  is_super_admin()
  OR is_admin()
  OR (
    user_has_permission('admission.leads.edit'::text)
    AND role_has_institution_access(admission_call_logs.institution_id)
    AND NOT _user_is_strict_counselor(auth.uid())
  )
  OR (
    _user_is_strict_counselor(auth.uid())
    AND role_has_institution_access(admission_call_logs.institution_id)
    AND _user_can_view_lead_for_call(auth.uid(), admission_call_logs.lead_id)
  )
);

-- ----------------------------------------------------------------------------
-- 7. Sanity: the 4 helpers must be SECURITY DEFINER and visible to authenticated
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public._user_is_strict_counselor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._user_can_view_lead_source(uuid, lead_source) TO authenticated;
GRANT EXECUTE ON FUNCTION public._user_can_view_lead_for_call(uuid, uuid) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Phase 5 RLS migration applied. Source-scoping is now active for the 4 strict-counselor roles.';
END $$;

COMMIT;

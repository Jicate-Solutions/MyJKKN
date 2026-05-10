-- ============================================================================
-- Strict counselors must NEVER see referral-source leads. Referrals go to
-- consultants (separate role/workflow); counselors shouldn't follow up
-- referral-source leads even when somehow directly assigned.
--
-- Apply the source != 'referral' filter to:
--   - the strict-counselor branch of adm_leads_select / adm_leads_update
--   - the unconditional direct-assignment escape branch (so a strict
--     counselor assigned to a referral lead still doesn't see it)
--   - the call_logs visibility helper (consistency)
--
-- Admin / super_admin / admission office (admission.leads.view) keep
-- full visibility on referral leads — they need it for routing referrals
-- to consultants.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. adm_leads_select — exclude referral source for strict counselors and
--    for the direct-assignment escape branch.
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
  -- Strict counselor: directly-assigned non-referral leads only.
  OR (
    _user_is_strict_counselor(auth.uid())
    AND role_has_institution_access(admission_leads.institution_id)
    AND admission_leads.assigned_counselor_id = auth.uid()
    AND admission_leads.source <> 'referral'
  )
  -- Direct-assignment escape: also non-referral.
  OR (
    admission_leads.assigned_counselor_id = auth.uid()
    AND admission_leads.source <> 'referral'
  )
  -- Cross-institutional expo-team escape (referrals never have expo_event_id).
  OR (
    admission_leads.expo_event_id IS NOT NULL
    AND admission_leads.expo_event_id IN (SELECT get_my_expo_team_event_ids())
  )
);

-- ----------------------------------------------------------------------------
-- 2. adm_leads_update — same tightening.
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
    AND admission_leads.source <> 'referral'
  )
  OR (
    admission_leads.assigned_counselor_id = auth.uid()
    AND admission_leads.source <> 'referral'
  )
);

-- ----------------------------------------------------------------------------
-- 3. _user_can_view_lead_for_call — also exclude referral leads. Strict
--    counselors should not see call logs of referral leads.
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
      AND l.source <> 'referral'
  );
$$;

COMMENT ON FUNCTION public._user_can_view_lead_for_call(uuid, uuid) IS
  'SECURITY DEFINER lookup: does this user have direct-assignment visibility on this NON-REFERRAL lead? Source-mapping does not grant visibility, and referral leads are excluded entirely (they belong to consultants, not counselors). Updated 2026-05-10.';

DO $$
BEGIN
  RAISE NOTICE 'Strict counselors no longer see referral-source leads. Admin/super_admin/admission-office keep full referral visibility for routing.';
END $$;

COMMIT;

-- ============================================================================
-- Fix: counselor_id / assigned_counselor_id sync gap
--
-- Root cause (2026-06-01):
--   LeadService.assignCounselor() updated counselor_id (→ admission_counselors.id)
--   but left assigned_counselor_id (→ profiles.id) unchanged when profileId was
--   not explicitly passed. This caused two cascading bugs:
--
--   Bug A — Cross-counselor data leak
--     The strict-counselor API filter (buildLeadVisibilityOr) matches BOTH columns.
--     After reassignment, leads still returned for the OLD counselor via stale
--     assigned_counselor_id while also returned for the NEW counselor via
--     counselor_id. Both counselors see the same lead simultaneously.
--
--   Bug B — Cannot update lead status ("db undefined")
--     The RLS UPDATE policy (adm_leads_update) only permits strict counselors
--     to write rows where assigned_counselor_id = auth.uid(). Leads assigned
--     via counselor_id without assigned_counselor_id being synced fail the
--     RLS check → PGRST116 / "0 rows returned" → UI surfaces as update failure.
--
-- Fix strategy:
--   1. Backfill: set assigned_counselor_id = admission_counselors.user_id for
--      all leads that have counselor_id set but assigned_counselor_id NULL.
--   2. Rewrite adm_leads_select and adm_leads_update to also match via
--      counselor_id → admission_counselors.user_id. This gives strict counselors
--      correct SELECT and UPDATE access for leads assigned via the counselor_id
--      column, regardless of whether assigned_counselor_id is set.
--   3. Application layer (LeadService.assignCounselor + updateLead) is patched
--      in the same commit to keep both columns in sync going forward.
-- ============================================================================

BEGIN;

-- ── 1. Backfill assigned_counselor_id for orphaned counselor_id rows ─────────

UPDATE admission_leads al
SET    assigned_counselor_id = ac.user_id,
       updated_at            = NOW()
FROM   admission_counselors ac
WHERE  al.counselor_id        = ac.id
  AND  al.assigned_counselor_id IS NULL;

-- ── 2. Rewrite adm_leads_select ───────────────────────────────────────────────

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
  -- Strict counselor: directly-assigned via assigned_counselor_id (fast path)
  OR (
    _user_is_strict_counselor(auth.uid())
    AND role_has_institution_access(admission_leads.institution_id)
    AND admission_leads.assigned_counselor_id = auth.uid()
  )
  -- Strict counselor: legacy / partial assignment via counselor_id when
  -- assigned_counselor_id was not yet synced (belt-and-suspenders after backfill)
  OR (
    _user_is_strict_counselor(auth.uid())
    AND role_has_institution_access(admission_leads.institution_id)
    AND admission_leads.counselor_id IN (
      SELECT id FROM admission_counselors WHERE user_id = auth.uid() LIMIT 1
    )
  )
  -- Direct-assignment escape (non-strict users personally assigned to a lead)
  OR (admission_leads.assigned_counselor_id = auth.uid())
  -- Cross-institutional expo-team escape (preserved from prior policy)
  OR (
    admission_leads.expo_event_id IS NOT NULL
    AND admission_leads.expo_event_id IN (SELECT get_my_expo_team_event_ids())
  )
);

-- ── 3. Rewrite adm_leads_update ───────────────────────────────────────────────

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
  -- Strict counselor: directly-assigned via assigned_counselor_id (fast path)
  OR (
    _user_is_strict_counselor(auth.uid())
    AND role_has_institution_access(admission_leads.institution_id)
    AND admission_leads.assigned_counselor_id = auth.uid()
  )
  -- Strict counselor: matched via counselor_id (covers backfill gap + future
  -- writes where only counselor_id was set)
  OR (
    _user_is_strict_counselor(auth.uid())
    AND role_has_institution_access(admission_leads.institution_id)
    AND admission_leads.counselor_id IN (
      SELECT id FROM admission_counselors WHERE user_id = auth.uid() LIMIT 1
    )
  )
  -- Direct-assignment escape
  OR (admission_leads.assigned_counselor_id = auth.uid())
  OR (
    admission_leads.counselor_id IN (
      SELECT id FROM admission_counselors WHERE user_id = auth.uid() LIMIT 1
    )
  )
);

COMMIT;

DO $$
BEGIN
  RAISE NOTICE 'counselor_id/assigned_counselor_id sync fix applied (2026-06-01). Backfilled stale rows and patched adm_leads_select + adm_leads_update.';
END $$;

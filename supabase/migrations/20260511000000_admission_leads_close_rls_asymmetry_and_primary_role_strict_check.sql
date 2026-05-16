-- =====================================================================
-- Close two related RLS gaps on admission_leads that produce
-- "Lead not found" (PGRST116) errors for users who CAN see the lead
-- in the list but FAIL to load it on the detail page.
--
-- Bugs (2026-05-10): BUG-003934, BUG-003933, BUG-003932, BUG-003928
--
-- Two gaps:
--   1. List-vs-detail asymmetry on counselor_id.
--      lib/api-helpers/admission-counselor-scope.ts:111-114 grants list
--      visibility via (counselor_id = my admission_counselors.id) OR
--      (assigned_counselor_id = my user_id). RLS on the detail page only
--      checks the second column. Legacy bulk-assign flows wrote
--      counselor_id only, leaving assigned_counselor_id NULL, so the
--      lead is visible in list (service-role bypass) but PGRST116 on
--      detail (RLS-bound).
--      Fix: a STABLE SECURITY DEFINER helper
--      _user_owns_lead_via_counselor_id() lets RLS cross the
--      admission_counselors RLS boundary cheaply, and the policy now
--      OR-includes both visibility paths.
--
--   2. _user_is_strict_counselor ignores is_primary on user_roles.
--      Users like the COO (primary=hr_admin, secondary=admission_counselor)
--      were classified as strict counselors and locked out of all
--      leads in their institution that weren't directly assigned to
--      them. Fix: counselor key must be the user's PRIMARY role for
--      strict-counselor classification. Override role-keys (admission /
--      administrator) still suppress strict-counselor regardless of
--      primary, preserving existing exclusion behavior.
--
-- Backfill: every lead with counselor_id set but assigned_counselor_id
-- NULL gets assigned_counselor_id = the admission_counselor's user_id.
-- This cleans up history so any code path that reads only
-- assigned_counselor_id stops drifting.
-- =====================================================================

BEGIN;

-- 1. New helper: does THIS user own the admission_counselors row whose
--    id is stored on this lead? Mirrors the API helper exactly.
CREATE OR REPLACE FUNCTION public._user_owns_lead_via_counselor_id(p_uid uuid, p_counselor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_counselor_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM admission_counselors
        WHERE id = p_counselor_id AND user_id = p_uid
     );
$$;

COMMENT ON FUNCTION public._user_owns_lead_via_counselor_id(uuid, uuid) IS
  'Closes RLS gap where lib/api-helpers/admission-counselor-scope.ts grants list visibility via counselor_id but RLS does not. Added 2026-05-11.';

-- 2. Tighten _user_is_strict_counselor: counselor key must be primary.
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
         AND ur.is_primary = TRUE
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
  'TRUE iff the user PRIMARILY identifies as a counselor (counselor key is is_primary=true) AND holds no admission/administrator override. Updated 2026-05-11 to require is_primary so multi-role executives (e.g., hr_admin + secondary admission_counselor) are not demoted to counselor-only visibility.';

-- 3. Rewrite adm_leads_select with both visibility paths.
DROP POLICY IF EXISTS adm_leads_select ON admission_leads;

CREATE POLICY adm_leads_select ON admission_leads
FOR SELECT USING (
  is_super_admin()
  OR is_admin()
  OR (
    user_has_permission('admission.leads.view'::text)
    AND role_has_institution_access(admission_leads.institution_id)
    AND NOT _user_is_strict_counselor(auth.uid())
  )
  -- Strict counselor: directly-assigned (via either column) non-referral leads only.
  OR (
    _user_is_strict_counselor(auth.uid())
    AND role_has_institution_access(admission_leads.institution_id)
    AND admission_leads.source <> 'referral'
    AND (
      admission_leads.assigned_counselor_id = auth.uid()
      OR _user_owns_lead_via_counselor_id(auth.uid(), admission_leads.counselor_id)
    )
  )
  -- Direct-assignment escape (no admission.leads.view required, non-referral).
  OR (
    admission_leads.source <> 'referral'
    AND (
      admission_leads.assigned_counselor_id = auth.uid()
      OR _user_owns_lead_via_counselor_id(auth.uid(), admission_leads.counselor_id)
    )
  )
  -- Cross-institutional expo-team escape (preserved).
  OR (
    admission_leads.expo_event_id IS NOT NULL
    AND admission_leads.expo_event_id IN (SELECT get_my_expo_team_event_ids())
  )
);

-- 4. Same alignment for adm_leads_update.
DROP POLICY IF EXISTS adm_leads_update ON admission_leads;

CREATE POLICY adm_leads_update ON admission_leads
FOR UPDATE USING (
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
    AND admission_leads.source <> 'referral'
    AND (
      admission_leads.assigned_counselor_id = auth.uid()
      OR _user_owns_lead_via_counselor_id(auth.uid(), admission_leads.counselor_id)
    )
  )
  OR (
    admission_leads.source <> 'referral'
    AND (
      admission_leads.assigned_counselor_id = auth.uid()
      OR _user_owns_lead_via_counselor_id(auth.uid(), admission_leads.counselor_id)
    )
  )
);

-- 5. Update _user_can_view_lead_for_call to honor both columns
--    (used by admission_call_logs RLS).
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
       AND l.source <> 'referral'
       AND (
         l.assigned_counselor_id = p_uid
         OR _user_owns_lead_via_counselor_id(p_uid, l.counselor_id)
       )
  );
$$;

COMMENT ON FUNCTION public._user_can_view_lead_for_call(uuid, uuid) IS
  'SECURITY DEFINER lookup: does this user own this NON-REFERRAL lead via assigned_counselor_id OR counselor_id? Updated 2026-05-11 to close RLS asymmetry.';

-- 6. Backfill: assigned_counselor_id := admission_counselors.user_id
--    where the FK chain resolves and assigned_counselor_id is currently
--    NULL. ~3,945 rows expected on first run; idempotent thereafter.
WITH backfill AS (
  SELECT l.id, ac.user_id
    FROM admission_leads l
    JOIN admission_counselors ac ON ac.id = l.counselor_id
   WHERE l.assigned_counselor_id IS NULL
     AND ac.user_id IS NOT NULL
)
UPDATE admission_leads l
   SET assigned_counselor_id = b.user_id
  FROM backfill b
 WHERE l.id = b.id;

DO $$
DECLARE n int;
BEGIN
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Backfilled assigned_counselor_id on % leads from legacy counselor_id', n;
END $$;

COMMIT;

-- =====================================================================
-- 2026-05-11  Admission Leads visibility lockdown
--
-- Two concurrent bugs collapsed lead visibility down to "anyone with
-- admission.leads.view sees everything":
--
--   Bug 1 — Counselor leak (63%).
--     _user_is_strict_counselor requires user_roles.is_primary=TRUE on the
--     counselor row. assign_counselor_role's 2026-05-08 auto-rule
--     (`NOT v_has_primary`) silently inserted is_primary=FALSE whenever the
--     user already held ANY primary role (faculty/student). 69 of 110
--     counselor user_roles rows were left with is_primary IS NOT TRUE so
--     they bypassed the strict branch and inherited the wider
--     admission.leads.view branch — seeing every lead in their institution.
--
--   Bug 2 — Faculty leak.
--     admission.leads.view was granted in custom_roles.permissions JSONB to
--     faculty (338 users), hod (58), principal (7), student, plus several
--     other non-admission keys. The list API and adm_leads_select policy
--     gated visibility purely on the permission, with no role allowlist.
--
-- Fix layers:
--   1. Backfill is_primary=TRUE on the counselor row for every user whose
--      ONLY non-override role family is counselor.
--   2. Rewrite assign_counselor_role auto-rule: counselor key becomes the
--      user's primary UNLESS they hold an admission/administrator override
--      (the same predicate _user_is_strict_counselor uses to suppress).
--      Stops the bug from recurring on new counselor assignments.
--   3. Strip admission.leads.view from custom_roles.permissions on the
--      role_keys that have no business with the admission leads list.
--   4. Add SECURITY DEFINER allowlist helper
--      _user_in_admission_lead_allowlist(uuid) — defense-in-depth so the
--      permission-branch of adm_leads_select / API route also requires the
--      caller to hold one of the canonical lead-view role_keys.
--   5. Rewrite adm_leads_select / adm_leads_update to AND the allowlist on
--      the permission branch. Strict-counselor and direct-assignment
--      branches are unchanged.
-- =====================================================================

BEGIN;

-- ============================================================================
-- 1) Backfill: counselor row → is_primary=TRUE  (atomic per-user)
-- ============================================================================
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (ur.user_id) ur.id AS row_id, ur.user_id
    FROM user_roles ur
    JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE cr.role_key IN (
      'admission_counselor', 'expo_counselor',
      'learner_counselor', 'staff_counselor'
    )
      -- Skip users with admission/admin override (NOT strict by design).
      AND NOT EXISTS (
        SELECT 1 FROM user_roles ur2
        JOIN custom_roles cr2 ON cr2.id = ur2.role_id
        WHERE ur2.user_id = ur.user_id
          -- Override roles: counselor identity does NOT make these users
          -- strict, because their tier-1/tier-2 role entitles them to see
          -- all leads. Mirrors the override set in
          -- _user_is_strict_counselor and assign_counselor_role.
          AND cr2.role_key IN (
            'admission', 'admission_staff', 'administrator', 'super_admin',
            'ceo', 'coo', 'cbo', 'registrar'
          )
      )
      -- Skip users who already have ANY counselor row primary (idempotent).
      AND NOT EXISTS (
        SELECT 1 FROM user_roles ur3
        JOIN custom_roles cr3 ON cr3.id = ur3.role_id
        WHERE ur3.user_id = ur.user_id
          AND ur3.is_primary = TRUE
          AND cr3.role_key IN (
            'admission_counselor', 'expo_counselor',
            'learner_counselor', 'staff_counselor'
          )
      )
    ORDER BY ur.user_id, ur.id   -- deterministic pick when user has multiple counselor rows
  LOOP
    -- Demote whatever is currently primary for this user (satisfies the
    -- partial unique index idx_user_roles_primary_unique before promoting).
    -- NOTE: user_roles has no updated_at column. Don't add one here.
    UPDATE user_roles
       SET is_primary = FALSE
     WHERE user_id = r.user_id AND is_primary = TRUE;

    UPDATE user_roles
       SET is_primary = TRUE
     WHERE id = r.row_id;
  END LOOP;
END $$;

-- ============================================================================
-- 1b) Rewrite _user_is_strict_counselor.
--     Final rule (2026-05-11): strict counselor = has any of the 4 counselor
--     role_keys AND has NO admission/admission_staff/admin/exec override.
--     is_primary is dropped from the check entirely. Override roles
--     (admission, admission_staff, administrator, super_admin, ceo, coo,
--     cbo, registrar) preserve broad visibility for multi-role users.
-- ============================================================================
CREATE OR REPLACE FUNCTION public._user_is_strict_counselor(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = p_uid
        AND cr.role_key IN (
          'admission_counselor','expo_counselor','learner_counselor','staff_counselor'
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = p_uid
        AND cr.role_key IN (
          'admission','admission_staff','administrator','super_admin',
          'ceo','coo','cbo','registrar'
        )
    );
$$;

COMMENT ON FUNCTION public._user_is_strict_counselor(uuid) IS
  'TRUE iff user holds a counselor role AND no admission/admission_staff/admin/exec override. is_primary is NOT consulted. Updated 2026-05-11 per user requirement: admission_staff and tier-1 execs keep broad visibility even with secondary counselor role.';

-- ============================================================================
-- 2) Patch assign_counselor_role: auto-decide is "primary unless override"
--    instead of "primary only if no other primary". Stops new counselor
--    assignments from drifting back into the bug.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.assign_counselor_role(
    p_user_id    uuid,
    p_is_primary boolean DEFAULT NULL,
    p_role_key   text    DEFAULT 'admission_counselor'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role_id        uuid;
    v_caller         uuid := auth.uid();
    v_has_override   boolean;
    v_make_primary   boolean;
    v_allowed_keys   text[] := ARRAY[
      'admission_counselor', 'expo_counselor',
      'learner_counselor',   'staff_counselor'
    ];
BEGIN
    IF NOT (is_super_admin() OR is_admin() OR user_has_permission('admission.counselors.create')) THEN
        RAISE EXCEPTION 'Insufficient permission to assign counsellor role'
            USING ERRCODE = '42501';
    END IF;

    IF NOT (COALESCE(p_role_key, 'admission_counselor') = ANY(v_allowed_keys)) THEN
        RAISE EXCEPTION 'role_key % is not assignable through assign_counselor_role (allowed: %)',
            p_role_key, v_allowed_keys
            USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM admission_counselors WHERE user_id = p_user_id) THEN
        RAISE EXCEPTION 'No admission_counselors row exists for user_id %', p_user_id
            USING ERRCODE = '23503';
    END IF;

    SELECT id INTO v_role_id
      FROM custom_roles
     WHERE role_key = COALESCE(p_role_key, 'admission_counselor');

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'No custom_role found for role_key %', p_role_key
            USING ERRCODE = '23503';
    END IF;

    IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = p_user_id AND role_id = v_role_id) THEN
        RETURN;
    END IF;

    -- Auto-rule (2026-05-11): counselor identity wins UNLESS user holds an
    -- admission/admin override. Previous rule "primary only if no other
    -- primary" left counselor rows with is_primary=FALSE for any user who
    -- had a prior faculty/student primary, which silently demoted them out
    -- of strict-counselor classification and re-leaked every lead in their
    -- institution. _user_is_strict_counselor uses the same override set so
    -- the auto-rule mirrors the visibility predicate exactly.
    SELECT EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = p_user_id
          AND cr.role_key IN (
            'admission', 'admission_staff',
            'administrator', 'super_admin',
            'ceo', 'coo', 'cbo', 'registrar'
          )
    ) INTO v_has_override;

    v_make_primary := CASE
        WHEN p_is_primary IS TRUE  THEN TRUE
        WHEN p_is_primary IS FALSE THEN FALSE
        ELSE NOT v_has_override
    END;

    IF v_make_primary THEN
        UPDATE user_roles
           SET is_primary = FALSE
         WHERE user_id = p_user_id
           AND is_primary = TRUE;
    END IF;

    INSERT INTO user_roles (user_id, role_id, is_primary, assigned_by)
    VALUES (p_user_id, v_role_id, v_make_primary, v_caller);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_counselor_role(uuid, boolean, text) TO authenticated;

-- ============================================================================
-- 3) Strip admission.leads.view from non-allowlist roles.
--    Defense-in-depth: even though the API/RLS will gate on the allowlist
--    helper below, having the permission removed from these roles makes Role
--    Management UI honest and prevents accidental re-grant via UI checkbox.
-- ============================================================================
UPDATE custom_roles
   SET permissions = COALESCE(permissions, '[]'::jsonb) - 'admission.leads.view',
       updated_at  = now()
 WHERE role_key IN (
   'accountant_assistant', 'accounts',
   'coe', 'coe_office',
   'executive_admin_officer',
   'faculty', 'health_counselor',
   'hod', 'principal',
   'student'
 )
   AND permissions::jsonb ? 'admission.leads.view';

-- ============================================================================
-- 4) SECURITY DEFINER allowlist helper.
--    The canonical list of role_keys that can pass the lead-view check.
--    super_admin / is_admin still bypass via earlier RLS branches.
-- ============================================================================
CREATE OR REPLACE FUNCTION public._user_in_admission_lead_allowlist(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM user_roles ur
      JOIN custom_roles cr ON cr.id = ur.role_id
     WHERE ur.user_id = p_uid
       AND cr.role_key IN (
         'admission', 'admission_staff',
         'administrator',
         'ceo', 'coo', 'cbo', 'registrar',
         'admission_counselor', 'expo_counselor',
         'learner_counselor',   'staff_counselor'
       )
  );
$$;

COMMENT ON FUNCTION public._user_in_admission_lead_allowlist(uuid) IS
  'Defense-in-depth allowlist for admission.leads.view. Returns TRUE iff user holds one of: admission, admission_staff, administrator, ceo, coo, cbo, registrar, or any of 4 counselor role_keys. Added 2026-05-11 so granting admission.leads.view to off-list roles (faculty, hod, principal, student, etc.) does not re-leak the leads list.';

GRANT EXECUTE ON FUNCTION public._user_in_admission_lead_allowlist(uuid) TO authenticated;

-- ============================================================================
-- 5) Rewrite adm_leads_select / adm_leads_update to AND the allowlist on the
--    permission branch. Strict-counselor / direct-assignment / expo-team
--    branches unchanged.
-- ============================================================================
DROP POLICY IF EXISTS adm_leads_select ON admission_leads;

CREATE POLICY adm_leads_select ON admission_leads
FOR SELECT USING (
  is_super_admin()
  OR is_admin()
  OR (
    user_has_permission('admission.leads.view'::text)
    AND _user_in_admission_lead_allowlist(auth.uid())
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
  OR (
    admission_leads.expo_event_id IS NOT NULL
    AND admission_leads.expo_event_id IN (SELECT get_my_expo_team_event_ids())
  )
);

DROP POLICY IF EXISTS adm_leads_update ON admission_leads;

CREATE POLICY adm_leads_update ON admission_leads
FOR UPDATE USING (
  is_super_admin()
  OR is_admin()
  OR (
    user_has_permission('admission.leads.edit'::text)
    AND _user_in_admission_lead_allowlist(auth.uid())
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

COMMIT;

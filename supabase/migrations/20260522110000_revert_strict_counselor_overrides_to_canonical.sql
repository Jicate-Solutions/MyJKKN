-- =====================================================================
-- 2026-05-22  Revert _user_is_strict_counselor override list to canonical 8 keys.
--
-- Background:
--   BUG-003938's "senior leadership broader visibility" expansion (applied
--   directly to prod earlier today, never committed as a migration) added 14
--   extra role_keys to the strict-counselor override list:
--     hod, principal, md, dean, director, cao, chief_of_staff,
--     pg_admission, ug_admission, accreditation_officer,
--     hr_admin, admin, institution_admin
--
--   At JKKN, department heads often double as counselors of their own
--   department. The expansion silently demoted every such user out of
--   strict-counselor classification, so RLS started fall-through to the
--   broader `admission.leads.view AND NOT _user_is_strict_counselor()`
--   branch — which (combined with staff_counselor's institution_scope='all')
--   leaked every lead in the database. 12 counselors hit by this:
--     apsarakumar, bhavadharani_selvan, devi.p, harinielango,
--     kamalaveni, kamali, karthika_j, krishnan, madhumithav,
--     meenas, revanth, thenmozhi.v
--   Each saw 18,721 leads instead of their actual ~150 assigned.
--
-- Fix:
--   Restore the canonical 8-key override list — matching exactly
--   lib/api-helpers/admission-counselor-scope.ts:NON_COUNSELOR_OVERRIDE_ROLE_KEYS
--   so SQL/RLS and the service-role TS path stay in lockstep.
--
--   HODs / Principals etc. that genuinely need broader visibility for
--   oversight should hold a tier-1 exec or admission_staff role; that
--   path is unchanged. Users with BOTH a counselor role AND a senior-
--   leadership role are intentionally scoped to assigned-only (per user
--   requirement 2026-05-22).
-- =====================================================================

BEGIN;

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
  'TRUE iff user holds a counselor role AND no admission/admission_staff/admin/exec override. Override list reverted to canonical 8 keys 2026-05-22 to fix HOD-counselor RLS leak (BUG-003938 follow-up). Mirrors lib/api-helpers/admission-counselor-scope.ts:NON_COUNSELOR_OVERRIDE_ROLE_KEYS exactly — keep the two in lockstep.';

COMMIT;

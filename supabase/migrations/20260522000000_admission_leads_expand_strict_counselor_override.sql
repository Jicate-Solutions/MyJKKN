-- =====================================================================
-- 2026-05-22  Admission Leads — expand strict-counselor override list
--
-- Bug (BUG-003938): Krishnan R, HOD at JKKN College of Pharmacy, reports
-- "no leads showing, no leads assigned" on /admission/leads/work.
--
-- Root cause: _user_is_strict_counselor() classifies users with ANY
-- counselor role_key as strict UNLESS they also hold one of the override
-- role_keys. The override list locked on 2026-05-11 only covered
-- admission-office + tier-1 execs:
--   ('admission','admission_staff','administrator','super_admin',
--    'ceo','coo','cbo','registrar')
--
-- HOD / principal / dean / director / md / cao / chief_of_staff / etc. were
-- not included. A HOD with PRIMARY=staff_counselor and secondary=hod is
-- classified strict, sees only directly-assigned non-referral leads, which
-- for Krishnan is empty.
--
-- Receipt (2026-05-22): Krishnan's user_id=a02714fa-bf67-4b86-b3b9-d17afc89c0c2
-- holds PRIMARY=staff_counselor + secondary=hod. SELECT
-- _user_is_strict_counselor('a027...'::uuid) returned TRUE pre-fix.
--
-- Companion to project-memory feedback_strict_counselor_override_list_traps_senior_leadership.
-- Same trap caught Narayan Rao (COO) on 2026-05-10 — ad-hoc fix then was
-- "remove counselor role". This is the architectural fix.
--
-- JS side: lib/api-helpers/admission-counselor-scope.ts —
--   NON_COUNSELOR_OVERRIDE_ROLE_KEYS expanded to the same list. Drift =
--   silent visibility mismatch between RLS and the service-role API
--   helpers, so this migration MUST match the JS array exactly.
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
          -- Original admission-office + tier-1 execs (locked 2026-05-11)
          'admission','admission_staff','administrator','super_admin',
          'ceo','coo','cbo','registrar',
          -- Admin variants
          'admin','institution_admin',
          -- Senior leadership (added 2026-05-22, BUG-003938)
          'hod','md','principal','dean','director','cao','chief_of_staff',
          -- Admission-adjacent broader visibility
          'pg_admission','ug_admission','accreditation_officer',
          -- Cross-functional admins
          'hr_admin'
        )
    );
$$;

COMMENT ON FUNCTION public._user_is_strict_counselor(uuid) IS
  'TRUE iff user holds a counselor role AND no admin/exec/senior-leadership override. is_primary is NOT consulted. Override list expanded 2026-05-22 (BUG-003938) to include hod, principal, dean, director, md, cao, chief_of_staff, admin, institution_admin, pg_admission, ug_admission, accreditation_officer, hr_admin so senior multi-role users with a secondary counselor role keep broad visibility. Mirrors NON_COUNSELOR_OVERRIDE_ROLE_KEYS in lib/api-helpers/admission-counselor-scope.ts — drift = silent visibility mismatch.';

-- Verification (read-only, no row modification):
-- Confirms the function definition now contains the expanded role list.
DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE proname = '_user_is_strict_counselor';
  IF def NOT LIKE '%''hod''%' THEN
    RAISE EXCEPTION '_user_is_strict_counselor body does not contain expected role hod after CREATE OR REPLACE';
  END IF;
  IF def NOT LIKE '%''principal''%' THEN
    RAISE EXCEPTION '_user_is_strict_counselor body does not contain expected role principal after CREATE OR REPLACE';
  END IF;
  IF def NOT LIKE '%''institution_admin''%' THEN
    RAISE EXCEPTION '_user_is_strict_counselor body does not contain expected role institution_admin after CREATE OR REPLACE';
  END IF;
  RAISE NOTICE '_user_is_strict_counselor override list expanded: contains hod, principal, institution_admin and 11 others';
END $$;

COMMIT;

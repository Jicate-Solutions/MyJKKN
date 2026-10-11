-- =====================================================================
-- 20271010141700 — fn_learner_genders: gender for the attendance marking list
-- =====================================================================
-- VERSION NOTE (verified 11 Oct 2026): 2027-prefixed versions are this repo's convention — 185 such files on main; live ledger max is 20271010100000. A 2026 prefix would sort before applied versions.
--
-- PURELY ADDITIVE. Creates ONE new function. Changes no existing function,
-- table, policy or signature. fn_attendance_roster is NOT touched.
--
-- WHY (BUG-006276, JKKN Matric Higher Secondary School)
-- "I need alphabet order name boys and girls in attendance mark register".
-- Tamil Nadu school registers list boys A-Z, then girls A-Z. The marking
-- screen can now offer that order, but it needs each learner's gender, and
-- fn_attendance_roster does not return it. Faculty cannot read
-- learners_profiles directly (its SELECT RLS needs a learners.*view key), so a
-- direct client read would return zero rows with no error.
--
-- Same shape and the same permission gate as fn_learner_academic_years
-- (20260820124500): a caller who may load the roster may read this one column
-- for it, nobody else may. Widening fn_attendance_roster's RETURNS TABLE would
-- force DROP + CREATE of the roster function; this file avoids that.
--
-- Ids are constrained to p_institution_id, so another college's learner ids
-- return nothing.
--
-- SCOPE (intended: institution-level, documented after review of #4328)
-- * The permission gate below is copied verbatim from
--   fn_attendance_roster(uuid,uuid[],uuid,uuid,uuid).
-- * Under that exact gate, fn_attendance_roster already returns first_name,
--   last_name, roll_number, photo, section etc. for any learner of the
--   caller's institution. This function exposes nothing more sensitive than
--   what the roster already shows to the same callers.
-- * is_admin() is NOT institution-scoped (profiles.role IN ('admin',
--   'super_admin','administrator') or is_super_admin). fn_attendance_roster
--   has the same property, so this function adds no new reach.
-- * At most 2000 ids per call (ERRCODE 22023); the client chunks larger
--   rosters. A NULL array is treated as empty and returns no rows.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_learner_genders(
  p_institution_id uuid,
  p_learner_ids uuid[]
)
RETURNS TABLE(id uuid, gender text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    is_super_admin()
    OR is_admin()
    OR (
      (
        role_has_institution_access(p_institution_id)
        OR staff_teaches_in_institution(p_institution_id)
      )
      AND (
        user_has_permission('academic.attendance.mark')
        OR user_has_permission('academic.attendance.view')
        OR user_has_permission('academic.attendance.reports')
      )
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to resolve learner genders for this institution'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(cardinality(p_learner_ids), 0) > 2000 THEN
    RAISE EXCEPTION 'At most 2000 learner ids per call (got %)', cardinality(p_learner_ids)
      USING ERRCODE = '22023';
  END IF;

  IF p_learner_ids IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT lp.id, lp.gender::text
  FROM public.learners_profiles lp
  WHERE lp.institution_id = p_institution_id
    AND lp.id = ANY (p_learner_ids);
END;
$function$;

-- REVOKE FROM PUBLIC alone is not enough on Supabase: default privileges grant
-- anon a direct EXECUTE on every new function.
REVOKE EXECUTE ON FUNCTION public.fn_learner_genders(uuid, uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_learner_genders(uuid, uuid[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- DEPLOY — no ordering constraint.
-- Before the app deploys: nothing calls it. App before this is applied: the
-- "Boys, then girls" order treats every gender as unknown and falls back to
-- name order, logging a warning; the roster and saving are unaffected.
-- Rollback: DROP FUNCTION public.fn_learner_genders(uuid, uuid[]);

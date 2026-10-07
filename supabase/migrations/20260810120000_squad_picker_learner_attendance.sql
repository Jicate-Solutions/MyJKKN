-- 2026-08-10 - fn_squad_learner_attendance
-- =============================================================================
-- Attendance standing for a NAMED set of learners, readable by the person who
-- files a squad for a tournament.
--
-- WHY THIS FUNCTION HAS TO EXIST (measured on production 2026-08-01, not assumed)
--   The squad picker warns the filer when a learner they are nominating is near
--   the exam-eligibility edge. The exam audit already computes exactly that
--   number — fn_exam_audit_attendance — but it refuses this caller:
--
--     IF NOT (is_super_admin() OR user_has_permission(
--               'academic.internal_marks.exam_audit.view')) THEN RAISE ...
--
--   Both live holders of health.sports.file_request were checked, merging every
--   role each of them holds (permissions OR-merge across roles):
--     coo@jkkn.ac.in       roles coo, admission, sports_coordinator,
--                          ai_assistant_pilot, hr_head, accreditation_officer
--     sathish.s@jkkn.ac.in roles staff, sports_coordinator
--   For BOTH: health.sports.file_request = true,
--             academic.attendance.view = false,
--             academic.internal_marks.exam_audit.view = false.
--   fn_attendance_protected_days refuses them for the same reason and then
--   self-scopes to profiles.learner_id, which is NULL for both (neither filer is
--   a learner), so it returns nothing at all.
--
--   Calling either from the picker therefore yields an error or an empty answer
--   for the only two people who use the page. The service-role key is not a way
--   round it either: fn_exam_audit_attendance raises 'not authenticated' for
--   service_role, because auth.uid() is NULL there (verified over the wire).
--
-- WHY IT IS NOT A SECOND ATTENDANCE CALCULATION
--   The BANDS stay in lib/services/exam-audit/compute.ts (ATTENDANCE_ELIGIBILITY
--   / CONDONATION_FLOOR) and the summing stays in aggregateAttendanceByStudent /
--   eligiblePct / eligibilityBucket — this returns the same raw
--   {present, total, protected} rows those functions already consume, so the
--   rule that decides "at risk" lives in exactly one place, as before.
--   PROTECTION is not re-derived either: it comes from
--   fn_attendance_protected_days_core, the same single definition of a protected
--   day that fn_exam_audit_attendance and fn_vsr_attendance_core both use. A
--   learner whose absence is already excused by an approved tournament or a
--   full-day on-duty therefore cannot be warned as absent here.
--
-- WHY NOT LOOP fn_vsr_attendance_core PER LEARNER
--   It is granted to service_role and would need no DDL, but it scans the whole
--   institution's student_attendance once PER LEARNER (measured ~0.7s per call
--   over the wire). A squad of twenty is twenty full scans. This does ONE scan
--   for the whole set.
--
-- WHY THE _core PROTECTION LOOKUP AND NOT THE PUBLIC WRAPPER
--   Same reason fn_vsr_attendance_core calls the core: the public wrapper scopes
--   by CALLER, and this caller is deliberately not attendance-privileged, so the
--   wrapper would hand back nothing and every learner would look unprotected —
--   i.e. warned for absences the Principal already excused. Scope here is
--   carried by the p_learner_ids ARGUMENT plus the institution gate below, which
--   is strictly narrower: the function can only ever answer about learners the
--   caller named, in an institution the caller may see.
--
-- READ-ONLY. Nothing here writes attendance.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_squad_learner_attendance(
  p_institution_id uuid,
  p_learner_ids    uuid[],
  p_from           date,
  p_to             date DEFAULT NULL
)
RETURNS TABLE(
  student_id uuid,
  course_id  uuid,
  present    integer,
  total      integer,
  protected  integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '10s'
AS $function$
DECLARE v_to date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_squad_learner_attendance: not authenticated';
  END IF;

  -- COALESCE on every guard: a NULL from a permission read must not fall
  -- through to the permissive branch (this repo has already shipped a
  -- super-admin guard that did exactly that).
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.user_has_permission('health.sports.file_request'), false)
  ) THEN
    RAISE EXCEPTION 'fn_squad_learner_attendance: not authorized';
  END IF;

  IF p_institution_id IS NULL OR p_from IS NULL THEN RETURN; END IF;
  IF p_learner_ids IS NULL OR array_length(p_learner_ids, 1) IS NULL THEN RETURN; END IF;

  -- A squad is a squad. The cap is a cost bound, not a business rule: it stops
  -- the picker's array from turning into an unbounded scan request.
  IF array_length(p_learner_ids, 1) > 200 THEN
    RAISE EXCEPTION 'fn_squad_learner_attendance: at most 200 learners per call';
  END IF;

  -- Institution gate. Super admins are already past the permission check above;
  -- everyone else must actually hold access to this institution.
  IF NOT COALESCE(public.is_super_admin(), false)
     AND NOT COALESCE(public.role_has_institution_access(p_institution_id), false) THEN
    RETURN;
  END IF;

  -- ONE upper bound for both the attendance scan and the protection lookup, for
  -- the reason fn_exam_audit_attendance documents: a day counted into `total`
  -- but past the protection window can only ever push a percentage down.
  v_to := COALESCE(p_to, CURRENT_DATE);

  RETURN QUERY
  WITH periods AS (
    SELECT CASE WHEN (e.val->>'course_id') ~ '^[0-9a-fA-F-]{36}$'
                THEN (e.val->>'course_id')::uuid END AS cid,
           sa.attendance_date AS adate,
           e.val AS period
    FROM public.student_attendance sa,
         LATERAL jsonb_each(sa.attendance_data) AS e(k, val)
    WHERE sa.institution_id = p_institution_id
      AND jsonb_typeof(sa.attendance_data) = 'object'
      AND sa.attendance_date >= p_from
      AND sa.attendance_date <= v_to
  ),
  studs AS (
    SELECT p.cid, p.adate,
           (s->>'student_id')::uuid AS sid,
           CASE WHEN lower(s->>'status') = 'present' THEN 1 ELSE 0 END AS is_present
    FROM periods p,
         LATERAL jsonb_array_elements(p.period->'students') AS s
    WHERE p.period ? 'students'
      AND COALESCE(s->>'student_id','') <> ''
      -- The narrowing that makes this a squad question and not an institution
      -- question. Applied here, before the protection join, so the function can
      -- never return a row about a learner the caller did not name.
      AND (s->>'student_id')::uuid = ANY(p_learner_ids)
  ),
  -- DISTINCT is load-bearing: a day covered by BOTH a tournament permission and
  -- an on-duty application returns twice, and joining that raw would multiply
  -- the learner's rows and inflate `total`.
  prot AS (
    SELECT DISTINCT pd.learner_id, pd.protected_date
    FROM public.fn_attendance_protected_days_core(
           ARRAY[p_institution_id], p_from, v_to, NULL) pd
    WHERE pd.learner_id = ANY(p_learner_ids)
  )
  SELECT st.sid AS student_id,
         st.cid AS course_id,
         SUM(st.is_present)::int AS present,
         COUNT(*)::int AS total,
         SUM(CASE WHEN st.is_present = 0 AND pr.learner_id IS NOT NULL THEN 1 ELSE 0 END)::int
           AS protected
  FROM studs st
  LEFT JOIN prot pr ON pr.learner_id = st.sid AND pr.protected_date = st.adate
  GROUP BY st.sid, st.cid;
END;
$function$;

COMMENT ON FUNCTION public.fn_squad_learner_attendance(uuid, uuid[], date, date) IS
  'Raw {present, total, protected} attendance rows for a NAMED set of learners in one '
  'institution, for the squad picker''s at-risk warning. Authorized on '
  'health.sports.file_request (or super admin) plus role_has_institution_access, because '
  'no live holder of that key also holds academic.attendance.view or '
  'academic.internal_marks.exam_audit.view. Protection comes from '
  'fn_attendance_protected_days_core, so an absence already excused by an approved '
  'tournament or full-day on-duty is credited exactly as the exam audit credits it. '
  'The bands stay in lib/services/exam-audit/compute.ts; this function never decides '
  'eligibility. Read-only.';

-- Supabase issues every NEW function a default `GRANT ALL ON FUNCTIONS TO anon`
-- that is SEPARATE from PUBLIC, so revoking PUBLIC alone leaves the function
-- callable with the public anon key that ships in the browser bundle. Revoke
-- both, then grant back only authenticated.
REVOKE EXECUTE ON FUNCTION public.fn_squad_learner_attendance(uuid, uuid[], date, date)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_squad_learner_attendance(uuid, uuid[], date, date)
  TO authenticated;

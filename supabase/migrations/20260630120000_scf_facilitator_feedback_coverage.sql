-- =============================================================================
-- 20260630120000_scf_facilitator_feedback_coverage.sql
-- Post-Class Feedback (SCF) → LEARNING-FACILITATOR FEEDBACK-COVERAGE rollup.
-- Spec: specs/post-class-feedback-attendance-gate-2026-06-15.md (admin/coverage lane)
-- =============================================================================
-- PROBLEM the existing admin RPCs cannot answer:
--   fn_scf_admin_faculty_summary aggregates FROM session_feedback ONLY. A learning
--   facilitator who TAUGHT sessions but received ZERO feedback produces no row and
--   is invisible — "drivers visible, non-drivers invisible, no denominator". As of
--   2026-06-29, feedback coverage is ~3% (51 of 1,818 taught sessions); only 16 of
--   138 facilitators have ANY feedback. The 122 non-drivers are exactly who a
--   coverage view must surface, and they cannot be seen from session_feedback.
--
-- WHAT THIS ADDS:
--   fn_scf_facilitator_feedback_coverage(p_from, p_to) — per-facilitator:
--     taught_sessions  = distinct (date, period, course) the facilitator was the
--                        assigned_faculty for AND attendance was marked (the blob
--                        exists). This is the DENOMINATOR — "sessions actually
--                        taught", drawn from student_attendance, NOT session_feedback.
--     covered_sessions = those taught sessions that have >= 1 matching feedback row
--                        (NUMERATOR).
--     coverage_pct     = covered / taught * 100  (0 for non-drivers).
--
-- GROUND TRUTH (re-verified live against prod 2026-06-29):
--   * The student_attendance period blob carries the facilitator + course INLINE:
--       attendance_data -> <period_id> -> 'assigned_faculty'  (object OR array)
--                                       -> [0|]'faculty_id'    == staff.id
--       attendance_data -> <period_id> -> 'course_code'
--     So "who taught this session" needs NO timetables join — the blob has it.
--   * IDENTITY (verified 99/99 + 50/50 against prod):
--       attendance blob assigned_faculty.faculty_id == staff.id
--       session_feedback.faculty_id                 == staff.id
--     Both key the facilitator by staff.id, so the numerator joins feedback to a
--     taught session on (faculty_id=staff_id, attendance_date, period_id, course_code).
--   * SESSION GRAIN matches the existing admin RPCs: (attendance_date, period_id,
--     course_code) — here further scoped per facilitator (staff_id) so a substitute
--     does not get another facilitator's feedback attributed to them.
--
-- DENOMINATOR MATH — adversarially verified against prod 2026-06-29:
--   At one snapshot: taught tuples = 1847 (grows daily as attendance is marked);
--   covered (this logic) = 51; INDEPENDENT recompute (EXISTS-filtered distinct) = 51
--   (match); non-drivers (taught>0, covered=0) = 122; covered>taught = 0; coverage_pct
--   out of [0,100] = 0; drivers = 16 (== the 16 distinct feedback faculty). Then a LIVE
--   authed-render as super_admin returned the SAME aggregates and the independent
--   recompute equalled the RPC at that instant — and the anon grant was confirmed
--   absent (only authenticated/service_role/postgres). Math + gate + lock all confirmed.
--
-- ANONYMITY INVARIANT (inherited from the SCF substrate): returns ONLY aggregates
--   (counts, a coverage %, last-activity dates). NEVER a per-student understood /
--   checklist / free_text. Feedback content is exposed only to the learner who
--   wrote it (RLS) — never to staff at any layer.
--
-- SCOPE GATE: mirrors fn_scf_admin_college_summary exactly — super_admin sees ALL
--   institutions; institution leadership (administrator/institution_admin/dean/hod/
--   principal/coordinator) sees only their own institution_id; everyone else is
--   rejected. SECURITY DEFINER + STABLE, anon-locked.
--
-- ADDITIVE + SAFE: one new function. Touches no tables, no RLS, no existing RPC.
-- Metric (b) "attendance-marking coverage" is NOT rebuilt here — it already exists
-- as get_facilitator_attendance_stats (timetable-scheduled denominator) and powers
-- /academic/attendance/reports/[id]; the coverage view reuses it for that column.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_scf_facilitator_feedback_coverage(p_from date, p_to date)
RETURNS TABLE (
  institution_id    uuid,
  institution_name  text,
  staff_id          uuid,
  facilitator_name  text,
  designation       text,
  department_name   text,
  taught_sessions   bigint,
  covered_sessions  bigint,
  coverage_pct      numeric,
  responses         bigint,
  last_taught       date,
  last_feedback     date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_facilitator_feedback_coverage: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator']) OR p.is_super_admin = true)
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_facilitator_feedback_coverage: not authorized';
  END IF;

  RETURN QUERY
  -- taught: one row per (facilitator, date, period, course) actually taught + marked.
  -- assigned_faculty may be a single object OR an array; take the first faculty_id.
  WITH taught AS (
    SELECT DISTINCT
      sa.institution_id AS inst_id,
      (CASE WHEN jsonb_typeof(pe.val->'assigned_faculty')='array'
            THEN pe.val->'assigned_faculty'->0->>'faculty_id'
            ELSE pe.val->'assigned_faculty'->>'faculty_id' END)::uuid AS staff_id,
      sa.attendance_date,
      pe.period_key AS period_id,
      (pe.val->>'course_code') AS course_code
    FROM public.student_attendance sa,
         jsonb_each(sa.attendance_data) pe(period_key, val)
    WHERE (v_super OR sa.institution_id = v_inst)
      AND sa.attendance_date BETWEEN p_from AND p_to
      AND jsonb_typeof(sa.attendance_data) = 'object'
      AND jsonb_typeof(pe.val) = 'object'
      AND pe.val ? 'assigned_faculty'
      AND (CASE WHEN jsonb_typeof(pe.val->'assigned_faculty')='array'
            THEN pe.val->'assigned_faculty'->0->>'faculty_id'
            ELSE pe.val->'assigned_faculty'->>'faculty_id' END) IS NOT NULL
  ),
  -- covered: taught sessions with >= 1 feedback row from the SAME facilitator+session.
  covered AS (
    SELECT t.staff_id, t.attendance_date, t.period_id, t.course_code,
           count(f.id) AS responses
    FROM taught t
    JOIN public.session_feedback f
      ON f.faculty_id      = t.staff_id
     AND f.attendance_date = t.attendance_date
     AND f.period_id       = t.period_id
     AND COALESCE(f.course_code,'') = COALESCE(t.course_code,'')
    GROUP BY t.staff_id, t.attendance_date, t.period_id, t.course_code
  ),
  per_fac AS (
    SELECT t.inst_id, t.staff_id,
           count(*)::bigint        AS taught_sessions,
           max(t.attendance_date)  AS last_taught
    FROM taught t
    GROUP BY t.inst_id, t.staff_id
  ),
  cov_fac AS (
    SELECT c.staff_id,
           count(*)::bigint        AS covered_sessions,
           sum(c.responses)::bigint AS responses,
           max(c.attendance_date)  AS last_feedback
    FROM covered c
    GROUP BY c.staff_id
  )
  SELECT
    pf.inst_id                                            AS institution_id,
    i.name::text                                          AS institution_name,
    pf.staff_id,
    NULLIF(trim(COALESCE(s.first_name,'')||' '||COALESCE(s.last_name,'')), '')::text AS facilitator_name,
    COALESCE(s.designation,'')::text                      AS designation,
    COALESCE(d.department_name,'Unknown')::text           AS department_name,
    pf.taught_sessions,
    COALESCE(cf.covered_sessions, 0)                      AS covered_sessions,
    CASE WHEN pf.taught_sessions = 0 THEN 0
         ELSE round(COALESCE(cf.covered_sessions,0)::numeric / pf.taught_sessions * 100, 1) END AS coverage_pct,
    COALESCE(cf.responses, 0)                             AS responses,
    pf.last_taught,
    cf.last_feedback
  FROM per_fac pf
  LEFT JOIN cov_fac cf            ON cf.staff_id = pf.staff_id
  LEFT JOIN public.staff s        ON s.id = pf.staff_id
  LEFT JOIN public.departments d  ON d.id = s.department_id
  LEFT JOIN public.institutions i ON i.id = pf.inst_id
  -- Drivers first (brief: drivers at top, 0% at bottom), most-taught as tiebreak.
  ORDER BY coverage_pct DESC, pf.taught_sessions DESC;
END;
$$;

COMMENT ON FUNCTION public.fn_scf_facilitator_feedback_coverage(date,date) IS
  'SCF learning-facilitator feedback-coverage: per facilitator, (distinct taught '
  'sessions with >=1 feedback) / (distinct taught sessions). Denominator from '
  'student_attendance blob (assigned_faculty.faculty_id == staff.id), NOT from '
  'session_feedback, so facilitators who taught but got zero feedback appear at 0%. '
  'Aggregates only (no per-student content). super_admin sees all; institution '
  'leadership sees own institution. Read-only, STABLE, SECURITY DEFINER, anon-locked.';

-- MANDATORY anon lock (CLAUDE.md: Supabase grants anon EXECUTE on new functions by default).
REVOKE EXECUTE ON FUNCTION public.fn_scf_facilitator_feedback_coverage(date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_facilitator_feedback_coverage(date,date) TO authenticated;

-- PostgREST must see the new function immediately.
NOTIFY pgrst, 'reload schema';

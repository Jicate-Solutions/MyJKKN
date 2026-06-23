-- =============================================================================
-- 20260623190000_scf_admin_dashboard_rpcs.sql
-- Post-Class Feedback → SUPER-ADMIN / institution-leadership ALL-COLLEGE dashboard.
-- Spec: specs/post-class-feedback-attendance-gate-2026-06-15.md (admin lane)
-- =============================================================================
-- Three read-only aggregate RPCs that power /academic/session-feedback/admin.
-- They reproduce the CROSS-COLLEGE scope gate from fn_scf_principal_escalations
-- (super_admin sees ALL institutions; institution leadership sees only their own
-- institution_id) but re-group the data three different ways:
--
--   1) per college   — submission + completion picture per institution
--   2) per faculty    — worst-understanding faculty first (cross-college)
--   3) per day        — understanding trend over the window
--
-- ANONYMITY INVARIANT (hard rule, inherited from the substrate): these functions
-- return ONLY aggregates (counts, distinct counts, averages). They NEVER return a
-- per-student `understood` / `checklist` / `free_text`. Feedback content is never
-- exposed to staff at any layer — only to the learner who wrote it (RLS).
--
-- All three are SECURITY DEFINER + STABLE, and each ends with the MANDATORY
-- `REVOKE EXECUTE ... FROM anon, PUBLIC; GRANT EXECUTE ... TO authenticated;`
-- (CLAUDE.md: Supabase grants anon EXECUTE on new functions by default).
--
-- ADDITIVE + SAFE: new functions only. Touches no tables, no RLS, no existing RPC.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Per-college summary — submission + completion picture per institution.
--    A "session" = a distinct (attendance_date, period_id, course_code) that has
--    at least one feedback row. "low_sessions" = sessions with >= 3 responses AND
--    avg(understood) < 3 (same breach threshold as principal escalations).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_admin_college_summary(p_from date, p_to date)
RETURNS TABLE (
  institution_id   uuid,
  institution_name text,
  sessions         bigint,
  responses        bigint,
  students         bigint,
  avg_understood   numeric,
  low_sessions     bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_admin_college_summary: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator']) OR p.is_super_admin = true)
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_admin_college_summary: not authorized';
  END IF;

  RETURN QUERY
  -- per_session: session-grained aggregates (sessions / responses / weighted avg /
  -- low_sessions). Does NOT carry distinct-student counts — summing per-session
  -- distinct counts would OVERCOUNT any student who gave feedback in >1 session
  -- (student-sessions, not students). Distinct students is rolled up separately.
  WITH per_session AS (
    SELECT f.institution_id AS inst_id,
           f.attendance_date, f.period_id, f.course_code,
           count(*)::bigint           AS s_responses,
           avg(f.understood)::numeric AS s_avg
    FROM public.session_feedback f
    WHERE (v_super OR f.institution_id = v_inst)
      AND f.attendance_date BETWEEN p_from AND p_to
    GROUP BY f.institution_id, f.attendance_date, f.period_id, f.course_code
  ),
  sess_roll AS (
    SELECT ps.inst_id,
           count(*)::bigint                                                     AS sessions,
           sum(ps.s_responses)::bigint                                          AS responses,
           round((sum(ps.s_avg * ps.s_responses) / NULLIF(sum(ps.s_responses),0))::numeric, 2) AS avg_understood,
           count(*) FILTER (WHERE ps.s_responses >= 3 AND ps.s_avg < 3)::bigint AS low_sessions
    FROM per_session ps
    GROUP BY ps.inst_id
  ),
  -- stud_roll: DISTINCT students over the RAW feedback rows — a student who
  -- submitted in N sessions counts exactly ONCE per institution.
  stud_roll AS (
    SELECT f.institution_id AS inst_id,
           count(DISTINCT f.student_id)::bigint AS students
    FROM public.session_feedback f
    WHERE (v_super OR f.institution_id = v_inst)
      AND f.attendance_date BETWEEN p_from AND p_to
    GROUP BY f.institution_id
  )
  SELECT sr.inst_id AS institution_id,
         i.name::text AS institution_name,
         sr.sessions,
         sr.responses,
         st.students,
         sr.avg_understood,
         sr.low_sessions
  FROM sess_roll sr
  JOIN stud_roll st ON st.inst_id = sr.inst_id
  LEFT JOIN public.institutions i ON i.id = sr.inst_id
  ORDER BY sr.responses DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_admin_college_summary(date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_admin_college_summary(date,date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Per-faculty summary — worst-understanding faculty first, across scope.
--    Same session definition + breach threshold as above, grouped by faculty.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_admin_faculty_summary(p_from date, p_to date)
RETURNS TABLE (
  institution_id   uuid,
  institution_name text,
  faculty_email    text,
  sessions         bigint,
  responses        bigint,
  avg_understood   numeric,
  low_sessions     bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_admin_faculty_summary: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator']) OR p.is_super_admin = true)
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_admin_faculty_summary: not authorized';
  END IF;

  RETURN QUERY
  WITH per_session AS (
    SELECT f.institution_id AS inst_id,
           f.faculty_email,
           f.attendance_date, f.period_id, f.course_code,
           count(*)::bigint           AS s_responses,
           avg(f.understood)::numeric AS s_avg
    FROM public.session_feedback f
    WHERE (v_super OR f.institution_id = v_inst)
      AND f.attendance_date BETWEEN p_from AND p_to
    GROUP BY f.institution_id, f.faculty_email, f.attendance_date, f.period_id, f.course_code
  )
  SELECT ps.inst_id AS institution_id,
         i.name::text AS institution_name,
         ps.faculty_email,
         count(*)::bigint                                                   AS sessions,
         sum(ps.s_responses)::bigint                                        AS responses,
         round((sum(ps.s_avg * ps.s_responses) / NULLIF(sum(ps.s_responses),0))::numeric, 2) AS avg_understood,
         count(*) FILTER (WHERE ps.s_responses >= 3 AND ps.s_avg < 3)::bigint AS low_sessions
  FROM per_session ps
  LEFT JOIN public.institutions i ON i.id = ps.inst_id
  GROUP BY ps.inst_id, i.name, ps.faculty_email
  ORDER BY avg_understood ASC NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_admin_faculty_summary(date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_admin_faculty_summary(date,date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Per-day understanding trend across scope (one row per day with feedback).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_admin_trend(p_from date, p_to date)
RETURNS TABLE (
  attendance_date date,
  responses       bigint,
  students        bigint,
  avg_understood  numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_admin_trend: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator']) OR p.is_super_admin = true)
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_admin_trend: not authorized';
  END IF;

  RETURN QUERY
  SELECT f.attendance_date,
         count(*)::bigint                     AS responses,
         count(DISTINCT f.student_id)::bigint AS students,
         round(avg(f.understood)::numeric, 2) AS avg_understood
  FROM public.session_feedback f
  WHERE (v_super OR f.institution_id = v_inst)
    AND f.attendance_date BETWEEN p_from AND p_to
  GROUP BY f.attendance_date
  ORDER BY f.attendance_date ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_admin_trend(date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_admin_trend(date,date) TO authenticated;

-- PostgREST must see the new functions immediately.
NOTIFY pgrst, 'reload schema';

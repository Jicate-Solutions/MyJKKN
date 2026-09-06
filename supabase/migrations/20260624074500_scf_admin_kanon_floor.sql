-- 2026-06-24 — k-anonymity floor on the session-feedback all-college dashboard RPCs.
--
-- LEAK (found by an adversarial privacy pass): fn_scf_admin_faculty_summary and
-- fn_scf_admin_college_summary computed avg_understood as a response-weighted
-- average over EVERY session, including sessions with < 3 responses. A faculty
-- whose only feedback is one session with one response surfaced as
-- `responses: 1, avg_understood: 1.00` to any HOD/principal/dean in the
-- institution — and an average of "1.00" over a single response IS that one
-- student's exact rating. Cross-referenced with the class roster, the (minor)
-- student is de-anonymised. Proven live against a real HOD session.
--
-- FIX: weight avg_understood over ONLY sessions with >= 3 responses — the same
-- k>=3 floor this feature already uses everywhere else (fn_scf_principal_escalations,
-- the existing `low_sessions FILTER (WHERE s_responses >= 3)` in these very RPCs,
-- and the lift RPCs). A faculty/college/day with no >=3-response session now
-- returns avg_understood = NULL ("insufficient data" — the page already null-guards
-- this), instead of leaking an individual rating. Structural counts (sessions,
-- responses, students) are unchanged — a count never reveals a rating.
--
-- NOT changed: fn_scf_faculty_summary (a teacher seeing feedback on their OWN
-- class is intentional — it's their data and their roster), and fn_scf_ai_signal
-- (service-role only, unreachable from the browser).

-- ============================================================================
-- 1) fn_scf_admin_faculty_summary — floor the per-faculty avg.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_scf_admin_faculty_summary(p_from date, p_to date)
RETURNS TABLE(institution_id uuid, institution_name text, faculty_email text, sessions bigint, responses bigint, avg_understood numeric, low_sessions bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
         -- k>=3 floor: average only over sessions with >= 3 responses, so a small
         -- (<3) session's value can never surface as an individual rating. NULL
         -- when the faculty has no >=3-response session (insufficient data).
         round((sum(ps.s_avg * ps.s_responses) FILTER (WHERE ps.s_responses >= 3)
              / NULLIF(sum(ps.s_responses) FILTER (WHERE ps.s_responses >= 3), 0))::numeric, 2) AS avg_understood,
         count(*) FILTER (WHERE ps.s_responses >= 3 AND ps.s_avg < 3)::bigint AS low_sessions
  FROM per_session ps
  LEFT JOIN public.institutions i ON i.id = ps.inst_id
  GROUP BY ps.inst_id, i.name, ps.faculty_email
  ORDER BY avg_understood ASC NULLS LAST;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_admin_faculty_summary(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_admin_faculty_summary(date, date) TO authenticated;

-- ============================================================================
-- 2) fn_scf_admin_college_summary — floor the per-college avg.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_scf_admin_college_summary(p_from date, p_to date)
RETURNS TABLE(institution_id uuid, institution_name text, sessions bigint, responses bigint, students bigint, avg_understood numeric, low_sessions bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
           -- k>=3 floor (see faculty summary). NULL when no >=3-response session.
           round((sum(ps.s_avg * ps.s_responses) FILTER (WHERE ps.s_responses >= 3)
                / NULLIF(sum(ps.s_responses) FILTER (WHERE ps.s_responses >= 3), 0))::numeric, 2) AS avg_understood,
           count(*) FILTER (WHERE ps.s_responses >= 3 AND ps.s_avg < 3)::bigint AS low_sessions
    FROM per_session ps
    GROUP BY ps.inst_id
  ),
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
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_admin_college_summary(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_admin_college_summary(date, date) TO authenticated;

-- ============================================================================
-- 3) fn_scf_admin_trend — floor the per-day avg.
--    The trend is institution-wide per day with no faculty/course dimension, so
--    it is a weaker vector, but a day with < 3 responses still has avg == an
--    individual rating. Mask the day's avg below the floor; keep the adoption
--    counts (responses, students).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_scf_admin_trend(p_from date, p_to date)
RETURNS TABLE(attendance_date date, responses bigint, students bigint, avg_understood numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
         -- k>=3 floor: hide the day's average until >= 3 responses exist that day.
         CASE WHEN count(*) >= 3 THEN round(avg(f.understood)::numeric, 2) ELSE NULL END AS avg_understood
  FROM public.session_feedback f
  WHERE (v_super OR f.institution_id = v_inst)
    AND f.attendance_date BETWEEN p_from AND p_to
  GROUP BY f.attendance_date
  ORDER BY f.attendance_date ASC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_admin_trend(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_admin_trend(date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';

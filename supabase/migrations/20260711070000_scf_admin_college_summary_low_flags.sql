-- Updated: 2026-07-11 — "Low sessions" second lens (Director request, same day):
-- the admin dashboard's red "Low sessions: 4" sat next to 1,000+ individual
-- struggling voices with nothing connecting them. fn_scf_admin_college_summary
-- gains two ADDITIVE trailing columns so the card can show both lenses:
--   low_flag_responses — responses in window rating understanding <= 2
--   low_flag_sessions  — sessions containing >= 1 such response
-- Both are pure aggregates (no identity, no content). The k>=3 anonymity floor
-- on low_sessions / avg_understood is UNCHANGED. Authz body unchanged
-- (is_super_admin OR academic.session_feedback.leadership.view, base = live
-- prod body after 20260731110000_scf_leadership_permission_gates).
-- RETURNS TABLE changed => DROP + CREATE (CREATE OR REPLACE cannot alter OUT
-- columns). Grants restored explicitly below (authenticated + service_role;
-- anon/PUBLIC revoked per the 2026-06-06 RPC mandate).
-- Consumers: /academic/session-feedback/admin stat card (new subtitle),
-- attendance dashboard feedback tab (ignores the new columns — additive-safe).

DROP FUNCTION IF EXISTS public.fn_scf_admin_college_summary(date, date);

CREATE FUNCTION public.fn_scf_admin_college_summary(p_from date, p_to date)
 RETURNS TABLE(
   institution_id uuid,
   institution_name text,
   sessions bigint,
   responses bigint,
   students bigint,
   avg_understood numeric,
   low_sessions bigint,
   low_flag_responses bigint,
   low_flag_sessions bigint
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_insts uuid[]; v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_admin_college_summary: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.leadership.view'))
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_admin_college_summary: not authorized';
  END IF;
  SELECT array_agg(i.id) INTO v_insts FROM public.institutions i WHERE public.role_has_institution_access(i.id);

  RETURN QUERY
  WITH per_session AS (
    SELECT f.institution_id AS inst_id,
           f.attendance_date, f.period_id, f.course_code,
           count(*)::bigint           AS s_responses,
           avg(f.understood)::numeric AS s_avg,
           count(*) FILTER (WHERE f.understood <= 2)::bigint AS s_low_flags
    FROM public.session_feedback f
    WHERE (v_super OR f.institution_id = ANY(v_insts))
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
           count(*) FILTER (WHERE ps.s_responses >= 3 AND ps.s_avg < 3)::bigint AS low_sessions,
           -- Second lens (2026-07-11): individual struggling voices. Aggregate
           -- counts only — a learner tapping 1-2/5 in an otherwise-fine class
           -- never moves low_sessions, but it should still be visible here.
           sum(ps.s_low_flags)::bigint                                          AS low_flag_responses,
           count(*) FILTER (WHERE ps.s_low_flags >= 1)::bigint                  AS low_flag_sessions
    FROM per_session ps
    GROUP BY ps.inst_id
  ),
  stud_roll AS (
    SELECT f.institution_id AS inst_id,
           count(DISTINCT f.student_id)::bigint AS students
    FROM public.session_feedback f
    WHERE (v_super OR f.institution_id = ANY(v_insts))
      AND f.attendance_date BETWEEN p_from AND p_to
    GROUP BY f.institution_id
  )
  SELECT sr.inst_id AS institution_id,
         i.name::text AS institution_name,
         sr.sessions,
         sr.responses,
         st.students,
         sr.avg_understood,
         sr.low_sessions,
         sr.low_flag_responses,
         sr.low_flag_sessions
  FROM sess_roll sr
  JOIN stud_roll st ON st.inst_id = sr.inst_id
  LEFT JOIN public.institutions i ON i.id = sr.inst_id
  ORDER BY sr.responses DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_admin_college_summary(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_admin_college_summary(date, date) TO authenticated, service_role;

-- 20270412090000_scf_admin_course_breakdown.sql
--
-- BUG-004624 (MBA HoD, 11 Jul): "not able to see the faculty subject feedback".
-- fn_scf_admin_faculty_summary merges all of a teacher's courses into one row;
-- the self-scoped fn_scf_faculty_summary shows a teacher only their own. This
-- ADDS the teacher x course split for leadership. Nothing is replaced.
--
-- Body = the LIVE fn_scf_admin_faculty_summary (pg_get_functiondef, 27 Sep),
-- with course_code/course_name carried through and added to the final GROUP BY:
--   * same gate: is_super_admin() OR user_has_permission(
--       'academic.session_feedback.leadership.view')
--   * same row scope: role_has_institution_access(i.id), super admin sees all
--   * same session maths: a session = (date, period, course); averages use only
--     sessions with >= 3 responses; low = avg < 3 with >= 3 responses
--   * aggregates only — no learner id, no free text, no checklist
--   * ONE deliberate difference: the email lookup is de-duplicated (DISTINCT ON
--     lower(email)) so a case-variant duplicate cannot multiply responses. The
--     live faculty summary has the unguarded join; 0 such duplicates on 27 Sep.
-- Tier 1: additive, idempotent (CREATE OR REPLACE of a NEW name), drops nothing.

CREATE OR REPLACE FUNCTION public.fn_scf_admin_course_breakdown(p_from date, p_to date)
 RETURNS TABLE(institution_id uuid, institution_name text, faculty_email text, course_code text, course_name text, sessions bigint, responses bigint, avg_understood numeric, low_sessions bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_insts uuid[]; v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_admin_course_breakdown: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.leadership.view'))
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_admin_course_breakdown: not authorized';
  END IF;
  SELECT array_agg(i.id) INTO v_insts FROM public.institutions i WHERE public.role_has_institution_access(i.id);

  RETURN QUERY
  WITH
  staff_by_id AS MATERIALIZED (
    SELECT st.id AS sid, st.institution_email
    FROM public.staff st
    WHERE NULLIF(btrim(st.institution_email), '') IS NOT NULL
  ),
  -- ONE row per lower(email). staff.email is unique only case-sensitively, so
  -- 'A@x' and 'a@x' would both match lower(f.faculty_email) and double every
  -- response (inflating counts past the >= 3 threshold). Active record first.
  staff_by_email AS MATERIALIZED (
    SELECT DISTINCT ON (lower(st.email)) lower(st.email) AS lemail, st.institution_email
    FROM public.staff st
    WHERE NULLIF(btrim(st.institution_email), '') IS NOT NULL
      AND st.email IS NOT NULL
    ORDER BY lower(st.email), st.is_active DESC, st.id
  ),
  fb AS (
    SELECT f.institution_id AS inst_id,
           f.attendance_date, f.period_id, f.course_code, f.course_name,
           f.understood,
           COALESCE(sbi.institution_email, sbe.institution_email, f.faculty_email) AS resolved_email
    FROM public.session_feedback f
    LEFT JOIN staff_by_id    sbi ON sbi.sid    = f.faculty_id
    LEFT JOIN staff_by_email sbe ON sbe.lemail = lower(f.faculty_email)
    WHERE (v_super OR f.institution_id = ANY(v_insts))
      AND f.attendance_date BETWEEN p_from AND p_to
      -- Q1: hide switched-off faculty (their real responses stay in the table,
      -- just not shown under a dead account in the coaching ranking).
      AND NOT EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.id = f.faculty_id AND s.is_active = false
      )
  ),
  per_session AS (
    SELECT fb.inst_id,
           fb.resolved_email,
           fb.attendance_date, fb.period_id, fb.course_code,
           max(fb.course_name)        AS s_course_name,
           count(*)::bigint           AS s_responses,
           avg(fb.understood)::numeric AS s_avg
    FROM fb
    GROUP BY fb.inst_id, fb.resolved_email, fb.attendance_date, fb.period_id, fb.course_code
  )
  SELECT ps.inst_id AS institution_id,
         i.name::text AS institution_name,
         ps.resolved_email AS faculty_email,
         ps.course_code::text AS course_code,
         max(ps.s_course_name)::text AS course_name,
         count(*)::bigint                                                   AS sessions,
         sum(ps.s_responses)::bigint                                        AS responses,
         round((sum(ps.s_avg * ps.s_responses) FILTER (WHERE ps.s_responses >= 3)
              / NULLIF(sum(ps.s_responses) FILTER (WHERE ps.s_responses >= 3), 0))::numeric, 2) AS avg_understood,
         count(*) FILTER (WHERE ps.s_responses >= 3 AND ps.s_avg < 3)::bigint AS low_sessions
  FROM per_session ps
  LEFT JOIN public.institutions i ON i.id = ps.inst_id
  GROUP BY ps.inst_id, i.name, ps.resolved_email, ps.course_code
  ORDER BY 3, 8 ASC NULLS LAST;  -- teacher, then weakest course first
END;
$function$;


REVOKE ALL ON FUNCTION public.fn_scf_admin_course_breakdown(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_scf_admin_course_breakdown(date, date) TO authenticated, service_role;

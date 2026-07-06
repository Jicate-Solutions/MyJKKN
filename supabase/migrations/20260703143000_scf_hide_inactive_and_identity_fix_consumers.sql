-- ============================================================================
-- SCF faculty-identity fix — round 2 (Director interview 2026-07-03)
--
--  Follows 20260703131000 (admin summary keyed by faculty_id) + 20260703131500
--  (data backfill). Two decisions from the interview:
--
--   Q1  Hide switched-off (is_active=false) faculty from the admin "needs support"
--       ranking. Today this affects exactly ONE account: akdhd@jkkn.ac.in
--       (deactivated placeholder, keyboard-mashed name) which held 5 real student
--       responses on a real course. The responses stay in the table; they are just
--       no longer shown under a dead account nobody can coach. Any future
--       retired/removed staff are hidden automatically.
--
--   Q2  Make the two smaller screens permanent too, so they never show a personal
--       Gmail again — for old OR new feedback (the timetables still carry ~2,536
--       personal emails that feed new submissions):
--         (a) fn_scf_faculty_summary  — a teacher's OWN feedback page. Was matched
--             by lower(faculty_email)=profile.email, which returns NOTHING when the
--             teacher's rows carry a personal email but their profile is
--             institutional. Now resolves the caller's staff id and matches by
--             faculty_id (with an email fallback), so a teacher always sees their
--             own feedback regardless of which email was recorded.
--         (b) fn_scf_escalation_followups — the principal's follow-up page. Was
--             grouping + displaying raw faculty_email. Now resolves the institutional
--             email via faculty_id (same resolver as the admin summary) and groups on
--             it, so escalations for the same teacher merge and display institutional.
--
--  NOT in scope (separate Director decision): cleaning the 2,536 timetable blobs /
--  changing the write path fn_scf_submit_feedback so NEW session_feedback rows store
--  the institutional email at source.
--
--  Every function preserves its exact RETURNS TABLE shape, SECURITY DEFINER,
--  search_path, authz guard, k>=3 floor / low / lift logic, and anon lockdown.
--  Idempotent (CREATE OR REPLACE). Applied to prod via Management API after
--  rolled-back rehearsal; recorded here so the repo matches prod.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Q1 — admin faculty summary: exclude is_active=false faculty from the ranking
-- ---------------------------------------------------------------------------
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
  WITH fb AS (
    SELECT f.institution_id AS inst_id,
           f.attendance_date, f.period_id, f.course_code,
           f.understood,
           COALESCE(
             (SELECT s.institution_email FROM public.staff s
               WHERE s.id = f.faculty_id
                 AND NULLIF(btrim(s.institution_email), '') IS NOT NULL
               LIMIT 1),
             (SELECT s.institution_email FROM public.staff s
               WHERE lower(s.email) = lower(f.faculty_email)
                 AND NULLIF(btrim(s.institution_email), '') IS NOT NULL
               LIMIT 1),
             f.faculty_email
           ) AS resolved_email
    FROM public.session_feedback f
    WHERE (v_super OR f.institution_id = v_inst)
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
           count(*)::bigint           AS s_responses,
           avg(fb.understood)::numeric AS s_avg
    FROM fb
    GROUP BY fb.inst_id, fb.resolved_email, fb.attendance_date, fb.period_id, fb.course_code
  )
  SELECT ps.inst_id AS institution_id,
         i.name::text AS institution_name,
         ps.resolved_email AS faculty_email,
         count(*)::bigint                                                   AS sessions,
         sum(ps.s_responses)::bigint                                        AS responses,
         round((sum(ps.s_avg * ps.s_responses) FILTER (WHERE ps.s_responses >= 3)
              / NULLIF(sum(ps.s_responses) FILTER (WHERE ps.s_responses >= 3), 0))::numeric, 2) AS avg_understood,
         count(*) FILTER (WHERE ps.s_responses >= 3 AND ps.s_avg < 3)::bigint AS low_sessions
  FROM per_session ps
  LEFT JOIN public.institutions i ON i.id = ps.inst_id
  GROUP BY ps.inst_id, i.name, ps.resolved_email
  ORDER BY avg_understood ASC NULLS LAST;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_admin_faculty_summary(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_admin_faculty_summary(date, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- Q2a — teacher self-view: match own feedback by faculty_id (email fallback)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_faculty_summary(p_from date, p_to date)
 RETURNS TABLE(attendance_date date, period_id text, course_code text, course_name text, responses bigint, avg_understood numeric, low_understanding bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_email text; v_staff_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_faculty_summary: not authenticated'; END IF;
  SELECT p.email INTO v_email FROM public.profiles p WHERE p.id = auth.uid();
  IF v_email IS NULL THEN RETURN; END IF;
  -- Resolve the caller's stable staff id (by institutional OR personal email) so
  -- their feedback is found even when rows were recorded under a personal email.
  SELECT s.id INTO v_staff_id FROM public.staff s
    WHERE lower(s.institution_email) = lower(v_email) OR lower(s.email) = lower(v_email)
    LIMIT 1;

  RETURN QUERY
  SELECT f.attendance_date, f.period_id, f.course_code, f.course_name,
         count(*)::bigint AS responses,
         round(avg(f.understood)::numeric, 2) AS avg_understood,
         count(*) FILTER (WHERE f.understood <= 2)::bigint AS low_understanding
  FROM public.session_feedback f
  WHERE (
          (v_staff_id IS NOT NULL AND f.faculty_id = v_staff_id)
          OR lower(f.faculty_email) = lower(v_email)
        )
    AND f.attendance_date BETWEEN p_from AND p_to
  GROUP BY f.attendance_date, f.period_id, f.course_code, f.course_name
  ORDER BY f.attendance_date DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_faculty_summary(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_faculty_summary(date, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- Q2b — principal escalation follow-ups: resolve + group by institutional email
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_escalation_followups(p_from date, p_to date)
 RETURNS TABLE(attendance_date date, period_id text, course_code text, course_name text, faculty_email text, responses bigint, avg_understood numeric, low_understanding bigint, next_attendance_date date, next_responses bigint, next_avg_understood numeric, lift numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_escalation_followups: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator']) OR p.is_super_admin = true)
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_escalation_followups: not authorized';
  END IF;

  RETURN QUERY
  WITH
  -- Resolve each feedback row's institutional display email via the stable
  -- faculty_id (then staff.email match), same resolver as the admin summary, so a
  -- teacher's escalations merge and display institutionally, never a personal email.
  resolved AS (
    SELECT f.institution_id, f.attendance_date, f.period_id,
           f.course_code, f.course_name, f.understood,
           COALESCE(
             (SELECT s.institution_email FROM public.staff s
               WHERE s.id = f.faculty_id
                 AND NULLIF(btrim(s.institution_email), '') IS NOT NULL
               LIMIT 1),
             (SELECT s.institution_email FROM public.staff s
               WHERE lower(s.email) = lower(f.faculty_email)
                 AND NULLIF(btrim(s.institution_email), '') IS NOT NULL
               LIMIT 1),
             f.faculty_email
           ) AS resolved_email
    FROM public.session_feedback f
    WHERE (v_super OR f.institution_id = v_inst)
  ),
  sessions AS (
    SELECT r.institution_id,
           r.attendance_date AS sess_date,
           r.period_id       AS sess_period,
           r.course_code     AS sess_course_code,
           r.course_name     AS sess_course_name,
           lower(r.resolved_email) AS sess_faculty,
           r.resolved_email  AS sess_faculty_email,
           count(*)::bigint   AS sess_responses,
           round(avg(r.understood)::numeric, 2) AS sess_avg,
           count(*) FILTER (WHERE r.understood <= 2)::bigint AS sess_low
    FROM resolved r
    GROUP BY r.institution_id, r.attendance_date, r.period_id,
             r.course_code, r.course_name, lower(r.resolved_email), r.resolved_email
  ),
  escalated AS (
    SELECT * FROM sessions s
    WHERE s.sess_date BETWEEN p_from AND p_to
      AND s.sess_responses >= 3
      AND s.sess_avg < 3
  ),
  paired AS (
    SELECT e.*,
           n.sess_date      AS nxt_date,
           n.sess_responses AS nxt_responses,
           n.sess_avg       AS nxt_avg
    FROM escalated e
    LEFT JOIN LATERAL (
      SELECT s2.sess_date, s2.sess_responses, s2.sess_avg
      FROM sessions s2
      WHERE s2.institution_id = e.institution_id
        AND s2.sess_faculty   = e.sess_faculty
        AND s2.sess_course_code IS NOT DISTINCT FROM e.sess_course_code
        AND s2.sess_date > e.sess_date
      ORDER BY s2.sess_date ASC
      LIMIT 1
    ) n ON true
  )
  SELECT p.sess_date         AS attendance_date,
         p.sess_period        AS period_id,
         p.sess_course_code   AS course_code,
         p.sess_course_name   AS course_name,
         p.sess_faculty_email AS faculty_email,
         p.sess_responses     AS responses,
         p.sess_avg           AS avg_understood,
         p.sess_low           AS low_understanding,
         p.nxt_date           AS next_attendance_date,
         p.nxt_responses      AS next_responses,
         p.nxt_avg            AS next_avg_understood,
         CASE WHEN p.nxt_avg IS NULL THEN NULL
              ELSE round((p.nxt_avg - p.sess_avg)::numeric, 2) END AS lift
  FROM paired p
  ORDER BY p.sess_avg ASC, p.sess_date DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_escalation_followups(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_escalation_followups(date, date) TO authenticated;

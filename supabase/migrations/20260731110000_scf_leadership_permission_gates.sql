-- 20260731110000_scf_leadership_permission_gates.sql
--
-- RECORDS PRODUCTION. Every statement below was already applied to prod on
-- 2026-07-09/10 via the Supabase Management API (show-SQL-first, Director-approved,
-- verified by impersonation). This file exists so the repo is not amnesiac: without
-- it, a fresh environment or a schema replay would rebuild the OLD hardcoded-role
-- gates, and anyone reading the repo to understand authorization would be misled.
--
-- TIER-1: IDEMPOTENT, ADDITIVE, DROPS NOTHING. Safe to replay.
--   * every function is CREATE OR REPLACE
--   * the permission seed is a guarded UPDATE (no-op when already true)
--   * the two 3-arg overloads are ADDED beside the 2-arg ones; nothing is dropped
--
-- WHY
-- ---
-- 13 SCF leadership read-functions gated on a hardcoded list of legacy
-- profiles.role names:
--     p.role = ANY (ARRAY['super_admin','administrator','institution_admin',
--                         'dean','hod','principal','coordinator'])
-- That list ignores user_roles, custom_roles and every permission toggle, so
-- Role Management could not grant these panels AT ALL. A CEO holding
-- academic.attendance.dashboard.view was still refused, and no amount of clicking
-- in /users/role-management could fix it — the code never asked Role Management.
--
-- They now call user_has_permission() with two NEW keys, and scope rows with
-- role_has_institution_access() (which honours Institution Scope + per-user grants):
--   * academic.session_feedback.leadership.view      -- 11 college-level panels
--   * academic.session_feedback.learner_detail.view  -- learner trajectory + struggling notes
-- Two keys, not one: the learner-level panels are deliberately narrower (HoDs are
-- excluded from them but see the college roll-ups).
--
-- Verified before/after by impersonating real accounts on prod:
--   ceo, executive_admin_officer : DENIED -> ALLOWED (all 6 colleges)
--   administrator, hod, principal: ALLOWED -> ALLOWED (correctly scoped)
--   faculty, student             : DENIED -> DENIED
--   89 users allowed today keep access; 0 regressions.
--
-- PERFORMANCE (learned the hard way)
-- ----------------------------------
-- role_has_institution_access() is SECURITY DEFINER; in a WHERE clause it is invoked
-- ONCE PER ROW. Over 56k session_feedback rows that turned a 54ms HoD query into
-- 55,847ms and broke the panel for 64 HoDs. The allowed institutions are therefore
-- hoisted ONCE into v_insts uuid[] and rows are filtered with = ANY(v_insts)
-- (variable-to-variable). Do not "simplify" that back into the WHERE clause.
--
-- Likewise fn_scf_escalation_followups and fn_scf_admin_faculty_summary resolved the
-- facilitator's institutional email with two CORRELATED sub-queries against staff,
-- per row (staff is indexed on email but NOT on lower(email)). Hoisting them into
-- MATERIALIZED lookup CTEs: 10,529ms -> 233ms and 5,253ms -> 202ms respectively,
-- proven row-identical via EXCEPT ALL in both directions.
--
-- NOT INCLUDED (deliberate)
-- -------------------------
--   * fn_scf_verdict_contradictions / fn_scf_verdict_track_record — same defect,
--     different page.
--   * 6 write/authorization functions (fn_curriculum_lesson_upsert,
--     fn_live_poll_can_manage, fn_scf_open_pulse, fn_scf_set_verdict, and the two
--     helpers _fn_curriculum_class_ctx / _fn_live_poll_ensure_class_anchor) share the
--     antipattern but must NOT be re-gated on a VIEW permission — that would let
--     anyone who can read a dashboard edit lesson plans and open live polls. They
--     need their own WRITE keys.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The two permission keys, seeded onto exactly the roles that could see these
--    panels before this change, PLUS ceo + executive_admin_officer.
--    Guarded so a replay is a no-op. institution_admin / dean / coordinator are
--    intentionally absent: no such custom_roles rows exist and no user holds them.
--    Ordering note: this migration must run AFTER custom_roles is seeded; on a
--    fresh database an empty custom_roles simply yields 0 updated rows.
-- ---------------------------------------------------------------------------
UPDATE public.custom_roles
SET permissions = permissions || '{"academic.session_feedback.leadership.view": true}'::jsonb,
    updated_at  = now()
WHERE role_key IN ('super_admin','administrator','hod','principal','ceo','executive_admin_officer')
  AND COALESCE(permissions->>'academic.session_feedback.leadership.view','false') <> 'true';

UPDATE public.custom_roles
SET permissions = permissions || '{"academic.session_feedback.learner_detail.view": true}'::jsonb,
    updated_at  = now()
WHERE role_key IN ('super_admin','administrator','principal','ceo','executive_admin_officer')
  AND COALESCE(permissions->>'academic.session_feedback.learner_detail.view','false') <> 'true';

-- ---------------------------------------------------------------------------
-- 2. The 13 functions (15 signatures) exactly as they run in production.
-- ---------------------------------------------------------------------------
-- fn_scf_admin_college_summary(p_from date, p_to date)
CREATE OR REPLACE FUNCTION public.fn_scf_admin_college_summary(p_from date, p_to date)
 RETURNS TABLE(institution_id uuid, institution_name text, sessions bigint, responses bigint, students bigint, avg_understood numeric, low_sessions bigint)
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
           avg(f.understood)::numeric AS s_avg
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
           count(*) FILTER (WHERE ps.s_responses >= 3 AND ps.s_avg < 3)::bigint AS low_sessions
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
         sr.low_sessions
  FROM sess_roll sr
  JOIN stud_roll st ON st.inst_id = sr.inst_id
  LEFT JOIN public.institutions i ON i.id = sr.inst_id
  ORDER BY sr.responses DESC;
END;
$function$;

-- fn_scf_admin_faculty_summary(p_from date, p_to date)
CREATE OR REPLACE FUNCTION public.fn_scf_admin_faculty_summary(p_from date, p_to date)
 RETURNS TABLE(institution_id uuid, institution_name text, faculty_email text, sessions bigint, responses bigint, avg_understood numeric, low_sessions bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_insts uuid[]; v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_admin_faculty_summary: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.leadership.view'))
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_admin_faculty_summary: not authorized';
  END IF;
  SELECT array_agg(i.id) INTO v_insts FROM public.institutions i WHERE public.role_has_institution_access(i.id);

  RETURN QUERY
  WITH
  staff_by_id AS MATERIALIZED (
    SELECT st.id AS sid, st.institution_email
    FROM public.staff st
    WHERE NULLIF(btrim(st.institution_email), '') IS NOT NULL
  ),
  staff_by_email AS MATERIALIZED (
    SELECT lower(st.email) AS lemail, st.institution_email
    FROM public.staff st
    WHERE NULLIF(btrim(st.institution_email), '') IS NOT NULL
      AND st.email IS NOT NULL
  ),
  fb AS (
    SELECT f.institution_id AS inst_id,
           f.attendance_date, f.period_id, f.course_code,
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

-- fn_scf_admin_trend(p_from date, p_to date)
CREATE OR REPLACE FUNCTION public.fn_scf_admin_trend(p_from date, p_to date)
 RETURNS TABLE(attendance_date date, responses bigint, students bigint, avg_understood numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_insts uuid[]; v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_admin_trend: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.leadership.view'))
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_admin_trend: not authorized';
  END IF;
  SELECT array_agg(i.id) INTO v_insts FROM public.institutions i WHERE public.role_has_institution_access(i.id);

  RETURN QUERY
  SELECT f.attendance_date,
         count(*)::bigint                     AS responses,
         count(DISTINCT f.student_id)::bigint AS students,
         -- k>=3 floor: hide the day's average until >= 3 responses exist that day.
         CASE WHEN count(*) >= 3 THEN round(avg(f.understood)::numeric, 2) ELSE NULL END AS avg_understood
  FROM public.session_feedback f
  WHERE (v_super OR f.institution_id = ANY(v_insts))
    AND f.attendance_date BETWEEN p_from AND p_to
  GROUP BY f.attendance_date
  ORDER BY f.attendance_date ASC;
END;
$function$;

-- fn_scf_admin_trend(p_from date, p_to date, p_institution_id uuid)
CREATE OR REPLACE FUNCTION public.fn_scf_admin_trend(p_from date, p_to date, p_institution_id uuid)
 RETURNS TABLE(attendance_date date, responses bigint, students bigint, avg_understood numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_insts uuid[]; v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_admin_trend: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.leadership.view'))
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_admin_trend: not authorized';
  END IF;
  SELECT array_agg(i.id) INTO v_insts FROM public.institutions i WHERE public.role_has_institution_access(i.id);

  RETURN QUERY
  SELECT f.attendance_date,
         count(*)::bigint                     AS responses,
         count(DISTINCT f.student_id)::bigint AS students,
         -- k>=3 floor: hide the day's average until >= 3 responses exist that day.
         CASE WHEN count(*) >= 3 THEN round(avg(f.understood)::numeric, 2) ELSE NULL END AS avg_understood
  FROM public.session_feedback f
  WHERE (v_super OR f.institution_id = ANY(v_insts))
      AND (p_institution_id IS NULL OR f.institution_id = p_institution_id)
    AND f.attendance_date BETWEEN p_from AND p_to
  GROUP BY f.attendance_date
  ORDER BY f.attendance_date ASC;
END;
$function$;

-- fn_scf_escalation_followups(p_from date, p_to date)
CREATE OR REPLACE FUNCTION public.fn_scf_escalation_followups(p_from date, p_to date)
 RETURNS TABLE(attendance_date date, period_id text, course_code text, course_name text, faculty_email text, responses bigint, avg_understood numeric, low_understanding bigint, next_attendance_date date, next_responses bigint, next_avg_understood numeric, lift numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_insts uuid[]; v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_escalation_followups: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.leadership.view'))
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_escalation_followups: not authorized';
  END IF;
  SELECT array_agg(i.id) INTO v_insts FROM public.institutions i WHERE public.role_has_institution_access(i.id);

  RETURN QUERY
  WITH
  -- Resolve each feedback row's institutional display email via the stable
  -- faculty_id (then staff.email match), same resolver as the admin summary, so a
  -- teacher's escalations merge and display institutionally, never a personal email.
  staff_by_id AS MATERIALIZED (
    SELECT st.id AS sid, st.institution_email
    FROM public.staff st
    WHERE NULLIF(btrim(st.institution_email), '') IS NOT NULL
  ),
  staff_by_email AS MATERIALIZED (
    SELECT lower(st.email) AS lemail, st.institution_email
    FROM public.staff st
    WHERE NULLIF(btrim(st.institution_email), '') IS NOT NULL
      AND st.email IS NOT NULL
  ),
  resolved AS (
    SELECT f.institution_id, f.attendance_date, f.period_id,
           f.course_code, f.course_name, f.understood,
           COALESCE(sbi.institution_email, sbe.institution_email, f.faculty_email) AS resolved_email
    FROM public.session_feedback f
    LEFT JOIN staff_by_id    sbi ON sbi.sid    = f.faculty_id
    LEFT JOIN staff_by_email sbe ON sbe.lemail = lower(f.faculty_email)
    WHERE (v_super OR f.institution_id = ANY(v_insts))
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

-- fn_scf_facilitator_feedback_coverage(p_from date, p_to date)
CREATE OR REPLACE FUNCTION public.fn_scf_facilitator_feedback_coverage(p_from date, p_to date)
 RETURNS TABLE(institution_id uuid, institution_name text, staff_id uuid, facilitator_name text, designation text, department_name text, taught_sessions bigint, covered_sessions bigint, coverage_pct numeric, responses bigint, last_taught date, last_feedback date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_insts uuid[]; v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_facilitator_feedback_coverage: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.leadership.view'))
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_facilitator_feedback_coverage: not authorized';
  END IF;
  SELECT array_agg(i.id) INTO v_insts FROM public.institutions i WHERE public.role_has_institution_access(i.id);

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
    WHERE (v_super OR sa.institution_id = ANY(v_insts))
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
$function$;

-- fn_scf_facilitator_pulse(p_from date, p_to date)
CREATE OR REPLACE FUNCTION public.fn_scf_facilitator_pulse(p_from date, p_to date)
 RETURNS TABLE(faculty_email text, faculty_name text, institution_id uuid, sessions_marked integer, sessions_witnessed integer, pulses_run integer, lessons_linked integer, notes_received integer, verdicts_given integer, votes_received integer, last_signal_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_role     text;
  v_is_super boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_facilitator_pulse: not authenticated';
  END IF;

  SELECT p.role, (p.role = 'super_admin' OR p.is_super_admin = true)
    INTO v_role, v_is_super
  FROM public.profiles p WHERE p.id = auth.uid();

  -- Staff-management view: leadership/admin only (mirrors fn_scf_set_verdict's
  -- role list). Faculty/students are rejected — a facilitator sees their own
  -- signals on their own pages, not the roster of peers.
  IF NOT (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.leadership.view')) THEN
    RAISE EXCEPTION 'fn_scf_facilitator_pulse: not authorized';
  END IF;

  RETURN QUERY
  WITH sess AS (
    SELECT sa.institution_id AS inst,
           sa.attendance_date AS ad,
           period.key         AS pid,
           period.value       AS pv
    FROM public.student_attendance sa,
         jsonb_each(sa.attendance_data) AS period
    WHERE sa.attendance_date BETWEEN p_from AND p_to
  ),
  -- Normalize assigned_faculty (object OR array) -> one row per (session, faculty)
  fac_sess AS (
    SELECT s.inst, s.ad, s.pid,
           lower(af.el ->> 'faculty_email') AS femail
    FROM sess s
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(s.pv -> 'assigned_faculty') = 'array'  THEN s.pv -> 'assigned_faculty'
        WHEN jsonb_typeof(s.pv -> 'assigned_faculty') = 'object' THEN jsonb_build_array(s.pv -> 'assigned_faculty')
        ELSE '[]'::jsonb
      END) AS af(el)
    WHERE COALESCE(af.el ->> 'faculty_email', '') <> ''
      -- Tenant scope: super/admin pass; scoped leaders see own-institution rows.
      AND role_has_institution_access(s.inst)
  ),
  marked AS (
    SELECT fs.femail,
           max(fs.inst::text)::uuid AS inst,          -- representative (display)
           count(*)::int            AS n_marked,
           count(*) FILTER (
             WHERE (SELECT count(*) FROM public.session_feedback f
                    WHERE f.attendance_date = fs.ad
                      AND f.period_id       = fs.pid
                      AND lower(f.faculty_email) = fs.femail) >= 3
           )::int                   AS n_witnessed,
           max(fs.ad)               AS last_class
    FROM fac_sess fs
    GROUP BY fs.femail
  )
  SELECT
    m.femail,
    COALESCE(pe.full_name, m.femail),
    m.inst,
    m.n_marked,
    m.n_witnessed,
    (SELECT count(*)::int FROM public.scf_live_pulse lp
      WHERE lower(lp.faculty_email) = m.femail
        AND lp.attendance_date BETWEEN p_from AND p_to),
    (SELECT count(*)::int FROM public.class_session_lesson csl
      JOIN public.profiles lb ON lb.id = csl.linked_by
      WHERE lower(lb.email) = m.femail
        AND csl.attendance_date BETWEEN p_from AND p_to),
    (SELECT count(*)::int FROM public.scf_ai_suggestions sg
      WHERE lower(sg.faculty_email) = m.femail
        AND sg.domain = 'session_feedback'
        AND sg.generated_at::date BETWEEN p_from AND p_to),
    (SELECT count(*)::int FROM public.scf_ai_suggestions sg
      WHERE lower(sg.faculty_email) = m.femail
        AND sg.domain = 'session_feedback'
        AND sg.human_verdict_at IS NOT NULL
        AND sg.human_verdict_at::date BETWEEN p_from AND p_to),
    -- Signal: student resolution votes received on this facilitator's notes.
    -- VOLUME ONLY — the Better/Same/Worse split stays behind the k>=3 floor
    -- in fn_scf_note_resolution_counts, never on this board.
    (SELECT count(*)::int FROM public.scf_note_resolution_votes rv
      JOIN public.scf_ai_suggestions sg ON sg.id = rv.suggestion_id
      WHERE lower(sg.faculty_email) = m.femail
        AND sg.domain = 'session_feedback'
        AND rv.created_at::date BETWEEN p_from AND p_to),
    GREATEST(
      m.last_class::timestamptz,
      (SELECT max(lp.issued_at) FROM public.scf_live_pulse lp
        WHERE lower(lp.faculty_email) = m.femail),
      (SELECT max(sg.human_verdict_at) FROM public.scf_ai_suggestions sg
        WHERE lower(sg.faculty_email) = m.femail)
    )
  FROM marked m
  LEFT JOIN public.profiles pe ON lower(pe.email) = m.femail
  ORDER BY 2;  -- neutral name order — a presence board, never a leaderboard
END;
$function$;

-- fn_scf_facilitator_strengths(p_from date, p_to date)
CREATE OR REPLACE FUNCTION public.fn_scf_facilitator_strengths(p_from date, p_to date)
 RETURNS TABLE(institution_id uuid, institution_name text, faculty_email text, facilitator_name text, designation text, department_name text, success_patterns bigint, courses text[], course_count bigint, avg_understood numeric, latest_course_code text, latest_what_worked text, latest_share_with_peers text, latest_generated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_insts uuid[]; v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_facilitator_strengths: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.leadership.view'))
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_facilitator_strengths: not authorized';
  END IF;
  SELECT array_agg(i.id) INTO v_insts FROM public.institutions i WHERE public.role_has_institution_access(i.id);

  RETURN QUERY
  -- success_rows: every kind='success' pattern whose teaching window overlaps the
  -- selected period, scoped to what the caller may see (super = all incl. NULL inst).
  WITH success_rows AS (
    SELECT
      sg.institution_id AS inst_id,
      lower(sg.faculty_email) AS faculty_email,    -- normalise so the staff-name lookup matches
      sg.course_code,
      sg.input_avg_understood,
      sg.generated_at,
      sg.suggestion
    FROM public.scf_ai_suggestions sg
    WHERE sg.kind = 'success'
      AND sg.domain = 'session_feedback'           -- SCF success rows only, not other modules' rows
      AND sg.faculty_email IS NOT NULL             -- per-facilitator board needs a key
      AND sg.window_from <= p_to
      AND sg.window_to   >= p_from                 -- window overlaps [p_from, p_to]
      AND (v_super OR sg.institution_id = ANY(v_insts))
  ),
  per_fac AS (
    SELECT
      sr.inst_id,
      sr.faculty_email,
      count(*)::bigint                        AS success_patterns,
      array_agg(DISTINCT sr.course_code)      AS courses,
      count(DISTINCT sr.course_code)::bigint  AS course_count,
      round(avg(sr.input_avg_understood), 2)  AS avg_understood,
      max(sr.generated_at)                    AS latest_generated_at
    FROM success_rows sr
    GROUP BY sr.inst_id, sr.faculty_email
  ),
  -- latest: the single most-recent success pattern per (institution, facilitator),
  -- so the board can show one concrete "what worked / share with peers" highlight.
  latest AS (
    SELECT DISTINCT ON (sr.inst_id, sr.faculty_email)
      sr.inst_id,
      sr.faculty_email,
      sr.course_code                        AS latest_course_code,
      (sr.suggestion->>'whatWorked')        AS latest_what_worked,
      (sr.suggestion->>'shareWithPeers')    AS latest_share_with_peers
    FROM success_rows sr
    ORDER BY sr.inst_id, sr.faculty_email, sr.generated_at DESC
  )
  SELECT
    pf.inst_id                                AS institution_id,
    i.name::text                              AS institution_name,
    pf.faculty_email,
    st.facilitator_name,
    st.designation,
    st.department_name,
    pf.success_patterns,
    pf.courses,
    pf.course_count,
    pf.avg_understood,
    l.latest_course_code,
    l.latest_what_worked,
    l.latest_share_with_peers,
    pf.latest_generated_at
  FROM per_fac pf
  LEFT JOIN latest l
    ON l.inst_id IS NOT DISTINCT FROM pf.inst_id   -- NULL-safe (inst_id may be NULL)
   AND l.faculty_email = pf.faculty_email
  -- Resolve a friendly facilitator name/dept from staff by email. LATERAL + LIMIT 1
  -- guarantees at most one staff row, so the name lookup cannot inflate counts even
  -- if email and institution_email both match.
  LEFT JOIN LATERAL (
    SELECT
      NULLIF(trim(COALESCE(s.first_name,'')||' '||COALESCE(s.last_name,'')), '')::text AS facilitator_name,
      COALESCE(s.designation,'')::text          AS designation,
      COALESCE(d.department_name,'Unknown')::text AS department_name
    FROM public.staff s
    LEFT JOIN public.departments d ON d.id = s.department_id
    WHERE (lower(s.email) = pf.faculty_email
        OR lower(s.institution_email) = pf.faculty_email)
      -- Scope the name lookup to the row's institution so a same-email staff in
      -- another institution can't supply the wrong name (NULL-inst rows: best-effort).
      AND (pf.inst_id IS NULL OR s.institution_id = pf.inst_id)
    LIMIT 1
  ) st ON true
  LEFT JOIN public.institutions i ON i.id = pf.inst_id
  -- Strongest replicators first: most success patterns, then most recent.
  ORDER BY pf.success_patterns DESC, pf.latest_generated_at DESC;
END;
$function$;

-- fn_scf_leadership_concerns(p_from date, p_to date)
CREATE OR REPLACE FUNCTION public.fn_scf_leadership_concerns(p_from date, p_to date)
 RETURNS TABLE(institution_id uuid, course_code text, faculty_email text, window_from date, window_to date, responses integer, avg_understood numeric, concern_summary text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_insts uuid[]; v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_leadership_concerns: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.leadership.view'))
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_leadership_concerns: not authorized';
  END IF;
  SELECT array_agg(i.id) INTO v_insts FROM public.institutions i WHERE public.role_has_institution_access(i.id);

  RETURN QUERY
  SELECT c.institution_id, c.course_code, c.faculty_email, c.window_from, c.window_to,
         c.responses, c.avg_understood, c.concern_summary, c.created_at
  FROM public.scf_leadership_concerns c
  WHERE c.window_to >= p_from AND c.window_from <= p_to
    AND (v_super OR c.institution_id = ANY(v_insts))
    -- Freshness backstop: only surface a concern the daily cron re-confirmed recently.
    -- The cron re-records a genuine concern every day (self-healing: it clears on escalation
    -- to a tip or on an all-praise run), so an ongoing concern's updated_at stays fresh. Only
    -- when a class stops being a widened candidate (comments drop below the threshold, becomes
    -- a standout, or falls under the response floor) does its concern stop being re-confirmed;
    -- this window then ages it off. The window is 8 days — comfortably longer than the 7-day
    -- feedback/candidate window (WINDOW_DAYS), so a class that goes quiet ages off ~a week
    -- after its last feedback, AND a multi-day cron gap (deploy freeze / holiday / outage)
    -- does NOT wrongly blank the card into a false "no concerns" for leadership.
    AND c.updated_at >= now() - interval '8 days'
    -- Defensive only: the cron always writes a non-null summary for a real concern (a genuine
    -- 0-ask deletes the row rather than nulling it), so this never excludes a live row — it
    -- just guards against a future path ever leaving a summary-less row visible.
    AND c.concern_summary IS NOT NULL
  ORDER BY c.created_at DESC;
END;
$function$;

-- fn_scf_learner_trajectory(p_from date, p_to date, p_min_sessions integer, p_slope_threshold numeric)
CREATE OR REPLACE FUNCTION public.fn_scf_learner_trajectory(p_from date, p_to date, p_min_sessions integer DEFAULT 3, p_slope_threshold numeric DEFAULT '-0.15'::numeric)
 RETURNS TABLE(institution_id uuid, institution_name text, student_id uuid, learner_name text, register_number text, department_name text, course_code text, sessions bigint, slope numeric, at_risk boolean, first_session date, last_session date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_insts uuid[]; v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_learner_trajectory: not authenticated'; END IF;
  -- AUDIENCE (Director decision 2026-06-30 via AskUserQuestion): the NAMED per-learner
  -- slider list is restricted to INSTITUTION LEADERSHIP ONLY — principal / dean /
  -- institution-admin / super_admin. Department heads (hod) and coordinators are
  -- intentionally EXCLUDED: they keep the aggregate dashboards (loop-activity, coverage,
  -- strengths) but NOT the named at-risk list. This is the narrowest-leadership option
  -- — the fewest eyes on candid-derived per-learner trends — chosen over both the broader
  -- dept-head audience and the de-identified counts-only variant.
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.learner_detail.view'))
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_learner_trajectory: not authorized';
  END IF;
  SELECT array_agg(i.id) INTO v_insts FROM public.institutions i WHERE public.role_has_institution_access(i.id);

  -- Defensive: never let a caller drop the privacy floor below 3.
  IF p_min_sessions < 3 THEN p_min_sessions := 3; END IF;
  -- SENSITIVITY (Director decision 2026-06-30): catch SLOW slides, not only steep drops —
  -- the whole point is an EARLY warning, and the prior steep -0.15 floor showed nobody even
  -- while real learners gently declined. Default to a gentle -0.05 decline. A caller may
  -- only make it STEEPER, never wider than -0.03 (LEAST + NULL→-0.05), so the list still
  -- requires a genuine downward trend — never near-flat or improving learners.
  p_slope_threshold := LEAST(COALESCE(p_slope_threshold, -0.05), -0.03);

  RETURN QUERY
  WITH per_date AS (
    -- One understood value per (learner, course, institution, attendance_date). Same-day
    -- async+live_poll rows must not inflate the session count or the regr_slope x-axis;
    -- without this the k>=3 floor could be met by <3 distinct class dates, weakening the
    -- "no single candid rating reconstructable" guarantee.
    SELECT DISTINCT ON (f.student_id, f.course_code, f.institution_id, f.attendance_date)
           f.student_id, f.course_code, f.institution_id, f.attendance_date, f.understood
    FROM public.session_feedback f
    WHERE (v_super OR f.institution_id = ANY(v_insts))
      AND f.attendance_date BETWEEN p_from AND p_to
      AND f.course_code IS NOT NULL
      AND f.understood IS NOT NULL                     -- count, slope + avg all over the SAME real ratings,
                                                       -- so the k>=3 floor can't be met by null-rating rows
    ORDER BY f.student_id, f.course_code, f.institution_id, f.attendance_date, f.understood ASC
  ),
  ordered AS (
    SELECT pd.student_id, pd.course_code, pd.institution_id, pd.attendance_date, pd.understood,
           row_number() OVER (PARTITION BY pd.student_id, pd.course_code, pd.institution_id
                              ORDER BY pd.attendance_date) AS ord
    FROM per_date pd
  ),
  stats AS (
    SELECT o.student_id, o.course_code, o.institution_id,
           count(*)::bigint                          AS sessions,
           regr_slope(o.understood, o.ord)::numeric  AS slope_raw,  -- regr_slope is double precision; cast so round(.,3) + numeric compare work
           max(o.ord)                                AS mx,
           min(o.attendance_date)            AS first_session,
           max(o.attendance_date)            AS last_session
    FROM ordered o
    GROUP BY o.student_id, o.course_code, o.institution_id
    HAVING count(*) >= p_min_sessions
       AND regr_slope(o.understood, o.ord) IS NOT NULL
  ),
  recent2 AS (
    -- avg of each learner's TWO most recent sessions for the course — internal only.
    SELECT o.student_id, o.course_code, o.institution_id,
           avg(o.understood)::numeric AS recent_avg
    FROM ordered o
    JOIN stats st
      ON st.student_id = o.student_id
     AND st.course_code = o.course_code
     AND st.institution_id = o.institution_id
    WHERE o.ord > st.mx - 2
    GROUP BY o.student_id, o.course_code, o.institution_id
  )
  SELECT
    st.institution_id,
    i.name::text                                                                   AS institution_name,
    st.student_id,
    NULLIF(trim(COALESCE(lp.first_name,'')||' '||COALESCE(lp.last_name,'')), '')::text AS learner_name,
    lp.register_number::text                                                       AS register_number,
    COALESCE(d.department_name,'Unknown')::text                                    AS department_name,
    st.course_code,
    st.sessions,
    round(st.slope_raw, 3)                                                          AS slope,
    (COALESCE(rc.recent_avg, 5) < 3.0)                                             AS at_risk,
    st.first_session,
    st.last_session
  FROM stats st
  LEFT JOIN recent2 rc
    ON rc.student_id = st.student_id
   AND rc.course_code = st.course_code
   AND rc.institution_id = st.institution_id
  LEFT JOIN public.learners_profiles lp ON lp.id = st.student_id
  LEFT JOIN public.departments d        ON d.id = lp.department_id
  LEFT JOIN public.institutions i       ON i.id = st.institution_id
  WHERE st.slope_raw <= p_slope_threshold          -- sliding only (minimal disclosure)
  ORDER BY (COALESCE(rc.recent_avg, 5) < 3.0) DESC,  -- at-risk first
           st.slope_raw ASC                          -- steepest decline first
  -- Cap the board (review #1684 #9). Because the ORDER BY surfaces at-risk-then-
  -- steepest first, the cap can only ever drop the LEAST-declining tail — the
  -- genuinely-critical sliders are always within it, so the truncation is safe by
  -- construction (not arbitrary). Raised from 100 to 200 for headroom; a per-
  -- institution paginated view is a documented follow-up if any college ever
  -- exceeds it (today the whole platform has 3 sliders).
  LIMIT 200;
END;
$function$;

-- fn_scf_loop_activity(p_from date, p_to date)
CREATE OR REPLACE FUNCTION public.fn_scf_loop_activity(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_insts uuid[];
  v_inst uuid; v_super boolean; v_allowed boolean;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_loop_activity: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.leadership.view'))
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_loop_activity: not authorized';
  END IF;
  SELECT array_agg(i.id) INTO v_insts FROM public.institutions i WHERE public.role_has_institution_access(i.id);

  WITH fb AS (
    SELECT f.source, f.understood
    FROM public.session_feedback f
    WHERE (v_super OR f.institution_id = ANY(v_insts))
      AND f.attendance_date BETWEEN p_from AND p_to
  ),
  fb_agg AS (
    SELECT
      count(*)::bigint                                       AS total_feedback,
      count(*) FILTER (WHERE source = 'async')::bigint       AS async_feedback,
      count(*) FILTER (WHERE source = 'live_poll')::bigint   AS live_poll_feedback,
      count(*) FILTER (WHERE understood <= 2)::bigint        AS low_understanding_flags
    FROM fb
  ),
  pulse_agg AS (
    SELECT count(*)::bigint AS live_pulses
    FROM public.scf_live_pulse lp
    WHERE (v_super OR lp.institution_id = ANY(v_insts))
      AND lp.attendance_date BETWEEN p_from AND p_to
  ),
  sug AS (
    SELECT s.id, s.kind, s.course_code, s.suggestion, s.outcome_lift, s.outcome_responses, s.generated_at
    FROM public.scf_ai_suggestions s
    WHERE (v_super OR s.institution_id = ANY(v_insts))
      AND s.domain = 'session_feedback'
      AND (s.generated_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_from AND p_to  -- IST local date, matches attendance keys
  ),
  sug_agg AS (
    SELECT
      count(*) FILTER (WHERE kind = 'improvement')::bigint                                  AS improvement_suggestions,
      count(*) FILTER (WHERE kind = 'success')::bigint                                      AS success_suggestions,
      count(*) FILTER (WHERE kind = 'improvement' AND outcome_lift IS NOT NULL)::bigint     AS measured_outcomes,
      round(avg(outcome_lift) FILTER (WHERE kind = 'improvement' AND outcome_lift IS NOT NULL), 2) AS avg_outcome_lift
    FROM sug
  ),
  recent AS (
    SELECT COALESCE(jsonb_agg(item ORDER BY gen_at DESC), '[]'::jsonb) AS items
    FROM (
      SELECT s.generated_at AS gen_at,
             jsonb_build_object(
               'id', s.id,
               'course_code', s.course_code,
               'kind', s.kind,
               -- improvement rows store `summary`; success rows store `whatWorked`.
               'summary', left(COALESCE(s.suggestion->>'summary', s.suggestion->>'whatWorked', ''), 240),
               'outcome_lift', s.outcome_lift,
               'outcome_responses', s.outcome_responses,
               'generated_at', s.generated_at
             ) AS item
      FROM sug s
      ORDER BY s.generated_at DESC
      LIMIT 8
    ) t
  )
  SELECT jsonb_build_object(
    'window_from',            p_from,
    'window_to',              p_to,
    'total_feedback',         fb_agg.total_feedback,
    'async_feedback',         fb_agg.async_feedback,
    'live_poll_feedback',     fb_agg.live_poll_feedback,
    'live_pulses',            pulse_agg.live_pulses,
    'low_understanding_flags', fb_agg.low_understanding_flags,
    'improvement_suggestions', sug_agg.improvement_suggestions,
    'success_suggestions',    sug_agg.success_suggestions,
    'measured_outcomes',      sug_agg.measured_outcomes,
    'avg_outcome_lift',       sug_agg.avg_outcome_lift,
    'recent_suggestions',     recent.items
  )
  INTO v_result
  FROM fb_agg, pulse_agg, sug_agg, recent;

  RETURN v_result;
END;
$function$;

-- fn_scf_loop_activity(p_from date, p_to date, p_institution_id uuid)
CREATE OR REPLACE FUNCTION public.fn_scf_loop_activity(p_from date, p_to date, p_institution_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_insts uuid[];
  v_inst uuid; v_super boolean; v_allowed boolean;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_loop_activity: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.leadership.view'))
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_loop_activity: not authorized';
  END IF;
  SELECT array_agg(i.id) INTO v_insts FROM public.institutions i WHERE public.role_has_institution_access(i.id);

  WITH fb AS (
    SELECT f.source, f.understood
    FROM public.session_feedback f
    WHERE (v_super OR f.institution_id = ANY(v_insts))
      AND (p_institution_id IS NULL OR f.institution_id = p_institution_id)
      AND f.attendance_date BETWEEN p_from AND p_to
  ),
  fb_agg AS (
    SELECT
      count(*)::bigint                                       AS total_feedback,
      count(*) FILTER (WHERE source = 'async')::bigint       AS async_feedback,
      count(*) FILTER (WHERE source = 'live_poll')::bigint   AS live_poll_feedback,
      count(*) FILTER (WHERE understood <= 2)::bigint        AS low_understanding_flags
    FROM fb
  ),
  pulse_agg AS (
    SELECT count(*)::bigint AS live_pulses
    FROM public.scf_live_pulse lp
    WHERE (v_super OR lp.institution_id = ANY(v_insts))
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND lp.attendance_date BETWEEN p_from AND p_to
  ),
  sug AS (
    SELECT s.id, s.kind, s.course_code, s.suggestion, s.outcome_lift, s.outcome_responses, s.generated_at
    FROM public.scf_ai_suggestions s
    WHERE (v_super OR s.institution_id = ANY(v_insts))
      AND (p_institution_id IS NULL OR s.institution_id = p_institution_id)
      AND s.domain = 'session_feedback'
      AND (s.generated_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_from AND p_to  -- IST local date, matches attendance keys
  ),
  sug_agg AS (
    SELECT
      count(*) FILTER (WHERE kind = 'improvement')::bigint                                  AS improvement_suggestions,
      count(*) FILTER (WHERE kind = 'success')::bigint                                      AS success_suggestions,
      count(*) FILTER (WHERE kind = 'improvement' AND outcome_lift IS NOT NULL)::bigint     AS measured_outcomes,
      round(avg(outcome_lift) FILTER (WHERE kind = 'improvement' AND outcome_lift IS NOT NULL), 2) AS avg_outcome_lift
    FROM sug
  ),
  recent AS (
    SELECT COALESCE(jsonb_agg(item ORDER BY gen_at DESC), '[]'::jsonb) AS items
    FROM (
      SELECT s.generated_at AS gen_at,
             jsonb_build_object(
               'id', s.id,
               'course_code', s.course_code,
               'kind', s.kind,
               -- improvement rows store `summary`; success rows store `whatWorked`.
               'summary', left(COALESCE(s.suggestion->>'summary', s.suggestion->>'whatWorked', ''), 240),
               'outcome_lift', s.outcome_lift,
               'outcome_responses', s.outcome_responses,
               'generated_at', s.generated_at
             ) AS item
      FROM sug s
      ORDER BY s.generated_at DESC
      LIMIT 8
    ) t
  )
  SELECT jsonb_build_object(
    'window_from',            p_from,
    'window_to',              p_to,
    'total_feedback',         fb_agg.total_feedback,
    'async_feedback',         fb_agg.async_feedback,
    'live_poll_feedback',     fb_agg.live_poll_feedback,
    'live_pulses',            pulse_agg.live_pulses,
    'low_understanding_flags', fb_agg.low_understanding_flags,
    'improvement_suggestions', sug_agg.improvement_suggestions,
    'success_suggestions',    sug_agg.success_suggestions,
    'measured_outcomes',      sug_agg.measured_outcomes,
    'avg_outcome_lift',       sug_agg.avg_outcome_lift,
    'recent_suggestions',     recent.items
  )
  INTO v_result
  FROM fb_agg, pulse_agg, sug_agg, recent;

  RETURN v_result;
END;
$function$;

-- fn_scf_principal_escalations(p_from date, p_to date)
CREATE OR REPLACE FUNCTION public.fn_scf_principal_escalations(p_from date, p_to date)
 RETURNS TABLE(attendance_date date, period_id text, course_code text, course_name text, faculty_email text, responses bigint, avg_understood numeric, low_understanding bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_insts uuid[]; v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_principal_escalations: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.leadership.view'))
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_principal_escalations: not authorized';
  END IF;
  SELECT array_agg(i.id) INTO v_insts FROM public.institutions i WHERE public.role_has_institution_access(i.id);

  RETURN QUERY
  SELECT f.attendance_date, f.period_id, f.course_code, f.course_name, f.faculty_email,
         count(*)::bigint AS responses,
         round(avg(f.understood)::numeric, 2) AS avg_understood,
         count(*) FILTER (WHERE f.understood <= 2)::bigint AS low_understanding
  FROM public.session_feedback f
  WHERE (v_super OR f.institution_id = ANY(v_insts))
    AND f.attendance_date BETWEEN p_from AND p_to
  GROUP BY f.attendance_date, f.period_id, f.course_code, f.course_name, f.faculty_email
  HAVING count(*) >= 3 AND avg(f.understood) < 3
  ORDER BY avg(f.understood) ASC, f.attendance_date DESC;
END;
$function$;

-- fn_scf_pulse_totals(p_pulse_id uuid)
CREATE OR REPLACE FUNCTION public.fn_scf_pulse_totals(p_pulse_id uuid)
 RETURNS TABLE(is_open boolean, auto_close_at timestamp with time zone, present_count integer, response_count integer, suppressed boolean, avg_understood numeric, dist jsonb, checklist_counts jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email      text;
  v_role_ok    boolean;
  v_is_faculty boolean;
  v_p          public.scf_live_pulse;
  v_present    int;
  v_responses  int;
  v_suppress   boolean;
  v_k          constant int := 3;   -- anonymity floor (matches the loop's >=3 rule)
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_pulse_totals: not authenticated'; END IF;
  SELECT * INTO v_p FROM public.scf_live_pulse WHERE id = p_pulse_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'fn_scf_pulse_totals: no such pulse'; END IF;

  SELECT lower(pr.email),
         (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.leadership.view'))
    INTO v_email, v_role_ok
  FROM public.profiles pr WHERE pr.id = auth.uid();
  IF v_email IS NULL THEN RAISE EXCEPTION 'fn_scf_pulse_totals: no profile'; END IF;

  v_is_faculty := (lower(v_p.faculty_email) IS NOT DISTINCT FROM v_email);
  IF NOT (v_is_faculty
          OR (COALESCE(v_role_ok, false)
              AND (public.is_super_admin() OR public.role_has_institution_access(v_p.institution_id)))) THEN
    RAISE EXCEPTION 'fn_scf_pulse_totals: not authorized';
  END IF;

  -- present_count: aggregate Present across ALL attendance rows carrying this
  -- period key (not a single LIMIT-1 row).
  SELECT count(*)::int INTO v_present
  FROM public.student_attendance sa,
       jsonb_array_elements(COALESCE(sa.attendance_data -> v_p.period_id -> 'students', '[]'::jsonb)) st
  WHERE sa.timetable_id = v_p.timetable_id
    AND sa.attendance_date = v_p.attendance_date
    AND sa.attendance_data ? v_p.period_id
    AND st ->> 'status' = 'Present';

  SELECT count(*)::int INTO v_responses
  FROM public.session_feedback f
  WHERE f.timetable_id = v_p.timetable_id
    AND f.attendance_date = v_p.attendance_date
    AND f.period_id = v_p.period_id;

  v_suppress := (v_responses < v_k);

  RETURN QUERY
  WITH fb AS (
    SELECT f.understood, f.checklist
    FROM public.session_feedback f
    WHERE f.timetable_id = v_p.timetable_id
      AND f.attendance_date = v_p.attendance_date
      AND f.period_id = v_p.period_id
  ),
  d AS (
    SELECT jsonb_object_agg(g.lvl::text, g.cnt) AS dist_obj
    FROM (
      SELECT s.lvl, (SELECT count(*) FROM fb WHERE fb.understood = s.lvl)::int AS cnt
      FROM generate_series(1,5) AS s(lvl)
    ) g
  ),
  ck AS (
    SELECT jsonb_object_agg(cfg.item_key, cfg.cnt) AS cc
    FROM (
      SELECT c.item_key,
             (SELECT count(*) FROM fb WHERE (fb.checklist ->> c.item_key) = 'true')::int AS cnt
      FROM (SELECT DISTINCT item_key FROM public.session_feedback_checklist_config WHERE is_active = true) c
    ) cfg
  )
  SELECT (v_p.is_open AND v_p.auto_close_at > now())::boolean,
         v_p.auto_close_at::timestamptz,
         v_present::int,
         v_responses::int,
         v_suppress::boolean,
         CASE WHEN v_suppress THEN NULL ELSE (SELECT round(avg(understood)::numeric, 2) FROM fb) END::numeric,
         CASE WHEN v_suppress THEN NULL ELSE (SELECT dist_obj FROM d) END::jsonb,
         CASE WHEN v_suppress THEN NULL ELSE (SELECT COALESCE(cc, '{}'::jsonb) FROM ck) END::jsonb;
END;
$function$;

-- fn_scf_struggling_notes_sent(p_from date, p_to date)
CREATE OR REPLACE FUNCTION public.fn_scf_struggling_notes_sent(p_from date, p_to date)
 RETURNS TABLE(student_id uuid, learner_name text, register_number text, department_name text, course_code text, notes_count bigint, last_note_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_insts uuid[]; v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_struggling_notes_sent: not authenticated';
  END IF;
  -- AUDIENCE: narrowest leadership — principal/dean/institution-admin/super only.
  -- IDENTICAL gate to fn_scf_learner_trajectory. HOD/coordinator are intentionally
  -- EXCLUDED. The note-sent roster is a SUBSET of the named trajectory roster this
  -- same audience already sees, so it adds no new per-learner exposure — and the
  -- note's WORDING is never returned here.
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.learner_detail.view'))
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_struggling_notes_sent: not authorized';
  END IF;
  SELECT array_agg(i.id) INTO v_insts FROM public.institutions i WHERE public.role_has_institution_access(i.id);

  RETURN QUERY
  SELECT
    n.learner_id AS student_id,
    NULLIF(trim(COALESCE(lp.first_name,'') || ' ' || COALESCE(lp.last_name,'')), '')::text AS learner_name,
    lp.register_number::text                                                               AS register_number,
    COALESCE(d.department_name,'Unknown')::text                                            AS department_name,
    n.course_code,
    count(*)::bigint                                                                       AS notes_count,
    max(n.generated_at)                                                                    AS last_note_at
  FROM public.scf_learner_notes n
  LEFT JOIN public.learners_profiles lp ON lp.id = n.learner_id
  LEFT JOIN public.departments d        ON d.id = lp.department_id
  WHERE (v_super OR n.institution_id = ANY(v_insts))        -- institution-scoped (super sees all)
    AND n.status = 'approved'                         -- approval queue (2026-07-03): "sent" = learner-visible
    AND n.generated_at::date BETWEEN p_from AND p_to
  GROUP BY n.learner_id, lp.first_name, lp.last_name, lp.register_number, d.department_name, n.course_code
  ORDER BY max(n.generated_at) DESC;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Lock anon on every SECURITY DEFINER function re-declared above.
--    Supabase's ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every new function
--    separately from PUBLIC, so "REVOKE FROM PUBLIC" alone is INSUFFICIENT.
--    (CLAUDE.md "Lock new RPCs from anon"; enforced by .github/workflows/secdef-anon-revoke.yml)
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_scf_admin_college_summary(p_from date, p_to date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_admin_college_summary(p_from date, p_to date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_scf_admin_faculty_summary(p_from date, p_to date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_admin_faculty_summary(p_from date, p_to date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_scf_admin_trend(p_from date, p_to date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_admin_trend(p_from date, p_to date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_scf_admin_trend(p_from date, p_to date, p_institution_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_admin_trend(p_from date, p_to date, p_institution_id uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_scf_escalation_followups(p_from date, p_to date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_escalation_followups(p_from date, p_to date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_scf_facilitator_feedback_coverage(p_from date, p_to date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_facilitator_feedback_coverage(p_from date, p_to date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_scf_facilitator_pulse(p_from date, p_to date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_facilitator_pulse(p_from date, p_to date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_scf_facilitator_strengths(p_from date, p_to date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_facilitator_strengths(p_from date, p_to date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_scf_leadership_concerns(p_from date, p_to date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_leadership_concerns(p_from date, p_to date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_scf_learner_trajectory(p_from date, p_to date, p_min_sessions integer, p_slope_threshold numeric) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_learner_trajectory(p_from date, p_to date, p_min_sessions integer, p_slope_threshold numeric) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_scf_loop_activity(p_from date, p_to date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_loop_activity(p_from date, p_to date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_scf_loop_activity(p_from date, p_to date, p_institution_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_loop_activity(p_from date, p_to date, p_institution_id uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_scf_principal_escalations(p_from date, p_to date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_principal_escalations(p_from date, p_to date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_scf_pulse_totals(p_pulse_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_pulse_totals(p_pulse_id uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_scf_struggling_notes_sent(p_from date, p_to date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_struggling_notes_sent(p_from date, p_to date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Without this, PostgREST keeps its old schema cache and the browser cannot
--    see the new 3-arg overloads — the college filter would silently do nothing.
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;

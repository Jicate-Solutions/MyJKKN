-- =====================================================================
-- Facilitator feedback coverage: server-side college filter + covered-count
-- fan-out fix
-- Migration: 20260710070000_facilitator_coverage_institution_param.sql
-- Created: 2026-07-10 (Director bug report, live screenshot ~12:36 IST)
--
-- BUG 1 (fan-out, CONFIRMED in prod output): per_fac grouped by
--   (institution, facilitator) but cov_fac grouped by facilitator ONLY, so a
--   facilitator teaching at 2+ colleges got their GLOBAL covered count on
--   EVERY college row. Live receipt: Dr. Swathi Raman (home: Dental) showed
--   "taught 3, covered 8, coverage 266.7%" on her Allied-Health row — the 8
--   covered sessions belong mostly to her Dental teaching. Fix: covered is
--   now grouped by (institution, facilitator), so coverage_pct is <= 100 by
--   construction (covered rows are a subset of the same college's taught
--   rows).
--
-- BUG 2 (filter): the card filtered client-side only, and the Director's
--   live page showed Pharmacy/Allied-Health facilitators under a Dental
--   filter. Whatever the client-state gremlin is, per-college correctness
--   should not depend on browser state: the fn now takes
--   p_institution_id (NULL = all colleges in caller scope), mirroring the
--   admin-trend RPC's pattern. The client passes the selected college.
--
-- SIGNATURE NOTE: adding a DEFAULT parameter creates a second overload and
--   PostgREST 2-arg calls would become ambiguous (PGRST203) — so the old
--   2-arg function is DROPPED and recreated as the single 3-arg form with a
--   default. Deployed clients calling {p_from,p_to} resolve to it via the
--   default; the new client also sends p_institution_id.
--
-- Validated on prod in a rolled-back txn (impersonated as a real
-- leadership user) before apply; receipts in PR body.
-- =====================================================================

DROP FUNCTION IF EXISTS public.fn_scf_facilitator_feedback_coverage(date, date);

CREATE OR REPLACE FUNCTION public.fn_scf_facilitator_feedback_coverage(
  p_from date,
  p_to date,
  p_institution_id uuid DEFAULT NULL
)
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
  -- The requested college is a NARROWING inside the caller's scope, never a
  -- widening: a non-super caller asking for a college outside their scope
  -- gets nothing (v_insts still applies below).

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
      AND (p_institution_id IS NULL OR sa.institution_id = p_institution_id)
      AND sa.attendance_date BETWEEN p_from AND p_to
      AND jsonb_typeof(sa.attendance_data) = 'object'
      AND jsonb_typeof(pe.val) = 'object'
      AND pe.val ? 'assigned_faculty'
      AND (CASE WHEN jsonb_typeof(pe.val->'assigned_faculty')='array'
            THEN pe.val->'assigned_faculty'->0->>'faculty_id'
            ELSE pe.val->'assigned_faculty'->>'faculty_id' END) IS NOT NULL
  ),
  -- covered: taught sessions with >= 1 feedback row from the SAME facilitator+session.
  -- Carries inst_id so covered counts stay INSIDE the college row they belong to.
  covered AS (
    SELECT t.inst_id, t.staff_id, t.attendance_date, t.period_id, t.course_code,
           count(f.id) AS responses
    FROM taught t
    JOIN public.session_feedback f
      ON f.faculty_id      = t.staff_id
     AND f.attendance_date = t.attendance_date
     AND f.period_id       = t.period_id
     AND COALESCE(f.course_code,'') = COALESCE(t.course_code,'')
    GROUP BY t.inst_id, t.staff_id, t.attendance_date, t.period_id, t.course_code
  ),
  per_fac AS (
    SELECT t.inst_id, t.staff_id,
           count(*)::bigint        AS taught_sessions,
           max(t.attendance_date)  AS last_taught
    FROM taught t
    GROUP BY t.inst_id, t.staff_id
  ),
  cov_fac AS (
    -- Grouped by (institution, facilitator) — the fan-out fix. covered rows
    -- are a subset of the same group's taught rows, so coverage <= 100%.
    SELECT c.inst_id, c.staff_id,
           count(*)::bigint        AS covered_sessions,
           sum(c.responses)::bigint AS responses,
           max(c.attendance_date)  AS last_feedback
    FROM covered c
    GROUP BY c.inst_id, c.staff_id
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
  LEFT JOIN cov_fac cf            ON cf.staff_id = pf.staff_id AND cf.inst_id = pf.inst_id
  LEFT JOIN public.staff s        ON s.id = pf.staff_id
  LEFT JOIN public.departments d  ON d.id = s.department_id
  LEFT JOIN public.institutions i ON i.id = pf.inst_id
  -- Drivers first (brief: drivers at top, 0% at bottom), most-taught as tiebreak.
  ORDER BY coverage_pct DESC, pf.taught_sessions DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_facilitator_feedback_coverage(date, date, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_facilitator_feedback_coverage(date, date, uuid) TO authenticated;

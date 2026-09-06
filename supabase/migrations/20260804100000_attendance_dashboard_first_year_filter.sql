-- ============================================================================
-- Attendance Dashboard > Statistics tab — "First-year learners only" filter
--
-- Adds p_first_year_only to fn_attendance_dashboard_section_stats. When true, the
-- roster and marks CTEs are narrowed to learners admitted in their institution's
-- CURRENT intake (admission_years.is_current = true). This resolves per
-- INSTITUTION: is_current is one-per-institution, so the IN-set below means "each
-- learner's own college's newest batch" — the all-institutions view stays correct
-- without a per-row institution correlation.
--
-- WHY admission year, not semester: semester data isn't reliably advanced as
-- learners progress (e.g. Dental read 597/600 UG as sem 1-2 — implausible for a
-- 5-year course), so a semester-based "first year" massively over-counts. Admission
-- year gives realistic splits (Dental ~56/600, Arts&Sci Self ~522/1523). Director
-- decision, 2026-07-28 interview.
--
-- The RETURNS TABLE shape is UNCHANGED. p_first_year_only DEFAULTs false, so every
-- existing caller (and the whole dashboard when the toggle is off) is byte-for-byte
-- unaffected — the `NOT p_first_year_only OR ...` guard short-circuits to TRUE and
-- the is_current sub-select is never evaluated. Same var-free predicate shape as
-- the existing hierarchy filters, applied in BOTH CTEs (filtering only the roster
-- would divide a narrowed roster by an unfiltered period_count and deflate every %).
--
-- DROP the 8-arg overload first: CREATE OR REPLACE with an extended parameter list
-- registers a SECOND overload, and PostgREST then fails every named-argument call
-- with "Could not choose the best candidate function". The 8-arg form must not
-- survive this migration (mirrors the 3-arg drop in 20260723120000).
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_attendance_dashboard_section_stats(
  date, uuid, uuid, uuid, uuid, uuid, uuid, uuid
);

CREATE OR REPLACE FUNCTION public.fn_attendance_dashboard_section_stats(
  p_date date,
  p_institution_id uuid DEFAULT NULL::uuid,
  p_academic_year_id uuid DEFAULT NULL::uuid,
  p_degree_id uuid DEFAULT NULL::uuid,
  p_department_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid,
  p_section_id uuid DEFAULT NULL::uuid,
  p_first_year_only boolean DEFAULT false
)
RETURNS TABLE(
  institution_id uuid,
  institution_name text,
  department_id uuid,
  department_name text,
  semester_id uuid,
  semester_name text,
  section_id uuid,
  section_name text,
  total_students bigint,
  present bigint,
  absent bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '20s'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_attendance_dashboard_section_stats: not authenticated';
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('academic.attendance.dashboard.view')) THEN
    RAISE EXCEPTION 'fn_attendance_dashboard_section_stats: not authorized';
  END IF;

  RETURN QUERY
  WITH accessible AS (
    SELECT i.id
    FROM public.institutions i
    WHERE is_super_admin() OR role_has_institution_access(i.id)
  ),
  roster AS (
    SELECT lp.institution_id, lp.department_id, lp.semester_id, lp.section_id,
           count(*) AS total_students
    FROM public.learners_profiles lp
    WHERE lp.lifecycle_status = 'active'
      AND lp.institution_id IN (SELECT a.id FROM accessible a)
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_academic_year_id IS NULL OR lp.academic_year_id = p_academic_year_id)
      -- Hierarchy filters. Plain var-free predicates on the already-scanned
      -- learners_profiles row: no extra join, no subquery, so the roster plan
      -- is unchanged apart from being more selective.
      AND (p_degree_id IS NULL OR lp.degree_id = p_degree_id)
      AND (p_department_id IS NULL OR lp.department_id = p_department_id)
      AND (p_program_id IS NULL OR lp.program_id = p_program_id)
      AND (p_semester_id IS NULL OR lp.semester_id = p_semester_id)
      AND (p_section_id IS NULL OR lp.section_id = p_section_id)
      -- First-year-only: admitted in the institution's current intake. Off by
      -- default → short-circuits to TRUE (sub-select never runs). The is_current
      -- set is ~one row per institution, so this is per-institution-correct.
      AND (NOT p_first_year_only
           OR lp.admission_year_id IN (
                SELECT ay.id FROM public.admission_years ay WHERE ay.is_current = true))
    GROUP BY 1, 2, 3, 4
  ),
  marks AS (
    SELECT lp.institution_id, lp.department_id, lp.semester_id, lp.section_id,
           sa.id::text || ':' || period.key AS period_instance,
           st ->> 'status' AS status
    FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(sa.attendance_data) = 'object'
           THEN sa.attendance_data ELSE '{}'::jsonb END) AS period
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(period.value -> 'students') = 'array'
           THEN period.value -> 'students' ELSE '[]'::jsonb END) AS st
    JOIN public.learners_profiles lp
      ON lp.id = CASE
                   WHEN (st ->> 'student_id') ~
                        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                   THEN (st ->> 'student_id')::uuid
                 END
     AND lp.lifecycle_status = 'active'
    WHERE sa.attendance_date = p_date
      -- DELIBERATELY no accessible-set IN-subquery here: the planner turns it
      -- into a join that multiplies this JSONB expansion by the institution
      -- count (3,105 -> 43,470 rows; 1345ms vs 68ms). Redundant anyway -- output
      -- rows come only FROM roster, which is scoped.
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_academic_year_id IS NULL OR lp.academic_year_id = p_academic_year_id)
      -- The SAME hierarchy predicates must be applied here, not only in roster.
      -- present/absent are period-AVERAGED over the marks in this CTE; filtering
      -- only the roster would divide a narrowed roster by an unfiltered
      -- period_count and silently deflate every percentage. Same var-free shape
      -- as above, so the note about avoiding subqueries here still holds.
      AND (p_degree_id IS NULL OR lp.degree_id = p_degree_id)
      AND (p_department_id IS NULL OR lp.department_id = p_department_id)
      AND (p_program_id IS NULL OR lp.program_id = p_program_id)
      AND (p_semester_id IS NULL OR lp.semester_id = p_semester_id)
      AND (p_section_id IS NULL OR lp.section_id = p_section_id)
      -- First-year-only — MUST mirror the roster predicate so present/absent are
      -- averaged over the same narrowed learner set (see the note above).
      AND (NOT p_first_year_only
           OR lp.admission_year_id IN (
                SELECT ay.id FROM public.admission_years ay WHERE ay.is_current = true))
  ),
  tally AS (
    SELECT m.institution_id, m.department_id, m.semester_id, m.section_id,
           count(*) FILTER (WHERE m.status = 'Present') AS present_sum,
           count(*) FILTER (WHERE m.status = 'Absent')  AS absent_sum,
           count(DISTINCT m.period_instance)            AS period_count
    FROM marks m
    GROUP BY 1, 2, 3, 4
  )
  SELECT
    r.institution_id,
    COALESCE(i.name, 'Unknown Institution')::text,
    r.department_id,
    COALESCE(d.department_name, 'Unknown Department')::text,
    r.semester_id,
    COALESCE(sm.semester_name, 'Unknown Semester')::text,
    r.section_id,
    COALESCE(sc.section_name, 'Unknown Section')::text,
    r.total_students,
    CASE WHEN COALESCE(t.period_count, 0) > 1
         THEN round(t.present_sum::numeric / t.period_count)::bigint
         ELSE COALESCE(t.present_sum, 0) END,
    CASE WHEN COALESCE(t.period_count, 0) > 1
         THEN GREATEST(0, round((t.present_sum + t.absent_sum)::numeric / t.period_count)
                          - round(t.present_sum::numeric / t.period_count))::bigint
         ELSE COALESCE(t.absent_sum, 0) END
  FROM roster r
  LEFT JOIN tally t
    ON t.institution_id IS NOT DISTINCT FROM r.institution_id
   AND t.department_id  IS NOT DISTINCT FROM r.department_id
   AND t.semester_id    IS NOT DISTINCT FROM r.semester_id
   AND t.section_id     IS NOT DISTINCT FROM r.section_id
  LEFT JOIN public.institutions i  ON i.id  = r.institution_id
  LEFT JOIN public.departments  d  ON d.id  = r.department_id
  LEFT JOIN public.semesters    sm ON sm.id = r.semester_id
  LEFT JOIN public.sections     sc ON sc.id = r.section_id;
END;
$function$;

-- Lock down execution (defense-in-depth; the fn also guards auth.uid() internally).
-- The DROP removed all ACLs, but a fresh CREATE re-grants EXECUTE to PUBLIC
-- (Postgres default) AND to anon (Supabase's ALTER DEFAULT PRIVILEGES), so REVOKE
-- both explicitly before granting only the intended roles — matches the
-- pre-migration ACL (authenticated + service_role) and the mandatory anon-lock rule.
REVOKE EXECUTE ON FUNCTION public.fn_attendance_dashboard_section_stats(
  date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean
) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_attendance_dashboard_section_stats(
  date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

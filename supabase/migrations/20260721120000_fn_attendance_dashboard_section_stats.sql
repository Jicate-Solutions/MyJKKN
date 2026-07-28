-- Attendance Dashboard → "Today's Statistics" section breakdown, aggregated in
-- Postgres instead of in the browser.
--
-- The service previously fetched EVERY active learner (4,179 rows) with four
-- embedded joins (sections/departments/semesters/institutions), paginated 1,000
-- at a time over five SEQUENTIAL round trips, then GROUP BY'd in JavaScript --
-- so every learner row was evaluated against five tables' RLS policies just to
-- produce 233 aggregate rows. This RPC returns those 233 rows in one call.
--
-- Attribution note (BUG: 169% attendance): a merged class (two sections taught
-- together) is stored as ONE student_attendance row carrying BOTH rosters and
-- stamped with only one section_id. Marks are therefore joined back to the
-- LEARNER's own placement in learners_profiles -- never credited to the row's
-- section_id -- so the numerator and the total_students denominator are drawn
-- from the same population and >100% is structurally impossible.

CREATE OR REPLACE FUNCTION public.fn_attendance_dashboard_section_stats(
  p_date date,
  p_institution_id uuid DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL
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
  -- SECURITY DEFINER + EXECUTE to authenticated => self-authorize, mirroring
  -- fn_scf_confirmation_rollup. Gate on the permission KEY, never a role name.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_attendance_dashboard_section_stats: not authenticated';
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('academic.attendance.dashboard.view')) THEN
    RAISE EXCEPTION 'fn_attendance_dashboard_section_stats: not authorized';
  END IF;

  RETURN QUERY
  WITH accessible AS (
    -- Resolve the caller's institution scope ONCE (8 rows) rather than
    -- re-evaluating role_has_institution_access per learner row -- the
    -- var-free/once-eval shape that keeps this off the 57014 timeout path.
    -- is_admin() is deliberately NOT reused here: it is a hardcoded role-NAME
    -- bypass that ignores institution_scope, so a scope='own' admin would
    -- otherwise read other institutions' rosters.
    SELECT i.id
    FROM public.institutions i
    WHERE is_super_admin() OR role_has_institution_access(i.id)
  ),
  roster AS (
    -- The denominator, and the base of the output: every active learner group,
    -- INCLUDING sections with no attendance marked today (they must still
    -- render, at 0%).
    SELECT lp.institution_id, lp.department_id, lp.semester_id, lp.section_id,
           count(*) AS total_students
    FROM public.learners_profiles lp
    WHERE lp.lifecycle_status = 'active'
      AND lp.institution_id IN (SELECT a.id FROM accessible a)
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_academic_year_id IS NULL OR lp.academic_year_id = p_academic_year_id)
    GROUP BY 1, 2, 3, 4
  ),
  marks AS (
    SELECT lp.institution_id, lp.department_id, lp.semester_id, lp.section_id,
           sa.id::text || ':' || period.key AS period_instance,
           st ->> 'status' AS status
    FROM public.student_attendance sa
    -- jsonb_typeof guards on BOTH expansions: a row whose attendance_data is a
    -- JSON array/scalar/null, or whose 'students' is a JSON null (JSON null is
    -- not SQL NULL, so COALESCE misses it), would otherwise raise and abort the
    -- entire rollup.
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(sa.attendance_data) = 'object'
           THEN sa.attendance_data ELSE '{}'::jsonb END) AS period
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(period.value -> 'students') = 'array'
           THEN period.value -> 'students' ELSE '[]'::jsonb END) AS st
    -- CASE (not a WHERE-clause regex) guards the ::uuid cast: the planner may
    -- reorder a WHERE filter after the join condition, so the guard has to sit
    -- in the cast expression itself for a malformed student_id to be skipped
    -- rather than fail the whole rollup.
    JOIN public.learners_profiles lp
      ON lp.id = CASE
                   WHEN (st ->> 'student_id') ~
                        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                   THEN (st ->> 'student_id')::uuid
                 END
     AND lp.lifecycle_status = 'active'
    WHERE sa.attendance_date = p_date
      -- DELIBERATELY no `institution_id IN (SELECT ... accessible)` here, and do
      -- NOT add one "for safety": the planner turns that IN-subquery into a join
      -- against the accessible set and multiplies this JSONB expansion by the
      -- number of accessible institutions (3,105 rows -> 43,470 at 14
      -- institutions) before filtering back down -- 1345ms vs 68ms for the whole
      -- rollup. It is redundant anyway: output rows come only FROM roster, which
      -- IS scoped, so a mark belonging to an inaccessible institution lands in a
      -- tally group that no roster row ever joins to and is dropped.
      -- These two are plain scalar filters, not subqueries, so they cost nothing
      -- and still narrow the scan early.
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_academic_year_id IS NULL OR lp.academic_year_id = p_academic_year_id)
  ),
  tally AS (
    SELECT m.institution_id, m.department_id, m.semester_id, m.section_id,
           count(*) FILTER (WHERE m.status = 'Present') AS present_sum,
           count(*) FILTER (WHERE m.status = 'Absent')  AS absent_sum,
           -- Period INSTANCES (row + period id), so a section spread over
           -- several attendance rows averages across every period it appeared in.
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
    -- A section taught twice today reports a per-period headcount comparable to
    -- its roster, not a doubled one.
    CASE WHEN COALESCE(t.period_count, 0) > 1
         THEN round(t.present_sum::numeric / t.period_count)::bigint
         ELSE COALESCE(t.present_sum, 0) END,
    -- Absent is derived from the rounded TOTAL marked rather than rounded
    -- independently: two half-values both rounding up would put present + absent
    -- one over the roster (40.5 + 4.5 -> 41 + 5 = 46 against 45 learners).
    CASE WHEN COALESCE(t.period_count, 0) > 1
         THEN GREATEST(0, round((t.present_sum + t.absent_sum)::numeric / t.period_count)
                          - round(t.present_sum::numeric / t.period_count))::bigint
         ELSE COALESCE(t.absent_sum, 0) END
  FROM roster r
  -- IS NOT DISTINCT FROM: department/semester/section may be NULL, and those
  -- groups must still match their tally (a plain = drops them).
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

REVOKE ALL ON FUNCTION public.fn_attendance_dashboard_section_stats(date, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_attendance_dashboard_section_stats(date, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_attendance_dashboard_section_stats(date, uuid, uuid) IS
  'Attendance Dashboard section-wise stats for one date. Aggregates in Postgres (233 rows) instead of shipping ~4k learner rows to the client. Attributes each mark to the learner''s own section so merged classes cannot exceed 100%.';

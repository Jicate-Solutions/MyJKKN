-- 2026-08-31 - The "Total Learners" card says WHICH learners it counted.
--
-- WHY
-- ---
-- Reported: the Statistics tab shows 512 Total Learners for JKKN Dental College
-- while Learner Profiles shows 498. Both numbers are correct. The dashboard
-- roster counts active + reserved + admitted (Director decision 2026-08-11, see
-- 20260821020000_attendance_dashboard_counts_provisional_learners.sql); the
-- Profiles page defaults to its Active tab, which counts `active` alone.
-- Measured on production 2026-08-31: Dental = 498 active + 14 reserved + 0
-- admitted = 512. Exactly the gap, with no row dropped or double-counted
-- anywhere.
--
-- Nothing was broken, so nothing about the roster changes here. What was broken
-- is that neither screen states its definition, so a director comparing the two
-- concludes the data is wrong. The card carried a static subtitle -- "Admitted,
-- reserved or active" -- which names the statuses but not their sizes, and so
-- cannot answer "then why 512 and not 498?".
--
-- WHAT THIS CHANGES
-- -----------------
-- The roster CTE already scans exactly the rows in question, so it can emit the
-- split for free: three FILTER counts over the same GROUP BY, no extra scan, no
-- extra join, same plan. The caller renders "498 active + 14 reserved" beneath
-- the 512 and the question stops being askable.
--
-- These are DELIBERATELY derived in the roster CTE rather than by a second query
-- in the service layer. The roster predicate (k_counted_statuses plus seven
-- hierarchy filters plus the first-year narrowing) lives in exactly one place;
-- a parallel count in TypeScript would have to restate all of it and would drift
-- the first time a filter is added -- the same class of bug the marks CTE's
-- "MUST mirror the roster's status set exactly" comment already guards against.
--
-- The breakdown is NOT added to the department/semester/section levels: no
-- surface renders it there, and carrying it would be speculative width on a
-- return type that four consumers already destructure.
--
-- The return type gains columns, so this is a DROP + CREATE, not a
-- CREATE OR REPLACE (Postgres cannot change a function's return type in place).
-- Dropping discards the grants, so they are re-asserted at the bottom -- including
-- the anon revoke, because Supabase's default privileges re-grant EXECUTE to anon
-- on every newly created function in public.
--
-- The function body below is otherwise BYTE-FOR-BYTE the deployed 2026-08-21
-- definition. Only the three counts, their three output columns and the three
-- zeros in the is_empty_view branch are new.

DROP FUNCTION IF EXISTS public.fn_attendance_dashboard_section_stats(
  date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION public.fn_attendance_dashboard_section_stats(
  p_date date,
  p_institution_id uuid DEFAULT NULL::uuid,
  p_academic_year_id uuid DEFAULT NULL::uuid,
  p_degree_id uuid DEFAULT NULL::uuid,
  p_department_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid,
  p_section_id uuid DEFAULT NULL::uuid,
  p_first_year_only boolean DEFAULT false)
 RETURNS TABLE(
   institution_id uuid, institution_name text,
   department_id uuid, department_name text,
   semester_id uuid, semester_name text,
   section_id uuid, section_name text,
   total_students bigint,
   -- The split of total_students by lifecycle_status. Emitted so the caller can
   -- render "498 active + 14 reserved" beneath the headcount instead of an
   -- unexplained 512 that disagrees with every other learner screen. They sum to
   -- total_students by construction: the three statuses ARE k_counted_statuses.
   active_students bigint,
   reserved_students bigint,
   admitted_students bigint,
   present bigint, absent bigint, marked bigint,
   is_unplaced boolean, is_empty_view boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  -- Director decision 2026-08-11. One list, used by BOTH the roster and the
  -- marks CTE: widening only the roster would divide a wider learner set by a
  -- narrower present count and deflate every percentage.
  -- Typed as the enum, not text[]: `lifecycle_status = ANY (text[])` has no
  -- operator, and casting the column to text would forfeit
  -- idx_learners_profiles_institution_lifecycle.
  k_counted_statuses constant public.lifecycle_status[] :=
    ARRAY['active', 'reserved', 'admitted']::public.lifecycle_status[];
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
           count(*) AS total_students,
           -- Same scan, same GROUP BY: the split costs nothing beyond three
           -- counters. Filtering on the enum directly (not a text cast) for the
           -- same index reason as k_counted_statuses above.
           count(*) FILTER (WHERE lp.lifecycle_status = 'active')   AS active_students,
           count(*) FILTER (WHERE lp.lifecycle_status = 'reserved') AS reserved_students,
           count(*) FILTER (WHERE lp.lifecycle_status = 'admitted') AS admitted_students
    FROM public.learners_profiles lp
    WHERE lp.lifecycle_status = ANY (k_counted_statuses)
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
  -- The same scope WITHOUT the first-year narrowing, institution-level only.
  -- Used solely to tell "this college has no first-year learners yet" (worth
  -- saying) apart from "this college is outside the filtered scope entirely"
  -- (not worth saying) -- so applying a department filter does not flood the
  -- list with a zero row for every other college.
  scope_institutions AS (
    SELECT DISTINCT lp.institution_id
    FROM public.learners_profiles lp
    WHERE lp.lifecycle_status = ANY (k_counted_statuses)
      AND lp.institution_id IN (SELECT a.id FROM accessible a)
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_academic_year_id IS NULL OR lp.academic_year_id = p_academic_year_id)
      AND (p_degree_id IS NULL OR lp.degree_id = p_degree_id)
      AND (p_department_id IS NULL OR lp.department_id = p_department_id)
      AND (p_program_id IS NULL OR lp.program_id = p_program_id)
      AND (p_semester_id IS NULL OR lp.semester_id = p_semester_id)
      AND (p_section_id IS NULL OR lp.section_id = p_section_id)
  ),
  marks AS (
    SELECT lp.institution_id, lp.department_id, lp.semester_id, lp.section_id,
           lp.id AS learner_id,
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
     -- MUST mirror the roster's status set exactly (see k_counted_statuses).
     AND lp.lifecycle_status = ANY (k_counted_statuses)
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
           count(DISTINCT m.period_instance)            AS period_count,
           -- Learners with ANY status recorded today. Deliberately NOT
           -- period-averaged: this is a headcount of who was reached, and it is
           -- the denominator the headline rate now divides by. Averaged present
           -- can never exceed it (present_sum <= marked * period_count), so the
           -- resulting rate is bounded at 100%.
           count(DISTINCT m.learner_id)                 AS marked_learners
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
    r.active_students,
    r.reserved_students,
    r.admitted_students,
    CASE WHEN COALESCE(t.period_count, 0) > 1
         THEN round(t.present_sum::numeric / t.period_count)::bigint
         ELSE COALESCE(t.present_sum, 0) END,
    CASE WHEN COALESCE(t.period_count, 0) > 1
         THEN GREATEST(0, round((t.present_sum + t.absent_sum)::numeric / t.period_count)
                          - round(t.present_sum::numeric / t.period_count))::bigint
         ELSE COALESCE(t.absent_sum, 0) END,
    -- A learner cannot be "marked" without being on the roster that produced
    -- this row, so cap at total_students rather than let a stale mark for a
    -- since-moved learner push marked above the headcount.
    LEAST(COALESCE(t.marked_learners, 0), r.total_students)::bigint,
    (r.section_id IS NULL) AS is_unplaced,
    false AS is_empty_view
  FROM roster r
  LEFT JOIN tally t
    ON t.institution_id IS NOT DISTINCT FROM r.institution_id
   AND t.department_id  IS NOT DISTINCT FROM r.department_id
   AND t.semester_id    IS NOT DISTINCT FROM r.semester_id
   AND t.section_id     IS NOT DISTINCT FROM r.section_id
  LEFT JOIN public.institutions i  ON i.id  = r.institution_id
  LEFT JOIN public.departments  d  ON d.id  = r.department_id
  LEFT JOIN public.semesters    sm ON sm.id = r.semester_id
  LEFT JOIN public.sections     sc ON sc.id = r.section_id

  UNION ALL

  -- A college that holds counted learners in this scope but none once the view's
  -- narrowing is applied. Emitted as an explicit zero so the caller can render
  -- the reason; never silently dropped.
  SELECT
    si.institution_id,
    COALESCE(i2.name, 'Unknown Institution')::text,
    NULL::uuid, NULL::text,
    NULL::uuid, NULL::text,
    NULL::uuid, NULL::text,
    -- total_students, then the active/reserved/admitted split, then
    -- present/absent/marked. All zero: this college contributes no rows.
    0::bigint, 0::bigint, 0::bigint, 0::bigint,
    0::bigint, 0::bigint, 0::bigint,
    false AS is_unplaced,
    true  AS is_empty_view
  FROM scope_institutions si
  LEFT JOIN public.institutions i2 ON i2.id = si.institution_id
  WHERE NOT EXISTS (
    SELECT 1 FROM roster r2 WHERE r2.institution_id = si.institution_id
  );
END;
$function$;

-- Supabase's default `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON
-- FUNCTIONS TO anon` re-grants EXECUTE to anon on every newly created function,
-- separately from PUBLIC. The DROP above discarded the previous grants, so both
-- the revoke and the grants must be re-asserted here explicitly.
REVOKE EXECUTE ON FUNCTION public.fn_attendance_dashboard_section_stats(
  date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_attendance_dashboard_section_stats(
  date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_attendance_dashboard_section_stats(
  date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean) TO service_role;

COMMENT ON FUNCTION public.fn_attendance_dashboard_section_stats(
  date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean) IS
'Attendance dashboard section statistics. Counts learners whose lifecycle_status is active, reserved or admitted -- deliberately NOT gated on fee payment (Director decision 2026-08-11). Returns that headcount split as active_students / reserved_students / admitted_students so the caller can say WHICH learners the total counted (2026-08-31: the total disagreed with the Learner Profiles Active tab by exactly the reserved count, and neither screen stated its definition). Also returns marked (learners with any status recorded that date) so the caller can report the never-marked count beside every percentage, is_unplaced for learners with no section yet, and is_empty_view for a college that has no learners once the view narrowing is applied.';

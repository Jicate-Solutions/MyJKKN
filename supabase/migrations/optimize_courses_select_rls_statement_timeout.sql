-- Fix: courses SELECT RLS statement timeout (57014) — "Error fetching courses"
-- Date: 2026-07-16
--
-- SYMPTOM
--   Non-admin users (e.g. faculty / cdc_coordinator) intermittently saw
--     Error fetching courses: {"code":"57014", "message":"canceling statement due to statement timeout"}
--   on the attendance workflow and any unbounded courses read. The authenticated
--   role's statement_timeout is 8s.
--
-- ROOT CAUSE
--   Both courses SELECT policies evaluated an expensive SECURITY DEFINER function
--   PER ROW over a full seq scan of ~3790 courses:
--     * courses_select_visiting_teacher : staff_teaches_in_institution(institution_id)
--         -> staff JOIN staff_plan_courses JOIN staff_plans, evaluated per row
--     * courses_select_permission       : role_has_institution_access(institution_id)
--         -> plpgsql with ~5 EXISTS, ~2.4ms per row
--   Measured (as a non-admin, EXPLAIN ANALYZE): ~6000ms, ~302k shared buffers to
--   return a 10-row page. count:'exact' (CourseService.getCourses) makes it worse.
--
-- FIX
--   Force each Var-free check to be evaluated ONCE per query instead of per row:
--     * institution-set predicates  ->  institution_id IN (SELECT unnest(<set fn>))
--         a sublink becomes a HASHED SUBPLAN evaluated once, then O(1) hash lookup/row.
--     * scalar boolean checks       ->  (SELECT <bool fn>())
--         a Var-free scalar sub-select becomes a one-time InitPlan.
--   NOTE: `= ANY(fn())` does NOT achieve this — it stays a per-row scalar expression
--   (verified: it made the scan WORSE, ~34s). The sublink / scalar-subselect forms are
--   required. This mirrors the existing per-row->once fix documented in 02_functions.sql
--   (persona scoping capturing _user_accessible_institutions() into a variable).
--
--   Set functions used (both STABLE SECURITY DEFINER so they bypass the inner tables'
--   RLS and are hoisted to a single evaluation):
--     * staff_teaching_institution_ids()  (new) — institutions the current user teaches in
--     * _user_accessible_institutions()   (existing canonical helper; already used by
--         billing_student_bills / admission_leads / calendar_entries policies)
--
-- EQUIVALENCE / SAFETY
--   Verified 0 courses have a NULL institution_id, so
--     institution_id IN (SELECT unnest(_user_accessible_institutions()))
--   grants exactly the same rows as role_has_institution_access(institution_id).
--   Post-fix EXPLAIN ANALYZE (same non-admin user): ~28ms, ~710 buffers, identical 472
--   visible rows (was 6000ms / 302k buffers / 472 rows).
--
-- SCOPE
--   Only the `courses` table crosses the 8s ceiling (3790 rows). staff_teaches_in_institution
--   also gates sections/semesters/degrees, but those tables are small enough to stay fast;
--   they are intentionally left unchanged here.

-- 1) New parameterless SECURITY DEFINER set helper: institutions the current user teaches in.
CREATE OR REPLACE FUNCTION public.staff_teaching_institution_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT sp.institution_id), ARRAY[]::uuid[])
  FROM public.staff s
  JOIN public.staff_plan_courses spc ON spc.staff_id = s.id
  JOIN public.staff_plans sp ON sp.id = spc.staff_plan_id
  WHERE (s.profile_id = auth.uid() OR s.institution_email = auth.email())
    AND s.is_active = true;
$function$;

GRANT EXECUTE ON FUNCTION public.staff_teaching_institution_ids() TO authenticated;

-- 2) Visiting-teacher SELECT policy — per-row function -> once-evaluated hashed sublink.
DROP POLICY IF EXISTS courses_select_visiting_teacher ON public.courses;
CREATE POLICY courses_select_visiting_teacher ON public.courses
  FOR SELECT
  USING ( institution_id IN (SELECT unnest(public.staff_teaching_institution_ids())) );

-- 3) Permission SELECT policy — per-row role_has_institution_access + inline booleans
--    -> once-evaluated hashed sublink + one-time InitPlan booleans.
DROP POLICY IF EXISTS courses_select_permission ON public.courses;
CREATE POLICY courses_select_permission ON public.courses
  FOR SELECT
  USING (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR (
      (SELECT user_has_permission('organizations.courses.view'::text))
      AND institution_id IN (SELECT unnest(public._user_accessible_institutions()))
    )
  );

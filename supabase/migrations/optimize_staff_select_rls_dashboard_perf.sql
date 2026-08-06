-- Fix: "Employees Analytics Dashboard" (/staff/dashboard) hangs on "Loading Dashboard..."
-- Date: 2026-07-30
--
-- SYMPTOM
--   /staff/dashboard?tab=<any> sat behind the full-screen "Loading Dashboard..."
--   overlay for several seconds on every visit and every filter change. Worst for
--   hod / principal / office_assistant (module_scopes.staff = 'own_institution',
--   ~134 users) -- who are the primary audience for the page.
--
-- ROOT CAUSE (two compounding layers; this migration fixes the DB layer)
--   Both `staff` SELECT policies evaluated an expensive SECURITY DEFINER helper
--   PER ROW over a full seq scan of 856 staff rows:
--     * staff_select_visiting_teacher : staff_is_visiting_in_accessible_institution(id)
--         -> staff_plan_courses JOIN staff_plans, plus role_has_institution_access()
--            per matching row -- re-run for every staff row.
--     * staff_select_scope_aware      : role_has_institution_access(institution_id)
--         -> plpgsql with ~5 EXISTS probes -- re-run for every staff row.
--   Postgres flattens the two permissive policies into ONE OR'd filter and
--   evaluates the arms left-to-right; it cannot cost-reorder *inside* a single OR
--   (and every helper carries the default procost=100, so it has no reason to try).
--   The expensive visiting-teacher arm landed FIRST -- ahead of the cheap
--   is_super_admin() short-circuit -- so even super admins paid the per-row join.
--
--   Measured (EXPLAIN ANALYZE, one plain `SELECT <15 cols> FROM staff`):
--     own_institution user (sathiya.p)  : 1245 ms,  33,766 shared buffers, 401 rows
--     super admin          (sangeetha_v):  408 ms,   9,479 shared buffers, 856 rows
--   `staff` is only ~154 pages, i.e. ~219x buffer amplification -- essentially all
--   of it RLS predicate evaluation. Buffer counts are identical for `select *`, for
--   15 columns, and for the bare predicate alone, so payload width is NOT a factor.
--
--   StaffService.getDashboardStats fires NINE such scans in parallel, so the
--   dashboard paid this cost 9x over. That app-side fan-out is fixed separately in
--   lib/services/staff/staff-service.ts; this migration makes each scan cheap, which
--   also speeds up every other unbounded `staff` read in the app (lists, pickers,
--   exports, embedded staff joins).
--
-- FIX  (same pattern as optimize_courses_select_rls_statement_timeout.sql and
--       optimize_attendance_visiting_teacher_rls_perf.sql)
--   Force every Var-free check to be evaluated ONCE per statement, and turn the two
--   row-dependent helpers into once-evaluated hashed sublinks:
--     is_super_admin() / user_has_permission() / get_user_module_scope() / auth.uid()
--       -> (SELECT fn())                    : one-time InitPlan
--     role_has_institution_access(institution_id)
--       -> institution_id IN (SELECT unnest(public._user_accessible_institutions()))
--     staff_is_visiting_in_accessible_institution(id)
--       -> id IN (SELECT unnest(public.staff_ids_visiting_accessible_institutions()))
--   Both become `hashed SubPlan` nodes: built once, then an O(1) hash probe per row.
--   NOTE: `= ANY(fn())` does NOT hoist -- it stays a per-row scalar expression
--   (verified in the courses migration: that form made the scan ~34s). The
--   sublink / scalar-subselect forms are required.
--   Arm ordering stops mattering once no arm is per-row expensive.
--
--   Rejected alternative: inlining the staff_plan_courses JOIN staff_plans subquery
--   into the policy instead of calling a SECURITY DEFINER helper. It measures faster
--   (6.3 ms) but is WRONG -- an inlined subquery is evaluated as the querying user, so
--   staff_plan_courses / staff_plans RLS applies and the visiting-teacher grant silently
--   narrows. The helper must stay SECURITY DEFINER; the 6.3 ms figure is unattainable.
--
-- EQUIVALENCE / SAFETY
--   * _user_accessible_institutions() is exactly {i.id : role_has_institution_access(i.id)}
--     across all 14 institutions, so the IN form grants the same rows. Verified that
--     0 staff rows and 0 staff_plans rows have a NULL or orphan institution_id; the
--     `IS NULL` arm is retained anyway because role_has_institution_access(NULL) = true.
--   * Old vs new predicate return identical staff-id sets (not merely identical
--     counts) for 11 users covering every branch:
--       3 super admins            -> 856 rows each
--       3 hod / own_institution   -> 107 / 856 / 43 rows
--       2 own_records             ->   1 row each
--       1 visiting-teacher-only   -> 401 rows
--       3 no-access profiles      ->   0 rows
--     only_old = 0 and only_new = 0 in every case.
--   * Post-fix EXPLAIN ANALYZE, same users, same statement:
--       own_institution : 1245 ms -> ~46 ms  (33,766 -> ~960 buffers)
--       super admin     :  408 ms -> ~4 ms   ( 9,479 -> ~870 buffers)
--     The residual ~46 ms is the one-time _user_accessible_institutions() +
--     staff_plan_courses set build (~709 buffers); it no longer scales with row count.
--   * Policy names, commands and TO roles are unchanged. The INSERT / UPDATE /
--     DELETE staff policies are deliberately untouched: they are evaluated per
--     affected row, not over a full scan, so they carry no amplification.
--   * staff_is_visiting_in_accessible_institution() is left defined (it is no longer
--     referenced by any policy) so nothing that calls it directly breaks.

BEGIN;

-- 1) Parameterless SECURITY DEFINER set helper: staff who teach in an institution the
--    caller can access. Mirrors staff_is_visiting_in_accessible_institution(id) exactly,
--    but resolves the whole set in one pass instead of once per staff row.
--
--    SECURITY DEFINER is REQUIRED, not merely conventional: staff_plan_courses and
--    staff_plans carry their own RLS. Inlining this join directly into the policy would
--    evaluate it as the querying user and silently narrow the visiting-teacher grant.
--
--    Two deliberate shape choices:
--      * the inner sp.institution_id test uses the sublink form so that
--        _user_accessible_institutions() is evaluated once, not per staff_plans row;
--      * dedup is a `SELECT DISTINCT` subquery (HashAggregate) rather than
--        array_agg(DISTINCT ...) (which forces a sort), so the returned array carries
--        401 ids instead of 2622 and the caller's hash build stays small.
CREATE OR REPLACE FUNCTION public.staff_ids_visiting_accessible_institutions()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(d.staff_id), ARRAY[]::uuid[])
  FROM (
    SELECT DISTINCT spc.staff_id
    FROM public.staff_plan_courses spc
    JOIN public.staff_plans sp ON sp.id = spc.staff_plan_id
    WHERE sp.institution_id IS NULL
       OR sp.institution_id IN (SELECT unnest(public._user_accessible_institutions()))
  ) d;
$function$;

GRANT EXECUTE ON FUNCTION public.staff_ids_visiting_accessible_institutions() TO authenticated;

-- 2) Scope-aware SELECT policy: per-row role_has_institution_access + per-row inline
--    booleans -> once-evaluated hashed sublink + one-time InitPlans.
DROP POLICY IF EXISTS "staff_select_scope_aware" ON public.staff;
CREATE POLICY "staff_select_scope_aware" ON public.staff
FOR SELECT USING (
  (SELECT is_super_admin())
  OR (
    (SELECT user_has_permission('staff.view'))
    AND (
      CASE (SELECT get_user_module_scope('staff'))
        WHEN 'all_institutions' THEN TRUE
        WHEN 'own_institution'  THEN (
          staff.institution_id IS NULL
          OR staff.institution_id IN (SELECT unnest(public._user_accessible_institutions()))
        )
        WHEN 'own_records'      THEN staff.profile_id = (SELECT auth.uid())
        ELSE FALSE
      END
    )
  )
);

-- 3) Visiting-teacher SELECT policy: per-row join function -> once-evaluated hashed sublink.
DROP POLICY IF EXISTS "staff_select_visiting_teacher" ON public.staff;
CREATE POLICY "staff_select_visiting_teacher" ON public.staff
FOR SELECT USING (
  (
    (SELECT user_has_permission('academic.staff.planning.view'))
    OR (SELECT user_has_permission('academic.timetables.view'))
    OR (SELECT user_has_permission('academic.attendance.mark'))
    OR (SELECT user_has_permission('academic.attendance.view'))
  )
  AND staff.id IN (SELECT unnest(public.staff_ids_visiting_accessible_institutions()))
);

COMMIT;

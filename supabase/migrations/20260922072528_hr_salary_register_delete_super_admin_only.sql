-- ============================================================================
-- Salary register: DELETE is super-admin only (2026-09-22)
-- ============================================================================
--
-- The register page gains a "Delete register" row action for super admins. The
-- write policies on both register tables were FOR ALL, gated on
-- is_super_admin() OR (hr.payroll.register.manage AND institution access) —
-- which meant an HR Head could already DELETE a frozen register straight
-- through PostgREST, button or no button. Hiding the action is UX; this is
-- the control.
--
-- Each FOR ALL policy becomes three (one permissive policy per verb): INSERT
-- and UPDATE keep the predicate they had, DELETE is is_super_admin() alone.
-- Lines go with their run through the run_id ON DELETE CASCADE FK, which
-- Postgres runs outside RLS; the lines DELETE policy only closes the direct
-- path. SELECT and service_role policies are untouched.
--
-- The route (DELETE /api/hr/payroll/register/[runId]) checks is_super_admin()
-- itself before touching the table; these policies are the backstop.
-- ============================================================================

-- ── hr_salary_register_runs ─────────────────────────────────────────────────
DROP POLICY IF EXISTS hr_salary_register_runs_write  ON public.hr_salary_register_runs;
DROP POLICY IF EXISTS hr_salary_register_runs_insert ON public.hr_salary_register_runs;
DROP POLICY IF EXISTS hr_salary_register_runs_update ON public.hr_salary_register_runs;
DROP POLICY IF EXISTS hr_salary_register_runs_delete ON public.hr_salary_register_runs;

CREATE POLICY hr_salary_register_runs_insert
  ON public.hr_salary_register_runs FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
      (SELECT public.user_has_permission('hr.payroll.register.manage'))
      AND (SELECT public.role_has_institution_access(institution_id))
    )
  );

CREATE POLICY hr_salary_register_runs_update
  ON public.hr_salary_register_runs FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      (SELECT public.user_has_permission('hr.payroll.register.manage'))
      AND (SELECT public.role_has_institution_access(institution_id))
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
      (SELECT public.user_has_permission('hr.payroll.register.manage'))
      AND (SELECT public.role_has_institution_access(institution_id))
    )
  );

CREATE POLICY hr_salary_register_runs_delete
  ON public.hr_salary_register_runs FOR DELETE TO authenticated
  USING ((SELECT public.is_super_admin()));

-- ── hr_salary_register_lines ────────────────────────────────────────────────
DROP POLICY IF EXISTS hr_salary_register_lines_write  ON public.hr_salary_register_lines;
DROP POLICY IF EXISTS hr_salary_register_lines_insert ON public.hr_salary_register_lines;
DROP POLICY IF EXISTS hr_salary_register_lines_update ON public.hr_salary_register_lines;
DROP POLICY IF EXISTS hr_salary_register_lines_delete ON public.hr_salary_register_lines;

CREATE POLICY hr_salary_register_lines_insert
  ON public.hr_salary_register_lines FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.hr_salary_register_runs r
       WHERE r.id = hr_salary_register_lines.run_id
         AND (SELECT public.user_has_permission('hr.payroll.register.manage'))
         AND (SELECT public.role_has_institution_access(r.institution_id))
    )
  );

CREATE POLICY hr_salary_register_lines_update
  ON public.hr_salary_register_lines FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.hr_salary_register_runs r
       WHERE r.id = hr_salary_register_lines.run_id
         AND (SELECT public.user_has_permission('hr.payroll.register.manage'))
         AND (SELECT public.role_has_institution_access(r.institution_id))
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.hr_salary_register_runs r
       WHERE r.id = hr_salary_register_lines.run_id
         AND (SELECT public.user_has_permission('hr.payroll.register.manage'))
         AND (SELECT public.role_has_institution_access(r.institution_id))
    )
  );

CREATE POLICY hr_salary_register_lines_delete
  ON public.hr_salary_register_lines FOR DELETE TO authenticated
  USING ((SELECT public.is_super_admin()));

-- Prove the shape: exactly one permissive policy per verb per table for
-- authenticated, and DELETE mentions nothing but is_super_admin.
DO $chk$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE tablename IN ('hr_salary_register_runs', 'hr_salary_register_lines')
     AND cmd = 'DELETE' AND roles = '{authenticated}'
     AND qual = '( SELECT is_super_admin() AS is_super_admin)';
  IF n <> 2 THEN
    RAISE EXCEPTION 'Expected 2 super-admin-only DELETE policies, found %.', n;
  END IF;
  SELECT count(*) INTO n FROM pg_policies
   WHERE tablename IN ('hr_salary_register_runs', 'hr_salary_register_lines')
     AND cmd = 'ALL' AND roles = '{authenticated}';
  IF n <> 0 THEN
    RAISE EXCEPTION '% FOR ALL policies remain for authenticated.', n;
  END IF;
END
$chk$;

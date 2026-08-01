-- Align staff_plan_courses write RLS with the dynamic permission model.
--
-- Bug: an HOD (MR. KRISHNAN R, krishnan@jkkn.ac.in, JKKN College of Pharmacy)
-- could open /academic/staff-planning/<id>/edit and save, but the save failed with
--   42501 new row violates row-level security policy for table "staff_plan_courses"
--
-- Root cause: the parent table staff_plans was migrated to the dynamic model
-- (user_has_permission + role_has_institution_access), but the child table
-- staff_plan_courses was left on the legacy hardcoded check
--   profiles.role IN ('super_admin','admin','faculty','hod')
-- profiles.role is a single text column and cannot represent multi-role users.
-- This user holds hod + digital_coordinator + staff_counselor in user_roles, but
-- profiles.role is 'staff_counselor', so every legacy write policy evaluated false
-- while user_has_permission('academic.staff.planning.edit') evaluated true.
--
-- Two further defects the legacy policies carried, fixed here:
--   1. The INSERT policies had NO institution predicate at all (despite the name
--      "... can insert institution staff plan courses"), so any of the 293 faculty
--      and 80 hod profiles could write course rows into any institution's plan.
--   2. StaffPlanService.updateStaffPlan replaces child rows with DELETE-then-INSERT.
--      A DELETE blocked by RLS does not raise -- it filters and reports 0 rows. The
--      header UPDATE therefore committed while the course rows silently did not,
--      leaving plans partially updated. The DELETE below is gated on `edit`, not
--      `delete`, precisely because it is the replace half of an edit (the hod role
--      has academic.staff.planning.delete = false; gating on delete would make the
--      save silently insert duplicates instead of replacing).

BEGIN;

-- Legacy hardcoded-role policies
DROP POLICY IF EXISTS "Admin users can insert staff plan courses"                  ON public.staff_plan_courses;
DROP POLICY IF EXISTS "Faculty users can insert institution staff plan courses"    ON public.staff_plan_courses;
DROP POLICY IF EXISTS "HOD users can insert institution staff plan courses"        ON public.staff_plan_courses;
DROP POLICY IF EXISTS "Admin users can update staff plan courses"                  ON public.staff_plan_courses;
DROP POLICY IF EXISTS "Faculty and HOD can update staff_plan_courses"              ON public.staff_plan_courses;
DROP POLICY IF EXISTS "Admin users can delete staff plan courses"                  ON public.staff_plan_courses;
DROP POLICY IF EXISTS "Faculty and HOD can delete staff_plan_courses"              ON public.staff_plan_courses;

-- Re-create idempotently
DROP POLICY IF EXISTS staff_plan_courses_insert_permission ON public.staff_plan_courses;
DROP POLICY IF EXISTS staff_plan_courses_update_permission ON public.staff_plan_courses;
DROP POLICY IF EXISTS staff_plan_courses_delete_permission ON public.staff_plan_courses;

CREATE POLICY staff_plan_courses_insert_permission
  ON public.staff_plan_courses
  FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('academic.staff.planning.edit')
      AND EXISTS (
        SELECT 1 FROM public.staff_plans sp
        WHERE sp.id = staff_plan_courses.staff_plan_id
          AND role_has_institution_access(sp.institution_id)
      )
    )
  );

CREATE POLICY staff_plan_courses_update_permission
  ON public.staff_plan_courses
  FOR UPDATE
  USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('academic.staff.planning.edit')
      AND EXISTS (
        SELECT 1 FROM public.staff_plans sp
        WHERE sp.id = staff_plan_courses.staff_plan_id
          AND role_has_institution_access(sp.institution_id)
      )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('academic.staff.planning.edit')
      AND EXISTS (
        SELECT 1 FROM public.staff_plans sp
        WHERE sp.id = staff_plan_courses.staff_plan_id
          AND role_has_institution_access(sp.institution_id)
      )
    )
  );

-- `edit` OR `delete`: removing a course row is part of an edit (see header note).
CREATE POLICY staff_plan_courses_delete_permission
  ON public.staff_plan_courses
  FOR DELETE
  USING (
    is_super_admin()
    OR is_admin()
    OR (
      (
        user_has_permission('academic.staff.planning.edit')
        OR user_has_permission('academic.staff.planning.delete')
      )
      AND EXISTS (
        SELECT 1 FROM public.staff_plans sp
        WHERE sp.id = staff_plan_courses.staff_plan_id
          AND role_has_institution_access(sp.institution_id)
      )
    )
  );

COMMIT;

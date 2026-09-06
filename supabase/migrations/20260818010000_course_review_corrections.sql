-- =====================================================================
-- Course Events — final review corrections (Fix B)
-- =====================================================================
-- Numbered after 20260818000000 (the renamed identity-extension
-- migration) so the ordering stays coherent on a fresh replay.
--
-- Both course_applications and course_bill_payments are EMPTY at the
-- time this runs, so every change below is structural only.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Two more identity/audit FKs: ON DELETE SET NULL -> ON DELETE RESTRICT
-- ---------------------------------------------------------------------
-- The same defect that 20260813100450 fixed on four other FKs survives
-- here. In both cases a CHECK requires the column NOT NULL for the rows
-- it governs, so the declared SET NULL sub-UPDATE can never execute for
-- those rows: it violates the CHECK and aborts the delete with a
-- confusing 23514 instead of a clear 23503.
--
--   * course_applications.profile_id is required NOT NULL by
--     course_applications_identity_chk when applicant_type = 'staff'.
--   * course_bill_payments.recorded_by is required NOT NULL by
--     course_bill_payments_offline_chk for every non-razorpay payment
--     mode.
--
-- Postgres cannot alter a FK's action in place; drop and re-add.

ALTER TABLE public.course_applications
  DROP CONSTRAINT course_applications_profile_id_fkey;
ALTER TABLE public.course_applications
  ADD  CONSTRAINT course_applications_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.course_bill_payments
  DROP CONSTRAINT course_bill_payments_recorded_by_fkey;
ALTER TABLE public.course_bill_payments
  ADD  CONSTRAINT course_bill_payments_recorded_by_fkey
  FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------
-- 2. course_enrollments_select: drop the courses.view arm
-- ---------------------------------------------------------------------
-- course_enrollments carries total_payable, total_paid, balance and
-- refundable_amount for every enrollee. The entry-level "View Courses"
-- key (courses.view) OR'd into this policy exposed that money to anyone
-- holding it, while the same figures on course_bills correctly require
-- courses.billing.view. Dropping the arm closes the gap; the
-- super-admin/admin bypass, the courses.enrollments.manage arm and the
-- participant self-clause are unchanged.
--
-- Postgres has no ALTER POLICY ... USING that edits one arm in place, so
-- the policy is dropped and recreated. Reproduced exactly except for the
-- removed arm.

DROP POLICY IF EXISTS course_enrollments_select ON public.course_enrollments;

CREATE POLICY course_enrollments_select ON public.course_enrollments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.enrollments.manage'))
        AND public.role_has_institution_access(institution_id))
    OR profile_id = (SELECT auth.uid())
  );

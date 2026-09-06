-- =====================================================================
-- Course Events — two review corrections
-- =====================================================================
-- Numbered 100450 so it sorts AFTER the migrations that created the
-- objects it alters (100300 created the FKs, 100400 created the
-- recompute trigger). A correction numbered before its target would
-- fail on a fresh replay.
--
-- Both course_applications and course_enrollments are EMPTY at the time
-- this runs, so the FK re-creation validates instantly.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Identity FKs: ON DELETE SET NULL -> ON DELETE RESTRICT
-- ---------------------------------------------------------------------
-- SET NULL was self-defeating. The identity CHECK requires the column to
-- be NOT NULL for its governing participant_type, so deleting a
-- referenced learner fired the SET NULL sub-UPDATE, which then violated
-- the CHECK and aborted the delete with a confusing 23514. The declared
-- action could never execute for rows of its own type: it behaved as
-- RESTRICT while claiming SET NULL.
--
-- RESTRICT makes the real behaviour explicit and yields a clear 23503.
-- This matches the reasoning already applied to profile_id (NOT NULL +
-- RESTRICT) in the same tables.
-- Postgres cannot alter a FK's action in place; drop and re-add.

ALTER TABLE public.course_applications
  DROP CONSTRAINT course_applications_learner_id_fkey;
ALTER TABLE public.course_applications
  ADD  CONSTRAINT course_applications_learner_id_fkey
  FOREIGN KEY (learner_id) REFERENCES public.learners_profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.course_applications
  DROP CONSTRAINT course_applications_external_participant_id_fkey;
ALTER TABLE public.course_applications
  ADD  CONSTRAINT course_applications_external_participant_id_fkey
  FOREIGN KEY (external_participant_id) REFERENCES public.event_external_participants(id) ON DELETE RESTRICT;

ALTER TABLE public.course_enrollments
  DROP CONSTRAINT course_enrollments_learner_id_fkey;
ALTER TABLE public.course_enrollments
  ADD  CONSTRAINT course_enrollments_learner_id_fkey
  FOREIGN KEY (learner_id) REFERENCES public.learners_profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.course_enrollments
  DROP CONSTRAINT course_enrollments_external_participant_id_fkey;
ALTER TABLE public.course_enrollments
  ADD  CONSTRAINT course_enrollments_external_participant_id_fkey
  FOREIGN KEY (external_participant_id) REFERENCES public.event_external_participants(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------
-- 2. Cross-table state triggers: INVOKER -> SECURITY DEFINER
-- ---------------------------------------------------------------------
-- A trigger function runs with the caller's privileges and RLS applies.
-- fn_course_recompute_balances performs a cross-table UPDATE on
-- course_enrollments; a role holding courses.billing.manage but NOT
-- courses.enrollments.manage had that UPDATE silently filtered to zero
-- rows with NO error. The payment recorded, the bill updated, and the
-- enrollment balance went stale — so someone who paid in full would
-- never flip to 'confirmed' and could not attend the course.
--
-- fn_course_package_amounts_chk has the same exposure in a quieter form:
-- its `IF NOT FOUND THEN RETURN NULL` early-return cannot distinguish an
-- RLS-filtered package row from a cascade-deleted one, so the sum check
-- would silently SKIP rather than fail closed.
--
-- This matches the established line in the existing billing module,
-- where every cross-table state trigger is SECURITY DEFINER
-- (update_bill_status, prevent_bill_overpayment,
-- fn_evaluate_status_after_bill_paid, update_bill_balance_on_amount_change)
-- while pure touch triggers stay INVOKER (update_billing_updated_at).
-- fn_courses_touch_updated_at is a touch trigger and is deliberately
-- LEFT ALONE.
--
-- ALTER FUNCTION is used rather than CREATE OR REPLACE: it changes only
-- these attributes without restating the body, so there is no risk of
-- the committed body drifting from the applied one, and no ACL loss.
--
-- SET search_path is mandatory on a SECURITY DEFINER function — without
-- it a caller-controlled search_path could resolve an unqualified name
-- to an attacker's object executed with the owner's privileges.

ALTER FUNCTION public.fn_course_recompute_balances()  SECURITY DEFINER;
ALTER FUNCTION public.fn_course_recompute_balances()  SET search_path = public;

ALTER FUNCTION public.fn_course_package_amounts_chk() SECURITY DEFINER;
ALTER FUNCTION public.fn_course_package_amounts_chk() SET search_path = public;

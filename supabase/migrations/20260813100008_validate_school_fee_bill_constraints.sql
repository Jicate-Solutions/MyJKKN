-- ============================================================================
-- 20260813100008 — Validate + index the school-fee columns on billing_student_bills
-- ============================================================================
-- Runs AFTER 20260813100005 in its own transaction. Split deliberately: doing
-- ADD CONSTRAINT NOT VALID and VALIDATE CONSTRAINT in one transaction would
-- hold the ACCESS EXCLUSIVE lock from the ADD across the validation scan,
-- which is exactly what the NOT VALID pattern exists to avoid on a live
-- financial table.
--
--   VALIDATE CONSTRAINT → SHARE UPDATE EXCLUSIVE: does NOT block reads or
--                         writes. Existing rows are all NULL and pass.
--
-- ############################################################################
-- # LARGE-TABLE ESCAPE HATCH                                                  #
-- #                                                                           #
-- # CREATE INDEX (below) takes a SHARE lock, which blocks INSERT/UPDATE/      #
-- # DELETE on billing_student_bills while the index builds. CONCURRENTLY      #
-- # cannot be used inside a migration because it may not run in a transaction #
-- # block.                                                                    #
-- #                                                                           #
-- # If billing_student_bills is large enough that a few seconds of blocked    #
-- # bill writes is unacceptable, run these THREE statements manually against  #
-- # the database BEFORE applying this migration. The IF NOT EXISTS clauses    #
-- # below then become no-ops and nothing is locked:                           #
-- #                                                                           #
-- #   CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ux_billing_bills_school_fee_item
-- #       ON public.billing_student_bills
-- #          (student_id, school_fee_plan_id, term_number, item_category_id)
-- #       WHERE school_fee_plan_id IS NOT NULL;
-- #                                                                           #
-- #   CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_billing_bills_school_fee_plan
-- #       ON public.billing_student_bills (school_fee_plan_id, term_number)
-- #       WHERE school_fee_plan_id IS NOT NULL;
-- #                                                                           #
-- #   CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_billing_bills_school_fine_due
-- #       ON public.billing_student_bills (fine_effective_date, status)
-- #       WHERE school_fee_plan_id IS NOT NULL AND fine_effective_date IS NOT NULL;
-- #                                                                           #
-- # Check afterwards that none is INVALID (a failed CONCURRENTLY build leaves #
-- # an unusable index behind):                                                #
-- #   SELECT c.relname, i.indisvalid                                          #
-- #     FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid               #
-- #    WHERE c.relname LIKE '%billing_bills_school%';                         #
-- ############################################################################
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Validate the two NOT VALID constraints from 20260813100005.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'billing_student_bills_school_fee_plan_id_fkey'
       AND NOT convalidated
  ) THEN
    ALTER TABLE public.billing_student_bills
      VALIDATE CONSTRAINT billing_student_bills_school_fee_plan_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'billing_student_bills_term_number_range'
       AND NOT convalidated
  ) THEN
    ALTER TABLE public.billing_student_bills
      VALIDATE CONSTRAINT billing_student_bills_term_number_range;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- Idempotency guard for school_fee_generate() (Phase 7) and
-- school_fee_apply_fines() (Phase 10): the same learner cannot be billed twice
-- for the same (plan, term, fee head). Re-running generation is therefore safe.
--
-- PARTIAL — holds zero entries for college / hostel / campus-living rows, where
-- school_fee_plan_id is NULL, so it adds no measurable cost to those insert
-- paths. A v2 supersede carries a DIFFERENT plan_id, so replacement bills never
-- collide with the v1 rows they supersede.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_billing_bills_school_fee_item
    ON public.billing_student_bills (student_id, school_fee_plan_id, term_number, item_category_id)
    WHERE school_fee_plan_id IS NOT NULL;

-- Lists every bill produced by a given plan version (used by the supersede flow).
CREATE INDEX IF NOT EXISTS ix_billing_bills_school_fee_plan
    ON public.billing_student_bills (school_fee_plan_id, term_number)
    WHERE school_fee_plan_id IS NOT NULL;

-- Drives school_fee_apply_fines(): overdue school term bills whose flat-fine
-- date has passed.
CREATE INDEX IF NOT EXISTS ix_billing_bills_school_fine_due
    ON public.billing_student_bills (fine_effective_date, status)
    WHERE school_fee_plan_id IS NOT NULL AND fine_effective_date IS NOT NULL;

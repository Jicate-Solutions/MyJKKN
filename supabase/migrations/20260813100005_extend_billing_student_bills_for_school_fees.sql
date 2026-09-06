-- ============================================================================
-- 20260813100005 — Additive school-fee columns on billing_student_bills
-- ============================================================================
-- Design: docs/plans/2026-08-13-school-fee-structure-design.md §3
--
-- ############################################################################
-- # SAFETY CONTRACT — existing college / hostel / campus-living billing MUST  #
-- # be completely unaffected by this migration.                               #
-- #                                                                           #
-- #  * Columns are NULLABLE with NO DEFAULT  → metadata-only ADD COLUMN, no   #
-- #    table rewrite, no row-level change to any existing bill.               #
-- #  * Constraints are added NOT VALID here and VALIDATEd in a SEPARATE      #
-- #    migration (…100008). ADD CONSTRAINT NOT VALID takes ACCESS EXCLUSIVE  #
-- #    for metadata only and releases it at this file's commit, so no scan   #
-- #    of this live financial table ever happens under a blocking lock.      #
-- #  * All indexes are PARTIAL (WHERE school_fee_plan_id IS NOT NULL) → they  #
-- #    contain zero entries for existing college rows and add no measurable   #
-- #    cost to existing insert paths.                                         #
-- #  * NO existing RLS policy is dropped, edited or replaced.                 #
-- #  * NO existing function, trigger or constraint is altered. In particular  #
-- #    fn_late_charge_accrue / _preview / _derivation / _waive and            #
-- #    admission_resolve_fee_items_for_lead are untouched.                    #
-- #  * Existing SELECT * consumers simply see three extra NULL columns.       #
-- ############################################################################
--
-- WHY these columns exist at all:
-- billing_student_bills is ONE ROW PER FEE ITEM, not a bill header with lines
-- (billing_invoices is a receipt-side document, not a demand grouping). So a
-- school "term bill" is the SET of rows sharing (student_id, academic_year_id,
-- due_date). These three columns make that set addressable without inventing a
-- parallel bill-header table and without changing the row shape that receipts,
-- refunds, apportionment, coverage and the parent portal all depend on.
--
-- Already present and reused rather than re-invented:
--   billing_student_bills.academic_year_id      (20260606093000)
--   billing_student_bills.superseded_by_bill_id (20260509100003) — used by the
--                                                Phase 9 v2/supersede flow
-- ============================================================================

ALTER TABLE public.billing_student_bills
  ADD COLUMN IF NOT EXISTS school_fee_plan_id  uuid,
  ADD COLUMN IF NOT EXISTS term_number         smallint,
  ADD COLUMN IF NOT EXISTS fine_effective_date date;


-- ---------------------------------------------------------------------------
-- FK: NOT VALID, so this statement is metadata-only and does not scan the
-- table. The VALIDATE runs in 20260813100008 under SHARE UPDATE EXCLUSIVE,
-- which does not block reads or writes. Existing rows are all NULL and pass.
-- ON DELETE SET NULL: deleting a fee plan must never cascade into real bills.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'billing_student_bills_school_fee_plan_id_fkey'
  ) THEN
    ALTER TABLE public.billing_student_bills
      ADD CONSTRAINT billing_student_bills_school_fee_plan_id_fkey
      FOREIGN KEY (school_fee_plan_id)
      REFERENCES public.school_fee_plans(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- term_number range guard, also NOT VALID (validated in …100008).
-- Matches the 1..6 cap on school_fee_plan_items.term_number.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'billing_student_bills_term_number_range'
  ) THEN
    ALTER TABLE public.billing_student_bills
      ADD CONSTRAINT billing_student_bills_term_number_range
      CHECK (term_number IS NULL OR term_number BETWEEN 1 AND 6)
      NOT VALID;
  END IF;
END $$;


-- Indexes are deliberately NOT created here — CREATE INDEX takes a SHARE lock
-- that blocks INSERT/UPDATE/DELETE on this live billing table for the duration
-- of the build. They live in 20260813100008, which documents a
-- CREATE INDEX CONCURRENTLY escape hatch for large tables.


COMMENT ON COLUMN public.billing_student_bills.school_fee_plan_id IS
  'School fee module only. NULL for every college/hostel/campus-living bill. Links the row to the school_fee_plans version that produced it.';
COMMENT ON COLUMN public.billing_student_bills.term_number IS
  'School fee module only (1..6). Groups rows into a "term bill" alongside student_id + academic_year_id + due_date. NULL for all other billing.';
COMMENT ON COLUMN public.billing_student_bills.fine_effective_date IS
  'School fee module only. Date the flat per-term fine becomes applicable, copied from school_term_calendars at generation time. NOT used by fn_late_charge_* (a separate, unmodified percentage-based engine).';

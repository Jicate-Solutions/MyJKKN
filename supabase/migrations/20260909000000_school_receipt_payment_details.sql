-- ============================================================================
-- 20260909000000 — Additive payment-detail columns on billing_receipts
-- ============================================================================
-- For the School Bill Payment counter (/billing/school-fees/collect).
--
-- ############################################################################
-- # SAFETY CONTRACT — existing college / hostel receipting MUST be completely #
-- # unaffected by this migration.                                             #
-- #                                                                           #
-- #  * Columns are NULLABLE with NO DEFAULT → metadata-only ADD COLUMN, no    #
-- #    table rewrite, no row-level change to any existing receipt.            #
-- #  * NO existing RLS policy is dropped, edited or replaced.                 #
-- #  * NO existing function, trigger or constraint is altered. In particular  #
-- #    generate_receipt_number(), the receipt-void and receipt-cancellation   #
-- #    approval paths are untouched.                                          #
-- #  * Existing SELECT * consumers simply see four extra NULL columns.        #
-- #  * The one index added is PARTIAL (WHERE date_of_credit IS NOT NULL) so   #
-- #    it holds zero entries for every existing college receipt.              #
-- ############################################################################
--
-- WHY these columns exist
-- -----------------------
-- billing_receipts already carries payment_mode, payment_reference_number and
-- payment_paid_date. payment_paid_date is the TRANSACTION date — when the payer
-- says the money left their hands. For DD / NEFT / online, school finance also
-- needs the DATE OF CREDIT: when the money actually landed in the institution
-- account. The two genuinely differ (a NEFT initiated on the 18th may credit on
-- the 19th) and reconciliation reports key on the credit date, so it cannot be
-- folded into payment_paid_date.
--
-- dd_bank_name / dd_branch / remitter_name are the remaining fields the counter
-- collects for non-cash modes and which had nowhere to live except free-text
-- payment_remarks (unqueryable, unreportable).
--
-- NEFT deliberately reuses payment_mode='bank_transfer' rather than adding a
-- new enum value — the UI labels it "NEFT". Widening the payment_mode CHECK
-- would require touching every report, filter and receipt that switches on it.
-- ============================================================================

ALTER TABLE public.billing_receipts
  ADD COLUMN IF NOT EXISTS date_of_credit date,
  ADD COLUMN IF NOT EXISTS dd_bank_name   text,
  ADD COLUMN IF NOT EXISTS dd_branch      text,
  ADD COLUMN IF NOT EXISTS remitter_name  text;


-- ---------------------------------------------------------------------------
-- Reconciliation reads ("what credited between X and Y") filter on
-- date_of_credit. Partial so the index covers only rows that actually set it,
-- i.e. non-cash receipts going forward — never the existing college backlog.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_billing_receipts_date_of_credit
  ON public.billing_receipts (date_of_credit)
  WHERE date_of_credit IS NOT NULL;


-- ---------------------------------------------------------------------------
-- Sanity guard: a credit date before the payment date is a data-entry slip
-- (money cannot clear before it is sent). NOT VALID so this statement is
-- metadata-only and never scans the live receipt table; it applies to new and
-- updated rows only. Existing rows are all NULL and would pass anyway.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'billing_receipts_date_of_credit_not_before_payment'
  ) THEN
    ALTER TABLE public.billing_receipts
      ADD CONSTRAINT billing_receipts_date_of_credit_not_before_payment
      CHECK (
        date_of_credit IS NULL
        OR payment_paid_date IS NULL
        OR date_of_credit >= payment_paid_date::date
      )
      NOT VALID;
  END IF;
END $$;


COMMENT ON COLUMN public.billing_receipts.date_of_credit IS
  'Date the money actually credited to the institution account. Distinct from payment_paid_date (the transaction date). NULL for cash and for every receipt raised before 2026-09.';
COMMENT ON COLUMN public.billing_receipts.dd_bank_name IS
  'Issuing bank for payment_mode=''dd''. NULL otherwise.';
COMMENT ON COLUMN public.billing_receipts.dd_branch IS
  'Issuing branch for payment_mode=''dd''. NULL otherwise.';
COMMENT ON COLUMN public.billing_receipts.remitter_name IS
  'Payer/remitter as named on the bank record for payment_mode=''bank_transfer'' (NEFT). Distinct from payer_name, which is who the counter recorded as paying.';

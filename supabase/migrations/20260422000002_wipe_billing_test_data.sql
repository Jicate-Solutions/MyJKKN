-- ============================================================================
-- Wipe ALL billing module test data — start fresh
-- ============================================================================
-- Date:   2026-04-22
-- Reason: User confirmed all billing data was test data. Wipe it so a new
--         category structure can be set up from scratch in the same flat
--         billing_categories table (the table itself stays — only rows are
--         removed). All FKs use ON DELETE CASCADE or are explicitly handled
--         here in dependency order.
--
-- Pre-wipe row counts (captured 2026-04-22):
--   billing_categories         = 86
--   billing_student_bills      = 376
--   billing_receipts           = 20
--   billing_receipt_items      = 20
--   billing_invoices           = 2
--   billing_invoice_items      = 3
--   billing_discounts          = 0  (already empty)
--   billing_refunds            = 0  (already empty)
--   payment_transaction_items  = 20 bill-linked rows (auto-cascade)
--
-- Backup: supabase/_backup/20260422_*.json (5 tables snapshotted; bills
--   skipped because user confirmed wipe of test data; categories preserved
--   for reference only).
--
-- Tables/structure NOT touched:
--   - All billing_* tables remain (just emptied)
--   - All RLS policies remain
--   - All triggers remain
--   - All FKs remain
--   - All permissions on custom_roles remain (billing.* keys still granted)
-- ============================================================================

BEGIN;

-- 1. Invoice items reference both invoices and receipts; delete first.
DELETE FROM billing_invoice_items;

-- 2. Invoices.
DELETE FROM billing_invoices;

-- 3. Discounts reference bills (currently 0 rows but be explicit).
DELETE FROM billing_discounts;

-- 4. Refunds reference receipts (currently 0 rows but be explicit).
DELETE FROM billing_refunds;

-- 5. Receipt items reference both receipts and bills.
DELETE FROM billing_receipt_items;

-- 6. Receipts (no remaining inbound refs once invoice_items + receipt_items + refunds gone).
DELETE FROM billing_receipts;

-- 7. Student bills.
--    payment_transaction_items.bill_id → billing_student_bills.id has
--    ON DELETE CASCADE, so the 20 bill-linked txn rows auto-delete here.
DELETE FROM billing_student_bills;

-- 8. Categories (no inbound refs once bills are gone).
DELETE FROM billing_categories;

-- Verification block — fail the migration if anything remains.
DO $$
DECLARE
  cat_n   int;
  bill_n  int;
  rec_n   int;
  ri_n    int;
  inv_n   int;
  ii_n    int;
BEGIN
  SELECT count(*) INTO cat_n  FROM billing_categories;
  SELECT count(*) INTO bill_n FROM billing_student_bills;
  SELECT count(*) INTO rec_n  FROM billing_receipts;
  SELECT count(*) INTO ri_n   FROM billing_receipt_items;
  SELECT count(*) INTO inv_n  FROM billing_invoices;
  SELECT count(*) INTO ii_n   FROM billing_invoice_items;

  IF (cat_n + bill_n + rec_n + ri_n + inv_n + ii_n) <> 0 THEN
    RAISE EXCEPTION 'Wipe verification failed: cat=%, bill=%, rec=%, ri=%, inv=%, ii=%',
      cat_n, bill_n, rec_n, ri_n, inv_n, ii_n;
  END IF;

  RAISE NOTICE 'Billing wipe verified: all 6 tables empty.';
END$$;

COMMIT;

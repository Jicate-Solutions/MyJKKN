-- Migration: fix receipt creation chain error + overpayment prevention
-- Date: 2026-05-26
--
-- Problem 1: trigger_detect_fee_dimension_change references NEW.fees_confirmed
-- but the column never existed on learners_profiles. This caused 42703 errors
-- during receipt creation when the trigger chain reached learners_profiles updates:
--   INSERT receipt_items → _on_receipt_item_evaluate_status → evaluate_learner_status_after_payment
--   → UPDATE learners_profiles → trigger_detect_fee_dimension_change → ERROR
--
-- Problem 2: No server-side guard prevented paying more than a bill's total amount.
--   Combined with the ghost-receipt bug, this allowed inflated payment totals.
--
-- Fix 1: Add the missing fees_confirmed column
ALTER TABLE public.learners_profiles
  ADD COLUMN IF NOT EXISTS fees_confirmed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.learners_profiles.fees_confirmed IS
  'When true, fee-dimension-change detection trigger skips re-evaluation. Set true after admin confirms fee structure.';

-- Fix 2: Overpayment prevention trigger on billing_receipt_items
CREATE OR REPLACE FUNCTION prevent_bill_overpayment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bill_amount   numeric;
  v_already_paid  numeric;
  v_bill_desc     text;
BEGIN
  SELECT final_amount, COALESCE(bill_description, 'Bill')
    INTO v_bill_amount, v_bill_desc
    FROM public.billing_student_bills
   WHERE id = NEW.bill_id;

  IF v_bill_amount IS NULL THEN
    RAISE EXCEPTION 'Bill % not found', NEW.bill_id;
  END IF;

  SELECT COALESCE(SUM(amount_paid), 0)
    INTO v_already_paid
    FROM public.billing_receipt_items
   WHERE bill_id = NEW.bill_id
     AND id IS DISTINCT FROM NEW.id;

  IF (v_already_paid + NEW.amount_paid) > v_bill_amount THEN
    RAISE EXCEPTION 'Overpayment blocked: "%" has bill amount % with % already paid. Cannot add % (would total %, exceeding bill by %).',
      v_bill_desc,
      v_bill_amount,
      v_already_paid,
      NEW.amount_paid,
      v_already_paid + NEW.amount_paid,
      (v_already_paid + NEW.amount_paid) - v_bill_amount;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_bill_overpayment ON public.billing_receipt_items;
CREATE TRIGGER trg_prevent_bill_overpayment
  BEFORE INSERT OR UPDATE ON public.billing_receipt_items
  FOR EACH ROW
  EXECUTE FUNCTION prevent_bill_overpayment();

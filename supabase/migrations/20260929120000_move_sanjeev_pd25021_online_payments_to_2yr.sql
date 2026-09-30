-- One-off correction: learner SANJEEV P (PD25021) paid ₹2,55,000 online (3 Razorpay
-- receipts) against the "6 Year Tuition Fee" bill instead of "2 Year Tuition Fee".
-- Re-points the receipt lines to the 2 Year bill; receipts / gateway payments untouched.
-- NOTE: trigger_update_bill_status_on_payment only recalculates NEW.bill_id on UPDATE,
-- so the source (6 Year) bill is recalculated explicitly.

CREATE TABLE IF NOT EXISTS public._bak_receipt_item_move_20260929 (
  backed_up_at timestamptz DEFAULT now(),
  kind text,
  row_data jsonb
);
ALTER TABLE public._bak_receipt_item_move_20260929 ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  c_learner CONSTANT uuid := '685c4116-a732-46e5-870c-abd9d540a9f2';
  c_bill_6y CONSTANT uuid := 'be9e8b93-661a-4530-8657-0db60cc8693f';
  c_bill_2y CONSTANT uuid := 'bcfab2e2-44c0-4fce-be0c-f9213af58d17';
  c_items   CONSTANT uuid[] := ARRAY[
    '6d43ae07-9a7c-4955-8f0e-f92bef9ebb31',
    '4873ed07-d591-44cc-a98d-befd1b95a225',
    '721aa000-46ca-4e4e-bc9a-9ecc76e71d0a']::uuid[];
  c_txns    CONSTANT uuid[] := ARRAY[
    'bca32290-3835-43bd-b45b-dc492b3121e4',
    'a90bf09c-19dd-4958-ac35-4dd808b5d05b',
    'db107f65-31c0-410a-8f2a-11cb99145b2f']::uuid[];
  v_n int;
  v_sum numeric;
BEGIN
  -- Guard: the 3 lines must still sit on the 6 Year bill and total 255000
  SELECT count(*), sum(i.amount_paid) INTO v_n, v_sum
    FROM billing_receipt_items i
    JOIN billing_receipts r ON r.id = i.receipt_id
   WHERE i.id = ANY(c_items) AND i.bill_id = c_bill_6y AND r.student_id = c_learner;
  IF v_n <> 3 OR v_sum <> 255000 THEN
    RAISE EXCEPTION 'Guard failed: expected 3 lines / 255000 on 6Y bill, got % / %', v_n, v_sum;
  END IF;

  IF (SELECT count(*) FROM billing_student_bills
       WHERE id IN (c_bill_6y, c_bill_2y) AND student_id = c_learner) <> 2 THEN
    RAISE EXCEPTION 'Guard failed: bills do not belong to learner';
  END IF;

  -- Backup
  INSERT INTO _bak_receipt_item_move_20260929 (kind, row_data)
    SELECT 'receipt_item', to_jsonb(i) FROM billing_receipt_items i WHERE i.id = ANY(c_items);
  INSERT INTO _bak_receipt_item_move_20260929 (kind, row_data)
    SELECT 'bill', to_jsonb(b) FROM billing_student_bills b WHERE b.id IN (c_bill_6y, c_bill_2y);
  INSERT INTO _bak_receipt_item_move_20260929 (kind, row_data)
    SELECT 'payment_transaction', to_jsonb(t) FROM payment_transactions t WHERE t.id = ANY(c_txns);
  INSERT INTO _bak_receipt_item_move_20260929 (kind, row_data)
    SELECT 'receipt', to_jsonb(r) FROM billing_receipts r
     WHERE r.id IN (SELECT receipt_id FROM billing_receipt_items WHERE id = ANY(c_items));

  -- Move the receipt lines (destination bill recalculated by trigger)
  UPDATE billing_receipt_items
     SET bill_id = c_bill_2y, allocation_reason = 'manual_reallocation'
   WHERE id = ANY(c_items);

  -- Source bill is NOT recalculated by the trigger
  PERFORM recalculate_bill_status_with_refunds(c_bill_6y);
  PERFORM recalculate_bill_status_with_refunds(c_bill_2y);

  -- Gateway audit trail follows the bill
  UPDATE payment_transactions
     SET bill_ids = ARRAY[c_bill_2y]
   WHERE id = ANY(c_txns);

  UPDATE billing_receipts
     SET payment_remarks = payment_remarks || ' | Re-allocated from 6 Year Tuition Fee to 2 Year Tuition Fee (paid against wrong bill)'
   WHERE id IN (SELECT receipt_id FROM billing_receipt_items WHERE id = ANY(c_items));
END $$;

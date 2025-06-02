-- Migration: 012_fix_bill_balance_update
-- Description: Fix bill balance_amount not updating when bill amounts change

-- Create function to update balance_amount when bill is updated
CREATE OR REPLACE FUNCTION update_bill_balance_on_amount_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger if final_amount, total_amount, or tax_amount changed
  IF (NEW.final_amount != OLD.final_amount OR 
      NEW.total_amount != OLD.total_amount OR 
      NEW.tax_amount != OLD.tax_amount) THEN
    
    -- Recalculate balance amount based on payments and refunds
    PERFORM recalculate_bill_status_with_refunds(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_update_bill_balance_on_amount_change ON public.billing_student_bills;

-- Create trigger to update balance when bill amounts change
CREATE TRIGGER trigger_update_bill_balance_on_amount_change
  AFTER UPDATE ON public.billing_student_bills
  FOR EACH ROW
  EXECUTE FUNCTION update_bill_balance_on_amount_change();

-- Fix existing bills with incorrect balance amounts
-- For unpaid bills, balance_amount should equal final_amount
UPDATE public.billing_student_bills 
SET balance_amount = final_amount 
WHERE status = 'unpaid' AND balance_amount != final_amount;

-- For paid bills, balance_amount should be 0
UPDATE public.billing_student_bills 
SET balance_amount = 0 
WHERE status = 'paid' AND balance_amount != 0;

-- For partially paid bills, recalculate balance based on payments
DO $$
DECLARE
  bill_record RECORD;
  total_paid DECIMAL(10,2);
  total_refunded DECIMAL(10,2);
  net_paid DECIMAL(10,2);
  correct_balance DECIMAL(10,2);
BEGIN
  FOR bill_record IN
    SELECT id, final_amount, balance_amount
    FROM public.billing_student_bills
    WHERE status = 'partially_paid'
  LOOP
    -- Calculate total amount paid for this bill
    SELECT COALESCE(SUM(bri.amount_paid), 0)
    INTO total_paid
    FROM public.billing_receipt_items bri
    WHERE bri.bill_id = bill_record.id;
    
    -- Calculate total processed refunds for this bill
    SELECT COALESCE(SUM(br.refund_amount), 0)
    INTO total_refunded
    FROM public.billing_refunds br
    JOIN public.billing_receipt_items bri ON br.receipt_id = bri.receipt_id
    WHERE bri.bill_id = bill_record.id 
      AND br.approval_status = 'processed';
    
    -- Calculate net paid amount and correct balance
    net_paid := total_paid - total_refunded;
    correct_balance := GREATEST(0, bill_record.final_amount - net_paid);
    
    -- Update if balance is incorrect
    IF correct_balance != bill_record.balance_amount THEN
      UPDATE public.billing_student_bills
      SET balance_amount = correct_balance
      WHERE id = bill_record.id;
      
      RAISE NOTICE 'Fixed balance for bill %: was %, now %', 
        bill_record.id, bill_record.balance_amount, correct_balance;
    END IF;
  END LOOP;
END $$; 
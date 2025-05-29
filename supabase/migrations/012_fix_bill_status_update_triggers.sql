-- Migration: Fix bill status update triggers
-- Description: Add missing DELETE trigger for billing_receipt_items to properly update bill status

-- Create function to handle bill status update on receipt item deletion
CREATE OR REPLACE FUNCTION update_bill_status_on_delete()
RETURNS TRIGGER AS $$
DECLARE
  total_paid DECIMAL(10,2);
  bill_amount DECIMAL(10,2);
BEGIN
  -- Calculate total amount paid for this bill after deletion
  SELECT COALESCE(SUM(bri.amount_paid), 0)
  INTO total_paid
  FROM public.billing_receipt_items bri
  WHERE bri.bill_id = OLD.bill_id;
  
  -- Get the bill's final amount
  SELECT final_amount
  INTO bill_amount
  FROM public.billing_student_bills
  WHERE id = OLD.bill_id;
  
  -- Update bill status based on remaining payments
  IF total_paid >= bill_amount THEN
    UPDATE public.billing_student_bills
    SET status = 'paid',
        balance_amount = 0,
        payment_date = NOW()
    WHERE id = OLD.bill_id;
  ELSIF total_paid > 0 THEN
    UPDATE public.billing_student_bills
    SET status = 'partially_paid',
        balance_amount = bill_amount - total_paid
    WHERE id = OLD.bill_id;
  ELSE
    UPDATE public.billing_student_bills
    SET status = 'unpaid',
        balance_amount = bill_amount,
        payment_date = NULL
    WHERE id = OLD.bill_id;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update bill status when receipt items are deleted
CREATE TRIGGER trigger_update_bill_status_on_delete
  AFTER DELETE ON public.billing_receipt_items
  FOR EACH ROW
  EXECUTE FUNCTION update_bill_status_on_delete();

-- Add comment for documentation
COMMENT ON FUNCTION update_bill_status_on_delete() IS 'Updates bill status when receipt items are deleted to maintain data consistency';
COMMENT ON TRIGGER trigger_update_bill_status_on_delete ON public.billing_receipt_items IS 'Automatically updates bill status when receipt items are deleted'; 
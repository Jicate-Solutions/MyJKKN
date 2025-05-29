-- Migration: Auto Invoice Generation
-- Description: Automatically generate individual invoices when bills are fully paid

-- Create function to automatically generate invoice when bill is fully paid
CREATE OR REPLACE FUNCTION generate_auto_invoice_for_bill(p_bill_id UUID)
RETURNS VOID AS $$
DECLARE
  v_bill_record RECORD;
  v_invoice_number TEXT;
  v_invoice_id UUID;
  v_grand_total DECIMAL(10,2) := 0;
  v_receipt_record RECORD;
BEGIN
  -- Get bill information
  SELECT 
    b.id,
    b.student_id,
    b.institution_id,
    b.bill_description,
    b.final_amount,
    b.payment_date,
    s.student_name,
    s.roll_number,
    i.name as institution_name
  INTO v_bill_record
  FROM public.billing_student_bills b
  JOIN public.students s ON b.student_id = s.id
  JOIN public.institutions i ON b.institution_id = i.id
  WHERE b.id = p_bill_id AND b.status = 'paid';
  
  -- If bill not found or not paid, return
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Check if invoice already exists for this bill
  IF EXISTS (
    SELECT 1 
    FROM public.billing_invoices bi
    JOIN public.billing_invoice_items bii ON bi.id = bii.invoice_id
    JOIN public.billing_receipt_items bri ON bii.receipt_id = bri.receipt_id
    WHERE bri.bill_id = p_bill_id
  ) THEN
    -- Invoice already exists, skip generation
    RETURN;
  END IF;
  
  -- Generate invoice number using existing function
  SELECT generate_invoice_number() INTO v_invoice_number;
  
  -- Calculate grand total from all receipts for this bill
  SELECT COALESCE(SUM(bri.amount_paid), 0)
  INTO v_grand_total
  FROM public.billing_receipt_items bri
  WHERE bri.bill_id = p_bill_id;
  
  -- Create the invoice
  INSERT INTO public.billing_invoices (
    invoice_number,
    invoice_type,
    invoice_date,
    student_id,
    institution_id,
    invoice_description,
    payment_terms,
    due_date,
    additional_charges,
    discount_applied,
    grand_total,
    created_at
  ) VALUES (
    v_invoice_number,
    'individual',
    CURRENT_DATE,
    v_bill_record.student_id,
    v_bill_record.institution_id,
    'Payment Invoice for: ' || v_bill_record.bill_description,
    'Payment completed',
    CURRENT_DATE,
    0,
    0,
    v_grand_total,
    NOW()
  ) RETURNING id INTO v_invoice_id;
  
  -- Create invoice items for each receipt that paid this bill
  FOR v_receipt_record IN
    SELECT DISTINCT 
      bri.receipt_id,
      bri.amount_paid,
      br.receipt_number,
      br.payment_date
    FROM public.billing_receipt_items bri
    JOIN public.billing_receipts br ON bri.receipt_id = br.id
    WHERE bri.bill_id = p_bill_id
  LOOP
    INSERT INTO public.billing_invoice_items (
      invoice_id,
      receipt_id,
      amount
    ) VALUES (
      v_invoice_id,
      v_receipt_record.receipt_id,
      v_receipt_record.amount_paid
    );
  END LOOP;
  
  -- Log the auto-generation
  RAISE NOTICE 'Auto-generated invoice % for bill % (Student: %)', 
    v_invoice_number, p_bill_id, v_bill_record.student_name;
    
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the main transaction
    RAISE WARNING 'Failed to auto-generate invoice for bill %: %', p_bill_id, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Update the existing bill status update function to include auto invoice generation
CREATE OR REPLACE FUNCTION update_bill_status()
RETURNS TRIGGER AS $$
DECLARE
  total_paid DECIMAL(10,2);
  bill_amount DECIMAL(10,2);
  old_status VARCHAR(20);
BEGIN
  -- Calculate total amount paid for this bill
  SELECT COALESCE(SUM(bri.amount_paid), 0)
  INTO total_paid
  FROM public.billing_receipt_items bri
  WHERE bri.bill_id = NEW.bill_id;
  
  -- Get the bill's final amount and current status
  SELECT final_amount, status
  INTO bill_amount, old_status
  FROM public.billing_student_bills
  WHERE id = NEW.bill_id;
  
  -- Update bill status based on payment
  IF total_paid >= bill_amount THEN
    UPDATE public.billing_student_bills
    SET status = 'paid',
        balance_amount = 0,
        payment_date = NOW()
    WHERE id = NEW.bill_id;
    
    -- If bill was just fully paid (status changed from unpaid/partially_paid to paid)
    -- automatically generate an individual invoice
    IF old_status != 'paid' THEN
      PERFORM generate_auto_invoice_for_bill(NEW.bill_id);
    END IF;
  ELSIF total_paid > 0 THEN
    UPDATE public.billing_student_bills
    SET status = 'partially_paid',
        balance_amount = bill_amount - total_paid
    WHERE id = NEW.bill_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON FUNCTION generate_auto_invoice_for_bill(UUID) IS 'Automatically generates an individual invoice when a bill is fully paid';
COMMENT ON FUNCTION update_bill_status() IS 'Updates bill status based on payments and auto-generates invoices for fully paid bills'; 
-- Billing Schedule Tables
-- This file creates tables for the billing schedule management system

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create billing_student_bills table
CREATE TABLE IF NOT EXISTS public.billing_student_bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL,
  institution_id UUID NOT NULL,
  item_category_id UUID NOT NULL,
  bill_description TEXT NOT NULL,
  due_date DATE NOT NULL,
  quantity INTEGER DEFAULT 1 CHECK (quantity > 0),
  unit_amount DECIMAL(10,2) NOT NULL CHECK (unit_amount >= 0),
  total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
  tax_amount DECIMAL(10,2) DEFAULT 0 CHECK (tax_amount >= 0),
  final_amount DECIMAL(10,2) NOT NULL CHECK (final_amount >= 0),
  status VARCHAR(20) DEFAULT 'unpaid' CHECK (status IN ('paid', 'unpaid', 'partially_paid', 'cancelled', 'overdue')),
  payment_date TIMESTAMP WITH TIME ZONE,
  balance_amount DECIMAL(10,2) DEFAULT 0 CHECK (balance_amount >= 0),
  remarks TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_pattern VARCHAR(20) CHECK (recurrence_pattern IN ('monthly', 'quarterly', 'yearly')),
  number_of_recurrences INTEGER,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_billing_student_bills_student FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_student_bills_institution FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_student_bills_item_category FOREIGN KEY (item_category_id) REFERENCES public.billing_item_categories(id) ON DELETE RESTRICT
);

-- Create indexes for billing_student_bills
CREATE INDEX IF NOT EXISTS idx_billing_student_bills_student_id ON public.billing_student_bills(student_id);
CREATE INDEX IF NOT EXISTS idx_billing_student_bills_institution_id ON public.billing_student_bills(institution_id);
CREATE INDEX IF NOT EXISTS idx_billing_student_bills_item_category_id ON public.billing_student_bills(item_category_id);
CREATE INDEX IF NOT EXISTS idx_billing_student_bills_status ON public.billing_student_bills(status);
CREATE INDEX IF NOT EXISTS idx_billing_student_bills_due_date ON public.billing_student_bills(due_date);
CREATE INDEX IF NOT EXISTS idx_billing_student_bills_created_at ON public.billing_student_bills(created_at);

-- Create billing_receipts table
CREATE TABLE IF NOT EXISTS public.billing_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_number VARCHAR(50) UNIQUE NOT NULL,
  receipt_date DATE NOT NULL,
  student_id UUID NOT NULL,
  institution_id UUID NOT NULL,
  payment_mode VARCHAR(20) NOT NULL CHECK (payment_mode IN ('cash', 'online', 'bank_transfer', 'dd', 'cheque')),
  payment_reference_number VARCHAR(100),
  payment_amount DECIMAL(10,2) NOT NULL CHECK (payment_amount > 0),
  payment_paid_date DATE NOT NULL,
  payer_name VARCHAR(255) NOT NULL,
  payer_contact VARCHAR(20),
  accountant_id UUID,
  payment_remarks TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_billing_receipts_student FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_receipts_institution FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE
);

-- Create billing_receipt_items table (junction table for receipt and bills)
CREATE TABLE IF NOT EXISTS public.billing_receipt_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_id UUID NOT NULL,
  bill_id UUID NOT NULL,
  amount_paid DECIMAL(10,2) NOT NULL CHECK (amount_paid > 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_billing_receipt_items_receipt FOREIGN KEY (receipt_id) REFERENCES public.billing_receipts(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_receipt_items_bill FOREIGN KEY (bill_id) REFERENCES public.billing_student_bills(id) ON DELETE CASCADE,
  
  -- Unique constraint to prevent duplicate entries
  UNIQUE(receipt_id, bill_id)
);

-- Create billing_discounts table
CREATE TABLE IF NOT EXISTS public.billing_discounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID NOT NULL,
  discount_category VARCHAR(50) NOT NULL CHECK (discount_category IN ('merit_scholarship', 'financial_aid', 'staff_quota', 'sports_quota', 'special_circumstances')),
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('amount', 'percentage')),
  discount_value DECIMAL(10,2) NOT NULL CHECK (discount_value > 0),
  discount_amount DECIMAL(10,2) NOT NULL CHECK (discount_amount > 0),
  discount_reason TEXT NOT NULL,
  supporting_documents JSONB,
  authorizer_id UUID,
  approval_date DATE,
  approval_status VARCHAR(20) DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  effective_date DATE NOT NULL,
  expiry_date DATE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_billing_discounts_bill FOREIGN KEY (bill_id) REFERENCES public.billing_student_bills(id) ON DELETE CASCADE
);

-- Create billing_refunds table
CREATE TABLE IF NOT EXISTS public.billing_refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_id UUID NOT NULL,
  refund_category VARCHAR(50) NOT NULL CHECK (refund_category IN ('course_change', 'withdrawal', 'duplicate_payment', 'service_not_provided', 'system_error')),
  refund_amount DECIMAL(10,2) NOT NULL CHECK (refund_amount > 0),
  refund_date DATE NOT NULL,
  refund_method VARCHAR(20) NOT NULL CHECK (refund_method IN ('cash', 'bank_transfer', 'adjust_future_bills', 'cheque')),
  bank_details JSONB,
  refund_reason TEXT NOT NULL,
  supporting_documents JSONB,
  authorizer_id UUID,
  processing_fee DECIMAL(10,2) DEFAULT 0 CHECK (processing_fee >= 0),
  net_refund_amount DECIMAL(10,2) NOT NULL CHECK (net_refund_amount > 0),
  approval_status VARCHAR(20) DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'processed')),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_billing_refunds_receipt FOREIGN KEY (receipt_id) REFERENCES public.billing_receipts(id) ON DELETE CASCADE
);

-- Create billing_invoices table
CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  invoice_type VARCHAR(20) NOT NULL CHECK (invoice_type IN ('individual', 'consolidated')),
  invoice_date DATE NOT NULL,
  student_id UUID NOT NULL,
  institution_id UUID NOT NULL,
  billing_period_from DATE,
  billing_period_to DATE,
  invoice_description TEXT,
  tax_summary JSONB,
  payment_terms TEXT,
  due_date DATE,
  additional_charges DECIMAL(10,2) DEFAULT 0 CHECK (additional_charges >= 0),
  discount_applied DECIMAL(10,2) DEFAULT 0 CHECK (discount_applied >= 0),
  grand_total DECIMAL(10,2) NOT NULL CHECK (grand_total >= 0),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_billing_invoices_student FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_invoices_institution FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE
);

-- Create billing_invoice_items table (junction table for invoice and receipts)
CREATE TABLE IF NOT EXISTS public.billing_invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL,
  receipt_id UUID NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_billing_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES public.billing_invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_invoice_items_receipt FOREIGN KEY (receipt_id) REFERENCES public.billing_receipts(id) ON DELETE CASCADE,
  
  -- Unique constraint to prevent duplicate entries
  UNIQUE(invoice_id, receipt_id)
);

-- Create update triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_billing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all billing tables
CREATE TRIGGER trigger_billing_student_bills_updated_at
  BEFORE UPDATE ON public.billing_student_bills
  FOR EACH ROW
  EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER trigger_billing_receipts_updated_at
  BEFORE UPDATE ON public.billing_receipts
  FOR EACH ROW
  EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER trigger_billing_discounts_updated_at
  BEFORE UPDATE ON public.billing_discounts
  FOR EACH ROW
  EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER trigger_billing_refunds_updated_at
  BEFORE UPDATE ON public.billing_refunds
  FOR EACH ROW
  EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER trigger_billing_invoices_updated_at
  BEFORE UPDATE ON public.billing_invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_billing_updated_at();

-- Create RLS policies for billing tables
ALTER TABLE public.billing_student_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoice_items ENABLE ROW LEVEL SECURITY;

-- Create policies for billing_student_bills
CREATE POLICY "Users can view billing student bills" 
  ON public.billing_student_bills FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert billing student bills" 
  ON public.billing_student_bills FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update billing student bills" 
  ON public.billing_student_bills FOR UPDATE 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can delete billing student bills" 
  ON public.billing_student_bills FOR DELETE 
  USING (auth.role() = 'authenticated');

-- Create policies for billing_receipts
CREATE POLICY "Users can view billing receipts" 
  ON public.billing_receipts FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert billing receipts" 
  ON public.billing_receipts FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update billing receipts" 
  ON public.billing_receipts FOR UPDATE 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can delete billing receipts" 
  ON public.billing_receipts FOR DELETE 
  USING (auth.role() = 'authenticated');

-- Create policies for other tables (similar pattern)
CREATE POLICY "Users can manage billing receipt items" 
  ON public.billing_receipt_items FOR ALL 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage billing discounts" 
  ON public.billing_discounts FOR ALL 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage billing refunds" 
  ON public.billing_refunds FOR ALL 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage billing invoices" 
  ON public.billing_invoices FOR ALL 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage billing invoice items" 
  ON public.billing_invoice_items FOR ALL 
  USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT ALL ON public.billing_student_bills TO authenticated;
GRANT ALL ON public.billing_receipts TO authenticated;
GRANT ALL ON public.billing_receipt_items TO authenticated;
GRANT ALL ON public.billing_discounts TO authenticated;
GRANT ALL ON public.billing_refunds TO authenticated;
GRANT ALL ON public.billing_invoices TO authenticated;
GRANT ALL ON public.billing_invoice_items TO authenticated;

-- Create function to generate receipt numbers
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TEXT AS $$
DECLARE
  year_part TEXT;
  sequence_num INTEGER;
  receipt_num TEXT;
BEGIN
  year_part := EXTRACT(YEAR FROM NOW())::TEXT;
  
  -- Get the next sequence number for this year
  SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM 9) AS INTEGER)), 0) + 1
  INTO sequence_num
  FROM public.billing_receipts
  WHERE receipt_number LIKE 'RCP-' || year_part || '-%';
  
  -- Format: RCP-YYYY-NNNNNN
  receipt_num := 'RCP-' || year_part || '-' || LPAD(sequence_num::TEXT, 6, '0');
  
  RETURN receipt_num;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate invoice numbers
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  year_part TEXT;
  sequence_num INTEGER;
  invoice_num TEXT;
BEGIN
  year_part := EXTRACT(YEAR FROM NOW())::TEXT;
  
  -- Get the next sequence number for this year
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 9) AS INTEGER)), 0) + 1
  INTO sequence_num
  FROM public.billing_invoices
  WHERE invoice_number LIKE 'INV-' || year_part || '-%';
  
  -- Format: INV-YYYY-NNNNNN
  invoice_num := 'INV-' || year_part || '-' || LPAD(sequence_num::TEXT, 6, '0');
  
  RETURN invoice_num;
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate outstanding amount for a student
CREATE OR REPLACE FUNCTION calculate_student_outstanding(student_uuid UUID)
RETURNS DECIMAL(10,2) AS $$
DECLARE
  outstanding_amount DECIMAL(10,2);
BEGIN
  SELECT COALESCE(SUM(
    CASE 
      WHEN status = 'paid' THEN 0
      WHEN status = 'partially_paid' THEN balance_amount
      ELSE final_amount
    END
  ), 0)
  INTO outstanding_amount
  FROM public.billing_student_bills
  WHERE student_id = student_uuid
    AND status IN ('unpaid', 'partially_paid', 'overdue');
  
  RETURN outstanding_amount;
END;
$$ LANGUAGE plpgsql;

-- Create function to update bill status based on payments
CREATE OR REPLACE FUNCTION update_bill_status()
RETURNS TRIGGER AS $$
DECLARE
  total_paid DECIMAL(10,2);
  bill_amount DECIMAL(10,2);
BEGIN
  -- Calculate total amount paid for this bill
  SELECT COALESCE(SUM(bri.amount_paid), 0)
  INTO total_paid
  FROM public.billing_receipt_items bri
  WHERE bri.bill_id = NEW.bill_id;
  
  -- Get the bill's final amount
  SELECT final_amount
  INTO bill_amount
  FROM public.billing_student_bills
  WHERE id = NEW.bill_id;
  
  -- Update bill status based on payment
  IF total_paid >= bill_amount THEN
    UPDATE public.billing_student_bills
    SET status = 'paid',
        balance_amount = 0,
        payment_date = NOW()
    WHERE id = NEW.bill_id;
  ELSIF total_paid > 0 THEN
    UPDATE public.billing_student_bills
    SET status = 'partially_paid',
        balance_amount = bill_amount - total_paid
    WHERE id = NEW.bill_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update bill status when receipt items are added
CREATE TRIGGER trigger_update_bill_status_on_payment
  AFTER INSERT OR UPDATE ON public.billing_receipt_items
  FOR EACH ROW
  EXECUTE FUNCTION update_bill_status();

-- Create function to mark overdue bills
CREATE OR REPLACE FUNCTION mark_overdue_bills()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.billing_student_bills
  SET status = 'overdue'
  WHERE status IN ('unpaid', 'partially_paid')
    AND due_date < CURRENT_DATE;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_billing_receipts_student_id ON public.billing_receipts(student_id);
CREATE INDEX IF NOT EXISTS idx_billing_receipts_institution_id ON public.billing_receipts(institution_id);
CREATE INDEX IF NOT EXISTS idx_billing_receipts_receipt_number ON public.billing_receipts(receipt_number);
CREATE INDEX IF NOT EXISTS idx_billing_receipts_receipt_date ON public.billing_receipts(receipt_date);

CREATE INDEX IF NOT EXISTS idx_billing_receipt_items_receipt_id ON public.billing_receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_billing_receipt_items_bill_id ON public.billing_receipt_items(bill_id);

CREATE INDEX IF NOT EXISTS idx_billing_discounts_bill_id ON public.billing_discounts(bill_id);
CREATE INDEX IF NOT EXISTS idx_billing_discounts_approval_status ON public.billing_discounts(approval_status);

CREATE INDEX IF NOT EXISTS idx_billing_refunds_receipt_id ON public.billing_refunds(receipt_id);
CREATE INDEX IF NOT EXISTS idx_billing_refunds_approval_status ON public.billing_refunds(approval_status);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_student_id ON public.billing_invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_institution_id ON public.billing_invoices(institution_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_invoice_number ON public.billing_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_invoice_date ON public.billing_invoices(invoice_date);

CREATE INDEX IF NOT EXISTS idx_billing_invoice_items_invoice_id ON public.billing_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoice_items_receipt_id ON public.billing_invoice_items(receipt_id); 
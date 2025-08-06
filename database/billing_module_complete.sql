-- =====================================================
-- Billing Module Database Schema for MyJKKN
-- Generated from Project: kvizhngldtiuufknvehv
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- HELPER FUNCTIONS (Required for RLS Policies)
-- =====================================================

-- Function: check_permission (Already created in academic module)
-- Function: get_my_institution_id (Already created in academic module)  
-- Function: user_has_institution_access (Already created in academic module)

-- =====================================================
-- BILLING TRIGGER FUNCTIONS
-- =====================================================

-- Function: update_billing_updated_at
CREATE OR REPLACE FUNCTION public.update_billing_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- Function: update_billing_parent_categories_updated_at
CREATE OR REPLACE FUNCTION public.update_billing_parent_categories_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- Function: update_billing_sub_categories_updated_at
CREATE OR REPLACE FUNCTION public.update_billing_sub_categories_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- Function: update_billing_item_categories_updated_at
CREATE OR REPLACE FUNCTION public.update_billing_item_categories_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- Function: update_bill_status
CREATE OR REPLACE FUNCTION public.update_bill_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

-- Function: update_bill_status_on_delete
CREATE OR REPLACE FUNCTION public.update_bill_status_on_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

-- Function: update_bill_balance_on_amount_change
CREATE OR REPLACE FUNCTION public.update_bill_balance_on_amount_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

-- Function: update_bill_on_refund_status_change
CREATE OR REPLACE FUNCTION public.update_bill_on_refund_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_receipt_record RECORD;
  v_bill_id UUID;
  v_refund_amount DECIMAL(10,2);
BEGIN
  -- Only process when status changes to 'processed' or from 'processed'
  IF (NEW.approval_status = 'processed' AND OLD.approval_status != 'processed') OR
     (OLD.approval_status = 'processed' AND NEW.approval_status != 'processed') THEN
    
    -- Get receipt information
    SELECT * INTO v_receipt_record
    FROM public.billing_receipts
    WHERE id = NEW.receipt_id;
    
    IF FOUND THEN
      v_refund_amount := NEW.refund_amount;
      
      -- Get all bills affected by this receipt
      FOR v_bill_id IN
        SELECT DISTINCT bill_id
        FROM public.billing_receipt_items
        WHERE receipt_id = NEW.receipt_id
      LOOP
        -- Recalculate bill status based on all payments and refunds
        PERFORM recalculate_bill_status_with_refunds(v_bill_id);
      END LOOP;
      
      -- Log the refund status change
      IF NEW.approval_status = 'processed' THEN
        RAISE NOTICE 'Refund % processed for receipt % - Amount: %', 
          NEW.id, NEW.receipt_id, v_refund_amount;
      ELSE
        RAISE NOTICE 'Refund % status changed from processed to % for receipt %', 
          NEW.id, NEW.approval_status, NEW.receipt_id;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Function: trigger_refresh_student_billing_summary
CREATE OR REPLACE FUNCTION public.trigger_refresh_student_billing_summary()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Determine which student to refresh based on the operation
  DECLARE
    affected_student_id UUID;
  BEGIN
    IF TG_TABLE_NAME = 'billing_student_bills' THEN
      affected_student_id := COALESCE(NEW.student_id, OLD.student_id);
    ELSIF TG_TABLE_NAME = 'billing_receipts' THEN
      affected_student_id := COALESCE(NEW.student_id, OLD.student_id);
    ELSIF TG_TABLE_NAME = 'billing_refunds' THEN
      -- Get student_id through receipt
      SELECT r.student_id INTO affected_student_id
      FROM public.billing_receipts r
      WHERE r.id = COALESCE(NEW.receipt_id, OLD.receipt_id);
    END IF;
    
    -- Refresh the materialized view for this student
    IF affected_student_id IS NOT NULL THEN
      PERFORM refresh_student_billing_summary(affected_student_id);
    END IF;
    
    RETURN COALESCE(NEW, OLD);
  END;
END;
$function$;

-- =====================================================
-- BILLING HELPER FUNCTIONS
-- =====================================================

-- Function: recalculate_bill_status_with_refunds
CREATE OR REPLACE FUNCTION public.recalculate_bill_status_with_refunds(p_bill_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  total_paid DECIMAL(10,2);
  total_refunded DECIMAL(10,2);
  net_paid DECIMAL(10,2);
  bill_amount DECIMAL(10,2);
BEGIN
  -- Calculate total amount paid for this bill
  SELECT COALESCE(SUM(bri.amount_paid), 0)
  INTO total_paid
  FROM public.billing_receipt_items bri
  WHERE bri.bill_id = p_bill_id;
  
  -- Calculate total processed refunds for this bill
  SELECT COALESCE(SUM(br.refund_amount), 0)
  INTO total_refunded
  FROM public.billing_refunds br
  JOIN public.billing_receipt_items bri ON br.receipt_id = bri.receipt_id
  WHERE bri.bill_id = p_bill_id 
    AND br.approval_status = 'processed';
  
  -- Calculate net paid amount (paid - refunded)
  net_paid := total_paid - total_refunded;
  
  -- Get the bill's final amount
  SELECT final_amount
  INTO bill_amount
  FROM public.billing_student_bills
  WHERE id = p_bill_id;
  
  -- Update bill status based on net payment
  IF net_paid >= bill_amount THEN
    UPDATE public.billing_student_bills
    SET status = 'paid',
        balance_amount = 0,
        payment_date = NOW()
    WHERE id = p_bill_id;
  ELSIF net_paid > 0 THEN
    UPDATE public.billing_student_bills
    SET status = 'partially_paid',
        balance_amount = bill_amount - net_paid
    WHERE id = p_bill_id;
  ELSE
    UPDATE public.billing_student_bills
    SET status = 'unpaid',
        balance_amount = bill_amount,
        payment_date = NULL
    WHERE id = p_bill_id;
  END IF;
  
  RAISE NOTICE 'Recalculated bill % status: paid=%, refunded=%, net=%, bill_amount=%', 
    p_bill_id, total_paid, total_refunded, net_paid, bill_amount;
END;
$function$;

-- Function: generate_auto_invoice_for_bill
CREATE OR REPLACE FUNCTION public.generate_auto_invoice_for_bill(p_bill_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
      br.payment_paid_date
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
$function$;

-- Function: refresh_student_billing_summary
CREATE OR REPLACE FUNCTION public.refresh_student_billing_summary(student_uuid uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF student_uuid IS NOT NULL THEN
    -- Refresh for specific student (much faster)
    DELETE FROM public.mv_student_billing_summary WHERE student_id = student_uuid;
    
    INSERT INTO public.mv_student_billing_summary
    SELECT 
      s.id as student_id,
      s.student_name,
      s.roll_number,
      COUNT(DISTINCT b.id) as total_bills,
      COALESCE(SUM(b.final_amount), 0) as total_bill_amount,
      COALESCE(SUM(b.balance_amount), 0) as total_outstanding,
      COUNT(DISTINCT CASE WHEN b.status = 'paid' THEN b.id END) as paid_bills,
      COUNT(DISTINCT CASE WHEN b.status = 'unpaid' THEN b.id END) as unpaid_bills,
      COUNT(DISTINCT CASE WHEN b.status = 'partially_paid' THEN b.id END) as partially_paid_bills,
      COUNT(DISTINCT CASE WHEN b.status = 'overdue' THEN b.id END) as overdue_bills,
      COUNT(DISTINCT r.id) as total_receipts,
      COALESCE(SUM(r.payment_amount), 0) as total_receipt_amount,
      COUNT(DISTINCT ref.id) as total_refunds,
      COALESCE(SUM(CASE WHEN ref.approval_status = 'processed' THEN ref.refund_amount ELSE 0 END), 0) as total_processed_refunds,
      MAX(r.receipt_date) as last_payment_date,
      MAX(b.updated_at) as last_bill_update,
      NOW() as summary_generated_at
    FROM public.students s
    LEFT JOIN public.billing_student_bills b ON s.id = b.student_id
    LEFT JOIN public.billing_receipts r ON s.id = r.student_id
    LEFT JOIN public.billing_refunds ref ON r.id = ref.receipt_id
    WHERE s.id = student_uuid
    GROUP BY s.id, s.student_name, s.roll_number;
  ELSE
    -- Full refresh (use sparingly)
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_student_billing_summary;
  END IF;
END;
$function$;

-- =====================================================
-- TABLE: billing_parent_categories
-- =====================================================

CREATE TABLE IF NOT EXISTS public.billing_parent_categories (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    institution_id uuid NOT NULL,
    parent_category_name character varying(100) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT billing_parent_categories_pkey PRIMARY KEY (id),
    CONSTRAINT uk_billing_parent_categories_institution_name UNIQUE (institution_id, parent_category_name)
);

-- Add foreign key constraints after table creation
ALTER TABLE public.billing_parent_categories 
    ADD CONSTRAINT fk_billing_parent_categories_institution 
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;

ALTER TABLE public.billing_parent_categories 
    ADD CONSTRAINT fk_billing_parent_categories_created_by 
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.billing_parent_categories 
    ADD CONSTRAINT fk_billing_parent_categories_updated_by 
    FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Indexes for billing_parent_categories
CREATE INDEX IF NOT EXISTS idx_billing_parent_categories_institution_id 
    ON public.billing_parent_categories USING btree (institution_id);

CREATE INDEX IF NOT EXISTS idx_billing_parent_categories_is_active 
    ON public.billing_parent_categories USING btree (is_active);

CREATE INDEX IF NOT EXISTS idx_billing_parent_categories_parent_category_name 
    ON public.billing_parent_categories USING btree (parent_category_name);

CREATE UNIQUE INDEX IF NOT EXISTS uk_billing_parent_categories_institution_name 
    ON public.billing_parent_categories USING btree (institution_id, parent_category_name);

-- =====================================================
-- TABLE: billing_sub_categories
-- =====================================================

CREATE TABLE IF NOT EXISTS public.billing_sub_categories (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    institution_id uuid NOT NULL,
    parent_category_id uuid NOT NULL,
    sub_category_name character varying(100) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT billing_sub_categories_pkey PRIMARY KEY (id),
    CONSTRAINT uk_billing_sub_categories_parent_name UNIQUE (parent_category_id, sub_category_name)
);

-- Add foreign key constraints after table creation
ALTER TABLE public.billing_sub_categories 
    ADD CONSTRAINT fk_billing_sub_categories_institution 
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;

ALTER TABLE public.billing_sub_categories 
    ADD CONSTRAINT fk_billing_sub_categories_parent_category 
    FOREIGN KEY (parent_category_id) REFERENCES billing_parent_categories(id) ON DELETE CASCADE;

ALTER TABLE public.billing_sub_categories 
    ADD CONSTRAINT fk_billing_sub_categories_created_by 
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.billing_sub_categories 
    ADD CONSTRAINT fk_billing_sub_categories_updated_by 
    FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Indexes for billing_sub_categories
CREATE INDEX IF NOT EXISTS idx_billing_sub_categories_institution_id 
    ON public.billing_sub_categories USING btree (institution_id);

CREATE INDEX IF NOT EXISTS idx_billing_sub_categories_is_active 
    ON public.billing_sub_categories USING btree (is_active);

CREATE INDEX IF NOT EXISTS idx_billing_sub_categories_parent_category_id 
    ON public.billing_sub_categories USING btree (parent_category_id);

CREATE INDEX IF NOT EXISTS idx_billing_sub_categories_sub_category_name 
    ON public.billing_sub_categories USING btree (sub_category_name);

CREATE UNIQUE INDEX IF NOT EXISTS uk_billing_sub_categories_parent_name 
    ON public.billing_sub_categories USING btree (parent_category_id, sub_category_name);

-- =====================================================
-- TABLE: billing_item_categories
-- =====================================================

CREATE TABLE IF NOT EXISTS public.billing_item_categories (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    institution_id uuid NOT NULL,
    parent_category_id uuid NOT NULL,
    sub_category_id uuid NOT NULL,
    item_category_name character varying(150) NOT NULL,
    amount numeric(10,2),
    frequency character varying(20) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT billing_item_categories_pkey PRIMARY KEY (id),
    CONSTRAINT uk_billing_item_categories_sub_name UNIQUE (sub_category_id, item_category_name),
    CONSTRAINT billing_item_categories_frequency_check CHECK (frequency::text = ANY (ARRAY['monthly'::character varying, 'quarterly'::character varying, 'yearly'::character varying, 'one-time'::character varying]::text[])),
    CONSTRAINT chk_billing_item_categories_amount_positive CHECK ((amount IS NULL) OR (amount > 0::numeric))
);

-- Add foreign key constraints after table creation
ALTER TABLE public.billing_item_categories 
    ADD CONSTRAINT fk_billing_item_categories_institution 
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;

ALTER TABLE public.billing_item_categories 
    ADD CONSTRAINT fk_billing_item_categories_parent_category 
    FOREIGN KEY (parent_category_id) REFERENCES billing_parent_categories(id) ON DELETE CASCADE;

ALTER TABLE public.billing_item_categories 
    ADD CONSTRAINT fk_billing_item_categories_sub_category 
    FOREIGN KEY (sub_category_id) REFERENCES billing_sub_categories(id) ON DELETE CASCADE;

ALTER TABLE public.billing_item_categories 
    ADD CONSTRAINT fk_billing_item_categories_created_by 
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.billing_item_categories 
    ADD CONSTRAINT fk_billing_item_categories_updated_by 
    FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Indexes for billing_item_categories
CREATE INDEX IF NOT EXISTS idx_billing_item_categories_frequency 
    ON public.billing_item_categories USING btree (frequency);

CREATE INDEX IF NOT EXISTS idx_billing_item_categories_institution_id 
    ON public.billing_item_categories USING btree (institution_id);

CREATE INDEX IF NOT EXISTS idx_billing_item_categories_is_active 
    ON public.billing_item_categories USING btree (is_active);

CREATE INDEX IF NOT EXISTS idx_billing_item_categories_parent_category_id 
    ON public.billing_item_categories USING btree (parent_category_id);

CREATE INDEX IF NOT EXISTS idx_billing_item_categories_sub_category_id 
    ON public.billing_item_categories USING btree (sub_category_id);

CREATE UNIQUE INDEX IF NOT EXISTS uk_billing_item_categories_sub_name 
    ON public.billing_item_categories USING btree (sub_category_id, item_category_name);

-- =====================================================
-- TABLE: billing_student_bills
-- =====================================================

CREATE TABLE IF NOT EXISTS public.billing_student_bills (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    student_id uuid NOT NULL,
    institution_id uuid NOT NULL,
    item_category_id uuid NOT NULL,
    bill_description text NOT NULL,
    due_date date NOT NULL,
    quantity integer DEFAULT 1,
    unit_amount numeric(10,2) NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    tax_amount numeric(10,2) DEFAULT 0,
    final_amount numeric(10,2) NOT NULL,
    status character varying(20) DEFAULT 'unpaid'::character varying,
    payment_date timestamp with time zone,
    balance_amount numeric(10,2) DEFAULT 0,
    remarks text,
    is_recurring boolean DEFAULT false,
    recurrence_pattern character varying(20),
    number_of_recurrences integer,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT billing_student_bills_pkey PRIMARY KEY (id),
    CONSTRAINT billing_student_bills_balance_amount_check CHECK (balance_amount >= 0::numeric),
    CONSTRAINT billing_student_bills_final_amount_check CHECK (final_amount >= 0::numeric),
    CONSTRAINT billing_student_bills_quantity_check CHECK (quantity > 0),
    CONSTRAINT billing_student_bills_recurrence_pattern_check CHECK (recurrence_pattern::text = ANY (ARRAY['monthly'::character varying, 'quarterly'::character varying, 'yearly'::character varying]::text[])),
    CONSTRAINT billing_student_bills_status_check CHECK (status::text = ANY (ARRAY['paid'::character varying, 'unpaid'::character varying, 'partially_paid'::character varying, 'cancelled'::character varying, 'overdue'::character varying]::text[])),
    CONSTRAINT billing_student_bills_tax_amount_check CHECK (tax_amount >= 0::numeric),
    CONSTRAINT billing_student_bills_total_amount_check CHECK (total_amount >= 0::numeric),
    CONSTRAINT billing_student_bills_unit_amount_check CHECK (unit_amount >= 0::numeric)
);

-- Add foreign key constraints after table creation
ALTER TABLE public.billing_student_bills 
    ADD CONSTRAINT fk_billing_student_bills_institution 
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;

ALTER TABLE public.billing_student_bills 
    ADD CONSTRAINT fk_billing_student_bills_item_category 
    FOREIGN KEY (item_category_id) REFERENCES billing_item_categories(id) ON DELETE RESTRICT;

ALTER TABLE public.billing_student_bills 
    ADD CONSTRAINT fk_billing_student_bills_student 
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

-- Indexes for billing_student_bills
CREATE INDEX IF NOT EXISTS idx_billing_student_bills_created_at 
    ON public.billing_student_bills USING btree (created_at);

CREATE INDEX IF NOT EXISTS idx_billing_student_bills_due_date 
    ON public.billing_student_bills USING btree (due_date);

CREATE INDEX IF NOT EXISTS idx_billing_student_bills_institution_id 
    ON public.billing_student_bills USING btree (institution_id);

CREATE INDEX IF NOT EXISTS idx_billing_student_bills_item_category_id 
    ON public.billing_student_bills USING btree (item_category_id);

CREATE INDEX IF NOT EXISTS idx_billing_student_bills_status 
    ON public.billing_student_bills USING btree (status);

CREATE INDEX IF NOT EXISTS idx_billing_student_bills_student_id 
    ON public.billing_student_bills USING btree (student_id);

CREATE INDEX IF NOT EXISTS idx_billing_student_bills_student_status 
    ON public.billing_student_bills USING btree (student_id, status) 
    WHERE status::text = ANY (ARRAY['unpaid'::character varying, 'partially_paid'::character varying, 'overdue'::character varying]::text[]);

-- =====================================================
-- TABLE: billing_receipts
-- =====================================================

CREATE TABLE IF NOT EXISTS public.billing_receipts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    receipt_number character varying(50) NOT NULL,
    receipt_date date NOT NULL,
    student_id uuid NOT NULL,
    institution_id uuid NOT NULL,
    payment_mode character varying(20) NOT NULL,
    payment_reference_number character varying(100),
    payment_amount numeric(10,2) NOT NULL,
    payment_paid_date date NOT NULL,
    payer_name character varying(255) NOT NULL,
    payer_contact character varying(20),
    accountant_id uuid,
    payment_remarks text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT billing_receipts_pkey PRIMARY KEY (id),
    CONSTRAINT billing_receipts_receipt_number_key UNIQUE (receipt_number),
    CONSTRAINT billing_receipts_payment_amount_check CHECK (payment_amount > 0::numeric),
    CONSTRAINT billing_receipts_payment_mode_check CHECK (payment_mode::text = ANY (ARRAY['cash'::character varying, 'online'::character varying, 'bank_transfer'::character varying, 'dd'::character varying, 'cheque'::character varying]::text[]))
);

-- Add foreign key constraints after table creation
ALTER TABLE public.billing_receipts 
    ADD CONSTRAINT fk_billing_receipts_accountant 
    FOREIGN KEY (accountant_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.billing_receipts 
    ADD CONSTRAINT fk_billing_receipts_institution 
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;

ALTER TABLE public.billing_receipts 
    ADD CONSTRAINT fk_billing_receipts_student 
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

-- Indexes for billing_receipts
CREATE INDEX IF NOT EXISTS idx_billing_receipts_accountant_id 
    ON public.billing_receipts USING btree (accountant_id);

CREATE INDEX IF NOT EXISTS idx_billing_receipts_institution_id 
    ON public.billing_receipts USING btree (institution_id);

CREATE INDEX IF NOT EXISTS idx_billing_receipts_receipt_date 
    ON public.billing_receipts USING btree (receipt_date);

CREATE INDEX IF NOT EXISTS idx_billing_receipts_receipt_number 
    ON public.billing_receipts USING btree (receipt_number);

CREATE INDEX IF NOT EXISTS idx_billing_receipts_student_date 
    ON public.billing_receipts USING btree (student_id, receipt_date DESC);

CREATE INDEX IF NOT EXISTS idx_billing_receipts_student_id 
    ON public.billing_receipts USING btree (student_id);

CREATE UNIQUE INDEX IF NOT EXISTS billing_receipts_receipt_number_key 
    ON public.billing_receipts USING btree (receipt_number);

-- =====================================================
-- TABLE: billing_receipt_items
-- =====================================================

CREATE TABLE IF NOT EXISTS public.billing_receipt_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    receipt_id uuid NOT NULL,
    bill_id uuid NOT NULL,
    amount_paid numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT billing_receipt_items_pkey PRIMARY KEY (id),
    CONSTRAINT billing_receipt_items_receipt_id_bill_id_key UNIQUE (receipt_id, bill_id),
    CONSTRAINT billing_receipt_items_amount_paid_check CHECK (amount_paid > 0::numeric)
);

-- Add foreign key constraints after table creation
ALTER TABLE public.billing_receipt_items 
    ADD CONSTRAINT fk_billing_receipt_items_bill 
    FOREIGN KEY (bill_id) REFERENCES billing_student_bills(id) ON DELETE CASCADE;

ALTER TABLE public.billing_receipt_items 
    ADD CONSTRAINT fk_billing_receipt_items_receipt 
    FOREIGN KEY (receipt_id) REFERENCES billing_receipts(id) ON DELETE CASCADE;

-- Indexes for billing_receipt_items
CREATE INDEX IF NOT EXISTS idx_billing_receipt_items_bill_amount 
    ON public.billing_receipt_items USING btree (bill_id, amount_paid);

CREATE INDEX IF NOT EXISTS idx_billing_receipt_items_bill_id 
    ON public.billing_receipt_items USING btree (bill_id);

CREATE INDEX IF NOT EXISTS idx_billing_receipt_items_receipt_id 
    ON public.billing_receipt_items USING btree (receipt_id);

CREATE UNIQUE INDEX IF NOT EXISTS billing_receipt_items_receipt_id_bill_id_key 
    ON public.billing_receipt_items USING btree (receipt_id, bill_id);

-- =====================================================
-- TABLE: billing_invoices
-- =====================================================

CREATE TABLE IF NOT EXISTS public.billing_invoices (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    invoice_number character varying(50) NOT NULL,
    invoice_type character varying(20) NOT NULL,
    invoice_date date NOT NULL,
    student_id uuid NOT NULL,
    institution_id uuid NOT NULL,
    billing_period_from date,
    billing_period_to date,
    invoice_description text,
    tax_summary jsonb,
    payment_terms text,
    due_date date,
    additional_charges numeric(10,2) DEFAULT 0,
    discount_applied numeric(10,2) DEFAULT 0,
    grand_total numeric(10,2) NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT billing_invoices_pkey PRIMARY KEY (id),
    CONSTRAINT billing_invoices_invoice_number_key UNIQUE (invoice_number),
    CONSTRAINT billing_invoices_additional_charges_check CHECK (additional_charges >= 0::numeric),
    CONSTRAINT billing_invoices_discount_applied_check CHECK (discount_applied >= 0::numeric),
    CONSTRAINT billing_invoices_grand_total_check CHECK (grand_total >= 0::numeric),
    CONSTRAINT billing_invoices_invoice_type_check CHECK (invoice_type::text = ANY (ARRAY['individual'::character varying, 'consolidated'::character varying]::text[]))
);

-- Add foreign key constraints after table creation
ALTER TABLE public.billing_invoices 
    ADD CONSTRAINT fk_billing_invoices_institution 
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;

ALTER TABLE public.billing_invoices 
    ADD CONSTRAINT fk_billing_invoices_student 
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

-- Indexes for billing_invoices
CREATE INDEX IF NOT EXISTS idx_billing_invoices_institution_id 
    ON public.billing_invoices USING btree (institution_id);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_invoice_date 
    ON public.billing_invoices USING btree (invoice_date);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_invoice_number 
    ON public.billing_invoices USING btree (invoice_number);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_student_id 
    ON public.billing_invoices USING btree (student_id);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_student_type 
    ON public.billing_invoices USING btree (student_id, invoice_type);

CREATE UNIQUE INDEX IF NOT EXISTS billing_invoices_invoice_number_key 
    ON public.billing_invoices USING btree (invoice_number);

-- =====================================================
-- TABLE: billing_invoice_items
-- =====================================================

CREATE TABLE IF NOT EXISTS public.billing_invoice_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    invoice_id uuid NOT NULL,
    receipt_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT billing_invoice_items_pkey PRIMARY KEY (id),
    CONSTRAINT billing_invoice_items_invoice_id_receipt_id_key UNIQUE (invoice_id, receipt_id),
    CONSTRAINT billing_invoice_items_amount_check CHECK (amount > 0::numeric)
);

-- Add foreign key constraints after table creation
ALTER TABLE public.billing_invoice_items 
    ADD CONSTRAINT fk_billing_invoice_items_invoice 
    FOREIGN KEY (invoice_id) REFERENCES billing_invoices(id) ON DELETE CASCADE;

ALTER TABLE public.billing_invoice_items 
    ADD CONSTRAINT fk_billing_invoice_items_receipt 
    FOREIGN KEY (receipt_id) REFERENCES billing_receipts(id) ON DELETE CASCADE;

-- Indexes for billing_invoice_items
CREATE INDEX IF NOT EXISTS idx_billing_invoice_items_invoice_id 
    ON public.billing_invoice_items USING btree (invoice_id);

CREATE INDEX IF NOT EXISTS idx_billing_invoice_items_receipt_id 
    ON public.billing_invoice_items USING btree (receipt_id);

CREATE UNIQUE INDEX IF NOT EXISTS billing_invoice_items_invoice_id_receipt_id_key 
    ON public.billing_invoice_items USING btree (invoice_id, receipt_id);

-- =====================================================
-- TABLE: billing_discounts
-- =====================================================

CREATE TABLE IF NOT EXISTS public.billing_discounts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    bill_id uuid NOT NULL,
    discount_category character varying(50) NOT NULL,
    discount_type character varying(20) NOT NULL,
    discount_value numeric(10,2) NOT NULL,
    discount_amount numeric(10,2) NOT NULL,
    discount_reason text NOT NULL,
    supporting_documents jsonb,
    authorizer_id uuid,
    approval_date date,
    approval_status character varying(20) DEFAULT 'pending'::character varying,
    effective_date date NOT NULL,
    expiry_date date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT billing_discounts_pkey PRIMARY KEY (id),
    CONSTRAINT billing_discounts_approval_status_check CHECK (approval_status::text = ANY (ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying]::text[])),
    CONSTRAINT billing_discounts_discount_amount_check CHECK (discount_amount > 0::numeric),
    CONSTRAINT billing_discounts_discount_category_check CHECK (discount_category::text = ANY (ARRAY['merit_scholarship'::character varying, 'financial_aid'::character varying, 'staff_quota'::character varying, 'sports_quota'::character varying, 'special_circumstances'::character varying]::text[])),
    CONSTRAINT billing_discounts_discount_type_check CHECK (discount_type::text = ANY (ARRAY['amount'::character varying, 'percentage'::character varying]::text[])),
    CONSTRAINT billing_discounts_discount_value_check CHECK (discount_value > 0::numeric)
);

-- Add foreign key constraints after table creation
ALTER TABLE public.billing_discounts 
    ADD CONSTRAINT fk_billing_discounts_authorizer 
    FOREIGN KEY (authorizer_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.billing_discounts 
    ADD CONSTRAINT fk_billing_discounts_bill 
    FOREIGN KEY (bill_id) REFERENCES billing_student_bills(id) ON DELETE CASCADE;

-- Indexes for billing_discounts
CREATE INDEX IF NOT EXISTS idx_billing_discounts_approval_status 
    ON public.billing_discounts USING btree (approval_status);

CREATE INDEX IF NOT EXISTS idx_billing_discounts_authorizer_id 
    ON public.billing_discounts USING btree (authorizer_id);

CREATE INDEX IF NOT EXISTS idx_billing_discounts_bill_id 
    ON public.billing_discounts USING btree (bill_id);

-- =====================================================
-- TABLE: billing_refunds
-- =====================================================

CREATE TABLE IF NOT EXISTS public.billing_refunds (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    receipt_id uuid NOT NULL,
    refund_category character varying(50) NOT NULL,
    refund_amount numeric(10,2) NOT NULL,
    refund_date date NOT NULL,
    refund_method character varying(20) NOT NULL,
    bank_details jsonb,
    refund_reason text NOT NULL,
    supporting_documents jsonb,
    authorizer_id uuid,
    processing_fee numeric(10,2) DEFAULT 0,
    net_refund_amount numeric(10,2) NOT NULL,
    approval_status character varying(20) DEFAULT 'pending'::character varying,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    approved_by uuid,
    CONSTRAINT billing_refunds_pkey PRIMARY KEY (id),
    CONSTRAINT billing_refunds_approval_status_check CHECK (approval_status::text = ANY (ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'processed'::character varying]::text[])),
    CONSTRAINT billing_refunds_net_refund_amount_check CHECK (net_refund_amount > 0::numeric),
    CONSTRAINT billing_refunds_processing_fee_check CHECK (processing_fee >= 0::numeric),
    CONSTRAINT billing_refunds_refund_amount_check CHECK (refund_amount > 0::numeric),
    CONSTRAINT billing_refunds_refund_category_check CHECK (refund_category::text = ANY (ARRAY['course_change'::character varying, 'withdrawal'::character varying, 'overpayment'::character varying, 'duplicate_payment'::character varying, 'administrative_error'::character varying, 'service_not_provided'::character varying, 'system_error'::character varying, 'other'::character varying]::text[])),
    CONSTRAINT billing_refunds_refund_method_check CHECK (refund_method::text = ANY (ARRAY['cash'::character varying, 'bank_transfer'::character varying, 'adjust_future_bills'::character varying, 'cheque'::character varying, 'online_transfer'::character varying]::text[]))
);

-- Add foreign key constraints after table creation
ALTER TABLE public.billing_refunds 
    ADD CONSTRAINT fk_billing_refunds_approved_by 
    FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.billing_refunds 
    ADD CONSTRAINT fk_billing_refunds_authorizer 
    FOREIGN KEY (authorizer_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.billing_refunds 
    ADD CONSTRAINT fk_billing_refunds_receipt 
    FOREIGN KEY (receipt_id) REFERENCES billing_receipts(id) ON DELETE CASCADE;

-- Indexes for billing_refunds
CREATE INDEX IF NOT EXISTS idx_billing_refunds_approval_status 
    ON public.billing_refunds USING btree (approval_status);

CREATE INDEX IF NOT EXISTS idx_billing_refunds_approved_by 
    ON public.billing_refunds USING btree (approved_by);

CREATE INDEX IF NOT EXISTS idx_billing_refunds_authorizer_id 
    ON public.billing_refunds USING btree (authorizer_id);

CREATE INDEX IF NOT EXISTS idx_billing_refunds_receipt_id 
    ON public.billing_refunds USING btree (receipt_id);

CREATE INDEX IF NOT EXISTS idx_billing_refunds_receipt_status 
    ON public.billing_refunds USING btree (receipt_id, approval_status) 
    WHERE approval_status::text = 'processed'::text;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Triggers for billing_parent_categories
CREATE TRIGGER trigger_billing_parent_categories_updated_at 
    BEFORE UPDATE ON public.billing_parent_categories 
    FOR EACH ROW EXECUTE FUNCTION update_billing_parent_categories_updated_at();

-- Triggers for billing_sub_categories
CREATE TRIGGER trigger_billing_sub_categories_updated_at 
    BEFORE UPDATE ON public.billing_sub_categories 
    FOR EACH ROW EXECUTE FUNCTION update_billing_sub_categories_updated_at();

-- Triggers for billing_item_categories
CREATE TRIGGER trigger_billing_item_categories_updated_at 
    BEFORE UPDATE ON public.billing_item_categories 
    FOR EACH ROW EXECUTE FUNCTION update_billing_item_categories_updated_at();

-- Triggers for billing_student_bills
CREATE TRIGGER trigger_billing_student_bills_updated_at 
    BEFORE UPDATE ON public.billing_student_bills 
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER trigger_bills_refresh_summary 
    AFTER INSERT OR DELETE OR UPDATE ON public.billing_student_bills 
    FOR EACH ROW EXECUTE FUNCTION trigger_refresh_student_billing_summary();

CREATE TRIGGER trigger_update_bill_balance_on_amount_change 
    AFTER UPDATE ON public.billing_student_bills 
    FOR EACH ROW EXECUTE FUNCTION update_bill_balance_on_amount_change();

-- Triggers for billing_receipts
CREATE TRIGGER trigger_billing_receipts_updated_at 
    BEFORE UPDATE ON public.billing_receipts 
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER trigger_receipts_refresh_summary 
    AFTER INSERT OR DELETE OR UPDATE ON public.billing_receipts 
    FOR EACH ROW EXECUTE FUNCTION trigger_refresh_student_billing_summary();

-- Triggers for billing_receipt_items
CREATE TRIGGER trigger_update_bill_status_on_payment 
    AFTER INSERT OR UPDATE ON public.billing_receipt_items 
    FOR EACH ROW EXECUTE FUNCTION update_bill_status();

CREATE TRIGGER trigger_update_bill_status_on_delete 
    AFTER DELETE ON public.billing_receipt_items 
    FOR EACH ROW EXECUTE FUNCTION update_bill_status_on_delete();

-- Triggers for billing_invoices
CREATE TRIGGER trigger_billing_invoices_updated_at 
    BEFORE UPDATE ON public.billing_invoices 
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

-- Triggers for billing_discounts
CREATE TRIGGER trigger_billing_discounts_updated_at 
    BEFORE UPDATE ON public.billing_discounts 
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

-- Triggers for billing_refunds
CREATE TRIGGER trigger_billing_refunds_updated_at 
    BEFORE UPDATE ON public.billing_refunds 
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER trigger_refunds_refresh_summary 
    AFTER INSERT OR DELETE OR UPDATE ON public.billing_refunds 
    FOR EACH ROW EXECUTE FUNCTION trigger_refresh_student_billing_summary();

CREATE TRIGGER trigger_update_bill_on_refund_status_change 
    AFTER UPDATE ON public.billing_refunds 
    FOR EACH ROW EXECUTE FUNCTION update_bill_on_refund_status_change();

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE public.billing_parent_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_sub_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_student_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_refunds ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES: billing_parent_categories
-- =====================================================

CREATE POLICY "Authenticated users can create billing parent categories" ON public.billing_parent_categories
    FOR INSERT TO public
    WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "Users can delete billing parent categories" ON public.billing_parent_categories
    FOR DELETE TO public
    USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Users can update billing parent categories" ON public.billing_parent_categories
    FOR UPDATE TO public
    USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Users can view billing parent categories" ON public.billing_parent_categories
    FOR SELECT TO public
    USING (true);

-- =====================================================
-- RLS POLICIES: billing_sub_categories
-- =====================================================

CREATE POLICY "Authenticated users can create billing sub categories" ON public.billing_sub_categories
    FOR INSERT TO public
    WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "Users can delete billing sub categories" ON public.billing_sub_categories
    FOR DELETE TO public
    USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Users can update billing sub categories" ON public.billing_sub_categories
    FOR UPDATE TO public
    USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Users can view billing sub categories" ON public.billing_sub_categories
    FOR SELECT TO public
    USING (true);

-- =====================================================
-- RLS POLICIES: billing_item_categories
-- =====================================================

CREATE POLICY "Authenticated users can create billing item categories" ON public.billing_item_categories
    FOR INSERT TO public
    WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "Users can delete billing item categories" ON public.billing_item_categories
    FOR DELETE TO public
    USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Users can update billing item categories" ON public.billing_item_categories
    FOR UPDATE TO public
    USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Users can view billing item categories" ON public.billing_item_categories
    FOR SELECT TO public
    USING (true);

-- =====================================================
-- RLS POLICIES: billing_student_bills
-- =====================================================

CREATE POLICY "Admin users can delete billing student bills" ON public.billing_student_bills
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can insert billing student bills" ON public.billing_student_bills
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can update billing student bills" ON public.billing_student_bills
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can view all billing student bills" ON public.billing_student_bills
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Faculty users can delete institution billing student bills" ON public.billing_student_bills
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = billing_student_bills.institution_id))
    ));

CREATE POLICY "Faculty users can insert institution billing student bills" ON public.billing_student_bills
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = billing_student_bills.institution_id))
    ));

CREATE POLICY "Faculty users can update institution billing student bills" ON public.billing_student_bills
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = billing_student_bills.institution_id))
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = billing_student_bills.institution_id))
    ));

CREATE POLICY "Faculty users can view institution billing student bills" ON public.billing_student_bills
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = billing_student_bills.institution_id))
    ));

-- =====================================================
-- RLS POLICIES: billing_receipts
-- =====================================================

CREATE POLICY "Admin users can delete billing receipts" ON public.billing_receipts
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can insert billing receipts" ON public.billing_receipts
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can update billing receipts" ON public.billing_receipts
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can view all billing receipts" ON public.billing_receipts
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Faculty users can delete institution billing receipts" ON public.billing_receipts
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = billing_receipts.institution_id))
    ));

CREATE POLICY "Faculty users can insert institution billing receipts" ON public.billing_receipts
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = billing_receipts.institution_id))
    ));

CREATE POLICY "Faculty users can update institution billing receipts" ON public.billing_receipts
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = billing_receipts.institution_id))
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = billing_receipts.institution_id))
    ));

CREATE POLICY "Faculty users can view institution billing receipts" ON public.billing_receipts
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = billing_receipts.institution_id))
    ));

-- =====================================================
-- RLS POLICIES: billing_receipt_items
-- =====================================================

CREATE POLICY "Users can manage billing receipt items" ON public.billing_receipt_items
    FOR ALL TO public
    USING (auth.role() = 'authenticated'::text);

-- =====================================================
-- RLS POLICIES: billing_invoices
-- =====================================================

CREATE POLICY "Admin users can delete billing invoices" ON public.billing_invoices
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can insert billing invoices" ON public.billing_invoices
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can update billing invoices" ON public.billing_invoices
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can view all billing invoices" ON public.billing_invoices
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Faculty users can delete institution billing invoices" ON public.billing_invoices
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = billing_invoices.institution_id))
    ));

CREATE POLICY "Faculty users can insert institution billing invoices" ON public.billing_invoices
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = billing_invoices.institution_id))
    ));

CREATE POLICY "Faculty users can update institution billing invoices" ON public.billing_invoices
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = billing_invoices.institution_id))
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = billing_invoices.institution_id))
    ));

CREATE POLICY "Faculty users can view institution billing invoices" ON public.billing_invoices
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = billing_invoices.institution_id))
    ));

-- =====================================================
-- RLS POLICIES: billing_invoice_items
-- =====================================================

CREATE POLICY "Users can manage billing invoice items" ON public.billing_invoice_items
    FOR ALL TO public
    USING (auth.role() = 'authenticated'::text);

-- =====================================================
-- RLS POLICIES: billing_discounts
-- =====================================================

CREATE POLICY "Users can manage billing discounts" ON public.billing_discounts
    FOR ALL TO public
    USING (auth.role() = 'authenticated'::text);

-- =====================================================
-- RLS POLICIES: billing_refunds
-- =====================================================

CREATE POLICY "Users can manage billing refunds" ON public.billing_refunds
    FOR ALL TO public
    USING (auth.role() = 'authenticated'::text);

-- =====================================================
-- END OF BILLING MODULE DATABASE SCHEMA
-- =====================================================

-- Note: This SQL file contains all the necessary components to recreate
-- the billing module database structure including:
-- 1. All trigger functions for billing operations
-- 2. Helper functions for bill status management
-- 3. All tables with proper constraints, defaults, and relationships
-- 4. All indexes for performance optimization
-- 5. All triggers for automatic updates and business logic
-- 6. Complete RLS policies for security
-- 
-- Dependencies: 
-- - institutions, students, profiles, auth.users tables must exist
-- - Helper functions from academic module (check_permission, etc.) should exist
-- - mv_student_billing_summary materialized view should be created separately
-- 
-- Key Features:
-- - Hierarchical category system (parent -> sub -> item categories)
-- - Comprehensive billing workflow (bills -> receipts -> invoices)
-- - Advanced refund and discount management
-- - Automatic invoice generation on full payment
-- - Bill status tracking with refund consideration
-- - Student billing summary refresh triggers
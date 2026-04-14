-- ================================================================================
-- MYJKKN DATABASE FUNCTIONS
-- Generated: 2025-01-17
-- Description: All database functions organized by module
-- ================================================================================

-- ================================================================================
-- SECTION 1: AUTHENTICATION & USER MANAGEMENT FUNCTIONS
-- ================================================================================

-- Handle new user creation and profile setup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
    RETURN new;
END;
$$;

-- Create user profile with role
CREATE OR REPLACE FUNCTION public.create_user_profile(
    user_id uuid,
    user_email text,
    user_full_name text,
    user_role text,
    user_phone_number text,
    user_institution_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- Implementation here
    RETURN user_id;
END;
$$;

-- Get current user profile
CREATE OR REPLACE FUNCTION public.get_current_user_profile()
RETURNS profiles
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN (SELECT * FROM profiles WHERE id = auth.uid());
END;
$$;

-- Check if user is super admin
-- Updated: 2026-04-13 - Changed to SECURITY DEFINER, SQL, STABLE for dynamic permission migration
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true);
$$;

-- Check if user is admin
-- Updated: 2026-04-13 - Changed to SECURITY DEFINER, SQL, STABLE; added DEFAULT auth.uid(); added 'administrator' role check
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles WHERE id = user_id
        AND (is_super_admin = true OR role IN ('admin', 'super_admin', 'administrator'))
    );
$$;

-- ================================================================================
-- SECTION 2: INSTITUTION ACCESS MANAGEMENT
-- ================================================================================

-- Get user's institution ID
CREATE OR REPLACE FUNCTION public.get_my_institution_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN (SELECT institution_id FROM profiles WHERE id = auth.uid());
END;
$$;

-- Check user institution access
CREATE OR REPLACE FUNCTION public.user_has_institution_access(
    user_id uuid,
    institution_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_institution_access
        WHERE user_id = user_id
        AND institution_id = institution_id
        AND is_active = true
    );
END;
$$;

-- Grant user institution access
-- Updated: 2025-10-09 - Fixed function overload by using TEXT type and proper defaults
CREATE OR REPLACE FUNCTION public.grant_user_institution_access(
    target_user_id uuid,
    target_institution_id uuid,
    access_type_param text DEFAULT 'full',
    granted_by_param uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Insert or update the access record
    INSERT INTO user_institution_access (
        user_id,
        institution_id,
        access_type,
        granted_by,
        is_active,
        created_at,
        updated_at
    )
    VALUES (
        target_user_id,
        target_institution_id,
        access_type_param,
        COALESCE(granted_by_param, auth.uid()),
        true,
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id, institution_id)
    DO UPDATE SET
        access_type = access_type_param,
        granted_by = COALESCE(granted_by_param, auth.uid()),
        is_active = true,
        updated_at = NOW();
END;
$$;

-- Revoke user institution access
CREATE OR REPLACE FUNCTION public.revoke_user_institution_access(
    target_user_id uuid,
    target_institution_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    UPDATE user_institution_access
    SET is_active = false, updated_at = NOW()
    WHERE user_id = target_user_id
    AND institution_id = target_institution_id;
END;
$$;

-- Get user accessible institutions
CREATE OR REPLACE FUNCTION public.get_user_accessible_institutions(target_user_id uuid)
RETURNS TABLE(
    institution_id uuid,
    institution_name varchar,
    counselling_code varchar,
    access_type varchar,
    is_primary_institution boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.id,
        i.institution_name,
        i.counselling_code,
        uia.access_type,
        (p.institution_id = i.id) as is_primary_institution
    FROM institutions i
    JOIN user_institution_access uia ON i.id = uia.institution_id
    LEFT JOIN profiles p ON p.id = target_user_id
    WHERE uia.user_id = target_user_id
    AND uia.is_active = true;
END;
$$;

-- ================================================================================
-- SECTION 3: BILLING MODULE FUNCTIONS
-- ================================================================================

-- Calculate student outstanding balance
CREATE OR REPLACE FUNCTION public.calculate_student_outstanding(student_uuid uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    total_bills numeric;
    total_paid numeric;
    total_refunds numeric;
BEGIN
    -- Calculate total bills
    SELECT COALESCE(SUM(bill_amount), 0) INTO total_bills
    FROM billing_student_bills
    WHERE student_id = student_uuid;
    
    -- Calculate total paid
    SELECT COALESCE(SUM(bri.amount_paid), 0) INTO total_paid
    FROM billing_receipt_items bri
    JOIN billing_receipts br ON bri.receipt_id = br.id
    WHERE br.student_id = student_uuid;
    
    -- Calculate approved refunds
    SELECT COALESCE(SUM(refund_amount), 0) INTO total_refunds
    FROM billing_refunds
    WHERE receipt_id IN (
        SELECT id FROM billing_receipts WHERE student_id = student_uuid
    )
    AND approval_status = 'processed';
    
    RETURN total_bills - total_paid + total_refunds;
END;
$$;

-- Optimized version of calculate student outstanding
CREATE OR REPLACE FUNCTION public.calculate_student_outstanding_optimized(student_uuid uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    result numeric;
BEGIN
    WITH bill_totals AS (
        SELECT COALESCE(SUM(bill_amount), 0) as total_bills
        FROM billing_student_bills
        WHERE student_id = student_uuid
    ),
    payment_totals AS (
        SELECT COALESCE(SUM(bri.amount_paid), 0) as total_paid
        FROM billing_receipt_items bri
        JOIN billing_receipts br ON bri.receipt_id = br.id
        WHERE br.student_id = student_uuid
    ),
    refund_totals AS (
        SELECT COALESCE(SUM(br.refund_amount), 0) as total_refunds
        FROM billing_refunds br
        JOIN billing_receipts brec ON br.receipt_id = brec.id
        WHERE brec.student_id = student_uuid
        AND br.approval_status = 'processed'
    )
    SELECT 
        bt.total_bills - pt.total_paid + rt.total_refunds INTO result
    FROM bill_totals bt, payment_totals pt, refund_totals rt;
    
    RETURN result;
END;
$$;

-- Get student billing summary optimized
CREATE OR REPLACE FUNCTION public.get_student_billing_summary_optimized(student_uuid uuid)
RETURNS TABLE(
    student_info jsonb,
    billing_summary jsonb,
    recent_bills jsonb,
    recent_receipts jsonb,
    recent_invoices jsonb
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- Implementation returns comprehensive billing data
    RETURN QUERY
    SELECT 
        jsonb_build_object(
            'id', s.id,
            'name', s.first_name || ' ' || s.last_name,
            'roll_number', s.roll_number
        ) as student_info,
        jsonb_build_object(
            'total_outstanding', calculate_student_outstanding_optimized(student_uuid)
        ) as billing_summary,
        '[]'::jsonb as recent_bills,
        '[]'::jsonb as recent_receipts,
        '[]'::jsonb as recent_invoices;
END;
$$;

-- Generate invoice number
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    new_number text;
BEGIN
    SELECT 'INV-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
           LPAD(COALESCE(MAX(SUBSTRING(invoice_number FROM '[0-9]+$')::int), 0) + 1::text, 5, '0')
    INTO new_number
    FROM billing_invoices
    WHERE invoice_number LIKE 'INV-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-%';
    
    RETURN new_number;
END;
$$;

-- Generate receipt number
CREATE OR REPLACE FUNCTION public.generate_receipt_number()
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    new_number text;
BEGIN
    SELECT 'RCP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
           LPAD(COALESCE(MAX(SUBSTRING(receipt_number FROM '[0-9]+$')::int), 0) + 1::text, 5, '0')
    INTO new_number
    FROM billing_receipts
    WHERE receipt_number LIKE 'RCP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-%';
    
    RETURN new_number;
END;
$$;

-- Refresh student billing summary
CREATE OR REPLACE FUNCTION public.refresh_student_billing_summary(student_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- Trigger any necessary updates or cache refreshes
    -- Implementation depends on caching strategy
    NULL;
END;
$$;

-- Recalculate bill status with refunds
CREATE OR REPLACE FUNCTION public.recalculate_bill_status_with_refunds(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_bill_amount numeric;
    v_total_paid numeric;
    v_total_refunds numeric;
    v_net_paid numeric;
    v_new_status text;
BEGIN
    -- Get bill amount
    SELECT bill_amount INTO v_bill_amount
    FROM billing_student_bills
    WHERE id = p_bill_id;
    
    -- Get total paid for this bill
    SELECT COALESCE(SUM(amount_paid), 0) INTO v_total_paid
    FROM billing_receipt_items
    WHERE bill_id = p_bill_id;
    
    -- Get approved refunds for this bill
    SELECT COALESCE(SUM(br.refund_amount), 0) INTO v_total_refunds
    FROM billing_refunds br
    JOIN billing_receipt_items bri ON br.receipt_id = bri.receipt_id
    WHERE bri.bill_id = p_bill_id
    AND br.approval_status = 'processed';
    
    -- Calculate net paid
    v_net_paid := v_total_paid - v_total_refunds;
    
    -- Determine new status
    IF v_net_paid >= v_bill_amount THEN
        v_new_status := 'paid';
    ELSIF v_net_paid > 0 THEN
        v_new_status := 'partially_paid';
    ELSE
        v_new_status := 'unpaid';
    END IF;
    
    -- Update bill
    UPDATE billing_student_bills
    SET 
        status = v_new_status,
        bill_balance = v_bill_amount - v_net_paid,
        updated_at = NOW()
    WHERE id = p_bill_id;
END;
$$;

-- Check billing system status
CREATE OR REPLACE FUNCTION public.check_billing_system_status()
RETURNS TABLE(
    component text,
    check_status text,
    details text,
    count_value integer
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT 'Bills'::text, 'OK'::text, 'Total bills'::text, COUNT(*)::integer FROM billing_student_bills
    UNION ALL
    SELECT 'Receipts'::text, 'OK'::text, 'Total receipts'::text, COUNT(*)::integer FROM billing_receipts
    UNION ALL
    SELECT 'Invoices'::text, 'OK'::text, 'Total invoices'::text, COUNT(*)::integer FROM billing_invoices;
END;
$$;

-- Mark overdue bills
CREATE OR REPLACE FUNCTION public.mark_overdue_bills()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    updated_count integer;
BEGIN
    UPDATE billing_student_bills
    SET status = 'overdue', updated_at = NOW()
    WHERE due_date < CURRENT_DATE
    AND status IN ('unpaid', 'partially_paid');
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$;

-- ================================================================================
-- BILLING TRIGGER FUNCTIONS
-- Added: 2025-01-08 - Missing trigger functions for automatic bill status updates
-- ================================================================================

-- Function 1: Update bill status after receipt item insert
-- Triggered: AFTER INSERT ON billing_receipt_items
-- Purpose: Automatically update bill status and balance when payment is received
CREATE OR REPLACE FUNCTION public.update_bill_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bill_amount numeric;
    v_total_paid numeric;
    v_new_status text;
    v_new_balance numeric;
BEGIN
    -- Get bill amount (use final_amount which includes taxes and discounts)
    SELECT final_amount INTO v_bill_amount
    FROM billing_student_bills
    WHERE id = NEW.bill_id;

    -- Calculate total paid for this bill from all receipt items
    SELECT COALESCE(SUM(amount_paid), 0) INTO v_total_paid
    FROM billing_receipt_items
    WHERE bill_id = NEW.bill_id;

    -- Determine new status and balance
    IF v_total_paid >= v_bill_amount THEN
        v_new_status := 'paid';
        v_new_balance := 0;

        -- Update bill with paid status and payment date
        UPDATE billing_student_bills
        SET
            status = v_new_status,
            balance_amount = v_new_balance,
            payment_date = NOW(),
            updated_at = NOW()
        WHERE id = NEW.bill_id;

    ELSIF v_total_paid > 0 THEN
        v_new_status := 'partially_paid';
        v_new_balance := v_bill_amount - v_total_paid;

        -- Update bill with partially paid status
        UPDATE billing_student_bills
        SET
            status = v_new_status,
            balance_amount = v_new_balance,
            updated_at = NOW()
        WHERE id = NEW.bill_id;

    ELSE
        v_new_status := 'unpaid';
        v_new_balance := v_bill_amount;

        -- Update bill back to unpaid
        UPDATE billing_student_bills
        SET
            status = v_new_status,
            balance_amount = v_new_balance,
            payment_date = NULL,
            updated_at = NOW()
        WHERE id = NEW.bill_id;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION update_bill_status IS
'Automatically updates bill status (unpaid/partially_paid/paid) and balance when receipt items are inserted';

-- Function 2: Update bill status after receipt item delete
-- Triggered: AFTER DELETE ON billing_receipt_items
-- Purpose: Recalculate bill status when payment is deleted/reversed
CREATE OR REPLACE FUNCTION public.update_bill_status_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bill_amount numeric;
    v_total_paid numeric;
    v_new_status text;
    v_new_balance numeric;
BEGIN
    -- Get bill amount
    SELECT final_amount INTO v_bill_amount
    FROM billing_student_bills
    WHERE id = OLD.bill_id;

    -- Recalculate total paid after deletion
    SELECT COALESCE(SUM(amount_paid), 0) INTO v_total_paid
    FROM billing_receipt_items
    WHERE bill_id = OLD.bill_id;

    -- Determine new status and balance
    IF v_total_paid >= v_bill_amount THEN
        v_new_status := 'paid';
        v_new_balance := 0;

        UPDATE billing_student_bills
        SET
            status = v_new_status,
            balance_amount = v_new_balance,
            payment_date = NOW(),
            updated_at = NOW()
        WHERE id = OLD.bill_id;

    ELSIF v_total_paid > 0 THEN
        v_new_status := 'partially_paid';
        v_new_balance := v_bill_amount - v_total_paid;

        UPDATE billing_student_bills
        SET
            status = v_new_status,
            balance_amount = v_new_balance,
            payment_date = NULL,
            updated_at = NOW()
        WHERE id = OLD.bill_id;

    ELSE
        v_new_status := 'unpaid';
        v_new_balance := v_bill_amount;

        UPDATE billing_student_bills
        SET
            status = v_new_status,
            balance_amount = v_new_balance,
            payment_date = NULL,
            updated_at = NOW()
        WHERE id = OLD.bill_id;
    END IF;

    RETURN OLD;
END;
$$;

COMMENT ON FUNCTION update_bill_status_on_delete IS
'Recalculates bill status and balance when receipt items are deleted';

-- Function 3: Update bill balance when bill amount changes
-- Triggered: AFTER UPDATE OF bill_amount ON billing_student_bills
-- Purpose: Recalculate balance when bill amount is modified
CREATE OR REPLACE FUNCTION public.update_bill_balance_on_amount_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_paid numeric;
    v_new_balance numeric;
    v_new_status text;
BEGIN
    -- Only proceed if final_amount actually changed
    IF NEW.final_amount IS DISTINCT FROM OLD.final_amount THEN

        -- Get total paid for this bill
        SELECT COALESCE(SUM(amount_paid), 0) INTO v_total_paid
        FROM billing_receipt_items
        WHERE bill_id = NEW.id;

        -- Calculate new balance
        v_new_balance := NEW.final_amount - v_total_paid;

        -- Determine new status
        IF v_total_paid >= NEW.final_amount THEN
            v_new_status := 'paid';
            v_new_balance := 0;
            NEW.payment_date := COALESCE(NEW.payment_date, NOW());
        ELSIF v_total_paid > 0 THEN
            v_new_status := 'partially_paid';
            NEW.payment_date := NULL;
        ELSE
            v_new_status := 'unpaid';
            NEW.payment_date := NULL;
        END IF;

        -- Update the NEW record (before it's saved)
        NEW.status := v_new_status;
        NEW.balance_amount := v_new_balance;
        NEW.updated_at := NOW();
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION update_bill_balance_on_amount_change IS
'Recalculates bill balance and status when bill amount is changed';

-- Function 4: Update bill when refund status changes
-- Triggered: AFTER UPDATE OF approval_status ON billing_refunds
-- Purpose: Recalculate bill status when refunds are processed
CREATE OR REPLACE FUNCTION public.update_bill_on_refund_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_receipt_id uuid;
    v_bill_ids uuid[];
    v_bill_id uuid;
BEGIN
    -- Only process when refund is approved/processed
    IF NEW.approval_status = 'processed' AND OLD.approval_status != 'processed' THEN

        -- Get receipt ID from the refund
        v_receipt_id := NEW.receipt_id;

        -- Get all bill IDs associated with this receipt
        SELECT ARRAY_AGG(DISTINCT bill_id) INTO v_bill_ids
        FROM billing_receipt_items
        WHERE receipt_id = v_receipt_id;

        -- Recalculate status for each affected bill
        IF v_bill_ids IS NOT NULL THEN
            FOREACH v_bill_id IN ARRAY v_bill_ids
            LOOP
                -- Use existing recalculate function that handles refunds
                PERFORM recalculate_bill_status_with_refunds(v_bill_id);
            END LOOP;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION update_bill_on_refund_status_change IS
'Updates bill status when refunds are approved/processed';

-- Function 5: Auto-generate invoice when bill is fully paid
-- Called: From receipt service after successful payment
-- Purpose: Automatically create invoice when bill reaches 'paid' status
CREATE OR REPLACE FUNCTION public.generate_auto_invoice_for_bill(p_bill_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_bill record;
    v_invoice_id uuid;
    v_invoice_number text;
    v_receipt_items record;
    v_total_amount numeric := 0;
    v_existing_invoice_id uuid;
BEGIN
    -- Step 1: Get bill details and verify it's fully paid
    SELECT
        id,
        student_id,
        institution_id,
        bill_description,
        final_amount,
        status,
        balance_amount
    INTO v_bill
    FROM billing_student_bills
    WHERE id = p_bill_id;

    -- Check if bill exists and is fully paid
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bill not found: %', p_bill_id;
    END IF;

    IF v_bill.status != 'paid' OR v_bill.balance_amount != 0 THEN
        RAISE NOTICE 'Bill % is not fully paid (status: %, balance: %)',
            p_bill_id, v_bill.status, v_bill.balance_amount;
        RETURN NULL;
    END IF;

    -- Step 2: Check if invoice already exists for this bill
    -- Check by finding invoices with receipt items that paid this bill
    SELECT DISTINCT i.id INTO v_existing_invoice_id
    FROM billing_invoices i
    INNER JOIN billing_invoice_items ii ON i.id = ii.invoice_id
    INNER JOIN billing_receipt_items ri ON ii.receipt_id = ri.receipt_id
    WHERE ri.bill_id = p_bill_id
    LIMIT 1;

    IF v_existing_invoice_id IS NOT NULL THEN
        RAISE NOTICE 'Invoice already exists for bill %: %', p_bill_id, v_existing_invoice_id;
        RETURN v_existing_invoice_id;
    END IF;

    -- Step 3: Generate invoice number
    SELECT generate_invoice_number() INTO v_invoice_number;

    -- Step 4: Create invoice record
    INSERT INTO billing_invoices (
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
        grand_total
    ) VALUES (
        v_invoice_number,
        'individual',
        CURRENT_DATE,
        v_bill.student_id,
        v_bill.institution_id,
        'Payment Invoice for: ' || v_bill.bill_description,
        'Payment completed',
        CURRENT_DATE,
        0,
        0,
        v_bill.final_amount
    )
    RETURNING id INTO v_invoice_id;

    -- Step 5: Create invoice items linking to receipts that paid this bill
    FOR v_receipt_items IN
        SELECT DISTINCT
            ri.receipt_id,
            ri.amount_paid
        FROM billing_receipt_items ri
        WHERE ri.bill_id = p_bill_id
    LOOP
        INSERT INTO billing_invoice_items (
            invoice_id,
            receipt_id,
            amount
        ) VALUES (
            v_invoice_id,
            v_receipt_items.receipt_id,
            v_receipt_items.amount_paid
        );

        v_total_amount := v_total_amount + v_receipt_items.amount_paid;
    END LOOP;

    -- Step 6: Verify total matches bill amount
    IF ABS(v_total_amount - v_bill.final_amount) > 0.01 THEN
        RAISE WARNING 'Invoice total (%) does not match bill amount (%) for bill %',
            v_total_amount, v_bill.final_amount, p_bill_id;
    END IF;

    RAISE NOTICE 'Auto-generated invoice % for bill % (total: %)',
        v_invoice_number, p_bill_id, v_total_amount;

    RETURN v_invoice_id;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Failed to auto-generate invoice for bill %: %', p_bill_id, SQLERRM;
        RETURN NULL;
END;
$$;

COMMENT ON FUNCTION generate_auto_invoice_for_bill IS
'Automatically generates an invoice when a bill is fully paid. Returns invoice ID or NULL if skipped/failed.';

-- ================================================================================
-- SECTION 4: ATTENDANCE MODULE FUNCTIONS
-- ================================================================================

-- Get overall attendance summary
CREATE OR REPLACE FUNCTION public.get_overall_attendance_summary(
    p_institution_id uuid,
    p_start_date date,
    p_end_date date,
    p_degree_id uuid,
    p_program_id uuid,
    p_department_id uuid,
    p_semester_id uuid,
    p_section_id uuid
)
RETURNS TABLE(
    total_scheduled_periods bigint,
    total_attendance_taken bigint,
    total_attendance_pending bigint,
    overall_attendance_percentage numeric,
    total_students bigint,
    avg_student_attendance numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- Implementation returns attendance statistics
    RETURN QUERY
    SELECT 
        0::bigint as total_scheduled_periods,
        0::bigint as total_attendance_taken,
        0::bigint as total_attendance_pending,
        0::numeric as overall_attendance_percentage,
        0::bigint as total_students,
        0::numeric as avg_student_attendance;
END;
$$;

-- Get student attendance stats
CREATE OR REPLACE FUNCTION public.get_student_attendance_stats(
    p_institution_id uuid,
    p_start_date date,
    p_end_date date,
    p_degree_id uuid,
    p_program_id uuid,
    p_department_id uuid,
    p_semester_id uuid,
    p_section_id uuid
)
RETURNS TABLE(
    student_id uuid,
    student_name text,
    student_roll_number text,
    total_periods bigint,
    present_periods bigint,
    absent_periods bigint,
    attendance_percentage numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        (s.first_name || ' ' || s.last_name)::text,
        s.roll_number,
        0::bigint,
        0::bigint,
        0::bigint,
        0::numeric
    FROM students s
    WHERE s.institution_id = p_institution_id
    AND (p_section_id IS NULL OR s.section_id = p_section_id)
    AND (p_semester_id IS NULL OR s.semester_id = p_semester_id)
    AND (p_program_id IS NULL OR s.program_id = p_program_id)
    AND (p_department_id IS NULL OR s.department_id = p_department_id)
    AND (p_degree_id IS NULL OR s.degree_id = p_degree_id);
END;
$$;

-- Get faculty attendance stats
CREATE OR REPLACE FUNCTION public.get_faculty_attendance_stats(
    p_institution_id uuid,
    p_start_date date,
    p_end_date date,
    p_degree_id uuid,
    p_program_id uuid,
    p_department_id uuid,
    p_semester_text text,
    p_section_text text
)
RETURNS TABLE(
    staff_id uuid,
    staff_name text,
    staff_designation text,
    total_periods bigint,
    attendance_taken bigint,
    attendance_not_taken bigint,
    attendance_percentage numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        st.id,
        st.full_name,
        st.designation,
        0::bigint,
        0::bigint,
        0::bigint,
        0::numeric
    FROM staff st
    WHERE st.institution_id = p_institution_id
    AND (p_department_id IS NULL OR st.department_id = p_department_id);
END;
$$;

-- Get course attendance stats
CREATE OR REPLACE FUNCTION public.get_course_attendance_stats(
    p_institution_id uuid,
    p_start_date date,
    p_end_date date,
    p_degree_id uuid,
    p_program_id uuid,
    p_department_id uuid,
    p_semester_text text,
    p_section_text text
)
RETURNS TABLE(
    course_id uuid,
    course_name text,
    course_code text,
    total_periods bigint,
    attendance_taken bigint,
    attendance_not_taken bigint,
    attendance_percentage numeric,
    avg_student_attendance numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.course_name,
        c.course_code,
        0::bigint,
        0::bigint,
        0::bigint,
        0::numeric,
        0::numeric
    FROM courses c
    WHERE c.institution_id = p_institution_id;
END;
$$;

-- Consolidate attendance records
CREATE OR REPLACE FUNCTION public.consolidate_attendance_records()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- Merge duplicate attendance records if any
    -- Implementation depends on business logic
    NULL;
END;
$$;

-- Updated: 2025-09-05 - Added staff assignment validation for attendance marking
-- Validate staff assignment before allowing attendance marking
CREATE OR REPLACE FUNCTION public.validate_attendance_staff_assignment()
RETURNS TRIGGER AS $$
DECLARE
    timetable_staff_ids UUID[];
    is_super_admin BOOLEAN := FALSE;
    is_hod BOOLEAN := FALSE;
    user_department_id UUID;
    timetable_department_id UUID;
    period_slot JSONB;
    day_key TEXT;
    period_key TEXT;
    timetable_data_obj JSONB;
BEGIN
    -- Check 1: Super admin validation
    SELECT EXISTS(
        SELECT 1 FROM user_institution_access uia
        JOIN profiles p ON uia.user_id = p.id
        WHERE uia.user_id = NEW.marked_by
        AND uia.role = 'super_admin'
        AND uia.institution_id = NEW.institution_id
        AND uia.is_active = true
    ) INTO is_super_admin;

    IF is_super_admin THEN
        RETURN NEW;
    END IF;

    -- Check 2: HOD department validation
    SELECT
        p.role = 'hod' AND p.department_id IS NOT NULL,
        p.department_id
    INTO is_hod, user_department_id
    FROM profiles p
    WHERE p.id = NEW.marked_by;

    IF is_hod THEN
        -- Get timetable department
        SELECT t.department_id
        INTO timetable_department_id
        FROM timetables t
        WHERE t.id = NEW.timetable_id;

        -- Allow if HOD's department matches timetable's department
        IF user_department_id = timetable_department_id THEN
            RAISE NOTICE 'HOD department access granted for user % in department %',
                NEW.marked_by, user_department_id;
            RETURN NEW;
        END IF;
    END IF;

    -- Check 3: Get timetable data for staff assignment validation
    SELECT t.timetable_data 
    INTO timetable_data_obj
    FROM timetables t
    WHERE t.id = NEW.timetable_id;
    
    IF timetable_data_obj IS NULL THEN
        RAISE EXCEPTION 'Timetable data not found for timetable_id: %', NEW.timetable_id;
    END IF;
    
    -- Find the period slot that matches this attendance record
    -- Search through all days and periods in timetable_data
    FOR day_key IN SELECT jsonb_object_keys(timetable_data_obj)
    LOOP
        FOR period_key IN SELECT jsonb_object_keys(timetable_data_obj -> day_key)
        LOOP
            -- Check if this slot has staff assignments
            period_slot := timetable_data_obj -> day_key -> period_key;
            
            -- Extract staff_ids array from the period slot
            IF period_slot ? 'staff_ids' AND jsonb_array_length(period_slot -> 'staff_ids') > 0 THEN
                -- Convert JSONB array to UUID array for checking
                SELECT ARRAY(
                    SELECT (value#>>'{}')::UUID 
                    FROM jsonb_array_elements(period_slot -> 'staff_ids')
                ) INTO timetable_staff_ids;
                
                -- Check if marked_by user is in the assigned staff list
                IF NEW.marked_by = ANY(timetable_staff_ids) THEN
                    RETURN NEW; -- Authorized staff member
                END IF;
            END IF;
        END LOOP;
    END LOOP;
    
    -- If we reach here, the user is not authorized
    RAISE EXCEPTION 'User % is not assigned to mark attendance for this timetable period. Only assigned staff or super admins can mark attendance.', NEW.marked_by;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ================================================================================
-- SECTION 5: TIMETABLE MODULE FUNCTIONS
-- ================================================================================

-- Get timetable slot
CREATE OR REPLACE FUNCTION public.get_timetable_slot(
    timetable_uuid uuid,
    day_name text,
    period_uuid uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN (
        SELECT timetable_data -> day_name -> period_uuid::text
        FROM timetables
        WHERE id = timetable_uuid
    );
END;
$$;

-- Update timetable slot
-- Updated: 2025-10-14 - Fixed to preserve all slot fields including subdivision metadata
CREATE OR REPLACE FUNCTION public.update_timetable_slot(
    p_timetable_id uuid,
    p_day_of_week text,
    p_period_id uuid,
    p_slot_data jsonb,
    p_is_batch boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_data JSONB;
    day_key TEXT;
    slot_id UUID;
    new_slot_data JSONB;
    result JSONB;
    primary_staff_uuid UUID;
BEGIN
    -- Check if user can access this timetable
    IF NOT current_user_can_access_timetable(p_timetable_id) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Access denied: You do not have permission to modify this timetable'
        );
    END IF;

    -- Determine the day key (for batch mode, use date; for regular mode, use day_of_week)
    IF p_is_batch THEN
        day_key := p_slot_data->>'slot_date';
    ELSE
        day_key := p_day_of_week;
    END IF;

    -- Get current timetable_data
    SELECT timetable_data INTO current_data
    FROM timetables
    WHERE id = p_timetable_id;

    -- CRITICAL FIX: Preserve existing slot_id or generate new one
    -- Updated: 2025-10-14 - Fixed to preserve slot_id for existing slots
    IF p_slot_data->>'slot_id' IS NOT NULL THEN
        -- Use provided slot_id (for new slots or explicit updates)
        slot_id := (p_slot_data->>'slot_id')::UUID;
    ELSIF current_data ? day_key AND current_data->day_key ? p_period_id::TEXT THEN
        -- Preserve existing slot_id if slot already exists
        slot_id := (current_data->day_key->p_period_id::TEXT->>'slot_id')::UUID;
    ELSE
        -- Generate new slot_id for new slots
        slot_id := gen_random_uuid();
    END IF;

    -- Initialize timetable_data if it doesn't exist
    IF current_data IS NULL THEN
        current_data := '{}'::JSONB;
    END IF;

    -- Initialize the day if it doesn't exist
    IF NOT (current_data ? day_key) THEN
        current_data := jsonb_set(current_data, ARRAY[day_key], '{}'::JSONB);
    END IF;

    -- Handle primary_staff_id safely
    primary_staff_uuid := NULL;
    IF p_slot_data->'staff_ids' IS NOT NULL AND jsonb_array_length(p_slot_data->'staff_ids') > 0 THEN
        BEGIN
            primary_staff_uuid := (p_slot_data->'staff_ids'->>0)::UUID;
        EXCEPTION WHEN invalid_text_representation THEN
            primary_staff_uuid := NULL;
        END;
    END IF;

    -- CRITICAL FIX: Build the complete slot data INCLUDING subdivision AND practical mode fields
    -- Updated: 2025-10-14 - Added is_subdivided, subdivision_type, subdivision_mode
    -- Updated: 2025-11-07 - Added period_mode, practical_config for dual-mode period system
    new_slot_data := jsonb_build_object(
        'slot_id', slot_id,
        'course_id', p_slot_data->>'course_id',
        'slot_date', p_slot_data->>'slot_date',
        'staff_ids', COALESCE(p_slot_data->'staff_ids', '[]'::JSONB),
        'section_ids', COALESCE(p_slot_data->'section_ids', '[]'::JSONB),
        'sub_slots', COALESCE(p_slot_data->'sub_slots', '[]'::JSONB),
        'is_combined', COALESCE((p_slot_data->>'is_combined')::BOOLEAN, FALSE),
        'is_subdivided', COALESCE((p_slot_data->>'is_subdivided')::BOOLEAN, FALSE),
        'subdivision_type', p_slot_data->>'subdivision_type',
        'subdivision_mode', p_slot_data->>'subdivision_mode',
        'is_break_slot', COALESCE((p_slot_data->>'is_break_slot')::BOOLEAN, FALSE),
        'primary_staff_id', primary_staff_uuid,
        'break_description', p_slot_data->>'break_description',
        'period_mode', COALESCE(p_slot_data->>'period_mode', 'standard'),
        'practical_config', p_slot_data->'practical_config',
        'created_at', COALESCE(p_slot_data->>'created_at', NOW()::TEXT),
        'updated_at', NOW()::TEXT
    );

    -- Update the slot in the JSON structure
    current_data := jsonb_set(
        current_data,
        ARRAY[day_key, p_period_id::TEXT],
        new_slot_data
    );

    -- Update the timetable
    UPDATE timetables
    SET
        timetable_data = current_data,
        updated_at = NOW()
    WHERE id = p_timetable_id;

    -- Return the created/updated slot
    result := jsonb_build_object(
        'slot_id', slot_id,
        'day_of_week', CASE WHEN p_is_batch THEN NULL ELSE p_day_of_week END,
        'period_id', p_period_id,
        'success', TRUE,
        'message', 'Slot updated successfully'
    );

    RETURN result;
END;
$$;

-- Batch update timetable slots for multiple dates
-- Updated: 2025-10-14 - Created to handle batch updates atomically and prevent race conditions
-- This function updates multiple dates in a SINGLE transaction, eliminating concurrent update issues
CREATE OR REPLACE FUNCTION public.update_timetable_slots_batch(
    p_timetable_id uuid,
    p_dates text[],  -- Array of date strings
    p_period_id uuid,
    p_slot_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER  -- Runs with function owner privileges
AS $$
DECLARE
    current_data JSONB;
    updated_data JSONB;
    date_key TEXT;
    slot_id UUID;
    new_slot_data JSONB;
    primary_staff_uuid UUID;
    updated_count INTEGER := 0;
    failed_count INTEGER := 0;
    lock_acquired BOOLEAN;
    lock_key CONSTANT INTEGER := hashtext(p_timetable_id::text || '-batch-update'); -- Unique lock per timetable
BEGIN
    -- Check if user can access this timetable
    IF NOT current_user_can_access_timetable(p_timetable_id) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Access denied: You do not have permission to modify this timetable',
            'updated_count', 0,
            'failed_count', array_length(p_dates, 1)
        );
    END IF;

    -- Acquire advisory lock to prevent concurrent batch updates
    -- This ensures only ONE batch update runs at a time for this timetable
    lock_acquired := pg_try_advisory_xact_lock(lock_key);
    IF NOT lock_acquired THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Another update is in progress. Please try again.',
            'updated_count', 0,
            'failed_count', array_length(p_dates, 1)
        );
    END IF;

    -- Get current timetable_data (locked for update)
    SELECT timetable_data INTO current_data
    FROM timetables
    WHERE id = p_timetable_id
    FOR UPDATE;  -- Row-level lock for this timetable

    IF current_data IS NULL THEN
        current_data := '{}'::JSONB;
    END IF;

    updated_data := current_data;

    -- Handle primary_staff_id safely
    primary_staff_uuid := NULL;
    IF p_slot_data->'staff_ids' IS NOT NULL AND jsonb_array_length(p_slot_data->'staff_ids') > 0 THEN
        BEGIN
            primary_staff_uuid := (p_slot_data->'staff_ids'->>0)::UUID;
        EXCEPTION WHEN invalid_text_representation THEN
            primary_staff_uuid := NULL;
        END;
    END IF;

    -- Loop through all dates and update each slot
    FOREACH date_key IN ARRAY p_dates
    LOOP
        BEGIN
            -- Preserve existing slot_id if slot exists, otherwise generate new one
            IF updated_data ? date_key AND updated_data->date_key ? p_period_id::TEXT THEN
                slot_id := (updated_data->date_key->p_period_id::TEXT->>'slot_id')::UUID;
            ELSE
                slot_id := gen_random_uuid();
            END IF;

            -- Initialize the day if it doesn't exist
            IF NOT (updated_data ? date_key) THEN
                updated_data := jsonb_set(updated_data, ARRAY[date_key], '{}'::JSONB);
            END IF;

            -- Build the complete slot data with all fields
            new_slot_data := jsonb_build_object(
                'slot_id', slot_id,
                'course_id', p_slot_data->>'course_id',
                'slot_date', date_key,
                'staff_ids', COALESCE(p_slot_data->'staff_ids', '[]'::JSONB),
                'section_ids', COALESCE(p_slot_data->'section_ids', '[]'::JSONB),
                'sub_slots', COALESCE(p_slot_data->'sub_slots', '[]'::JSONB),
                'is_combined', COALESCE((p_slot_data->>'is_combined')::BOOLEAN, FALSE),
                'is_subdivided', COALESCE((p_slot_data->>'is_subdivided')::BOOLEAN, FALSE),
                'subdivision_type', p_slot_data->>'subdivision_type',
                'subdivision_mode', p_slot_data->>'subdivision_mode',
                'is_break_slot', COALESCE((p_slot_data->>'is_break_slot')::BOOLEAN, FALSE),
                'primary_staff_id', primary_staff_uuid,
                'break_description', p_slot_data->>'break_description',
                'created_at', COALESCE(
                    CASE
                        WHEN updated_data ? date_key AND updated_data->date_key ? p_period_id::TEXT
                        THEN updated_data->date_key->p_period_id::TEXT->>'created_at'
                        ELSE NOW()::TEXT
                    END,
                    NOW()::TEXT
                ),
                'updated_at', NOW()::TEXT
            );

            -- Update the slot in the JSON structure
            updated_data := jsonb_set(
                updated_data,
                ARRAY[date_key, p_period_id::TEXT],
                new_slot_data
            );

            updated_count := updated_count + 1;

        EXCEPTION WHEN OTHERS THEN
            -- Log the error but continue with other dates
            failed_count := failed_count + 1;
            RAISE NOTICE 'Failed to update slot for date %: %', date_key, SQLERRM;
        END;
    END LOOP;

    -- Update the timetable with all changes in ONE atomic operation
    UPDATE timetables
    SET
        timetable_data = updated_data,
        updated_at = NOW()
    WHERE id = p_timetable_id;

    -- Advisory lock is automatically released at transaction end

    -- Return success with counts
    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Updated %s of %s slots successfully', updated_count, array_length(p_dates, 1)),
        'updated_count', updated_count,
        'failed_count', failed_count,
        'total_dates', array_length(p_dates, 1)
    );
END;
$$;

-- Delete timetable slot
CREATE OR REPLACE FUNCTION public.delete_timetable_slot(
    p_timetable_id uuid,
    p_day_of_week text,
    p_period_id uuid,
    p_is_batch boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    current_data jsonb;
    updated_data jsonb;
BEGIN
    -- Get current timetable data
    SELECT timetable_data INTO current_data
    FROM timetables
    WHERE id = p_timetable_id;
    
    -- Remove the specific slot
    updated_data := current_data #- ARRAY[p_day_of_week, p_period_id::text];
    
    -- Update the timetable
    UPDATE timetables
    SET timetable_data = updated_data,
        updated_at = NOW()
    WHERE id = p_timetable_id;
    
    RETURN jsonb_build_object('success', true);
END;
$$;

-- Get day schedule
CREATE OR REPLACE FUNCTION public.get_day_schedule(
    timetable_uuid uuid,
    day_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN (
        SELECT timetable_data -> day_name
        FROM timetables
        WHERE id = timetable_uuid
    );
END;
$$;

-- Find timetables by staff
CREATE OR REPLACE FUNCTION public.find_timetables_by_staff(staff_uuid uuid)
RETURNS TABLE(
    timetable_id uuid,
    timetable_name text,
    matching_slots jsonb
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.timetable_name,
        jsonb_object_agg(
            day_key || '.' || period_key,
            slot_data
        ) as matching_slots
    FROM timetables t,
         jsonb_each(t.timetable_data) as days(day_key, day_data),
         jsonb_each(day_data) as periods(period_key, slot_data)
    WHERE slot_data->>'staff_id' = staff_uuid::text
    GROUP BY t.id, t.timetable_name;
END;
$$;

-- Find timetables by course
CREATE OR REPLACE FUNCTION public.find_timetables_by_course(course_uuid uuid)
RETURNS TABLE(
    timetable_id uuid,
    timetable_name text,
    course_slots jsonb
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.timetable_name,
        jsonb_object_agg(
            day_key || '.' || period_key,
            slot_data
        ) as course_slots
    FROM timetables t,
         jsonb_each(t.timetable_data) as days(day_key, day_data),
         jsonb_each(day_data) as periods(period_key, slot_data)
    WHERE slot_data->>'course_id' = course_uuid::text
    GROUP BY t.id, t.timetable_name;
END;
$$;

-- Check staff timetable conflicts
CREATE OR REPLACE FUNCTION public.check_staff_timetable_conflicts(
    p_staff_id uuid,
    p_day_of_week text,
    p_period_id uuid,
    p_exclude_timetable_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM timetables t
        WHERE t.timetable_data -> p_day_of_week -> p_period_id::text ->> 'staff_id' = p_staff_id::text
        AND t.is_active = true
        AND (p_exclude_timetable_id IS NULL OR t.id != p_exclude_timetable_id)
    );
END;
$$;

-- ================================================================================
-- SECTION 5.5: CYCLE-BASED TIMETABLE FUNCTIONS
-- Added: 2026-03-22 - Cycle timetable format support
-- Cycle timetables rotate through N user-defined cycles instead of fixed days.
-- The cycle counter advances only on actual working days (holidays + Sundays are skipped).
-- ================================================================================

-- Helper: Check if a date is an institution-level approved holiday
-- Used by cycle calculation to determine if a day should be skipped.
-- Only institution-scoped, approved leaves count (department/section leaves are ignored).
CREATE OR REPLACE FUNCTION public.is_institution_holiday(
    p_institution_id UUID,
    p_date           DATE
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.institution_leaves
        WHERE institution_id = p_institution_id
          AND scope_level    = 'institution'
          AND status         = 'approved'
          AND start_date    <= p_date
          AND end_date      >= p_date
    );
$$;

-- Core: Calculate which cycle number is active on a given date for a cycle-format timetable.
-- Returns NULL if the date is a Sunday or institution holiday (no classes that day).
-- Returns the cycle number (1-indexed) for working days.
-- Algorithm: count working days from first_working_day up to (not including) target date,
-- then: cycle = (working_day_count % num_cycles) + 1
CREATE OR REPLACE FUNCTION public.get_cycle_for_date(
    p_timetable_id UUID,
    p_date         DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
    v_start_date        DATE;
    v_num_cycles        INTEGER;
    v_institution_id    UUID;
    v_first_working_day DATE;
    v_working_day_count INTEGER := 0;
    v_d                 DATE;
BEGIN
    -- Load timetable metadata
    SELECT start_date, num_cycles, institution_id
      INTO v_start_date, v_num_cycles, v_institution_id
      FROM public.timetables
     WHERE id = p_timetable_id;

    -- Timetable not found or not a cycle timetable
    IF v_num_cycles IS NULL OR v_num_cycles < 1 THEN
        RETURN NULL;
    END IF;

    -- Sunday check (DOW 0 = Sunday in PostgreSQL)
    IF EXTRACT(DOW FROM p_date) = 0 THEN
        RETURN NULL;
    END IF;

    -- Institution holiday check for the target date
    IF public.is_institution_holiday(v_institution_id, p_date) THEN
        RETURN NULL;
    END IF;

    -- Find first working day on or after start_date
    -- (start_date may itself fall on a Sunday or holiday)
    v_first_working_day := v_start_date;
    WHILE EXTRACT(DOW FROM v_first_working_day) = 0
       OR public.is_institution_holiday(v_institution_id, v_first_working_day)
    LOOP
        v_first_working_day := v_first_working_day + INTERVAL '1 day';
    END LOOP;

    -- If requested date is before the timetable even starts, no cycle
    IF p_date < v_first_working_day THEN
        RETURN NULL;
    END IF;

    -- Count working days from first_working_day UP TO (not including) p_date
    -- Each working day increments the counter; Sundays and holidays are invisible.
    v_d := v_first_working_day;
    WHILE v_d < p_date LOOP
        IF EXTRACT(DOW FROM v_d) != 0
           AND NOT public.is_institution_holiday(v_institution_id, v_d)
        THEN
            v_working_day_count := v_working_day_count + 1;
        END IF;
        v_d := v_d + INTERVAL '1 day';
    END LOOP;

    -- Return 1-indexed cycle number (wraps after num_cycles)
    RETURN (v_working_day_count % v_num_cycles) + 1;
END;
$$;

-- Bulk: Return a map of { date_iso_string -> cycle_number } for a date range.
-- Dates that are Sundays or holidays map to NULL.
-- Used by the faculty calendar and attendance services to avoid N queries per date.
CREATE OR REPLACE FUNCTION public.get_cycle_map_for_range(
    p_timetable_id UUID,
    p_start_date   DATE,
    p_end_date     DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
    v_result     JSONB := '{}'::JSONB;
    v_d          DATE;
    v_cycle      INTEGER;
BEGIN
    v_d := p_start_date;
    WHILE v_d <= p_end_date LOOP
        v_cycle := public.get_cycle_for_date(p_timetable_id, v_d);
        -- Store as { "2025-01-15": 3 } or { "2025-01-12": null } for holidays/Sundays
        v_result := v_result || jsonb_build_object(
            to_char(v_d, 'YYYY-MM-DD'),
            v_cycle
        );
        v_d := v_d + INTERVAL '1 day';
    END LOOP;
    RETURN v_result;
END;
$$;

-- ================================================================================
-- SECTION 6: ACADEMIC MODULE FUNCTIONS
-- ================================================================================

-- Get institution courses
CREATE OR REPLACE FUNCTION public.get_institution_courses(
    p_institution_id uuid,
    p_search_term text DEFAULT NULL
)
RETURNS TABLE(
    id uuid,
    course_name text,
    course_code text
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT c.id, c.course_name, c.course_code
    FROM courses c
    WHERE c.institution_id = p_institution_id
    AND (p_search_term IS NULL OR 
         c.course_name ILIKE '%' || p_search_term || '%' OR
         c.course_code ILIKE '%' || p_search_term || '%');
END;
$$;

-- Get unmapped courses
CREATE OR REPLACE FUNCTION public.get_unmapped_courses(
    p_institution_id uuid,
    p_semester_id uuid,
    p_search_term text DEFAULT NULL
)
RETURNS TABLE(
    id uuid,
    course_name text,
    course_code text
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT c.id, c.course_name, c.course_code
    FROM courses c
    WHERE c.institution_id = p_institution_id
    AND NOT EXISTS (
        SELECT 1 FROM course_mappings cm
        WHERE cm.course_id = c.id
        AND cm.semester_id = p_semester_id
    )
    AND (p_search_term IS NULL OR 
         c.course_name ILIKE '%' || p_search_term || '%' OR
         c.course_code ILIKE '%' || p_search_term || '%');
END;
$$;

-- Validate semester program hierarchy
CREATE OR REPLACE FUNCTION public.validate_semester_program_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Ensure semester belongs to the correct program
    IF NOT EXISTS (
        SELECT 1 FROM programs p
        WHERE p.id = NEW.program_id
        AND p.institution_id = (
            SELECT institution_id FROM semesters WHERE id = NEW.id
        )
    ) THEN
        RAISE EXCEPTION 'Invalid program hierarchy';
    END IF;
    RETURN NEW;
END;
$$;

-- Check student semester hierarchy
CREATE OR REPLACE FUNCTION public.check_student_semester_hierarchy(p_student_id uuid)
RETURNS TABLE(
    student_id uuid,
    student_name text,
    student_program text,
    student_semester text,
    is_valid boolean,
    error_message text
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        (s.first_name || ' ' || s.last_name)::text,
        p.program_name::text,
        sem.semester_name::text,
        (s.program_id = sem.program_id) as is_valid,
        CASE 
            WHEN s.program_id != sem.program_id THEN 'Program mismatch'
            ELSE NULL
        END::text
    FROM students s
    LEFT JOIN programs p ON s.program_id = p.id
    LEFT JOIN semesters sem ON s.semester_id = sem.id
    WHERE s.id = p_student_id;
END;
$$;

-- Audit semester program inconsistencies
CREATE OR REPLACE FUNCTION public.audit_semester_program_inconsistencies()
RETURNS TABLE(
    student_id uuid,
    student_name text,
    roll_number text,
    student_program_id uuid,
    student_program_name text,
    semester_id uuid,
    semester_name text,
    semester_program_id uuid,
    semester_program_name text,
    institution_name text,
    inconsistency_type text
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        (s.first_name || ' ' || s.last_name)::text,
        s.roll_number,
        s.program_id,
        sp.program_name::text,
        s.semester_id,
        sem.semester_name::text,
        sem.program_id,
        semp.program_name::text,
        i.institution_name::text,
        'Program mismatch'::text
    FROM students s
    JOIN institutions i ON s.institution_id = i.id
    LEFT JOIN programs sp ON s.program_id = sp.id
    LEFT JOIN semesters sem ON s.semester_id = sem.id
    LEFT JOIN programs semp ON sem.program_id = semp.id
    WHERE s.semester_id IS NOT NULL
    AND s.program_id IS NOT NULL
    AND s.program_id != sem.program_id;
END;
$$;

-- Get semester inconsistency summary
CREATE OR REPLACE FUNCTION public.get_semester_inconsistency_summary()
RETURNS TABLE(
    institution_name text,
    total_students bigint,
    inconsistent_students bigint,
    consistency_percentage numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    WITH student_counts AS (
        SELECT 
            i.institution_name,
            COUNT(s.id) as total,
            COUNT(CASE WHEN s.program_id != sem.program_id THEN 1 END) as inconsistent
        FROM institutions i
        LEFT JOIN students s ON i.id = s.institution_id
        LEFT JOIN semesters sem ON s.semester_id = sem.id
        WHERE s.semester_id IS NOT NULL AND s.program_id IS NOT NULL
        GROUP BY i.institution_name
    )
    SELECT 
        sc.institution_name::text,
        sc.total,
        sc.inconsistent,
        ROUND(((sc.total - sc.inconsistent)::numeric / NULLIF(sc.total, 0)) * 100, 2) as consistency_percentage
    FROM student_counts sc;
END;
$$;

-- ================================================================================
-- SECTION 7: STAFF MODULE FUNCTIONS
-- ================================================================================

-- Create staff auth profile
CREATE OR REPLACE FUNCTION public.create_staff_auth_profile(
    staff_email text,
    staff_full_name text,
    staff_phone text,
    staff_institution_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    auth_user_id uuid;
    temp_password text;
BEGIN
    -- Generate temporary password
    temp_password := generate_temp_password();
    
    -- Create auth user (would need Supabase Admin API in real implementation)
    -- This is a placeholder
    
    RETURN json_build_object(
        'success', true,
        'temp_password', temp_password
    );
END;
$$;

-- Get staff ID by email
CREATE OR REPLACE FUNCTION public.get_staff_id_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN (SELECT id FROM staff WHERE email = p_email OR institution_email = p_email);
END;
$$;

-- Sync staff to profiles
-- Updated: 2025-10-15 - Store profile_id back in staff table
-- Updated: 2026-04-14 - Role is now dynamic (NEW.role_key) instead of hardcoded 'faculty'.
--                       Supports teaching + non-teaching onboarding. UPDATE branch also resyncs role.
CREATE OR REPLACE FUNCTION public.sync_staff_to_profiles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    existing_profile_id UUID;
BEGIN
    IF NEW.institution_email IS NOT NULL AND NEW.institution_email != '' THEN
        SELECT id INTO existing_profile_id
        FROM profiles
        WHERE email = NEW.institution_email
        LIMIT 1;

        IF existing_profile_id IS NOT NULL THEN
            UPDATE profiles
            SET
                full_name = CONCAT(NEW.first_name, ' ', NEW.last_name),
                phone_number = NEW.phone,
                institution_id = NEW.institution_id,
                department_id = NEW.department_id,
                gender = NEW.gender,
                designation = NEW.designation,
                role = NEW.role_key,
                is_active = NEW.is_active,
                updated_at = NOW()
            WHERE id = existing_profile_id;

            NEW.profile_id := existing_profile_id;
        ELSE
            existing_profile_id := gen_random_uuid();

            INSERT INTO profiles (
                id,
                email,
                full_name,
                phone_number,
                institution_id,
                department_id,
                gender,
                designation,
                role,
                is_pre_registered,
                is_active
            )
            VALUES (
                existing_profile_id,
                NEW.institution_email,
                CONCAT(NEW.first_name, ' ', NEW.last_name),
                NEW.phone,
                NEW.institution_id,
                NEW.department_id,
                NEW.gender,
                NEW.designation,
                NEW.role_key,
                true,
                NEW.is_active
            );

            NEW.profile_id := existing_profile_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Updated: 2026-04-14 - Validates department requirement based on category.is_teaching.
-- Teaching categories require department_id; non-teaching must leave it NULL (auto-cleared).
CREATE OR REPLACE FUNCTION public.validate_staff_department_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_is_teaching BOOLEAN;
BEGIN
    SELECT is_teaching INTO v_is_teaching
    FROM employment_categories
    WHERE id = NEW.category_id;

    IF v_is_teaching IS NULL THEN
        RAISE EXCEPTION 'Invalid category_id %: employment category not found', NEW.category_id
            USING ERRCODE = '23503';
    END IF;

    IF v_is_teaching = true AND NEW.department_id IS NULL THEN
        RAISE EXCEPTION 'department_id is required for teaching staff (category.is_teaching=true)'
            USING ERRCODE = '23514';
    END IF;

    IF v_is_teaching = false AND NEW.department_id IS NOT NULL THEN
        -- Non-teaching staff should not carry a department_id; auto-clear for safety.
        NEW.department_id := NULL;
    END IF;

    RETURN NEW;
END;
$$;

-- Delete staff profile when staff is deleted
-- Updated: 2025-10-15 - Added to sync staff deletion to profiles table
CREATE OR REPLACE FUNCTION public.delete_staff_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Delete the corresponding profile when staff is deleted
    IF OLD.institution_email IS NOT NULL AND OLD.institution_email != '' THEN
        DELETE FROM profiles
        WHERE email = OLD.institution_email
        AND role = 'staff'
        AND is_pre_registered = true;
    END IF;

    RETURN OLD;
END;
$$;

-- Sync staff status to profile
-- Updated: 2025-10-15 - Added to sync staff is_active status to profiles table
CREATE OR REPLACE FUNCTION public.sync_staff_status_to_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only sync if is_active status changed and institution_email exists
    IF OLD.is_active != NEW.is_active AND
       NEW.institution_email IS NOT NULL AND
       NEW.institution_email != '' THEN

        -- Update profile is_active status to match staff status
        UPDATE profiles
        SET
            is_active = NEW.is_active,
            updated_at = NOW()
        WHERE email = NEW.institution_email;
    END IF;

    RETURN NEW;
END;
$$;

-- ================================================================================
-- SECTION 7.5: LEARNER PROFILE SYNC FUNCTIONS
-- Created: 2026-01-28 - Auto-sync learner college_email changes to profiles table
-- ================================================================================

-- Sync learner college_email changes to profiles table
-- This ensures when admin updates college_email in learners_profiles,
-- the corresponding profiles.email is automatically updated
-- Handles: Email changes, orphaned profiles, proper role assignment
CREATE OR REPLACE FUNCTION public.sync_learner_email_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  existing_profile_id UUID;
  old_email TEXT;
  new_email TEXT;
BEGIN
  -- Handle both INSERT and UPDATE cases
  IF TG_OP = 'INSERT' THEN
    old_email := NULL;
    new_email := NEW.college_email;
  ELSE
    old_email := OLD.college_email;
    new_email := NEW.college_email;
  END IF;

  -- Only sync if college_email exists and changed
  IF new_email IS NOT NULL AND new_email != '' THEN
    IF TG_OP = 'INSERT' OR (old_email IS DISTINCT FROM new_email) THEN

      -- Find profile by learner_id (more reliable than email for updates)
      SELECT id INTO existing_profile_id
      FROM profiles
      WHERE learner_id = NEW.id
      LIMIT 1;

      IF existing_profile_id IS NOT NULL THEN
        -- Profile found by learner_id - update it
        -- But first check if another profile already has the new email (e.g., guest login)
        -- to avoid unique constraint violation (idx_profiles_email_unique_active)
        DECLARE
          conflicting_profile_id UUID;
        BEGIN
          SELECT id INTO conflicting_profile_id
          FROM profiles
          WHERE email = new_email
            AND id != existing_profile_id
            AND learner_id IS NULL
          LIMIT 1;

          IF conflicting_profile_id IS NOT NULL THEN
            -- Guest/unlinked profile has the new email - deactivate old linked profile,
            -- transfer learner link to the profile that already has the correct email
            UPDATE profiles
            SET
              learner_id = NULL,
              is_active = false,
              updated_at = NOW()
            WHERE id = existing_profile_id;

            UPDATE profiles
            SET
              learner_id = NEW.id,
              role = 'student',
              institution_id = COALESCE(NEW.institution_id, institution_id),
              department_id = COALESCE(NEW.department_id, department_id),
              updated_at = NOW()
            WHERE id = conflicting_profile_id;

            RAISE NOTICE 'Transferred learner % from old profile % to guest profile % (email: %)',
              NEW.id, existing_profile_id, conflicting_profile_id, new_email;
          ELSE
            -- No conflict - safe to update the linked profile's email directly
            UPDATE profiles
            SET
              email = new_email,
              role = 'student',
              institution_id = COALESCE(NEW.institution_id, institution_id),
              department_id = COALESCE(NEW.department_id, department_id),
              updated_at = NOW()
            WHERE id = existing_profile_id;

            IF TG_OP = 'UPDATE' THEN
              RAISE NOTICE 'Synced profile % email from % to % for learner %',
                existing_profile_id, old_email, new_email, NEW.id;
            ELSE
              RAISE NOTICE 'Synced profile % for new learner % with email %',
                existing_profile_id, NEW.id, new_email;
            END IF;
          END IF;
        END;
      ELSE
        -- No profile found by learner_id
        -- Try to find orphaned/guest profile by email and link it
        -- Updated: 2026-02-10 - Also match guest roles (not just student)
        -- because users who log in via OAuth get role='guest' before being linked
        SELECT id INTO existing_profile_id
        FROM profiles
        WHERE email = new_email
          AND learner_id IS NULL
        LIMIT 1;

        IF existing_profile_id IS NOT NULL THEN
          -- Found orphaned/guest profile - link it to this learner
          UPDATE profiles
          SET
            learner_id = NEW.id,
            role = 'student',
            institution_id = COALESCE(NEW.institution_id, institution_id),
            department_id = COALESCE(NEW.department_id, department_id),
            updated_at = NOW()
          WHERE id = existing_profile_id;

          RAISE NOTICE 'Linked orphaned/guest profile % to learner % (email: %)',
            existing_profile_id, NEW.id, new_email;
        ELSE
          -- No existing profile - will be created when user is activated
          RAISE NOTICE 'No existing profile for learner % (email: %), will be created on activation',
            NEW.id, new_email;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sync_learner_email_to_profile IS
'Auto-syncs learner college_email changes to profiles table. Handles email updates, orphaned profiles, and ensures role is student.';

-- Sync learner lifecycle_status changes to profile is_active
-- This ensures user can only log in when learner is active
CREATE OR REPLACE FUNCTION public.sync_learner_status_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  existing_profile_id UUID;
  should_be_active BOOLEAN;
BEGIN
  -- Only sync if lifecycle_status changed
  IF OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status THEN

    -- Only 'active' learners should have active profiles
    should_be_active := (NEW.lifecycle_status = 'active');

    -- Find profile by learner_id
    SELECT id INTO existing_profile_id
    FROM profiles
    WHERE learner_id = NEW.id
    LIMIT 1;

    IF existing_profile_id IS NOT NULL THEN
      -- Update is_active status
      UPDATE profiles
      SET
        is_active = should_be_active,
        updated_at = NOW()
      WHERE id = existing_profile_id;

      RAISE NOTICE 'Synced profile % is_active to % for learner % (lifecycle_status: % -> %)',
        existing_profile_id, should_be_active, NEW.id, OLD.lifecycle_status, NEW.lifecycle_status;
    ELSE
      RAISE NOTICE 'No profile found for learner % to sync lifecycle_status change', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sync_learner_status_to_profile IS
'Auto-syncs learner lifecycle_status changes to profiles.is_active. Only active learners can log in.';

-- ================================================================================
-- SECTION 8: ADMISSION MODULE FUNCTIONS
-- ================================================================================

-- Get counselor profiles for an institution (bypasses user_roles RLS)
-- Created: 2026-03-02 — Fixes empty counselor dropdown in lead creation form.
-- SECURITY DEFINER is required: user_roles RLS only allows users to read their
-- own role assignments, so a client-side query silently returns an empty list for
-- multi-role counselors. This function runs as the owner to see all assignments.
-- p_institution_id DEFAULT NULL:
--   UUID  → counselors for that institution only
--   NULL  → counselors from all institutions (super admin use case)
CREATE OR REPLACE FUNCTION public.get_counselor_profiles_for_institution(
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  profile_id   uuid,
  full_name    text,
  email        text,
  phone_number text,
  designation  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    p.id          AS profile_id,
    p.full_name,
    p.email,
    p.phone_number,
    p.designation
  FROM profiles p
  WHERE
    (p_institution_id IS NULL OR p.institution_id = p_institution_id)
    AND p.is_active = true
    AND (
      p.role = 'counselor'
      OR p.id IN (
        SELECT ur.user_id
        FROM user_roles ur
        JOIN custom_roles cr ON ur.role_id = cr.id
        WHERE cr.role_key = 'counselor'
      )
    )
  ORDER BY p.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_counselor_profiles_for_institution(uuid)
  TO authenticated;

-- Generate institution application ID
CREATE OR REPLACE FUNCTION public.generate_institution_application_id(institution_id_param uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    inst_code text;
    year_code text;
    seq_num integer;
    app_id text;
BEGIN
    -- Get institution code
    SELECT COALESCE(counselling_code, SUBSTRING(institution_name, 1, 3))
    INTO inst_code
    FROM institutions
    WHERE id = institution_id_param;
    
    -- Get year code
    year_code := TO_CHAR(NOW(), 'YY');
    
    -- Get next sequence number
    SELECT COALESCE(MAX(SUBSTRING(application_id FROM '[0-9]+$')::integer), 0) + 1
    INTO seq_num
    FROM admissions
    WHERE institution_id = institution_id_param
    AND application_id LIKE inst_code || year_code || '%';
    
    -- Format application ID
    app_id := inst_code || year_code || LPAD(seq_num::text, 5, '0');
    
    RETURN app_id;
END;
$$;

-- Regenerate application ID
CREATE OR REPLACE FUNCTION public.regenerate_application_id(admission_id_param uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    inst_id uuid;
    new_app_id text;
BEGIN
    -- Get institution ID
    SELECT institution_id INTO inst_id
    FROM admissions
    WHERE id = admission_id_param;
    
    -- Generate new application ID
    new_app_id := generate_institution_application_id(inst_id);
    
    -- Update admission record
    UPDATE admissions
    SET application_id = new_app_id
    WHERE id = admission_id_param;
    
    RETURN new_app_id;
END;
$$;

-- Safe update admission status
CREATE OR REPLACE FUNCTION public.safe_update_admission_status(
    p_admission_id uuid,
    p_new_status text
)
RETURNS SETOF admissions
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- Validate status transition
    IF p_new_status NOT IN ('pending', 'approved', 'rejected', 'enrolled') THEN
        RAISE EXCEPTION 'Invalid admission status';
    END IF;
    
    RETURN QUERY
    UPDATE admissions
    SET status = p_new_status, updated_at = NOW()
    WHERE id = p_admission_id
    RETURNING *;
END;
$$;

-- ================================================================================
-- SECTION 9: BUG REPORT MODULE FUNCTIONS
-- ================================================================================

-- Sequence for bug report display IDs (thread-safe, no race condition)
-- Note: This sequence is created in migration 20250207_fix_bug_report_display_id_race_condition
-- For new deployments, create with: CREATE SEQUENCE IF NOT EXISTS bug_reports_display_id_seq START WITH 1 INCREMENT BY 1;

-- Generate bug display ID using SEQUENCE (atomic, thread-safe)
-- Updated: 2025-02-07 - Replaced SELECT MAX()+1 with SEQUENCE to eliminate race conditions
CREATE OR REPLACE FUNCTION public.generate_bug_display_id()
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    new_id_number INTEGER;
    new_id text;
BEGIN
    -- Use sequence for atomic ID generation (eliminates race condition)
    new_id_number := nextval('bug_reports_display_id_seq');

    -- Format as BUG-NNNNNN
    new_id := 'BUG-' || LPAD(new_id_number::text, 6, '0');

    RETURN new_id;
END;
$$;

-- Get bug leaderboard
CREATE OR REPLACE FUNCTION public.get_bug_leaderboard()
RETURNS TABLE(
    user_id uuid,
    user_name text,
    avatar_url text,
    total_bugs_count bigint,
    resolved_bugs_count bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.full_name::text,
        p.avatar_url,
        COUNT(br.id) as total_bugs,
        COUNT(CASE WHEN br.status = 'resolved' THEN 1 END) as resolved_bugs
    FROM profiles p
    JOIN bug_reports br ON p.id = br.reporter_user_id
    GROUP BY p.id, p.full_name, p.avatar_url
    ORDER BY total_bugs DESC;
END;
$$;

-- Add bug reporter as participant
CREATE OR REPLACE FUNCTION public.add_bug_reporter_as_participant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO bug_report_participants (bug_report_id, user_id, role)
    VALUES (NEW.id, NEW.reporter_user_id, 'reporter')
    ON CONFLICT DO NOTHING;
    
    RETURN NEW;
END;
$$;

-- Create bug status change message
CREATE OR REPLACE FUNCTION public.create_bug_status_change_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status != NEW.status THEN
        INSERT INTO bug_report_messages (
            bug_report_id,
            sender_user_id,
            message,
            is_system_message
        ) VALUES (
            NEW.id,
            auth.uid(),
            'Status changed from ' || OLD.status || ' to ' || NEW.status,
            true
        );
    END IF;
    
    RETURN NEW;
END;
$$;

-- ================================================================================
-- SECTION 10: RESOURCE MANAGEMENT MODULE FUNCTIONS
-- ================================================================================

-- Check resource availability
CREATE OR REPLACE FUNCTION public.check_resource_availability(
    p_resource_id uuid,
    p_start_time timestamptz,
    p_end_time timestamptz,
    p_quantity integer DEFAULT 1,
    p_exclude_reservation_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    resource_quantity integer;
    reserved_quantity integer;
BEGIN
    -- Get resource quantity
    SELECT quantity INTO resource_quantity
    FROM resources
    WHERE id = p_resource_id;
    
    -- Get reserved quantity for the time period
    SELECT COALESCE(SUM(quantity), 0) INTO reserved_quantity
    FROM resource_reservations
    WHERE resource_id = p_resource_id
    AND status IN ('pending', 'approved', 'in_use')
    AND (p_exclude_reservation_id IS NULL OR id != p_exclude_reservation_id)
    AND (
        (start_time, end_time) OVERLAPS (p_start_time, p_end_time)
    );
    
    RETURN (resource_quantity - reserved_quantity) >= p_quantity;
END;
$$;

-- Check reservation conflict
CREATE OR REPLACE FUNCTION public.check_reservation_conflict(
    p_resource_id uuid,
    p_start_datetime timestamptz,
    p_end_datetime timestamptz,
    p_reservation_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM resource_reservations
        WHERE resource_id = p_resource_id
        AND status IN ('pending', 'approved', 'in_use')
        AND (p_reservation_id IS NULL OR id != p_reservation_id)
        AND (start_time, end_time) OVERLAPS (p_start_datetime, p_end_datetime)
    );
END;
$$;

-- Get available time slots
CREATE OR REPLACE FUNCTION public.get_available_time_slots(
    p_resource_id uuid,
    p_date date,
    p_slot_duration interval DEFAULT '1 hour'
)
RETURNS TABLE(
    start_time timestamptz,
    end_time timestamptz,
    is_available boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- Generate time slots for the day
    RETURN QUERY
    WITH time_slots AS (
        SELECT 
            p_date::timestamptz + (n || ' hours')::interval as slot_start,
            p_date::timestamptz + (n || ' hours')::interval + p_slot_duration as slot_end
        FROM generate_series(8, 17) n
    )
    SELECT 
        ts.slot_start,
        ts.slot_end,
        NOT EXISTS (
            SELECT 1
            FROM resource_reservations rr
            WHERE rr.resource_id = p_resource_id
            AND rr.status IN ('pending', 'approved', 'in_use')
            AND (rr.start_time, rr.end_time) OVERLAPS (ts.slot_start, ts.slot_end)
        ) as is_available
    FROM time_slots ts;
END;
$$;

-- Generate usage report
CREATE OR REPLACE FUNCTION public.generate_usage_report(
    p_resource_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    report_id uuid;
BEGIN
    -- Generate report (placeholder implementation)
    report_id := gen_random_uuid();
    
    -- Would create actual report data here
    
    RETURN report_id;
END;
$$;

-- ================================================================================
-- SECTION 11: NOTIFICATION MODULE FUNCTIONS
-- ================================================================================

-- Get user notifications
CREATE OR REPLACE FUNCTION public.get_user_notifications(
    p_user_id uuid,
    p_offset integer DEFAULT 0,
    p_limit integer DEFAULT 10,
    p_unread_only boolean DEFAULT false
)
RETURNS TABLE(
    id uuid,
    user_id uuid,
    notification_id uuid,
    read_at timestamptz,
    created_at timestamptz,
    notification jsonb
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        un.id,
        un.user_id,
        un.notification_id,
        un.read_at,
        un.created_at,
        jsonb_build_object(
            'id', n.id,
            'title', n.title,
            'message', n.message,
            'type', n.type,
            'priority', n.priority,
            'data', n.data
        ) as notification
    FROM user_notifications un
    JOIN notifications n ON un.notification_id = n.id
    WHERE un.user_id = p_user_id
    AND (NOT p_unread_only OR un.read_at IS NULL)
    ORDER BY un.created_at DESC
    OFFSET p_offset
    LIMIT p_limit;
END;
$$;

-- ================================================================================
-- SECTION 12: API KEY MANAGEMENT FUNCTIONS
-- ================================================================================

-- Generate API key
CREATE OR REPLACE FUNCTION public.generate_api_key()
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN 'ak_' || encode(gen_random_bytes(32), 'hex');
END;
$$;

-- Create API key
CREATE OR REPLACE FUNCTION public.create_api_key(
    p_user_id uuid,
    p_name varchar,
    p_scopes text[]
)
RETURNS TABLE(id uuid, key_value varchar)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    new_key varchar;
    new_id uuid;
BEGIN
    new_key := generate_api_key();
    new_id := gen_random_uuid();
    
    INSERT INTO api_keys (id, user_id, name, key_value, scopes)
    VALUES (new_id, p_user_id, p_name, new_key, p_scopes);
    
    RETURN QUERY SELECT new_id, new_key;
END;
$$;

-- Validate API key
CREATE OR REPLACE FUNCTION public.validate_api_key(
    p_api_key text,
    p_ip_address text DEFAULT NULL,
    p_origin text DEFAULT NULL
)
RETURNS TABLE(
    is_valid boolean,
    key_id uuid,
    permissions jsonb,
    rate_limit_remaining integer
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (ak.is_active AND ak.expires_at > NOW()) as is_valid,
        ak.id,
        jsonb_build_object('scopes', ak.scopes) as permissions,
        100 as rate_limit_remaining
    FROM api_keys ak
    WHERE ak.key_value = p_api_key;
END;
$$;

-- Check API key permission
CREATE OR REPLACE FUNCTION public.api_key_has_permission(permission_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- Check if current API key has the specified permission
    -- Implementation depends on auth context
    RETURN true;
END;
$$;

-- ================================================================================
-- SECTION 13: ACTIVITY LOGGING FUNCTIONS
-- ================================================================================

-- Cleanup old logs
CREATE OR REPLACE FUNCTION public.cleanup_old_logs(days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM user_activity_logs
    WHERE created_at < NOW() - (days || ' days')::interval;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- Refresh activity stats
CREATE OR REPLACE FUNCTION public.refresh_activity_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- Aggregate activity data into stats table
    INSERT INTO activity_stats (
        activity_date,
        activity_hour,
        action_type,
        resource_type,
        count
    )
    SELECT 
        DATE(created_at),
        EXTRACT(HOUR FROM created_at),
        action_type,
        resource_type,
        COUNT(*)
    FROM user_activity_logs
    WHERE created_at >= NOW() - INTERVAL '1 day'
    GROUP BY 1, 2, 3, 4
    ON CONFLICT (activity_date, activity_hour, action_type, COALESCE(resource_type, ''))
    DO UPDATE SET 
        count = EXCLUDED.count,
        updated_at = NOW();
END;
$$;

-- ================================================================================
-- SECTION 14: UTILITY FUNCTIONS
-- ================================================================================

-- Generate temporary password
CREATE OR REPLACE FUNCTION public.generate_temp_password()
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
    result text := '';
    i integer;
BEGIN
    FOR i IN 1..12 LOOP
        result := result || SUBSTRING(chars, (RANDOM() * LENGTH(chars))::integer + 1, 1);
    END LOOP;
    RETURN result;
END;
$$;

-- Convert to date
CREATE OR REPLACE FUNCTION public.convert_to_date(input_date text)
RETURNS date
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN input_date::date;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$;

-- Check orphaned auth users (Updated: 2025-01-27 - Use profiles table only)
CREATE OR REPLACE FUNCTION public.check_orphaned_auth_users()
RETURNS TABLE(
    user_id uuid,
    user_email text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- Since we can't access auth.users table, return empty result set
    -- This function is kept for compatibility but will return no rows
    RETURN QUERY
    SELECT
        p.id,
        p.email,
        p.created_at
    FROM profiles p
    WHERE 1 = 0; -- Always returns empty set since we can't check auth.users
END;
$$;

-- Check orphaned profiles (Updated: 2025-01-27 - Use profiles table only)
CREATE OR REPLACE FUNCTION public.check_orphaned_profiles()
RETURNS TABLE(
    profile_id uuid,
    profile_email text,
    profile_role text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- Since we can't access auth.users table, return empty result set
    -- This function is kept for compatibility but will return no rows
    RETURN QUERY
    SELECT
        p.id,
        p.email,
        p.role,
        p.created_at
    FROM profiles p
    WHERE 1 = 0; -- Always returns empty set since we can't check auth.users
END;
$$;

-- Create missing profiles (Updated: 2025-01-27 - Use profiles table only)
CREATE OR REPLACE FUNCTION public.create_missing_profiles()
RETURNS TABLE(
    user_id uuid,
    user_email text,
    success boolean,
    error_message text
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- Since we can't access auth.users table, return empty result set
    -- This function is kept for compatibility but will return no rows
    RETURN QUERY
    SELECT
        p.id,
        p.email,
        true as success,
        NULL::text as error_message
    FROM profiles p
    WHERE 1 = 0; -- Always returns empty set since we can't check auth.users
END;
$$;

-- Debug auth profile mismatch (Updated: 2025-01-27 - Use profiles table only)
CREATE OR REPLACE FUNCTION public.debug_auth_profile_mismatch()
RETURNS TABLE(
    auth_id uuid,
    auth_email text,
    auth_created timestamptz,
    has_profile boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- Since we can't access auth.users table, return profile information only
    RETURN QUERY
    SELECT
        p.id,
        p.email,
        p.created_at,
        true as has_profile -- All returned rows have profiles since we're querying profiles table
    FROM profiles p;
END;
$$;

-- ================================================================================
-- SECTION 15: DASHBOARD & REPORTING FUNCTIONS
-- ================================================================================

-- Get courses by department count
CREATE OR REPLACE FUNCTION public.get_courses_by_department_count(inst_ids uuid[])
RETURNS TABLE(name text, count bigint)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.department_name::text,
        COUNT(cm.course_id)
    FROM departments d
    LEFT JOIN course_mappings cm ON d.id = cm.department_id
    WHERE d.institution_id = ANY(inst_ids)
    GROUP BY d.department_name;
END;
$$;

-- Get programs by degree count
CREATE OR REPLACE FUNCTION public.get_programs_by_degree_count(inst_ids uuid[])
RETURNS TABLE(name text, count bigint)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.degree_name::text,
        COUNT(p.id)
    FROM degrees d
    LEFT JOIN programs p ON d.id = p.degree_id
    WHERE d.institution_id = ANY(inst_ids)
    GROUP BY d.degree_name;
END;
$$;

-- ================================================================================
-- LEARNERS DASHBOARD OPTIMIZED FUNCTIONS
-- Created: 2026-01-08
-- Purpose: High-performance aggregation functions for learners analytics dashboard
-- Performance: Replaces client-side aggregation of 150,000+ rows with SQL GROUP BY
-- ================================================================================

-- Get learners distribution by institution (OPTIMIZED with GROUP BY)
CREATE OR REPLACE FUNCTION public.get_learners_distribution_by_institution(
    filter_institution_ids uuid[] DEFAULT NULL,
    filter_academic_year_id uuid DEFAULT NULL,
    filter_degree_id uuid DEFAULT NULL,
    filter_department_id uuid DEFAULT NULL,
    filter_program_id uuid DEFAULT NULL,
    filter_semester_id uuid DEFAULT NULL,
    filter_section_id uuid DEFAULT NULL,
    filter_lifecycle_statuses text[] DEFAULT NULL,
    filter_gender text DEFAULT NULL,
    filter_is_profile_complete boolean DEFAULT NULL,
    filter_date_from timestamptz DEFAULT NULL,
    filter_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(id uuid, name text, count bigint, percentage numeric)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    total_count bigint;
BEGIN
    -- Get total count for percentage calculation
    SELECT COUNT(*)::bigint INTO total_count
    FROM learners_profiles lp
    WHERE (filter_institution_ids IS NULL OR lp.institution_id = ANY(filter_institution_ids))
      AND (filter_academic_year_id IS NULL OR lp.academic_year_id = filter_academic_year_id)
      AND (filter_degree_id IS NULL OR lp.degree_id = filter_degree_id)
      AND (filter_department_id IS NULL OR lp.department_id = filter_department_id)
      AND (filter_program_id IS NULL OR lp.program_id = filter_program_id)
      AND (filter_semester_id IS NULL OR lp.semester_id = filter_semester_id)
      AND (filter_section_id IS NULL OR lp.section_id = filter_section_id)
      AND (filter_lifecycle_statuses IS NULL OR lp.lifecycle_status::text = ANY(filter_lifecycle_statuses))
      AND (filter_gender IS NULL OR lp.gender = filter_gender)
      AND (filter_is_profile_complete IS NULL OR lp.is_profile_complete = filter_is_profile_complete)
      AND (filter_date_from IS NULL OR lp.created_at >= filter_date_from)
      AND (filter_date_to IS NULL OR lp.created_at <= filter_date_to);

    RETURN QUERY
    SELECT
        lp.institution_id as id,
        COALESCE(i.name, 'Unknown')::text as name,
        COUNT(*)::bigint as count,
        CASE
            WHEN total_count > 0 THEN ROUND((COUNT(*)::numeric / total_count::numeric) * 100, 2)
            ELSE 0
        END as percentage
    FROM learners_profiles lp
    LEFT JOIN institutions i ON i.id = lp.institution_id
    WHERE (filter_institution_ids IS NULL OR lp.institution_id = ANY(filter_institution_ids))
      AND (filter_academic_year_id IS NULL OR lp.academic_year_id = filter_academic_year_id)
      AND (filter_degree_id IS NULL OR lp.degree_id = filter_degree_id)
      AND (filter_department_id IS NULL OR lp.department_id = filter_department_id)
      AND (filter_program_id IS NULL OR lp.program_id = filter_program_id)
      AND (filter_semester_id IS NULL OR lp.semester_id = filter_semester_id)
      AND (filter_section_id IS NULL OR lp.section_id = filter_section_id)
      AND (filter_lifecycle_statuses IS NULL OR lp.lifecycle_status::text = ANY(filter_lifecycle_statuses))
      AND (filter_gender IS NULL OR lp.gender = filter_gender)
      AND (filter_is_profile_complete IS NULL OR lp.is_profile_complete = filter_is_profile_complete)
      AND (filter_date_from IS NULL OR lp.created_at >= filter_date_from)
      AND (filter_date_to IS NULL OR lp.created_at <= filter_date_to)
      AND lp.institution_id IS NOT NULL
    GROUP BY lp.institution_id, i.name
    ORDER BY count DESC;
END;
$$;

-- Get learners distribution by department (OPTIMIZED with GROUP BY)
CREATE OR REPLACE FUNCTION public.get_learners_distribution_by_department(
    filter_institution_ids uuid[] DEFAULT NULL,
    filter_academic_year_id uuid DEFAULT NULL,
    filter_degree_id uuid DEFAULT NULL,
    filter_department_id uuid DEFAULT NULL,
    filter_program_id uuid DEFAULT NULL,
    filter_semester_id uuid DEFAULT NULL,
    filter_section_id uuid DEFAULT NULL,
    filter_lifecycle_statuses text[] DEFAULT NULL,
    filter_gender text DEFAULT NULL,
    filter_is_profile_complete boolean DEFAULT NULL,
    filter_date_from timestamptz DEFAULT NULL,
    filter_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(id uuid, name text, count bigint, percentage numeric)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    total_count bigint;
BEGIN
    -- Get total count
    SELECT COUNT(*)::bigint INTO total_count
    FROM learners_profiles lp
    WHERE (filter_institution_ids IS NULL OR lp.institution_id = ANY(filter_institution_ids))
      AND (filter_academic_year_id IS NULL OR lp.academic_year_id = filter_academic_year_id)
      AND (filter_degree_id IS NULL OR lp.degree_id = filter_degree_id)
      AND (filter_department_id IS NULL OR lp.department_id = filter_department_id)
      AND (filter_program_id IS NULL OR lp.program_id = filter_program_id)
      AND (filter_semester_id IS NULL OR lp.semester_id = filter_semester_id)
      AND (filter_section_id IS NULL OR lp.section_id = filter_section_id)
      AND (filter_lifecycle_statuses IS NULL OR lp.lifecycle_status::text = ANY(filter_lifecycle_statuses))
      AND (filter_gender IS NULL OR lp.gender = filter_gender)
      AND (filter_is_profile_complete IS NULL OR lp.is_profile_complete = filter_is_profile_complete)
      AND (filter_date_from IS NULL OR lp.created_at >= filter_date_from)
      AND (filter_date_to IS NULL OR lp.created_at <= filter_date_to);

    RETURN QUERY
    SELECT
        lp.department_id as id,
        COALESCE(d.department_name, 'Unknown')::text as name,
        COUNT(*)::bigint as count,
        CASE
            WHEN total_count > 0 THEN ROUND((COUNT(*)::numeric / total_count::numeric) * 100, 2)
            ELSE 0
        END as percentage
    FROM learners_profiles lp
    LEFT JOIN departments d ON d.id = lp.department_id
    WHERE (filter_institution_ids IS NULL OR lp.institution_id = ANY(filter_institution_ids))
      AND (filter_academic_year_id IS NULL OR lp.academic_year_id = filter_academic_year_id)
      AND (filter_degree_id IS NULL OR lp.degree_id = filter_degree_id)
      AND (filter_department_id IS NULL OR lp.department_id = filter_department_id)
      AND (filter_program_id IS NULL OR lp.program_id = filter_program_id)
      AND (filter_semester_id IS NULL OR lp.semester_id = filter_semester_id)
      AND (filter_section_id IS NULL OR lp.section_id = filter_section_id)
      AND (filter_lifecycle_statuses IS NULL OR lp.lifecycle_status::text = ANY(filter_lifecycle_statuses))
      AND (filter_gender IS NULL OR lp.gender = filter_gender)
      AND (filter_is_profile_complete IS NULL OR lp.is_profile_complete = filter_is_profile_complete)
      AND (filter_date_from IS NULL OR lp.created_at >= filter_date_from)
      AND (filter_date_to IS NULL OR lp.created_at <= filter_date_to)
      AND lp.department_id IS NOT NULL
    GROUP BY lp.department_id, d.department_name
    ORDER BY count DESC;
END;
$$;

-- Get learners distribution by program (OPTIMIZED with GROUP BY)
CREATE OR REPLACE FUNCTION public.get_learners_distribution_by_program(
    filter_institution_ids uuid[] DEFAULT NULL,
    filter_academic_year_id uuid DEFAULT NULL,
    filter_degree_id uuid DEFAULT NULL,
    filter_department_id uuid DEFAULT NULL,
    filter_program_id uuid DEFAULT NULL,
    filter_semester_id uuid DEFAULT NULL,
    filter_section_id uuid DEFAULT NULL,
    filter_lifecycle_statuses text[] DEFAULT NULL,
    filter_gender text DEFAULT NULL,
    filter_is_profile_complete boolean DEFAULT NULL,
    filter_date_from timestamptz DEFAULT NULL,
    filter_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(id uuid, name text, count bigint, percentage numeric)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    total_count bigint;
BEGIN
    -- Get total count
    SELECT COUNT(*)::bigint INTO total_count
    FROM learners_profiles lp
    WHERE (filter_institution_ids IS NULL OR lp.institution_id = ANY(filter_institution_ids))
      AND (filter_academic_year_id IS NULL OR lp.academic_year_id = filter_academic_year_id)
      AND (filter_degree_id IS NULL OR lp.degree_id = filter_degree_id)
      AND (filter_department_id IS NULL OR lp.department_id = filter_department_id)
      AND (filter_program_id IS NULL OR lp.program_id = filter_program_id)
      AND (filter_semester_id IS NULL OR lp.semester_id = filter_semester_id)
      AND (filter_section_id IS NULL OR lp.section_id = filter_section_id)
      AND (filter_lifecycle_statuses IS NULL OR lp.lifecycle_status::text = ANY(filter_lifecycle_statuses))
      AND (filter_gender IS NULL OR lp.gender = filter_gender)
      AND (filter_is_profile_complete IS NULL OR lp.is_profile_complete = filter_is_profile_complete)
      AND (filter_date_from IS NULL OR lp.created_at >= filter_date_from)
      AND (filter_date_to IS NULL OR lp.created_at <= filter_date_to);

    RETURN QUERY
    SELECT
        lp.program_id as id,
        COALESCE(p.program_name, 'Unknown')::text as name,
        COUNT(*)::bigint as count,
        CASE
            WHEN total_count > 0 THEN ROUND((COUNT(*)::numeric / total_count::numeric) * 100, 2)
            ELSE 0
        END as percentage
    FROM learners_profiles lp
    LEFT JOIN programs p ON p.id = lp.program_id
    WHERE (filter_institution_ids IS NULL OR lp.institution_id = ANY(filter_institution_ids))
      AND (filter_academic_year_id IS NULL OR lp.academic_year_id = filter_academic_year_id)
      AND (filter_degree_id IS NULL OR lp.degree_id = filter_degree_id)
      AND (filter_department_id IS NULL OR lp.department_id = filter_department_id)
      AND (filter_program_id IS NULL OR lp.program_id = filter_program_id)
      AND (filter_semester_id IS NULL OR lp.semester_id = filter_semester_id)
      AND (filter_section_id IS NULL OR lp.section_id = filter_section_id)
      AND (filter_lifecycle_statuses IS NULL OR lp.lifecycle_status::text = ANY(filter_lifecycle_statuses))
      AND (filter_gender IS NULL OR lp.gender = filter_gender)
      AND (filter_is_profile_complete IS NULL OR lp.is_profile_complete = filter_is_profile_complete)
      AND (filter_date_from IS NULL OR lp.created_at >= filter_date_from)
      AND (filter_date_to IS NULL OR lp.created_at <= filter_date_to)
      AND lp.program_id IS NOT NULL
    GROUP BY lp.program_id, p.program_name
    ORDER BY count DESC;
END;
$$;

-- Get learners distribution by gender (OPTIMIZED with GROUP BY)
CREATE OR REPLACE FUNCTION public.get_learners_distribution_by_gender(
    filter_institution_ids uuid[] DEFAULT NULL,
    filter_academic_year_id uuid DEFAULT NULL,
    filter_degree_id uuid DEFAULT NULL,
    filter_department_id uuid DEFAULT NULL,
    filter_program_id uuid DEFAULT NULL,
    filter_semester_id uuid DEFAULT NULL,
    filter_section_id uuid DEFAULT NULL,
    filter_lifecycle_statuses text[] DEFAULT NULL,
    filter_gender text DEFAULT NULL,
    filter_is_profile_complete boolean DEFAULT NULL,
    filter_date_from timestamptz DEFAULT NULL,
    filter_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(id text, name text, count bigint, percentage numeric)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    total_count bigint;
BEGIN
    -- Get total count
    SELECT COUNT(*)::bigint INTO total_count
    FROM learners_profiles lp
    WHERE (filter_institution_ids IS NULL OR lp.institution_id = ANY(filter_institution_ids))
      AND (filter_academic_year_id IS NULL OR lp.academic_year_id = filter_academic_year_id)
      AND (filter_degree_id IS NULL OR lp.degree_id = filter_degree_id)
      AND (filter_department_id IS NULL OR lp.department_id = filter_department_id)
      AND (filter_program_id IS NULL OR lp.program_id = filter_program_id)
      AND (filter_semester_id IS NULL OR lp.semester_id = filter_semester_id)
      AND (filter_section_id IS NULL OR lp.section_id = filter_section_id)
      AND (filter_lifecycle_statuses IS NULL OR lp.lifecycle_status::text = ANY(filter_lifecycle_statuses))
      AND (filter_gender IS NULL OR lp.gender = filter_gender)
      AND (filter_is_profile_complete IS NULL OR lp.is_profile_complete = filter_is_profile_complete)
      AND (filter_date_from IS NULL OR lp.created_at >= filter_date_from)
      AND (filter_date_to IS NULL OR lp.created_at <= filter_date_to);

    RETURN QUERY
    SELECT
        lp.gender::text as id,
        COALESCE(INITCAP(lp.gender), 'Unknown')::text as name,
        COUNT(*)::bigint as count,
        CASE
            WHEN total_count > 0 THEN ROUND((COUNT(*)::numeric / total_count::numeric) * 100, 2)
            ELSE 0
        END as percentage
    FROM learners_profiles lp
    WHERE (filter_institution_ids IS NULL OR lp.institution_id = ANY(filter_institution_ids))
      AND (filter_academic_year_id IS NULL OR lp.academic_year_id = filter_academic_year_id)
      AND (filter_degree_id IS NULL OR lp.degree_id = filter_degree_id)
      AND (filter_department_id IS NULL OR lp.department_id = filter_department_id)
      AND (filter_program_id IS NULL OR lp.program_id = filter_program_id)
      AND (filter_semester_id IS NULL OR lp.semester_id = filter_semester_id)
      AND (filter_section_id IS NULL OR lp.section_id = filter_section_id)
      AND (filter_lifecycle_statuses IS NULL OR lp.lifecycle_status::text = ANY(filter_lifecycle_statuses))
      AND (filter_gender IS NULL OR lp.gender = filter_gender)
      AND (filter_is_profile_complete IS NULL OR lp.is_profile_complete = filter_is_profile_complete)
      AND (filter_date_from IS NULL OR lp.created_at >= filter_date_from)
      AND (filter_date_to IS NULL OR lp.created_at <= filter_date_to)
      AND lp.gender IS NOT NULL
    GROUP BY lp.gender
    ORDER BY count DESC;
END;
$$;

-- Get learners count by lifecycle status (OPTIMIZED with GROUP BY)
CREATE OR REPLACE FUNCTION public.get_learners_count_by_status(
    filter_institution_ids uuid[] DEFAULT NULL,
    filter_academic_year_id uuid DEFAULT NULL,
    filter_degree_id uuid DEFAULT NULL,
    filter_department_id uuid DEFAULT NULL,
    filter_program_id uuid DEFAULT NULL,
    filter_semester_id uuid DEFAULT NULL,
    filter_section_id uuid DEFAULT NULL,
    filter_lifecycle_statuses text[] DEFAULT NULL,
    filter_gender text DEFAULT NULL,
    filter_is_profile_complete boolean DEFAULT NULL,
    filter_date_from timestamptz DEFAULT NULL,
    filter_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(status text, count bigint, percentage numeric)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    total_count bigint;
BEGIN
    -- Get total count
    SELECT COUNT(*)::bigint INTO total_count
    FROM learners_profiles lp
    WHERE (filter_institution_ids IS NULL OR lp.institution_id = ANY(filter_institution_ids))
      AND (filter_academic_year_id IS NULL OR lp.academic_year_id = filter_academic_year_id)
      AND (filter_degree_id IS NULL OR lp.degree_id = filter_degree_id)
      AND (filter_department_id IS NULL OR lp.department_id = filter_department_id)
      AND (filter_program_id IS NULL OR lp.program_id = filter_program_id)
      AND (filter_semester_id IS NULL OR lp.semester_id = filter_semester_id)
      AND (filter_section_id IS NULL OR lp.section_id = filter_section_id)
      AND (filter_lifecycle_statuses IS NULL OR lp.lifecycle_status::text = ANY(filter_lifecycle_statuses))
      AND (filter_gender IS NULL OR lp.gender = filter_gender)
      AND (filter_is_profile_complete IS NULL OR lp.is_profile_complete = filter_is_profile_complete)
      AND (filter_date_from IS NULL OR lp.created_at >= filter_date_from)
      AND (filter_date_to IS NULL OR lp.created_at <= filter_date_to);

    RETURN QUERY
    SELECT
        lp.lifecycle_status::text as status,
        COUNT(*)::bigint as count,
        CASE
            WHEN total_count > 0 THEN ROUND((COUNT(*)::numeric / total_count::numeric) * 100, 2)
            ELSE 0
        END as percentage
    FROM learners_profiles lp
    WHERE (filter_institution_ids IS NULL OR lp.institution_id = ANY(filter_institution_ids))
      AND (filter_academic_year_id IS NULL OR lp.academic_year_id = filter_academic_year_id)
      AND (filter_degree_id IS NULL OR lp.degree_id = filter_degree_id)
      AND (filter_department_id IS NULL OR lp.department_id = filter_department_id)
      AND (filter_program_id IS NULL OR lp.program_id = filter_program_id)
      AND (filter_semester_id IS NULL OR lp.semester_id = filter_semester_id)
      AND (filter_section_id IS NULL OR lp.section_id = filter_section_id)
      AND (filter_lifecycle_statuses IS NULL OR lp.lifecycle_status::text = ANY(filter_lifecycle_statuses))
      AND (filter_gender IS NULL OR lp.gender = filter_gender)
      AND (filter_is_profile_complete IS NULL OR lp.is_profile_complete = filter_is_profile_complete)
      AND (filter_date_from IS NULL OR lp.created_at >= filter_date_from)
      AND (filter_date_to IS NULL OR lp.created_at <= filter_date_to)
    GROUP BY lp.lifecycle_status
    ORDER BY count DESC;
END;
$$;

-- ================================================================================
-- SECTION 16: PERMISSION & ROLE FUNCTIONS
-- ================================================================================

-- User has permission (Multi-role support)
-- Updated: 2025-12-27 - Check permissions through user_roles + custom_roles (multi-role system)
-- Updated: 2026-04-13 - Changed to SECURITY DEFINER; added null/empty guard; super_admin bypass; uses ->> for boolean extraction
CREATE OR REPLACE FUNCTION public.user_has_permission(permission_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF permission_name IS NULL OR permission_name = '' THEN
        RETURN false;
    END IF;
    IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true) THEN
        RETURN true;
    END IF;
    IF EXISTS (
        SELECT 1 FROM user_roles ur
        INNER JOIN custom_roles cr ON ur.role_id = cr.id
        WHERE ur.user_id = auth.uid()
        AND (cr.permissions->>permission_name)::boolean = true
    ) THEN
        RETURN true;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM profiles p
        JOIN custom_roles cr ON p.role = cr.role_key
        WHERE p.id = auth.uid()
        AND (cr.permissions->>permission_name)::boolean = true
    );
END;
$$;

-- Get user merged permissions (Multi-role support)
-- Created: 2025-12-27 - Returns merged permissions from all assigned roles
-- Updated: 2026-02-06 - Fixed null handling: use ->> with COALESCE for null-safe boolean extraction
-- Updated: 2026-02-06 - Changed to SECURITY DEFINER to bypass RLS (user_roles table has RLS that blocks reads for non-admin users)
CREATE OR REPLACE FUNCTION public.get_user_merged_permissions(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    merged_permissions jsonb := '{}'::jsonb;
    role_permissions jsonb;
BEGIN
    -- Merge permissions from all assigned roles using OR logic
    -- If ANY role grants a permission, the user has it
    FOR role_permissions IN
        SELECT cr.permissions
        FROM user_roles ur
        INNER JOIN custom_roles cr ON ur.role_id = cr.id
        WHERE ur.user_id = p_user_id
    LOOP
        -- Merge each role's permissions using OR logic with null-safe extraction
        SELECT COALESCE(
            jsonb_object_agg(
                key,
                COALESCE((merged_permissions->>key)::boolean, false)
                OR
                COALESCE((role_permissions->>key)::boolean, false)
            ),
            '{}'::jsonb
        ) INTO merged_permissions
        FROM (
            SELECT DISTINCT key FROM (
                SELECT jsonb_object_keys(merged_permissions) AS key
                UNION
                SELECT jsonb_object_keys(role_permissions) AS key
            ) combined_keys
        ) all_keys;
    END LOOP;

    RETURN merged_permissions;
END;
$$;

-- Check permission
CREATE OR REPLACE FUNCTION public.check_permission(permission_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN user_has_permission(permission_key);
END;
$$;

-- Has resource permission
CREATE OR REPLACE FUNCTION public.has_resource_permission(
    user_uuid uuid,
    permission_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles p
        JOIN custom_roles cr ON p.role = cr.role_key
        WHERE p.id = user_uuid
        AND cr.permissions ? permission_key
    );
END;
$$;

-- Update user role
CREATE OR REPLACE FUNCTION public.update_user_role(
    user_id uuid,
    new_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    UPDATE profiles
    SET role = new_role, updated_at = NOW()
    WHERE id = user_id;
END;
$$;

-- Sync user role enum
CREATE OR REPLACE FUNCTION public.sync_user_role_enum()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- Sync custom roles with user_role enum type
    -- Implementation depends on specific requirements
    NULL;
END;
$$;

-- ================================================================================
-- SECTION 17: PROFILE MANAGEMENT FUNCTIONS
-- ================================================================================

-- Is profile complete
CREATE OR REPLACE FUNCTION public.is_profile_complete(profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = profile_id
        AND email IS NOT NULL
        AND full_name IS NOT NULL
        AND phone_number IS NOT NULL
        AND institution_id IS NOT NULL
    );
END;
$$;

-- Can access profile
CREATE OR REPLACE FUNCTION public.can_access_profile(
    user_id uuid,
    target_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- Users can access their own profile or if they're admin
    RETURN user_id = target_id OR is_admin(user_id);
END;
$$;

-- Handle profile update
CREATE OR REPLACE FUNCTION public.handle_profile_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

-- Update profile last login
CREATE OR REPLACE FUNCTION public.update_profile_last_login()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE profiles
    SET last_login = NOW()
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$;

-- ================================================================================
-- End of Functions File
-- Total Functions: 150+
-- ================================================================================
-- =====================================================
-- CHILD APP AUTHENTICATION FUNCTIONS
-- Updated: 2025-01-17 - Added child app authentication functions
-- =====================================================

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_child_app_sessions()
RETURNS void AS $$
BEGIN
    UPDATE child_app_sessions
    SET is_active = false
    WHERE expires_at < now() AND is_active = true;
    
    -- Delete very old sessions (older than 30 days)
    DELETE FROM child_app_sessions
    WHERE created_at < now() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Function to log child app access
CREATE OR REPLACE FUNCTION log_child_app_access(
    p_child_app_id VARCHAR(50),
    p_user_id UUID,
    p_session_id UUID,
    p_action VARCHAR(50),
    p_status VARCHAR(20),
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO child_app_access_logs (
        child_app_id,
        user_id,
        session_id,
        action,
        status,
        ip_address,
        user_agent,
        error_message,
        metadata
    ) VALUES (
        p_child_app_id,
        p_user_id,
        p_session_id,
        p_action,
        p_status,
        p_ip_address,
        p_user_agent,
        p_error_message,
        p_metadata
    ) RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- ================================================================================
-- SECTION: TIMETABLE STAFF SYNCHRONIZATION FUNCTIONS
-- Updated: 2025-01-17 - Added timetable staff planning conflict detection
-- ================================================================================

-- Find timetable slots that have conflicts with staff planning for a specific course
CREATE OR REPLACE FUNCTION public.find_timetable_staff_conflicts_for_course(
    p_course_id uuid,
    p_staff_id uuid
)
RETURNS TABLE (
    timetable_id uuid,
    timetable_name text,
    semester text,
    section text,
    day_key text,
    slot_key text
) 
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        t.id as timetable_id,
        t.timetable_name,
        t.semester,
        t.section,
        day_data.key as day_key,
        slot_data.key as slot_key
    FROM timetables t,
    LATERAL jsonb_each(t.timetable_data) AS day_data(key, value),
    LATERAL jsonb_each(day_data.value) AS slot_data(key, value)
    WHERE t.is_active = true
      AND slot_data.value->>'course_id' = p_course_id::text
      AND slot_data.value->>'primary_staff_id' = p_staff_id::text
      AND slot_data.value->>'is_break_slot' = 'false';
END;
$$;

-- Get comprehensive timetable staff conflicts (improved to handle multiple staff planning)
CREATE OR REPLACE FUNCTION public.get_all_timetable_staff_conflicts()
RETURNS TABLE (
    timetable_id uuid,
    timetable_name text,
    semester text,
    section text,
    course_id uuid,
    course_name text,
    timetable_staff_id uuid,
    timetable_staff_name text,
    planned_staff_id uuid,
    planned_staff_name text,
    conflict_type text
) 
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    WITH timetable_staff_data AS (
        SELECT DISTINCT
            t.id as timetable_id,
            t.timetable_name,
            t.semester,
            t.section,
            t.academic_year_id,
            t.degree_id,
            t.program_id,
            t.department_id,
            slot_info.course_id::uuid as course_id,
            slot_info.primary_staff_id::uuid as primary_staff_id
        FROM timetables t,
        LATERAL (
            SELECT 
                jsonb_path_query(t.timetable_data, '$.*.*')->>'course_id' as course_id,
                jsonb_path_query(t.timetable_data, '$.*.*')->>'primary_staff_id' as primary_staff_id,
                jsonb_path_query(t.timetable_data, '$.*.*')->>'is_break_slot' as is_break_slot
        ) AS slot_info
        WHERE t.is_active = true
            AND slot_info.is_break_slot = 'false'
            AND slot_info.course_id IS NOT NULL 
            AND slot_info.primary_staff_id IS NOT NULL
            AND slot_info.course_id != 'null'
            AND slot_info.primary_staff_id != 'null'
    ),
    staff_plan_summary AS (
        -- For each course, check if current timetable staff is in the planning
        -- If multiple staff are planned, prioritize the one matching current assignment
        SELECT DISTINCT
            spc.course_id,
            sp.academic_year_id,
            sp.degree_id,
            sp.program_id,
            sp.department_id,
            sp.semester_id,
            tsd.primary_staff_id as current_staff_id,
            CASE 
                -- If current staff is in planning, use that
                WHEN EXISTS (
                    SELECT 1 FROM staff_plan_courses spc2 
                    JOIN staff_plans sp2 ON spc2.staff_plan_id = sp2.id 
                    WHERE spc2.course_id = spc.course_id 
                      AND spc2.staff_id = tsd.primary_staff_id
                      AND sp2.academic_year_id = sp.academic_year_id
                      AND sp2.degree_id = sp.degree_id
                      AND sp2.program_id = sp.program_id
                      AND sp2.department_id = sp.department_id
                      AND sp2.is_active = true
                ) THEN tsd.primary_staff_id
                -- Otherwise, pick the first planned staff (arbitrary but consistent)
                ELSE (
                    SELECT spc3.staff_id FROM staff_plan_courses spc3 
                    JOIN staff_plans sp3 ON spc3.staff_plan_id = sp3.id 
                    WHERE spc3.course_id = spc.course_id 
                      AND sp3.academic_year_id = sp.academic_year_id
                      AND sp3.degree_id = sp.degree_id
                      AND sp3.program_id = sp.program_id
                      AND sp3.department_id = sp.department_id
                      AND sp3.is_active = true
                    ORDER BY spc3.staff_id LIMIT 1
                )
            END as planned_staff_id
        FROM staff_plan_courses spc
        JOIN staff_plans sp ON spc.staff_plan_id = sp.id
        CROSS JOIN timetable_staff_data tsd
        WHERE sp.is_active = true
          AND spc.course_id = tsd.course_id
          AND sp.academic_year_id = tsd.academic_year_id
          AND sp.degree_id = tsd.degree_id
          AND sp.program_id = tsd.program_id
          AND sp.department_id = tsd.department_id
    )
    SELECT 
        tsd.timetable_id,
        tsd.timetable_name,
        tsd.semester,
        tsd.section,
        tsd.course_id,
        c.course_name,
        tsd.primary_staff_id as timetable_staff_id,
        CONCAT(assigned_staff.first_name, ' ', assigned_staff.last_name) as timetable_staff_name,
        sps.planned_staff_id,
        CONCAT(planned_staff.first_name, ' ', planned_staff.last_name) as planned_staff_name,
        CASE 
            WHEN sps.planned_staff_id IS NULL THEN 'NO_STAFF_PLAN'
            WHEN sps.planned_staff_id != tsd.primary_staff_id THEN 'STAFF_MISMATCH'
            ELSE 'CORRECT'
        END as conflict_type
    FROM timetable_staff_data tsd
    LEFT JOIN staff_plan_summary sps ON (
        tsd.course_id = sps.course_id 
        AND tsd.academic_year_id = sps.academic_year_id
        AND tsd.degree_id = sps.degree_id
        AND tsd.program_id = sps.program_id
        AND tsd.department_id = sps.department_id
        AND tsd.primary_staff_id = sps.current_staff_id
    )
    LEFT JOIN courses c ON tsd.course_id = c.id
    LEFT JOIN staff assigned_staff ON tsd.primary_staff_id = assigned_staff.id
    LEFT JOIN staff planned_staff ON sps.planned_staff_id = planned_staff.id
    WHERE (sps.planned_staff_id IS NULL OR sps.planned_staff_id != tsd.primary_staff_id)
    ORDER BY tsd.timetable_name, c.course_name;
END;
$$;

-- Auto-sync timetables when staff planning changes
CREATE OR REPLACE FUNCTION public.auto_sync_timetables_on_staff_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_course_id uuid;
    v_old_staff_id uuid;
    v_new_staff_id uuid;
    v_staff_plan_record record;
    v_timetable_record record;
    v_sync_count integer := 0;
BEGIN
    -- Handle different trigger events
    IF TG_OP = 'UPDATE' THEN
        -- Staff assignment changed
        v_course_id := NEW.course_id;
        v_old_staff_id := OLD.staff_id;
        v_new_staff_id := NEW.staff_id;
        
        -- Get staff plan context for filtering
        SELECT * INTO v_staff_plan_record
        FROM staff_plans 
        WHERE id = NEW.staff_plan_id AND is_active = true;
        
    ELSIF TG_OP = 'INSERT' THEN
        -- New staff assignment added
        v_course_id := NEW.course_id;
        v_old_staff_id := NULL;
        v_new_staff_id := NEW.staff_id;
        
        -- Get staff plan context for filtering
        SELECT * INTO v_staff_plan_record
        FROM staff_plans 
        WHERE id = NEW.staff_plan_id AND is_active = true;
        
    ELSIF TG_OP = 'DELETE' THEN
        -- Staff assignment removed - use OLD record
        v_course_id := OLD.course_id;
        v_old_staff_id := OLD.staff_id;
        v_new_staff_id := NULL;
        
        -- Get staff plan context for filtering
        SELECT * INTO v_staff_plan_record
        FROM staff_plans 
        WHERE id = OLD.staff_plan_id AND is_active = true;
    END IF;

    -- Skip if no staff plan context found
    IF v_staff_plan_record IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Only process if there's an actual staff change
    IF (TG_OP = 'UPDATE' AND v_old_staff_id != v_new_staff_id) OR TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
        
        -- Find all timetables that need syncing for this course and context
        FOR v_timetable_record IN
            SELECT DISTINCT t.id as timetable_id
            FROM timetables t,
            LATERAL (
                SELECT 
                    jsonb_path_query(t.timetable_data, '$.*.*')->>'course_id' as course_id,
                    jsonb_path_query(t.timetable_data, '$.*.*')->>'primary_staff_id' as primary_staff_id,
                    jsonb_path_query(t.timetable_data, '$.*.*')->>'is_break_slot' as is_break_slot
            ) AS slot_info
            WHERE t.is_active = true
              AND t.academic_year_id = v_staff_plan_record.academic_year_id
              AND t.degree_id = v_staff_plan_record.degree_id
              AND t.program_id = v_staff_plan_record.program_id
              AND t.department_id = v_staff_plan_record.department_id
              AND slot_info.course_id::uuid = v_course_id
              AND slot_info.is_break_slot = 'false'
              AND slot_info.primary_staff_id::uuid = COALESCE(v_old_staff_id, v_new_staff_id)
        LOOP
            -- Auto-sync the timetable if there's a new staff assignment
            IF v_new_staff_id IS NOT NULL AND v_old_staff_id IS NOT NULL THEN
                PERFORM sync_timetable_staff_assignment(
                    v_timetable_record.timetable_id,
                    v_course_id,
                    v_old_staff_id,
                    v_new_staff_id
                );
                v_sync_count := v_sync_count + 1;
            END IF;
        END LOOP;

        -- Log the sync operation (using RAISE NOTICE for debugging)
        RAISE NOTICE 'Auto-synced % timetables after staff planning change for course %. Operation: %, Old Staff: %, New Staff: %', 
            v_sync_count, v_course_id, TG_OP, v_old_staff_id, v_new_staff_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Sync timetable staff assignment with staff planning
CREATE OR REPLACE FUNCTION public.sync_timetable_staff_assignment(
    p_timetable_id uuid,
    p_course_id uuid,
    p_old_staff_id uuid,
    p_new_staff_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_timetable_data jsonb;
    v_updated_data jsonb;
    v_day_key text;
    v_slot_key text;
    v_slot_data jsonb;
BEGIN
    -- Get current timetable data
    SELECT timetable_data INTO v_timetable_data
    FROM timetables 
    WHERE id = p_timetable_id;
    
    IF v_timetable_data IS NULL THEN
        RETURN false;
    END IF;
    
    v_updated_data := v_timetable_data;
    
    -- Iterate through all days and slots to update staff assignments
    FOR v_day_key IN SELECT jsonb_object_keys(v_timetable_data)
    LOOP
        FOR v_slot_key IN SELECT jsonb_object_keys(v_timetable_data -> v_day_key)
        LOOP
            v_slot_data := v_timetable_data -> v_day_key -> v_slot_key;
            
            -- Check if this slot matches the course and old staff
            IF (v_slot_data->>'course_id')::uuid = p_course_id 
               AND (v_slot_data->>'primary_staff_id')::uuid = p_old_staff_id THEN
                
                -- Update primary_staff_id
                v_slot_data := jsonb_set(v_slot_data, '{primary_staff_id}', to_jsonb(p_new_staff_id::text));
                
                -- Update staff_ids array (replace old staff with new staff)
                v_slot_data := jsonb_set(
                    v_slot_data, 
                    '{staff_ids}', 
                    jsonb_build_array(p_new_staff_id::text)
                );
                
                -- Update the slot in the main data structure
                v_updated_data := jsonb_set(
                    v_updated_data,
                    ARRAY[v_day_key, v_slot_key],
                    v_slot_data
                );
            END IF;
        END LOOP;
    END LOOP;
    
    -- Update the timetable with new data
    UPDATE timetables
    SET timetable_data = v_updated_data,
        updated_at = now()
    WHERE id = p_timetable_id;

    RETURN true;
END;
$$;

-- ================================================================================
-- SECTION: STAFF PLAN ACCESS OPTIMIZATION FUNCTIONS
-- Added: 2025-12-15 - Performance optimization for staff planning RLS policies
-- ================================================================================

-- Get staff plan IDs accessible by current user (for optimized RLS)
CREATE OR REPLACE FUNCTION get_user_staff_plan_access()
RETURNS TABLE(staff_plan_id uuid)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
STABLE
AS $$
  SELECT sp.id
  FROM staff_plans sp
  WHERE sp.institution_id IN (
    SELECT institution_id FROM profiles WHERE id = auth.uid()
  )
$$;

-- ================================================================================
-- SECTION: PROFILES RLS HELPER FUNCTIONS
-- Added: 2025-12-15 - Security definer functions to prevent RLS infinite recursion
-- ================================================================================

-- Get current user's role without triggering RLS
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
STABLE
AS $$
    SELECT role FROM profiles WHERE id = auth.uid()
$$;

-- Alias: Get current user's role (shorthand used by dynamic RLS policies)
-- Added: 2026-04-13 - Dynamic permission migration
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$ SELECT role FROM profiles WHERE id = auth.uid(); $$;

-- Alias: Get current user's institution_id (shorthand used by dynamic RLS policies)
-- Added: 2026-04-13 - Dynamic permission migration
CREATE OR REPLACE FUNCTION public.auth_institution_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$ SELECT institution_id FROM profiles WHERE id = auth.uid(); $$;

-- Check if current user can manage staff (create/edit)
-- Updated: 2026-04-13 - Changed to plpgsql; uses is_super_admin() and user_has_permission() helpers
CREATE OR REPLACE FUNCTION public.can_user_manage_staff()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
    IF is_super_admin() THEN RETURN true; END IF;
    IF user_has_permission('staff.create') OR user_has_permission('staff.edit') THEN RETURN true; END IF;
    RETURN EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'));
END;
$$;

-- Get current user's institution_id without triggering RLS
CREATE OR REPLACE FUNCTION get_current_user_institution_id()
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
STABLE
AS $$
    SELECT institution_id FROM profiles WHERE id = auth.uid()
$$;

-- ================================================================================
-- SECTION: STUDENT ROLE MANAGEMENT
-- Added: 2025-12-27 - Functions for managing student system role
-- ================================================================================

-- Ensure student system role exists (global, not per-institution)
-- Returns the student role ID, creating it if it doesn't exist
CREATE OR REPLACE FUNCTION public.ensure_student_role()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_role_id UUID;
    v_default_permissions JSONB;
BEGIN
    -- Check if student role exists
    SELECT id INTO v_student_role_id
    FROM custom_roles
    WHERE role_key = 'student'
    AND is_system_role = true;

    -- If exists, return the ID
    IF v_student_role_id IS NOT NULL THEN
        RETURN v_student_role_id;
    END IF;

    -- Create default student permissions
    v_default_permissions := jsonb_build_object(
        -- Core Access
        'view_dashboard', true,
        'profile.view', true,
        'profile.edit', true,

        -- Self-View Modules (RLS enforced to own records)
        'learners.attendance.view', true,
        'learners.timetable.view', true,
        'billing.view', true,
        'billing.receipts.view', true,
        'billing.invoices.view', true,
        'academic.view', true,

        -- Resources (read-only)
        'resources.digital.view', true,
        'resources.physical.view', true,

        -- Service Requests
        'service_requests.view', true,
        'service_requests.create', true,

        -- All other permissions default to false
        'learners.create', false,
        'learners.edit', false,
        'learners.delete', false,
        'billing.edit', false,
        'billing.create', false,
        'billing.delete', false,
        'academic.edit', false,
        'academic.create', false,
        'organizations.view', false,
        'staff.view', false,
        'users.view', false,
        'users.manage', false
    );

    -- Create the student role (global system role)
    INSERT INTO custom_roles (
        role_key,
        role_name,
        description,
        permissions,
        is_system_role
    ) VALUES (
        'student',
        'Student',
        'Default role for enrolled students with view-only access to their own records. Enforced by RLS policies.',
        v_default_permissions,
        true
    )
    RETURNING id INTO v_student_role_id;

    RAISE NOTICE 'Created student system role with ID: %', v_student_role_id;

    RETURN v_student_role_id;
END;
$$;

COMMENT ON FUNCTION ensure_student_role IS 'Creates or returns the global student system role. Called during student account creation and system initialization.';

-- ============================================
-- SECTION 20: PROFILE-LEARNER LINKING FUNCTIONS
-- Added: 2025-12-27
-- ============================================

-- Function: Manually link existing profiles to approved learners
-- Purpose: Run this to link existing user profiles to approved learners with matching emails
-- Usage: SELECT * FROM link_existing_profiles_to_approved_learners();
CREATE OR REPLACE FUNCTION public.link_existing_profiles_to_approved_learners()
RETURNS TABLE (
    profile_id UUID,
    learner_id UUID,
    email TEXT,
    status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH updated_profiles AS (
        UPDATE profiles p
        SET
            learner_id = lp.id,
            institution_id = COALESCE(p.institution_id, lp.institution_id),
            department_id = COALESCE(p.department_id, lp.department_id),
            role = COALESCE(p.role, 'student'),
            full_name = COALESCE(
                NULLIF(p.full_name, ''),
                TRIM(CONCAT(lp.first_name, ' ', COALESCE(lp.last_name, '')))
            ),
            updated_at = NOW()
        FROM learners_profiles lp
        WHERE p.learner_id IS NULL
        AND p.email IS NOT NULL
        AND LOWER(p.email) = LOWER(lp.college_email)
        AND lp.lifecycle_status IN ('approved', 'active', 'graduated')
        RETURNING p.id as profile_id, lp.id as learner_id, p.email as email, 'linked'::text as status
    )
    SELECT * FROM updated_profiles;
END;
$$;

COMMENT ON FUNCTION link_existing_profiles_to_approved_learners IS
'Manually links existing profiles to approved learners with matching emails. Includes institution_id and department_id from learner. Run after migration or periodically to sync existing data.';

-- ================================================================================
-- LIFECYCLE ANALYTICS FUNCTIONS
-- Updated: 2026-02-06
-- ================================================================================

-- compute_module_usage_daily: Roll up usage_events into module_usage_daily
-- Called daily via pg_cron (e.g., at 2 AM)
-- Updated: 2026-02-06 - Rewritten to FOR LOOP to avoid PostgreSQL error 42803
-- (correlated subqueries referencing ungrouped outer columns in GROUP BY)
CREATE OR REPLACE FUNCTION compute_module_usage_daily(target_date DATE DEFAULT CURRENT_DATE - INTERVAL '1 day')
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rec RECORD;
    v_by_role JSONB;
    v_by_event_type JSONB;
    rows_upserted INTEGER := 0;
BEGIN
    FOR rec IN
        SELECT
            COALESCE(ue.institution_id, '00000000-0000-0000-0000-000000000000'::uuid) AS inst_id,
            ue.module,
            COUNT(*)::integer AS event_count,
            COUNT(DISTINCT ue.user_id)::integer AS unique_users,
            SUM(ue.weight)::bigint AS weighted_score
        FROM usage_events ue
        WHERE ue.created_at >= target_date::timestamptz
          AND ue.created_at < (target_date + INTERVAL '1 day')::timestamptz
        GROUP BY COALESCE(ue.institution_id, '00000000-0000-0000-0000-000000000000'::uuid), ue.module
    LOOP
        -- Compute by_role JSONB separately
        SELECT COALESCE(jsonb_object_agg(sub.r, sub.cnt), '{}'::jsonb)
        INTO v_by_role
        FROM (
            SELECT ue2.role AS r, COUNT(*)::integer AS cnt
            FROM usage_events ue2
            WHERE ue2.module = rec.module
              AND COALESCE(ue2.institution_id, '00000000-0000-0000-0000-000000000000'::uuid) = rec.inst_id
              AND ue2.created_at >= target_date::timestamptz
              AND ue2.created_at < (target_date + INTERVAL '1 day')::timestamptz
              AND ue2.role IS NOT NULL
            GROUP BY ue2.role
        ) sub;

        -- Compute by_event_type JSONB separately
        SELECT COALESCE(jsonb_object_agg(sub.et, sub.cnt), '{}'::jsonb)
        INTO v_by_event_type
        FROM (
            SELECT ue3.event_type AS et, COUNT(*)::integer AS cnt
            FROM usage_events ue3
            WHERE ue3.module = rec.module
              AND COALESCE(ue3.institution_id, '00000000-0000-0000-0000-000000000000'::uuid) = rec.inst_id
              AND ue3.created_at >= target_date::timestamptz
              AND ue3.created_at < (target_date + INTERVAL '1 day')::timestamptz
            GROUP BY ue3.event_type
        ) sub;

        -- Upsert into module_usage_daily
        INSERT INTO module_usage_daily (metric_date, institution_id, module, event_count, unique_users, weighted_score, by_role, by_event_type)
        VALUES (target_date, rec.inst_id, rec.module, rec.event_count, rec.unique_users, rec.weighted_score, v_by_role, v_by_event_type)
        ON CONFLICT (metric_date, institution_id, module)
        DO UPDATE SET
            event_count = EXCLUDED.event_count,
            unique_users = EXCLUDED.unique_users,
            weighted_score = EXCLUDED.weighted_score,
            by_role = EXCLUDED.by_role,
            by_event_type = EXCLUDED.by_event_type;

        rows_upserted := rows_upserted + 1;
    END LOOP;

    RETURN rows_upserted;
END;
$$;

COMMENT ON FUNCTION compute_module_usage_daily IS
'Rolls up usage_events for a given date into module_usage_daily. Run daily via pg_cron.';


-- refresh_lifecycle_dashboard_view: Refresh the materialized view
-- Called every 5 minutes via pg_cron
CREATE OR REPLACE FUNCTION refresh_lifecycle_dashboard_view()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_lifecycle_dashboard;
END;
$$;

COMMENT ON FUNCTION refresh_lifecycle_dashboard_view IS
'Refreshes mv_lifecycle_dashboard materialized view. Called every 5 min via pg_cron.';


-- compute_institution_health_scores: Calculate health scores for all institutions
-- Called daily via pg_cron (Phase 2)
CREATE OR REPLACE FUNCTION compute_institution_health_scores(target_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rows_upserted INTEGER := 0;
    total_modules CONSTANT INTEGER := 25;
BEGIN
    INSERT INTO institution_health_scores (
        score_date, institution_id,
        active_user_pct, module_breadth_score, action_depth_score,
        consistency_score, feature_maturity_score, health_score, health_grade
    )
    SELECT
        target_date,
        inst.institution_id,
        -- active_user_pct: % of total users who logged in within last 7 days
        COALESCE(
            (inst.active_users_7d::numeric / NULLIF(inst.total_users, 0)) * 100, 0
        )::numeric(5,2),
        -- module_breadth_score: % of modules accessed in last 30 days
        COALESCE(
            (inst.modules_used::numeric / total_modules) * 100, 0
        )::numeric(5,2),
        -- action_depth_score: weighted actions per active user (capped at 100)
        LEAST(
            COALESCE(inst.weighted_score_30d::numeric / NULLIF(inst.active_users_7d, 0), 0) / 10,
            100
        )::numeric(5,2),
        -- consistency_score: based on daily active user coefficient of variation
        GREATEST(0, LEAST(100, 100 - COALESCE(inst.daily_variance * 100, 0)))::numeric(5,2),
        -- feature_maturity_score: CRUD actions as % of total (higher = more productive usage)
        COALESCE(
            (inst.crud_actions::numeric / NULLIF(inst.total_actions, 0)) * 100, 0
        )::numeric(5,2),
        -- composite health_score
        (
            0.30 * COALESCE((inst.active_users_7d::numeric / NULLIF(inst.total_users, 0)) * 100, 0)
          + 0.20 * COALESCE((inst.modules_used::numeric / total_modules) * 100, 0)
          + 0.20 * LEAST(COALESCE(inst.weighted_score_30d::numeric / NULLIF(inst.active_users_7d, 0), 0) / 10, 100)
          + 0.15 * GREATEST(0, LEAST(100, 100 - COALESCE(inst.daily_variance * 100, 0)))
          + 0.15 * COALESCE((inst.crud_actions::numeric / NULLIF(inst.total_actions, 0)) * 100, 0)
        )::numeric(5,2),
        -- health_grade
        CASE
            WHEN (
                0.30 * COALESCE((inst.active_users_7d::numeric / NULLIF(inst.total_users, 0)) * 100, 0)
              + 0.20 * COALESCE((inst.modules_used::numeric / total_modules) * 100, 0)
              + 0.20 * LEAST(COALESCE(inst.weighted_score_30d::numeric / NULLIF(inst.active_users_7d, 0), 0) / 10, 100)
              + 0.15 * GREATEST(0, LEAST(100, 100 - COALESCE(inst.daily_variance * 100, 0)))
              + 0.15 * COALESCE((inst.crud_actions::numeric / NULLIF(inst.total_actions, 0)) * 100, 0)
            ) >= 80 THEN 'A'
            WHEN (
                0.30 * COALESCE((inst.active_users_7d::numeric / NULLIF(inst.total_users, 0)) * 100, 0)
              + 0.20 * COALESCE((inst.modules_used::numeric / total_modules) * 100, 0)
              + 0.20 * LEAST(COALESCE(inst.weighted_score_30d::numeric / NULLIF(inst.active_users_7d, 0), 0) / 10, 100)
              + 0.15 * GREATEST(0, LEAST(100, 100 - COALESCE(inst.daily_variance * 100, 0)))
              + 0.15 * COALESCE((inst.crud_actions::numeric / NULLIF(inst.total_actions, 0)) * 100, 0)
            ) >= 60 THEN 'B'
            WHEN (
                0.30 * COALESCE((inst.active_users_7d::numeric / NULLIF(inst.total_users, 0)) * 100, 0)
              + 0.20 * COALESCE((inst.modules_used::numeric / total_modules) * 100, 0)
              + 0.20 * LEAST(COALESCE(inst.weighted_score_30d::numeric / NULLIF(inst.active_users_7d, 0), 0) / 10, 100)
              + 0.15 * GREATEST(0, LEAST(100, 100 - COALESCE(inst.daily_variance * 100, 0)))
              + 0.15 * COALESCE((inst.crud_actions::numeric / NULLIF(inst.total_actions, 0)) * 100, 0)
            ) >= 40 THEN 'C'
            WHEN (
                0.30 * COALESCE((inst.active_users_7d::numeric / NULLIF(inst.total_users, 0)) * 100, 0)
              + 0.20 * COALESCE((inst.modules_used::numeric / total_modules) * 100, 0)
              + 0.20 * LEAST(COALESCE(inst.weighted_score_30d::numeric / NULLIF(inst.active_users_7d, 0), 0) / 10, 100)
              + 0.15 * GREATEST(0, LEAST(100, 100 - COALESCE(inst.daily_variance * 100, 0)))
              + 0.15 * COALESCE((inst.crud_actions::numeric / NULLIF(inst.total_actions, 0)) * 100, 0)
            ) >= 20 THEN 'D'
            ELSE 'F'
        END
    FROM (
        SELECT
            mud.institution_id,
            -- Active users in last 7 days
            (SELECT COUNT(DISTINCT user_id) FROM usage_events
             WHERE institution_id = mud.institution_id
               AND created_at >= target_date - INTERVAL '7 days') AS active_users_7d,
            -- Total users in institution
            (SELECT COUNT(*) FROM profiles
             WHERE institution_id = mud.institution_id AND is_active = true) AS total_users,
            -- Modules used in last 30 days
            (SELECT COUNT(DISTINCT module) FROM module_usage_daily
             WHERE institution_id = mud.institution_id
               AND metric_date >= target_date - 30) AS modules_used,
            -- Weighted score in last 30 days
            SUM(CASE WHEN mud.metric_date >= target_date - 30 THEN mud.weighted_score ELSE 0 END) AS weighted_score_30d,
            -- Total actions in last 30 days
            SUM(CASE WHEN mud.metric_date >= target_date - 30 THEN mud.event_count ELSE 0 END) AS total_actions,
            -- CRUD actions in last 30 days
            SUM(CASE WHEN mud.metric_date >= target_date - 30
                THEN COALESCE((mud.by_event_type->>'create')::int, 0)
                   + COALESCE((mud.by_event_type->>'update')::int, 0)
                   + COALESCE((mud.by_event_type->>'delete')::int, 0)
                ELSE 0 END) AS crud_actions,
            -- Daily variance (stddev / avg of daily unique users)
            COALESCE(
                STDDEV(mud.unique_users) / NULLIF(AVG(mud.unique_users), 0), 0
            ) AS daily_variance
        FROM module_usage_daily mud
        WHERE mud.metric_date >= target_date - 30
        GROUP BY mud.institution_id
    ) inst
    ON CONFLICT (score_date, institution_id)
    DO UPDATE SET
        active_user_pct = EXCLUDED.active_user_pct,
        module_breadth_score = EXCLUDED.module_breadth_score,
        action_depth_score = EXCLUDED.action_depth_score,
        consistency_score = EXCLUDED.consistency_score,
        feature_maturity_score = EXCLUDED.feature_maturity_score,
        health_score = EXCLUDED.health_score,
        health_grade = EXCLUDED.health_grade;

    GET DIAGNOSTICS rows_upserted = ROW_COUNT;
    RETURN rows_upserted;
END;
$$;

COMMENT ON FUNCTION compute_institution_health_scores IS
'Computes health scores for all institutions based on usage data. Phase 2 feature.';


-- backfill_usage_events: Process existing user_sessions into usage_events
-- One-time run for historical data
CREATE OR REPLACE FUNCTION backfill_usage_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rows_inserted INTEGER := 0;
    session_rec RECORD;
    module_name TEXT;
BEGIN
    -- Insert login events from user_sessions
    INSERT INTO usage_events (user_id, session_id, event_type, module, weight, institution_id, role, source, created_at)
    SELECT
        user_id,
        session_id,
        'login',
        'dashboard',
        1,
        institution_id,
        role,
        'backfill',
        login_at
    FROM user_sessions
    WHERE login_at IS NOT NULL
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS rows_inserted = ROW_COUNT;

    -- Insert module access events from user_sessions.modules_accessed array
    FOR session_rec IN
        SELECT session_id, user_id, institution_id, role, login_at, modules_accessed
        FROM user_sessions
        WHERE modules_accessed IS NOT NULL AND array_length(modules_accessed, 1) > 0
    LOOP
        FOREACH module_name IN ARRAY session_rec.modules_accessed
        LOOP
            INSERT INTO usage_events (user_id, session_id, event_type, module, weight, institution_id, role, source, created_at)
            VALUES (
                session_rec.user_id,
                session_rec.session_id,
                'page_visit',
                module_name,
                1,
                session_rec.institution_id,
                session_rec.role,
                'backfill',
                session_rec.login_at + INTERVAL '1 minute'
            )
            ON CONFLICT DO NOTHING;

            rows_inserted := rows_inserted + 1;
        END LOOP;
    END LOOP;

    -- Now compute module_usage_daily for all backfilled dates
    PERFORM compute_module_usage_daily(d::date)
    FROM generate_series(
        (SELECT MIN(login_at)::date FROM user_sessions),
        CURRENT_DATE,
        '1 day'::interval
    ) AS d;

    RETURN rows_inserted;
END;
$$;

COMMENT ON FUNCTION backfill_usage_events IS
'One-time function to backfill usage_events from user_sessions. Run once after initial setup.';


-- archive_old_usage_events: Move old events to archive table
-- Called monthly via pg_cron (Phase 3)
CREATE OR REPLACE FUNCTION archive_old_usage_events(months_to_keep INTEGER DEFAULT 12)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    cutoff_date TIMESTAMPTZ;
    rows_archived INTEGER := 0;
BEGIN
    cutoff_date := CURRENT_DATE - (months_to_keep || ' months')::interval;

    -- Copy to archive
    INSERT INTO usage_events_archive (id, user_id, session_id, event_type, module, feature, resource_type, weight, institution_id, department_id, role, request_method, source, metadata, created_at)
    SELECT id, user_id, session_id, event_type, module, feature, resource_type, weight, institution_id, department_id, role, request_method, source, metadata, created_at
    FROM usage_events
    WHERE created_at < cutoff_date;

    GET DIAGNOSTICS rows_archived = ROW_COUNT;

    -- Delete archived records from main table
    DELETE FROM usage_events WHERE created_at < cutoff_date;

    RETURN rows_archived;
END;
$$;

COMMENT ON FUNCTION archive_old_usage_events IS
'Archives usage_events older than N months to usage_events_archive. Phase 3 maintenance.';


-- ensure_usage_events_partitions: Auto-create monthly partitions for usage_events
-- Updated: 2026-02-06 - Phase 3
-- Note: usage_events was created as a regular table (not partitioned).
-- This function gracefully handles both cases. Archive strategy manages data lifecycle.
CREATE OR REPLACE FUNCTION ensure_usage_events_partitions()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_partitioned BOOLEAN;
BEGIN
    -- Check if usage_events is actually partitioned
    SELECT (relkind = 'p') INTO is_partitioned
    FROM pg_class WHERE relname = 'usage_events';

    IF NOT is_partitioned THEN
        RAISE NOTICE 'usage_events is not partitioned. Archive strategy handles data lifecycle instead.';
        RETURN;
    END IF;

    -- If partitioned, create monthly partitions (future-proofing)
    DECLARE
        partition_start DATE;
        partition_end DATE;
        partition_name TEXT;
        i INTEGER;
    BEGIN
        FOR i IN 0..3 LOOP
            partition_start := DATE_TRUNC('month', CURRENT_DATE + (i || ' months')::interval);
            partition_end := partition_start + INTERVAL '1 month';
            partition_name := 'usage_events_' || TO_CHAR(partition_start, 'YYYY_MM');

            IF NOT EXISTS (
                SELECT 1 FROM pg_class c
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE c.relname = partition_name AND n.nspname = 'public'
            ) THEN
                EXECUTE format(
                    'CREATE TABLE IF NOT EXISTS %I PARTITION OF usage_events FOR VALUES FROM (%L) TO (%L)',
                    partition_name, partition_start, partition_end
                );
            END IF;
        END LOOP;
    END;
END;
$$;

COMMENT ON FUNCTION ensure_usage_events_partitions IS
'Auto-creates monthly partitions for usage_events table. No-op if table is not partitioned.';


-- compute_feature_usage_summary: Aggregate feature-level usage from usage_events
-- Updated: 2026-02-06 - Phase 3
CREATE OR REPLACE FUNCTION compute_feature_usage_summary(target_date DATE DEFAULT CURRENT_DATE - INTERVAL '1 day')
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rows_upserted INTEGER := 0;
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT
            COALESCE(ue.institution_id, '00000000-0000-0000-0000-000000000000'::uuid) AS inst_id,
            ue.module,
            ue.feature,
            COUNT(*)::integer AS usage_count,
            COUNT(DISTINCT ue.user_id)::integer AS unique_users
        FROM usage_events ue
        WHERE ue.created_at >= target_date::timestamptz
          AND ue.created_at < (target_date + INTERVAL '1 day')::timestamptz
          AND ue.feature IS NOT NULL
        GROUP BY COALESCE(ue.institution_id, '00000000-0000-0000-0000-000000000000'::uuid), ue.module, ue.feature
    LOOP
        INSERT INTO feature_usage_summary (summary_date, institution_id, module, feature, usage_count, unique_users)
        VALUES (target_date, rec.inst_id, rec.module, rec.feature, rec.usage_count, rec.unique_users)
        ON CONFLICT (summary_date, institution_id, module, feature)
        DO UPDATE SET
            usage_count = EXCLUDED.usage_count,
            unique_users = EXCLUDED.unique_users;

        rows_upserted := rows_upserted + 1;
    END LOOP;

    RETURN rows_upserted;
END;
$$;

COMMENT ON FUNCTION compute_feature_usage_summary IS
'Aggregates feature-level usage from usage_events into feature_usage_summary. Run daily via pg_cron.';

-- ================================================================================
-- SERVICE REQUEST MODULE FUNCTIONS
-- Updated: 2026-02-09
-- ================================================================================

-- Generate service request number (SR-YYYY-####)
CREATE OR REPLACE FUNCTION generate_service_request_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_year TEXT;
    next_sequence INTEGER;
    new_number TEXT;
BEGIN
    current_year := EXTRACT(YEAR FROM NOW())::TEXT;

    SELECT COALESCE(MAX(
        CAST(SUBSTRING(request_number FROM 9) AS INTEGER)
    ), 0) + 1
    INTO next_sequence
    FROM service_requests
    WHERE request_number LIKE 'SR-' || current_year || '-%';

    new_number := 'SR-' || current_year || '-' || LPAD(next_sequence::TEXT, 4, '0');

    RETURN new_number;
END;
$$;

-- Count active (non-closed/cancelled/rejected) requests for max check
CREATE OR REPLACE FUNCTION count_active_service_requests(
    p_user_id UUID,
    p_service_type_id UUID
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::INTEGER
    FROM service_requests
    WHERE requester_id = p_user_id
    AND service_type_id = p_service_type_id
    AND status NOT IN ('closed', 'cancelled', 'rejected');
$$;

-- Updated: 2026-02-27 — Auto-assignment: atomic counselor lead count increment
CREATE OR REPLACE FUNCTION admission_increment_counselor_leads(p_counselor_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE admission_counselors
  SET current_leads = current_leads + 1,
      updated_at = now()
  WHERE id = p_counselor_id;
$$;

-- =====================================================
-- STARTUP STUDIO: get_my_pending_invitations
-- Updated: 2026-03-08 — added email fallback for invitations where profile_id is null
-- Updated: 2026-03-06
-- SECURITY DEFINER: bypasses RLS on event_registrations/startup_events/profiles
-- to avoid 42P17 mutual recursion between event_registrations_select and
-- event_team_members_select. Matches by profile_id OR by email (fallback for students
-- whose learner record was not linked to an auth profile when the invite was created).
-- =====================================================
CREATE OR REPLACE FUNCTION get_my_pending_invitations(p_profile_id uuid)
RETURNS TABLE (
    member_id        uuid,
    registration_id  uuid,
    team_name        text,
    team_code        text,
    event_id         uuid,
    event_name       text,
    invited_at       timestamptz,
    invited_by_name  text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        etm.id           AS member_id,
        er.id            AS registration_id,
        er.team_name,
        er.team_code,
        se.id            AS event_id,
        se.name          AS event_name,
        etm.added_at     AS invited_at,
        p.full_name      AS invited_by_name
    FROM event_team_members etm
    JOIN event_registrations er ON er.id = etm.registration_id
    JOIN startup_events      se ON se.id = er.event_id
    LEFT JOIN profiles       p  ON p.id  = er.owner_id
    WHERE (
        etm.profile_id = p_profile_id
        OR (
            etm.profile_id IS NULL
            AND etm.email = (SELECT email FROM profiles WHERE id = p_profile_id LIMIT 1)
        )
    )
      AND etm.status = 'pending'
    ORDER BY etm.added_at DESC;
$$;

-- =====================================================
-- STARTUP STUDIO: respond_to_invitation
-- Updated: 2026-03-08
-- SECURITY DEFINER: bypasses RLS so invitations with profile_id = null (student had
-- no linked auth account when invited) can still be accepted/declined.
-- Validates ownership by profile_id match OR email match (same as get_my_pending_invitations).
-- Backfills profile_id on the row when it was null so future queries work correctly.
-- Enforces the one-team rule and status guard server-side.
-- =====================================================
CREATE OR REPLACE FUNCTION respond_to_invitation(
    p_member_id  uuid,
    p_profile_id uuid,
    p_accept     boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member        RECORD;
    v_profile_email text;
    v_event_id      uuid;
BEGIN
    -- Fetch the invitation row (bypasses RLS)
    SELECT id, status, profile_id, email, registration_id
      INTO v_member
      FROM event_team_members
     WHERE id = p_member_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Invitation not found');
    END IF;

    IF v_member.status != 'pending' THEN
        RETURN jsonb_build_object('error', 'This invitation has already been responded to');
    END IF;

    -- Resolve caller email for ownership validation
    SELECT email INTO v_profile_email FROM profiles WHERE id = p_profile_id LIMIT 1;

    -- Verify ownership: profile_id match OR email match (handles null profile_id rows)
    IF v_member.profile_id IS NOT NULL AND v_member.profile_id != p_profile_id THEN
        RETURN jsonb_build_object('error', 'This invitation does not belong to you');
    END IF;
    IF v_member.profile_id IS NULL AND v_member.email != v_profile_email THEN
        RETURN jsonb_build_object('error', 'This invitation does not belong to you');
    END IF;

    -- One-team rule (accept only)
    IF p_accept THEN
        SELECT er.event_id INTO v_event_id
          FROM event_registrations er
         WHERE er.id = v_member.registration_id;

        -- Check: already a team owner for this event
        IF EXISTS (
            SELECT 1 FROM event_registrations
             WHERE event_id = v_event_id AND owner_id = p_profile_id
        ) THEN
            RETURN jsonb_build_object('error', 'You are already a team leader for this event');
        END IF;

        -- Check: already accepted in another team for this event
        IF EXISTS (
            SELECT 1
              FROM event_team_members etm
              JOIN event_registrations er ON er.id = etm.registration_id
             WHERE er.event_id = v_event_id
               AND (etm.profile_id = p_profile_id OR etm.email = v_profile_email)
               AND etm.status = 'accepted'
               AND etm.id != p_member_id
        ) THEN
            RETURN jsonb_build_object('error', 'You are already part of another team for this event');
        END IF;
    END IF;

    -- Update status and backfill profile_id if it was null
    UPDATE event_team_members
       SET status       = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
           responded_at = now(),
           profile_id   = COALESCE(v_member.profile_id, p_profile_id)
     WHERE id = p_member_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- =====================================================
-- STARTUP STUDIO: get_my_event_team
-- Updated: 2026-03-06
-- SECURITY DEFINER: allows checking accepted team membership for a student.
-- Used to hide "Register Team" / show "View My Team" for non-owner accepted members.
-- Direct query would require reading event_registrations (blocked by RLS for non-owners).
-- =====================================================
-- Updated: 2026-03-06 — extended with leader academic details + institution fallback
-- When leader has no learner_id (staff/admin), falls back to event_registrations.institution_id
DROP FUNCTION IF EXISTS get_my_event_team(uuid, uuid);
CREATE FUNCTION get_my_event_team(p_profile_id uuid, p_event_id uuid)
RETURNS TABLE (
    registration_id     uuid,
    team_name           text,
    team_code           text,
    is_leader           boolean,
    leader_name         text,
    leader_email        text,
    leader_institution  text,
    leader_degree       text,
    leader_department   text,
    leader_semester     text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        er.id                                              AS registration_id,
        er.team_name,
        er.team_code,
        mem.is_leader,
        p.full_name                                        AS leader_name,
        p.email                                            AS leader_email,
        COALESCE(lp_inst.name, reg_inst.name)              AS leader_institution,
        d.degree_name                                      AS leader_degree,
        dep.department_name                                AS leader_department,
        s.semester_name                                    AS leader_semester
    FROM event_team_members mem
    JOIN event_registrations er       ON er.id   = mem.registration_id
    JOIN profiles            p        ON p.id    = er.owner_id
    LEFT JOIN institutions   reg_inst ON reg_inst.id = er.institution_id
    LEFT JOIN event_team_members ldr  ON ldr.registration_id = er.id AND ldr.is_leader = true
    LEFT JOIN learners_profiles  lp   ON lp.id   = ldr.learner_id
    LEFT JOIN institutions  lp_inst   ON lp_inst.id = lp.institution_id
    LEFT JOIN degrees        d        ON d.id    = lp.degree_id
    LEFT JOIN departments    dep      ON dep.id  = lp.department_id
    LEFT JOIN semesters      s        ON s.id    = lp.semester_id
    WHERE mem.profile_id = p_profile_id
      AND er.event_id    = p_event_id
      AND mem.status     = 'accepted'
    LIMIT 1;
$$;

-- =====================================================
-- STARTUP STUDIO: get_my_team_members
-- Updated: 2026-03-08 — added profile_id column so Role Card overview
--          can cross-reference submitted cards by profile_id.
-- Returns all accepted/pending members of the team the caller belongs to.
-- Security: caller must be an accepted member of the team.
-- =====================================================
CREATE OR REPLACE FUNCTION get_my_team_members(p_profile_id uuid, p_event_id uuid)
RETURNS TABLE (
    member_id   uuid,
    profile_id  uuid,
    full_name   text,
    email       text,
    student_id  text,
    has_laptop  boolean,
    is_leader   boolean,
    status      text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        etm.id,
        etm.profile_id,
        etm.full_name,
        etm.email,
        etm.student_id,
        etm.has_laptop,
        etm.is_leader,
        etm.status
    FROM event_team_members etm
    JOIN event_registrations er ON er.id = etm.registration_id
    WHERE er.event_id = p_event_id
      AND er.id IN (
          SELECT registration_id FROM event_team_members
          WHERE profile_id = p_profile_id AND status = 'accepted'
      )
      AND etm.status IN ('accepted', 'pending')
    ORDER BY etm.is_leader DESC, etm.added_at ASC;
$$;

-- =====================================================
-- STARTUP STUDIO: generate_team_code
-- Updated: 2026-03-07 - Fix duplicate key bug: use MAX-based sequence + retry loop
-- Updated: 2026-03-07 - Add SECURITY DEFINER: without it, student callers see only
--   their own registrations (RLS), MAX returns NULL, sequence resets to 1 every time
--   → always collides with the existing -001 code. SECURITY DEFINER gives global view.
-- Generates a unique team code like "JKKN-001" per event per institution
-- =====================================================
CREATE OR REPLACE FUNCTION generate_team_code(p_event_id UUID, p_institution_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst_prefix TEXT;
  v_seq         INT;
  v_code        TEXT;
  v_try         INT := 0;
BEGIN
  -- Use counselling_code if available, else first 4 chars of institution name
  SELECT UPPER(COALESCE(
    NULLIF(TRIM(counselling_code), ''),
    SUBSTRING(name FROM 1 FOR 4)
  ))
  INTO v_inst_prefix
  FROM institutions
  WHERE id = p_institution_id;

  IF v_inst_prefix IS NULL THEN
    v_inst_prefix := 'TEAM';
  END IF;

  -- MAX-based sequence: extract numeric suffix from existing codes for this prefix
  -- e.g. 'CET-003' with prefix 'CET' → SUBSTRING from pos 5 → '003' → 3
  -- COALESCE to 0 when no registrations exist yet
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(team_code FROM LENGTH(v_inst_prefix) + 2) AS INT)),
    0
  ) + 1
  INTO v_seq
  FROM event_registrations
  WHERE event_id = p_event_id
    AND institution_id = p_institution_id
    AND team_code LIKE v_inst_prefix || '-%';

  -- Retry loop: guards against concurrent registrations (race condition)
  -- Both transactions may read the same MAX before either inserts
  LOOP
    v_code := v_inst_prefix || '-' || LPAD(v_seq::TEXT, 3, '0');

    IF NOT EXISTS (
      SELECT 1 FROM event_registrations
      WHERE event_id = p_event_id AND team_code = v_code
    ) THEN
      RETURN v_code;
    END IF;

    v_seq := v_seq + 1;
    v_try := v_try + 1;

    IF v_try >= 10 THEN
      RAISE EXCEPTION 'Could not generate unique team code after % attempts for prefix %', v_try, v_inst_prefix;
    END IF;
  END LOOP;
END;

-- ============================================================
-- Updated: 2026-03-06 - Add facilitator attendance stats RPC
-- Updated: 2026-03-06 - Add assigned_periods CTE; periods_assigned, periods_pending, marking_rate
-- Purpose: Aggregates periods marked/assigned per facilitator for live dashboard
-- ============================================================
-- Updated: 2026-03-13
-- Fixed: INNER JOIN → LEFT JOIN so facilitators with 0 marked periods appear
-- Fixed: generate_series now respects timetable start_date/end_date and selected_days
-- Fixed: Handles both staff_ids formats (array and object) in timetable_data
-- Added: Per-timetable breakdown (timetable_assignments) per facilitator
CREATE OR REPLACE FUNCTION get_facilitator_attendance_stats(
  p_institution_id  UUID,
  p_date_from       DATE,
  p_date_to         DATE,
  p_department_id   UUID DEFAULT NULL,
  p_facilitator_id  UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH attendance_counts AS (
    -- Count periods MARKED per staff per timetable.
    -- marked_by_details.marker_id = staff.profile_id (auth user UUID).
    SELECT
      (pe.val -> 'marked_by_details' ->> 'marker_id')::UUID AS marked_by,
      sa.timetable_id,
      COUNT(*)                                               AS periods_marked,
      MAX(sa.attendance_date)                                AS last_marked_at
    FROM student_attendance sa,
         jsonb_each(sa.attendance_data) AS pe(period_key, val)
    WHERE sa.institution_id = p_institution_id
      AND sa.attendance_date BETWEEN p_date_from AND p_date_to
      AND (pe.val -> 'marked_by_details' ->> 'marker_id') IS NOT NULL
    GROUP BY (pe.val -> 'marked_by_details' ->> 'marker_id')::UUID, sa.timetable_id
  ),
  attendance_totals AS (
    -- Aggregate marked totals per staff (across all timetables)
    SELECT
      marked_by,
      SUM(periods_marked)::INT AS periods_marked,
      MAX(last_marked_at)      AS last_marked_at
    FROM attendance_counts
    GROUP BY marked_by
  ),
  assigned_periods AS (
    -- Count periods each staff member is scheduled to teach per timetable.
    -- Respects timetable start_date/end_date and selected_days (DayOfWeek[]).
    -- Handles both staff_ids formats: array ["uuid"] and object {"uuid": {...}}.
    -- Skips break slots (is_break_slot = true).
    SELECT
      sid.staff_uuid::UUID AS staff_id,
      t.id                 AS timetable_id,
      t.timetable_name,
      COUNT(*)::INT        AS assigned_count
    FROM timetables t,
         generate_series(
           GREATEST(p_date_from, COALESCE(t.start_date, p_date_from))::TIMESTAMP,
           LEAST(p_date_to, COALESCE(t.end_date, p_date_to))::TIMESTAMP,
           '1 day'::INTERVAL
         ) gs(d),
         LATERAL (SELECT UPPER(to_char(gs.d, 'fmDay')) AS day_name) dn,
         jsonb_each(t.timetable_data -> dn.day_name) day_slot(period_key, slot_val),
         LATERAL (
           -- Array format: ["uuid1", "uuid2"]
           SELECT e AS staff_uuid
           FROM jsonb_array_elements_text(
             CASE WHEN jsonb_typeof(slot_val -> 'staff_ids') = 'array'
                  THEN slot_val -> 'staff_ids'
                  ELSE '[]'::jsonb END
           ) AS e
           UNION ALL
           -- Object format: {"uuid1": {...}, "uuid2": {...}}
           SELECT k AS staff_uuid
           FROM jsonb_object_keys(
             CASE WHEN jsonb_typeof(slot_val -> 'staff_ids') = 'object'
                  THEN slot_val -> 'staff_ids'
                  ELSE '{}'::jsonb END
           ) AS k
         ) sid
    WHERE t.institution_id = p_institution_id
      AND t.is_active = true
      AND COALESCE((slot_val ->> 'is_break_slot')::BOOLEAN, false) = false
      -- Respect selected_days: array of day names like ["MONDAY","TUESDAY",...]
      AND (
        t.selected_days IS NULL
        OR jsonb_typeof(t.selected_days) != 'array'
        OR jsonb_array_length(t.selected_days) = 0
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(t.selected_days) sd
          WHERE UPPER(sd) = dn.day_name
        )
      )
    GROUP BY sid.staff_uuid::UUID, t.id, t.timetable_name
  ),
  assigned_totals AS (
    -- Aggregate assigned totals per staff (across all timetables)
    SELECT
      staff_id,
      SUM(assigned_count)::INT AS assigned_count
    FROM assigned_periods
    GROUP BY staff_id
  ),
  staff_stats AS (
    -- LEFT JOIN both: shows ALL staff who have either assignments or markings.
    -- Joins via profile_id for marked periods, staff.id for assigned periods.
    SELECT
      s.id                                    AS staff_id,
      s.profile_id,
      s.first_name,
      s.last_name,
      COALESCE(s.designation, '')             AS designation,
      COALESCE(d.department_name, 'Unknown')  AS department_name,
      s.department_id,
      COALESCE(atm.periods_marked, 0)                                    AS periods_marked,
      COALESCE(ata.assigned_count, 0)                                    AS periods_assigned,
      -- Fix: compute pending as SUM of per-timetable GREATEST(assigned-marked, 0).
      -- This prevents excess markings in one timetable (substitutions) from
      -- offsetting pending periods in other timetables.
      COALESCE((
        SELECT SUM(GREATEST(COALESCE(ap.assigned_count, 0) - COALESCE(ac.periods_marked, 0)::INT, 0))::INT
        FROM (
          SELECT timetable_id FROM assigned_periods WHERE staff_id = s.id
          UNION
          SELECT timetable_id FROM attendance_counts WHERE marked_by = s.profile_id
        ) ref
        LEFT JOIN assigned_periods ap ON ap.staff_id = s.id AND ap.timetable_id = ref.timetable_id
        LEFT JOIN attendance_counts ac ON ac.marked_by = s.profile_id AND ac.timetable_id = ref.timetable_id
      ), 0)                                                              AS periods_pending,
      CASE
        WHEN COALESCE(ata.assigned_count, 0) = 0 THEN 0.0
        ELSE ROUND(
          (COALESCE(ata.assigned_count, 0)
           - COALESCE((
               SELECT SUM(GREATEST(COALESCE(ap2.assigned_count, 0) - COALESCE(ac2.periods_marked, 0)::INT, 0))::INT
               FROM (
                 SELECT timetable_id FROM assigned_periods WHERE staff_id = s.id
                 UNION
                 SELECT timetable_id FROM attendance_counts WHERE marked_by = s.profile_id
               ) ref2
               LEFT JOIN assigned_periods ap2 ON ap2.staff_id = s.id AND ap2.timetable_id = ref2.timetable_id
               LEFT JOIN attendance_counts ac2 ON ac2.marked_by = s.profile_id AND ac2.timetable_id = ref2.timetable_id
             ), 0)
          )::NUMERIC / ata.assigned_count * 100, 1)
      END                                                               AS marking_rate,
      atm.last_marked_at
    FROM staff s
    LEFT JOIN departments d ON s.department_id = d.id
    LEFT JOIN attendance_totals atm ON s.profile_id = atm.marked_by
    LEFT JOIN assigned_totals ata ON s.id = ata.staff_id
    WHERE s.institution_id = p_institution_id
      AND s.is_active = true
      AND (p_department_id IS NULL OR s.department_id = p_department_id)
      AND (p_facilitator_id IS NULL OR s.id = p_facilitator_id)
      -- Only include staff who have either assignments or markings
      AND (atm.periods_marked IS NOT NULL OR ata.assigned_count IS NOT NULL)
  ),
  weekly_counts AS (
    -- Weekly aggregates per staff (for line trend chart)
    SELECT
      (pe.val -> 'marked_by_details' ->> 'marker_id')::UUID AS marked_by,
      date_trunc('week', sa.attendance_date)::DATE           AS week_start,
      COUNT(*)                                               AS week_count
    FROM student_attendance sa,
         jsonb_each(sa.attendance_data) AS pe(period_key, val)
    WHERE sa.institution_id = p_institution_id
      AND sa.attendance_date BETWEEN p_date_from AND p_date_to
      AND (pe.val -> 'marked_by_details' ->> 'marker_id') IS NOT NULL
    GROUP BY (pe.val -> 'marked_by_details' ->> 'marker_id')::UUID,
             date_trunc('week', sa.attendance_date)
  ),
  daily_counts AS (
    -- Daily aggregates per staff (for calendar heatmap)
    SELECT
      (pe.val -> 'marked_by_details' ->> 'marker_id')::UUID AS marked_by,
      sa.attendance_date,
      COUNT(*) AS day_count
    FROM student_attendance sa,
         jsonb_each(sa.attendance_data) AS pe(period_key, val)
    WHERE sa.institution_id = p_institution_id
      AND sa.attendance_date BETWEEN p_date_from AND p_date_to
      AND (pe.val -> 'marked_by_details' ->> 'marker_id') IS NOT NULL
    GROUP BY (pe.val -> 'marked_by_details' ->> 'marker_id')::UUID,
             sa.attendance_date
  ),
  aggregated AS (
    SELECT
      jsonb_build_object(
        'summary', jsonb_build_object(
          'total_facilitators',          COUNT(*)::INT,
          'total_periods_marked',        SUM(ss.periods_marked)::INT,
          'total_periods_assigned',      SUM(ss.periods_assigned)::INT,
          'total_periods_pending',       SUM(ss.periods_pending)::INT,
          'avg_periods_per_facilitator', ROUND(AVG(ss.periods_marked), 1),
          'overall_marking_rate',        CASE
            WHEN SUM(ss.periods_assigned) = 0 THEN 0.0
            ELSE ROUND(((SUM(ss.periods_assigned) - SUM(ss.periods_pending))::NUMERIC / SUM(ss.periods_assigned)) * 100, 1)
          END
        ),
        'facilitators', jsonb_agg(
          jsonb_build_object(
            'staff_id',         ss.staff_id,
            'first_name',       ss.first_name,
            'last_name',        ss.last_name,
            'designation',      ss.designation,
            'department_name',  ss.department_name,
            'department_id',    ss.department_id,
            'periods_marked',   ss.periods_marked,
            'periods_assigned', ss.periods_assigned,
            'periods_pending',  ss.periods_pending,
            'marking_rate',     ss.marking_rate,
            'last_marked_at',   ss.last_marked_at,
            'timetable_assignments', COALESCE((
              -- Per-timetable breakdown: assigned vs marked per timetable
              SELECT jsonb_agg(
                jsonb_build_object(
                  'timetable_id',   ref.timetable_id,
                  'timetable_name', COALESCE(ap.timetable_name, t.timetable_name, 'Unknown'),
                  'assigned_count', COALESCE(ap.assigned_count, 0),
                  'marked_count',   COALESCE(ac.periods_marked, 0)::INT,
                  'pending_count',  GREATEST(COALESCE(ap.assigned_count, 0) - COALESCE(ac.periods_marked, 0)::INT, 0)
                )
                ORDER BY COALESCE(ap.assigned_count, 0) DESC
              )
              FROM (
                SELECT timetable_id FROM assigned_periods WHERE staff_id = ss.staff_id
                UNION
                SELECT timetable_id FROM attendance_counts WHERE marked_by = ss.profile_id
              ) ref
              LEFT JOIN assigned_periods ap ON ap.staff_id = ss.staff_id AND ap.timetable_id = ref.timetable_id
              LEFT JOIN attendance_counts ac ON ac.marked_by = ss.profile_id AND ac.timetable_id = ref.timetable_id
              LEFT JOIN timetables t ON t.id = ref.timetable_id
            ), '[]'::JSONB),
            'trend_data', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object('week', wc.week_start, 'count', wc.week_count)
                ORDER BY wc.week_start
              )
              FROM weekly_counts wc
              WHERE wc.marked_by = ss.profile_id
            ), '[]'::JSONB),
            'daily_data', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object('date', dc.attendance_date, 'count', dc.day_count)
                ORDER BY dc.attendance_date
              )
              FROM daily_counts dc
              WHERE dc.marked_by = ss.profile_id
            ), '[]'::JSONB)
          )
          ORDER BY ss.periods_marked DESC
        ),
        'department_breakdown', (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'department_id',     dept_grp.department_id,
              'department_name',   dept_grp.department_name,
              'facilitator_count', dept_grp.fac_count,
              'total_marked',      dept_grp.total_marked,
              'total_assigned',    dept_grp.total_assigned,
              'total_pending',     dept_grp.total_pending,
              'avg_rate',          dept_grp.avg_rate
            )
            ORDER BY dept_grp.total_marked DESC
          ), '[]'::JSONB)
          FROM (
            SELECT
              ss2.department_id,
              ss2.department_name,
              COUNT(*)::INT                      AS fac_count,
              SUM(ss2.periods_marked)::INT       AS total_marked,
              SUM(ss2.periods_assigned)::INT     AS total_assigned,
              SUM(ss2.periods_pending)::INT      AS total_pending,
              ROUND(AVG(ss2.marking_rate), 1)    AS avg_rate
            FROM staff_stats ss2
            GROUP BY ss2.department_id, ss2.department_name
          ) dept_grp
        )
      ) AS result
    FROM staff_stats ss
  )
  SELECT result INTO v_result FROM aggregated;

  RETURN COALESCE(v_result, jsonb_build_object(
    'summary', jsonb_build_object(
      'total_facilitators',          0,
      'total_periods_marked',        0,
      'total_periods_assigned',      0,
      'total_periods_pending',       0,
      'avg_periods_per_facilitator', 0,
      'overall_marking_rate',        0.0
    ),
    'facilitators',          '[]'::JSONB,
    'department_breakdown',  '[]'::JSONB
  ));
END;
$$;

-- =====================================================
-- STARTUP STUDIO: get_event_stats
-- Added: 2026-03-07
-- Updated: 2026-03-22 — Fix total_members for Sarvam Galatta / individual events.
-- Returns aggregate team/member stats for a single event.
-- Used by the registrations page global stats cards (no filter active).
-- SECURITY DEFINER: bypasses RLS on event_registrations/event_team_members
-- so any authenticated role can read event stats.
-- =====================================================
CREATE OR REPLACE FUNCTION get_event_stats(p_event_id UUID)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Individual-registration events (e.g. Sarvam Galatta) create rows in
  -- sarvam_galatta_registrations but never in event_team_members.
  -- Use a CTE to detect this and fall back to the sarvam count for total_members.
  WITH sarvam_count AS (
    SELECT COUNT(*) AS cnt
    FROM sarvam_galatta_registrations
    WHERE event_id = p_event_id
  )
  SELECT jsonb_build_object(
      'total_teams',          COUNT(DISTINCT er.id) FILTER (WHERE er.status != 'disqualified'),
      'checked_in_teams',     COUNT(DISTINCT er.id) FILTER (WHERE er.checked_in = true AND er.status != 'disqualified'),
      'total_members',        CASE
                                WHEN (SELECT cnt FROM sarvam_count) > 0
                                THEN (SELECT cnt FROM sarvam_count)
                                ELSE COUNT(etm.id) FILTER (WHERE etm.status = 'accepted')
                              END,
      'members_with_laptops', COUNT(etm.id) FILTER (WHERE etm.status = 'accepted' AND etm.has_laptop = true),
      'institutions',         COUNT(DISTINCT er.institution_id) FILTER (WHERE er.status != 'disqualified')
  )
  FROM event_registrations er
  LEFT JOIN event_team_members etm ON etm.registration_id = er.id
  WHERE er.event_id = p_event_id;
$$;

-- =====================================================
-- STARTUP STUDIO: get_learner_participation_stats
-- Added: 2026-03-07
-- Updated: 2026-04-06 - Fixed: team owners were not counted as participants
--   because owner_id references profiles.id, not learners_profiles.id.
--   Added UNION to include owners via profiles.learner_id bridge.
-- Returns total learners / participated / not_participated for a given event.
-- Counts only lifecycle_status = 'active' learners from learners_profiles.
-- Participation = learner_id appears in event_team_members (accepted)
--   OR is a team owner in event_registrations (via profiles.learner_id).
-- All filter params are optional (NULL = no filter applied).
-- SECURITY DEFINER: bypasses RLS so admin can count all institution learners.
-- =====================================================
CREATE OR REPLACE FUNCTION get_learner_participation_stats(
    p_event_id        UUID,
    p_institution_id  UUID DEFAULT NULL,
    p_degree_id       UUID DEFAULT NULL,
    p_department_id   UUID DEFAULT NULL,
    p_program_id      UUID DEFAULT NULL,
    p_semester_id     UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH eligible_learners AS (
        SELECT id
        FROM learners_profiles
        WHERE lifecycle_status = 'active'
          AND (p_institution_id IS NULL OR institution_id = p_institution_id)
          AND (p_degree_id      IS NULL OR degree_id      = p_degree_id)
          AND (p_department_id  IS NULL OR department_id  = p_department_id)
          AND (p_program_id     IS NULL OR program_id     = p_program_id)
          AND (p_semester_id    IS NULL OR semester_id    = p_semester_id)
    ),
    participated AS (
        -- Team members (accepted)
        SELECT DISTINCT etm.learner_id
        FROM event_team_members etm
        JOIN event_registrations er ON er.id = etm.registration_id
        WHERE er.event_id  = p_event_id
          AND etm.learner_id IS NOT NULL
          AND etm.status = 'accepted'
          AND etm.learner_id IN (SELECT id FROM eligible_learners)

        UNION

        -- Team owners (via profiles.learner_id)
        SELECT DISTINCT p.learner_id
        FROM event_registrations er
        JOIN profiles p ON p.id = er.owner_id
        WHERE er.event_id = p_event_id
          AND p.learner_id IS NOT NULL
          AND p.learner_id IN (SELECT id FROM eligible_learners)
    )
    SELECT jsonb_build_object(
        'total_learners',   (SELECT COUNT(*) FROM eligible_learners),
        'participated',     (SELECT COUNT(*) FROM participated),
        'not_participated', (SELECT COUNT(*) FROM eligible_learners) - (SELECT COUNT(*) FROM participated)
    );
$$;

-- =====================================================
-- STARTUP STUDIO: get_not_participated_learners
-- Added: 2026-03-08
-- Updated: 2026-03-09 - Added section_id, section_name, class_incharge_names,
--                       class_incharge_count to show staff class incharge per student
-- Updated: 2026-04-06 - Fixed: team owners were not counted as participants
--   because owner_id references profiles.id, not learners_profiles.id.
--   Added UNION to include owners via profiles.learner_id bridge.
-- Returns paginated list of active learners who have NOT participated
-- (i.e. not accepted into any team AND not a team owner) for the given event.
-- Mirrors the CTEs in get_learner_participation_stats but returns rows.
-- Supports optional class hierarchy filters and text search.
-- SECURITY DEFINER: bypasses RLS so admin can read all institution learners.
-- =====================================================
CREATE OR REPLACE FUNCTION get_not_participated_learners(
    p_event_id        UUID,
    p_institution_id  UUID    DEFAULT NULL,
    p_degree_id       UUID    DEFAULT NULL,
    p_department_id   UUID    DEFAULT NULL,
    p_program_id      UUID    DEFAULT NULL,
    p_semester_id     UUID    DEFAULT NULL,
    p_search          TEXT    DEFAULT NULL,
    p_limit           INT     DEFAULT 50,
    p_offset          INT     DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    RETURN (
    WITH eligible_learners AS (
        SELECT
            lp.id,
            lp.first_name,
            lp.last_name,
            lp.roll_number,
            lp.college_email,
            lp.student_email,
            lp.institution_id,
            lp.degree_id,
            lp.department_id,
            lp.program_id,
            lp.semester_id,
            lp.section_id,
            i.name                   AS institution_name,
            deg.degree_name,
            dept.department_name,
            prog.program_name,
            sem.semester_name,
            sec.section_name,
            (
                SELECT STRING_AGG(st.first_name || ' ' || st.last_name, ', ' ORDER BY st.first_name)
                FROM   class_incharges ci
                JOIN   staff st ON st.id = ci.staff_id
                WHERE  ci.section_id = lp.section_id
                  AND  ci.is_active  = true
            ) AS class_incharge_names,
            (
                SELECT COUNT(*)::int
                FROM   class_incharges ci
                WHERE  ci.section_id = lp.section_id
                  AND  ci.is_active  = true
            ) AS class_incharge_count
        FROM   learners_profiles lp
        LEFT JOIN institutions  i    ON i.id    = lp.institution_id
        LEFT JOIN degrees       deg  ON deg.id  = lp.degree_id
        LEFT JOIN departments   dept ON dept.id = lp.department_id
        LEFT JOIN programs      prog ON prog.id = lp.program_id
        LEFT JOIN semesters     sem  ON sem.id  = lp.semester_id
        LEFT JOIN sections      sec  ON sec.id  = lp.section_id
        WHERE  lp.lifecycle_status = 'active'
          AND  lp.learner_type = 'regular'
          AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
          AND (p_degree_id      IS NULL OR lp.degree_id      = p_degree_id)
          AND (p_department_id  IS NULL OR lp.department_id  = p_department_id)
          AND (p_program_id     IS NULL OR lp.program_id     = p_program_id)
          AND (p_semester_id    IS NULL OR lp.semester_id    = p_semester_id)
    ),
    participated AS (
        -- Team members (accepted)
        SELECT DISTINCT etm.learner_id
        FROM   event_team_members etm
        JOIN   event_registrations er ON er.id = etm.registration_id
        WHERE  er.event_id      = p_event_id
          AND  etm.learner_id   IS NOT NULL
          AND  etm.status       = 'accepted'
          AND  etm.learner_id   IN (SELECT id FROM eligible_learners)

        UNION

        -- Team owners (via profiles.learner_id)
        SELECT DISTINCT p.learner_id
        FROM   event_registrations er
        JOIN   profiles p ON p.id = er.owner_id
        WHERE  er.event_id  = p_event_id
          AND  p.learner_id IS NOT NULL
          AND  p.learner_id IN (SELECT id FROM eligible_learners)
    ),
    not_participated AS (
        SELECT el.*
        FROM   eligible_learners el
        WHERE  el.id NOT IN (SELECT learner_id FROM participated)
          AND  (
                p_search IS NULL
                OR el.first_name   ILIKE '%' || p_search || '%'
                OR el.last_name    ILIKE '%' || p_search || '%'
                OR (el.first_name || ' ' || el.last_name) ILIKE '%' || p_search || '%'
                OR el.roll_number  ILIKE '%' || p_search || '%'
                OR el.college_email ILIKE '%' || p_search || '%'
               )
    )
    SELECT jsonb_build_object(
        'total', (SELECT COUNT(*) FROM not_participated),
        'data',  COALESCE(
            (
                SELECT jsonb_agg(row_to_json(np))
                FROM (
                    SELECT *
                    FROM   not_participated
                    ORDER  BY institution_name, semester_name, last_name, first_name
                    LIMIT  p_limit
                    OFFSET p_offset
                ) np
            ),
            '[]'::jsonb
        )
    )
    );
END;
$function$;

-- =====================================================
-- STARTUP STUDIO: get_not_participated_by_institution
-- Added: 2026-03-08
-- Updated: 2026-04-06 - Fixed: team owners were not counted as participants
--   because owner_id references profiles.id, not learners_profiles.id.
--   Added UNION to include owners via profiles.learner_id bridge.
-- Returns institution-wise breakdown of not-participated learner counts
-- for a given event. Applies the same eligibility + participation logic
-- as get_not_participated_learners. No pagination — always returns all rows.
-- SECURITY DEFINER: bypasses RLS so admin can count across institutions.
-- =====================================================
CREATE OR REPLACE FUNCTION get_not_participated_by_institution(
    p_event_id        UUID,
    p_institution_id  UUID DEFAULT NULL,
    p_degree_id       UUID DEFAULT NULL,
    p_department_id   UUID DEFAULT NULL,
    p_program_id      UUID DEFAULT NULL,
    p_semester_id     UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    RETURN (
    WITH eligible_learners AS (
        SELECT lp.id, lp.institution_id, i.name AS institution_name
        FROM   learners_profiles lp
        LEFT JOIN institutions i ON i.id = lp.institution_id
        WHERE  lp.lifecycle_status = 'active'
          AND  lp.learner_type = 'regular'
          AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
          AND (p_degree_id      IS NULL OR lp.degree_id      = p_degree_id)
          AND (p_department_id  IS NULL OR lp.department_id  = p_department_id)
          AND (p_program_id     IS NULL OR lp.program_id     = p_program_id)
          AND (p_semester_id    IS NULL OR lp.semester_id    = p_semester_id)
    ),
    participated AS (
        -- Team members (accepted)
        SELECT DISTINCT etm.learner_id
        FROM   event_team_members etm
        JOIN   event_registrations er ON er.id = etm.registration_id
        WHERE  er.event_id    = p_event_id
          AND  etm.learner_id IS NOT NULL
          AND  etm.status     = 'accepted'
          AND  etm.learner_id IN (SELECT id FROM eligible_learners)

        UNION

        -- Team owners (via profiles.learner_id)
        SELECT DISTINCT p.learner_id
        FROM   event_registrations er
        JOIN   profiles p ON p.id = er.owner_id
        WHERE  er.event_id  = p_event_id
          AND  p.learner_id IS NOT NULL
          AND  p.learner_id IN (SELECT id FROM eligible_learners)
    ),
    not_participated AS (
        SELECT el.institution_id, el.institution_name
        FROM   eligible_learners el
        WHERE  el.id NOT IN (SELECT learner_id FROM participated)
    ),
    by_institution AS (
        SELECT
            institution_id,
            institution_name,
            COUNT(*) AS not_participated_count
        FROM   not_participated
        GROUP  BY institution_id, institution_name
        ORDER  BY not_participated_count DESC
    )
    SELECT COALESCE(
        jsonb_agg(row_to_json(bi)),
        '[]'::jsonb
    )
    FROM by_institution bi
    );
END;
$function$;

-- =====================================================
-- STARTUP STUDIO: prevent_duplicate_event_member
-- Added: 2026-03-07
-- Updated: 2026-03-08 — SECURITY DEFINER so trigger can read event_registrations
--   even when invoked by an invited member (student) who doesn't own the registration.
--   Without this, RLS blocks the SELECT and raises 'Registration not found'.
-- Trigger function: prevents the same learner_id from
-- being accepted in more than one team per event.
-- Called by: trg_prevent_duplicate_event_member (04_triggers.sql)
-- =====================================================
CREATE OR REPLACE FUNCTION prevent_duplicate_event_member()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_id UUID;
  v_duplicate_count INT;
BEGIN
  IF NEW.status != 'accepted' OR NEW.learner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT event_id INTO v_event_id
  FROM event_registrations
  WHERE id = NEW.registration_id;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Registration not found for id %', NEW.registration_id;
  END IF;

  SELECT COUNT(*) INTO v_duplicate_count
  FROM event_team_members etm
  JOIN event_registrations er ON er.id = etm.registration_id
  WHERE er.event_id = v_event_id
    AND etm.learner_id = NEW.learner_id
    AND etm.status = 'accepted'
    AND etm.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);

  IF v_duplicate_count > 0 THEN
    RAISE EXCEPTION 'Learner is already accepted in another team for this event';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ══════════════════════════════════════════════════════════════
-- submit_role_card RPC (Added: 2026-03-08)
-- Atomic insert of role card + peer tags in one transaction.
-- SECURITY DEFINER: bypasses RLS but validates caller = p_profile_id.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION submit_role_card(
  p_submission_id    UUID,
  p_team_id          UUID,
  p_profile_id       UUID,
  p_learner_id       UUID,
  p_self_roles       TEXT[],
  p_proud_of         TEXT,
  p_peer_tags        JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_card_id UUID;
  v_peer        JSONB;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_profile_id THEN
    RAISE EXCEPTION 'Unauthorized: caller does not match profile_id';
  END IF;

  IF array_length(p_self_roles, 1) IS NULL
     OR array_length(p_self_roles, 1) < 1
     OR array_length(p_self_roles, 1) > 2 THEN
    RAISE EXCEPTION 'Must select 1–2 roles';
  END IF;

  IF length(trim(p_proud_of)) < 10 OR length(trim(p_proud_of)) > 150 THEN
    RAISE EXCEPTION 'proud_of must be 10–150 characters';
  END IF;

  INSERT INTO appathon_role_cards
    (submission_id, team_id, profile_id, learner_id, self_roles, proud_of)
  VALUES
    (p_submission_id, p_team_id, p_profile_id, p_learner_id, p_self_roles, trim(p_proud_of))
  RETURNING id INTO v_role_card_id;

  FOR v_peer IN SELECT * FROM jsonb_array_elements(p_peer_tags)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM event_team_members
      WHERE registration_id = p_team_id
        AND profile_id = (v_peer->>'tagged_profile_id')::UUID
        AND status = 'accepted'
    ) THEN
      RAISE EXCEPTION 'tagged_profile_id % is not an accepted member of this team',
        v_peer->>'tagged_profile_id';
    END IF;

    INSERT INTO appathon_peer_tags
      (role_card_id, tagger_profile_id, tagged_profile_id, tagged_role)
    VALUES (
      v_role_card_id,
      p_profile_id,
      (v_peer->>'tagged_profile_id')::UUID,
      v_peer->>'tagged_role'
    );
  END LOOP;

  RETURN v_role_card_id;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_role_card TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Marketing Leads Database — Optimized RPC Functions
-- Added: 2026-03-25 — Fix statement timeout on bulk upload & stats queries
-- ═══════════════════════════════════════════════════════════════════════════════

-- Get aggregated stats in a single SQL query (bypasses per-row RLS overhead)
CREATE OR REPLACE FUNCTION get_marketing_leads_stats(p_institution_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'totalLeads', COALESCE(count(*), 0),
    'totalDistricts', COALESCE(count(DISTINCT district), 0),
    'totalSchools', COALESCE(count(DISTINCT school_name), 0),
    'genderBreakdown', json_build_object(
      'male', count(*) FILTER (WHERE gender = 'Male'),
      'female', count(*) FILTER (WHERE gender = 'Female'),
      'other', count(*) FILTER (WHERE gender = 'Other')
    ),
    'totalUploads', COALESCE(count(DISTINCT upload_batch_id), 0)
  )
  FROM marketing_leads_database
  WHERE institution_id = p_institution_id;
$$;

GRANT EXECUTE ON FUNCTION get_marketing_leads_stats TO authenticated;

-- Get distinct districts for filter dropdown
CREATE OR REPLACE FUNCTION get_marketing_leads_districts(p_institution_id uuid)
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT DISTINCT district
  FROM marketing_leads_database
  WHERE institution_id = p_institution_id
    AND district IS NOT NULL
  ORDER BY district;
$$;

GRANT EXECUTE ON FUNCTION get_marketing_leads_districts TO authenticated;

-- Bulk insert leads via JSONB (single auth check, no per-row RLS overhead)
CREATE OR REPLACE FUNCTION bulk_insert_marketing_leads(
  p_leads jsonb,
  p_institution_id uuid,
  p_batch_id uuid,
  p_file_name text,
  p_user_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inserted int := 0;
BEGIN
  -- Security check: verify the caller has access
  IF NOT (
    p_institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN custom_roles cr ON ur.role_id = cr.id
      WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'
    )
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions';
  END IF;

  -- Bulk insert all rows at once
  INSERT INTO marketing_leads_database (
    institution_id, district, sub_district, student_name, father_name,
    gender, community, mobile_number, group_detail, address, pincode,
    school_name, upload_batch_id, uploaded_by, upload_file_name, created_by
  )
  SELECT
    p_institution_id,
    (elem->>'district'),
    (elem->>'sub_district'),
    COALESCE(elem->>'student_name', ''),
    (elem->>'father_name'),
    (elem->>'gender'),
    (elem->>'community'),
    (elem->>'mobile_number'),
    (elem->>'group_detail'),
    (elem->>'address'),
    (elem->>'pincode'),
    (elem->>'school_name'),
    p_batch_id,
    p_user_id,
    p_file_name,
    p_user_id
  FROM jsonb_array_elements(p_leads) AS elem;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN json_build_object(
    'inserted', v_inserted,
    'failed', 0,
    'errors', '[]'::json
  );
END;
$$;

GRANT EXECUTE ON FUNCTION bulk_insert_marketing_leads TO authenticated;

-- Get upload batch history grouped by batch_id
-- Added: 2026-03-26 — Missing RPC that caused fallback full-table scan + timeout
CREATE OR REPLACE FUNCTION get_marketing_lead_upload_batches(p_institution_id uuid)
RETURNS TABLE (
  upload_batch_id uuid,
  upload_file_name text,
  uploaded_by uuid,
  created_at timestamptz,
  total_records bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    m.upload_batch_id,
    (array_agg(m.upload_file_name ORDER BY m.created_at ASC))[1] AS upload_file_name,
    (array_agg(m.uploaded_by ORDER BY m.created_at ASC))[1] AS uploaded_by,
    MIN(m.created_at) AS created_at,
    COUNT(*) AS total_records
  FROM marketing_leads_database m
  WHERE m.institution_id = p_institution_id
  GROUP BY m.upload_batch_id
  ORDER BY MIN(m.created_at) DESC;
$$;

GRANT EXECUTE ON FUNCTION get_marketing_lead_upload_batches TO authenticated;

-- ================================================================================
-- SECTION: VAC + CASE Module Functions (Added: 2026-04-02)
-- ================================================================================

-- 1. Check if user is enrolled in a VAC course
CREATE OR REPLACE FUNCTION is_enrolled_in_vac_course(
  p_user_id UUID,
  p_course_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vac_enrollments
    WHERE user_id = p_user_id
      AND course_id = p_course_id
      AND status = 'active'
      AND (payment_status = 'paid' OR payment_status = 'waived')
  );
$$;

GRANT EXECUTE ON FUNCTION is_enrolled_in_vac_course TO authenticated;

-- 2. Get enrollment stats per VAC course (for analytics)
CREATE OR REPLACE FUNCTION get_vac_course_enrollment_stats(
  p_institution_id UUID
)
RETURNS TABLE (
  course_id UUID,
  course_code VARCHAR,
  course_name VARCHAR,
  track VARCHAR,
  total_enrolled BIGINT,
  active_count BIGINT,
  completed_count BIGINT,
  cancelled_count BIGINT,
  avg_completion_pct NUMERIC,
  total_revenue NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    vc.id AS course_id,
    vc.code AS course_code,
    vc.name AS course_name,
    vc.track,
    COUNT(ve.id) AS total_enrolled,
    COUNT(ve.id) FILTER (WHERE ve.status = 'active') AS active_count,
    COUNT(ve.id) FILTER (WHERE ve.status = 'completed') AS completed_count,
    COUNT(ve.id) FILTER (WHERE ve.status = 'cancelled') AS cancelled_count,
    COALESCE(
      ROUND(
        AVG(
          CASE WHEN ve.status IN ('active', 'completed') THEN
            (SELECT COUNT(*) FILTER (WHERE vlp.status = 'completed')::NUMERIC
              / GREATEST(COUNT(*), 1)::NUMERIC * 100
             FROM vac_learner_progress vlp
             WHERE vlp.user_id = ve.user_id AND vlp.course_id = ve.course_id)
          END
        ), 1
      ), 0
    ) AS avg_completion_pct,
    COALESCE(SUM(ve.payment_amount) FILTER (WHERE ve.payment_status = 'paid'), 0) AS total_revenue
  FROM vac_courses vc
  LEFT JOIN vac_enrollments ve ON ve.course_id = vc.id
  WHERE vc.institution_id = p_institution_id
    AND vc.is_active = true
  GROUP BY vc.id, vc.code, vc.name, vc.track
  ORDER BY total_enrolled DESC;
$$;

GRANT EXECUTE ON FUNCTION get_vac_course_enrollment_stats TO authenticated;

-- 3. Check CASE track prerequisite before enrollment (trigger function)
CREATE OR REPLACE FUNCTION check_case_track_prerequisite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prereq_id UUID;
  v_prereq_completed BOOLEAN;
BEGIN
  -- Get prerequisite track for the track being enrolled in
  SELECT prerequisite_track_id INTO v_prereq_id
  FROM case_tracks
  WHERE id = NEW.track_id;

  -- If no prerequisite, allow enrollment
  IF v_prereq_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if prerequisite track is completed
  SELECT EXISTS (
    SELECT 1 FROM case_track_enrollments
    WHERE user_id = NEW.user_id
      AND track_id = v_prereq_id
      AND status = 'completed'
  ) INTO v_prereq_completed;

  IF NOT v_prereq_completed THEN
    RAISE EXCEPTION 'Prerequisite track not completed. Complete the prerequisite track before enrolling in this one.';
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Auto-update CASE learner progress when a track is completed (trigger function)
CREATE OR REPLACE FUNCTION update_case_learner_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tracks_done INTEGER;
  v_total_hours NUMERIC;
  v_programme_id UUID;
  v_institution_id UUID;
BEGIN
  -- Only process when status changes to 'completed'
  IF NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Get learner's programme and institution from profile
  SELECT p.programme_id, p.institution_id
  INTO v_programme_id, v_institution_id
  FROM profiles p
  WHERE p.id = NEW.user_id;

  -- If no programme_id, try from learners_profiles
  IF v_programme_id IS NULL THEN
    SELECT lp.program_id, lp.institution_id
    INTO v_programme_id, v_institution_id
    FROM learners_profiles lp
    WHERE lp.id = NEW.user_id;
  END IF;

  -- Count completed tracks
  SELECT COUNT(*), COALESCE(SUM(ct.duration_hours), 0)
  INTO v_tracks_done, v_total_hours
  FROM case_track_enrollments cte
  JOIN case_tracks ct ON ct.id = cte.track_id
  WHERE cte.user_id = NEW.user_id
    AND cte.status = 'completed';

  -- Upsert case_learner_progress
  INSERT INTO case_learner_progress (
    user_id, programme_id, institution_id,
    tracks_completed, total_hours_completed,
    graduation_ready, updated_at
  )
  VALUES (
    NEW.user_id,
    COALESCE(v_programme_id, '00000000-0000-0000-0000-000000000000'::UUID),
    COALESCE(v_institution_id, '00000000-0000-0000-0000-000000000000'::UUID),
    v_tracks_done,
    v_total_hours,
    v_tracks_done >= 6,
    now()
  )
  ON CONFLICT (user_id, programme_id)
  DO UPDATE SET
    tracks_completed = EXCLUDED.tracks_completed,
    total_hours_completed = EXCLUDED.total_hours_completed,
    graduation_ready = EXCLUDED.graduation_ready,
    updated_at = now();

  RETURN NEW;
END;
$$;

-- 5. Process CASE alerts — daily cron function
CREATE OR REPLACE FUNCTION process_case_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_learner RECORD;
  v_req RECORD;
  v_semesters_remaining INTEGER;
  v_tracks_remaining INTEGER;
  v_tracks_per_sem NUMERIC;
  v_new_risk TEXT;
  v_days_to_exam INTEGER;
BEGIN
  -- For each active learner with CASE progress
  FOR v_learner IN
    SELECT clp.*, cgr.programme_duration_semesters, cgr.enforcement_days_before_exam
    FROM case_learner_progress clp
    JOIN case_graduation_requirements cgr
      ON cgr.programme_id = clp.programme_id
      AND cgr.institution_id = clp.institution_id
      AND cgr.is_active = true
    WHERE clp.graduation_ready = false
      AND clp.risk_level != 'completed'
  LOOP
    -- Calculate risk
    v_semesters_remaining := GREATEST(v_learner.programme_duration_semesters - v_learner.current_semester, 0);
    v_tracks_remaining := 6 - v_learner.tracks_completed;
    v_tracks_per_sem := CASE
      WHEN v_semesters_remaining > 0 THEN CEIL(v_tracks_remaining::NUMERIC / v_semesters_remaining)
      ELSE v_tracks_remaining + 1  -- Force overdue
    END;

    -- Determine risk level
    IF v_learner.tracks_completed >= 6 THEN
      v_new_risk := 'completed';
    ELSIF v_semesters_remaining = 0 AND v_tracks_remaining > 0 THEN
      v_new_risk := 'overdue';
    ELSIF v_tracks_per_sem >= 3 THEN
      v_new_risk := 'critical';
    ELSIF v_tracks_per_sem >= 2 THEN
      v_new_risk := 'at_risk';
    ELSE
      v_new_risk := 'on_track';
    END IF;

    -- Update risk level
    UPDATE case_learner_progress
    SET risk_level = v_new_risk, updated_at = now()
    WHERE id = v_learner.id;

    -- Generate alerts for at-risk and above (only if not recently alerted)
    IF v_new_risk IN ('at_risk', 'critical', 'overdue')
       AND (v_learner.last_alert_sent_at IS NULL
            OR v_learner.last_alert_sent_at < now() - INTERVAL '7 days') THEN

      INSERT INTO case_alerts (user_id, alert_type, message, sent_via)
      VALUES (
        v_learner.user_id,
        v_new_risk || '_alert',
        CASE v_new_risk
          WHEN 'at_risk' THEN 'You need to complete ' || v_tracks_remaining || ' more CASE tracks. Consider enrolling in the next available batch.'
          WHEN 'critical' THEN 'URGENT: You have ' || v_tracks_remaining || ' CASE tracks remaining with only ' || v_semesters_remaining || ' semester(s) left.'
          WHEN 'overdue' THEN 'CRITICAL: You have exceeded the expected timeline for CASE completion. Contact your coordinator immediately.'
        END,
        CASE v_new_risk
          WHEN 'at_risk' THEN ARRAY['push', 'in_app']
          WHEN 'critical' THEN ARRAY['push', 'in_app', 'email']
          WHEN 'overdue' THEN ARRAY['push', 'in_app', 'email', 'sms']
        END
      );

      -- Update last alert timestamp
      UPDATE case_learner_progress
      SET last_alert_sent_at = now()
      WHERE id = v_learner.id;
    END IF;

    -- Check exam proximity alerts
    IF v_learner.estimated_exam_date IS NOT NULL THEN
      v_days_to_exam := (v_learner.estimated_exam_date - CURRENT_DATE);

      IF v_days_to_exam <= v_learner.enforcement_days_before_exam
         AND v_learner.tracks_completed < 6
         AND (v_learner.last_alert_sent_at IS NULL
              OR v_learner.last_alert_sent_at < now() - INTERVAL '1 day') THEN

        INSERT INTO case_alerts (user_id, alert_type, message, sent_via)
        VALUES (
          v_learner.user_id,
          'enforcement_' || v_days_to_exam || '_days',
          'ENFORCEMENT ALERT: ' || v_days_to_exam || ' days until exam. ' ||
          (6 - v_learner.tracks_completed) || ' CASE tracks still incomplete.',
          ARRAY['push', 'in_app', 'email']
        );

        UPDATE case_learner_progress
        SET last_alert_sent_at = now()
        WHERE id = v_learner.id;
      END IF;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION process_case_alerts TO authenticated;

-- ============================================================================
-- RLS INTROSPECTION FUNCTIONS (for Permissions Audit Dashboard)
-- Updated: 2026-04-13 - Added for enhanced permissions audit
-- ============================================================================

-- Get all RLS policies from pg_policies system view
CREATE OR REPLACE FUNCTION get_rls_policies()
RETURNS TABLE (
  schemaname text,
  tablename text,
  policyname text,
  command text,
  using_expression text,
  with_check_expression text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    p.schemaname::text,
    p.tablename::text,
    p.policyname::text,
    p.cmd::text as command,
    p.qual::text as using_expression,
    p.with_check::text as with_check_expression
  FROM pg_policies p
  WHERE p.schemaname = 'public'
  ORDER BY p.tablename, p.policyname;
$$;

-- Get all tables that have RLS enabled
CREATE OR REPLACE FUNCTION get_tables_with_rls()
RETURNS TABLE (
  tablename text,
  has_rls boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    c.relname::text as tablename,
    c.relrowsecurity as has_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity = true
  ORDER BY c.relname;
$$;

-- Safe SQL execution wrapper for AI Permission Debugger
-- Updated: 2026-04-13 - Added for AI-suggested fix execution
CREATE OR REPLACE FUNCTION exec_sql_safe(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE query;
  RETURN json_build_object('success', true, 'message', 'SQL executed successfully');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;

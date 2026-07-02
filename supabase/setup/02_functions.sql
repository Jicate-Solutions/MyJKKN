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
-- Updated: 2026-04-25 - Fixed two bugs: (1) i.institution_name → i.name (column does not exist),
--   (2) added UNION with profiles.institution_id so own-scoped users (HOD, etc.)
--   always see their primary institution even with no user_institution_access entries.
-- Updated: 2026-04-25 - Fixed duplicate-row bug: UNION did not dedupe because
--   access_type ('primary' vs 'full'/'read_only') differed when the user had
--   both a primary institution and an explicit user_institution_access row for
--   the same institution. The second branch now excludes the primary so each
--   institution_id appears at most once with is_primary_institution=true winning.
-- Updated: 2026-04-27 - Added Branch 3 to honor custom_roles.institution_scope='all'.
--   Previously, scope='all' roles (admission, admission_staff, counselor) were
--   restricted by service-layer institution filters to only their primary institution
--   even though Role Management granted them cross-institution access. Symptom:
--   admission user could not see billing categories despite having full perms.
--   Branch 3 mirrors role_has_institution_access() — checks user_roles AND legacy
--   profiles.role -> custom_roles fallback.
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
    -- Branch 1: user's primary institution from profiles
    SELECT
        i.id,
        i.name::varchar,
        i.counselling_code::varchar,
        'primary'::varchar,
        true
    FROM profiles p
    JOIN institutions i ON i.id = p.institution_id
    WHERE p.id = target_user_id
      AND p.institution_id IS NOT NULL
      AND i.is_active = true

    UNION ALL

    -- Branch 2: explicit cross-institution grants (skipping primary to avoid dupes)
    SELECT
        i.id,
        i.name::varchar,
        i.counselling_code::varchar,
        uia.access_type::varchar,
        false
    FROM institutions i
    JOIN user_institution_access uia ON i.id = uia.institution_id
    WHERE uia.user_id = target_user_id
      AND uia.is_active = true
      AND i.is_active = true
      AND NOT EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = target_user_id
            AND p.institution_id = i.id
      )

    UNION ALL

    -- Branch 3: if user has any role with institution_scope='all', include
    -- every active institution. Mirrors role_has_institution_access() — checks both
    -- user_roles (multi-role) and legacy profiles.role -> custom_roles fallback.
    -- Skip institutions already returned by branches 1 and 2 to avoid duplicates.
    SELECT
        i.id,
        i.name::varchar,
        i.counselling_code::varchar,
        'role_scope_all'::varchar,
        false
    FROM institutions i
    WHERE i.is_active = true
      AND (
          EXISTS (
              SELECT 1
              FROM user_roles ur
              JOIN custom_roles cr ON cr.id = ur.role_id
              WHERE ur.user_id = target_user_id
                AND cr.institution_scope = 'all'
          )
          OR EXISTS (
              SELECT 1
              FROM profiles p
              JOIN custom_roles cr ON p.role = cr.role_key
              WHERE p.id = target_user_id
                AND cr.institution_scope = 'all'
          )
      )
      AND NOT EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = target_user_id
            AND p.institution_id = i.id
      )
      AND NOT EXISTS (
          SELECT 1 FROM user_institution_access uia
          WHERE uia.user_id = target_user_id
            AND uia.institution_id = i.id
            AND uia.is_active = true
      );
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
-- Updated: 2026-04-22 - Mirror live body back to source (drift fix). Two changes:
--   1. Priority ladder: staff.profile_id FK first, then email lookup. Survives email rename
--      and makes the trigger deterministic when profile_id is already linked.
--   2. SECURITY DEFINER. The email-fallback ORDER BY references auth.users to prefer
--      auth-linked profiles on duplicate emails. auth.users grants SELECT only to postgres,
--      so SECURITY INVOKER would fail for any caller other than a superuser (42501 error).
--      search_path pinned to public to close the classic definer-hijack vector.
CREATE OR REPLACE FUNCTION public.sync_staff_to_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    existing_profile_id UUID;
BEGIN
    IF NEW.institution_email IS NOT NULL AND NEW.institution_email != '' THEN
        -- Priority 1: durable FK. Survives email rename.
        IF NEW.profile_id IS NOT NULL THEN
            SELECT id INTO existing_profile_id
            FROM profiles WHERE id = NEW.profile_id;
        END IF;

        -- Priority 2: email lookup with deterministic ordering (auth-linked first, then newest).
        IF existing_profile_id IS NULL THEN
            SELECT p.id INTO existing_profile_id
            FROM profiles p
            WHERE p.email = NEW.institution_email
            ORDER BY
                (EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)) DESC,
                p.updated_at DESC
            LIMIT 1;
        END IF;

        IF existing_profile_id IS NOT NULL THEN
            UPDATE profiles
            SET email          = NEW.institution_email,
                full_name      = CONCAT(NEW.first_name, ' ', NEW.last_name),
                phone_number   = NEW.phone,
                avatar_url     = COALESCE(NEW.profile_picture, avatar_url),
                institution_id = NEW.institution_id,
                department_id  = NEW.department_id,
                gender         = NEW.gender,
                designation    = NEW.designation,
                role           = NEW.role_key,
                is_active      = NEW.is_active,
                updated_at     = NOW()
            WHERE id = existing_profile_id;
            NEW.profile_id := existing_profile_id;
        ELSE
            existing_profile_id := gen_random_uuid();
            INSERT INTO profiles (
                id, email, full_name, phone_number, avatar_url,
                institution_id, department_id, gender, designation,
                role, is_pre_registered, is_active
            ) VALUES (
                existing_profile_id,
                NEW.institution_email,
                CONCAT(NEW.first_name, ' ', NEW.last_name),
                NEW.phone,
                NEW.profile_picture,
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

    -- Learners who can log in: active OR graduated.
    -- Mirrors StudentValidationService.validateStudentAccess allow-list.
    should_be_active := (NEW.lifecycle_status IN ('active', 'graduated'));

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
'Auto-syncs learner lifecycle_status changes to profiles.is_active. Active and graduated learners can log in (mirrors StudentValidationService allow-list).';

-- Seat analytics: stamp activated_at exactly once when status first transitions to 'active'
CREATE OR REPLACE FUNCTION public.set_learner_activated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF NEW.lifecycle_status = 'active'
     AND OLD.lifecycle_status IS DISTINCT FROM 'active'
     AND NEW.activated_at IS NULL THEN
    NEW.activated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_learner_activated_at IS
'Sets activated_at once when lifecycle_status first changes to active. Never overwrites an existing value.';

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
      -- Include any user explicitly added to admission_counselors (any role)
      OR p.id IN (
        SELECT ac.user_id
        FROM admission_counselors ac
        WHERE ac.is_active = true
          AND ac.user_id IS NOT NULL
          AND (p_institution_id IS NULL OR ac.institution_id = p_institution_id)
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
STABLE  -- 2026-06-03: read-only; lets the planner InitPlan-cache it per statement in the many RLS policies that call it
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

-- Updated: 2026-04-16 - 2-arg overload for service-role API routes (auth.uid() is null)
-- Mirrors the 1-arg version: checks user_roles (multi-role) + legacy profiles.role fallback
CREATE OR REPLACE FUNCTION public.user_has_permission(user_id uuid, permission_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF permission_key IS NULL OR permission_key = '' THEN
        RETURN false;
    END IF;
    -- Super admin bypass
    IF EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = user_id
        AND (p.is_super_admin = true OR p.role = 'super_admin')
    ) THEN
        RETURN true;
    END IF;
    -- Multi-role system: check all assigned roles (OR logic)
    IF EXISTS (
        SELECT 1 FROM user_roles ur
        INNER JOIN custom_roles cr ON ur.role_id = cr.id
        WHERE ur.user_id = user_has_permission.user_id
        AND (cr.permissions->>permission_key)::boolean = true
    ) THEN
        RETURN true;
    END IF;
    -- Legacy fallback: profiles.role -> custom_roles
    RETURN EXISTS (
        SELECT 1 FROM profiles p
        JOIN custom_roles cr ON p.role = cr.role_key
        WHERE p.id = user_has_permission.user_id
        AND (cr.permissions->>permission_key)::boolean = true
    );
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


-- =====================================================
-- fn_dashboard_metrics v1 (2026-04-15 Day 2) — DEDUPED 2026-04-21
-- Superseded by v3 further down (search: "Dashboard v2 security hotfix").
-- Removed here to prevent schema-dump/restore reordering landmines, since
-- Postgres CREATE OR REPLACE applies in file order and the last wins.
-- See git blame for original 155-line body.
-- =====================================================

-- =====================================================
-- Dashboard v2 Day 3 — Decision Queue RPCs
-- Added: 2026-04-15 — list/action/escalate functions
-- Spec: specs/myjkkn-dashboard-v2-spec.md §7.2, §4.2
-- =====================================================

-- List queue items for auth.uid() — filtered, severity-sorted, counts per type
CREATE OR REPLACE FUNCTION fn_dashboard_queue_list(
  p_filter TEXT DEFAULT 'all',
  p_limit INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_items JSONB;
  v_counts JSONB;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'counts',
      jsonb_build_object('total', 0, 'approval', 0, 'escalation', 0, 'rescue', 0, 'anomaly', 0));
  END IF;

  SELECT jsonb_build_object(
    'total', COUNT(*),
    'approval', COUNT(*) FILTER (WHERE n.category = 'dashboard:approval'),
    'escalation', COUNT(*) FILTER (WHERE n.category = 'dashboard:escalation'),
    'rescue', COUNT(*) FILTER (WHERE n.category = 'dashboard:rescue'),
    'anomaly', COUNT(*) FILTER (WHERE n.category = 'dashboard:anomaly')
  )
  INTO v_counts
  FROM user_notifications un
  JOIN notifications n ON n.id = un.notification_id
  WHERE un.user_id = v_user
    AND un.acknowledged_at IS NULL
    -- 2026-04-23: dropped requires_acknowledgment filter — work items are modal-exempt.
    AND n.category LIKE 'dashboard:%'
    AND (n.expires_at IS NULL OR n.expires_at > NOW())
    AND n.superseded_by IS NULL;

  SELECT jsonb_agg(row_to_json(q)::jsonb ORDER BY severity_order ASC, created_at ASC)
  INTO v_items
  FROM (
    SELECT
      un.id AS user_notification_id, n.id AS notification_id,
      n.title, n.body, n.category, n.priority, n.action_type, n.action_config,
      n.created_at, n.acknowledgment_deadline_hours,
      un.escalated_at, un.escalation_level,
      EXTRACT(EPOCH FROM (NOW() - n.created_at))::bigint AS age_seconds,
      CASE n.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END AS severity_order,
      CASE n.priority WHEN 'urgent' THEN 'red' WHEN 'high' THEN 'amber' ELSE 'neutral' END AS severity_band,
      CASE n.category
        WHEN 'dashboard:approval' THEN 'approval'
        WHEN 'dashboard:escalation' THEN 'escalation'
        WHEN 'dashboard:rescue' THEN 'rescue'
        WHEN 'dashboard:anomaly' THEN 'anomaly'
        ELSE 'other' END AS queue_type
    FROM user_notifications un
    JOIN notifications n ON n.id = un.notification_id
    WHERE un.user_id = v_user
      AND un.acknowledged_at IS NULL
      -- 2026-04-23: dropped requires_acknowledgment filter — work items are modal-exempt.
      AND n.category LIKE 'dashboard:%'
      AND (n.expires_at IS NULL OR n.expires_at > NOW())
      AND n.superseded_by IS NULL
      AND (p_filter = 'all' OR n.category = 'dashboard:' || p_filter)
    LIMIT p_limit
  ) q;

  RETURN jsonb_build_object('items', COALESCE(v_items, '[]'::jsonb), 'counts', v_counts, 'fetched_at', NOW());
END;
$$;
GRANT EXECUTE ON FUNCTION fn_dashboard_queue_list(TEXT, INT) TO authenticated;

-- Perform inline action on queue item — idempotent via p_idempotency_key
CREATE OR REPLACE FUNCTION fn_dashboard_queue_action(
  p_user_notification_id UUID,
  p_action TEXT,
  p_note TEXT DEFAULT NULL,
  p_delegate_to UUID DEFAULT NULL,
  p_snooze_minutes INT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_un user_notifications;
  v_notif notifications;
  v_already_processed BOOLEAN := FALSE;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'not_authenticated'); END IF;
  IF p_action NOT IN ('approve','reject','delegate','snooze','acknowledge','false_alarm') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_action');
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM notifications WHERE idempotency_key = p_idempotency_key AND acted_by IS NOT NULL)
    INTO v_already_processed;
    IF v_already_processed THEN RETURN jsonb_build_object('ok', TRUE, 'idempotent', TRUE, 'action', p_action); END IF;
  END IF;

  SELECT * INTO v_un FROM user_notifications WHERE id = p_user_notification_id AND user_id = v_user FOR UPDATE;
  IF v_un.id IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'not_found_or_not_owned'); END IF;
  IF v_un.acknowledged_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'idempotent', TRUE, 'already_acknowledged_at', v_un.acknowledged_at);
  END IF;

  SELECT * INTO v_notif FROM notifications WHERE id = v_un.notification_id;

  IF p_action = 'snooze' THEN
    UPDATE user_notifications SET created_at = NOW() + (COALESCE(p_snooze_minutes, 120) || ' minutes')::interval
      WHERE id = p_user_notification_id;
    RETURN jsonb_build_object('ok', TRUE, 'action', 'snooze', 'resumes_at', NOW() + (COALESCE(p_snooze_minutes, 120) || ' minutes')::interval);
  END IF;

  IF p_action = 'delegate' AND p_delegate_to IS NOT NULL THEN
    UPDATE notifications SET acted_by = v_user, idempotency_key = COALESCE(p_idempotency_key, idempotency_key), updated_at = NOW()
      WHERE id = v_un.notification_id;
    INSERT INTO user_notifications (notification_id, user_id, created_at) VALUES (v_un.notification_id, p_delegate_to, NOW()) ON CONFLICT DO NOTHING;
    UPDATE user_notifications SET acknowledged_at = NOW() WHERE id = p_user_notification_id;
    RETURN jsonb_build_object('ok', TRUE, 'action', 'delegate', 'delegated_to', p_delegate_to);
  END IF;

  UPDATE user_notifications SET acknowledged_at = NOW() WHERE id = p_user_notification_id;
  UPDATE notifications
    SET acted_by = v_user, idempotency_key = COALESCE(p_idempotency_key, idempotency_key), updated_at = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'dashboard_action', p_action, 'dashboard_action_note', p_note, 'dashboard_action_at', NOW())
    WHERE id = v_un.notification_id;

  IF p_action = 'false_alarm' AND v_notif.category = 'dashboard:anomaly' THEN
    UPDATE notifications SET expires_at = NOW() + INTERVAL '24 hours' WHERE id = v_un.notification_id;
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'action', p_action, 'acknowledged_at', NOW(), 'note', p_note);
END;
$$;
GRANT EXECUTE ON FUNCTION fn_dashboard_queue_action(UUID, TEXT, TEXT, UUID, INT, TEXT) TO authenticated;

-- Updated: 2026-04-15 — Chief of Staff auto-escalation ACTIVATED
-- Function now self-reads CoS UUID from dashboard_config.chief_of_staff_user_id when
-- p_cos_user_id is NULL. Cron/scheduler can call with zero args. Caller override still
-- supported for testing. Still a no-op when no CoS is configured anywhere (spec §15 Q1).
CREATE OR REPLACE FUNCTION fn_dashboard_queue_escalate(p_cos_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_escalated_count INT := 0;
  v_returned_count INT := 0;
  v_cfg dashboard_config;
  v_threshold INTERVAL;
  v_cos_user_id UUID;
BEGIN
  SELECT * INTO v_cfg FROM dashboard_config WHERE scope = 'global' LIMIT 1;
  v_threshold := (v_cfg.queue_escalation_hours || ' hours')::interval;

  -- Resolve CoS: caller override > dashboard_config > NULL (no-op)
  v_cos_user_id := COALESCE(p_cos_user_id, v_cfg.chief_of_staff_user_id);

  IF v_cos_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'escalated', 0, 'returned', 0,
      'message', 'No Chief of Staff configured — escalation disabled (spec §15 Q1)');
  END IF;

  WITH eligible AS (
    SELECT un.id, un.notification_id FROM user_notifications un
    JOIN notifications n ON n.id = un.notification_id
    JOIN profiles p ON p.id = un.user_id
    WHERE p.is_super_admin = TRUE AND un.acknowledged_at IS NULL AND un.escalated_at IS NULL
      AND n.category LIKE 'dashboard:%' AND n.requires_acknowledgment = TRUE
      AND n.created_at < NOW() - v_threshold
  ),
  escalated AS (
    UPDATE user_notifications un SET escalated_at = NOW(),
      escalation_level = COALESCE(escalation_level, 0) + 1
      WHERE un.id IN (SELECT id FROM eligible)
      RETURNING un.notification_id
  ),
  cos_fanout AS (
    INSERT INTO user_notifications (notification_id, user_id, created_at)
    SELECT notification_id, v_cos_user_id, NOW() FROM escalated
    ON CONFLICT DO NOTHING RETURNING id
  )
  SELECT COUNT(*) INTO v_escalated_count FROM cos_fanout;

  WITH cos_overdue AS (
    SELECT un.id, un.notification_id FROM user_notifications un
    JOIN notifications n ON n.id = un.notification_id
    WHERE un.user_id = v_cos_user_id AND un.acknowledged_at IS NULL
      AND un.created_at < NOW() - INTERVAL '1 hour' AND n.category LIKE 'dashboard:%'
  ),
  cos_ack AS (
    UPDATE user_notifications un SET acknowledged_at = NOW()
    WHERE un.id IN (SELECT id FROM cos_overdue) RETURNING un.notification_id
  ),
  strike_log AS (
    INSERT INTO counselor_sla_strikes (counselor_id, strike_type, context, auto_expires_at, institution_id)
    SELECT v_cos_user_id, 'cos_unreachable',
      jsonb_build_object('notification_id', notification_id, 'reason', 'cos_2h_timeout'),
      NOW() + (v_cfg.strike_expiry_days || ' days')::interval,
      COALESCE((SELECT institution_id FROM profiles WHERE id = v_cos_user_id), (SELECT id FROM institutions LIMIT 1))
    FROM cos_ack RETURNING id
  )
  SELECT COUNT(*) INTO v_returned_count FROM strike_log;

  RETURN jsonb_build_object('ok', TRUE, 'escalated', v_escalated_count, 'returned', v_returned_count,
    'threshold_hours', v_cfg.queue_escalation_hours,
    'cos_user_id', v_cos_user_id,
    'source', CASE WHEN p_cos_user_id IS NOT NULL THEN 'override' ELSE 'dashboard_config' END,
    'ran_at', NOW());
END;
$$;
GRANT EXECUTE ON FUNCTION fn_dashboard_queue_escalate(UUID) TO service_role;

-- Updated: 2026-04-16 — Renamed 'chief_of_staff' → 'cao' (Chief Administrative Officer).
-- Original intent (2026-04-15): seed the escalation role and assign Gowrisankar MN
-- (eao@jkkn.ac.in) as the person who receives escalated dashboard queue items per spec §15 Q1.
-- Rename preserves: 6 approval permissions, is_system_role=true, scope='all', the assigned user.
-- Dashboard escalation wiring is via dashboard_config.chief_of_staff_user_id (column name stores
-- a user_id; unaffected by role rename). Column name kept for backward compatibility.
-- Cleanup: also drop the old 'chief_of_staff' row on fresh DBs where only the rename never ran.
DELETE FROM custom_roles WHERE role_key = 'chief_of_staff';

INSERT INTO custom_roles (role_key, role_name, description, is_system_role, is_active, institution_scope, permissions)
VALUES (
  'cao',
  'Chief Administrative Officer',
  'Manages administration across all institutions. Receives escalated dashboard approvals (leave, travel, waiver, purchase, grievance) and anomaly acknowledgements when the Director does not act within the SLA window.',
  TRUE, TRUE, 'all',
  jsonb_build_object(
    'dashboard.queue.approve.waiver',    TRUE,
    'dashboard.queue.approve.leave',     TRUE,
    'dashboard.queue.approve.purchase',  TRUE,
    'dashboard.queue.approve.travel',    TRUE,
    'dashboard.queue.resolve.grievance', TRUE,
    'dashboard.anomaly.acknowledge',     TRUE
  )
)
ON CONFLICT (role_key) DO UPDATE
  SET role_name = EXCLUDED.role_name,
      description = EXCLUDED.description,
      is_active = TRUE,
      institution_scope = EXCLUDED.institution_scope,
      permissions = custom_roles.permissions || EXCLUDED.permissions,
      updated_at = NOW();

INSERT INTO user_roles (user_id, role_id, is_primary, assigned_at)
SELECT 'd28a9913-5606-42cc-8fd0-6b27317c4d30'::uuid, cr.id, FALSE, NOW()
  FROM custom_roles cr WHERE cr.role_key = 'cao'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- END Dashboard v2 Day 3 functions


-- =====================================================
-- Dashboard v2 Day 4 — Broadcast Rescue RPCs
-- Added: 2026-04-15 — rescue broadcast/claim/ghost-check
-- Decisions: Round 2.6 (SELECT FOR UPDATE), 2.7 (ghost rules), 3.10 (emergency)
-- =====================================================

-- Initiate rescue — Director fans out to scoped counselors
CREATE OR REPLACE FUNCTION fn_rescue_broadcast_initiate(
  p_lead_id UUID,
  p_scope JSONB DEFAULT '{}'::jsonb,
  p_message TEXT DEFAULT NULL,
  p_is_emergency BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_lead admission_leads;
  v_broadcast_id UUID;
  v_fanout_count INT := 0;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'not_authenticated'); END IF;
  SELECT * INTO v_lead FROM admission_leads WHERE id = p_lead_id;
  IF v_lead.id IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'lead_not_found'); END IF;
  IF EXISTS (SELECT 1 FROM rescue_broadcasts WHERE lead_id = p_lead_id AND claimed_at IS NULL AND auto_returned_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'active_broadcast_exists');
  END IF;

  INSERT INTO rescue_broadcasts (lead_id, initiated_by, scope, message, is_emergency, institution_id)
  VALUES (p_lead_id, v_user, COALESCE(p_scope, '{}'::jsonb), p_message, p_is_emergency, v_lead.institution_id)
  RETURNING id INTO v_broadcast_id;

  UPDATE admission_leads SET rescue_broadcast_id = v_broadcast_id WHERE id = p_lead_id;

  WITH target_counselors AS (
    SELECT unnest(ARRAY(SELECT jsonb_array_elements_text(p_scope -> 'staff_ids')))::uuid AS user_id
    WHERE p_scope ? 'staff_ids'
    UNION
    SELECT p.id FROM profiles p
    WHERE p.is_active = TRUE
      AND (
        (p_scope ? 'institution_ids' AND p.institution_id::text IN (SELECT jsonb_array_elements_text(p_scope -> 'institution_ids')))
        OR (NOT (p_scope ? 'staff_ids') AND NOT (p_scope ? 'institution_ids') AND p.institution_id = v_lead.institution_id)
      )
      AND (p.role = 'admission' OR p.role = 'admission_staff' OR p.role = 'counselor')
  ),
  broadcast_notif AS (
    -- 2026-04-25: rescue broadcasts are operational work items (counselor must claim & call).
    -- Setting kind='work_item' keeps them out of /admin/notifications announcement view.
    INSERT INTO notifications (title, body, category, kind, priority, requires_acknowledgment,
      acknowledgment_deadline_hours, action_type, action_config, targeting, created_by, metadata)
    VALUES (
      '🔥 Rescue broadcast — ' || COALESCE(v_lead.first_name || ' ' || COALESCE(v_lead.last_name, ''), 'hot lead'),
      COALESCE(p_message, 'Cold lead rescue broadcast. First counselor to claim wins. Score ' ||
        COALESCE(v_lead.score::text, '—') || ' · conversion ' ||
        ROUND(COALESCE(v_lead.conversion_probability, 0.5) * 100)::text || '%'),
      'dashboard:rescue',
      'work_item',
      CASE WHEN p_is_emergency THEN 'urgent' ELSE 'high' END,
      TRUE, 2, 'rescue.claim',
      jsonb_build_object('broadcast_id', v_broadcast_id, 'lead_id', p_lead_id,
        'score', v_lead.score, 'is_emergency', p_is_emergency),
      jsonb_build_object('broadcast_id', v_broadcast_id),
      v_user,
      jsonb_build_object('broadcast_initiated_by', v_user, 'broadcast_initiated_at', NOW())
    ) RETURNING id
  ),
  fanout AS (
    INSERT INTO user_notifications (notification_id, user_id, created_at)
    SELECT bn.id, tc.user_id, NOW() FROM broadcast_notif bn, target_counselors tc
    WHERE tc.user_id IS NOT NULL ON CONFLICT DO NOTHING RETURNING id
  )
  SELECT COUNT(*) INTO v_fanout_count FROM fanout;

  RETURN jsonb_build_object('ok', TRUE, 'broadcast_id', v_broadcast_id,
    'lead_id', p_lead_id, 'fanout_count', v_fanout_count, 'is_emergency', p_is_emergency);
END;
$$;
GRANT EXECUTE ON FUNCTION fn_rescue_broadcast_initiate(UUID, JSONB, TEXT, BOOLEAN) TO authenticated;

-- Counselor claims (SELECT FOR UPDATE race)
CREATE OR REPLACE FUNCTION fn_rescue_broadcast_claim(p_broadcast_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_broadcast rescue_broadcasts;
  v_duration_seconds INT;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'not_authenticated'); END IF;

  SELECT * INTO v_broadcast FROM rescue_broadcasts WHERE id = p_broadcast_id FOR UPDATE;
  IF v_broadcast.id IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'broadcast_not_found'); END IF;
  IF v_broadcast.claimed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_claimed',
      'claimed_by', v_broadcast.claimed_by, 'claimed_at', v_broadcast.claimed_at,
      'claim_duration_seconds', v_broadcast.claim_duration_seconds);
  END IF;
  IF v_broadcast.auto_returned_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'broadcast_auto_returned');
  END IF;

  v_duration_seconds := EXTRACT(EPOCH FROM (NOW() - v_broadcast.initiated_at))::int;

  UPDATE rescue_broadcasts SET claimed_by = v_user, claimed_at = NOW(),
    claim_duration_seconds = v_duration_seconds, updated_at = NOW()
    WHERE id = p_broadcast_id;

  UPDATE admission_leads SET assigned_counselor_id = v_user, rescued_at = NOW(), rescued_by = v_user
    WHERE id = v_broadcast.lead_id;

  UPDATE user_notifications un SET acknowledged_at = NOW() FROM notifications n
    WHERE un.notification_id = n.id AND n.targeting ->> 'broadcast_id' = p_broadcast_id::text
      AND un.user_id = v_user AND un.acknowledged_at IS NULL;

  UPDATE notifications SET expires_at = NOW()
    WHERE targeting ->> 'broadcast_id' = p_broadcast_id::text
      AND (expires_at IS NULL OR expires_at > NOW());

  RETURN jsonb_build_object('ok', TRUE, 'broadcast_id', p_broadcast_id,
    'lead_id', v_broadcast.lead_id, 'claimed_at', NOW(),
    'claim_duration_seconds', v_duration_seconds);
END;
$$;
GRANT EXECUTE ON FUNCTION fn_rescue_broadcast_claim(UUID) TO authenticated;

-- Ghost check — cron sweep
CREATE OR REPLACE FUNCTION fn_rescue_broadcast_check_ghosts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg dashboard_config;
  v_ghost_timeout INTERVAL;
  v_ghost_count INT := 0;
BEGIN
  SELECT * INTO v_cfg FROM dashboard_config WHERE scope = 'global' LIMIT 1;
  v_ghost_timeout := (v_cfg.ghost_claim_timeout_minutes || ' minutes')::interval;

  WITH ghosts AS (
    SELECT rb.id, rb.lead_id, rb.claimed_by, rb.institution_id
    FROM rescue_broadcasts rb
    WHERE rb.claimed_at IS NOT NULL AND rb.auto_returned_at IS NULL
      AND rb.ghost_claim_penalty_applied = FALSE
      AND rb.claimed_at < NOW() - v_ghost_timeout
      AND NOT EXISTS (
        SELECT 1 FROM admission_lead_activities a
        WHERE a.lead_id = rb.lead_id AND a.created_at > rb.claimed_at AND a.created_by = rb.claimed_by
      )
  ),
  returned AS (
    UPDATE rescue_broadcasts rb SET auto_returned_at = NOW(),
      ghost_claim_penalty_applied = TRUE, updated_at = NOW()
    FROM ghosts g WHERE rb.id = g.id
    RETURNING rb.id, rb.lead_id, rb.claimed_by, rb.institution_id
  ),
  lead_reset AS (
    UPDATE admission_leads al SET assigned_counselor_id = NULL, rescued_at = NULL, rescued_by = NULL
    FROM returned r WHERE al.id = r.lead_id AND al.rescued_by = r.claimed_by RETURNING al.id
  ),
  strike_log AS (
    INSERT INTO counselor_sla_strikes (counselor_id, strike_type, context, auto_expires_at, institution_id)
    SELECT r.claimed_by, 'ghost_claim',
      jsonb_build_object('broadcast_id', r.id, 'lead_id', r.lead_id,
        'timeout_minutes', v_cfg.ghost_claim_timeout_minutes),
      NOW() + (v_cfg.strike_expiry_days || ' days')::interval, r.institution_id
    FROM returned r RETURNING id
  )
  SELECT COUNT(*) INTO v_ghost_count FROM strike_log;

  RETURN jsonb_build_object('ok', TRUE, 'ghost_count', v_ghost_count,
    'timeout_minutes', v_cfg.ghost_claim_timeout_minutes, 'ran_at', NOW());
END;
$$;
GRANT EXECUTE ON FUNCTION fn_rescue_broadcast_check_ghosts() TO service_role;

-- END Dashboard v2 Day 4 functions
-- Updated: 2026-04-15 - Mirror role_has_institution_access() function back into
-- canonical setup. This function already existed in the live database but was
-- never written to source control (drift). Used by the Tier-C staff/employment
-- categories/custom_roles/staff_plans RLS policies to honor the contract:
--   is_super_admin() OR is_admin()
--   OR (user_has_permission('module.action') AND role_has_institution_access(institution_id))
CREATE OR REPLACE FUNCTION public.role_has_institution_access(check_institution_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- NULL institution_id: always accessible (system-wide records)
    IF check_institution_id IS NULL THEN
        RETURN true;
    END IF;

    -- Super admin: always access all
    IF is_super_admin() THEN
        RETURN true;
    END IF;

    -- Check if ANY of user's roles has institution_scope = 'all'
    IF EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN custom_roles cr ON ur.role_id = cr.id
        WHERE ur.user_id = auth.uid()
          AND cr.institution_scope = 'all'
    ) THEN
        RETURN true;
    END IF;

    -- Legacy fallback: check profiles.role for scope
    IF EXISTS (
        SELECT 1
        FROM profiles p
        JOIN custom_roles cr ON p.role = cr.role_key
        WHERE p.id = auth.uid()
          AND cr.institution_scope = 'all'
    ) THEN
        RETURN true;
    END IF;

    -- Check own institution
    IF check_institution_id = get_current_user_institution_id() THEN
        RETURN true;
    END IF;

    -- Check user_institution_access table (cross-institution grants)
    IF EXISTS (
        SELECT 1
        FROM user_institution_access uia
        WHERE uia.user_id = auth.uid()
          AND uia.institution_id = check_institution_id
          AND uia.is_active = true
    ) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$function$;

-- Cross-institution named approvers for Service Requests (migration
-- 20260624120000). Boolean predicate used by the named-approver RLS policies
-- in 03_policies.sql. SECURITY DEFINER so it can read service_requests/steps
-- from inside service_requests' own policies without RLS recursion; it only
-- reveals whether the CALLER (auth.uid()) is a named approver, so it is safe
-- for the authenticated role. "Any step" keeps the UPDATE WITH CHECK satisfied
-- when current_approval_step advances past the step the approver was named on.
CREATE OR REPLACE FUNCTION public.user_is_request_named_approver(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM service_requests sr
    JOIN service_request_approval_steps st
      ON st.service_type_id = sr.service_type_id
    WHERE sr.id = p_request_id
      AND auth.uid() = ANY (st.approver_user_ids)
  );
$function$;

REVOKE ALL ON FUNCTION public.user_is_request_named_approver(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_request_named_approver(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_is_request_named_approver(uuid) TO authenticated;

-- Updated: 2026-04-15 - Per-module access scope helpers (Option A).
-- get_user_module_scope returns the most permissive scope across the user's
-- roles for the given module_key. role_has_module_access combines that with
-- per-row institution_id and an optional owner_email so RLS policies can do
-- a single function call per row.
CREATE OR REPLACE FUNCTION public.get_user_module_scope(module_key text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  scope text;
BEGIN
  IF is_super_admin() THEN
    RETURN 'all_institutions';
  END IF;

  SELECT CASE
    WHEN bool_or((cr.module_scopes ->> module_key) = 'all_institutions') THEN 'all_institutions'
    WHEN bool_or((cr.module_scopes ->> module_key) = 'own_institution')  THEN 'own_institution'
    WHEN bool_or((cr.module_scopes ->> module_key) = 'own_records')      THEN 'own_records'
    ELSE NULL
  END INTO scope
  FROM user_roles ur
  JOIN custom_roles cr ON cr.id = ur.role_id
  WHERE ur.user_id = auth.uid();

  IF scope IS NOT NULL THEN
    RETURN scope;
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND cr.institution_scope = 'all'
  ) THEN
    RETURN 'all_institutions';
  END IF;

  RETURN 'own_institution';
END;
$function$;

CREATE OR REPLACE FUNCTION public.role_has_module_access(
  module_key text,
  target_institution_id uuid,
  target_owner_email text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  scope text;
BEGIN
  IF is_super_admin() THEN RETURN true; END IF;

  scope := get_user_module_scope(module_key);

  IF scope = 'all_institutions' THEN
    RETURN true;
  ELSIF scope = 'own_institution' THEN
    RETURN role_has_institution_access(target_institution_id);
  ELSIF scope = 'own_records' THEN
    RETURN target_owner_email IS NOT NULL
       AND target_owner_email = auth.email();
  END IF;

  RETURN false;
END;
$function$;

-- Updated: 2026-04-15 - get_user_roles_with_details now returns
-- institution_scope and module_scopes so client-side usePermissions hook
-- can read effective scope without an extra DB roundtrip.
DROP FUNCTION IF EXISTS public.get_user_roles_with_details(uuid);

CREATE OR REPLACE FUNCTION public.get_user_roles_with_details(p_user_id uuid)
RETURNS TABLE(
    id uuid,
    user_id uuid,
    role_id uuid,
    is_primary boolean,
    assigned_at timestamp with time zone,
    assigned_by uuid,
    role_key text,
    role_name text,
    role_description text,
    permissions jsonb,
    institution_scope text,
    module_scopes jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        ur.id,
        ur.user_id,
        ur.role_id,
        ur.is_primary,
        ur.assigned_at,
        ur.assigned_by,
        cr.role_key::text,
        cr.role_name::text,
        cr.description::text AS role_description,
        cr.permissions,
        cr.institution_scope::text,
        cr.module_scopes
    FROM user_roles ur
    INNER JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = p_user_id
    ORDER BY ur.is_primary DESC, ur.assigned_at ASC;
END;
$function$;


-- =====================================================
-- Dashboard v2 Week-2 — fn_counselor_metrics (Role-aware view)
-- Added: 2026-04-15 — Counselor-scoped hero tile RPC, SECURITY DEFINER
-- Updated: 2026-04-19 — Added conversion_velocity_score (Doctrines CVS v1).
--                       Body was applied via MCP apply_migration and never
--                       round-tripped into source (see migration
--                       20260419000005_doctrines_counselor_cvs.sql).
-- Updated: 2026-04-21 — Restored full body into source (was orphaned by a
--                       prior merge) and fixed calls-made query to use
--                       admission_lead_activities.created_by; the live body
--                       was referencing performed_by which does not exist
--                       on that table (42703 undefined_column every render
--                       for counselor / admission-role dashboard loads).
-- Reads auth.uid() directly — no parameters. Returns JSONB with 5 tiles:
--   sla: median_minutes_today, compliance_pct, band
--   rank: daily_rank, daily_total, weekly_delta (negative = improved)
--   hot_leads: to_call_count (score>=70, no first_touch, active), cold_count (>=4h old)
--   calls: made_today (activity_type LIKE 'call%'), daily_target, pct
--   conversion_velocity_score: renormalized composite (sla 30 + rank 20 + calls 25 + conv 25)
--   scope: user_id, computed_at
-- Spec: specs/myjkkn-dashboard-v2-spec.md §5 + §8
-- =====================================================

CREATE OR REPLACE FUNCTION public.fn_counselor_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_today_ist DATE := (NOW() AT TIME ZONE 'Asia/Kolkata')::date;
  v_today_start TIMESTAMPTZ := (v_today_ist::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_30d_start TIMESTAMPTZ := v_today_start - INTERVAL '30 days';
  v_cfg dashboard_config;
  v_sla_median_min NUMERIC := NULL;
  v_sla_total INT := 0; v_sla_compliant INT := 0; v_sla_compliance_pct INT := 100;
  v_sla_band TEXT := 'green';
  v_daily_rank INT := NULL; v_daily_total INT := 0; v_weekly_delta INT := 0;
  v_rank_today INT := NULL; v_rank_last_week INT := NULL;
  v_hot_to_call INT := 0; v_cold_count INT := 0;
  v_calls_made INT := 0; v_call_target INT := 25; v_call_pct INT := 0;
  v_cvs_sla numeric; v_cvs_rank numeric; v_cvs_calls numeric; v_cvs_conv numeric;
  v_cvs_enrolled int := 0; v_cvs_total int := 0;
  v_cvs_composite jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'sla', jsonb_build_object('median_minutes_today', NULL, 'compliance_pct', 0, 'band', 'red'),
      'rank', jsonb_build_object('daily_rank', NULL, 'daily_total', 0, 'weekly_delta', 0),
      'hot_leads', jsonb_build_object('to_call_count', 0, 'cold_count', 0),
      'calls', jsonb_build_object('made_today', 0, 'daily_target', 25, 'pct', 0),
      'conversion_velocity_score', jsonb_build_object('score', 0, 'band', 'red', 'components', '{}'::jsonb, 'data_source', 'not_authenticated'),
      'scope', jsonb_build_object('user_id', NULL, 'computed_at', NOW()));
  END IF;

  SELECT * INTO v_cfg FROM dashboard_config WHERE scope = 'global' LIMIT 1;
  v_call_target := COALESCE(v_cfg.counselor_daily_call_target, 25);

  SELECT COUNT(*) FILTER (WHERE first_touch_at IS NOT NULL),
         COUNT(*) FILTER (WHERE first_touch_at IS NOT NULL AND EXTRACT(EPOCH FROM (first_touch_at - created_at))/3600.0 <= COALESCE(v_cfg.cold_lead_threshold_hours, 4)),
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_touch_at - created_at))/60.0) FILTER (WHERE first_touch_at IS NOT NULL)
  INTO v_sla_total, v_sla_compliant, v_sla_median_min
  FROM admission_leads
  WHERE assigned_counselor_id = v_user_id AND first_touch_at >= v_today_start
    AND first_touch_at < v_today_start + INTERVAL '1 day';
  IF v_sla_total > 0 THEN v_sla_compliance_pct := ROUND(v_sla_compliant::numeric * 100.0 / v_sla_total)::int; END IF;
  v_sla_band := CASE WHEN v_sla_compliance_pct >= 90 THEN 'green' WHEN v_sla_compliance_pct >= 70 THEN 'amber' ELSE 'red' END;

  WITH today_sla AS (
    SELECT assigned_counselor_id,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_touch_at - created_at))/60.0) AS median_min,
      COUNT(*) AS lead_cnt
    FROM admission_leads
    WHERE first_touch_at >= v_today_start AND first_touch_at < v_today_start + INTERVAL '1 day'
      AND assigned_counselor_id IS NOT NULL
    GROUP BY assigned_counselor_id HAVING COUNT(*) > 0
  ), ranked AS (
    SELECT assigned_counselor_id, RANK() OVER (ORDER BY median_min ASC NULLS LAST) AS rnk, COUNT(*) OVER () AS total
    FROM today_sla
  )
  SELECT rnk::int, total::int INTO v_rank_today, v_daily_total FROM ranked WHERE assigned_counselor_id = v_user_id;
  v_daily_rank := v_rank_today;
  IF v_daily_total = 0 THEN v_daily_total := 0; END IF;

  WITH last_week_sla AS (
    SELECT assigned_counselor_id,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_touch_at - created_at))/60.0) AS median_min
    FROM admission_leads
    WHERE first_touch_at >= v_today_start - INTERVAL '7 days' AND first_touch_at < v_today_start - INTERVAL '6 days'
      AND assigned_counselor_id IS NOT NULL
    GROUP BY assigned_counselor_id HAVING COUNT(*) > 0
  ), ranked_lw AS (
    SELECT assigned_counselor_id, RANK() OVER (ORDER BY median_min ASC NULLS LAST) AS rnk FROM last_week_sla
  )
  SELECT rnk::int INTO v_rank_last_week FROM ranked_lw WHERE assigned_counselor_id = v_user_id;
  IF v_rank_today IS NOT NULL AND v_rank_last_week IS NOT NULL THEN
    v_weekly_delta := v_rank_today - v_rank_last_week;
  ELSE v_weekly_delta := 0; END IF;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (NOW() - created_at))/3600.0 >= COALESCE(v_cfg.cold_lead_threshold_hours, 4))
  INTO v_hot_to_call, v_cold_count
  FROM admission_leads
  WHERE assigned_counselor_id = v_user_id AND score >= 70 AND first_touch_at IS NULL
    AND funnel_stage::text NOT IN ('enrolled', 'lost', 'withdrew', 'declined', 'expired');

  -- Calls made today. admission_lead_activities.created_by is the doer; the
  -- table has no performed_by column (prior drift fixed 2026-04-21).
  SELECT COUNT(*) INTO v_calls_made
  FROM admission_lead_activities
  WHERE created_by = v_user_id AND activity_type LIKE 'call%'
    AND created_at >= v_today_start AND created_at < v_today_start + INTERVAL '1 day';
  IF v_call_target > 0 THEN
    v_call_pct := LEAST(100, ROUND(v_calls_made::numeric * 100.0 / v_call_target)::int);
  END IF;

  v_cvs_sla := v_sla_compliance_pct;
  IF v_rank_today IS NOT NULL AND v_daily_total > 0 THEN
    v_cvs_rank := LEAST(100, GREATEST(0, ROUND(((v_daily_total - v_rank_today + 1)::numeric / v_daily_total::numeric) * 100)));
  ELSE v_cvs_rank := NULL; END IF;
  v_cvs_calls := v_call_pct;

  BEGIN
    SELECT COUNT(*) FILTER (WHERE funnel_stage::text = 'enrolled'), COUNT(*)
    INTO v_cvs_enrolled, v_cvs_total
    FROM admission_leads
    WHERE assigned_counselor_id = v_user_id AND created_at >= v_30d_start;
    IF v_cvs_total > 0 THEN
      v_cvs_conv := LEAST(100, GREATEST(0, ROUND((v_cvs_enrolled::numeric / v_cvs_total::numeric) * 100)));
    END IF;
  EXCEPTION WHEN OTHERS THEN v_cvs_conv := NULL; END;

  v_cvs_composite := compute_renormalized_composite(
    jsonb_build_object('sla_compliance', v_cvs_sla, 'daily_rank', v_cvs_rank, 'calls_vs_target', v_cvs_calls, 'conversion', v_cvs_conv),
    jsonb_build_object('sla_compliance', 30, 'daily_rank', 20, 'calls_vs_target', 25, 'conversion', 25)
  );

  RETURN jsonb_build_object(
    'sla', jsonb_build_object('median_minutes_today', CASE WHEN v_sla_median_min IS NULL THEN NULL ELSE ROUND(v_sla_median_min)::int END, 'compliance_pct', v_sla_compliance_pct, 'band', v_sla_band),
    'rank', jsonb_build_object('daily_rank', v_daily_rank, 'daily_total', v_daily_total, 'weekly_delta', v_weekly_delta),
    'hot_leads', jsonb_build_object('to_call_count', v_hot_to_call, 'cold_count', v_cold_count),
    'calls', jsonb_build_object('made_today', v_calls_made, 'daily_target', v_call_target, 'pct', v_call_pct),
    'conversion_velocity_score', v_cvs_composite || jsonb_build_object(
      'components', jsonb_build_object('sla_compliance', v_cvs_sla, 'daily_rank', v_cvs_rank, 'calls_vs_target', v_cvs_calls, 'conversion', v_cvs_conv),
      'window', 'trailing_30_days'),
    'scope', jsonb_build_object('user_id', v_user_id, 'computed_at', NOW())
  );
END;
$function$;
-- =====================================================================
-- 2026-04-15 — Dashboard v2: Web Push delivery trigger functions
-- Spec: specs/myjkkn-dashboard-v2-spec.md §4.4, §6.2
-- Agent B (PR feat/dashboard-v2-push-send)
-- Fires /api/dashboard/push-send via pg_net when an urgent/high
-- acknowledgment-required dashboard notification is queued.
-- Requires runtime config:
--   ALTER DATABASE postgres SET app.push_send_endpoint = 'https://www.jkkn.ai/api/dashboard/push-send';
--   ALTER DATABASE postgres SET app.service_role_key = '<SERVICE_ROLE_KEY>';
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_trigger_push_send(p_user_notification_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_endpoint TEXT;
  v_service_key TEXT;
  v_request_id BIGINT;
BEGIN
  BEGIN
    v_endpoint := current_setting('app.push_send_endpoint', true);
    v_service_key := current_setting('app.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[fn_trigger_push_send] settings lookup failed: %', SQLERRM;
    RETURN;
  END;

  IF v_endpoint IS NULL OR v_endpoint = '' OR v_service_key IS NULL OR v_service_key = '' THEN
    RAISE WARNING '[fn_trigger_push_send] app.push_send_endpoint / app.service_role_key not configured — skipping user_notification %', p_user_notification_id;
    RETURN;
  END IF;

  BEGIN
    SELECT extensions.http_post(
      url := v_endpoint,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object('userNotificationId', p_user_notification_id::text)
    ) INTO v_request_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[fn_trigger_push_send] pg_net call failed for %: %', p_user_notification_id, SQLERRM;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_trigger_push_send(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_notify_push_on_queue_insert_fn()
RETURNS TRIGGER
-- ================================================================================
-- DASHBOARD V2 — MATERIALIZED VIEW REFRESH
-- Added: 2026-04-15 — Vercel Cron scheduled refresh for dashboard leaderboards.
-- ================================================================================

-- fn_refresh_dashboard_views: refresh Dashboard v2 materialized views.
-- Called by Vercel Cron (service_role) on a schedule.
--   p_which = 'sla'         → refreshes v_dashboard_sla_daily (every 5 min)
--   p_which = 'conversion'  → refreshes v_dashboard_conversion_monthly (midnight IST)
CREATE OR REPLACE FUNCTION public.fn_refresh_dashboard_views(p_which TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today_ist DATE := (NOW() AT TIME ZONE 'Asia/Kolkata')::date;
  v_today_start TIMESTAMPTZ := (v_today_ist::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_cfg dashboard_config;
  v_sla_median_min NUMERIC := NULL;
  v_sla_total INT := 0;
  v_sla_compliant INT := 0;
  v_sla_compliance_pct INT := 100;
  v_sla_band TEXT := 'green';
  v_daily_rank INT := NULL;
  v_daily_total INT := 0;
  v_weekly_delta INT := 0;
  v_rank_today INT := NULL;
  v_rank_last_week INT := NULL;
  v_hot_to_call INT := 0;
  v_cold_count INT := 0;
  v_calls_made INT := 0;
  v_call_target INT := 25;
  v_call_pct INT := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'sla', jsonb_build_object('median_minutes_today', NULL, 'compliance_pct', 0, 'band', 'red'),
      'rank', jsonb_build_object('daily_rank', NULL, 'daily_total', 0, 'weekly_delta', 0),
      'hot_leads', jsonb_build_object('to_call_count', 0, 'cold_count', 0),
      'calls', jsonb_build_object('made_today', 0, 'daily_target', 25, 'pct', 0),
      'scope', jsonb_build_object('user_id', NULL, 'computed_at', NOW())
    );
  END IF;

  SELECT * INTO v_cfg FROM dashboard_config WHERE scope = 'global' LIMIT 1;
  v_call_target := COALESCE(v_cfg.counselor_daily_call_target, 25);

  -- SLA today: median response time + compliance %
  SELECT
    COUNT(*) FILTER (WHERE first_touch_at IS NOT NULL),
    COUNT(*) FILTER (
      WHERE first_touch_at IS NOT NULL
        AND EXTRACT(EPOCH FROM (first_touch_at - created_at))/3600.0 <= COALESCE(v_cfg.cold_lead_threshold_hours, 4)
    ),
    PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (first_touch_at - created_at))/60.0
    ) FILTER (WHERE first_touch_at IS NOT NULL)
  INTO v_sla_total, v_sla_compliant, v_sla_median_min
  FROM admission_leads
  WHERE assigned_counselor_id = v_user_id
    AND first_touch_at >= v_today_start
    AND first_touch_at < v_today_start + INTERVAL '1 day';

  IF v_sla_total > 0 THEN
    v_sla_compliance_pct := ROUND(v_sla_compliant::numeric * 100.0 / v_sla_total)::int;
  END IF;

  v_sla_band := CASE
    WHEN v_sla_compliance_pct >= 90 THEN 'green'
    WHEN v_sla_compliance_pct >= 70 THEN 'amber'
    ELSE 'red'
  END;

  -- Daily rank: inline leaderboard (lower median = better rank)
  WITH today_sla AS (
    SELECT
      assigned_counselor_id,
      PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (first_touch_at - created_at))/60.0
      ) AS median_min,
      COUNT(*) AS lead_cnt
    FROM admission_leads
    WHERE first_touch_at >= v_today_start
      AND first_touch_at < v_today_start + INTERVAL '1 day'
      AND assigned_counselor_id IS NOT NULL
    GROUP BY assigned_counselor_id
    HAVING COUNT(*) > 0
  ),
  ranked AS (
    SELECT
      assigned_counselor_id,
      RANK() OVER (ORDER BY median_min ASC NULLS LAST) AS rnk,
      COUNT(*) OVER () AS total
    FROM today_sla
  )
  SELECT rnk::int, total::int INTO v_rank_today, v_daily_total
  FROM ranked
  WHERE assigned_counselor_id = v_user_id;

  v_daily_rank := v_rank_today;
  IF v_daily_total IS NULL THEN
    v_daily_total := 0;
  END IF;

  -- Last-week rank (same day-of-week, 7 days ago) for delta
  WITH last_week_sla AS (
    SELECT
      assigned_counselor_id,
      PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (first_touch_at - created_at))/60.0
      ) AS median_min
    FROM admission_leads
    WHERE first_touch_at >= v_today_start - INTERVAL '7 days'
      AND first_touch_at < v_today_start - INTERVAL '6 days'
      AND assigned_counselor_id IS NOT NULL
    GROUP BY assigned_counselor_id
    HAVING COUNT(*) > 0
  ),
  ranked_lw AS (
    SELECT
      assigned_counselor_id,
      RANK() OVER (ORDER BY median_min ASC NULLS LAST) AS rnk
    FROM last_week_sla
  )
  SELECT rnk::int INTO v_rank_last_week
  FROM ranked_lw
  WHERE assigned_counselor_id = v_user_id;

  IF v_rank_today IS NOT NULL AND v_rank_last_week IS NOT NULL THEN
    -- Negative delta = improved (rank moved from 5 to 2 = -3 = better)
    v_weekly_delta := v_rank_today - v_rank_last_week;
  ELSE
    v_weekly_delta := 0;
  END IF;

  -- Hot leads to call (score >= 70, no first_touch, active funnel)
  SELECT
    COUNT(*),
    COUNT(*) FILTER (
      WHERE EXTRACT(EPOCH FROM (NOW() - created_at))/3600.0 >= COALESCE(v_cfg.cold_lead_threshold_hours, 4)
    )
  INTO v_hot_to_call, v_cold_count
  FROM admission_leads
  WHERE assigned_counselor_id = v_user_id
    AND score >= 70
    AND first_touch_at IS NULL
    AND funnel_stage::text NOT IN ('enrolled', 'lost', 'withdrew', 'declined', 'expired');

  -- Calls made today (activity_type starts with 'call', created_by = auth.uid())
  SELECT COUNT(*) INTO v_calls_made
  FROM admission_lead_activities
  WHERE created_by = v_user_id
    AND activity_type LIKE 'call%'
    AND created_at >= v_today_start
    AND created_at < v_today_start + INTERVAL '1 day';

  IF v_call_target > 0 THEN
    v_call_pct := LEAST(100, ROUND(v_calls_made::numeric * 100.0 / v_call_target)::int);
  END IF;

  RETURN jsonb_build_object(
    'sla', jsonb_build_object(
      'median_minutes_today',
        CASE WHEN v_sla_median_min IS NULL THEN NULL
             ELSE ROUND(v_sla_median_min)::int END,
      'compliance_pct', v_sla_compliance_pct,
      'band', v_sla_band
    ),
    'rank', jsonb_build_object(
      'daily_rank', v_daily_rank,
      'daily_total', v_daily_total,
      'weekly_delta', v_weekly_delta
    ),
    'hot_leads', jsonb_build_object(
      'to_call_count', v_hot_to_call,
      'cold_count', v_cold_count
    ),
    'calls', jsonb_build_object(
      'made_today', v_calls_made,
      'daily_target', v_call_target,
      'pct', v_call_pct
    ),
    'scope', jsonb_build_object(
      'user_id', v_user_id,
      'computed_at', NOW()
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_counselor_metrics() TO authenticated;

-- END Dashboard v2 Week-2 Counselor functions
  v_priority TEXT;
  v_category TEXT;
  v_requires_ack BOOLEAN;
BEGIN
  SELECT n.priority, n.category, COALESCE(n.requires_acknowledgment, false)
    INTO v_priority, v_category, v_requires_ack
  FROM notifications n
  WHERE n.id = NEW.notification_id;

  IF v_priority IN ('urgent', 'high')
     AND v_requires_ack = TRUE
     AND v_category LIKE 'dashboard:%' THEN
    PERFORM public.fn_trigger_push_send(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;
    v_refreshed TEXT;
    v_ran_at TIMESTAMPTZ := NOW();
BEGIN
    IF p_which = 'sla' THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY public.v_dashboard_sla_daily;
        v_refreshed := 'v_dashboard_sla_daily';
    ELSIF p_which = 'conversion' THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY public.v_dashboard_conversion_monthly;
        v_refreshed := 'v_dashboard_conversion_monthly';
    ELSE
        RAISE EXCEPTION 'Invalid p_which value: %. Expected ''sla'' or ''conversion''.', p_which;
    END IF;

    RETURN jsonb_build_object(
        'ok', TRUE,
        'refreshed', v_refreshed,
        'ran_at', v_ran_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_refresh_dashboard_views(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_refresh_dashboard_views(TEXT) TO service_role;

COMMENT ON FUNCTION public.fn_refresh_dashboard_views(TEXT) IS
'Dashboard v2: refreshes materialized views (sla|conversion). Called by Vercel Cron via service_role.';


-- =====================================================
-- fn_dashboard_metrics v2 (2026-04-16 "Hardened") — DEDUPED 2026-04-21
-- Superseded by v3 below. See git blame for original body.
-- =====================================================

-- =====================================================
-- Dashboard v2 security hotfix (2026-04-16)
-- fn_dashboard_metrics: Gate non-privileged callers without institution_id.
-- Bug found by persona-matrix test — NULL institution_id fell through to
-- JKKN-wide aggregates. Also adds fn_dashboard_metrics_as test helper.
-- =====================================================

CREATE OR REPLACE FUNCTION fn_dashboard_metrics(
  p_institution_id UUID DEFAULT NULL,
  p_department_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')::date;
  v_att_total INT := 0; v_att_present INT := 0; v_att_pct NUMERIC := NULL;
  v_att_baseline_pct NUMERIC := NULL; v_att_score INT := 100;
  v_sla_compliance INT := 100; v_fee_today NUMERIC := 0;
  v_fee_plan NUMERIC := 100000; v_fee_score INT := 100;
  v_escalations_open INT := 0; v_escalations_score INT := 100;
  v_ohs_score INT; v_pipeline_inr NUMERIC := 0;
  v_pipeline_count INT := 0; v_pending_decisions INT := 0;
  v_cfg dashboard_config; v_caller UUID := auth.uid();
  v_caller_profile profiles; v_effective_institution UUID;
  v_is_privileged BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_cfg FROM dashboard_config WHERE scope = 'global' LIMIT 1;
  IF v_caller IS NOT NULL THEN
    SELECT * INTO v_caller_profile FROM profiles WHERE id = v_caller;
  END IF;

  IF v_caller_profile.id IS NULL THEN
    RETURN jsonb_build_object(
      'ohs', jsonb_build_object('score', 0, 'band', 'red',
        'components', jsonb_build_object('attendance', 0, 'sla', 0, 'fees', 0, 'escalations', 0)),
      'pipeline', jsonb_build_object('value_inr', 0, 'lead_count', 0),
      'attendance', jsonb_build_object('pct_today', NULL, 'pct_baseline', NULL, 'present', 0, 'total', 0),
      'pending_decisions', jsonb_build_object('count', 0),
      'scope', jsonb_build_object('institution_id', NULL, 'department_id', NULL,
        'computed_at', NOW(), 'forbidden', TRUE, 'reason', 'no_caller_profile'));
  END IF;

  v_is_privileged := (
    v_caller_profile.is_super_admin = TRUE
    OR v_caller_profile.role IN ('admin', 'administrator', 'super_admin', 'admission_manager')
  );

  IF v_is_privileged THEN
    v_effective_institution := p_institution_id;
  ELSE
    IF v_caller_profile.institution_id IS NULL THEN
      RETURN jsonb_build_object(
        'ohs', jsonb_build_object('score', 0, 'band', 'red',
          'components', jsonb_build_object('attendance', 0, 'sla', 0, 'fees', 0, 'escalations', 0)),
        'pipeline', jsonb_build_object('value_inr', 0, 'lead_count', 0),
        'attendance', jsonb_build_object('pct_today', NULL, 'pct_baseline', NULL, 'present', 0, 'total', 0),
        'pending_decisions', jsonb_build_object('count', 0),
        'scope', jsonb_build_object('institution_id', NULL, 'department_id', NULL,
          'computed_at', NOW(), 'forbidden', TRUE, 'reason', 'caller_has_no_institution'));
    END IF;
    v_effective_institution := v_caller_profile.institution_id;
  END IF;

  SELECT COALESCE(SUM(cnt_total), 0), COALESCE(SUM(cnt_present), 0)
  INTO v_att_total, v_att_present
  FROM (
    SELECT
      (SELECT COUNT(*) FROM jsonb_path_query_array(sa.attendance_data, '$.*.students[*]') AS ja(v))::int AS cnt_total,
      (SELECT COUNT(*) FROM jsonb_path_query_array(sa.attendance_data, '$.*.students[*] ? (@.status == "Present")') AS jp(v))::int AS cnt_present
    FROM student_attendance sa
    WHERE sa.attendance_date = v_today
      AND (v_effective_institution IS NULL OR sa.institution_id = v_effective_institution)
      AND (p_department_id IS NULL OR sa.department_id = p_department_id)
  ) agg;
  IF v_att_total > 0 THEN v_att_pct := ROUND((v_att_present::numeric * 100.0) / v_att_total, 1); END IF;

  SELECT AVG(daily_pct) INTO v_att_baseline_pct FROM (
    SELECT CASE WHEN SUM(tot) > 0 THEN (SUM(pres)::numeric * 100.0 / SUM(tot)) ELSE NULL END AS daily_pct
    FROM (
      SELECT sa.attendance_date,
        (SELECT COUNT(*) FROM jsonb_path_query_array(sa.attendance_data, '$.*.students[*]') AS ja(v)) AS tot,
        (SELECT COUNT(*) FROM jsonb_path_query_array(sa.attendance_data, '$.*.students[*] ? (@.status == "Present")') AS jp(v)) AS pres
      FROM student_attendance sa
      WHERE sa.attendance_date BETWEEN v_today - INTERVAL '7 days' AND v_today - INTERVAL '1 day'
        AND (v_effective_institution IS NULL OR sa.institution_id = v_effective_institution)
        AND (p_department_id IS NULL OR sa.department_id = p_department_id)
    ) by_day GROUP BY attendance_date
  ) daily;

  IF v_att_pct IS NOT NULL AND v_att_baseline_pct IS NOT NULL AND v_att_baseline_pct > 0 THEN
    v_att_score := LEAST(100, GREATEST(0, ROUND((v_att_pct / v_att_baseline_pct) * 100)::int));
  ELSIF v_att_pct IS NOT NULL THEN
    v_att_score := LEAST(100, GREATEST(0, ROUND(v_att_pct)::int));
  END IF;

  SELECT CASE WHEN COUNT(*) = 0 THEN 100
    ELSE ROUND(COUNT(*) FILTER (WHERE first_touch_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (first_touch_at - created_at))/3600.0 <= v_cfg.cold_lead_threshold_hours
    )::numeric * 100.0 / COUNT(*))::int END INTO v_sla_compliance
  FROM admission_leads
  WHERE created_at >= NOW() - INTERVAL '24 hours' AND score >= 70
    AND (v_effective_institution IS NULL OR institution_id = v_effective_institution);

  SELECT COALESCE(SUM(payment_amount), 0) INTO v_fee_today FROM billing_receipts
  WHERE (receipt_date::date = v_today OR payment_paid_date::date = v_today)
    AND (v_effective_institution IS NULL OR institution_id = v_effective_institution);
  v_fee_score := LEAST(100, GREATEST(0, ROUND((v_fee_today / NULLIF(v_fee_plan, 0)) * 100)::int));

  SELECT COUNT(*) INTO v_escalations_open FROM grievance_tickets
  WHERE status NOT IN ('resolved', 'closed', 'cancelled')
    AND sla_deadline IS NOT NULL AND sla_deadline < NOW()
    AND (v_effective_institution IS NULL OR institution_id = v_effective_institution);
  v_escalations_score := GREATEST(0, 100 - (v_escalations_open * 5));

  v_ohs_score := ROUND(
    (v_att_score * v_cfg.ohs_attendance_weight) +
    (v_sla_compliance * v_cfg.ohs_sla_weight) +
    (v_fee_score * v_cfg.ohs_fees_weight) +
    (v_escalations_score * v_cfg.ohs_escalations_weight))::int;

  SELECT
    COALESCE(SUM(COALESCE(conversion_probability, 0.5) * 100000), 0),
    COUNT(*) FILTER (WHERE score >= 70 AND funnel_stage::text NOT IN ('enrolled','lost','withdrew','declined','expired'))
  INTO v_pipeline_inr, v_pipeline_count FROM admission_leads
  WHERE funnel_stage::text NOT IN ('enrolled','lost','withdrew','declined','expired')
    AND (v_effective_institution IS NULL OR institution_id = v_effective_institution);

  SELECT COUNT(*) INTO v_pending_decisions FROM user_notifications un
  JOIN notifications n ON n.id = un.notification_id
  WHERE un.user_id = v_caller AND un.acknowledged_at IS NULL
    AND n.requires_acknowledgment = TRUE
    AND (n.expires_at IS NULL OR n.expires_at > NOW());

  RETURN jsonb_build_object(
    'ohs', jsonb_build_object('score', v_ohs_score,
      'band', CASE WHEN v_ohs_score < v_cfg.ohs_red_ceiling THEN 'red'
                   WHEN v_ohs_score < v_cfg.ohs_amber_ceiling THEN 'amber' ELSE 'green' END,
      'components', jsonb_build_object('attendance', v_att_score, 'sla', v_sla_compliance,
        'fees', v_fee_score, 'escalations', v_escalations_score)),
    'pipeline', jsonb_build_object('value_inr', v_pipeline_inr, 'lead_count', v_pipeline_count),
    'attendance', jsonb_build_object('pct_today', v_att_pct, 'pct_baseline', v_att_baseline_pct,
      'present', v_att_present, 'total', v_att_total),
    'pending_decisions', jsonb_build_object('count', v_pending_decisions),
    'scope', jsonb_build_object('institution_id', v_effective_institution,
      'department_id', p_department_id, 'computed_at', NOW(),
      'scope_enforced', NOT v_is_privileged));
END;
$$;
GRANT EXECUTE ON FUNCTION fn_dashboard_metrics(UUID, UUID) TO authenticated;

-- persona-matrix test harness: impersonates target via JWT claim, calls fn_dashboard_metrics
CREATE OR REPLACE FUNCTION fn_dashboard_metrics_as(p_target_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_result JSONB;
BEGIN
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', p_target_user_id::text, 'role', 'authenticated')::text, TRUE);
  v_result := fn_dashboard_metrics(NULL, NULL);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION fn_dashboard_metrics_as(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_dashboard_metrics_as(UUID) TO service_role;

-- END Dashboard v2 null-gate hotfix

-- ================================================================================
-- SECTION: DASHBOARD V2 — FACULTY METRICS
-- Added: 2026-04-17 — Faculty hero strip (unmarked classes, learner flags,
-- upcoming timetable, week attendance %)
-- ================================================================================
CREATE OR REPLACE FUNCTION fn_faculty_metrics()
-- ============================================================================
-- Dashboard v2 — Student/Learner Metrics (fn_student_metrics)
-- Added: 2026-04-17 — Student hero strip for 4,235 active learner users
-- Returns attendance %, fee balance, today's timetable, upcoming deadlines
-- SECURITY DEFINER: reads auth.uid() to resolve learner_id from profiles.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_student_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_institution_id uuid;
  v_staff_id uuid;
  v_today date;
  v_day_name text;
  v_now_ist timestamptz;
  v_now_time time;
  v_week_start date;
  v_week_end date;
  v_total_today int := 0;
  v_marked_today int := 0;
  v_upcoming jsonb := '[]'::jsonb;
  v_next_2h_count int := 0;
  v_week_days_total int := 0;
  v_week_days_marked int := 0;
  v_week_pct numeric := 0;
  v_tt record;
  v_period jsonb;
  v_slot jsonb;
  v_period_id text;
  v_start_time time;
  v_end_time time;
  v_course_code text;
  v_course_name text;
  v_section_name text;
  v_period_name text;
  v_has_marked boolean;
  v_cutoff_time time;
BEGIN
  v_now_ist := now() AT TIME ZONE 'Asia/Kolkata';
  v_today := v_now_ist::date;
  v_now_time := v_now_ist::time;
  v_cutoff_time := v_now_time + interval '2 hours';
  v_day_name := upper(trim(to_char(v_today, 'DAY')));
  v_week_start := v_today - (extract(isodow from v_today)::int - 1);
  v_week_end := v_week_start + 4;

  SELECT institution_id INTO v_institution_id
  FROM profiles WHERE id = v_user_id;

  SELECT s.id INTO v_staff_id
  FROM staff s WHERE s.profile_id = v_user_id
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RETURN jsonb_build_object(
      'unmarked_classes', jsonb_build_object('count', 0, 'total_today', 0, 'data_source', 'no_staff_record'),
      'learner_flags', jsonb_build_object('count', 0, 'data_source', 'not_available'),
      'upcoming_timetable', jsonb_build_object('classes', '[]'::jsonb, 'next_2h_count', 0, 'data_source', 'no_staff_record'),
      'week_attendance', jsonb_build_object('pct', 0, 'days_marked', 0, 'days_total', 0, 'data_source', 'no_staff_record'),
      'scope', jsonb_build_object('user_id', v_user_id, 'institution_id', v_institution_id, 'computed_at', now())
    );
  END IF;

  FOR v_tt IN
    SELECT t.timetable_data, t.periods, t.section_id, sec.section_name
    FROM timetables t
    LEFT JOIN sections sec ON sec.id = t.section_id
    WHERE t.is_active = true
      AND t.institution_id = v_institution_id
      AND t.timetable_data IS NOT NULL
      AND t.periods IS NOT NULL
      AND t.timetable_data ? v_day_name
  LOOP
    FOR v_period IN SELECT * FROM jsonb_array_elements(v_tt.periods)
    LOOP
      IF (v_period->>'is_break')::boolean THEN
        CONTINUE;
      END IF;

      v_period_id := v_period->>'period_id';
      v_start_time := (v_period->>'start_time')::time;
      v_end_time := (v_period->>'end_time')::time;
      v_period_name := v_period->>'period_name';

      v_slot := v_tt.timetable_data->v_day_name->v_period_id;

      IF v_slot IS NULL THEN
        CONTINUE;
      END IF;

      IF v_slot->>'primary_staff_id' = v_staff_id::text
         OR v_slot->'staff_ids' @> to_jsonb(v_staff_id::text) THEN

        v_total_today := v_total_today + 1;

        v_course_code := '';
        v_course_name := '';
        BEGIN
          SELECT c.course_code, c.course_name INTO v_course_code, v_course_name
          FROM courses c WHERE c.id = (v_slot->>'course_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;

        v_section_name := COALESCE(v_tt.section_name, 'Unknown Section');

        v_has_marked := EXISTS (
          SELECT 1 FROM student_attendance sa
          WHERE sa.attendance_date = v_today
            AND sa.timetable_id IN (
              SELECT t2.id FROM timetables t2
              WHERE t2.is_active = true
                AND t2.institution_id = v_institution_id
                AND t2.section_id = v_tt.section_id
            )
            AND sa.attendance_data ? v_period_id
        );

        IF v_has_marked THEN
          v_marked_today := v_marked_today + 1;
        END IF;

        IF v_start_time >= v_now_time AND v_start_time < v_cutoff_time THEN
          v_next_2h_count := v_next_2h_count + 1;
          v_upcoming := v_upcoming || jsonb_build_object(
            'course', COALESCE(NULLIF(v_course_code, ''), v_course_name, v_period_name),
            'time', to_char(v_start_time, 'HH24:MI') || '-' || to_char(v_end_time, 'HH24:MI'),
            'section', v_section_name
          );
        END IF;

      END IF;
    END LOOP;
  END LOOP;

  v_week_days_total := LEAST(extract(isodow from v_today)::int, 5);

  SELECT COUNT(DISTINCT sa.attendance_date) INTO v_week_days_marked
  FROM student_attendance sa,
       jsonb_each(sa.attendance_data) AS periods(period_key, period_val)
  WHERE sa.attendance_date >= v_week_start
    AND sa.attendance_date <= LEAST(v_today, v_week_end)
    AND sa.institution_id = v_institution_id
    AND period_val->'marked_by_details'->>'marker_id' = v_user_id::text;

  IF v_week_days_total > 0 THEN
    v_week_pct := ROUND((v_week_days_marked::numeric / v_week_days_total) * 100, 1);
  END IF;

  RETURN jsonb_build_object(
    'unmarked_classes', jsonb_build_object(
      'count', v_total_today - v_marked_today,
      'total_today', v_total_today
    ),
    'learner_flags', jsonb_build_object(
      'count', 0,
      'data_source', 'not_available'
    ),
    'upcoming_timetable', jsonb_build_object(
      'classes', v_upcoming,
      'next_2h_count', v_next_2h_count
    ),
    'week_attendance', jsonb_build_object(
      'pct', v_week_pct,
      'days_marked', v_week_days_marked,
      'days_total', v_week_days_total
    ),
    'scope', jsonb_build_object(
      'user_id', v_user_id,
      'institution_id', v_institution_id,
      'computed_at', now()
  v_user_id         uuid;
  v_learner_id      uuid;
  v_section_id      uuid;
  v_semester_id     uuid;
  v_institution_id  uuid;
  v_attendance      jsonb;
  v_fees            jsonb;
  v_timetable       jsonb;
  v_deadlines       jsonb;
  v_present         int := 0;
  v_total           int := 0;
  v_pct             numeric := 0;
  v_band            text := 'red';
  v_balance         numeric := 0;
  v_next_due        date;
  v_today_day       text;
  v_classes         jsonb := '[]'::jsonb;
  v_class_count     int := 0;
  rec               record;
BEGIN
  -- 1. Resolve the current user to their learner profile
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'not_authenticated',
      'scope', jsonb_build_object('user_id', null, 'computed_at', now()::text)
    );
  END IF;

  SELECT p.learner_id, p.institution_id
  INTO v_learner_id, v_institution_id
  FROM profiles p
  WHERE p.id = v_user_id;

  IF v_learner_id IS NULL THEN
    RETURN jsonb_build_object(
      'attendance', jsonb_build_object('pct_semester', 0, 'present', 0, 'total', 0, 'band', 'red', 'data_source', 'no_learner_profile'),
      'fees', jsonb_build_object('balance_due', 0, 'next_due_date', null, 'currency', 'INR', 'data_source', 'no_learner_profile'),
      'timetable_today', jsonb_build_object('classes', '[]'::jsonb, 'total', 0, 'data_source', 'no_learner_profile'),
      'deadlines', jsonb_build_object('upcoming', '[]'::jsonb, 'count', 0, 'data_source', 'no_learner_profile'),
      'scope', jsonb_build_object('user_id', v_user_id, 'institution_id', v_institution_id, 'computed_at', now()::text)
    );
  END IF;

  SELECT lp.section_id, lp.semester_id
  INTO v_section_id, v_semester_id
  FROM learners_profiles lp
  WHERE lp.id = v_learner_id;

  -- TILE 1: ATTENDANCE (semester aggregate)
  BEGIN
    IF v_section_id IS NOT NULL AND v_semester_id IS NOT NULL THEN
      SELECT
        COALESCE(SUM(
          (SELECT COUNT(*) FROM jsonb_each(sa.attendance_data) AS period_kv,
           LATERAL jsonb_array_elements(period_kv.value -> 'students') AS student_entry
           WHERE (student_entry ->> 'student_id')::uuid = v_learner_id
             AND student_entry ->> 'status' = 'Present')
        ), 0),
        COALESCE(SUM(
          (SELECT COUNT(*) FROM jsonb_each(sa.attendance_data) AS period_kv,
           LATERAL jsonb_array_elements(period_kv.value -> 'students') AS student_entry
           WHERE (student_entry ->> 'student_id')::uuid = v_learner_id)
        ), 0)
      INTO v_present, v_total
      FROM student_attendance sa
      WHERE sa.section_id = v_section_id
        AND sa.semester_id = v_semester_id;

      IF v_total > 0 THEN
        v_pct := ROUND((v_present::numeric / v_total::numeric) * 100, 1);
      END IF;

      IF v_pct >= 75 THEN v_band := 'green';
      ELSIF v_pct >= 60 THEN v_band := 'amber';
      ELSE v_band := 'red';
      END IF;

      v_attendance := jsonb_build_object(
        'pct_semester', v_pct, 'present', v_present, 'total', v_total, 'band', v_band
      );
    ELSE
      v_attendance := jsonb_build_object(
        'pct_semester', 0, 'present', 0, 'total', 0, 'band', 'red', 'data_source', 'no_section_or_semester'
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_attendance := jsonb_build_object(
      'pct_semester', 0, 'present', 0, 'total', 0, 'band', 'red', 'data_source', 'error'
    );
  END;

  -- TILE 2: FEE BALANCE
  BEGIN
    SELECT COALESCE(SUM(bsb.balance_amount), 0), MIN(bsb.due_date)
    INTO v_balance, v_next_due
    FROM billing_student_bills bsb
    WHERE bsb.student_id = v_learner_id
      AND bsb.balance_amount > 0
      AND bsb.status NOT IN ('cancelled', 'refunded');

    v_fees := jsonb_build_object('balance_due', v_balance, 'next_due_date', v_next_due, 'currency', 'INR');
  EXCEPTION WHEN OTHERS THEN
    v_fees := jsonb_build_object('balance_due', 0, 'next_due_date', null, 'currency', 'INR', 'data_source', 'error');
  END;

  -- TILE 3: TODAY'S TIMETABLE
  BEGIN
    v_today_day := RTRIM(UPPER(to_char(CURRENT_DATE, 'Day')));

    IF v_section_id IS NOT NULL THEN
      SELECT jsonb_agg(slot_info ORDER BY (slot_info ->> 'start_time')), COUNT(*)
      INTO v_classes, v_class_count
      FROM (
        SELECT jsonb_build_object(
          'course', COALESCE(c.course_code, 'N/A'),
          'course_name', COALESCE(c.course_name, ''),
          'time', COALESCE(p.start_time::text, '') || '-' || COALESCE(p.end_time::text, ''),
          'faculty', COALESCE((
            SELECT pr.full_name FROM profiles pr WHERE pr.id = (slot_val ->> 'primary_staff_id')::uuid
          ), 'TBA'),
          'room', '',
          'start_time', COALESCE(p.start_time::text, '99:99'),
          'is_break', COALESCE(p.is_break, false)
        ) AS slot_info
        FROM timetables tt,
             jsonb_each(tt.timetable_data -> v_today_day) AS period_entry(period_id, slot_val)
        LEFT JOIN periods p ON p.id = period_entry.period_id::uuid
        LEFT JOIN courses c ON c.id = (period_entry.slot_val ->> 'course_id')::uuid
        WHERE tt.section_id = v_section_id
          AND tt.is_active = true
          AND tt.timetable_data ? v_today_day
          AND COALESCE((period_entry.slot_val ->> 'is_break_slot')::boolean, false) = false
        LIMIT 12
      ) sub;

      v_classes := COALESCE(v_classes, '[]'::jsonb);
      v_class_count := COALESCE(v_class_count, 0);
      v_timetable := jsonb_build_object('classes', v_classes, 'total', v_class_count);
    ELSE
      v_timetable := jsonb_build_object('classes', '[]'::jsonb, 'total', 0, 'data_source', 'no_section');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_timetable := jsonb_build_object('classes', '[]'::jsonb, 'total', 0, 'data_source', 'error');
  END;

  -- TILE 4: UPCOMING DEADLINES (fee due dates within 30 days)
  BEGIN
    SELECT jsonb_agg(d ORDER BY (d ->> 'due')), COUNT(*)
    INTO v_deadlines, v_class_count
    FROM (
      SELECT jsonb_build_object(
        'title', COALESCE(bsb.bill_description, 'Fee Payment'),
        'due', bsb.due_date::text,
        'type', 'fee_payment'
      ) AS d
      FROM billing_student_bills bsb
      WHERE bsb.student_id = v_learner_id
        AND bsb.balance_amount > 0
        AND bsb.due_date >= CURRENT_DATE
        AND bsb.due_date <= CURRENT_DATE + interval '30 days'
        AND bsb.status NOT IN ('cancelled', 'refunded')
      ORDER BY bsb.due_date
      LIMIT 5
    ) sub;

    v_deadlines := COALESCE(v_deadlines, '[]'::jsonb);
    v_class_count := COALESCE(v_class_count, 0);
  EXCEPTION WHEN OTHERS THEN
    v_deadlines := '[]'::jsonb;
    v_class_count := 0;
  END;

  -- ASSEMBLE RESPONSE
  RETURN jsonb_build_object(
    'attendance', v_attendance,
    'fees', v_fees,
    'timetable_today', v_timetable,
    'deadlines', jsonb_build_object('upcoming', v_deadlines, 'count', v_class_count),
    'scope', jsonb_build_object(
      'user_id', v_user_id, 'learner_id', v_learner_id,
      'institution_id', v_institution_id, 'computed_at', now()::text
    )
  );
END;
$$;
-- END Dashboard v2 Faculty metrics

GRANT EXECUTE ON FUNCTION public.fn_student_metrics() TO authenticated;

COMMENT ON FUNCTION public.fn_student_metrics() IS
  'Dashboard v2 — Student/Learner hero strip metrics. SECURITY DEFINER.
   Returns attendance %, fee balance, today timetable, upcoming deadlines.
   Reads auth.uid() -> profiles.learner_id -> learners_profiles -> student_attendance + billing_student_bills + timetables.';
-- END Dashboard v2 Student Metrics

-- ============================================================================
-- 2026-04-17: transfer_learner_enquiry
-- Atomic transfer of an enquiry between institutions. Regenerates
-- application_id via target institution's counselling code, resets
-- institution-specific fields, validates hierarchy, logs to
-- profile_change_audit_log. Permission-based (user_has_permission) — works
-- for any default OR custom role granted learners.admissions.transfer.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.transfer_learner_enquiry(
  p_learner_id uuid,
  p_new_institution_id uuid,
  p_new_degree_id uuid,
  p_new_department_id uuid,
  p_new_program_id uuid,
  p_new_semester_id uuid DEFAULT NULL,
  p_new_section_id uuid DEFAULT NULL,
  p_new_academic_year_id uuid DEFAULT NULL,
  p_new_regulation_id uuid DEFAULT NULL,
  p_new_batch_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  application_id text,
  institution_id uuid,
  program_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current learners_profiles%ROWTYPE;
  v_new_app_id text;
  v_caller uuid := auth.uid();
  v_cohort_year int;
  v_target_admission_year_id uuid;
BEGIN
  IF NOT (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('learners.admissions.transfer')
  ) THEN
    RAISE EXCEPTION 'Permission denied: learners.admissions.transfer required';
  END IF;

  SELECT * INTO v_current FROM learners_profiles
  WHERE learners_profiles.id = p_learner_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enquiry not found: %', p_learner_id;
  END IF;

  IF v_current.lifecycle_status IN ('account','active','graduated','exited') THEN
    RAISE EXCEPTION 'Cannot transfer enquiry with status "%". Transfers are only allowed before billing.', v_current.lifecycle_status;
  END IF;

  IF v_current.institution_id = p_new_institution_id THEN
    RAISE EXCEPTION 'New institution must differ from current institution';
  END IF;

  PERFORM 1 FROM degrees
  WHERE degrees.id = p_new_degree_id AND degrees.institution_id = p_new_institution_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Degree % does not belong to institution %', p_new_degree_id, p_new_institution_id;
  END IF;

  PERFORM 1 FROM departments
  WHERE departments.id = p_new_department_id AND departments.degree_id = p_new_degree_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Department % does not belong to degree %', p_new_department_id, p_new_degree_id;
  END IF;

  PERFORM 1 FROM programs
  WHERE programs.id = p_new_program_id AND programs.department_id = p_new_department_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program % does not belong to department %', p_new_program_id, p_new_department_id;
  END IF;

  -- Re-map admission_year_id to the TARGET institution's cohort (admission_years
  -- is institution-scoped). Keep the same calendar year as the learner's current
  -- cohort; NULL when the target has no cohort for that year.
  IF v_current.admission_year_id IS NOT NULL THEN
    SELECT ay.year INTO v_cohort_year
      FROM public.admission_years ay
     WHERE ay.id = v_current.admission_year_id;

    IF v_cohort_year IS NOT NULL THEN
      SELECT ay.id INTO v_target_admission_year_id
        FROM public.admission_years ay
       WHERE ay.institution_id = p_new_institution_id
         AND ay.year = v_cohort_year
       ORDER BY ay.is_active DESC, ay.created_at ASC
       LIMIT 1;
    END IF;
  END IF;

  v_new_app_id := generate_learner_application_id(p_new_institution_id);

  UPDATE learners_profiles SET
    institution_id    = p_new_institution_id,
    degree_id         = p_new_degree_id,
    department_id     = p_new_department_id,
    program_id        = p_new_program_id,
    semester_id       = p_new_semester_id,
    section_id        = p_new_section_id,
    academic_year_id  = p_new_academic_year_id,
    admission_year_id = v_target_admission_year_id,
    regulation_id     = p_new_regulation_id,
    batch_id          = p_new_batch_id,
    roll_number       = NULL,
    application_id    = v_new_app_id,
    updated_at        = now()
  WHERE learners_profiles.id = p_learner_id;

  INSERT INTO profile_change_audit_log (
    learner_id, action_type, changed_fields, performed_by, comments, performed_at, created_at
  ) VALUES (
    p_learner_id,
    'TRANSFER',
    jsonb_build_object(
      'old', jsonb_build_object(
        'institution_id', v_current.institution_id,
        'application_id', v_current.application_id,
        'degree_id',      v_current.degree_id,
        'department_id',  v_current.department_id,
        'program_id',     v_current.program_id,
        'semester_id',    v_current.semester_id,
        'section_id',     v_current.section_id,
        'academic_year_id', v_current.academic_year_id,
        'admission_year_id', v_current.admission_year_id,
        'regulation_id',  v_current.regulation_id,
        'batch_id',       v_current.batch_id,
        'roll_number',    v_current.roll_number
      ),
      'new', jsonb_build_object(
        'institution_id', p_new_institution_id,
        'application_id', v_new_app_id,
        'degree_id',      p_new_degree_id,
        'department_id',  p_new_department_id,
        'program_id',     p_new_program_id,
        'semester_id',    p_new_semester_id,
        'section_id',     p_new_section_id,
        'academic_year_id', p_new_academic_year_id,
        'admission_year_id', v_target_admission_year_id,
        'regulation_id',  p_new_regulation_id,
        'batch_id',       p_new_batch_id,
        'roll_number',    NULL
      ),
      'reason', p_reason
    ),
    v_caller,
    p_reason,
    now(),
    now()
  );

  RETURN QUERY
    SELECT lp.id, lp.application_id, lp.institution_id, lp.program_id
    FROM learners_profiles lp
    WHERE lp.id = p_learner_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_learner_enquiry(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text
) TO authenticated;
-- END transfer_learner_enquiry

-- ============================================================================
-- SEAT ANALYTICS RPCs (2026-04-17)
-- ============================================================================

-- RPC A: Seat fill stats per institution → degree → department → program → admission year
-- Updated: 2026-04-24 - Switched from academic_years to admission_years (per-institution-per-program
--   cohort table). Filled count now includes 'admitted', 'active', and 'graduated' statuses.
--   Dual-join strategy: prefers admission_year_id FK; falls back to integer year match for
--   learners where admission_year_id is still NULL (pre-backfill rows).
DROP FUNCTION IF EXISTS public.get_seat_analytics(uuid, uuid);

-- Reworked for institution-wide admission_years (20260605150030): rows are driven
-- by programs (which now hold sanctioned_intake) per institution; admission_years
-- supplies only year context. program_end_year = ay.year + program_duration_yrs.
CREATE OR REPLACE FUNCTION public.get_seat_analytics(p_institution_id uuid DEFAULT NULL::uuid, p_program_start_year integer DEFAULT NULL::integer)
 RETURNS TABLE(institution_id uuid, institution_name text, degree_id uuid, degree_name text, department_id uuid, department_name text, program_id uuid, program_name text, admission_year_id uuid, admission_year_name text, program_start_year integer, program_end_year integer, total_seats integer, filled_seats bigint, reserved_seats bigint, balance_seats integer, fill_percentage numeric, last_filled_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH years AS (
    SELECT ay.id, ay.institution_id, ay.admission_year_name, ay.year
    FROM admission_years ay
    WHERE (
            (p_program_start_year IS NULL     AND ay.is_active = true)
         OR (p_program_start_year IS NOT NULL AND ay.year = p_program_start_year)
          )
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND role_has_institution_access(ay.institution_id)
  )
  SELECT
    i.id,
    i.name,
    d.id,
    d.degree_name,
    dept.id,
    dept.department_name,
    p.id,
    p.program_name,
    y.id,
    y.admission_year_name,
    y.year                                                       AS program_start_year,
    (y.year + COALESCE(p.program_duration_yrs, 0))::integer      AS program_end_year,
    p.sanctioned_intake::integer                                 AS total_seats,
    COUNT(lp.id) FILTER (
      WHERE lp.lifecycle_status::text IN ('admitted','active','graduated','account')
    )                                                           AS filled_seats,
    COUNT(lp.id) FILTER (
      WHERE lp.lifecycle_status::text = 'reserved'
    )                                                           AS reserved_seats,
    GREATEST(
      0,
      p.sanctioned_intake - (COUNT(lp.id) FILTER (
        WHERE lp.lifecycle_status::text IN ('admitted','active','graduated','account')
      ))::integer
    )                                                           AS balance_seats,
    CASE
      WHEN p.sanctioned_intake > 0
        THEN ROUND(
          (COUNT(lp.id) FILTER (
            WHERE lp.lifecycle_status::text IN ('admitted','active','graduated','account')
          ))::numeric / p.sanctioned_intake * 100, 1)
      ELSE 0
    END                                                         AS fill_percentage,
    MAX(lp.activated_at) FILTER (
      WHERE lp.lifecycle_status::text IN ('admitted','active','graduated','account')
    )                                                           AS last_filled_at
  FROM years y
  JOIN programs p       ON p.institution_id = y.institution_id AND COALESCE(p.is_active, true) = true
  JOIN departments dept ON dept.id = p.department_id
  JOIN degrees d        ON d.id    = p.degree_id
  JOIN institutions i   ON i.id    = y.institution_id
  LEFT JOIN learners_profiles lp
    ON  lp.admission_year_id = y.id
    AND lp.program_id        = p.id
    AND lp.lifecycle_status::text IN ('admitted','active','graduated','account','reserved')
  GROUP BY
    i.id, i.name,
    d.id, d.degree_name,
    dept.id, dept.department_name,
    p.id, p.program_name, p.sanctioned_intake, p.program_duration_yrs,
    y.id, y.admission_year_name, y.year
  ORDER BY i.name, d.degree_name, dept.department_name, p.program_name, y.year DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_seat_analytics(uuid, integer) TO authenticated;

-- RPC B: Source/referral breakdown (consultant/direct/student/faculty) by institution
CREATE OR REPLACE FUNCTION public.get_source_analytics(
  p_institution_id    uuid DEFAULT NULL,
  p_academic_year_id  uuid DEFAULT NULL
)
RETURNS TABLE (
  institution_id    uuid,
  institution_name  text,
  source            text,
  referral_type     text,
  academic_year_id  uuid,
  academic_year_name text,
  lead_count        bigint,
  enrolled_count    bigint,
  conversion_rate   numeric,
  last_enrolled_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id                                          AS institution_id,
    i.name                                        AS institution_name,
    al.source::text                               AS source,
    al.referral_type,
    ay.id                                         AS academic_year_id,
    ay.academic_year_name,
    COUNT(DISTINCT al.id)                         AS lead_count,
    COUNT(DISTINCT lp.id)
      FILTER (WHERE lp.lifecycle_status = 'active') AS enrolled_count,
    CASE
      WHEN COUNT(DISTINCT al.id) > 0
        THEN ROUND(
          COUNT(DISTINCT lp.id) FILTER (WHERE lp.lifecycle_status = 'active')::numeric
          / COUNT(DISTINCT al.id) * 100, 1)
      ELSE 0
    END                                           AS conversion_rate,
    MAX(lp.activated_at)                          AS last_enrolled_at
  FROM admission_leads al
  JOIN institutions i ON i.id = al.institution_id
  LEFT JOIN learners_profiles lp ON lp.id = al.learner_profile_id
  LEFT JOIN academic_years ay ON ay.id = lp.academic_year_id
  WHERE (p_institution_id IS NULL OR al.institution_id = p_institution_id)
    AND (p_academic_year_id IS NULL
         OR lp.academic_year_id = p_academic_year_id
         OR lp.id IS NULL)
  GROUP BY
    i.id, i.name,
    al.source, al.referral_type,
    ay.id, ay.academic_year_name
  ORDER BY i.name, enrolled_count DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_source_analytics(uuid, uuid) TO authenticated;

-- RPC C: Geographic breakdown (state → district → taluk) for active learners
CREATE OR REPLACE FUNCTION public.get_geography_analytics(
  p_institution_id    uuid DEFAULT NULL,
  p_academic_year_id  uuid DEFAULT NULL
)
RETURNS TABLE (
  institution_id   uuid,
  institution_name text,
  state            text,
  district         text,
  taluk            text,
  active_learners  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id                            AS institution_id,
    i.name                          AS institution_name,
    lp.permanent_address_state      AS state,
    lp.permanent_address_district   AS district,
    lp.permanent_address_taluk      AS taluk,
    COUNT(*)                        AS active_learners
  FROM learners_profiles lp
  JOIN institutions i ON i.id = lp.institution_id
  WHERE lp.lifecycle_status = 'active'
    AND (p_institution_id   IS NULL OR lp.institution_id  = p_institution_id)
    AND (p_academic_year_id IS NULL OR lp.academic_year_id = p_academic_year_id)
    AND lp.permanent_address_district IS NOT NULL
    AND lp.permanent_address_district != ''
  GROUP BY
    i.id, i.name,
    lp.permanent_address_state,
    lp.permanent_address_district,
    lp.permanent_address_taluk
  ORDER BY i.name, active_learners DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_geography_analytics(uuid, uuid) TO authenticated;

-- Updated: 2026-04-18 - Grant HOD role staff planning create/edit permissions [BUG-002585]
-- HOD users were blocked by RLS 42501 error when creating staff plans because
-- academic.staff.planning.edit was missing from the HOD custom_role permissions JSONB.
-- Granted: academic.staff.planning.edit, academic.staff.planning.create, academic.staff.planning.view
UPDATE custom_roles
SET
  permissions = permissions || '{"academic.staff.planning.edit": true, "academic.staff.planning.create": true, "academic.staff.planning.view": true}'::jsonb,
  updated_at = NOW()
WHERE role_key = 'hod';
-- END SEAT ANALYTICS RPCs

-- ================================================================================
-- SECTION: HOD DASHBOARD METRICS
-- Updated: 2026-04-18 - Added fn_hod_metrics for Dashboard v2 HOD hero strip
-- ================================================================================

-- fn_hod_metrics: HOD dashboard hero strip metrics
-- Returns JSONB with 4 tile values for the logged-in HOD
CREATE OR REPLACE FUNCTION public.fn_hod_metrics()
RETURNS jsonb
-- Updated: 2026-04-16 - Added fn_principal_metrics for Dashboard v2 Principal hero strip
-- Principal-scoped hero: (1) OHS via fn_dashboard_metrics, (2) Staff attendance (not_available),
-- (3) hostel_incidents today, (4) pending approvals from user_notifications.
CREATE OR REPLACE FUNCTION public.fn_principal_metrics()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_institution_id uuid;
  v_today date;
  v_ohs_score int := 0;
  v_ohs_band text := 'red';
  v_ohs_components jsonb := '{}'::jsonb;
  v_incidents_today int := 0;
  v_incidents_open int := 0;
  v_pending_approvals int := 0;
  v_dashboard_data jsonb;
BEGIN
  v_today := (CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT institution_id INTO v_institution_id
  FROM profiles WHERE id = v_user_id;

  IF v_institution_id IS NULL THEN
    RETURN jsonb_build_object(
      'health_score', jsonb_build_object(
        'score', 0, 'band', 'red',
        'components', '{}'::jsonb,
        'data_source', 'no_institution'
      ),
      'staff_attendance', jsonb_build_object(
        'present', 0, 'total', 0, 'pct', 0,
        'data_source', 'not_available'
      ),
      'incidents', jsonb_build_object(
        'today_count', 0, 'open_count', 0,
        'data_source', 'no_institution'
      ),
      'pending_approvals', jsonb_build_object(
        'count', 0,
        'data_source', 'no_institution'
      ),
      'scope', jsonb_build_object(
        'user_id', v_user_id,
        'institution_id', NULL,
        'computed_at', now()
      )
    );
  END IF;

  -- 1) OHS via fn_dashboard_metrics (reuse existing RPC)
  BEGIN
    v_dashboard_data := fn_dashboard_metrics(v_institution_id);
    v_ohs_score := COALESCE((v_dashboard_data->'ohs'->>'score')::int, 0);
    v_ohs_band := COALESCE(v_dashboard_data->'ohs'->>'band', 'red');
    v_ohs_components := COALESCE(v_dashboard_data->'ohs'->'components', '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_ohs_score := 0;
    v_ohs_band := 'red';
    v_ohs_components := '{}'::jsonb;
  END;

  -- 2) Staff attendance today — no table exists yet
  -- Future: will query hr_daily_attendance when HR module ships

  -- 3) Incidents today (hostel_incidents scoped to institution)
  SELECT
    COUNT(*) FILTER (WHERE incident_date::date = v_today),
    COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed'))
  INTO v_incidents_today, v_incidents_open
  FROM hostel_incidents
  WHERE institution_id = v_institution_id;

  -- 4) Pending approvals (user_notifications requiring acknowledgment)
  SELECT COUNT(*) INTO v_pending_approvals
  FROM user_notifications un
  JOIN notifications n ON n.id = un.notification_id
  WHERE un.user_id = v_user_id
    AND un.acknowledged_at IS NULL
    AND n.requires_acknowledgment = TRUE
    AND (n.expires_at IS NULL OR n.expires_at > now());

  RETURN jsonb_build_object(
    'health_score', jsonb_build_object(
      'score', v_ohs_score,
      'band', v_ohs_band,
      'components', v_ohs_components
    ),
    'staff_attendance', jsonb_build_object(
      'present', 0,
      'total', 0,
      'pct', 0,
      'data_source', 'not_available'
    ),
    'incidents', jsonb_build_object(
      'today_count', v_incidents_today,
      'open_count', v_incidents_open
    ),
    'pending_approvals', jsonb_build_object(
      'count', v_pending_approvals
    ),
    'scope', jsonb_build_object(
      'user_id', v_user_id,
      'institution_id', v_institution_id,
      'computed_at', now()
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION fn_principal_metrics TO authenticated;
-- ============================================================================
-- Dashboard v2 — fn_accounts_metrics (Accounts hero strip)
-- Added: 2026-04-18 — 4 tiles: collection vs plan, overdue bills, recon gap, pending refunds
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_accounts_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_dept_id uuid;
  v_inst_id uuid;
  v_att_pct numeric := 0;
  v_baseline numeric := 75;
  v_marking_compliance numeric := 0;
  v_open_grievances integer := 0;
  v_pending_leaves integer := 0;
  v_total_students integer := 0;
  v_present_students integer := 0;
  v_total_expected_sessions integer := 0;
  v_marked_sessions integer := 0;
BEGIN
  -- Resolve caller
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'dept_attendance_pct', 0,
      'attendance_baseline', v_baseline,
      'marking_compliance_pct', 0,
      'open_grievances', 0,
      'pending_leave_approvals', 0
    );
  END IF;

  -- Get HOD's department and institution
  SELECT department_id, institution_id
    INTO v_dept_id, v_inst_id
    FROM profiles
   WHERE id = v_uid;

  IF v_dept_id IS NULL THEN
    RETURN jsonb_build_object(
      'dept_attendance_pct', 0,
      'attendance_baseline', v_baseline,
      'marking_compliance_pct', 0,
      'open_grievances', 0,
      'pending_leave_approvals', 0
    );
  END IF;

  -- Tile 1: Dept attendance today
  -- attendance_data is JSONB object keyed by period_id
  -- each value has .students[] with .status = 'Present'|'Absent'
  SELECT
    COALESCE(SUM(present_ct), 0),
    COALESCE(SUM(total_ct), 0)
  INTO v_present_students, v_total_students
  FROM (
    SELECT
      (SELECT COUNT(*) FROM jsonb_array_elements(period_val->'students') s WHERE s->>'status' = 'Present') AS present_ct,
      (SELECT COUNT(*) FROM jsonb_array_elements(period_val->'students') s) AS total_ct
    FROM student_attendance sa,
         jsonb_each(sa.attendance_data) AS kv(period_key, period_val)
    WHERE sa.department_id = v_dept_id
      AND sa.institution_id = v_inst_id
      AND sa.attendance_date = CURRENT_DATE
  ) sub;

  IF v_total_students > 0 THEN
    v_att_pct := ROUND((v_present_students::numeric / v_total_students) * 100, 1);
  END IF;

  -- Tile 2: Faculty marking compliance (today)
  -- Count sections in the dept that SHOULD have attendance vs sections that DO
  SELECT COUNT(DISTINCT s.id)
    INTO v_total_expected_sessions
    FROM sections s
   WHERE s.department_id = v_dept_id;

  SELECT COUNT(DISTINCT sa.section_id)
    INTO v_marked_sessions
    FROM student_attendance sa
   WHERE sa.department_id = v_dept_id
     AND sa.institution_id = v_inst_id
     AND sa.attendance_date = CURRENT_DATE;

  IF v_total_expected_sessions > 0 THEN
    v_marking_compliance := ROUND((v_marked_sessions::numeric / v_total_expected_sessions) * 100, 1);
  END IF;

  -- Tile 3: Open grievances
  SELECT COUNT(*)
    INTO v_open_grievances
    FROM grievance_tickets
   WHERE department_id = v_dept_id
     AND institution_id = v_inst_id
     AND status NOT IN ('resolved', 'closed', 'Resolved', 'Closed');

  -- Tile 4: Pending faculty leave approvals
  -- Check leave_approvals where HOD is approver and has not yet acted
  SELECT COUNT(*)
    INTO v_pending_leaves
    FROM leave_approvals la
   WHERE la.approver_id = v_uid
     AND la.acted_at IS NULL;

  RETURN jsonb_build_object(
    'dept_attendance_pct', v_att_pct,
    'attendance_baseline', v_baseline,
    'marking_compliance_pct', v_marking_compliance,
    'open_grievances', v_open_grievances,
    'pending_leave_approvals', v_pending_leaves
  v_caller UUID;
  v_institution_id UUID;
  v_today DATE := CURRENT_DATE;
  v_month_start DATE;
  v_month_end DATE;
  v_collected_today NUMERIC := 0;
  v_daily_target NUMERIC := 100000;
  v_overdue_count BIGINT := 0;
  v_invoiced_month NUMERIC := 0;
  v_receipted_month NUMERIC := 0;
  v_recon_gap NUMERIC := 0;
  v_pending_refunds BIGINT := 0;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object(
      'collection', jsonb_build_object('collected_today', 0, 'daily_target', v_daily_target, 'pct', 0),
      'overdue_bills', jsonb_build_object('count', 0),
      'reconciliation', jsonb_build_object('gap', 0, 'invoiced', 0, 'receipted', 0),
      'pending_refunds', jsonb_build_object('count', 0),
      'scope', jsonb_build_object('user_id', null, 'institution_id', null, 'computed_at', now())
    );
  END IF;

  SELECT institution_id INTO v_institution_id
  FROM profiles WHERE id = v_caller;

  v_month_start := date_trunc('month', v_today)::date;
  v_month_end := (date_trunc('month', v_today) + interval '1 month' - interval '1 day')::date;

  -- Tile 1: Today's collection
  SELECT COALESCE(SUM(payment_amount), 0) INTO v_collected_today
  FROM billing_receipts
  WHERE receipt_date = v_today
    AND (v_institution_id IS NULL OR institution_id = v_institution_id);

  -- Tile 2: Overdue bills
  SELECT COUNT(*) INTO v_overdue_count
  FROM billing_student_bills
  WHERE due_date < v_today
    AND status NOT IN ('paid', 'cancelled')
    AND (v_institution_id IS NULL OR institution_id = v_institution_id);

  -- Tile 3: Reconciliation gap (current month)
  SELECT COALESCE(SUM(grand_total), 0) INTO v_invoiced_month
  FROM billing_invoices
  WHERE invoice_date BETWEEN v_month_start AND v_month_end
    AND (v_institution_id IS NULL OR institution_id = v_institution_id);

  SELECT COALESCE(SUM(payment_amount), 0) INTO v_receipted_month
  FROM billing_receipts
  WHERE receipt_date BETWEEN v_month_start AND v_month_end
    AND (v_institution_id IS NULL OR institution_id = v_institution_id);

  v_recon_gap := v_invoiced_month - v_receipted_month;

  -- Tile 4: Pending refunds
  SELECT COUNT(*) INTO v_pending_refunds
  FROM billing_refunds
  WHERE approval_status = 'pending'
    AND (v_institution_id IS NULL OR EXISTS (
      SELECT 1 FROM billing_receipts br WHERE br.id = billing_refunds.receipt_id AND br.institution_id = v_institution_id
    ));

  RETURN jsonb_build_object(
    'collection', jsonb_build_object(
      'collected_today', v_collected_today,
      'daily_target', v_daily_target,
      'pct', CASE WHEN v_daily_target > 0 THEN ROUND((v_collected_today / v_daily_target * 100)::numeric, 1) ELSE 0 END
    ),
    'overdue_bills', jsonb_build_object('count', v_overdue_count),
    'reconciliation', jsonb_build_object('gap', v_recon_gap, 'invoiced', v_invoiced_month, 'receipted', v_receipted_month),
    'pending_refunds', jsonb_build_object('count', v_pending_refunds),
    'scope', jsonb_build_object('user_id', v_caller, 'institution_id', v_institution_id, 'computed_at', now())
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_hod_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION fn_accounts_metrics() TO authenticated;
COMMENT ON FUNCTION fn_accounts_metrics() IS 'Dashboard v2 — Accounts hero strip: collection vs plan, overdue bills, reconciliation gap, pending refunds. SECURITY DEFINER, institution-scoped via auth.uid().';

-- =============================================================================
-- Updated: 2026-04-16 — Dashboard v2 streak badge + activity feed
-- fn_dashboard_streak(): consecutive-day SLA compliance streak (§4.3)
-- fn_dashboard_activity_feed(): recent team actions (§4.4)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_dashboard_streak()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
  v_is_super_admin BOOLEAN;
  v_threshold_hours INT;
  v_is_director BOOLEAN;
  v_today DATE;
  v_current_streak INT := 0;
  v_best_streak INT := 0;
  v_today_status TEXT := 'on_track';
  v_today_pct NUMERIC := 100;
  v_day DATE;
  v_compliant BOOLEAN;
  rec RECORD;
BEGIN
  -- Resolve role
  SELECT p.role, COALESCE(p.is_super_admin, FALSE)
    INTO v_role, v_is_super_admin
    FROM profiles p WHERE p.id = v_uid;

  v_is_director := v_is_super_admin
    OR v_role IN ('admin','administrator','super_admin','admission_manager');

  -- Get SLA threshold from dashboard_config (default 4h)
  SELECT COALESCE(dc.cold_lead_threshold_hours, 4)
    INTO v_threshold_hours
    FROM dashboard_config dc LIMIT 1;

  IF v_threshold_hours IS NULL THEN
    v_threshold_hours := 4;
  END IF;

  -- IST today
  v_today := (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;

  -- Build daily compliance for the last 90 days
  FOR rec IN
    WITH day_series AS (
      SELECT generate_series(v_today - 89, v_today, '1 day'::INTERVAL)::DATE AS d
    ),
    daily_stats AS (
      SELECT
        (al.created_at AT TIME ZONE 'Asia/Kolkata')::DATE AS lead_day,
        COUNT(*) AS total_hot,
        COUNT(*) FILTER (
          WHERE al.first_touch_at IS NOT NULL
            AND al.first_touch_at <= al.created_at + (v_threshold_hours || ' hours')::INTERVAL
        ) AS touched_in_sla
      FROM admission_leads al
      WHERE al.priority = 'hot'
        AND al.created_at >= (v_today - 89)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata'
        AND (
          CASE WHEN v_is_director THEN TRUE
               ELSE al.assigned_counselor_id = v_uid
          END
        )
      GROUP BY lead_day
    )
    SELECT
      ds.d AS day,
      COALESCE(s.total_hot, 0) AS total_hot,
      COALESCE(s.touched_in_sla, 0) AS touched_in_sla,
      CASE
        WHEN COALESCE(s.total_hot, 0) = 0 THEN TRUE  -- no volume = streak continues
        WHEN v_is_director THEN
          (s.touched_in_sla::NUMERIC / s.total_hot * 100) >= 90
        ELSE
          s.touched_in_sla = s.total_hot  -- 100% for counselor
      END AS is_compliant,
      CASE
        WHEN COALESCE(s.total_hot, 0) = 0 THEN 100
        ELSE ROUND(s.touched_in_sla::NUMERIC / s.total_hot * 100, 1)
      END AS pct
    FROM day_series ds
    LEFT JOIN daily_stats s ON s.lead_day = ds.d
    ORDER BY ds.d DESC
  LOOP
    IF rec.day = v_today THEN
      v_today_pct := rec.pct;
      IF NOT rec.is_compliant THEN
        v_today_status := 'broken';
      END IF;
    END IF;

    -- Count current streak (consecutive from today backwards)
    IF rec.is_compliant AND v_current_streak = (v_today - rec.day) THEN
      v_current_streak := v_current_streak + 1;
    END IF;
  END LOOP;

  -- Calculate best streak across the 90-day window
  v_best_streak := 0;
  DECLARE
    v_run INT := 0;
  BEGIN
    FOR rec IN
      WITH day_series AS (
        SELECT generate_series(v_today - 89, v_today, '1 day'::INTERVAL)::DATE AS d
      ),
      daily_stats AS (
        SELECT
          (al.created_at AT TIME ZONE 'Asia/Kolkata')::DATE AS lead_day,
          COUNT(*) AS total_hot,
          COUNT(*) FILTER (
            WHERE al.first_touch_at IS NOT NULL
              AND al.first_touch_at <= al.created_at + (v_threshold_hours || ' hours')::INTERVAL
          ) AS touched_in_sla
        FROM admission_leads al
        WHERE al.priority = 'hot'
          AND al.created_at >= (v_today - 89)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata'
          AND (
            CASE WHEN v_is_director THEN TRUE
                 ELSE al.assigned_counselor_id = v_uid
            END
          )
        GROUP BY lead_day
      )
      SELECT
        ds.d AS day,
        CASE
          WHEN COALESCE(s.total_hot, 0) = 0 THEN TRUE
          WHEN v_is_director THEN
            (s.touched_in_sla::NUMERIC / s.total_hot * 100) >= 90
          ELSE
            s.touched_in_sla = s.total_hot
        END AS is_compliant
      FROM day_series ds
      LEFT JOIN daily_stats s ON s.lead_day = ds.d
      ORDER BY ds.d ASC
    LOOP
      IF rec.is_compliant THEN
        v_run := v_run + 1;
        IF v_run > v_best_streak THEN
          v_best_streak := v_run;
        END IF;
      ELSE
        v_run := 0;
      END IF;
    END LOOP;
  END;

  RETURN json_build_object(
    'current_streak', v_current_streak,
    'best_streak', v_best_streak,
    'today_status', v_today_status,
    'today_compliance_pct', v_today_pct
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_dashboard_streak() TO authenticated;
COMMENT ON FUNCTION fn_dashboard_streak() IS 'Dashboard v2 — SLA streak badge. Counselor: 100% personal compliance streak. Director: >=90% JKKN-wide. SECURITY DEFINER.';

CREATE OR REPLACE FUNCTION fn_dashboard_activity_feed(p_limit INT DEFAULT 10)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
  v_is_super_admin BOOLEAN;
  v_institution_id UUID;
  v_is_director BOOLEAN;
  v_result JSON;
BEGIN
  -- Resolve role + institution
  SELECT p.role, COALESCE(p.is_super_admin, FALSE), p.institution_id
    INTO v_role, v_is_super_admin, v_institution_id
    FROM profiles p WHERE p.id = v_uid;

  v_is_director := v_is_super_admin
    OR v_role IN ('admin','administrator','super_admin','admission_manager');

  SELECT json_agg(row_to_json(t))
  INTO v_result
  FROM (
    SELECT
      pr.full_name AS actor_name,
      pr.avatar_url,
      n.title AS action_summary,
      un.acknowledged_at AS created_at,
      COALESCE(n.category, 'general') AS category
    FROM user_notifications un
    INNER JOIN notifications n ON n.id = un.notification_id
    INNER JOIN profiles pr ON pr.id = un.user_id
    WHERE un.acknowledged_at IS NOT NULL
      AND (
        CASE WHEN v_is_director THEN TRUE
             ELSE pr.institution_id = v_institution_id
        END
      )
    ORDER BY un.acknowledged_at DESC
    LIMIT LEAST(p_limit, 50)
  ) t;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION fn_dashboard_activity_feed(INT) TO authenticated;
COMMENT ON FUNCTION fn_dashboard_activity_feed(INT) IS 'Dashboard v2 — Team activity feed. Returns last N acknowledged notifications with actor details. Institution-scoped for non-admin.';


-- ============================================================================
-- Updated: 2026-04-21 — Persona Design PR-1 of 4: scope-extension helpers
--
-- Three SECURITY DEFINER helpers that mirror role_has_institution_access()
-- but for row-level scope dimensions that binary 'all'|'own' can't express.
-- All three follow the same contract:
--   - Return TRUE for super_admin (bypass)
--   - Return TRUE for NULL target_id (system-wide records)
--   - Otherwise consult the corresponding user_*_access junction table
-- ============================================================================

CREATE OR REPLACE FUNCTION public.role_has_block_access(check_block_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- NULL block_id: system-wide record (e.g. institution-level policy)
    IF check_block_id IS NULL THEN
        RETURN true;
    END IF;

    -- Super admin bypass
    IF is_super_admin() THEN
        RETURN true;
    END IF;

    -- User has an active grant to this specific block
    RETURN EXISTS (
        SELECT 1
        FROM user_block_access uba
        WHERE uba.user_id = auth.uid()
          AND uba.block_id = check_block_id
          AND uba.revoked_at IS NULL
    );
END;
$function$;

COMMENT ON FUNCTION public.role_has_block_access(uuid) IS
  'Block-level scope helper. Returns TRUE if the current user has an active '
  'grant in user_block_access for the given block_id, or is a super_admin, '
  'or the block_id is NULL. Use in RLS policies on hostel_* tables.';

CREATE OR REPLACE FUNCTION public.role_has_relationship_access(check_learner_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- NULL learner_id: system-wide record
    IF check_learner_id IS NULL THEN
        RETURN true;
    END IF;

    -- Super admin bypass
    IF is_super_admin() THEN
        RETURN true;
    END IF;

    -- User has an active, verified relationship to this learner
    -- Note: unverified relationships are NOT granted access — parents must
    -- complete verification (id proof + consent form) before seeing data.
    RETURN EXISTS (
        SELECT 1
        FROM user_learner_relationship ulr
        WHERE ulr.user_id = auth.uid()
          AND ulr.learner_id = check_learner_id
          AND ulr.revoked_at IS NULL
          AND ulr.verified_at IS NOT NULL
    );
END;
$function$;

COMMENT ON FUNCTION public.role_has_relationship_access(uuid) IS
  'Relationship scope helper (primarily parent portal). Returns TRUE if '
  'current user has a verified, non-revoked relationship to the learner. '
  'Unverified parent accounts do NOT gain access via this helper — they '
  'must complete verification first (ID proof + consent). Use in RLS on '
  'learner-facing tables when the current role is parent/guardian.';

CREATE OR REPLACE FUNCTION public.role_has_contract_access(
  check_contract_id uuid,
  check_contract_type text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- NULL contract_id: system-wide record
    IF check_contract_id IS NULL THEN
        RETURN true;
    END IF;

    -- Super admin bypass
    IF is_super_admin() THEN
        RETURN true;
    END IF;

    -- User has active grant on this contract (optionally typed)
    RETURN EXISTS (
        SELECT 1
        FROM user_contract_access uca
        WHERE uca.user_id = auth.uid()
          AND uca.contract_id = check_contract_id
          AND uca.revoked_at IS NULL
          AND (check_contract_type IS NULL OR uca.contract_type = check_contract_type)
    );
END;
$function$;

COMMENT ON FUNCTION public.role_has_contract_access(uuid, text) IS
  'Contract scope helper for external parties (mess caterers, maintenance '
  'vendors, laundry vendors, AMC contractors). Returns TRUE if current user '
  'has an active grant on the contract, or is super_admin, or contract_id is '
  'NULL. Pass contract_type to restrict to a specific kind of contract.';

-- END Persona Design PR-1 functions

-- =====================================================================
-- Dashboard v2 — Work Item Generators (2026-04-21)
-- =====================================================================
-- Closes the "OHS is red but queue is empty" architectural gap.
-- Applied to prod via migrations `dashboard_work_item_generators_phase1`,
-- `..._phase1_fixes`, `..._helper_created_by_fix`, `..._helper_targeting_fix`.
-- Consolidated here as the source-of-truth copy.
--
-- Pattern: each generator writes into (notifications, user_notifications)
-- with category LIKE 'dashboard:%' so fn_dashboard_queue_list surfaces them.
-- Idempotency-keyed per entity+day+target-user to prevent duplicates.
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_create_dashboard_work_item(
  p_category TEXT, p_priority TEXT, p_title TEXT, p_body TEXT,
  p_action_config JSONB, p_target_user UUID, p_idempotency_key TEXT,
  p_deadline_hours INT DEFAULT 48
) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_create$
DECLARE v_notif_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM notifications WHERE idempotency_key = p_idempotency_key) THEN
    RETURN 0;
  END IF;
  INSERT INTO notifications (
    id, title, body, category, kind, priority, requires_acknowledgment,
    acknowledgment_deadline_hours, action_type, action_config, idempotency_key,
    created_by, targeting, created_at, updated_at
  ) VALUES (
    -- 2026-04-23 decoupling: requires_acknowledgment=FALSE so work items don't
    -- trigger the Mandatory Acknowledgment blocking modal. Queue filter uses
    -- category only.
    -- 2026-04-24 split: kind='work_item' keeps these out of /admin/notifications
    -- (which filters to kind='announcement'). Work items surface via dashboard
    -- widgets + super-admin digest instead.
    gen_random_uuid(), p_title, p_body, p_category, 'work_item', p_priority, FALSE,
    p_deadline_hours, 'open_url', p_action_config, p_idempotency_key,
    -- Updated: 2026-04-27 (Bug B) — canonical targeting shape is
    -- {type:'user', user_ids:[uuid]} (array). Legacy {user_id: uuid}
    -- (singular) is still accepted by fn_notification_is_for_user
    -- for unmigrated rows. Writers should ALWAYS use the array shape.
    p_target_user, jsonb_build_object('type','user','user_ids', jsonb_build_array(p_target_user)),
    NOW(), NOW()
  ) RETURNING id INTO v_notif_id;
  INSERT INTO user_notifications (id, notification_id, user_id, created_at)
  VALUES (gen_random_uuid(), v_notif_id, p_target_user, NOW());
  RETURN 1;
END $fn_create$;

-- Generator 1: overdue invoices → dashboard:escalation
CREATE OR REPLACE FUNCTION fn_generate_overdue_invoice_items()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_ovd$
DECLARE
  v_created INT := 0; v_inv RECORD; v_user RECORD; v_key TEXT;
  v_priority TEXT; v_name TEXT; v_phone TEXT;
BEGIN
  FOR v_inv IN
    SELECT bi.id, bi.institution_id, bi.student_id, bi.grand_total, bi.due_date,
           bi.invoice_number, bi.billing_period_from,
           (CURRENT_DATE - bi.due_date)::INT AS days_overdue,
           COALESCE((SELECT SUM(br.payment_amount) FROM billing_receipts br
                     WHERE br.student_id = bi.student_id
                       AND br.receipt_date >= bi.billing_period_from), 0) AS paid_since_period
    FROM billing_invoices bi
    WHERE bi.due_date < CURRENT_DATE - INTERVAL '30 days' AND bi.grand_total > 0
    ORDER BY bi.due_date ASC LIMIT 500
  LOOP
    IF v_inv.paid_since_period >= v_inv.grand_total THEN CONTINUE; END IF;
    v_priority := CASE WHEN v_inv.days_overdue > 90 THEN 'urgent'
                       WHEN v_inv.days_overdue > 60 THEN 'high' ELSE 'normal' END;
    SELECT TRIM(COALESCE(lp.first_name,'') || ' ' || COALESCE(lp.last_name,'')),
           COALESCE(lp.student_mobile, lp.father_mobile, lp.mother_mobile)
    INTO v_name, v_phone FROM learners_profiles lp WHERE lp.id = v_inv.student_id;
    IF v_name IS NULL OR v_name = '' THEN v_name := 'Student ' || v_inv.student_id::text; END IF;
    -- Updated: 2026-04-24 - Exclude super_admin from per-item fanout.
    -- Super admins receive rolled-up digests via fn_generate_super_admin_daily_digest()
    -- instead (one notification per category per day with per-college breakdown).
    FOR v_user IN
      SELECT DISTINCT p.id AS uid FROM profiles p
      WHERE p.institution_id = v_inv.institution_id
        AND p.is_super_admin = FALSE
        AND p.role IN ('director','admin','accounts','principal')
    LOOP
      v_key := 'overdue_invoice:' || v_inv.id::text || ':' || CURRENT_DATE::text
               || ':' || v_user.uid::text;
      v_created := v_created + fn_create_dashboard_work_item(
        'dashboard:escalation', v_priority,
        'Invoice ' || v_inv.invoice_number || ' overdue ' || v_inv.days_overdue || ' days — ₹' || v_inv.grand_total::text,
        v_name || ' owes ₹' || (v_inv.grand_total - v_inv.paid_since_period)::text || '. ' ||
          COALESCE('Contact: ' || v_phone, 'No phone on file.'),
        jsonb_build_object(
          'invoice_id', v_inv.id, 'student_id', v_inv.student_id,
          'amount_due', v_inv.grand_total - v_inv.paid_since_period,
          'days_overdue', v_inv.days_overdue,
          'url', '/billing/invoices/' || v_inv.id::text,
          'student_name', v_name, 'student_phone', v_phone),
        v_user.uid, v_key,
        CASE WHEN v_priority = 'urgent' THEN 24 WHEN v_priority = 'high' THEN 48 ELSE 72 END);
    END LOOP;
  END LOOP;
  RETURN v_created;
END $fn_ovd$;

-- Generator 2: stale leads → dashboard:rescue
CREATE OR REPLACE FUNCTION fn_generate_stale_lead_rescue_items()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_lead$
DECLARE
  v_created INT := 0; v_lead RECORD; v_key TEXT;
  v_target_user UUID; v_hours_stale INT;
BEGIN
  FOR v_lead IN
    SELECT al.id, al.institution_id, al.counselor_id,
           COALESCE(al.last_activity_at, al.created_at) AS last_touch,
           EXTRACT(EPOCH FROM (NOW() - COALESCE(al.last_activity_at, al.created_at)))/3600 AS hours_stale
    FROM admission_leads al
    WHERE COALESCE(al.last_activity_at, al.created_at) < NOW() - INTERVAL '24 hours'
      AND COALESCE(al.last_activity_at, al.created_at) > NOW() - INTERVAL '30 days'
    ORDER BY last_touch ASC LIMIT 300
  LOOP
    v_hours_stale := v_lead.hours_stale::INT;
    v_target_user := COALESCE(v_lead.counselor_id,
      (SELECT p.id FROM profiles p WHERE p.institution_id = v_lead.institution_id
         AND p.role IN ('admission','admin','admission_staff','super_admin') LIMIT 1));
    IF v_target_user IS NULL THEN CONTINUE; END IF;
    v_key := 'stale_lead:' || v_lead.id::text || ':' || CURRENT_DATE::text;
    v_created := v_created + fn_create_dashboard_work_item(
      'dashboard:rescue',
      CASE WHEN v_hours_stale > 72 THEN 'high' ELSE 'normal' END,
      'Lead stale for ' || v_hours_stale || 'h',
      'Lead hasn''t been touched in ' || v_hours_stale || ' hours. Call now or broadcast rescue to team.',
      jsonb_build_object('lead_id', v_lead.id, 'counselor_id', v_lead.counselor_id,
        'hours_stale', v_hours_stale, 'url', '/admission/leads/' || v_lead.id::text),
      v_target_user, v_key, 24);
  END LOOP;
  RETURN v_created;
END $fn_lead$;

-- Generator 3: pending leave applications >48h → dashboard:approval
CREATE OR REPLACE FUNCTION fn_generate_pending_leave_approval_items()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_leave$
DECLARE
  v_created INT := 0; v_leave RECORD; v_target UUID; v_key TEXT; v_hours INT;
BEGIN
  FOR v_leave IN
    SELECT la.id, la.employee_id, la.final_approver_id,
           la.start_date, la.end_date, la.total_days, la.status,
           la.created_at, la.reason, la.is_emergency,
           EXTRACT(EPOCH FROM (NOW() - la.created_at))/3600 AS hours_pending
    FROM hr_leave_applications la
    WHERE la.status = 'pending' AND la.created_at < NOW() - INTERVAL '48 hours'
      AND la.created_at > NOW() - INTERVAL '30 days' AND la.superseded_by IS NULL
    ORDER BY la.created_at ASC LIMIT 200
  LOOP
    v_target := v_leave.final_approver_id;
    IF v_target IS NULL THEN CONTINUE; END IF;
    v_hours := v_leave.hours_pending::INT;
    v_key := 'leave_pending:' || v_leave.id::text || ':' || CURRENT_DATE::text;
    v_created := v_created + fn_create_dashboard_work_item(
      'dashboard:approval',
      CASE WHEN v_leave.is_emergency THEN 'urgent' WHEN v_hours > 96 THEN 'high' ELSE 'normal' END,
      'Leave request pending ' || v_hours || 'h — ' || v_leave.total_days::text || ' day(s)',
      COALESCE(v_leave.reason, 'No reason provided') || ' | ' ||
        v_leave.start_date::text || ' to ' || v_leave.end_date::text,
      jsonb_build_object('leave_id', v_leave.id, 'employee_id', v_leave.employee_id,
        'days', v_leave.total_days, 'url', '/hr/leave/applications/' || v_leave.id::text,
        'is_emergency', v_leave.is_emergency),
      v_target, v_key, CASE WHEN v_leave.is_emergency THEN 4 ELSE 24 END);
  END LOOP;
  RETURN v_created;
END $fn_leave$;

-- Generator 4: unmarked-attendance anomaly → dashboard:anomaly
CREATE OR REPLACE FUNCTION fn_generate_unmarked_attendance_items()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_att$
DECLARE v_created INT := 0; v_tt RECORD; v_target RECORD; v_key TEXT;
BEGIN
  IF EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Kolkata')) < 11 THEN RETURN 0; END IF;
  FOR v_tt IN
    SELECT t.id, t.institution_id, t.section_id, t.timetable_name
    FROM timetables t
    WHERE t.is_active = TRUE AND t.start_date <= CURRENT_DATE
      AND (t.end_date IS NULL OR t.end_date >= CURRENT_DATE)
      AND NOT EXISTS (SELECT 1 FROM student_attendance sa
        WHERE sa.timetable_id = t.id AND sa.attendance_date = CURRENT_DATE)
      AND EXISTS (SELECT 1 FROM student_attendance sa2
        WHERE sa2.timetable_id = t.id
          AND sa2.attendance_date BETWEEN CURRENT_DATE - INTERVAL '14 days' AND CURRENT_DATE - INTERVAL '1 day')
    LIMIT 100
  LOOP
    v_key := 'unmarked_attendance:' || v_tt.id::text || ':' || CURRENT_DATE::text;
    -- 2026-04-23 targeting fix: (a) LIMIT 50 was LIMIT 5 — cut director off;
    -- (b) no DISTINCT so ORDER BY by email works; (c) prioritize by email
    -- because director's profile.role='super_admin', NOT 'director'.
    -- Updated: 2026-04-24 - Exclude super_admin from per-item fanout.
    -- Super admins receive rolled-up digests via fn_generate_super_admin_daily_digest()
    -- instead (one notification per category per day with per-college breakdown).
    FOR v_target IN
      SELECT p.id AS uid, p.email, p.institution_id AS p_inst
      FROM profiles p
      WHERE p.institution_id = v_tt.institution_id
        AND p.is_super_admin = FALSE
        AND p.role IN ('director','principal','hod','admin')
      ORDER BY
        CASE WHEN p.email = 'director@jkkn.ac.in' THEN 0
             WHEN p.institution_id = v_tt.institution_id THEN 1
             ELSE 2 END,
        p.id
      LIMIT 50
    LOOP
      v_created := v_created + fn_create_dashboard_work_item(
        'dashboard:anomaly', 'normal',
        'Attendance not marked today — ' || COALESCE(v_tt.timetable_name, 'Section timetable'),
        'No attendance rows for this timetable today as of 11am. Faculty may need a nudge.',
        jsonb_build_object('timetable_id', v_tt.id, 'section_id', v_tt.section_id,
          'url', '/academic/attendance/dashboard?timetable=' || v_tt.id::text),
        v_target.uid, v_key || ':' || v_target.uid::text, 8);
    END LOOP;
  END LOOP;
  RETURN v_created;
END $fn_att$;

-- Dispatcher: run all 4 generators, capture per-generator errors for debug
CREATE OR REPLACE FUNCTION fn_generate_all_dashboard_work_items()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_all$
DECLARE r1 INT := 0; e1 TEXT := NULL; r2 INT := 0; e2 TEXT := NULL;
        r3 INT := 0; e3 TEXT := NULL; r4 INT := 0; e4 TEXT := NULL;
BEGIN
  BEGIN r1 := fn_generate_overdue_invoice_items();        EXCEPTION WHEN OTHERS THEN e1 := SQLERRM; END;
  BEGIN r2 := fn_generate_stale_lead_rescue_items();      EXCEPTION WHEN OTHERS THEN e2 := SQLERRM; END;
  BEGIN r3 := fn_generate_pending_leave_approval_items(); EXCEPTION WHEN OTHERS THEN e3 := SQLERRM; END;
  BEGIN r4 := fn_generate_unmarked_attendance_items();    EXCEPTION WHEN OTHERS THEN e4 := SQLERRM; END;
  RETURN jsonb_build_object(
    'generated_at', NOW(),
    'overdue_invoices',    jsonb_build_object('count', r1, 'error', e1),
    'stale_leads',         jsonb_build_object('count', r2, 'error', e2),
    'pending_leaves',      jsonb_build_object('count', r3, 'error', e3),
    'unmarked_attendance', jsonb_build_object('count', r4, 'error', e4),
    'total', r1 + r2 + r3 + r4);
END $fn_all$;

REVOKE ALL ON FUNCTION fn_create_dashboard_work_item(TEXT,TEXT,TEXT,TEXT,JSONB,UUID,TEXT,INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_generate_overdue_invoice_items() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_generate_stale_lead_rescue_items() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_generate_pending_leave_approval_items() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_generate_unmarked_attendance_items() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_generate_all_dashboard_work_items() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_generate_all_dashboard_work_items() TO service_role;

-- =====================================================================
-- Updated: 2026-04-26 - Stream A: queue-generator fallback-target helper
--
-- Why: Empirical sweep on 2026-04-26 found that the per-item path of
-- two queue generators was silently dropping 100% of qualifying source
-- rows because their target FK was NULL on every row:
--   - fn_generate_recruitment_approval_items: 19 rows in window, all
--     with final_approver_id IS NULL.
--   - fn_generate_unresolved_bug_items: 221 rows in window, all with
--     assigned_to_user_id IS NULL.
-- Director's verbatim was "why 0?" — wants per-item alerts surfaced.
-- The previous design routed unassigned items to a daily digest only
-- (see comment block above the recruit/bug generators); Director's
-- direction overrides that design.
--
-- This helper returns a Director-level target (super_admin) when the
-- upstream FK is absent. Prefers super_admin in the target institution;
-- falls back to any active super_admin globally.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_resolve_dashboard_target(p_institution_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn_resolve$
DECLARE v_target UUID;
BEGIN
  -- Prefer institution-matched super_admin
  IF p_institution_id IS NOT NULL THEN
    SELECT id INTO v_target FROM profiles
    WHERE is_super_admin = TRUE
      AND institution_id = p_institution_id
      AND COALESCE(is_active, TRUE) = TRUE
    ORDER BY created_at ASC LIMIT 1;
    IF v_target IS NOT NULL THEN RETURN v_target; END IF;
  END IF;
  -- Fallback: any active super_admin (deterministic by created_at)
  SELECT id INTO v_target FROM profiles
  WHERE is_super_admin = TRUE
    AND COALESCE(is_active, TRUE) = TRUE
  ORDER BY created_at ASC LIMIT 1;
  RETURN v_target;
END $fn_resolve$;

REVOKE ALL ON FUNCTION fn_resolve_dashboard_target(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_resolve_dashboard_target(UUID) TO service_role;

-- Updated: 2026-04-23 - Add super-admin daily digest aggregator
-- Rolls up 4 dashboard categories into 1 digest notification per category per super_admin per day.
-- Idempotency key: digest:<user_id>:<category>:<YYYY-MM-DD>. Re-running cron same day is safe.
-- Skips categories with 0 qualifying items (no empty-state clutter).
-- action_type='open_url' via fn_create_dashboard_work_item + action_config.url points at
-- /admin/notifications?category=... so PR #356's UI renders an "Open Dashboard" button.
CREATE OR REPLACE FUNCTION fn_generate_super_admin_daily_digest()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_digest$
DECLARE
  v_created INT := 0;
  v_user RECORD;
  v_today TEXT := TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD');
  v_key TEXT;
  v_total INT;
  v_breakdown TEXT;
  v_body TEXT;
BEGIN
  FOR v_user IN SELECT id FROM profiles WHERE is_super_admin = TRUE LOOP

    -- Category 1: dashboard:escalation (overdue invoices >30 days, unpaid)
    WITH counts AS (
      SELECT REPLACE(REPLACE(i.name, 'JKKN College of ', ''), 'JKKN ', '') AS inst, COUNT(*) AS cnt
      FROM billing_invoices bi
      JOIN institutions i ON bi.institution_id = i.id
      WHERE bi.due_date < CURRENT_DATE - INTERVAL '30 days' AND bi.grand_total > 0
        AND COALESCE((SELECT SUM(br.payment_amount) FROM billing_receipts br
                      WHERE br.student_id = bi.student_id
                        AND br.receipt_date >= bi.billing_period_from), 0) < bi.grand_total
      GROUP BY i.id, i.name
    )
    SELECT COALESCE(SUM(cnt), 0),
           STRING_AGG(inst || ': ' || cnt, ', ' ORDER BY cnt DESC)
    INTO v_total, v_breakdown FROM counts;
    IF v_total > 0 THEN
      v_key := 'digest:' || v_user.id::text || ':dashboard:escalation:' || v_today;
      v_body := v_total || ' overdue invoice(s). ' || COALESCE(v_breakdown, '') || '.';
      v_created := v_created + fn_create_dashboard_work_item(
        'dashboard:escalation', 'high',
        'Daily digest — ' || v_total || ' overdue invoice(s)',
        v_body,
        jsonb_build_object(
          'url', '/admin/notifications?category=dashboard%3Aescalation',
          'digest', true, 'total', v_total),
        v_user.id, v_key, 24);
    END IF;

    -- Category 2: dashboard:rescue (stale admission leads untouched >24h)
    WITH counts AS (
      SELECT REPLACE(REPLACE(i.name, 'JKKN College of ', ''), 'JKKN ', '') AS inst, COUNT(*) AS cnt
      FROM admission_leads al
      JOIN institutions i ON al.institution_id = i.id
      WHERE COALESCE(al.last_activity_at, al.created_at) < NOW() - INTERVAL '24 hours'
        AND COALESCE(al.last_activity_at, al.created_at) > NOW() - INTERVAL '30 days'
      GROUP BY i.id, i.name
    )
    SELECT COALESCE(SUM(cnt), 0),
           STRING_AGG(inst || ': ' || cnt, ', ' ORDER BY cnt DESC)
    INTO v_total, v_breakdown FROM counts;
    IF v_total > 0 THEN
      v_key := 'digest:' || v_user.id::text || ':dashboard:rescue:' || v_today;
      v_body := v_total || ' stale lead(s). ' || COALESCE(v_breakdown, '') || '.';
      -- Updated: 2026-04-27 - digest URL points at filtered leads list (Agent B / digest-actionable-urls).
      -- Was meta page /admin/notifications?category=...; now the actual list with stale filter applied.
      v_created := v_created + fn_create_dashboard_work_item(
        'dashboard:rescue', 'normal',
        'Daily digest — ' || v_total || ' stale lead(s)',
        v_body,
        jsonb_build_object(
          'url', '/admission/leads?stale_min_days=30',
          'digest', true, 'total', v_total),
        v_user.id, v_key, 24);
    END IF;

    -- Category 3: dashboard:approval (pending leave applications >48h)
    WITH counts AS (
      SELECT REPLACE(REPLACE(i.name, 'JKKN College of ', ''), 'JKKN ', '') AS inst, COUNT(*) AS cnt
      FROM hr_leave_applications la
      JOIN hr_employees e ON la.employee_id = e.id
      JOIN hr_organizations o ON e.hr_organization_id = o.id
      JOIN institutions i ON o.institution_id = i.id
      WHERE la.status = 'pending'
        AND la.created_at < NOW() - INTERVAL '48 hours'
        AND la.created_at > NOW() - INTERVAL '30 days'
        AND la.superseded_by IS NULL
      GROUP BY i.id, i.name
    )
    SELECT COALESCE(SUM(cnt), 0),
           STRING_AGG(inst || ': ' || cnt, ', ' ORDER BY cnt DESC)
    INTO v_total, v_breakdown FROM counts;
    IF v_total > 0 THEN
      v_key := 'digest:' || v_user.id::text || ':dashboard:approval:' || v_today;
      v_body := v_total || ' pending leave(s). ' || COALESCE(v_breakdown, '') || '.';
      v_created := v_created + fn_create_dashboard_work_item(
        'dashboard:approval', 'normal',
        'Daily digest — ' || v_total || ' pending leave approval(s)',
        v_body,
        jsonb_build_object(
          'url', '/admin/notifications?category=dashboard%3Aapproval',
          'digest', true, 'total', v_total),
        v_user.id, v_key, 24);
    END IF;

    -- Category 4: dashboard:anomaly (timetables with no attendance today)
    WITH counts AS (
      SELECT REPLACE(REPLACE(i.name, 'JKKN College of ', ''), 'JKKN ', '') AS inst, COUNT(*) AS cnt
      FROM timetables t
      JOIN institutions i ON t.institution_id = i.id
      WHERE t.is_active = TRUE
        AND t.start_date <= CURRENT_DATE
        AND (t.end_date IS NULL OR t.end_date >= CURRENT_DATE)
        AND NOT EXISTS (SELECT 1 FROM student_attendance sa
          WHERE sa.timetable_id = t.id AND sa.attendance_date = CURRENT_DATE)
        AND EXISTS (SELECT 1 FROM student_attendance sa2
          WHERE sa2.timetable_id = t.id
            AND sa2.attendance_date BETWEEN CURRENT_DATE - INTERVAL '14 days' AND CURRENT_DATE - INTERVAL '1 day')
      GROUP BY i.id, i.name
    )
    SELECT COALESCE(SUM(cnt), 0),
           STRING_AGG(inst || ': ' || cnt, ', ' ORDER BY cnt DESC)
    INTO v_total, v_breakdown FROM counts;
    IF v_total > 0 THEN
      v_key := 'digest:' || v_user.id::text || ':dashboard:anomaly:' || v_today;
      v_body := v_total || ' timetable(s) missing attendance today. ' || COALESCE(v_breakdown, '') || '.';
      -- Updated: 2026-04-27 - digest URL points at attendance overview (Agent B / digest-actionable-urls).
      -- Was meta page /admin/notifications?category=...; now the attendance dashboard where Director can drill in.
      v_created := v_created + fn_create_dashboard_work_item(
        'dashboard:anomaly', 'normal',
        'Daily digest — ' || v_total || ' timetable(s) missing attendance',
        v_body,
        jsonb_build_object(
          'url', '/academic/attendance/dashboard',
          'digest', true, 'total', v_total),
        v_user.id, v_key, 24);
    END IF;

  END LOOP;
  RETURN v_created;
END $fn_digest$;

REVOKE ALL ON FUNCTION fn_generate_super_admin_daily_digest() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_generate_super_admin_daily_digest() TO service_role;

-- END Dashboard Work Item Generators

-- ================================================================================
-- Updated: 2026-04-22 - RPC to mirror a staff row's role_key into user_roles,
-- callable from the browser by any user with staff.create permission.
-- Solves: HOD creating staff → direct-insert succeeds → client-side
-- UserRolesService.assignRoles() fails RLS (user_roles requires roles.create).
-- SECURITY DEFINER bypasses RLS safely; authorization is enforced in-function
-- (caller must have staff.create AND target must be a staff-linked profile
-- with matching role_key, preventing drive-by role assignment).
-- ================================================================================
CREATE OR REPLACE FUNCTION public.mirror_staff_role_to_user_roles(
    p_profile_id uuid,
    p_role_key text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role_id uuid;
    v_caller uuid := auth.uid();
BEGIN
    IF NOT (is_super_admin() OR is_admin() OR user_has_permission('staff.create')) THEN
        RAISE EXCEPTION 'Insufficient permission to mirror staff role'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM staff s
        WHERE s.profile_id = p_profile_id
          AND s.role_key = p_role_key
    ) THEN
        RAISE EXCEPTION 'profile_id % is not linked to a staff row with role_key %',
            p_profile_id, p_role_key
            USING ERRCODE = '23503';
    END IF;

    SELECT id INTO v_role_id
    FROM custom_roles
    WHERE role_key = p_role_key;

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'No custom_role found for role_key %', p_role_key
            USING ERRCODE = '23503';
    END IF;

    DELETE FROM user_roles WHERE user_id = p_profile_id;

    INSERT INTO user_roles (user_id, role_id, is_primary, assigned_by)
    VALUES (p_profile_id, v_role_id, true, v_caller);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mirror_staff_role_to_user_roles(uuid, text) TO authenticated;

-- ================================================================================
-- Updated: 2026-04-27 - RPC to assign the counselor role to a user, callable from
-- the browser by any user with admission.counselors.create permission.
-- Solves: admission/admission_staff users adding counselors via UI → direct
-- user_roles INSERT silently failed RLS (requires roles.create, which admission
-- roles intentionally lack). Two counselors created on 2026-04-27 04:37 UTC
-- ended up in admission_counselors with no user_roles row because the dialog's
-- assignCounselorRole() helper never destructured {error} from the insert.
-- Mirrors mirror_staff_role_to_user_roles() (2026-04-22) for the staff flow.
-- SECURITY DEFINER bypasses RLS safely; authorization is enforced in-function
-- (caller must have admission.counselors.create AND target must have an
-- admission_counselors row, preventing drive-by role assignment).
-- ================================================================================
CREATE OR REPLACE FUNCTION public.assign_counselor_role(
    p_user_id uuid,
    p_is_primary boolean DEFAULT true
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role_id uuid;
    v_caller uuid := auth.uid();
BEGIN
    IF NOT (is_super_admin() OR is_admin() OR user_has_permission('admission.counselors.create')) THEN
        RAISE EXCEPTION 'Insufficient permission to assign counselor role'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM admission_counselors
        WHERE user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'No admission_counselors row exists for user_id %', p_user_id
            USING ERRCODE = '23503';
    END IF;

    SELECT id INTO v_role_id
    FROM custom_roles
    WHERE role_key = 'counselor';

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'No custom_role found for role_key counselor'
            USING ERRCODE = '23503';
    END IF;

    IF EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = p_user_id AND role_id = v_role_id
    ) THEN
        RETURN;
    END IF;

    -- Demote any existing primary first to avoid the partial unique index
    -- idx_user_roles_primary_unique firing before sync_primary_role_trigger
    -- can do its own AFTER-INSERT demotion.
    IF COALESCE(p_is_primary, true) = true THEN
        UPDATE user_roles
        SET is_primary = false
        WHERE user_id = p_user_id
          AND is_primary = true;
    END IF;

    INSERT INTO user_roles (user_id, role_id, is_primary, assigned_by)
    VALUES (p_user_id, v_role_id, COALESCE(p_is_primary, true), v_caller);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_counselor_role(uuid, boolean) TO authenticated;

-- =====================================================
-- validate_learner_admission_year_scope() — Added 2026-04-23
--   Patched 2026-05-16: tolerate cascade-deleted parent rows.
--   Updated 2026-06-05: admission_years is now institution-wide (program
--   scope dropped); the check is institution-only.
-- Trigger function for learners_profiles.admission_year_id (shadow FK).
-- Rejects an FK that references an admission_years row whose
-- institution_id does not match the learner.
-- Closes the cross-institution attach vector that PG FK alone cannot enforce.
-- Wired by trg_validate_learner_admission_year_scope in 04_triggers.sql.
--
-- Cascade tolerance: a cascade-deleted parent admission_years row can be
-- removed BEFORE a dependent learner update settles. Without the NOT FOUND
-- short-circuit below, the lookup fails and blocks the delete. The SET NULL
-- FK on learners_profiles.admission_year_id clears the column next in the
-- same statement, so the trigger must not raise.
-- =====================================================
CREATE OR REPLACE FUNCTION public.validate_learner_admission_year_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ay_institution_id uuid;
BEGIN
  IF NEW.admission_year_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ay.institution_id
    INTO v_ay_institution_id
  FROM public.admission_years ay
  WHERE ay.id = NEW.admission_year_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_ay_institution_id IS DISTINCT FROM NEW.institution_id THEN
    RAISE EXCEPTION
      'admission_year_id % does not match learner institution_id %',
      NEW.admission_year_id, NEW.institution_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- =====================================================================
-- Updated: 2026-04-24 - Admission lead auto-assignment to counselors
-- Context: Pre-2026-04-24 no trigger existed to route new leads to an
-- admission_counselor. Result: 492 real prospects (inbound_call/walk_in/
-- referral/website) sat with counselor_id=NULL for up to 50 days across
-- 8 colleges, plus 6,537 education_fair bulk-import leads. This trigger
-- closes the gap for all FUTURE leads. See also
-- fn_backfill_unassigned_admission_leads() for the one-time 492 catch-up.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_auto_assign_counselor()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn_aac$
DECLARE
  v_counselor_id UUID;
BEGIN
  -- Respect explicit assignments (e.g. CRM import with counselor already chosen)
  IF NEW.counselor_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Can't route without institution
  IF NEW.institution_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Pick least-loaded active counselor in the institution.
  -- Tie-break randomly so equal-load counselors distribute evenly.
  -- Wrapped in EXCEPTION so an assignment failure NEVER blocks lead creation.
  BEGIN
    SELECT c.id INTO v_counselor_id
    FROM admission_counselors c
    LEFT JOIN admission_leads al
      ON al.counselor_id = c.id
      AND al.funnel_stage NOT IN ('enrolled','confirmed','declined','withdrew','expired','lost','dormant')
    WHERE c.institution_id = NEW.institution_id
      AND c.is_active = TRUE
    GROUP BY c.id
    ORDER BY COUNT(al.id) ASC, RANDOM()
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_counselor_id := NULL;
  END;

  IF v_counselor_id IS NOT NULL THEN
    NEW.counselor_id := v_counselor_id;
  END IF;
  -- If still NULL: lead lands with counselor_id=NULL, funnel_stage='new'.
  -- Those rows surface in v_institutions_needing_admission_counselors (05_views.sql)
  -- so Director can see which colleges need staffing.

  RETURN NEW;
END $fn_aac$;

REVOKE ALL ON FUNCTION fn_auto_assign_counselor() FROM PUBLIC, anon, authenticated;
-- Trigger fires via table OWNER permissions; service_role grant for completeness.
GRANT EXECUTE ON FUNCTION fn_auto_assign_counselor() TO service_role;

-- One-shot backfill for the 492 real prospects (inbound_call/walk_in/referral/website/other).
-- DELIBERATELY EXCLUDES source='education_fair' (6,537 one-day expo dump — needs
-- separate audit by Director before bulk-assigning).
CREATE OR REPLACE FUNCTION fn_backfill_unassigned_admission_leads()
RETURNS TABLE (
  lead_id UUID,
  institution_id UUID,
  source TEXT,
  assigned_to UUID,
  status TEXT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn_bfa$
DECLARE
  v_lead RECORD;
  v_counselor_id UUID;
BEGIN
  -- Access-controlled via REVOKE PUBLIC/anon/authenticated + GRANT service_role.
  -- No auth.uid() check because Management API callers are already service_role.
  FOR v_lead IN
    SELECT al.id, al.institution_id, al.source
    FROM admission_leads al
    WHERE al.counselor_id IS NULL
      AND al.funnel_stage = 'new'
      AND al.source IN ('inbound_call','walk_in','referral','website','other')
    ORDER BY al.created_at ASC
  LOOP
    -- Same assignment logic as the trigger
    SELECT c.id INTO v_counselor_id
    FROM admission_counselors c
    LEFT JOIN admission_leads al2
      ON al2.counselor_id = c.id
      AND al2.funnel_stage NOT IN ('enrolled','confirmed','declined','withdrew','expired','lost','dormant')
    WHERE c.institution_id = v_lead.institution_id
      AND c.is_active = TRUE
    GROUP BY c.id
    ORDER BY COUNT(al2.id) ASC, RANDOM()
    LIMIT 1;

    IF v_counselor_id IS NOT NULL THEN
      UPDATE admission_leads
      SET counselor_id = v_counselor_id
      WHERE id = v_lead.id;
      RETURN QUERY SELECT v_lead.id, v_lead.institution_id, v_lead.source::TEXT, v_counselor_id, 'assigned'::TEXT;
    ELSE
      -- No UPDATE needed: the row stays counselor_id=NULL, already surfaces
      -- in v_institutions_needing_admission_counselors.
      RETURN QUERY SELECT v_lead.id, v_lead.institution_id, v_lead.source::TEXT, NULL::UUID, 'no_counselor_in_institution'::TEXT;
    END IF;
  END LOOP;
END $fn_bfa$;

REVOKE ALL ON FUNCTION fn_backfill_unassigned_admission_leads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_backfill_unassigned_admission_leads() TO service_role;

-- ===================================================================
-- 2026-04-25: Migration RPC for pre-registered → auth-linked profile swap.
-- Encapsulates the full dance to convert a stub pre-registered profile
-- (created by sync_staff_to_profiles) into a real auth.users-linked profile
-- after a Google OAuth login. Called from app/auth/callback/route.ts.
-- ===================================================================
CREATE OR REPLACE FUNCTION public.migrate_pre_registered_profile_to_auth(
  p_old_profile_id uuid,
  p_new_auth_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func_migrate_prereg$
DECLARE
  v_old public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_old FROM public.profiles WHERE id = p_old_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source profile not found: %', p_old_profile_id;
  END IF;

  CREATE TEMP TABLE _migrate_user_roles ON COMMIT DROP AS
    SELECT role_id, is_primary, assigned_at, assigned_by
      FROM public.user_roles WHERE user_id = p_old_profile_id;

  CREATE TEMP TABLE _migrate_staff_ids ON COMMIT DROP AS
    SELECT id FROM public.staff WHERE profile_id = p_old_profile_id;

  ALTER TABLE public.staff DISABLE TRIGGER trg_sync_staff_to_profiles;

  UPDATE public.staff SET profile_id = NULL WHERE profile_id = p_old_profile_id;

  DELETE FROM public.profiles WHERE id = p_old_profile_id;

  INSERT INTO public.profiles (
    id, email, full_name, phone_number, role, gender, designation,
    avatar_url, profile_completed, is_active, is_pre_registered,
    bio, institution_id, department_id, learner_id
  ) VALUES (
    p_new_auth_id, v_old.email, v_old.full_name, v_old.phone_number,
    v_old.role, v_old.gender, v_old.designation, v_old.avatar_url,
    true, COALESCE(v_old.is_active, true), false,
    v_old.bio, v_old.institution_id, v_old.department_id, v_old.learner_id
  );

  UPDATE public.staff SET profile_id = p_new_auth_id
   WHERE id IN (SELECT id FROM _migrate_staff_ids);

  INSERT INTO public.user_roles (user_id, role_id, is_primary, assigned_at, assigned_by)
    SELECT p_new_auth_id, role_id, is_primary, assigned_at, assigned_by
      FROM _migrate_user_roles;

  ALTER TABLE public.staff ENABLE TRIGGER trg_sync_staff_to_profiles;
END;
$func_migrate_prereg$;

GRANT EXECUTE ON FUNCTION public.migrate_pre_registered_profile_to_auth(uuid, uuid)
  TO service_role;

-- =====================================================================
-- Updated: 2026-04-25 - Wire chat-bypass approval categories into the
-- decision queue. Three new generators (recruitment, service_requests,
-- unresolved bugs) emit dashboard:* notifications. Super-admin (Director)
-- targeting handled via the daily-digest aggregator extension below;
-- per-item targets are non-super-admin approvers (mirrors the
-- 2026-04-24 fanout-exclude pattern in fn_generate_overdue_invoice_items).
--
-- Filter design notes:
--   - Recruitment: status='pending_approval' AND submitted >24h ago.
--   - Service requests: status IN (submitted,in_review,returned)
--     AND submitted >24h ago. Approver routing via
--     service_request_approval_steps.approver_user_ids array on the
--     current step (returned -> requester).
--   - Unresolved bugs: ALL bugs are priority='medium' so the brief's
--     high/critical filter doesn't apply. Option A (chosen 2026-04-25):
--     status='new' AND age >72h AND triage tag NOT IN excluded set
--     (excludes not_a_bug/duplicate/content_only/obsolete/feature_request).
--     Per-item path requires assigned_to_user_id; the bulk untriaged
--     load surfaces to Director via digest only.
-- =====================================================================

-- Generator 5: recruitment approvals -> dashboard:approval
-- Updated: 2026-04-26 - Stream A: fallback-target. Was silently skipping
-- all 19 rows with NULL final_approver_id; now routes to Director.
-- Removed the "skip if super_admin" filter — queue surface IS Director's
-- so super_admin-targeted items SHOULD appear there.
CREATE OR REPLACE FUNCTION fn_generate_recruitment_approval_items()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_recruit$
DECLARE
  v_created INT := 0; v_cand RECORD; v_key TEXT; v_priority TEXT; v_target UUID;
BEGIN
  FOR v_cand IN
    SELECT id, name, role_title, role_category, final_approver_id, submitted_at,
           is_emergency, is_internal_transfer, institution_id,
           EXTRACT(EPOCH FROM (NOW() - submitted_at))/3600 AS hours_pending
    FROM hr_recruitment_candidates
    WHERE status = 'pending_approval'
      AND submitted_at < NOW() - INTERVAL '24 hours'
      AND submitted_at > NOW() - INTERVAL '90 days'
    ORDER BY submitted_at ASC
    LIMIT 100
  LOOP
    -- Fallback: route to Director when upstream HR didn't set final_approver_id.
    v_target := COALESCE(v_cand.final_approver_id, fn_resolve_dashboard_target(v_cand.institution_id));
    IF v_target IS NULL THEN CONTINUE; END IF;  -- truly no super_admin exists; cannot route
    v_priority := CASE WHEN v_cand.is_emergency THEN 'urgent'
                       WHEN v_cand.hours_pending > 96 THEN 'high'
                       ELSE 'normal' END;
    v_key := 'recruitment:' || v_cand.id::text || ':' || CURRENT_DATE::text;
    v_created := v_created + fn_create_dashboard_work_item(
      'dashboard:approval', v_priority,
      'Recruitment approval pending ' || v_cand.hours_pending::INT || 'h — ' || v_cand.role_title,
      v_cand.name || ' (' || v_cand.role_category || ')' ||
        CASE WHEN v_cand.is_internal_transfer THEN ' — internal transfer' ELSE '' END ||
        CASE WHEN v_cand.final_approver_id IS NULL THEN ' — UNASSIGNED, routed to Director' ELSE '' END,
      jsonb_build_object('candidate_id', v_cand.id, 'role_title', v_cand.role_title,
        'is_emergency', v_cand.is_emergency,
        'unassigned_fallback', v_cand.final_approver_id IS NULL,
        'url', '/hr/recruitment/candidates/' || v_cand.id::text),
      v_target, v_key,
      CASE WHEN v_cand.is_emergency THEN 8 ELSE 48 END);
  END LOOP;
  RETURN v_created;
END $fn_recruit$;

-- Generator 6: service-request approvals -> dashboard:approval
CREATE OR REPLACE FUNCTION fn_generate_service_request_approval_items()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_sr$
DECLARE
  v_created INT := 0; v_sr RECORD; v_key TEXT; v_priority TEXT;
  v_approver UUID; v_step_approvers UUID[];
BEGIN
  FOR v_sr IN
    SELECT sr.id, sr.request_number, sr.service_type_id, sr.requester_id,
           sr.status::text AS status_text, sr.priority::text AS priority_text,
           sr.current_approval_step, sr.submitted_at,
           st.name AS service_type_name,
           EXTRACT(EPOCH FROM (NOW() - COALESCE(sr.submitted_at, sr.created_at)))/3600 AS hours_pending
    FROM service_requests sr
    JOIN service_types st ON st.id = sr.service_type_id
    WHERE sr.status::text IN ('submitted','in_review','returned')
      AND COALESCE(sr.submitted_at, sr.created_at) < NOW() - INTERVAL '24 hours'
      AND COALESCE(sr.submitted_at, sr.created_at) > NOW() - INTERVAL '180 days'
    ORDER BY sr.submitted_at ASC NULLS LAST
    LIMIT 100
  LOOP
    IF v_sr.status_text = 'returned' THEN
      v_step_approvers := ARRAY[v_sr.requester_id];
    ELSE
      SELECT approver_user_ids INTO v_step_approvers
      FROM service_request_approval_steps
      WHERE service_type_id = v_sr.service_type_id
        AND step_order = COALESCE(v_sr.current_approval_step, 1);
    END IF;
    IF v_step_approvers IS NULL OR array_length(v_step_approvers, 1) IS NULL THEN CONTINUE; END IF;
    v_priority := CASE WHEN v_sr.hours_pending > 168 THEN 'high'
                       WHEN v_sr.priority_text = 'urgent' THEN 'urgent'
                       ELSE 'normal' END;
    v_key := 'service_request:' || v_sr.id::text || ':' || CURRENT_DATE::text;
    FOREACH v_approver IN ARRAY v_step_approvers
    LOOP
      IF EXISTS (SELECT 1 FROM profiles WHERE id = v_approver AND is_super_admin = TRUE) THEN
        CONTINUE;
      END IF;
      v_created := v_created + fn_create_dashboard_work_item(
        'dashboard:approval', v_priority,
        'SR ' || v_sr.request_number || ' — ' || v_sr.service_type_name || ' (' || v_sr.status_text || ')',
        v_sr.service_type_name || ' pending ' || v_sr.hours_pending::INT || 'h. Step ' || COALESCE(v_sr.current_approval_step,1)::text,
        jsonb_build_object('service_request_id', v_sr.id, 'request_number', v_sr.request_number,
          'service_type_id', v_sr.service_type_id, 'status', v_sr.status_text,
          'url', '/services/requests/' || v_sr.id::text),
        v_approver, v_key || ':' || v_approver::text, 72);
    END LOOP;
  END LOOP;
  RETURN v_created;
END $fn_sr$;

-- Generator 7: unresolved untriaged bugs >72h -> dashboard:rescue
-- Updated: 2026-04-26 - Stream A: fallback-target. Was silently skipping
-- all 221 rows with NULL assigned_to_user_id; now routes to Director.
-- Removed the "skip if super_admin" filter for symmetry with recruit fix.
-- Bulk untriaged backlog still surfaces to Director via daily digest below.
CREATE OR REPLACE FUNCTION fn_generate_unresolved_bug_items()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_bug$
DECLARE
  v_created INT := 0; v_bug RECORD; v_key TEXT; v_target UUID;
  v_age_days INT; v_priority TEXT;
BEGIN
  FOR v_bug IN
    SELECT id, display_id, page_url, description, priority,
           assigned_to_user_id, institution_id, module_name,
           EXTRACT(EPOCH FROM (NOW() - created_at))/3600 AS hours_old
    FROM bug_reports
    WHERE status = 'new'
      AND created_at < NOW() - INTERVAL '72 hours'
      AND created_at > NOW() - INTERVAL '180 days'
      AND COALESCE(metadata->'triage'->>'tag', '')
        NOT IN ('not_a_bug','duplicate','content_only','obsolete','feature_request')
    ORDER BY created_at ASC
    LIMIT 100
  LOOP
    -- Fallback: route to Director when bug-report intake didn't set assigned_to_user_id.
    v_target := COALESCE(v_bug.assigned_to_user_id, fn_resolve_dashboard_target(v_bug.institution_id));
    IF v_target IS NULL THEN CONTINUE; END IF;  -- truly no super_admin exists; cannot route
    v_age_days := (v_bug.hours_old/24)::INT;
    v_priority := CASE WHEN v_age_days > 14 THEN 'high' ELSE 'normal' END;
    v_key := 'unresolved_bug:' || v_bug.id::text || ':' || CURRENT_DATE::text;
    v_created := v_created + fn_create_dashboard_work_item(
      'dashboard:rescue', v_priority,
      'Bug ' || COALESCE(v_bug.display_id, SUBSTR(v_bug.id::text, 1, 8)) || ' aging ' || v_age_days || 'd',
      LEFT(v_bug.description, 140) || ' | ' || COALESCE(v_bug.module_name, 'unknown module') ||
        CASE WHEN v_bug.assigned_to_user_id IS NULL THEN ' — UNASSIGNED, routed to Director' ELSE '' END,
      jsonb_build_object('bug_id', v_bug.id, 'display_id', v_bug.display_id,
        'module', v_bug.module_name,
        'unassigned_fallback', v_bug.assigned_to_user_id IS NULL,
        'url', '/bug-reports/' || v_bug.id::text),
      v_target, v_key, 72);
  END LOOP;
  RETURN v_created;
END $fn_bug$;

REVOKE ALL ON FUNCTION fn_generate_recruitment_approval_items() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_generate_service_request_approval_items() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_generate_unresolved_bug_items() FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- Updated: 2026-04-26 - Stream D-2: grievance ticket queue generator
--
-- Source: public.grievance_tickets (verified existing schema, 0 rows on
-- prod 2026-04-26 — generator is prophylactic, will start emitting once
-- IQAC grievance flow accumulates submissions).
--
-- Predicate: status IN ('open','assigned','in_progress','escalated')
-- AND withdrawn_at IS NULL AND resolved_at IS NULL
-- AND (sla_deadline < NOW() OR escalation_level > 0 OR is_emergency).
--
-- Target: assigned_to (uuid, nullable on schema). Falls back to Director
-- via fn_resolve_dashboard_target() when unassigned, matching the
-- Stream A pattern for symmetry.
--
-- Idempotency key: grievance_ticket:<id>:<CURRENT_DATE>
-- Category: dashboard:approval (per /cnext brief).
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_generate_unresolved_grievance_items()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_griev$
DECLARE
  v_created INT := 0; v_griev RECORD; v_key TEXT; v_target UUID;
  v_priority TEXT; v_hours_past_sla INT;
BEGIN
  FOR v_griev IN
    SELECT id, ticket_number, subject, description, institution_id,
           priority, status, sla_deadline, sla_status, escalation_level,
           is_emergency, assigned_to,
           CASE WHEN sla_deadline IS NOT NULL
                THEN EXTRACT(EPOCH FROM (NOW() - sla_deadline))/3600
                ELSE 0 END AS hours_past_sla
    FROM grievance_tickets
    WHERE status IN ('open','assigned','in_progress','escalated')
      AND created_at > NOW() - INTERVAL '90 days'
      AND (sla_deadline < NOW() OR escalation_level > 0 OR is_emergency = TRUE)
      AND withdrawn_at IS NULL
      AND resolved_at IS NULL
    ORDER BY escalation_level DESC NULLS LAST, sla_deadline ASC NULLS LAST
    LIMIT 50
  LOOP
    v_target := COALESCE(v_griev.assigned_to, fn_resolve_dashboard_target(v_griev.institution_id));
    IF v_target IS NULL THEN CONTINUE; END IF;
    v_hours_past_sla := v_griev.hours_past_sla::INT;
    v_priority := CASE
      WHEN v_griev.is_emergency THEN 'urgent'
      WHEN v_griev.escalation_level >= 2 THEN 'urgent'
      WHEN v_griev.escalation_level = 1 THEN 'high'
      WHEN v_hours_past_sla > 24 THEN 'high'
      ELSE 'normal'
    END;
    v_key := 'grievance_ticket:' || v_griev.id::text || ':' || CURRENT_DATE::text;
    v_created := v_created + fn_create_dashboard_work_item(
      'dashboard:approval', v_priority,
      'Grievance ' || v_griev.ticket_number || ' — ' || LEFT(v_griev.subject, 80),
      LEFT(v_griev.description, 140) ||
        CASE WHEN v_griev.escalation_level > 0 THEN ' | escalated L' || v_griev.escalation_level::text ELSE '' END ||
        CASE WHEN v_griev.sla_deadline < NOW() THEN ' | SLA breached ' || v_hours_past_sla::text || 'h' ELSE '' END ||
        CASE WHEN v_griev.assigned_to IS NULL THEN ' | UNASSIGNED, routed to Director' ELSE '' END,
      jsonb_build_object(
        'grievance_id', v_griev.id,
        'ticket_number', v_griev.ticket_number,
        'escalation_level', v_griev.escalation_level,
        'sla_breached', (v_griev.sla_deadline < NOW()),
        'is_emergency', v_griev.is_emergency,
        'unassigned_fallback', v_griev.assigned_to IS NULL,
        'url', '/grievances/' || v_griev.id::text
      ),
      v_target, v_key,
      CASE WHEN v_griev.is_emergency OR v_griev.escalation_level >= 2 THEN 4 ELSE 24 END
    );
  END LOOP;
  RETURN v_created;
END $fn_griev$;

REVOKE ALL ON FUNCTION fn_generate_unresolved_grievance_items() FROM PUBLIC, anon, authenticated;

-- Updated: 2026-04-26 - Wire grievance generator into orchestrator (Stream D-2).
CREATE OR REPLACE FUNCTION fn_generate_all_dashboard_work_items()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_all$
DECLARE r1 INT := 0; e1 TEXT := NULL; r2 INT := 0; e2 TEXT := NULL;
        r3 INT := 0; e3 TEXT := NULL; r4 INT := 0; e4 TEXT := NULL;
        r5 INT := 0; e5 TEXT := NULL; r6 INT := 0; e6 TEXT := NULL;
        r7 INT := 0; e7 TEXT := NULL; r8 INT := 0; e8 TEXT := NULL;
BEGIN
  BEGIN r1 := fn_generate_overdue_invoice_items();              EXCEPTION WHEN OTHERS THEN e1 := SQLERRM; END;
  BEGIN r2 := fn_generate_stale_lead_rescue_items();            EXCEPTION WHEN OTHERS THEN e2 := SQLERRM; END;
  BEGIN r3 := fn_generate_pending_leave_approval_items();       EXCEPTION WHEN OTHERS THEN e3 := SQLERRM; END;
  BEGIN r4 := fn_generate_unmarked_attendance_items();          EXCEPTION WHEN OTHERS THEN e4 := SQLERRM; END;
  BEGIN r5 := fn_generate_recruitment_approval_items();         EXCEPTION WHEN OTHERS THEN e5 := SQLERRM; END;
  BEGIN r6 := fn_generate_service_request_approval_items();     EXCEPTION WHEN OTHERS THEN e6 := SQLERRM; END;
  BEGIN r7 := fn_generate_unresolved_bug_items();               EXCEPTION WHEN OTHERS THEN e7 := SQLERRM; END;
  BEGIN r8 := fn_generate_unresolved_grievance_items();         EXCEPTION WHEN OTHERS THEN e8 := SQLERRM; END;
  RETURN jsonb_build_object(
    'generated_at', NOW(),
    'overdue_invoices',      jsonb_build_object('count', r1, 'error', e1),
    'stale_leads',           jsonb_build_object('count', r2, 'error', e2),
    'pending_leaves',        jsonb_build_object('count', r3, 'error', e3),
    'unmarked_attendance',   jsonb_build_object('count', r4, 'error', e4),
    'recruitment_approvals', jsonb_build_object('count', r5, 'error', e5),
    'service_requests',      jsonb_build_object('count', r6, 'error', e6),
    'unresolved_bugs',       jsonb_build_object('count', r7, 'error', e7),
    'grievances',            jsonb_build_object('count', r8, 'error', e8),
    'total', r1 + r2 + r3 + r4 + r5 + r6 + r7 + r8);
END $fn_all$;

REVOKE ALL ON FUNCTION fn_generate_all_dashboard_work_items() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_generate_all_dashboard_work_items() TO service_role;

-- Updated: 2026-04-26 - Stream C: event proposal queue generator.
-- Surfaces pending event_proposals to the Director dashboard after a 4-hour
-- grace window. Urgency tiers: event in ≤3 days → urgent; pending >48h → high.
-- Idempotency key: event_proposal:<id>:<CURRENT_DATE>
-- Routes via fn_resolve_dashboard_target (super_admin fallback from Stream A).
CREATE OR REPLACE FUNCTION fn_generate_event_proposal_items()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_evt$
DECLARE
  v_created INT := 0; v_evt RECORD; v_key TEXT; v_target UUID;
BEGIN
  FOR v_evt IN
    SELECT id, title, event_date, venue, proposer_id, institution_id,
           EXTRACT(EPOCH FROM (NOW() - created_at))/3600 AS hours_pending
    FROM event_proposals
    WHERE status IN ('submitted','reviewing')
      AND created_at < NOW() - INTERVAL '4 hours'
      AND created_at > NOW() - INTERVAL '60 days'
    ORDER BY event_date ASC NULLS LAST, created_at ASC
    LIMIT 50
  LOOP
    -- Always route to Director (super_admin) since events propose flow is Director-approved
    v_target := fn_resolve_dashboard_target(v_evt.institution_id);
    IF v_target IS NULL THEN CONTINUE; END IF;
    v_key := 'event_proposal:' || v_evt.id::text || ':' || CURRENT_DATE::text;
    v_created := v_created + fn_create_dashboard_work_item(
      'dashboard:approval',
      CASE WHEN v_evt.event_date <= CURRENT_DATE + 3 THEN 'urgent'
           WHEN v_evt.hours_pending > 48 THEN 'high'
           ELSE 'normal' END,
      'Event proposal: ' || v_evt.title,
      'Venue: ' || COALESCE(v_evt.venue, 'TBD') || ' | Date: ' || COALESCE(v_evt.event_date::text, 'TBD'),
      jsonb_build_object('proposal_id', v_evt.id, 'title', v_evt.title,
        'url', '/events/propose/' || v_evt.id::text || '/status'),
      v_target, v_key,
      CASE WHEN v_evt.event_date <= CURRENT_DATE + 3 THEN 4 ELSE 24 END
    );
  END LOOP;
  RETURN v_created;
END $fn_evt$;

REVOKE ALL ON FUNCTION fn_generate_event_proposal_items() FROM PUBLIC, anon, authenticated;

-- Updated: 2026-04-26 - Wire event proposal generator into orchestrator (Stream C).
CREATE OR REPLACE FUNCTION fn_generate_all_dashboard_work_items()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_all$
DECLARE r1 INT := 0; e1 TEXT := NULL; r2 INT := 0; e2 TEXT := NULL;
        r3 INT := 0; e3 TEXT := NULL; r4 INT := 0; e4 TEXT := NULL;
        r5 INT := 0; e5 TEXT := NULL; r6 INT := 0; e6 TEXT := NULL;
        r7 INT := 0; e7 TEXT := NULL; r8 INT := 0; e8 TEXT := NULL;
        r9 INT := 0; e9 TEXT := NULL;
BEGIN
  BEGIN r1 := fn_generate_overdue_invoice_items();              EXCEPTION WHEN OTHERS THEN e1 := SQLERRM; END;
  BEGIN r2 := fn_generate_stale_lead_rescue_items();            EXCEPTION WHEN OTHERS THEN e2 := SQLERRM; END;
  BEGIN r3 := fn_generate_pending_leave_approval_items();       EXCEPTION WHEN OTHERS THEN e3 := SQLERRM; END;
  BEGIN r4 := fn_generate_unmarked_attendance_items();          EXCEPTION WHEN OTHERS THEN e4 := SQLERRM; END;
  BEGIN r5 := fn_generate_recruitment_approval_items();         EXCEPTION WHEN OTHERS THEN e5 := SQLERRM; END;
  BEGIN r6 := fn_generate_service_request_approval_items();     EXCEPTION WHEN OTHERS THEN e6 := SQLERRM; END;
  BEGIN r7 := fn_generate_unresolved_bug_items();               EXCEPTION WHEN OTHERS THEN e7 := SQLERRM; END;
  BEGIN r8 := fn_generate_unresolved_grievance_items();         EXCEPTION WHEN OTHERS THEN e8 := SQLERRM; END;
  BEGIN r9 := fn_generate_event_proposal_items();               EXCEPTION WHEN OTHERS THEN e9 := SQLERRM; END;
  RETURN jsonb_build_object(
    'generated_at', NOW(),
    'overdue_invoices',      jsonb_build_object('count', r1, 'error', e1),
    'stale_leads',           jsonb_build_object('count', r2, 'error', e2),
    'pending_leaves',        jsonb_build_object('count', r3, 'error', e3),
    'unmarked_attendance',   jsonb_build_object('count', r4, 'error', e4),
    'recruitment_approvals', jsonb_build_object('count', r5, 'error', e5),
    'service_requests',      jsonb_build_object('count', r6, 'error', e6),
    'unresolved_bugs',       jsonb_build_object('count', r7, 'error', e7),
    'grievances',            jsonb_build_object('count', r8, 'error', e8),
    'event_proposals',       jsonb_build_object('count', r9, 'error', e9),
    'total', r1 + r2 + r3 + r4 + r5 + r6 + r7 + r8 + r9);
END $fn_all$;

REVOKE ALL ON FUNCTION fn_generate_all_dashboard_work_items() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_generate_all_dashboard_work_items() TO service_role;

-- Updated: 2026-04-25 - Extend super-admin daily digest with 3 new categories.
-- Director (super_admin) sees one rolled-up row per category per day in the queue.
-- Combines pending leaves + recruitment + service requests under dashboard:approval.
-- Adds untriaged-bugs aggregation under dashboard:anomaly.
CREATE OR REPLACE FUNCTION fn_generate_super_admin_daily_digest()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_digest$
DECLARE
  v_created INT := 0;
  v_user RECORD;
  v_today TEXT := TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD');
  v_key TEXT;
  v_total INT;
  v_breakdown TEXT;
  v_body TEXT;
BEGIN
  FOR v_user IN SELECT id FROM profiles WHERE is_super_admin = TRUE LOOP

    -- Category 1: dashboard:escalation (overdue invoices >30 days, unpaid)
    WITH counts AS (
      SELECT REPLACE(REPLACE(i.name, 'JKKN College of ', ''), 'JKKN ', '') AS inst, COUNT(*) AS cnt
      FROM billing_invoices bi
      JOIN institutions i ON bi.institution_id = i.id
      WHERE bi.due_date < CURRENT_DATE - INTERVAL '30 days' AND bi.grand_total > 0
        AND COALESCE((SELECT SUM(br.payment_amount) FROM billing_receipts br
                      WHERE br.student_id = bi.student_id
                        AND br.receipt_date >= bi.billing_period_from), 0) < bi.grand_total
      GROUP BY i.id, i.name
    )
    SELECT COALESCE(SUM(cnt), 0),
           STRING_AGG(inst || ': ' || cnt, ', ' ORDER BY cnt DESC)
    INTO v_total, v_breakdown FROM counts;
    IF v_total > 0 THEN
      v_key := 'digest:' || v_user.id::text || ':dashboard:escalation:' || v_today;
      v_body := v_total || ' overdue invoice(s). ' || COALESCE(v_breakdown, '') || '.';
      v_created := v_created + fn_create_dashboard_work_item(
        'dashboard:escalation', 'high',
        'Daily digest — ' || v_total || ' overdue invoice(s)',
        v_body,
        jsonb_build_object('url', '/admin/notifications?category=dashboard%3Aescalation',
          'digest', true, 'total', v_total),
        v_user.id, v_key, 24);
    END IF;

    -- Category 2: dashboard:rescue (stale admission leads untouched >24h)
    WITH counts AS (
      SELECT REPLACE(REPLACE(i.name, 'JKKN College of ', ''), 'JKKN ', '') AS inst, COUNT(*) AS cnt
      FROM admission_leads al
      JOIN institutions i ON al.institution_id = i.id
      WHERE COALESCE(al.last_activity_at, al.created_at) < NOW() - INTERVAL '24 hours'
        AND COALESCE(al.last_activity_at, al.created_at) > NOW() - INTERVAL '30 days'
      GROUP BY i.id, i.name
    )
    SELECT COALESCE(SUM(cnt), 0),
           STRING_AGG(inst || ': ' || cnt, ', ' ORDER BY cnt DESC)
    INTO v_total, v_breakdown FROM counts;
    IF v_total > 0 THEN
      v_key := 'digest:' || v_user.id::text || ':dashboard:rescue:' || v_today;
      v_body := v_total || ' stale lead(s). ' || COALESCE(v_breakdown, '') || '.';
      -- Updated: 2026-04-27 - digest URL points at filtered leads list (Agent B / digest-actionable-urls).
      -- Was meta page /admin/notifications?category=...; now the actual list with stale filter applied.
      v_created := v_created + fn_create_dashboard_work_item(
        'dashboard:rescue', 'normal',
        'Daily digest — ' || v_total || ' stale lead(s)',
        v_body,
        jsonb_build_object('url', '/admission/leads?stale_min_days=30',
          'digest', true, 'total', v_total),
        v_user.id, v_key, 24);
    END IF;

    -- Category 3: dashboard:approval (pending leaves >48h + recruitment + SR)
    WITH leave_counts AS (
      SELECT 'leaves' AS src, COUNT(*) AS cnt
      FROM hr_leave_applications la
      WHERE la.status = 'pending' AND la.created_at < NOW() - INTERVAL '48 hours'
        AND la.created_at > NOW() - INTERVAL '30 days' AND la.superseded_by IS NULL
    ),
    recruit_counts AS (
      SELECT 'recruitment' AS src, COUNT(*) AS cnt
      FROM hr_recruitment_candidates
      WHERE status = 'pending_approval' AND submitted_at < NOW() - INTERVAL '24 hours'
        AND submitted_at > NOW() - INTERVAL '90 days'
    ),
    sr_counts AS (
      SELECT 'service_requests' AS src, COUNT(*) AS cnt
      FROM service_requests sr
      WHERE sr.status::text IN ('submitted','in_review','returned')
        AND COALESCE(sr.submitted_at, sr.created_at) < NOW() - INTERVAL '24 hours'
        AND COALESCE(sr.submitted_at, sr.created_at) > NOW() - INTERVAL '180 days'
    ),
    all_counts AS (
      SELECT src, cnt FROM leave_counts WHERE cnt > 0
      UNION ALL SELECT src, cnt FROM recruit_counts WHERE cnt > 0
      UNION ALL SELECT src, cnt FROM sr_counts WHERE cnt > 0
    )
    SELECT COALESCE(SUM(cnt), 0),
           STRING_AGG(src || ': ' || cnt, ', ' ORDER BY cnt DESC)
    INTO v_total, v_breakdown FROM all_counts;
    IF v_total > 0 THEN
      v_key := 'digest:' || v_user.id::text || ':dashboard:approval:' || v_today;
      v_body := v_total || ' approval(s) pending. ' || COALESCE(v_breakdown, '') || '.';
      v_created := v_created + fn_create_dashboard_work_item(
        'dashboard:approval', 'normal',
        'Daily digest — ' || v_total || ' approval(s) pending',
        v_body,
        jsonb_build_object('url', '/admin/notifications?category=dashboard%3Aapproval',
          'digest', true, 'total', v_total),
        v_user.id, v_key, 24);
    END IF;

    -- Category 4: dashboard:anomaly (unmarked attendance + untriaged bugs >72h)
    WITH attn AS (
      SELECT 'unmarked_attendance' AS src, COUNT(*) AS cnt
      FROM timetables t
      WHERE t.is_active = TRUE AND t.start_date <= CURRENT_DATE
        AND (t.end_date IS NULL OR t.end_date >= CURRENT_DATE)
        AND NOT EXISTS (SELECT 1 FROM student_attendance sa
          WHERE sa.timetable_id = t.id AND sa.attendance_date = CURRENT_DATE)
        AND EXISTS (SELECT 1 FROM student_attendance sa2
          WHERE sa2.timetable_id = t.id
            AND sa2.attendance_date BETWEEN CURRENT_DATE - INTERVAL '14 days' AND CURRENT_DATE - INTERVAL '1 day')
    ),
    bugs AS (
      SELECT 'untriaged_bugs' AS src, COUNT(*) AS cnt
      FROM bug_reports
      WHERE status = 'new'
        AND created_at < NOW() - INTERVAL '72 hours'
        AND created_at > NOW() - INTERVAL '180 days'
        AND COALESCE(metadata->'triage'->>'tag', '')
          NOT IN ('not_a_bug','duplicate','content_only','obsolete','feature_request')
    ),
    all_anomaly AS (
      SELECT src, cnt FROM attn WHERE cnt > 0
      UNION ALL SELECT src, cnt FROM bugs WHERE cnt > 0
    )
    SELECT COALESCE(SUM(cnt), 0),
           STRING_AGG(src || ': ' || cnt, ', ' ORDER BY cnt DESC)
    INTO v_total, v_breakdown FROM all_anomaly;
    IF v_total > 0 THEN
      v_key := 'digest:' || v_user.id::text || ':dashboard:anomaly:' || v_today;
      v_body := v_total || ' anomaly signal(s). ' || COALESCE(v_breakdown, '') || '.';
      -- Updated: 2026-04-27 - digest URL points at attendance overview (Agent B / digest-actionable-urls).
      -- Was meta page /admin/notifications?category=...; now the attendance dashboard where Director can drill in.
      -- Body is multi-source (attendance + bugs); attendance dashboard chosen as the dominant signal landing page.
      v_created := v_created + fn_create_dashboard_work_item(
        'dashboard:anomaly', 'normal',
        'Daily digest — ' || v_total || ' anomaly signal(s)',
        v_body,
        jsonb_build_object('url', '/academic/attendance/dashboard',
          'digest', true, 'total', v_total),
        v_user.id, v_key, 24);
    END IF;

  END LOOP;
  RETURN v_created;
END $fn_digest$;

REVOKE ALL ON FUNCTION fn_generate_super_admin_daily_digest() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_generate_super_admin_daily_digest() TO service_role;

-- Updated: 2026-04-25 - decisions-spec.md v1.0 Sprint 0
-- Trigger function to keep director_decisions.updated_at fresh.
CREATE OR REPLACE FUNCTION fn_director_decisions_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

-- ================================================================================
-- Updated: 2026-04-26 - Added decisions-spec Sprint 1 verdict engine
-- ================================================================================
-- fn_decision_outcome_check() — Nightly verdict grader for director_decisions.
-- Reference: specs/decisions-spec.md §5 (90-day outcome verdict — system-computed)
--            and §9 Sprint 1.
--
-- SECURITY-CRITICAL DESIGN:
--   The `formula` field on outcome_metric_query is Director-authored TEXT inside
--   JSONB. It is NEVER concatenated into SQL or executed dynamically. Instead this
--   function dispatches on outcome_metric_query->>'metric' to a HARDCODED CTE per
--   whitelisted metric. JSONB only supplies parameters (institution_id, scope,
--   target_value, target_delta_pct, etc.) — never SQL fragments.
--
-- Whitelist of metrics handled in v1:
--   - admission_funnel_conversion_rate
--   - enrolments_per_counselor_per_month
--   - median_hours_lead_to_first_activity
--   - enrolments_from_education_fair_top_tier
--   - compliance_evidence_coverage_pct_across_10_bodies
--
-- Sentinel: any formula containing the literal string 'TBD_AT_VERDICT_TIME' is
-- the spec §11 bounded-defer marker (D4) — engine emits a "manual verdict
-- required" work item and KEEPS the row in pending_outcome. It does not flip
-- to outcome_recorded; Director records the verdict by hand.
--
-- INCOMPUTABLE path: unknown metric, missing source column/table, or any
-- evaluation exception → status stays pending_outcome, verdict_notes records
-- the failure, work item informs Director.
--
-- Composite predictions (e.g. D1) carry `metrics: [...]` plus `composite`
-- ('all_must_hit' | 'any_must_hit'). Engine resolves each sub-metric, then
-- combines per the composite rule.
--
-- Idempotency: notification idempotency_key is
--   'decision_verdict:' || decision_id || ':' || to_char(outcome_due_at,'YYYY-MM-DD').
-- Re-running cron the same day after a successful grade is safe — fn_create_
-- dashboard_work_item early-returns 0 if the key already exists.
--
-- Returns: count of decisions touched (graded OR flagged INCOMPUTABLE OR routed
-- to manual). A no-op pass returns 0.
-- ================================================================================
CREATE OR REPLACE FUNCTION fn_decision_outcome_check()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_verdict$
DECLARE
  v_touched INT := 0;
  v_decision RECORD;
  v_query JSONB;
  v_metric TEXT;
  v_formula TEXT;
  v_actual NUMERIC;
  v_correct BOOLEAN;
  v_notes TEXT;
  v_idem_key TEXT;
  v_title TEXT;
  v_body TEXT;
  v_priority TEXT;
  -- Composite handling
  v_is_composite BOOLEAN;
  v_composite_rule TEXT;
  v_sub JSONB;
  v_sub_metric TEXT;
  v_sub_formula TEXT;
  v_sub_actual NUMERIC;
  v_sub_correct BOOLEAN;
  v_sub_notes TEXT;
  v_all_correct BOOLEAN;
  v_any_correct BOOLEAN;
  v_sub_count INT;
  v_aggregate_value NUMERIC;
  -- Common params extracted from JSONB
  v_target_value NUMERIC;
  v_target_delta_pct NUMERIC;
  v_comparison TEXT;
  v_scope TEXT;
  v_institution_id UUID;
  v_baseline NUMERIC;
  -- Whitelist enum to keep dispatch readable
  v_handled BOOLEAN;
BEGIN
  FOR v_decision IN
    SELECT id, director_user_id, outcome_metric_query, outcome_due_at, title
    FROM director_decisions
    WHERE status = 'pending_outcome'
      AND outcome_due_at <= NOW()
    ORDER BY outcome_due_at ASC
    LIMIT 100
  LOOP
    v_query := v_decision.outcome_metric_query;
    v_idem_key := 'decision_verdict:' || v_decision.id::text
                  || ':' || TO_CHAR(v_decision.outcome_due_at, 'YYYY-MM-DD');
    v_actual := NULL;
    v_correct := NULL;
    v_notes := NULL;
    v_handled := FALSE;
    v_aggregate_value := NULL;

    -- Manual-verdict sentinel: top-level formula contains 'TBD_AT_VERDICT_TIME'
    -- per spec §11 bounded-defer pattern. D4 (role-private) uses this. Status
    -- stays pending_outcome; Director records the verdict by hand.
    v_formula := COALESCE(v_query->>'formula', '');
    IF v_formula LIKE '%TBD_AT_VERDICT_TIME%' THEN
      v_title := 'Manual verdict required — ' || COALESCE(v_decision.title, 'decision');
      v_body  := 'Manual verdict required for decision ' || v_decision.id::text
              || ' — formula was intentionally non-computable per spec §11 bounded-defer pattern. '
              || 'Open the decision and record actual_outcome_value + prediction_correct by hand.';
      v_priority := 'high';
      PERFORM fn_create_dashboard_work_item(
        'dashboard:approval', v_priority, v_title, v_body,
        jsonb_build_object(
          'url', '/dashboard',
          'decision_id', v_decision.id,
          'kind', 'manual_verdict_required'),
        v_decision.director_user_id, v_idem_key, 168);
      UPDATE director_decisions
      SET verdict_notes = COALESCE(verdict_notes, '')
                          || E'\n[' || NOW()::text || '] Manual verdict required (TBD_AT_VERDICT_TIME sentinel).'
      WHERE id = v_decision.id;
      v_touched := v_touched + 1;
      CONTINUE;
    END IF;

    -- Composite vs single
    v_is_composite := (v_query ? 'metrics') AND jsonb_typeof(v_query->'metrics') = 'array';
    v_composite_rule := COALESCE(v_query->>'composite', 'all_must_hit');

    -- Common params
    v_scope            := COALESCE(v_query->>'scope', 'institution');
    v_institution_id   := NULLIF(v_query->>'institution_id', '')::UUID;
    v_target_value     := NULLIF(v_query->>'target_value', '')::NUMERIC;
    v_target_delta_pct := NULLIF(v_query->>'target_delta_pct', '')::NUMERIC;
    v_comparison       := COALESCE(v_query->>'comparison', 'absolute_gte');

    BEGIN
      IF NOT v_is_composite THEN
        v_metric := v_query->>'metric';
        SELECT * FROM fn_decision_resolve_metric(v_metric, v_query, v_decision.outcome_due_at)
          INTO v_sub_actual, v_sub_correct, v_sub_notes, v_handled;

        IF NOT v_handled THEN
          v_notes := 'Verdict INCOMPUTABLE: unknown metric ' || COALESCE(v_metric, '<null>')
                     || '. Whitelist metrics: admission_funnel_conversion_rate, '
                     || 'enrolments_per_counselor_per_month, median_hours_lead_to_first_activity, '
                     || 'enrolments_from_education_fair_top_tier, '
                     || 'compliance_evidence_coverage_pct_across_10_bodies.';
        ELSE
          v_actual := v_sub_actual;
          v_correct := v_sub_correct;
          v_notes := v_sub_notes;
        END IF;
      ELSE
        -- Composite: iterate sub-metrics
        v_all_correct := TRUE;
        v_any_correct := FALSE;
        v_sub_count := 0;
        v_notes := 'Composite (' || v_composite_rule || ') sub-metrics: ';
        FOR v_sub IN SELECT * FROM jsonb_array_elements(v_query->'metrics') LOOP
          v_sub_count := v_sub_count + 1;
          v_sub_metric := v_sub->>'metric';
          v_sub_formula := COALESCE(v_sub->>'formula', '');
          IF v_sub_formula LIKE '%TBD_AT_VERDICT_TIME%' THEN
            -- A sub-metric marked TBD makes the composite incomputable
            v_notes := v_notes || E'\n  - ' || v_sub_metric || ': TBD_AT_VERDICT_TIME (incomputable)';
            v_handled := FALSE;
            v_all_correct := NULL;
            EXIT;
          END IF;
          SELECT * FROM fn_decision_resolve_metric(v_sub_metric, v_sub, v_decision.outcome_due_at)
            INTO v_sub_actual, v_sub_correct, v_sub_notes, v_handled;
          IF NOT v_handled THEN
            v_notes := v_notes || E'\n  - ' || v_sub_metric || ': INCOMPUTABLE (' || COALESCE(v_sub_notes, 'unknown metric') || ')';
            v_all_correct := NULL;
            EXIT;
          END IF;
          v_notes := v_notes || E'\n  - ' || v_sub_metric || ': actual=' || COALESCE(v_sub_actual::text, 'null')
                     || ', correct=' || COALESCE(v_sub_correct::text, 'null')
                     || ' (' || COALESCE(v_sub_notes, '') || ')';
          IF v_sub_correct IS TRUE THEN
            v_any_correct := TRUE;
          ELSIF v_sub_correct IS FALSE THEN
            v_all_correct := FALSE;
          END IF;
          -- For composites, store the LAST sub-metric value as actual_outcome_value
          -- (advisory only; the verdict is the boolean across all subs)
          v_aggregate_value := v_sub_actual;
        END LOOP;
        IF v_handled AND v_all_correct IS NOT NULL THEN
          v_correct := CASE v_composite_rule
                         WHEN 'all_must_hit' THEN v_all_correct
                         WHEN 'any_must_hit' THEN v_any_correct
                         ELSE v_all_correct
                       END;
          v_actual := v_aggregate_value;
        ELSE
          -- Composite was incomputable → INCOMPUTABLE path
          v_handled := FALSE;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_handled := FALSE;
      v_notes := 'Verdict INCOMPUTABLE: ' || SQLERRM
                 || ' (SQLSTATE ' || SQLSTATE || ').';
    END;

    IF v_handled THEN
      -- Successful grade — flip to outcome_recorded
      UPDATE director_decisions
      SET status                       = 'outcome_recorded',
          actual_outcome_value         = v_actual,
          actual_outcome_recorded_at   = NOW(),
          prediction_correct           = v_correct,
          verdict_notes                = COALESCE(v_notes, '')
      WHERE id = v_decision.id;

      v_title := CASE WHEN v_correct IS TRUE THEN 'Verdict: CORRECT — ' ELSE 'Verdict: WRONG — ' END
                 || COALESCE(v_decision.title, 'decision');
      v_body  := 'Decision ' || v_decision.id::text || ' graded. '
              || 'Predicted outcome: ' || COALESCE(v_query->>'comparison', '?')
              || ' target ' || COALESCE(v_query->>'target_value', v_query->>'target_delta_pct', '?')
              || '. Actual: ' || COALESCE(v_actual::text, 'null')
              || '. Verdict: ' || CASE WHEN v_correct IS TRUE THEN 'correct' ELSE 'wrong' END || '.';
      v_priority := CASE WHEN v_correct IS TRUE THEN 'normal' ELSE 'high' END;
    ELSE
      -- INCOMPUTABLE — keep pending_outcome, append diagnostic note
      UPDATE director_decisions
      SET verdict_notes = COALESCE(verdict_notes, '')
                          || E'\n[' || NOW()::text || '] ' || COALESCE(v_notes, 'INCOMPUTABLE')
      WHERE id = v_decision.id;
      v_title := 'Verdict INCOMPUTABLE — ' || COALESCE(v_decision.title, 'decision');
      v_body  := 'Decision ' || v_decision.id::text || ' could not be auto-graded. '
              || COALESCE(v_notes, 'Unknown error.')
              || ' Status remains pending_outcome; review and re-frame the metric or record manually.';
      v_priority := 'high';
    END IF;

    PERFORM fn_create_dashboard_work_item(
      'dashboard:approval', v_priority, v_title, v_body,
      jsonb_build_object(
        'url', '/dashboard',
        'decision_id', v_decision.id,
        'kind', CASE WHEN v_handled THEN 'verdict_recorded' ELSE 'verdict_incomputable' END,
        'prediction_correct', v_correct),
      v_decision.director_user_id, v_idem_key, 168);

    v_touched := v_touched + 1;
  END LOOP;

  RETURN v_touched;
END $fn_verdict$;

REVOKE ALL ON FUNCTION fn_decision_outcome_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_decision_outcome_check() TO service_role;

-- ================================================================================
-- fn_decision_resolve_metric() — Whitelisted metric resolver for the verdict engine.
-- Returns (actual NUMERIC, correct BOOLEAN, notes TEXT, handled BOOLEAN).
-- handled = FALSE means the metric name was not in the whitelist OR a runtime
-- error caught here propagates as INCOMPUTABLE.
--
-- The function is SECURITY DEFINER + search_path=public. JSONB params drive
-- WHERE filters (institution_id, target_value, target_delta_pct, comparison),
-- never SQL fragments. Each branch is a hardcoded CTE.
-- ================================================================================
CREATE OR REPLACE FUNCTION fn_decision_resolve_metric(
  p_metric TEXT,
  p_query  JSONB,
  p_due_at TIMESTAMPTZ
) RETURNS TABLE (
  actual   NUMERIC,
  correct  BOOLEAN,
  notes    TEXT,
  handled  BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_resolve$
DECLARE
  v_actual           NUMERIC;
  v_correct          BOOLEAN;
  v_notes            TEXT;
  v_target_value     NUMERIC;
  v_target_delta_pct NUMERIC;
  v_comparison       TEXT;
  v_institution_id   UUID;
  v_scope            TEXT;
  v_baseline         NUMERIC;
  v_window_start     TIMESTAMPTZ;
  v_window_end       TIMESTAMPTZ;
  v_baseline_start   TIMESTAMPTZ;
  v_baseline_end     TIMESTAMPTZ;
  v_count_top_tier   INT;
  v_total_evidence   INT;
  v_bodies_covered   INT;
BEGIN
  v_target_value     := NULLIF(p_query->>'target_value', '')::NUMERIC;
  v_target_delta_pct := NULLIF(p_query->>'target_delta_pct', '')::NUMERIC;
  v_comparison       := COALESCE(p_query->>'comparison', 'absolute_gte');
  v_scope            := COALESCE(p_query->>'scope', 'institution');
  v_institution_id   := NULLIF(p_query->>'institution_id', '')::UUID;

  -- 30-day window ending at outcome_due_at; baseline 30 days preceding decision.
  -- If baseline window unspecified, defaults to 30 days before window_start.
  v_window_end   := p_due_at;
  v_window_start := p_due_at - INTERVAL '30 days';
  v_baseline_end := v_window_start;
  v_baseline_start := v_window_start - INTERVAL '30 days';

  IF p_metric = 'admission_funnel_conversion_rate' THEN
    -- enrolled / total leads in window. Optionally institution-scoped.
    WITH leads AS (
      SELECT COUNT(*) FILTER (WHERE funnel_stage = 'enrolled') AS enrolled,
             COUNT(*) AS total
      FROM admission_leads
      WHERE created_at >= v_window_start AND created_at < v_window_end
        AND (v_institution_id IS NULL OR institution_id = v_institution_id)
    ), baseline AS (
      SELECT COUNT(*) FILTER (WHERE funnel_stage = 'enrolled') AS enrolled,
             COUNT(*) AS total
      FROM admission_leads
      WHERE created_at >= v_baseline_start AND created_at < v_baseline_end
        AND (v_institution_id IS NULL OR institution_id = v_institution_id)
    )
    SELECT
      CASE WHEN l.total = 0 THEN 0 ELSE ROUND(100.0 * l.enrolled / l.total, 2) END,
      CASE WHEN b.total = 0 THEN 0 ELSE ROUND(100.0 * b.enrolled / b.total, 2) END
    INTO v_actual, v_baseline
    FROM leads l, baseline b;

    IF v_comparison = 'delta_pct_gte' AND v_target_delta_pct IS NOT NULL THEN
      v_correct := (v_baseline > 0) AND ((v_actual - v_baseline) / v_baseline * 100.0 >= v_target_delta_pct);
      v_notes := 'admission_funnel_conversion_rate: actual=' || v_actual::text
              || '%, baseline=' || v_baseline::text || '%, delta_target=' || v_target_delta_pct::text || '%';
    ELSIF v_comparison = 'absolute_gte' AND v_target_value IS NOT NULL THEN
      v_correct := (v_actual >= v_target_value);
      v_notes := 'admission_funnel_conversion_rate: actual=' || v_actual::text || '%, target=' || v_target_value::text || '%';
    ELSE
      v_correct := NULL;
      v_notes := 'admission_funnel_conversion_rate computed (' || v_actual::text || '%) but comparison/target unspecified';
    END IF;
    RETURN QUERY SELECT v_actual, v_correct, v_notes, TRUE;
    RETURN;

  ELSIF p_metric = 'enrolments_per_counselor_per_month' THEN
    -- enrolments in 30d window / distinct counselors. NULL counselor excluded.
    WITH src AS (
      SELECT counselor_id, COUNT(*) AS enrolled
      FROM admission_leads
      WHERE funnel_stage = 'enrolled'
        AND COALESCE(updated_at, created_at) >= v_window_start
        AND COALESCE(updated_at, created_at) < v_window_end
        AND counselor_id IS NOT NULL
        AND (v_institution_id IS NULL OR institution_id = v_institution_id)
      GROUP BY counselor_id
    )
    SELECT COALESCE(ROUND(AVG(enrolled)::numeric, 2), 0) INTO v_actual FROM src;

    IF v_comparison = 'absolute_gte' AND v_target_value IS NOT NULL THEN
      v_correct := (v_actual >= v_target_value);
      v_notes := 'enrolments_per_counselor_per_month: actual=' || v_actual::text || ', target=' || v_target_value::text;
    ELSE
      v_correct := NULL;
      v_notes := 'enrolments_per_counselor_per_month computed (' || v_actual::text || ') but comparison/target unspecified';
    END IF;
    RETURN QUERY SELECT v_actual, v_correct, v_notes, TRUE;
    RETURN;

  ELSIF p_metric = 'median_hours_lead_to_first_activity' THEN
    -- Median hours from lead created → first activity. Uses admission_leads.first_touch_at
    -- if present; otherwise falls back to MIN(admission_lead_activities.created_at) JOIN.
    WITH durations AS (
      SELECT EXTRACT(EPOCH FROM (
               COALESCE(
                 al.first_touch_at,
                 (SELECT MIN(ala.created_at)
                  FROM admission_lead_activities ala
                  WHERE ala.lead_id = al.id)
               ) - al.created_at
             )) / 3600.0 AS hrs
      FROM admission_leads al
      WHERE al.created_at >= v_window_start AND al.created_at < v_window_end
        AND (v_institution_id IS NULL OR al.institution_id = v_institution_id)
    )
    SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY hrs)::numeric, 2)
      INTO v_actual
    FROM durations
    WHERE hrs IS NOT NULL AND hrs >= 0;

    v_actual := COALESCE(v_actual, 0);
    IF v_comparison = 'absolute_lte' AND v_target_value IS NOT NULL THEN
      v_correct := (v_actual <= v_target_value);
      v_notes := 'median_hours_lead_to_first_activity: actual=' || v_actual::text || 'h, target<=' || v_target_value::text || 'h';
    ELSIF v_comparison = 'absolute_gte' AND v_target_value IS NOT NULL THEN
      v_correct := (v_actual >= v_target_value);
      v_notes := 'median_hours_lead_to_first_activity: actual=' || v_actual::text || 'h, target>=' || v_target_value::text || 'h';
    ELSE
      v_correct := NULL;
      v_notes := 'median_hours_lead_to_first_activity computed (' || v_actual::text || 'h) but comparison/target unspecified';
    END IF;
    RETURN QUERY SELECT v_actual, v_correct, v_notes, TRUE;
    RETURN;

  ELSIF p_metric = 'enrolments_from_education_fair_top_tier' THEN
    -- D2 metric: enrolments where source='education_fair' AND score in top tier
    -- (per spec the tier is "top_1500_to_2000_by_score"). admission_leads.score
    -- is NUMERIC; we use it as the ranking signal. If `triage_score` were the
    -- intended column it does not exist on prod (validated 2026-04-26) — the
    -- function falls back to `score` and notes the substitution.
    BEGIN
      SELECT COUNT(*) INTO v_count_top_tier
      FROM (
        SELECT id, score
        FROM admission_leads
        WHERE source = 'education_fair'
          AND funnel_stage = 'enrolled'
          AND COALESCE(updated_at, created_at) < v_window_end
          AND (v_institution_id IS NULL OR institution_id = v_institution_id)
        ORDER BY score DESC NULLS LAST
        OFFSET 1500 LIMIT 500
      ) t;
      v_actual := COALESCE(v_count_top_tier, 0);
    EXCEPTION WHEN undefined_column THEN
      RETURN QUERY SELECT NULL::NUMERIC, NULL::BOOLEAN,
        'enrolments_from_education_fair_top_tier: source column missing on admission_leads — '
        || 'spec referenced triage_score which does not exist; verify column inventory.'::TEXT,
        FALSE;
      RETURN;
    END;

    IF v_comparison = 'absolute_gte' AND v_target_value IS NOT NULL THEN
      v_correct := (v_actual >= v_target_value);
      v_notes := 'enrolments_from_education_fair_top_tier: actual=' || v_actual::text
              || ', target>=' || v_target_value::text
              || ' (ranked by admission_leads.score; triage_score absent on prod)';
    ELSE
      v_correct := NULL;
      v_notes := 'enrolments_from_education_fair_top_tier computed (' || v_actual::text || ') but comparison/target unspecified';
    END IF;
    RETURN QUERY SELECT v_actual, v_correct, v_notes, TRUE;
    RETURN;

  ELSIF p_metric = 'compliance_evidence_coverage_pct_across_10_bodies' THEN
    -- D3 metric: number of distinct compliance bodies with at least one evidence
    -- mapping → as % of 10. Spec referenced quality_evidence_mappings +
    -- accreditation_indicators; the latter does not exist on prod
    -- (sh_accreditation_metrics is the closest analog). v1 grades by
    -- distinct body_code presence in quality_evidence_mappings only.
    BEGIN
      SELECT COUNT(DISTINCT body_code), COUNT(*) INTO v_bodies_covered, v_total_evidence
      FROM quality_evidence_mappings
      WHERE mapped_at < v_window_end
        AND (v_institution_id IS NULL OR institution_id = v_institution_id);
    EXCEPTION WHEN undefined_table THEN
      RETURN QUERY SELECT NULL::NUMERIC, NULL::BOOLEAN,
        'compliance_evidence_coverage_pct_across_10_bodies: quality_evidence_mappings table missing.'::TEXT,
        FALSE;
      RETURN;
    END;

    v_actual := ROUND(100.0 * COALESCE(v_bodies_covered, 0) / 10.0, 2);

    IF v_comparison = 'delta_pct_gte' AND v_target_delta_pct IS NOT NULL THEN
      -- For coverage we treat target_delta_pct as "absolute coverage % must be >= this"
      -- since baseline coverage prior to instrumentation is effectively 0%.
      v_correct := (v_actual >= v_target_delta_pct);
      v_notes := 'compliance_evidence_coverage_pct_across_10_bodies: actual=' || v_actual::text
              || '% (' || COALESCE(v_bodies_covered,0)::text || '/10 bodies, '
              || COALESCE(v_total_evidence,0)::text || ' rows), target>=' || v_target_delta_pct::text || '%';
    ELSIF v_comparison = 'absolute_gte' AND v_target_value IS NOT NULL THEN
      v_correct := (v_actual >= v_target_value);
      v_notes := 'compliance_evidence_coverage_pct_across_10_bodies: actual=' || v_actual::text
              || '%, target>=' || v_target_value::text || '%';
    ELSE
      v_correct := NULL;
      v_notes := 'compliance_evidence_coverage_pct_across_10_bodies computed ('
              || v_actual::text || '%) but comparison/target unspecified';
    END IF;
    RETURN QUERY SELECT v_actual, v_correct, v_notes, TRUE;
    RETURN;
  END IF;

  -- Unknown metric — caller decides INCOMPUTABLE messaging
  RETURN QUERY SELECT NULL::NUMERIC, NULL::BOOLEAN,
    ('unknown metric: ' || COALESCE(p_metric, '<null>'))::TEXT, FALSE;
  RETURN;
END $fn_resolve$;

REVOKE ALL ON FUNCTION fn_decision_resolve_metric(TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_decision_resolve_metric(TEXT, JSONB, TIMESTAMPTZ) TO service_role;

-- =====================================================================
-- Updated: 2026-04-27 - Agent G: counselor mutation impact-preview RPC
-- Returns row counts that will lose counselor link when a counselor is
-- deactivated/removed. Powers the Toggle/Remove confirmation dialog.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_admission_counselor_impact_preview(
  p_counselor_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  assigned_leads BIGINT,
  call_logs BIGINT,
  callback_queue BIGINT,
  counselor_record_leads BIGINT,
  counselor_full_name TEXT,
  counselor_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('admission.counselors.delete')
    OR user_has_permission('admission.counselors.edit')
  ) THEN
    RAISE EXCEPTION 'Insufficient permission to preview counselor impact';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE((SELECT COUNT(*) FROM admission_leads WHERE assigned_counselor_id = p_user_id), 0)::BIGINT,
    COALESCE((SELECT COUNT(*) FROM admission_call_logs WHERE counselor_id = p_user_id), 0)::BIGINT,
    COALESCE((SELECT COUNT(*) FROM admission_callback_queue WHERE assigned_counselor_id = p_user_id), 0)::BIGINT,
    COALESCE((SELECT COUNT(*) FROM admission_leads WHERE counselor_id = p_counselor_id), 0)::BIGINT,
    (SELECT name FROM admission_counselors WHERE id = p_counselor_id),
    (SELECT email FROM admission_counselors WHERE id = p_counselor_id);
END;
$$;

COMMENT ON FUNCTION public.fn_admission_counselor_impact_preview(UUID, UUID) IS
  'Returns row counts that will lose counselor link when counselor is deactivated/removed. Used by Toggle/Remove confirmation dialogs.';

GRANT EXECUTE ON FUNCTION public.fn_admission_counselor_impact_preview(UUID, UUID) TO authenticated;

-- =====================================================================
-- Updated: 2026-04-27 - Bug B: notifications.targeting JSONB shape unifier.
--
-- Two emitter families historically wrote different shapes into the
-- notifications.targeting column:
--   1. fn_create_dashboard_work_item (dashboard:* categories) writes
--      jsonb_build_object('type','user','user_id', uuid)         -- legacy singular
--   2. doctrines digest emitters (sunday-wrap / friday-reflection)
--      and other API writers emit
--      { user_ids: [uuid] }                                       -- canonical array
--   3. system-wide broadcasts emit { broadcast: true } (or similar)
--
-- Cross-shape RLS queries previously had to OR three predicates per row
-- (see notifications_select_own in 03_policies.sql post-PR #517). This
-- helper centralises the recognition logic so policies and ad-hoc queries
-- have a single answer for "is this notification for this user?".
--
-- Canonical shape going forward: { type: 'user', user_ids: [uuid, ...] }.
-- Reads still accept the legacy singular shape; existing rows are left
-- unmigrated. A future PR may rewrite all rows to the canonical shape.
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_notification_is_for_user(
  p_targeting JSONB,
  p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn_targeting$
  -- COALESCE wraps the result so absent JSONB keys (which yield NULL on
  -- ->>/-> operators) normalise to FALSE instead of NULL. RLS predicates
  -- treat NULL as "deny" but ad-hoc callers that test the boolean
  -- directly need a proper FALSE for "this user is not targeted".
  SELECT COALESCE(
    -- Legacy singular shape: {"type":"user","user_id":"<uuid>"}
    (p_targeting ->> 'user_id')::uuid = p_user_id
    -- Canonical array shape: {"type":"user","user_ids":["<uuid>", ...]}
    OR (p_targeting -> 'user_ids' ? p_user_id::text)
    -- System-wide broadcast: {"broadcast":"true"}
    OR p_targeting ->> 'broadcast' = 'true',
    FALSE
  );
$fn_targeting$;

REVOKE ALL ON FUNCTION fn_notification_is_for_user(JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_notification_is_for_user(JSONB, UUID) TO authenticated, service_role;

-- ============================================================================
-- PostgREST schema cache reload (added 2026-04-28)
-- Tells PostgREST to re-read pg_proc / pg_type after function changes.
-- Without this, freshly created/modified functions return PGRST202
-- "Could not find the function ... in the schema cache" until PostgREST
-- restarts (~10 min idle refresh) or the next DDL event triggers a reload.
-- Mirrors the trailer pattern used by all 11 migrations under
-- supabase/migrations/ (e.g. 20260427_role_demotion_safeguards.sql,
-- 20260424_bos_align_institutions_id_and_drop_expert_fk.sql).
-- ============================================================================

-- Resolution priority: user-override > institution-override > role-override > global default
CREATE OR REPLACE FUNCTION fn_get_policy(p_key TEXT, p_scope_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT value FROM platform_policies
  WHERE policy_key = p_key AND is_active = true
    AND (
      (scope_type='institution' AND scope_id=p_scope_id)
      OR (scope_type='global' AND scope_id IS NULL)
      OR (scope_type='role' AND scope_id IN (
            SELECT cr.id FROM custom_roles cr WHERE EXISTS (
              SELECT 1 FROM user_roles ur JOIN profiles p ON p.id=ur.user_id
              WHERE ur.role_id=cr.id AND p.id=auth.uid()
            )
          ))
      OR (scope_type='user' AND scope_id=auth.uid())
    )
  ORDER BY
    CASE scope_type
      WHEN 'user' THEN 1
      WHEN 'institution' THEN 2
      WHEN 'role' THEN 3
      WHEN 'global' THEN 4
    END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION fn_get_policy_int(p_key TEXT, p_default INT, p_scope_id UUID DEFAULT NULL)
RETURNS INT
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((fn_get_policy(p_key, p_scope_id))::int, p_default);
$$;

CREATE OR REPLACE FUNCTION fn_get_policy_text(p_key TEXT, p_default TEXT, p_scope_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((fn_get_policy(p_key, p_scope_id))#>>'{}', p_default);
$$;

CREATE OR REPLACE FUNCTION fn_get_policy_bool(p_key TEXT, p_default BOOLEAN, p_scope_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((fn_get_policy(p_key, p_scope_id))::boolean, p_default);
$$;

-- 2026-04-29 (Phase 1.5a): lock fn_get_policy* — authenticated+service_role only
REVOKE EXECUTE ON FUNCTION fn_get_policy(TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_get_policy_int(TEXT, INT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_get_policy_text(TEXT, TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_get_policy_bool(TEXT, BOOLEAN, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_get_policy(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_get_policy_int(TEXT, INT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_get_policy_text(TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_get_policy_bool(TEXT, BOOLEAN, UUID) TO authenticated, service_role;

-- =====================================================================
-- Updated: 2026-04-29 - Wave B.1 — Notification Generator Policy helpers.
-- (1) fn_notif_gen_cfg_set_updated_at — touch trigger fn for updated_at
-- (2) fn_log_notif_gen_cfg_change     — audit trigger fn (INSERT/UPDATE/DELETE)
-- (3) fn_get_generator_config         — single source-of-truth lookup with
--     hardcoded fallback, called by every generator. Day-1 behavior is
--     preserved bit-identical because callers always pass their hardcoded
--     baseline as p_fallback (so missing/inactive config row = baseline).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_notif_gen_cfg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $fn_ngc_upd$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn_ngc_upd$;

CREATE OR REPLACE FUNCTION public.fn_log_notif_gen_cfg_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_ngc_audit$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notification_generator_config_audit (generator_name, config_id, operation, new_config, changed_by)
    VALUES (NEW.generator_name, NEW.id, 'INSERT', NEW.config, COALESCE(NEW.created_by, auth.uid()));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.notification_generator_config_audit (generator_name, config_id, operation, old_config, new_config, changed_by)
    VALUES (NEW.generator_name, NEW.id, 'UPDATE', OLD.config, NEW.config, COALESCE(NEW.updated_by, auth.uid()));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.notification_generator_config_audit (generator_name, config_id, operation, old_config, changed_by)
    VALUES (OLD.generator_name, OLD.id, 'DELETE', OLD.config, auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$fn_ngc_audit$;

CREATE OR REPLACE FUNCTION public.fn_get_generator_config(
  p_name TEXT,
  p_fallback JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public
AS $fn_ngc_get$
DECLARE v_config JSONB;
BEGIN
  SELECT config
  INTO v_config
  FROM public.notification_generator_config
  WHERE generator_name = p_name AND is_active = true
  LIMIT 1;

  RETURN COALESCE(v_config, p_fallback);
END;
$fn_ngc_get$;
GRANT EXECUTE ON FUNCTION public.fn_get_generator_config(TEXT, JSONB) TO authenticated, service_role;

-- ============================================================================
-- admission_resolve_fee_items_for_lead RPC (Plan 3 Task 4)
-- ============================================================================
-- Spec §7. Computes the resolved fee_items[] for a learner by:
--   1. Looking up matching active fee_structure on the 8 dimensions
--   2. Loading base items from the structure
--   3. Applying active adjustments (per-category merged, global appended)
--   4. Clamping negative resulting amounts to 0
--   5. Persisting result into learners_profiles.fee_items
--   6. Returning the JSONB array
-- legacy_fee_mode short-circuit: returns existing fee_items unchanged.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admission_resolve_fee_items_for_lead(p_learner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_lead              record;
    v_structure_id      uuid;
    v_resolved          jsonb;
    v_base_items        jsonb;
    v_adjustments       jsonb;
    v_global_deltas_sum numeric(15,2) := 0;
    v_year              int := COALESCE(public.fn_learner_year_of_study(p_learner_id), 1);
BEGIN
    SELECT institution_id, degree_id, department_id, program_id,
           quota_id, community_category_id, accommodation_type_id, admission_year_id,
           legacy_fee_mode, gender
      INTO v_lead
      FROM public.learners_profiles
     WHERE id = p_learner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    IF v_lead.legacy_fee_mode = true THEN
        RETURN COALESCE((SELECT fee_items FROM public.learners_profiles WHERE id = p_learner_id), '[]'::jsonb);
    END IF;

    -- accommodation_type_id is an OPTIONAL match dimension (NULL = Any). Prefer
    -- an accommodation-specific structure, then a gender-specific one, then the
    -- most recently updated, as the deterministic tiebreak. Hostel ROOM/MESS
    -- fees still live in campus-living; this only routes academic/common fees.
    SELECT afs.id INTO v_structure_id
      FROM public.admission_fee_structures afs
     WHERE afs.institution_id        = v_lead.institution_id
       AND afs.degree_id             = v_lead.degree_id
       AND afs.department_id         = v_lead.department_id
       AND afs.programme_id          = v_lead.program_id
       AND afs.quota_id              = v_lead.quota_id
       AND afs.admission_year_id     = v_lead.admission_year_id
       AND afs.status = 'active'
       AND EXISTS (
             SELECT 1 FROM public.admission_fee_structure_communities j
              WHERE j.fee_structure_id      = afs.id
                AND j.community_category_id = v_lead.community_category_id
           )
       AND (afs.gender = UPPER(v_lead.gender) OR afs.gender IS NULL)
       AND (afs.accommodation_type_id = v_lead.accommodation_type_id
            OR afs.accommodation_type_id IS NULL)
     ORDER BY afs.accommodation_type_id IS NOT NULL DESC,
              afs.gender IS NOT NULL DESC,
              afs.updated_at DESC
     LIMIT 1;

    IF v_structure_id IS NULL THEN
        UPDATE public.learners_profiles SET fee_items = '[]'::jsonb WHERE id = p_learner_id;
        RETURN '[]'::jsonb;
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
                'category_id',   fsi.billing_category_id,
                'category_name', bc.category_name,
                'amount',        fsi.amount,
                'source',        'structure'))
      INTO v_base_items
      FROM public.admission_fee_structure_items fsi
      JOIN public.billing_categories bc ON bc.id = fsi.billing_category_id
     WHERE fsi.fee_structure_id = v_structure_id
       AND (
             fsi.applies_to = 'every_year'
          OR (fsi.applies_to = 'first_year_only' AND v_year = 1)
          OR (fsi.applies_to = 'specific_year'  AND fsi.applies_year_of_study = v_year)
       );

    IF v_base_items IS NULL THEN
        v_base_items := '[]'::jsonb;
    END IF;

    WITH per_cat AS (
        SELECT billing_category_id, SUM(delta_amount) AS delta_sum
          FROM public.admission_fee_adjustments
         WHERE learner_id = p_learner_id
           AND status = 'active'
           AND billing_category_id IS NOT NULL
         GROUP BY billing_category_id
    )
    SELECT jsonb_agg(
             jsonb_build_object(
               'category_id',   item->>'category_id',
               'category_name', item->>'category_name',
               'amount',        GREATEST(0, (item->>'amount')::numeric
                                  + COALESCE(pc.delta_sum, 0)),
               'source',        item->>'source'))
      INTO v_resolved
      FROM jsonb_array_elements(v_base_items) AS item
      LEFT JOIN per_cat pc ON pc.billing_category_id = (item->>'category_id')::uuid;

    IF v_resolved IS NULL THEN
        v_resolved := '[]'::jsonb;
    END IF;

    SELECT COALESCE(SUM(delta_amount), 0)
      INTO v_global_deltas_sum
      FROM public.admission_fee_adjustments
     WHERE learner_id = p_learner_id
       AND status = 'active'
       AND billing_category_id IS NULL;

    IF v_global_deltas_sum <> 0 THEN
        v_resolved := v_resolved || jsonb_build_array(
            jsonb_build_object(
                'category_id',   NULL,
                'category_name', 'Global Adjustment',
                'amount',        v_global_deltas_sum,
                'source',        'adjustment_global'
            )
        );
    END IF;

    UPDATE public.learners_profiles
       SET fee_items = v_resolved,
           updated_at = now()
     WHERE id = p_learner_id;

    RETURN v_resolved;
END;
$function$;

REVOKE ALL ON FUNCTION public.admission_resolve_fee_items_for_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admission_resolve_fee_items_for_lead(uuid) TO authenticated;

-- ============================================================================
-- admission_resolve_fee_items_readonly RPC (Phase 3 Task 1)
-- ============================================================================
-- Read-only twin of admission_resolve_fee_items_for_lead(uuid) for dry-run
-- previews. Same matching + aggregation logic, but:
--   * Signature (p_learner_id uuid, p_year_of_study int) — caller supplies the
--     year-of-study used by the applicability predicate (no fn_learner_year_of_study).
--   * RETURNs the resolved jsonb array WITHOUT writing learners_profiles.fee_items.
--   * Each item carries billing_category_id (generation RPC dedup key), plus
--     category_name, amount, applies_to, applies_year_of_study.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admission_resolve_fee_items_readonly(
    p_learner_id uuid,
    p_year_of_study int
)
    RETURNS jsonb
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'public'
AS $function$
DECLARE
    v_lead              record;
    v_structure_id      uuid;
    v_resolved          jsonb;
    v_base_items        jsonb;
    v_global_deltas_sum numeric(15,2) := 0;
    v_year              int := COALESCE(p_year_of_study, 1);
BEGIN
    SELECT institution_id, degree_id, department_id, program_id,
           quota_id, community_category_id, accommodation_type_id, admission_year_id,
           legacy_fee_mode, gender
      INTO v_lead
      FROM public.learners_profiles
     WHERE id = p_learner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    IF v_lead.legacy_fee_mode = true THEN
        RETURN COALESCE((SELECT fee_items FROM public.learners_profiles WHERE id = p_learner_id), '[]'::jsonb);
    END IF;

    SELECT afs.id INTO v_structure_id
      FROM public.admission_fee_structures afs
     WHERE afs.institution_id        = v_lead.institution_id
       AND afs.degree_id             = v_lead.degree_id
       AND afs.department_id         = v_lead.department_id
       AND afs.programme_id          = v_lead.program_id
       AND afs.quota_id              = v_lead.quota_id
       AND afs.admission_year_id     = v_lead.admission_year_id
       AND afs.status = 'active'
       AND EXISTS (
             SELECT 1 FROM public.admission_fee_structure_communities j
              WHERE j.fee_structure_id      = afs.id
                AND j.community_category_id = v_lead.community_category_id
           )
       AND (afs.gender = UPPER(v_lead.gender) OR afs.gender IS NULL)
     ORDER BY afs.gender IS NOT NULL DESC
     LIMIT 1;

    IF v_structure_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
                'category_id',           fsi.billing_category_id,
                'billing_category_id',   fsi.billing_category_id,
                'category_name',         bc.category_name,
                'amount',                fsi.amount,
                'applies_to',            fsi.applies_to,
                'applies_year_of_study', fsi.applies_year_of_study,
                'source',                'structure'))
      INTO v_base_items
      FROM public.admission_fee_structure_items fsi
      JOIN public.billing_categories bc ON bc.id = fsi.billing_category_id
     WHERE fsi.fee_structure_id = v_structure_id
       AND (
             fsi.applies_to = 'every_year'
          OR (fsi.applies_to = 'first_year_only' AND v_year = 1)
          OR (fsi.applies_to = 'specific_year'  AND fsi.applies_year_of_study = v_year)
       );

    IF v_base_items IS NULL THEN
        v_base_items := '[]'::jsonb;
    END IF;

    WITH per_cat AS (
        SELECT billing_category_id, SUM(delta_amount) AS delta_sum
          FROM public.admission_fee_adjustments
         WHERE learner_id = p_learner_id
           AND status = 'active'
           AND billing_category_id IS NOT NULL
         GROUP BY billing_category_id
    )
    SELECT jsonb_agg(
             jsonb_build_object(
               'category_id',           item->>'category_id',
               'billing_category_id',   item->>'billing_category_id',
               'category_name',         item->>'category_name',
               'amount',                GREATEST(0, (item->>'amount')::numeric
                                          + COALESCE(pc.delta_sum, 0)),
               'applies_to',            item->>'applies_to',
               'applies_year_of_study', (item->>'applies_year_of_study')::int,
               'source',                item->>'source'))
      INTO v_resolved
      FROM jsonb_array_elements(v_base_items) AS item
      LEFT JOIN per_cat pc ON pc.billing_category_id = (item->>'category_id')::uuid;

    IF v_resolved IS NULL THEN
        v_resolved := '[]'::jsonb;
    END IF;

    SELECT COALESCE(SUM(delta_amount), 0)
      INTO v_global_deltas_sum
      FROM public.admission_fee_adjustments
     WHERE learner_id = p_learner_id
       AND status = 'active'
       AND billing_category_id IS NULL;

    IF v_global_deltas_sum <> 0 THEN
        v_resolved := v_resolved || jsonb_build_array(
            jsonb_build_object(
                'category_id',           NULL,
                'billing_category_id',   NULL,
                'category_name',         'Global Adjustment',
                'amount',                v_global_deltas_sum,
                'applies_to',            NULL,
                'applies_year_of_study', NULL,
                'source',                'adjustment_global'
            )
        );
    END IF;

    RETURN v_resolved;
END;
$function$;

-- Security: owner-only execute — SECURITY DEFINER read fn must not be directly callable by untrusted roles (IDOR); only the gated generation RPC calls it as owner.
REVOKE ALL ON FUNCTION public.admission_resolve_fee_items_readonly(uuid, int)
  FROM PUBLIC, anon, authenticated, service_role;

-- ============================================================================
-- admission_account_transition_with_bills (Plan 4 Task 4)
-- ============================================================================
-- Spec §8.3.1. Atomic: documents persistence + status update + bill generation.
-- Any RAISE EXCEPTION rolls back everything.
--
-- Bill INSERT column list mirrors OnboardingService.createBillsFromProfile
-- (lib/services/billing/onboarding/onboarding-service.ts) exactly:
--   student_id, institution_id, item_category_id, bill_description, due_date,
--   quantity, unit_amount, total_amount, tax_amount, final_amount,
--   balance_amount, status, remarks, created_by
-- Other billing_student_bills columns (is_recurring, recurrence_pattern,
-- number_of_recurrences, payment_date) keep their table defaults.
-- ============================================================================
-- Hosteller-skip guard (migration 20260606102000): hostellers are billed via Campus Living (campus_living_generate_hostel_year_bills), so the academic-bill INSERTs here are skipped for them to avoid double-billing.

CREATE OR REPLACE FUNCTION public.admission_account_transition_with_bills(
    p_learner_id          uuid,
    p_required_documents  jsonb,
    p_received_documents  jsonb,
    p_idempotency_key     uuid DEFAULT NULL::uuid,
    p_notes               text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lead              record;
    v_fee_items         jsonb;
    v_required          text[];
    v_received_types    text[];
    v_missing           text[];
    v_doc               jsonb;
    v_bills_existing    integer;
    v_bills_inserted    integer := 0;
    v_item              jsonb;
    v_due_date          date;
    v_caller            uuid := auth.uid();
    v_existing_result   jsonb;
    v_pending_event_id  uuid;
    v_result            jsonb;
    v_is_hosteller      boolean := false;
BEGIN
    -- Idempotency short-circuit
    IF p_idempotency_key IS NOT NULL THEN
        SELECT result INTO v_existing_result
          FROM public.admission_account_transition_log
         WHERE idempotency_key = p_idempotency_key;
        IF v_existing_result IS NOT NULL THEN
            RETURN v_existing_result;
        END IF;
    END IF;

    -- Permission check
    IF NOT public.user_has_permission('admission_documents.manage') THEN
        RAISE EXCEPTION 'permission_denied: admission_documents.manage required'
            USING ERRCODE = '42501';
    END IF;

    -- Load + lock learner row
    SELECT id, institution_id, lifecycle_status, fee_items, legacy_fee_mode, accommodation_type_id
      INTO v_lead
      FROM public.learners_profiles
     WHERE id = p_learner_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    -- CUTOVER guard: hostellers are billed via the Campus Living generation run
    -- (campus_living_generate_hostel_year_bills, hostel_year-stamped). Skipping
    -- bill INSERTs here prevents the academic portion from double-billing — the
    -- dedup index can't bridge a NULL hostel_year (here) vs a set one (there).
    v_is_hosteller := EXISTS (
        SELECT 1
          FROM public.accommodation_types a
         WHERE a.id = v_lead.accommodation_type_id
           AND a.code = 'hostel'
    );

    -- Allow-list extended 2026-05-20 to include the renamed entry-point
    -- statuses ('enquiry', 'enquiry_submitted'). Pre-realignment statuses
    -- kept for in-flight workflow and legacy data compatibility.
    IF v_lead.lifecycle_status NOT IN (
        'enquiry', 'enquiry_submitted',
        'admitted', 'pending', 'approved'
    ) THEN
        RAISE EXCEPTION 'invalid_status_for_account_transition: current=%, allowed=enquiry/enquiry_submitted/admitted/pending/approved',
            v_lead.lifecycle_status;
    END IF;

    -- Block if a pending fee-change event exists
    SELECT id INTO v_pending_event_id
      FROM public.admission_fee_change_events
     WHERE learner_id = p_learner_id
       AND status = 'pending_review'
     LIMIT 1;
    IF v_pending_event_id IS NOT NULL THEN
        RAISE EXCEPTION 'pending_fee_change_event: cannot transition while a fee-change event is pending review (event_id=%)',
            v_pending_event_id USING ERRCODE = 'P0001';
    END IF;

    IF v_lead.legacy_fee_mode = false THEN
        v_fee_items := public.admission_resolve_fee_items_for_lead(p_learner_id);
        IF jsonb_array_length(v_fee_items) = 0 THEN
            RAISE EXCEPTION 'fee_structure_not_resolvable: no matching matrix combo';
        END IF;
    ELSE
        v_fee_items := v_lead.fee_items;
        IF v_fee_items IS NULL OR jsonb_array_length(v_fee_items) = 0 THEN
            UPDATE public.learners_profiles
               SET legacy_fee_mode = false,
                   updated_at      = now()
             WHERE id = p_learner_id;

            v_fee_items := public.admission_resolve_fee_items_for_lead(p_learner_id);
            IF jsonb_array_length(v_fee_items) = 0 THEN
                RAISE EXCEPTION 'fee_items_empty: no legacy fees and no matching fee structure in the matrix';
            END IF;
        END IF;
    END IF;

    SELECT array_agg(value::text) INTO v_required
      FROM jsonb_array_elements_text(p_required_documents);

    SELECT array_agg(value->>'doc_type') INTO v_received_types
      FROM jsonb_array_elements(p_received_documents) AS value;

    SELECT array_agg(req) INTO v_missing
      FROM unnest(COALESCE(v_required, ARRAY[]::text[])) AS req
     WHERE req <> ALL (COALESCE(v_received_types, ARRAY[]::text[]));

    IF array_length(v_missing, 1) > 0 THEN
        RAISE EXCEPTION 'required_documents_missing: %', array_to_string(v_missing, ',');
    END IF;

    FOR v_doc IN SELECT * FROM jsonb_array_elements(p_received_documents)
    LOOP
        INSERT INTO public.learner_admission_documents
            (learner_id, doc_type, is_received, received_at, received_by, received_via, document_ref)
        VALUES
            (p_learner_id,
             v_doc->>'doc_type',
             true,
             now(),
             v_caller,
             v_doc->>'received_via',
             v_doc->>'document_ref')
        ON CONFLICT (learner_id, doc_type) DO UPDATE
            SET is_received  = true,
                received_at  = EXCLUDED.received_at,
                received_by  = EXCLUDED.received_by,
                received_via = EXCLUDED.received_via,
                document_ref = EXCLUDED.document_ref,
                updated_at   = now();
    END LOOP;

    UPDATE public.learners_profiles
       SET lifecycle_status               = 'account',
           updated_at                     = now(),
           updated_by                     = v_caller,
           account_verified_at            = CASE
                                              WHEN p_idempotency_key IS NOT NULL
                                              THEN now()
                                              ELSE account_verified_at
                                            END,
           account_verified_by            = CASE
                                              WHEN p_idempotency_key IS NOT NULL
                                              THEN v_caller
                                              ELSE account_verified_by
                                            END,
           account_verification_notes     = COALESCE(p_notes, account_verification_notes)
     WHERE id = p_learner_id;

    -- Generate bills (idempotent — skips if bills already exist).
    -- CUTOVER: also skipped entirely for hostellers (billed via Campus Living).
    SELECT count(*) INTO v_bills_existing
      FROM public.billing_student_bills
     WHERE student_id = p_learner_id;

    IF v_bills_existing = 0 AND NOT v_is_hosteller THEN
        v_due_date := (now() + interval '30 days')::date;

        FOR v_item IN SELECT * FROM jsonb_array_elements(v_fee_items)
        LOOP
            IF (v_item->>'amount')::numeric > 0 THEN
                INSERT INTO public.billing_student_bills (
                    student_id, institution_id, item_category_id,
                    bill_description, due_date, quantity,
                    unit_amount, total_amount, tax_amount, final_amount,
                    balance_amount, status, remarks, created_by
                ) VALUES (
                    p_learner_id,
                    v_lead.institution_id,
                    NULLIF(v_item->>'category_id','')::uuid,
                    COALESCE(v_item->>'category_name','Fee Item'),
                    v_due_date,
                    1,
                    (v_item->>'amount')::numeric,
                    (v_item->>'amount')::numeric,
                    0,
                    (v_item->>'amount')::numeric,
                    (v_item->>'amount')::numeric,
                    'unpaid',
                    'Onboarding bill — auto-generated via account transition RPC',
                    v_caller
                );
                v_bills_inserted := v_bills_inserted + 1;
            END IF;
        END LOOP;
    END IF;

    v_result := jsonb_build_object(
        'success', true,
        'learner_id', p_learner_id,
        'lifecycle_status', 'account',
        'documents_recorded', jsonb_array_length(p_received_documents),
        'bills_existing', v_bills_existing,
        'bills_generated', v_bills_inserted,
        'fee_items_count', jsonb_array_length(v_fee_items),
        'verified', (p_idempotency_key IS NOT NULL)
    );

    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public.admission_account_transition_log
            (idempotency_key, learner_id, result, created_by)
        VALUES
            (p_idempotency_key, p_learner_id, v_result, v_caller)
        ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN v_result;
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.admission_account_transition_with_bills(uuid, jsonb, jsonb, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admission_account_transition_with_bills(uuid, jsonb, jsonb, uuid, text) TO authenticated;
-- ============================================================================
-- 20260509100007 — admission_approve_fee_change_event RPC
-- ============================================================================
-- Spec §8.3.2. Atomic approval of fee_change_events with per-line decisions.
-- Any RAISE EXCEPTION rolls back everything.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admission_approve_fee_change_event(
    p_event_id        uuid,
    p_line_decisions  jsonb,           -- [{billing_category_id, decision, reallocation_amount?, decision_notes?}]
    p_refund_excess   boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event             record;
    v_caller            uuid := auth.uid();
    v_decision          jsonb;
    v_line_cat_id       uuid;
    v_decision_kind     text;
    v_reallocate_amount numeric(15,2);
    v_old_amount        numeric(15,2);
    v_new_amount        numeric(15,2);
    v_paid_so_far       numeric(15,2);
    v_delta             numeric(15,2);
    v_old_bill_id       uuid;
    v_new_bill_id       uuid;
    v_credit_balance_id uuid;
    v_summary           jsonb := '{"new_bills":0,"superseded_bills":0,"credit_balances":0,"reallocations":0}'::jsonb;
    v_due_date          date := (now() + interval '30 days')::date;
    v_lead              record;
BEGIN
    -- 1. Permission
    IF NOT public.user_has_permission('admission_fees.approve_change_event') THEN
        RAISE EXCEPTION 'permission_denied: admission_fees.approve_change_event required'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Load event
    SELECT * INTO v_event
      FROM public.admission_fee_change_events
     WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found: %', p_event_id USING ERRCODE = 'P0002';
    END IF;
    IF v_event.status <> 'pending_review' THEN
        RAISE EXCEPTION 'event_not_pending: %', v_event.status;
    END IF;

    -- 3. Load lead (institution_id needed for new bills)
    SELECT id, institution_id INTO v_lead
      FROM public.learners_profiles
     WHERE id = v_event.learner_id;

    -- 4. For each decision in p_line_decisions, apply
    FOR v_decision IN SELECT * FROM jsonb_array_elements(p_line_decisions)
    LOOP
        v_line_cat_id       := (v_decision->>'billing_category_id')::uuid;
        v_decision_kind     := v_decision->>'decision';
        v_reallocate_amount := COALESCE((v_decision->>'reallocation_amount')::numeric, 0);

        -- Pull the event_line snapshot
        SELECT old_amount, new_amount, paid_amount_so_far
          INTO v_old_amount, v_new_amount, v_paid_so_far
          FROM public.admission_fee_change_event_lines
         WHERE event_id = p_event_id AND billing_category_id = v_line_cat_id;

        v_delta := COALESCE(v_new_amount, 0) - COALESCE(v_old_amount, 0);

        -- Pick the most recent active old bill in this category (for supersede / reallocate)
        SELECT id INTO v_old_bill_id
          FROM public.billing_student_bills
         WHERE student_id = v_event.learner_id
           AND item_category_id = v_line_cat_id
           AND status <> 'superseded'
         ORDER BY created_at DESC LIMIT 1;

        CASE v_decision_kind
        WHEN 'apply_supplemental' THEN
            -- Only when delta > 0
            IF v_delta > 0 THEN
                INSERT INTO public.billing_student_bills (
                    student_id, institution_id, item_category_id, bill_description,
                    due_date, quantity, unit_amount, total_amount, tax_amount, final_amount,
                    balance_amount, status, remarks, created_by
                ) VALUES (
                    v_event.learner_id, v_lead.institution_id, v_line_cat_id,
                    'Supplemental — fee structure change',
                    v_due_date, 1, v_delta, v_delta, 0, v_delta,
                    v_delta, 'unpaid',
                    'Supplemental bill for fee structure change event ' || p_event_id::text,
                    v_caller
                ) RETURNING id INTO v_new_bill_id;
                v_summary := jsonb_set(v_summary, '{new_bills}',
                    to_jsonb((v_summary->>'new_bills')::int + 1));
            END IF;

        WHEN 'issue_credit_note' THEN
            -- Only when delta < 0 (parent owes less now); credit balance covers the delta
            IF v_delta < 0 THEN
                INSERT INTO public.student_credit_balances (
                    student_id, amount, source, source_event_id, notes, created_by
                ) VALUES (
                    v_event.learner_id, ABS(v_delta), 'fee_structure_change', p_event_id,
                    'Credit note for ' || v_line_cat_id::text || ' (delta ' || v_delta::text || ')',
                    v_caller
                ) RETURNING id INTO v_credit_balance_id;
                v_summary := jsonb_set(v_summary, '{credit_balances}',
                    to_jsonb((v_summary->>'credit_balances')::int + 1));
            END IF;

        WHEN 'refund_payment' THEN
            -- Mark for manual refund — credit balance entry with notes
            IF v_paid_so_far > 0 THEN
                INSERT INTO public.student_credit_balances (
                    student_id, amount, source, source_event_id, notes, created_by
                ) VALUES (
                    v_event.learner_id, v_paid_so_far, 'fee_structure_change', p_event_id,
                    'REFUND REQUESTED — manual refund pending; original bill ' || COALESCE(v_old_bill_id::text,'(none)'),
                    v_caller
                ) RETURNING id INTO v_credit_balance_id;
                v_summary := jsonb_set(v_summary, '{credit_balances}',
                    to_jsonb((v_summary->>'credit_balances')::int + 1));
            END IF;

        WHEN 'reallocate_payment' THEN
            -- Supersede old bill, create new bill, reallocate paid amount
            IF v_old_bill_id IS NOT NULL THEN
                UPDATE public.billing_student_bills
                   SET status = 'superseded', updated_at = now()
                 WHERE id = v_old_bill_id;
                v_summary := jsonb_set(v_summary, '{superseded_bills}',
                    to_jsonb((v_summary->>'superseded_bills')::int + 1));
            END IF;
            IF COALESCE(v_new_amount, 0) > 0 THEN
                INSERT INTO public.billing_student_bills (
                    student_id, institution_id, item_category_id, bill_description,
                    due_date, quantity, unit_amount, total_amount, tax_amount, final_amount,
                    balance_amount, status, remarks, created_by
                ) VALUES (
                    v_event.learner_id, v_lead.institution_id, v_line_cat_id,
                    'Replacement — fee structure change',
                    v_due_date, 1, v_new_amount, v_new_amount, 0, v_new_amount,
                    GREATEST(0, v_new_amount - LEAST(v_paid_so_far, v_new_amount)),
                    CASE
                      WHEN v_paid_so_far >= v_new_amount THEN 'paid'
                      WHEN v_paid_so_far > 0 THEN 'partially_paid'
                      ELSE 'unpaid' END,
                    'Replacement bill for fee structure change event ' || p_event_id::text,
                    v_caller
                ) RETURNING id INTO v_new_bill_id;
                v_summary := jsonb_set(v_summary, '{new_bills}',
                    to_jsonb((v_summary->>'new_bills')::int + 1));

                -- Link supersede chain
                IF v_old_bill_id IS NOT NULL THEN
                    UPDATE public.billing_student_bills
                       SET superseded_by_bill_id = v_new_bill_id
                     WHERE id = v_old_bill_id;
                END IF;

                -- Reallocate prior payments: copy receipt_items rows pointing at old bill
                -- into NEW rows pointing at the new bill (NEVER mutate originals)
                IF v_paid_so_far > 0 AND v_old_bill_id IS NOT NULL THEN
                    INSERT INTO public.billing_receipt_items (
                        receipt_id, bill_id, amount_paid, allocation_reason
                    )
                    SELECT receipt_id,
                           v_new_bill_id,
                           LEAST(amount_paid, v_new_amount),
                           'fee_structure_change_reallocation'
                      FROM public.billing_receipt_items
                     WHERE bill_id = v_old_bill_id
                       AND allocation_reason = 'original_payment';
                    -- Increment the reallocations counter (each line that runs reallocation
                    -- counts once; the GET DIAGNOSTICS form was a draft mistake — never
                    -- assign GET DIAGNOSTICS to v_summary because it would overwrite the
                    -- JSONB with an integer).
                    v_summary := jsonb_set(v_summary, '{reallocations}',
                        to_jsonb((v_summary->>'reallocations')::int + 1));

                    -- Excess (paid > new amount) → credit_balance
                    IF v_paid_so_far > v_new_amount THEN
                        INSERT INTO public.student_credit_balances (
                            student_id, amount, source, source_event_id, notes, created_by
                        ) VALUES (
                            v_event.learner_id, v_paid_so_far - v_new_amount, 'fee_structure_change',
                            p_event_id,
                            CASE WHEN p_refund_excess
                                 THEN 'EXCESS — refund flag set; manual refund pending'
                                 ELSE 'EXCESS from reallocation; available against future bills' END,
                            v_caller
                        );
                        v_summary := jsonb_set(v_summary, '{credit_balances}',
                            to_jsonb((v_summary->>'credit_balances')::int + 1));
                    END IF;
                END IF;
            END IF;

        WHEN 'waive_delta', 'do_nothing' THEN
            -- No artifact
            NULL;

        ELSE
            RAISE EXCEPTION 'unknown_decision: %', v_decision_kind;
        END CASE;

        -- Persist the decision + artifact id back on the event_line
        UPDATE public.admission_fee_change_event_lines
           SET decision              = v_decision_kind,
               generated_artifact_id = COALESCE(v_new_bill_id, v_credit_balance_id),
               decision_notes        = v_decision->>'decision_notes'
         WHERE event_id = p_event_id AND billing_category_id = v_line_cat_id;

        v_new_bill_id := NULL;
        v_credit_balance_id := NULL;
    END LOOP;

    -- 5. Refresh resolved fee_items snapshot
    PERFORM public.admission_resolve_fee_items_for_lead(v_event.learner_id);

    -- 6. Mark event approved
    UPDATE public.admission_fee_change_events
       SET status      = 'approved',
           decided_by  = v_caller,
           decided_at  = now(),
           updated_at  = now()
     WHERE id = p_event_id;

    RETURN jsonb_build_object(
        'success', true,
        'event_id', p_event_id,
        'summary', v_summary
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.admission_approve_fee_change_event(uuid, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admission_approve_fee_change_event(uuid, jsonb, boolean) TO authenticated;

-- ============================================================================
-- set_legacy_fee_mode_default trigger function (Plan 6 Task 1)
-- ============================================================================
-- BEFORE INSERT trigger function on learners_profiles. Flips the row's
-- legacy_fee_mode to false when the institution's
-- admission_settings_per_institution.use_fee_structures flag is true.
-- Flag false or missing → DDL default of true is preserved (fail-closed).
-- Spec §12.1
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_legacy_fee_mode_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_use_fee_structures boolean;
BEGIN
    IF NEW.institution_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT use_fee_structures INTO v_use_fee_structures
      FROM public.admission_settings_per_institution
     WHERE institution_id = NEW.institution_id;

    IF v_use_fee_structures = true THEN
        NEW.legacy_fee_mode := false;
    END IF;
    -- Flag false or missing → keep whatever was passed (defaults to true via DDL)

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_legacy_fee_mode_default() FROM PUBLIC;

-- ============================================================================
-- admission_adopt_structure_for_lead RPC (Plan 6 Task 6)
-- ============================================================================
-- Atomically: flip legacy_fee_mode=false, resolve fee_items via the existing
-- resolution RPC, persist resolved items. Any RAISE EXCEPTION rolls back.
--
-- Replaces the Plan 3 service-level sequence (flip-flag + resolve + log) with
-- a single SECURITY DEFINER call so the flag flip and fee resolution are
-- transactionally atomic.
--
-- Permission gate: admission_fees.manage_adjustments
-- (admin-tier; granted in 20260507100003)
--
-- Spec §12.1
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admission_adopt_structure_for_lead(p_learner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_resolved jsonb;
    v_caller   uuid := auth.uid();
BEGIN
    IF NOT public.user_has_permission('admission_fees.manage_adjustments') THEN
        RAISE EXCEPTION 'permission_denied: admission_fees.manage_adjustments required'
            USING ERRCODE = '42501';
    END IF;

    -- Flip the flag
    UPDATE public.learners_profiles
       SET legacy_fee_mode = false,
           updated_at = now(),
           updated_by = v_caller
     WHERE id = p_learner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    -- Resolve fee_items (this also writes them back to the row)
    v_resolved := public.admission_resolve_fee_items_for_lead(p_learner_id);

    -- Hard fail if no match — adoption shouldn't succeed silently into empty fees
    IF jsonb_array_length(v_resolved) = 0 THEN
        RAISE EXCEPTION 'adopt_structure_no_match: 8-dim lookup found no fee structure';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'learner_id', p_learner_id,
        'fee_items', v_resolved,
        'item_count', jsonb_array_length(v_resolved)
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.admission_adopt_structure_for_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admission_adopt_structure_for_lead(uuid) TO authenticated;

-- ============================================================================
-- 2026-05-11 — Admission leads RLS gap closure
--   Migration: 20260511000000_admission_leads_close_rls_asymmetry_and_primary_role_strict_check.sql
--   Bugs:     BUG-003934, BUG-003933, BUG-003932, BUG-003928
--
--   - _user_owns_lead_via_counselor_id (NEW): mirrors the API helper at
--     lib/api-helpers/admission-counselor-scope.ts so RLS can grant
--     visibility via the legacy admission_leads.counselor_id column,
--     not just assigned_counselor_id. Closes list-vs-detail asymmetry.
--   - _user_is_strict_counselor (REWRITTEN): require is_primary on the
--     counselor branch so multi-role executives (hr_admin + secondary
--     admission_counselor) keep their broader visibility.
--   - _user_can_view_lead_for_call (REWRITTEN): adopts the OR-both-columns
--     visibility model used by the leads policies.
--
--   The adm_leads_select / adm_leads_update policies that consume these
--   functions live in the migration above (no canonical setup/03 file
--   for admission_leads policies — they're migration-only by convention).
-- ============================================================================

CREATE OR REPLACE FUNCTION public._user_owns_lead_via_counselor_id(p_uid uuid, p_counselor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_counselor_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM admission_counselors
        WHERE id = p_counselor_id AND user_id = p_uid
     );
$$;

COMMENT ON FUNCTION public._user_owns_lead_via_counselor_id(uuid, uuid) IS
  'Closes RLS gap where lib/api-helpers/admission-counselor-scope.ts grants list visibility via counselor_id but RLS does not. Added 2026-05-11.';

CREATE OR REPLACE FUNCTION public._user_is_strict_counselor(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = p_uid
        AND cr.role_key IN (
          'admission_counselor','expo_counselor','learner_counselor','staff_counselor'
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = p_uid
        AND cr.role_key IN (
          'admission','admission_staff','administrator','super_admin',
          'ceo','coo','cbo','registrar'
        )
    );
$$;

COMMENT ON FUNCTION public._user_is_strict_counselor(uuid) IS
  'TRUE iff user holds a counselor role AND no admission/admission_staff/admin/exec override. is_primary is NOT consulted. Updated 2026-05-11 per user requirement: admission_staff and tier-1 execs (ceo/coo/cbo/registrar) keep broad visibility even with secondary counselor role; everyone else with a counselor role sees assigned leads only.';

-- 2026-05-11: defense-in-depth allowlist for admission.leads.view. Even if
-- the permission gets re-granted to a non-allowlist role via Role
-- Management, RLS and the list API enforce the canonical role_key set here.
-- Keep this in sync with LEAD_VIEW_ALLOWLIST_ROLE_KEYS in
-- lib/api-helpers/admission-counselor-scope.ts.
CREATE OR REPLACE FUNCTION public._user_in_admission_lead_allowlist(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM user_roles ur
      JOIN custom_roles cr ON cr.id = ur.role_id
     WHERE ur.user_id = p_uid
       AND cr.role_key IN (
         'admission', 'admission_staff',
         'administrator',
         'ceo', 'coo', 'cbo', 'registrar',
         'admission_counselor', 'expo_counselor',
         'learner_counselor',   'staff_counselor',
         'seo'
       )
  );
$$;

COMMENT ON FUNCTION public._user_in_admission_lead_allowlist(uuid) IS
  'Defense-in-depth allowlist for admission.leads.view. Returns TRUE iff user holds one of: admission, admission_staff, administrator, ceo, coo, cbo, registrar, any of 4 counselor role_keys, or seo. Updated 2026-05-26 to include seo role.';

GRANT EXECUTE ON FUNCTION public._user_in_admission_lead_allowlist(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public._user_can_view_lead_for_call(p_uid uuid, p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM admission_leads l
     WHERE l.id = p_lead_id
       AND l.source <> 'referral'
       AND (
         l.assigned_counselor_id = p_uid
         OR _user_owns_lead_via_counselor_id(p_uid, l.counselor_id)
       )
  );
$$;

COMMENT ON FUNCTION public._user_can_view_lead_for_call(uuid, uuid) IS
  'SECURITY DEFINER lookup: does this user own this NON-REFERRAL lead via assigned_counselor_id OR counselor_id? Updated 2026-05-11 to close RLS asymmetry.';

-- ──────────────────────────────────────────────────────────────
-- 2026-05-12 — Admission Campaign Attribution (Migration A) triggers
-- Reuses existing update_updated_at_column() function.
-- See: docs/superpowers/specs/2026-05-12-admission-campaign-attribution-design.md §4.1
-- ──────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_admission_campaigns_updated ON admission_campaigns;
CREATE TRIGGER trg_admission_campaigns_updated
  BEFORE UPDATE ON admission_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_admission_campaign_links_updated ON admission_campaign_links;
CREATE TRIGGER trg_admission_campaign_links_updated
  BEFORE UPDATE ON admission_campaign_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────────────────────
-- Campaign attribution triggers (added 2026-05-12, see migration 20260512100003_c)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_lead_campaign_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.campaign_link_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE admission_leads
     SET first_campaign_link_id = COALESCE(first_campaign_link_id, NEW.campaign_link_id),
         last_campaign_link_id  = NEW.campaign_link_id,
         updated_at             = now()
   WHERE id = NEW.lead_id;

  UPDATE admission_campaign_links
     SET capture_count = capture_count + 1,
         updated_at    = now()
   WHERE id = NEW.campaign_link_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lead_campaign_attribution ON admission_lead_source_captures;
CREATE TRIGGER trg_sync_lead_campaign_attribution
AFTER INSERT ON admission_lead_source_captures
FOR EACH ROW EXECUTE FUNCTION sync_lead_campaign_attribution();

CREATE OR REPLACE FUNCTION link_click_to_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.campaign_link_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE admission_campaign_link_clicks
     SET resulted_in_submission = true,
         resulted_lead_id       = NEW.lead_id
   WHERE id = (
     SELECT id FROM admission_campaign_link_clicks
      WHERE link_id = NEW.campaign_link_id
        AND clicked_at >= now() - INTERVAL '24 hours'
        AND resulted_in_submission = false
      ORDER BY clicked_at DESC
      LIMIT 1
   );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_click_to_submission ON admission_form_submissions;
CREATE TRIGGER trg_link_click_to_submission
AFTER INSERT ON admission_form_submissions
FOR EACH ROW EXECUTE FUNCTION link_click_to_submission();

-- ──────────────────────────────────────────────────────────────
-- Campaign attribution RLS policies (added 2026-05-12, see migration 20260512100004_d)
-- ──────────────────────────────────────────────────────────────
-- The SECURITY DEFINER helper _campaign_link_institution_id avoids the
-- 42P17 transitive-recursion loop that would otherwise happen when
-- admission_campaign_links policies query admission_campaigns (which
-- has its own policies). Pattern mirrored from _expo_event_institution_id.

CREATE OR REPLACE FUNCTION _campaign_link_institution_id(p_link_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.institution_id
    FROM admission_campaign_links l
    JOIN admission_campaigns c ON c.id = l.campaign_id
   WHERE l.id = p_link_id;
$$;

GRANT EXECUTE ON FUNCTION _campaign_link_institution_id(uuid) TO authenticated;

ALTER TABLE admission_campaigns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_campaign_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_campaign_link_clicks ENABLE ROW LEVEL SECURITY;

-- ──── admission_campaigns ────
DROP POLICY IF EXISTS p_campaigns_select ON admission_campaigns;
CREATE POLICY p_campaigns_select ON admission_campaigns FOR SELECT TO authenticated USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.view')
      AND role_has_institution_access(institution_id))
);

-- p_campaigns_insert (2026-05-13): scope-aware insert policy.
-- - Super admin can insert anything.
-- - Institution-scoped campaigns require institution access on the row.
-- - Global campaigns require the user to have at least one role with
--   institution_scope='all' (user_has_all_institution_access() defined
--   in migration 20260513180000).
DROP POLICY IF EXISTS p_campaigns_insert ON admission_campaigns;
CREATE POLICY p_campaigns_insert ON admission_campaigns FOR INSERT TO authenticated WITH CHECK (
  is_super_admin()
  OR (
    scope = 'institution'
    AND (
      is_admin()
      OR (
        user_has_permission('admission.marketing.create')
        AND role_has_institution_access(institution_id)
      )
    )
  )
  OR (
    scope = 'global'
    AND (
      is_admin()
      OR (
        user_has_permission('admission.marketing.create')
        AND user_has_all_institution_access()
      )
    )
  )
);

DROP POLICY IF EXISTS p_campaigns_update ON admission_campaigns;
CREATE POLICY p_campaigns_update ON admission_campaigns FOR UPDATE TO authenticated
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('admission.marketing.edit')
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('admission.marketing.edit')
        AND role_has_institution_access(institution_id))
  );

-- No DELETE policy — soft-archive only via UPDATE archived_at

-- ──── admission_campaign_links ────
DROP POLICY IF EXISTS p_links_select ON admission_campaign_links;
CREATE POLICY p_links_select ON admission_campaign_links FOR SELECT TO authenticated USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.view')
      AND role_has_institution_access(_campaign_link_institution_id(id)))
);

DROP POLICY IF EXISTS p_links_insert ON admission_campaign_links;
CREATE POLICY p_links_insert ON admission_campaign_links FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.create')
      AND EXISTS (
        SELECT 1 FROM admission_campaigns c
         WHERE c.id = campaign_id
           AND role_has_institution_access(c.institution_id)
      ))
);

DROP POLICY IF EXISTS p_links_update ON admission_campaign_links;
CREATE POLICY p_links_update ON admission_campaign_links FOR UPDATE TO authenticated
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('admission.marketing.edit')
        AND role_has_institution_access(_campaign_link_institution_id(id)))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('admission.marketing.edit')
        AND role_has_institution_access(_campaign_link_institution_id(id)))
  );

-- ──── admission_campaign_link_clicks ────
-- SELECT only for authenticated users; INSERT happens via service-role
-- from the /c/[token] route handler (anonymous public-side action).
DROP POLICY IF EXISTS p_clicks_select ON admission_campaign_link_clicks;
CREATE POLICY p_clicks_select ON admission_campaign_link_clicks FOR SELECT TO authenticated USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.view')
      AND EXISTS (
        SELECT 1 FROM admission_campaigns c
         WHERE c.id = campaign_id
           AND role_has_institution_access(c.institution_id)
      ))
);

-- ──────────────────────────────────────────────────────────────
-- Campaign analytics RPC: get_campaign_funnel (added 2026-05-12, migration 20260512100006_f1)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_campaign_funnel(
  p_campaign_id        uuid,
  p_attribution_mode   text    DEFAULT 'first',  -- 'first' | 'last' | 'any'
  p_start_date         timestamptz DEFAULT NULL,
  p_end_date           timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_institution_id uuid;
  v_link_ids       uuid[];
  v_clicks         integer := 0;
  v_captures       integer := 0;
  v_qualified      integer := 0;
  v_applied        integer := 0;
  v_enrolled       integer := 0;
BEGIN
  -- Access control
  SELECT institution_id INTO v_institution_id
    FROM admission_campaigns WHERE id = p_campaign_id;

  IF v_institution_id IS NULL THEN
    RAISE EXCEPTION 'campaign not found';
  END IF;

  IF NOT (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('admission.marketing.view')
        AND role_has_institution_access(v_institution_id))
  ) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  -- Collect this campaign's link IDs (used in all subsequent queries)
  SELECT array_agg(id) INTO v_link_ids
    FROM admission_campaign_links WHERE campaign_id = p_campaign_id;

  -- If no links exist yet, return all zeros (campaign just created)
  IF v_link_ids IS NULL OR cardinality(v_link_ids) = 0 THEN
    RETURN jsonb_build_object(
      'campaign_id',      p_campaign_id,
      'attribution_mode', p_attribution_mode,
      'date_range',       jsonb_build_object('from', p_start_date, 'to', p_end_date),
      'stages',           jsonb_build_object('clicks',0,'captures',0,'qualified',0,'applied',0,'enrolled',0),
      'rates',            jsonb_build_object('click_to_capture',0,'capture_to_qual',0,'qual_to_applied',0,'applied_to_enrol',0,'overall',0)
    );
  END IF;

  -- Clicks (from append-only log)
  SELECT COUNT(*) INTO v_clicks
    FROM admission_campaign_link_clicks
   WHERE link_id = ANY(v_link_ids)
     AND (p_start_date IS NULL OR clicked_at >= p_start_date)
     AND (p_end_date   IS NULL OR clicked_at <  p_end_date);

  -- Captures + funnel-stage rollups (attribution-mode aware)
  WITH attributed_leads AS (
    SELECT DISTINCT l.id, l.funnel_stage, l.created_at
      FROM admission_leads l
     WHERE
       CASE p_attribution_mode
         WHEN 'first' THEN l.first_campaign_link_id = ANY(v_link_ids)
         WHEN 'last'  THEN l.last_campaign_link_id  = ANY(v_link_ids)
         WHEN 'any'   THEN EXISTS (
           SELECT 1 FROM admission_lead_source_captures c
            WHERE c.lead_id = l.id AND c.campaign_link_id = ANY(v_link_ids)
         )
       END
       AND (p_start_date IS NULL OR l.created_at >= p_start_date)
       AND (p_end_date   IS NULL OR l.created_at <  p_end_date)
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE funnel_stage IN (
      'qualified','application_started','application_submitted',
      'documents_pending','documents_verified','interview_scheduled',
      'interview_completed','offer_sent','offer_accepted','token_paid','enrolled')),
    COUNT(*) FILTER (WHERE funnel_stage IN (
      'application_submitted','documents_pending','documents_verified',
      'interview_scheduled','interview_completed','offer_sent',
      'offer_accepted','token_paid','enrolled')),
    COUNT(*) FILTER (WHERE funnel_stage = 'enrolled')
  INTO v_captures, v_qualified, v_applied, v_enrolled
  FROM attributed_leads;

  RETURN jsonb_build_object(
    'campaign_id',      p_campaign_id,
    'attribution_mode', p_attribution_mode,
    'date_range',       jsonb_build_object('from', p_start_date, 'to', p_end_date),
    'stages', jsonb_build_object(
      'clicks',    v_clicks,    'captures',  v_captures,
      'qualified', v_qualified, 'applied',   v_applied,
      'enrolled',  v_enrolled),
    'rates',  jsonb_build_object(
      'click_to_capture', CASE WHEN v_clicks    > 0 THEN ROUND(100.0 * v_captures  / v_clicks,    2) ELSE 0 END,
      'capture_to_qual',  CASE WHEN v_captures  > 0 THEN ROUND(100.0 * v_qualified / v_captures,  2) ELSE 0 END,
      'qual_to_applied',  CASE WHEN v_qualified > 0 THEN ROUND(100.0 * v_applied   / v_qualified, 2) ELSE 0 END,
      'applied_to_enrol', CASE WHEN v_applied   > 0 THEN ROUND(100.0 * v_enrolled  / v_applied,   2) ELSE 0 END,
      'overall',          CASE WHEN v_clicks    > 0 THEN ROUND(100.0 * v_enrolled  / v_clicks,    2) ELSE 0 END)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_funnel(uuid, text, timestamptz, timestamptz) TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- Campaign analytics RPC: get_campaign_time_series (added 2026-05-12, migration 20260512100007_f2)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_campaign_time_series(
  p_campaign_id        uuid,
  p_attribution_mode   text    DEFAULT 'first',
  p_granularity        text    DEFAULT 'day',     -- 'day' | 'week' | 'month'
  p_start_date         timestamptz DEFAULT (now() - INTERVAL '30 days'),
  p_end_date           timestamptz DEFAULT now()
)
RETURNS TABLE (
  bucket_at  timestamptz,
  clicks     integer,
  captures   integer,
  qualified  integer,
  applied    integer,
  enrolled   integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_institution_id uuid;
  v_link_ids       uuid[];
  v_trunc          text;
BEGIN
  -- Access control
  SELECT institution_id INTO v_institution_id
    FROM admission_campaigns WHERE id = p_campaign_id;

  IF v_institution_id IS NULL THEN
    RAISE EXCEPTION 'campaign not found';
  END IF;

  IF NOT (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('admission.marketing.view')
        AND role_has_institution_access(v_institution_id))
  ) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  -- Validate granularity to prevent SQL injection via date_trunc
  v_trunc := CASE p_granularity
               WHEN 'day'   THEN 'day'
               WHEN 'week'  THEN 'week'
               WHEN 'month' THEN 'month'
               ELSE 'day'
             END;

  SELECT array_agg(id) INTO v_link_ids
    FROM admission_campaign_links WHERE campaign_id = p_campaign_id;

  IF v_link_ids IS NULL OR cardinality(v_link_ids) = 0 THEN
    -- Still return the time buckets (with zeros) so the chart renders empty
    RETURN QUERY
    SELECT b.bucket::timestamptz,
           0::integer, 0::integer, 0::integer, 0::integer, 0::integer
      FROM generate_series(
        date_trunc(v_trunc, p_start_date),
        date_trunc(v_trunc, p_end_date),
        ('1 ' || v_trunc)::interval
      ) AS b(bucket)
    ORDER BY 1;
    RETURN;
  END IF;

  RETURN QUERY
  WITH buckets AS (
    SELECT generate_series(
      date_trunc(v_trunc, p_start_date),
      date_trunc(v_trunc, p_end_date),
      ('1 ' || v_trunc)::interval
    ) AS bucket
  ),
  clicks_by_bucket AS (
    SELECT date_trunc(v_trunc, clicked_at) AS bucket, COUNT(*) AS n
      FROM admission_campaign_link_clicks
     WHERE link_id = ANY(v_link_ids)
       AND clicked_at >= p_start_date
       AND clicked_at <  p_end_date
     GROUP BY 1
  ),
  attributed AS (
    SELECT l.id, l.funnel_stage, date_trunc(v_trunc, l.created_at) AS bucket
      FROM admission_leads l
     WHERE
       CASE p_attribution_mode
         WHEN 'first' THEN l.first_campaign_link_id = ANY(v_link_ids)
         WHEN 'last'  THEN l.last_campaign_link_id  = ANY(v_link_ids)
         WHEN 'any'   THEN EXISTS (
           SELECT 1 FROM admission_lead_source_captures c
            WHERE c.lead_id = l.id AND c.campaign_link_id = ANY(v_link_ids)
         )
       END
       AND l.created_at >= p_start_date
       AND l.created_at <  p_end_date
  )
  SELECT
    b.bucket                                                                      AS bucket_at,
    COALESCE(cb.n, 0)::integer                                                    AS clicks,
    COUNT(a.id)::integer                                                          AS captures,
    COUNT(a.id) FILTER (WHERE a.funnel_stage IN (
      'qualified','application_started','application_submitted',
      'documents_pending','documents_verified','interview_scheduled',
      'interview_completed','offer_sent','offer_accepted','token_paid','enrolled'))::integer AS qualified,
    COUNT(a.id) FILTER (WHERE a.funnel_stage IN (
      'application_submitted','documents_pending','documents_verified',
      'interview_scheduled','interview_completed','offer_sent',
      'offer_accepted','token_paid','enrolled'))::integer AS applied,
    COUNT(a.id) FILTER (WHERE a.funnel_stage = 'enrolled')::integer               AS enrolled
  FROM buckets b
  LEFT JOIN clicks_by_bucket cb ON cb.bucket = b.bucket
  LEFT JOIN attributed a        ON a.bucket  = b.bucket
  GROUP BY b.bucket, cb.n
  ORDER BY b.bucket;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_time_series(uuid, text, text, timestamptz, timestamptz) TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- Campaign analytics RPC: get_campaigns_compare (added 2026-05-12, migration 20260512100008_f3)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_campaigns_compare(
  p_campaign_ids       uuid[],
  p_attribution_mode   text    DEFAULT 'first',
  p_start_date         timestamptz DEFAULT NULL,
  p_end_date           timestamptz DEFAULT NULL
)
RETURNS TABLE (
  campaign_id     uuid,
  campaign_name   text,
  source          lead_source,
  budget_inr      numeric,
  spent_inr       numeric,
  clicks          integer,
  captures        integer,
  qualified       integer,
  applied         integer,
  enrolled        integer,
  cpl             numeric,
  cpe             numeric,
  conversion_rate numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    c.id                                                                                              AS campaign_id,
    c.name                                                                                            AS campaign_name,
    c.source                                                                                          AS source,
    c.budget_inr                                                                                      AS budget_inr,
    COALESCE((SELECT SUM(l.cost_inr) FROM admission_campaign_links l WHERE l.campaign_id = c.id), 0)  AS spent_inr,
    (f.payload->'stages'->>'clicks')::integer                                                         AS clicks,
    (f.payload->'stages'->>'captures')::integer                                                       AS captures,
    (f.payload->'stages'->>'qualified')::integer                                                      AS qualified,
    (f.payload->'stages'->>'applied')::integer                                                        AS applied,
    (f.payload->'stages'->>'enrolled')::integer                                                       AS enrolled,
    CASE WHEN (f.payload->'stages'->>'captures')::integer > 0
         THEN ROUND(
                COALESCE((SELECT SUM(l.cost_inr) FROM admission_campaign_links l WHERE l.campaign_id = c.id), 0)
                / NULLIF((f.payload->'stages'->>'captures')::integer, 0)::numeric,
                2)
    END                                                                                               AS cpl,
    CASE WHEN (f.payload->'stages'->>'enrolled')::integer > 0
         THEN ROUND(
                COALESCE((SELECT SUM(l.cost_inr) FROM admission_campaign_links l WHERE l.campaign_id = c.id), 0)
                / NULLIF((f.payload->'stages'->>'enrolled')::integer, 0)::numeric,
                2)
    END                                                                                               AS cpe,
    (f.payload->'rates'->>'overall')::numeric                                                         AS conversion_rate
  FROM unnest(p_campaign_ids) AS cid
  JOIN admission_campaigns c ON c.id = cid
  CROSS JOIN LATERAL (
    SELECT get_campaign_funnel(c.id, p_attribution_mode, p_start_date, p_end_date) AS payload
  ) f
  WHERE is_super_admin()
     OR is_admin()
     OR (user_has_permission('admission.marketing.view')
         AND role_has_institution_access(c.institution_id));
$$;

GRANT EXECUTE ON FUNCTION public.get_campaigns_compare(uuid[], text, timestamptz, timestamptz) TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- Campaign utility RPCs: increment_clicks + overview_stats + reconcile_counters
-- (added 2026-05-12, migration 20260512100009_f4)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_campaign_link_clicks(p_link_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE admission_campaign_links
     SET click_count = click_count + 1,
         updated_at  = now()
   WHERE id = p_link_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_campaign_link_clicks(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_campaigns_overview_stats(
  p_start_date timestamptz DEFAULT (now() - INTERVAL '30 days'),
  p_end_date   timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('admission.marketing.view')
  ) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  WITH visible_campaigns AS (
    SELECT id, status, budget_inr, archived_at
      FROM admission_campaigns
     WHERE archived_at IS NULL
       AND (is_super_admin() OR is_admin() OR role_has_institution_access(institution_id))
  ),
  visible_links AS (
    SELECT l.id, l.cost_inr, l.click_count, l.capture_count
      FROM admission_campaign_links l
      JOIN visible_campaigns c ON c.id = l.campaign_id
  )
  SELECT jsonb_build_object(
    'total_active',    (SELECT COUNT(*) FROM visible_campaigns WHERE status = 'active'),
    'total_paused',    (SELECT COUNT(*) FROM visible_campaigns WHERE status = 'paused'),
    'total_archived',  0,
    'total_spent_inr', COALESCE((SELECT SUM(cost_inr) FROM visible_links), 0),
    'total_clicks',    COALESCE((SELECT SUM(click_count) FROM visible_links), 0),
    'total_captures',  COALESCE((SELECT SUM(capture_count) FROM visible_links), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaigns_overview_stats(timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_campaign_link_counters()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clicks_updated   integer;
  v_captures_updated integer;
BEGIN
  IF NOT (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('admission.marketing.edit')
  ) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  UPDATE admission_campaign_links l
     SET click_count = sub.n
    FROM (
      SELECT l2.id AS link_id,
             COALESCE((SELECT COUNT(*) FROM admission_campaign_link_clicks c WHERE c.link_id = l2.id), 0)::integer AS n
        FROM admission_campaign_links l2
    ) sub
   WHERE l.id = sub.link_id
     AND l.click_count <> sub.n;
  GET DIAGNOSTICS v_clicks_updated = ROW_COUNT;

  UPDATE admission_campaign_links l
     SET capture_count = sub.n
    FROM (
      SELECT l2.id AS link_id,
             COALESCE((SELECT COUNT(*) FROM admission_lead_source_captures c
                        WHERE c.campaign_link_id = l2.id), 0)::integer AS n
        FROM admission_campaign_links l2
    ) sub
   WHERE l.id = sub.link_id
     AND l.capture_count <> sub.n;
  GET DIAGNOSTICS v_captures_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'clicks_updated',   v_clicks_updated,
    'captures_updated', v_captures_updated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_campaign_link_counters() TO authenticated;

-- ================================================================================
-- SECTION: PROGRAMME CHECKLISTS
-- ================================================================================
-- get_learner_checklist: resolves 4-level hierarchy (institution → degree →
-- department → program) for a learner, returns aggregated items + per-learner
-- completion status. SECURITY DEFINER; gated on admission.enquiries.checklist.view.

CREATE OR REPLACE FUNCTION public.get_learner_checklist(p_learner_id uuid)
RETURNS TABLE (
  checklist_id      uuid,
  checklist_name    text,
  checklist_desc    text,
  scope_type        text,
  scope_label       text,
  item_id           uuid,
  item_title        text,
  item_description  text,
  is_required       boolean,
  order_index       int,
  is_done           boolean,
  marked_by         uuid,
  marked_by_name    text,
  marked_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lifecycle    text;
  v_institution  uuid;
  v_degree       uuid;
  v_department   uuid;
  v_program      uuid;
BEGIN
  IF NOT public.user_has_permission('admission.enquiries.checklist.view') THEN
    RAISE EXCEPTION 'permission denied: admission.enquiries.checklist.view';
  END IF;

  SELECT
    lp.lifecycle_status::text,
    lp.institution_id,
    lp.degree_id,
    lp.department_id,
    lp.program_id
  INTO v_lifecycle, v_institution, v_degree, v_department, v_program
  FROM public.learners_profiles lp
  WHERE lp.id = p_learner_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'learner not found: %', p_learner_id;
  END IF;

  RETURN QUERY
  SELECT
    cl.id, cl.name, cl.description, cl.scope_type,
    CASE cl.scope_type
      WHEN 'institution' THEN (SELECT i.name FROM public.institutions i WHERE i.id = cl.scope_id)
      WHEN 'degree'      THEN (SELECT COALESCE(d.display_name, d.degree_name) FROM public.degrees d WHERE d.id = cl.scope_id)
      WHEN 'department'  THEN (SELECT COALESCE(dp.display_name, dp.department_name) FROM public.departments dp WHERE dp.id = cl.scope_id)
      WHEN 'program'     THEN (SELECT p.program_name FROM public.programs p WHERE p.id = cl.scope_id)
    END,
    it.id, it.title, it.description, it.is_required, it.order_index,
    COALESCE(c.is_done, false), c.marked_by, pr.full_name, c.marked_at
  FROM public.admission_checklists cl
  JOIN public.admission_checklist_items it
    ON it.checklist_id = cl.id AND it.is_active = true
  LEFT JOIN public.admission_checklist_completions c
    ON c.checklist_item_id = it.id AND c.learner_profile_id = p_learner_id
  LEFT JOIN public.profiles pr ON pr.id = c.marked_by
  WHERE cl.is_active = true
    AND (v_lifecycle IS NULL OR v_lifecycle = ANY(cl.applies_to_lifecycle))
    AND (
      (cl.scope_type = 'institution' AND cl.scope_id = v_institution)
      OR (cl.scope_type = 'degree'    AND cl.scope_id = v_degree)
      OR (cl.scope_type = 'department' AND cl.scope_id = v_department)
      OR (cl.scope_type = 'program'   AND cl.scope_id = v_program)
    )
  ORDER BY
    CASE cl.scope_type
      WHEN 'institution' THEN 1
      WHEN 'degree'      THEN 2
      WHEN 'department'  THEN 3
      WHEN 'program'     THEN 4
    END, cl.created_at, it.order_index, it.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.get_learner_checklist(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_learner_checklist(uuid) TO authenticated;

-- mark_checklist_item: toggle a single item's completion + audit-log it onto
-- the admission_lead_activities timeline. SECURITY DEFINER; gated on
-- admission.enquiries.checklist.mark.

CREATE OR REPLACE FUNCTION public.mark_checklist_item(
  p_learner_id uuid,
  p_item_id    uuid,
  p_is_done    boolean
)
RETURNS public.admission_checklist_completions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     public.admission_checklist_completions;
  v_uid     uuid := auth.uid();
  v_lead_id uuid;
  v_title   text;
BEGIN
  IF NOT public.user_has_permission('admission.enquiries.checklist.mark') THEN
    RAISE EXCEPTION 'permission denied: admission.enquiries.checklist.mark';
  END IF;

  IF p_is_done THEN
    INSERT INTO public.admission_checklist_completions
      (learner_profile_id, checklist_item_id, is_done, marked_by, marked_at)
    VALUES
      (p_learner_id, p_item_id, true, v_uid, now())
    ON CONFLICT (learner_profile_id, checklist_item_id)
    DO UPDATE SET is_done = true, marked_by = v_uid, marked_at = now()
    RETURNING * INTO v_row;
  ELSE
    DELETE FROM public.admission_checklist_completions
    WHERE learner_profile_id = p_learner_id AND checklist_item_id = p_item_id
    RETURNING * INTO v_row;
  END IF;

  SELECT al.id, ci.title INTO v_lead_id, v_title
  FROM public.admission_checklist_items ci
  LEFT JOIN public.admission_leads al ON al.learner_profile_id = p_learner_id
  WHERE ci.id = p_item_id;

  IF v_lead_id IS NOT NULL THEN
    INSERT INTO public.admission_lead_activities (
      lead_id, activity_type, subject, description, created_by, created_at
    ) VALUES (
      v_lead_id,
      'checklist_marked',
      CASE WHEN p_is_done THEN 'Checklist item marked done' ELSE 'Checklist item un-marked' END,
      COALESCE(v_title, 'Checklist item'),
      v_uid, now()
    );
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_checklist_item(uuid, uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_checklist_item(uuid, uuid, boolean) TO authenticated;

-- get_my_learner_id(): resolves the current user's learners_profiles id from
-- their profile row. user_is_hosteler() and the resident RLS policies depend
-- on it. Defined first so fresh provision satisfies the dependency order.
CREATE OR REPLACE FUNCTION public.get_my_learner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT learner_id FROM profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_learner_id() TO authenticated;

-- fn_my_lifecycle_status(): the caller's own learners_profiles.lifecycle_status.
-- Used by the client nav to scope pre-onboarding (induction-only) learners to the
-- My Induction + My Profile entries. SECURITY DEFINER (reads past RLS) but only
-- ever returns the CALLER's own row. proxy.ts is the real access gate.
-- (20260629100000_induction_only_access_widen_provisioning.sql)
CREATE OR REPLACE FUNCTION public.fn_my_lifecycle_status()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT lp.lifecycle_status::text
  FROM profiles p
  JOIN learners_profiles lp ON lp.id = p.learner_id
  WHERE p.id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.fn_my_lifecycle_status() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_my_lifecycle_status() TO authenticated;

-- user_is_hosteler(): true when the current user's learner record has
-- accommodation type = hostel. Built on get_my_learner_id() (existing).
-- Clean signal: accommodation_types.code='hostel'; fallback: dirty text.
CREATE OR REPLACE FUNCTION public.user_is_hosteler()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM learners_profiles lp
    LEFT JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id
    WHERE lp.id = public.get_my_learner_id()
      AND (acc.code = 'hostel' OR lp.accommodation_type ILIKE 'hostel%')
  );
$$;

-- fn_learner_year_of_study: canonical "current year of study" for ANY learner,
-- mirroring the 3-tier derivation in v_learner_hostelites:
--   Tier 1: admission_years.year + programs.program_duration_yrs   (preferred)
--   Tier 2: batches.start_date / end_date                          (fallback)
--   Tier 3: learners_profiles.enquiry_date                         (last resort)
-- Upper-clamp via LEAST keeps the value within the programme length.
-- Lower-clamp via GREATEST(1, …) prevents negative / zero values.
-- 2026-06-05: re-pointed off admission_years.program_start_year/end_year (dropped by the
-- admission-year institution-wide collapse) to admission_years.year + programs.program_duration_yrs.
CREATE OR REPLACE FUNCTION public.fn_learner_year_of_study(p_learner_id uuid)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    CASE
      WHEN lp.admission_year_id IS NOT NULL AND ay.year IS NOT NULL
        THEN GREATEST(1, LEAST(
               EXTRACT(year FROM CURRENT_DATE)::integer - ay.year + 1,
               COALESCE(pr.program_duration_yrs::int, 4) + 1
             ))
      WHEN lp.batch_id IS NOT NULL AND b.start_date IS NOT NULL
        THEN GREATEST(1, LEAST(
               EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM b.start_date)::integer + 1,
               EXTRACT(year FROM b.end_date)::integer - EXTRACT(year FROM b.start_date)::integer + 1
             ))
      WHEN lp.enquiry_date IS NOT NULL
        THEN GREATEST(1, EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM lp.enquiry_date)::integer + 1)
      ELSE NULL
    END
  FROM learners_profiles lp
  LEFT JOIN admission_years ay ON ay.id = lp.admission_year_id
  LEFT JOIN batches b ON b.id = lp.batch_id
  LEFT JOIN programs pr ON pr.id = lp.program_id
  WHERE lp.id = p_learner_id;
$$;

COMMENT ON FUNCTION public.fn_learner_year_of_study(uuid) IS
  'Returns the current year of study for a learner using the same 3-tier derivation '
  'as v_learner_hostelites: admission_year → batch → enquiry_date. '
  'Clamps to [1, program_duration] so result is always ≥ 1 and never exceeds the programme length.';

-- admission_bulk_upsert_fee_structure: atomic per-row upsert for bulk fee-structure import
CREATE OR REPLACE FUNCTION public.admission_bulk_upsert_fee_structure(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_structure_id   uuid := NULLIF(p_payload->>'structure_id','')::uuid;
  v_institution_id uuid := (p_payload->>'institution_id')::uuid;
  v_existing       record;
  v_item           jsonb;
  v_comm           uuid;
  v_idx            int := 0;
BEGIN
  IF NOT (user_has_permission('admission_fees.manage')
          AND role_has_institution_access(v_institution_id)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  IF v_structure_id IS NULL THEN
    INSERT INTO admission_fee_structures (
      institution_id, degree_id, department_id, programme_id,
      quota_id, admission_year_id, gender, accommodation_type_id,
      name, status, notes, effective_from, effective_to
    ) VALUES (
      v_institution_id,
      (p_payload->>'degree_id')::uuid,
      (p_payload->>'department_id')::uuid,
      (p_payload->>'programme_id')::uuid,
      (p_payload->>'quota_id')::uuid,
      (p_payload->>'admission_year_id')::uuid,
      NULLIF(p_payload->>'gender','')::text,
      NULLIF(p_payload->>'accommodation_type_id','')::uuid,
      p_payload->>'name',
      COALESCE(NULLIF(p_payload->>'status',''),'draft'),
      NULLIF(p_payload->>'notes',''),
      NULLIF(p_payload->>'effective_from','')::date,
      NULLIF(p_payload->>'effective_to','')::date
    ) RETURNING id INTO v_structure_id;
  ELSE
    SELECT * INTO v_existing FROM admission_fee_structures WHERE id = v_structure_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'structure_not_found');
    END IF;
    IF v_existing.institution_id <> v_institution_id
       OR v_existing.degree_id        <> (p_payload->>'degree_id')::uuid
       OR v_existing.department_id     <> (p_payload->>'department_id')::uuid
       OR v_existing.programme_id      <> (p_payload->>'programme_id')::uuid
       OR v_existing.quota_id          <> (p_payload->>'quota_id')::uuid
       OR v_existing.admission_year_id <> (p_payload->>'admission_year_id')::uuid THEN
      RETURN jsonb_build_object('ok', false, 'error',
        'dimension_mismatch: dimensions are immutable on edit and no longer match this Fee Structure ID');
    END IF;
    UPDATE admission_fee_structures SET
      gender                = NULLIF(p_payload->>'gender','')::text,
      -- Key absent (older client / partial payload) = preserve current value;
      -- key present with null/'' = explicit "Any accommodation".
      accommodation_type_id = CASE WHEN p_payload ? 'accommodation_type_id'
                                   THEN NULLIF(p_payload->>'accommodation_type_id','')::uuid
                                   ELSE v_existing.accommodation_type_id END,
      name                  = p_payload->>'name',
      status                = COALESCE(NULLIF(p_payload->>'status',''),'draft'),
      notes                 = NULLIF(p_payload->>'notes',''),
      effective_from        = NULLIF(p_payload->>'effective_from','')::date,
      effective_to          = NULLIF(p_payload->>'effective_to','')::date,
      updated_at            = now()
    WHERE id = v_structure_id;
  END IF;

  DELETE FROM admission_fee_structure_communities WHERE fee_structure_id = v_structure_id;
  FOR v_comm IN SELECT jsonb_array_elements_text(p_payload->'community_category_ids')::uuid LOOP
    INSERT INTO admission_fee_structure_communities (fee_structure_id, community_category_id)
    VALUES (v_structure_id, v_comm);
  END LOOP;

  DELETE FROM admission_fee_structure_items WHERE fee_structure_id = v_structure_id;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
    INSERT INTO admission_fee_structure_items (
      fee_structure_id, billing_category_id, amount, is_optional, sort_order
    ) VALUES (
      v_structure_id,
      (v_item->>'billing_category_id')::uuid,
      (v_item->>'amount')::numeric,
      COALESCE((v_item->>'is_optional')::boolean, false),
      v_idx
    );
    v_idx := v_idx + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'structure_id', v_structure_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admission_bulk_upsert_fee_structure(jsonb) TO authenticated;

GRANT EXECUTE ON FUNCTION public.user_is_hosteler() TO authenticated;


-- ============================================================================
-- Billing Analytics Dashboard RPCs — mirror of migration 20260602094000
-- (indexes live in the migration; functions mirrored here per repo convention)
-- ============================================================================
-- ── 1. Overview KPIs ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_billing_analytics_overview(
  p_institution_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inst uuid[];
  v_billed numeric := 0; v_collected numeric := 0; v_refunds numeric := 0;
  v_discounts numeric := 0; v_outstanding numeric := 0;
  v_students int := 0; v_total int := 0; v_paid int := 0; v_unpaid int := 0; v_partial int := 0;
BEGIN
  IF NOT public.user_has_permission('billing.analytics.view') THEN
    RAISE EXCEPTION 'permission denied: billing.analytics.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));

  IF v_inst IS NULL THEN
    RETURN jsonb_build_object('total_billed',0,'total_collected',0,'net_collected',0,
      'total_outstanding',0,'collection_rate',0,'students_billed',0,'total_bills',0,
      'bills_paid',0,'bills_unpaid',0,'bills_partially_paid',0,'total_discounts',0,'total_refunds',0);
  END IF;

  SELECT COALESCE(SUM(final_amount),0), COUNT(*),
         COUNT(*) FILTER (WHERE status = 'paid'),
         COUNT(*) FILTER (WHERE status = 'unpaid'),
         COUNT(*) FILTER (WHERE status = 'partially_paid'),
         COUNT(DISTINCT student_id)
  INTO v_billed, v_total, v_paid, v_unpaid, v_partial, v_students
  FROM billing_student_bills
  WHERE institution_id = ANY(v_inst)
    AND (p_date_from IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from)
    AND (p_date_to   IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to);

  SELECT COALESCE(SUM(balance_amount),0) INTO v_outstanding
  FROM billing_student_bills
  WHERE institution_id = ANY(v_inst) AND COALESCE(balance_amount,0) > 0;

  SELECT COALESCE(SUM(payment_amount),0) INTO v_collected
  FROM billing_receipts
  WHERE institution_id = ANY(v_inst)
    AND (p_date_from IS NULL OR payment_paid_date >= p_date_from)
    AND (p_date_to   IS NULL OR payment_paid_date <= p_date_to);

  SELECT COALESCE(SUM(r.refund_amount),0) INTO v_refunds
  FROM billing_refunds r JOIN billing_receipts rc ON rc.id = r.receipt_id
  WHERE rc.institution_id = ANY(v_inst) AND r.approval_status = 'processed'
    AND (p_date_from IS NULL OR r.refund_date >= p_date_from)
    AND (p_date_to   IS NULL OR r.refund_date <= p_date_to);

  SELECT COALESCE(SUM(d.discount_amount),0) INTO v_discounts
  FROM billing_discounts d JOIN billing_student_bills b ON b.id = d.bill_id
  WHERE b.institution_id = ANY(v_inst) AND d.approval_status = 'approved'
    AND (p_date_from IS NULL OR d.effective_date >= p_date_from)
    AND (p_date_to   IS NULL OR d.effective_date <= p_date_to);

  RETURN jsonb_build_object(
    'total_billed', v_billed, 'total_collected', v_collected,
    'net_collected', GREATEST(v_collected - v_refunds, 0),
    'total_outstanding', v_outstanding,
    'collection_rate', CASE WHEN v_billed > 0 THEN round((v_collected / v_billed) * 100, 2) ELSE 0 END,
    'students_billed', v_students, 'total_bills', v_total,
    'bills_paid', v_paid, 'bills_unpaid', v_unpaid, 'bills_partially_paid', v_partial,
    'total_discounts', v_discounts, 'total_refunds', v_refunds);
END;
$$;

-- ── 2. Live "Today's Collections" ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_billing_today_collections(
  p_institution_ids uuid[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inst uuid[];
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_total numeric := 0; v_count int := 0;
  v_by_mode jsonb; v_by_inst jsonb; v_recent jsonb;
BEGIN
  IF NOT public.user_has_permission('billing.analytics.view') THEN
    RAISE EXCEPTION 'permission denied: billing.analytics.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));

  IF v_inst IS NULL THEN
    RETURN jsonb_build_object('today_total',0,'today_count',0,
      'by_mode','[]'::jsonb,'by_institution','[]'::jsonb,'recent','[]'::jsonb);
  END IF;

  SELECT COALESCE(SUM(payment_amount),0), COUNT(*) INTO v_total, v_count
  FROM billing_receipts WHERE institution_id = ANY(v_inst) AND payment_paid_date = v_today;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('payment_mode', payment_mode, 'amount', amt, 'count', cnt) ORDER BY amt DESC), '[]'::jsonb)
  INTO v_by_mode FROM (
    SELECT payment_mode, SUM(payment_amount) amt, COUNT(*) cnt
    FROM billing_receipts WHERE institution_id = ANY(v_inst) AND payment_paid_date = v_today
    GROUP BY payment_mode) m;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('institution_id', i_id, 'institution_name', i_name, 'amount', amt, 'count', cnt) ORDER BY amt DESC), '[]'::jsonb)
  INTO v_by_inst FROM (
    SELECT r.institution_id i_id, i.name i_name, SUM(r.payment_amount) amt, COUNT(*) cnt
    FROM billing_receipts r JOIN institutions i ON i.id = r.institution_id
    WHERE r.institution_id = ANY(v_inst) AND r.payment_paid_date = v_today
    GROUP BY r.institution_id, i.name) s;

  SELECT COALESCE(jsonb_agg(j ORDER BY ca DESC), '[]'::jsonb)
  INTO v_recent FROM (
    SELECT jsonb_build_object('id', r.id, 'receipt_number', r.receipt_number,
      'payer_name', r.payer_name, 'payment_amount', r.payment_amount,
      'payment_mode', r.payment_mode, 'institution_name', i.name, 'created_at', r.created_at) AS j,
      r.created_at AS ca
    FROM billing_receipts r JOIN institutions i ON i.id = r.institution_id
    WHERE r.institution_id = ANY(v_inst) AND r.payment_paid_date = v_today
    ORDER BY r.created_at DESC LIMIT 10) rec;

  RETURN jsonb_build_object('today_total', v_total, 'today_count', v_count,
    'by_mode', v_by_mode, 'by_institution', v_by_inst, 'recent', v_recent);
END;
$$;

-- ── 3. Collection trend (billed vs collected over time) ─────────────────────
CREATE OR REPLACE FUNCTION public.get_billing_collection_trend(
  p_institution_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_granularity text DEFAULT 'day'
) RETURNS TABLE(period text, billed numeric, collected numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inst uuid[];
  v_fmt text := CASE WHEN p_granularity = 'month' THEN 'YYYY-MM' ELSE 'YYYY-MM-DD' END;
BEGIN
  IF NOT public.user_has_permission('billing.analytics.view') THEN
    RAISE EXCEPTION 'permission denied: billing.analytics.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH b AS (
    SELECT to_char((created_at AT TIME ZONE 'Asia/Kolkata'), v_fmt) p, SUM(final_amount) amt
    FROM billing_student_bills
    WHERE institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from)
      AND (p_date_to   IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
    GROUP BY 1),
  c AS (
    SELECT to_char(payment_paid_date, v_fmt) p, SUM(payment_amount) amt
    FROM billing_receipts
    WHERE institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR payment_paid_date >= p_date_from)
      AND (p_date_to   IS NULL OR payment_paid_date <= p_date_to)
    GROUP BY 1)
  SELECT COALESCE(b.p, c.p), COALESCE(b.amt,0), COALESCE(c.amt,0)
  FROM b FULL OUTER JOIN c ON b.p = c.p
  ORDER BY 1;
END;
$$;

-- ── 4. Institution comparison ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_billing_analytics_by_institution(
  p_institution_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
) RETURNS TABLE(
  institution_id uuid, institution_name varchar, total_billed numeric,
  total_collected numeric, total_outstanding numeric, collection_rate numeric,
  bill_count int, student_count int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE v_inst uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.analytics.view') THEN
    RAISE EXCEPTION 'permission denied: billing.analytics.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT i.id, i.name::varchar,
    COALESCE(b.billed,0), COALESCE(rc.collected,0), COALESCE(o.outstanding,0),
    CASE WHEN COALESCE(b.billed,0) > 0 THEN round(COALESCE(rc.collected,0)/b.billed*100,2) ELSE 0 END,
    COALESCE(b.bill_count,0)::int, COALESCE(b.student_count,0)::int
  FROM institutions i
  LEFT JOIN (
    SELECT institution_id, SUM(final_amount) billed, COUNT(*) bill_count, COUNT(DISTINCT student_id) student_count
    FROM billing_student_bills
    WHERE institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from)
      AND (p_date_to   IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
    GROUP BY institution_id) b ON b.institution_id = i.id
  LEFT JOIN (
    SELECT institution_id, SUM(payment_amount) collected
    FROM billing_receipts
    WHERE institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR payment_paid_date >= p_date_from)
      AND (p_date_to   IS NULL OR payment_paid_date <= p_date_to)
    GROUP BY institution_id) rc ON rc.institution_id = i.id
  LEFT JOIN (
    SELECT institution_id, SUM(balance_amount) outstanding
    FROM billing_student_bills
    WHERE institution_id = ANY(v_inst) AND COALESCE(balance_amount,0) > 0
    GROUP BY institution_id) o ON o.institution_id = i.id
  WHERE i.id = ANY(v_inst)
    AND (COALESCE(b.billed,0) > 0 OR COALESCE(rc.collected,0) > 0 OR COALESCE(o.outstanding,0) > 0)
  ORDER BY COALESCE(o.outstanding,0) DESC;
END;
$$;

-- ── 5. Aging buckets (snapshot of bills with balance > 0) ───────────────────
CREATE OR REPLACE FUNCTION public.get_billing_analytics_aging(
  p_institution_ids uuid[] DEFAULT NULL
) RETURNS TABLE(bucket text, bill_count int, balance numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inst uuid[]; v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF NOT public.user_has_permission('billing.analytics.view') THEN
    RAISE EXCEPTION 'permission denied: billing.analytics.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT a.bucket, COUNT(*)::int, SUM(a.balance_amount)
  FROM (
    SELECT balance_amount,
      CASE
        WHEN due_date >= v_today THEN 'not_due'
        WHEN v_today - due_date <= 30 THEN '0-30'
        WHEN v_today - due_date <= 60 THEN '31-60'
        WHEN v_today - due_date <= 90 THEN '61-90'
        ELSE '90+'
      END AS bucket
    FROM billing_student_bills
    WHERE institution_id = ANY(v_inst) AND COALESCE(balance_amount,0) > 0) a
  GROUP BY a.bucket
  ORDER BY CASE a.bucket WHEN 'not_due' THEN 0 WHEN '0-30' THEN 1 WHEN '31-60' THEN 2 WHEN '61-90' THEN 3 ELSE 4 END;
END;
$$;

-- ── 6. Pending fees by category kind (snapshot) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_billing_analytics_by_category(
  p_institution_ids uuid[] DEFAULT NULL
) RETURNS TABLE(kind text, total_billed numeric, total_outstanding numeric, paid_to_date numeric, bill_count int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inst uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.analytics.view') THEN
    RAISE EXCEPTION 'permission denied: billing.analytics.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT COALESCE(c.kind::text, 'uncategorized'),
    SUM(b.final_amount), SUM(COALESCE(b.balance_amount,0)),
    SUM(b.final_amount - COALESCE(b.balance_amount,0)), COUNT(*)::int
  FROM billing_student_bills b
  LEFT JOIN billing_categories c ON c.id = b.item_category_id
  WHERE b.institution_id = ANY(v_inst)
  GROUP BY COALESCE(c.kind::text, 'uncategorized')
  ORDER BY SUM(COALESCE(b.balance_amount,0)) DESC;
END;
$$;

-- ── 7. Per-account-user activity (actions + ₹ collected) ────────────────────
CREATE OR REPLACE FUNCTION public.get_billing_user_activity(
  p_institution_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
) RETURNS TABLE(
  user_id uuid, full_name text, role text, actions_count int, receipts_count int,
  amount_collected numeric, discounts_count int, refunds_count int, last_active timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inst uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.analytics.view') THEN
    RAISE EXCEPTION 'permission denied: billing.analytics.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH acts AS (
    SELECT ual.user_id uid, COUNT(*) c, MAX(ual.created_at) last_at
    FROM user_activity_logs ual
    WHERE ual.institution_id = ANY(v_inst)
      AND (ual.resource_type IN ('bill','receipt','invoice','discount','refund')
           OR (ual.resource_type = 'category' AND ual.metadata->>'sub_type' LIKE 'billing_%'))
      AND (p_date_from IS NULL OR ual.created_at >= p_date_from)
      AND (p_date_to   IS NULL OR (ual.created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
    GROUP BY ual.user_id),
  rec AS (
    SELECT COALESCE(created_by, accountant_id) uid, COUNT(*) c, SUM(payment_amount) amt, MAX(created_at) last_at
    FROM billing_receipts
    WHERE institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR payment_paid_date >= p_date_from)
      AND (p_date_to   IS NULL OR payment_paid_date <= p_date_to)
    GROUP BY COALESCE(created_by, accountant_id)),
  disc AS (
    SELECT d.created_by uid, COUNT(*) c
    FROM billing_discounts d JOIN billing_student_bills b ON b.id = d.bill_id
    WHERE b.institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR d.created_at >= p_date_from)
      AND (p_date_to   IS NULL OR (d.created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
    GROUP BY d.created_by),
  ref AS (
    SELECT rf.created_by uid, COUNT(*) c
    FROM billing_refunds rf JOIN billing_receipts rc ON rc.id = rf.receipt_id
    WHERE rc.institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR rf.created_at >= p_date_from)
      AND (p_date_to   IS NULL OR (rf.created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
    GROUP BY rf.created_by),
  ids AS (
    SELECT uid FROM acts WHERE uid IS NOT NULL
    UNION SELECT uid FROM rec WHERE uid IS NOT NULL
    UNION SELECT uid FROM disc WHERE uid IS NOT NULL
    UNION SELECT uid FROM ref WHERE uid IS NOT NULL)
  SELECT ids.uid, COALESCE(p.full_name,'Unknown')::text, COALESCE(p.role,'')::text,
    COALESCE(a.c,0)::int, COALESCE(r.c,0)::int, COALESCE(r.amt,0),
    COALESCE(d.c,0)::int, COALESCE(rf.c,0)::int,
    NULLIF(GREATEST(COALESCE(a.last_at,'-infinity'::timestamptz), COALESCE(r.last_at,'-infinity'::timestamptz)), '-infinity'::timestamptz)
  FROM ids
  LEFT JOIN profiles p ON p.id = ids.uid
  LEFT JOIN acts a ON a.uid = ids.uid
  LEFT JOIN rec r ON r.uid = ids.uid
  LEFT JOIN disc d ON d.uid = ids.uid
  LEFT JOIN ref rf ON rf.uid = ids.uid
  ORDER BY COALESCE(r.amt,0) DESC, COALESCE(a.c,0) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_billing_analytics_overview(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_today_collections(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_collection_trend(uuid[], date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_analytics_by_institution(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_analytics_aging(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_analytics_by_category(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_user_activity(uuid[], date, date) TO authenticated;


-- ============================================================================
-- get_billing_daily_activity — daily × institution accounts activity (migration 20260618150000)
-- Bills created / amount billed / distinct students billed / receipts generated
-- / amount collected, per (day × institution). FULL JOIN keeps collection-only
-- and billing-only days.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_billing_daily_activity(
  p_institution_ids uuid[] DEFAULT NULL::uuid[],
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date
)
RETURNS TABLE(
  activity_date date,
  institution_id uuid,
  institution_name text,
  bills_created integer,
  amount_billed numeric,
  students_billed integer,
  receipts_created integer,
  amount_collected numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_inst uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.analytics.view') THEN
    RAISE EXCEPTION 'permission denied: billing.analytics.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(gua.institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid()) gua
  WHERE (p_institution_ids IS NULL OR gua.institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH bills AS (
    SELECT (b.created_at AT TIME ZONE 'Asia/Kolkata')::date AS d,
           b.institution_id AS inst,
           COUNT(*)::int AS cnt,
           COALESCE(SUM(b.final_amount), 0) AS amt,
           COUNT(DISTINCT b.student_id)::int AS students
    FROM billing_student_bills b
    WHERE b.institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR (b.created_at AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from)
      AND (p_date_to   IS NULL OR (b.created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
    GROUP BY 1, 2
  ),
  rec AS (
    SELECT r.payment_paid_date AS d,
           r.institution_id AS inst,
           COUNT(*)::int AS cnt,
           COALESCE(SUM(r.payment_amount), 0) AS amt
    FROM billing_receipts r
    WHERE r.institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR r.payment_paid_date >= p_date_from)
      AND (p_date_to   IS NULL OR r.payment_paid_date <= p_date_to)
    GROUP BY 1, 2
  ),
  merged AS (
    SELECT
      COALESCE(b.d, rec.d)              AS d,
      COALESCE(b.inst, rec.inst)        AS inst,
      COALESCE(b.cnt, 0)                AS bills_created,
      COALESCE(b.amt, 0)                AS amount_billed,
      COALESCE(b.students, 0)           AS students_billed,
      COALESCE(rec.cnt, 0)              AS receipts_created,
      COALESCE(rec.amt, 0)              AS amount_collected
    FROM bills b
    FULL JOIN rec ON rec.d = b.d AND rec.inst = b.inst
  )
  SELECT m.d, m.inst, COALESCE(i.name, 'Unknown')::text,
         m.bills_created, m.amount_billed, m.students_billed,
         m.receipts_created, m.amount_collected
  FROM merged m
  LEFT JOIN institutions i ON i.id = m.inst
  WHERE m.d IS NOT NULL
  ORDER BY m.d DESC, COALESCE(i.name, '') ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_billing_daily_activity(uuid[], date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_billing_daily_activity(uuid[], date, date) TO authenticated, service_role;


-- ============================================================================
-- get_billing_analytics_by_institution v2 — +students_with_dues (migration 20260602100000)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_billing_analytics_by_institution(
  p_institution_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
) RETURNS TABLE(
  institution_id uuid, institution_name varchar, total_billed numeric,
  total_collected numeric, total_outstanding numeric, collection_rate numeric,
  bill_count int, student_count int, students_with_dues int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE v_inst uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.analytics.view') THEN
    RAISE EXCEPTION 'permission denied: billing.analytics.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT i.id, i.name::varchar,
    COALESCE(b.billed,0), COALESCE(rc.collected,0), COALESCE(o.outstanding,0),
    CASE WHEN COALESCE(b.billed,0) > 0 THEN round(COALESCE(rc.collected,0)/b.billed*100,2) ELSE 0 END,
    COALESCE(b.bill_count,0)::int, COALESCE(b.student_count,0)::int,
    COALESCE(o.students_with_dues,0)::int
  FROM institutions i
  LEFT JOIN (
    SELECT institution_id, SUM(final_amount) billed, COUNT(*) bill_count, COUNT(DISTINCT student_id) student_count
    FROM billing_student_bills
    WHERE institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from)
      AND (p_date_to   IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
    GROUP BY institution_id) b ON b.institution_id = i.id
  LEFT JOIN (
    SELECT institution_id, SUM(payment_amount) collected
    FROM billing_receipts
    WHERE institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR payment_paid_date >= p_date_from)
      AND (p_date_to   IS NULL OR payment_paid_date <= p_date_to)
    GROUP BY institution_id) rc ON rc.institution_id = i.id
  LEFT JOIN (
    SELECT institution_id, SUM(balance_amount) outstanding, COUNT(DISTINCT student_id) students_with_dues
    FROM billing_student_bills
    WHERE institution_id = ANY(v_inst) AND COALESCE(balance_amount,0) > 0
    GROUP BY institution_id) o ON o.institution_id = i.id
  WHERE i.id = ANY(v_inst)
    AND (COALESCE(b.billed,0) > 0 OR COALESCE(rc.collected,0) > 0 OR COALESCE(o.outstanding,0) > 0)
  ORDER BY COALESCE(o.outstanding,0) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_billing_analytics_by_institution(uuid[], date, date) TO authenticated;

-- ============================================================================
-- sync_bus_pass_to_learner_profile (2026-06-02)
-- On final Bus Pass Request approval, writes the chosen route/stop onto the
-- learner's profile so the TMS app can read who needs a bus. SECURITY DEFINER
-- (approver cannot UPDATE arbitrary learners_profiles under RLS). Student-only:
-- a requester with no profiles.learner_id is a graceful no-op.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_bus_pass_to_learner_profile(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_id uuid;
  v_learner_id   uuid;
  v_staff_id     uuid;
  v_type_id      uuid;
  v_has_steps    boolean;
  v_form         jsonb;
  v_slug         text;
  v_status       text;
  v_route_id     uuid;
  v_stop_id      uuid;
BEGIN
  SELECT sr.requester_id, sr.form_data, sr.service_type_id, st.slug, sr.status::text
    INTO v_requester_id, v_form, v_type_id, v_slug, v_status
    FROM service_requests sr
    JOIN service_types st ON st.id = sr.service_type_id
   WHERE sr.id = p_request_id;

  IF v_requester_id IS NULL THEN
    RAISE NOTICE 'sync_bus_pass: request % not found', p_request_id;
    RETURN;
  END IF;

  IF v_slug <> 'transport-request' THEN
    RAISE NOTICE 'sync_bus_pass: request % is not a transport request (slug=%)', p_request_id, v_slug;
    RETURN;
  END IF;

  v_has_steps := EXISTS (SELECT 1 FROM service_request_approval_steps WHERE service_type_id = v_type_id);

  -- Authorization. Approver path: a privileged approver on an approved/fulfilled
  -- request. Self path: the requester finalizing their OWN request for a type with
  -- NO approval steps (instant self-service). The no-steps gate prevents bypassing
  -- approval on a review-required type; auth.uid()=requester prevents acting on
  -- someone else's request.
  IF (public.is_super_admin() OR public.user_has_permission('service_requests.approve')) THEN
    IF v_status NOT IN ('approved', 'fulfilled') THEN
      RAISE EXCEPTION 'sync_bus_pass: request % is not approved (status=%)', p_request_id, v_status;
    END IF;
  ELSIF v_requester_id = auth.uid() AND NOT v_has_steps
        AND v_status IN ('submitted', 'approved', 'fulfilled') THEN
    NULL; -- self-service no-approval path
  ELSE
    RAISE EXCEPTION 'sync_bus_pass: not authorized' USING ERRCODE = '42501';
  END IF;

  -- form_data holds UUID strings for the live lookup fields.
  BEGIN
    v_route_id := (v_form->>'bus_route')::uuid;
    v_stop_id  := (v_form->>'boarding_stop')::uuid;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'sync_bus_pass: bus_route/boarding_stop are not valid UUIDs for request %', p_request_id;
  END;

  IF v_route_id IS NULL OR v_stop_id IS NULL THEN
    RAISE EXCEPTION 'sync_bus_pass: missing route/stop for request %', p_request_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tms_route WHERE id = v_route_id) THEN
    RAISE EXCEPTION 'sync_bus_pass: route % does not exist', v_route_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tms_route_stop WHERE id = v_stop_id AND route_id = v_route_id) THEN
    RAISE EXCEPTION 'sync_bus_pass: stop % does not belong to route %', v_stop_id, v_route_id;
  END IF;

  -- Route by real identity. Learner takes priority over staff.
  SELECT learner_id INTO v_learner_id FROM profiles WHERE id = v_requester_id;
  IF v_learner_id IS NOT NULL THEN
    UPDATE learners_profiles
       SET bus_required=true, transport_route_id=v_route_id, transport_stop_id=v_stop_id, updated_at=now()
     WHERE id = v_learner_id;
    RAISE NOTICE 'sync_bus_pass: learner % set route=% stop=%', v_learner_id, v_route_id, v_stop_id;
    RETURN;
  END IF;

  SELECT id INTO v_staff_id FROM staff WHERE profile_id = v_requester_id;
  IF v_staff_id IS NOT NULL THEN
    UPDATE staff
       SET bus_required=true, transport_route_id=v_route_id, transport_stop_id=v_stop_id, updated_at=now()
     WHERE id = v_staff_id;
    RAISE NOTICE 'sync_bus_pass: staff % set route=% stop=%', v_staff_id, v_route_id, v_stop_id;
    RETURN;
  END IF;

  RAISE NOTICE 'sync_bus_pass: requester % is neither learner nor staff; skipping', v_requester_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_bus_pass_to_learner_profile(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.sync_bus_pass_to_learner_profile(uuid) TO authenticated;

-- ============================================================================
-- Razorpay institution-wise accounts (migration 20260603130000)
-- Table + pgcrypto vault RPCs. Secrets accessed only via these service_role RPCs.
-- NOTE: pgcrypto lives in the `extensions` schema → functions use
--       SET search_path = public, extensions.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.razorpay_accounts (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id            uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  key_id                    text,            -- NULL for a DRAFT (keys added on activation)
  key_secret_encrypted      bytea,           -- NULL until activated
  webhook_secret_encrypted  bytea,           -- NULL until activated
  webhook_ref               text UNIQUE,     -- NULL until activated
  account_label             text,
  mode                      text NOT NULL DEFAULT 'live' CHECK (mode IN ('test','live')),
  is_active                 boolean NOT NULL DEFAULT true,
  fee_head                  text,   -- billing_categories.kind this account settles (NULL = institution default MID)
  mid                       text,   -- HDFC MID (reconciliation reference)
  tid                       text,   -- HDFC TID (reconciliation reference)
  dba_name                  text,   -- HDFC DBA name (reconciliation reference)
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid REFERENCES public.profiles(id),
  updated_by                uuid REFERENCES public.profiles(id)
);
-- One ACTIVE account per (institution, fee_head); COALESCE so NULL-head rows still collide.
CREATE UNIQUE INDEX IF NOT EXISTS razorpay_accounts_active_inst_feehead_uidx
  ON public.razorpay_accounts (institution_id, COALESCE(fee_head, '__default__')) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_razorpay_accounts_institution
  ON public.razorpay_accounts (institution_id);
-- An ACTIVE account must carry full credentials (drafts are inactive + keyless).
ALTER TABLE public.razorpay_accounts DROP CONSTRAINT IF EXISTS razorpay_accounts_active_requires_keys;
ALTER TABLE public.razorpay_accounts ADD CONSTRAINT razorpay_accounts_active_requires_keys
  CHECK (is_active = false OR (key_id IS NOT NULL AND key_secret_encrypted IS NOT NULL AND webhook_secret_encrypted IS NOT NULL AND webhook_ref IS NOT NULL));
-- At most one DRAFT (keyless) per (institution, fee_head) slot.
CREATE UNIQUE INDEX IF NOT EXISTS razorpay_accounts_draft_inst_feehead_uidx
  ON public.razorpay_accounts (institution_id, COALESCE(fee_head, '__default__')) WHERE key_id IS NULL;

-- razorpay_account_id pin on transaction tables (NULL = common env account)
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS razorpay_account_id uuid REFERENCES public.razorpay_accounts(id);
ALTER TABLE public.event_payment_transactions
  ADD COLUMN IF NOT EXISTS razorpay_account_id uuid REFERENCES public.razorpay_accounts(id);

CREATE OR REPLACE FUNCTION public.update_razorpay_accounts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.fn_set_razorpay_account(
  p_institution_id uuid, p_key_id text, p_key_secret text, p_webhook_secret text,
  p_label text, p_mode text, p_webhook_ref text, p_master_secret text, p_actor uuid DEFAULT NULL,
  p_fee_head text DEFAULT NULL, p_mid text DEFAULT NULL, p_tid text DEFAULT NULL, p_dba_name text DEFAULT NULL
)
RETURNS TABLE(id uuid, webhook_ref text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid; v_ref text; v_head text := NULLIF(trim(p_fee_head), '');
BEGIN
  IF p_institution_id IS NULL AND v_head IS NULL THEN RAISE EXCEPTION 'fn_set_razorpay_account: a global account (no institution) must target a specific fee head'; END IF;
  IF p_key_id IS NULL OR length(trim(p_key_id)) = 0 THEN RAISE EXCEPTION 'fn_set_razorpay_account: p_key_id must not be NULL or empty'; END IF;
  IF p_key_secret IS NULL OR length(trim(p_key_secret)) = 0 THEN RAISE EXCEPTION 'fn_set_razorpay_account: p_key_secret must not be NULL or empty'; END IF;
  IF p_webhook_secret IS NULL OR length(trim(p_webhook_secret)) = 0 THEN RAISE EXCEPTION 'fn_set_razorpay_account: p_webhook_secret must not be NULL or empty'; END IF;
  IF p_master_secret IS NULL OR length(trim(p_master_secret)) = 0 THEN RAISE EXCEPTION 'fn_set_razorpay_account: p_master_secret must not be NULL or empty'; END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('test','live') THEN RAISE EXCEPTION 'fn_set_razorpay_account: p_mode must be test or live'; END IF;
  v_ref := COALESCE(NULLIF(trim(p_webhook_ref), ''), encode(gen_random_bytes(18), 'hex'));
  -- Deactivate only the prior active account in THIS (institution, fee_head) slot.
  UPDATE public.razorpay_accounts SET is_active = false, updated_at = now(), updated_by = p_actor
    WHERE COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = COALESCE(p_institution_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND COALESCE(fee_head, '__default__') = COALESCE(v_head, '__default__') AND is_active;
  INSERT INTO public.razorpay_accounts (
    institution_id, key_id, key_secret_encrypted, webhook_secret_encrypted,
    webhook_ref, account_label, mode, is_active, created_by, updated_by, fee_head, mid, tid, dba_name
  ) VALUES (
    p_institution_id, p_key_id, pgp_sym_encrypt(p_key_secret, p_master_secret),
    pgp_sym_encrypt(p_webhook_secret, p_master_secret), v_ref, p_label, p_mode, true, p_actor, p_actor,
    v_head, NULLIF(trim(p_mid), ''), NULLIF(trim(p_tid), ''), NULLIF(trim(p_dba_name), '')
  ) RETURNING razorpay_accounts.id, razorpay_accounts.webhook_ref INTO v_id, v_ref;
  RETURN QUERY SELECT v_id, v_ref;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_get_razorpay_account(p_institution_id uuid, p_master_secret text, p_fee_head text DEFAULT NULL)
RETURNS TABLE(id uuid, key_id text, key_secret text, webhook_secret text, mode text, webhook_ref text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_head text := NULLIF(trim(p_fee_head), '');
BEGIN
  IF p_institution_id IS NULL THEN RAISE EXCEPTION 'fn_get_razorpay_account: p_institution_id must not be NULL'; END IF;
  IF p_master_secret IS NULL OR length(trim(p_master_secret)) = 0 THEN RAISE EXCEPTION 'fn_get_razorpay_account: p_master_secret must not be NULL or empty'; END IF;
  -- Best match: exact fee_head wins, else institution default (fee_head IS NULL).
  RETURN QUERY SELECT a.id, a.key_id, pgp_sym_decrypt(a.key_secret_encrypted, p_master_secret),
    pgp_sym_decrypt(a.webhook_secret_encrypted, p_master_secret), a.mode, a.webhook_ref
  FROM public.razorpay_accounts a
  WHERE a.is_active AND (a.institution_id = p_institution_id OR a.institution_id IS NULL)
    AND (a.fee_head = v_head OR a.fee_head IS NULL)
  ORDER BY (a.fee_head IS NOT DISTINCT FROM v_head) DESC, (a.institution_id IS NOT NULL) DESC LIMIT 1;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_get_razorpay_account_by_id(p_account_id uuid, p_master_secret text)
RETURNS TABLE(id uuid, key_id text, key_secret text, webhook_secret text, mode text, webhook_ref text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF p_account_id IS NULL THEN RAISE EXCEPTION 'fn_get_razorpay_account_by_id: p_account_id must not be NULL'; END IF;
  IF p_master_secret IS NULL OR length(trim(p_master_secret)) = 0 THEN RAISE EXCEPTION 'fn_get_razorpay_account_by_id: p_master_secret must not be NULL or empty'; END IF;
  RETURN QUERY SELECT a.id, a.key_id, pgp_sym_decrypt(a.key_secret_encrypted, p_master_secret),
    pgp_sym_decrypt(a.webhook_secret_encrypted, p_master_secret), a.mode, a.webhook_ref
  FROM public.razorpay_accounts a WHERE a.id = p_account_id LIMIT 1;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_get_razorpay_account_by_webhook_ref(p_webhook_ref text, p_master_secret text)
RETURNS TABLE(id uuid, institution_id uuid, webhook_secret text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF p_webhook_ref IS NULL OR length(trim(p_webhook_ref)) = 0 THEN RAISE EXCEPTION 'fn_get_razorpay_account_by_webhook_ref: p_webhook_ref must not be NULL or empty'; END IF;
  IF p_master_secret IS NULL OR length(trim(p_master_secret)) = 0 THEN RAISE EXCEPTION 'fn_get_razorpay_account_by_webhook_ref: p_master_secret must not be NULL or empty'; END IF;
  RETURN QUERY SELECT a.id, a.institution_id, pgp_sym_decrypt(a.webhook_secret_encrypted, p_master_secret)
  FROM public.razorpay_accounts a WHERE a.webhook_ref = p_webhook_ref LIMIT 1;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_list_razorpay_accounts()
RETURNS TABLE(id uuid, institution_id uuid, key_id text, account_label text, mode text, is_active boolean, webhook_ref text, created_at timestamptz, fee_head text, mid text, tid text, dba_name text, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  RETURN QUERY SELECT a.id, a.institution_id, a.key_id, a.account_label, a.mode, a.is_active, a.webhook_ref, a.created_at, a.fee_head, a.mid, a.tid, a.dba_name,
    CASE WHEN a.key_id IS NULL THEN 'draft' WHEN a.is_active THEN 'active' ELSE 'inactive' END
  FROM public.razorpay_accounts a ORDER BY a.institution_id, COALESCE(a.fee_head, ''), a.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_deactivate_razorpay_account(p_institution_id uuid, p_actor uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF p_institution_id IS NULL THEN RAISE EXCEPTION 'fn_deactivate_razorpay_account: p_institution_id must not be NULL'; END IF;
  UPDATE public.razorpay_accounts SET is_active = false, updated_at = now(), updated_by = p_actor
    WHERE institution_id = p_institution_id AND is_active;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_deactivate_razorpay_account_by_id(p_account_id uuid, p_actor uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF p_account_id IS NULL THEN RAISE EXCEPTION 'fn_deactivate_razorpay_account_by_id: p_account_id must not be NULL'; END IF;
  UPDATE public.razorpay_accounts SET is_active = false, updated_at = now(), updated_by = p_actor
    WHERE id = p_account_id AND is_active;
END; $$;

-- Create/update a DRAFT account (no keys) for an (institution, fee_head) slot.
CREATE OR REPLACE FUNCTION public.fn_create_razorpay_draft(
  p_institution_id uuid, p_fee_head text, p_label text, p_mid text, p_tid text, p_dba_name text,
  p_mode text DEFAULT 'live', p_actor uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid; v_head text := NULLIF(trim(p_fee_head), ''); v_mode text := CASE WHEN p_mode IN ('test','live') THEN p_mode ELSE 'live' END;
BEGIN
  IF p_institution_id IS NULL AND v_head IS NULL THEN RAISE EXCEPTION 'fn_create_razorpay_draft: a global account (no institution) must target a specific fee head'; END IF;
  UPDATE public.razorpay_accounts
    SET account_label = p_label, mid = NULLIF(trim(p_mid),''), tid = NULLIF(trim(p_tid),''),
        dba_name = NULLIF(trim(p_dba_name),''), mode = v_mode, updated_at = now(), updated_by = p_actor
    WHERE COALESCE(institution_id,'00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(p_institution_id,'00000000-0000-0000-0000-000000000000'::uuid) AND COALESCE(fee_head,'__default__') = COALESCE(v_head,'__default__') AND key_id IS NULL
    RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    INSERT INTO public.razorpay_accounts (institution_id, fee_head, account_label, mid, tid, dba_name, mode, is_active, created_by, updated_by)
    VALUES (p_institution_id, v_head, p_label, NULLIF(trim(p_mid),''), NULLIF(trim(p_tid),''), NULLIF(trim(p_dba_name),''), v_mode, false, p_actor, p_actor)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;

-- Activate a draft (or rotate in place) by adding encrypted keys.
CREATE OR REPLACE FUNCTION public.fn_activate_razorpay_account(
  p_account_id uuid, p_key_id text, p_key_secret text, p_webhook_secret text, p_master_secret text,
  p_webhook_ref text DEFAULT NULL, p_actor uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, webhook_ref text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_ref text; v_inst uuid; v_head text;
BEGIN
  IF p_account_id IS NULL THEN RAISE EXCEPTION 'fn_activate_razorpay_account: p_account_id must not be NULL'; END IF;
  IF p_key_id IS NULL OR length(trim(p_key_id)) = 0 THEN RAISE EXCEPTION 'fn_activate_razorpay_account: p_key_id must not be NULL or empty'; END IF;
  IF p_key_secret IS NULL OR length(trim(p_key_secret)) = 0 THEN RAISE EXCEPTION 'fn_activate_razorpay_account: p_key_secret must not be NULL or empty'; END IF;
  IF p_webhook_secret IS NULL OR length(trim(p_webhook_secret)) = 0 THEN RAISE EXCEPTION 'fn_activate_razorpay_account: p_webhook_secret must not be NULL or empty'; END IF;
  IF p_master_secret IS NULL OR length(trim(p_master_secret)) = 0 THEN RAISE EXCEPTION 'fn_activate_razorpay_account: p_master_secret must not be NULL or empty'; END IF;
  SELECT a.institution_id, a.fee_head INTO v_inst, v_head FROM public.razorpay_accounts a WHERE a.id = p_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'fn_activate_razorpay_account: account % not found', p_account_id; END IF;
  v_ref := COALESCE(NULLIF(trim(p_webhook_ref),''), encode(gen_random_bytes(18),'hex'));
  UPDATE public.razorpay_accounts AS a SET is_active = false, updated_at = now(), updated_by = p_actor
    WHERE COALESCE(a.institution_id,'00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(v_inst,'00000000-0000-0000-0000-000000000000'::uuid) AND COALESCE(a.fee_head,'__default__') = COALESCE(v_head,'__default__') AND a.is_active AND a.id <> p_account_id;
  UPDATE public.razorpay_accounts AS a
    SET key_id = p_key_id, key_secret_encrypted = pgp_sym_encrypt(p_key_secret, p_master_secret),
        webhook_secret_encrypted = pgp_sym_encrypt(p_webhook_secret, p_master_secret),
        webhook_ref = v_ref, is_active = true, updated_at = now(), updated_by = p_actor
    WHERE a.id = p_account_id;
  RETURN QUERY SELECT p_account_id, v_ref;
END; $$;

REVOKE ALL ON FUNCTION public.fn_set_razorpay_account(uuid, text, text, text, text, text, text, text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_razorpay_account(uuid, text, text, text, text, text, text, text, uuid, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.fn_get_razorpay_account(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_razorpay_account(uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.fn_get_razorpay_account_by_id(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_razorpay_account_by_id(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.fn_get_razorpay_account_by_webhook_ref(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_razorpay_account_by_webhook_ref(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.fn_list_razorpay_accounts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_list_razorpay_accounts() TO service_role;
REVOKE ALL ON FUNCTION public.fn_deactivate_razorpay_account(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_deactivate_razorpay_account(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fn_deactivate_razorpay_account_by_id(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_deactivate_razorpay_account_by_id(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fn_create_razorpay_draft(uuid, text, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_razorpay_draft(uuid, text, text, text, text, text, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fn_activate_razorpay_account(uuid, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_activate_razorpay_account(uuid, text, text, text, text, text, uuid) TO service_role;

-- Edit reconciliation/display metadata; routing slot changes only for DRAFTS when p_change_slot=true.
CREATE OR REPLACE FUNCTION public.fn_update_razorpay_account_meta(
  p_account_id uuid, p_label text, p_mid text, p_tid text, p_dba_name text,
  p_mode text DEFAULT NULL, p_institution_id uuid DEFAULT NULL, p_fee_head text DEFAULT NULL,
  p_change_slot boolean DEFAULT false, p_actor uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_is_draft boolean; v_head text := NULLIF(trim(p_fee_head), '');
BEGIN
  IF p_account_id IS NULL THEN RAISE EXCEPTION 'fn_update_razorpay_account_meta: p_account_id must not be NULL'; END IF;
  SELECT (a.key_id IS NULL) INTO v_is_draft FROM public.razorpay_accounts a WHERE a.id = p_account_id;
  IF v_is_draft IS NULL THEN RAISE EXCEPTION 'fn_update_razorpay_account_meta: account % not found', p_account_id; END IF;
  IF p_change_slot AND v_is_draft AND p_institution_id IS NULL AND v_head IS NULL THEN
    RAISE EXCEPTION 'fn_update_razorpay_account_meta: a global account (no institution) must target a specific fee head';
  END IF;
  UPDATE public.razorpay_accounts AS a SET
    account_label = p_label, mid = NULLIF(trim(p_mid),''), tid = NULLIF(trim(p_tid),''), dba_name = NULLIF(trim(p_dba_name),''),
    mode = COALESCE(CASE WHEN p_mode IN ('test','live') THEN p_mode END, a.mode),
    institution_id = CASE WHEN v_is_draft AND p_change_slot THEN p_institution_id ELSE a.institution_id END,
    fee_head = CASE WHEN v_is_draft AND p_change_slot THEN v_head ELSE a.fee_head END,
    updated_at = now(), updated_by = p_actor
  WHERE a.id = p_account_id;
END; $$;

-- Hard-delete an account; blocked when any transaction pins it (deactivate instead).
CREATE OR REPLACE FUNCTION public.fn_delete_razorpay_account_by_id(p_account_id uuid, p_actor uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF p_account_id IS NULL THEN RAISE EXCEPTION 'fn_delete_razorpay_account_by_id: p_account_id must not be NULL'; END IF;
  IF EXISTS (SELECT 1 FROM public.payment_transactions t WHERE t.razorpay_account_id = p_account_id)
     OR EXISTS (SELECT 1 FROM public.event_payment_transactions t WHERE t.razorpay_account_id = p_account_id) THEN
    RAISE EXCEPTION 'Cannot delete an account that has payment transactions. Deactivate it instead.';
  END IF;
  DELETE FROM public.razorpay_accounts a WHERE a.id = p_account_id;
END; $$;

REVOKE ALL ON FUNCTION public.fn_update_razorpay_account_meta(uuid, text, text, text, text, text, uuid, text, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_update_razorpay_account_meta(uuid, text, text, text, text, text, uuid, text, boolean, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fn_delete_razorpay_account_by_id(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_delete_razorpay_account_by_id(uuid, uuid) TO service_role;

-- Resolve the active GLOBAL account for a fee head (admin Test action; the normal router needs an institution).
CREATE OR REPLACE FUNCTION public.fn_get_razorpay_account_global(p_master_secret text, p_fee_head text)
RETURNS TABLE(id uuid, key_id text, key_secret text, webhook_secret text, mode text, webhook_ref text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_head text := NULLIF(trim(p_fee_head), '');
BEGIN
  IF p_master_secret IS NULL OR length(trim(p_master_secret)) = 0 THEN RAISE EXCEPTION 'fn_get_razorpay_account_global: p_master_secret must not be NULL or empty'; END IF;
  IF v_head IS NULL THEN RAISE EXCEPTION 'fn_get_razorpay_account_global: p_fee_head must not be NULL'; END IF;
  RETURN QUERY SELECT a.id, a.key_id, pgp_sym_decrypt(a.key_secret_encrypted, p_master_secret),
    pgp_sym_decrypt(a.webhook_secret_encrypted, p_master_secret), a.mode, a.webhook_ref
  FROM public.razorpay_accounts a
  WHERE a.is_active AND a.institution_id IS NULL AND a.fee_head = v_head LIMIT 1;
END; $$;
REVOKE ALL ON FUNCTION public.fn_get_razorpay_account_global(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_razorpay_account_global(text, text) TO service_role;

-- Transport (bus) fee collection list for /billing/transport: bus-requiring dayscholars with transport
-- bills. Gated by billing.transport.view; self-scopes to the caller's accessible institutions.
CREATE OR REPLACE FUNCTION public.fn_list_transport_collectables(p_institution_ids uuid[] DEFAULT NULL, p_academic_year_id uuid DEFAULT NULL)
RETURNS TABLE(student_id uuid, first_name text, last_name text, roll_number text, institution_id uuid, route_number text, route_name text, stop_name text, total_billed numeric, outstanding_amount numeric, payable_bill_ids uuid[], bill_count integer, bill_descriptions text[], degree_name text, department_name text, program_name text, semester_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_accessible uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.transport.view') THEN RAISE EXCEPTION 'Not authorized: billing.transport.view required'; END IF;
  SELECT array_agg(gai.institution_id) INTO v_accessible FROM public.get_user_accessible_institutions(auth.uid()) AS gai;
  IF v_accessible IS NULL THEN v_accessible := ARRAY[]::uuid[]; END IF;
  RETURN QUERY
  SELECT lp.id, lp.first_name, lp.last_name, lp.roll_number, lp.institution_id,
    rt.route_number, rt.route_name, st.stop_name,
    COALESCE(SUM(bsb.final_amount) FILTER (WHERE bsb.status NOT IN ('cancelled','superseded')), 0),
    COALESCE(SUM(CASE WHEN bsb.status IN ('unpaid','partially_paid') THEN COALESCE(bsb.balance_amount, bsb.final_amount, bsb.total_amount, 0) ELSE 0 END), 0),
    COALESCE(array_agg(bsb.id) FILTER (WHERE bsb.status IN ('unpaid','partially_paid')), ARRAY[]::uuid[]),
    COUNT(bsb.id)::int,
    COALESCE(array_agg(bsb.bill_description ORDER BY bsb.due_date) FILTER (WHERE bsb.status NOT IN ('cancelled','superseded') AND bsb.bill_description IS NOT NULL), ARRAY[]::text[]),
    COALESCE(deg.display_name, deg.degree_name)::text, COALESCE(dept.display_name, dept.department_name)::text, COALESCE(prog.display_name, prog.program_name)::text, sem.semester_name::text
  FROM public.learners_profiles lp
  JOIN public.billing_student_bills bsb ON bsb.student_id = lp.id
  JOIN public.billing_categories bc ON bc.id = bsb.item_category_id AND bc.kind = 'transport'
  LEFT JOIN public.tms_route rt ON rt.id = lp.transport_route_id
  LEFT JOIN public.tms_route_stop st ON st.id = lp.transport_stop_id
  LEFT JOIN public.degrees deg ON deg.id = lp.degree_id
  LEFT JOIN public.departments dept ON dept.id = lp.department_id
  LEFT JOIN public.programs prog ON prog.id = lp.program_id
  LEFT JOIN public.semesters sem ON sem.id = lp.semester_id
  WHERE lp.institution_id = ANY(v_accessible)
    AND (p_institution_ids IS NULL OR lp.institution_id = ANY(p_institution_ids))
    AND (p_academic_year_id IS NULL OR bsb.academic_year_id = p_academic_year_id)
  GROUP BY lp.id, lp.first_name, lp.last_name, lp.roll_number, lp.institution_id, rt.route_number, rt.route_name, st.stop_name,
    deg.display_name, deg.degree_name, dept.display_name, dept.department_name, prog.display_name, prog.program_name, sem.semester_name
  ORDER BY lp.first_name, lp.last_name;
END; $$;
REVOKE ALL ON FUNCTION public.fn_list_transport_collectables(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_list_transport_collectables(uuid[], uuid) TO authenticated;

-- Defense-in-depth: revoke Supabase default broad grants on the credentials table.
-- Access is service_role-only via RLS + the RPCs above; the app never touches this
-- table as anon/authenticated.
REVOKE ALL ON public.razorpay_accounts FROM anon, authenticated;

-- fn_admission_lead_scope (2026-06-03): single-round-trip lead-access resolver
-- for the service-role admission leads list + [id] detail routes. Delegates to
-- the SAME helpers adm_leads_select RLS uses so API and RLS stay in lockstep.
-- Consumed by lib/api-helpers/admission-lead-visibility.ts.
CREATE OR REPLACE FUNCTION public.fn_admission_lead_scope(p_user_id uuid)
RETURNS TABLE (
  profile_exists      boolean,
  is_super            boolean,
  has_view_permission boolean,
  in_allowlist        boolean,
  is_strict_counselor boolean,
  has_global_role     boolean,
  my_counselor_id     uuid,
  institution_id      uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = p_user_id),
    COALESCE((SELECT (p.is_super_admin = true OR p.role = 'super_admin')
              FROM profiles p WHERE p.id = p_user_id), false),
    public.user_has_permission(p_user_id, 'admission.leads.view'),
    public._user_in_admission_lead_allowlist(p_user_id),
    public._user_is_strict_counselor(p_user_id),
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = p_user_id
        AND (cr.institution_scope = 'all'
             OR (cr.module_scopes ->> 'admission') = 'all_institutions')
    ),
    (SELECT ac.id FROM admission_counselors ac
      WHERE ac.user_id = p_user_id ORDER BY ac.id LIMIT 1),
    (SELECT p.institution_id FROM profiles p WHERE p.id = p_user_id);
$function$;

REVOKE ALL ON FUNCTION public.fn_admission_lead_scope(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_admission_lead_scope(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_admission_lead_scope(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_admission_lead_scope(uuid) TO service_role;

-- create_lead_activity (2026-06-03): single-round-trip activity writer for the
-- admission lead detail page (INSERT + last_activity_at bump in one call).
-- SECURITY DEFINER bypasses the heavy adm_leads_update RLS for the timestamp
-- bump, but re-checks authorization (mirrors adm_lead_activities_all).
CREATE OR REPLACE FUNCTION public.create_lead_activity(
  p_lead_id uuid,
  p_activity_type text,
  p_subject text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_outcome text DEFAULT NULL,
  p_scheduled_at timestamptz DEFAULT NULL
)
RETURNS public.admission_lead_activities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_row public.admission_lead_activities;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('admission.leads.view')) THEN
    RAISE EXCEPTION 'not authorized to log lead activities'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.admission_lead_activities
    (lead_id, activity_type, subject, description, outcome, scheduled_at, created_by)
  VALUES
    (p_lead_id, p_activity_type, p_subject, p_description, p_outcome, p_scheduled_at, v_uid)
  RETURNING * INTO v_row;

  UPDATE public.admission_leads
     SET last_activity_at = v_now,
         updated_at       = v_now,
         last_contact_at  = CASE
           WHEN p_activity_type IN ('call','email','meeting','sms','whatsapp') THEN v_now
           ELSE last_contact_at
         END
   WHERE id = p_lead_id;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_lead_activity(uuid, text, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_lead_activity(uuid, text, text, text, text, timestamptz) TO authenticated, service_role;

-- get_counselor_assigned_lead_counts — aggregates assigned-lead counts per
-- counselor id in one round-trip, replacing the per-counselor N+1 COUNT(*) on
-- the Team → Members data table. SECURITY DEFINER + scope-once: the original
-- SECURITY INVOKER version re-ran admission_leads RLS per row (~14.7s timeout).
-- Persona scoping mirrors the RLS. See migration
-- 20260604190002_counselor_assigned_lead_counts_security_definer_scope.sql.
CREATE OR REPLACE FUNCTION public.get_counselor_assigned_lead_counts(p_ids uuid[])
RETURNS TABLE(assigned_counselor_id uuid, lead_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid             uuid    := auth.uid();
  v_is_admin        boolean := public.is_super_admin() OR public.is_admin(auth.uid());
  v_is_strict       boolean := public._user_is_strict_counselor(auth.uid());
  v_can_view        boolean := public.user_has_permission(auth.uid(), 'admission.leads.view');
  v_in_allowlist    boolean := public._user_in_admission_lead_allowlist(auth.uid());
  v_my_counselor_id uuid;
  v_accessible      uuid[];
BEGIN
  IF NOT v_is_admin AND NOT v_is_strict AND NOT (v_can_view AND v_in_allowlist) THEN
    RETURN;
  END IF;

  IF v_is_admin THEN
    RETURN QUERY
      SELECT al.assigned_counselor_id, COUNT(*)
      FROM admission_leads al
      WHERE al.assigned_counselor_id = ANY(p_ids)
      GROUP BY al.assigned_counselor_id;
    RETURN;
  END IF;

  IF v_is_strict THEN
    SELECT ac.id INTO v_my_counselor_id
      FROM admission_counselors ac WHERE ac.user_id = v_uid ORDER BY ac.id LIMIT 1;
    RETURN QUERY
      SELECT al.assigned_counselor_id, COUNT(*)
      FROM admission_leads al
      WHERE al.assigned_counselor_id = ANY(p_ids)
        AND (al.assigned_counselor_id = v_uid OR al.assigned_counselor_id = v_my_counselor_id)
      GROUP BY al.assigned_counselor_id;
    RETURN;
  END IF;

  v_accessible := public._user_accessible_institutions();
  RETURN QUERY
    SELECT al.assigned_counselor_id, COUNT(*)
    FROM admission_leads al
    WHERE al.assigned_counselor_id = ANY(p_ids)
      AND (al.institution_id IS NULL OR al.institution_id = ANY(v_accessible))
    GROUP BY al.assigned_counselor_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_counselor_assigned_lead_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_counselor_assigned_lead_counts(uuid[]) TO authenticated, service_role;

-- get_lead_counts_by_source — per-source lead/assigned/unassigned/conversion
-- counts for the allocation/sources KPI strip. SECURITY DEFINER: resolves the
-- caller's scope ONCE then filters on a local array, instead of letting RLS
-- re-evaluate _user_accessible_institutions() per row (which caused a 15s /
-- statement-timeout full scan). Persona scoping mirrors the admission_leads
-- RLS. See migration 20260604190000_get_lead_counts_by_source_security_definer_scope.sql.
CREATE OR REPLACE FUNCTION public.get_lead_counts_by_source(p_institution_id uuid DEFAULT NULL)
RETURNS TABLE(source lead_source, lead_count bigint, assigned_count bigint, unassigned_count bigint, conversions bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid             uuid := auth.uid();
  v_my_counselor_id uuid;
  v_accessible      uuid[];
BEGIN
  IF public.is_super_admin() OR public.is_admin(v_uid) THEN
    RETURN QUERY
      SELECT al.source,
             COUNT(*),
             COUNT(*) FILTER (WHERE al.counselor_id IS NOT NULL),
             COUNT(*) FILTER (WHERE al.counselor_id IS NULL),
             COUNT(*) FILTER (WHERE al.funnel_stage IN ('enrolled','confirmed'))
      FROM admission_leads al
      WHERE p_institution_id IS NULL OR al.institution_id = p_institution_id
      GROUP BY al.source;
    RETURN;
  END IF;

  IF public._user_is_strict_counselor(v_uid) THEN
    SELECT ac.id INTO v_my_counselor_id
      FROM admission_counselors ac
     WHERE ac.user_id = v_uid
     ORDER BY ac.id LIMIT 1;
    RETURN QUERY
      SELECT al.source,
             COUNT(*),
             COUNT(*) FILTER (WHERE al.counselor_id IS NOT NULL),
             COUNT(*) FILTER (WHERE al.counselor_id IS NULL),
             COUNT(*) FILTER (WHERE al.funnel_stage IN ('enrolled','confirmed'))
      FROM admission_leads al
      WHERE al.source <> 'referral'::lead_source
        AND (al.assigned_counselor_id = v_uid OR al.assigned_counselor_id = v_my_counselor_id)
        AND (p_institution_id IS NULL OR al.institution_id = p_institution_id)
      GROUP BY al.source;
    RETURN;
  END IF;

  IF public.user_has_permission(v_uid, 'admission.leads.view')
     AND public._user_in_admission_lead_allowlist(v_uid) THEN
    v_accessible := public._user_accessible_institutions();
    RETURN QUERY
      SELECT al.source,
             COUNT(*),
             COUNT(*) FILTER (WHERE al.counselor_id IS NOT NULL),
             COUNT(*) FILTER (WHERE al.counselor_id IS NULL),
             COUNT(*) FILTER (WHERE al.funnel_stage IN ('enrolled','confirmed'))
      FROM admission_leads al
      WHERE (al.institution_id IS NULL OR al.institution_id = ANY(v_accessible))
        AND (p_institution_id IS NULL OR al.institution_id = p_institution_id)
      GROUP BY al.source;
    RETURN;
  END IF;

  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_lead_counts_by_source(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lead_counts_by_source(uuid) TO authenticated, service_role;

-- get_source_distribution — per-counselor distribution for one source. Same
-- SECURITY DEFINER scope-once rewrite as get_lead_counts_by_source (the prior
-- invoker version re-ran admission_leads RLS per row → 15.8s timeout). See
-- migration 20260604190001_get_source_distribution_security_definer_scope.sql.
CREATE OR REPLACE FUNCTION public.get_source_distribution(
  p_source lead_source,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE(
  counselor_id uuid, user_id uuid, counselor_name text, counselor_email text,
  counselor_designation text, total_leads bigint, new_leads bigint,
  progressed_leads bigint, conversions bigint, lost_leads bigint,
  last_assigned_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid             uuid    := auth.uid();
  v_is_admin        boolean := public.is_super_admin() OR public.is_admin(auth.uid());
  v_is_strict       boolean := public._user_is_strict_counselor(auth.uid());
  v_can_view        boolean := public.user_has_permission(auth.uid(), 'admission.leads.view');
  v_in_allowlist    boolean := public._user_in_admission_lead_allowlist(auth.uid());
  v_my_counselor_id uuid;
  v_accessible      uuid[];
BEGIN
  IF NOT v_is_admin AND NOT v_is_strict AND NOT (v_can_view AND v_in_allowlist) THEN
    RETURN;
  END IF;

  IF v_is_strict AND NOT v_is_admin THEN
    SELECT ac.id INTO v_my_counselor_id
      FROM admission_counselors ac WHERE ac.user_id = v_uid ORDER BY ac.id LIMIT 1;
  END IF;

  IF NOT v_is_admin AND NOT v_is_strict THEN
    v_accessible := public._user_accessible_institutions();
  END IF;

  RETURN QUERY
  WITH window_leads AS (
    SELECT *
    FROM admission_leads al
    WHERE al.source = p_source
      AND (p_from IS NULL OR al.created_at >= p_from)
      AND (p_to   IS NULL OR al.created_at <= p_to)
      AND (p_institution_id IS NULL OR al.institution_id = p_institution_id)
      AND (
        v_is_admin
        OR (v_is_strict
            AND al.source <> 'referral'::lead_source
            AND (al.assigned_counselor_id = v_uid OR al.assigned_counselor_id = v_my_counselor_id))
        OR (NOT v_is_admin AND NOT v_is_strict
            AND (al.institution_id IS NULL OR al.institution_id = ANY(v_accessible)))
      )
  )
  SELECT
    ac.id,
    wl.assigned_counselor_id,
    ac.name,
    ac.email,
    ac.designation,
    COUNT(*),
    COUNT(*) FILTER (WHERE wl.funnel_stage = 'new'),
    COUNT(*) FILTER (
      WHERE wl.funnel_stage IS NOT NULL
        AND wl.funnel_stage NOT IN ('new','lost','not_reachable','enrolled','confirmed')
    ),
    COUNT(*) FILTER (WHERE wl.funnel_stage IN ('enrolled','confirmed')),
    COUNT(*) FILTER (WHERE wl.funnel_stage IN ('lost','not_reachable')),
    MAX(wl.assigned_at)
  FROM window_leads wl
  LEFT JOIN admission_counselors ac ON ac.user_id = wl.assigned_counselor_id
  GROUP BY ac.id, wl.assigned_counselor_id, ac.name, ac.email, ac.designation;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_source_distribution(lead_source, timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_source_distribution(lead_source, timestamptz, timestamptz, uuid) TO authenticated, service_role;

-- Resolve a hosteller's hostel/mess fee for a given hostel year.
-- Returns jsonb array: [{fee_source, package_id, category_id, category_name, amount}].
CREATE OR REPLACE FUNCTION public.campus_living_resolve_hostel_fee(
  p_learner_id uuid,
  p_hostel_year_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lp           learners_profiles%ROWTYPE;
  v_package_id uuid;
  v_flat       numeric;
  v_items      jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO lp FROM learners_profiles WHERE id = p_learner_id;
  IF NOT FOUND THEN RETURN v_items; END IF;

  -- 1) Explicit assignment overrides matching.
  SELECT lpa.package_id INTO v_package_id
  FROM learner_package_assignment lpa
  WHERE lpa.learner_id = p_learner_id AND lpa.hostel_year_id = p_hostel_year_id
  LIMIT 1;

  -- 2) Else match an active package by the learner's fixed dims (NULL package dim = wildcard).
  IF v_package_id IS NULL THEN
    SELECT p.id INTO v_package_id
    FROM admission_packages p
    WHERE p.is_active
      AND p.institution_id   = lp.institution_id
      AND (p.admission_year_id IS NULL OR p.admission_year_id = lp.admission_year_id)
      AND (p.degree_id        IS NULL OR p.degree_id        = lp.degree_id)
      AND (p.department_id     IS NULL OR p.department_id     = lp.department_id)
      AND (p.programme_id      IS NULL OR p.programme_id      = lp.program_id)
      AND (p.quota_id          IS NULL OR p.quota_id          = lp.quota_id)
      AND (p.gender            IS NULL OR upper(p.gender)      = upper(lp.gender))
      AND (p.room_category_id  IS NULL OR p.room_category_id  = lp.hostel_category_id)
      AND (p.mess_category_id  IS NULL OR p.mess_category_id  = lp.mess_category_id)
    ORDER BY
      (p.admission_year_id IS NOT NULL)::int + (p.programme_id IS NOT NULL)::int
      + (p.quota_id IS NOT NULL)::int + (p.gender IS NOT NULL)::int DESC
    LIMIT 1;
  END IF;

  IF v_package_id IS NULL THEN RETURN v_items; END IF;

  -- 3) Prefer a flat package fee for (package, hostel year).
  SELECT hf.amount INTO v_flat
  FROM hostel_fees hf
  WHERE hf.package_id = v_package_id AND hf.hostel_year_id = p_hostel_year_id AND hf.is_active
  LIMIT 1;

  IF v_flat IS NOT NULL THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'fee_source','hostel_package','package_id',v_package_id,
      'category_id',NULL,'category_name','Hostel Package','amount',v_flat));
  END IF;

  -- 4) Else sum the learner's room + mess category fees for the hostel year.
  SELECT jsonb_agg(jsonb_build_object(
           'fee_source','hostel_category','package_id',v_package_id,
           'category_id',cat_id,'category_name',cat_name,'amount',amount))
  INTO v_items
  FROM (
    SELECT hc.id AS cat_id, hc.name AS cat_name, hf.amount
    FROM hostel_fees hf JOIN hostel_categories hc ON hc.id = hf.hostel_category_id
    WHERE hf.hostel_category_id = lp.hostel_category_id
      AND hf.hostel_year_id = p_hostel_year_id AND hf.is_active
    UNION ALL
    SELECT mc.id, mc.name, hf.amount
    FROM hostel_fees hf JOIN mess_categories mc ON mc.id = hf.mess_category_id
    WHERE hf.mess_category_id = lp.mess_category_id
      AND hf.mess_category_id IS NOT NULL
      AND hf.hostel_year_id = p_hostel_year_id AND hf.is_active
  ) rows;

  RETURN COALESCE(v_items, '[]'::jsonb);
END $$;

NOTIFY pgrst, 'reload schema';

-- campus_living_generate_hostel_year_bills
-- For each hosteller in p_learner_ids, compute the combined bill set for p_hostel_year_id:
--   year-of-study-filtered academic items + hostel/mess items.
-- Dedup against existing (student, hostel_year, category|package) bills.
-- p_dry_run=true: return the plan without inserting. false: insert new bills idempotently.
CREATE OR REPLACE FUNCTION public.campus_living_generate_hostel_year_bills(
  p_hostel_year_id uuid,
  p_learner_ids    uuid[],
  p_dry_run        boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result      jsonb := '[]'::jsonb;
  v_learner     uuid;
  lp            learners_profiles%ROWTYPE;
  v_hostel      jsonb;
  v_item        jsonb;
  v_proposed    jsonb;
  v_skipped     jsonb;
  v_new         int;
  v_exists      boolean;
  v_cat         uuid;
  v_pkg         uuid;
  v_src         text;
BEGIN
  -- permission gate (reuse campus_living.fees.config or the new fees.generate key)
  IF NOT public.user_has_permission('campus_living.fees.config') THEN
    RAISE EXCEPTION 'permission denied: campus_living.fees.config' USING ERRCODE = '42501';
  END IF;

  FOREACH v_learner IN ARRAY p_learner_ids LOOP
    SELECT * INTO lp FROM learners_profiles WHERE id = v_learner;
    CONTINUE WHEN NOT FOUND;
    -- hostellers only
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM accommodation_types a WHERE a.id = lp.accommodation_type_id AND a.code = 'hostel');

    v_hostel   := public.campus_living_resolve_hostel_fee(v_learner, p_hostel_year_id);
    v_proposed := '[]'::jsonb; v_skipped := '[]'::jsonb; v_new := 0;

    -- Hostel/mess items ONLY. Academic fees are billed from the admission fee structure
    -- (account-transition / admission_reconcile path), NOT here. (root-cause fix 2026-06-21)
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_hostel,'[]'::jsonb)) LOOP
      v_src := v_item->>'fee_source'; v_cat := NULLIF(v_item->>'category_id','')::uuid;
      v_pkg := NULLIF(v_item->>'package_id','')::uuid;
      IF v_src = 'hostel_package' THEN
        SELECT EXISTS(SELECT 1 FROM billing_student_bills b WHERE b.student_id=v_learner
          AND b.hostel_year_id=p_hostel_year_id AND b.package_id=v_pkg
          AND b.fee_source='hostel_package' AND b.status NOT IN ('cancelled','superseded')) INTO v_exists;
      ELSE
        SELECT EXISTS(SELECT 1 FROM billing_student_bills b WHERE b.student_id=v_learner
          AND b.hostel_year_id=p_hostel_year_id AND b.item_category_id=v_cat
          AND b.fee_source IN ('academic','hostel_category') AND b.status NOT IN ('cancelled','superseded')) INTO v_exists;
      END IF;
      IF v_exists THEN v_skipped := v_skipped || v_item;
      ELSE
        v_proposed := v_proposed || v_item;
        IF NOT p_dry_run THEN
          INSERT INTO billing_student_bills (student_id, institution_id, item_category_id,
            hostel_year_id, package_id, fee_source, academic_year_id, bill_description, due_date,
            quantity, unit_amount, total_amount, final_amount, balance_amount, status)
          VALUES (v_learner, lp.institution_id, v_cat, p_hostel_year_id, v_pkg, v_src, lp.academic_year_id,
            v_item->>'category_name', now()+interval '30 day', 1,
            (v_item->>'amount')::numeric, (v_item->>'amount')::numeric,
            (v_item->>'amount')::numeric, (v_item->>'amount')::numeric, 'unpaid')
          ON CONFLICT DO NOTHING;  -- partial unique index is the final guard
        END IF;
        v_new := v_new + 1;
      END IF;
    END LOOP;

    v_result := v_result || jsonb_build_object(
      'learner_id', v_learner,
      'proposed', v_proposed, 'skipped', v_skipped, 'new_count', v_new);
  END LOOP;

  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.campus_living_generate_hostel_year_bills(uuid, uuid[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.campus_living_generate_hostel_year_bills(uuid, uuid[], boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.campus_living_generate_hostel_year_bills(uuid, uuid[], boolean) TO authenticated;

-- campus_living_get_hostelite_bill_status (migration 20260606120500)
-- Per-student current-academic-year billing rollup for the Campus Living
-- Residents → Learners tab. SECURITY DEFINER so campus-living operators (who
-- typically lack billing.schedule.view) can read aggregates; scoped to the
-- caller's accessible institutions to prevent cross-institution leakage.

CREATE OR REPLACE FUNCTION public.campus_living_get_hostelite_bill_status(p_student_ids uuid[])
RETURNS TABLE (
  student_id uuid,
  academic_year_id uuid,
  academic_year_name text,
  bill_count integer,
  total_billed numeric,
  total_paid numeric,
  total_outstanding numeric,
  payment_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_permission('campus_living.residents.view') THEN
    RAISE EXCEPTION 'permission denied: campus_living.residents.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH students AS (
    SELECT lp.id AS sid, lp.academic_year_id AS ayid
    FROM learners_profiles lp
    WHERE lp.id = ANY(p_student_ids)
      AND lp.institution_id = ANY(public._user_accessible_institutions())
  ),
  agg AS (
    SELECT b.student_id AS sid,
           count(*)::int AS bill_count,
           COALESCE(sum(b.final_amount), 0) AS total_billed,
           COALESCE(sum(b.balance_amount), 0) AS total_outstanding
    FROM billing_student_bills b
    JOIN students s ON s.sid = b.student_id
    WHERE s.ayid IS NOT NULL
      AND b.academic_year_id = s.ayid
      AND b.status NOT IN ('cancelled', 'superseded')
    GROUP BY b.student_id
  )
  SELECT
    s.sid,
    s.ayid,
    ay.academic_year_name::text,
    COALESCE(a.bill_count, 0)::int,
    COALESCE(a.total_billed, 0)::numeric,
    (COALESCE(a.total_billed, 0) - COALESCE(a.total_outstanding, 0))::numeric,
    COALESCE(a.total_outstanding, 0)::numeric,
    (CASE
      WHEN COALESCE(a.bill_count, 0) = 0 THEN 'none'
      WHEN COALESCE(a.total_outstanding, 0) <= 0 THEN 'paid'
      WHEN (COALESCE(a.total_billed, 0) - COALESCE(a.total_outstanding, 0)) > 0 THEN 'partial'
      ELSE 'unpaid'
    END)::text
  FROM students s
  LEFT JOIN agg a ON a.sid = s.sid
  LEFT JOIN academic_years ay ON ay.id = s.ayid;
END
$function$;

GRANT EXECUTE ON FUNCTION public.campus_living_get_hostelite_bill_status(uuid[]) TO authenticated;

-- campus_living_get_hostelite_bills (migration 20260609130000)
-- Itemized bill list for ONE hostelite, powering the Billing details section of
-- the Residents → Learners detail drawer. Each billing_student_bills row is a
-- line item (category + amount + balance + status); paid_amount = final - balance.
-- SECURITY DEFINER + gated on campus_living.residents.view so wardens without
-- billing.* SELECT can read it (a direct read returns 0 rows under RLS); scoped
-- to accessible institutions. ALL academic years; cancelled/superseded excluded.

CREATE OR REPLACE FUNCTION public.campus_living_get_hostelite_bills(p_student_id uuid)
RETURNS TABLE (
  id uuid,
  item_category_id uuid,
  category_name text,
  bill_description text,
  due_date date,
  final_amount numeric,
  balance_amount numeric,
  paid_amount numeric,
  status text,
  fee_source text,
  applies_year_of_study integer,
  academic_year_id uuid,
  academic_year_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_permission('campus_living.residents.view') THEN
    RAISE EXCEPTION 'permission denied: campus_living.residents.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    b.item_category_id,
    bc.category_name::text,
    b.bill_description,
    b.due_date,
    b.final_amount,
    b.balance_amount,
    (COALESCE(b.final_amount, 0) - COALESCE(b.balance_amount, 0))::numeric AS paid_amount,
    b.status::text,
    b.fee_source,
    b.applies_year_of_study,
    b.academic_year_id,
    ay.academic_year_name::text
  FROM billing_student_bills b
  JOIN learners_profiles lp ON lp.id = b.student_id
  LEFT JOIN billing_categories bc ON bc.id = b.item_category_id
  LEFT JOIN academic_years ay ON ay.id = b.academic_year_id
  WHERE b.student_id = p_student_id
    AND lp.institution_id = ANY(public._user_accessible_institutions())
    AND b.status NOT IN ('cancelled', 'superseded')
  ORDER BY ay.academic_year_name DESC NULLS LAST,
           b.due_date ASC NULLS LAST,
           bc.category_name ASC NULLS LAST;
END
$function$;

REVOKE ALL ON FUNCTION public.campus_living_get_hostelite_bills(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.campus_living_get_hostelite_bills(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.campus_living_get_hostelite_bills(uuid) TO authenticated;

-- ============================================================
-- Fee-aware program eligibility — fee source + resolvers.
-- Migration: 20260606160100_fee_aware_eligibility_functions.sql
-- SINGLE source of truth: nothing else computes the gating fee or the category set.
-- ============================================================

-- 1. The gating fee = current-academic-year academic bill total.
--    NO COALESCE: SUM over zero rows = NULL = "no fee data" => caller fails open.
--    SECURITY DEFINER so campus-living operators without billing read still get it
--    (returns only an aggregate numeric — no row leakage).
CREATE OR REPLACE FUNCTION public.fn_learner_current_year_academic_fee(p_learner_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Bills predating academic_year_id stamping have NULL here and are excluded;
  -- a learner with no matching (tagged) bill yields NULL => caller fails open. Intentional.
  SELECT SUM(b.final_amount)
  FROM billing_student_bills b
  JOIN learners_profiles lp ON lp.id = b.student_id
  WHERE b.student_id = p_learner_id
    AND b.fee_source = 'academic'
    AND b.status NOT IN ('cancelled','superseded')
    AND b.academic_year_id = lp.academic_year_id;
$$;

-- 2. Parametric resolver (room). Most-specific matching scope wins; tie-break by
--    tightest band. Returns ALL categories in the winning scope (allow-set).
--    Empty result => caller fails open.
--    Reads hostel_program_eligibility (single combined table; replaces the former
--    split hostel_program_room_eligibility + hostel_program_mess_eligibility).
-- hostel_program_eligibility.quota_ids normalisation + validation (replaces the
-- dropped quota_id FK): empty -> NULL; de-dupe + sort ascending (canonical form
-- for the order-insensitive unique index); reject ids that aren't real quotas.
-- Migration: 20260615120000_hostel_program_eligibility_multi_quota.sql
CREATE OR REPLACE FUNCTION public.fn_prog_elig_normalize_quotas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_clean uuid[];
  v_bad uuid;
BEGIN
  IF NEW.quota_ids IS NULL OR cardinality(NEW.quota_ids) = 0 THEN
    NEW.quota_ids := NULL;
    RETURN NEW;
  END IF;

  SELECT array_agg(q ORDER BY q) INTO v_clean
  FROM (SELECT DISTINCT unnest(NEW.quota_ids) AS q) s;

  SELECT v INTO v_bad
  FROM unnest(v_clean) AS v
  WHERE NOT EXISTS (SELECT 1 FROM public.quotas WHERE id = v);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'quota_ids contains a non-existent quota id: %', v_bad
      USING ERRCODE = '23503';
  END IF;

  NEW.quota_ids := v_clean;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prog_elig_normalize_quotas ON public.hostel_program_eligibility;
CREATE TRIGGER trg_prog_elig_normalize_quotas
  BEFORE INSERT OR UPDATE ON public.hostel_program_eligibility
  FOR EACH ROW EXECUTE FUNCTION public.fn_prog_elig_normalize_quotas();

CREATE OR REPLACE FUNCTION public.fn_hostel_effective_room_categories(
  p_institution uuid, p_program uuid, p_quota uuid, p_fee numeric, p_gender text DEFAULT NULL
) RETURNS TABLE(category_id uuid)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH candidates AS (
    SELECT e.room_category_id AS cat,
           e.program_id, e.quota_ids, e.fee_min, e.fee_max,
           ( (e.program_id IS NOT NULL)::int * 4
           + (e.quota_ids  IS NOT NULL)::int * 2
           + ((e.fee_min IS NOT NULL OR e.fee_max IS NOT NULL))::int * 1 ) AS specificity
    FROM hostel_program_eligibility e
    WHERE e.institution_id = p_institution
      AND e.is_active
      AND e.room_category_id IS NOT NULL
      AND (p_gender IS NULL OR e.hostel_type = 'both' OR e.hostel_type = p_gender)
      AND (e.program_id = p_program OR e.program_id IS NULL)
      AND (e.quota_ids IS NULL OR p_quota = ANY(e.quota_ids))
      -- half-open interval [fee_min, fee_max): includes min, excludes max
      AND (e.fee_min IS NULL OR p_fee >= e.fee_min)
      AND (e.fee_max IS NULL OR p_fee <  e.fee_max)
  ),
  winner AS (
    SELECT program_id, quota_ids, fee_min, fee_max
    FROM candidates
    ORDER BY specificity DESC,
             (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  )
  -- Gender translation (20260615): map the winning band's category to the learner's
  -- gender variant (same NAME, matching type) so one shared 'both' band serves boys and
  -- girls. Falls back to the stored category when no same-name sibling exists.
  SELECT COALESCE(
           CASE WHEN p_gender IS NOT NULL AND oc.type IS NOT NULL AND oc.type <> p_gender
                THEN (SELECT sib.id FROM hostel_categories sib
                       WHERE sib.name = oc.name AND sib.type = p_gender LIMIT 1)
                ELSE NULL END,
           c.cat)
  FROM candidates c JOIN winner w
    ON c.program_id IS NOT DISTINCT FROM w.program_id
   AND c.quota_ids  IS NOT DISTINCT FROM w.quota_ids
   AND c.fee_min    IS NOT DISTINCT FROM w.fee_min
   AND c.fee_max    IS NOT DISTINCT FROM w.fee_max
  LEFT JOIN hostel_categories oc ON oc.id = c.cat;
$$;

-- 3. Parametric resolver (mess) — identical shape, reads hostel_program_eligibility.
CREATE OR REPLACE FUNCTION public.fn_hostel_effective_mess_categories(
  p_institution uuid, p_program uuid, p_quota uuid, p_fee numeric, p_gender text DEFAULT NULL
) RETURNS TABLE(category_id uuid)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH candidates AS (
    SELECT e.mess_category_id AS cat,
           e.program_id, e.quota_ids, e.fee_min, e.fee_max,
           ( (e.program_id IS NOT NULL)::int * 4
           + (e.quota_ids  IS NOT NULL)::int * 2
           + ((e.fee_min IS NOT NULL OR e.fee_max IS NOT NULL))::int * 1 ) AS specificity
    FROM hostel_program_eligibility e
    WHERE e.institution_id = p_institution
      AND e.is_active
      AND e.mess_category_id IS NOT NULL
      AND (p_gender IS NULL OR e.hostel_type = 'both' OR e.hostel_type = p_gender)
      AND (e.program_id = p_program OR e.program_id IS NULL)
      AND (e.quota_ids IS NULL OR p_quota = ANY(e.quota_ids))
      -- half-open interval [fee_min, fee_max): includes min, excludes max
      AND (e.fee_min IS NULL OR p_fee >= e.fee_min)
      AND (e.fee_max IS NULL OR p_fee <  e.fee_max)
  ),
  winner AS (
    SELECT program_id, quota_ids, fee_min, fee_max
    FROM candidates
    ORDER BY specificity DESC,
             (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  )
  -- Gender translation (20260615): map the winning band's mess category to the learner's
  -- gender variant (same NAME, matching type) so one shared 'both' band serves boys and
  -- girls. Falls back to the stored category when no same-name sibling exists.
  SELECT COALESCE(
           CASE WHEN p_gender IS NOT NULL AND oc.type IS NOT NULL AND oc.type <> p_gender
                THEN (SELECT sib.id FROM mess_categories sib
                       WHERE sib.name = oc.name AND sib.type = p_gender LIMIT 1)
                ELSE NULL END,
           c.cat)
  FROM candidates c JOIN winner w
    ON c.program_id IS NOT DISTINCT FROM w.program_id
   AND c.quota_ids  IS NOT DISTINCT FROM w.quota_ids
   AND c.fee_min    IS NOT DISTINCT FROM w.fee_min
   AND c.fee_max    IS NOT DISTINCT FROM w.fee_max
  LEFT JOIN mess_categories oc ON oc.id = c.cat;
$$;

-- 4. Composite (room): the interface callers use. Reads the learner's dims +
--    fee, then resolves. NULL fee or NULL program => empty => fail-open.
--    SECURITY DEFINER so it reliably reads learners_profiles; returns only ids.
CREATE OR REPLACE FUNCTION public.fn_hostel_learner_room_categories(p_learner_id uuid)
RETURNS TABLE(category_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_institution uuid; v_program uuid; v_quota uuid; v_fee numeric; v_gender text; v_gt text;
BEGIN
  SELECT lp.institution_id, lp.program_id, lp.quota_id, lp.gender
    INTO v_institution, v_program, v_quota, v_gender
  FROM learners_profiles lp WHERE lp.id = p_learner_id;

  IF v_institution IS NULL THEN RETURN; END IF;        -- no institution => fail-open
  IF v_program IS NULL THEN RETURN; END IF;            -- no program => fail-open
  v_fee := fn_learner_current_year_academic_fee(p_learner_id);
  IF v_fee IS NULL THEN RETURN; END IF;                -- no bill data => fail-open

  v_gt := CASE WHEN lower(v_gender) LIKE 'm%' THEN 'boys'
               WHEN lower(v_gender) LIKE 'f%' THEN 'girls' ELSE NULL END;

  RETURN QUERY
    SELECT r.category_id
    FROM fn_hostel_effective_room_categories(v_institution, v_program, v_quota, v_fee, v_gt) r;
END $$;

-- 5. Composite (mess).
CREATE OR REPLACE FUNCTION public.fn_hostel_learner_mess_categories(p_learner_id uuid)
RETURNS TABLE(category_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_institution uuid; v_program uuid; v_quota uuid; v_fee numeric; v_gender text; v_gt text;
BEGIN
  SELECT lp.institution_id, lp.program_id, lp.quota_id, lp.gender
    INTO v_institution, v_program, v_quota, v_gender
  FROM learners_profiles lp WHERE lp.id = p_learner_id;

  IF v_institution IS NULL THEN RETURN; END IF;        -- no institution => fail-open
  IF v_program IS NULL THEN RETURN; END IF;            -- no program => fail-open
  v_fee := fn_learner_current_year_academic_fee(p_learner_id);
  IF v_fee IS NULL THEN RETURN; END IF;                -- no bill data => fail-open

  v_gt := CASE WHEN lower(v_gender) LIKE 'm%' THEN 'boys'
               WHEN lower(v_gender) LIKE 'f%' THEN 'girls' ELSE NULL END;

  RETURN QUERY
    SELECT m.category_id
    FROM fn_hostel_effective_mess_categories(v_institution, v_program, v_quota, v_fee, v_gt) m;
END $$;

GRANT EXECUTE ON FUNCTION public.fn_hostel_learner_room_categories(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hostel_learner_mess_categories(uuid) TO authenticated;

-- Lock down: revoke the Supabase-default anon/PUBLIC EXECUTE. The fee fn is
-- SECURITY DEFINER over billing data; the resolvers + composites run internally
-- via the DEFINER composites (owner has EXECUTE), so only the two composites
-- need a direct grant (the allocation page calls them as `authenticated`).
-- NOTE: Supabase grants EXECUTE directly to `anon` (not via PUBLIC) on every new
-- public function, so the revoke MUST name `anon` explicitly — `FROM PUBLIC`
-- alone leaves the explicit anon grant intact.
REVOKE EXECUTE ON FUNCTION public.fn_learner_current_year_academic_fee(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hostel_effective_room_categories(uuid,uuid,uuid,numeric) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hostel_effective_mess_categories(uuid,uuid,uuid,numeric) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hostel_learner_room_categories(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hostel_learner_mess_categories(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_hostel_learner_room_categories(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hostel_learner_mess_categories(uuid) TO authenticated;

-- Self-service room-category picker — gender filter + fee-aware eligibility gate (fail-open).
CREATE OR REPLACE FUNCTION public.fn_my_manual_categories()
RETURNS TABLE(id uuid, name text, type text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gender  text;
  v_learner uuid;
  v_elig    uuid[];
BEGIN
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE profiles.id = auth.uid();
  v_learner := get_my_learner_id();

  -- Fee-aware allow-set for this learner. NULL (no rule / no bill data) => fail-open.
  SELECT array_agg(category_id) INTO v_elig
  FROM fn_hostel_learner_room_categories(v_learner);

  RETURN QUERY
  SELECT c.id, c.name, c.type FROM hostel_categories c
  WHERE c.allocation_mode='manual' AND c.is_active
    AND ((v_gender IN ('male','m')   AND c.type='boys')
         OR (v_gender IN ('female','f') AND c.type='girls'))
    AND (v_elig IS NULL OR c.id = ANY(v_elig))
  ORDER BY c.sort_order;
END $function$;

-- ============================================================================
-- Hostel auto-allocation (mirrored 2026-06-08; previously absent from setup)
-- Updated 2026-06-08: rules-driven (drop p_category_id / p_require_bill);
--   hostel_allocation_batches.category_id is now nullable (ALTER … DROP NOT NULL).
-- ============================================================================

-- Batches now span categories (rules-driven) → category_id must be nullable.
-- ALTER TABLE public.hostel_allocation_batches ALTER COLUMN category_id DROP NOT NULL;
-- (Applied in migration 20260608160000_auto_allocate_rules_driven.sql)

-- 1) Generator: strict rules-driven sweep + mess assignment.
-- Physical-room eligibility helper: fail-OPEN on rooms with no covering rule (2026-06-09).
-- A room covered by an active physical-room rule stays restricted to learners that rule
-- matches; a room with NO covering rule is open to all (caller still enforces category +
-- gender + block-institution access). Only the auto-allocate RPCs call this helper.
CREATE OR REPLACE FUNCTION public.fn_learner_strictly_eligible_for_room(p_learner_id uuid, p_room_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_block uuid;
  v_floor int;
  v_inst uuid; v_degree uuid; v_dept uuid; v_program uuid; v_semester uuid;
  v_has_covering boolean;
  v_matches boolean;
  v_pinned boolean;
BEGIN
  SELECT block_id, floor INTO v_block, v_floor FROM hostel_rooms WHERE id = p_room_id;
  IF v_block IS NULL THEN RETURN false; END IF;

  SELECT institution_id, degree_id, department_id, program_id, semester_id
    INTO v_inst, v_degree, v_dept, v_program, v_semester
    FROM learners_profiles WHERE id = p_learner_id;

  WITH covering AS (
    SELECT r.*
    FROM hostel_room_eligibility_rules r
    WHERE r.is_active
      AND r.block_id = v_block
      AND CASE
            WHEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id = r.id)
              THEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr
                           WHERE rr.rule_id = r.id AND rr.room_id = p_room_id)
            ELSE (r.floor IS NULL OR r.floor = v_floor)
          END
  )
  SELECT EXISTS (SELECT 1 FROM covering),
         EXISTS (
           SELECT 1 FROM covering c
           WHERE c.institution_id = v_inst
             AND (c.degree_id     IS NULL OR c.degree_id     = v_degree)
             AND (c.department_id IS NULL OR c.department_id = v_dept)
             AND (c.program_id    IS NULL OR c.program_id    = v_program)
             AND (c.semester_id   IS NULL OR c.semester_id   = v_semester)
         )
    INTO v_has_covering, v_matches;

  IF v_matches THEN RETURN true; END IF;       -- room reserved for THIS cohort
  IF v_has_covering THEN RETURN false; END IF; -- room reserved for ANOTHER cohort

  -- Open (rule-free) room: admit only if the learner's cohort has no matching
  -- reservation anywhere (20260610130000) — a reserved cohort is PINNED to its
  -- reserved rooms, so it cannot leak into open rooms of other blocks.
  SELECT EXISTS (
    SELECT 1 FROM hostel_room_eligibility_rules r
    WHERE r.is_active
      AND r.institution_id = v_inst
      AND (r.degree_id     IS NULL OR r.degree_id     = v_degree)
      AND (r.department_id IS NULL OR r.department_id = v_dept)
      AND (r.program_id    IS NULL OR r.program_id    = v_program)
      AND (r.semester_id   IS NULL OR r.semester_id   = v_semester)
  ) INTO v_pinned;

  RETURN NOT v_pinned;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_auto_allocate_classic(p_block_id uuid, p_hostel_year_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_batch uuid; v_tier uuid; v_actor uuid := auth.uid();
  v_alloc int := 0; v_skip int := 0;
  v_block_type text; v_ay uuid;
  cand record; v_bed uuid; v_room uuid; v_mess uuid;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('campus_living.allocations.create')) THEN
    RAISE EXCEPTION 'Not authorized to run auto-allocation';
  END IF;

  SELECT hostel_type::text INTO v_block_type FROM hostel_blocks WHERE id=p_block_id;
  IF v_block_type IS NULL THEN RAISE EXCEPTION 'Block not found'; END IF;

  -- NOTE: no longer requires the block to have physical-room rules. Rooms without a
  -- covering rule are open to all served institutions (fn_learner_strictly_eligible_for_room).

  SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND institution_id IS NULL AND is_active LIMIT 1;
  IF v_tier IS NULL THEN SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND is_active LIMIT 1; END IF;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy found'; END IF;

  INSERT INTO hostel_allocation_batches (block_id, category_id, hostel_year_id, status, created_by)
  VALUES (p_block_id, NULL, p_hostel_year_id, 'pending_approval', v_actor)
  RETURNING id INTO v_batch;

  -- Cohort in institution-priority order: primary institution first, then by institution
  -- name, then learners A->Z. Greedy bed-claim in this order means earlier institutions get
  -- first pick of shared/open rooms.
  FOR cand IN
    SELECT lp.id AS lp_id, p.id AS profile_id, lp.semester_id AS sem_id,
           lp.academic_year_id AS ay_id, lp.institution_id AS inst,
           lower(trim(p.gender)) AS gender,
           room_elig.cats AS room_cats, mess_elig.cats AS mess_cats
    FROM learners_profiles lp
    JOIN profiles p ON p.learner_id = lp.id
    JOIN hostel_block_institutions hbi ON hbi.block_id = p_block_id AND hbi.institution_id = lp.institution_id
    JOIN institutions inst_t ON inst_t.id = lp.institution_id
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_room_categories(lp.id)) room_elig ON true
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_mess_categories(lp.id)) mess_elig ON true
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code = 'hostel')
      AND room_elig.cats IS NOT NULL  -- STRICT: rules must resolve a room category
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
    ORDER BY hbi.is_primary DESC,
             lower(coalesce(inst_t.name,'')),
             lower(coalesce(lp.first_name,'')), lower(coalesce(lp.last_name,'')), lp.id
  LOOP
    v_ay := COALESCE(cand.ay_id, (SELECT id FROM academic_years WHERE institution_id=cand.inst AND is_active ORDER BY start_date DESC LIMIT 1));
    IF v_ay IS NULL THEN v_skip := v_skip + 1; CONTINUE; END IF;

    v_bed := NULL; v_room := NULL;
    SELECT b.id, r.id INTO v_bed, v_room
    FROM hostel_beds b
    JOIN hostel_rooms r ON r.id=b.room_id
    JOIN hostel_categories hc ON hc.id = r.category_id
    WHERE r.block_id=p_block_id AND r.room_purpose='student' AND b.status='available'
      AND r.category_id = ANY(cand.room_cats)
      AND (hc.type IS NULL
           OR (hc.type='boys'  AND cand.gender IN ('male','m'))
           OR (hc.type='girls' AND cand.gender IN ('female','f')))
      AND fn_room_serves_institution(r.id, cand.inst)
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))
      AND fn_learner_strictly_eligible_for_room(cand.lp_id, r.id)
    ORDER BY array_position(cand.room_cats, r.category_id), r.floor, r.room_number, b.bed_number
    LIMIT 1;

    IF v_bed IS NULL THEN v_skip := v_skip + 1; CONTINUE; END IF;

    INSERT INTO hostel_allocations (
      institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
      allocation_type, allocation_date, status,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
      tier_id, batch_id, allocated_by, warden_id
    ) VALUES (
      cand.inst, cand.profile_id, p_block_id, v_room, v_bed, v_ay, cand.sem_id,
      'fresh', CURRENT_DATE, 'pending_approval', '', '', '',
      v_tier, v_batch, v_actor,
      (SELECT user_id FROM user_block_access WHERE block_id=p_block_id AND revoked_at IS NULL LIMIT 1)
    );

    -- Sync the learner's profile categories to the proposal (rules-derived, idempotent;
    -- a rejected/reset batch does NOT revert): hostel_category_id from the ALLOCATED room's
    -- category (the truth), mess_category_id from the rules-derived mess (kept if none).
    -- 20260610190000: hostel_category_id was previously never written → My Hostel + hostel
    -- billing showed the stale admission-time category.
    v_mess := CASE WHEN cand.mess_cats IS NOT NULL THEN cand.mess_cats[1] ELSE NULL END;
    UPDATE learners_profiles
      SET hostel_category_id = (SELECT category_id FROM hostel_rooms WHERE id = v_room),
          mess_category_id   = COALESCE(v_mess, mess_category_id),
          updated_at = now()
      WHERE id = cand.lp_id;

    v_alloc := v_alloc + 1;
  END LOOP;

  UPDATE hostel_allocation_batches
    SET allocated_count = v_alloc, skipped_count = v_skip,
        notes = format('%s allocated (rules-driven category + mess; physical rooms: reserved rooms go to their matching cohort, cohorts with a reservation in ANY block are placed only in their reserved rooms, rule-free rooms are open to served-institution learners without a reservation; filled primary-institution first, then A-Z). %s skipped (no free bed they can occupy / reserved rooms in another block / gender / no academic year). Strict: learners with no rule-resolved room category (e.g. no current-year bill) are excluded from the cohort.', v_alloc, v_skip)
    WHERE id = v_batch;

  RETURN v_batch;
END $function$;

-- 2) Per-learner validation preview (no category input; strict).
-- 20260610160000: + semester_name (the cohort dimension physical-room rules reserve by).
-- 20260610170000: + institution_name (enables Institution → Program → Semester filter).
-- 20260615160000/170000: + p_strict (strict physical-room mode).
-- 20260616040000: + p_floor (floor scope). 20260619150000: + institution/program/semester cohort filters.
-- 20260622130000: gender-scope the cohort to the block's hostel_type (Boys block → only male
--   learners, etc.) so opposite-gender students no longer surface with a misleading
--   "different room category — fix the reservation rooms" verdict. NULL/blank gender stays visible.
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_candidates(p_block_id uuid, p_strict boolean DEFAULT false, p_floor integer DEFAULT NULL::integer, p_institution_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_semester_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  learner_id uuid, full_name text, email text, institution_name text,
  program_name text, semester_name text, gender text,
  has_profile boolean, gender_ok boolean, not_allocated boolean,
  physical_rule_ok boolean, bed_available boolean,
  academic_year_id uuid, academic_year_name text,
  academic_bill_count integer, current_year_bill_count integer, bill_other_year_name text,
  current_year_fee numeric,
  resolved_room_category_id uuid, resolved_room_category_name text,
  resolved_mess_category_id uuid, resolved_mess_category_name text,
  bill_state text, stage text, verdict text, exclusion_reason text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH blk AS (
    SELECT hostel_type::text AS t FROM hostel_blocks WHERE id = p_block_id
  ),
  cohort AS (
    SELECT lp.id, lp.institution_id, lp.degree_id, lp.department_id, lp.program_id, lp.semester_id,
           lp.academic_year_id, lp.first_name, lp.last_name,
           room_elig.cats AS room_cats, mess_elig.cats AS mess_cats
    FROM learners_profiles lp
    CROSS JOIN blk
    LEFT JOIN profiles gp ON gp.learner_id = lp.id
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_room_categories(lp.id)) room_elig ON true
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_mess_categories(lp.id)) mess_elig ON true
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel')
      AND lp.institution_id IN (SELECT institution_id FROM hostel_block_institutions WHERE block_id=p_block_id)
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR lp.program_id     = p_program_id)
      AND (p_semester_id    IS NULL OR lp.semester_id    = p_semester_id)
      -- Gender-scope to the block type. NULL/blank gender or a non-gendered block keeps the row.
      AND (blk.t IS NULL OR blk.t NOT IN ('boys','girls')
           OR gp.gender IS NULL OR btrim(gp.gender) = ''
           OR (blk.t = 'boys'  AND lower(btrim(gp.gender)) IN ('male','m'))
           OR (blk.t = 'girls' AND lower(btrim(gp.gender)) IN ('female','f')))
  ),
  base AS (
    SELECT
      c.id AS learner_id,
      COALESCE(p.full_name,
               NULLIF(btrim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''),
               p.email, '—') AS full_name,
      p.email, inst.name AS institution_name, prog.program_name, sem.semester_name,
      lower(trim(p.gender)) AS gender,
      (p.id IS NOT NULL) AS has_profile,
      c.academic_year_id, ay.academic_year_name, c.room_cats, c.mess_cats,
      c.room_cats[1] AS resolved_room_category_id, rc.name AS resolved_room_category_name, rc.type AS resolved_room_category_type,
      c.mess_cats[1] AS resolved_mess_category_id, mc.name AS resolved_mess_category_name,
      (SELECT count(*)::int FROM billing_student_bills b WHERE b.student_id=c.id AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded')) AS academic_bill_count,
      (SELECT count(*)::int FROM billing_student_bills b WHERE b.student_id=c.id AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded') AND b.academic_year_id = c.academic_year_id) AS current_year_bill_count,
      (SELECT ay2.academic_year_name FROM billing_student_bills b JOIN academic_years ay2 ON ay2.id=b.academic_year_id
         WHERE b.student_id=c.id AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded')
           AND b.academic_year_id IS NOT NULL AND b.academic_year_id IS DISTINCT FROM c.academic_year_id
         ORDER BY b.created_at DESC LIMIT 1) AS bill_other_year_name,
      fn_learner_current_year_academic_fee(c.id) AS current_year_fee,
      NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval')) AS not_allocated,
      -- physical ACCESS: a student room in their category they may occupy — gender-matched,
      -- served by their institution, floor-scoped, and matching the physical-room rule (p_strict).
      EXISTS (
        SELECT 1 FROM hostel_rooms rm
        JOIN hostel_categories hc ON hc.id = rm.category_id
        WHERE rm.block_id=p_block_id AND rm.room_purpose='student'
          AND (p_floor IS NULL OR rm.floor = p_floor)
          AND rm.category_id = ANY(c.room_cats)
          AND (hc.type IS NULL
               OR (hc.type='boys'  AND lower(trim(p.gender)) IN ('male','m'))
               OR (hc.type='girls' AND lower(trim(p.gender)) IN ('female','f')))
          AND fn_room_serves_institution(rm.id, c.institution_id)
          AND fn_learner_strictly_eligible_for_room(c.id, rm.id, p_strict)
      ) AS physical_rule_ok,
      -- Diagnostic (20260610140000): rooms they may PHYSICALLY occupy here exist, but none
      -- is in their eligible room category (reservation rooms vs fee-band conflict).
      EXISTS (
        SELECT 1 FROM hostel_rooms rm
        WHERE rm.block_id=p_block_id AND rm.room_purpose='student'
          AND (p_floor IS NULL OR rm.floor = p_floor)
          AND NOT (rm.category_id = ANY(c.room_cats))
          AND fn_room_serves_institution(rm.id, c.institution_id)
          AND fn_learner_strictly_eligible_for_room(c.id, rm.id, p_strict)
      ) AS physical_ok_other_category,
      EXISTS (
        SELECT 1 FROM hostel_beds bd JOIN hostel_rooms r ON r.id=bd.room_id
        JOIN hostel_categories hc ON hc.id = r.category_id
        WHERE r.block_id=p_block_id AND r.room_purpose='student' AND bd.status='available'
          AND (p_floor IS NULL OR r.floor = p_floor)
          AND r.category_id = ANY(c.room_cats)
          AND (hc.type IS NULL
               OR (hc.type='boys'  AND lower(trim(p.gender)) IN ('male','m'))
               OR (hc.type='girls' AND lower(trim(p.gender)) IN ('female','f')))
          AND fn_room_serves_institution(r.id, c.institution_id)
          AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=bd.id AND a.status IN ('active','pending_approval'))
          AND fn_learner_strictly_eligible_for_room(c.id, r.id, p_strict)
      ) AS bed_available
    FROM cohort c
    LEFT JOIN profiles p ON p.learner_id = c.id
    LEFT JOIN institutions inst ON inst.id = c.institution_id
    LEFT JOIN programs prog ON prog.id = c.program_id
    LEFT JOIN semesters sem ON sem.id = c.semester_id
    LEFT JOIN academic_years ay ON ay.id = c.academic_year_id
    LEFT JOIN hostel_categories rc ON rc.id = c.room_cats[1]
    LEFT JOIN mess_categories mc ON mc.id = c.mess_cats[1]
  ),
  scored AS (
    SELECT b.*,
      (b.resolved_room_category_type IS NULL
        OR (b.resolved_room_category_type='boys'  AND b.gender IN ('male','m'))
        OR (b.resolved_room_category_type='girls' AND b.gender IN ('female','f'))) AS gender_ok
    FROM base b
  )
  SELECT
    s.learner_id, s.full_name, s.email, s.institution_name, s.program_name, s.semester_name, s.gender,
    s.has_profile, s.gender_ok, s.not_allocated, s.physical_rule_ok, s.bed_available,
    s.academic_year_id, s.academic_year_name,
    s.academic_bill_count, s.current_year_bill_count, s.bill_other_year_name, s.current_year_fee,
    s.resolved_room_category_id, s.resolved_room_category_name,
    s.resolved_mess_category_id, s.resolved_mess_category_name,
    CASE
      WHEN s.current_year_bill_count > 0 THEN 'matched'
      WHEN s.bill_other_year_name IS NOT NULL THEN 'different_year'
      WHEN s.academic_bill_count > 0 THEN 'untagged'
      ELSE 'none'
    END AS bill_state,
    CASE
      WHEN s.academic_year_id IS NULL THEN 'prerequisite'
      WHEN s.current_year_fee IS NULL THEN 'prerequisite'
      WHEN s.room_cats IS NULL THEN 'prerequisite'
      WHEN NOT s.has_profile OR NOT s.gender_ok OR NOT s.not_allocated OR NOT s.physical_rule_ok OR NOT s.bed_available THEN 'eligibility'
      ELSE 'ok'
    END AS stage,
    CASE
      WHEN s.academic_year_id IS NULL THEN 'out'
      WHEN s.current_year_fee IS NULL THEN 'out'
      WHEN s.room_cats IS NULL THEN 'out'
      WHEN NOT s.has_profile OR NOT s.gender_ok OR NOT s.not_allocated OR NOT s.physical_rule_ok OR NOT s.bed_available THEN 'out'
      ELSE 'in'
    END AS verdict,
    CASE
      WHEN s.academic_year_id IS NULL THEN 'Academic year not set on student profile'
      WHEN s.current_year_fee IS NULL THEN
        CASE
          WHEN s.bill_other_year_name IS NOT NULL THEN 'Bill tagged to a different academic year (' || s.bill_other_year_name || ')'
          WHEN s.academic_bill_count > 0 THEN 'Academic bills exist but are not year-tagged'
          ELSE 'No academic bill generated for ' || COALESCE(s.academic_year_name, 'the academic year')
        END
      WHEN s.room_cats IS NULL THEN 'No Category-Eligibility rule resolves a room category for this student'
      WHEN NOT s.has_profile THEN 'No login profile'
      WHEN NOT s.gender_ok THEN 'Gender does not match the resolved room category'
      WHEN NOT s.not_allocated THEN 'Already allocated'
      WHEN NOT s.physical_rule_ok AND s.physical_ok_other_category THEN
        'Rooms they may occupy in this block are a different room category than their eligible '
        || COALESCE(s.resolved_room_category_name, 'category')
        || ' — fix the reservation rooms or the Category-Eligibility band'
      WHEN NOT s.physical_rule_ok THEN
        CASE WHEN p_strict
          THEN 'No physical-room rule in this block reserves a room for this cohort (strict mode)'
          ELSE 'No room they can occupy in their category — rooms here are reserved for other cohorts, or this cohort''s reserved rooms are in another block'
        END
      WHEN NOT s.bed_available THEN 'Their category rooms are full — no free bed'
      ELSE NULL
    END AS exclusion_reason
  FROM scored s
  ORDER BY s.full_name;
$function$;

-- 3) Aggregate preview (no category input) — beds/rules summary for the page.
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_preview(p_block_id uuid)
RETURNS TABLE(cohort_eligible integer, no_profile integer, already_allocated integer, available_beds integer, rules_set boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH cohort AS (
    SELECT lp.id, lp.institution_id,
           (SELECT array_agg(category_id) FROM fn_hostel_learner_room_categories(lp.id)) AS room_cats
    FROM learners_profiles lp
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel')
      AND lp.institution_id IN (SELECT institution_id FROM hostel_block_institutions WHERE block_id=p_block_id)
  )
  SELECT
    (SELECT count(*)::int FROM cohort c JOIN profiles p ON p.learner_id=c.id
       WHERE c.room_cats IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))),
    (SELECT count(*)::int FROM cohort c WHERE c.room_cats IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.learner_id=c.id)),
    (SELECT count(*)::int FROM cohort c JOIN profiles p ON p.learner_id=c.id
       WHERE c.room_cats IS NOT NULL AND EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))),
    (SELECT count(*)::int FROM hostel_beds b JOIN hostel_rooms r ON r.id=b.room_id
       WHERE r.block_id=p_block_id AND r.room_purpose='student' AND b.status='available'
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))),
    EXISTS (SELECT 1 FROM hostel_room_eligibility_rules WHERE block_id=p_block_id AND is_active);
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_auto_allocate_candidates(uuid, boolean, integer, uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_auto_allocate_candidates(uuid, boolean, integer, uuid, uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_auto_allocate_preview(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_auto_allocate_preview(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_auto_allocate_classic(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_auto_allocate_classic(uuid, uuid) TO authenticated;

-- _cl_apply_category_bill_change: re-bill one hostel category component (room/mess).
CREATE OR REPLACE FUNCTION public._cl_apply_category_bill_change(
  p_learner_lp     uuid,   -- learners_profiles.id
  p_hostel_year_id uuid,
  p_old_item_cat   uuid,   -- old room/mess category id (nullable: never billed)
  p_new_item_cat   uuid,   -- new room/mess category id
  p_new_amount     numeric,
  p_description    text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inst       uuid;
  v_old_id     uuid;
  v_old_final  numeric;
  v_old_bal    numeric;
  v_paid       numeric := 0;
  v_bill_total numeric;
  v_desc       text := p_description;
  v_action     text;
  v_inserted   int := 0;
BEGIN
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_lp;

  IF p_old_item_cat IS NOT NULL THEN
    SELECT id, final_amount, balance_amount
      INTO v_old_id, v_old_final, v_old_bal
      FROM billing_student_bills
     WHERE student_id = p_learner_lp
       AND hostel_year_id = p_hostel_year_id
       AND item_category_id = p_old_item_cat
       AND fee_source = 'hostel_category'
       AND status <> 'cancelled'
     ORDER BY created_at DESC
     LIMIT 1;
  END IF;

  IF v_old_id IS NOT NULL THEN
    v_paid := GREATEST(0, COALESCE(v_old_final,0) - COALESCE(v_old_bal,0));
  END IF;

  IF v_old_id IS NULL THEN
    v_bill_total := p_new_amount;                       -- never billed for old category
    v_action := 'created';
  ELSIF v_paid = 0 THEN
    UPDATE billing_student_bills SET status='cancelled', updated_at=now() WHERE id = v_old_id;
    v_bill_total := p_new_amount;                       -- replace at full new amount
    v_action := 'replaced';
  ELSE
    v_bill_total := GREATEST(0, p_new_amount - v_paid); -- keep paid bill; bill only the difference
    v_desc := p_description || ' (upgrade differential)';
    v_action := 'differential';
  END IF;

  IF v_bill_total > 0 THEN
    INSERT INTO billing_student_bills (
      student_id, institution_id, item_category_id, hostel_year_id, fee_source,
      bill_description, due_date, quantity, unit_amount, total_amount, final_amount,
      balance_amount, status
    ) VALUES (
      p_learner_lp, v_inst, p_new_item_cat, p_hostel_year_id, 'hostel_category',
      v_desc, now() + interval '30 day', 1, v_bill_total, v_bill_total, v_bill_total,
      v_bill_total, 'unpaid'
    ) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted = 0 THEN
      v_action := 'exists';
      v_bill_total := 0;
    END IF;
  END IF;

  RETURN jsonb_build_object('action', v_action, 'new_amount', p_new_amount,
                            'billed', v_bill_total, 'old_bill_id', v_old_id);
END $$;

REVOKE ALL ON FUNCTION public._cl_apply_category_bill_change(uuid,uuid,uuid,uuid,numeric,text) FROM anon, PUBLIC;

-- _cl_apply_upgrade_fee_bill (20260610210000): bills a single FLAT upgrade charge of the
-- configured amount (no supersede of the old category bill — that stays). item_category_id
-- FKs billing_categories (kind 'hostel'/'mess'), required for hostel_category bills
-- (bsb_hostel_cat_required_chk), so p_kind resolves the matching billing category.
-- 20260612130000: dedicated, self-healing upgrade billing category resolver.
-- category_name is globally UNIQUE — resolve by name, reactivate if toggled
-- off, else create. Keeps upgrade fees separate from base "Hostel Fee"/"Mess
-- Fee" and guarantees item_category_id for bsb_hostel_cat_required_chk.
CREATE OR REPLACE FUNCTION public._cl_ensure_upgrade_billing_category(p_kind text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_name text; v_id uuid;
BEGIN
  v_name := CASE p_kind
              WHEN 'hostel' THEN 'Hostel Upgrade Fee'
              WHEN 'mess'   THEN 'Mess Upgrade Fee'
              ELSE initcap(p_kind) || ' Upgrade Fee'
            END;
  SELECT id INTO v_id FROM billing_categories WHERE category_name = v_name LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE billing_categories SET is_active = true, updated_at = now()
     WHERE id = v_id AND NOT is_active;
    RETURN v_id;
  END IF;
  INSERT INTO billing_categories (category_name, kind, frequency, is_active, description)
  VALUES (v_name, p_kind::billing_category_kind, 'one-time', true,
          'Auto-created for hostel/mess category upgrade fees')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public._cl_ensure_upgrade_billing_category(text) FROM anon, authenticated, PUBLIC;

CREATE OR REPLACE FUNCTION public._cl_apply_upgrade_fee_bill(
  p_learner_lp uuid, p_hostel_year_id uuid, p_kind text,
  p_upgrade_amount numeric, p_description text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_inst uuid; v_bcat uuid;
BEGIN
  IF p_upgrade_amount IS NULL OR p_upgrade_amount <= 0 THEN
    RETURN jsonb_build_object('action','none','new_amount',COALESCE(p_upgrade_amount,0),
                              'billed',0,'old_bill_id',NULL);
  END IF;
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_lp;
  -- 20260612130000: dedicated upgrade billing category (created if missing).
  v_bcat := public._cl_ensure_upgrade_billing_category(p_kind);
  INSERT INTO billing_student_bills (
    student_id, institution_id, item_category_id, hostel_year_id, fee_source,
    bill_description, due_date, quantity, unit_amount, total_amount, final_amount,
    balance_amount, status
  ) VALUES (
    p_learner_lp, v_inst, v_bcat, p_hostel_year_id, 'hostel_category',
    p_description, now() + interval '30 day', 1, p_upgrade_amount, p_upgrade_amount,
    p_upgrade_amount, p_upgrade_amount, 'unpaid'
  );
  RETURN jsonb_build_object('action','created','new_amount',p_upgrade_amount,
                            'billed',p_upgrade_amount,'old_bill_id',NULL);
END $$;

REVOKE EXECUTE ON FUNCTION public._cl_apply_upgrade_fee_bill(uuid,uuid,text,numeric,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._cl_apply_upgrade_fee_bill(uuid,uuid,text,numeric,text) TO authenticated;

-- 20260611150000: payment-threshold gate for room upgrades --------------------
-- Academic payment progress for the learner's CURRENT academic year only.
-- Paid is summed from receipt items (not balance_amount) so the result is
-- already correct inside AFTER INSERT triggers on billing_receipt_items.
-- No qualifying bills => NULL paid_pct => callers fail CLOSED.
CREATE OR REPLACE FUNCTION public.fn_learner_academic_payment_progress(p_learner_id uuid)
RETURNS TABLE(total_billed numeric, total_paid numeric, paid_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT SUM(b.final_amount),
         SUM(COALESCE(p.paid, 0)),
         CASE WHEN SUM(b.final_amount) > 0
              THEN ROUND(100.0 * SUM(COALESCE(p.paid, 0)) / SUM(b.final_amount), 2)
         END
  FROM billing_student_bills b
  JOIN learners_profiles lp ON lp.id = b.student_id
  LEFT JOIN LATERAL (
    SELECT SUM(ri.amount_paid) AS paid
    FROM billing_receipt_items ri
    WHERE ri.bill_id = b.id
  ) p ON true
  WHERE b.student_id = p_learner_id
    AND b.fee_source = 'academic'
    AND b.status NOT IN ('cancelled','superseded')
    AND b.academic_year_id = lp.academic_year_id;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_learner_academic_payment_progress(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_learner_academic_payment_progress(uuid) TO authenticated;

-- Internal: does the learner meet the target category's upgrade threshold?
CREATE OR REPLACE FUNCTION public._cl_upgrade_threshold_check(p_learner_lp uuid, p_target_category_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_threshold numeric; v_total numeric; v_paid numeric; v_pct numeric;
BEGIN
  SELECT upgrade_threshold_pct INTO v_threshold FROM hostel_categories WHERE id = p_target_category_id;
  SELECT pp.total_billed, pp.total_paid, pp.paid_pct INTO v_total, v_paid, v_pct
  FROM fn_learner_academic_payment_progress(p_learner_lp) pp;
  RETURN jsonb_build_object(
    'threshold_pct', v_threshold, 'paid_pct', v_pct,
    'total_billed', v_total, 'total_paid', v_paid,
    'meets', (v_threshold IS NULL) OR (v_pct IS NOT NULL AND v_pct >= v_threshold));
END $$;

REVOKE EXECUTE ON FUNCTION public._cl_upgrade_threshold_check(uuid, uuid) FROM anon, authenticated, PUBLIC;

-- Canonical room-upgrade mover (atomic move + flat upgrade-fee bill). Takes explicit
-- identities because the auto-confirm path runs as the receipt-creating user
-- (office staff / service role), where auth.uid() is NOT the upgrading learner.
-- p_from_hold: confirm a bed previously hard-reserved by a below-threshold hold.
CREATE OR REPLACE FUNCTION public._cl_execute_room_upgrade(
  p_profile uuid, p_lp uuid, p_new_category_id uuid, p_room_id uuid, p_bed_id uuid,
  p_from_hold boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_new_name text; v_cur_name text; v_upgrade_fee numeric;
  v_bed_status text; v_old RECORD; v_new_alloc uuid; v_bill jsonb;
BEGIN
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM hostel_categories WHERE id = p_new_category_id;

  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = p_lp;
  SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  -- Re-checked here (not only in the public RPC): a hold can be confirmed days
  -- later, after the learner's current category has already changed.
  IF v_new_fee < v_cur_fee THEN RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)'; END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
  END IF;
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
  IF p_from_hold THEN
    IF v_bed_status IS DISTINCT FROM 'reserved' THEN
      RAISE EXCEPTION 'Held bed is no longer reserved';
    END IF;
  ELSE
    IF v_bed_status IS DISTINCT FROM 'available' THEN
      RAISE EXCEPTION 'That bed is no longer available';
    END IF;
  END IF;

  SELECT id, bed_id, tier_id, academic_year_id, semester_id, institution_id, batch_id,
         emergency_contact_name, emergency_contact_phone, emergency_contact_relation
    INTO v_old
    FROM hostel_allocations
    WHERE learner_id = p_profile AND status = 'active'
    ORDER BY allocation_date DESC LIMIT 1;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'No active allocation to upgrade from'; END IF;

  UPDATE hostel_allocations SET status='vacated', actual_vacate_date=CURRENT_DATE, updated_at=now()
    WHERE id = v_old.id;
  UPDATE hostel_beds SET status='available', current_occupant_id=NULL WHERE id = v_old.bed_id;

  INSERT INTO hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
    allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by, batch_id
  )
  SELECT v_old.institution_id, p_profile, r.block_id, p_room_id, p_bed_id,
         v_old.academic_year_id, v_old.semester_id, 'transfer', CURRENT_DATE, 'active',
         v_old.emergency_contact_name, v_old.emergency_contact_phone, v_old.emergency_contact_relation,
         v_old.tier_id, p_profile, v_old.batch_id
  FROM hostel_rooms r WHERE r.id = p_room_id
  RETURNING id INTO v_new_alloc;
  UPDATE hostel_beds SET status='occupied', current_occupant_id=p_profile WHERE id = p_bed_id;

  UPDATE learners_profiles SET hostel_category_id = p_new_category_id, updated_at=now() WHERE id = p_lp;

  SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
    WHERE hostel_year_id = v_year AND is_active
      AND from_hostel_category_id = v_cur_cat AND to_hostel_category_id = p_new_category_id LIMIT 1;
  v_upgrade_fee := COALESCE(v_upgrade_fee, v_new_fee - v_cur_fee);
  v_bill := public._cl_apply_upgrade_fee_bill(p_lp, v_year, 'hostel', v_upgrade_fee,
              format('Hostel room upgrade: %s → %s', COALESCE(v_cur_name,'—'), v_new_name));

  UPDATE hostel_waitlist
     SET status='allocated', allocated_allocation_id=v_new_alloc,
         held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = p_profile AND entry_kind='upgrade'
     AND target_hostel_category_id = p_new_category_id AND status='waiting';

  RETURN jsonb_build_object('success', true, 'state', 'upgraded',
    'old_allocation_id', v_old.id, 'new_allocation_id', v_new_alloc, 'new_bed_id', p_bed_id,
    'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
    'old_fee', v_cur_fee, 'new_fee', v_new_fee, 'upgrade_fee', v_upgrade_fee, 'bill', v_bill);
END $$;

REVOKE EXECUTE ON FUNCTION public._cl_execute_room_upgrade(uuid, uuid, uuid, uuid, uuid, boolean) FROM anon, authenticated, PUBLIC;

-- Self-service category-upgrade option lists (room + mess).
-- 20260610210000: + upgrade_fee. 20260610220000: drop fee-eligibility gate so HIGHER
-- categories (the upgrade target) are offered — upgrade fee is the gate, not base eligibility.
-- 20260611150000: + threshold_pct / paid_pct / meets_threshold / hold_days (payment-threshold gate).
CREATE OR REPLACE FUNCTION public.fn_my_upgrade_room_categories()
RETURNS TABLE (
  category_id uuid, name text, type text, allocation_mode text, current_year_fee numeric, upgrade_fee numeric,
  available_beds int, threshold_pct numeric, paid_pct numeric, meets_threshold boolean,
  hold_days int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_gender text; v_paid_pct numeric;
BEGIN
  IF v_lp IS NULL OR NOT user_is_hosteler() THEN RETURN; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN; END IF;
  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE id = auth.uid();
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  SELECT pp.paid_pct INTO v_paid_pct FROM fn_learner_academic_payment_progress(v_lp) pp;

  RETURN QUERY
  SELECT c.id, c.name, c.type, c.allocation_mode, hf.amount,
         COALESCE(
           (SELECT uf.amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active
              AND uf.from_hostel_category_id = v_cur_cat AND uf.to_hostel_category_id = c.id LIMIT 1),
           hf.amount - v_cur_fee
         ) AS upgrade_fee,
         (SELECT count(*)::int FROM fn_my_room_options(c.id)),
         c.upgrade_threshold_pct,
         v_paid_pct,
         (c.upgrade_threshold_pct IS NULL
          OR (v_paid_pct IS NOT NULL AND v_paid_pct >= c.upgrade_threshold_pct)),
         c.upgrade_hold_days
  FROM hostel_categories c
  JOIN hostel_fees hf
    ON hf.hostel_category_id = c.id AND hf.hostel_year_id = v_year AND hf.mess_category_id IS NULL AND hf.is_active
  WHERE c.is_active   -- any allocation_mode: auto (Deluxe) categories are upgrade targets too
    AND ((v_gender IN ('male','m')   AND c.type='boys')
         OR (v_gender IN ('female','f') AND c.type='girls'))
    AND c.id <> COALESCE(v_cur_cat, '00000000-0000-0000-0000-000000000000'::uuid)
    AND hf.amount > v_cur_fee
    -- Add-on categories appear ONLY when an explicit upgrade pair is configured from the
    -- resident's current category — never via fee-difference fallback (Premium → Premium + AC).
    AND (NOT c.requires_explicit_upgrade
         OR EXISTS (SELECT 1 FROM hostel_category_upgrade_fees uf2
                    WHERE uf2.hostel_year_id = v_year AND uf2.is_active
                      AND uf2.from_hostel_category_id = v_cur_cat
                      AND uf2.to_hostel_category_id = c.id))
  ORDER BY hf.amount;
END $$;

CREATE OR REPLACE FUNCTION public.fn_my_upgrade_mess_categories()
RETURNS TABLE (mess_category_id uuid, name text, current_year_fee numeric, upgrade_fee numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_year uuid; v_cur_mess uuid; v_cur_fee numeric := 0; v_gender text;
BEGIN
  IF v_lp IS NULL OR NOT user_is_hosteler() THEN RETURN; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN; END IF;
  SELECT lp.mess_category_id INTO v_cur_mess FROM learners_profiles lp WHERE lp.id = v_lp;
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE id = auth.uid();
  SELECT COALESCE(hf.amount,0) INTO v_cur_fee FROM hostel_fees hf
    WHERE hf.mess_category_id = v_cur_mess AND hf.hostel_year_id = v_year AND hf.is_active LIMIT 1;

  RETURN QUERY
  SELECT m.id, m.name, hf.amount,
         COALESCE(
           (SELECT uf.amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active
              AND uf.from_mess_category_id = v_cur_mess AND uf.to_mess_category_id = m.id LIMIT 1),
           hf.amount - v_cur_fee
         ) AS upgrade_fee
  FROM mess_categories m
  JOIN hostel_fees hf
    ON hf.mess_category_id = m.id AND hf.hostel_year_id = v_year AND hf.is_active
  WHERE m.is_active
    AND ((v_gender IN ('male','m')   AND m.type='boys')
         OR (v_gender IN ('female','f') AND m.type='girls'))
    AND m.id <> COALESCE(v_cur_mess, '00000000-0000-0000-0000-000000000000'::uuid)
    AND hf.amount > v_cur_fee
  ORDER BY hf.amount;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_my_upgrade_room_categories() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_my_upgrade_mess_categories() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_my_upgrade_room_categories() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_my_upgrade_mess_categories() TO authenticated;

-- Self-service category-upgrade action RPCs (room move / mess / waitlist).
-- 20260611150000: room upgrade is payment-threshold gated — instant (via
-- _cl_execute_room_upgrade) when the learner's current-AY academic paid % meets
-- the target category's upgrade_threshold_pct; otherwise the chosen bed is
-- hard-reserved and a waitlist hold is recorded (state='waitlisted').
-- 20260612140000: when the learner has NO active allocation, the same action
-- performs a FIRST BOOKING — instant 'active' allocation, UNGATED (no
-- threshold), NO bill (base fee billed later by the operator's generation run).
CREATE OR REPLACE FUNCTION public.fn_self_upgrade_room_category(
  p_new_category_id uuid, p_room_id uuid, p_bed_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_profile uuid := auth.uid();
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_gate jsonb; v_hold_days int; v_bed_status text; v_existing uuid;
  v_inst uuid; v_ay uuid; v_sem uuid; v_tier uuid; v_block uuid; v_new_alloc uuid;
  v_expires timestamptz; v_result jsonb; v_has_alloc boolean;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a hostel resident can book or upgrade a room';
  END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;

  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_cur_cat IS NOT NULL AND v_new_fee < v_cur_fee THEN
    RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)';
  END IF;

  v_has_alloc := EXISTS (SELECT 1 FROM hostel_allocations WHERE learner_id = v_profile AND status = 'active');

  -- 20260611100000: room-level flow — auto-assign the lowest-numbered available bed
  IF p_bed_id IS NULL THEN
    SELECT o.bed_id INTO p_bed_id
    FROM fn_my_room_options(p_new_category_id) o
    WHERE o.room_id = p_room_id
    ORDER BY o.bed_number LIMIT 1;
    IF p_bed_id IS NULL THEN
      RAISE EXCEPTION 'No available bed left in that room. Pick another room.';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fn_my_room_options(p_new_category_id) o
    WHERE o.bed_id = p_bed_id AND o.room_id = p_room_id
  ) THEN
    RAISE EXCEPTION 'That room/bed is not an available option for you';
  END IF;

  -- 20260612140000: FIRST BOOKING (no active allocation) — instant, ungated, no bill
  IF NOT v_has_alloc THEN
    IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
      RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
    END IF;
    SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
    IF v_bed_status IS DISTINCT FROM 'available' THEN RAISE EXCEPTION 'That bed is no longer available'; END IF;

    SELECT institution_id, semester_id, academic_year_id INTO v_inst, v_sem, v_ay
      FROM learners_profiles WHERE id = v_lp;
    v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id=v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
    IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year configured'; END IF;
    SELECT block_id INTO v_block FROM hostel_rooms WHERE id = p_room_id;
    SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND is_active
      ORDER BY institution_id NULLS LAST LIMIT 1;
    IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy found'; END IF;

    INSERT INTO hostel_allocations (
      institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
      allocation_type, allocation_date, status,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
      tier_id, allocated_by, warden_id
    ) VALUES (
      v_inst, v_profile, v_block, p_room_id, p_bed_id, v_ay, v_sem,
      'fresh', CURRENT_DATE, 'active', '', '', '',
      v_tier, v_profile,
      (SELECT user_id FROM user_block_access WHERE block_id=v_block AND revoked_at IS NULL LIMIT 1)
    ) RETURNING id INTO v_new_alloc;
    UPDATE hostel_beds SET status='occupied', current_occupant_id=v_profile WHERE id = p_bed_id;
    -- categories set by trg_allocation_sync_learner_categories; no bill on first booking.

    RETURN jsonb_build_object('success', true, 'state', 'booked',
      'new_allocation_id', v_new_alloc, 'new_bed_id', p_bed_id,
      'new_category_id', p_new_category_id, 'new_fee', v_new_fee);
  END IF;

  v_gate := public._cl_upgrade_threshold_check(v_lp, p_new_category_id);

  IF (v_gate->>'meets')::boolean THEN
    v_result := public._cl_execute_room_upgrade(v_profile, v_lp, p_new_category_id, p_room_id, p_bed_id, false);
    RETURN v_result || jsonb_build_object('threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct');
  END IF;

  -- Below threshold: hard-reserve the bed and wait for payment ----------------
  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
  END IF;
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
  IF v_bed_status IS DISTINCT FROM 'available' THEN RAISE EXCEPTION 'That bed is no longer available'; END IF;

  -- One hold per learner: release every bed currently held by their waiting
  -- upgrade entries (any category) before reserving the new one.
  UPDATE hostel_beds b SET status='available'
    FROM hostel_waitlist w
   WHERE w.learner_id = v_profile AND w.entry_kind='upgrade' AND w.status='waiting'
     AND w.held_bed_id = b.id AND b.status='reserved';
  UPDATE hostel_waitlist
     SET held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting' AND held_bed_id IS NOT NULL;

  UPDATE hostel_beds SET status='reserved' WHERE id = p_bed_id;

  SELECT upgrade_hold_days INTO v_hold_days FROM hostel_categories WHERE id = p_new_category_id;
  v_expires := now() + make_interval(days => COALESCE(v_hold_days, 5));

  SELECT institution_id, academic_year_id INTO v_inst, v_ay FROM learners_profiles WHERE id = v_lp;
  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id=v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year configured'; END IF;

  SELECT id INTO v_existing FROM hostel_waitlist
    WHERE learner_id = v_profile AND entry_kind='upgrade'
      AND target_hostel_category_id = p_new_category_id AND status='waiting' LIMIT 1;
  IF v_existing IS NOT NULL THEN
    UPDATE hostel_waitlist
       SET held_room_id=p_room_id, held_bed_id=p_bed_id, hold_expires_at=v_expires, updated_at=now()
     WHERE id = v_existing;
  ELSE
    INSERT INTO hostel_waitlist (
      institution_id, learner_id, academic_year_id, status, entry_kind,
      target_hostel_category_id, held_room_id, held_bed_id, hold_expires_at
    ) VALUES (
      v_inst, v_profile, v_ay, 'waiting', 'upgrade',
      p_new_category_id, p_room_id, p_bed_id, v_expires
    ) RETURNING id INTO v_existing;
  END IF;

  RETURN jsonb_build_object('success', true, 'state', 'waitlisted',
    'waitlist_id', v_existing,
    'threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct',
    'total_billed', v_gate->'total_billed', 'total_paid', v_gate->'total_paid',
    'hold_expires_at', v_expires, 'held_room_id', p_room_id, 'held_bed_id', p_bed_id,
    'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
    'old_fee', v_cur_fee, 'new_fee', v_new_fee);
END $$;

-- ── Category-upgrade shared cores + admin RPCs ───────────────────────────────
-- migration 20260617100000_admin_category_upgrade_rpcs.sql. The category-only +
-- mess upgrade bodies are extracted into identity-parametrized cores so the
-- self (fn_self_*) and admin (fn_cl_admin_bulk_upgrade) paths share ONE
-- implementation. Self wrappers keep the self-service gates (user_is_hosteler /
-- upgrades_enabled); admins bypass the upgrades_enabled toggle by design.

CREATE OR REPLACE FUNCTION public._cl_upgrade_category_only(
  p_profile uuid, p_lp uuid, p_new_category_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_cur_name text; v_new_name text; v_upgrade_fee numeric; v_hold_days int;
  v_inst uuid; v_ay uuid; v_bill jsonb; v_bill_id uuid; v_wl uuid;
BEGIN
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;
  SELECT name, upgrade_hold_days INTO v_new_name, v_hold_days FROM hostel_categories WHERE id = p_new_category_id;

  SELECT hostel_category_id, institution_id, academic_year_id INTO v_cur_cat, v_inst, v_ay
    FROM learners_profiles WHERE id = p_lp;
  SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_cur_cat IS NOT NULL AND v_new_fee < v_cur_fee THEN
    RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)';
  END IF;

  SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
    WHERE hostel_year_id = v_year AND is_active
      AND from_hostel_category_id = v_cur_cat AND to_hostel_category_id = p_new_category_id LIMIT 1;
  v_upgrade_fee := COALESCE(v_upgrade_fee, v_new_fee - v_cur_fee);

  IF COALESCE(v_upgrade_fee,0) <= 0 THEN
    UPDATE learners_profiles SET hostel_category_id = p_new_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = p_lp;
    RETURN jsonb_build_object('success', true, 'state', 'upgraded',
      'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id, 'upgrade_fee', 0);
  END IF;

  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id=v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year configured'; END IF;

  UPDATE billing_student_bills bb SET status='cancelled', updated_at=now()
    FROM hostel_waitlist w
   WHERE w.learner_id=p_profile AND w.entry_kind='upgrade' AND w.status='waiting'
     AND w.held_bed_id IS NULL AND w.target_hostel_category_id <> p_new_category_id
     AND w.upgrade_bill_id = bb.id AND bb.status='unpaid'
     AND NOT EXISTS (SELECT 1 FROM billing_receipt_items ri WHERE ri.bill_id=bb.id);
  UPDATE hostel_waitlist SET status='declined', updated_at=now()
   WHERE learner_id=p_profile AND entry_kind='upgrade' AND status='waiting'
     AND held_bed_id IS NULL AND target_hostel_category_id <> p_new_category_id;

  SELECT id, upgrade_bill_id INTO v_wl, v_bill_id FROM hostel_waitlist
    WHERE learner_id=p_profile AND entry_kind='upgrade' AND status='waiting'
      AND held_bed_id IS NULL AND target_hostel_category_id = p_new_category_id LIMIT 1;
  IF v_bill_id IS NOT NULL THEN
    UPDATE hostel_waitlist SET from_hostel_category_id = COALESCE(from_hostel_category_id, v_cur_cat), updated_at=now() WHERE id = v_wl;
    UPDATE learners_profiles SET hostel_category_id = p_new_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = p_lp;
    RETURN jsonb_build_object('success', true, 'state', 'pending_payment', 'waitlist_id', v_wl,
      'upgrade_bill_id', v_bill_id, 'upgrade_fee', v_upgrade_fee,
      'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id);
  END IF;

  v_bill := public._cl_apply_upgrade_fee_bill(p_lp, v_year, 'hostel', v_upgrade_fee,
              format('Hostel category upgrade: %s -> %s', COALESCE(v_cur_name,'-'), v_new_name));
  v_bill_id := (v_bill->>'bill_id')::uuid;

  UPDATE billing_student_bills SET due_date = now() + make_interval(days => COALESCE(v_hold_days, 30)) WHERE id = v_bill_id;

  IF v_wl IS NOT NULL THEN
    UPDATE hostel_waitlist SET upgrade_bill_id=v_bill_id,
      hold_expires_at = now() + make_interval(days => COALESCE(v_hold_days, 5)), updated_at=now() WHERE id=v_wl;
  ELSE
    INSERT INTO hostel_waitlist (institution_id, learner_id, academic_year_id, status, entry_kind,
      target_hostel_category_id, held_room_id, held_bed_id, hold_expires_at, upgrade_bill_id)
    VALUES (v_inst, p_profile, v_ay, 'waiting', 'upgrade',
      p_new_category_id, NULL, NULL, now() + make_interval(days => COALESCE(v_hold_days, 5)), v_bill_id) RETURNING id INTO v_wl;
  END IF;

  UPDATE hostel_waitlist SET from_hostel_category_id = COALESCE(from_hostel_category_id, v_cur_cat), updated_at=now() WHERE id = v_wl;
  UPDATE learners_profiles SET hostel_category_id = p_new_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = p_lp;

  RETURN jsonb_build_object('success', true, 'state', 'pending_payment', 'waitlist_id', v_wl,
    'upgrade_bill_id', v_bill_id, 'upgrade_fee', v_upgrade_fee,
    'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
    'old_fee', v_cur_fee, 'new_fee', v_new_fee);
END $$;

CREATE OR REPLACE FUNCTION public._cl_upgrade_mess_category(
  p_lp uuid, p_new_mess_category_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year uuid; v_cur_mess uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_new_name text; v_cur_name text; v_upgrade_fee numeric; v_bill jsonb;
BEGIN
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE mess_category_id = p_new_mess_category_id AND hostel_year_id = v_year AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected mess category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM mess_categories WHERE id = p_new_mess_category_id;

  SELECT lp.mess_category_id INTO v_cur_mess FROM learners_profiles lp WHERE lp.id = p_lp;
  SELECT name INTO v_cur_name FROM mess_categories WHERE id = v_cur_mess;
  SELECT COALESCE(hf.amount,0) INTO v_cur_fee FROM hostel_fees hf
    WHERE hf.mess_category_id = v_cur_mess AND hf.hostel_year_id = v_year AND hf.is_active LIMIT 1;
  IF v_new_fee < v_cur_fee THEN RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)'; END IF;

  UPDATE learners_profiles SET mess_category_id = p_new_mess_category_id, updated_at=now() WHERE id = p_lp;

  SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
    WHERE hostel_year_id = v_year AND is_active
      AND from_mess_category_id = v_cur_mess AND to_mess_category_id = p_new_mess_category_id LIMIT 1;
  v_upgrade_fee := COALESCE(v_upgrade_fee, v_new_fee - v_cur_fee);
  v_bill := public._cl_apply_upgrade_fee_bill(p_lp, v_year, 'mess', v_upgrade_fee,
              format('Mess upgrade: %s -> %s', COALESCE(v_cur_name,'-'), v_new_name));

  RETURN jsonb_build_object('success', true, 'old_category_id', v_cur_mess,
    'new_category_id', p_new_mess_category_id, 'old_fee', v_cur_fee, 'new_fee', v_new_fee,
    'upgrade_fee', v_upgrade_fee, 'bill', v_bill);
END $$;

CREATE OR REPLACE FUNCTION public.fn_self_upgrade_category_only(p_new_category_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lp uuid := get_my_learner_id(); v_profile uuid := auth.uid(); v_cur_cat uuid;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a hostel resident can upgrade their category';
  END IF;
  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  IF NOT COALESCE((SELECT upgrades_enabled FROM hostel_categories WHERE id = v_cur_cat), false) THEN
    RAISE EXCEPTION 'Upgrades are currently disabled for your category';
  END IF;
  RETURN public._cl_upgrade_category_only(v_profile, v_lp, p_new_category_id);
END $$;

CREATE OR REPLACE FUNCTION public.fn_self_upgrade_mess_category(p_new_mess_category_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lp uuid := get_my_learner_id(); v_cur_mess uuid;
BEGIN
  IF v_lp IS NULL OR NOT user_is_hosteler() THEN RAISE EXCEPTION 'Only a hostel resident can upgrade'; END IF;
  SELECT mess_category_id INTO v_cur_mess FROM learners_profiles WHERE id = v_lp;
  IF NOT COALESCE((SELECT upgrades_enabled FROM mess_categories WHERE id = v_cur_mess), false) THEN
    RAISE EXCEPTION 'Mess upgrades are currently disabled for your category';
  END IF;
  RETURN public._cl_upgrade_mess_category(v_lp, p_new_mess_category_id);
END $$;

CREATE OR REPLACE FUNCTION public._cl_admin_eval_room_upgrade(p_lp uuid, p_target_category_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year uuid; v_gender text; v_gtype text;
  v_cur_cat uuid; v_cur_name text; v_cur_fee numeric := 0;
  v_t_name text; v_t_type text; v_t_mode text; v_t_active boolean; v_t_thr numeric;
  v_new_fee numeric; v_upg numeric; v_paid numeric; v_meets boolean;
BEGIN
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN jsonb_build_object('eligible', false, 'reason', 'No current hostel year configured'); END IF;
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.learner_id = lp.id WHERE lp.id = p_lp;
  v_gtype := CASE WHEN v_gender IN ('male','m') THEN 'boys' WHEN v_gender IN ('female','f') THEN 'girls' ELSE NULL END;
  SELECT name, type, allocation_mode, is_active, upgrade_threshold_pct
    INTO v_t_name, v_t_type, v_t_mode, v_t_active, v_t_thr FROM hostel_categories WHERE id = p_target_category_id;
  IF v_t_name IS NULL OR NOT v_t_active THEN RETURN jsonb_build_object('eligible', false, 'reason', 'Target category not found or inactive'); END IF;
  IF v_t_mode IS DISTINCT FROM 'auto' THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'Manual category -- upgrade this learner individually with a room selection',
      'target_category_id', p_target_category_id, 'target_category_name', v_t_name);
  END IF;
  IF v_gtype IS NULL OR v_t_type IS DISTINCT FROM v_gtype THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'Category does not match learner gender',
      'target_category_id', p_target_category_id, 'target_category_name', v_t_name);
  END IF;
  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_target_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RETURN jsonb_build_object('eligible', false, 'reason', 'Target has no published fee for the current hostel year',
    'target_category_id', p_target_category_id, 'target_category_name', v_t_name); END IF;
  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = p_lp;
  SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_cur_cat = p_target_category_id THEN RETURN jsonb_build_object('eligible', false, 'reason', 'Already on this category',
    'current_category_id', v_cur_cat, 'current_category_name', v_cur_name, 'target_category_id', p_target_category_id, 'target_category_name', v_t_name); END IF;
  IF v_new_fee <= v_cur_fee THEN RETURN jsonb_build_object('eligible', false, 'reason', 'Not an upgrade (target fee <= current fee)',
    'current_category_id', v_cur_cat, 'current_category_name', v_cur_name, 'target_category_id', p_target_category_id, 'target_category_name', v_t_name); END IF;
  SELECT amount INTO v_upg FROM hostel_category_upgrade_fees
    WHERE hostel_year_id = v_year AND is_active AND from_hostel_category_id = v_cur_cat AND to_hostel_category_id = p_target_category_id LIMIT 1;
  v_upg := COALESCE(v_upg, v_new_fee - v_cur_fee);
  SELECT pp.paid_pct INTO v_paid FROM fn_learner_academic_payment_progress(p_lp) pp;
  v_meets := (v_t_thr IS NULL) OR (v_paid IS NOT NULL AND v_paid >= v_t_thr);
  RETURN jsonb_build_object('eligible', true, 'reason', NULL,
    'current_category_id', v_cur_cat, 'current_category_name', v_cur_name,
    'target_category_id', p_target_category_id, 'target_category_name', v_t_name,
    'current_fee', v_cur_fee, 'target_fee', v_new_fee, 'upgrade_fee', v_upg,
    'threshold_pct', v_t_thr, 'paid_pct', v_paid, 'meets_threshold', v_meets);
END $$;

CREATE OR REPLACE FUNCTION public._cl_admin_eval_mess_upgrade(p_lp uuid, p_target_mess_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year uuid; v_gender text; v_gtype text;
  v_cur uuid; v_cur_name text; v_cur_fee numeric := 0;
  v_t_name text; v_t_type text; v_t_active boolean; v_new_fee numeric; v_upg numeric;
BEGIN
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN jsonb_build_object('eligible', false, 'reason', 'No current hostel year configured'); END IF;
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.learner_id = lp.id WHERE lp.id = p_lp;
  v_gtype := CASE WHEN v_gender IN ('male','m') THEN 'boys' WHEN v_gender IN ('female','f') THEN 'girls' ELSE NULL END;
  SELECT name, type, is_active INTO v_t_name, v_t_type, v_t_active FROM mess_categories WHERE id = p_target_mess_id;
  IF v_t_name IS NULL OR NOT v_t_active THEN RETURN jsonb_build_object('eligible', false, 'reason', 'Target mess category not found or inactive'); END IF;
  IF v_gtype IS NULL OR v_t_type IS DISTINCT FROM v_gtype THEN RETURN jsonb_build_object('eligible', false, 'reason', 'Mess category does not match learner gender',
    'target_category_id', p_target_mess_id, 'target_category_name', v_t_name); END IF;
  SELECT amount INTO v_new_fee FROM hostel_fees WHERE mess_category_id = p_target_mess_id AND hostel_year_id = v_year AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RETURN jsonb_build_object('eligible', false, 'reason', 'Target has no published fee for the current hostel year',
    'target_category_id', p_target_mess_id, 'target_category_name', v_t_name); END IF;
  SELECT mess_category_id INTO v_cur FROM learners_profiles WHERE id = p_lp;
  SELECT name INTO v_cur_name FROM mess_categories WHERE id = v_cur;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees WHERE mess_category_id = v_cur AND hostel_year_id = v_year AND is_active LIMIT 1;
  IF v_cur = p_target_mess_id THEN RETURN jsonb_build_object('eligible', false, 'reason', 'Already on this mess category',
    'current_category_id', v_cur, 'current_category_name', v_cur_name, 'target_category_id', p_target_mess_id, 'target_category_name', v_t_name); END IF;
  IF v_new_fee <= v_cur_fee THEN RETURN jsonb_build_object('eligible', false, 'reason', 'Not an upgrade (target fee <= current fee)',
    'current_category_id', v_cur, 'current_category_name', v_cur_name, 'target_category_id', p_target_mess_id, 'target_category_name', v_t_name); END IF;
  SELECT amount INTO v_upg FROM hostel_category_upgrade_fees WHERE hostel_year_id = v_year AND is_active
    AND from_mess_category_id = v_cur AND to_mess_category_id = p_target_mess_id LIMIT 1;
  v_upg := COALESCE(v_upg, v_new_fee - v_cur_fee);
  RETURN jsonb_build_object('eligible', true, 'reason', NULL,
    'current_category_id', v_cur, 'current_category_name', v_cur_name,
    'target_category_id', p_target_mess_id, 'target_category_name', v_t_name,
    'current_fee', v_cur_fee, 'target_fee', v_new_fee, 'upgrade_fee', v_upg);
END $$;

CREATE OR REPLACE FUNCTION public.fn_cl_admin_bulk_target_catalog()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year uuid; v_room jsonb; v_mess jsonb;
BEGIN
  IF NOT public.user_has_permission('campus_living.upgrades.manage') THEN
    RAISE EXCEPTION 'permission denied: campus_living.upgrades.manage' USING ERRCODE='42501';
  END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN jsonb_build_object('room', '[]'::jsonb, 'mess', '[]'::jsonb); END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('category_id', c.id, 'name', c.name, 'type', c.type, 'current_year_fee', hf.amount) ORDER BY c.type, hf.amount), '[]'::jsonb)
    INTO v_room FROM hostel_categories c
    JOIN hostel_fees hf ON hf.hostel_category_id = c.id AND hf.hostel_year_id = v_year AND hf.mess_category_id IS NULL AND hf.is_active
    WHERE c.is_active AND c.allocation_mode = 'auto';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('category_id', m.id, 'name', m.name, 'type', m.type, 'current_year_fee', hf.amount) ORDER BY m.type, hf.amount), '[]'::jsonb)
    INTO v_mess FROM mess_categories m
    JOIN hostel_fees hf ON hf.mess_category_id = m.id AND hf.hostel_year_id = v_year AND hf.is_active
    WHERE m.is_active;
  RETURN jsonb_build_object('room', v_room, 'mess', v_mess);
END $$;

CREATE OR REPLACE FUNCTION public.fn_cl_admin_bulk_upgrade(
  p_learner_ids uuid[], p_room_category_id uuid DEFAULT NULL, p_mess_category_id uuid DEFAULT NULL, p_dry_run boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lp uuid; v_profile uuid; v_inst uuid; v_name text; v_roll text;
  v_room jsonb; v_mess jsonb; v_res jsonb; v_accessible boolean; v_out jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.user_has_permission('campus_living.upgrades.manage') THEN
    RAISE EXCEPTION 'permission denied: campus_living.upgrades.manage' USING ERRCODE='42501';
  END IF;
  IF p_room_category_id IS NULL AND p_mess_category_id IS NULL THEN
    RAISE EXCEPTION 'Pick at least one target category (room or mess)';
  END IF;
  FOREACH v_lp IN ARRAY COALESCE(p_learner_ids, ARRAY[]::uuid[]) LOOP
    v_room := NULL; v_mess := NULL;
    SELECT lp.institution_id, NULLIF(btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')), ''), lp.roll_number
      INTO v_inst, v_name, v_roll FROM learners_profiles lp WHERE lp.id = v_lp;
    IF v_inst IS NULL THEN
      IF p_room_category_id IS NOT NULL THEN v_room := jsonb_build_object('status','error','reason','Learner not found'); END IF;
      IF p_mess_category_id IS NOT NULL THEN v_mess := jsonb_build_object('status','error','reason','Learner not found'); END IF;
      v_out := v_out || jsonb_build_array(jsonb_build_object('learner_id', v_lp, 'name', v_name, 'roll_number', v_roll, 'room', v_room, 'mess', v_mess));
      CONTINUE;
    END IF;
    v_accessible := EXISTS (SELECT 1 FROM public.get_user_accessible_institutions(auth.uid()) g WHERE g.institution_id = v_inst);
    SELECT p.id INTO v_profile FROM profiles p WHERE p.learner_id = v_lp;
    IF p_room_category_id IS NOT NULL THEN
      IF NOT v_accessible THEN v_room := jsonb_build_object('status','skipped','reason','No access to this learner''s institution');
      ELSE
        v_room := public._cl_admin_eval_room_upgrade(v_lp, p_room_category_id);
        IF NOT COALESCE((v_room->>'eligible')::boolean, false) THEN v_room := v_room || jsonb_build_object('status','skipped');
        ELSIF p_dry_run THEN v_room := v_room || jsonb_build_object('status','eligible');
        ELSIF v_profile IS NULL THEN v_room := v_room || jsonb_build_object('status','skipped','reason','Learner has no login profile');
        ELSE
          BEGIN
            v_res := public._cl_upgrade_category_only(v_profile, v_lp, p_room_category_id);
            v_room := v_room || jsonb_build_object('status', COALESCE(v_res->>'state','upgraded'), 'upgrade_bill_id', v_res->'upgrade_bill_id', 'waitlist_id', v_res->'waitlist_id');
          EXCEPTION WHEN OTHERS THEN v_room := v_room || jsonb_build_object('status','error','reason', SQLERRM);
          END;
        END IF;
      END IF;
    END IF;
    IF p_mess_category_id IS NOT NULL THEN
      IF NOT v_accessible THEN v_mess := jsonb_build_object('status','skipped','reason','No access to this learner''s institution');
      ELSE
        v_mess := public._cl_admin_eval_mess_upgrade(v_lp, p_mess_category_id);
        IF NOT COALESCE((v_mess->>'eligible')::boolean, false) THEN v_mess := v_mess || jsonb_build_object('status','skipped');
        ELSIF p_dry_run THEN v_mess := v_mess || jsonb_build_object('status','eligible');
        ELSE
          BEGIN
            v_res := public._cl_upgrade_mess_category(v_lp, p_mess_category_id);
            v_mess := v_mess || jsonb_build_object('status','upgraded', 'bill', v_res->'bill');
          EXCEPTION WHEN OTHERS THEN v_mess := v_mess || jsonb_build_object('status','error','reason', SQLERRM);
          END;
        END IF;
      END IF;
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('learner_id', v_lp, 'name', v_name, 'roll_number', v_roll, 'room', v_room, 'mess', v_mess));
  END LOOP;
  RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION public._cl_upgrade_category_only(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cl_upgrade_mess_category(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cl_admin_eval_room_upgrade(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cl_admin_eval_mess_upgrade(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cl_admin_bulk_target_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cl_admin_bulk_target_catalog() TO authenticated;
REVOKE ALL ON FUNCTION public.fn_cl_admin_bulk_upgrade(uuid[],uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cl_admin_bulk_upgrade(uuid[],uuid,uuid,boolean) TO authenticated;

-- ── Phase 2: admin single-learner ROOM upgrade (manual categories, room pick) ─
-- migration 20260617130000_admin_room_upgrade.sql. fn_self_upgrade_room_category
-- body extracted into _cl_upgrade_room_category (identity-parametrized); the
-- auth-bound fn_my_room_options -> learner-scoped _cl_room_options. This wrapper
-- supersedes the standalone fn_self_upgrade_room_category defined earlier in this
-- file (CREATE OR REPLACE — last definition wins).

CREATE OR REPLACE FUNCTION public._cl_room_options(p_profile uuid, p_lp uuid, p_category_id uuid)
RETURNS TABLE(bed_id uuid, room_id uuid, room_number text, floor integer, block_name text, bed_number text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inst uuid; v_gender text;
BEGIN
  IF p_lp IS NULL THEN RETURN; END IF;
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_lp;
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.id = p_profile WHERE lp.id = p_lp;
  RETURN QUERY
  SELECT b.id, r.id, r.room_number, r.floor, bl.name, b.bed_number
  FROM hostel_beds b
  JOIN hostel_rooms r ON r.id = b.room_id
  JOIN hostel_blocks bl ON bl.id = r.block_id
  WHERE r.category_id = p_category_id AND r.room_purpose = 'student' AND b.status = 'available'
    AND (bl.hostel_type::text = 'mixed'
         OR (v_gender IN ('male','m')   AND bl.hostel_type::text = 'boys')
         OR (v_gender IN ('female','f') AND bl.hostel_type::text = 'girls'))
    AND fn_room_serves_institution(r.id, v_inst)
    AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id = b.id AND a.status IN ('active','pending_approval'))
    AND fn_learner_eligible_for_room(p_lp, r.id)
  ORDER BY bl.name, r.floor, r.room_number, b.bed_number;
END $$;

CREATE OR REPLACE FUNCTION public._cl_upgrade_room_category(
  p_profile uuid, p_lp uuid, p_new_category_id uuid, p_room_id uuid,
  p_bed_id uuid DEFAULT NULL, p_enforce_self_gates boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lp uuid := p_lp; v_profile uuid := p_profile;
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_cur_name text; v_new_name text;
  v_gate jsonb; v_hold_days int; v_bed_status text; v_existing uuid;
  v_inst uuid; v_ay uuid; v_expires timestamptz; v_result jsonb; v_has_alloc boolean;
  v_upgrade_fee numeric; v_bill jsonb; v_bill_id uuid; v_meets boolean;
BEGIN
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;
  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM hostel_categories WHERE id = p_new_category_id;
  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_cur_cat IS NOT NULL AND v_new_fee < v_cur_fee THEN RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)'; END IF;
  v_has_alloc := EXISTS (SELECT 1 FROM hostel_allocations WHERE learner_id = v_profile AND status = 'active');
  IF p_enforce_self_gates AND v_has_alloc
     AND NOT COALESCE((SELECT upgrades_enabled FROM hostel_categories WHERE id = v_cur_cat), false) THEN
    RAISE EXCEPTION 'Room upgrades are currently disabled for your category';
  END IF;
  IF p_bed_id IS NULL THEN
    SELECT o.bed_id INTO p_bed_id FROM _cl_room_options(v_profile, v_lp, p_new_category_id) o
    WHERE o.room_id = p_room_id ORDER BY o.bed_number LIMIT 1;
    IF p_bed_id IS NULL THEN RAISE EXCEPTION 'No available bed left in that room. Pick another room.'; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _cl_room_options(v_profile, v_lp, p_new_category_id) o
                 WHERE o.bed_id = p_bed_id AND o.room_id = p_room_id) THEN
    RAISE EXCEPTION 'That room/bed is not an available option for this learner';
  END IF;
  v_gate := public._cl_upgrade_threshold_check(v_lp, p_new_category_id);
  v_meets := (v_gate->>'meets')::boolean;
  IF NOT v_has_alloc AND v_meets THEN
    v_result := public._cl_execute_first_booking(v_profile, v_lp, p_new_category_id, p_room_id, p_bed_id, false);
    RETURN v_result || jsonb_build_object('new_fee', v_new_fee, 'threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct');
  END IF;
  IF v_has_alloc THEN
    SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
      WHERE hostel_year_id = v_year AND is_active AND from_hostel_category_id = v_cur_cat AND to_hostel_category_id = p_new_category_id LIMIT 1;
    v_upgrade_fee := COALESCE(v_upgrade_fee, v_new_fee - v_cur_fee);
    IF v_meets AND COALESCE(v_upgrade_fee, 0) <= 0 THEN
      v_result := public._cl_execute_room_upgrade(v_profile, v_lp, p_new_category_id, p_room_id, p_bed_id, false);
      RETURN v_result || jsonb_build_object('threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct');
    END IF;
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN RAISE EXCEPTION 'Another resident is claiming this bed. Try again.'; END IF;
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
  IF v_bed_status IS DISTINCT FROM 'available' THEN RAISE EXCEPTION 'That bed is no longer available'; END IF;
  UPDATE hostel_beds b SET status='available' FROM hostel_waitlist w
   WHERE w.learner_id = v_profile AND w.entry_kind='upgrade' AND w.status='waiting' AND w.held_bed_id = b.id AND b.status='reserved';
  UPDATE billing_student_bills bb SET status='cancelled', updated_at=now() FROM hostel_waitlist w
   WHERE w.learner_id = v_profile AND w.entry_kind='upgrade' AND w.status='waiting' AND w.target_hostel_category_id <> p_new_category_id
     AND w.upgrade_bill_id = bb.id AND bb.status='unpaid' AND NOT EXISTS (SELECT 1 FROM billing_receipt_items ri WHERE ri.bill_id = bb.id);
  UPDATE hostel_waitlist SET status='declined', held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting' AND target_hostel_category_id <> p_new_category_id;
  UPDATE hostel_waitlist SET held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting' AND target_hostel_category_id = p_new_category_id AND held_bed_id IS NOT NULL;
  UPDATE hostel_beds SET status='reserved' WHERE id = p_bed_id;
  SELECT upgrade_hold_days INTO v_hold_days FROM hostel_categories WHERE id = p_new_category_id;
  v_expires := now() + make_interval(days => COALESCE(v_hold_days, 5));
  SELECT institution_id, academic_year_id INTO v_inst, v_ay FROM learners_profiles WHERE id = v_lp;
  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id=v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year configured'; END IF;
  SELECT id INTO v_existing FROM hostel_waitlist
    WHERE learner_id = v_profile AND entry_kind='upgrade' AND target_hostel_category_id = p_new_category_id AND status='waiting' LIMIT 1;
  IF v_existing IS NOT NULL THEN
    UPDATE hostel_waitlist SET held_room_id=p_room_id, held_bed_id=p_bed_id, hold_expires_at=v_expires, updated_at=now() WHERE id = v_existing;
  ELSE
    INSERT INTO hostel_waitlist (institution_id, learner_id, academic_year_id, status, entry_kind,
      target_hostel_category_id, held_room_id, held_bed_id, hold_expires_at)
    VALUES (v_inst, v_profile, v_ay, 'waiting', 'upgrade', p_new_category_id, p_room_id, p_bed_id, v_expires) RETURNING id INTO v_existing;
  END IF;
  UPDATE hostel_waitlist SET from_hostel_category_id = COALESCE(from_hostel_category_id, v_cur_cat), updated_at=now() WHERE id = v_existing;
  UPDATE learners_profiles SET hostel_category_id = p_new_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = v_lp;
  IF v_has_alloc AND v_meets THEN
    SELECT upgrade_bill_id INTO v_bill_id FROM hostel_waitlist WHERE id = v_existing;
    IF v_bill_id IS NULL THEN
      v_bill := public._cl_apply_upgrade_fee_bill(v_lp, v_year, 'hostel', v_upgrade_fee,
                  format('Hostel room upgrade: %s -> %s', COALESCE(v_cur_name,'-'), v_new_name));
      v_bill_id := (v_bill->>'bill_id')::uuid;
      UPDATE hostel_waitlist SET upgrade_bill_id = v_bill_id, updated_at=now() WHERE id = v_existing;
    END IF;
    RETURN jsonb_build_object('success', true, 'state', 'pending_payment', 'waitlist_id', v_existing,
      'upgrade_bill_id', v_bill_id, 'upgrade_fee', v_upgrade_fee, 'threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct',
      'hold_expires_at', v_expires, 'held_room_id', p_room_id, 'held_bed_id', p_bed_id,
      'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id, 'old_fee', v_cur_fee, 'new_fee', v_new_fee);
  END IF;
  RETURN jsonb_build_object('success', true, 'state', 'waitlisted', 'waitlist_id', v_existing,
    'threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct',
    'total_billed', v_gate->'total_billed', 'total_paid', v_gate->'total_paid',
    'hold_expires_at', v_expires, 'held_room_id', p_room_id, 'held_bed_id', p_bed_id,
    'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id, 'old_fee', v_cur_fee, 'new_fee', v_new_fee, 'upgrade_fee', v_upgrade_fee);
END $$;

CREATE OR REPLACE FUNCTION public.fn_self_upgrade_room_category(p_new_category_id uuid, p_room_id uuid, p_bed_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lp uuid := get_my_learner_id(); v_profile uuid := auth.uid();
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a hostel resident can book or upgrade a room';
  END IF;
  RETURN public._cl_upgrade_room_category(v_profile, v_lp, p_new_category_id, p_room_id, p_bed_id, true);
END $$;

CREATE OR REPLACE FUNCTION public.fn_cl_admin_room_options(p_learner_id uuid, p_category_id uuid)
RETURNS TABLE(room_id uuid, room_number text, floor integer, block_name text, capacity integer, occupied_beds integer, available_beds integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inst uuid; v_gender text;
BEGIN
  IF NOT public.user_has_permission('campus_living.upgrades.manage') THEN
    RAISE EXCEPTION 'permission denied: campus_living.upgrades.manage' USING ERRCODE='42501';
  END IF;
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_id;
  IF v_inst IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_user_accessible_institutions(auth.uid()) g WHERE g.institution_id = v_inst) THEN
    RAISE EXCEPTION 'You do not have access to this learner''s institution' USING ERRCODE='42501';
  END IF;
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.learner_id = lp.id WHERE lp.id = p_learner_id;
  RETURN QUERY
  SELECT r.id, r.room_number, r.floor, bl.name, COALESCE(r.actual_capacity, r.capacity)::int,
         GREATEST(COALESCE(r.actual_capacity, r.capacity)::int - av.free, 0), av.free
  FROM hostel_rooms r JOIN hostel_blocks bl ON bl.id = r.block_id
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS free FROM hostel_beds b WHERE b.room_id = r.id AND b.status = 'available'
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id = b.id AND a.status IN ('active','pending_approval'))) av
  WHERE r.category_id = p_category_id AND r.room_purpose = 'student'
    AND (bl.hostel_type::text = 'mixed' OR (v_gender IN ('male','m') AND bl.hostel_type::text = 'boys') OR (v_gender IN ('female','f') AND bl.hostel_type::text = 'girls'))
    AND fn_room_serves_institution(r.id, v_inst) AND fn_learner_eligible_for_room(p_learner_id, r.id) AND av.free > 0
  ORDER BY bl.name, r.floor, r.room_number;
END $$;

CREATE OR REPLACE FUNCTION public.fn_cl_admin_room_upgrade_options(p_learner_id uuid)
RETURNS TABLE(category_id uuid, name text, type text, allocation_mode text, current_year_fee numeric,
              upgrade_fee numeric, available_beds integer, threshold_pct numeric, paid_pct numeric, meets_threshold boolean, hold_days integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inst uuid; v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_gender text; v_paid_pct numeric; v_profile uuid;
BEGIN
  IF NOT public.user_has_permission('campus_living.upgrades.manage') THEN
    RAISE EXCEPTION 'permission denied: campus_living.upgrades.manage' USING ERRCODE='42501';
  END IF;
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_id;
  IF v_inst IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_user_accessible_institutions(auth.uid()) g WHERE g.institution_id = v_inst) THEN
    RAISE EXCEPTION 'You do not have access to this learner''s institution' USING ERRCODE='42501';
  END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN; END IF;
  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = p_learner_id;
  SELECT p.id INTO v_profile FROM profiles p WHERE p.learner_id = p_learner_id;
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.learner_id = lp.id WHERE lp.id = p_learner_id;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  SELECT pp.paid_pct INTO v_paid_pct FROM fn_learner_academic_payment_progress(p_learner_id) pp;
  RETURN QUERY
  SELECT c.id, c.name, c.type, c.allocation_mode, hf.amount,
         COALESCE((SELECT uf.amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active AND uf.from_hostel_category_id = v_cur_cat AND uf.to_hostel_category_id = c.id LIMIT 1),
           hf.amount - v_cur_fee) AS upgrade_fee,
         (SELECT count(*)::int FROM _cl_room_options(v_profile, p_learner_id, c.id)),
         c.upgrade_threshold_pct, v_paid_pct,
         (c.upgrade_threshold_pct IS NULL OR (v_paid_pct IS NOT NULL AND v_paid_pct >= c.upgrade_threshold_pct)),
         c.upgrade_hold_days
  FROM hostel_categories c
  JOIN hostel_fees hf ON hf.hostel_category_id = c.id AND hf.hostel_year_id = v_year AND hf.mess_category_id IS NULL AND hf.is_active
  WHERE c.is_active AND c.allocation_mode = 'manual'
    AND ((v_gender IN ('male','m') AND c.type='boys') OR (v_gender IN ('female','f') AND c.type='girls'))
    AND c.id <> COALESCE(v_cur_cat, '00000000-0000-0000-0000-000000000000'::uuid)
    AND hf.amount > v_cur_fee
  ORDER BY hf.amount;
END $$;

CREATE OR REPLACE FUNCTION public.fn_cl_admin_upgrade_room(
  p_learner_id uuid, p_category_id uuid, p_room_id uuid, p_bed_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inst uuid; v_profile uuid;
BEGIN
  IF NOT public.user_has_permission('campus_living.upgrades.manage') THEN
    RAISE EXCEPTION 'permission denied: campus_living.upgrades.manage' USING ERRCODE='42501';
  END IF;
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'Learner not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_user_accessible_institutions(auth.uid()) g WHERE g.institution_id = v_inst) THEN
    RAISE EXCEPTION 'You do not have access to this learner''s institution' USING ERRCODE='42501';
  END IF;
  SELECT p.id INTO v_profile FROM profiles p WHERE p.learner_id = p_learner_id;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'Learner has no login profile (cannot record allocation)'; END IF;
  RETURN public._cl_upgrade_room_category(v_profile, p_learner_id, p_category_id, p_room_id, p_bed_id, false);
END $$;

REVOKE ALL ON FUNCTION public._cl_room_options(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cl_upgrade_room_category(uuid,uuid,uuid,uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cl_admin_room_options(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cl_admin_room_options(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_cl_admin_room_upgrade_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cl_admin_room_upgrade_options(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_cl_admin_upgrade_room(uuid,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cl_admin_upgrade_room(uuid,uuid,uuid,uuid) TO authenticated;

-- 20260617170000: room upgrades MOVE-NOW. Supersedes the _cl_upgrade_room_category
-- above (CREATE OR REPLACE — last wins). Drops the reserve/pay-to-confirm branch:
-- the room move (or first booking) happens immediately on confirm + the upgrade fee
-- is billed. Reverts a prior optimistic flip so the fee computes original->target.
CREATE OR REPLACE FUNCTION public._cl_upgrade_room_category(
  p_profile uuid, p_lp uuid, p_new_category_id uuid, p_room_id uuid,
  p_bed_id uuid DEFAULT NULL, p_enforce_self_gates boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lp uuid := p_lp; v_profile uuid := p_profile;
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_new_name text; v_gate jsonb; v_has_alloc boolean; v_result jsonb; v_orig uuid;
BEGIN
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;
  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM hostel_categories WHERE id = p_new_category_id;
  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  v_has_alloc := EXISTS (SELECT 1 FROM hostel_allocations WHERE learner_id = v_profile AND status = 'active');
  IF v_cur_cat = p_new_category_id THEN
    SELECT from_hostel_category_id INTO v_orig FROM hostel_waitlist
     WHERE learner_id = v_profile AND entry_kind='upgrade' AND target_hostel_category_id = p_new_category_id
       AND from_hostel_category_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1;
    IF v_orig IS NOT NULL THEN
      UPDATE learners_profiles SET hostel_category_id = v_orig WHERE id = v_lp;
      v_cur_cat := v_orig;
    END IF;
  END IF;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_cur_cat IS NOT NULL AND v_new_fee < v_cur_fee THEN
    RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)';
  END IF;
  IF p_enforce_self_gates AND v_has_alloc
     AND NOT COALESCE((SELECT upgrades_enabled FROM hostel_categories WHERE id = v_cur_cat), false) THEN
    RAISE EXCEPTION 'Room upgrades are currently disabled for your category';
  END IF;
  UPDATE hostel_beds b SET status='available'
    FROM hostel_waitlist w
   WHERE w.learner_id = v_profile AND w.entry_kind='upgrade' AND w.status='waiting'
     AND w.held_bed_id = b.id AND b.status='reserved';
  UPDATE billing_student_bills bb SET status='cancelled', updated_at=now()
    FROM hostel_waitlist w
   WHERE w.learner_id = v_profile AND w.entry_kind='upgrade' AND w.status='waiting'
     AND w.target_hostel_category_id <> p_new_category_id
     AND w.upgrade_bill_id = bb.id AND bb.status='unpaid'
     AND NOT EXISTS (SELECT 1 FROM billing_receipt_items ri WHERE ri.bill_id = bb.id);
  UPDATE hostel_waitlist
     SET status='declined', held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting'
     AND target_hostel_category_id <> p_new_category_id;
  UPDATE hostel_waitlist
     SET held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting'
     AND target_hostel_category_id = p_new_category_id;
  IF p_bed_id IS NULL THEN
    SELECT o.bed_id INTO p_bed_id FROM _cl_room_options(v_profile, v_lp, p_new_category_id) o
    WHERE o.room_id = p_room_id ORDER BY o.bed_number LIMIT 1;
    IF p_bed_id IS NULL THEN RAISE EXCEPTION 'No available bed left in that room. Pick another room.'; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _cl_room_options(v_profile, v_lp, p_new_category_id) o
                 WHERE o.bed_id = p_bed_id AND o.room_id = p_room_id) THEN
    RAISE EXCEPTION 'That room/bed is not an available option for this learner';
  END IF;
  v_gate := public._cl_upgrade_threshold_check(v_lp, p_new_category_id);
  IF NOT v_has_alloc THEN
    v_result := public._cl_execute_first_booking(v_profile, v_lp, p_new_category_id, p_room_id, p_bed_id, false);
    RETURN v_result || jsonb_build_object('new_fee', v_new_fee,
      'threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct');
  END IF;
  v_result := public._cl_execute_room_upgrade(v_profile, v_lp, p_new_category_id, p_room_id, p_bed_id, false);
  RETURN v_result || jsonb_build_object('threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct');
END $$;
REVOKE ALL ON FUNCTION public._cl_upgrade_room_category(uuid,uuid,uuid,uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_self_join_upgrade_waitlist(p_target_category_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_profile uuid := auth.uid();
  v_inst uuid; v_ay uuid; v_existing uuid; v_id uuid;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a hostel resident can join the waitlist';
  END IF;
  IF NOT COALESCE((SELECT upgrades_enabled FROM hostel_categories
                   WHERE id = (SELECT hostel_category_id FROM learners_profiles WHERE id = v_lp)), false) THEN
    RAISE EXCEPTION 'Upgrades are currently disabled for your category';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM fn_my_manual_categories() mc WHERE mc.id = p_target_category_id) THEN
    RAISE EXCEPTION 'You are not eligible for this category';
  END IF;

  SELECT institution_id, academic_year_id INTO v_inst, v_ay FROM learners_profiles WHERE id = v_lp;
  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id=v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year configured'; END IF;

  SELECT id INTO v_existing FROM hostel_waitlist
    WHERE learner_id=v_profile AND entry_kind='upgrade'
      AND target_hostel_category_id=p_target_category_id AND status='waiting' LIMIT 1;
  IF v_existing IS NOT NULL THEN
    UPDATE hostel_waitlist SET updated_at=now() WHERE id=v_existing;
    RETURN v_existing;
  END IF;

  INSERT INTO hostel_waitlist (institution_id, learner_id, academic_year_id, status, entry_kind, target_hostel_category_id)
  VALUES (v_inst, v_profile, v_ay, 'waiting', 'upgrade', p_target_category_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_self_upgrade_room_category(uuid,uuid,uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_self_upgrade_mess_category(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_self_join_upgrade_waitlist(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_self_upgrade_room_category(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_self_upgrade_mess_category(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_self_join_upgrade_waitlist(uuid) TO authenticated;

-- fn_explain_allocation: per-allocation eligibility explanation (category + physical rule + bill)
-- for the batch-detail "view details" modal. Access mirrors fn_auto_allocate_candidates.
-- 20260610090000: enriched with learner values, eligibility_rules (per-condition verdicts +
-- winner-scope flags), per-bill counted list, and per-dimension physical-rule comparisons.
CREATE OR REPLACE FUNCTION public.fn_explain_allocation(p_allocation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile uuid; v_room uuid; v_block uuid; v_floor int; v_room_cat uuid;
  v_room_number text; v_status text; v_room_cat_name text; v_room_cat_type text;
  v_lp uuid; v_inst uuid; v_degree uuid; v_dept uuid; v_program uuid; v_semester uuid; v_ay uuid;
  v_quota uuid; v_gender text;
  v_inst_name text; v_degree_name text; v_dept_name text; v_program_name text;
  v_semester_name text; v_quota_name text;
  v_room_cats uuid[]; v_mess_cats uuid[];
  v_resolved_room_name text; v_resolved_mess_name text;
  v_fee numeric; v_ay_name text;
  v_has_covering boolean; v_matched boolean; v_rules jsonb;
  v_pinned boolean; v_pinned_blocks text; v_pinned_rules jsonb;
  v_serves boolean; v_cur_bill int; v_acad_bill int;
  v_elig_rules jsonb; v_bills jsonb;
BEGIN
  SELECT a.learner_id, a.room_id, a.status, r.room_number, r.block_id, r.floor, r.category_id
    INTO v_profile, v_room, v_status, v_room_number, v_block, v_floor, v_room_cat
    FROM hostel_allocations a LEFT JOIN hostel_rooms r ON r.id = a.room_id
    WHERE a.id = p_allocation_id;
  IF v_profile IS NULL THEN RETURN jsonb_build_object('error','allocation_not_found'); END IF;

  SELECT lp.id, lp.institution_id, lp.degree_id, lp.department_id, lp.program_id, lp.semester_id,
         lp.academic_year_id, lp.quota_id
    INTO v_lp, v_inst, v_degree, v_dept, v_program, v_semester, v_ay, v_quota
    FROM profiles p JOIN learners_profiles lp ON lp.id = p.learner_id
    WHERE p.id = v_profile;
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE id = v_profile;
  SELECT name, type INTO v_room_cat_name, v_room_cat_type FROM hostel_categories WHERE id = v_room_cat;

  SELECT name INTO v_inst_name FROM institutions WHERE id = v_inst;
  SELECT degree_name INTO v_degree_name FROM degrees WHERE id = v_degree;
  SELECT department_name INTO v_dept_name FROM departments WHERE id = v_dept;
  SELECT program_name INTO v_program_name FROM programs WHERE id = v_program;
  SELECT semester_name INTO v_semester_name FROM semesters WHERE id = v_semester;
  SELECT name INTO v_quota_name FROM quotas WHERE id = v_quota;

  SELECT array_agg(category_id) INTO v_room_cats FROM fn_hostel_learner_room_categories(v_lp);
  SELECT array_agg(category_id) INTO v_mess_cats FROM fn_hostel_learner_mess_categories(v_lp);
  SELECT name INTO v_resolved_room_name FROM hostel_categories WHERE id = v_room_cats[1];
  SELECT name INTO v_resolved_mess_name FROM mess_categories WHERE id = v_mess_cats[1];
  v_fee := fn_learner_current_year_academic_fee(v_lp);
  SELECT academic_year_name INTO v_ay_name FROM academic_years WHERE id = v_ay;
  v_serves := fn_room_serves_institution(v_room, v_inst);

  -- Program-Eligibility conditions for the learner's institution, with per-condition
  -- verdicts; selected_room/selected_mess mirror fn_hostel_effective_*_categories winners.
  WITH rules AS (
    SELECT e.*,
           COALESCE(e.program_id IS NULL OR e.program_id = v_program, false) AS program_ok,
           COALESCE(e.quota_ids IS NULL OR v_quota = ANY(e.quota_ids), false) AS quota_ok,
           (v_fee IS NOT NULL
              AND (e.fee_min IS NULL OR v_fee >= e.fee_min)
              AND (e.fee_max IS NULL OR v_fee <  e.fee_max)) AS fee_ok,
           ( (e.program_id IS NOT NULL)::int * 4
           + (e.quota_ids  IS NOT NULL)::int * 2
           + ((e.fee_min IS NOT NULL OR e.fee_max IS NOT NULL))::int ) AS specificity
    FROM hostel_program_eligibility e
    WHERE e.institution_id = v_inst AND e.is_active
  ),
  room_winner AS (
    SELECT program_id, quota_ids, fee_min, fee_max FROM rules
    WHERE room_category_id IS NOT NULL AND program_ok AND quota_ok AND fee_ok
    ORDER BY specificity DESC, (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  ),
  mess_winner AS (
    SELECT program_id, quota_ids, fee_min, fee_max FROM rules
    WHERE mess_category_id IS NOT NULL AND program_ok AND quota_ok AND fee_ok
    ORDER BY specificity DESC, (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  )
  SELECT jsonb_agg(jsonb_build_object(
      'program', (SELECT program_name FROM programs WHERE id = r.program_id),
      'quota',   (SELECT string_agg(name, ', ' ORDER BY name) FROM quotas WHERE id = ANY(r.quota_ids)),
      'fee_min', r.fee_min,
      'fee_max', r.fee_max,
      'room_category', (SELECT name FROM hostel_categories WHERE id = r.room_category_id),
      'mess_category', (SELECT name FROM mess_categories  WHERE id = r.mess_category_id),
      'program_ok', r.program_ok,
      'quota_ok',   r.quota_ok,
      'fee_ok',     r.fee_ok,
      'matched',    (r.program_ok AND r.quota_ok AND r.fee_ok),
      'selected_room', (r.room_category_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM room_winner w
        WHERE r.program_id IS NOT DISTINCT FROM w.program_id
          AND r.quota_ids  IS NOT DISTINCT FROM w.quota_ids
          AND r.fee_min    IS NOT DISTINCT FROM w.fee_min
          AND r.fee_max    IS NOT DISTINCT FROM w.fee_max)),
      'selected_mess', (r.mess_category_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM mess_winner w
        WHERE r.program_id IS NOT DISTINCT FROM w.program_id
          AND r.quota_ids  IS NOT DISTINCT FROM w.quota_ids
          AND r.fee_min    IS NOT DISTINCT FROM w.fee_min
          AND r.fee_max    IS NOT DISTINCT FROM w.fee_max))
    ) ORDER BY (r.program_ok AND r.quota_ok AND r.fee_ok) DESC, r.specificity DESC,
               r.fee_min ASC NULLS FIRST)
  INTO v_elig_rules
  FROM rules r;

  -- The learner's academic bills; `counted` mirrors fn_learner_current_year_academic_fee.
  SELECT jsonb_agg(jsonb_build_object(
      'description', b.bill_description,
      'amount', b.final_amount,
      'status', b.status,
      'due_date', b.due_date,
      'academic_year', (SELECT academic_year_name FROM academic_years WHERE id = b.academic_year_id),
      'counted', (COALESCE(b.status NOT IN ('cancelled','superseded'), false)
                  AND b.academic_year_id IS NOT NULL
                  AND b.academic_year_id IS NOT DISTINCT FROM v_ay)
    ) ORDER BY b.due_date DESC)
  INTO v_bills
  FROM billing_student_bills b
  WHERE b.student_id = v_lp AND b.fee_source = 'academic';

  WITH covering AS (
    SELECT r.* FROM hostel_room_eligibility_rules r
    WHERE r.is_active AND r.block_id = v_block
      AND CASE
            WHEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id)
              THEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id AND rr.room_id=v_room)
            ELSE (r.floor IS NULL OR r.floor = v_floor)
          END
  )
  SELECT
    EXISTS (SELECT 1 FROM covering),
    EXISTS (SELECT 1 FROM covering c WHERE c.institution_id=v_inst
              AND (c.degree_id     IS NULL OR c.degree_id     = v_degree)
              AND (c.department_id IS NULL OR c.department_id = v_dept)
              AND (c.program_id    IS NULL OR c.program_id    = v_program)
              AND (c.semester_id   IS NULL OR c.semester_id   = v_semester)),
    (SELECT jsonb_agg(jsonb_build_object(
       'rule_name', COALESCE(NULLIF(btrim(c.rule_name),''),'(unnamed rule)'),
       'floor', c.floor,
       'matched', COALESCE((c.institution_id=v_inst
              AND (c.degree_id     IS NULL OR c.degree_id     = v_degree)
              AND (c.department_id IS NULL OR c.department_id = v_dept)
              AND (c.program_id    IS NULL OR c.program_id    = v_program)
              AND (c.semester_id   IS NULL OR c.semester_id   = v_semester)), false),
       'cohort', NULLIF(concat_ws(' · ',
         (SELECT degree_name     FROM degrees     WHERE id=c.degree_id),
         (SELECT department_name FROM departments WHERE id=c.department_id),
         (SELECT program_name    FROM programs    WHERE id=c.program_id),
         (SELECT semester_name   FROM semesters   WHERE id=c.semester_id)),''),
       'institution',    (SELECT name FROM institutions WHERE id=c.institution_id),
       'institution_ok', COALESCE(c.institution_id = v_inst, false),
       'degree',         (SELECT degree_name FROM degrees WHERE id=c.degree_id),
       'degree_ok',      COALESCE((c.degree_id IS NULL OR c.degree_id = v_degree), false),
       'department',     (SELECT department_name FROM departments WHERE id=c.department_id),
       'department_ok',  COALESCE((c.department_id IS NULL OR c.department_id = v_dept), false),
       'program',        (SELECT program_name FROM programs WHERE id=c.program_id),
       'program_ok',     COALESCE((c.program_id IS NULL OR c.program_id = v_program), false),
       'semester',       (SELECT semester_name FROM semesters WHERE id=c.semester_id),
       'semester_ok',    COALESCE((c.semester_id IS NULL OR c.semester_id = v_semester), false)
     ) ORDER BY c.rule_name) FROM covering c)
  INTO v_has_covering, v_matched, v_rules;

  -- Cohort pinning (20260610130000): does ANY active rule (any block) match this cohort?
  SELECT EXISTS (
    SELECT 1 FROM hostel_room_eligibility_rules r
    WHERE r.is_active
      AND r.institution_id = v_inst
      AND (r.degree_id     IS NULL OR r.degree_id     = v_degree)
      AND (r.department_id IS NULL OR r.department_id = v_dept)
      AND (r.program_id    IS NULL OR r.program_id    = v_program)
      AND (r.semester_id   IS NULL OR r.semester_id   = v_semester)
  ),
  (SELECT string_agg(DISTINCT hb.name, ', ')
     FROM hostel_room_eligibility_rules r
     JOIN hostel_blocks hb ON hb.id = r.block_id
     WHERE r.is_active
       AND r.institution_id = v_inst
       AND (r.degree_id     IS NULL OR r.degree_id     = v_degree)
       AND (r.department_id IS NULL OR r.department_id = v_dept)
       AND (r.program_id    IS NULL OR r.program_id    = v_program)
       AND (r.semester_id   IS NULL OR r.semester_id   = v_semester))
  INTO v_pinned, v_pinned_blocks;

  -- The cohort's reservation rule(s) themselves (any block) — the configured condition
  -- the learner matches; lets the UI show condition + learner status (20260610150000).
  SELECT jsonb_agg(jsonb_build_object(
      'block', hb.name,
      'rule_name', COALESCE(NULLIF(btrim(r.rule_name),''),'(unnamed rule)'),
      'floor', r.floor,
      'rooms', (SELECT count(*)::int FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id),
      'institution', (SELECT name FROM institutions WHERE id=r.institution_id),
      'degree',      (SELECT degree_name FROM degrees WHERE id=r.degree_id),
      'department',  (SELECT department_name FROM departments WHERE id=r.department_id),
      'program',     (SELECT program_name FROM programs WHERE id=r.program_id),
      'semester',    (SELECT semester_name FROM semesters WHERE id=r.semester_id),
      'covers_allocated_room', (r.block_id = v_block)
    ) ORDER BY hb.name)
  INTO v_pinned_rules
  FROM hostel_room_eligibility_rules r
  JOIN hostel_blocks hb ON hb.id = r.block_id
  WHERE r.is_active
    AND r.institution_id = v_inst
    AND (r.degree_id     IS NULL OR r.degree_id     = v_degree)
    AND (r.department_id IS NULL OR r.department_id = v_dept)
    AND (r.program_id    IS NULL OR r.program_id    = v_program)
    AND (r.semester_id   IS NULL OR r.semester_id   = v_semester);

  SELECT count(*)::int INTO v_acad_bill FROM billing_student_bills b
    WHERE b.student_id=v_lp AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded');
  SELECT count(*)::int INTO v_cur_bill FROM billing_student_bills b
    WHERE b.student_id=v_lp AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded')
      AND b.academic_year_id=v_ay;

  RETURN jsonb_build_object(
    'allocation_id', p_allocation_id, 'room_number', v_room_number, 'status', v_status,
    'learner', jsonb_build_object(
      'institution', v_inst_name,
      'degree', v_degree_name,
      'department', v_dept_name,
      'program', v_program_name,
      'semester', v_semester_name,
      'quota', v_quota_name,
      'academic_year', v_ay_name,
      'academic_fee', v_fee,
      'gender', v_gender
    ),
    'eligibility_rules', COALESCE(v_elig_rules, '[]'::jsonb),
    'category', jsonb_build_object(
      'allocated_room_category', v_room_cat_name,
      'resolved_room_category', v_resolved_room_name,
      'room_category_matched', (v_room_cat = ANY(COALESCE(v_room_cats,'{}'::uuid[]))),
      'resolved_mess_category', v_resolved_mess_name,
      'academic_year', v_ay_name,
      'academic_fee', v_fee,
      'gender', v_gender,
      'gender_ok', (v_room_cat_type IS NULL
                    OR (v_room_cat_type='boys'  AND v_gender IN ('male','m'))
                    OR (v_room_cat_type='girls' AND v_gender IN ('female','f')))
    ),
    'physical', jsonb_build_object(
      'institution_served', v_serves,
      'is_rule_covered', v_has_covering,
      'rule_matched', v_matched,
      'open_room', NOT v_has_covering,
      'pinned_elsewhere', (v_pinned AND NOT v_matched),
      'pinned_blocks', v_pinned_blocks,
      'pinned_rules', COALESCE(v_pinned_rules, '[]'::jsonb),
      'access_ok', (v_matched OR (NOT v_has_covering AND NOT v_pinned)),
      'covering_rules', COALESCE(v_rules, '[]'::jsonb)
    ),
    'bill', jsonb_build_object('current_year_bills', v_cur_bill, 'academic_bills', v_acad_bill),
    'bills', COALESCE(v_bills, '[]'::jsonb)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_explain_allocation(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_explain_allocation(uuid) TO authenticated;

-- fn_batch_mess_categories: resolved mess category per allocation in a batch (batch-detail
-- "Mess Category" column). hostel_allocations stores no mess category — it is resolved per
-- learner via the fee-aware fn_hostel_learner_mess_categories (NULL = fail-open).
CREATE OR REPLACE FUNCTION public.fn_batch_mess_categories(p_batch_id uuid)
RETURNS TABLE(allocation_id uuid, mess_category text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id,
         (SELECT mc.name
            FROM fn_hostel_learner_mess_categories(p.learner_id) f
            JOIN mess_categories mc ON mc.id = f.category_id
            LIMIT 1)
  FROM hostel_allocations a
  JOIN profiles p ON p.id = a.learner_id
  WHERE a.batch_id = p_batch_id;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_batch_mess_categories(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_batch_mess_categories(uuid) TO authenticated;

-- fn_batch_room_category_breakdown: per-room-category rooms/beds breakdown for allocation
-- batches (batches list page). A batch spans multiple room categories, so the single
-- batches.category_id is not representative; the list shows this breakdown instead.
CREATE OR REPLACE FUNCTION public.fn_batch_room_category_breakdown(p_batch_ids uuid[])
RETURNS TABLE(batch_id uuid, category text, rooms int, beds int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.batch_id,
         COALESCE(hc.name, 'Uncategorised') AS category,
         count(DISTINCT a.room_id)::int AS rooms,
         count(a.bed_id)::int AS beds
  FROM hostel_allocations a
  LEFT JOIN hostel_rooms r ON r.id = a.room_id
  LEFT JOIN hostel_categories hc ON hc.id = r.category_id
  WHERE a.batch_id = ANY(p_batch_ids)
  GROUP BY a.batch_id, hc.name
  ORDER BY a.batch_id, hc.name;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_batch_room_category_breakdown(uuid[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_batch_room_category_breakdown(uuid[]) TO authenticated;

-- fn_my_roommates: co-residents of the current user's assigned room (My Hostel Overview).
-- Residents can only read their own allocation via RLS, so roommates resolve server-side,
-- scoped to auth.uid()'s room. Exposes name + bed + program + year + status only.
CREATE OR REPLACE FUNCTION public.fn_my_roommates()
RETURNS TABLE(
  full_name text, bed_number text, program_name text, semester_name text, status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT a.room_id
    FROM hostel_allocations a
    WHERE a.learner_id = auth.uid()
      AND a.status IN ('active','pending_approval','pending_vacate')
      AND a.room_id IS NOT NULL
    ORDER BY a.allocation_date DESC NULLS LAST
    LIMIT 1
  )
  SELECT
    COALESCE(p.full_name, p.email, '—') AS full_name,
    bd.bed_number,
    prog.program_name,
    sem.semester_name,
    a.status
  FROM hostel_allocations a
  JOIN me ON me.room_id = a.room_id
  JOIN profiles p ON p.id = a.learner_id
  LEFT JOIN hostel_beds bd ON bd.id = a.bed_id
  LEFT JOIN learners_profiles lp ON lp.id = p.learner_id
  LEFT JOIN programs prog ON prog.id = lp.program_id
  LEFT JOIN semesters sem ON sem.id = lp.semester_id
  WHERE a.learner_id <> auth.uid()
    AND a.status IN ('active','pending_approval','pending_vacate')
  ORDER BY bd.bed_number NULLS LAST, p.full_name;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_my_roommates() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_my_roommates() TO authenticated;

-- fn_user_allocated_block/room/bed: a user may read the block/room/bed referenced by
-- one of their OWN hostel allocations (My Hostel resident card). SECURITY DEFINER so
-- the hostel_allocations lookup bypasses RLS (avoids transitive policy recursion).
CREATE OR REPLACE FUNCTION public.fn_user_allocated_block(p_block_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM hostel_allocations a
    WHERE a.block_id = p_block_id AND a.learner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_user_allocated_room(p_room_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM hostel_allocations a
    WHERE a.room_id = p_room_id AND a.learner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_user_allocated_bed(p_bed_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM hostel_allocations a
    WHERE a.bed_id = p_bed_id AND a.learner_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_user_allocated_block(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_user_allocated_room(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_user_allocated_bed(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_user_allocated_block(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_allocated_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_allocated_bed(uuid) TO authenticated;

-- 20260611100000: My Hostel room-centric upgrade picker + waitlist self-service.
-- Room-level options (capacity + free beds; only rooms with >=1 available bed).
CREATE OR REPLACE FUNCTION public.fn_my_upgrade_room_options(p_category_id uuid)
RETURNS TABLE(
  room_id uuid, room_number text, floor integer, block_name text,
  capacity integer, occupied_beds integer, available_beds integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lp uuid := get_my_learner_id(); v_inst uuid; v_gender text;
BEGIN
  IF v_lp IS NULL THEN RETURN; END IF;
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = v_lp;
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE profiles.id = auth.uid();
  RETURN QUERY
  SELECT r.id, r.room_number, r.floor, bl.name,
         COALESCE(r.actual_capacity, r.capacity)::int,
         GREATEST(COALESCE(r.actual_capacity, r.capacity)::int - av.free, 0),
         av.free
  FROM hostel_rooms r
  JOIN hostel_blocks bl ON bl.id = r.block_id
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS free
    FROM hostel_beds b
    WHERE b.room_id = r.id AND b.status = 'available'
      AND NOT EXISTS (
        SELECT 1 FROM hostel_allocations a
        WHERE a.bed_id = b.id AND a.status IN ('active','pending_approval')
      )
  ) av
  WHERE r.category_id = p_category_id AND r.room_purpose = 'student'
    AND (bl.hostel_type::text = 'mixed'
         OR (v_gender IN ('male','m')   AND bl.hostel_type::text = 'boys')
         OR (v_gender IN ('female','f') AND bl.hostel_type::text = 'girls'))
    AND fn_room_serves_institution(r.id, v_inst)
    AND fn_learner_eligible_for_room(v_lp, r.id)
    AND av.free > 0
  ORDER BY bl.name, r.floor, r.room_number;
END $$;

-- Resident's own pending upgrade waitlist entries.
-- 20260611150000: + held room/block/bed, hold_expires_at, threshold progress.
CREATE OR REPLACE FUNCTION public.fn_my_upgrade_waitlist()
RETURNS TABLE(
  waitlist_id uuid, target_category_id uuid, target_category_name text,
  status text, created_at timestamptz,
  held_room_id uuid, held_room_number text, held_block_name text, held_bed_number text,
  hold_expires_at timestamptz, threshold_pct numeric, paid_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, w.target_hostel_category_id, c.name, w.status::text, w.created_at,
         w.held_room_id, r.room_number, bl.name, b.bed_number,
         w.hold_expires_at, c.upgrade_threshold_pct,
         (SELECT pp.paid_pct FROM fn_learner_academic_payment_progress(get_my_learner_id()) pp)
  FROM hostel_waitlist w
  LEFT JOIN hostel_categories c ON c.id = w.target_hostel_category_id
  LEFT JOIN hostel_rooms r ON r.id = w.held_room_id
  LEFT JOIN hostel_blocks bl ON bl.id = r.block_id
  LEFT JOIN hostel_beds b ON b.id = w.held_bed_id
  WHERE w.learner_id = auth.uid()
    AND w.entry_kind = 'upgrade'
    AND w.status IN ('waiting','offered')
  ORDER BY w.created_at DESC;
$$;

-- Leave the upgrade waitlist (status -> declined; resident may re-join later).
-- 20260611150000: also releases the hard-reserved bed of a threshold hold.
CREATE OR REPLACE FUNCTION public.fn_self_leave_upgrade_waitlist(p_target_category_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE hostel_beds b SET status='available'
    FROM hostel_waitlist w
   WHERE w.learner_id = auth.uid() AND w.entry_kind='upgrade'
     AND w.target_hostel_category_id = p_target_category_id AND w.status='waiting'
     AND w.held_bed_id = b.id AND b.status='reserved';
  UPDATE hostel_waitlist
     SET status='declined', held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = auth.uid()
     AND entry_kind = 'upgrade'
     AND target_hostel_category_id = p_target_category_id
     AND status = 'waiting';
  RETURN FOUND;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_my_upgrade_room_options(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_my_upgrade_waitlist() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_self_leave_upgrade_waitlist(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_my_upgrade_room_options(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_my_upgrade_waitlist() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_self_leave_upgrade_waitlist(uuid) TO authenticated;

-- 20260611150000: auto-confirm held upgrades once payments reach the threshold.
-- Called per-receipt-item by trg_cl_upgrade_holds_after_payment (04_triggers.sql),
-- so gateway callbacks AND office cash/cheque receipts both re-check the gate.
CREATE OR REPLACE FUNCTION public.fn_cl_process_upgrade_holds(p_student_lp uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile uuid; v_row RECORD; v_gate jsonb; v_count int := 0;
BEGIN
  -- Bridge: waitlist/allocations key on profiles.id; billing keys on learners_profiles.id
  SELECT id INTO v_profile FROM profiles WHERE learner_id = p_student_lp;
  IF v_profile IS NULL THEN RETURN 0; END IF;

  FOR v_row IN
    SELECT id, target_hostel_category_id, held_room_id, held_bed_id
    FROM hostel_waitlist
    WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting'
      AND held_bed_id IS NOT NULL AND hold_expires_at > now()
    ORDER BY created_at
  LOOP
    BEGIN
      v_gate := public._cl_upgrade_threshold_check(p_student_lp, v_row.target_hostel_category_id);
      IF (v_gate->>'meets')::boolean THEN
        PERFORM public._cl_execute_room_upgrade(
          v_profile, p_student_lp, v_row.target_hostel_category_id,
          v_row.held_room_id, v_row.held_bed_id, true);
        v_count := v_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Leave the hold in place; expiry will clean it up if it never resolves.
      RAISE WARNING 'fn_cl_process_upgrade_holds: % (waitlist %)', SQLERRM, v_row.id;
    END;
  END LOOP;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_process_upgrade_holds(uuid) FROM anon, authenticated, PUBLIC;

CREATE OR REPLACE FUNCTION public._on_receipt_item_process_upgrade_holds()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student_id uuid;
BEGIN
  -- Never fail a receipt because of upgrade processing.
  BEGIN
    SELECT br.student_id INTO v_student_id
    FROM public.billing_receipts br
    WHERE br.id = NEW.receipt_id;
    IF v_student_id IS NOT NULL THEN
      PERFORM public.fn_cl_process_upgrade_holds(v_student_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_on_receipt_item_process_upgrade_holds: %', SQLERRM;
  END;
  RETURN NEW;
END $$;

-- 20260611150000: expire stale below-threshold holds and release their beds.
-- Called by the Vercel cron /api/cron/campus-living/upgrade-hold-expiry (hourly).
CREATE OR REPLACE FUNCTION public.fn_cl_expire_upgrade_holds()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
BEGIN
  -- held_room_id/held_bed_id are kept on expired rows as an audit trail;
  -- the status transition itself is the idempotency stamp.
  WITH expired AS (
    UPDATE hostel_waitlist
       SET status='expired', updated_at=now()
     WHERE entry_kind='upgrade' AND status='waiting'
       AND held_bed_id IS NOT NULL AND hold_expires_at < now()
     RETURNING held_bed_id
  ), released AS (
    UPDATE hostel_beds b SET status='available'
    FROM expired e
    WHERE b.id = e.held_bed_id AND b.status='reserved'
    RETURNING b.id
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN COALESCE(v_count, 0);
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_expire_upgrade_holds() FROM anon, authenticated, PUBLIC;

NOTIFY pgrst, 'reload schema';

-- 20260611180000: housekeeping schedule -> task generation ---------------------
-- Dueness rule anchored on the schedule's creation date (IST). daily: every
-- day; weekly/biweekly: every 7/14 days; monthly/quarterly/half_yearly/yearly:
-- same day-of-month (clamped to month end) every 1/3/6/12 months.
CREATE OR REPLACE FUNCTION public.fn_housekeeping_schedule_due(
  p_frequency text, p_anchor date, p_date date
)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_months_apart int;
  v_dom int;
BEGIN
  IF p_date < p_anchor THEN RETURN false; END IF;
  CASE p_frequency
    WHEN 'daily' THEN RETURN true;
    WHEN 'weekly' THEN RETURN (p_date - p_anchor) % 7 = 0;
    WHEN 'biweekly' THEN RETURN (p_date - p_anchor) % 14 = 0;
    WHEN 'monthly', 'quarterly', 'half_yearly', 'yearly' THEN
      v_months_apart := (EXTRACT(YEAR FROM p_date)::int * 12 + EXTRACT(MONTH FROM p_date)::int)
                      - (EXTRACT(YEAR FROM p_anchor)::int * 12 + EXTRACT(MONTH FROM p_anchor)::int);
      IF v_months_apart % (CASE p_frequency
                             WHEN 'monthly' THEN 1
                             WHEN 'quarterly' THEN 3
                             WHEN 'half_yearly' THEN 6
                             ELSE 12 END) <> 0 THEN
        RETURN false;
      END IF;
      v_dom := LEAST(
        EXTRACT(DAY FROM p_anchor)::int,
        EXTRACT(DAY FROM (date_trunc('month', p_date) + interval '1 month - 1 day'))::int
      );
      RETURN EXTRACT(DAY FROM p_date)::int = v_dom;
    ELSE
      RETURN false;
  END CASE;
END $$;

-- Idempotent day generator (cron /api/cron/campus-living/housekeeping-task-generator,
-- daily 00:05 IST). Backed by uq_cleaning_task_schedule_date.
CREATE OR REPLACE FUNCTION public.fn_housekeeping_generate_tasks(p_date date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_date date := COALESCE(p_date, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_count int;
BEGIN
  INSERT INTO hostel_cleaning_tasks (
    institution_id, schedule_id, block_id, floor_number, date,
    cleaning_type, assigned_staff, status
  )
  SELECT s.institution_id, s.id, s.block_id, s.floor_number, v_date,
         s.cleaning_type, s.assigned_staff, 'scheduled'
  FROM hostel_cleaning_schedules s
  WHERE s.is_active
    AND fn_housekeeping_schedule_due(
          s.frequency::text,
          (s.created_at AT TIME ZONE 'Asia/Kolkata')::date,
          v_date)
  ON CONFLICT (schedule_id, date) WHERE schedule_id IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_housekeeping_generate_tasks(date) FROM anon, authenticated, PUBLIC;

-- Seed today's task immediately when a due schedule is created
-- (trigger trg_cleaning_schedule_seed_task in 04_triggers.sql).
CREATE OR REPLACE FUNCTION public._on_cleaning_schedule_seed_task()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  BEGIN
    IF NEW.is_active AND fn_housekeeping_schedule_due(
         NEW.frequency::text,
         (NEW.created_at AT TIME ZONE 'Asia/Kolkata')::date,
         v_today) THEN
      INSERT INTO hostel_cleaning_tasks (
        institution_id, schedule_id, block_id, floor_number, date,
        cleaning_type, assigned_staff, status
      ) VALUES (
        NEW.institution_id, NEW.id, NEW.block_id, NEW.floor_number, v_today,
        NEW.cleaning_type, NEW.assigned_staff, 'scheduled'
      )
      ON CONFLICT (schedule_id, date) WHERE schedule_id IS NOT NULL DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_on_cleaning_schedule_seed_task: %', SQLERRM;
  END;
  RETURN NEW;
END $$;

-- 20260611190000: learner room/mess categories are allocation-derived ----------
-- Fires when a hostel allocation becomes ACTIVE (trigger in 04_triggers.sql):
-- room category = allocated room's category; mess category = first eligible
-- mess category from program-eligibility rules, only when still NULL.
-- Admission-form writes to these columns were removed in the same change set.
CREATE OR REPLACE FUNCTION public._on_allocation_sync_learner_categories()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lp uuid; v_mess uuid;
BEGIN
  BEGIN
    SELECT learner_id INTO v_lp FROM profiles WHERE id = NEW.learner_id;
    IF v_lp IS NULL THEN RETURN NEW; END IF;
    SELECT mc.category_id INTO v_mess
    FROM fn_hostel_learner_mess_categories(v_lp) mc
    LIMIT 1;
    UPDATE learners_profiles
       SET hostel_category_id = (SELECT category_id FROM hostel_rooms WHERE id = NEW.room_id),
           mess_category_id   = COALESCE(mess_category_id, v_mess),
           updated_at = now()
     WHERE id = v_lp;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_on_allocation_sync_learner_categories: %', SQLERRM;
  END;
  RETURN NEW;
END $$;

-- ─── Fee-condition category write-back (migs 20260612120000 + 130000) ────────
-- Writes hostel_program_eligibility-derived room + mess categories onto
-- learners_profiles for hostel learners who have an academic bill. Gender-aware
-- (categories are gender-typed); bill-holders with no gender-matching band fall
-- back to gender-matched Classic. Allocation wins room; overwrite-never-wipe.
CREATE OR REPLACE FUNCTION public.fn_apply_hostel_fee_categories(p_learner_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gender      text;
  v_gender_type text;
  v_allocated   boolean;
  v_has_bill    boolean;
  v_room        uuid;
  v_mess        uuid;
  v_cur_room    uuid;
  v_cur_mess    uuid;
  v_new_room    uuid;
  v_new_mess    uuid;
BEGIN
  SELECT lp.gender
    INTO v_gender
  FROM learners_profiles lp
  JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id
  WHERE lp.id = p_learner_id AND acc.code = 'hostel';
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_gender_type := CASE
                     WHEN lower(v_gender) LIKE 'm%' THEN 'boys'
                     WHEN lower(v_gender) LIKE 'f%' THEN 'girls'
                     ELSE NULL
                   END;

  v_has_bill := EXISTS (
    SELECT 1 FROM billing_student_bills b
    WHERE b.student_id = p_learner_id
      AND b.fee_source = 'academic'
      AND b.status NOT IN ('cancelled','superseded')
  );

  v_allocated := EXISTS (
    SELECT 1
    FROM hostel_allocations ha
    JOIN profiles p ON p.id = ha.learner_id
    WHERE p.learner_id = p_learner_id
      AND ha.status = 'active'
  );

  -- (1) Fee-band category, GENDER-AGNOSTIC: the band condition is the same for both
  --     genders. Resolve the band's category by NAME, map to the learner-gender variant.
  SELECT gv.id INTO v_room
  FROM fn_hostel_learner_room_categories(p_learner_id) r
  JOIN hostel_categories bc ON bc.id = r.category_id
  JOIN hostel_categories gv ON gv.name = bc.name
                           AND gv.type = v_gender_type
                           AND gv.is_active
  LIMIT 1;

  SELECT gv.id INTO v_mess
  FROM fn_hostel_learner_mess_categories(p_learner_id) m
  JOIN mess_categories bc ON bc.id = m.category_id
  JOIN mess_categories gv ON gv.name = bc.name
                         AND gv.type = v_gender_type
                         AND gv.is_active
  LIMIT 1;

  IF v_room IS NULL AND v_has_bill AND v_gender_type IS NOT NULL THEN
    SELECT id INTO v_room
    FROM hostel_categories
    WHERE name = 'Classic Room' AND type = v_gender_type AND is_active
    ORDER BY sort_order
    LIMIT 1;
  END IF;

  IF v_mess IS NULL AND v_has_bill AND v_gender_type IS NOT NULL THEN
    SELECT id INTO v_mess
    FROM mess_categories
    WHERE name = 'Classic' AND type = v_gender_type AND is_active
    ORDER BY sort_order
    LIMIT 1;
  END IF;

  SELECT hostel_category_id, mess_category_id
    INTO v_cur_room, v_cur_mess
  FROM learners_profiles
  WHERE id = p_learner_id;

  v_new_room := CASE WHEN v_allocated THEN v_cur_room
                     ELSE COALESCE(v_room, v_cur_room) END;
  v_new_mess := COALESCE(v_mess, v_cur_mess);

  IF v_new_room IS DISTINCT FROM v_cur_room
     OR v_new_mess IS DISTINCT FROM v_cur_mess THEN
    UPDATE learners_profiles
       SET hostel_category_id = v_new_room,
           mess_category_id   = v_new_mess,
           updated_at         = now()
     WHERE id = p_learner_id;
    RETURN true;
  END IF;

  RETURN false;
END
$function$;

-- Auto-apply categories whenever academic bills are written (mig 20260612130000).
CREATE OR REPLACE FUNCTION public.trg_bill_apply_hostel_fee_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    PERFORM public.fn_apply_hostel_fee_categories(s.student_id)
    FROM (
      SELECT DISTINCT student_id
      FROM new_rows
      WHERE fee_source = 'academic'
        AND student_id IS NOT NULL
    ) s;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_bill_apply_hostel_fee_categories: %', SQLERRM;
  END;
  RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION public.fn_apply_hostel_fee_categories_bulk(p_institution uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id      uuid;
  v_scanned int := 0;
  v_updated int := 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT user_has_permission('campus_living.settings.edit') THEN
    RAISE EXCEPTION 'Not authorized to sync learner categories'
      USING ERRCODE = '42501';
  END IF;

  FOR v_id IN
    SELECT lp.id
    FROM learners_profiles lp
    JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id
    WHERE acc.code = 'hostel'
      AND lp.lifecycle_status = 'active'
      AND (p_institution IS NULL OR lp.institution_id = p_institution)
      AND EXISTS (
        SELECT 1
        FROM billing_student_bills b
        WHERE b.student_id = lp.id
          AND b.fee_source = 'academic'
          AND b.status NOT IN ('cancelled','superseded')
      )
  LOOP
    v_scanned := v_scanned + 1;
    IF public.fn_apply_hostel_fee_categories(v_id) THEN
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('scanned', v_scanned, 'updated', v_updated);
END
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_apply_hostel_fee_categories(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_apply_hostel_fee_categories_bulk(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_apply_hostel_fee_categories_bulk(uuid) TO authenticated;

-- =============================================================================
-- 2026-06-12 — Room booking / upgrade PAY-TO-CONFIRM
-- (migration 20260612200000_room_booking_pay_to_confirm.sql; bodies below are
-- the authoritative latest versions, superseding earlier definitions above)
--
--   * hostel_waitlist.upgrade_bill_id links the pending upgrade-fee bill
--   * _cl_apply_upgrade_fee_bill returns the created bill id
--   * _cl_execute_first_booking — first-allocation executor (RPC + holds path)
--   * _cl_execute_room_upgrade — skips billing when a bill is already linked
--   * fn_self_upgrade_room_category — threshold gate on first bookings too;
--     threshold-met upgrades reserve the bed + bill the fee (pending_payment)
--   * fn_cl_process_upgrade_holds — two-stage confirm engine (threshold → bill
--     → fully paid → move); confirms held first bookings as well
--   * fn_cl_expire_upgrade_holds / fn_self_leave_upgrade_waitlist — cancel the
--     linked unpaid upgrade bill
--   * fn_my_upgrade_waitlist — exposes upgrade_bill_id / fee amount / fee paid
-- =============================================================================
ALTER TABLE public.hostel_waitlist
  ADD COLUMN IF NOT EXISTS upgrade_bill_id uuid
    REFERENCES public.billing_student_bills(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hostel_waitlist.upgrade_bill_id IS
  'Upgrade-fee bill that must be FULLY paid before the held room upgrade confirms. NULL until the academic threshold is met (bill is generated at that point).';

-- 2) _cl_apply_upgrade_fee_bill now returns the created bill id -----------------
-- 20260617180000: accumulate onto an existing upgrade bill instead of a 2nd INSERT
-- that 23505s on uq_bill_dedup_category. Chained upgrades (Deluxe->Premium->+AC)
-- roll up into one bill; balance/status recompute against anything already paid.
CREATE OR REPLACE FUNCTION public._cl_apply_upgrade_fee_bill(
  p_learner_lp uuid, p_hostel_year_id uuid, p_kind text, p_upgrade_amount numeric, p_description text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid; v_ay uuid; v_bcat uuid; v_bill_id uuid;
  v_existing RECORD; v_paid numeric; v_new_final numeric; v_new_balance numeric; v_new_status text;
BEGIN
  IF p_upgrade_amount IS NULL OR p_upgrade_amount <= 0 THEN
    RETURN jsonb_build_object('action','none','new_amount',COALESCE(p_upgrade_amount,0),
                              'billed',0,'bill_id',NULL,'old_bill_id',NULL);
  END IF;
  SELECT institution_id, academic_year_id INTO v_inst, v_ay FROM learners_profiles WHERE id = p_learner_lp;
  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id = v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  v_bcat := public._cl_ensure_upgrade_billing_category(p_kind);

  SELECT id, final_amount, balance_amount, total_amount, bill_description
    INTO v_existing
    FROM billing_student_bills
   WHERE student_id = p_learner_lp AND hostel_year_id = p_hostel_year_id AND item_category_id = v_bcat
     AND fee_source = 'hostel_category' AND status NOT IN ('cancelled','superseded')
   ORDER BY created_at DESC LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    v_paid := COALESCE(v_existing.final_amount,0) - COALESCE(v_existing.balance_amount,0);
    v_new_final := COALESCE(v_existing.final_amount,0) + p_upgrade_amount;
    v_new_balance := v_new_final - v_paid;
    v_new_status := CASE WHEN v_paid <= 0 THEN 'unpaid'
                         WHEN v_paid >= v_new_final THEN 'paid'
                         ELSE 'partially_paid' END;
    UPDATE billing_student_bills
       SET final_amount = v_new_final,
           total_amount = COALESCE(total_amount,0) + p_upgrade_amount,
           unit_amount = v_new_final, quantity = 1,
           balance_amount = v_new_balance, status = v_new_status,
           bill_description = left(
             CASE WHEN COALESCE(v_existing.bill_description,'') = '' THEN p_description
                  ELSE v_existing.bill_description || ' + ' || p_description END, 500),
           updated_at = now()
     WHERE id = v_existing.id;
    RETURN jsonb_build_object('action','accumulated','new_amount',v_new_final,
                              'billed',p_upgrade_amount,'bill_id',v_existing.id,'old_bill_id',v_existing.id);
  END IF;

  INSERT INTO billing_student_bills (
    student_id, institution_id, academic_year_id, item_category_id, hostel_year_id, fee_source,
    bill_description, due_date, quantity, unit_amount, total_amount, final_amount,
    balance_amount, status
  ) VALUES (
    p_learner_lp, v_inst, v_ay, v_bcat, p_hostel_year_id, 'hostel_category',
    p_description, now() + interval '30 day', 1, p_upgrade_amount, p_upgrade_amount,
    p_upgrade_amount, p_upgrade_amount, 'unpaid'
  ) RETURNING id INTO v_bill_id;
  RETURN jsonb_build_object('action','created','new_amount',p_upgrade_amount,
                            'billed',p_upgrade_amount,'bill_id',v_bill_id,'old_bill_id',NULL);
END $function$;

-- 3) First-booking executor (extracted from fn_self_upgrade_room_category so the
--    holds-processor can confirm held FIRST bookings too) -----------------------
CREATE OR REPLACE FUNCTION public._cl_execute_first_booking(
  p_profile uuid, p_lp uuid, p_new_category_id uuid, p_room_id uuid, p_bed_id uuid,
  p_from_hold boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bed_status text; v_inst uuid; v_ay uuid; v_sem uuid; v_tier uuid;
  v_block uuid; v_new_alloc uuid;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
  END IF;
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
  IF p_from_hold THEN
    IF v_bed_status IS DISTINCT FROM 'reserved' THEN
      RAISE EXCEPTION 'Held bed is no longer reserved';
    END IF;
  ELSE
    IF v_bed_status IS DISTINCT FROM 'available' THEN
      RAISE EXCEPTION 'That bed is no longer available';
    END IF;
  END IF;

  SELECT institution_id, semester_id, academic_year_id INTO v_inst, v_sem, v_ay
    FROM learners_profiles WHERE id = p_lp;
  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id=v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year configured'; END IF;
  SELECT block_id INTO v_block FROM hostel_rooms WHERE id = p_room_id;
  SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND is_active
    ORDER BY institution_id NULLS LAST LIMIT 1;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy found'; END IF;

  INSERT INTO hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
    allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by, warden_id
  ) VALUES (
    v_inst, p_profile, v_block, p_room_id, p_bed_id, v_ay, v_sem,
    'fresh', CURRENT_DATE, 'active', '', '', '',
    v_tier, p_profile,
    (SELECT user_id FROM user_block_access WHERE block_id=v_block AND revoked_at IS NULL LIMIT 1)
  ) RETURNING id INTO v_new_alloc;
  UPDATE hostel_beds SET status='occupied', current_occupant_id=p_profile WHERE id = p_bed_id;
  -- learners_profiles.hostel_category_id / mess_category_id set by
  -- trg_allocation_sync_learner_categories. No bill on a first booking.

  UPDATE hostel_waitlist
     SET status='allocated', allocated_allocation_id=v_new_alloc,
         held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = p_profile AND entry_kind='upgrade'
     AND target_hostel_category_id = p_new_category_id AND status='waiting';

  RETURN jsonb_build_object('success', true, 'state', 'booked',
    'new_allocation_id', v_new_alloc, 'new_bed_id', p_bed_id,
    'new_category_id', p_new_category_id);
END $function$;

REVOKE EXECUTE ON FUNCTION public._cl_execute_first_booking(uuid, uuid, uuid, uuid, uuid, boolean) FROM anon, authenticated, PUBLIC;

-- 4) Mover: never double-bill — skip billing when the waitlist row already
--    carries the upgrade bill (pay-to-confirm path bills up front) --------------
CREATE OR REPLACE FUNCTION public._cl_execute_room_upgrade(
  p_profile uuid, p_lp uuid, p_new_category_id uuid, p_room_id uuid, p_bed_id uuid,
  p_from_hold boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_new_name text; v_cur_name text; v_upgrade_fee numeric;
  v_bed_status text; v_old RECORD; v_new_alloc uuid; v_bill jsonb; v_linked_bill uuid;
BEGIN
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM hostel_categories WHERE id = p_new_category_id;

  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = p_lp;
  SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  -- Re-checked here (not only in the public RPC): a hold can be confirmed days
  -- later, after the learner's current category has already changed.
  IF v_new_fee < v_cur_fee THEN RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)'; END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
  END IF;
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
  IF p_from_hold THEN
    IF v_bed_status IS DISTINCT FROM 'reserved' THEN
      RAISE EXCEPTION 'Held bed is no longer reserved';
    END IF;
  ELSE
    IF v_bed_status IS DISTINCT FROM 'available' THEN
      RAISE EXCEPTION 'That bed is no longer available';
    END IF;
  END IF;

  SELECT id, bed_id, tier_id, academic_year_id, semester_id, institution_id, batch_id,
         emergency_contact_name, emergency_contact_phone, emergency_contact_relation
    INTO v_old
    FROM hostel_allocations
    WHERE learner_id = p_profile AND status = 'active'
    ORDER BY allocation_date DESC LIMIT 1;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'No active allocation to upgrade from'; END IF;

  UPDATE hostel_allocations SET status='vacated', actual_vacate_date=CURRENT_DATE, updated_at=now()
    WHERE id = v_old.id;
  UPDATE hostel_beds SET status='available', current_occupant_id=NULL WHERE id = v_old.bed_id;

  INSERT INTO hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
    allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by, batch_id
  )
  SELECT v_old.institution_id, p_profile, r.block_id, p_room_id, p_bed_id,
         v_old.academic_year_id, v_old.semester_id, 'transfer', CURRENT_DATE, 'active',
         v_old.emergency_contact_name, v_old.emergency_contact_phone, v_old.emergency_contact_relation,
         v_old.tier_id, p_profile, v_old.batch_id
  FROM hostel_rooms r WHERE r.id = p_room_id
  RETURNING id INTO v_new_alloc;
  UPDATE hostel_beds SET status='occupied', current_occupant_id=p_profile WHERE id = p_bed_id;

  UPDATE learners_profiles SET hostel_category_id = p_new_category_id, updated_at=now() WHERE id = p_lp;

  -- Pay-to-confirm: the bill was generated when the bed was reserved (or at
  -- threshold-met time by the holds processor). Bill here ONLY when no linked
  -- bill exists (e.g. zero-fee instant path, or legacy callers).
  SELECT upgrade_bill_id INTO v_linked_bill FROM hostel_waitlist
   WHERE learner_id = p_profile AND entry_kind='upgrade'
     AND target_hostel_category_id = p_new_category_id AND status='waiting'
     AND upgrade_bill_id IS NOT NULL
   LIMIT 1;
  IF v_linked_bill IS NULL THEN
    SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
      WHERE hostel_year_id = v_year AND is_active
        AND from_hostel_category_id = v_cur_cat AND to_hostel_category_id = p_new_category_id LIMIT 1;
    v_upgrade_fee := COALESCE(v_upgrade_fee, v_new_fee - v_cur_fee);
    v_bill := public._cl_apply_upgrade_fee_bill(p_lp, v_year, 'hostel', v_upgrade_fee,
                format('Hostel room upgrade: %s → %s', COALESCE(v_cur_name,'—'), v_new_name));
  ELSE
    v_upgrade_fee := NULL;
    v_bill := jsonb_build_object('action','linked','bill_id',v_linked_bill);
  END IF;

  UPDATE hostel_waitlist
     SET status='allocated', allocated_allocation_id=v_new_alloc,
         held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = p_profile AND entry_kind='upgrade'
     AND target_hostel_category_id = p_new_category_id AND status='waiting';

  RETURN jsonb_build_object('success', true, 'state', 'upgraded',
    'old_allocation_id', v_old.id, 'new_allocation_id', v_new_alloc, 'new_bed_id', p_bed_id,
    'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
    'old_fee', v_cur_fee, 'new_fee', v_new_fee, 'upgrade_fee', v_upgrade_fee, 'bill', v_bill);
END $function$;

-- 5) Self-service RPC: threshold gate + pay-to-confirm --------------------------
CREATE OR REPLACE FUNCTION public.fn_self_upgrade_room_category(
  p_new_category_id uuid, p_room_id uuid, p_bed_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_profile uuid := auth.uid();
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_cur_name text; v_new_name text;
  v_gate jsonb; v_hold_days int; v_bed_status text; v_existing uuid;
  v_inst uuid; v_ay uuid; v_expires timestamptz; v_result jsonb; v_has_alloc boolean;
  v_upgrade_fee numeric; v_bill jsonb; v_bill_id uuid; v_meets boolean;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a hostel resident can book or upgrade a room';
  END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM hostel_categories WHERE id = p_new_category_id;

  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  -- Downgrade guard applies only when moving FROM a real current category.
  IF v_cur_cat IS NOT NULL AND v_new_fee < v_cur_fee THEN
    RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)';
  END IF;

  v_has_alloc := EXISTS (SELECT 1 FROM hostel_allocations WHERE learner_id = v_profile AND status = 'active');

  -- Gate: upgrades disabled for the resident's current room category. First-booking
  -- (no active allocation) is exempt — that path is initial room selection, not an upgrade.
  IF v_has_alloc AND NOT COALESCE((SELECT upgrades_enabled FROM hostel_categories WHERE id = v_cur_cat), false) THEN
    RAISE EXCEPTION 'Room upgrades are currently disabled for your category';
  END IF;

  -- Room-level flow: auto-assign the lowest-numbered available bed
  IF p_bed_id IS NULL THEN
    SELECT o.bed_id INTO p_bed_id
    FROM fn_my_room_options(p_new_category_id) o
    WHERE o.room_id = p_room_id
    ORDER BY o.bed_number LIMIT 1;
    IF p_bed_id IS NULL THEN
      RAISE EXCEPTION 'No available bed left in that room. Pick another room.';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fn_my_room_options(p_new_category_id) o
    WHERE o.bed_id = p_bed_id AND o.room_id = p_room_id
  ) THEN
    RAISE EXCEPTION 'That room/bed is not an available option for you';
  END IF;

  v_gate := public._cl_upgrade_threshold_check(v_lp, p_new_category_id);
  v_meets := (v_gate->>'meets')::boolean;

  -- ── FIRST BOOKING: threshold met → instant; below → bed hold + waitlist ──────
  IF NOT v_has_alloc AND v_meets THEN
    v_result := public._cl_execute_first_booking(v_profile, v_lp, p_new_category_id, p_room_id, p_bed_id, false);
    RETURN v_result || jsonb_build_object('new_fee', v_new_fee,
      'threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct');
  END IF;

  -- ── UPGRADE, threshold met, nothing to pay → instant move ────────────────────
  IF v_has_alloc THEN
    SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
      WHERE hostel_year_id = v_year AND is_active
        AND from_hostel_category_id = v_cur_cat AND to_hostel_category_id = p_new_category_id LIMIT 1;
    v_upgrade_fee := COALESCE(v_upgrade_fee, v_new_fee - v_cur_fee);
    IF v_meets AND COALESCE(v_upgrade_fee, 0) <= 0 THEN
      v_result := public._cl_execute_room_upgrade(v_profile, v_lp, p_new_category_id, p_room_id, p_bed_id, false);
      RETURN v_result || jsonb_build_object('threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct');
    END IF;
  END IF;

  -- ── HOLD: reserve the bed and wait (for threshold and/or upgrade-fee payment)
  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
  END IF;
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
  IF v_bed_status IS DISTINCT FROM 'available' THEN RAISE EXCEPTION 'That bed is no longer available'; END IF;

  -- One upgrade intent per learner: release every held bed, decline waiting
  -- entries for OTHER target categories, and cancel their unpaid linked bills
  -- (bills with any receipt are left for office follow-up).
  UPDATE hostel_beds b SET status='available'
    FROM hostel_waitlist w
   WHERE w.learner_id = v_profile AND w.entry_kind='upgrade' AND w.status='waiting'
     AND w.held_bed_id = b.id AND b.status='reserved';
  UPDATE billing_student_bills bb SET status='cancelled', updated_at=now()
    FROM hostel_waitlist w
   WHERE w.learner_id = v_profile AND w.entry_kind='upgrade' AND w.status='waiting'
     AND w.target_hostel_category_id <> p_new_category_id
     AND w.upgrade_bill_id = bb.id AND bb.status='unpaid'
     AND NOT EXISTS (SELECT 1 FROM billing_receipt_items ri WHERE ri.bill_id = bb.id);
  UPDATE hostel_waitlist
     SET status='declined', held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting'
     AND target_hostel_category_id <> p_new_category_id;
  UPDATE hostel_waitlist
     SET held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting'
     AND target_hostel_category_id = p_new_category_id AND held_bed_id IS NOT NULL;

  UPDATE hostel_beds SET status='reserved' WHERE id = p_bed_id;

  SELECT upgrade_hold_days INTO v_hold_days FROM hostel_categories WHERE id = p_new_category_id;
  v_expires := now() + make_interval(days => COALESCE(v_hold_days, 5));

  SELECT institution_id, academic_year_id INTO v_inst, v_ay FROM learners_profiles WHERE id = v_lp;
  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id=v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year configured'; END IF;

  SELECT id INTO v_existing FROM hostel_waitlist
    WHERE learner_id = v_profile AND entry_kind='upgrade'
      AND target_hostel_category_id = p_new_category_id AND status='waiting' LIMIT 1;
  IF v_existing IS NOT NULL THEN
    UPDATE hostel_waitlist
       SET held_room_id=p_room_id, held_bed_id=p_bed_id, hold_expires_at=v_expires, updated_at=now()
     WHERE id = v_existing;
  ELSE
    INSERT INTO hostel_waitlist (
      institution_id, learner_id, academic_year_id, status, entry_kind,
      target_hostel_category_id, held_room_id, held_bed_id, hold_expires_at
    ) VALUES (
      v_inst, v_profile, v_ay, 'waiting', 'upgrade',
      p_new_category_id, p_room_id, p_bed_id, v_expires
    ) RETURNING id INTO v_existing;
  END IF;

  -- ── UPGRADE + threshold met: bill the upgrade fee NOW; confirm on full payment
  IF v_has_alloc AND v_meets THEN
    SELECT upgrade_bill_id INTO v_bill_id FROM hostel_waitlist WHERE id = v_existing;
    IF v_bill_id IS NULL THEN
      v_bill := public._cl_apply_upgrade_fee_bill(v_lp, v_year, 'hostel', v_upgrade_fee,
                  format('Hostel room upgrade: %s → %s', COALESCE(v_cur_name,'—'), v_new_name));
      v_bill_id := (v_bill->>'bill_id')::uuid;
      UPDATE hostel_waitlist SET upgrade_bill_id = v_bill_id, updated_at=now() WHERE id = v_existing;
    END IF;
    RETURN jsonb_build_object('success', true, 'state', 'pending_payment',
      'waitlist_id', v_existing, 'upgrade_bill_id', v_bill_id, 'upgrade_fee', v_upgrade_fee,
      'threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct',
      'hold_expires_at', v_expires, 'held_room_id', p_room_id, 'held_bed_id', p_bed_id,
      'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
      'old_fee', v_cur_fee, 'new_fee', v_new_fee);
  END IF;

  -- ── Below threshold (first booking or upgrade): plain waitlist hold ──────────
  RETURN jsonb_build_object('success', true, 'state', 'waitlisted',
    'waitlist_id', v_existing,
    'threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct',
    'total_billed', v_gate->'total_billed', 'total_paid', v_gate->'total_paid',
    'hold_expires_at', v_expires, 'held_room_id', p_room_id, 'held_bed_id', p_bed_id,
    'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
    'old_fee', v_cur_fee, 'new_fee', v_new_fee, 'upgrade_fee', v_upgrade_fee);
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_self_upgrade_room_category(uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_self_upgrade_room_category(uuid, uuid, uuid) TO authenticated;

-- 6) Holds processor: two-stage confirm engine (runs on every receipt item) ------
CREATE OR REPLACE FUNCTION public.fn_cl_process_upgrade_holds(p_student_lp uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile uuid; v_row RECORD; v_gate jsonb; v_count int := 0;
  v_has_alloc boolean; v_year uuid; v_cur_cat uuid; v_cur_fee numeric;
  v_new_fee numeric; v_cur_name text; v_new_name text;
  v_upgrade_fee numeric; v_bill jsonb; v_bill_id uuid;
  v_bill_amount numeric; v_bill_paid numeric; v_bill_status text;
BEGIN
  -- Bridge: waitlist/allocations key on profiles.id; billing keys on learners_profiles.id
  SELECT id INTO v_profile FROM profiles WHERE learner_id = p_student_lp;
  IF v_profile IS NULL THEN RETURN 0; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;

  FOR v_row IN
    SELECT id, target_hostel_category_id, held_room_id, held_bed_id, upgrade_bill_id
    FROM hostel_waitlist
    WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting'
      AND held_bed_id IS NOT NULL AND hold_expires_at > now()
    ORDER BY created_at
  LOOP
    BEGIN
      v_gate := public._cl_upgrade_threshold_check(p_student_lp, v_row.target_hostel_category_id);
      IF NOT (v_gate->>'meets')::boolean THEN CONTINUE; END IF;

      v_has_alloc := EXISTS (SELECT 1 FROM hostel_allocations WHERE learner_id = v_profile AND status='active');

      -- Held FIRST booking: confirms as soon as the academic threshold is met.
      IF NOT v_has_alloc THEN
        PERFORM public._cl_execute_first_booking(
          v_profile, p_student_lp, v_row.target_hostel_category_id,
          v_row.held_room_id, v_row.held_bed_id, true);
        v_count := v_count + 1;
        CONTINUE;
      END IF;

      -- Held UPGRADE, stage 1: threshold just met but no upgrade bill yet —
      -- generate (and link) it; confirmation waits for it to be fully paid.
      v_bill_id := v_row.upgrade_bill_id;
      IF v_bill_id IS NOT NULL THEN
        SELECT final_amount, status INTO v_bill_amount, v_bill_status
          FROM billing_student_bills WHERE id = v_bill_id;
        IF v_bill_amount IS NULL OR v_bill_status IN ('cancelled','superseded') THEN
          v_bill_id := NULL;  -- bill vanished/cancelled externally → re-bill
        END IF;
      END IF;
      IF v_bill_id IS NULL THEN
        SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = p_student_lp;
        SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
          WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
        SELECT amount INTO v_new_fee FROM hostel_fees
          WHERE hostel_category_id = v_row.target_hostel_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
        SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
          WHERE hostel_year_id = v_year AND is_active
            AND from_hostel_category_id = v_cur_cat AND to_hostel_category_id = v_row.target_hostel_category_id LIMIT 1;
        v_upgrade_fee := COALESCE(v_upgrade_fee, COALESCE(v_new_fee,0) - COALESCE(v_cur_fee,0));

        IF COALESCE(v_upgrade_fee, 0) <= 0 THEN
          -- Nothing to pay → confirm straight away.
          PERFORM public._cl_execute_room_upgrade(
            v_profile, p_student_lp, v_row.target_hostel_category_id,
            v_row.held_room_id, v_row.held_bed_id, true);
          v_count := v_count + 1;
          CONTINUE;
        END IF;

        SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
        SELECT name INTO v_new_name FROM hostel_categories WHERE id = v_row.target_hostel_category_id;
        v_bill := public._cl_apply_upgrade_fee_bill(p_student_lp, v_year, 'hostel', v_upgrade_fee,
                    format('Hostel room upgrade: %s → %s', COALESCE(v_cur_name,'—'), v_new_name));
        UPDATE hostel_waitlist SET upgrade_bill_id = (v_bill->>'bill_id')::uuid, updated_at=now()
         WHERE id = v_row.id;
        CONTINUE;  -- stage 2 happens when this bill's payments arrive
      END IF;

      -- Held UPGRADE, stage 2: confirm only when the upgrade bill is FULLY paid.
      SELECT COALESCE(SUM(ri.amount_paid),0) INTO v_bill_paid
        FROM billing_receipt_items ri WHERE ri.bill_id = v_bill_id;
      IF v_bill_paid >= v_bill_amount THEN
        PERFORM public._cl_execute_room_upgrade(
          v_profile, p_student_lp, v_row.target_hostel_category_id,
          v_row.held_room_id, v_row.held_bed_id, true);
        v_count := v_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Leave the hold in place; expiry will clean it up if it never resolves.
      RAISE WARNING 'fn_cl_process_upgrade_holds: % (waitlist %)', SQLERRM, v_row.id;
    END;
  END LOOP;
  RETURN v_count;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_process_upgrade_holds(uuid) FROM anon, authenticated, PUBLIC;

-- 7) Hold expiry: also cancel the linked unpaid upgrade bill ---------------------
CREATE OR REPLACE FUNCTION public.fn_cl_expire_upgrade_holds()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  -- held_room_id/held_bed_id are kept on expired rows as an audit trail;
  -- the status transition itself is the idempotency stamp.
  WITH expired AS (
    UPDATE hostel_waitlist
       SET status='expired', updated_at=now()
     WHERE entry_kind='upgrade' AND status='waiting'
       AND held_bed_id IS NOT NULL AND hold_expires_at < now()
     RETURNING held_bed_id, upgrade_bill_id
  ), released AS (
    UPDATE hostel_beds b SET status='available'
    FROM expired e
    WHERE b.id = e.held_bed_id AND b.status='reserved'
    RETURNING b.id
  ), bills_cancelled AS (
    -- Unpaid + zero receipts only; partially paid bills are left for office
    -- follow-up (money was collected against them).
    UPDATE billing_student_bills bb
       SET status='cancelled', updated_at=now()
    FROM expired e
    WHERE bb.id = e.upgrade_bill_id AND bb.status='unpaid'
      AND NOT EXISTS (SELECT 1 FROM billing_receipt_items ri WHERE ri.bill_id = bb.id)
    RETURNING bb.id
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN COALESCE(v_count, 0);
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_expire_upgrade_holds() FROM anon, authenticated, PUBLIC;

-- 8) Leaving the waitlist cancels the linked unpaid bill + releases the bed ------
-- 20260617160000: revert the optimistic category flip on learner cancel (parity
-- with fn_cl_admin_cancel_upgrade) so My Hostel + admin views converge.
CREATE OR REPLACE FUNCTION public.fn_self_leave_upgrade_waitlist(p_target_category_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_lp uuid := get_my_learner_id(); v_from uuid; v_found boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT from_hostel_category_id INTO v_from
    FROM hostel_waitlist
   WHERE learner_id = auth.uid() AND entry_kind='upgrade'
     AND target_hostel_category_id = p_target_category_id AND status='waiting'
     AND from_hostel_category_id IS NOT NULL
   ORDER BY updated_at DESC LIMIT 1;
  UPDATE hostel_beds b SET status='available'
    FROM hostel_waitlist w
   WHERE w.learner_id = auth.uid() AND w.entry_kind='upgrade'
     AND w.target_hostel_category_id = p_target_category_id AND w.status='waiting'
     AND w.held_bed_id = b.id AND b.status='reserved';
  UPDATE billing_student_bills bb SET status='cancelled', updated_at=now()
    FROM hostel_waitlist w
   WHERE w.learner_id = auth.uid() AND w.entry_kind='upgrade'
     AND w.target_hostel_category_id = p_target_category_id AND w.status='waiting'
     AND w.upgrade_bill_id = bb.id AND bb.status='unpaid'
     AND NOT EXISTS (SELECT 1 FROM billing_receipt_items ri WHERE ri.bill_id = bb.id);
  UPDATE hostel_waitlist
     SET status='declined', held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = auth.uid()
     AND entry_kind = 'upgrade'
     AND target_hostel_category_id = p_target_category_id
     AND status = 'waiting';
  v_found := FOUND;
  IF v_lp IS NOT NULL THEN
    IF v_from IS NOT NULL THEN
      UPDATE learners_profiles
         SET hostel_category_id = v_from, pending_hostel_category_id = NULL, updated_at=now()
       WHERE id = v_lp AND hostel_category_id = p_target_category_id;
    ELSE
      UPDATE learners_profiles SET pending_hostel_category_id = NULL, updated_at=now()
       WHERE id = v_lp AND pending_hostel_category_id = p_target_category_id;
    END IF;
  END IF;
  RETURN v_found;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_self_leave_upgrade_waitlist(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_self_leave_upgrade_waitlist(uuid) TO authenticated;

-- 9) Waitlist list RPC exposes the pending upgrade bill (new OUT cols → DROP) ----
DROP FUNCTION IF EXISTS public.fn_my_upgrade_waitlist();
CREATE FUNCTION public.fn_my_upgrade_waitlist()
RETURNS TABLE(
  waitlist_id uuid, target_category_id uuid, target_category_name text,
  status text, created_at timestamptz,
  held_room_id uuid, held_room_number text, held_block_name text, held_bed_number text,
  hold_expires_at timestamptz, threshold_pct numeric, paid_pct numeric,
  upgrade_bill_id uuid, upgrade_fee_amount numeric, upgrade_fee_paid numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT w.id, w.target_hostel_category_id, c.name, w.status::text, w.created_at,
         w.held_room_id, r.room_number, bl.name, b.bed_number,
         w.hold_expires_at, c.upgrade_threshold_pct,
         (SELECT pp.paid_pct FROM fn_learner_academic_payment_progress(get_my_learner_id()) pp),
         w.upgrade_bill_id,
         bill.final_amount,
         (SELECT COALESCE(SUM(ri.amount_paid),0) FROM billing_receipt_items ri WHERE ri.bill_id = w.upgrade_bill_id)
  FROM hostel_waitlist w
  LEFT JOIN hostel_categories c ON c.id = w.target_hostel_category_id
  LEFT JOIN hostel_rooms r ON r.id = w.held_room_id
  LEFT JOIN hostel_blocks bl ON bl.id = r.block_id
  LEFT JOIN hostel_beds b ON b.id = w.held_bed_id
  LEFT JOIN billing_student_bills bill ON bill.id = w.upgrade_bill_id
  WHERE w.learner_id = auth.uid()
    AND w.entry_kind = 'upgrade'
    AND w.status IN ('waiting','offered')
  ORDER BY w.created_at DESC;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_my_upgrade_waitlist() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_my_upgrade_waitlist() TO authenticated;

-- =============================================================================
-- 2026-06-12 — Preview (dry-run) for the fee-condition category sync
-- (migration 20260612220000_preview_hostel_fee_category_sync.sql)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_preview_hostel_fee_categories(p_institution uuid DEFAULT NULL)
RETURNS TABLE(
  learner_id uuid,
  learner_name text,
  roll_number text,
  institution_name text,
  program_name text,
  quota_name text,
  gender text,
  current_year_fee numeric,
  has_academic_bill boolean,
  is_allocated boolean,
  reason text,
  current_room text,
  new_room text,
  current_mess text,
  new_mess text,
  will_change boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_gender_type text; v_fee numeric; v_has_bill boolean; v_allocated boolean;
  v_room uuid; v_mess uuid; v_new_room uuid; v_new_mess uuid; v_reason text;
BEGIN
  -- Same gate as the bulk sync RPC.
  IF auth.uid() IS NOT NULL
     AND NOT user_has_permission('campus_living.settings.edit') THEN
    RAISE EXCEPTION 'Not authorized to preview learner category sync'
      USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT lp.id AS lid,
           NULLIF(trim(concat_ws(' ', lp.first_name, lp.last_name)), '') AS lname,
           lp.roll_number AS lroll, lp.gender AS lgender,
           lp.hostel_category_id AS cur_room_id, lp.mess_category_id AS cur_mess_id,
           i.name AS inst_name, p.program_name AS prog_name, q.name AS q_name
    FROM learners_profiles lp
    JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id AND acc.code = 'hostel'
    LEFT JOIN institutions i ON i.id = lp.institution_id
    LEFT JOIN programs p ON p.id = lp.program_id
    LEFT JOIN quotas q ON q.id = lp.quota_id
    WHERE lp.lifecycle_status = 'active'
      AND (p_institution IS NULL OR lp.institution_id = p_institution)
    ORDER BY i.name, p.program_name, lname
  LOOP
    v_gender_type := CASE WHEN lower(r.lgender) LIKE 'm%' THEN 'boys'
                          WHEN lower(r.lgender) LIKE 'f%' THEN 'girls' ELSE NULL END;
    v_has_bill := EXISTS (
      SELECT 1 FROM billing_student_bills b
      WHERE b.student_id = r.lid AND b.fee_source = 'academic'
        AND b.status NOT IN ('cancelled','superseded'));
    v_fee := fn_learner_current_year_academic_fee(r.lid);
    v_allocated := EXISTS (
      SELECT 1 FROM hostel_allocations ha
      JOIN profiles pr ON pr.id = ha.learner_id
      WHERE pr.learner_id = r.lid AND ha.status = 'active');

    v_room := NULL; v_mess := NULL;

    IF v_has_bill THEN
      -- Band match + gender-name translation (mirrors fn_apply mig 20260612170000).
      SELECT gv.id INTO v_room
      FROM fn_hostel_learner_room_categories(r.lid) rr
      JOIN hostel_categories bc ON bc.id = rr.category_id
      JOIN hostel_categories gv ON gv.name = bc.name
                               AND gv.type = v_gender_type AND gv.is_active
      LIMIT 1;

      SELECT gv.id INTO v_mess
      FROM fn_hostel_learner_mess_categories(r.lid) mm
      JOIN mess_categories bc ON bc.id = mm.category_id
      JOIN mess_categories gv ON gv.name = bc.name
                             AND gv.type = v_gender_type AND gv.is_active
      LIMIT 1;

      IF v_room IS NOT NULL OR v_mess IS NOT NULL THEN
        v_reason := 'band_match';
      ELSIF v_fee IS NULL THEN
        v_reason := 'classic_default_fee_unknown';
      ELSE
        v_reason := 'classic_default_no_band';
      END IF;

      IF v_room IS NULL AND v_gender_type IS NOT NULL THEN
        SELECT hc.id INTO v_room FROM hostel_categories hc
        WHERE hc.name = 'Classic Room' AND hc.type = v_gender_type AND hc.is_active
        ORDER BY hc.sort_order LIMIT 1;
      END IF;
      IF v_mess IS NULL AND v_gender_type IS NOT NULL THEN
        SELECT mc.id INTO v_mess FROM mess_categories mc
        WHERE mc.name = 'Classic' AND mc.type = v_gender_type AND mc.is_active
        ORDER BY mc.sort_order LIMIT 1;
      END IF;
    ELSE
      v_reason := 'no_academic_bill';
    END IF;

    -- Apply rules: allocation-wins (room) + overwrite-never-wipe.
    v_new_room := CASE WHEN v_allocated THEN r.cur_room_id
                       ELSE COALESCE(v_room, r.cur_room_id) END;
    v_new_mess := COALESCE(v_mess, r.cur_mess_id);

    learner_id        := r.lid;
    learner_name      := r.lname;
    roll_number       := r.lroll;
    institution_name  := r.inst_name;
    program_name      := r.prog_name;
    quota_name        := r.q_name;
    gender            := r.lgender;
    current_year_fee  := v_fee;
    has_academic_bill := v_has_bill;
    is_allocated      := v_allocated;
    reason            := v_reason;
    current_room      := (SELECT hc.name FROM hostel_categories hc WHERE hc.id = r.cur_room_id);
    new_room          := (SELECT hc.name FROM hostel_categories hc WHERE hc.id = v_new_room);
    current_mess      := (SELECT mc.name FROM mess_categories mc WHERE mc.id = r.cur_mess_id);
    new_mess          := (SELECT mc.name FROM mess_categories mc WHERE mc.id = v_new_mess);
    will_change       := (v_new_room IS DISTINCT FROM r.cur_room_id)
                      OR (v_new_mess IS DISTINCT FROM r.cur_mess_id);
    RETURN NEXT;
  END LOOP;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_preview_hostel_fee_categories(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_preview_hostel_fee_categories(uuid) TO authenticated;

-- =============================================================================
-- 2026-06-12 — preview gains semester_name (filterable preview dialog)
-- (migration 20260612230000_preview_sync_semester_column.sql; supersedes the
-- fn_preview_hostel_fee_categories definition above)
-- =============================================================================
DROP FUNCTION IF EXISTS public.fn_preview_hostel_fee_categories(uuid);
CREATE FUNCTION public.fn_preview_hostel_fee_categories(p_institution uuid DEFAULT NULL)
RETURNS TABLE(
  learner_id uuid,
  learner_name text,
  roll_number text,
  institution_name text,
  program_name text,
  semester_name text,
  quota_name text,
  gender text,
  current_year_fee numeric,
  has_academic_bill boolean,
  is_allocated boolean,
  reason text,
  current_room text,
  new_room text,
  current_mess text,
  new_mess text,
  will_change boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_gender_type text; v_fee numeric; v_has_bill boolean; v_allocated boolean;
  v_room uuid; v_mess uuid; v_new_room uuid; v_new_mess uuid; v_reason text;
BEGIN
  -- Same gate as the bulk sync RPC.
  IF auth.uid() IS NOT NULL
     AND NOT user_has_permission('campus_living.settings.edit') THEN
    RAISE EXCEPTION 'Not authorized to preview learner category sync'
      USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT lp.id AS lid,
           NULLIF(trim(concat_ws(' ', lp.first_name, lp.last_name)), '') AS lname,
           lp.roll_number AS lroll, lp.gender AS lgender,
           lp.hostel_category_id AS cur_room_id, lp.mess_category_id AS cur_mess_id,
           i.name AS inst_name, p.program_name AS prog_name,
           s.semester_name AS sem_name, q.name AS q_name
    FROM learners_profiles lp
    JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id AND acc.code = 'hostel'
    LEFT JOIN institutions i ON i.id = lp.institution_id
    LEFT JOIN programs p ON p.id = lp.program_id
    LEFT JOIN semesters s ON s.id = lp.semester_id
    LEFT JOIN quotas q ON q.id = lp.quota_id
    WHERE lp.lifecycle_status = 'active'
      AND (p_institution IS NULL OR lp.institution_id = p_institution)
    ORDER BY i.name, p.program_name, lname
  LOOP
    v_gender_type := CASE WHEN lower(r.lgender) LIKE 'm%' THEN 'boys'
                          WHEN lower(r.lgender) LIKE 'f%' THEN 'girls' ELSE NULL END;
    v_has_bill := EXISTS (
      SELECT 1 FROM billing_student_bills b
      WHERE b.student_id = r.lid AND b.fee_source = 'academic'
        AND b.status NOT IN ('cancelled','superseded'));
    v_fee := fn_learner_current_year_academic_fee(r.lid);
    v_allocated := EXISTS (
      SELECT 1 FROM hostel_allocations ha
      JOIN profiles pr ON pr.id = ha.learner_id
      WHERE pr.learner_id = r.lid AND ha.status = 'active');

    v_room := NULL; v_mess := NULL;

    IF v_has_bill THEN
      -- Band match + gender-name translation (mirrors fn_apply mig 20260612170000).
      SELECT gv.id INTO v_room
      FROM fn_hostel_learner_room_categories(r.lid) rr
      JOIN hostel_categories bc ON bc.id = rr.category_id
      JOIN hostel_categories gv ON gv.name = bc.name
                               AND gv.type = v_gender_type AND gv.is_active
      LIMIT 1;

      SELECT gv.id INTO v_mess
      FROM fn_hostel_learner_mess_categories(r.lid) mm
      JOIN mess_categories bc ON bc.id = mm.category_id
      JOIN mess_categories gv ON gv.name = bc.name
                             AND gv.type = v_gender_type AND gv.is_active
      LIMIT 1;

      IF v_room IS NOT NULL OR v_mess IS NOT NULL THEN
        v_reason := 'band_match';
      ELSIF v_fee IS NULL THEN
        v_reason := 'classic_default_fee_unknown';
      ELSE
        v_reason := 'classic_default_no_band';
      END IF;

      IF v_room IS NULL AND v_gender_type IS NOT NULL THEN
        SELECT hc.id INTO v_room FROM hostel_categories hc
        WHERE hc.name = 'Classic Room' AND hc.type = v_gender_type AND hc.is_active
        ORDER BY hc.sort_order LIMIT 1;
      END IF;
      IF v_mess IS NULL AND v_gender_type IS NOT NULL THEN
        SELECT mc.id INTO v_mess FROM mess_categories mc
        WHERE mc.name = 'Classic' AND mc.type = v_gender_type AND mc.is_active
        ORDER BY mc.sort_order LIMIT 1;
      END IF;
    ELSE
      v_reason := 'no_academic_bill';
    END IF;

    -- Apply rules: allocation-wins (room) + overwrite-never-wipe.
    v_new_room := CASE WHEN v_allocated THEN r.cur_room_id
                       ELSE COALESCE(v_room, r.cur_room_id) END;
    v_new_mess := COALESCE(v_mess, r.cur_mess_id);

    learner_id        := r.lid;
    learner_name      := r.lname;
    roll_number       := r.lroll;
    institution_name  := r.inst_name;
    program_name      := r.prog_name;
    semester_name     := r.sem_name;
    quota_name        := r.q_name;
    gender            := r.lgender;
    current_year_fee  := v_fee;
    has_academic_bill := v_has_bill;
    is_allocated      := v_allocated;
    reason            := v_reason;
    current_room      := (SELECT hc.name FROM hostel_categories hc WHERE hc.id = r.cur_room_id);
    new_room          := (SELECT hc.name FROM hostel_categories hc WHERE hc.id = v_new_room);
    current_mess      := (SELECT mc.name FROM mess_categories mc WHERE mc.id = r.cur_mess_id);
    new_mess          := (SELECT mc.name FROM mess_categories mc WHERE mc.id = v_new_mess);
    will_change       := (v_new_room IS DISTINCT FROM r.cur_room_id)
                      OR (v_new_mess IS DISTINCT FROM r.cur_mess_id);
    RETURN NEXT;
  END LOOP;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_preview_hostel_fee_categories(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_preview_hostel_fee_categories(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- fn_cl_admin_transfer_allocation — admin manual room/bed transfer.
-- Mirrored from migration 20260617200000_admin_transfer_allocation_rpc.sql.
-- Moves an active allocation to a new room/bed/block AND maintains the bed
-- inventory invariant (old bed freed, new bed occupied). Gated on
-- campus_living.upgrades.manage (super-admin + the 5 hostel-admin roles); the
-- catalog .transfer/.edit keys are mass-granted to every role so are not used.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cl_admin_transfer_allocation(
  p_allocation_id uuid,
  p_room_id uuid,
  p_bed_id uuid,
  p_block_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_alloc      hostel_allocations%ROWTYPE;
  v_bed        hostel_beds%ROWTYPE;
  v_room       hostel_rooms%ROWTYPE;
  v_old_bed    uuid;
  v_learner    uuid;
  v_block_id   uuid;
  v_mapped     boolean;
  v_accessible boolean;
BEGIN
  IF NOT user_has_permission('campus_living.upgrades.manage') THEN
    RAISE EXCEPTION 'Not authorized to transfer hostel allocations'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_alloc FROM hostel_allocations WHERE id = p_allocation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation % not found', p_allocation_id USING ERRCODE = 'P0002';
  END IF;
  IF v_alloc.status <> 'active' OR v_alloc.check_out_date IS NOT NULL THEN
    RAISE EXCEPTION 'Only an active allocation can be transferred (current status: %)', v_alloc.status
      USING ERRCODE = 'P0001';
  END IF;

  v_old_bed := v_alloc.bed_id;
  v_learner := v_alloc.learner_id;

  SELECT * INTO v_room FROM hostel_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room % not found', p_room_id USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_bed FROM hostel_beds WHERE id = p_bed_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bed % not found', p_bed_id USING ERRCODE = 'P0002';
  END IF;
  IF v_bed.room_id <> p_room_id THEN
    RAISE EXCEPTION 'Bed does not belong to the selected room' USING ERRCODE = 'P0001';
  END IF;

  v_block_id := COALESCE(p_block_id, v_room.block_id);

  SELECT EXISTS (SELECT 1 FROM hostel_block_institutions WHERE block_id = v_block_id)
    INTO v_mapped;
  IF v_mapped THEN
    SELECT EXISTS (
      SELECT 1 FROM hostel_block_institutions hbi
      WHERE hbi.block_id = v_block_id
        AND hbi.institution_id IN (
          SELECT institution_id FROM get_user_accessible_institutions(auth.uid())
        )
    ) INTO v_accessible;
    IF NOT v_accessible THEN
      RAISE EXCEPTION 'No access to the target block''s institution'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_bed_id <> COALESCE(v_old_bed, '00000000-0000-0000-0000-000000000000'::uuid)
     AND EXISTS (
       SELECT 1 FROM hostel_allocations a
       WHERE a.bed_id = p_bed_id
         AND a.status = 'active'
         AND a.check_out_date IS NULL
     ) THEN
    RAISE EXCEPTION 'The selected bed is already occupied' USING ERRCODE = '23505';
  END IF;

  UPDATE hostel_allocations
     SET room_id         = p_room_id,
         bed_id          = p_bed_id,
         block_id        = v_block_id,
         allocation_type = 'transfer',
         updated_at      = now()
   WHERE id = p_allocation_id;

  IF v_old_bed IS NOT NULL AND v_old_bed <> p_bed_id THEN
    UPDATE hostel_beds
       SET status = 'available', current_occupant_id = NULL, updated_at = now()
     WHERE id = v_old_bed;
  END IF;
  UPDATE hostel_beds
     SET status = 'occupied', current_occupant_id = v_learner, updated_at = now()
   WHERE id = p_bed_id;

  RETURN jsonb_build_object(
    'success',       true,
    'allocation_id', p_allocation_id,
    'room_id',       p_room_id,
    'bed_id',        p_bed_id,
    'block_id',      v_block_id,
    'freed_bed_id',  CASE WHEN v_old_bed IS DISTINCT FROM p_bed_id THEN v_old_bed END
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_admin_transfer_allocation(uuid, uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cl_admin_transfer_allocation(uuid, uuid, uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- fn_cl_transfer_room_options — category-wise room/bed availability for the
-- admin transfer modal. Mirrored from migration
-- 20260617210000_transfer_room_options_rpc.sql.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cl_transfer_room_options(p_block_id uuid)
RETURNS TABLE (
  room_id       uuid,
  room_number   text,
  room_type     text,
  floor         integer,
  category_id   uuid,
  category_name text,
  category_type text,
  total_beds    bigint,
  free_beds     bigint,
  occupied_beds bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT
    r.id,
    r.room_number,
    r.room_type::text,
    r.floor,
    r.category_id,
    c.name,
    c.type,
    count(b.id)                                          AS total_beds,
    count(b.id) FILTER (WHERE b.status = 'available')    AS free_beds,
    count(b.id) FILTER (WHERE b.status = 'occupied')     AS occupied_beds
  FROM hostel_rooms r
  LEFT JOIN hostel_categories c ON c.id = r.category_id
  LEFT JOIN hostel_beds b ON b.room_id = r.id
  WHERE r.block_id = p_block_id
    AND user_has_permission('campus_living.upgrades.manage')
  GROUP BY r.id, r.room_number, r.room_type, r.floor, r.category_id, c.name, c.type
  ORDER BY c.name NULLS LAST, r.room_number;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_transfer_room_options(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cl_transfer_room_options(uuid) TO authenticated;

-- fn_cl_room_bed_occupancy: per-bed occupancy with occupant name/roll
-- Derives occupancy from active + pending_approval allocations (not cached hostel_beds.status)
-- Gated: super_admin OR campus_living.upgrades.manage
CREATE OR REPLACE FUNCTION public.fn_cl_room_bed_occupancy(p_room_id uuid)
RETURNS TABLE(bed_id uuid, bed_number text, is_occupied boolean,
              occupant_profile_id uuid, occupant_name text, occupant_roll text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (is_super_admin() OR user_has_permission('campus_living.upgrades.manage')) THEN
    RAISE EXCEPTION 'Not authorized to view room occupancy' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT b.id,
         b.bed_number::text,
         (a.id IS NOT NULL) AS is_occupied,
         a.learner_id AS occupant_profile_id,
         NULLIF(btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')), '') AS occupant_name,
         lp.roll_number AS occupant_roll
  FROM hostel_beds b
  LEFT JOIN hostel_allocations a
         ON a.bed_id = b.id AND a.status IN ('active','pending_approval') AND a.check_out_date IS NULL
  LEFT JOIN profiles p ON p.id = a.learner_id
  LEFT JOIN learners_profiles lp ON lp.id = p.learner_id
  WHERE b.room_id = p_room_id
  ORDER BY b.bed_number;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_room_bed_occupancy(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.fn_cl_room_bed_occupancy(uuid) TO authenticated;

-- fn_cl_admin_allocate_bed: atomic fresh allocation + bed occupy (mig 20260618100200)
-- Gated: super_admin OR campus_living.upgrades.manage
-- Returns: { success, allocation_id, room_id, bed_id, block_id }
CREATE OR REPLACE FUNCTION public.fn_cl_admin_allocate_bed(
  p_learner_profile_id uuid,
  p_room_id uuid,
  p_bed_id uuid,
  p_mess_category_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_room       hostel_rooms%ROWTYPE;
  v_bed        hostel_beds%ROWTYPE;
  v_profile    uuid;
  v_inst       uuid;
  v_sem        uuid;
  v_ay         uuid;
  v_tier       uuid;
  v_block      uuid;
  v_mapped     boolean;
  v_accessible boolean;
  v_alloc_id   uuid;
BEGIN
  IF NOT (is_super_admin() OR user_has_permission('campus_living.upgrades.manage')) THEN
    RAISE EXCEPTION 'Not authorized to allocate hostel rooms' USING ERRCODE = '42501';
  END IF;

  -- learners_profiles → institution / semester / academic year (mirror auto-allocate fallback)
  SELECT lp.institution_id, lp.semester_id,
         COALESCE(lp.academic_year_id,
           (SELECT id FROM academic_years
             WHERE institution_id = lp.institution_id AND is_active
             ORDER BY start_date DESC LIMIT 1))
    INTO v_inst, v_sem, v_ay
  FROM learners_profiles lp WHERE lp.id = p_learner_profile_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'Learner % not found', p_learner_profile_id USING ERRCODE = 'P0002'; END IF;
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year resolved for this learner' USING ERRCODE = 'P0001'; END IF;

  -- bridge to the profiles.id key hostel_allocations uses
  SELECT id INTO v_profile FROM profiles WHERE learner_id = p_learner_profile_id LIMIT 1;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'No profile bridges learner %', p_learner_profile_id USING ERRCODE = 'P0002'; END IF;

  -- fresh-only
  IF EXISTS (SELECT 1 FROM hostel_allocations a
             WHERE a.learner_id = v_profile AND a.status IN ('active','pending_approval') AND a.check_out_date IS NULL) THEN
    RAISE EXCEPTION 'Learner already has an active allocation — use Change room/bed instead' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_room FROM hostel_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room % not found', p_room_id USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_bed FROM hostel_beds WHERE id = p_bed_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bed % not found', p_bed_id USING ERRCODE = 'P0002'; END IF;
  IF v_bed.room_id <> p_room_id THEN RAISE EXCEPTION 'Bed does not belong to the selected room' USING ERRCODE = 'P0001'; END IF;
  v_block := v_room.block_id;

  -- institution access (mirror fn_cl_admin_transfer_allocation)
  SELECT EXISTS (SELECT 1 FROM hostel_block_institutions WHERE block_id = v_block) INTO v_mapped;
  IF v_mapped THEN
    SELECT EXISTS (
      SELECT 1 FROM hostel_block_institutions hbi
      WHERE hbi.block_id = v_block
        AND hbi.institution_id IN (SELECT institution_id FROM get_user_accessible_institutions(auth.uid()))
    ) INTO v_accessible;
    IF NOT v_accessible THEN RAISE EXCEPTION 'No access to the target block''s institution' USING ERRCODE = '42501'; END IF;
  END IF;

  -- bed must be free (dedup on allocation existence, matching auto-allocate)
  IF EXISTS (SELECT 1 FROM hostel_allocations a
             WHERE a.bed_id = p_bed_id AND a.status IN ('active','pending_approval') AND a.check_out_date IS NULL) THEN
    RAISE EXCEPTION 'The selected bed is already occupied' USING ERRCODE = '23505';
  END IF;

  -- standard tier policy (mirror auto-allocate)
  SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND institution_id IS NULL AND is_active LIMIT 1;
  IF v_tier IS NULL THEN SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND is_active LIMIT 1; END IF;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy found' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
    allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by
  ) VALUES (
    v_inst, v_profile, v_block, p_room_id, p_bed_id, v_ay, v_sem,
    'fresh', CURRENT_DATE, 'active', '', '', '',
    v_tier, auth.uid()
  ) RETURNING id INTO v_alloc_id;

  -- occupy the bed (immediate-active per design decision)
  UPDATE hostel_beds SET status='occupied', current_occupant_id=v_profile, updated_at=now() WHERE id = p_bed_id;

  -- room category is synced by trg_allocation_sync_learner_categories; honor an explicit mess pick
  IF p_mess_category_id IS NOT NULL THEN
    UPDATE learners_profiles SET mess_category_id = p_mess_category_id, updated_at = now() WHERE id = p_learner_profile_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'allocation_id', v_alloc_id,
                            'room_id', p_room_id, 'bed_id', p_bed_id, 'block_id', v_block);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_admin_allocate_bed(uuid,uuid,uuid,uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.fn_cl_admin_allocate_bed(uuid,uuid,uuid,uuid) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- fn_cl_admin_allocatable_rooms — ALL student rooms in a block with per-condition
-- verdict flags (gender, institution-serving, cohort eligibility, category,
-- free beds) for the manual AllocateRoomDialog. is_allocatable = all pass;
-- failing flags drive the dialog's "why not allocatable" diagnostics.
-- mig 20260618130000, rev 20260702090000 (condition flags).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cl_admin_allocatable_rooms(
  p_learner_profile_id uuid,
  p_block_id uuid
)
RETURNS TABLE(
  room_id uuid, room_number text, floor integer,
  category_id uuid, category_name text,
  capacity integer, available_beds integer,
  is_allocatable boolean,
  gender_ok boolean, institution_ok boolean, eligibility_ok boolean,
  category_ok boolean, has_free_beds boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inst   uuid;
  v_gender text;
  v_has_elig boolean;
BEGIN
  IF NOT (is_super_admin() OR user_has_permission('campus_living.upgrades.manage')) THEN
    RAISE EXCEPTION 'Not authorized to view allocatable rooms' USING ERRCODE = '42501';
  END IF;

  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_profile_id;
  IF v_inst IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM get_user_accessible_institutions(auth.uid()) g WHERE g.institution_id = v_inst) THEN
    RAISE EXCEPTION 'You do not have access to this learner''s institution' USING ERRCODE = '42501';
  END IF;

  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.learner_id = lp.id
   WHERE lp.id = p_learner_profile_id;

  SELECT EXISTS (SELECT 1 FROM fn_hostel_learner_room_categories(p_learner_profile_id))
    INTO v_has_elig;

  RETURN QUERY
  SELECT r.id, r.room_number, r.floor, r.category_id, hc.name,
         COALESCE(r.actual_capacity, r.capacity)::int,
         av.free,
         (chk.c_gender AND chk.c_institution AND chk.c_eligibility AND chk.c_category AND av.free > 0),
         chk.c_gender, chk.c_institution, chk.c_eligibility, chk.c_category,
         av.free > 0
  FROM hostel_rooms r
  JOIN hostel_blocks bl ON bl.id = r.block_id
  LEFT JOIN hostel_categories hc ON hc.id = r.category_id
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS free FROM hostel_beds b
    WHERE b.room_id = r.id AND b.status = 'available'
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                       WHERE a.bed_id = b.id AND a.status IN ('active','pending_approval'))
  ) av
  CROSS JOIN LATERAL (
    SELECT
      (bl.hostel_type::text = 'mixed'
        OR (v_gender IN ('male','m')   AND bl.hostel_type::text = 'boys')
        OR (v_gender IN ('female','f') AND bl.hostel_type::text = 'girls')) AS c_gender,
      fn_room_serves_institution(r.id, v_inst)                              AS c_institution,
      fn_learner_eligible_for_room(p_learner_profile_id, r.id)             AS c_eligibility,
      (NOT v_has_elig
        OR r.category_id IN (SELECT elig.category_id
                             FROM fn_hostel_learner_room_categories(p_learner_profile_id) elig)) AS c_category
  ) chk
  WHERE r.block_id = p_block_id
    AND r.room_purpose = 'student'
  ORDER BY 8 DESC, r.floor, r.room_number;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_admin_allocatable_rooms(uuid, uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.fn_cl_admin_allocatable_rooms(uuid, uuid) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- fn_cl_admin_allocatable_blocks — block-level companion to
-- fn_cl_admin_allocatable_rooms (per-learner allocatable room/bed counts per
-- block; ranks + auto-selects the AllocateRoomDialog block picker).
-- mig 20260702100000.
-- ───────────────────────────────────────────────────────────────────────────
-- Block-level companion to fn_cl_admin_allocatable_rooms: every hostel block
-- annotated with how many rooms/beds THIS learner can actually be allocated
-- (same predicates: gender, free beds, institution-serving, cohort
-- eligibility, category fail-open). Lets the AllocateRoomDialog rank blocks
-- and auto-select one that works instead of making the admin guess.
-- Gender is checked at block level first so non-matching blocks skip the
-- per-room eligibility functions entirely (they report 0 without the cost).
CREATE OR REPLACE FUNCTION public.fn_cl_admin_allocatable_blocks(
  p_learner_profile_id uuid
)
RETURNS TABLE(
  block_id uuid, block_name text, block_code text, hostel_type text,
  gender_ok boolean, allocatable_rooms integer, free_beds integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inst   uuid;
  v_gender text;
  v_has_elig boolean;
BEGIN
  IF NOT (is_super_admin() OR user_has_permission('campus_living.upgrades.manage')) THEN
    RAISE EXCEPTION 'Not authorized to view allocatable blocks' USING ERRCODE = '42501';
  END IF;

  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_profile_id;
  IF v_inst IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM get_user_accessible_institutions(auth.uid()) g WHERE g.institution_id = v_inst) THEN
    RAISE EXCEPTION 'You do not have access to this learner''s institution' USING ERRCODE = '42501';
  END IF;

  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.learner_id = lp.id
   WHERE lp.id = p_learner_profile_id;

  SELECT EXISTS (SELECT 1 FROM fn_hostel_learner_room_categories(p_learner_profile_id))
    INTO v_has_elig;

  RETURN QUERY
  SELECT bl.id, bl.name, bl.code, bl.hostel_type::text,
         g.c_gender,
         COALESCE(cnt.rooms, 0), COALESCE(cnt.beds, 0)
  FROM hostel_blocks bl
  CROSS JOIN LATERAL (
    SELECT (bl.hostel_type::text = 'mixed'
      OR (v_gender IN ('male','m')   AND bl.hostel_type::text = 'boys')
      OR (v_gender IN ('female','f') AND bl.hostel_type::text = 'girls')) AS c_gender
  ) g
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS rooms, COALESCE(sum(av.free), 0)::int AS beds
    FROM hostel_rooms r
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS free FROM hostel_beds b
      WHERE b.room_id = r.id AND b.status = 'available'
        AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                         WHERE a.bed_id = b.id AND a.status IN ('active','pending_approval'))
    ) av
    WHERE r.block_id = bl.id
      AND r.room_purpose = 'student'
      AND g.c_gender
      AND av.free > 0
      AND fn_room_serves_institution(r.id, v_inst)
      AND fn_learner_eligible_for_room(p_learner_profile_id, r.id)
      AND (NOT v_has_elig
           OR r.category_id IN (SELECT elig.category_id
                                FROM fn_hostel_learner_room_categories(p_learner_profile_id) elig))
  ) cnt ON true
  ORDER BY COALESCE(cnt.rooms, 0) DESC, bl.name;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_admin_allocatable_blocks(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.fn_cl_admin_allocatable_blocks(uuid) TO authenticated;

-- =====================================================================================
-- Fee-structure sync engine + auto-reconciler (2026-06-21)
-- admission_fix_fee_mismatch_2026: core-academic, payment-safe reconciler (supersede + re-bill
--   + carry receipt allocation same-category, excludes transport/hostel/mess). LOAD-BEARING:
--   used by admission_reconcile_pending_fee_events (hourly pg_cron job).
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.admission_fix_fee_mismatch_2026(
    p_learner_ids uuid[],
    p_dry_run boolean default true,
    p_refund_excess boolean default false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
declare
    v_caller   uuid := auth.uid();
    v_lid      uuid;
    v_l        record;
    v_yos      int;
    v_struct   uuid;
    v_line     record;
    v_ri       record;
    v_new_bill uuid;
    v_remaining numeric;
    v_alloc     numeric;
    v_target    numeric;
    v_excess    numeric;
    v_c_learner int := 0;
    v_c_change  int := 0;
    v_c_add     int := 0;
    v_c_remove  int := 0;
    v_c_realloc int := 0;
    v_c_credit  int := 0;
    v_c_fee     int := 0;
    v_plan      jsonb := '[]'::jsonb;
begin
    foreach v_lid in array p_learner_ids loop
        select id, institution_id, gender, degree_id, department_id, program_id,
               quota_id, community_category_id, accommodation_type_id, admission_year_id,
               academic_year_id, legacy_fee_mode, lifecycle_status
          into v_l from learners_profiles where id = v_lid for update;
        if not found then continue; end if;

        v_yos := coalesce(fn_learner_year_of_study(v_lid), 1);

        select afs.id into v_struct
          from admission_fee_structures afs
         where afs.institution_id=v_l.institution_id and afs.degree_id=v_l.degree_id
           and afs.department_id=v_l.department_id and afs.programme_id=v_l.program_id
           and afs.quota_id=v_l.quota_id and afs.admission_year_id=v_l.admission_year_id and afs.status='active'
           and exists (select 1 from admission_fee_structure_communities j
                        where j.fee_structure_id=afs.id and j.community_category_id=v_l.community_category_id)
           and (afs.gender=upper(v_l.gender) or afs.gender is null)
           and (afs.accommodation_type_id=v_l.accommodation_type_id or afs.accommodation_type_id is null)
         order by (afs.accommodation_type_id is not null) desc, (afs.gender is not null) desc, afs.updated_at desc
         limit 1;

        if v_struct is null then
            v_plan := v_plan || jsonb_build_object('learner', v_lid, 'skipped', 'no_structure');
            continue;
        end if;
        v_c_learner := v_c_learner + 1;

        for v_line in
            with exp as (
                select fsi.billing_category_id cat, fsi.amount new_amt, fsi.applies_year_of_study ays
                  from admission_fee_structure_items fsi
                  join billing_categories bc on bc.id=fsi.billing_category_id
                 where fsi.fee_structure_id=v_struct and bc.kind not in ('transport','hostel','mess')
                   and (fsi.applies_to='every_year'
                        or (fsi.applies_to='first_year_only' and v_yos=1)
                        or (fsi.applies_to='specific_year' and fsi.applies_year_of_study=v_yos))
            ),
            bil as (
                select distinct on (b.item_category_id)
                       b.id bill_id, b.item_category_id cat, b.final_amount old_amt, b.status,
                       b.due_date, b.academic_year_id, b.applies_year_of_study,
                       b.final_amount - coalesce(b.balance_amount,0) paid
                  from billing_student_bills b
                  join billing_categories bc on bc.id=b.item_category_id
                 where b.student_id=v_lid and b.fee_source='academic' and b.status<>'superseded'
                   and bc.kind not in ('transport','hostel','mess')
                 order by b.item_category_id, b.created_at desc
            )
            select coalesce(e.cat, bi.cat) cat, e.new_amt, e.ays,
                   bi.bill_id, bi.old_amt, bi.status, bi.paid, bi.due_date, bi.academic_year_id, bi.applies_year_of_study,
                   case when bi.cat is null then 'add'
                        when e.cat  is null then 'remove'
                        when coalesce(bi.old_amt,0) <> coalesce(e.new_amt,0) then 'change'
                        else 'ok' end as action,
                   (select category_name from billing_categories where id = coalesce(e.cat,bi.cat)) as cat_name
              from exp e full outer join bil bi on bi.cat = e.cat
        loop
            if v_line.action = 'ok' then continue; end if;

            if v_line.action = 'change' then
                v_c_change := v_c_change + 1;
                v_target := least(coalesce(v_line.paid,0), v_line.new_amt);
                v_excess := greatest(0, coalesce(v_line.paid,0) - v_line.new_amt);
                v_plan := v_plan || jsonb_build_object('learner',v_lid,'action','change','category',v_line.cat_name,
                              'old',v_line.old_amt,'new',v_line.new_amt,'paid',v_line.paid,'carry',v_target,'excess',v_excess);
                if not p_dry_run then
                    update billing_student_bills set status='superseded', updated_at=now() where id = v_line.bill_id;

                    insert into billing_student_bills(
                        student_id, institution_id, item_category_id, bill_description, due_date,
                        quantity, unit_amount, total_amount, tax_amount, final_amount, balance_amount,
                        status, fee_source, academic_year_id, applies_year_of_study, remarks, created_by)
                    values (v_lid, v_l.institution_id, v_line.cat, coalesce(v_line.cat_name,'Fee'),
                        coalesce(v_line.due_date, (now()+interval '30 days')::date),
                        1, v_line.new_amt, v_line.new_amt, 0, v_line.new_amt, v_line.new_amt,
                        'unpaid','academic', v_line.academic_year_id, v_line.applies_year_of_study,
                        'Fee-sync 2026: replaces bill '||v_line.bill_id::text||' (was '||v_line.old_amt::text||')', v_caller)
                    returning id into v_new_bill;

                    update billing_student_bills set superseded_by_bill_id=v_new_bill where id=v_line.bill_id;

                    if v_target > 0 then
                        v_remaining := v_line.new_amt;
                        for v_ri in
                            select id, receipt_id, amount_paid from billing_receipt_items
                             where bill_id=v_line.bill_id and allocation_reason='original_payment'
                             order by amount_paid desc
                        loop
                            exit when v_remaining <= 0;
                            v_alloc := least(v_ri.amount_paid, v_remaining);
                            if v_alloc > 0 then
                                insert into billing_receipt_items(receipt_id, bill_id, amount_paid, allocation_reason)
                                values (v_ri.receipt_id, v_new_bill, v_alloc, 'fee_structure_change_reallocation');
                                v_remaining := v_remaining - v_alloc;
                                v_c_realloc := v_c_realloc + 1;
                            end if;
                        end loop;
                    end if;

                    if v_excess > 0 then
                        insert into student_credit_balances(student_id, amount, source, is_consumed, notes, created_by)
                        values (v_lid, v_excess, 'fee_structure_change', false,
                            case when p_refund_excess
                                 then 'EXCESS refund pending - fee-sync 2026 ('||coalesce(v_line.cat_name,'')||')'
                                 else 'Credit from fee-sync 2026 reallocation ('||coalesce(v_line.cat_name,'')||')' end,
                            v_caller);
                        v_c_credit := v_c_credit + 1;
                    end if;
                end if;

            elsif v_line.action = 'add' then
                v_c_add := v_c_add + 1;
                v_plan := v_plan || jsonb_build_object('learner',v_lid,'action','add','category',v_line.cat_name,'new',v_line.new_amt);
                if not p_dry_run then
                    insert into billing_student_bills(
                        student_id, institution_id, item_category_id, bill_description, due_date,
                        quantity, unit_amount, total_amount, tax_amount, final_amount, balance_amount,
                        status, fee_source, academic_year_id, applies_year_of_study, remarks, created_by)
                    values (v_lid, v_l.institution_id, v_line.cat, coalesce(v_line.cat_name,'Fee'),
                        (now()+interval '30 days')::date,
                        1, v_line.new_amt, v_line.new_amt, 0, v_line.new_amt, v_line.new_amt,
                        'unpaid','academic', v_l.academic_year_id, v_line.ays,
                        'Fee-sync 2026: added missing structure line', v_caller);
                end if;

            elsif v_line.action = 'remove' then
                v_c_remove := v_c_remove + 1;
                v_plan := v_plan || jsonb_build_object('learner',v_lid,'action','remove','category',v_line.cat_name,
                              'old',v_line.old_amt,'paid',v_line.paid);
                if not p_dry_run then
                    update billing_student_bills
                       set status='superseded', updated_at=now(),
                           remarks = coalesce(remarks,'')||' | Fee-sync 2026: removed (not in structure)'
                     where id = v_line.bill_id;
                    if coalesce(v_line.paid,0) > 0 then
                        insert into student_credit_balances(student_id, amount, source, is_consumed, notes, created_by)
                        values (v_lid, v_line.paid, 'fee_structure_change', false,
                            'Credit from fee-sync 2026 removed fee ('||coalesce(v_line.cat_name,'')||')', v_caller);
                        v_c_credit := v_c_credit + 1;
                    end if;
                end if;
            end if;
        end loop;

        if not p_dry_run then
            perform admission_resolve_fee_items_for_lead(v_lid);
        end if;
        v_c_fee := v_c_fee + 1;
    end loop;

    return jsonb_build_object(
        'dry_run', p_dry_run, 'learners_processed', v_c_learner, 'amount_changes', v_c_change,
        'added', v_c_add, 'removed', v_c_remove, 'reallocations', v_c_realloc, 'credits', v_c_credit,
        'feeitems_resynced', v_c_fee, 'plan', case when p_dry_run then v_plan else '[]'::jsonb end);
end
$fn$;

-- Auto-reconciler for pending admission_fee_change_events (hourly pg_cron 'admission-reconcile-fee-events').
-- Per-learner isolation; only closes an event if the learner resolves to an active structure.
CREATE OR REPLACE FUNCTION public.admission_reconcile_pending_fee_events(p_dry_run boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $rfn$
DECLARE
  v_ids uuid[]; v_lid uuid;
  v_ok int:=0; v_failed int:=0; v_closed int:=0; v_nostruct int:=0;
  v_dry jsonb; v_has_struct boolean;
BEGIN
  -- Guard: cron runs with auth.uid() IS NULL (allowed). A human caller must hold the
  -- fee-change approval permission; everyone else is rejected even if EXECUTE is ever granted.
  IF auth.uid() IS NOT NULL AND NOT public.user_has_permission('admission_fees.approve_change_event') THEN
    RAISE EXCEPTION 'permission_denied: admission_fees.approve_change_event required' USING ERRCODE='42501';
  END IF;

  SELECT coalesce(array_agg(distinct learner_id),'{}'::uuid[]) INTO v_ids
    FROM admission_fee_change_events WHERE status='pending_review';
  IF coalesce(array_length(v_ids,1),0)=0 THEN
    RETURN jsonb_build_object('pending_learners',0,'note','no pending events');
  END IF;

  IF p_dry_run THEN
    v_dry := public.admission_fix_fee_mismatch_2026(v_ids, true, false);
    RETURN jsonb_build_object('pending_learners',array_length(v_ids,1),'dry_run',v_dry);
  END IF;

  FOREACH v_lid IN ARRAY v_ids LOOP
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM learners_profiles lp
        JOIN admission_fee_structures afs
          ON afs.institution_id=lp.institution_id AND afs.degree_id=lp.degree_id AND afs.department_id=lp.department_id
         AND afs.programme_id=lp.program_id AND afs.quota_id=lp.quota_id AND afs.admission_year_id=lp.admission_year_id
         AND afs.status='active'
         AND (afs.gender=upper(lp.gender) OR afs.gender IS NULL)
         AND (afs.accommodation_type_id=lp.accommodation_type_id OR afs.accommodation_type_id IS NULL)
        WHERE lp.id=v_lid
          AND EXISTS (SELECT 1 FROM admission_fee_structure_communities j WHERE j.fee_structure_id=afs.id AND j.community_category_id=lp.community_category_id)
      ) INTO v_has_struct;

      IF v_has_struct THEN
        PERFORM public.admission_fix_fee_mismatch_2026(array[v_lid]::uuid[], false, false);
        UPDATE admission_fee_change_events
           SET status='approved', decided_at=now(),
               reason_notes=coalesce(reason_notes,'')||' | Auto-reconciled by admission_reconcile_pending_fee_events'
         WHERE status='pending_review' AND learner_id=v_lid;
        v_ok:=v_ok+1; v_closed:=v_closed+1;
      ELSE
        v_nostruct:=v_nostruct+1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed:=v_failed+1;
    END;
  END LOOP;

  RETURN jsonb_build_object('pending_learners',array_length(v_ids,1),'reconciled',v_ok,
                            'no_structure_left_pending',v_nostruct,'failed',v_failed,'events_closed',v_closed);
END $rfn$;

-- Owner/cron only — SECURITY DEFINER financial mutations; NOT callable by anon/authenticated.
REVOKE ALL ON FUNCTION public.admission_fix_fee_mismatch_2026(uuid[], boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admission_reconcile_pending_fee_events(boolean) FROM PUBLIC, anon, authenticated;

-- =====================================================
-- Staff Tags — distinct-tag autocomplete source
-- Added: 2026-06-22
-- Powers the staff form's tag suggestions (reuse existing tags to curb spelling
-- drift). Returns only non-sensitive label strings, optionally scoped to one
-- institution. SECURITY DEFINER so suggestions span the table under RLS; execute
-- locked to authenticated (anon revoked per Supabase grant-to-anon default).
-- =====================================================
CREATE OR REPLACE FUNCTION public.staff_distinct_tags(p_institution_id uuid DEFAULT NULL)
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT t
  FROM public.staff, unnest(tags) AS t
  WHERE (p_institution_id IS NULL OR institution_id = p_institution_id)
    AND t <> ''
  ORDER BY t;
$$;

REVOKE EXECUTE ON FUNCTION public.staff_distinct_tags(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.staff_distinct_tags(uuid) TO authenticated;

-- =====================================================================
-- Resource reservation: time-window-aware approval guard + waitlist
-- (mig 20260623170000). The approval guard no longer mutates a global
-- current_stock_quantity counter; it checks capacity WITHIN the booking's
-- [start_time, end_time) window so non-overlapping bookings of a
-- single-unit resource (rooms / halls) can all be approved. The end-of-life
-- trigger only promotes the next waitlist entry (no stock restore).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_reservation_approved_decrement_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total     int;
  v_committed int;
BEGIN
  IF NEW.status = 'approved'
     AND (OLD.status IS NULL OR OLD.status <> 'approved')
     AND COALESCE(NEW.quantity, 0) > 0
     AND NEW.start_time IS NOT NULL
     AND NEW.end_time   IS NOT NULL THEN

    SELECT initial_stock_quantity INTO v_total
    FROM public.resources
    WHERE id = NEW.resource_id;

    IF v_total IS NOT NULL THEN
      SELECT COALESCE(SUM(rr.quantity), 0) INTO v_committed
      FROM public.resource_reservations rr
      WHERE rr.resource_id = NEW.resource_id
        AND rr.id <> NEW.id
        AND rr.status = 'approved'
        AND rr.start_time < NEW.end_time
        AND rr.end_time   > NEW.start_time;

      IF v_committed + NEW.quantity > v_total THEN
        RAISE EXCEPTION
          'Insufficient stock: only % unit(s) of this resource are free for the selected time window, but % unit(s) are needed to approve this reservation',
          GREATEST(v_total - v_committed, 0), NEW.quantity
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_reservation_cancelled_restore_stock_and_waitlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_waitlist_id UUID;
BEGIN
  IF NEW.status = 'cancelled' THEN
    SELECT id INTO next_waitlist_id
    FROM public.event_waitlist
    WHERE resource_reservation_id = NEW.id
      AND status = 'waiting'
    ORDER BY position ASC LIMIT 1;

    IF next_waitlist_id IS NOT NULL THEN
      UPDATE public.event_waitlist
         SET status = 'promoted', promoted_at = now()
       WHERE id = next_waitlist_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- hr_recruitment_jobs_fill_org — derive hr_organization_id from institution_id
-- (1:1 via hr_organizations.institution_id) when left NULL. SECURITY DEFINER so
-- it bypasses hr_organizations tenant-isolation RLS for multi-institution HR
-- admins. Mirrors 20260625120000_hr_recruitment_jobs_autofill_org.sql.
CREATE OR REPLACE FUNCTION public.hr_recruitment_jobs_fill_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.hr_organization_id IS NULL AND NEW.institution_id IS NOT NULL THEN
    SELECT o.id
      INTO NEW.hr_organization_id
      FROM public.hr_organizations o
     WHERE o.institution_id = NEW.institution_id
     LIMIT 1;
  END IF;

  IF NEW.hr_organization_id IS NULL THEN
    RAISE EXCEPTION
      'No HR organization found for institution_id=%. Pick a college that has an HR organization.',
      NEW.institution_id
      USING ERRCODE = '23502';
  END IF;

  RETURN NEW;
END;
$$;

-- ── Induction session poll RPCs (2026-06-30) — see migrations 20260630210100 / 210200 ──
-- 20260630210100_induction_session_polls_host_rpcs.sql
-- Host-side RPCs for induction session polls. SECURITY DEFINER + search_path=public,
-- anon-locked. Authorization reuses public._fn_induction_can_manage_session_pulse
-- (credited resource person OR coordinator with induction.manage + institution access OR admin).

-- Build/edit the poll structure (diff-upsert). Deletes blocked once votes exist.
CREATE OR REPLACE FUNCTION public.fn_induction_upsert_session_poll(p_session_id uuid, p_questions jsonb)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event uuid; v_inst uuid; v_poll_id uuid;
  q jsonb; o jsonb; v_qid uuid; v_oid uuid;
  v_keep_q uuid[] := '{}'; v_keep_o uuid[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: not authenticated'; END IF;
  SELECT es.event_id, ip.institution_id INTO v_event, v_inst
  FROM public.event_sessions es JOIN public.induction_programs ip ON ip.event_id = es.event_id
  WHERE es.id = p_session_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: not an induction session'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(p_session_id) THEN
    RAISE EXCEPTION 'fn_induction_upsert_session_poll: not authorized'; END IF;

  INSERT INTO public.induction_session_poll (session_id, event_id, institution_id, created_by)
  VALUES (p_session_id, v_event, v_inst, auth.uid())
  ON CONFLICT (session_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_poll_id;

  FOR q IN SELECT value FROM jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) LOOP
    IF nullif(q->>'id','') IS NOT NULL THEN
      v_qid := (q->>'id')::uuid;
      UPDATE public.induction_session_poll_question
      SET prompt = q->>'prompt', kind = coalesce(q->>'kind','single'),
          position = coalesce((q->>'position')::int, 0)
      WHERE id = v_qid AND poll_id = v_poll_id;
    ELSE
      INSERT INTO public.induction_session_poll_question (poll_id, prompt, kind, position)
      VALUES (v_poll_id, q->>'prompt', coalesce(q->>'kind','single'), coalesce((q->>'position')::int,0))
      RETURNING id INTO v_qid;
    END IF;
    v_keep_q := array_append(v_keep_q, v_qid);

    v_keep_o := '{}';
    FOR o IN SELECT value FROM jsonb_array_elements(coalesce(q->'options','[]'::jsonb)) LOOP
      IF nullif(o->>'id','') IS NOT NULL THEN
        v_oid := (o->>'id')::uuid;
        UPDATE public.induction_session_poll_option
        SET label = o->>'label', position = coalesce((o->>'position')::int,0)
        WHERE id = v_oid AND question_id = v_qid;
      ELSE
        INSERT INTO public.induction_session_poll_option (question_id, label, position)
        VALUES (v_qid, o->>'label', coalesce((o->>'position')::int,0))
        RETURNING id INTO v_oid;
      END IF;
      v_keep_o := array_append(v_keep_o, v_oid);
    END LOOP;

    IF EXISTS (
      SELECT 1 FROM public.induction_session_poll_option opt
      JOIN public.induction_session_poll_vote v ON v.option_id = opt.id
      WHERE opt.question_id = v_qid AND NOT (opt.id = ANY(v_keep_o))
    ) THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: cannot delete an option that already has votes'; END IF;
    DELETE FROM public.induction_session_poll_option
    WHERE question_id = v_qid AND NOT (id = ANY(v_keep_o));
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.induction_session_poll_question qq
    JOIN public.induction_session_poll_vote v ON v.question_id = qq.id
    WHERE qq.poll_id = v_poll_id AND NOT (qq.id = ANY(v_keep_q))
  ) THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: cannot delete a question that already has votes'; END IF;
  DELETE FROM public.induction_session_poll_question
  WHERE poll_id = v_poll_id AND NOT (id = ANY(v_keep_q));

  RETURN v_poll_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_upsert_session_poll(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_upsert_session_poll(uuid, jsonb) TO authenticated;

-- Open (idempotent, advisory-locked, requires >=1 question).
CREATE OR REPLACE FUNCTION public.fn_induction_open_session_poll(p_session_id uuid)
RETURNS public.induction_session_poll LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.induction_session_poll;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_open_session_poll: not authenticated'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(p_session_id) THEN
    RAISE EXCEPTION 'fn_induction_open_session_poll: not authorized'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('induction_poll|' || p_session_id::text));
  SELECT * INTO v_row FROM public.induction_session_poll WHERE session_id = p_session_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'fn_induction_open_session_poll: no poll for this session'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.induction_session_poll_question WHERE poll_id = v_row.id) THEN
    RAISE EXCEPTION 'fn_induction_open_session_poll: add at least one question first'; END IF;
  UPDATE public.induction_session_poll
  SET status='open', issued_at=coalesce(issued_at, now()), auto_close_at = now() + interval '240 minutes', updated_at=now()
  WHERE id = v_row.id RETURNING * INTO v_row;
  RETURN v_row;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_open_session_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_open_session_poll(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_close_session_poll(p_poll_id uuid)
RETURNS public.induction_session_poll LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session uuid; v_row public.induction_session_poll;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_close_session_poll: not authenticated'; END IF;
  SELECT session_id INTO v_session FROM public.induction_session_poll WHERE id = p_poll_id;
  IF v_session IS NULL THEN RAISE EXCEPTION 'fn_induction_close_session_poll: no such poll'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(v_session) THEN
    RAISE EXCEPTION 'fn_induction_close_session_poll: not authorized'; END IF;
  UPDATE public.induction_session_poll SET status='closed', updated_at=now()
  WHERE id = p_poll_id RETURNING * INTO v_row;
  RETURN v_row;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_close_session_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_close_session_poll(uuid) TO authenticated;

-- Host fetch: full structure + status + has_votes.
CREATE OR REPLACE FUNCTION public.fn_induction_get_session_poll(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p public.induction_session_poll; v_questions jsonb; v_has_votes boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_get_session_poll: not authenticated'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(p_session_id) THEN
    RAISE EXCEPTION 'fn_induction_get_session_poll: not authorized'; END IF;
  SELECT * INTO v_p FROM public.induction_session_poll WHERE session_id = p_session_id;
  IF v_p.id IS NULL THEN RETURN NULL; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'prompt', q.prompt, 'kind', q.kind, 'position', q.position,
           'options', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.label,'position',o.position) ORDER BY o.position),'[]'::jsonb)
                       FROM public.induction_session_poll_option o WHERE o.question_id = q.id)
         ) ORDER BY q.position),'[]'::jsonb)
  INTO v_questions FROM public.induction_session_poll_question q WHERE q.poll_id = v_p.id;

  SELECT EXISTS(SELECT 1 FROM public.induction_session_poll_vote WHERE poll_id = v_p.id) INTO v_has_votes;

  RETURN jsonb_build_object('id', v_p.id, 'session_id', v_p.session_id, 'status', v_p.status,
    'auto_close_at', v_p.auto_close_at, 'has_votes', v_has_votes, 'questions', v_questions);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_get_session_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_get_session_poll(uuid) TO authenticated;

-- Live anonymized totals (k>=3 floor). Lazy auto-close.
CREATE OR REPLACE FUNCTION public.fn_induction_session_poll_totals(p_poll_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_p public.induction_session_poll; v_batch uuid; v_enrolled int; v_responses int;
  v_suppress boolean; v_k constant int := 3; v_questions jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_session_poll_totals: not authenticated'; END IF;
  SELECT * INTO v_p FROM public.induction_session_poll WHERE id = p_poll_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'fn_induction_session_poll_totals: no such poll'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(v_p.session_id) THEN
    RAISE EXCEPTION 'fn_induction_session_poll_totals: not authorized'; END IF;

  IF v_p.status = 'open' AND v_p.auto_close_at IS NOT NULL AND v_p.auto_close_at < now() THEN
    UPDATE public.induction_session_poll SET status='closed', updated_at=now() WHERE id = v_p.id;
    v_p.status := 'closed';
  END IF;

  SELECT es.batch_id INTO v_batch FROM public.event_sessions es WHERE es.id = v_p.session_id;
  SELECT count(*)::int INTO v_enrolled FROM public.induction_enrollment ie
  WHERE ie.event_id = v_p.event_id AND (v_batch IS NULL OR ie.batch_id = v_batch);

  SELECT count(DISTINCT learner_id)::int INTO v_responses
  FROM public.induction_session_poll_vote WHERE poll_id = v_p.id;
  v_suppress := (v_responses < v_k);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'prompt', q.prompt, 'kind', q.kind,
           'response_count', (SELECT count(DISTINCT learner_id) FROM public.induction_session_poll_vote v WHERE v.question_id = q.id),
           'options', (
             SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', o.id, 'label', o.label,
               'count', CASE WHEN v_suppress THEN NULL ELSE (SELECT count(*) FROM public.induction_session_poll_vote v WHERE v.option_id = o.id) END
             ) ORDER BY o.position),'[]'::jsonb)
             FROM public.induction_session_poll_option o WHERE o.question_id = q.id)
         ) ORDER BY q.position),'[]'::jsonb)
  INTO v_questions FROM public.induction_session_poll_question q WHERE q.poll_id = v_p.id;

  RETURN jsonb_build_object('status', v_p.status, 'auto_close_at', v_p.auto_close_at,
    'enrolled_count', v_enrolled, 'response_count', v_responses, 'suppressed', v_suppress,
    'questions', v_questions);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_poll_totals(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_poll_totals(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
-- 20260630210200_induction_session_polls_learner_rpcs.sql
-- Learner-side RPCs for induction session polls. Gate: caller is a learner
-- (get_my_learner_id()), enrolled in the poll's event, session applies to their batch
-- (batch_id IS NULL OR = mine), and the poll is open. SECURITY DEFINER, anon-locked.

-- A learner's currently-open polls (enrolled + their batch), with already_answered.
CREATE OR REPLACE FUNCTION public.fn_induction_session_poll_for_learner()
RETURNS TABLE (poll_id uuid, session_id uuid, event_id uuid, event_name text, title text,
               day_number integer, auto_close_at timestamptz, already_answered boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_learner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_session_poll_for_learner: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT p.id, p.session_id, p.event_id, ev.name, es.title, es.day_number, p.auto_close_at,
         EXISTS (SELECT 1 FROM public.induction_session_poll_vote v WHERE v.poll_id = p.id AND v.learner_id = v_learner)
  FROM public.induction_session_poll p
  JOIN public.event_sessions es ON es.id = p.session_id
  JOIN public.events ev         ON ev.id = p.event_id
  JOIN public.induction_enrollment ie ON ie.event_id = p.event_id AND ie.learner_id = v_learner
  WHERE p.status = 'open' AND (p.auto_close_at IS NULL OR p.auto_close_at > now())
    AND (es.batch_id IS NULL OR es.batch_id = ie.batch_id)
  ORDER BY p.issued_at DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_poll_for_learner() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_poll_for_learner() TO authenticated;

-- helper: may THIS learner answer THIS poll? (enrolled + batch + open)
CREATE OR REPLACE FUNCTION public._fn_induction_learner_can_answer_poll(p_poll_id uuid, p_learner uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.induction_session_poll p
    JOIN public.event_sessions es ON es.id = p.session_id
    JOIN public.induction_enrollment ie ON ie.event_id = p.event_id AND ie.learner_id = p_learner
    WHERE p.id = p_poll_id AND p.status='open' AND (p.auto_close_at IS NULL OR p.auto_close_at > now())
      AND (es.batch_id IS NULL OR es.batch_id = ie.batch_id)
  ) INTO v_ok;
  RETURN coalesce(v_ok,false);
END $$;
REVOKE EXECUTE ON FUNCTION public._fn_induction_learner_can_answer_poll(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._fn_induction_learner_can_answer_poll(uuid, uuid) TO authenticated;

-- Questions/options to render + my prior answers (so I can change while open).
CREATE OR REPLACE FUNCTION public.fn_induction_get_poll_for_answering(p_poll_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_learner uuid; v_questions jsonb; v_mine jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_get_poll_for_answering: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL OR NOT public._fn_induction_learner_can_answer_poll(p_poll_id, v_learner) THEN
    RAISE EXCEPTION 'fn_induction_get_poll_for_answering: not allowed'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'prompt', q.prompt, 'kind', q.kind,
           'options', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.label) ORDER BY o.position),'[]'::jsonb)
                       FROM public.induction_session_poll_option o WHERE o.question_id = q.id)
         ) ORDER BY q.position),'[]'::jsonb)
  INTO v_questions FROM public.induction_session_poll_question q WHERE q.poll_id = p_poll_id;

  SELECT coalesce(jsonb_object_agg(question_id, opts),'{}'::jsonb) INTO v_mine FROM (
    SELECT question_id, jsonb_agg(option_id) AS opts
    FROM public.induction_session_poll_vote WHERE poll_id = p_poll_id AND learner_id = v_learner
    GROUP BY question_id
  ) m;

  RETURN jsonb_build_object('poll_id', p_poll_id, 'questions', v_questions, 'my_answers', v_mine);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_get_poll_for_answering(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_get_poll_for_answering(uuid) TO authenticated;

-- Submit/replace a learner's ballot. p_answers = [{question_id, option_ids:[...]}].
CREATE OR REPLACE FUNCTION public.fn_induction_submit_poll_response(p_poll_id uuid, p_answers jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_learner uuid; a jsonb; v_qid uuid; v_kind text; v_opts uuid[]; v_oid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_poll_response: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL OR NOT public._fn_induction_learner_can_answer_poll(p_poll_id, v_learner) THEN
    RAISE EXCEPTION 'fn_induction_submit_poll_response: not allowed'; END IF;

  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) LOOP
    v_qid := (a->>'question_id')::uuid;
    SELECT kind INTO v_kind FROM public.induction_session_poll_question WHERE id = v_qid AND poll_id = p_poll_id;
    IF v_kind IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_poll_response: question not in poll'; END IF;

    SELECT coalesce(array_agg((e)::uuid),'{}') INTO v_opts
    FROM jsonb_array_elements_text(coalesce(a->'option_ids','[]'::jsonb)) e;

    IF v_kind = 'single' AND array_length(v_opts,1) IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'fn_induction_submit_poll_response: single-choice needs exactly one option'; END IF;

    IF EXISTS (SELECT 1 FROM unnest(v_opts) x(oid)
               WHERE NOT EXISTS (SELECT 1 FROM public.induction_session_poll_option o WHERE o.id = x.oid AND o.question_id = v_qid)) THEN
      RAISE EXCEPTION 'fn_induction_submit_poll_response: option does not belong to question'; END IF;

    DELETE FROM public.induction_session_poll_vote WHERE question_id = v_qid AND learner_id = v_learner;
    FOREACH v_oid IN ARRAY v_opts LOOP
      INSERT INTO public.induction_session_poll_vote (poll_id, question_id, option_id, learner_id)
      VALUES (p_poll_id, v_qid, v_oid, v_learner);
    END LOOP;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_submit_poll_response(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_submit_poll_response(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Induction poll responders (2026-07-02) — see migration 20260702050000 ──
-- Host-side "who answered" list for a session poll's live count analytics.
-- Deliberate design change from the original anonymized-only totals: the HOST
-- (same gate as the pulse) sees WHICH learners responded (register no + name),
-- but still NOT their ballots. fn_induction_session_poll_totals stays anonymized.
CREATE OR REPLACE FUNCTION public.fn_induction_session_poll_responders(p_poll_id uuid)
RETURNS TABLE (learner_id uuid, register_number text, roll_number text,
               learner_name text, questions_answered bigint, answered_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_session_poll_responders: not authenticated'; END IF;
  SELECT p.session_id INTO v_session FROM public.induction_session_poll p WHERE p.id = p_poll_id;
  IF v_session IS NULL OR NOT public._fn_induction_can_manage_session_pulse(v_session) THEN
    RAISE EXCEPTION 'fn_induction_session_poll_responders: not allowed'; END IF;

  RETURN QUERY
  SELECT v.learner_id,
         lp.register_number::text,
         lp.roll_number::text,
         trim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         count(DISTINCT v.question_id),
         max(v.created_at)
  FROM public.induction_session_poll_vote v
  JOIN public.learners_profiles lp ON lp.id = v.learner_id
  WHERE v.poll_id = p_poll_id
  GROUP BY v.learner_id, lp.register_number, lp.roll_number, lp.first_name, lp.last_name
  ORDER BY max(v.created_at) DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_poll_responders(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_poll_responders(uuid) TO authenticated;

-- ── Induction poll coordinator flow (2026-07-02) — see migration 20260702060000 ──
-- Coordinator-controlled question flow (Mentimeter-style): the host decides which
-- ONE question is live via induction_session_poll.current_question_id; learners only
-- ever receive the current question and can watch its live counts (k>=3 floor).
-- Rebuilds fn_induction_open_session_poll / fn_induction_get_session_poll /
-- fn_induction_get_poll_for_answering; adds fn_induction_set_current_poll_question
-- and fn_induction_poll_question_totals_for_learner. These are the CURRENT versions.

CREATE OR REPLACE FUNCTION public.fn_induction_open_session_poll(p_session_id uuid)
RETURNS induction_session_poll LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.induction_session_poll;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_open_session_poll: not authenticated'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(p_session_id) THEN
    RAISE EXCEPTION 'fn_induction_open_session_poll: not authorized'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('induction_poll|' || p_session_id::text));
  SELECT * INTO v_row FROM public.induction_session_poll WHERE session_id = p_session_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'fn_induction_open_session_poll: no poll for this session'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.induction_session_poll_question WHERE poll_id = v_row.id) THEN
    RAISE EXCEPTION 'fn_induction_open_session_poll: add at least one question first'; END IF;
  UPDATE public.induction_session_poll
  SET status='open', issued_at=coalesce(issued_at, now()), auto_close_at = now() + interval '240 minutes',
      current_question_id = coalesce(current_question_id,
        (SELECT q.id FROM public.induction_session_poll_question q
          WHERE q.poll_id = induction_session_poll.id ORDER BY q.position LIMIT 1)),
      updated_at=now()
  WHERE id = v_row.id RETURNING * INTO v_row;
  RETURN v_row;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_open_session_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_open_session_poll(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_set_current_poll_question(p_poll_id uuid, p_question_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session uuid; v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_set_current_poll_question: not authenticated'; END IF;
  SELECT p.session_id, p.status INTO v_session, v_status
  FROM public.induction_session_poll p WHERE p.id = p_poll_id;
  IF v_session IS NULL OR NOT public._fn_induction_can_manage_session_pulse(v_session) THEN
    RAISE EXCEPTION 'fn_induction_set_current_poll_question: not allowed'; END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'fn_induction_set_current_poll_question: poll is not open'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.induction_session_poll_question q
                 WHERE q.id = p_question_id AND q.poll_id = p_poll_id) THEN
    RAISE EXCEPTION 'fn_induction_set_current_poll_question: question not in poll'; END IF;
  -- Advancing is host activity: also push the lazy auto-close window forward.
  UPDATE public.induction_session_poll
  SET current_question_id = p_question_id, auto_close_at = now() + interval '240 minutes', updated_at = now()
  WHERE id = p_poll_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_set_current_poll_question(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_set_current_poll_question(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_get_session_poll(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p public.induction_session_poll; v_questions jsonb; v_has_votes boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_get_session_poll: not authenticated'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(p_session_id) THEN
    RAISE EXCEPTION 'fn_induction_get_session_poll: not authorized'; END IF;
  SELECT * INTO v_p FROM public.induction_session_poll WHERE session_id = p_session_id;
  IF v_p.id IS NULL THEN RETURN NULL; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'prompt', q.prompt, 'kind', q.kind, 'position', q.position,
           'options', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.label,'position',o.position) ORDER BY o.position),'[]'::jsonb)
                       FROM public.induction_session_poll_option o WHERE o.question_id = q.id)
         ) ORDER BY q.position),'[]'::jsonb)
  INTO v_questions FROM public.induction_session_poll_question q WHERE q.poll_id = v_p.id;

  SELECT EXISTS(SELECT 1 FROM public.induction_session_poll_vote WHERE poll_id = v_p.id) INTO v_has_votes;

  RETURN jsonb_build_object('id', v_p.id, 'session_id', v_p.session_id, 'status', v_p.status,
    'auto_close_at', v_p.auto_close_at, 'has_votes', v_has_votes,
    'current_question_id', v_p.current_question_id, 'questions', v_questions);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_get_session_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_get_session_poll(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_get_poll_for_answering(p_poll_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_learner uuid; v_current uuid; v_question jsonb; v_mine jsonb; v_index int; v_total int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_get_poll_for_answering: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL OR NOT public._fn_induction_learner_can_answer_poll(p_poll_id, v_learner) THEN
    RAISE EXCEPTION 'fn_induction_get_poll_for_answering: not allowed'; END IF;

  SELECT p.current_question_id INTO v_current FROM public.induction_session_poll p WHERE p.id = p_poll_id;

  SELECT count(*)::int INTO v_total FROM public.induction_session_poll_question q WHERE q.poll_id = p_poll_id;

  IF v_current IS NOT NULL THEN
    SELECT jsonb_build_object(
             'id', q.id, 'prompt', q.prompt, 'kind', q.kind,
             'options', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.label) ORDER BY o.position),'[]'::jsonb)
                         FROM public.induction_session_poll_option o WHERE o.question_id = q.id)),
           (SELECT count(*)::int FROM public.induction_session_poll_question q2
             WHERE q2.poll_id = p_poll_id AND q2.position <= q.position)
    INTO v_question, v_index
    FROM public.induction_session_poll_question q WHERE q.id = v_current AND q.poll_id = p_poll_id;
  END IF;

  SELECT coalesce(jsonb_object_agg(question_id, opts),'{}'::jsonb) INTO v_mine FROM (
    SELECT question_id, jsonb_agg(option_id) AS opts
    FROM public.induction_session_poll_vote
    WHERE poll_id = p_poll_id AND learner_id = v_learner AND question_id = v_current
    GROUP BY question_id
  ) m;

  RETURN jsonb_build_object('poll_id', p_poll_id,
    'questions', CASE WHEN v_question IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_question) END,
    'my_answers', v_mine,
    'current_question_id', v_current, 'question_index', v_index, 'question_total', v_total);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_get_poll_for_answering(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_get_poll_for_answering(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_poll_question_totals_for_learner(p_poll_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_learner uuid; v_current uuid; v_responders int; v_options jsonb; v_prompt text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_poll_question_totals_for_learner: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL OR NOT public._fn_induction_learner_can_answer_poll(p_poll_id, v_learner) THEN
    RAISE EXCEPTION 'fn_induction_poll_question_totals_for_learner: not allowed'; END IF;

  SELECT p.current_question_id INTO v_current FROM public.induction_session_poll p WHERE p.id = p_poll_id;
  IF v_current IS NULL THEN RETURN NULL; END IF;

  SELECT q.prompt INTO v_prompt FROM public.induction_session_poll_question q WHERE q.id = v_current;
  SELECT count(DISTINCT v.learner_id)::int INTO v_responders
  FROM public.induction_session_poll_vote v WHERE v.question_id = v_current;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'label', o.label,
           'count', CASE WHEN v_responders >= 3
                         THEN (SELECT count(*) FROM public.induction_session_poll_vote v
                                WHERE v.question_id = v_current AND v.option_id = o.id)
                         ELSE NULL END
         ) ORDER BY o.position),'[]'::jsonb)
  INTO v_options FROM public.induction_session_poll_option o WHERE o.question_id = v_current;

  RETURN jsonb_build_object('question_id', v_current, 'prompt', v_prompt,
    'response_count', v_responders, 'suppressed', v_responders < 3, 'options', v_options);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_poll_question_totals_for_learner(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_poll_question_totals_for_learner(uuid) TO authenticated;

-- ── Induction poll review fixes (2026-06-30) — see migration 20260630210300 ──
-- 20260630210300_induction_session_polls_review_fixes.sql
-- Final-review fixes for induction session polls:
--   #1 (blocking): scope the upsert's id-path writes to the current poll. An
--      id-bearing question/option whose UPDATE matched NO row in this poll was
--      still reused to inject/relabel options on a FOREIGN poll's question
--      (FK satisfied → INSERT succeeded). Add NOT FOUND guards = tenant-scope check.
--   #2 (privacy): k>=3 suppression was poll-level only, so a question answered by
--      <3 learners had its option counts revealed once the POLL hit 3 responders
--      (de-anonymizing a lone responder). Now also suppress per-question when that
--      question has <3 distinct responders.
--   #8 (hygiene): _fn_induction_learner_can_answer_poll is only called internally by
--      DEFINER functions; revoke it from authenticated so it isn't a direct boolean oracle.

CREATE OR REPLACE FUNCTION public.fn_induction_upsert_session_poll(p_session_id uuid, p_questions jsonb)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event uuid; v_inst uuid; v_poll_id uuid;
  q jsonb; o jsonb; v_qid uuid; v_oid uuid;
  v_keep_q uuid[] := '{}'; v_keep_o uuid[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: not authenticated'; END IF;
  SELECT es.event_id, ip.institution_id INTO v_event, v_inst
  FROM public.event_sessions es JOIN public.induction_programs ip ON ip.event_id = es.event_id
  WHERE es.id = p_session_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: not an induction session'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(p_session_id) THEN
    RAISE EXCEPTION 'fn_induction_upsert_session_poll: not authorized'; END IF;

  INSERT INTO public.induction_session_poll (session_id, event_id, institution_id, created_by)
  VALUES (p_session_id, v_event, v_inst, auth.uid())
  ON CONFLICT (session_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_poll_id;

  FOR q IN SELECT value FROM jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) LOOP
    IF nullif(q->>'id','') IS NOT NULL THEN
      v_qid := (q->>'id')::uuid;
      UPDATE public.induction_session_poll_question
      SET prompt = q->>'prompt', kind = coalesce(q->>'kind','single'),
          position = coalesce((q->>'position')::int, 0)
      WHERE id = v_qid AND poll_id = v_poll_id;
      -- #1: reject an id that does not belong to THIS poll (no cross-poll writes).
      IF NOT FOUND THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: question id % is not in this poll', v_qid; END IF;
    ELSE
      INSERT INTO public.induction_session_poll_question (poll_id, prompt, kind, position)
      VALUES (v_poll_id, q->>'prompt', coalesce(q->>'kind','single'), coalesce((q->>'position')::int,0))
      RETURNING id INTO v_qid;
    END IF;
    v_keep_q := array_append(v_keep_q, v_qid);

    v_keep_o := '{}';
    FOR o IN SELECT value FROM jsonb_array_elements(coalesce(q->'options','[]'::jsonb)) LOOP
      IF nullif(o->>'id','') IS NOT NULL THEN
        v_oid := (o->>'id')::uuid;
        UPDATE public.induction_session_poll_option
        SET label = o->>'label', position = coalesce((o->>'position')::int,0)
        WHERE id = v_oid AND question_id = v_qid;
        -- #1: reject an option id that does not belong to THIS question.
        IF NOT FOUND THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: option id % is not in this question', v_oid; END IF;
      ELSE
        INSERT INTO public.induction_session_poll_option (question_id, label, position)
        VALUES (v_qid, o->>'label', coalesce((o->>'position')::int,0))
        RETURNING id INTO v_oid;
      END IF;
      v_keep_o := array_append(v_keep_o, v_oid);
    END LOOP;

    IF EXISTS (
      SELECT 1 FROM public.induction_session_poll_option opt
      JOIN public.induction_session_poll_vote v ON v.option_id = opt.id
      WHERE opt.question_id = v_qid AND NOT (opt.id = ANY(v_keep_o))
    ) THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: cannot delete an option that already has votes'; END IF;
    DELETE FROM public.induction_session_poll_option
    WHERE question_id = v_qid AND NOT (id = ANY(v_keep_o));
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.induction_session_poll_question qq
    JOIN public.induction_session_poll_vote v ON v.question_id = qq.id
    WHERE qq.poll_id = v_poll_id AND NOT (qq.id = ANY(v_keep_q))
  ) THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: cannot delete a question that already has votes'; END IF;
  DELETE FROM public.induction_session_poll_question
  WHERE poll_id = v_poll_id AND NOT (id = ANY(v_keep_q));

  RETURN v_poll_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_upsert_session_poll(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_upsert_session_poll(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_session_poll_totals(p_poll_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_p public.induction_session_poll; v_batch uuid; v_enrolled int; v_responses int;
  v_suppress boolean; v_k constant int := 3; v_questions jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_session_poll_totals: not authenticated'; END IF;
  SELECT * INTO v_p FROM public.induction_session_poll WHERE id = p_poll_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'fn_induction_session_poll_totals: no such poll'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(v_p.session_id) THEN
    RAISE EXCEPTION 'fn_induction_session_poll_totals: not authorized'; END IF;

  IF v_p.status = 'open' AND v_p.auto_close_at IS NOT NULL AND v_p.auto_close_at < now() THEN
    UPDATE public.induction_session_poll SET status='closed', updated_at=now() WHERE id = v_p.id;
    v_p.status := 'closed';
  END IF;

  SELECT es.batch_id INTO v_batch FROM public.event_sessions es WHERE es.id = v_p.session_id;
  SELECT count(*)::int INTO v_enrolled FROM public.induction_enrollment ie
  WHERE ie.event_id = v_p.event_id AND (v_batch IS NULL OR ie.batch_id = v_batch);

  SELECT count(DISTINCT learner_id)::int INTO v_responses
  FROM public.induction_session_poll_vote WHERE poll_id = v_p.id;
  v_suppress := (v_responses < v_k);

  -- #2: per-question suppression. q_resp = distinct learners who answered THIS question;
  -- option counts are nulled when the poll is suppressed OR the question has < k responders.
  SELECT coalesce(jsonb_agg(qx.obj ORDER BY qx.position),'[]'::jsonb) INTO v_questions FROM (
    SELECT q.position,
      jsonb_build_object(
        'id', q.id, 'prompt', q.prompt, 'kind', q.kind,
        'response_count', q_resp.cnt,
        'options', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', o.id, 'label', o.label,
            'count', CASE WHEN v_suppress OR q_resp.cnt < v_k THEN NULL
                         ELSE (SELECT count(*) FROM public.induction_session_poll_vote v WHERE v.option_id = o.id) END
          ) ORDER BY o.position),'[]'::jsonb)
          FROM public.induction_session_poll_option o WHERE o.question_id = q.id)
      ) AS obj
    FROM public.induction_session_poll_question q
    CROSS JOIN LATERAL (
      SELECT count(DISTINCT v.learner_id)::int AS cnt
      FROM public.induction_session_poll_vote v WHERE v.question_id = q.id
    ) q_resp
    WHERE q.poll_id = v_p.id
  ) qx;

  RETURN jsonb_build_object('status', v_p.status, 'auto_close_at', v_p.auto_close_at,
    'enrolled_count', v_enrolled, 'response_count', v_responses, 'suppressed', v_suppress,
    'questions', v_questions);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_poll_totals(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_poll_totals(uuid) TO authenticated;

-- #8: the gate helper is internal-only (called by the DEFINER answer/submit fns).
REVOKE EXECUTE ON FUNCTION public._fn_induction_learner_can_answer_poll(uuid, uuid) FROM authenticated;

-- ── Induction multi-target enrollment engine (2026-06-30) — first appearance of fn_induction_* in this file ──
-- Migration: 20260630220100_induction_multi_target_rpcs.sql

-- helper: does the caller have induction.manage access to EVERY institution in arr?
CREATE OR REPLACE FUNCTION public._fn_induction_can_target_institutions(p_ids uuid[])
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(array_length(p_ids,1),0) = 0 THEN RETURN false; END IF;
  IF is_super_admin() OR is_admin() THEN RETURN true; END IF;
  IF NOT user_has_permission('induction.manage') THEN RETURN false; END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM unnest(coalesce(p_ids,'{}'::uuid[])) x(iid)
    WHERE NOT role_has_institution_access(x.iid));
END $$;
REVOKE EXECUTE ON FUNCTION public._fn_induction_can_target_institutions(uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._fn_induction_can_target_institutions(uuid[]) TO authenticated;

-- CREATE PROGRAM (adds the 3 array params; owning institution_id = target_institution_ids[1])
CREATE OR REPLACE FUNCTION public.fn_induction_create_program(
  p_institution_id uuid, p_academic_year_id uuid, p_name text,
  p_start_date timestamptz, p_end_date timestamptz, p_venue_text text DEFAULT 'Campus',
  p_description text DEFAULT NULL, p_admission_year integer DEFAULT NULL,
  p_enroll_scope text DEFAULT 'institution', p_venue_resource_id uuid DEFAULT NULL,
  p_degree_type_filter text DEFAULT NULL,
  p_institution_ids uuid[] DEFAULT NULL, p_degree_ids uuid[] DEFAULT NULL, p_department_ids uuid[] DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event_id uuid; v_slug text;
  v_scope text := COALESCE(NULLIF(p_enroll_scope,''),'institution');
  v_degree text := NULLIF(p_degree_type_filter,'');
  v_multi boolean := (p_institution_ids IS NOT NULL AND cardinality(p_institution_ids) > 0);
  v_owning uuid := CASE WHEN v_multi THEN p_institution_ids[1] ELSE p_institution_id END;
BEGIN
  IF v_multi THEN
    IF NOT public._fn_induction_can_target_institutions(p_institution_ids) THEN
      RAISE EXCEPTION 'fn_induction_create_program: not authorized for one or more selected institutions'; END IF;
  ELSE
    IF NOT (is_super_admin() OR is_admin()
            OR (user_has_permission('induction.manage') AND role_has_institution_access(p_institution_id))) THEN
      RAISE EXCEPTION 'fn_induction_create_program: not authorized'; END IF;
  END IF;
  IF v_owning IS NULL OR p_name IS NULL THEN
    RAISE EXCEPTION 'fn_induction_create_program: institution and name are required'; END IF;
  IF v_scope NOT IN ('institution','group') THEN
    RAISE EXCEPTION 'fn_induction_create_program: enroll_scope must be institution or group'; END IF;
  IF v_degree IS NOT NULL AND v_degree NOT IN ('ug','pg') THEN
    RAISE EXCEPTION 'fn_induction_create_program: degree_type_filter must be ug, pg, or null'; END IF;

  v_slug := lower(regexp_replace(coalesce(p_name,'induction'), '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);

  INSERT INTO public.events (institution_id, event_type, name, slug, venue_text, venue_resource_id,
                             start_date, end_date, description, status, created_by)
  VALUES (v_owning, 'induction', p_name, v_slug,
          CASE WHEN p_venue_resource_id IS NOT NULL THEN NULLIF(p_venue_text,'Campus') ELSE coalesce(p_venue_text,'Campus') END,
          p_venue_resource_id, p_start_date, p_end_date, p_description, 'draft', auth.uid())
  RETURNING id INTO v_event_id;

  INSERT INTO public.induction_programs (event_id, institution_id, academic_year_id, admission_year,
    enroll_scope, degree_type_filter, target_institution_ids, target_degree_ids, target_department_ids)
  VALUES (v_event_id, v_owning, p_academic_year_id, p_admission_year, v_scope, v_degree,
          CASE WHEN v_multi THEN p_institution_ids ELSE NULL END,
          NULLIF(p_degree_ids, '{}'::uuid[]),
          NULLIF(p_department_ids, '{}'::uuid[]));

  RETURN v_event_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_create_program(uuid,uuid,text,timestamptz,timestamptz,text,text,integer,text,uuid,text,uuid[],uuid[],uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_create_program(uuid,uuid,text,timestamptz,timestamptz,text,text,integer,text,uuid,text,uuid[],uuid[],uuid[]) TO authenticated;

-- PREVIEW (adds 3 array params + by_department; array branch vs legacy branch)
CREATE OR REPLACE FUNCTION public.fn_induction_preview_enroll(
  p_institution_id uuid, p_admission_year integer, p_enroll_scope text DEFAULT 'institution',
  p_degree_type_filter text DEFAULT NULL, p_program_ids uuid[] DEFAULT NULL,
  p_institution_ids uuid[] DEFAULT NULL, p_degree_ids uuid[] DEFAULT NULL, p_department_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_scope text := COALESCE(NULLIF(p_enroll_scope,''),'institution');
  v_multi boolean := (p_institution_ids IS NOT NULL AND cardinality(p_institution_ids) > 0);
  v_result jsonb;
BEGIN
  IF v_multi THEN
    IF NOT public._fn_induction_can_target_institutions(p_institution_ids) THEN
      RAISE EXCEPTION 'fn_induction_preview_enroll: not authorized for one or more selected institutions'; END IF;
  ELSE
    IF NOT (is_super_admin() OR is_admin()
            OR (user_has_permission('induction.manage') AND role_has_institution_access(p_institution_id))) THEN
      RAISE EXCEPTION 'fn_induction_preview_enroll: not authorized'; END IF;
  END IF;
  IF p_admission_year IS NULL THEN RAISE EXCEPTION 'fn_induction_preview_enroll: admission_year required'; END IF;

  WITH matched AS (
    SELECT lp.id, lp.institution_id, lp.program_id, lp.department_id, d.degree_type, lp.lifecycle_status,
           TRIM(CONCAT(lp.first_name,' ',COALESCE(lp.last_name,''))) AS full_name
    FROM public.learners_profiles lp
    JOIN public.admission_years ay ON ay.id = lp.admission_year_id
    LEFT JOIN public.degrees d ON d.id = lp.degree_id
    WHERE ay.year = p_admission_year
      AND lp.lifecycle_status IN ('reserved','admitted','account')
      AND (
        (v_multi AND lp.institution_id = ANY(p_institution_ids)
           AND (p_degree_ids IS NULL OR cardinality(p_degree_ids)=0 OR lp.degree_id = ANY(p_degree_ids))
           AND (p_department_ids IS NULL OR cardinality(p_department_ids)=0 OR lp.department_id = ANY(p_department_ids)))
        OR
        (NOT v_multi AND (v_scope='group' OR lp.institution_id = p_institution_id)
           AND (p_degree_type_filter IS NULL OR d.degree_type = p_degree_type_filter)
           AND (p_program_ids IS NULL OR lp.program_id = ANY(p_program_ids)))
      ))
  SELECT jsonb_build_object(
    'total',(SELECT count(*) FROM matched),'scope',CASE WHEN v_multi THEN 'targeted' ELSE v_scope END,
    'degree_type_filter',p_degree_type_filter,
    'by_institution',(SELECT coalesce(jsonb_agg(jsonb_build_object('institution',institution,'count',cnt) ORDER BY cnt DESC),'[]'::jsonb)
       FROM (SELECT i.name AS institution,count(*) cnt FROM matched m LEFT JOIN public.institutions i ON i.id=m.institution_id GROUP BY i.name) a),
    'by_program',(SELECT coalesce(jsonb_agg(jsonb_build_object('program',program,'degree_type',degree_type,'count',cnt) ORDER BY cnt DESC),'[]'::jsonb)
       FROM (SELECT coalesce(p.program_name,'(no program)') program,m.degree_type,count(*) cnt FROM matched m LEFT JOIN public.programs p ON p.id=m.program_id GROUP BY p.program_name,m.degree_type) b),
    'by_department',(SELECT coalesce(jsonb_agg(jsonb_build_object('department',department,'count',cnt) ORDER BY cnt DESC),'[]'::jsonb)
       FROM (SELECT coalesce(dep.department_name,'(no department)') department,count(*) cnt FROM matched m LEFT JOIN public.departments dep ON dep.id=m.department_id GROUP BY dep.department_name) e),
    'sample',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',full_name,'status',lifecycle_status)),'[]'::jsonb)
       FROM (SELECT full_name,lifecycle_status FROM matched ORDER BY full_name LIMIT 15) c)
  ) INTO v_result; RETURN v_result;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_preview_enroll(uuid,integer,text,text,uuid[],uuid[],uuid[],uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_preview_enroll(uuid,integer,text,text,uuid[],uuid[],uuid[],uuid[]) TO authenticated;

-- AUTO-ENROLL (reads target arrays; array branch vs legacy branch)
CREATE OR REPLACE FUNCTION public.fn_induction_auto_enroll(p_event_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inst uuid; v_year integer; v_scope text; v_degree_filter text;
  v_inst_ids uuid[]; v_degree_ids uuid[]; v_dept_ids uuid[];
  v_multi boolean; v_count integer;
BEGIN
  SELECT institution_id, admission_year, enroll_scope, degree_type_filter,
         target_institution_ids, target_degree_ids, target_department_ids
    INTO v_inst, v_year, v_scope, v_degree_filter, v_inst_ids, v_degree_ids, v_dept_ids
  FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_auto_enroll: induction program not found for event %', p_event_id; END IF;
  v_multi := (v_inst_ids IS NOT NULL AND cardinality(v_inst_ids) > 0);

  IF v_multi THEN
    IF NOT public._fn_induction_can_target_institutions(v_inst_ids) THEN
      RAISE EXCEPTION 'fn_induction_auto_enroll: not authorized'; END IF;
  ELSE
    IF NOT (is_super_admin() OR is_admin()
            OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))) THEN
      RAISE EXCEPTION 'fn_induction_auto_enroll: not authorized'; END IF;
  END IF;
  IF v_year IS NULL THEN RAISE EXCEPTION 'fn_induction_auto_enroll: induction has no admission_year set'; END IF;

  INSERT INTO public.induction_enrollment (event_id, learner_id, institution_id, source)
  SELECT p_event_id, lp.id, lp.institution_id, 'auto_admission_year'
  FROM public.learners_profiles lp
  JOIN public.admission_years ay ON ay.id = lp.admission_year_id
  LEFT JOIN public.degrees d ON d.id = lp.degree_id
  WHERE ay.year = v_year
    AND lp.lifecycle_status IN ('reserved','admitted','account')
    AND (
      (v_multi AND lp.institution_id = ANY(v_inst_ids)
         AND (v_degree_ids IS NULL OR cardinality(v_degree_ids)=0 OR lp.degree_id = ANY(v_degree_ids))
         AND (v_dept_ids IS NULL OR cardinality(v_dept_ids)=0 OR lp.department_id = ANY(v_dept_ids)))
      OR
      (NOT v_multi AND (v_scope='group' OR lp.institution_id = v_inst)
         AND (v_degree_filter IS NULL OR d.degree_type = v_degree_filter))
    )
  ON CONFLICT (event_id, learner_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_auto_enroll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_auto_enroll(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
-- =====================================================================
-- 2026-06-30 — Schools Network module (DB substrate, Agent A)
-- Migration: supabase/migrations/20260630120000_schools_network_substrate.sql
-- Spec: /tmp/schools-network-spec.md
-- 3 helper fns + 11 service RPCs. All SECURITY DEFINER + REVOKE anon/PUBLIC +
-- GRANT authenticated (per 2026-06-06 mandatory rule).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.user_owns_school(p_school_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_jkkn_owners
     WHERE school_id = p_school_id AND jkkn_user_id = auth.uid() AND is_active = TRUE
  );
$$;
REVOKE EXECUTE ON FUNCTION public.user_owns_school(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_owns_school(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_leads_partner_for_school(p_school_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.school_jkkn_owners owner_link
      JOIN public.school_jkkn_owners partner_lead
        ON partner_lead.program_partner_id = owner_link.program_partner_id
       AND partner_lead.role = 'program_lead'
       AND partner_lead.jkkn_user_id = auth.uid()
       AND partner_lead.is_active = TRUE
     WHERE owner_link.school_id = p_school_id
       AND owner_link.is_active = TRUE
       AND owner_link.program_partner_id IS NOT NULL
    UNION ALL
    SELECT 1
      FROM public.school_sessions s
      JOIN public.school_jkkn_owners pl
        ON pl.program_partner_id = s.program_partner_id
       AND pl.role = 'program_lead'
       AND pl.jkkn_user_id = auth.uid()
       AND pl.is_active = TRUE
     WHERE s.school_id = p_school_id
       AND s.program_partner_id IS NOT NULL
  );
$$;
REVOKE EXECUTE ON FUNCTION public.user_leads_partner_for_school(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_leads_partner_for_school(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_school_portal_user_for(p_school_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.school_contacts sc
      JOIN auth.users u ON lower(u.email) = lower(sc.email)
      JOIN public.school_contact_roles r ON r.id = sc.role_id
     WHERE sc.school_id = p_school_id AND u.id = auth.uid() AND r.can_login_to_portal = TRUE
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_school_portal_user_for(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_school_portal_user_for(UUID) TO authenticated;

-- 11 service RPCs (per CLAUDE.md "Functions: ONLY in 02_functions.sql"):

CREATE OR REPLACE FUNCTION public.fn_schools_list(
  p_search             TEXT    DEFAULT NULL,
  p_ownership          TEXT    DEFAULT NULL,
  p_status             TEXT    DEFAULT NULL,
  p_state              TEXT    DEFAULT NULL,
  p_district           TEXT    DEFAULT NULL,
  p_program_partner_id UUID    DEFAULT NULL,
  p_jkkn_user_id       UUID    DEFAULT NULL,
  p_limit              INTEGER DEFAULT 50,
  p_offset             INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID, name TEXT, ownership school_ownership, district TEXT, state TEXT,
  status school_status, intake_year INTEGER,
  primary_owner_user_id UUID, primary_owner_name TEXT,
  program_partner_id UUID, program_partner_name TEXT,
  last_session_at TIMESTAMPTZ, session_count INTEGER,
  total_contribution_inr NUMERIC, total_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total BIGINT;
BEGIN
  SELECT count(*)::bigint INTO v_total
    FROM public.schools s
    LEFT JOIN public.school_jkkn_owners o ON o.school_id = s.id AND o.is_active = TRUE
   WHERE (p_search IS NULL OR s.name ILIKE '%' || p_search || '%' OR coalesce(s.district,'') ILIKE '%' || p_search || '%')
     AND (p_ownership IS NULL OR s.ownership::text = p_ownership)
     AND (p_status IS NULL OR s.status::text = p_status)
     AND (p_state IS NULL OR s.state = p_state)
     AND (p_district IS NULL OR s.district = p_district)
     AND (p_program_partner_id IS NULL OR o.program_partner_id = p_program_partner_id)
     AND (p_jkkn_user_id IS NULL OR o.jkkn_user_id = p_jkkn_user_id);

  RETURN QUERY
  WITH filtered AS (
    SELECT DISTINCT s.id, s.name, s.ownership, s.district, s.state, s.status, s.intake_year
      FROM public.schools s
      LEFT JOIN public.school_jkkn_owners o ON o.school_id = s.id AND o.is_active = TRUE
     WHERE (p_search IS NULL OR s.name ILIKE '%' || p_search || '%' OR coalesce(s.district,'') ILIKE '%' || p_search || '%')
       AND (p_ownership IS NULL OR s.ownership::text = p_ownership)
       AND (p_status IS NULL OR s.status::text = p_status)
       AND (p_state IS NULL OR s.state = p_state)
       AND (p_district IS NULL OR s.district = p_district)
       AND (p_program_partner_id IS NULL OR o.program_partner_id = p_program_partner_id)
       AND (p_jkkn_user_id IS NULL OR o.jkkn_user_id = p_jkkn_user_id)
  ),
  primary_owner AS (
    SELECT DISTINCT ON (o.school_id) o.school_id, o.jkkn_user_id, o.program_partner_id, p.full_name AS owner_name
      FROM public.school_jkkn_owners o
      LEFT JOIN public.profiles p ON p.id = o.jkkn_user_id
     WHERE o.is_active = TRUE
     ORDER BY o.school_id, CASE WHEN o.role = 'outreach_coordinator' THEN 0 ELSE 1 END, o.assigned_at DESC
  ),
  session_stats AS (
    SELECT school_id, max(conducted_at) AS last_session_at, count(*)::int AS session_count
      FROM public.school_sessions GROUP BY school_id
  ),
  contrib_stats AS (
    SELECT school_id, coalesce(sum(value_inr), 0)::numeric AS total_contribution_inr
      FROM public.school_contributions GROUP BY school_id
  )
  SELECT f.id, f.name, f.ownership, f.district, f.state, f.status, f.intake_year,
         po.jkkn_user_id, po.owner_name, po.program_partner_id, pp.name,
         ss.last_session_at, coalesce(ss.session_count, 0),
         coalesce(cs.total_contribution_inr, 0)::numeric, v_total
    FROM filtered f
    LEFT JOIN primary_owner po ON po.school_id = f.id
    LEFT JOIN public.program_partners pp ON pp.id = po.program_partner_id
    LEFT JOIN session_stats ss ON ss.school_id = f.id
    LEFT JOIN contrib_stats cs ON cs.school_id = f.id
   ORDER BY f.name LIMIT p_limit OFFSET p_offset;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_schools_list(TEXT,TEXT,TEXT,TEXT,TEXT,UUID,UUID,INTEGER,INTEGER) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_list(TEXT,TEXT,TEXT,TEXT,TEXT,UUID,UUID,INTEGER,INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_school_detail(p_school_id UUID)
RETURNS TABLE (school JSONB, owners JSONB, contacts JSONB, recent_sessions JSONB, contribution_count INTEGER, contribution_total NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_jsonb(s.*),
    coalesce((SELECT jsonb_agg(o ORDER BY o.assigned_at DESC) FROM (
      SELECT o.id, o.school_id, o.jkkn_user_id, p.full_name AS jkkn_user_name,
             o.role, o.program_partner_id, pp.name AS program_partner_name,
             o.assigned_at, o.assigned_by, o.is_active
        FROM public.school_jkkn_owners o
        LEFT JOIN public.profiles p ON p.id = o.jkkn_user_id
        LEFT JOIN public.program_partners pp ON pp.id = o.program_partner_id
       WHERE o.school_id = p_school_id AND o.is_active = TRUE) o), '[]'::jsonb),
    coalesce((SELECT jsonb_agg(c ORDER BY c.is_primary DESC, c.name) FROM (
      SELECT sc.id, sc.school_id, sc.role_id, r.code AS role_code, r.label AS role_label,
             sc.name, sc.phone, sc.email, sc.is_primary, sc.notes, sc.created_at, sc.updated_at
        FROM public.school_contacts sc
        LEFT JOIN public.school_contact_roles r ON r.id = sc.role_id
       WHERE sc.school_id = p_school_id) c), '[]'::jsonb),
    coalesce((SELECT jsonb_agg(ss ORDER BY ss.conducted_at DESC) FROM (
      SELECT ses.id, ses.school_id, ses.session_type_id, st.code AS session_type_code, st.label AS session_type_label,
             ses.conducted_at, ses.conducted_by_user_id, p.full_name AS conducted_by_name,
             ses.program_partner_id, pp.name AS program_partner_name,
             ses.attendee_count, ses.topic, ses.notes, ses.attachments, ses.metadata,
             ses.created_at, ses.updated_at
        FROM public.school_sessions ses
        LEFT JOIN public.school_session_types st ON st.id = ses.session_type_id
        LEFT JOIN public.profiles p ON p.id = ses.conducted_by_user_id
        LEFT JOIN public.program_partners pp ON pp.id = ses.program_partner_id
       WHERE ses.school_id = p_school_id
       ORDER BY ses.conducted_at DESC LIMIT 10) ss), '[]'::jsonb),
    (SELECT count(*)::int FROM public.school_contributions WHERE school_id = p_school_id),
    coalesce((SELECT sum(value_inr) FROM public.school_contributions WHERE school_id = p_school_id), 0)::numeric
  FROM public.schools s WHERE s.id = p_school_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_school_detail(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_school_detail(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_school_session_record(
  p_school_id UUID, p_session_type_code TEXT, p_conducted_at TIMESTAMPTZ,
  p_attendee_count INTEGER DEFAULT 0, p_program_partner_id UUID DEFAULT NULL,
  p_topic TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL, p_attachments JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_type_id UUID; v_session_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  SELECT id INTO v_type_id FROM public.school_session_types WHERE code = p_session_type_code AND is_active = TRUE;
  IF v_type_id IS NULL THEN RAISE EXCEPTION 'unknown session_type_code: %', p_session_type_code USING ERRCODE = '22023'; END IF;
  IF NOT (is_super_admin() OR is_admin() OR
          (user_has_permission('schools_network.sessions.create') AND
           (user_owns_school(p_school_id) OR user_leads_partner_for_school(p_school_id)))) THEN
    RAISE EXCEPTION 'not authorized to record session for school %', p_school_id USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.school_sessions
    (school_id, session_type_id, conducted_at, conducted_by_user_id, program_partner_id, attendee_count, topic, notes, attachments)
  VALUES (p_school_id, v_type_id, p_conducted_at, auth.uid(), p_program_partner_id,
          coalesce(p_attendee_count, 0), p_topic, p_notes, coalesce(p_attachments, '[]'::jsonb))
  RETURNING id INTO v_session_id;
  RETURN v_session_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_school_session_record(UUID,TEXT,TIMESTAMPTZ,INTEGER,UUID,TEXT,TEXT,JSONB) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_school_session_record(UUID,TEXT,TIMESTAMPTZ,INTEGER,UUID,TEXT,TEXT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_school_contribution_record(
  p_school_id UUID, p_kind school_contribution_kind, p_description TEXT,
  p_value_inr NUMERIC DEFAULT NULL, p_delivered_at DATE DEFAULT NULL,
  p_program_partner_id UUID DEFAULT NULL, p_evidence_url TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  IF NOT (is_super_admin() OR is_admin() OR
          (user_has_permission('schools_network.contributions.create') AND
           (user_owns_school(p_school_id) OR user_leads_partner_for_school(p_school_id)))) THEN
    RAISE EXCEPTION 'not authorized to record contribution for school %', p_school_id USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.school_contributions
    (school_id, kind, description, value_inr, delivered_at, program_partner_id, evidence_url, created_by)
  VALUES (p_school_id, p_kind, p_description, p_value_inr, p_delivered_at, p_program_partner_id, p_evidence_url, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_school_contribution_record(UUID,school_contribution_kind,TEXT,NUMERIC,DATE,UUID,TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_school_contribution_record(UUID,school_contribution_kind,TEXT,NUMERIC,DATE,UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_school_assign_owner(
  p_school_id UUID, p_jkkn_user_id UUID, p_role school_owner_role, p_program_partner_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('schools_network.owners.manage')) THEN
    RAISE EXCEPTION 'not authorized to assign owners' USING ERRCODE = '42501';
  END IF;
  IF p_role = 'program_lead' AND p_program_partner_id IS NULL THEN
    RAISE EXCEPTION 'program_lead role requires p_program_partner_id' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.school_jkkn_owners
    (school_id, jkkn_user_id, role, program_partner_id, assigned_by, is_active)
  VALUES (p_school_id, p_jkkn_user_id, p_role, p_program_partner_id, auth.uid(), TRUE)
  ON CONFLICT (school_id, jkkn_user_id, role, COALESCE(program_partner_id::text, '')) WHERE is_active = TRUE
    DO UPDATE SET assigned_at = now(), assigned_by = auth.uid(), updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_school_assign_owner(UUID,UUID,school_owner_role,UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_school_assign_owner(UUID,UUID,school_owner_role,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_school_revoke_owner(p_owner_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('schools_network.owners.manage')) THEN
    RAISE EXCEPTION 'not authorized to revoke owners' USING ERRCODE = '42501';
  END IF;
  UPDATE public.school_jkkn_owners SET is_active = FALSE, updated_at = now()
   WHERE id = p_owner_id AND is_active = TRUE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_school_revoke_owner(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_school_revoke_owner(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_program_partner_rollup(p_program_partner_id UUID)
RETURNS TABLE (
  partner_id UUID, partner_name TEXT, schools_touched INTEGER, sessions_count INTEGER,
  attendees_total INTEGER, contributions_count INTEGER, contributions_inr NUMERIC,
  grants_received_inr NUMERIC, grants_outstanding_inr NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT pp.id, pp.name,
    (SELECT count(DISTINCT school_id)::int FROM (
       SELECT school_id FROM public.school_jkkn_owners WHERE program_partner_id = pp.id AND is_active = TRUE
       UNION SELECT school_id FROM public.school_sessions WHERE program_partner_id = pp.id
       UNION SELECT school_id FROM public.school_contributions WHERE program_partner_id = pp.id) u),
    (SELECT count(*)::int FROM public.school_sessions WHERE program_partner_id = pp.id),
    coalesce((SELECT sum(attendee_count)::int FROM public.school_sessions WHERE program_partner_id = pp.id), 0),
    (SELECT count(*)::int FROM public.school_contributions WHERE program_partner_id = pp.id),
    coalesce((SELECT sum(value_inr) FROM public.school_contributions WHERE program_partner_id = pp.id), 0)::numeric,
    coalesce((SELECT sum(amount_inr) FROM public.program_partner_grants WHERE program_partner_id = pp.id), 0)::numeric,
    GREATEST(coalesce((SELECT sum(amount_inr) FROM public.program_partner_grants WHERE program_partner_id = pp.id), 0)
             - coalesce((SELECT sum(value_inr) FROM public.school_contributions WHERE program_partner_id = pp.id), 0), 0)::numeric
  FROM public.program_partners pp WHERE pp.id = p_program_partner_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_program_partner_rollup(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_program_partner_rollup(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_schools_silence_candidates(p_silence_days INTEGER DEFAULT 14)
RETURNS TABLE (school_id UUID, school_name TEXT, last_session_at TIMESTAMPTZ, days_silent INTEGER, primary_owner_user_id UUID)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH last_seen AS (
    SELECT s.id, s.name, s.status,
           (SELECT max(conducted_at) FROM public.school_sessions ss WHERE ss.school_id = s.id) AS last_at
      FROM public.schools s WHERE s.status IN ('active','sustaining')
  ),
  primary_owner AS (
    SELECT DISTINCT ON (o.school_id) o.school_id, o.jkkn_user_id
      FROM public.school_jkkn_owners o WHERE o.is_active = TRUE
     ORDER BY o.school_id, CASE WHEN o.role = 'outreach_coordinator' THEN 0 ELSE 1 END, o.assigned_at DESC
  )
  SELECT ls.id, ls.name, ls.last_at,
         CASE WHEN ls.last_at IS NULL THEN p_silence_days ELSE EXTRACT(DAY FROM now() - ls.last_at)::int END,
         po.jkkn_user_id
    FROM last_seen ls LEFT JOIN primary_owner po ON po.school_id = ls.id
   WHERE ls.last_at IS NULL OR ls.last_at < now() - (p_silence_days || ' days')::interval;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_schools_silence_candidates(INTEGER) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_silence_candidates(INTEGER) TO authenticated;

-- STUB — thresholds pending Director input (see spec §12).
CREATE OR REPLACE FUNCTION public.fn_schools_recompute_status(p_school_id UUID DEFAULT NULL)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_school_id IS NULL THEN RETURN 0; ELSE RETURN 0; END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_schools_recompute_status(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_recompute_status(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_school_portal_self()
RETURNS TABLE (school JSONB, recent_sessions JSONB, contribution_count INTEGER, contribution_total NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  SELECT sc.school_id INTO v_school_id
    FROM public.school_contacts sc
    JOIN auth.users u ON lower(u.email) = lower(sc.email)
    JOIN public.school_contact_roles r ON r.id = sc.role_id
   WHERE u.id = auth.uid() AND r.can_login_to_portal = TRUE
   ORDER BY sc.is_primary DESC, sc.created_at DESC LIMIT 1;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'no school associated with this portal session' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT to_jsonb(s.*),
    coalesce((SELECT jsonb_agg(ss ORDER BY ss.conducted_at DESC) FROM (
      SELECT ses.id, ses.session_type_id, st.code AS session_type_code, st.label AS session_type_label,
             ses.conducted_at, ses.attendee_count, ses.topic, ses.notes
        FROM public.school_sessions ses
        LEFT JOIN public.school_session_types st ON st.id = ses.session_type_id
       WHERE ses.school_id = v_school_id
       ORDER BY ses.conducted_at DESC LIMIT 5) ss), '[]'::jsonb),
    (SELECT count(*)::int FROM public.school_contributions WHERE school_id = v_school_id),
    coalesce((SELECT sum(value_inr) FROM public.school_contributions WHERE school_id = v_school_id), 0)::numeric
  FROM public.schools s WHERE s.id = v_school_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_school_portal_self() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_school_portal_self() TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_school_portal_submit_update(p_message TEXT, p_attachments JSONB DEFAULT '[]'::jsonb)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school_id UUID; v_type_id UUID; v_session_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  SELECT sc.school_id INTO v_school_id
    FROM public.school_contacts sc
    JOIN auth.users u ON lower(u.email) = lower(sc.email)
    JOIN public.school_contact_roles r ON r.id = sc.role_id
   WHERE u.id = auth.uid() AND r.can_login_to_portal = TRUE
   ORDER BY sc.is_primary DESC, sc.created_at DESC LIMIT 1;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'no school associated with this portal session' USING ERRCODE = '42501'; END IF;
  SELECT id INTO v_type_id FROM public.school_session_types WHERE code = 'drop_by' AND is_active = TRUE;
  IF v_type_id IS NULL THEN RAISE EXCEPTION 'master row school_session_types.code=drop_by missing' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.school_sessions
    (school_id, session_type_id, conducted_at, conducted_by_user_id, attendee_count, notes, attachments, metadata)
  VALUES (v_school_id, v_type_id, now(), auth.uid(), 0, p_message, coalesce(p_attachments, '[]'::jsonb), jsonb_build_object('source','hm_portal'))
  RETURNING id INTO v_session_id;
  RETURN v_session_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_school_portal_submit_update(TEXT, JSONB) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_school_portal_submit_update(TEXT, JSONB) TO authenticated;

-- ============================================================================
-- Fresher Induction — Day-level attendance (bulk mark, fans out to sessions)
-- Migration: supabase/migrations/20260730100000_induction_day_attendance.sql
-- Adds 2 DEFINER + anon-revoked RPCs alongside the existing per-session ones
-- (fn_induction_session_roster / fn_induction_mark_attendance, phase 2a):
--   fn_induction_day_roster          — learners eligible for ANY session on a
--                                      day, + whether their existing per-session
--                                      marks for that day are uniform
--                                      (prefillable) or mixed (left blank).
--   fn_induction_mark_day_attendance — bulk-writes the SAME status into EVERY
--                                      session that day applicable to the
--                                      learner's batch, then recomputes
--                                      completion. Attendance storage stays
--                                      session-scoped; this is a marking-UX
--                                      convenience, not a new data model.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_induction_day_roster(p_event_id UUID, p_day_number INTEGER)
RETURNS TABLE (
  learner_id      UUID,
  name            TEXT,
  register_number TEXT,
  batch_label     TEXT,
  status          TEXT,     -- the uniform status across the day's sessions, or NULL
  is_mixed        BOOLEAN   -- true when the learner's sessions that day carry DIFFERENT statuses
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_day_roster: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_day_roster: not authorized';
  END IF;

  RETURN QUERY
  WITH day_sessions AS (
    SELECT s.id, s.batch_id FROM public.event_sessions s
    -- day_number is nullable (NULL = the "Unscheduled" bucket the UI shows as
    -- day 0) — IS NOT DISTINCT FROM matches NULL rows a plain `=` would silently drop.
    WHERE s.event_id = p_event_id AND s.day_number IS NOT DISTINCT FROM p_day_number
  ),
  eligible AS (
    -- a learner is on the day roster if at least one of the day's sessions
    -- applies to their batch (combined batch_id IS NULL, or an exact match)
    SELECT DISTINCT e.learner_id
    FROM public.induction_enrollment e
    JOIN day_sessions ds ON ds.batch_id IS NULL OR ds.batch_id = e.batch_id
    WHERE e.event_id = p_event_id
  ),
  marks AS (
    SELECT a.learner_id,
           count(DISTINCT a.status) AS distinct_statuses,
           min(a.status) AS one_status
    FROM public.event_session_attendance a
    JOIN day_sessions ds ON ds.id = a.session_id
    GROUP BY a.learner_id
  )
  SELECT el.learner_id::uuid,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         b.label::text,
         CASE WHEN m.distinct_statuses = 1 THEN m.one_status ELSE NULL END::text,
         COALESCE(m.distinct_statuses, 0) > 1
  FROM eligible el
  JOIN public.learners_profiles lp ON lp.id = el.learner_id
  JOIN public.induction_enrollment ie ON ie.event_id = p_event_id AND ie.learner_id = el.learner_id
  LEFT JOIN public.induction_batches b ON b.id = ie.batch_id
  LEFT JOIN marks m ON m.learner_id = el.learner_id
  ORDER BY 2;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_day_roster(UUID, INTEGER) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_day_roster(UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_mark_day_attendance(p_event_id UUID, p_day_number INTEGER, p_marks JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_mark_day_attendance: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_mark_day_attendance: not authorized';
  END IF;

  WITH incoming AS (
    SELECT (m->>'learner_id')::uuid AS learner_id, (m->>'status') AS status
    FROM jsonb_array_elements(p_marks) m
  ),
  fanned AS (
    SELECT s.id AS session_id, i.learner_id, i.status
    FROM incoming i
    JOIN public.induction_enrollment ie ON ie.event_id = p_event_id AND ie.learner_id = i.learner_id
    JOIN public.event_sessions s
      ON s.event_id = p_event_id AND s.day_number IS NOT DISTINCT FROM p_day_number
     AND (s.batch_id IS NULL OR s.batch_id = ie.batch_id)
  )
  INSERT INTO public.event_session_attendance (session_id, learner_id, institution_id, status, marked_by, marked_at)
  SELECT session_id, learner_id, v_inst, status, auth.uid(), now() FROM fanned
  ON CONFLICT (session_id, learner_id) DO UPDATE SET
    status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, marked_at = now(), updated_at = now();

  PERFORM public.fn_induction_recompute_completion(p_event_id);
  RETURN jsonb_array_length(p_marks);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_mark_day_attendance(UUID, INTEGER, JSONB) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_mark_day_attendance(UUID, INTEGER, JSONB) TO authenticated;

-- ============================================================================
-- Fresher Induction — Day-level & whole-program feedback (dynamic scopes)
-- Migration: supabase/migrations/20260730110000_induction_day_program_feedback.sql
-- 6 DEFINER RPCs for the 2 new feedback scopes (mirroring event_session_feedback,
-- phase 2b). Both scopes default OFF via induction_programs.feedback_day_enabled /
-- feedback_program_enabled — existing inductions are unaffected until a
-- coordinator opts in. Neither new scope feeds induction_completion.value_score_avg
-- (that stays session-feedback-only — the scorecard/loop already consume it as such).
-- ============================================================================

-- 1. submit day feedback — self, must be enrolled in the event.
CREATE OR REPLACE FUNCTION public.fn_induction_submit_day_feedback(
  p_event_id UUID, p_day_number INTEGER, p_rating INTEGER, p_comment TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_learner UUID; v_inst UUID; v_fid UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_day_feedback: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_day_feedback: not a learner'; END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'fn_induction_submit_day_feedback: rating must be 1-5'; END IF;

  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_day_feedback: not an induction event'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.induction_enrollment ie
    WHERE ie.event_id = p_event_id AND ie.learner_id = v_learner
  ) THEN
    RAISE EXCEPTION 'fn_induction_submit_day_feedback: not enrolled in this induction';
  END IF;

  INSERT INTO public.event_day_feedback (event_id, day_number, learner_id, institution_id, rating, comment)
  VALUES (p_event_id, p_day_number, v_learner, v_inst, p_rating, p_comment)
  ON CONFLICT (event_id, day_number, learner_id) DO UPDATE SET
    rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = now()
  RETURNING id INTO v_fid;

  RETURN v_fid;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_submit_day_feedback(UUID, INTEGER, INTEGER, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_submit_day_feedback(UUID, INTEGER, INTEGER, TEXT) TO authenticated;

-- 2. coordinator per-day feedback summary.
CREATE OR REPLACE FUNCTION public.fn_induction_day_feedback_summary(p_event_id UUID)
RETURNS TABLE (day_number INTEGER, avg_rating NUMERIC, response_count INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_day_feedback_summary: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_day_feedback_summary: not authorized';
  END IF;

  RETURN QUERY
  SELECT f.day_number, round(avg(f.rating), 2)::numeric, count(*)::integer
  FROM public.event_day_feedback f
  WHERE f.event_id = p_event_id
  GROUP BY f.day_number;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_day_feedback_summary(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_day_feedback_summary(UUID) TO authenticated;

-- 3. the fresher's OWN prior day ratings (pre-fill).
CREATE OR REPLACE FUNCTION public.fn_induction_my_day_feedback(p_event_id UUID)
RETURNS TABLE (day_number INTEGER, rating INTEGER, comment TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_learner UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_my_day_feedback: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT f.day_number, f.rating, f.comment
  FROM public.event_day_feedback f
  WHERE f.event_id = p_event_id AND f.learner_id = v_learner;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_my_day_feedback(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_day_feedback(UUID) TO authenticated;

-- 4. submit program (whole-induction) feedback — self, must be enrolled.
CREATE OR REPLACE FUNCTION public.fn_induction_submit_program_feedback(
  p_event_id UUID, p_rating INTEGER, p_comment TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_learner UUID; v_inst UUID; v_fid UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_program_feedback: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_program_feedback: not a learner'; END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'fn_induction_submit_program_feedback: rating must be 1-5'; END IF;

  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_program_feedback: not an induction event'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.induction_enrollment ie
    WHERE ie.event_id = p_event_id AND ie.learner_id = v_learner
  ) THEN
    RAISE EXCEPTION 'fn_induction_submit_program_feedback: not enrolled in this induction';
  END IF;

  INSERT INTO public.event_program_feedback (event_id, learner_id, institution_id, rating, comment)
  VALUES (p_event_id, v_learner, v_inst, p_rating, p_comment)
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = now()
  RETURNING id INTO v_fid;

  RETURN v_fid;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_submit_program_feedback(UUID, INTEGER, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_submit_program_feedback(UUID, INTEGER, TEXT) TO authenticated;

-- 5. coordinator program-wide feedback summary (single row).
CREATE OR REPLACE FUNCTION public.fn_induction_program_feedback_summary(p_event_id UUID)
RETURNS TABLE (avg_rating NUMERIC, response_count INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_program_feedback_summary: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_program_feedback_summary: not authorized';
  END IF;

  RETURN QUERY
  SELECT round(avg(f.rating), 2)::numeric, count(*)::integer
  FROM public.event_program_feedback f
  WHERE f.event_id = p_event_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_program_feedback_summary(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_program_feedback_summary(UUID) TO authenticated;

-- 6. the fresher's OWN prior program rating (pre-fill).
CREATE OR REPLACE FUNCTION public.fn_induction_my_program_feedback(p_event_id UUID)
RETURNS TABLE (rating INTEGER, comment TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_learner UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_my_program_feedback: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT f.rating, f.comment
  FROM public.event_program_feedback f
  WHERE f.event_id = p_event_id AND f.learner_id = v_learner;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_my_program_feedback(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_program_feedback(UUID) TO authenticated;

-- 7. expose the two feedback-scope toggles on the fresher's enrollment read.
--    Changing a RETURNS TABLE column list requires DROP + recreate — CREATE OR
--    REPLACE cannot add/change output columns on an existing function.
--
--    IMPORTANT: this rebuild must start from the CURRENT live shape, not the
--    phase-3 original. Phase 4 (20260627220000_induction_phase4_referral_advocacy.sql)
--    already DROP+recreated this same function once to add `advocacy_score`
--    between value_score_avg and is_profile_complete. That column is read live
--    by my-induction/page.tsx (AdvocacyCard). Omitting it here would silently
--    regress the advocacy card on every fresher's page. The body below is the
--    phase-4 version verbatim, plus ONLY the two new trailing columns.
DROP FUNCTION IF EXISTS public.fn_induction_my_enrollments();

CREATE FUNCTION public.fn_induction_my_enrollments()
RETURNS TABLE (
  event_id               UUID,
  event_name             TEXT,
  institution_id         UUID,
  institution_name       TEXT,
  start_date             DATE,
  end_date               DATE,
  status                 TEXT,
  batch_id               UUID,
  batch_label            TEXT,
  sessions_total         INTEGER,
  sessions_attended      INTEGER,
  attendance_pct         NUMERIC,
  participation_complete BOOLEAN,
  value_score_avg        NUMERIC,
  advocacy_score         NUMERIC,
  is_profile_complete    BOOLEAN,
  profile_fields_total   INTEGER,
  profile_fields_filled  INTEGER,
  feedback_day_enabled     BOOLEAN,
  feedback_program_enabled BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_learner UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_my_enrollments: not authenticated';
  END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.id::uuid,
    e.name::text,
    e.institution_id::uuid,
    i.name::text,
    e.start_date::date,
    e.end_date::date,
    e.status::text,
    ie.batch_id::uuid,
    b.label::text,
    COALESCE(c.sessions_total, 0)::integer,
    COALESCE(c.sessions_attended, 0)::integer,
    COALESCE(c.attendance_pct, 0)::numeric,
    COALESCE(c.participation_complete, false)::boolean,
    c.value_score_avg::numeric,
    c.advocacy_score::numeric,
    COALESCE(lp.is_profile_complete, false)::boolean,
    4::integer,
    (
      (lp.college_email   IS NOT NULL AND btrim(lp.college_email) <> '')::int +
      (lp.academic_year_id IS NOT NULL)::int +
      (lp.semester_id      IS NOT NULL)::int +
      (lp.section_id       IS NOT NULL)::int
    )::integer,
    COALESCE(ip.feedback_day_enabled, false)::boolean,
    COALESCE(ip.feedback_program_enabled, false)::boolean
  FROM public.induction_enrollment ie
  JOIN public.events             e  ON e.id = ie.event_id
  JOIN public.institutions       i  ON i.id = e.institution_id
  LEFT JOIN public.induction_batches    b  ON b.id = ie.batch_id
  LEFT JOIN public.induction_completion c  ON c.event_id = ie.event_id AND c.learner_id = ie.learner_id
  LEFT JOIN public.learners_profiles    lp ON lp.id = ie.learner_id
  LEFT JOIN public.induction_programs   ip ON ip.event_id = ie.event_id
  WHERE ie.learner_id = v_learner
  ORDER BY e.start_date DESC NULLS LAST;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_my_enrollments() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_enrollments() TO authenticated;

-- ============================================================================
-- Fresher Induction — per-event coordinators (additive to institution-wide roles)
-- Migration: supabase/migrations/20260730120000_induction_event_coordinators.sql
-- A coordinator can now be assigned to ONE SPECIFIC induction event, independent
-- of the institution-wide induction_lead/induction_coordinator roles. This is
-- ADDITIVE: fn_induction_is_event_coordinator() is OR'd into every existing
-- privileged RPC's auth check in Tasks 2-4 below — nothing currently working
-- (institution-wide coordinators) loses access. Who can ASSIGN an event
-- coordinator stays identical to the existing college-wide gate (super-admin or
-- induction_lead only) — mirrors fn_induction_can_manage_coordinators exactly.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. the additive grant check — OR'd into every existing privileged RPC below.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_is_event_coordinator(p_event_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.induction_event_coordinators
    WHERE event_id = p_event_id AND user_id = p_user_id
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_is_event_coordinator(UUID, UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_is_event_coordinator(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. can the caller manage event-level coordinators? Identical gate to the
--    existing college-wide fn_induction_can_manage_coordinators (super-admin or
--    induction_lead only — a plain coordinator can't appoint others).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_can_manage_event_coordinators(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.fn_induction_can_manage_coordinators();
$$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_can_manage_event_coordinators(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_can_manage_event_coordinators(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. list coordinators assigned to ONE event.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_list_event_coordinators(p_event_id UUID)
RETURNS TABLE (user_id UUID, full_name TEXT, email TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_induction_can_manage_event_coordinators(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_list_event_coordinators: not authorized';
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name::text, p.email::text
    FROM public.induction_event_coordinators iec
    JOIN public.profiles p ON p.id = iec.user_id
    WHERE iec.event_id = p_event_id
    ORDER BY p.full_name;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_list_event_coordinators(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_list_event_coordinators(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. search assignable staff of THIS event's institution.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_assignable_event_staff(p_event_id UUID, p_query TEXT DEFAULT NULL)
RETURNS TABLE (id UUID, full_name TEXT, email TEXT, role TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  IF NOT public.fn_induction_can_manage_event_coordinators(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_assignable_event_staff: not authorized';
  END IF;
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_assignable_event_staff: not an induction event'; END IF;
  RETURN QUERY
    SELECT p.id, p.full_name, p.email, p.role
    FROM public.profiles p
    WHERE p.institution_id = v_inst
      AND COALESCE(p.role, '') <> 'student'
      AND p.learner_id IS NULL
      AND (
        p_query IS NULL OR p_query = ''
        OR p.full_name ILIKE '%' || p_query || '%'
        OR p.email ILIKE '%' || p_query || '%'
      )
    ORDER BY p.full_name
    LIMIT 25;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_assignable_event_staff(UUID, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_assignable_event_staff(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. assign / remove (idempotent upsert + plain delete).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_assign_event_coordinator(p_event_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  IF NOT public.fn_induction_can_manage_event_coordinators(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_assign_event_coordinator: not authorized';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'fn_induction_assign_event_coordinator: user_id required'; END IF;
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_assign_event_coordinator: not an induction event'; END IF;
  -- defense-in-depth: the picker UI (fn_induction_assignable_event_staff) only ever
  -- offers staff of this event's own institution — reject a direct-API call that
  -- tries to appoint someone from a different college as this event's coordinator.
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id AND p.institution_id = v_inst) THEN
    RAISE EXCEPTION 'fn_induction_assign_event_coordinator: that user is not a member of this induction''s college';
  END IF;
  INSERT INTO public.induction_event_coordinators (event_id, user_id, assigned_by)
  VALUES (p_event_id, p_user_id, auth.uid())
  ON CONFLICT (event_id, user_id) DO NOTHING;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_assign_event_coordinator(UUID, UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_assign_event_coordinator(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_remove_event_coordinator(p_event_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_induction_can_manage_event_coordinators(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_remove_event_coordinator: not authorized';
  END IF;
  DELETE FROM public.induction_event_coordinators WHERE event_id = p_event_id AND user_id = p_user_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_remove_event_coordinator(UUID, UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_remove_event_coordinator(UUID, UUID) TO authenticated;

-- ============================================================================
-- Fresher Induction — resource-person (session speaker) access model
-- Migration: supabase/migrations/20260702150000_induction_resource_person_session_access.sql
--            supabase/migrations/20260702151000_induction_speakers_read_co_speakers.sql
-- ADDITIVE: a credited resource person (event_session_speakers) can now VIEW
-- the whole event they speak at, and OPERATE only on their assigned sessions.
--   • fn_induction_is_event_speaker(p_event_id) is OR'd into:
--     fn_induction_list_sessions (speaker sees ALL sessions, incl. all batches),
--     fn_induction_session_feedback_summary, fn_induction_day_feedback_summary,
--     fn_induction_program_feedback_summary.
--   • an assigned-session EXISTS over event_session_speakers is OR'd into:
--     fn_induction_session_roster, fn_induction_mark_attendance,
--     fn_induction_session_feedback_roster, fn_induction_submit_feedback_proxy.
--   • _fn_induction_can_manage_session_pulse additionally gained the
--     fn_induction_is_event_coordinator(v_event) clause the 2026-07-30
--     coordinator retrofit missed (poll/pulse hosting for event coordinators).
-- See the migration files for the full rebuilt bodies.
-- ============================================================================

-- Is the caller a credited resource person anywhere in this event?
CREATE OR REPLACE FUNCTION public.fn_induction_is_event_speaker(p_event_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_session_speakers sp
    JOIN public.event_sessions es ON es.id = sp.session_id
    WHERE es.event_id = p_event_id AND sp.profile_id = p_user_id
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_is_event_speaker(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_is_event_speaker(uuid, uuid) TO authenticated;

-- Is this session part of an event where the caller is a credited speaker?
-- (Used by the ess_event_speaker_read policy so a speaker can see co-speakers.)
CREATE OR REPLACE FUNCTION public.fn_induction_session_in_my_speaker_event(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_sessions es
    JOIN public.event_sessions mine ON mine.event_id = es.event_id
    JOIN public.event_session_speakers sp ON sp.session_id = mine.id AND sp.profile_id = auth.uid()
    WHERE es.id = p_session_id
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_in_my_speaker_event(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_in_my_speaker_event(uuid) TO authenticated;

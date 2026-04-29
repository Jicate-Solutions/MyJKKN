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
-- BILLING AI RPC FUNCTIONS
-- Added: 2026-04-28 - Folded back from migration into canonical setup file.
-- ================================================================================

-- ai_rpc_billing_categories: AI-callable read RPC over the global flat billing_categories.
-- p_institution_id is retained for RPC signature stability but is ignored (categories are global).
CREATE OR REPLACE FUNCTION public.ai_rpc_billing_categories(
    p_user_id uuid,
    p_institution_id uuid DEFAULT NULL,
    p_limit integer DEFAULT 100,
    p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object('institution_id', p_institution_id)
    )
  )
  INTO v_result
  FROM (
    SELECT
      bc.id,
      bc.category_name,
      bc.amount,
      bc.frequency,
      bc.description,
      bc.is_active,
      bc.created_at
    FROM billing_categories bc
    ORDER BY bc.category_name
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  RETURN v_result;
END;
$function$;

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

  v_new_app_id := generate_learner_application_id(p_new_institution_id);

  UPDATE learners_profiles SET
    institution_id    = p_new_institution_id,
    degree_id         = p_new_degree_id,
    department_id     = p_new_department_id,
    program_id        = p_new_program_id,
    semester_id       = p_new_semester_id,
    section_id        = p_new_section_id,
    academic_year_id  = p_new_academic_year_id,
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

CREATE OR REPLACE FUNCTION public.get_seat_analytics(
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  institution_id      uuid,
  institution_name    text,
  degree_id           uuid,
  degree_name         text,
  department_id       uuid,
  department_name     text,
  program_id          uuid,
  program_name        text,
  admission_year_id   uuid,
  admission_year_name text,
  program_start_year  integer,
  program_end_year    integer,
  total_seats         integer,
  filled_seats        bigint,
  balance_seats       integer,
  fill_percentage     numeric,
  last_filled_at      timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id,
    i.name,
    d.id,
    d.degree_name,
    dept.id,
    dept.department_name,
    p.id,
    p.program_name,
    ay.id,
    ay.admission_year_name,
    ay.program_start_year,
    ay.program_end_year,
    ay.sanctioned_intake::integer                               AS total_seats,
    COUNT(lp.id)                                                AS filled_seats,
    GREATEST(0, ay.sanctioned_intake - COUNT(lp.id)::integer)   AS balance_seats,
    CASE
      WHEN ay.sanctioned_intake > 0
        THEN ROUND(COUNT(lp.id)::numeric / ay.sanctioned_intake * 100, 1)
      ELSE 0
    END                                                         AS fill_percentage,
    MAX(lp.activated_at)                                        AS last_filled_at
  FROM admission_years ay
  JOIN programs p       ON p.id    = ay.program_id
  JOIN departments dept ON dept.id = p.department_id
  JOIN degrees d        ON d.id    = p.degree_id
  JOIN institutions i   ON i.id    = ay.institution_id
  LEFT JOIN learners_profiles lp
    ON (
      lp.admission_year_id = ay.id
      OR (
        lp.admission_year_id IS NULL
        AND lp.program_id     = ay.program_id
        AND lp.institution_id = ay.institution_id
        AND lp.admission_year = ay.program_start_year
      )
    )
    AND lp.lifecycle_status IN ('admitted', 'active', 'graduated')
  WHERE ay.is_active = true
    AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
  GROUP BY
    i.id, i.name,
    d.id, d.degree_name,
    dept.id, dept.department_name,
    p.id, p.program_name,
    ay.id, ay.admission_year_name, ay.program_start_year, ay.program_end_year, ay.sanctioned_intake
  ORDER BY i.name, d.degree_name, dept.department_name, p.program_name, ay.program_start_year DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_seat_analytics(uuid) TO authenticated;

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
-- Updated: 2026-04-29 - Wave B.2 — config-driven via fn_get_generator_config('overdue_invoice', fallback).
-- All hardcoded constants (min_age_days_overdue, batch_limit, target_roles array,
-- exclude_super_admin gate, priority_thresholds_days, ttl_hours per priority)
-- now read from notification_generator_config. Hardcoded fallback inside the fn
-- matches the backfilled row bit-identical (preserves day-1 behavior).
CREATE OR REPLACE FUNCTION fn_generate_overdue_invoice_items()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_ovd$
DECLARE
  v_created INT := 0; v_inv RECORD; v_user RECORD; v_key TEXT;
  v_priority TEXT; v_name TEXT; v_phone TEXT;
  -- Wave B.2: config-driven constants. Hardcoded fallback inside
  -- fn_get_generator_config matches the backfilled row bit-identical.
  v_cfg JSONB;
  v_category TEXT;
  v_min_days_overdue INT;
  v_batch_limit INT;
  v_target_roles TEXT[];
  v_exclude_super_admin BOOLEAN;
  v_urgent_days_threshold INT;
  v_high_days_threshold INT;
  v_ttl_urgent_hours INT;
  v_ttl_high_hours INT;
  v_ttl_normal_hours INT;
BEGIN
  v_cfg := fn_get_generator_config('overdue_invoice', '{
    "category": "dashboard:escalation",
    "min_age_days_overdue": 30,
    "batch_limit": 500,
    "target_roles": ["director","admin","accounts","principal"],
    "exclude_super_admin": true,
    "priority_thresholds_days": {"urgent": 90, "high": 60},
    "ttl_hours": {"urgent": 24, "high": 48, "normal": 72}
  }'::jsonb);

  v_category             := COALESCE(v_cfg->>'category', 'dashboard:escalation');
  v_min_days_overdue     := COALESCE((v_cfg->>'min_age_days_overdue')::INT, 30);
  v_batch_limit          := COALESCE((v_cfg->>'batch_limit')::INT, 500);
  v_target_roles         := COALESCE(
                              ARRAY(SELECT jsonb_array_elements_text(v_cfg->'target_roles')),
                              ARRAY['director','admin','accounts','principal']
                            );
  v_exclude_super_admin  := COALESCE((v_cfg->>'exclude_super_admin')::BOOLEAN, true);
  v_urgent_days_threshold := COALESCE((v_cfg->'priority_thresholds_days'->>'urgent')::INT, 90);
  v_high_days_threshold  := COALESCE((v_cfg->'priority_thresholds_days'->>'high')::INT, 60);
  v_ttl_urgent_hours     := COALESCE((v_cfg->'ttl_hours'->>'urgent')::INT, 24);
  v_ttl_high_hours       := COALESCE((v_cfg->'ttl_hours'->>'high')::INT, 48);
  v_ttl_normal_hours     := COALESCE((v_cfg->'ttl_hours'->>'normal')::INT, 72);

  FOR v_inv IN
    SELECT bi.id, bi.institution_id, bi.student_id, bi.grand_total, bi.due_date,
           bi.invoice_number, bi.billing_period_from,
           (CURRENT_DATE - bi.due_date)::INT AS days_overdue,
           COALESCE((SELECT SUM(br.payment_amount) FROM billing_receipts br
                     WHERE br.student_id = bi.student_id
                       AND br.receipt_date >= bi.billing_period_from), 0) AS paid_since_period
    FROM billing_invoices bi
    WHERE bi.due_date < CURRENT_DATE - make_interval(days => v_min_days_overdue)
      AND bi.grand_total > 0
    ORDER BY bi.due_date ASC LIMIT v_batch_limit
  LOOP
    IF v_inv.paid_since_period >= v_inv.grand_total THEN CONTINUE; END IF;
    v_priority := CASE WHEN v_inv.days_overdue > v_urgent_days_threshold THEN 'urgent'
                       WHEN v_inv.days_overdue > v_high_days_threshold   THEN 'high'
                       ELSE 'normal' END;
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
        AND (NOT v_exclude_super_admin OR p.is_super_admin = FALSE)
        AND p.role = ANY(v_target_roles)
    LOOP
      v_key := 'overdue_invoice:' || v_inv.id::text || ':' || CURRENT_DATE::text
               || ':' || v_user.uid::text;
      v_created := v_created + fn_create_dashboard_work_item(
        v_category, v_priority,
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
        CASE WHEN v_priority = 'urgent' THEN v_ttl_urgent_hours
             WHEN v_priority = 'high'   THEN v_ttl_high_hours
             ELSE v_ttl_normal_hours END);
    END LOOP;
  END LOOP;
  RETURN v_created;
END $fn_ovd$;

-- Generator 2: stale leads → dashboard:rescue
-- Updated: 2026-04-29 - Wave B.2 — config-driven via fn_get_generator_config('stale_lead_rescue', fallback).
CREATE OR REPLACE FUNCTION fn_generate_stale_lead_rescue_items()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_lead$
DECLARE
  v_created INT := 0; v_lead RECORD; v_key TEXT;
  v_target_user UUID; v_hours_stale INT;
  -- Wave B.2: config-driven constants
  v_cfg JSONB;
  v_category TEXT;
  v_min_age_hours INT;
  v_max_age_days INT;
  v_batch_limit INT;
  v_target_roles_fallback TEXT[];
  v_high_threshold_hours INT;
  v_ttl_hours INT;
BEGIN
  v_cfg := fn_get_generator_config('stale_lead_rescue', '{
    "category": "dashboard:rescue",
    "min_age_hours": 24,
    "max_age_days": 30,
    "batch_limit": 300,
    "target_roles_fallback": ["admission","admin","admission_staff","super_admin"],
    "priority_thresholds_hours": {"high": 72},
    "ttl_hours": 24
  }'::jsonb);

  v_category := COALESCE(v_cfg->>'category', 'dashboard:rescue');
  v_min_age_hours := COALESCE((v_cfg->>'min_age_hours')::INT, 24);
  v_max_age_days  := COALESCE((v_cfg->>'max_age_days')::INT, 30);
  v_batch_limit   := COALESCE((v_cfg->>'batch_limit')::INT, 300);
  v_target_roles_fallback := COALESCE(
                              ARRAY(SELECT jsonb_array_elements_text(v_cfg->'target_roles_fallback')),
                              ARRAY['admission','admin','admission_staff','super_admin']
                            );
  v_high_threshold_hours := COALESCE((v_cfg->'priority_thresholds_hours'->>'high')::INT, 72);
  v_ttl_hours     := COALESCE((v_cfg->>'ttl_hours')::INT, 24);

  FOR v_lead IN
    SELECT al.id, al.institution_id, al.counselor_id,
           COALESCE(al.last_activity_at, al.created_at) AS last_touch,
           EXTRACT(EPOCH FROM (NOW() - COALESCE(al.last_activity_at, al.created_at)))/3600 AS hours_stale
    FROM admission_leads al
    WHERE COALESCE(al.last_activity_at, al.created_at) < NOW() - make_interval(hours => v_min_age_hours)
      AND COALESCE(al.last_activity_at, al.created_at) > NOW() - make_interval(days  => v_max_age_days)
    ORDER BY last_touch ASC LIMIT v_batch_limit
  LOOP
    v_hours_stale := v_lead.hours_stale::INT;
    v_target_user := COALESCE(v_lead.counselor_id,
      (SELECT p.id FROM profiles p WHERE p.institution_id = v_lead.institution_id
         AND p.role = ANY(v_target_roles_fallback) LIMIT 1));
    IF v_target_user IS NULL THEN CONTINUE; END IF;
    v_key := 'stale_lead:' || v_lead.id::text || ':' || CURRENT_DATE::text;
    v_created := v_created + fn_create_dashboard_work_item(
      v_category,
      CASE WHEN v_hours_stale > v_high_threshold_hours THEN 'high' ELSE 'normal' END,
      'Lead stale for ' || v_hours_stale || 'h',
      'Lead hasn''t been touched in ' || v_hours_stale || ' hours. Call now or broadcast rescue to team.',
      jsonb_build_object('lead_id', v_lead.id, 'counselor_id', v_lead.counselor_id,
        'hours_stale', v_hours_stale, 'url', '/admission/leads/' || v_lead.id::text),
      v_target_user, v_key, v_ttl_hours);
  END LOOP;
  RETURN v_created;
END $fn_lead$;

-- Generator 3: pending leave applications >48h → dashboard:approval
-- Updated: 2026-04-28 - Director-fallback: was silently skipping every leave
-- application with NULL final_approver_id (CONTINUE). Now routes via
-- fn_resolve_dashboard_target(employee's institution) so unrouted leave
-- requests still surface to the Director instead of disappearing.
-- Mirrors fn_generate_recruitment_approval_items / fn_generate_unresolved_bug_items.
CREATE OR REPLACE FUNCTION fn_generate_pending_leave_approval_items()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_leave$
DECLARE
  v_created INT := 0; v_leave RECORD; v_target UUID; v_key TEXT; v_hours INT;
BEGIN
  FOR v_leave IN
    SELECT la.id, la.employee_id, la.final_approver_id,
           la.start_date, la.end_date, la.total_days, la.status,
           la.created_at, la.reason, la.is_emergency,
           s.institution_id AS institution_id,
           EXTRACT(EPOCH FROM (NOW() - la.created_at))/3600 AS hours_pending
    FROM hr_leave_applications la
    LEFT JOIN staff s ON s.id = la.employee_id
    WHERE la.status = 'pending' AND la.created_at < NOW() - INTERVAL '48 hours'
      AND la.created_at > NOW() - INTERVAL '30 days' AND la.superseded_by IS NULL
    ORDER BY la.created_at ASC LIMIT 200
  LOOP
    -- Fallback: route to Director when leave intake didn't set final_approver_id.
    v_target := COALESCE(v_leave.final_approver_id, fn_resolve_dashboard_target(v_leave.institution_id));
    IF v_target IS NULL THEN CONTINUE; END IF;  -- truly no super_admin exists; cannot route
    v_hours := v_leave.hours_pending::INT;
    v_key := 'leave_pending:' || v_leave.id::text || ':' || CURRENT_DATE::text;
    v_created := v_created + fn_create_dashboard_work_item(
      'dashboard:approval',
      CASE WHEN v_leave.is_emergency THEN 'urgent' WHEN v_hours > 96 THEN 'high' ELSE 'normal' END,
      'Leave request pending ' || v_hours || 'h — ' || v_leave.total_days::text || ' day(s)',
      COALESCE(v_leave.reason, 'No reason provided') || ' | ' ||
        v_leave.start_date::text || ' to ' || v_leave.end_date::text ||
        CASE WHEN v_leave.final_approver_id IS NULL THEN ' — UNASSIGNED, routed to Director' ELSE '' END,
      jsonb_build_object('leave_id', v_leave.id, 'employee_id', v_leave.employee_id,
        'days', v_leave.total_days, 'url', '/hr/leave/applications/' || v_leave.id::text,
        'is_emergency', v_leave.is_emergency,
        'unassigned_fallback', v_leave.final_approver_id IS NULL),
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
-- Trigger function for learners_profiles.admission_year_id (shadow FK).
-- Rejects an FK that references an admission_years row whose
-- institution_id or program_id does not match the learner.
-- Closes the cross-institution attach vector that PG FK alone cannot enforce.
-- Wired by trg_validate_learner_admission_year_scope in 04_triggers.sql.
-- =====================================================
CREATE OR REPLACE FUNCTION public.validate_learner_admission_year_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.admission_year_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.admission_years ay
    WHERE ay.id = NEW.admission_year_id
      AND ay.institution_id = NEW.institution_id
      AND (NEW.program_id IS NULL OR ay.program_id = NEW.program_id)
  ) THEN
    RAISE EXCEPTION
      'admission_year_id % does not match learner institution_id % / program_id %',
      NEW.admission_year_id, NEW.institution_id, NEW.program_id
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
-- Updated: 2026-04-29 - Wave B.1 — config-driven via fn_get_generator_config('sr_approval', fallback).
-- All hardcoded constants (statuses, age window, batch limit, priority threshold,
-- TTL, exclude_super_admin gate, role-fallback toggle, returned-routes-to-requester
-- toggle) now read from the notification_generator_config table. The fallback
-- JSONB inside fn_get_generator_config() matches the backfilled row bit-identical
-- so day-1 behavior is preserved if the config row is missing/inactive.
-- Behavior preservation verified 2026-04-29: 4 qualifying SRs on prod, 2 routable
-- → 2 emissions (matches OLD fn output); 2 skip cases (no approvers + role-resolves-zero)
-- → both also skipped by NEW logic.
-- Prior history:
-- 2026-04-28 - Role-based fallback when approver_user_ids is empty (PR #581).
--   Bug: 48/61 approval steps had empty approver_user_ids (legacy seed). Cron silently
--   skipped them. UI's useEligibleApprovers fell back to (role + institution_id +
--   is_active) at render-time so the visual stepper showed approvers, but no
--   notifications fired. Now part of step_role_fallback_enabled config flag.
CREATE OR REPLACE FUNCTION fn_generate_service_request_approval_items()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_sr$
DECLARE
  v_created INT := 0; v_sr RECORD; v_key TEXT; v_priority TEXT;
  v_approver UUID; v_step_approvers UUID[]; v_step_role TEXT;
  -- Wave B.1: config-driven constants. fn_get_generator_config returns the
  -- hardcoded fallback below if the config row is missing or inactive — so
  -- day-1 behavior is preserved bit-identical even with no config row at all.
  v_cfg JSONB;
  v_category TEXT;
  v_statuses TEXT[];
  v_min_age_hours INT;
  v_max_age_days INT;
  v_batch_limit INT;
  v_high_threshold_hours INT;
  v_urgent_priority_match TEXT;
  v_ttl_hours INT;
  v_exclude_super_admin BOOLEAN;
  v_step_role_fallback BOOLEAN;
  v_returned_routes_to_requester BOOLEAN;
BEGIN
  v_cfg := fn_get_generator_config('sr_approval', '{
    "category": "dashboard:approval",
    "statuses": ["submitted","in_review","returned"],
    "min_age_hours": 24,
    "max_age_days": 180,
    "batch_limit": 100,
    "priority_thresholds_hours": {"high": 168},
    "priority_overrides": {"urgent_when_priority_field_eq": "urgent"},
    "ttl_hours": 72,
    "exclude_super_admin": true,
    "step_role_fallback_enabled": true,
    "returned_routes_to_requester": true
  }'::jsonb);

  v_category             := COALESCE(v_cfg->>'category', 'dashboard:approval');
  v_statuses             := COALESCE(
                              ARRAY(SELECT jsonb_array_elements_text(v_cfg->'statuses')),
                              ARRAY['submitted','in_review','returned']
                            );
  v_min_age_hours        := COALESCE((v_cfg->>'min_age_hours')::INT, 24);
  v_max_age_days         := COALESCE((v_cfg->>'max_age_days')::INT, 180);
  v_batch_limit          := COALESCE((v_cfg->>'batch_limit')::INT, 100);
  v_high_threshold_hours := COALESCE((v_cfg->'priority_thresholds_hours'->>'high')::INT, 168);
  v_urgent_priority_match := COALESCE(v_cfg->'priority_overrides'->>'urgent_when_priority_field_eq', 'urgent');
  v_ttl_hours            := COALESCE((v_cfg->>'ttl_hours')::INT, 72);
  v_exclude_super_admin  := COALESCE((v_cfg->>'exclude_super_admin')::BOOLEAN, true);
  v_step_role_fallback   := COALESCE((v_cfg->>'step_role_fallback_enabled')::BOOLEAN, true);
  v_returned_routes_to_requester := COALESCE((v_cfg->>'returned_routes_to_requester')::BOOLEAN, true);

  FOR v_sr IN
    SELECT sr.id, sr.request_number, sr.service_type_id, sr.requester_id,
           sr.institution_id,
           sr.status::text AS status_text, sr.priority::text AS priority_text,
           sr.current_approval_step, sr.submitted_at,
           st.name AS service_type_name,
           EXTRACT(EPOCH FROM (NOW() - COALESCE(sr.submitted_at, sr.created_at)))/3600 AS hours_pending
    FROM service_requests sr
    JOIN service_types st ON st.id = sr.service_type_id
    WHERE sr.status::text = ANY(v_statuses)
      AND COALESCE(sr.submitted_at, sr.created_at) < NOW() - make_interval(hours => v_min_age_hours)
      AND COALESCE(sr.submitted_at, sr.created_at) > NOW() - make_interval(days  => v_max_age_days)
    ORDER BY sr.submitted_at ASC NULLS LAST
    LIMIT v_batch_limit
  LOOP
    IF v_sr.status_text = 'returned' AND v_returned_routes_to_requester THEN
      v_step_approvers := ARRAY[v_sr.requester_id];
      v_step_role := NULL;
    ELSE
      -- Read both columns: explicit IDs (priority) + role (fallback).
      SELECT approver_user_ids, approver_role
      INTO v_step_approvers, v_step_role
      FROM service_request_approval_steps
      WHERE service_type_id = v_sr.service_type_id
        AND step_order = COALESCE(v_sr.current_approval_step, 1);

      -- Fallback: when explicit IDs are empty, resolve by role + SR institution
      -- (matches hooks/service-requests/use-eligible-approvers.ts: role IN [...] AND
      -- institution_id = SR.institution_id AND is_active=true).
      IF v_step_role_fallback
         AND (v_step_approvers IS NULL OR array_length(v_step_approvers, 1) IS NULL)
         AND v_step_role IS NOT NULL AND v_sr.institution_id IS NOT NULL THEN
        SELECT array_agg(p.id)
        INTO v_step_approvers
        FROM profiles p
        WHERE p.role = v_step_role
          AND p.institution_id = v_sr.institution_id
          AND p.is_active = TRUE;
      END IF;
    END IF;

    IF v_step_approvers IS NULL OR array_length(v_step_approvers, 1) IS NULL THEN
      CONTINUE;
    END IF;

    v_priority := CASE WHEN v_sr.hours_pending > v_high_threshold_hours THEN 'high'
                       WHEN v_sr.priority_text = v_urgent_priority_match THEN 'urgent'
                       ELSE 'normal' END;
    v_key := 'service_request:' || v_sr.id::text || ':' || CURRENT_DATE::text;
    FOREACH v_approver IN ARRAY v_step_approvers
    LOOP
      IF v_exclude_super_admin AND EXISTS (
        SELECT 1 FROM profiles WHERE id = v_approver AND is_super_admin = TRUE
      ) THEN
        CONTINUE;
      END IF;
      v_created := v_created + fn_create_dashboard_work_item(
        v_category, v_priority,
        'SR ' || v_sr.request_number || ' — ' || v_sr.service_type_name || ' (' || v_sr.status_text || ')',
        v_sr.service_type_name || ' pending ' || v_sr.hours_pending::INT || 'h. Step ' || COALESCE(v_sr.current_approval_step,1)::text,
        jsonb_build_object('service_request_id', v_sr.id, 'request_number', v_sr.request_number,
          'service_type_id', v_sr.service_type_id, 'status', v_sr.status_text,
          'url', '/services/requests/' || v_sr.id::text),
        v_approver, v_key || ':' || v_approver::text, v_ttl_hours);
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
-- Updated: 2026-04-27 - Multi-role digest fan-out (super_admin + 10 oversight roles).
-- Migration `multi_role_digest_subset_v2` applied via Supabase MCP same day.
-- Spec: per-role category matrix locked by Director 2026-04-27 IST 15:30.
-- Roles already receiving per-entity items (hod, principal, admission, accounts,
-- faculty, student) are SKIPPED to avoid duplicate-noise.
--
-- Long-term V2: replace hardcoded role list with `notification_audience_rules`
-- table — `(role, category, scope_filter)` rows so Role Management UI can toggle.
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
  v_emit_escalation BOOLEAN;
  v_emit_rescue BOOLEAN;
  v_emit_approval BOOLEAN;
  v_emit_anomaly BOOLEAN;
BEGIN
  -- Fan-out roster: super_admin (full set) + 10 oversight roles (relevant subsets).
  FOR v_user IN
    SELECT id, role, is_super_admin
    FROM profiles
    WHERE is_super_admin = TRUE
       OR role IN (
         'ceo','cao','cbo','executive_admin_officer','registrar',
         'hr_admin','system_admin','counselor','admission_staff','accountant_assistant'
       )
  LOOP
    -- Per-role category gating. super_admin = full 4 categories; oversight roles = subset.
    v_emit_escalation := v_user.is_super_admin
                      OR v_user.role IN ('ceo','cbo','accountant_assistant');
    v_emit_rescue     := v_user.is_super_admin
                      OR v_user.role IN ('cbo','counselor','admission_staff');
    v_emit_approval   := v_user.is_super_admin
                      OR v_user.role IN ('ceo','cao','executive_admin_officer','registrar','hr_admin');
    v_emit_anomaly    := v_user.is_super_admin
                      OR v_user.role IN ('cao','registrar','system_admin');

    -- Category 1: dashboard:escalation (overdue invoices >30 days, unpaid)
    IF v_emit_escalation THEN
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
    END IF;

    -- Category 2: dashboard:rescue (stale admission leads untouched >24h)
    IF v_emit_rescue THEN
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
        v_created := v_created + fn_create_dashboard_work_item(
          'dashboard:rescue', 'normal',
          'Daily digest — ' || v_total || ' stale lead(s)',
          v_body,
          jsonb_build_object('url', '/admission/leads?stale_min_days=30',
            'digest', true, 'total', v_total),
          v_user.id, v_key, 24);
      END IF;
    END IF;

    -- Category 3: dashboard:approval (pending leaves >48h + recruitment + SR)
    IF v_emit_approval THEN
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
    END IF;

    -- Category 4: dashboard:anomaly (unmarked attendance + untriaged bugs >72h)
    IF v_emit_anomaly THEN
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
        v_created := v_created + fn_create_dashboard_work_item(
          'dashboard:anomaly', 'normal',
          'Daily digest — ' || v_total || ' anomaly signal(s)',
          v_body,
          jsonb_build_object('url', '/academic/attendance/dashboard',
            'digest', true, 'total', v_total),
          v_user.id, v_key, 24);
      END IF;
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

-- =====================================================
-- 2026-04-27 — capture_admission_lead(p_lead jsonb, p_capture jsonb)
-- Atomic capture entry point: creates a new lead OR locks an existing
-- matching lead (last-10-digits phone match within institution) and
-- appends a source-capture row to it. Reactivates lost/dormant leads
-- on re-capture. Replaces the racey select-then-insert pattern in
-- LeadService.createLead. SECURITY DEFINER + internal authorization
-- check; service-role callers (auth.uid() IS NULL) bypass the check
-- since they auth upstream via X-API-Key.
-- Returns: jsonb { lead_id, capture_id, action: created|merged, reactivated }
-- Companion table: admission_lead_source_captures
-- Verified live with smoke test 2026-04-27: phone-format normalization
-- merged "+919000000000" and "900-000-0000" onto the same lead_id.
-- =====================================================
CREATE OR REPLACE FUNCTION public.capture_admission_lead(
  p_lead    JSONB,
  p_capture JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution_id UUID;
  v_phone          TEXT;
  v_normalized     TEXT;
  v_existing       public.admission_leads%ROWTYPE;
  v_new            public.admission_leads%ROWTYPE;
  v_lead_id        UUID;
  v_capture_id     UUID;
  v_action         TEXT;
  v_reactivated    BOOLEAN := FALSE;
  v_user_id        UUID;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (
       public.is_super_admin()
       OR public.is_admin()
       OR public.user_has_permission('admission.leads.create')
     ) THEN
    RAISE EXCEPTION 'Insufficient permission to capture admission leads'
      USING ERRCODE = '42501';
  END IF;

  v_institution_id := (p_lead->>'institution_id')::UUID;
  v_phone          := p_lead->>'phone';
  v_user_id        := NULLIF(p_lead->>'created_by', '')::UUID;

  IF v_institution_id IS NULL THEN
    RAISE EXCEPTION 'institution_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NULL OR length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'phone is required and must contain at least 10 digits'
      USING ERRCODE = '22023';
  END IF;

  v_normalized := right(regexp_replace(v_phone, '[^0-9]', '', 'g'), 10);

  SELECT *
  INTO v_existing
  FROM public.admission_leads
  WHERE institution_id = v_institution_id
    AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = v_normalized
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_lead_id := v_existing.id;
    v_action  := 'merged';

    IF v_existing.funnel_stage IN ('lost', 'dormant') THEN
      v_reactivated := TRUE;
      -- Trigger trigger_log_lead_stage_change auto-logs the lost->new transition.
      -- No explicit stage_history INSERT needed here. Reactivation context is
      -- recorded by LeadService.logRecaptureActivity in admission_lead_activities.
      UPDATE public.admission_leads
      SET funnel_stage     = 'new'::public.funnel_stage,
          stage_changed_at = now(),
          previous_stage   = v_existing.funnel_stage,
          last_activity_at = now(),
          updated_at       = now()
      WHERE id = v_existing.id;
    END IF;

    UPDATE public.admission_leads
    SET last_activity_at = now(),
        updated_at       = now(),
        first_name   = COALESCE(NULLIF(first_name, ''), NULLIF(p_lead->>'first_name', '')),
        last_name    = COALESCE(last_name,              NULLIF(p_lead->>'last_name',  '')),
        email        = COALESCE(email,                  NULLIF(p_lead->>'email',       '')),
        parent_name  = COALESCE(parent_name,            NULLIF(p_lead->>'parent_name', '')),
        parent_phone = COALESCE(parent_phone,           NULLIF(p_lead->>'parent_phone', ''))
    WHERE id = v_existing.id;

  ELSE
    v_new := jsonb_populate_record(
      NULL::public.admission_leads,
      p_lead || jsonb_build_object(
        'created_at',     now(),
        'updated_at',     now(),
        'first_touch_at', COALESCE((p_lead->>'first_touch_at')::TIMESTAMPTZ, now()),
        'funnel_stage',   COALESCE((p_lead->>'funnel_stage')::public.funnel_stage, 'new'::public.funnel_stage),
        'is_hot_lead',    COALESCE((p_lead->>'is_hot_lead')::BOOLEAN, FALSE),
        'is_priority',    COALESCE((p_lead->>'is_priority')::BOOLEAN, FALSE),
        'score',          COALESCE((p_lead->>'score')::NUMERIC, 0),
        'is_active',      COALESCE((p_lead->>'is_active')::BOOLEAN, TRUE)
      )
    );

    -- Explicit column list (skips generated full_name col).
    INSERT INTO public.admission_leads (
      id, institution_id, email, phone, alternate_phone, date_of_birth,
      gender, address_line1, city, state, pincode, country,
      interested_programs, source, source_detail, referrer_id, publisher_id,
      funnel_stage, priority, score, engagement_score, quality_score,
      counselor_id, assigned_at, last_contact_at, next_followup_at,
      notes, tags, is_duplicate, duplicate_of, created_at, updated_at,
      created_by, is_hot_lead, is_priority, is_active, is_dormant, is_lost,
      district, parent_name, parent_phone, parent_email, parent_opted_in,
      assigned_counselor_id, ownership_mode, preferred_channel, preferred_campus,
      academic_year, entry_date, student_interest_level, parent_decision_status,
      last_activity_at, total_messages_sent, messages_this_week, last_message_at,
      stage, stage_changed_at, previous_stage, score_category, score_updated_at,
      combined_score, score_breakdown, conversion_probability,
      lost_reason, lost_at, dormant_at,
      learner_profile_id, degree_id, department_id, program_id, application_number,
      first_name, last_name,
      referral_type, referred_by_id, referred_by_name,
      expo_event_id, captured_by, wa_opt_in, wa_opt_in_at, wa_opt_in_source, wa_opt_out_at,
      first_touch_at, rescued_at, rescued_by, rescue_broadcast_id,
      twelfth_group, admission_year_id, alternative_programs, stall_id, visit_type
    ) VALUES (
      COALESCE(v_new.id, gen_random_uuid()),
      v_new.institution_id, v_new.email, v_new.phone, v_new.alternate_phone, v_new.date_of_birth,
      v_new.gender, v_new.address_line1, v_new.city, v_new.state, v_new.pincode, v_new.country,
      v_new.interested_programs, v_new.source, v_new.source_detail, v_new.referrer_id, v_new.publisher_id,
      v_new.funnel_stage, v_new.priority, v_new.score, v_new.engagement_score, v_new.quality_score,
      v_new.counselor_id, v_new.assigned_at, v_new.last_contact_at, v_new.next_followup_at,
      v_new.notes, v_new.tags, v_new.is_duplicate, v_new.duplicate_of, v_new.created_at, v_new.updated_at,
      v_new.created_by, v_new.is_hot_lead, v_new.is_priority, v_new.is_active, v_new.is_dormant, v_new.is_lost,
      v_new.district, v_new.parent_name, v_new.parent_phone, v_new.parent_email, v_new.parent_opted_in,
      v_new.assigned_counselor_id, v_new.ownership_mode, v_new.preferred_channel, v_new.preferred_campus,
      v_new.academic_year, v_new.entry_date, v_new.student_interest_level, v_new.parent_decision_status,
      v_new.last_activity_at, v_new.total_messages_sent, v_new.messages_this_week, v_new.last_message_at,
      v_new.stage, v_new.stage_changed_at, v_new.previous_stage, v_new.score_category, v_new.score_updated_at,
      v_new.combined_score, v_new.score_breakdown, v_new.conversion_probability,
      v_new.lost_reason, v_new.lost_at, v_new.dormant_at,
      v_new.learner_profile_id, v_new.degree_id, v_new.department_id, v_new.program_id, v_new.application_number,
      v_new.first_name, v_new.last_name,
      v_new.referral_type, v_new.referred_by_id, v_new.referred_by_name,
      v_new.expo_event_id, v_new.captured_by, v_new.wa_opt_in, v_new.wa_opt_in_at, v_new.wa_opt_in_source, v_new.wa_opt_out_at,
      v_new.first_touch_at, v_new.rescued_at, v_new.rescued_by, v_new.rescue_broadcast_id,
      v_new.twelfth_group, v_new.admission_year_id, v_new.alternative_programs, v_new.stall_id, v_new.visit_type
    )
    RETURNING id INTO v_lead_id;

    v_action := 'created';

    INSERT INTO public.admission_lead_stage_history
      (lead_id, from_stage, to_stage, changed_by, notes, created_at)
    VALUES (v_lead_id, NULL, 'new'::public.funnel_stage, v_user_id, NULL, now());
  END IF;

  INSERT INTO public.admission_lead_source_captures (
    lead_id, institution_id, source, source_detail,
    captured_at, captured_by, expo_event_id, stall_id,
    utm_source, utm_medium, utm_campaign, referrer_id,
    raw_payload, created_by
  ) VALUES (
    v_lead_id,
    v_institution_id,
    (p_capture->>'source')::public.lead_source,
    NULLIF(p_capture->>'source_detail', ''),
    COALESCE((p_capture->>'captured_at')::TIMESTAMPTZ, now()),
    NULLIF(p_capture->>'captured_by', '')::UUID,
    NULLIF(p_capture->>'expo_event_id', '')::UUID,
    NULLIF(p_capture->>'stall_id', '')::UUID,
    NULLIF(p_capture->>'utm_source', ''),
    NULLIF(p_capture->>'utm_medium', ''),
    NULLIF(p_capture->>'utm_campaign', ''),
    NULLIF(p_capture->>'referrer_id', '')::UUID,
    COALESCE(p_capture->'raw_payload', '{}'::JSONB),
    v_user_id
  )
  RETURNING id INTO v_capture_id;

  RETURN jsonb_build_object(
    'lead_id',     v_lead_id,
    'capture_id',  v_capture_id,
    'action',      v_action,
    'reactivated', v_reactivated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.capture_admission_lead(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.capture_admission_lead(JSONB, JSONB) TO authenticated, service_role;

COMMENT ON FUNCTION public.capture_admission_lead(JSONB, JSONB) IS
  'Atomic capture entry point for admission leads. Either creates a new lead or locks an existing matching one and appends a source-capture row. Returns {lead_id, capture_id, action: created|merged, reactivated}.';

-- ================================================================================
-- SECTION: ATTENTION BAR — Layer 2 State-Query Functions
-- Added: 2026-04-28
-- PR: phase-4a/attention-bar-state-query-functions
-- Spec: specs/attention-bar-5-layer-system.md §3 Layer 2
-- Purpose: 5 SECURITY DEFINER functions that the Layer 2 rules engine calls
--   via quick_action_state_queries registry to evaluate when_clause conditions.
--   Each returns a JSONB blob; the resolver passes this into rule evaluation.
-- Schema discoveries (verified against prod DB before authoring):
--   - student_attendance has NO marked_by; compliance is section-level
--   - timetables.selected_days is JSONB array of uppercase day names
--   - staff_plan_courses has no section_id; staff_plans has no staff_id
--   - billing_invoices has no status column; use billing_student_bills
-- ================================================================================

-- ────────────────────────────────────────────────────────────────────────────────
-- fn_aqs_counselor_pending_leads
-- query_key: 'counselor.pending_leads'
-- Returns: { count, oldest_lead_id, oldest_lead_days, oldest_lead_full_name }
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_aqs_counselor_pending_leads(
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
DECLARE
    v_count          INT;
    v_oldest_id      UUID;
    v_oldest_days    INT;
    v_oldest_name    TEXT;
    v_counselor_id   UUID;
BEGIN
    SELECT id INTO v_counselor_id
    FROM public.admission_counselors
    WHERE user_id = p_user_id
      AND is_active = true
    LIMIT 1;

    IF v_counselor_id IS NULL THEN
        RETURN jsonb_build_object('count', 0);
    END IF;

    SELECT
        COUNT(*)::INT,
        (ARRAY_AGG(al.id ORDER BY al.created_at ASC))[1],
        CEIL(EXTRACT(EPOCH FROM (NOW() - MIN(al.created_at))) / 86400.0)::INT,
        (ARRAY_AGG(COALESCE(al.full_name, al.first_name) ORDER BY al.created_at ASC))[1]
    INTO v_count, v_oldest_id, v_oldest_days, v_oldest_name
    FROM public.admission_leads al
    WHERE al.assigned_counselor_id = v_counselor_id
      AND al.funnel_stage::text IN (
            'new', 'contacted', 'qualified', 'follow_up', 'follow_up_scheduled',
            'engaged', 'not_reachable', 'application_started'
          )
      AND al.is_active = true
      AND al.is_lost  = false;

    IF COALESCE(v_count, 0) = 0 THEN
        RETURN jsonb_build_object('count', 0);
    END IF;

    RETURN jsonb_build_object(
        'count',                  v_count,
        'oldest_lead_id',         v_oldest_id,
        'oldest_lead_days',       v_oldest_days,
        'oldest_lead_full_name',  COALESCE(v_oldest_name, '')
    );
END;
$$;

COMMENT ON FUNCTION public.fn_aqs_counselor_pending_leads(UUID) IS
    'AQS Layer-2 state query. Returns count of active pending leads assigned to a counselor '
    'and the identity + age of the oldest one. Resolves user → admission_counselors via user_id FK.';

GRANT EXECUTE ON FUNCTION public.fn_aqs_counselor_pending_leads(UUID) TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────────
-- fn_aqs_attendance_unmarked_periods_today
-- query_key: 'attendance.unmarked_periods_today'
-- Returns: { count, sample_period_ids }
-- NOTE: student_attendance has no marked_by; timetables.selected_days is JSONB.
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_aqs_attendance_unmarked_periods_today(
    p_user_id        UUID,
    p_institution_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
DECLARE
    v_is_super_admin  BOOLEAN;
    v_institution_id  UUID;
    v_department_id   UUID;
    v_role            TEXT;
    v_count           INT := 0;
    v_sample_ids      UUID[];
    v_today_dow       TEXT;
BEGIN
    SELECT p.is_super_admin, p.role, p.institution_id
    INTO v_is_super_admin, v_role, v_institution_id
    FROM public.profiles p
    WHERE p.id = p_user_id;

    IF p_institution_id IS NOT NULL THEN
        v_institution_id := p_institution_id;
    END IF;

    IF v_is_super_admin AND p_institution_id IS NULL THEN
        v_institution_id := NULL;
    END IF;

    SELECT s.department_id
    INTO v_department_id
    FROM public.staff s
    WHERE (s.profile_id = p_user_id
       OR s.institution_email = (SELECT email FROM public.profiles WHERE id = p_user_id))
      AND s.is_active = true
    ORDER BY CASE WHEN s.profile_id = p_user_id THEN 0 ELSE 1 END
    LIMIT 1;

    -- TO_CHAR pads with spaces; trim to match timetables.selected_days values
    v_today_dow := TRIM(UPPER(TO_CHAR(CURRENT_DATE, 'DAY')));

    -- NOTE: Missing index on student_attendance(section_id, attendance_date, institution_id).
    -- Flagged for dedicated index PR.

    SELECT
        COUNT(DISTINCT t.section_id)::INT,
        ARRAY(
            SELECT DISTINCT t2.section_id
            FROM public.timetables t2
            WHERE t2.is_active = true
              AND t2.section_id IS NOT NULL
              AND (v_institution_id IS NULL OR t2.institution_id = v_institution_id)
              AND (v_department_id IS NULL OR t2.department_id = v_department_id)
              AND t2.selected_days ? v_today_dow
              AND NOT EXISTS (
                  SELECT 1 FROM public.student_attendance sa2
                  WHERE sa2.section_id      = t2.section_id
                    AND sa2.attendance_date = CURRENT_DATE
                    AND (v_institution_id IS NULL OR sa2.institution_id = v_institution_id)
              )
            LIMIT 10
        )
    INTO v_count, v_sample_ids
    FROM public.timetables t
    WHERE t.is_active = true
      AND t.section_id IS NOT NULL
      AND (v_institution_id IS NULL OR t.institution_id = v_institution_id)
      AND (v_department_id IS NULL OR t.department_id = v_department_id)
      AND t.selected_days ? v_today_dow
      AND NOT EXISTS (
          SELECT 1 FROM public.student_attendance sa
          WHERE sa.section_id      = t.section_id
            AND sa.attendance_date = CURRENT_DATE
            AND (v_institution_id IS NULL OR sa.institution_id = v_institution_id)
      );

    RETURN jsonb_build_object(
        'count',             COALESCE(v_count, 0),
        'sample_period_ids', COALESCE(to_jsonb(v_sample_ids), '[]'::jsonb)
    );
END;
$$;

COMMENT ON FUNCTION public.fn_aqs_attendance_unmarked_periods_today(UUID, UUID) IS
    'AQS Layer-2 state query. Sections with active timetables scheduled today (selected_days) '
    'but no student_attendance row yet. Compliance is section-level (no marked_by column). '
    'sample_period_ids: up to 10 section UUIDs. Faculty/HOD scoped by department.';

GRANT EXECUTE ON FUNCTION public.fn_aqs_attendance_unmarked_periods_today(UUID, UUID) TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────────
-- fn_aqs_billing_overdue_invoices
-- query_key: 'billing.overdue_invoices'
-- Returns: { count, total_overdue_amount, oldest_invoice_days }
-- NOTE: Uses billing_student_bills; billing_invoices has no status column.
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_aqs_billing_overdue_invoices(
    p_user_id        UUID,
    p_institution_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
DECLARE
    v_is_super_admin  BOOLEAN;
    v_user_role       TEXT;
    v_institution_id  UUID;
    v_count           INT;
    v_total_amount    NUMERIC(15,2);
    v_oldest_days     INT;
BEGIN
    SELECT p.is_super_admin, p.role, p.institution_id
    INTO v_is_super_admin, v_user_role, v_institution_id
    FROM public.profiles p
    WHERE p.id = p_user_id;

    IF v_is_super_admin OR v_user_role IN ('super_admin', 'admin') THEN
        v_institution_id := p_institution_id;
    ELSIF p_institution_id IS NOT NULL THEN
        NULL; -- keep own institution (security clamp for non-admins)
    END IF;

    -- NOTE: Missing index on billing_student_bills(due_date, status, institution_id).
    -- Flagged for dedicated billing index PR.

    SELECT
        COUNT(*)::INT,
        COALESCE(SUM(bsb.final_amount - COALESCE(bsb.balance_amount, 0)), 0)::NUMERIC(15,2),
        CEIL(EXTRACT(EPOCH FROM (NOW() - MIN(bsb.due_date::TIMESTAMPTZ))) / 86400.0)::INT
    INTO v_count, v_total_amount, v_oldest_days
    FROM public.billing_student_bills bsb
    WHERE bsb.status IN ('unpaid', 'pending')
      AND bsb.due_date < CURRENT_DATE
      AND (v_institution_id IS NULL OR bsb.institution_id = v_institution_id);

    RETURN jsonb_build_object(
        'count',                COALESCE(v_count, 0),
        'total_overdue_amount', COALESCE(v_total_amount, 0),
        'oldest_invoice_days',  COALESCE(v_oldest_days, 0)
    );
END;
$$;

COMMENT ON FUNCTION public.fn_aqs_billing_overdue_invoices(UUID, UUID) IS
    'AQS Layer-2 state query. Counts billing_student_bills (unpaid/pending) past due_date. '
    'Returns count, total rupee exposure, oldest bill age. Institution-scoped by role.';

GRANT EXECUTE ON FUNCTION public.fn_aqs_billing_overdue_invoices(UUID, UUID) TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────────
-- fn_aqs_admission_leads_unassigned_count
-- query_key: 'admission.leads.unassigned_count'
-- Returns: { count, oldest_unassigned_days }
-- Rate limit: 60/min
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_aqs_admission_leads_unassigned_count(
    p_institution_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
DECLARE
    v_is_super_admin  BOOLEAN;
    v_user_role       TEXT;
    v_institution_id  UUID;
    v_caller_inst_id  UUID;
    v_count           INT;
    v_oldest_days     INT;
BEGIN
    -- auth.uid() preserved in connection context even inside SECURITY DEFINER
    SELECT p.is_super_admin, p.role, p.institution_id
    INTO v_is_super_admin, v_user_role, v_caller_inst_id
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF v_is_super_admin OR v_user_role IN ('super_admin', 'admin', 'admission') THEN
        v_institution_id := p_institution_id;
    ELSE
        v_institution_id := v_caller_inst_id;
    END IF;

    SELECT
        COUNT(*)::INT,
        CEIL(EXTRACT(EPOCH FROM (NOW() - MIN(al.created_at))) / 86400.0)::INT
    INTO v_count, v_oldest_days
    FROM public.admission_leads al
    WHERE al.assigned_counselor_id IS NULL
      AND al.funnel_stage::text NOT IN (
            'lost', 'converted', 'enrolled', 'confirmed',
            'declined', 'withdrew', 'expired', 'dormant'
          )
      AND al.is_active = true
      AND al.is_lost   = false
      AND (v_institution_id IS NULL OR al.institution_id = v_institution_id);

    RETURN jsonb_build_object(
        'count',                  COALESCE(v_count, 0),
        'oldest_unassigned_days', COALESCE(v_oldest_days, 0)
    );
END;
$$;

COMMENT ON FUNCTION public.fn_aqs_admission_leads_unassigned_count(UUID) IS
    'AQS Layer-2 state query. Counts admission_leads with no counselor assignment in active '
    'funnel stages. 14,253 unassigned as of 2026-04-28. Uses auth.uid() for caller scope. '
    'Rate limited to 60/min (director-level dashboard query).';

GRANT EXECUTE ON FUNCTION public.fn_aqs_admission_leads_unassigned_count(UUID) TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────────
-- fn_aqs_attendance_faculty_compliance_today
-- query_key: 'attendance.faculty_compliance_today'
-- Returns: { total_faculty, compliant_count, non_compliant_count, non_compliant_user_ids }
-- NOTE: compliance is section-level; non_compliant_user_ids = section UUIDs.
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_aqs_attendance_faculty_compliance_today(
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
DECLARE
    v_department_id      UUID;
    v_institution_id     UUID;
    v_total_sections     INT := 0;
    v_marked_sections    INT := 0;
    v_unmarked_sections  INT := 0;
    v_unmarked_ids       UUID[];
    v_today_dow          TEXT;
BEGIN
    SELECT s.department_id, s.institution_id
    INTO v_department_id, v_institution_id
    FROM public.staff s
    WHERE (s.profile_id = p_user_id
       OR s.institution_email = (SELECT email FROM public.profiles WHERE id = p_user_id))
      AND s.is_active = true
    ORDER BY CASE WHEN s.profile_id = p_user_id THEN 0 ELSE 1 END
    LIMIT 1;

    IF v_institution_id IS NULL THEN
        SELECT institution_id INTO v_institution_id
        FROM public.profiles
        WHERE id = p_user_id;
    END IF;

    v_today_dow := TRIM(UPPER(TO_CHAR(CURRENT_DATE, 'DAY')));

    -- NOTE: Missing index on student_attendance(section_id, attendance_date, institution_id).
    -- Flagged for dedicated index PR.

    WITH dept_sections AS (
        SELECT DISTINCT t.section_id
        FROM public.timetables t
        WHERE t.is_active = true
          AND t.section_id IS NOT NULL
          AND t.institution_id = v_institution_id
          AND (v_department_id IS NULL OR t.department_id = v_department_id)
          AND t.selected_days ? v_today_dow
    ),
    marked AS (
        SELECT DISTINCT sa.section_id
        FROM public.student_attendance sa
        WHERE sa.attendance_date = CURRENT_DATE
          AND sa.institution_id  = v_institution_id
          AND sa.section_id IN (SELECT section_id FROM dept_sections)
    )
    SELECT
        COUNT(d.section_id)::INT,
        COUNT(m.section_id)::INT,
        (COUNT(d.section_id) - COUNT(m.section_id))::INT,
        ARRAY(
            SELECT d2.section_id
            FROM dept_sections d2
            LEFT JOIN marked m2 ON m2.section_id = d2.section_id
            WHERE m2.section_id IS NULL
            ORDER BY d2.section_id
            LIMIT 10
        )
    INTO v_total_sections, v_marked_sections, v_unmarked_sections, v_unmarked_ids
    FROM dept_sections d
    LEFT JOIN marked m ON m.section_id = d.section_id;

    RETURN jsonb_build_object(
        'total_faculty',           COALESCE(v_total_sections, 0),
        'compliant_count',         COALESCE(v_marked_sections, 0),
        'non_compliant_count',     COALESCE(v_unmarked_sections, 0),
        'non_compliant_user_ids',  COALESCE(to_jsonb(v_unmarked_ids), '[]'::jsonb)
    );
END;
$$;

COMMENT ON FUNCTION public.fn_aqs_attendance_faculty_compliance_today(UUID) IS
    'AQS Layer-2 state query. For HOD: sections with timetables scheduled today that have/have not '
    'had attendance marked. non_compliant_user_ids = section UUIDs (no marked_by in schema), '
    'capped at 10. HOD dept via staff.profile_id FK or institution_email fallback.';

GRANT EXECUTE ON FUNCTION public.fn_aqs_attendance_faculty_compliance_today(UUID) TO authenticated, service_role;

-- =============================================================================
-- _expo_event_institution_id  (RLS recursion-breaker)
-- Added: 2026-04-28 (migration 20260428_expo_rls_recursion_hotfix)
-- =============================================================================
-- Returns the parent expo_event's institution_id WITHOUT triggering RLS, so
-- child-table policies (expo_event_team_members, expo_wa_message_queue) can
-- scope by institution without creating a transitive recursion loop with
-- expo_events_select_team_member. SECURITY DEFINER is the short-circuit.
-- =============================================================================
CREATE OR REPLACE FUNCTION public._expo_event_institution_id(p_expo_event_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT institution_id FROM expo_events WHERE id = p_expo_event_id LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public._expo_event_institution_id(uuid) TO authenticated;

-- =============================================================================
-- fn_group_dashboard_overview — Admission CRM group dashboard funnel counts
-- Added: 2026-04-28 (migration 20260428_fn_group_dashboard_overview)
-- =============================================================================
-- Returns one row per institution with leads (admission_leads), learners
-- (learners_profiles), and seats (admission_years.sanctioned_intake), scoped
-- by admission year. Two scoping modes:
--   p_admission_year_id  — strict filter (only ~3% leads populate this today)
--   p_program_start_year — pragmatic fallback: matches admission_year_id when
--                          present, else EXTRACT(year FROM created_at).
-- Replaces the buggy JS fan-out that read funnel_stage='enrolled' (rarely
-- written) instead of learners_profiles.lifecycle_status (canonical truth).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_group_dashboard_overview(
  p_institution_ids    uuid[],
  p_admission_year_id  uuid    DEFAULT NULL,
  p_program_start_year integer DEFAULT NULL
)
RETURNS TABLE (
  institution_id    uuid,
  institution_name  text,
  total_leads       bigint,
  active_crm_leads  bigint,
  lost_leads        bigint,
  applied_learners  bigint,
  active_learners   bigint,
  rejected_learners bigint,
  total_seats       bigint,
  filled_seats      bigint,
  fill_percentage   numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ay_scope AS (
    SELECT id, ay.institution_id, program_id, program_start_year, sanctioned_intake
    FROM admission_years ay
    WHERE ay.is_active = true
      AND ay.institution_id = ANY(p_institution_ids)
      AND (
            (p_admission_year_id IS NOT NULL AND ay.id = p_admission_year_id)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NOT NULL
             AND ay.program_start_year = p_program_start_year)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NULL)
          )
  ),
  lead_counts AS (
    SELECT
      al.institution_id,
      COUNT(*)                                                                 AS total,
      COUNT(*) FILTER (WHERE COALESCE(al.is_active, true) AND NOT COALESCE(al.is_lost, false)) AS active_crm,
      COUNT(*) FILTER (WHERE COALESCE(al.is_lost, false) OR al.funnel_stage::text IN ('lost','not_reachable')) AS lost
    FROM admission_leads al
    WHERE al.institution_id = ANY(p_institution_ids)
      AND (
            (p_admission_year_id IS NOT NULL
             AND al.admission_year_id = p_admission_year_id)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NOT NULL
             AND ( al.admission_year_id IN (SELECT id FROM ay_scope)
                OR (al.admission_year_id IS NULL
                    AND EXTRACT(year FROM al.created_at)::int = p_program_start_year) ))
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NULL)
          )
    GROUP BY al.institution_id
  ),
  learner_counts AS (
    SELECT
      lp.institution_id,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN ('admitted','pending','approved','account','waitlisted')) AS applied,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'active')   AS active,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'rejected') AS rejected,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN ('admitted','active','graduated')) AS filled
    FROM learners_profiles lp
    WHERE lp.institution_id IS NOT NULL
      AND lp.institution_id = ANY(p_institution_ids)
      AND (
            (p_admission_year_id IS NOT NULL
             AND lp.admission_year_id = p_admission_year_id)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NOT NULL
             AND ( lp.admission_year_id IN (SELECT id FROM ay_scope)
                OR (lp.admission_year_id IS NULL
                    AND lp.admission_year = p_program_start_year) ))
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NULL)
          )
    GROUP BY lp.institution_id
  ),
  seat_totals AS (
    SELECT institution_id, SUM(sanctioned_intake)::bigint AS total_seats
    FROM ay_scope
    GROUP BY institution_id
  )
  SELECT
    i.id,
    i.name::text,
    COALESCE(lc.total,           0)::bigint,
    COALESCE(lc.active_crm,      0)::bigint,
    COALESCE(lc.lost,            0)::bigint,
    COALESCE(lpc.applied,        0)::bigint,
    COALESCE(lpc.active,         0)::bigint,
    COALESCE(lpc.rejected,       0)::bigint,
    COALESCE(st.total_seats,     0)::bigint,
    COALESCE(lpc.filled,         0)::bigint,
    CASE WHEN COALESCE(st.total_seats, 0) = 0 THEN 0::numeric
         ELSE ROUND(COALESCE(lpc.filled, 0)::numeric / st.total_seats * 100, 1)
    END
  FROM institutions i
  LEFT JOIN lead_counts    lc  ON lc.institution_id  = i.id
  LEFT JOIN learner_counts lpc ON lpc.institution_id = i.id
  LEFT JOIN seat_totals    st  ON st.institution_id  = i.id
  WHERE i.id = ANY(p_institution_ids)
  ORDER BY i.name;
$$;

COMMENT ON FUNCTION public.fn_group_dashboard_overview(uuid[], uuid, integer) IS
  'Group dashboard Overview tab funnel counts. Returns one row per institution with lead/learner/seat metrics scoped by admission year. Pass p_admission_year_id for strict filter, or p_program_start_year for pragmatic fallback.';

GRANT EXECUTE ON FUNCTION public.fn_group_dashboard_overview(uuid[], uuid, integer) TO authenticated, service_role;

-- =============================================================================
-- _admission_stream_label + fn_seat_analytics_daily_pivot
-- Added: 2026-04-28 (migration 20260428_fn_seat_analytics_daily_pivot)
-- =============================================================================
-- Powers the "Daily Pivot" sub-tab inside Seat Analytics. Returns one row per
-- (institution × resolved program) for a given admission_year, with daily_counts
-- JSONB map keyed by IST date. Merges -SH first-year-shared programs into base.
-- Date source: COALESCE(activated_at, created_at) AT TIME ZONE 'Asia/Kolkata'.
-- =============================================================================

CREATE OR REPLACE FUNCTION public._admission_stream_label(p_counselling_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_counselling_code
    WHEN 'CET' THEN 'ENGINEERING'
    WHEN 'COP' THEN 'PHARMACY'
    WHEN 'CAS' THEN 'ARTS & SCIENCE'
    WHEN 'AHS' THEN 'ALLIED HEALTH SCIENCES'
    WHEN 'CNR' THEN 'NURSING'
    WHEN 'DCH' THEN 'DENTAL'
    WHEN 'COE' THEN 'EDUCATION'
    ELSE NULL
  END;
$$;

GRANT EXECUTE ON FUNCTION public._admission_stream_label(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_seat_analytics_daily_pivot(
  p_institution_ids       uuid[],
  p_admission_year        integer,
  p_exclude_bulk_migrated boolean DEFAULT false
)
RETURNS TABLE (
  institution_id    uuid,
  institution_name  text,
  program_id        uuid,
  program_short     text,
  program_name      text,
  course_short      text,
  stream            text,
  level             text,
  is_lateral        boolean,
  study_year        text,
  group_label       text,
  group_sort_key    text,
  intake            integer,
  filled            integer,
  balance           integer,
  fill_percentage   numeric,
  daily_counts      jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH eligible_institutions AS (
    SELECT id FROM institutions
    WHERE id = ANY(p_institution_ids) AND role_has_institution_access(id)
  ),
  program_resolution AS (
    SELECT
      p.id AS original_id,
      COALESCE(base.id, p.id) AS resolved_id
    FROM programs p
    LEFT JOIN programs base
      ON p.program_id LIKE '%-SH'
     AND base.program_id = regexp_replace(p.program_id, '-SH$', '')
     AND base.program_id NOT LIKE '%-SH'
     AND base.id <> p.id
  ),
  ay_anchor AS (
    SELECT DISTINCT ay.institution_id, pr.resolved_id AS program_id
    FROM admission_years ay
    JOIN programs p           ON p.id = ay.program_id
    JOIN program_resolution pr ON pr.original_id = ay.program_id
    WHERE ay.is_active = true
      AND ay.institution_id IN (SELECT id FROM eligible_institutions)
      AND ay.program_start_year = p_admission_year
      AND COALESCE(p.is_active, true) = true
  ),
  lp_anchor AS (
    SELECT DISTINCT lp.institution_id, pr.resolved_id AS program_id
    FROM learners_profiles lp
    JOIN programs p           ON p.id = lp.program_id
    JOIN program_resolution pr ON pr.original_id = lp.program_id
    WHERE lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND lp.admission_year = p_admission_year
      AND lp.lifecycle_status::text IN ('admitted','active','graduated')
      AND COALESCE(p.is_active, true) = true
  ),
  anchor AS (
    SELECT institution_id, program_id FROM ay_anchor
    UNION
    SELECT institution_id, program_id FROM lp_anchor
  ),
  intake_per_program AS (
    SELECT
      ay.institution_id,
      pr.resolved_id AS program_id,
      bool_or(
        (ay.program_end_year - ay.program_start_year)
          < COALESCE(p.program_duration_yrs::int, 4)
      ) AS has_lateral_row,
      SUM(ay.sanctioned_intake)::int AS intake_total
    FROM admission_years ay
    JOIN programs p           ON p.id = ay.program_id
    JOIN program_resolution pr ON pr.original_id = ay.program_id
    WHERE ay.is_active = true
      AND ay.program_start_year = p_admission_year
    GROUP BY ay.institution_id, pr.resolved_id
  ),
  filled_per_day AS (
    SELECT
      lp.institution_id,
      pr.resolved_id AS program_id,
      (COALESCE(lp.activated_at, lp.created_at) AT TIME ZONE 'Asia/Kolkata')::date AS admit_date,
      COUNT(*)::int AS cnt
    FROM learners_profiles lp
    JOIN program_resolution pr ON pr.original_id = lp.program_id
    WHERE lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND lp.admission_year = p_admission_year
      AND lp.lifecycle_status::text IN ('admitted','active','graduated')
      AND (NOT p_exclude_bulk_migrated OR lp.migrated_at IS NULL)
    GROUP BY lp.institution_id, pr.resolved_id,
             (COALESCE(lp.activated_at, lp.created_at) AT TIME ZONE 'Asia/Kolkata')::date
  ),
  per_program AS (
    SELECT
      a.institution_id,
      i.name           AS institution_name,
      i.counselling_code,
      a.program_id,
      p.program_id     AS program_short,
      p.program_name,
      d.degree_type,
      dept.department_code,
      COALESCE(ipp.has_lateral_row, false) AS has_lateral_row,
      COALESCE(ipp.intake_total, 0)         AS intake_total,
      COALESCE(SUM(fpd.cnt), 0)::int        AS filled,
      jsonb_object_agg(fpd.admit_date::text, fpd.cnt)
        FILTER (WHERE fpd.admit_date IS NOT NULL) AS daily_counts
    FROM anchor a
    JOIN institutions i        ON i.id    = a.institution_id
    JOIN programs p            ON p.id    = a.program_id
    LEFT JOIN intake_per_program ipp ON ipp.institution_id = a.institution_id AND ipp.program_id = a.program_id
    LEFT JOIN degrees d        ON d.id    = p.degree_id
    LEFT JOIN departments dept ON dept.id = p.department_id
    LEFT JOIN filled_per_day fpd
      ON fpd.institution_id = a.institution_id AND fpd.program_id = a.program_id
    GROUP BY
      a.institution_id, i.name, i.counselling_code,
      a.program_id, p.program_id, p.program_name, d.degree_type, dept.department_code,
      ipp.has_lateral_row, ipp.intake_total
  )
  SELECT
    pp.institution_id,
    pp.institution_name,
    pp.program_id,
    pp.program_short,
    pp.program_name,
    -- Use the full programs.program_name as the user-facing course label.
    pp.program_name                                           AS course_short,
    COALESCE(_admission_stream_label(pp.counselling_code), pp.institution_name) AS stream,
    UPPER(COALESCE(pp.degree_type, ''))                      AS level,
    pp.has_lateral_row                                        AS is_lateral,
    CASE WHEN pp.has_lateral_row THEN 'II YEAR' ELSE 'I YEAR' END AS study_year,
    CASE
      WHEN pp.has_lateral_row THEN
        COALESCE(_admission_stream_label(pp.counselling_code), pp.institution_name)
        || ' - LATERAL ENTRY - II YEAR'
      ELSE
        UPPER(COALESCE(pp.degree_type, '')) || ' '
        || COALESCE(_admission_stream_label(pp.counselling_code), pp.institution_name)
        || ' - I YEAR'
    END                                                       AS group_label,
    COALESCE(pp.counselling_code, 'ZZZ') || '.'
      || UPPER(COALESCE(pp.degree_type, 'z')) || '.'
      || CASE WHEN pp.has_lateral_row THEN '1' ELSE '0' END   AS group_sort_key,
    pp.intake_total                                           AS intake,
    pp.filled,
    GREATEST(pp.intake_total - pp.filled, 0)                  AS balance,
    CASE WHEN pp.intake_total = 0 THEN 0::numeric
         ELSE ROUND(pp.filled::numeric / pp.intake_total * 100, 2)
    END                                                       AS fill_percentage,
    COALESCE(pp.daily_counts, '{}'::jsonb)                    AS daily_counts
  FROM per_program pp
  ORDER BY group_sort_key, course_short;
$$;

COMMENT ON FUNCTION public.fn_seat_analytics_daily_pivot(uuid[], integer, boolean) IS
  'Daily admission pivot for Seat Analytics tab. -SH programs merged into base. Date: COALESCE(activated_at, created_at) AT TIME ZONE IST. SECURITY DEFINER + role_has_institution_access.';

GRANT EXECUTE ON FUNCTION public.fn_seat_analytics_daily_pivot(uuid[], integer, boolean) TO authenticated, service_role;

-- =============================================================================
-- fn_source_analytics — AY-scoped source breakdown for Source Analytics tab
-- Added: 2026-04-28 (migration 20260428_fn_source_analytics)
-- =============================================================================
-- Replaces get_source_analytics(uuid, uuid). Takes p_admission_year integer
-- (cohort year) instead of academic_year_id UUID. enrolled_count is limited
-- by the sparse al.learner_profile_id FK (~1.5% coverage today).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_source_analytics(
  p_institution_ids uuid[],
  p_admission_year  integer DEFAULT NULL
)
RETURNS TABLE (
  institution_id    uuid,
  institution_name  text,
  source            text,
  referral_type     text,
  lead_count        integer,
  enrolled_count    integer,
  conversion_rate   numeric,
  last_enrolled_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH eligible_institutions AS (
    SELECT id FROM institutions
    WHERE id = ANY(p_institution_ids) AND role_has_institution_access(id)
  ),
  cohort_ay_ids AS (
    SELECT id FROM admission_years
    WHERE p_admission_year IS NOT NULL
      AND program_start_year = p_admission_year
      AND is_active = true
  ),
  scoped_leads AS (
    SELECT
      al.id,
      al.institution_id,
      al.source::text                                  AS source,
      COALESCE(NULLIF(TRIM(al.referral_type), ''), '') AS referral_type,
      al.learner_profile_id
    FROM admission_leads al
    WHERE al.institution_id IN (SELECT id FROM eligible_institutions)
      AND (
        p_admission_year IS NULL
        OR al.admission_year_id IN (SELECT id FROM cohort_ay_ids)
        OR (al.admission_year_id IS NULL
            AND EXTRACT(year FROM al.created_at)::int = p_admission_year)
      )
  ),
  per_lead_status AS (
    SELECT
      sl.id, sl.institution_id, sl.source, sl.referral_type,
      lp.lifecycle_status::text AS lp_status,
      lp.activated_at
    FROM scoped_leads sl
    LEFT JOIN learners_profiles lp ON lp.id = sl.learner_profile_id
    WHERE sl.learner_profile_id IS NULL
       OR p_admission_year IS NULL
       OR lp.admission_year = p_admission_year
       OR lp.admission_year IS NULL
  )
  SELECT
    pls.institution_id,
    i.name::text                                                    AS institution_name,
    pls.source,
    pls.referral_type,
    COUNT(*)::int                                                   AS lead_count,
    COUNT(*) FILTER (WHERE pls.lp_status IN ('admitted','active','graduated'))::int AS enrolled_count,
    CASE WHEN COUNT(*) = 0 THEN 0::numeric
         ELSE ROUND(
           COUNT(*) FILTER (WHERE pls.lp_status IN ('admitted','active','graduated'))::numeric
             / COUNT(*)::numeric * 100, 2)
    END                                                             AS conversion_rate,
    MAX(pls.activated_at) FILTER (WHERE pls.lp_status IN ('admitted','active','graduated'))
                                                                    AS last_enrolled_at
  FROM per_lead_status pls
  JOIN institutions i ON i.id = pls.institution_id
  GROUP BY pls.institution_id, i.name, pls.source, pls.referral_type
  ORDER BY i.name, pls.source, pls.referral_type;
$$;

GRANT EXECUTE ON FUNCTION public.fn_source_analytics(uuid[], integer) TO authenticated, service_role;

-- =============================================================================
-- fn_geography_analytics — AY-scoped geographic distribution
-- Added: 2026-04-28 (migration 20260428_fn_geography_analytics)
-- =============================================================================
-- Replaces get_geography_analytics(uuid, uuid). Normalizes state/district/taluk
-- (case + whitespace), DISTINCT learners only, lifecycle_status broadened to
-- match the Seat Analytics gold standard.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_geography_analytics(
  p_institution_ids uuid[],
  p_admission_year  integer DEFAULT NULL
)
RETURNS TABLE (
  institution_id    uuid,
  institution_name  text,
  state             text,
  district          text,
  taluk             text,
  active_learners   bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH eligible_institutions AS (
    SELECT id FROM institutions
    WHERE id = ANY(p_institution_ids) AND role_has_institution_access(id)
  ),
  normalized AS (
    SELECT
      lp.id                                                                AS learner_id,
      lp.institution_id,
      INITCAP(NULLIF(TRIM(REGEXP_REPLACE(COALESCE(lp.permanent_address_state,    ''), '\s+', ' ', 'g')), '')) AS state_norm,
      INITCAP(NULLIF(TRIM(REGEXP_REPLACE(COALESCE(lp.permanent_address_district, ''), '\s+', ' ', 'g')), '')) AS district_norm,
      INITCAP(NULLIF(TRIM(REGEXP_REPLACE(COALESCE(lp.permanent_address_taluk,    ''), '\s+', ' ', 'g')), '')) AS taluk_norm
    FROM learners_profiles lp
    WHERE lp.institution_id IS NOT NULL
      AND lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND lp.lifecycle_status::text IN ('admitted','active','graduated')
      AND lp.permanent_address_district IS NOT NULL
      AND TRIM(lp.permanent_address_district) <> ''
      AND (p_admission_year IS NULL OR lp.admission_year = p_admission_year)
  )
  SELECT
    n.institution_id,
    i.name::text                       AS institution_name,
    n.state_norm                       AS state,
    n.district_norm                    AS district,
    n.taluk_norm                       AS taluk,
    COUNT(DISTINCT n.learner_id)::bigint AS active_learners
  FROM normalized n
  JOIN institutions i ON i.id = n.institution_id
  GROUP BY n.institution_id, i.name, n.state_norm, n.district_norm, n.taluk_norm
  HAVING COUNT(DISTINCT n.learner_id) > 0
  ORDER BY i.name, n.state_norm, n.district_norm, n.taluk_norm;
$$;

GRANT EXECUTE ON FUNCTION public.fn_geography_analytics(uuid[], integer) TO authenticated, service_role;

-- =============================================================================
-- fn_institution_comparison — single-RPC institution ranking
-- Added: 2026-04-28 (migration 20260428_fn_institution_comparison)
-- =============================================================================
-- Replaces the client-side 3-way fan-out in
-- GroupDashboardService.getInstitutionComparison() that combined three legacy
-- RPCs with mismatched lifecycle_status semantics. One RPC, one consistent
-- definition of "filled"/"active" matching fn_seat_analytics_daily_pivot.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_institution_comparison(
  p_institution_ids uuid[],
  p_admission_year  integer DEFAULT NULL
)
RETURNS TABLE (
  institution_id    uuid,
  institution_name  text,
  total_seats       integer,
  filled_seats      integer,
  fill_percentage   numeric,
  total_leads       integer,
  enrolled_count    integer,
  conversion_rate   numeric,
  top_source        text,
  top_district      text,
  active_learners   integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH eligible_institutions AS (
    SELECT id FROM institutions
    WHERE id = ANY(p_institution_ids) AND role_has_institution_access(id)
  ),
  cohort_ay_ids AS (
    SELECT id FROM admission_years
    WHERE p_admission_year IS NOT NULL
      AND program_start_year = p_admission_year
      AND is_active = true
  ),
  seat_totals AS (
    SELECT ay.institution_id, SUM(ay.sanctioned_intake)::int AS total_seats
    FROM admission_years ay
    WHERE ay.is_active = true
      AND ay.institution_id IN (SELECT id FROM eligible_institutions)
      AND (p_admission_year IS NULL OR ay.program_start_year = p_admission_year)
    GROUP BY ay.institution_id
  ),
  learner_aggs AS (
    SELECT
      lp.institution_id,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN ('admitted','active','graduated'))::int AS filled,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'active')::int AS active
    FROM learners_profiles lp
    WHERE lp.institution_id IS NOT NULL
      AND lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND (p_admission_year IS NULL OR lp.admission_year = p_admission_year)
    GROUP BY lp.institution_id
  ),
  lead_aggs AS (
    SELECT al.institution_id, COUNT(*)::int AS total
    FROM admission_leads al
    WHERE al.institution_id IN (SELECT id FROM eligible_institutions)
      AND (
        p_admission_year IS NULL
        OR al.admission_year_id IN (SELECT id FROM cohort_ay_ids)
        OR (al.admission_year_id IS NULL
            AND EXTRACT(year FROM al.created_at)::int = p_admission_year)
      )
    GROUP BY al.institution_id
  ),
  source_ranks AS (
    SELECT
      al.institution_id, al.source::text AS source,
      ROW_NUMBER() OVER (PARTITION BY al.institution_id ORDER BY COUNT(*) DESC) AS rk
    FROM admission_leads al
    WHERE al.institution_id IN (SELECT id FROM eligible_institutions)
      AND al.source IS NOT NULL
      AND (
        p_admission_year IS NULL
        OR al.admission_year_id IN (SELECT id FROM cohort_ay_ids)
        OR (al.admission_year_id IS NULL
            AND EXTRACT(year FROM al.created_at)::int = p_admission_year)
      )
    GROUP BY al.institution_id, al.source
  ),
  district_ranks AS (
    SELECT
      lp.institution_id,
      INITCAP(TRIM(REGEXP_REPLACE(lp.permanent_address_district, '\s+', ' ', 'g'))) AS district,
      ROW_NUMBER() OVER (
        PARTITION BY lp.institution_id ORDER BY COUNT(*) DESC
      ) AS rk
    FROM learners_profiles lp
    WHERE lp.institution_id IS NOT NULL
      AND lp.institution_id IN (SELECT id FROM eligible_institutions)
      AND lp.lifecycle_status::text IN ('admitted','active','graduated')
      AND lp.permanent_address_district IS NOT NULL
      AND TRIM(lp.permanent_address_district) <> ''
      AND (p_admission_year IS NULL OR lp.admission_year = p_admission_year)
    GROUP BY lp.institution_id, INITCAP(TRIM(REGEXP_REPLACE(lp.permanent_address_district, '\s+', ' ', 'g')))
  )
  SELECT
    i.id, i.name::text,
    COALESCE(st.total_seats, 0),
    COALESCE(la.filled, 0),
    CASE WHEN COALESCE(st.total_seats, 0) = 0 THEN 0::numeric
         ELSE ROUND(COALESCE(la.filled, 0)::numeric / st.total_seats * 100, 2)
    END,
    COALESCE(lda.total, 0),
    COALESCE(la.active, 0),
    CASE WHEN COALESCE(lda.total, 0) = 0 THEN 0::numeric
         ELSE ROUND(COALESCE(la.active, 0)::numeric / lda.total * 100, 2)
    END,
    sr.source,
    dr.district,
    COALESCE(la.active, 0)
  FROM institutions i
  LEFT JOIN seat_totals    st  ON st.institution_id  = i.id
  LEFT JOIN learner_aggs   la  ON la.institution_id  = i.id
  LEFT JOIN lead_aggs      lda ON lda.institution_id = i.id
  LEFT JOIN source_ranks   sr  ON sr.institution_id  = i.id AND sr.rk = 1
  LEFT JOIN district_ranks dr  ON dr.institution_id  = i.id AND dr.rk = 1
  WHERE i.id IN (SELECT id FROM eligible_institutions)
  ORDER BY fill_percentage DESC, i.name;
$$;

GRANT EXECUTE ON FUNCTION public.fn_institution_comparison(uuid[], integer) TO authenticated, service_role;

-- Updated: 2026-04-28 - HR Command Center daily brief digest.
-- Adoption hook for /hr (5 lifetime opens, 0 in last 24h). Aggregates 4 HR
-- signals into ONE dashboard:hr_brief work item per qualifying user per day.
-- URL targets /hr (domain page, NOT meta — see memory rule).
-- Permission-gated fan-out: super_admin + every user with hr.dashboard.view
-- (granted via Role Management UI). No hardcoded role list.
-- Idempotent per user per day via idempotency_key.
-- Wired into fn_generate_all_dashboard_work_items as the 10th branch.
CREATE OR REPLACE FUNCTION fn_generate_hr_command_center_brief_items()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_hrb$
DECLARE
  v_created INT := 0;
  v_user RECORD;
  v_today TEXT := TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD');
  v_key TEXT;
  v_pending_leaves INT;
  v_active_recruitment INT;
  v_todays_holidays INT;
  v_staff_on_leave INT;
  v_total INT;
  v_priority TEXT;
  v_title TEXT;
  v_body TEXT;
  v_signal_parts TEXT[];
BEGIN
  FOR v_user IN
    SELECT p.id, p.is_super_admin
    FROM profiles p
    WHERE p.is_super_admin = TRUE
       OR EXISTS (
         SELECT 1 FROM user_roles ur
         JOIN custom_roles cr ON cr.id = ur.role_id
         WHERE ur.user_id = p.id
           AND COALESCE((cr.permissions->>'hr.dashboard.view')::boolean, false) = TRUE
           AND COALESCE(cr.is_active, TRUE) = TRUE
       )
  LOOP
    -- Signal 1: pending leave applications >24h (earlier than per-entity emitter)
    SELECT COUNT(*) INTO v_pending_leaves
    FROM hr_leave_applications la
    WHERE la.status = 'pending'
      AND la.created_at < NOW() - INTERVAL '24 hours'
      AND la.created_at > NOW() - INTERVAL '30 days'
      AND la.superseded_by IS NULL;

    -- Signal 2: active recruitment in last 30 days
    SELECT COUNT(*) INTO v_active_recruitment
    FROM hr_recruitment_candidates
    WHERE status IN ('pending_approval', 'in_process', 'submitted')
      AND COALESCE(submitted_at, created_at) > NOW() - INTERVAL '30 days';

    -- Signal 3: today's institution-wide holidays
    SELECT COUNT(*) INTO v_todays_holidays
    FROM institution_leaves
    WHERE CURRENT_DATE BETWEEN start_date AND end_date
      AND status IN ('approved', 'active');

    -- Signal 4: approved staff leaves overlapping today
    SELECT COUNT(*) INTO v_staff_on_leave
    FROM hr_leave_applications
    WHERE status = 'approved'
      AND CURRENT_DATE BETWEEN start_date AND end_date
      AND superseded_by IS NULL;

    v_total := v_pending_leaves + v_active_recruitment + v_todays_holidays + v_staff_on_leave;

    -- Skip emit when no signal — don't pollute the queue with empty briefs
    IF v_total = 0 THEN CONTINUE; END IF;

    v_signal_parts := ARRAY[]::TEXT[];
    IF v_pending_leaves > 0 THEN
      v_signal_parts := v_signal_parts || (v_pending_leaves || ' pending leave(s)');
    END IF;
    IF v_active_recruitment > 0 THEN
      v_signal_parts := v_signal_parts || (v_active_recruitment || ' active recruitment');
    END IF;
    IF v_todays_holidays > 0 THEN
      v_signal_parts := v_signal_parts || (v_todays_holidays || ' holiday today');
    END IF;
    IF v_staff_on_leave > 0 THEN
      v_signal_parts := v_signal_parts || (v_staff_on_leave || ' staff on leave today');
    END IF;

    v_priority := CASE
      WHEN v_pending_leaves >= 5 OR v_todays_holidays > 0 THEN 'high'
      ELSE 'normal'
    END;

    v_title := 'HR brief — ' || array_to_string(v_signal_parts, ', ');
    v_body := 'Daily HR Command Center summary: ' || array_to_string(v_signal_parts, ', ') || '. Open /hr for full breakdown across institutions.';

    v_key := 'hr_brief:' || v_user.id::text || ':' || v_today;

    -- p_deadline_hours = 20 so the brief expires before tomorrow's run
    -- (cron fires daily at 03:03 UTC = 08:33 IST).
    v_created := v_created + fn_create_dashboard_work_item(
      'dashboard:hr_brief',
      v_priority,
      v_title,
      v_body,
      jsonb_build_object(
        'url', '/hr',
        'digest', true,
        'pending_leaves', v_pending_leaves,
        'active_recruitment', v_active_recruitment,
        'todays_holidays', v_todays_holidays,
        'staff_on_leave', v_staff_on_leave,
        'total', v_total
      ),
      v_user.id,
      v_key,
      20
    );

  END LOOP;
  RETURN v_created;
END $fn_hrb$;

REVOKE ALL ON FUNCTION fn_generate_hr_command_center_brief_items() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_generate_hr_command_center_brief_items() TO service_role, authenticated;

COMMENT ON FUNCTION public.fn_generate_hr_command_center_brief_items() IS
  'Daily HR Command Center brief: aggregates pending leaves, active recruitment, today''s holidays, and staff on leave into a single dashboard:hr_brief work item per user with hr.dashboard.view permission. URL targets /hr (domain page). Idempotent per user per day. Wired into fn_generate_all_dashboard_work_items.';

-- Updated: 2026-04-28 - Wire HR brief generator into orchestrator (10th branch).
CREATE OR REPLACE FUNCTION fn_generate_all_dashboard_work_items()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_all$
DECLARE r1 INT := 0; e1 TEXT := NULL; r2 INT := 0; e2 TEXT := NULL;
        r3 INT := 0; e3 TEXT := NULL; r4 INT := 0; e4 TEXT := NULL;
        r5 INT := 0; e5 TEXT := NULL; r6 INT := 0; e6 TEXT := NULL;
        r7 INT := 0; e7 TEXT := NULL; r8 INT := 0; e8 TEXT := NULL;
        r9 INT := 0; e9 TEXT := NULL; r10 INT := 0; e10 TEXT := NULL;
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
  BEGIN r10 := fn_generate_hr_command_center_brief_items();     EXCEPTION WHEN OTHERS THEN e10 := SQLERRM; END;
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
    'hr_briefs',             jsonb_build_object('count', r10, 'error', e10),
    'total', r1 + r2 + r3 + r4 + r5 + r6 + r7 + r8 + r9 + r10);
END $fn_all$;

REVOKE ALL ON FUNCTION fn_generate_all_dashboard_work_items() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_generate_all_dashboard_work_items() TO service_role;

-- =====================================================
-- 2026-04-29: HR Sprint 5 Attendance — recompute + purge functions
-- (per specs/hrapp-sprint-5-attendance-spec.md, Round 3.2 + 3.3 + 3.4)
-- =====================================================

CREATE OR REPLACE FUNCTION fn_recompute_attendance_on_holiday_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_holiday_status_id UUID;
  v_absent_status_id UUID;
  v_inst_id UUID;
  v_start DATE;
  v_end DATE;
  v_event_id UUID := gen_random_uuid();
  v_cutoff DATE := CURRENT_DATE - INTERVAL '90 days';
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_inst_id := OLD.institution_id;
    v_start   := GREATEST(OLD.start_date, v_cutoff);
    v_end     := OLD.end_date;
  ELSE
    v_inst_id := NEW.institution_id;
    v_start   := GREATEST(NEW.start_date, v_cutoff);
    v_end     := NEW.end_date;
  END IF;

  IF v_inst_id IS NULL OR v_start IS NULL OR v_end IS NULL OR v_start > v_end THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT id INTO v_holiday_status_id FROM hr_attendance_status_types WHERE code = 'HOLIDAY' AND institution_id IS NULL LIMIT 1;
  SELECT id INTO v_absent_status_id  FROM hr_attendance_status_types WHERE code = 'ABSENT'  AND institution_id IS NULL LIMIT 1;

  IF v_holiday_status_id IS NULL OR v_absent_status_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO hr_attendance_audit_log (
    attendance_record_id, employee_id, institution_id, actor_id, action,
    before_state, after_state, reason, created_at
  )
  SELECT
    r.id, r.employee_id, r.institution_id, NULL, 'recompute',
    jsonb_build_object('status_type_id', r.status_type_id, 'status_code', 'ABSENT'),
    jsonb_build_object('status_type_id', v_holiday_status_id, 'status_code', 'HOLIDAY', 'event_id', v_event_id),
    'Holiday added/changed in institution_leaves; ABSENT -> HOLIDAY',
    NOW()
  FROM hr_attendance_records r
  WHERE r.institution_id = v_inst_id
    AND r.work_date BETWEEN v_start AND v_end
    AND r.status_type_id = v_absent_status_id;

  UPDATE hr_attendance_records r
    SET status_type_id = v_holiday_status_id,
        recomputed_from_event_id = v_event_id,
        updated_at = NOW()
  WHERE r.institution_id = v_inst_id
    AND r.work_date BETWEEN v_start AND v_end
    AND r.status_type_id = v_absent_status_id;

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

CREATE OR REPLACE FUNCTION fn_recompute_attendance_on_leave_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_leave_status_id UUID;
  v_event_id UUID := gen_random_uuid();
BEGIN
  IF (TG_OP = 'UPDATE'
      AND NEW.status = 'approved'
      AND COALESCE(OLD.status, '') <> 'approved') THEN

    SELECT id INTO v_leave_status_id FROM hr_attendance_status_types WHERE code = 'LEAVE' AND institution_id IS NULL LIMIT 1;
    IF v_leave_status_id IS NULL THEN RETURN NEW; END IF;

    INSERT INTO hr_attendance_audit_log (
      attendance_record_id, employee_id, institution_id, actor_id, action,
      before_state, after_state, reason, created_at
    )
    SELECT
      r.id, r.employee_id, r.institution_id, NEW.final_approver_id, 'recompute',
      jsonb_build_object('status_type_id', r.status_type_id),
      jsonb_build_object('status_type_id', v_leave_status_id, 'status_code', 'LEAVE', 'event_id', v_event_id, 'leave_application_id', NEW.id),
      'Leave application approved; previous status -> LEAVE',
      NOW()
    FROM hr_attendance_records r
    WHERE r.employee_id = NEW.employee_id
      AND r.work_date BETWEEN NEW.start_date AND NEW.end_date
      AND r.status_type_id <> v_leave_status_id;

    UPDATE hr_attendance_records r
      SET status_type_id = v_leave_status_id,
          recomputed_from_event_id = v_event_id,
          updated_at = NOW()
    WHERE r.employee_id = NEW.employee_id
      AND r.work_date BETWEEN NEW.start_date AND NEW.end_date
      AND r.status_type_id <> v_leave_status_id;
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION fn_purge_attendance_audit_log()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_total INT := 0;
  v_org RECORD;
  v_deleted INT;
BEGIN
  FOR v_org IN
    SELECT institution_id, MIN(audit_retention_years) AS years
    FROM hr_organizations
    WHERE institution_id IS NOT NULL
    GROUP BY institution_id
  LOOP
    DELETE FROM hr_attendance_audit_log
      WHERE institution_id = v_org.institution_id
        AND created_at < NOW() - (COALESCE(v_org.years, 7) || ' years')::INTERVAL;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total := v_total + v_deleted;
  END LOOP;

  DELETE FROM hr_attendance_audit_log
    WHERE institution_id IS NULL
      AND created_at < NOW() - INTERVAL '7 years';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_total := v_total + v_deleted;

  RETURN v_total;
END;
$fn$;


-- ============================================================================
-- 2026-04-29: platform_policies resolver functions (Phase 1.5a)
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

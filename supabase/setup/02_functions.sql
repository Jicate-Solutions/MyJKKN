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
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND is_super_admin = true
    );
END;
$$;

-- Check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = user_id 
        AND role IN ('admin', 'super_admin')
    );
END;
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
    period_slot JSONB;
    day_key TEXT;
    period_key TEXT;
    timetable_data_obj JSONB;
BEGIN
    -- Skip validation for super admins and system operations
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
    
    -- Get timetable data
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

-- Sync staff to profiles (Updated: 2025-10-15 - Store profile_id back in staff table)
CREATE OR REPLACE FUNCTION public.sync_staff_to_profiles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    existing_profile_id UUID;
BEGIN
    -- Only create profile if institution_email is provided
    IF NEW.institution_email IS NOT NULL AND NEW.institution_email != '' THEN
        -- Check if profile already exists with this email
        SELECT id INTO existing_profile_id
        FROM profiles
        WHERE email = NEW.institution_email
        LIMIT 1;

        IF existing_profile_id IS NOT NULL THEN
            -- Update existing profile (but DON'T change is_pre_registered)
            UPDATE profiles
            SET
                full_name = CONCAT(NEW.first_name, ' ', NEW.last_name),
                phone_number = NEW.phone,
                institution_id = NEW.institution_id,
                department_id = NEW.department_id,
                gender = NEW.gender,
                designation = NEW.designation,
                is_active = NEW.is_active,
                updated_at = NOW()
            WHERE id = existing_profile_id;

            -- Store profile_id back in staff table
            NEW.profile_id := existing_profile_id;
        ELSE
            -- Generate new profile ID
            existing_profile_id := gen_random_uuid();

            -- Create new pre-registered profile with all staff details
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
                'faculty',
                true,
                NEW.is_active
            );

            -- Store profile_id back in staff table
            NEW.profile_id := existing_profile_id;
        END IF;
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
-- SECTION 8: ADMISSION MODULE FUNCTIONS
-- ================================================================================

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
-- SECTION 16: PERMISSION & ROLE FUNCTIONS
-- ================================================================================

-- User has permission
CREATE OR REPLACE FUNCTION public.user_has_permission(permission_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- Check if current user has the specified permission
    RETURN EXISTS (
        SELECT 1 FROM profiles p
        JOIN custom_roles cr ON p.role = cr.role_key
        WHERE p.id = auth.uid()
        AND cr.permissions ? permission_name
    );
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

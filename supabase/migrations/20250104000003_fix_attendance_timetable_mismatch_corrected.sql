-- Fix attendance records with mismatched timetable period IDs (CORRECTED VERSION)
-- Issue: Attendance records use period IDs that don't exist in current timetable
-- This causes wrong course names to appear in attendance reports

-- Step 1: Create a function to validate attendance period IDs against timetable
CREATE OR REPLACE FUNCTION validate_attendance_period_ids(
    p_timetable_id UUID,
    p_attendance_date DATE
)
RETURNS TABLE(
    attendance_id UUID,
    attendance_date DATE,
    invalid_period_id TEXT,
    correct_period_id TEXT,
    course_name TEXT,
    faculty_name TEXT,
    needs_update BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH attendance_periods AS (
        SELECT 
            sa.id as attendance_id,
            sa.attendance_date,
            sa.timetable_id,
            period_key as period_id,
            period_value->>'course_name' as att_course_name,
            period_value->>'faculty_name' as att_faculty_name
        FROM student_attendance sa
        CROSS JOIN LATERAL jsonb_each(sa.attendance_data) AS period_data(period_key, period_value)
        WHERE sa.timetable_id = p_timetable_id
        AND sa.attendance_date = p_attendance_date
    ),
    timetable_periods AS (
        SELECT 
            t.id as timetable_id,
            period_key as period_id,
            c.course_name as tt_course_name,
            CONCAT(st.first_name, ' ', st.last_name) as tt_faculty_name
        FROM timetables t
        CROSS JOIN LATERAL jsonb_each(t.timetable_data->'WEDNESDAY') AS tt_period(period_key, period_value)
        LEFT JOIN courses c ON (period_value->>'course_id')::UUID = c.id
        LEFT JOIN staff st ON (period_value->>'primary_staff_id')::UUID = st.id
        WHERE t.id = p_timetable_id
        AND period_value->>'is_break_slot' = 'false'
    )
    SELECT 
        ap.attendance_id,
        ap.attendance_date,
        ap.period_id as invalid_period_id,
        tp.period_id as correct_period_id,
        COALESCE(tp.tt_course_name, ap.att_course_name) as course_name,
        COALESCE(tp.tt_faculty_name, ap.att_faculty_name) as faculty_name,
        (ap.period_id != tp.period_id OR tp.period_id IS NULL) as needs_update
    FROM attendance_periods ap
    FULL OUTER JOIN timetable_periods tp ON ap.att_course_name = tp.tt_course_name
    WHERE ap.period_id != tp.period_id OR tp.period_id IS NULL OR ap.period_id IS NULL;
END;
$$;

-- Step 2: Create a function to fix attendance period ID mapping
CREATE OR REPLACE FUNCTION fix_attendance_period_mapping(
    p_attendance_id UUID,
    p_old_period_id TEXT,
    p_new_period_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_data JSONB;
    period_data JSONB;
    updated_data JSONB;
BEGIN
    -- Get current attendance data
    SELECT attendance_data INTO current_data
    FROM student_attendance
    WHERE id = p_attendance_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Extract the period data
    period_data := current_data -> p_old_period_id;
    
    IF period_data IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Remove old period and add with new ID
    updated_data := current_data - p_old_period_id;
    updated_data := jsonb_set(updated_data, ARRAY[p_new_period_id], period_data, true);
    
    -- Update the record
    UPDATE student_attendance
    SET 
        attendance_data = updated_data,
        updated_at = NOW()
    WHERE id = p_attendance_id;
    
    RETURN TRUE;
END;
$$;

-- Step 3: Create a comprehensive function to sync attendance with timetable
CREATE OR REPLACE FUNCTION sync_attendance_with_timetable(
    p_timetable_id UUID,
    p_attendance_date DATE,
    p_day_of_week TEXT DEFAULT 'WEDNESDAY'
)
RETURNS TABLE(
    action TEXT,
    attendance_id UUID,
    old_period_id TEXT,
    new_period_id TEXT,
    course_name TEXT,
    status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rec RECORD;
    updated_count INTEGER := 0;
BEGIN
    -- Create a mapping between attendance courses and timetable periods
    FOR rec IN
        WITH attendance_courses AS (
            SELECT 
                sa.id as att_id,
                period_key as att_period_id,
                period_value->>'course_name' as course_name,
                period_value->>'period_name' as period_name
            FROM student_attendance sa
            CROSS JOIN LATERAL jsonb_each(sa.attendance_data) AS pd(period_key, period_value)
            WHERE sa.timetable_id = p_timetable_id
            AND sa.attendance_date = p_attendance_date
        ),
        timetable_courses AS (
            SELECT 
                period_key as tt_period_id,
                c.course_name,
                period_value->>'period_name' as period_name
            FROM timetables t
            CROSS JOIN LATERAL jsonb_each(t.timetable_data->p_day_of_week) AS pd(period_key, period_value)
            LEFT JOIN courses c ON (period_value->>'course_id')::UUID = c.id
            WHERE t.id = p_timetable_id
            AND period_value->>'is_break_slot' = 'false'
            AND c.course_name IS NOT NULL
        )
        SELECT 
            'UPDATE' as action,
            ac.att_id,
            ac.att_period_id,
            tc.tt_period_id,
            COALESCE(tc.course_name, ac.course_name) as course_name,
            CASE 
                WHEN tc.tt_period_id IS NULL THEN 'NO_MATCH_FOUND'
                WHEN ac.att_period_id = tc.tt_period_id THEN 'ALREADY_CORRECT'
                ELSE 'NEEDS_UPDATE'
            END as status
        FROM attendance_courses ac
        LEFT JOIN timetable_courses tc ON ac.course_name = tc.course_name
    LOOP
        -- Return the mapping information
        action := rec.action;
        attendance_id := rec.att_id;
        old_period_id := rec.att_period_id;
        new_period_id := rec.tt_period_id;
        course_name := rec.course_name;
        status := rec.status;
        RETURN NEXT;
        
        -- If we need to update and have a valid mapping, do it
        IF rec.status = 'NEEDS_UPDATE' AND rec.tt_period_id IS NOT NULL THEN
            IF fix_attendance_period_mapping(rec.att_id, rec.att_period_id, rec.tt_period_id) THEN
                updated_count := updated_count + 1;
            END IF;
        END IF;
    END LOOP;
    
    -- Log the results
    RAISE NOTICE 'Updated % attendance period mappings', updated_count;
    
    RETURN;
END;
$$;

-- Step 4: Create a validation function for attendance data integrity (CORRECTED)
CREATE OR REPLACE FUNCTION check_attendance_data_integrity()
RETURNS TABLE(
    timetable_id UUID,
    timetable_name TEXT,
    attendance_date DATE,
    total_attendance_records BIGINT,
    mismatched_periods BIGINT,
    integrity_score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH attendance_summary AS (
        SELECT 
            sa.timetable_id,
            sa.attendance_date,
            COUNT(DISTINCT period_key) as total_periods
        FROM student_attendance sa
        CROSS JOIN LATERAL jsonb_object_keys(sa.attendance_data) AS period_key
        GROUP BY sa.timetable_id, sa.attendance_date
    ),
    timetable_periods AS (
        SELECT 
            t.id as timetable_id,
            t.timetable_name,
            COUNT(*) as available_periods
        FROM timetables t
        CROSS JOIN LATERAL jsonb_each(t.timetable_data->'WEDNESDAY') as tp(k,v)
        WHERE tp.v->>'is_break_slot' = 'false'
        GROUP BY t.id, t.timetable_name
    )
    SELECT 
        tp.timetable_id,
        tp.timetable_name,
        asp.attendance_date,
        asp.total_periods as total_attendance_records,
        GREATEST(0, asp.total_periods - tp.available_periods) as mismatched_periods,
        ROUND(
            (LEAST(asp.total_periods, tp.available_periods)::NUMERIC / 
             GREATEST(asp.total_periods, tp.available_periods)) * 100, 
            2
        ) as integrity_score
    FROM attendance_summary asp
    JOIN timetable_periods tp ON asp.timetable_id = tp.timetable_id
    WHERE asp.total_periods != tp.available_periods
    ORDER BY integrity_score ASC;
END;
$$;

-- Step 5: Add comments for maintenance
COMMENT ON FUNCTION validate_attendance_period_ids IS 'Validates attendance period IDs against current timetable structure';
COMMENT ON FUNCTION fix_attendance_period_mapping IS 'Updates attendance record to use correct period ID from timetable';
COMMENT ON FUNCTION sync_attendance_with_timetable IS 'Synchronizes attendance records with current timetable structure';
COMMENT ON FUNCTION check_attendance_data_integrity IS 'Checks data integrity between attendance records and timetables';
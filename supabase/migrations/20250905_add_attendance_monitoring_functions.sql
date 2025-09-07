-- ================================================================================
-- MIGRATION: Add Attendance Conflict Monitoring Functions
-- Date: 2025-09-05
-- Purpose: Add database functions to support attendance conflict monitoring
-- ================================================================================

-- Function to get attendance staff conflicts
CREATE OR REPLACE FUNCTION get_attendance_staff_conflicts(
    p_institution_id UUID,
    p_date_start DATE DEFAULT NULL,
    p_date_end DATE DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    attendance_id UUID,
    timetable_id UUID,
    attendance_date DATE,
    section_name TEXT,
    course_name TEXT,
    period_name TEXT,
    marked_by UUID,
    marked_by_name TEXT,
    assigned_staff JSONB,
    conflict_type TEXT,
    conflict_reason TEXT,
    detected_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    WITH attendance_with_details AS (
        SELECT 
            sa.id as attendance_id,
            sa.timetable_id,
            sa.attendance_date,
            sa.marked_by,
            sa.institution_id,
            t.timetable_data,
            COALESCE(p.full_name, p.email, 'Unknown User') as marked_by_name,
            sec.section_name,
            c.course_name,
            'Unknown Period' as period_name -- We'll enhance this later
        FROM student_attendance sa
        LEFT JOIN timetables t ON sa.timetable_id = t.id
        LEFT JOIN profiles p ON sa.marked_by = p.id
        LEFT JOIN sections sec ON sa.section_id = sec.id
        LEFT JOIN courses c ON t.course_id = c.id
        WHERE sa.institution_id = p_institution_id
        AND (p_date_start IS NULL OR sa.attendance_date >= p_date_start)
        AND (p_date_end IS NULL OR sa.attendance_date <= p_date_end)
    ),
    conflicts_identified AS (
        SELECT 
            awd.*,
            -- Extract staff assignments from timetable_data
            COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', staff_id.value,
                            'name', COALESCE(s.first_name || ' ' || s.last_name, s.email, 'Unknown'),
                            'email', COALESCE(s.email, s.institution_email, 'N/A')
                        )
                    )
                    FROM (
                        SELECT DISTINCT (staff_id.value#>>'{}')::UUID as staff_uuid
                        FROM jsonb_each(awd.timetable_data) as day(day_key, day_value),
                             jsonb_each(day_value) as period(period_key, period_value),
                             jsonb_array_elements(period_value->'staff_ids') as staff_id
                        WHERE period_value ? 'staff_ids' 
                        AND jsonb_array_length(period_value->'staff_ids') > 0
                    ) staff_uuids
                    JOIN staff s ON s.id = staff_uuids.staff_uuid
                ),
                '[]'::jsonb
            ) as assigned_staff_json,
            -- Determine conflict type
            CASE 
                WHEN awd.timetable_data IS NULL THEN 'missing_data'
                WHEN NOT EXISTS (
                    SELECT 1 
                    FROM jsonb_each(awd.timetable_data) as day(day_key, day_value),
                         jsonb_each(day_value) as period(period_key, period_value),
                         jsonb_array_elements(period_value->'staff_ids') as staff_id
                    WHERE period_value ? 'staff_ids' 
                    AND jsonb_array_length(period_value->'staff_ids') > 0
                    AND (staff_id.value#>>'{}')::UUID = awd.marked_by
                ) THEN 'unauthorized_marker'
                ELSE 'valid'
            END as conflict_type_calc
        FROM attendance_with_details awd
    )
    SELECT 
        gen_random_uuid() as id,
        ci.attendance_id,
        ci.timetable_id,
        ci.attendance_date,
        ci.section_name,
        ci.course_name,
        ci.period_name,
        ci.marked_by,
        ci.marked_by_name,
        ci.assigned_staff_json as assigned_staff,
        ci.conflict_type_calc as conflict_type,
        CASE 
            WHEN ci.conflict_type_calc = 'missing_data' THEN 'Timetable data missing or corrupted'
            WHEN ci.conflict_type_calc = 'unauthorized_marker' THEN 'User not assigned to mark attendance for this period'
            ELSE 'No conflict detected'
        END as conflict_reason,
        NOW() as detected_at
    FROM conflicts_identified ci
    WHERE ci.conflict_type_calc != 'valid' -- Only return conflicts
    ORDER BY ci.attendance_date DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get conflict summary statistics
CREATE OR REPLACE FUNCTION get_attendance_conflict_summary(
    p_institution_id UUID,
    p_date_start DATE DEFAULT NULL,
    p_date_end DATE DEFAULT NULL
)
RETURNS TABLE (
    total_records BIGINT,
    conflict_records BIGINT,
    valid_records BIGINT,
    conflict_percentage NUMERIC,
    conflicts_by_type JSONB,
    conflicts_by_date JSONB
) AS $$
DECLARE
    total_count BIGINT;
    conflict_count BIGINT;
BEGIN
    -- Get total records
    SELECT COUNT(*) INTO total_count
    FROM student_attendance sa
    WHERE sa.institution_id = p_institution_id
    AND (p_date_start IS NULL OR sa.attendance_date >= p_date_start)
    AND (p_date_end IS NULL OR sa.attendance_date <= p_date_end);

    -- Get conflict records using the conflicts function
    SELECT COUNT(*) INTO conflict_count
    FROM get_attendance_staff_conflicts(p_institution_id, p_date_start, p_date_end, 999999);

    RETURN QUERY
    SELECT 
        total_count as total_records,
        conflict_count as conflict_records,
        (total_count - conflict_count) as valid_records,
        CASE 
            WHEN total_count > 0 THEN ROUND((conflict_count * 100.0 / total_count), 2)
            ELSE 0.0
        END as conflict_percentage,
        -- Conflicts by type
        COALESCE(
            (
                SELECT jsonb_object_agg(conflict_type, type_count)
                FROM (
                    SELECT 
                        gasc.conflict_type,
                        COUNT(*) as type_count
                    FROM get_attendance_staff_conflicts(p_institution_id, p_date_start, p_date_end, 999999) gasc
                    GROUP BY gasc.conflict_type
                ) type_summary
            ),
            '{}'::jsonb
        ) as conflicts_by_type,
        -- Conflicts by date
        COALESCE(
            (
                SELECT jsonb_object_agg(attendance_date::text, date_count)
                FROM (
                    SELECT 
                        gasc.attendance_date,
                        COUNT(*) as date_count
                    FROM get_attendance_staff_conflicts(p_institution_id, p_date_start, p_date_end, 999999) gasc
                    GROUP BY gasc.attendance_date
                    ORDER BY gasc.attendance_date DESC
                    LIMIT 30
                ) date_summary
            ),
            '{}'::jsonb
        ) as conflicts_by_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate a specific attendance record
CREATE OR REPLACE FUNCTION validate_attendance_record(
    p_attendance_id UUID
)
RETURNS TABLE (
    is_valid BOOLEAN,
    conflicts JSONB,
    suggestions TEXT[]
) AS $$
DECLARE
    attendance_record RECORD;
    staff_assignments UUID[];
    conflict_found BOOLEAN := FALSE;
    conflict_details JSONB := '[]'::jsonb;
    suggestion_list TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Get the attendance record
    SELECT 
        sa.id,
        sa.timetable_id,
        sa.marked_by,
        sa.institution_id,
        t.timetable_data,
        COALESCE(p.full_name, p.email, 'Unknown') as marked_by_name
    INTO attendance_record
    FROM student_attendance sa
    LEFT JOIN timetables t ON sa.timetable_id = t.id
    LEFT JOIN profiles p ON sa.marked_by = p.id
    WHERE sa.id = p_attendance_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, '[]'::jsonb, ARRAY['Attendance record not found']::TEXT[];
        RETURN;
    END IF;

    -- Check if user is super admin (they can mark any attendance)
    IF EXISTS(
        SELECT 1 FROM user_institution_access uia
        WHERE uia.user_id = attendance_record.marked_by
        AND uia.institution_id = attendance_record.institution_id
        AND uia.role = 'super_admin'
        AND uia.is_active = true
    ) THEN
        RETURN QUERY SELECT TRUE, '[]'::jsonb, ARRAY['Valid: Super admin access']::TEXT[];
        RETURN;
    END IF;

    -- Extract staff assignments from timetable data
    IF attendance_record.timetable_data IS NULL THEN
        conflict_found := TRUE;
        conflict_details := jsonb_build_array(
            jsonb_build_object(
                'type', 'missing_data',
                'message', 'Timetable data is missing'
            )
        );
        suggestion_list := array_append(suggestion_list, 'Check timetable data integrity');
    ELSE
        -- Get all assigned staff IDs
        SELECT ARRAY(
            SELECT DISTINCT (staff_id.value#>>'{}')::UUID
            FROM jsonb_each(attendance_record.timetable_data) as day(day_key, day_value),
                 jsonb_each(day_value) as period(period_key, period_value),
                 jsonb_array_elements(period_value->'staff_ids') as staff_id
            WHERE period_value ? 'staff_ids' 
            AND jsonb_array_length(period_value->'staff_ids') > 0
        ) INTO staff_assignments;

        -- Check if marked_by is in assigned staff
        IF staff_assignments IS NULL OR array_length(staff_assignments, 1) = 0 THEN
            conflict_found := TRUE;
            conflict_details := jsonb_build_array(
                jsonb_build_object(
                    'type', 'no_assignments',
                    'message', 'No staff assignments found in timetable'
                )
            );
            suggestion_list := array_append(suggestion_list, 'Assign staff to timetable periods');
        ELSIF NOT (attendance_record.marked_by = ANY(staff_assignments)) THEN
            conflict_found := TRUE;
            conflict_details := jsonb_build_array(
                jsonb_build_object(
                    'type', 'unauthorized_marker',
                    'message', format('User %s is not assigned to this timetable', attendance_record.marked_by_name),
                    'marked_by', attendance_record.marked_by_name,
                    'assigned_staff', staff_assignments
                )
            );
            suggestion_list := array_append(suggestion_list, 'Add user to timetable staff assignments or verify permissions');
        END IF;
    END IF;

    -- Return results
    RETURN QUERY SELECT 
        NOT conflict_found as is_valid,
        conflict_details as conflicts,
        CASE 
            WHEN NOT conflict_found THEN ARRAY['Record is valid']::TEXT[]
            ELSE suggestion_list
        END as suggestions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments
COMMENT ON FUNCTION get_attendance_staff_conflicts(UUID, DATE, DATE, INTEGER) IS 
'Returns attendance records with staff assignment conflicts. Used for monitoring and reporting.';

COMMENT ON FUNCTION get_attendance_conflict_summary(UUID, DATE, DATE) IS 
'Returns summary statistics of attendance conflicts for an institution.';

COMMENT ON FUNCTION validate_attendance_record(UUID) IS 
'Validates a specific attendance record for staff assignment conflicts and provides suggestions.';

-- Log the migration
INSERT INTO migration_log (migration_name, description, executed_at) 
VALUES (
    '20250905_add_attendance_monitoring_functions',
    'Added database functions for attendance conflict monitoring and reporting',
    NOW()
) ON CONFLICT (migration_name) DO NOTHING;
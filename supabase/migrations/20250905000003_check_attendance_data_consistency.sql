-- ================================================================================
-- DATA CONSISTENCY CHECK: Attendance Staff Assignment Conflicts
-- Date: 2025-09-05
-- Purpose: Identify existing attendance records with staff assignment conflicts
-- Usage: Run this to see how many records will be affected by the validation
-- ================================================================================

-- Create a temporary function to check consistency (will be dropped after use)
CREATE OR REPLACE FUNCTION check_attendance_staff_consistency()
RETURNS TABLE (
    attendance_id UUID,
    timetable_id UUID,
    attendance_date DATE,
    marked_by UUID,
    marked_by_name TEXT,
    assigned_staff_ids UUID[],
    assigned_staff_names TEXT[],
    has_conflict BOOLEAN,
    conflict_reason TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH attendance_with_timetable AS (
        SELECT 
            sa.id as attendance_id,
            sa.timetable_id,
            sa.attendance_date,
            sa.marked_by,
            t.timetable_data,
            -- Get marked by name
            COALESCE(p.full_name, p.email, 'Unknown') as marked_by_name
        FROM student_attendance sa
        JOIN timetables t ON sa.timetable_id = t.id
        LEFT JOIN profiles p ON sa.marked_by = p.id
    ),
    staff_assignments AS (
        SELECT 
            awt.attendance_id,
            awt.timetable_id,
            awt.attendance_date,
            awt.marked_by,
            awt.marked_by_name,
            -- Extract all staff IDs from timetable_data
            ARRAY(
                SELECT DISTINCT (staff_id.value#>>'{}')::UUID
                FROM jsonb_each(awt.timetable_data) as day(day_key, day_value),
                     jsonb_each(day_value) as period(period_key, period_value),
                     jsonb_array_elements(period_value->'staff_ids') as staff_id
                WHERE period_value ? 'staff_ids' 
                AND jsonb_array_length(period_value->'staff_ids') > 0
            ) as assigned_staff_ids
        FROM attendance_with_timetable awt
    )
    SELECT 
        sa.attendance_id,
        sa.timetable_id,
        sa.attendance_date,
        sa.marked_by,
        sa.marked_by_name,
        sa.assigned_staff_ids,
        -- Get assigned staff names
        ARRAY(
            SELECT COALESCE(s.first_name || ' ' || s.last_name, s.email, 'Unknown')
            FROM staff s 
            WHERE s.id = ANY(sa.assigned_staff_ids)
        ) as assigned_staff_names,
        -- Check if there's a conflict
        (sa.assigned_staff_ids IS NULL OR 
         array_length(sa.assigned_staff_ids, 1) = 0 OR 
         NOT (sa.marked_by = ANY(sa.assigned_staff_ids))) as has_conflict,
        -- Conflict reason
        CASE 
            WHEN sa.assigned_staff_ids IS NULL OR array_length(sa.assigned_staff_ids, 1) = 0 THEN 
                'No staff assignments found in timetable'
            WHEN NOT (sa.marked_by = ANY(sa.assigned_staff_ids)) THEN 
                'Marked by staff not in assigned list'
            ELSE 'No conflict'
        END as conflict_reason
    FROM staff_assignments sa
    ORDER BY sa.attendance_date DESC, sa.attendance_id;
END;
$$ LANGUAGE plpgsql;

-- Run the consistency check
SELECT 
    'ATTENDANCE STAFF CONSISTENCY REPORT' as report_title,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE has_conflict) as conflict_records,
    COUNT(*) FILTER (WHERE NOT has_conflict) as valid_records,
    ROUND(
        (COUNT(*) FILTER (WHERE has_conflict) * 100.0 / COUNT(*)), 2
    ) as conflict_percentage
FROM check_attendance_staff_consistency();

-- Show detailed conflicts
SELECT 
    'DETAILED CONFLICTS' as section,
    attendance_id,
    attendance_date,
    marked_by_name,
    assigned_staff_names,
    conflict_reason
FROM check_attendance_staff_consistency()
WHERE has_conflict
ORDER BY attendance_date DESC
LIMIT 20;

-- Show conflict summary by reason
SELECT 
    'CONFLICT SUMMARY BY REASON' as section,
    conflict_reason,
    COUNT(*) as count,
    ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM check_attendance_staff_consistency())), 2) as percentage
FROM check_attendance_staff_consistency()
WHERE has_conflict
GROUP BY conflict_reason
ORDER BY count DESC;

-- Clean up the temporary function
DROP FUNCTION check_attendance_staff_consistency();
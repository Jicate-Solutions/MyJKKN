-- Optimized script to update missing assigned_faculty data in attendance records
-- This script fetches faculty info from timetables and updates attendance_data JSON

-- First check how many records need updating
SELECT 
    COUNT(*) as total_needing_update
FROM student_attendance
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
AND attendance_data::text NOT LIKE '%assigned_faculty%';

-- Update attendance records with faculty data from timetables
WITH attendance_to_update AS (
    -- Get all attendance records that need updating
    SELECT 
        sa.id,
        sa.attendance_date,
        sa.timetable_id,
        sa.attendance_data,
        t.timetable_data,
        to_char(sa.attendance_date, 'Day')::text as day_name
    FROM student_attendance sa
    INNER JOIN timetables t ON t.id = sa.timetable_id
    WHERE sa.created_at >= CURRENT_DATE - INTERVAL '30 days'
    AND sa.attendance_data::text NOT LIKE '%assigned_faculty%'
),
faculty_mapping AS (
    -- Extract faculty data for each period
    SELECT DISTINCT
        atu.id as attendance_id,
        period_key,
        period_value,
        -- Extract staff_ids array from the matching slot
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'faculty_id', s.id,
                        'faculty_name', s.name,
                        'faculty_email', s.institution_email,
                        'is_primary', (s.id = (period_slot->>'primary_staff_id'))
                    ) ORDER BY CASE WHEN s.id = (period_slot->>'primary_staff_id') THEN 0 ELSE 1 END
                )
                FROM jsonb_array_elements_text(period_slot->'staff_ids') AS staff_id
                JOIN staff s ON s.id = staff_id::text
            ),
            '[]'::jsonb
        ) as faculty_data,
        period_slot->>'course_id' as course_id
    FROM attendance_to_update atu,
    LATERAL jsonb_each(atu.attendance_data) AS period(period_key, period_value),
    LATERAL (
        -- Find the matching slot in timetable_data
        SELECT slot_value AS period_slot
        FROM jsonb_each(atu.timetable_data) AS day(day_key, day_value),
             jsonb_each(day_value) AS slot(slot_key, slot_value)
        WHERE slot_value->>'slot_id' = period_key
        LIMIT 1
    ) AS matched_slot
),
updated_data AS (
    -- Build the updated attendance_data JSON
    SELECT 
        fm.attendance_id,
        jsonb_object_agg(
            fm.period_key,
            CASE 
                WHEN jsonb_array_length(fm.faculty_data) = 1 THEN
                    -- Single faculty - store as object
                    fm.period_value || jsonb_build_object(
                        'assigned_faculty', fm.faculty_data->0 - 'is_primary',
                        'course_id', COALESCE(fm.period_value->>'course_id', fm.course_id)
                    )
                WHEN jsonb_array_length(fm.faculty_data) > 1 THEN
                    -- Multiple faculty - store as array
                    fm.period_value || jsonb_build_object(
                        'assigned_faculty', fm.faculty_data,
                        'course_id', COALESCE(fm.period_value->>'course_id', fm.course_id)
                    )
                ELSE
                    -- No faculty data found, keep original
                    fm.period_value
            END
        ) as new_attendance_data
    FROM faculty_mapping fm
    GROUP BY fm.attendance_id
)
-- Update the attendance records
UPDATE student_attendance sa
SET 
    attendance_data = ud.new_attendance_data,
    updated_at = NOW()
FROM updated_data ud
WHERE sa.id = ud.attendance_id;

-- Add course names where missing
UPDATE student_attendance sa
SET attendance_data = (
    SELECT jsonb_object_agg(
        period_key,
        CASE 
            WHEN period_value->>'course_id' IS NOT NULL AND period_value->>'course_name' IS NULL THEN
                period_value || jsonb_build_object('course_name', c.name)
            ELSE
                period_value
        END
    )
    FROM jsonb_each(sa.attendance_data) AS period(period_key, period_value)
    LEFT JOIN courses c ON c.id = (period_value->>'course_id')::uuid
)
WHERE sa.created_at >= CURRENT_DATE - INTERVAL '30 days'
AND EXISTS (
    SELECT 1 
    FROM jsonb_each(sa.attendance_data) AS period(period_key, period_value)
    WHERE period_value->>'course_id' IS NOT NULL 
    AND period_value->>'course_name' IS NULL
);

-- Verify the updates
SELECT 
    COUNT(*) as total_records,
    COUNT(CASE WHEN attendance_data::text LIKE '%assigned_faculty%' THEN 1 END) as has_faculty,
    COUNT(CASE WHEN attendance_data::text NOT LIKE '%assigned_faculty%' THEN 1 END) as missing_faculty
FROM student_attendance
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days';

-- Show sample of updated records
SELECT 
    id,
    attendance_date,
    jsonb_pretty(attendance_data) as formatted_data
FROM student_attendance
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
AND attendance_data::text LIKE '%assigned_faculty%'
LIMIT 2;
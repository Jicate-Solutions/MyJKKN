-- Script to fix missing assigned_faculty data in existing attendance records
-- This will update attendance_data JSON to include all assigned faculty from timetables

-- First, let's check how many records need updating
WITH attendance_check AS (
    SELECT 
        COUNT(*) as total_records,
        COUNT(CASE WHEN attendance_data::text NOT LIKE '%assigned_faculty%' THEN 1 END) as missing_faculty
    FROM student_attendance
    WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
)
SELECT * FROM attendance_check;

-- Create a function to update attendance records with faculty data
CREATE OR REPLACE FUNCTION update_attendance_faculty_data()
RETURNS TABLE (
    updated_count INT,
    error_count INT,
    details TEXT
) AS $$
DECLARE
    rec RECORD;
    updated_data JSONB;
    period_key TEXT;
    period_data JSONB;
    timetable_data JSONB;
    slot_data JSONB;
    faculty_data JSONB;
    staff_ids TEXT[];
    staff_records JSONB;
    updated_counter INT := 0;
    error_counter INT := 0;
    error_msg TEXT;
BEGIN
    -- Loop through all attendance records that need updating
    FOR rec IN 
        SELECT 
            sa.id,
            sa.attendance_date,
            sa.timetable_id,
            sa.section_id,
            sa.attendance_data,
            t.timetable_data as timetable_json,
            to_char(sa.attendance_date, 'Day') as day_name
        FROM student_attendance sa
        INNER JOIN timetables t ON t.id = sa.timetable_id
        WHERE sa.created_at >= CURRENT_DATE - INTERVAL '30 days'
        AND sa.attendance_data::text NOT LIKE '%assigned_faculty%'
    LOOP
        BEGIN
            updated_data := rec.attendance_data;
            timetable_data := rec.timetable_json;
            
            -- Process each period in the attendance data
            FOR period_key IN SELECT jsonb_object_keys(updated_data)
            LOOP
                period_data := updated_data->period_key;
                
                -- Find the matching slot in timetable_data
                slot_data := NULL;
                
                -- Search through all days and periods in timetable_data
                FOR day_key IN SELECT jsonb_object_keys(timetable_data)
                LOOP
                    FOR slot_key IN SELECT jsonb_object_keys(timetable_data->day_key)
                    LOOP
                        IF (timetable_data->day_key->slot_key->>'slot_id') = period_key THEN
                            slot_data := timetable_data->day_key->slot_key;
                            EXIT;
                        END IF;
                    END LOOP;
                    IF slot_data IS NOT NULL THEN
                        EXIT;
                    END IF;
                END LOOP;
                
                -- If we found the slot, get faculty data
                IF slot_data IS NOT NULL THEN
                    staff_ids := ARRAY(SELECT jsonb_array_elements_text(slot_data->'staff_ids'));
                    
                    IF array_length(staff_ids, 1) > 0 THEN
                        -- Get staff details
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'faculty_id', s.id,
                                'faculty_name', s.name,
                                'faculty_email', s.institution_email,
                                'is_primary', (s.id = staff_ids[1])
                            )
                        ) INTO staff_records
                        FROM staff s
                        WHERE s.id = ANY(staff_ids);
                        
                        -- Update period data with faculty info
                        IF jsonb_array_length(staff_records) = 1 THEN
                            -- Single faculty - store as object
                            period_data := period_data || jsonb_build_object(
                                'assigned_faculty', staff_records->0 - 'is_primary'
                            );
                        ELSIF jsonb_array_length(staff_records) > 1 THEN
                            -- Multiple faculty - store as array
                            period_data := period_data || jsonb_build_object(
                                'assigned_faculty', staff_records
                            );
                        END IF;
                        
                        -- Also add course_id if missing
                        IF period_data->>'course_id' IS NULL AND slot_data->>'course_id' IS NOT NULL THEN
                            period_data := period_data || jsonb_build_object(
                                'course_id', slot_data->>'course_id'
                            );
                            
                            -- Get course name
                            SELECT name INTO course_name
                            FROM courses
                            WHERE id = (slot_data->>'course_id')::uuid;
                            
                            IF course_name IS NOT NULL THEN
                                period_data := period_data || jsonb_build_object(
                                    'course_name', course_name
                                );
                            END IF;
                        END IF;
                    END IF;
                END IF;
                
                -- Update the period in the attendance data
                updated_data := jsonb_set(updated_data, ARRAY[period_key], period_data);
            END LOOP;
            
            -- Update the attendance record
            UPDATE student_attendance
            SET attendance_data = updated_data,
                updated_at = NOW()
            WHERE id = rec.id;
            
            updated_counter := updated_counter + 1;
            
        EXCEPTION WHEN OTHERS THEN
            error_counter := error_counter + 1;
            error_msg := SQLERRM;
            RAISE NOTICE 'Error updating record %: %', rec.id, error_msg;
        END;
    END LOOP;
    
    RETURN QUERY SELECT 
        updated_counter,
        error_counter,
        format('Updated %s records, %s errors', updated_counter, error_counter);
END;
$$ LANGUAGE plpgsql;

-- Execute the update function
SELECT * FROM update_attendance_faculty_data();

-- Verify the update
WITH verification AS (
    SELECT 
        COUNT(*) as total_records,
        COUNT(CASE WHEN attendance_data::text LIKE '%assigned_faculty%' THEN 1 END) as has_faculty,
        COUNT(CASE WHEN attendance_data::text NOT LIKE '%assigned_faculty%' THEN 1 END) as missing_faculty
    FROM student_attendance
    WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
)
SELECT * FROM verification;

-- Sample check to see the updated data
SELECT 
    id,
    attendance_date,
    jsonb_pretty(attendance_data) as formatted_data
FROM student_attendance
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
AND attendance_data::text LIKE '%assigned_faculty%'
LIMIT 2;
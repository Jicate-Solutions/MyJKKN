-- Create a function to sync faculty changes from timetables to attendance records
-- This runs when timetable_data is updated to reflect faculty changes in existing attendance

CREATE OR REPLACE FUNCTION sync_attendance_faculty_on_timetable_update()
RETURNS TRIGGER AS $$
DECLARE
    attendance_record RECORD;
    day_name TEXT;
    period_key TEXT;
    period_data JSONB;
    timetable_slot JSONB;
    staff_ids TEXT[];
    faculty_data JSONB;
    updated_attendance JSONB;
    has_changes BOOLEAN := FALSE;
BEGIN
    -- Only proceed if timetable_data has changed
    IF OLD.timetable_data IS NOT DISTINCT FROM NEW.timetable_data THEN
        RETURN NEW;
    END IF;

    -- Find all attendance records for this timetable from the last 30 days
    -- (older records are considered historical and shouldn't be changed)
    FOR attendance_record IN 
        SELECT id, attendance_date, attendance_data
        FROM student_attendance
        WHERE timetable_id = NEW.id
        AND attendance_date >= CURRENT_DATE - INTERVAL '30 days'
    LOOP
        -- Get the day of week for this attendance record
        day_name := UPPER(to_char(attendance_record.attendance_date, 'Day'));
        day_name := TRIM(day_name); -- Remove trailing spaces
        
        updated_attendance := '{}';
        has_changes := FALSE;
        
        -- Process each period in the attendance record
        FOR period_key, period_data IN SELECT * FROM jsonb_each(attendance_record.attendance_data)
        LOOP
            -- Find the matching slot in the new timetable data
            timetable_slot := NULL;
            
            -- Search for the slot with matching slot_id
            FOR slot IN SELECT * FROM jsonb_each(NEW.timetable_data->day_name)
            LOOP
                IF (slot.value->>'slot_id') = period_key THEN
                    timetable_slot := slot.value;
                    EXIT;
                END IF;
            END LOOP;
            
            -- If we found the slot and it has staff_ids
            IF timetable_slot IS NOT NULL AND 
               timetable_slot->'staff_ids' IS NOT NULL AND 
               jsonb_array_length(timetable_slot->'staff_ids') > 0 THEN
                
                -- Extract staff IDs
                staff_ids := ARRAY(
                    SELECT jsonb_array_elements_text(timetable_slot->'staff_ids')
                );
                
                -- Build faculty data from staff records
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'faculty_id', s.id,
                        'faculty_name', CONCAT(s.first_name, ' ', s.last_name),
                        'faculty_email', s.institution_email
                    ) || 
                    CASE 
                        WHEN array_length(staff_ids, 1) > 1 THEN
                            jsonb_build_object('is_primary', s.id::text = (timetable_slot->>'primary_staff_id'))
                        ELSE '{}'::jsonb
                    END
                    ORDER BY CASE WHEN s.id::text = (timetable_slot->>'primary_staff_id') THEN 0 ELSE 1 END
                ) INTO faculty_data
                FROM staff s
                WHERE s.id::text = ANY(staff_ids);
                
                -- Update the period data with new faculty
                IF faculty_data IS NOT NULL THEN
                    -- Check if faculty has actually changed
                    IF (period_data->'assigned_faculty') IS DISTINCT FROM 
                       (CASE 
                           WHEN jsonb_array_length(faculty_data) = 1 THEN faculty_data->0
                           ELSE faculty_data
                       END) THEN
                        has_changes := TRUE;
                        
                        -- Update with new faculty data
                        period_data := period_data || jsonb_build_object(
                            'assigned_faculty', 
                            CASE 
                                WHEN jsonb_array_length(faculty_data) = 1 THEN faculty_data->0
                                ELSE faculty_data
                            END,
                            'faculty_synced_at', NOW(),
                            'faculty_sync_source', 'timetable_trigger'
                        );
                    END IF;
                END IF;
            END IF;
            
            -- Add the period to updated attendance
            updated_attendance := updated_attendance || jsonb_build_object(period_key, period_data);
        END LOOP;
        
        -- Update the attendance record if there were changes
        IF has_changes THEN
            UPDATE student_attendance
            SET 
                attendance_data = updated_attendance,
                updated_at = NOW()
            WHERE id = attendance_record.id;
            
            RAISE NOTICE 'Synced faculty for attendance record %', attendance_record.id;
        END IF;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS sync_attendance_faculty_trigger ON timetables;

CREATE TRIGGER sync_attendance_faculty_trigger
AFTER UPDATE OF timetable_data ON timetables
FOR EACH ROW
EXECUTE FUNCTION sync_attendance_faculty_on_timetable_update();

-- Add index to improve performance of the sync
CREATE INDEX IF NOT EXISTS idx_student_attendance_timetable_date 
ON student_attendance(timetable_id, attendance_date);

-- Add a function to manually sync faculty for a specific date range
CREATE OR REPLACE FUNCTION manual_sync_attendance_faculty(
    p_timetable_id UUID DEFAULT NULL,
    p_from_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_to_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    synced_count INT,
    changed_count INT
) AS $$
DECLARE
    v_synced INT := 0;
    v_changed INT := 0;
    attendance_rec RECORD;
BEGIN
    FOR attendance_rec IN 
        SELECT sa.id, sa.timetable_id
        FROM student_attendance sa
        WHERE (p_timetable_id IS NULL OR sa.timetable_id = p_timetable_id)
        AND sa.attendance_date BETWEEN p_from_date AND p_to_date
    LOOP
        -- Trigger the sync by doing a dummy update on the timetable
        UPDATE timetables 
        SET updated_at = NOW()
        WHERE id = attendance_rec.timetable_id;
        
        v_synced := v_synced + 1;
    END LOOP;
    
    RETURN QUERY SELECT v_synced, v_changed;
END;
$$ LANGUAGE plpgsql;

-- Example usage:
-- SELECT * FROM manual_sync_attendance_faculty('timetable-uuid-here', '2025-01-01', '2025-01-31');
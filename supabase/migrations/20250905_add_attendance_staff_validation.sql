-- ================================================================================
-- MIGRATION: Add Attendance Staff Assignment Validation
-- Date: 2025-09-05
-- Purpose: Add database-level validation to ensure only assigned staff or super admins
--          can mark attendance, preventing conflicts between assigned and marking staff
-- ================================================================================

-- Step 1: Create the validation function
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

-- Step 2: Create the trigger
CREATE TRIGGER validate_attendance_staff_assignment_trigger
    BEFORE INSERT OR UPDATE ON student_attendance
    FOR EACH ROW
    EXECUTE FUNCTION validate_attendance_staff_assignment();

-- Step 3: Add comments for documentation
COMMENT ON FUNCTION public.validate_attendance_staff_assignment() IS 
'Validates that only assigned staff or super admins can mark attendance for timetable periods.
Checks timetable_data JSONB for staff assignments and compares with marked_by field.
Created: 2025-09-05 to resolve conflicts between assigned staff and marking staff.';

COMMENT ON TRIGGER validate_attendance_staff_assignment_trigger ON student_attendance IS 
'Prevents unauthorized attendance marking by validating staff assignments from timetable data.
Only assigned staff members or super admins can mark attendance for specific periods.
Created: 2025-09-05 to fix attendance staff assignment conflicts.';

-- Step 4: Log the migration
INSERT INTO migration_log (migration_name, description, executed_at) 
VALUES (
    '20250905_add_attendance_staff_validation',
    'Added database validation for attendance staff assignments to prevent conflicts',
    NOW()
) ON CONFLICT (migration_name) DO NOTHING;
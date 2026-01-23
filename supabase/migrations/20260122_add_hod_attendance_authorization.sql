-- Migration: Add HOD Department Authorization for Attendance
-- Date: 2026-01-22
-- Description: Enable HOD users to mark attendance for any period in their department
-- even when not explicitly assigned to that period in the timetable.
--
-- Changes:
-- 1. Add HOD department check in validate_attendance_staff_assignment trigger
-- 2. HOD can mark attendance if timetable.department_id matches profiles.department_id
-- 3. Maintains existing authorization hierarchy: super_admin -> admin -> HOD -> assigned staff

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
    RAISE EXCEPTION 'User % is not assigned to mark attendance for this timetable period. Only assigned staff, HODs, or super admins can mark attendance.', NEW.marked_by;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Updated: 2026-01-22 - Added HOD department authorization
-- The trigger remains the same, only the function is updated

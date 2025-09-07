-- ================================================================================
-- ROLLBACK MIGRATION: Remove Attendance Staff Assignment Validation
-- Date: 2025-09-05
-- Purpose: Rollback the attendance staff validation changes if needed
-- ================================================================================

-- Step 1: Drop the trigger
DROP TRIGGER IF EXISTS validate_attendance_staff_assignment_trigger ON student_attendance;

-- Step 2: Drop the validation function
DROP FUNCTION IF EXISTS public.validate_attendance_staff_assignment();

-- Step 3: Log the rollback
INSERT INTO migration_log (migration_name, description, executed_at) 
VALUES (
    '20250905_rollback_attendance_staff_validation',
    'Rolled back database validation for attendance staff assignments',
    NOW()
) ON CONFLICT (migration_name) DO NOTHING;
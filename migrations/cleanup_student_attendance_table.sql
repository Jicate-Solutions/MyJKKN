-- Migration: Cleanup student_attendance table structure
-- This migration removes old individual record columns and enforces consolidated structure
-- Run this migration to align the table with the implementation plan

-- IMPORTANT: Only run this migration if you've confirmed that:
-- 1. All existing individual records have been migrated to consolidated format
-- 2. The application code is updated to use consolidated attendance

BEGIN;

-- Step 1: Remove unwanted old columns from individual record approach
-- These columns are no longer needed in the consolidated approach
ALTER TABLE student_attendance 
DROP COLUMN IF EXISTS student_id,
DROP COLUMN IF EXISTS timetable_slot_id,
DROP COLUMN IF EXISTS status;

-- Step 2: Make required columns NOT NULL
-- attendance_data is required for consolidated records
ALTER TABLE student_attendance 
ALTER COLUMN attendance_data SET NOT NULL;

-- section_id and timetable_id are required for consolidated records
ALTER TABLE student_attendance 
ALTER COLUMN section_id SET NOT NULL,
ALTER COLUMN timetable_id SET NOT NULL;

-- Step 3: Add unique constraint for consolidated records
-- This ensures only one attendance record per class per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_consolidated_attendance_record
ON student_attendance (institution_id, timetable_id, section_id, attendance_date);

-- Step 4: Remove is_consolidated column (no longer needed after cleanup)
-- All records will be consolidated by default after this migration
ALTER TABLE student_attendance 
DROP COLUMN IF EXISTS is_consolidated;

-- Step 5: Add a comment to document the table structure
COMMENT ON TABLE student_attendance IS 'Consolidated attendance records - one record per class per day with JSONB attendance data';
COMMENT ON COLUMN student_attendance.attendance_data IS 'JSONB object containing student attendance for all periods of the day';

COMMIT;

-- Verify the final table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'student_attendance' 
ORDER BY ordinal_position;
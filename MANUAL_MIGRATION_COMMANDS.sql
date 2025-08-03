-- =====================================================
-- MANUAL MIGRATION: Cleanup Student Attendance Table
-- =====================================================
-- Run these commands in your Supabase SQL Editor with admin privileges
-- This will clean up the hybrid table structure to match your implementation plan

-- IMPORTANT: Verify the table is empty before running
-- (We already confirmed it's empty, but double-check)
SELECT COUNT(*) as total_records FROM student_attendance;
-- Expected result: 0 records

-- =====================================================
-- STEP 1: Remove unwanted old columns
-- =====================================================
-- These columns are from the old individual record approach
-- and are no longer needed in the consolidated approach

ALTER TABLE student_attendance 
DROP COLUMN IF EXISTS student_id,
DROP COLUMN IF EXISTS timetable_slot_id,
DROP COLUMN IF EXISTS status;

-- =====================================================
-- STEP 2: Make required columns NOT NULL
-- =====================================================
-- These columns are essential for the consolidated approach

-- Make attendance_data NOT NULL (required for consolidated records)
ALTER TABLE student_attendance 
ALTER COLUMN attendance_data SET NOT NULL;

-- Make section_id and timetable_id NOT NULL (required for consolidated records)
ALTER TABLE student_attendance 
ALTER COLUMN section_id SET NOT NULL,
ALTER COLUMN timetable_id SET NOT NULL;

-- =====================================================
-- STEP 3: Add unique constraint
-- =====================================================
-- This ensures only one attendance record per class per day
-- This is critical for the consolidated approach to work correctly

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_consolidated_attendance_record
ON student_attendance (institution_id, timetable_id, section_id, attendance_date);

-- =====================================================
-- STEP 4: Remove migration helper column
-- =====================================================
-- The is_consolidated column was only needed during migration
-- Since we're cleaning up to pure consolidated structure, it's no longer needed

ALTER TABLE student_attendance 
DROP COLUMN IF EXISTS is_consolidated;

-- =====================================================
-- STEP 5: Add documentation
-- =====================================================
-- Add comments to document the table structure

COMMENT ON TABLE student_attendance IS 'Consolidated attendance records - one record per class per day with JSONB attendance data';
COMMENT ON COLUMN student_attendance.attendance_data IS 'JSONB object containing student attendance for all periods of the day';

-- =====================================================
-- VERIFICATION: Check final table structure
-- =====================================================
-- Run this to verify the migration was successful

SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'student_attendance' 
ORDER BY ordinal_position;

-- Expected columns after migration:
-- 1. id (uuid, NOT NULL, PRIMARY KEY)
-- 2. attendance_date (date, NOT NULL)
-- 3. marked_by (uuid, NOT NULL)
-- 4. institution_id (uuid, NOT NULL)
-- 5. created_at (timestamptz, NOT NULL)
-- 6. updated_at (timestamptz, NOT NULL)
-- 7. timetable_id (uuid, NOT NULL)
-- 8. section_id (uuid, NOT NULL)
-- 9. attendance_data (jsonb, NOT NULL)

-- =====================================================
-- VERIFICATION: Check constraints and indexes
-- =====================================================
-- Verify the unique constraint was created

SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'student_attendance';

-- Expected: Should show idx_unique_consolidated_attendance_record

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================
-- If all commands ran successfully, your table is now:
-- ✅ Cleaned of old individual record columns
-- ✅ Properly constrained for consolidated records
-- ✅ Ready for high-performance attendance operations
-- ✅ Aligned with your implementation plan
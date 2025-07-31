-- Fix the student_attendance marked_by foreign key constraint
-- The constraint currently references a non-existent 'users' table
-- It should reference the 'profiles' table instead

-- First, drop the existing constraint
ALTER TABLE student_attendance 
DROP CONSTRAINT IF EXISTS student_attendance_marked_by_fkey;

-- Add the correct foreign key constraint to profiles table
ALTER TABLE student_attendance 
ADD CONSTRAINT student_attendance_marked_by_fkey 
FOREIGN KEY (marked_by) 
REFERENCES profiles(id) 
ON DELETE SET NULL;

-- Add an index on marked_by for better query performance
CREATE INDEX IF NOT EXISTS idx_student_attendance_marked_by 
ON student_attendance(marked_by);

-- Add a comment to document this change
COMMENT ON COLUMN student_attendance.marked_by IS 'References profiles.id - the user who marked the attendance';
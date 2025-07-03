-- Migration: Add academic_year_id to students table
-- Description: Adds academic_year_id column to students table to associate students with academic years
-- Date: 2025-01-06

-- Add academic_year_id column to students table
ALTER TABLE students
ADD COLUMN academic_year_id UUID REFERENCES academic_years(id);

-- Add index for performance on academic_year_id lookups
CREATE INDEX idx_students_academic_year_id ON students(academic_year_id);

-- Add comments for documentation
COMMENT ON COLUMN students.academic_year_id IS 'Foreign key reference to academic_years table';
COMMENT ON INDEX idx_students_academic_year_id IS 'Index for efficient academic year lookups on students table';

-- Update any existing RLS policies that might need to account for academic_year_id
-- (This depends on your existing RLS setup - adjust as needed) 
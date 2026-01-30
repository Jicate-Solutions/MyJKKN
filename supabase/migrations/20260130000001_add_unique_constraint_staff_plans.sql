-- Migration: Add unique constraint to prevent duplicate staff plans
-- Created: 2026-01-30
-- Purpose: Ensure only one staff plan per academic year + semester hierarchy

-- Add unique constraint to staff_plans table
ALTER TABLE staff_plans
ADD CONSTRAINT unique_staff_plan_per_year
UNIQUE (institution_id, program_id, semester_id, academic_year_id, department_id);

-- Add comment for documentation
COMMENT ON CONSTRAINT unique_staff_plan_per_year ON staff_plans IS
'Ensures one staff plan per academic year and semester hierarchy to prevent duplicates';

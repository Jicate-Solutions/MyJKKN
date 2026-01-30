-- Migration: Add unique constraint to prevent duplicate staff plans
-- Created: 2026-01-30
-- Purpose: Ensure only one staff plan per academic year + semester hierarchy
--
-- IMPORTANT: Run the duplicate check query below BEFORE applying this migration
-- to verify there are no existing duplicates in your database.
--
-- Rollback: To undo this migration, run:
-- ALTER TABLE staff_plans DROP CONSTRAINT unique_staff_plan_per_year;

-- Step 1: Check for duplicate data (UNCOMMENT AND RUN BEFORE MIGRATION)
-- This query identifies any existing duplicates that would violate the constraint
/*
SELECT
    institution_id,
    program_id,
    semester_id,
    academic_year_id,
    department_id,
    COUNT(*) as duplicate_count
FROM staff_plans
GROUP BY institution_id, program_id, semester_id, academic_year_id, department_id
HAVING COUNT(*) > 1;
*/

-- Step 2: Add unique constraint to staff_plans table
-- Note: PostgreSQL automatically creates an index for UNIQUE constraints
ALTER TABLE staff_plans
ADD CONSTRAINT unique_staff_plan_per_year
UNIQUE (institution_id, program_id, semester_id, academic_year_id, department_id);

-- Step 3: Add comment for documentation
COMMENT ON CONSTRAINT unique_staff_plan_per_year ON staff_plans IS
'Ensures one staff plan per academic year and semester hierarchy to prevent duplicates';

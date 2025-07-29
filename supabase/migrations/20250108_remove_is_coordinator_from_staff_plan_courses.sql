-- Migration: Remove is_coordinator from staff_plan_courses
-- Date: 2025-01-08
-- Description: Remove is_coordinator column from staff_plan_courses table as it was removed from the codebase

-- Remove the is_coordinator column from staff_plan_courses table
ALTER TABLE public.staff_plan_courses 
DROP COLUMN IF EXISTS is_coordinator;

-- Update table comment to reflect the change
COMMENT ON TABLE public.staff_plan_courses IS 'Staff plan course assignments - hours_allocated and is_coordinator fields removed in 2025-01-08 as part of staff planning module cleanup'; 
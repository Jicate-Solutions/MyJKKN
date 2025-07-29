-- Migration: Remove hours_allocated from staff_plan_courses
-- Date: 2025-01-08
-- Description: Remove hours_allocated column from staff_plan_courses table as it was removed from staff planning module

-- Remove the hours_allocated column from staff_plan_courses table
ALTER TABLE public.staff_plan_courses 
DROP COLUMN IF EXISTS hours_allocated;

-- Add a comment to indicate the change
COMMENT ON TABLE public.staff_plan_courses IS 'Staff plan course assignments - hours_allocated field removed in 2025-01-08 as part of staff planning module cleanup'; 
-- Migration: Add missing columns to staff_plan_courses
-- Date: 2025-01-08
-- Description: Add back is_coordinator and is_combined columns to staff_plan_courses table as they are being used in the codebase

-- Add the missing columns to staff_plan_courses table
ALTER TABLE public.staff_plan_courses 
ADD COLUMN IF NOT EXISTS is_coordinator BOOLEAN DEFAULT false;

ALTER TABLE public.staff_plan_courses 
ADD COLUMN IF NOT EXISTS is_combined BOOLEAN DEFAULT false;

-- Add comments to explain the columns
COMMENT ON COLUMN public.staff_plan_courses.is_coordinator IS 'Indicates if the staff member is a coordinator for this course';
COMMENT ON COLUMN public.staff_plan_courses.is_combined IS 'Indicates if this is for combined classes'; 
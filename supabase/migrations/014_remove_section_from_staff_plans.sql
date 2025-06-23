-- Migration: 014_remove_section_from_staff_plans
-- Description: Remove section field from staff_plans table to make staff assignments semester-based only

-- Drop the section column from staff_plans table
ALTER TABLE public.staff_plans 
DROP COLUMN IF EXISTS section;

-- Update any existing indexes that might reference the section field
-- (No specific section indexes found, but this is a safety measure)

-- Note: This migration removes section-based staff planning
-- Staff assignments will now be semester-based only 
-- Migration: Add timetable_type column to institutions table
-- Date: 2025-01-03
-- Description: Adds timetable_type field to institutions with Day Order and Week Order options

-- Add timetable_type column to institutions table
ALTER TABLE public.institutions 
ADD COLUMN timetable_type VARCHAR(20) 
CHECK (timetable_type IN ('day_order', 'week_order')) 
DEFAULT 'day_order' 
NOT NULL;

-- Update existing records to have default value
UPDATE public.institutions 
SET timetable_type = 'day_order' 
WHERE timetable_type IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.institutions.timetable_type IS 'Type of timetable system used by the institution: day_order for daily schedules, week_order for weekly schedules';

-- Create index for better query performance
CREATE INDEX idx_institutions_timetable_type ON public.institutions(timetable_type); 
-- Migration: Remove Day Order Workflow
-- Date: 2025-01-08
-- Description: Remove day order related tables, triggers, and functions, keeping only week order workflow

-- Drop trigger first (depends on function)
DROP TRIGGER IF EXISTS trigger_handle_day_order_leave_shift ON public.timetable_leaves;

-- Drop the day order shift handling function
DROP FUNCTION IF EXISTS handle_day_order_leave_shift();

-- Drop the institution timetable type function
DROP FUNCTION IF EXISTS get_institution_timetable_type(UUID);

-- Drop the day order shifts table
DROP TABLE IF EXISTS public.timetable_day_order_shifts;

-- Drop the leave_type enum and timetable_leaves table (if only used for day order)
-- Since these were primarily for day order workflow
DROP TABLE IF EXISTS public.timetable_leaves;
DROP TYPE IF EXISTS leave_type;

-- Remove timetable_type column from institutions table since we only support week_order now
ALTER TABLE public.institutions DROP COLUMN IF EXISTS timetable_type;

-- Drop related indexes that are no longer needed
DROP INDEX IF EXISTS idx_institutions_timetable_type;
DROP INDEX IF EXISTS idx_timetable_leaves_timetable_id;
DROP INDEX IF EXISTS idx_timetable_leaves_leave_date;
DROP INDEX IF EXISTS idx_timetable_leaves_active;
DROP INDEX IF EXISTS idx_timetable_leaves_composite;
DROP INDEX IF EXISTS idx_timetable_leaves_unique_active;
DROP INDEX IF EXISTS idx_day_order_shifts_timetable_id;
DROP INDEX IF EXISTS idx_day_order_shifts_dates;

-- Drop the updated_at trigger function for timetable_leaves
DROP FUNCTION IF EXISTS update_timetable_leaves_updated_at();

-- Add comment for documentation
COMMENT ON TABLE public.institutions IS 'Institutions table - now only supports week order timetable workflow';

-- Create index for better query performance on institutions
CREATE INDEX IF NOT EXISTS idx_institutions_active ON public.institutions(is_active) WHERE is_active = true; 
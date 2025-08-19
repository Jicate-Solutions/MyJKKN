-- Add missing columns to bug_report_participants table
-- These columns are used by the application but missing from the original schema

-- Add can_view_internal column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bug_report_participants' 
        AND column_name = 'can_view_internal'
    ) THEN
        ALTER TABLE public.bug_report_participants 
        ADD COLUMN can_view_internal BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Add is_active column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bug_report_participants' 
        AND column_name = 'is_active'
    ) THEN
        ALTER TABLE public.bug_report_participants 
        ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Add joined_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bug_report_participants' 
        AND column_name = 'joined_at'
    ) THEN
        ALTER TABLE public.bug_report_participants 
        ADD COLUMN joined_at TIMESTAMPTZ DEFAULT now();
    END IF;
END $$;

-- Update existing records to have proper default values
UPDATE public.bug_report_participants 
SET 
    can_view_internal = false,
    is_active = true,
    joined_at = COALESCE(joined_at, created_at, now())
WHERE can_view_internal IS NULL OR is_active IS NULL OR joined_at IS NULL;

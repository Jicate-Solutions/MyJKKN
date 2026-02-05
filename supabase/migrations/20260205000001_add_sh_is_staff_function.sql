-- Migration: Add missing sh_is_staff() function
-- Created: 2026-02-05
-- Purpose: Fix "Failed to load builders" error caused by missing permission function

-- Drop if exists (for idempotency)
DROP FUNCTION IF EXISTS public.sh_is_staff() CASCADE;

-- Create sh_is_staff() function
CREATE OR REPLACE FUNCTION public.sh_is_staff()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('staff', 'faculty', 'teaching_staff', 'non_teaching_staff')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sh_is_staff IS
'Checks if current user is a staff member (any staff-related role).';

-- Fix infinite recursion in bug_report_participants RLS policies
-- This migration fixes the circular dependency issue between bug_reports and bug_report_participants

-- 1. First, update the trigger function to use SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.add_bug_reporter_as_participant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER -- This allows the function to bypass RLS
AS $$
BEGIN
    -- Insert the bug reporter as a participant with elevated privileges
    INSERT INTO public.bug_report_participants (
        bug_report_id, 
        user_id, 
        role,
        can_view_internal,
        is_active,
        joined_at
    )
    VALUES (
        NEW.id, 
        NEW.reporter_user_id, 
        'reporter',
        false,
        true,
        now()
    )
    ON CONFLICT (bug_report_id, user_id) DO NOTHING;
    
    RETURN NEW;
END;
$$;

-- 2. Update the participants RLS policies to be simpler and avoid circular dependencies
DROP POLICY IF EXISTS "participants_insert_admin" ON bug_report_participants;

-- Create a simpler insert policy that allows:
-- 1. Super admins to insert anyone
-- 2. Users to add themselves as participants (but we'll primarily rely on the trigger)
-- 3. Trigger function (via SECURITY DEFINER) to insert automatically
CREATE POLICY "participants_insert_simple" ON bug_report_participants
    FOR INSERT WITH CHECK (
        is_super_admin() OR 
        user_id = auth.uid()
    );

-- 3. Update the participants table to have a unique constraint
-- (in case it doesn't exist) to prevent duplicate participants
DO $$
BEGIN
    -- Try to add unique constraint, ignore if it already exists
    BEGIN
        ALTER TABLE public.bug_report_participants 
        ADD CONSTRAINT bug_report_participants_unique_user_report 
        UNIQUE (bug_report_id, user_id);
    EXCEPTION
        WHEN duplicate_table THEN 
            -- Constraint already exists, do nothing
            NULL;
    END;
END
$$;

-- 4. Create an update policy for participants
CREATE POLICY "participants_update_admin_or_self" ON bug_report_participants
    FOR UPDATE USING (
        is_super_admin() OR 
        user_id = auth.uid()
    );

-- 5. Grant necessary permissions to the authenticated role
GRANT INSERT, SELECT, UPDATE ON public.bug_report_participants TO authenticated;

-- 6. Add a comment explaining the fix
COMMENT ON FUNCTION public.add_bug_reporter_as_participant() IS 
'Automatically adds bug reporter as participant. Uses SECURITY DEFINER to bypass RLS and prevent infinite recursion.';

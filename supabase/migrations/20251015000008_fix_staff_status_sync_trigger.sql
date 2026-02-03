-- Fix sync_staff_status_to_profile trigger to work with OAuth users
-- Date: 2025-10-15
-- Purpose: Remove restrictive WHERE conditions that prevent status sync after OAuth login

-- Updated: 2025-10-15 - Fixed WHERE clause to sync status regardless of role or pre-registered state
CREATE OR REPLACE FUNCTION public.sync_staff_status_to_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only sync if is_active status changed and institution_email exists
    IF OLD.is_active != NEW.is_active AND
       NEW.institution_email IS NOT NULL AND
       NEW.institution_email != '' THEN

        -- Update profile is_active status to match staff status
        -- CRITICAL FIX: Removed role and is_pre_registered conditions
        -- This now works for both pre-registered AND OAuth-logged-in users
        UPDATE profiles
        SET
            is_active = NEW.is_active,
            updated_at = NOW()
        WHERE email = NEW.institution_email;
    END IF;

    RETURN NEW;
END;
$$;

-- Add comment explaining the fix
COMMENT ON FUNCTION public.sync_staff_status_to_profile() IS
'Syncs staff is_active status to profiles table when changed.
Works for all profiles with matching email, regardless of role or is_pre_registered state.
This ensures status syncs correctly after users log in with Google OAuth.';

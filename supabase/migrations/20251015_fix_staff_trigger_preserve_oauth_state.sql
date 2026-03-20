-- Fix staff trigger to preserve OAuth login state
-- Date: 2025-10-15
-- Purpose: Prevent staff updates from reverting is_pre_registered back to true after OAuth login

-- Updated: 2025-10-15 - Fixed to preserve is_pre_registered state after OAuth login
CREATE OR REPLACE FUNCTION public.sync_staff_to_profiles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only create profile if institution_email is provided
    IF NEW.institution_email IS NOT NULL AND NEW.institution_email != '' THEN
        -- Create or update profile when staff is created using institution_email
        -- Set is_pre_registered = true to bypass auth user validation
        INSERT INTO profiles (id, email, full_name, phone_number, institution_id, role, is_pre_registered)
        VALUES (
            gen_random_uuid(),
            NEW.institution_email,
            CONCAT(NEW.first_name, ' ', NEW.last_name),
            NEW.phone,
            NEW.institution_id,
            'faculty',  -- Changed from 'staff' to 'faculty' to match actual role
            true
        )
        ON CONFLICT (email) DO UPDATE
        SET
            full_name = EXCLUDED.full_name,
            phone_number = EXCLUDED.phone_number,
            institution_id = EXCLUDED.institution_id,
            -- CRITICAL FIX: DON'T update is_pre_registered
            -- If user has logged in with OAuth, is_pre_registered will be false
            -- We must preserve that state, not revert it back to true
            updated_at = NOW();
    END IF;

    RETURN NEW;
END;
$$;

-- Add comment explaining the fix
COMMENT ON FUNCTION public.sync_staff_to_profiles() IS
'Syncs staff data to profiles table. Creates pre-registered profile on INSERT.
On UPDATE (conflict), only updates name/phone/institution, NOT is_pre_registered.
This preserves OAuth login state after users log in with Google.';

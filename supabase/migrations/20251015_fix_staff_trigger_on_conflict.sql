-- Fix sync_staff_to_profiles trigger to not use ON CONFLICT
-- Date: 2025-10-15
-- Purpose: Replace ON CONFLICT with explicit existence check since we no longer have unique constraint on email

-- Updated: 2025-10-15 - Fixed to check existence explicitly instead of ON CONFLICT
CREATE OR REPLACE FUNCTION public.sync_staff_to_profiles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    existing_profile_id UUID;
BEGIN
    -- Only create profile if institution_email is provided
    IF NEW.institution_email IS NOT NULL AND NEW.institution_email != '' THEN
        -- Check if profile already exists with this email
        SELECT id INTO existing_profile_id
        FROM profiles
        WHERE email = NEW.institution_email
        LIMIT 1;

        IF existing_profile_id IS NOT NULL THEN
            -- Update existing profile (but DON'T change is_pre_registered)
            UPDATE profiles
            SET
                full_name = CONCAT(NEW.first_name, ' ', NEW.last_name),
                phone_number = NEW.phone,
                institution_id = NEW.institution_id,
                updated_at = NOW()
            WHERE id = existing_profile_id;
        ELSE
            -- Create new pre-registered profile
            INSERT INTO profiles (id, email, full_name, phone_number, institution_id, role, is_pre_registered)
            VALUES (
                gen_random_uuid(),
                NEW.institution_email,
                CONCAT(NEW.first_name, ' ', NEW.last_name),
                NEW.phone,
                NEW.institution_id,
                'faculty',
                true
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Add comment explaining the fix
COMMENT ON FUNCTION public.sync_staff_to_profiles() IS
'Syncs staff data to profiles table. Creates pre-registered profile on INSERT.
On UPDATE, only updates name/phone/institution if profile exists, preserving is_pre_registered state.
Uses explicit SELECT instead of ON CONFLICT since email has only a partial unique index.';

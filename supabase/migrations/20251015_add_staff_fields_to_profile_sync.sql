-- Add department_id, gender, and designation to profile sync from staff
-- Date: 2025-10-15
-- Purpose: Include all staff fields when creating/updating profiles

-- Updated: 2025-10-15 - Added department_id, gender, and designation fields
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
                department_id = NEW.department_id,
                gender = NEW.gender,
                designation = NEW.designation,
                updated_at = NOW()
            WHERE id = existing_profile_id;
        ELSE
            -- Create new pre-registered profile with all staff details
            INSERT INTO profiles (
                id,
                email,
                full_name,
                phone_number,
                institution_id,
                department_id,
                gender,
                designation,
                role,
                is_pre_registered
            )
            VALUES (
                gen_random_uuid(),
                NEW.institution_email,
                CONCAT(NEW.first_name, ' ', NEW.last_name),
                NEW.phone,
                NEW.institution_id,
                NEW.department_id,
                NEW.gender,
                NEW.designation,
                'faculty',
                true
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Add comment explaining the fields
COMMENT ON FUNCTION public.sync_staff_to_profiles() IS
'Syncs staff data to profiles table including department_id, gender, and designation.
Creates pre-registered profile on INSERT with all staff fields.
On UPDATE, syncs all fields but preserves is_pre_registered state for OAuth users.';

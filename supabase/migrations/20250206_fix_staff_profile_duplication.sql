-- Migration: Fix Staff Profile Duplication Issue
-- Date: 2025-02-06
-- Purpose: Prevent duplicate profiles when staff/faculty login with OAuth
-- Issue: When staff created via staff module login with OAuth, the system creates
--        a new profile instead of linking to the existing one, resulting in
--        "migrated_" email addresses and broken staff-profile relationships

-- ================================================================================
-- STEP 1: Fix the link_pre_registered_profile function
-- ================================================================================

-- Drop existing trigger first
DROP TRIGGER IF EXISTS link_pre_registered_profile_trigger ON auth.users;

-- Replace the function with improved logic
CREATE OR REPLACE FUNCTION public.link_pre_registered_profile()
RETURNS TRIGGER AS $$
DECLARE
  pre_registered_profile RECORD;
  existing_profile RECORD;
  staff_record RECORD;
BEGIN
  -- First check if a profile already exists with this auth user ID
  SELECT * INTO existing_profile
  FROM public.profiles
  WHERE id = NEW.id;

  -- If profile already exists with this ID, nothing to do
  IF FOUND THEN
    RETURN NEW;
  END IF;

  -- Check if there's a pre-registered or existing profile with matching email
  SELECT * INTO pre_registered_profile
  FROM public.profiles
  WHERE email = NEW.email
    AND id != NEW.id  -- Different ID means it's a pre-registered or old profile
  LIMIT 1;  -- Take only one in case of duplicates

  IF FOUND THEN
    -- Special handling for staff/faculty - UPDATE instead of migrate
    IF pre_registered_profile.role IN ('staff', 'faculty') AND pre_registered_profile.is_pre_registered = TRUE THEN
      -- This is a staff/faculty member created via staff module
      -- Update their existing profile ID to match the OAuth user ID

      -- First, update the profile's ID (this requires CASCADE updates or manual FK updates)
      -- We'll use a safer approach: update all references first, then the profile

      -- Update staff table reference (if exists)
      UPDATE public.staff
      SET profile_id = NEW.id
      WHERE profile_id = pre_registered_profile.id;

      -- Update any other tables that might reference this profile
      UPDATE public.user_institution_access
      SET user_id = NEW.id
      WHERE user_id = pre_registered_profile.id;

      UPDATE public.user_activity_logs
      SET user_id = NEW.id
      WHERE user_id = pre_registered_profile.id;

      UPDATE public.user_notifications
      SET user_id = NEW.id
      WHERE user_id = pre_registered_profile.id;

      UPDATE public.push_subscriptions
      SET user_id = NEW.id
      WHERE user_id = pre_registered_profile.id;

      -- Now delete the old profile and insert with new ID
      DELETE FROM public.profiles WHERE id = pre_registered_profile.id;

      -- Create profile with OAuth user's ID
      INSERT INTO public.profiles (
        id,
        email,
        full_name,
        role,
        phone_number,
        institution_id,
        department_id,
        profile_completed,
        is_active,
        is_pre_registered,
        gender,
        bio,
        designation,
        avatar_url,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,  -- Use OAuth user's ID
        NEW.email,
        pre_registered_profile.full_name,
        pre_registered_profile.role,
        pre_registered_profile.phone_number,
        pre_registered_profile.institution_id,
        pre_registered_profile.department_id,
        pre_registered_profile.profile_completed,
        TRUE,  -- Ensure active
        FALSE, -- No longer pre-registered
        pre_registered_profile.gender,
        pre_registered_profile.bio,
        pre_registered_profile.designation,
        pre_registered_profile.avatar_url,
        pre_registered_profile.created_at,  -- Preserve original creation date
        NOW()
      );

      RAISE NOTICE 'Linked % profile for % to OAuth ID %',
        pre_registered_profile.role,
        NEW.email,
        NEW.id;

      RETURN NEW;

    -- Special handling for driver role (keep existing migration logic)
    ELSIF pre_registered_profile.role = 'driver' THEN
      -- Generate a unique email for the old profile to avoid constraint violations
      UPDATE public.profiles
      SET
        email = CONCAT('migrated_', pre_registered_profile.id::text, '_', email),
        is_active = FALSE,
        is_pre_registered = FALSE,
        updated_at = NOW()
      WHERE id = pre_registered_profile.id;

      -- Create a new profile with the OAuth user ID, copying data from existing profile
      INSERT INTO public.profiles (
        id,
        email,
        full_name,
        role,
        phone_number,
        institution_id,
        profile_completed,
        is_active,
        is_pre_registered,
        gender,
        bio,
        designation,
        avatar_url,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,
        NEW.email,
        COALESCE(pre_registered_profile.full_name, split_part(NEW.email, '@', 1)),
        pre_registered_profile.role,
        pre_registered_profile.phone_number,
        pre_registered_profile.institution_id,
        pre_registered_profile.profile_completed,
        pre_registered_profile.is_active,
        FALSE,
        pre_registered_profile.gender,
        pre_registered_profile.bio,
        pre_registered_profile.designation,
        pre_registered_profile.avatar_url,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        phone_number = EXCLUDED.phone_number,
        institution_id = EXCLUDED.institution_id,
        profile_completed = EXCLUDED.profile_completed,
        is_active = EXCLUDED.is_active,
        is_pre_registered = FALSE,
        updated_at = NOW();

      RAISE NOTICE 'Migrated driver profile for % from old ID % to new OAuth ID %',
        NEW.email,
        pre_registered_profile.id,
        NEW.id;

    ELSIF pre_registered_profile.is_pre_registered = TRUE THEN
      -- For other pre-registered profiles
      -- Delete old profile and create with new ID
      DELETE FROM public.profiles WHERE id = pre_registered_profile.id;

      INSERT INTO public.profiles (
        id,
        email,
        full_name,
        role,
        phone_number,
        institution_id,
        department_id,
        profile_completed,
        is_active,
        is_pre_registered,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,
        NEW.email,
        pre_registered_profile.full_name,
        pre_registered_profile.role,
        pre_registered_profile.phone_number,
        pre_registered_profile.institution_id,
        pre_registered_profile.department_id,
        pre_registered_profile.profile_completed,
        TRUE,
        FALSE,
        pre_registered_profile.created_at,
        NOW()
      );

      RAISE NOTICE 'Linked pre-registered profile for % to OAuth ID %', NEW.email, NEW.id;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- If we still get a unique violation, log it and continue
    RAISE WARNING 'Unique violation in link_pre_registered_profile for user %: %', NEW.email, SQLERRM;
    RETURN NEW;
  WHEN OTHERS THEN
    -- Log any other error but don't fail the authentication
    RAISE WARNING 'Error in link_pre_registered_profile for user %: % - %', NEW.email, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER link_pre_registered_profile_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.link_pre_registered_profile();

-- Add a comment to track this migration
COMMENT ON FUNCTION public.link_pre_registered_profile() IS 'Handles linking pre-registered profiles - Fixed staff/faculty duplication issue 2025-02-06';

-- ================================================================================
-- STEP 2: Create cleanup function for existing migrated profiles
-- ================================================================================

CREATE OR REPLACE FUNCTION public.cleanup_migrated_staff_profiles()
RETURNS TABLE (
  staff_id uuid,
  old_profile_id uuid,
  new_profile_id uuid,
  email text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  staff_rec RECORD;
  migrated_profile RECORD;
  active_profile RECORD;
BEGIN
  -- Find all staff with migrated profiles
  FOR staff_rec IN
    SELECT
      s.id,
      s.institution_email,
      s.profile_id,
      p.email as current_profile_email
    FROM staff s
    LEFT JOIN profiles p ON s.profile_id = p.id
    WHERE s.institution_email IS NOT NULL
      AND (p.email LIKE 'migrated_%' OR s.profile_id IS NULL)
  LOOP
    -- Check if there's a migrated profile for this email
    SELECT * INTO migrated_profile
    FROM profiles
    WHERE email LIKE 'migrated_%' || '%' || staff_rec.institution_email;

    -- Check if there's an active profile with the correct email
    SELECT * INTO active_profile
    FROM profiles
    WHERE email = staff_rec.institution_email
      AND email NOT LIKE 'migrated_%';

    IF migrated_profile.id IS NOT NULL AND active_profile.id IS NOT NULL THEN
      -- We have both migrated and active profiles
      -- Update staff to point to active profile
      UPDATE staff
      SET profile_id = active_profile.id
      WHERE id = staff_rec.id;

      -- Deactivate the migrated profile (keep for audit)
      UPDATE profiles
      SET is_active = FALSE
      WHERE id = migrated_profile.id;

      staff_id := staff_rec.id;
      old_profile_id := migrated_profile.id;
      new_profile_id := active_profile.id;
      email := staff_rec.institution_email;
      status := 'Fixed: Updated staff to point to active profile';
      RETURN NEXT;

    ELSIF migrated_profile.id IS NOT NULL AND active_profile.id IS NULL THEN
      -- Only migrated profile exists, restore it
      UPDATE profiles
      SET
        email = staff_rec.institution_email,
        is_active = TRUE
      WHERE id = migrated_profile.id;

      UPDATE staff
      SET profile_id = migrated_profile.id
      WHERE id = staff_rec.id;

      staff_id := staff_rec.id;
      old_profile_id := migrated_profile.id;
      new_profile_id := migrated_profile.id;
      email := staff_rec.institution_email;
      status := 'Fixed: Restored migrated profile';
      RETURN NEXT;

    ELSE
      staff_id := staff_rec.id;
      old_profile_id := staff_rec.profile_id;
      new_profile_id := NULL;
      email := staff_rec.institution_email;
      status := 'Warning: No profile found';
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.cleanup_migrated_staff_profiles() IS 'Fixes staff records pointing to migrated profiles - Run once after migration';

-- ================================================================================
-- STEP 3: Run cleanup on existing data (optional - can be run manually)
-- ================================================================================

-- Uncomment to run cleanup automatically:
-- SELECT * FROM public.cleanup_migrated_staff_profiles();

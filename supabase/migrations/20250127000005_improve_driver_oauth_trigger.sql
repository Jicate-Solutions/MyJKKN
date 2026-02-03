-- Migration: Improve driver OAuth trigger to handle edge cases
-- Date: 2025-01-27
-- Purpose: Make the link_pre_registered_profile trigger more robust

-- Drop the existing trigger
DROP TRIGGER IF EXISTS link_pre_registered_profile_trigger ON auth.users;

-- Update the function to handle all edge cases better
CREATE OR REPLACE FUNCTION public.link_pre_registered_profile()
RETURNS TRIGGER AS $$
DECLARE
  pre_registered_profile RECORD;
  existing_profile RECORD;
  new_profile_id UUID;
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
    -- Special handling for driver role and other migrating users
    IF pre_registered_profile.role IN ('driver', 'staff', 'faculty') THEN
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
        NEW.email,  -- Use the auth user's email
        COALESCE(pre_registered_profile.full_name, split_part(NEW.email, '@', 1)),
        pre_registered_profile.role,
        pre_registered_profile.phone_number,
        pre_registered_profile.institution_id,
        pre_registered_profile.profile_completed,
        pre_registered_profile.is_active,
        FALSE, -- No longer pre-registered
        pre_registered_profile.gender,
        pre_registered_profile.bio,
        pre_registered_profile.designation,
        pre_registered_profile.avatar_url,
        NOW(),  -- Use current timestamp for created_at
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
      
      -- Log the migration for audit
      RAISE NOTICE 'Migrated % profile for % from old ID % to new OAuth ID %', 
        pre_registered_profile.role, 
        NEW.email, 
        pre_registered_profile.id, 
        NEW.id;
        
    ELSIF pre_registered_profile.is_pre_registered = TRUE THEN
      -- For actual pre-registered profiles (not migrating users)
      -- First rename the old profile's email to avoid conflicts
      UPDATE public.profiles 
      SET 
        email = CONCAT('pre_registered_', pre_registered_profile.id::text, '_', email),
        is_active = FALSE,
        updated_at = NOW()
      WHERE id = pre_registered_profile.id;
      
      -- Create new profile with auth user ID
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
        pre_registered_profile.profile_completed,
        pre_registered_profile.is_active,
        FALSE, -- No longer pre-registered
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
COMMENT ON FUNCTION public.link_pre_registered_profile() IS 'Handles linking pre-registered profiles and migrating driver/staff profiles to OAuth - improved error handling 2025-01-27';
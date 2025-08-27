-- Migration: Fix driver OAuth login issues
-- Date: 2025-01-27
-- Purpose: Fix the link_pre_registered_profile trigger to handle driver profiles properly

-- Drop the existing trigger
DROP TRIGGER IF EXISTS link_pre_registered_profile_trigger ON auth.users;

-- Update the function to handle driver profiles and avoid deletion issues
CREATE OR REPLACE FUNCTION public.link_pre_registered_profile()
RETURNS TRIGGER AS $$
DECLARE
  pre_registered_profile RECORD;
  existing_profile RECORD;
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
    AND id != NEW.id;  -- Different ID means it's a pre-registered or old profile
  
  IF FOUND THEN
    -- Special handling for driver role and other migrating users
    IF pre_registered_profile.role = 'driver' OR pre_registered_profile.role IN ('staff', 'faculty') THEN
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
        pre_registered_profile.email,
        pre_registered_profile.full_name,
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
        pre_registered_profile.created_at,
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
      
      -- Instead of deleting, mark the old profile as inactive
      -- This prevents foreign key constraint issues
      UPDATE public.profiles 
      SET 
        is_active = FALSE,
        is_pre_registered = FALSE,
        updated_at = NOW()
      WHERE id = pre_registered_profile.id;
      
      -- Log the migration for audit
      RAISE NOTICE 'Migrated % profile for % from old ID % to new OAuth ID %', 
        pre_registered_profile.role, 
        pre_registered_profile.email, 
        pre_registered_profile.id, 
        NEW.id;
        
    ELSIF pre_registered_profile.is_pre_registered = TRUE THEN
      -- For actual pre-registered profiles (not migrating users)
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
        pre_registered_profile.email,
        pre_registered_profile.full_name,
        pre_registered_profile.role,
        pre_registered_profile.phone_number,
        pre_registered_profile.institution_id,
        pre_registered_profile.profile_completed,
        pre_registered_profile.is_active,
        FALSE, -- No longer pre-registered
        pre_registered_profile.created_at,
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
      
      -- Safe to delete pre-registered profiles as they don't have foreign key references
      DELETE FROM public.profiles WHERE id = pre_registered_profile.id;
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the authentication
    RAISE WARNING 'Error in link_pre_registered_profile: % - %', SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER link_pre_registered_profile_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.link_pre_registered_profile();

-- Mark all driver profiles as not pre-registered to ensure they can migrate properly
UPDATE public.profiles 
SET is_pre_registered = FALSE 
WHERE role = 'driver';

-- Add a comment to track this migration
COMMENT ON FUNCTION public.link_pre_registered_profile() IS 'Handles linking pre-registered profiles and migrating driver/staff profiles to OAuth - fixed 2025-01-27';
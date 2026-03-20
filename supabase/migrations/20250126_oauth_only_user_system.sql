-- Migration: Convert to OAuth-only user system
-- Date: 2025-01-26
-- Purpose: Remove email/password authentication and implement OAuth-only flow with pre-registration

-- Add is_pre_registered column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_pre_registered BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.is_pre_registered IS 'Indicates if this profile is pre-registered and pending Google OAuth login';

-- Update existing profiles to mark them as not pre-registered
UPDATE public.profiles 
SET is_pre_registered = FALSE 
WHERE is_pre_registered IS NULL;

-- Create function to handle OAuth login and link pre-registered profiles
CREATE OR REPLACE FUNCTION public.link_pre_registered_profile()
RETURNS TRIGGER AS $$
DECLARE
  pre_registered_profile RECORD;
BEGIN
  -- Check if there's a pre-registered profile with matching email
  SELECT * INTO pre_registered_profile
  FROM public.profiles
  WHERE email = NEW.email
    AND is_pre_registered = TRUE;
  
  IF FOUND THEN
    -- Create a new profile with the actual auth user ID, copying data from pre-registered profile
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
    
    -- Delete the pre-registered placeholder profile
    DELETE FROM public.profiles WHERE id = pre_registered_profile.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to link pre-registered profiles on OAuth login
DROP TRIGGER IF EXISTS link_pre_registered_profile_trigger ON auth.users;
CREATE TRIGGER link_pre_registered_profile_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.link_pre_registered_profile();

-- Create function to check if email is available for pre-registration
CREATE OR REPLACE FUNCTION public.check_email_available(check_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if email exists in profiles (including pre-registered)
  RETURN NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE email = check_email
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.check_email_available TO authenticated;

-- Create RLS policy for pre-registered profiles
CREATE POLICY "Pre-registered profiles are not visible to users" ON public.profiles
  FOR SELECT
  USING (
    -- Don't show pre-registered profiles in normal queries
    is_pre_registered = FALSE 
    OR 
    -- Unless you're an admin checking specific pre-registered profiles
    (auth.uid() IN (
      SELECT id FROM public.profiles 
      WHERE role IN ('super_admin', 'administrator')
    ))
  );

-- Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Add index for performance on pre-registered lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email_pre_registered 
ON public.profiles(email, is_pre_registered);

-- Add index for pre-registered profiles
CREATE INDEX IF NOT EXISTS idx_profiles_pre_registered 
ON public.profiles(is_pre_registered) 
WHERE is_pre_registered = TRUE;

-- Clean up any orphaned auth users without profiles
-- This will not delete users, just log them for manual review
DO $$
DECLARE
  orphaned_user RECORD;
  orphan_count INT := 0;
BEGIN
  FOR orphaned_user IN 
    SELECT au.id, au.email
    FROM auth.users au
    LEFT JOIN public.profiles p ON au.id = p.id
    WHERE p.id IS NULL
  LOOP
    RAISE NOTICE 'Orphaned auth user found: % (%)', orphaned_user.id, orphaned_user.email;
    orphan_count := orphan_count + 1;
  END LOOP;
  
  IF orphan_count > 0 THEN
    RAISE NOTICE 'Total orphaned users found: %', orphan_count;
    RAISE NOTICE 'These users have auth accounts but no profiles.';
  ELSE
    RAISE NOTICE 'No orphaned auth users found.';
  END IF;
END $$;

-- Add helpful comment
COMMENT ON FUNCTION public.link_pre_registered_profile() IS 'Automatically links pre-registered profiles to Google OAuth users on first login';
COMMENT ON FUNCTION public.check_email_available(TEXT) IS 'Checks if an email is available for user creation (not in use by existing or pre-registered profiles)';
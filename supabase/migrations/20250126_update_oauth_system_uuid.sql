-- Update OAuth system to use proper UUIDs instead of pending_ prefix
-- Date: 2025-01-26
-- Purpose: Fix UUID validation errors by using proper UUIDs for pre-registered profiles

-- Drop the old index that uses LIKE pattern
DROP INDEX IF EXISTS idx_profiles_pending_id;

-- Create new index for pre-registered profiles
CREATE INDEX IF NOT EXISTS idx_profiles_pre_registered 
ON public.profiles(is_pre_registered) 
WHERE is_pre_registered = TRUE;

-- Update the trigger function to not check for pending_ prefix
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

-- Update comment
COMMENT ON FUNCTION public.link_pre_registered_profile() IS 'Links pre-registered profiles to Google OAuth users on first login using email matching';
-- Create function for pre-registering profiles
-- Date: 2025-01-27
-- Purpose: Allow secure profile pre-registration bypassing RLS

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.create_preregistered_profile(
  profile_id uuid,
  profile_email text,
  profile_full_name text,
  profile_role text,
  profile_phone text,
  profile_institution_id uuid,
  profile_department_id uuid
);

-- Create function with SECURITY DEFINER to run with elevated privileges
CREATE OR REPLACE FUNCTION public.create_preregistered_profile(
  profile_id uuid,
  profile_email text,
  profile_full_name text,
  profile_role text,
  profile_phone text DEFAULT NULL,
  profile_institution_id uuid DEFAULT NULL,
  profile_department_id uuid DEFAULT NULL
) RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_profile public.profiles;
  current_user_role text;
BEGIN
  -- Check if the current user has permission to create profiles
  SELECT role INTO current_user_role
  FROM public.profiles
  WHERE id = auth.uid();

  -- Only allow super_admin, administrator, or faculty to create pre-registered profiles
  IF current_user_role NOT IN ('super_admin', 'administrator', 'faculty') THEN
    RAISE EXCEPTION 'Insufficient permissions to create pre-registered profile'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- For faculty, ensure they can only create profiles for their own institution
  IF current_user_role = 'faculty' THEN
    IF profile_institution_id IS NULL OR profile_institution_id NOT IN (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Faculty can only create profiles for their own institution'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Check if profile with this email already exists
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email = profile_email) THEN
    RAISE EXCEPTION 'Profile with email % already exists', profile_email
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Insert the new pre-registered profile
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
  ) VALUES (
    profile_id,
    profile_email,
    profile_full_name,
    profile_role,
    profile_phone,
    profile_institution_id,
    profile_department_id,
    true,
    true,
    true,
    NOW(),
    NOW()
  ) RETURNING * INTO new_profile;

  RETURN new_profile;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Profile with email % already exists', profile_email
      USING ERRCODE = 'unique_violation';
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Invalid institution or department ID provided'
      USING ERRCODE = 'foreign_key_violation';
  WHEN others THEN
    RAISE EXCEPTION 'Failed to create pre-registered profile: %', SQLERRM
      USING ERRCODE = 'internal_error';
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.create_preregistered_profile(
  uuid, text, text, text, text, uuid, uuid
) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.create_preregistered_profile IS 
'Creates a pre-registered profile for OAuth-based authentication. 
Only users with super_admin, administrator, or faculty roles can use this function.
Faculty users can only create profiles for their own institution.';

-- Test the function (optional - remove in production)
DO $$
BEGIN
  RAISE NOTICE 'Function create_preregistered_profile created successfully';
END $$;

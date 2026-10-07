-- Production's create_preregistered_profile as of 2026-10-07 (pg_get_functiondef, read-only),
-- which differs from the repo copy. The rehearsal starts from this body.
CREATE OR REPLACE FUNCTION public.create_preregistered_profile(profile_id uuid, profile_email text, profile_full_name text, profile_role text, profile_phone text DEFAULT NULL::text, profile_institution_id uuid DEFAULT NULL::uuid, profile_department_id uuid DEFAULT NULL::uuid)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_profile public.profiles;
  current_user_role text;
  current_user_institution_id uuid;
BEGIN
  -- Check if the current user has permission to create profiles
  SELECT role, institution_id INTO current_user_role, current_user_institution_id
  FROM public.profiles
  WHERE id = auth.uid();

  -- Only allow super_admin, administrator, or faculty to create pre-registered profiles
  IF current_user_role NOT IN ('super_admin', 'administrator', 'faculty') THEN
    RAISE EXCEPTION 'Insufficient permissions to create pre-registered profile'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- For faculty, ensure they can only create profiles for their own institution
  IF current_user_role = 'faculty' THEN
    IF profile_institution_id IS NULL OR profile_institution_id != current_user_institution_id THEN
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
$function$

;

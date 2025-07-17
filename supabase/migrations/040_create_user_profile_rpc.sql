-- Migration: Add create_user_profile RPC function
-- This function handles user profile creation with proper error handling

CREATE OR REPLACE FUNCTION create_user_profile(
  user_id uuid,
  user_email text,
  user_full_name text DEFAULT NULL,
  user_role text DEFAULT 'student',
  user_phone_number text DEFAULT NULL,
  user_institution_id uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  result_id uuid;
BEGIN
  -- Check if profile already exists
  SELECT id INTO result_id FROM profiles WHERE id = user_id OR email = user_email;
  
  IF result_id IS NOT NULL THEN
    -- Profile already exists, return error
    RAISE EXCEPTION 'Profile with email % already exists', user_email
      USING ERRCODE = '23505'; -- unique_violation error code
  END IF;
  
  -- Insert new profile
  INSERT INTO profiles (
    id,
    email,
    full_name,
    role,
    phone_number,
    institution_id,
    profile_completed,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    user_id,
    user_email,
    user_full_name,
    user_role::user_role,
    user_phone_number,
    user_institution_id,
    false,
    true,
    NOW(),
    NOW()
  ) RETURNING id INTO result_id;
  
  -- Also insert into users table for compatibility
  INSERT INTO users (id, email, full_name, created_at, updated_at)
  VALUES (user_id, user_email, user_full_name, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
  
  RETURN result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_user_profile(uuid, text, text, text, text, uuid) TO authenticated; 
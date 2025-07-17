-- Migration: Add user data consistency check and fix functions

-- Function to check for orphaned auth users (users in auth.users but not in profiles)
CREATE OR REPLACE FUNCTION check_orphaned_auth_users()
RETURNS TABLE(
  user_id uuid,
  user_email text,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    au.id as user_id,
    au.email as user_email,
    au.created_at
  FROM auth.users au
  LEFT JOIN profiles p ON au.id = p.id
  WHERE p.id IS NULL
  ORDER BY au.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check for orphaned profiles (profiles without corresponding auth users)
CREATE OR REPLACE FUNCTION check_orphaned_profiles()
RETURNS TABLE(
  profile_id uuid,
  profile_email text,
  profile_role text,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as profile_id,
    p.email as profile_email,
    p.role::text as profile_role,
    p.created_at
  FROM profiles p
  LEFT JOIN auth.users au ON p.id = au.id
  WHERE au.id IS NULL
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to sync orphaned auth users to profiles table
CREATE OR REPLACE FUNCTION sync_orphaned_auth_users()
RETURNS TABLE(
  synced_user_id uuid,
  synced_email text,
  action_taken text
) AS $$
DECLARE
  orphaned_user RECORD;
  result_record RECORD;
BEGIN
  -- Loop through orphaned auth users
  FOR orphaned_user IN 
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN profiles p ON au.id = p.id
    WHERE p.id IS NULL
  LOOP
    -- Create profile for orphaned auth user
    INSERT INTO profiles (
      id,
      email,
      full_name,
      role,
      profile_completed,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      orphaned_user.id,
      orphaned_user.email,
      COALESCE(orphaned_user.raw_user_meta_data->>'full_name', 'Unknown User'),
      COALESCE((orphaned_user.raw_user_meta_data->>'role')::user_role, 'guest'),
      false,
      true,
      NOW(),
      NOW()
    ) ON CONFLICT (id) DO NOTHING;
    
    -- Also sync to users table
    INSERT INTO users (id, email, full_name, created_at, updated_at)
    VALUES (
      orphaned_user.id,
      orphaned_user.email,
      COALESCE(orphaned_user.raw_user_meta_data->>'full_name', 'Unknown User'),
      NOW(),
      NOW()
    ) ON CONFLICT (id) DO NOTHING;
    
    -- Return result
    SELECT orphaned_user.id, orphaned_user.email, 'Created profile for orphaned auth user'
    INTO result_record;
    
    synced_user_id := result_record.synced_user_id;
    synced_email := result_record.synced_email;
    action_taken := result_record.action_taken;
    
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user data consistency report
CREATE OR REPLACE FUNCTION get_user_consistency_report()
RETURNS TABLE(
  category text,
  count bigint,
  details text
) AS $$
BEGIN
  -- Count orphaned auth users
  RETURN QUERY
  SELECT 
    'orphaned_auth_users'::text as category,
    COUNT(*) as count,
    'Auth users without corresponding profiles'::text as details
  FROM auth.users au
  LEFT JOIN profiles p ON au.id = p.id
  WHERE p.id IS NULL;
  
  -- Count orphaned profiles
  RETURN QUERY
  SELECT 
    'orphaned_profiles'::text as category,
    COUNT(*) as count,
    'Profiles without corresponding auth users'::text as details
  FROM profiles p
  LEFT JOIN auth.users au ON p.id = au.id
  WHERE au.id IS NULL;
  
  -- Count students without user accounts
  RETURN QUERY
  SELECT 
    'students_without_users'::text as category,
    COUNT(*) as count,
    'Students with college_email but no user account'::text as details
  FROM students s
  LEFT JOIN profiles p ON s.college_email = p.email
  WHERE s.college_email IS NOT NULL 
    AND s.college_email != ''
    AND s.is_profile_complete = true
    AND p.id IS NULL;
    
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION check_orphaned_auth_users() TO authenticated;
GRANT EXECUTE ON FUNCTION check_orphaned_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION sync_orphaned_auth_users() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_consistency_report() TO authenticated; 
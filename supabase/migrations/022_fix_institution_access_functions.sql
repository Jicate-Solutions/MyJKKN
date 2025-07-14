-- Fix institution access functions
-- This migration fixes the ambiguous column reference issue and adds missing functions

-- First, drop the existing function to recreate it with proper column references
DROP FUNCTION IF EXISTS user_has_institution_access(uuid, uuid);

-- Create the fixed user_has_institution_access function
CREATE OR REPLACE FUNCTION user_has_institution_access(target_user_id uuid, target_institution_id uuid)
RETURNS boolean AS $$
DECLARE
  user_profile RECORD;
BEGIN
  -- Get user profile
  SELECT * INTO user_profile FROM profiles WHERE id = target_user_id;
  
  -- If user doesn't exist, deny access
  IF user_profile IS NULL THEN
    RETURN false;
  END IF;
  
  -- Super admin has access to all institutions
  IF user_profile.is_super_admin = true OR user_profile.role = 'super_admin' THEN
    RETURN true;
  END IF;
  
  -- Check if user's primary institution matches
  IF user_profile.institution_id = target_institution_id THEN
    RETURN true;
  END IF;
  
  -- Check explicit institution access
  IF EXISTS (
    SELECT 1 FROM user_institution_access 
    WHERE user_institution_access.user_id = target_user_id 
    AND user_institution_access.institution_id = target_institution_id 
    AND user_institution_access.is_active = true
  ) THEN
    RETURN true;
  END IF;
  
  -- Default deny
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create the missing get_user_accessible_institutions function
CREATE OR REPLACE FUNCTION get_user_accessible_institutions(target_user_id uuid)
RETURNS TABLE (
  institution_id uuid,
  institution_name text,
  counselling_code text,
  access_type text,
  is_primary_institution boolean
) AS $$
DECLARE
  user_profile RECORD;
BEGIN
  -- Get user profile
  SELECT * INTO user_profile FROM profiles WHERE id = target_user_id;
  
  -- If user doesn't exist, return empty
  IF user_profile IS NULL THEN
    RETURN;
  END IF;
  
  -- Super admin has access to all institutions
  IF user_profile.is_super_admin = true OR user_profile.role = 'super_admin' THEN
    RETURN QUERY
    SELECT 
      i.id as institution_id,
      i.name as institution_name,
      i.counselling_code,
      'full'::text as access_type,
      (i.id = user_profile.institution_id) as is_primary_institution
    FROM institutions i
    WHERE i.is_active = true
    ORDER BY i.name;
    RETURN;
  END IF;
  
  -- Return user's primary institution and any explicit access grants
  RETURN QUERY
  SELECT DISTINCT
    i.id as institution_id,
    i.name as institution_name,
    i.counselling_code,
    COALESCE(uia.access_type, 'full'::text) as access_type,
    (i.id = user_profile.institution_id) as is_primary_institution
  FROM institutions i
  LEFT JOIN user_institution_access uia ON (
    uia.institution_id = i.id 
    AND uia.user_id = target_user_id 
    AND uia.is_active = true
  )
  WHERE 
    i.is_active = true
    AND (
      i.id = user_profile.institution_id  -- Primary institution
      OR uia.id IS NOT NULL                -- Explicit access
    )
  ORDER BY is_primary_institution DESC, i.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION user_has_institution_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_accessible_institutions(uuid) TO authenticated;

-- Add some helpful RPC functions for API usage
CREATE OR REPLACE FUNCTION grant_user_institution_access(
  target_user_id uuid,
  target_institution_id uuid,
  access_type_param text DEFAULT 'full',
  granted_by_param uuid DEFAULT auth.uid()
)
RETURNS void AS $$
BEGIN
  INSERT INTO user_institution_access (
    user_id,
    institution_id,
    access_type,
    granted_by,
    is_active
  )
  VALUES (
    target_user_id,
    target_institution_id,
    access_type_param::user_access_type,
    granted_by_param,
    true
  )
  ON CONFLICT (user_id, institution_id) 
  DO UPDATE SET
    access_type = EXCLUDED.access_type,
    granted_by = EXCLUDED.granted_by,
    is_active = true,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION revoke_user_institution_access(
  target_user_id uuid,
  target_institution_id uuid
)
RETURNS void AS $$
BEGIN
  UPDATE user_institution_access 
  SET 
    is_active = false,
    updated_at = now()
  WHERE 
    user_id = target_user_id 
    AND institution_id = target_institution_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions for the new RPC functions
GRANT EXECUTE ON FUNCTION grant_user_institution_access(uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_user_institution_access(uuid, uuid) TO authenticated; 
-- Migration: 021_enhance_institution_rls_policies
-- Description: Enhance institution RLS policies to ensure faculty users only see institutions they have access to

-- Drop existing policies to recreate them with better logic
DROP POLICY IF EXISTS "Users can view institutions they have access to" ON institutions;
DROP POLICY IF EXISTS "Super admins can manage all institutions" ON institutions;

-- Enhanced policy for viewing institutions
CREATE POLICY "Users can view accessible institutions" ON institutions
  FOR SELECT 
  TO authenticated
  USING (
    -- Super admins can see all institutions
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND (is_super_admin = true OR role = 'super_admin')
    ) OR
    -- Users can see institutions they have explicit access to
    user_has_institution_access(auth.uid(), id) OR
    -- Users can see their primary institution
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND institution_id = institutions.id
    )
  );

-- Policy for managing institutions (create, update, delete)
CREATE POLICY "Admins can manage institutions" ON institutions
  FOR ALL 
  TO authenticated
  USING (
    -- Only super admins and administrators can manage institutions
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND (
        is_super_admin = true OR 
        role IN ('super_admin', 'administrator')
      )
    ) AND (
      -- Super admins can manage all institutions
      EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND (is_super_admin = true OR role = 'super_admin')
      ) OR
      -- Administrators can only manage institutions they have access to
      user_has_institution_access(auth.uid(), id)
    )
  )
  WITH CHECK (
    -- Same logic for inserts/updates
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND (
        is_super_admin = true OR 
        role IN ('super_admin', 'administrator')
      )
    )
  );

-- Add a specific policy for API key access (for external integrations)
CREATE POLICY "API keys can access institutions" ON institutions
  FOR SELECT 
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM api_keys
      WHERE key_value = current_setting('request.header.apikey', true)::text
      AND is_active = true 
      AND (expires_at IS NULL OR expires_at > now())
      AND (permissions->>'read')::boolean = true
    )
  );

-- Update the user_has_institution_access function to be more explicit
CREATE OR REPLACE FUNCTION user_has_institution_access(user_id uuid, institution_id uuid)
RETURNS boolean AS $$
DECLARE
  user_profile RECORD;
BEGIN
  -- Get user profile
  SELECT * INTO user_profile FROM profiles WHERE id = user_id;
  
  -- If user doesn't exist, deny access
  IF user_profile IS NULL THEN
    RETURN false;
  END IF;
  
  -- Super admin has access to all institutions
  IF user_profile.is_super_admin = true OR user_profile.role = 'super_admin' THEN
    RETURN true;
  END IF;
  
  -- Check if user's primary institution matches
  IF user_profile.institution_id = institution_id THEN
    RETURN true;
  END IF;
  
  -- Check explicit institution access
  IF EXISTS (
    SELECT 1 FROM user_institution_access 
    WHERE user_id = user_profile.id 
    AND institution_id = user_has_institution_access.institution_id 
    AND is_active = true
  ) THEN
    RETURN true;
  END IF;
  
  -- Default deny
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE; 
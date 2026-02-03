-- Fix profiles RLS policy for pre-registration
-- Date: 2025-01-27
-- Purpose: Allow service role to insert pre-registered profiles during staff creation

-- Drop the existing insert policy
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;

-- Create a new INSERT policy that properly handles service role
CREATE POLICY "profiles_insert_policy" ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Users can insert their own profile (normal registration)
    auth.uid() = id
    OR
    -- Service role can insert anything (for pre-registration and admin operations)
    current_setting('role')::text = 'service_role'
    OR
    -- Alternative check for service role JWT
    (auth.jwt() ->> 'role'::text) = 'service_role'::text
    OR
    -- Allow authenticated admins to create pre-registered profiles
    (
      auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role IN ('super_admin', 'administrator')
      )
      AND NEW.is_pre_registered = true
    )
  );

-- Also ensure the service role can bypass all restrictions
CREATE POLICY "profiles_service_role_bypass" ON public.profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Verify the policies are created correctly
DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE 'Updated policies on profiles table:';
  FOR rec IN 
    SELECT polname, 
           CASE polcmd
             WHEN 'r' THEN 'SELECT'
             WHEN 'a' THEN 'INSERT'
             WHEN 'w' THEN 'UPDATE'
             WHEN 'd' THEN 'DELETE'
             WHEN '*' THEN 'ALL'
           END as operation,
           polroles::regrole[] as roles
    FROM pg_policy 
    WHERE polrelid = 'public.profiles'::regclass
    ORDER BY polname
  LOOP
    RAISE NOTICE '  - % (%) for roles: %', rec.polname, rec.operation, rec.roles;
  END LOOP;
END $$;

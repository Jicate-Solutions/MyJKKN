-- Fix RLS policy infinite recursion issue
-- Date: 2025-01-26
-- Purpose: Fix the infinite recursion in profiles RLS policy by cleaning up overlapping policies

-- First, drop the problematic policy that's causing recursion
DROP POLICY IF EXISTS "Pre-registered profiles are not visible to users" ON public.profiles;

-- Also drop duplicate/overlapping policies to avoid conflicts
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_allowed" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON public.profiles;

-- Create consolidated, non-recursive policies

-- 1. SELECT policy: Users can view profiles
CREATE POLICY "profiles_select_policy" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    -- Users can see their own profile
    auth.uid() = id
    OR
    -- Everyone can see non-pre-registered profiles
    is_pre_registered = FALSE
    OR
    -- Service role can see everything
    (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

-- 2. INSERT policy: For profile creation
CREATE POLICY "profiles_insert_policy" ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Users can insert their own profile
    auth.uid() = id
    OR
    -- Service role can insert anything (needed for pre-registration)
    (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

-- 3. UPDATE policy: For profile updates
CREATE POLICY "profiles_update_policy" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    -- Users can update their own profile
    auth.uid() = id
    OR
    -- Service role can update anything
    (auth.jwt() ->> 'role'::text) = 'service_role'::text
  )
  WITH CHECK (
    -- Same conditions for the update
    auth.uid() = id
    OR
    (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

-- 4. DELETE policy: Restricted to service role
CREATE POLICY "profiles_delete_policy" ON public.profiles
  FOR DELETE
  TO authenticated
  USING (
    -- Only service role can delete profiles
    (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

-- Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- List final policies for verification
DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE 'Final policies on profiles table:';
  FOR rec IN 
    SELECT polname, 
           CASE polcmd
             WHEN 'r' THEN 'SELECT'
             WHEN 'a' THEN 'INSERT'
             WHEN 'w' THEN 'UPDATE'
             WHEN 'd' THEN 'DELETE'
             WHEN '*' THEN 'ALL'
           END as operation
    FROM pg_policy 
    WHERE polrelid = 'public.profiles'::regclass
    ORDER BY polname
  LOOP
    RAISE NOTICE '  - % (%)', rec.polname, rec.operation;
  END LOOP;
END $$;
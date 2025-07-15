-- Drop existing RLS policies on profiles to avoid conflicts
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.profiles; -- Failsafe drop

-- 1. Profile View Policy
-- Users can view their own profile. This is fundamental.
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- 2. Profile Update Policy
-- Users can update their own profile.
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 3. Admin/Super Admin View Policy
-- A user who is a super_admin or has the 'admin' role can see all profiles.
-- This uses a function to check claims from the JWT, avoiding recursive table lookups.
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
USING (
  (get_my_claim('is_super_admin')::boolean IS TRUE) OR
  (get_my_claim('user_role')::text = 'administrator')
);

-- 4. Admin/Super Admin Manage Policy
-- A user who is a super_admin or has the 'admin' role can manage all profiles.
CREATE POLICY "Admins can manage all profiles"
ON public.profiles FOR ALL
USING (
  (get_my_claim('is_super_admin')::boolean IS TRUE) OR
  (get_my_claim('user_role')::text = 'administrator')
); 
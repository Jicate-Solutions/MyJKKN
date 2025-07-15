-- RLS Policy for custom_roles Table

-- By default, RLS is enabled but no policies exist, creating a default-deny.
-- This is problematic as users need to be able to read their own role definitions.

-- Drop any potentially conflicting policies first.
DROP POLICY IF EXISTS "Allow authenticated users to read custom roles" ON public.custom_roles;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.custom_roles; -- Legacy name

-- Create a broad read-only policy for all authenticated users.
-- This is safe as the table contains role definitions, not sensitive user data.
CREATE POLICY "Allow authenticated users to read custom roles"
ON public.custom_roles
FOR SELECT
TO authenticated
USING (true); 
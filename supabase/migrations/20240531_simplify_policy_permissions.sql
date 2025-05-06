-- Simplify RLS policies for digital_sharing_policies table
-- Drop the existing administrator-only policy
DROP POLICY IF EXISTS "Administrators can create digital sharing policies" ON public.digital_sharing_policies;

-- Create a policy that allows any authenticated user to create policies
CREATE POLICY "Authenticated users can create digital sharing policies"
ON public.digital_sharing_policies
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Keep the existing policies for update and select
-- No changes needed for these:
-- "Administrators can update digital sharing policies"
-- "Users can view digital sharing policies" 
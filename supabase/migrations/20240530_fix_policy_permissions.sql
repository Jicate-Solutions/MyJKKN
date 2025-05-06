-- Fix RLS policies for digital_sharing_policies table
-- First, drop the existing restrictive policy if it exists
DROP POLICY IF EXISTS "Users can create digital sharing policies" ON public.digital_sharing_policies;

-- Create a policy that allows administrators to create policies
CREATE POLICY "Administrators can create digital sharing policies"
ON public.digital_sharing_policies
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = ANY(ARRAY['administrator', 'super_admin'])
  )
);

-- Create policy for administrators to update digital sharing policies
DROP POLICY IF EXISTS "Administrators can update digital sharing policies" ON public.digital_sharing_policies;
CREATE POLICY "Administrators can update digital sharing policies"
ON public.digital_sharing_policies
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = ANY(ARRAY['administrator', 'super_admin'])
  )
);

-- Create policy for administrators to view all digital sharing policies
DROP POLICY IF EXISTS "Users can view digital sharing policies" ON public.digital_sharing_policies;
CREATE POLICY "Users can view digital sharing policies"
ON public.digital_sharing_policies
FOR SELECT
TO authenticated
USING (true); 
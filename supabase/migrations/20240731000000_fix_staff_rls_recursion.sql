-- This migration fixes a recursion issue in the RLS policy for the staff table.

-- Step 1: Drop all previously known RLS policies on the staff table.
-- It's crucial to remove old policies to prevent conflicts (OR combination).
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.staff;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.staff;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.staff;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.staff;
DROP POLICY IF EXISTS "Staff access based on user role" ON public.staff;
DROP POLICY IF EXISTS "Allow staff insert for principals and admins" ON public.staff;
DROP POLICY IF EXISTS "Allow staff update for principals and admins" ON public.staff;
DROP POLICY IF EXISTS "Allow staff delete for principals and admins" ON public.staff;
DROP POLICY IF EXISTS "Allow users to see staff based on role" ON public.staff;
DROP POLICY IF EXISTS "Staff visibility policy" ON public.staff;


-- Step 2: Create a helper function to get a staff_id from a user's email.
-- This function is a SECURITY DEFINER, meaning it runs with the permissions of the
-- function's owner, not the calling user. This is critical to bypass RLS checks
-- within the function and prevent an infinite recursion loop.
-- The owner of this function should be a privileged user (e.g., postgres, supabase_admin).
CREATE OR REPLACE FUNCTION public.get_staff_id_by_email(p_email TEXT)
RETURNS UUID AS $$
DECLARE
  staff_uuid UUID;
BEGIN
  -- This query on public.staff will not trigger RLS because the function is a SECURITY DEFINER.
  SELECT id INTO staff_uuid
  FROM public.staff
  WHERE email = p_email OR institution_email = p_email
  LIMIT 1;
  RETURN staff_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.get_staff_id_by_email(TEXT) TO authenticated;


-- Step 3: Create the new, correct RLS policy for SELECT operations.
CREATE POLICY "Staff access based on user role" ON public.staff
FOR SELECT
USING (
  -- Super admins can see everything.
  is_super_admin() OR

  -- Principals can see all staff within their assigned institution.
  (
    get_my_claim('role')::jsonb = '"principal"' AND
    institution_id = (get_my_claim('institution_id')::jsonb ->> 0)::uuid
  ) OR

  -- Faculty can only see their own staff record.
  -- This uses the helper function to safely get the user's staff ID.
  (
    get_my_claim('role')::jsonb = '"faculty"' AND
    id = public.get_staff_id_by_email(auth.email())
  )
);

-- Step 4: Create policies for INSERT, UPDATE, and DELETE operations.
-- These are restricted to principals and super admins for security.
CREATE POLICY "Allow staff insert for principals and admins" ON public.staff
FOR INSERT
WITH CHECK (
  is_super_admin() OR
  get_my_claim('role')::jsonb = '"principal"'
);

CREATE POLICY "Allow staff update for principals and admins" ON public.staff
FOR UPDATE
USING (
  is_super_admin() OR
  get_my_claim('role')::jsonb = '"principal"'
)
WITH CHECK (
  is_super_admin() OR
  get_my_claim('role')::jsonb = '"principal"'
);

CREATE POLICY "Allow staff delete for principals and admins" ON public.staff
FOR DELETE
USING (
  is_super_admin() OR
  get_my_claim('role')::jsonb = '"principal"'
); 
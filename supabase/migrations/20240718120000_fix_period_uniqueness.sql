-- Alter periods table to support institution-specific periods

-- 1. Add the institution_id column
-- This column will link each period to an institution.
-- It references the 'id' column in the 'institutions' table.
ALTER TABLE public.periods
ADD COLUMN institution_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE;

-- Backfill existing periods with a default institution if necessary.
-- Replace 'your_default_institution_id' with an actual ID from your institutions table.
-- This step is commented out by default. Uncomment and set the ID if you have existing data.
-- UPDATE public.periods SET institution_id = 'your_default_institution_id' WHERE institution_id IS NULL;

-- 2. Drop the old unique constraint
-- The existing constraint only ensures 'period_name' is unique globally.
ALTER TABLE public.periods
DROP CONSTRAINT period_name_unique;

-- 3. Add a new composite unique constraint
-- This new constraint ensures that the combination of 'institution_id' and 'period_name' is unique.
-- This allows different institutions to have periods with the same name.
ALTER TABLE public.periods
ADD CONSTRAINT periods_institution_id_period_name_key UNIQUE (institution_id, period_name);

-- 4. Update RLS policies to check for institution_id
-- We'll add a check to ensure users can only affect periods within their own institution,
-- unless they are super admins.

-- Get the current user's institution ID
CREATE OR REPLACE FUNCTION get_my_institution_id()
RETURNS UUID AS $$
DECLARE
    institution_id UUID;
BEGIN
    SELECT raw_user_meta_data->>'institution_id' INTO institution_id
    FROM auth.users
    WHERE id = auth.uid();
    RETURN institution_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Update SELECT policy
DROP POLICY "Authenticated users can view any period" ON periods;
CREATE POLICY "Users can view periods for their institution" ON periods
  FOR SELECT
  TO authenticated
  USING (
    institution_id = get_my_institution_id() OR
    check_permission('super_admin')
  );

-- Update INSERT policy
DROP POLICY "Users with academic.periods.create permission can insert periods" ON periods;
CREATE POLICY "Users can create periods for their institution" ON periods
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (institution_id = get_my_institution_id() AND check_permission('academic.periods.create')) OR
    (check_permission('super_admin') AND institution_id IS NOT NULL)
  );

-- Update UPDATE policy
DROP POLICY "Users with academic.periods.update permission can update periods" ON periods;
CREATE POLICY "Users can update periods for their institution" ON periods
  FOR UPDATE
  TO authenticated
  USING (
    (institution_id = get_my_institution_id() AND check_permission('academic.periods.update')) OR
    check_permission('super_admin')
  );

-- Update DELETE policy
DROP POLICY "Users with academic.periods.delete permission can delete periods" ON periods;
CREATE POLICY "Users can delete periods for their institution" ON periods
  FOR DELETE
  TO authenticated
  USING (
    (institution_id = get_my_institution_id() AND check_permission('academic.periods.delete')) OR
    check_permission('super_admin')
  ); 
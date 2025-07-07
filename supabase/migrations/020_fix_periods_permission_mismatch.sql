-- Migration: 020_fix_periods_permission_mismatch
-- Description: Fix permission mismatch between frontend (academic.periods.edit) and database RLS policies (academic.periods.update)

-- Update the RLS policies to use the correct permission keys that match the frontend application

-- Update UPDATE policy to use 'academic.periods.edit' instead of 'academic.periods.update'
DROP POLICY IF EXISTS "Users can update periods for their institution" ON periods;
CREATE POLICY "Users can update periods for their institution" ON periods
  FOR UPDATE
  TO authenticated
  USING (
    (institution_id = get_my_institution_id() AND check_permission('academic.periods.edit')) OR
    check_permission('super_admin')
  );

-- Update INSERT policy to use 'academic.periods.create' (this should already be correct, but ensuring consistency)
DROP POLICY IF EXISTS "Users can create periods for their institution" ON periods;
CREATE POLICY "Users can create periods for their institution" ON periods
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (institution_id = get_my_institution_id() AND check_permission('academic.periods.create')) OR
    (check_permission('super_admin') AND institution_id IS NOT NULL)
  );

-- Update DELETE policy to use 'academic.periods.delete' (this should already be correct, but ensuring consistency)
DROP POLICY IF EXISTS "Users can delete periods for their institution" ON periods;
CREATE POLICY "Users can delete periods for their institution" ON periods
  FOR DELETE
  TO authenticated
  USING (
    (institution_id = get_my_institution_id() AND check_permission('academic.periods.delete')) OR
    check_permission('super_admin')
  );

-- Update SELECT policy to use 'academic.periods.view' (this should already be correct, but ensuring consistency)
DROP POLICY IF EXISTS "Users can view periods for their institution" ON periods;
CREATE POLICY "Users can view periods for their institution" ON periods
  FOR SELECT
  TO authenticated
  USING (
    institution_id = get_my_institution_id() OR
    check_permission('super_admin') OR
    check_permission('academic.periods.view')
  ); 
-- Migration: 021_fix_timetables_permission_mismatch
-- Description: Fix permission mismatch between frontend (academic.timetables.edit) and database RLS policies (academic.timetables.update)

-- Update the RLS policies to use the correct permission keys that match the frontend application

-- Fix timetables table policies
DROP POLICY IF EXISTS "Users with academic.timetables.update permission can update timetables" ON timetables;
CREATE POLICY "Users can update timetables" ON timetables
  FOR UPDATE
  TO authenticated
  USING (check_permission('academic.timetables.edit') OR check_permission('super_admin'));

-- Fix timetable_slots table policies  
DROP POLICY IF EXISTS "Users with academic.timetables.update permission can update timetable_slots" ON timetable_slots;
CREATE POLICY "Users can update timetable_slots" ON timetable_slots
  FOR UPDATE
  TO authenticated
  USING (check_permission('academic.timetables.edit') OR check_permission('super_admin'));

-- Ensure other timetables policies are also using consistent naming
DROP POLICY IF EXISTS "Users with academic.timetables.create permission can insert timetables" ON timetables;
CREATE POLICY "Users can create timetables" ON timetables
  FOR INSERT
  TO authenticated
  WITH CHECK (check_permission('academic.timetables.create') OR check_permission('super_admin'));

DROP POLICY IF EXISTS "Users with academic.timetables.delete permission can delete timetables" ON timetables;
CREATE POLICY "Users can delete timetables" ON timetables
  FOR DELETE
  TO authenticated
  USING (check_permission('academic.timetables.delete') OR check_permission('super_admin'));

DROP POLICY IF EXISTS "Users with academic.timetables.create permission can insert timetable_slots" ON timetable_slots;
CREATE POLICY "Users can create timetable_slots" ON timetable_slots
  FOR INSERT
  TO authenticated
  WITH CHECK (check_permission('academic.timetables.create') OR check_permission('super_admin'));

DROP POLICY IF EXISTS "Users with academic.timetables.delete permission can delete timetable_slots" ON timetable_slots;
CREATE POLICY "Users can delete timetable_slots" ON timetable_slots
  FOR DELETE
  TO authenticated
  USING (check_permission('academic.timetables.delete') OR check_permission('super_admin')); 
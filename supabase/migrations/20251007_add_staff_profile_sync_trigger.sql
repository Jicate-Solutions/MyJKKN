-- ================================================================================
-- Auto-Sync Staff Department/Institution to Profile
-- Created: 2025-10-07
-- Description: Trigger to automatically sync department_id and institution_id
--              from staff table to profiles table when staff record is created/updated
-- Purpose: Prevent data inconsistency that blocks faculty from accessing students
-- ================================================================================

-- Create function to sync staff data to profile
CREATE OR REPLACE FUNCTION sync_staff_department_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync for faculty and HOD roles
  UPDATE profiles
  SET
    department_id = NEW.department_id,
    institution_id = NEW.institution_id,
    updated_at = NOW()
  WHERE id = NEW.profile_id
  AND role IN ('faculty', 'hod')
  -- Only update if values are different or NULL
  AND (
    department_id IS DISTINCT FROM NEW.department_id
    OR institution_id IS DISTINCT FROM NEW.institution_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

-- Add comment
COMMENT ON FUNCTION sync_staff_department_to_profile() IS
'Automatically syncs department_id and institution_id from staff table to profiles table for faculty and HOD users. Prevents data inconsistency that blocks RLS access.';

-- Drop trigger if exists
DROP TRIGGER IF EXISTS auto_sync_staff_to_profile ON staff;

-- Create trigger on staff table
CREATE TRIGGER auto_sync_staff_to_profile
AFTER INSERT OR UPDATE OF department_id, institution_id ON staff
FOR EACH ROW
WHEN (NEW.is_active = true)
EXECUTE FUNCTION sync_staff_department_to_profile();

-- Add comment on trigger
COMMENT ON TRIGGER auto_sync_staff_to_profile ON staff IS
'Automatically syncs department and institution from staff to profile when staff record is created or updated. Essential for faculty attendance access via RLS.';

-- Log the trigger creation
DO $$
BEGIN
  RAISE NOTICE 'Created trigger: auto_sync_staff_to_profile';
  RAISE NOTICE 'Faculty/HOD profiles will now auto-sync department_id and institution_id from staff table';
END $$;

-- Migration: Sync staff deletion and status updates to profiles table
-- Created: 2025-10-15
-- Issue: When staff is deleted or status changed, profiles table is not updated
-- Solution: Add triggers to sync DELETE and UPDATE operations from staff to profiles

-- ================================================================================
-- FUNCTION 1: Delete staff profile when staff is deleted
-- ================================================================================

CREATE OR REPLACE FUNCTION public.delete_staff_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Delete the corresponding profile when staff is deleted
    IF OLD.institution_email IS NOT NULL AND OLD.institution_email != '' THEN
        DELETE FROM profiles
        WHERE email = OLD.institution_email
        AND role = 'staff'
        AND is_pre_registered = true;
    END IF;

    RETURN OLD;
END;
$$;

COMMENT ON FUNCTION delete_staff_profile() IS
'Deletes corresponding profile when staff record is deleted';

-- ================================================================================
-- FUNCTION 2: Sync staff status to profile
-- ================================================================================

CREATE OR REPLACE FUNCTION public.sync_staff_status_to_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only sync if is_active status changed and institution_email exists
    IF OLD.is_active != NEW.is_active AND
       NEW.institution_email IS NOT NULL AND
       NEW.institution_email != '' THEN

        -- Update profile is_active status to match staff status
        UPDATE profiles
        SET
            is_active = NEW.is_active,
            updated_at = NOW()
        WHERE email = NEW.institution_email
        AND role = 'staff'
        AND is_pre_registered = true;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sync_staff_status_to_profile() IS
'Syncs staff is_active status changes to corresponding profile';

-- ================================================================================
-- TRIGGERS: Attach functions to staff table
-- ================================================================================

-- Drop existing triggers if they exist (safe to ignore errors if not exists)
DROP TRIGGER IF EXISTS trg_delete_staff_profile ON staff;
DROP TRIGGER IF EXISTS trg_sync_staff_status_to_profile ON staff;

-- Trigger for DELETE: Delete profile when staff is deleted
CREATE TRIGGER trg_delete_staff_profile
    AFTER DELETE ON staff
    FOR EACH ROW
    EXECUTE FUNCTION delete_staff_profile();

COMMENT ON TRIGGER trg_delete_staff_profile ON staff IS
'Automatically deletes corresponding profile when staff record is deleted';

-- Trigger for UPDATE: Sync status when staff.is_active changes
CREATE TRIGGER trg_sync_staff_status_to_profile
    AFTER UPDATE OF is_active ON staff
    FOR EACH ROW
    EXECUTE FUNCTION sync_staff_status_to_profile();

COMMENT ON TRIGGER trg_sync_staff_status_to_profile ON staff IS
'Automatically syncs is_active status from staff to profiles when changed';

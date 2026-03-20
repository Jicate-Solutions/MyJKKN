-- Fix staff sync trigger to be BEFORE INSERT OR UPDATE so profile_id can be stored
-- Date: 2025-10-15
-- Purpose: Change trigger timing to allow storing profile_id in staff table

-- Drop the old AFTER INSERT trigger
DROP TRIGGER IF EXISTS trg_sync_staff_to_profiles ON staff;

-- Recreate as BEFORE INSERT OR UPDATE trigger
CREATE TRIGGER trg_sync_staff_to_profiles
    BEFORE INSERT OR UPDATE ON staff
    FOR EACH ROW
    EXECUTE FUNCTION sync_staff_to_profiles();

-- Comment explaining the change
COMMENT ON TRIGGER trg_sync_staff_to_profiles ON staff IS
'Syncs staff data to profiles table before insert/update.
Uses BEFORE timing to allow storing profile_id back in staff table.
Handles both creating new profiles and updating existing ones.';

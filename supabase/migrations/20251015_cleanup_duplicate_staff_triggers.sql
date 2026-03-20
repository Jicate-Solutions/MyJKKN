-- Remove duplicate and redundant staff sync triggers
-- Date: 2025-10-15
-- Purpose: Clean up duplicate triggers to prevent conflicts

-- Remove duplicate trigger that calls sync_staff_to_profiles (AFTER UPDATE)
DROP TRIGGER IF EXISTS trg_sync_staff_to_profiles_on_update ON staff;

-- Remove redundant status-only sync trigger (already handled in main trigger)
DROP TRIGGER IF EXISTS trg_sync_staff_status_to_profile ON staff;

-- Remove redundant department sync trigger (already handled in main trigger)
DROP TRIGGER IF EXISTS auto_sync_staff_to_profile ON staff;

-- Remove debug trigger (no longer needed)
DROP TRIGGER IF EXISTS debug_staff_insert_trigger ON staff;

-- Add comment to explain cleanup
COMMENT ON TRIGGER trg_sync_staff_to_profiles ON staff IS
'Main staff-to-profile sync trigger (BEFORE INSERT/UPDATE).
Handles ALL field synchronization including:
- Basic info (name, phone, email)
- Institution and department IDs
- Gender and designation
- is_active status
- profile_id storage
All other sync triggers have been removed to prevent conflicts.';

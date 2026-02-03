-- Backfill profile_id for existing staff records
-- Date: 2025-10-15
-- Purpose: Update existing staff records with their profile_id

UPDATE staff
SET profile_id = profiles.id, updated_at = NOW()
FROM profiles
WHERE staff.institution_email = profiles.email
  AND staff.profile_id IS NULL
  AND staff.institution_email IS NOT NULL
  AND staff.institution_email != '';

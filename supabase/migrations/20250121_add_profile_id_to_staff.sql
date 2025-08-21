-- Add profile_id column to staff table to link with profiles
ALTER TABLE staff 
ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_staff_profile_id ON staff(profile_id);

-- Add comment
COMMENT ON COLUMN staff.profile_id IS 'Links staff record to user profile for authentication and role-based access';

-- For now, try to auto-link based on matching emails (case-insensitive)
-- This is a one-time update to link existing records
UPDATE staff s
SET profile_id = p.id
FROM profiles p
WHERE p.role = 'faculty'
  AND p.institution_id = s.institution_id
  AND (
    LOWER(p.email) = LOWER(s.email) 
    OR LOWER(p.email) = LOWER(s.institution_email)
    OR LOWER(s.email) = LOWER(p.email)
    OR LOWER(s.institution_email) = LOWER(p.email)
  )
  AND s.profile_id IS NULL;
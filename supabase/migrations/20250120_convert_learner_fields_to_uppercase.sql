-- ============================================
-- MIGRATION: Convert Learner Profile Fields to Uppercase
-- ============================================
-- Created: 2025-01-20
-- Purpose: Convert gender, religion, address fields, and reference names to uppercase for consistency
-- Tables: learners_profiles
-- ============================================

-- Update gender field to uppercase
UPDATE learners_profiles
SET gender = UPPER(gender)
WHERE gender IS NOT NULL
  AND gender != UPPER(gender);

-- Update religion field to uppercase
UPDATE learners_profiles
SET religion = UPPER(religion)
WHERE religion IS NOT NULL
  AND religion != UPPER(religion)
  AND religion != '';

-- Update community field to uppercase (already mostly uppercase, but ensure consistency)
UPDATE learners_profiles
SET community = UPPER(community)
WHERE community IS NOT NULL
  AND community != UPPER(community)
  AND community != '';

-- Update father_name to uppercase
UPDATE learners_profiles
SET father_name = UPPER(father_name)
WHERE father_name IS NOT NULL
  AND father_name != UPPER(father_name);

-- Update father_occupation to uppercase
UPDATE learners_profiles
SET father_occupation = UPPER(father_occupation)
WHERE father_occupation IS NOT NULL
  AND father_occupation != UPPER(father_occupation)
  AND father_occupation != '';

-- Update mother_name to uppercase
UPDATE learners_profiles
SET mother_name = UPPER(mother_name)
WHERE mother_name IS NOT NULL
  AND mother_name != UPPER(mother_name);

-- Update mother_occupation to uppercase
UPDATE learners_profiles
SET mother_occupation = UPPER(mother_occupation)
WHERE mother_occupation IS NOT NULL
  AND mother_occupation != UPPER(mother_occupation)
  AND mother_occupation != '';

-- Update permanent_address_street to uppercase
UPDATE learners_profiles
SET permanent_address_street = UPPER(permanent_address_street)
WHERE permanent_address_street IS NOT NULL
  AND permanent_address_street != UPPER(permanent_address_street)
  AND permanent_address_street != '';

-- Update permanent_address_taluk to uppercase
UPDATE learners_profiles
SET permanent_address_taluk = UPPER(permanent_address_taluk)
WHERE permanent_address_taluk IS NOT NULL
  AND permanent_address_taluk != UPPER(permanent_address_taluk)
  AND permanent_address_taluk != '';

-- Update permanent_address_district to uppercase
UPDATE learners_profiles
SET permanent_address_district = UPPER(permanent_address_district)
WHERE permanent_address_district IS NOT NULL
  AND permanent_address_district != UPPER(permanent_address_district)
  AND permanent_address_district != '';

-- Update permanent_address_state to uppercase
UPDATE learners_profiles
SET permanent_address_state = UPPER(permanent_address_state)
WHERE permanent_address_state IS NOT NULL
  AND permanent_address_state != UPPER(permanent_address_state)
  AND permanent_address_state != '';

-- Update reference_name to uppercase
UPDATE learners_profiles
SET reference_name = UPPER(reference_name)
WHERE reference_name IS NOT NULL
  AND reference_name != UPPER(reference_name)
  AND reference_name != '';

-- Log the number of affected rows (for documentation)
-- Run this query manually to see affected counts if needed
-- SELECT
--   COUNT(*) FILTER (WHERE gender != UPPER(gender)) as gender_updated,
--   COUNT(*) FILTER (WHERE religion != UPPER(religion) AND religion != '') as religion_updated,
--   COUNT(*) FILTER (WHERE father_name != UPPER(father_name)) as father_name_updated,
--   COUNT(*) FILTER (WHERE mother_name != UPPER(mother_name)) as mother_name_updated,
--   COUNT(*) FILTER (WHERE permanent_address_street != UPPER(permanent_address_street) AND permanent_address_street != '') as address_updated,
--   COUNT(*) FILTER (WHERE reference_name != UPPER(reference_name) AND reference_name != '') as reference_updated
-- FROM learners_profiles;

-- ============================================
-- VERIFICATION QUERY
-- ============================================
-- Run this to verify all text fields are now uppercase:
-- SELECT DISTINCT
--   gender,
--   religion,
--   community,
--   father_name,
--   mother_name,
--   permanent_address_state,
--   permanent_address_district
-- FROM learners_profiles
-- ORDER BY gender, religion, community;

-- =====================================================
-- PROFILE SYNC FUNCTIONS
-- =====================================================
-- Date: 2025-01-22
-- Purpose: Create database functions to accurately find learners/students missing user profiles
-- Fixes: 1000 record limit bug and case-sensitivity issues
-- =====================================================

-- Function: Get learners missing user profiles
-- Returns: Learners with complete profiles and active status who don't have user accounts
-- Uses: LEFT JOIN for accurate comparison, case-insensitive email matching
CREATE OR REPLACE FUNCTION get_learners_missing_profiles()
RETURNS TABLE (
  learner_id UUID,
  college_email TEXT,
  first_name TEXT,
  last_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    lp.id as learner_id,
    lp.college_email,
    lp.first_name,
    lp.last_name
  FROM learners_profiles lp
  LEFT JOIN profiles p ON LOWER(lp.college_email) = LOWER(p.email)
  WHERE
    lp.is_profile_complete = true
    AND lp.lifecycle_status = 'active'
    AND lp.college_email IS NOT NULL
    AND p.email IS NULL;  -- No matching profile found (case-insensitive)
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON FUNCTION get_learners_missing_profiles() IS
'Returns active learners with complete profiles who are missing user accounts. Uses case-insensitive email comparison and bypasses pagination limits.';


-- Function: Get students missing user profiles
-- Returns: Students with complete profiles who don't have user accounts
-- Uses: LEFT JOIN for accurate comparison, case-insensitive email matching
CREATE OR REPLACE FUNCTION get_students_missing_profiles()
RETURNS TABLE (
  student_id UUID,
  college_email TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id as student_id,
    s.college_email
  FROM students s
  LEFT JOIN profiles p ON LOWER(s.college_email) = LOWER(p.email)
  WHERE
    s.is_profile_complete = true
    AND s.college_email IS NOT NULL
    AND p.email IS NULL;  -- No matching profile found (case-insensitive)
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON FUNCTION get_students_missing_profiles() IS
'Returns students with complete profiles who are missing user accounts. Uses case-insensitive email comparison and bypasses pagination limits.';

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
-- Allow authenticated users to call these functions
GRANT EXECUTE ON FUNCTION get_learners_missing_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION get_students_missing_profiles() TO authenticated;

-- Allow service role to call these functions (for API routes)
GRANT EXECUTE ON FUNCTION get_learners_missing_profiles() TO service_role;
GRANT EXECUTE ON FUNCTION get_students_missing_profiles() TO service_role;

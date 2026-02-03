-- ============================================
-- Migration: Move Incomplete Active Profiles to Pending
-- Created: 2025-01-19
-- Purpose: Move all active learners with incomplete required fields to pending status
-- ============================================

-- Active students now only require: semester_id, section_id, academic_year_id, college_email
-- Roll number and student photo are optional

-- Find and update incomplete active profiles to pending
UPDATE learners_profiles
SET
    lifecycle_status = 'pending',
    updated_at = NOW()
WHERE
    lifecycle_status = 'active'
    AND (
        semester_id IS NULL
        OR section_id IS NULL
        OR academic_year_id IS NULL
        OR college_email IS NULL
        OR TRIM(college_email) = ''
    );

-- Log the changes
DO $$
DECLARE
    affected_count INTEGER;
BEGIN
    -- Get count of records that were updated
    GET DIAGNOSTICS affected_count = ROW_COUNT;

    RAISE NOTICE 'Migration completed: % active profiles moved to pending status due to incomplete required fields', affected_count;
    RAISE NOTICE 'Required fields for active status: semester_id, section_id, academic_year_id, college_email';
    RAISE NOTICE 'Roll number and student photo are now optional for active students';
END $$;

-- Verify the update
SELECT
    COUNT(*) as total_pending,
    COUNT(*) FILTER (WHERE semester_id IS NULL) as missing_semester,
    COUNT(*) FILTER (WHERE section_id IS NULL) as missing_section,
    COUNT(*) FILTER (WHERE academic_year_id IS NULL) as missing_academic_year,
    COUNT(*) FILTER (WHERE college_email IS NULL OR TRIM(college_email) = '') as missing_college_email
FROM learners_profiles
WHERE lifecycle_status = 'pending';

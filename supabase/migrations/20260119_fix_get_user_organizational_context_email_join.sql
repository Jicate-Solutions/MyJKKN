-- Fix get_user_organizational_context - join by email instead of ID
-- Date: 2026-01-19
-- Issue: Same as compute_student_engagement_scores - profiles.id ≠ learners_profiles.id
-- Impact: Sessions created with NULL department/program/semester/section values
-- Solution: Join via email matching

DROP FUNCTION IF EXISTS get_user_organizational_context(UUID);

CREATE OR REPLACE FUNCTION get_user_organizational_context(
    p_user_id UUID
)
RETURNS TABLE (
    institution_id UUID,
    department_id UUID,
    program_id UUID,
    semester_id UUID,
    section_id UUID,
    user_role TEXT  -- TEXT type (not enum)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Try to get context from learners_profiles (students)
    -- ✅ FIXED: Join by email, filter by profiles.id
    RETURN QUERY
    SELECT
        lp.institution_id,
        lp.department_id,
        lp.program_id,
        lp.semester_id,
        lp.section_id,
        p.role
    FROM profiles p
    JOIN learners_profiles lp ON (
        p.email = lp.student_email
        OR p.email = lp.college_email
    )
    LEFT JOIN sections s ON s.id = lp.section_id
    WHERE p.id = p_user_id  -- Filter by auth user ID
    AND p.role = 'student'
    LIMIT 1;

    -- If student context found, return
    IF FOUND THEN
        RETURN;
    END IF;

    -- Try to get context from staff table
    RETURN QUERY
    SELECT
        st.institution_id,
        st.department_id,
        NULL::UUID as program_id,
        NULL::UUID as semester_id,
        NULL::UUID as section_id,
        p.role
    FROM staff st
    JOIN profiles p ON p.id = st.profile_id
    WHERE st.profile_id = p_user_id
    LIMIT 1;

    -- If staff context found, return
    IF FOUND THEN
        RETURN;
    END IF;

    -- Fallback: get from profiles only
    RETURN QUERY
    SELECT
        p.institution_id,
        NULL::UUID as department_id,
        NULL::UUID as program_id,
        NULL::UUID as semester_id,
        NULL::UUID as section_id,
        p.role
    FROM profiles p
    WHERE p.id = p_user_id;
END;
$$;

COMMENT ON FUNCTION get_user_organizational_context IS 'Returns organizational hierarchy context for a user. Joins profiles and learners_profiles by email matching.';

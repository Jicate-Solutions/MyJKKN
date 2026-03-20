-- =====================================================
-- Engagement Analytics Functions Migration
-- Created: 2026-01-19
-- Purpose: Create database functions for session management and metrics computation
-- =====================================================

-- =====================================================
-- Function: close_user_session
-- Purpose: Close an active session and calculate duration
-- =====================================================
CREATE OR REPLACE FUNCTION close_user_session(
    p_session_id TEXT,
    p_logout_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_login_at TIMESTAMPTZ;
    v_user_id UUID;
BEGIN
    -- Get session details
    SELECT login_at, user_id INTO v_login_at, v_user_id
    FROM user_sessions
    WHERE session_id = p_session_id
    AND is_active = true;

    -- If session not found or already closed, exit
    IF v_login_at IS NULL THEN
        RETURN;
    END IF;

    -- Update session
    UPDATE user_sessions
    SET
        logout_at = p_logout_at,
        duration_seconds = EXTRACT(EPOCH FROM (p_logout_at - v_login_at))::INTEGER,
        is_active = false,
        updated_at = NOW()
    WHERE session_id = p_session_id;

    -- Update user's last_login in profiles
    UPDATE profiles
    SET last_login = p_logout_at
    WHERE id = v_user_id;
END;
$$;

COMMENT ON FUNCTION close_user_session IS 'Closes an active user session and calculates duration';

-- =====================================================
-- Function: add_module_to_session
-- Purpose: Track module access during a session
-- =====================================================
CREATE OR REPLACE FUNCTION add_module_to_session(
    p_session_id TEXT,
    p_module_name TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE user_sessions
    SET
        modules_accessed = CASE
            WHEN p_module_name = ANY(modules_accessed) THEN modules_accessed
            ELSE array_append(modules_accessed, p_module_name)
        END,
        actions_count = actions_count + 1,
        updated_at = NOW()
    WHERE session_id = p_session_id
    AND is_active = true;
END;
$$;

COMMENT ON FUNCTION add_module_to_session IS 'Adds a module to the session modules_accessed array if not already present';

-- =====================================================
-- Function: get_user_organizational_context
-- Purpose: Get organizational hierarchy for a user
-- =====================================================
CREATE OR REPLACE FUNCTION get_user_organizational_context(
    p_user_id UUID
)
RETURNS TABLE (
    institution_id UUID,
    department_id UUID,
    program_id UUID,
    semester_id UUID,
    section_id UUID,
    user_role user_role
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Try to get context from learners_profiles (students)
    RETURN QUERY
    SELECT
        lp.institution_id,
        lp.department_id,
        lp.program_id,
        lp.semester_id,
        lp.section_id,
        p.role
    FROM learners_profiles lp
    JOIN profiles p ON p.id = lp.id
    LEFT JOIN sections s ON s.id = lp.section_id
    WHERE lp.id = p_user_id
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

COMMENT ON FUNCTION get_user_organizational_context IS 'Returns organizational hierarchy context for a user (student or staff)';

-- =====================================================
-- Function: compute_daily_engagement_metrics
-- Purpose: Aggregate session data into daily metrics
-- =====================================================
CREATE OR REPLACE FUNCTION compute_daily_engagement_metrics(
    p_target_date DATE DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rows_inserted INTEGER := 0;
    v_date DATE;
BEGIN
    -- Default to yesterday if no date provided
    v_date := COALESCE(p_target_date, CURRENT_DATE - INTERVAL '1 day');

    -- Delete existing metrics for this date
    DELETE FROM daily_engagement_metrics
    WHERE metric_date = v_date;

    -- Insert aggregated metrics grouped by organizational hierarchy and role
    INSERT INTO daily_engagement_metrics (
        metric_date,
        institution_id,
        department_id,
        program_id,
        semester_id,
        section_id,
        role,
        total_logins,
        unique_users,
        total_sessions,
        avg_session_duration_minutes,
        total_active_time_hours,
        avg_modules_per_user
    )
    SELECT
        v_date as metric_date,
        us.institution_id,
        us.department_id,
        us.program_id,
        us.semester_id,
        us.section_id,
        us.role,
        COUNT(*) as total_logins,
        COUNT(DISTINCT us.user_id) as unique_users,
        COUNT(DISTINCT us.session_id) as total_sessions,
        AVG(us.duration_seconds / 60.0)::NUMERIC(10, 2) as avg_session_duration_minutes,
        (SUM(COALESCE(us.duration_seconds, 0)) / 3600.0)::NUMERIC(10, 2) as total_active_time_hours,
        (AVG(array_length(us.modules_accessed, 1)))::NUMERIC(10, 2) as avg_modules_per_user
    FROM user_sessions us
    WHERE DATE(us.login_at) = v_date
    AND us.institution_id IS NOT NULL
    GROUP BY
        us.institution_id,
        us.department_id,
        us.program_id,
        us.semester_id,
        us.section_id,
        us.role;

    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

    RETURN v_rows_inserted;
END;
$$;

COMMENT ON FUNCTION compute_daily_engagement_metrics IS 'Computes daily engagement metrics from user_sessions for the specified date';

-- =====================================================
-- Function: compute_student_engagement_scores
-- Purpose: Calculate individual student engagement scores and risk assessment
-- =====================================================
CREATE OR REPLACE FUNCTION compute_student_engagement_scores(
    p_target_date DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_student RECORD;
    v_session_data RECORD;
    v_section_avg_logins NUMERIC;
    v_section_avg_duration NUMERIC;
    v_percentile INTEGER;
    v_engagement_level TEXT;
    v_is_at_risk BOOLEAN;
    v_risk_factors TEXT[];
    v_rows_inserted INTEGER := 0;
BEGIN
    -- Delete existing scores for this date
    DELETE FROM student_engagement_scores
    WHERE calculation_date = p_target_date;

    -- Loop through all active students
    FOR v_student IN
        SELECT DISTINCT
            lp.id as user_id,
            lp.institution_id,
            lp.department_id,
            lp.program_id,
            lp.semester_id,
            lp.section_id
        FROM learners_profiles lp
        JOIN profiles p ON p.id = lp.id
        LEFT JOIN sections s ON s.id = lp.section_id
        WHERE p.role = 'learner'
        AND lp.lifecycle_status = 'active'
        AND lp.section_id IS NOT NULL
    LOOP
        -- Get engagement data for this student
        SELECT
            COUNT(*) FILTER (WHERE login_at >= p_target_date - INTERVAL '7 days') as logins_7d,
            COUNT(*) FILTER (WHERE login_at >= p_target_date - INTERVAL '30 days') as logins_30d,
            AVG(duration_seconds / 60.0) as avg_duration_minutes,
            SUM(COALESCE(duration_seconds, 0)) / 3600.0 as total_hours,
            array_length(array_agg(DISTINCT unnest_val), 1) as unique_modules_count,
            array_agg(DISTINCT unnest_val) as unique_modules,
            MAX(login_at) as last_login,
            EXTRACT(DAY FROM p_target_date - MAX(login_at))::INTEGER as days_since_login
        INTO v_session_data
        FROM (
            SELECT
                us.*,
                unnest(COALESCE(us.modules_accessed, ARRAY[]::TEXT[])) as unnest_val
            FROM user_sessions us
            WHERE us.user_id = v_student.user_id
            AND us.login_at >= p_target_date - INTERVAL '30 days'
        ) sub;

        -- Get section averages for comparison
        SELECT
            AVG(logins_7d) as avg_logins_7d,
            AVG(avg_duration_minutes) as avg_duration
        INTO v_section_avg_logins, v_section_avg_duration
        FROM (
            SELECT
                us.user_id,
                COUNT(*) as logins_7d,
                AVG(us.duration_seconds / 60.0) as avg_duration_minutes
            FROM user_sessions us
            WHERE us.section_id = v_student.section_id
            AND us.login_at >= p_target_date - INTERVAL '7 days'
            GROUP BY us.user_id
        ) section_stats;

        -- Calculate percentile rank within section
        WITH section_rankings AS (
            SELECT
                user_id,
                COUNT(*) as logins_7d,
                PERCENT_RANK() OVER (ORDER BY COUNT(*)) as pct_rank
            FROM user_sessions
            WHERE section_id = v_student.section_id
            AND login_at >= p_target_date - INTERVAL '7 days'
            GROUP BY user_id
        )
        SELECT (pct_rank * 100)::INTEGER
        INTO v_percentile
        FROM section_rankings
        WHERE user_id = v_student.user_id;

        -- Default percentile to 0 if no data
        v_percentile := COALESCE(v_percentile, 0);

        -- Determine engagement level based on percentile and login frequency
        IF v_percentile >= 75 AND COALESCE(v_session_data.logins_7d, 0) >= 5 THEN
            v_engagement_level := 'high';
        ELSIF v_percentile >= 40 AND COALESCE(v_session_data.logins_7d, 0) >= 2 THEN
            v_engagement_level := 'medium';
        ELSIF v_percentile >= 20 AND COALESCE(v_session_data.logins_7d, 0) >= 1 THEN
            v_engagement_level := 'low';
        ELSE
            v_engagement_level := 'at_risk';
        END IF;

        -- Identify at-risk students and their risk factors
        v_is_at_risk := false;
        v_risk_factors := ARRAY[]::TEXT[];

        IF COALESCE(v_session_data.logins_7d, 0) = 0 THEN
            v_is_at_risk := true;
            v_risk_factors := array_append(v_risk_factors, 'no_login_7d');
        END IF;

        IF COALESCE(v_session_data.days_since_login, 999) > 7 THEN
            v_is_at_risk := true;
            v_risk_factors := array_append(v_risk_factors, 'inactive_7d');
        END IF;

        IF v_percentile < 20 THEN
            v_is_at_risk := true;
            v_risk_factors := array_append(v_risk_factors, 'below_20_percentile');
        END IF;

        IF COALESCE(v_session_data.avg_duration_minutes, 0) < 5 AND COALESCE(v_session_data.logins_7d, 0) > 0 THEN
            v_risk_factors := array_append(v_risk_factors, 'low_session_duration');
        END IF;

        IF COALESCE(v_session_data.unique_modules_count, 0) <= 2 AND COALESCE(v_session_data.logins_7d, 0) > 0 THEN
            v_risk_factors := array_append(v_risk_factors, 'limited_module_access');
        END IF;

        -- Insert student engagement score
        INSERT INTO student_engagement_scores (
            user_id,
            calculation_date,
            institution_id,
            department_id,
            program_id,
            semester_id,
            section_id,
            logins_last_7_days,
            logins_last_30_days,
            avg_session_duration_minutes,
            total_time_spent_hours,
            modules_accessed_count,
            unique_modules_accessed,
            last_login_at,
            days_since_last_login,
            section_avg_logins_7d,
            section_avg_duration,
            percentile_rank,
            engagement_level,
            is_at_risk,
            risk_factors
        ) VALUES (
            v_student.user_id,
            p_target_date,
            v_student.institution_id,
            v_student.department_id,
            v_student.program_id,
            v_student.semester_id,
            v_student.section_id,
            COALESCE(v_session_data.logins_7d, 0),
            COALESCE(v_session_data.logins_30d, 0),
            v_session_data.avg_duration_minutes,
            v_session_data.total_hours,
            COALESCE(v_session_data.unique_modules_count, 0),
            COALESCE(v_session_data.unique_modules, ARRAY[]::TEXT[]),
            v_session_data.last_login,
            v_session_data.days_since_login,
            v_section_avg_logins,
            v_section_avg_duration,
            v_percentile,
            v_engagement_level,
            v_is_at_risk,
            v_risk_factors
        );

        v_rows_inserted := v_rows_inserted + 1;
    END LOOP;

    -- Refresh the materialized view
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_engagement_overview;

    RETURN v_rows_inserted;
END;
$$;

COMMENT ON FUNCTION compute_student_engagement_scores IS 'Computes individual student engagement scores, percentile ranks, and risk assessments';

-- =====================================================
-- Function: cleanup_orphaned_sessions
-- Purpose: Close sessions that have been active for > 24 hours
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_orphaned_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rows_updated INTEGER := 0;
BEGIN
    UPDATE user_sessions
    SET
        logout_at = login_at + INTERVAL '24 hours',
        duration_seconds = 86400, -- 24 hours in seconds
        is_active = false,
        updated_at = NOW()
    WHERE is_active = true
    AND login_at < NOW() - INTERVAL '24 hours';

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    RETURN v_rows_updated;
END;
$$;

COMMENT ON FUNCTION cleanup_orphaned_sessions IS 'Closes sessions that have been active for more than 24 hours';

-- =====================================================
-- Grant execute permissions
-- =====================================================
GRANT EXECUTE ON FUNCTION close_user_session(TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION add_module_to_session(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_organizational_context(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION compute_daily_engagement_metrics(DATE) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION compute_student_engagement_scores(DATE) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION cleanup_orphaned_sessions() TO postgres, service_role;

-- =====================================================
-- End of migration
-- =====================================================

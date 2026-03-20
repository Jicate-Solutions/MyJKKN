-- Fix compute_student_engagement_scores function - correct role from 'learner' to 'student'
-- Date: 2026-01-19
-- Issue: Function was filtering for p.role = 'learner' but actual role value is 'student'
-- Impact: No students were being processed by the aggregation function

-- Drop and recreate the function with correct role
DROP FUNCTION IF EXISTS compute_student_engagement_scores(DATE);

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
        WHERE p.role = 'student'  -- ✅ FIXED: Changed from 'learner' to 'student'
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

COMMENT ON FUNCTION compute_student_engagement_scores IS 'Computes individual student engagement scores, percentile ranks, and risk assessments for active students';

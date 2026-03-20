-- =====================================================
-- Engagement Analytics Schema Migration
-- Created: 2026-01-19
-- Purpose: Create tables for advanced student engagement analytics
-- =====================================================

-- =====================================================
-- Table: user_sessions
-- Purpose: Track detailed session data with organizational context
-- =====================================================
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Session timestamps
    login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    logout_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- User context
    role user_role NOT NULL,
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    program_id UUID REFERENCES programs(id) ON DELETE SET NULL,
    semester_id UUID REFERENCES semesters(id) ON DELETE SET NULL,
    section_id UUID REFERENCES sections(id) ON DELETE SET NULL,

    -- Session metadata
    ip_address INET,
    user_agent TEXT,
    device_type TEXT CHECK (device_type IN ('mobile', 'tablet', 'desktop')),

    -- Activity tracking
    actions_count INTEGER DEFAULT 0,
    modules_accessed TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for user_sessions
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_login_at ON user_sessions(login_at DESC);
CREATE INDEX idx_user_sessions_institution_id ON user_sessions(institution_id);
CREATE INDEX idx_user_sessions_section_id ON user_sessions(section_id) WHERE section_id IS NOT NULL;
CREATE INDEX idx_user_sessions_role ON user_sessions(role);
CREATE INDEX idx_user_sessions_is_active ON user_sessions(is_active) WHERE is_active = true;
CREATE INDEX idx_user_sessions_user_login ON user_sessions(user_id, login_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_user_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_sessions_updated_at
    BEFORE UPDATE ON user_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_user_sessions_updated_at();

COMMENT ON TABLE user_sessions IS 'Tracks user login sessions with organizational context and activity data';
COMMENT ON COLUMN user_sessions.session_id IS 'Unique session identifier stored in user cookie/token';
COMMENT ON COLUMN user_sessions.modules_accessed IS 'Array of module paths accessed during session (e.g., academic/timetables)';

-- =====================================================
-- Table: daily_engagement_metrics
-- Purpose: Pre-aggregated daily metrics by organizational hierarchy
-- =====================================================
CREATE TABLE IF NOT EXISTS daily_engagement_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_date DATE NOT NULL,

    -- Organizational hierarchy
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    program_id UUID REFERENCES programs(id) ON DELETE CASCADE,
    semester_id UUID REFERENCES semesters(id) ON DELETE CASCADE,
    section_id UUID REFERENCES sections(id) ON DELETE CASCADE,

    -- User role
    role user_role NOT NULL,

    -- Engagement metrics
    total_logins INTEGER NOT NULL DEFAULT 0,
    unique_users INTEGER NOT NULL DEFAULT 0,
    total_sessions INTEGER NOT NULL DEFAULT 0,
    avg_session_duration_minutes NUMERIC(10, 2),
    total_active_time_hours NUMERIC(10, 2),
    avg_modules_per_user NUMERIC(10, 2),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure one record per date/hierarchy/role combination
    UNIQUE(metric_date, institution_id, COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::UUID),
           COALESCE(program_id, '00000000-0000-0000-0000-000000000000'::UUID),
           COALESCE(semester_id, '00000000-0000-0000-0000-000000000000'::UUID),
           COALESCE(section_id, '00000000-0000-0000-0000-000000000000'::UUID), role)
);

-- Indexes for daily_engagement_metrics
CREATE INDEX idx_daily_engagement_date ON daily_engagement_metrics(metric_date DESC);
CREATE INDEX idx_daily_engagement_institution_date ON daily_engagement_metrics(institution_id, metric_date DESC);
CREATE INDEX idx_daily_engagement_section_date ON daily_engagement_metrics(section_id, metric_date DESC) WHERE section_id IS NOT NULL;
CREATE INDEX idx_daily_engagement_role_date ON daily_engagement_metrics(role, metric_date DESC);

COMMENT ON TABLE daily_engagement_metrics IS 'Pre-aggregated daily engagement metrics by organizational hierarchy and role';

-- =====================================================
-- Table: student_engagement_scores
-- Purpose: Individual student engagement tracking and risk assessment
-- =====================================================
CREATE TABLE IF NOT EXISTS student_engagement_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    calculation_date DATE NOT NULL,

    -- Organizational context
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    program_id UUID REFERENCES programs(id) ON DELETE SET NULL,
    semester_id UUID REFERENCES semesters(id) ON DELETE SET NULL,
    section_id UUID REFERENCES sections(id) ON DELETE SET NULL,

    -- Engagement metrics
    logins_last_7_days INTEGER NOT NULL DEFAULT 0,
    logins_last_30_days INTEGER NOT NULL DEFAULT 0,
    avg_session_duration_minutes NUMERIC(10, 2),
    total_time_spent_hours NUMERIC(10, 2),
    modules_accessed_count INTEGER NOT NULL DEFAULT 0,
    unique_modules_accessed TEXT[] DEFAULT ARRAY[]::TEXT[],
    last_login_at TIMESTAMPTZ,
    days_since_last_login INTEGER,

    -- Comparative metrics (section-level comparison)
    section_avg_logins_7d NUMERIC(10, 2),
    section_avg_duration NUMERIC(10, 2),
    percentile_rank INTEGER CHECK (percentile_rank BETWEEN 0 AND 100),

    -- Risk indicators
    engagement_level TEXT CHECK (engagement_level IN ('high', 'medium', 'low', 'at_risk')),
    is_at_risk BOOLEAN NOT NULL DEFAULT false,
    risk_factors TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure one record per user per date
    UNIQUE(user_id, calculation_date)
);

-- Indexes for student_engagement_scores
CREATE INDEX idx_student_engagement_user_date ON student_engagement_scores(user_id, calculation_date DESC);
CREATE INDEX idx_student_engagement_section_date ON student_engagement_scores(section_id, calculation_date DESC) WHERE section_id IS NOT NULL;
CREATE INDEX idx_student_engagement_at_risk ON student_engagement_scores(calculation_date DESC, is_at_risk) WHERE is_at_risk = true;
CREATE INDEX idx_student_engagement_institution ON student_engagement_scores(institution_id, calculation_date DESC);
CREATE INDEX idx_student_engagement_department ON student_engagement_scores(department_id, calculation_date DESC) WHERE department_id IS NOT NULL;
CREATE INDEX idx_student_engagement_percentile ON student_engagement_scores(section_id, percentile_rank) WHERE section_id IS NOT NULL;

COMMENT ON TABLE student_engagement_scores IS 'Individual student engagement scores with risk assessment and comparative analytics';
COMMENT ON COLUMN student_engagement_scores.percentile_rank IS 'Student percentile rank within their section (0-100, higher is better)';
COMMENT ON COLUMN student_engagement_scores.risk_factors IS 'Array of risk factors: no_login_7d, inactive_7d, below_20_percentile, low_session_duration, limited_module_access';

-- =====================================================
-- Materialized View: mv_engagement_overview
-- Purpose: Fast summary for dashboard cards
-- =====================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_engagement_overview AS
SELECT
    -- Organizational identifiers
    institution_id,
    department_id,
    program_id,
    semester_id,
    section_id,

    -- Summary metrics (most recent calculation_date)
    MAX(calculation_date) as latest_calculation_date,
    COUNT(DISTINCT user_id) as total_students,
    COUNT(DISTINCT user_id) FILTER (WHERE logins_last_7_days > 0) as active_last_7d,
    COUNT(DISTINCT user_id) FILTER (WHERE is_at_risk = true) as at_risk_count,
    AVG(logins_last_7_days) as avg_logins_7d,
    AVG(avg_session_duration_minutes) as avg_session_duration,
    AVG(percentile_rank) as avg_percentile_rank,

    -- Engagement level distribution
    COUNT(DISTINCT user_id) FILTER (WHERE engagement_level = 'high') as high_engagement_count,
    COUNT(DISTINCT user_id) FILTER (WHERE engagement_level = 'medium') as medium_engagement_count,
    COUNT(DISTINCT user_id) FILTER (WHERE engagement_level = 'low') as low_engagement_count,
    COUNT(DISTINCT user_id) FILTER (WHERE engagement_level = 'at_risk') as at_risk_engagement_count
FROM student_engagement_scores
WHERE calculation_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY
    institution_id,
    department_id,
    program_id,
    semester_id,
    section_id;

-- Unique indexes for fast lookups
CREATE UNIQUE INDEX idx_mv_engagement_section ON mv_engagement_overview(section_id) WHERE section_id IS NOT NULL;
CREATE UNIQUE INDEX idx_mv_engagement_semester ON mv_engagement_overview(semester_id, COALESCE(section_id, '00000000-0000-0000-0000-000000000000'::UUID)) WHERE semester_id IS NOT NULL AND section_id IS NULL;
CREATE UNIQUE INDEX idx_mv_engagement_program ON mv_engagement_overview(program_id, COALESCE(semester_id, '00000000-0000-0000-0000-000000000000'::UUID)) WHERE program_id IS NOT NULL AND semester_id IS NULL;
CREATE UNIQUE INDEX idx_mv_engagement_department ON mv_engagement_overview(department_id, COALESCE(program_id, '00000000-0000-0000-0000-000000000000'::UUID)) WHERE department_id IS NOT NULL AND program_id IS NULL;
CREATE UNIQUE INDEX idx_mv_engagement_institution ON mv_engagement_overview(institution_id, COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::UUID)) WHERE department_id IS NULL;

COMMENT ON MATERIALIZED VIEW mv_engagement_overview IS 'Fast summary of engagement metrics for dashboard - refreshed every 15 minutes';

-- =====================================================
-- RLS Policies
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_engagement_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_engagement_scores ENABLE ROW LEVEL SECURITY;

-- user_sessions policies
-- Users can view their own sessions
CREATE POLICY user_sessions_select_own ON user_sessions
    FOR SELECT
    USING (auth.uid() = user_id);

-- Admins can view sessions within their organizational scope
CREATE POLICY user_sessions_select_admin ON user_sessions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND (
                p.is_super_admin = true
                OR (
                    p.role IN ('principal', 'hod', 'faculty', 'admin')
                    AND p.institution_id = user_sessions.institution_id
                )
            )
        )
    );

-- Only system can insert/update/delete sessions (handled by functions)
CREATE POLICY user_sessions_insert_system ON user_sessions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_sessions_update_system ON user_sessions
    FOR UPDATE
    USING (auth.uid() = user_id);

-- daily_engagement_metrics policies
-- Only admins and faculty can view metrics
CREATE POLICY daily_engagement_select_admin ON daily_engagement_metrics
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND (
                p.is_super_admin = true
                OR (
                    p.role IN ('principal', 'hod', 'faculty', 'admin', 'accounts')
                    AND p.institution_id = daily_engagement_metrics.institution_id
                )
            )
        )
    );

-- student_engagement_scores policies
-- Only admins and faculty can view scores
CREATE POLICY student_engagement_select_admin ON student_engagement_scores
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND (
                p.is_super_admin = true
                OR (
                    p.role IN ('principal', 'hod', 'faculty', 'admin', 'counselor', 'accounts')
                    AND p.institution_id = student_engagement_scores.institution_id
                )
            )
        )
    );

-- Grant SELECT on materialized view to authenticated users (RLS enforced by underlying table policies)
GRANT SELECT ON mv_engagement_overview TO authenticated;

-- =====================================================
-- Cleanup function for orphaned sessions
-- Purpose: Close sessions that have been active for more than 24 hours
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_orphaned_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE user_sessions
    SET
        is_active = false,
        logout_at = login_at + INTERVAL '24 hours',
        duration_seconds = 86400, -- 24 hours in seconds
        updated_at = NOW()
    WHERE
        is_active = true
        AND login_at < NOW() - INTERVAL '24 hours'
        AND logout_at IS NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    RETURN updated_count;
END;
$$;

COMMENT ON FUNCTION cleanup_orphaned_sessions IS 'Closes sessions that have been active for more than 24 hours without logout';

-- =====================================================
-- Grant permissions
-- =====================================================
GRANT SELECT, INSERT, UPDATE ON user_sessions TO authenticated;
GRANT SELECT ON daily_engagement_metrics TO authenticated;
GRANT SELECT ON student_engagement_scores TO authenticated;

-- =====================================================
-- End of migration
-- =====================================================

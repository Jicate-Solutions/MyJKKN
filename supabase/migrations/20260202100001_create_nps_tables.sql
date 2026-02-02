-- =====================================================
-- NPS (Net Promoter Score) Module - Stakeholder NPS
-- =====================================================
-- Created: 2026-02-02
-- Description: Tables for stakeholder NPS surveys, responses, and analytics
-- Stakeholder types: student, parent, staff, alumni
-- NPS calculation: % Promoters (9-10) - % Detractors (0-6)
-- =====================================================

-- ============================================
-- Table: nps_surveys
-- Purpose: Survey templates for stakeholder feedback collection
-- ============================================
CREATE TABLE IF NOT EXISTS nps_surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    stakeholder_types TEXT[] NOT NULL CHECK (
        ARRAY_LENGTH(stakeholder_types, 1) > 0 AND
        stakeholder_types <@ ARRAY['student', 'parent', 'staff', 'alumni']::TEXT[]
    ),
    question TEXT NOT NULL DEFAULT 'How likely are you to recommend our institution to others?',
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed', 'archived')),
    response_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    CONSTRAINT valid_date_range CHECK (end_date > start_date)
);

-- Indexes for surveys
CREATE INDEX idx_nps_surveys_institution ON nps_surveys(institution_id);
CREATE INDEX idx_nps_surveys_status ON nps_surveys(status);
CREATE INDEX idx_nps_surveys_dates ON nps_surveys(start_date, end_date);

-- ============================================
-- Table: nps_responses
-- Purpose: Individual stakeholder NPS responses
-- ============================================
CREATE TABLE IF NOT EXISTS nps_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id UUID NOT NULL REFERENCES nps_surveys(id) ON DELETE CASCADE,
    stakeholder_type TEXT NOT NULL CHECK (stakeholder_type IN ('student', 'parent', 'staff', 'alumni')),
    stakeholder_id UUID NOT NULL, -- References students/parents/staff table
    stakeholder_email TEXT,
    stakeholder_name TEXT,
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 10),
    feedback TEXT,
    sentiment TEXT GENERATED ALWAYS AS (
        CASE
            WHEN score >= 9 THEN 'promoter'
            WHEN score >= 7 THEN 'passive'
            ELSE 'detractor'
        END
    ) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate responses from same stakeholder in same survey
    CONSTRAINT unique_survey_stakeholder UNIQUE (survey_id, stakeholder_type, stakeholder_id)
);

-- Indexes for responses
CREATE INDEX idx_nps_responses_survey ON nps_responses(survey_id);
CREATE INDEX idx_nps_responses_stakeholder ON nps_responses(stakeholder_type, stakeholder_id);
CREATE INDEX idx_nps_responses_score ON nps_responses(score);
CREATE INDEX idx_nps_responses_sentiment ON nps_responses(sentiment);
CREATE INDEX idx_nps_responses_created ON nps_responses(created_at);

-- ============================================
-- View: nps_survey_analytics
-- Purpose: Pre-calculated NPS metrics per survey
-- ============================================
CREATE OR REPLACE VIEW nps_survey_analytics AS
SELECT
    s.id AS survey_id,
    s.institution_id,
    s.title,
    s.stakeholder_types,
    s.start_date,
    s.end_date,
    s.status,
    COUNT(r.id) AS total_responses,

    -- Score segment counts
    COUNT(r.id) FILTER (WHERE r.sentiment = 'promoter') AS promoter_count,
    COUNT(r.id) FILTER (WHERE r.sentiment = 'passive') AS passive_count,
    COUNT(r.id) FILTER (WHERE r.sentiment = 'detractor') AS detractor_count,

    -- Score segment percentages
    ROUND(
        (COUNT(r.id) FILTER (WHERE r.sentiment = 'promoter')::NUMERIC / NULLIF(COUNT(r.id), 0)) * 100,
        2
    ) AS promoter_percentage,
    ROUND(
        (COUNT(r.id) FILTER (WHERE r.sentiment = 'passive')::NUMERIC / NULLIF(COUNT(r.id), 0)) * 100,
        2
    ) AS passive_percentage,
    ROUND(
        (COUNT(r.id) FILTER (WHERE r.sentiment = 'detractor')::NUMERIC / NULLIF(COUNT(r.id), 0)) * 100,
        2
    ) AS detractor_percentage,

    -- NPS Score calculation
    ROUND(
        (
            (COUNT(r.id) FILTER (WHERE r.sentiment = 'promoter')::NUMERIC / NULLIF(COUNT(r.id), 0)) -
            (COUNT(r.id) FILTER (WHERE r.sentiment = 'detractor')::NUMERIC / NULLIF(COUNT(r.id), 0))
        ) * 100,
        2
    ) AS nps_score,

    -- Average score
    ROUND(AVG(r.score)::NUMERIC, 2) AS avg_score,

    -- Response breakdown by stakeholder type
    JSONB_OBJECT_AGG(
        COALESCE(r.stakeholder_type, 'unknown'),
        COUNT(r.id) FILTER (WHERE r.stakeholder_type IS NOT NULL)
    ) AS responses_by_type
FROM
    nps_surveys s
LEFT JOIN
    nps_responses r ON s.id = r.survey_id
GROUP BY
    s.id, s.institution_id, s.title, s.stakeholder_types, s.start_date, s.end_date, s.status;

-- ============================================
-- View: nps_trend_analysis
-- Purpose: Monthly NPS trends by institution and stakeholder type
-- ============================================
CREATE OR REPLACE VIEW nps_trend_analysis AS
SELECT
    s.institution_id,
    r.stakeholder_type,
    DATE_TRUNC('month', r.created_at) AS month,
    COUNT(r.id) AS response_count,
    COUNT(r.id) FILTER (WHERE r.sentiment = 'promoter') AS promoters,
    COUNT(r.id) FILTER (WHERE r.sentiment = 'passive') AS passives,
    COUNT(r.id) FILTER (WHERE r.sentiment = 'detractor') AS detractors,
    ROUND(
        (
            (COUNT(r.id) FILTER (WHERE r.sentiment = 'promoter')::NUMERIC / NULLIF(COUNT(r.id), 0)) -
            (COUNT(r.id) FILTER (WHERE r.sentiment = 'detractor')::NUMERIC / NULLIF(COUNT(r.id), 0))
        ) * 100,
        2
    ) AS nps_score,
    ROUND(AVG(r.score)::NUMERIC, 2) AS avg_score
FROM
    nps_surveys s
INNER JOIN
    nps_responses r ON s.id = r.survey_id
WHERE
    s.status IN ('active', 'closed')
GROUP BY
    s.institution_id,
    r.stakeholder_type,
    DATE_TRUNC('month', r.created_at)
ORDER BY
    month DESC,
    r.stakeholder_type;

-- ============================================
-- Trigger: Update survey response count
-- ============================================
CREATE OR REPLACE FUNCTION update_nps_survey_response_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE nps_surveys
        SET response_count = response_count + 1
        WHERE id = NEW.survey_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE nps_surveys
        SET response_count = response_count - 1
        WHERE id = OLD.survey_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_survey_response_count
AFTER INSERT OR DELETE ON nps_responses
FOR EACH ROW
EXECUTE FUNCTION update_nps_survey_response_count();

-- ============================================
-- Trigger: Update timestamps
-- ============================================
CREATE OR REPLACE FUNCTION update_nps_survey_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_nps_survey_timestamp
BEFORE UPDATE ON nps_surveys
FOR EACH ROW
EXECUTE FUNCTION update_nps_survey_timestamp();

-- ============================================
-- RLS Policies
-- ============================================

-- Enable RLS
ALTER TABLE nps_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_responses ENABLE ROW LEVEL SECURITY;

-- Surveys: Read access for users with institution access
CREATE POLICY "nps_surveys_read_access" ON nps_surveys
    FOR SELECT
    USING (
        institution_id IN (
            SELECT institution_id
            FROM user_institution_access
            WHERE user_id = auth.uid()
        )
    );

-- Surveys: Insert/Update/Delete for users with tqm.nps.surveys.create permission
CREATE POLICY "nps_surveys_write_access" ON nps_surveys
    FOR ALL
    USING (
        institution_id IN (
            SELECT institution_id
            FROM user_institution_access
            WHERE user_id = auth.uid()
        )
        AND auth.uid() IN (
            SELECT user_id
            FROM user_institution_access uia
            JOIN user_roles ur ON ur.id = uia.role_id
            WHERE uia.institution_id = nps_surveys.institution_id
            AND (
                ur.permissions->>'tqm.nps.surveys.create' = 'true'
                OR ur.role_key = 'super_admin'
            )
        )
    );

-- Responses: Read access for users with institution access
CREATE POLICY "nps_responses_read_access" ON nps_responses
    FOR SELECT
    USING (
        survey_id IN (
            SELECT id FROM nps_surveys
            WHERE institution_id IN (
                SELECT institution_id
                FROM user_institution_access
                WHERE user_id = auth.uid()
            )
        )
    );

-- Responses: Insert for active surveys (anyone can submit response)
CREATE POLICY "nps_responses_insert_access" ON nps_responses
    FOR INSERT
    WITH CHECK (
        survey_id IN (
            SELECT id FROM nps_surveys
            WHERE status = 'active'
            AND NOW() BETWEEN start_date AND end_date
        )
    );

-- Responses: Update/Delete only for admins
CREATE POLICY "nps_responses_admin_access" ON nps_responses
    FOR UPDATE
    USING (
        survey_id IN (
            SELECT s.id FROM nps_surveys s
            WHERE s.institution_id IN (
                SELECT institution_id
                FROM user_institution_access
                WHERE user_id = auth.uid()
            )
            AND auth.uid() IN (
                SELECT user_id
                FROM user_institution_access uia
                JOIN user_roles ur ON ur.id = uia.role_id
                WHERE uia.institution_id = s.institution_id
                AND (
                    ur.permissions->>'tqm.nps.surveys.create' = 'true'
                    OR ur.role_key = 'super_admin'
                )
            )
        )
    );

-- ============================================
-- Sample Data Comments
-- ============================================
COMMENT ON TABLE nps_surveys IS 'NPS survey templates for stakeholder feedback collection';
COMMENT ON TABLE nps_responses IS 'Individual stakeholder NPS responses (0-10 scale)';
COMMENT ON VIEW nps_survey_analytics IS 'Pre-calculated NPS metrics per survey (promoter %, detractor %, NPS score)';
COMMENT ON VIEW nps_trend_analysis IS 'Monthly NPS trends by institution and stakeholder type';
COMMENT ON COLUMN nps_responses.sentiment IS 'Auto-calculated: promoter (9-10), passive (7-8), detractor (0-6)';

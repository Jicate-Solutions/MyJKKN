-- Migration: Create Stakeholder NPS Module Tables
-- Created: 2026-02-01
-- Purpose: Implement Net Promoter Score (NPS) tracking for all 5 stakeholder types

-- =====================================================
-- ENUMS
-- =====================================================

-- Stakeholder type enum
DO $$ BEGIN
  CREATE TYPE stakeholder_type AS ENUM ('parent', 'learner', 'alumni', 'industry', 'staff');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Survey status enum
DO $$ BEGIN
  CREATE TYPE survey_status AS ENUM ('draft', 'active', 'closed', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- NPS category enum
DO $$ BEGIN
  CREATE TYPE nps_category AS ENUM ('promoter', 'passive', 'detractor');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- TABLE: nps_surveys
-- =====================================================

CREATE TABLE IF NOT EXISTS nps_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  stakeholder_type stakeholder_type NOT NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  program_id UUID REFERENCES programs(id) ON DELETE SET NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  status survey_status DEFAULT 'draft' NOT NULL,
  questions JSONB NOT NULL DEFAULT '[]',
  created_by UUID REFERENCES users_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Constraints
  CONSTRAINT valid_date_range CHECK (end_date >= start_date),
  CONSTRAINT valid_questions_array CHECK (jsonb_typeof(questions) = 'array')
);

-- Add comments
COMMENT ON TABLE nps_surveys IS 'NPS surveys for different stakeholder types';
COMMENT ON COLUMN nps_surveys.questions IS 'JSONB array of survey questions with id, type, question, required, options';
COMMENT ON COLUMN nps_surveys.stakeholder_type IS 'Type of stakeholder: parent, learner, alumni, industry, staff';

-- =====================================================
-- TABLE: nps_responses
-- =====================================================

CREATE TABLE IF NOT EXISTS nps_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES nps_surveys(id) ON DELETE CASCADE,
  respondent_id UUID, -- Can be null for anonymous responses
  respondent_type stakeholder_type NOT NULL,
  respondent_email VARCHAR(255),
  respondent_name VARCHAR(255),
  nps_score INTEGER NOT NULL,
  nps_category nps_category GENERATED ALWAYS AS (
    CASE
      WHEN nps_score >= 9 THEN 'promoter'::nps_category
      WHEN nps_score >= 7 THEN 'passive'::nps_category
      ELSE 'detractor'::nps_category
    END
  ) STORED,
  additional_feedback TEXT,
  question_responses JSONB DEFAULT '{}' NOT NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  ip_address INET,
  user_agent TEXT,

  -- Constraints
  CONSTRAINT valid_nps_score CHECK (nps_score >= 0 AND nps_score <= 10),
  CONSTRAINT valid_question_responses CHECK (jsonb_typeof(question_responses) = 'object')
);

-- Add comments
COMMENT ON TABLE nps_responses IS 'Individual NPS survey responses';
COMMENT ON COLUMN nps_responses.nps_score IS 'NPS score from 0 to 10';
COMMENT ON COLUMN nps_responses.nps_category IS 'Auto-calculated: promoter (9-10), passive (7-8), detractor (0-6)';
COMMENT ON COLUMN nps_responses.question_responses IS 'JSONB object with question_id as key and answer as value';

-- =====================================================
-- TABLE: nps_analytics
-- =====================================================

CREATE TABLE IF NOT EXISTS nps_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  survey_id UUID REFERENCES nps_surveys(id) ON DELETE CASCADE,
  stakeholder_type stakeholder_type NOT NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_responses INTEGER DEFAULT 0 NOT NULL,
  promoters INTEGER DEFAULT 0 NOT NULL,
  passives INTEGER DEFAULT 0 NOT NULL,
  detractors INTEGER DEFAULT 0 NOT NULL,
  nps_score DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_responses > 0
      THEN ROUND(((promoters::DECIMAL - detractors::DECIMAL) / total_responses::DECIMAL) * 100, 2)
      ELSE 0
    END
  ) STORED,
  calculated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Unique constraint for upsert operations
  CONSTRAINT unique_analytics_record UNIQUE (institution_id, survey_id, stakeholder_type, department_id, period_start, period_end)
);

-- Add comments
COMMENT ON TABLE nps_analytics IS 'Aggregated NPS analytics for reporting';
COMMENT ON COLUMN nps_analytics.nps_score IS 'Auto-calculated NPS score: ((promoters - detractors) / total) * 100';

-- =====================================================
-- INDEXES
-- =====================================================

-- Surveys indexes
CREATE INDEX IF NOT EXISTS idx_nps_surveys_institution ON nps_surveys(institution_id);
CREATE INDEX IF NOT EXISTS idx_nps_surveys_stakeholder ON nps_surveys(stakeholder_type);
CREATE INDEX IF NOT EXISTS idx_nps_surveys_status ON nps_surveys(status);
CREATE INDEX IF NOT EXISTS idx_nps_surveys_dates ON nps_surveys(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_nps_surveys_department ON nps_surveys(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nps_surveys_program ON nps_surveys(program_id) WHERE program_id IS NOT NULL;

-- Responses indexes
CREATE INDEX IF NOT EXISTS idx_nps_responses_survey ON nps_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_nps_responses_category ON nps_responses(nps_category);
CREATE INDEX IF NOT EXISTS idx_nps_responses_submitted ON nps_responses(submitted_at);
CREATE INDEX IF NOT EXISTS idx_nps_responses_department ON nps_responses(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nps_responses_respondent ON nps_responses(respondent_id) WHERE respondent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nps_responses_type ON nps_responses(respondent_type);

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_nps_analytics_lookup ON nps_analytics(institution_id, stakeholder_type, period_start);
CREATE INDEX IF NOT EXISTS idx_nps_analytics_survey ON nps_analytics(survey_id) WHERE survey_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nps_analytics_department ON nps_analytics(department_id) WHERE department_id IS NOT NULL;

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE nps_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_analytics ENABLE ROW LEVEL SECURITY;

-- Surveys Policies
CREATE POLICY "Users can view surveys for their institution"
  ON nps_surveys FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id FROM users_profiles WHERE id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM users_profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "Staff can create surveys for their institution"
  ON nps_surveys FOR INSERT
  WITH CHECK (
    institution_id IN (
      SELECT institution_id FROM users_profiles WHERE id = auth.uid()
    )
    AND
    EXISTS (
      SELECT 1 FROM users_profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'staff', 'faculty', 'hod')
    )
  );

CREATE POLICY "Staff can update surveys for their institution"
  ON nps_surveys FOR UPDATE
  USING (
    institution_id IN (
      SELECT institution_id FROM users_profiles WHERE id = auth.uid()
    )
    AND
    EXISTS (
      SELECT 1 FROM users_profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'staff', 'faculty', 'hod')
    )
  );

CREATE POLICY "Admins can delete surveys for their institution"
  ON nps_surveys FOR DELETE
  USING (
    institution_id IN (
      SELECT institution_id FROM users_profiles WHERE id = auth.uid()
    )
    AND
    EXISTS (
      SELECT 1 FROM users_profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  );

-- Responses Policies
CREATE POLICY "Anyone can submit responses to active surveys"
  ON nps_responses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nps_surveys
      WHERE id = survey_id
      AND status = 'active'
      AND NOW() BETWEEN start_date AND end_date
    )
  );

CREATE POLICY "Staff can view responses for their institution surveys"
  ON nps_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM nps_surveys s
      JOIN users_profiles up ON up.institution_id = s.institution_id
      WHERE s.id = survey_id
      AND up.id = auth.uid()
      AND up.role IN ('super_admin', 'admin', 'staff', 'faculty', 'hod')
    )
  );

-- Analytics Policies
CREATE POLICY "Staff can view analytics for their institution"
  ON nps_analytics FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id FROM users_profiles WHERE id = auth.uid()
    )
    AND
    EXISTS (
      SELECT 1 FROM users_profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'staff', 'faculty', 'hod')
    )
  );

CREATE POLICY "System can manage analytics"
  ON nps_analytics FOR ALL
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to recalculate analytics for a survey
CREATE OR REPLACE FUNCTION recalculate_nps_analytics(p_survey_id UUID)
RETURNS VOID AS $$
DECLARE
  v_survey RECORD;
  v_totals RECORD;
BEGIN
  -- Get survey details
  SELECT * INTO v_survey FROM nps_surveys WHERE id = p_survey_id;

  IF v_survey IS NULL THEN
    RETURN;
  END IF;

  -- Get response aggregates
  SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE nps_category = 'promoter') as promoters,
    COUNT(*) FILTER (WHERE nps_category = 'passive') as passives,
    COUNT(*) FILTER (WHERE nps_category = 'detractor') as detractors
  INTO v_totals
  FROM nps_responses
  WHERE survey_id = p_survey_id;

  -- Upsert analytics record
  INSERT INTO nps_analytics (
    institution_id,
    survey_id,
    stakeholder_type,
    department_id,
    period_start,
    period_end,
    total_responses,
    promoters,
    passives,
    detractors,
    calculated_at
  ) VALUES (
    v_survey.institution_id,
    p_survey_id,
    v_survey.stakeholder_type,
    v_survey.department_id,
    v_survey.start_date::date,
    v_survey.end_date::date,
    COALESCE(v_totals.total, 0),
    COALESCE(v_totals.promoters, 0),
    COALESCE(v_totals.passives, 0),
    COALESCE(v_totals.detractors, 0),
    NOW()
  )
  ON CONFLICT (institution_id, survey_id, stakeholder_type, department_id, period_start, period_end)
  DO UPDATE SET
    total_responses = EXCLUDED.total_responses,
    promoters = EXCLUDED.promoters,
    passives = EXCLUDED.passives,
    detractors = EXCLUDED.detractors,
    calculated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION recalculate_nps_analytics IS 'Recalculates NPS analytics for a specific survey';

-- Function to get NPS dashboard data
CREATE OR REPLACE FUNCTION get_nps_dashboard(p_institution_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_overall RECORD;
  v_by_stakeholder JSONB;
  v_by_department JSONB;
  v_trend JSONB;
  v_recent_feedback JSONB;
BEGIN
  -- Calculate overall NPS
  SELECT
    COALESCE(SUM(total_responses), 0) as total_responses,
    COALESCE(SUM(promoters), 0) as promoters,
    COALESCE(SUM(passives), 0) as passives,
    COALESCE(SUM(detractors), 0) as detractors
  INTO v_overall
  FROM nps_analytics
  WHERE institution_id = p_institution_id;

  -- Get by stakeholder type
  SELECT jsonb_object_agg(
    stakeholder_type::text,
    jsonb_build_object(
      'score', CASE WHEN SUM(total_responses) > 0
        THEN ROUND(((SUM(promoters) - SUM(detractors))::DECIMAL / SUM(total_responses)::DECIMAL) * 100, 2)
        ELSE 0 END,
      'responses', SUM(total_responses),
      'promoters', SUM(promoters),
      'passives', SUM(passives),
      'detractors', SUM(detractors)
    )
  )
  INTO v_by_stakeholder
  FROM nps_analytics
  WHERE institution_id = p_institution_id
  GROUP BY stakeholder_type;

  -- Get by department
  SELECT jsonb_object_agg(
    COALESCE(d.department_name, 'Unknown'),
    jsonb_build_object(
      'name', COALESCE(d.department_name, 'Unknown'),
      'score', CASE WHEN SUM(a.total_responses) > 0
        THEN ROUND(((SUM(a.promoters) - SUM(a.detractors))::DECIMAL / SUM(a.total_responses)::DECIMAL) * 100, 2)
        ELSE 0 END,
      'responses', SUM(a.total_responses)
    )
  )
  INTO v_by_department
  FROM nps_analytics a
  LEFT JOIN departments d ON d.id = a.department_id
  WHERE a.institution_id = p_institution_id
  AND a.department_id IS NOT NULL
  GROUP BY d.id, d.department_name;

  -- Get trend (last 12 periods)
  SELECT jsonb_agg(
    jsonb_build_object(
      'period', period_start::text,
      'score', nps_score,
      'responses', total_responses
    ) ORDER BY period_start DESC
  )
  INTO v_trend
  FROM (
    SELECT period_start, SUM(total_responses) as total_responses,
      CASE WHEN SUM(total_responses) > 0
        THEN ROUND(((SUM(promoters) - SUM(detractors))::DECIMAL / SUM(total_responses)::DECIMAL) * 100, 2)
        ELSE 0 END as nps_score
    FROM nps_analytics
    WHERE institution_id = p_institution_id
    GROUP BY period_start
    ORDER BY period_start DESC
    LIMIT 12
  ) subq;

  -- Get recent feedback
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'score', r.nps_score,
      'category', r.nps_category,
      'feedback', r.additional_feedback,
      'stakeholder_type', r.respondent_type,
      'submitted_at', r.submitted_at
    ) ORDER BY r.submitted_at DESC
  )
  INTO v_recent_feedback
  FROM (
    SELECT r.*
    FROM nps_responses r
    JOIN nps_surveys s ON s.id = r.survey_id
    WHERE s.institution_id = p_institution_id
    AND r.additional_feedback IS NOT NULL
    AND r.additional_feedback != ''
    ORDER BY r.submitted_at DESC
    LIMIT 10
  ) r;

  -- Build result
  v_result := jsonb_build_object(
    'overall_nps', CASE WHEN v_overall.total_responses > 0
      THEN ROUND(((v_overall.promoters - v_overall.detractors)::DECIMAL / v_overall.total_responses::DECIMAL) * 100, 2)
      ELSE 0 END,
    'total_responses', v_overall.total_responses,
    'response_rate', 0, -- Would need target count to calculate
    'by_stakeholder', COALESCE(v_by_stakeholder, '{}'::jsonb),
    'by_department', COALESCE(v_by_department, '{}'::jsonb),
    'trend', COALESCE(v_trend, '[]'::jsonb),
    'recent_feedback', COALESCE(v_recent_feedback, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_nps_dashboard IS 'Returns NPS dashboard data for an institution';

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Trigger to update analytics when a response is submitted
CREATE OR REPLACE FUNCTION trigger_update_nps_analytics()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM recalculate_nps_analytics(NEW.survey_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_nps_analytics ON nps_responses;
CREATE TRIGGER trg_update_nps_analytics
  AFTER INSERT OR UPDATE OR DELETE ON nps_responses
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_nps_analytics();

-- Trigger to update updated_at on surveys
CREATE OR REPLACE FUNCTION trigger_update_survey_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_survey_timestamp ON nps_surveys;
CREATE TRIGGER trg_update_survey_timestamp
  BEFORE UPDATE ON nps_surveys
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_survey_timestamp();

-- =====================================================
-- GRANTS
-- =====================================================

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION recalculate_nps_analytics(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_nps_dashboard(UUID) TO authenticated;

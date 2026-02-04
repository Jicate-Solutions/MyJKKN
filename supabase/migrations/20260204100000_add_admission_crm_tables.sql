-- Migration: Add Admission CRM Tables
-- Created: 2026-02-04
-- Purpose: Create tables for CRM features (Phase 1-3)

-- ============================================================================
-- ASSIGNMENT RULES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_assignment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  action JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignment_rules_institution ON admission_assignment_rules(institution_id);
CREATE INDEX IF NOT EXISTS idx_assignment_rules_active ON admission_assignment_rules(institution_id, is_active);

-- ============================================================================
-- SCORING RULES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_scoring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL DEFAULT 'engagement',
  field VARCHAR(255) NOT NULL,
  operator VARCHAR(50) NOT NULL DEFAULT 'equals',
  value JSONB NOT NULL DEFAULT '""'::jsonb,
  points INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scoring_rules_institution ON admission_scoring_rules(institution_id);
CREATE INDEX IF NOT EXISTS idx_scoring_rules_active ON admission_scoring_rules(institution_id, is_active);
CREATE INDEX IF NOT EXISTS idx_scoring_rules_category ON admission_scoring_rules(category);

-- ============================================================================
-- COMMUNICATION TEMPLATES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_communication_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  channel VARCHAR(50) NOT NULL DEFAULT 'whatsapp',
  category VARCHAR(100) NOT NULL DEFAULT 'general',
  subject VARCHAR(500),
  content TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_templates_institution ON admission_communication_templates(institution_id);
CREATE INDEX IF NOT EXISTS idx_comm_templates_channel ON admission_communication_templates(channel);
CREATE INDEX IF NOT EXISTS idx_comm_templates_category ON admission_communication_templates(category);

-- ============================================================================
-- WORKFLOWS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  trigger_type VARCHAR(100) NOT NULL DEFAULT 'manual',
  trigger_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_institution ON admission_workflows(institution_id);
CREATE INDEX IF NOT EXISTS idx_workflows_active ON admission_workflows(institution_id, is_active);
CREATE INDEX IF NOT EXISTS idx_workflows_trigger ON admission_workflows(trigger_type);

-- ============================================================================
-- LEAD ACTIVITIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  activity_type VARCHAR(100) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON admission_lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_institution ON admission_lead_activities(institution_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_type ON admission_lead_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created ON admission_lead_activities(created_at DESC);

-- ============================================================================
-- LEAD SCORES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_lead_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  total_score INTEGER NOT NULL DEFAULT 0,
  score_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  score_factors JSONB NOT NULL DEFAULT '[]'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(lead_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_scores_lead ON admission_lead_scores(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_scores_institution ON admission_lead_scores(institution_id);
CREATE INDEX IF NOT EXISTS idx_lead_scores_total ON admission_lead_scores(total_score DESC);

-- ============================================================================
-- AI INSIGHTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  insight_type VARCHAR(100) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  severity VARCHAR(50) NOT NULL DEFAULT 'info',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_institution ON admission_ai_insights(institution_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_type ON admission_ai_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_ai_insights_unread ON admission_ai_insights(institution_id, is_read) WHERE NOT is_read;

-- ============================================================================
-- DAILY BRIEFINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_daily_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  briefing_date DATE NOT NULL,
  user_tier VARCHAR(50) NOT NULL DEFAULT 'counselor',
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(institution_id, user_id, briefing_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_briefings_user ON admission_daily_briefings(user_id, briefing_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_institution ON admission_daily_briefings(institution_id, briefing_date DESC);

-- ============================================================================
-- ENABLE RLS
-- ============================================================================
ALTER TABLE admission_assignment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_scoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_communication_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_lead_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_daily_briefings ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES - Allow authenticated users to access their institution's data
-- ============================================================================

-- Assignment Rules
CREATE POLICY "Users can view their institution's assignment rules"
  ON admission_assignment_rules FOR SELECT
  TO authenticated
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can manage their institution's assignment rules"
  ON admission_assignment_rules FOR ALL
  TO authenticated
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

-- Scoring Rules
CREATE POLICY "Users can view their institution's scoring rules"
  ON admission_scoring_rules FOR SELECT
  TO authenticated
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can manage their institution's scoring rules"
  ON admission_scoring_rules FOR ALL
  TO authenticated
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

-- Communication Templates
CREATE POLICY "Users can view their institution's templates"
  ON admission_communication_templates FOR SELECT
  TO authenticated
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can manage their institution's templates"
  ON admission_communication_templates FOR ALL
  TO authenticated
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

-- Workflows
CREATE POLICY "Users can view their institution's workflows"
  ON admission_workflows FOR SELECT
  TO authenticated
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can manage their institution's workflows"
  ON admission_workflows FOR ALL
  TO authenticated
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

-- Lead Activities
CREATE POLICY "Users can view their institution's lead activities"
  ON admission_lead_activities FOR SELECT
  TO authenticated
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can create lead activities"
  ON admission_lead_activities FOR INSERT
  TO authenticated
  WITH CHECK (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

-- Lead Scores
CREATE POLICY "Users can view their institution's lead scores"
  ON admission_lead_scores FOR SELECT
  TO authenticated
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can manage lead scores"
  ON admission_lead_scores FOR ALL
  TO authenticated
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

-- AI Insights
CREATE POLICY "Users can view their institution's insights"
  ON admission_ai_insights FOR SELECT
  TO authenticated
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can manage insights"
  ON admission_ai_insights FOR ALL
  TO authenticated
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

-- Daily Briefings
CREATE POLICY "Users can view their own briefings"
  ON admission_daily_briefings FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own briefings"
  ON admission_daily_briefings FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_admission_assignment_rules_updated_at
  BEFORE UPDATE ON admission_assignment_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admission_scoring_rules_updated_at
  BEFORE UPDATE ON admission_scoring_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admission_communication_templates_updated_at
  BEFORE UPDATE ON admission_communication_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admission_workflows_updated_at
  BEFORE UPDATE ON admission_workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admission_lead_scores_updated_at
  BEFORE UPDATE ON admission_lead_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

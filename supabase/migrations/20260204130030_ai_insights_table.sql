-- Migration: AI Insights Table for Admission CRM
-- Created: 2024-02-04
-- Description: Stores AI-generated insights for proactive CRM recommendations

-- Create enum for insight types
DO $$ BEGIN
  CREATE TYPE admission_insight_type AS ENUM (
    'follow_up_reminder',
    'conversion_opportunity',
    'engagement_alert',
    'trend_insight',
    'anomaly_detection',
    'recommendation',
    'performance_insight'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create enum for insight priority
DO $$ BEGIN
  CREATE TYPE admission_insight_priority AS ENUM (
    'critical',
    'high',
    'medium',
    'low'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create enum for action types
DO $$ BEGIN
  CREATE TYPE admission_insight_action AS ENUM (
    'contact_lead',
    'schedule_followup',
    'send_campaign',
    'assign_counselor',
    'review_leads',
    'update_strategy',
    'view_report',
    'no_action'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create the main AI insights table
CREATE TABLE IF NOT EXISTS admission_ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  -- Insight classification
  type admission_insight_type NOT NULL,
  priority admission_insight_priority NOT NULL DEFAULT 'medium',

  -- Content
  title TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Action
  action_type admission_insight_action NOT NULL DEFAULT 'no_action',
  action_data JSONB DEFAULT '{}',
  action_url TEXT,

  -- Related entities
  related_lead_ids UUID[] DEFAULT '{}',
  related_counselor_ids UUID[] DEFAULT '{}',

  -- Metrics
  metric_value NUMERIC,
  metric_change NUMERIC,
  metric_label TEXT,

  -- State
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID REFERENCES profiles(id),

  -- Validity
  expires_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ai_insights_institution
  ON admission_ai_insights(institution_id);

CREATE INDEX IF NOT EXISTS idx_ai_insights_type
  ON admission_ai_insights(insight_type);

CREATE INDEX IF NOT EXISTS idx_ai_insights_severity
  ON admission_ai_insights(severity);

CREATE INDEX IF NOT EXISTS idx_ai_insights_created
  ON admission_ai_insights(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_insights_active
  ON admission_ai_insights(institution_id, is_dismissed, expires_at)
  WHERE is_dismissed = false;

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_ai_insights_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ai_insights_updated_at ON admission_ai_insights;
CREATE TRIGGER trigger_ai_insights_updated_at
  BEFORE UPDATE ON admission_ai_insights
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_insights_updated_at();

-- Enable Row Level Security
ALTER TABLE admission_ai_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view insights for their institution
CREATE POLICY "Users can view institution insights"
  ON admission_ai_insights
  FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Users can update (dismiss) insights for their institution
CREATE POLICY "Users can update institution insights"
  ON admission_ai_insights
  FOR UPDATE
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Service role can insert insights
CREATE POLICY "Service role can insert insights"
  ON admission_ai_insights
  FOR INSERT
  WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE admission_ai_insights IS 'AI-generated insights for admission CRM with actionable recommendations';

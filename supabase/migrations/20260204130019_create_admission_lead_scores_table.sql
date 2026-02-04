-- Migration: Create Admission Lead Scores Table
-- Purpose: Store calculated lead scores with breakdown for the Lead Scoring Engine
-- Date: 2026-02-04

-- Create the admission_lead_scores table
CREATE TABLE IF NOT EXISTS admission_lead_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  -- Score values
  total_score INTEGER NOT NULL DEFAULT 0 CHECK (total_score >= 0 AND total_score <= 100),
  engagement_score INTEGER NOT NULL DEFAULT 0 CHECK (engagement_score >= 0 AND engagement_score <= 100),
  quality_score INTEGER NOT NULL DEFAULT 0 CHECK (quality_score >= 0 AND quality_score <= 100),

  -- Detailed breakdown stored as JSONB for flexibility
  score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example structure:
  -- {
  --   "engagement": {
  --     "Website Visit": { "occurrences": 5, "points": 25 },
  --     "Form Submitted": { "occurrences": 1, "points": 25 }
  --   },
  --   "quality": {
  --     "Academic Score (12th)": { "value": 85, "weighted_score": 17 },
  --     "Program Match": { "value": 100, "weighted_score": 15 }
  --   }
  -- }

  -- Factors contributing to score
  factors JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example structure:
  -- {
  --   "totalEngagementPoints": 50,
  --   "maxEngagementPoints": 100,
  --   "qualityWeightSum": 85,
  --   "totalQualityWeight": 100,
  --   "engagementWeight": 50,
  --   "qualityWeight": 50
  -- }

  -- Score category based on ranges
  score_category VARCHAR(50) NOT NULL DEFAULT 'Unknown',
  recommended_action TEXT,

  -- Scoring rule used
  scoring_rule_id UUID REFERENCES admission_scoring_rules(id) ON DELETE SET NULL,

  -- Timestamps
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- For score expiration/recalculation triggers
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure one score record per lead
  CONSTRAINT unique_lead_score UNIQUE (lead_id)
);

-- Add missing columns if table was created by earlier migration
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admission_lead_scores' AND column_name = 'engagement_score'
  ) THEN
    ALTER TABLE admission_lead_scores ADD COLUMN engagement_score INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admission_lead_scores' AND column_name = 'quality_score'
  ) THEN
    ALTER TABLE admission_lead_scores ADD COLUMN quality_score INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admission_lead_scores' AND column_name = 'factors'
  ) THEN
    ALTER TABLE admission_lead_scores ADD COLUMN factors JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admission_lead_scores' AND column_name = 'score_category'
  ) THEN
    ALTER TABLE admission_lead_scores ADD COLUMN score_category VARCHAR(50) NOT NULL DEFAULT 'Unknown';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admission_lead_scores' AND column_name = 'recommended_action'
  ) THEN
    ALTER TABLE admission_lead_scores ADD COLUMN recommended_action TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admission_lead_scores' AND column_name = 'scoring_rule_id'
  ) THEN
    ALTER TABLE admission_lead_scores ADD COLUMN scoring_rule_id UUID REFERENCES admission_scoring_rules(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admission_lead_scores' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE admission_lead_scores ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_lead_scores_institution ON admission_lead_scores(institution_id);
CREATE INDEX IF NOT EXISTS idx_lead_scores_total_score ON admission_lead_scores(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_lead_scores_category ON admission_lead_scores(score_category);
CREATE INDEX IF NOT EXISTS idx_lead_scores_calculated_at ON admission_lead_scores(calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_scores_expires_at ON admission_lead_scores(expires_at) WHERE expires_at IS NOT NULL;

-- Composite index for score range queries
CREATE INDEX IF NOT EXISTS idx_lead_scores_institution_score ON admission_lead_scores(institution_id, total_score DESC);

-- Enable RLS
ALTER TABLE admission_lead_scores ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow users to view scores for their institution
CREATE POLICY "Users can view lead scores for their institution"
  ON admission_lead_scores
  FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
    )
  );

-- Allow users to insert/update scores for their institution
CREATE POLICY "Users can manage lead scores for their institution"
  ON admission_lead_scores
  FOR ALL
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
    )
  );

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_lead_scores_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_lead_scores_updated_at
  BEFORE UPDATE ON admission_lead_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_scores_updated_at();

-- Add score column to admission_leads if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admission_leads' AND column_name = 'score'
  ) THEN
    ALTER TABLE admission_leads ADD COLUMN score INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admission_leads' AND column_name = 'score_category'
  ) THEN
    ALTER TABLE admission_leads ADD COLUMN score_category VARCHAR(50);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admission_leads' AND column_name = 'score_updated_at'
  ) THEN
    ALTER TABLE admission_leads ADD COLUMN score_updated_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create index on leads score for efficient filtering
CREATE INDEX IF NOT EXISTS idx_admission_leads_score ON admission_leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_admission_leads_score_category ON admission_leads(score_category);

COMMENT ON TABLE admission_lead_scores IS 'Stores calculated lead scores with detailed breakdown for the Lead Scoring Engine';
COMMENT ON COLUMN admission_lead_scores.total_score IS 'Combined weighted score (0-100)';
COMMENT ON COLUMN admission_lead_scores.engagement_score IS 'Score from engagement criteria (0-100)';
COMMENT ON COLUMN admission_lead_scores.quality_score IS 'Score from quality criteria (0-100)';
COMMENT ON COLUMN admission_lead_scores.score_breakdown IS 'Detailed breakdown of how each criterion contributed to the score';
COMMENT ON COLUMN admission_lead_scores.factors IS 'Raw factors used in score calculation';
COMMENT ON COLUMN admission_lead_scores.expires_at IS 'When the score should be recalculated';

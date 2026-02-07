-- ============================================================================
-- Alumni Outcomes Module
-- Tracks graduate outcomes and correlates with program effectiveness
-- Phase P4.1 - Accountability
-- Created: 2026-02-07
-- ============================================================================

-- Alumni Outcomes Table
CREATE TABLE IF NOT EXISTS alumni_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  learner_id UUID,
  name TEXT NOT NULL,
  graduation_year INTEGER NOT NULL,
  program_id UUID,
  department_id UUID,
  outcome_type TEXT NOT NULL DEFAULT 'employed', -- employed, higher_studies, entrepreneur, freelancer, unemployed, unknown
  company_name TEXT,
  job_title TEXT,
  industry TEXT,
  location TEXT,
  salary_range TEXT, -- anonymous: '3-5 LPA', '5-8 LPA', '8-12 LPA', '12+ LPA'
  is_core_domain BOOLEAN, -- job in same field as degree
  higher_study_institution TEXT,
  higher_study_program TEXT,
  startup_name TEXT,
  startup_industry TEXT,
  time_to_placement_days INTEGER,
  competencies_utilized TEXT[] DEFAULT '{}',
  satisfaction_score INTEGER, -- 1-10
  feedback TEXT,
  linkedin_url TEXT,
  verified BOOLEAN DEFAULT false,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  data_source TEXT DEFAULT 'self_reported', -- self_reported, verified, alumni_survey, linkedin
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Outcome Program Correlation Table
CREATE TABLE IF NOT EXISTS outcome_program_correlation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  program_id UUID NOT NULL,
  department_id UUID,
  academic_year TEXT NOT NULL, -- '2024-25'
  total_graduates INTEGER DEFAULT 0,
  placed_count INTEGER DEFAULT 0,
  higher_studies_count INTEGER DEFAULT 0,
  entrepreneur_count INTEGER DEFAULT 0,
  average_salary_lpa NUMERIC(10,2),
  median_salary_lpa NUMERIC(10,2),
  core_domain_percentage NUMERIC(5,2),
  average_time_to_placement_days INTEGER,
  top_recruiters TEXT[] DEFAULT '{}',
  top_competencies TEXT[] DEFAULT '{}',
  satisfaction_average NUMERIC(3,1),
  effectiveness_score NUMERIC(5,2), -- composite score
  computed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(program_id, academic_year)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_institution ON alumni_outcomes(institution_id);
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_program ON alumni_outcomes(program_id);
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_year ON alumni_outcomes(graduation_year);
CREATE INDEX IF NOT EXISTS idx_outcome_correlation_program ON outcome_program_correlation(program_id);
CREATE INDEX IF NOT EXISTS idx_outcome_correlation_year ON outcome_program_correlation(academic_year);

-- Enable RLS
ALTER TABLE alumni_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcome_program_correlation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON alumni_outcomes FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON outcome_program_correlation FOR ALL USING (auth.role() = 'authenticated');

-- Updated_at triggers
CREATE OR REPLACE TRIGGER update_alumni_outcomes_updated_at BEFORE UPDATE ON alumni_outcomes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_outcome_correlation_updated_at BEFORE UPDATE ON outcome_program_correlation FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

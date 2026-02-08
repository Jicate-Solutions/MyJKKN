-- Facilitator Development Module
-- P4.2: Track staff development journey from teacher to facilitator

CREATE TABLE IF NOT EXISTS facilitator_development (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  staff_id UUID NOT NULL,
  current_stage TEXT NOT NULL DEFAULT 'teacher', -- teacher, transitioning, facilitator, master_facilitator
  target_stage TEXT DEFAULT 'facilitator',
  development_plan JSONB DEFAULT '{}', -- goals, milestones, timeline
  competencies_acquired TEXT[] DEFAULT '{}',
  certifications JSONB DEFAULT '[]', -- [{name, issuer, date, url}]
  workshops_attended INTEGER DEFAULT 0,
  workshops_facilitated INTEGER DEFAULT 0,
  peer_observations_done INTEGER DEFAULT 0,
  peer_observations_received INTEGER DEFAULT 0,
  student_feedback_average NUMERIC(3,1),
  industry_exposure_hours INTEGER DEFAULT 0,
  outcome_score NUMERIC(5,2), -- composite development score 0-100
  mentor_id UUID, -- senior facilitator mentoring this person
  mentor_notes TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  stage_updated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active', -- active, paused, completed
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS facilitator_industry_immersion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  development_id UUID NOT NULL REFERENCES facilitator_development(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  industry TEXT,
  role_title TEXT,
  duration_days INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  objectives TEXT[] DEFAULT '{}',
  learnings TEXT,
  skills_acquired TEXT[] DEFAULT '{}',
  industry_contacts_made INTEGER DEFAULT 0,
  relevance_to_curriculum TEXT,
  evidence_url TEXT,
  rating INTEGER, -- 1-5 self-assessment
  supervisor_name TEXT,
  supervisor_feedback TEXT,
  status TEXT DEFAULT 'planned', -- planned, in_progress, completed, cancelled
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_facilitator_dev_institution ON facilitator_development(institution_id);
CREATE INDEX IF NOT EXISTS idx_facilitator_dev_staff ON facilitator_development(staff_id);
CREATE INDEX IF NOT EXISTS idx_facilitator_dev_stage ON facilitator_development(current_stage);
CREATE INDEX IF NOT EXISTS idx_facilitator_immersion_dev ON facilitator_industry_immersion(development_id);

-- Enable RLS
ALTER TABLE facilitator_development ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilitator_industry_immersion ENABLE ROW LEVEL SECURITY;

-- RLS Policies for facilitator_development
-- Users can only access records from their institution
CREATE POLICY "Users can view facilitator_development from their institution"
  ON facilitator_development FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      WHERE uia.user_id = auth.uid()
      AND uia.institution_id = facilitator_development.institution_id
    )
  );

CREATE POLICY "Users can create facilitator_development for their institution"
  ON facilitator_development FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      WHERE uia.user_id = auth.uid()
      AND uia.institution_id = facilitator_development.institution_id
    )
  );

CREATE POLICY "Users can update facilitator_development from their institution"
  ON facilitator_development FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      WHERE uia.user_id = auth.uid()
      AND uia.institution_id = facilitator_development.institution_id
    )
  );

CREATE POLICY "Users can delete facilitator_development from their institution"
  ON facilitator_development FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      WHERE uia.user_id = auth.uid()
      AND uia.institution_id = facilitator_development.institution_id
    )
  );

-- RLS Policies for facilitator_industry_immersion
-- Users can only access immersions linked to development records from their institution
CREATE POLICY "Users can view immersions from their institution"
  ON facilitator_industry_immersion FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM facilitator_development fd
      JOIN user_institution_access uia ON uia.institution_id = fd.institution_id
      WHERE fd.id = facilitator_industry_immersion.development_id
      AND uia.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create immersions for their institution"
  ON facilitator_industry_immersion FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM facilitator_development fd
      JOIN user_institution_access uia ON uia.institution_id = fd.institution_id
      WHERE fd.id = facilitator_industry_immersion.development_id
      AND uia.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update immersions from their institution"
  ON facilitator_industry_immersion FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM facilitator_development fd
      JOIN user_institution_access uia ON uia.institution_id = fd.institution_id
      WHERE fd.id = facilitator_industry_immersion.development_id
      AND uia.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete immersions from their institution"
  ON facilitator_industry_immersion FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM facilitator_development fd
      JOIN user_institution_access uia ON uia.institution_id = fd.institution_id
      WHERE fd.id = facilitator_industry_immersion.development_id
      AND uia.user_id = auth.uid()
    )
  );

-- Updated_at triggers
CREATE OR REPLACE TRIGGER update_facilitator_dev_updated_at BEFORE UPDATE ON facilitator_development FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_facilitator_immersion_updated_at BEFORE UPDATE ON facilitator_industry_immersion FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

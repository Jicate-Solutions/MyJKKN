-- Learning Path Module
-- P3.1: Personalized learning paths with competency targets and step tracking

CREATE TABLE IF NOT EXISTS learning_paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  learner_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_role TEXT,
  target_industry TEXT,
  target_competencies TEXT[] DEFAULT '{}',
  current_progress NUMERIC(5,2) DEFAULT 0, -- percentage 0-100
  status TEXT DEFAULT 'active', -- active, completed, paused, archived
  estimated_duration_weeks INTEGER,
  start_date DATE,
  target_completion_date DATE,
  completed_at TIMESTAMPTZ,
  created_by UUID,
  is_ai_generated BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS learning_path_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  step_type TEXT NOT NULL DEFAULT 'course', -- course, project, certification, workshop, self_study, industry_engagement
  resource_id UUID, -- FK to course/project/etc depending on type
  resource_type TEXT, -- 'course', 'industry_project', etc.
  target_competencies TEXT[] DEFAULT '{}',
  estimated_hours INTEGER,
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, skipped
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completion_evidence TEXT, -- URL or description
  score NUMERIC(5,2),
  mentor_notes TEXT,
  is_required BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(path_id, step_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_learning_paths_institution ON learning_paths(institution_id);
CREATE INDEX IF NOT EXISTS idx_learning_paths_learner ON learning_paths(learner_id);
CREATE INDEX IF NOT EXISTS idx_learning_paths_status ON learning_paths(status);
CREATE INDEX IF NOT EXISTS idx_learning_path_steps_path ON learning_path_steps(path_id);

-- Enable RLS
ALTER TABLE learning_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_path_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON learning_paths FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON learning_path_steps FOR ALL USING (auth.role() = 'authenticated');

-- Updated_at triggers
CREATE OR REPLACE TRIGGER update_learning_paths_updated_at BEFORE UPDATE ON learning_paths FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_learning_path_steps_updated_at BEFORE UPDATE ON learning_path_steps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

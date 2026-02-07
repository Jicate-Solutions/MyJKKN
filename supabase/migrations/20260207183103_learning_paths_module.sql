-- ============================================================================
-- Learning Paths Module
-- Created: 2026-02-07
-- Purpose: Track personalized learning paths for learners with step tracking
-- ============================================================================

-- Learning Paths table
CREATE TABLE IF NOT EXISTS learning_paths (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institutions(id),
  learner_id UUID NOT NULL REFERENCES learners_profiles(id),
  path_name TEXT NOT NULL,
  description TEXT,
  target_role TEXT,
  target_competencies JSONB DEFAULT '[]',
  estimated_duration_weeks INTEGER,
  progress_percentage NUMERIC(5,2) DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed', 'paused', 'archived')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Learning Path Steps table
CREATE TABLE IF NOT EXISTS learning_path_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  learning_path_id UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  step_type TEXT NOT NULL CHECK (step_type IN ('course', 'project', 'certification', 'internship', 'self_study', 'assessment')),
  title TEXT NOT NULL,
  description TEXT,
  resource_id UUID,
  resource_type TEXT,
  competency_id UUID,
  target_level TEXT CHECK (target_level IN ('novice', 'beginner', 'intermediate', 'advanced', 'expert')),
  estimated_hours INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  evidence_url TEXT,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE learning_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_path_steps ENABLE ROW LEVEL SECURITY;

-- RLS Policies for learning_paths
CREATE POLICY "learning_paths_select" ON learning_paths FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (role IN ('super_admin', 'admin') OR institution_id = learning_paths.institution_id)
  )
);

CREATE POLICY "learning_paths_insert" ON learning_paths FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (role IN ('super_admin', 'admin') OR institution_id = learning_paths.institution_id)
  )
);

CREATE POLICY "learning_paths_update" ON learning_paths FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (role IN ('super_admin', 'admin') OR institution_id = learning_paths.institution_id)
  )
);

CREATE POLICY "learning_paths_delete" ON learning_paths FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (role IN ('super_admin', 'admin') OR institution_id = learning_paths.institution_id)
  )
);

-- RLS Policies for learning_path_steps
CREATE POLICY "learning_path_steps_select" ON learning_path_steps FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM learning_paths lp
    JOIN profiles p ON p.id = auth.uid()
    WHERE lp.id = learning_path_steps.learning_path_id
    AND (p.role IN ('super_admin', 'admin') OR p.institution_id = lp.institution_id)
  )
);

CREATE POLICY "learning_path_steps_insert" ON learning_path_steps FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM learning_paths lp
    JOIN profiles p ON p.id = auth.uid()
    WHERE lp.id = learning_path_steps.learning_path_id
    AND (p.role IN ('super_admin', 'admin') OR p.institution_id = lp.institution_id)
  )
);

CREATE POLICY "learning_path_steps_update" ON learning_path_steps FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM learning_paths lp
    JOIN profiles p ON p.id = auth.uid()
    WHERE lp.id = learning_path_steps.learning_path_id
    AND (p.role IN ('super_admin', 'admin') OR p.institution_id = lp.institution_id)
  )
);

CREATE POLICY "learning_path_steps_delete" ON learning_path_steps FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM learning_paths lp
    JOIN profiles p ON p.id = auth.uid()
    WHERE lp.id = learning_path_steps.learning_path_id
    AND (p.role IN ('super_admin', 'admin') OR p.institution_id = lp.institution_id)
  )
);

-- Indexes
CREATE INDEX idx_learning_paths_learner ON learning_paths(learner_id);
CREATE INDEX idx_learning_paths_institution ON learning_paths(institution_id);
CREATE INDEX idx_learning_paths_status ON learning_paths(status);
CREATE INDEX idx_learning_path_steps_path ON learning_path_steps(learning_path_id);
CREATE INDEX idx_learning_path_steps_order ON learning_path_steps(learning_path_id, step_order);

-- Triggers for updated_at
CREATE TRIGGER update_learning_paths_updated_at
  BEFORE UPDATE ON learning_paths
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_learning_path_steps_updated_at
  BEFORE UPDATE ON learning_path_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

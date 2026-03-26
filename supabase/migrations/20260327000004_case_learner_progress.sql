-- 20260327000004_case_learner_progress.sql
-- Tracks each Learner's overall CASE journey

CREATE TABLE IF NOT EXISTS case_learner_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  programme_id UUID NOT NULL REFERENCES programs(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  admission_semester INT NOT NULL DEFAULT 1,
  current_semester INT NOT NULL DEFAULT 1,
  tracks_completed INT DEFAULT 0,
  total_hours_completed NUMERIC DEFAULT 0,
  graduation_ready BOOLEAN DEFAULT false,
  estimated_exam_date DATE,
  risk_level TEXT DEFAULT 'on_track' CHECK (risk_level IN ('on_track', 'at_risk', 'critical', 'overdue', 'completed')),
  last_alert_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE case_learner_progress ENABLE ROW LEVEL SECURITY;

-- Learners see their own progress
CREATE POLICY "case_progress_own" ON case_learner_progress FOR SELECT USING (auth.uid() = user_id);
-- Admin/faculty see all
CREATE POLICY "case_progress_admin_read" ON case_learner_progress FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('administrator', 'super_admin', 'faculty', 'hod', 'staff'))
);
-- Admin can update
CREATE POLICY "case_progress_admin_write" ON case_learner_progress FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('administrator', 'super_admin'))
);

CREATE INDEX idx_case_progress_user ON case_learner_progress(user_id);
CREATE INDEX idx_case_progress_institution ON case_learner_progress(institution_id);
CREATE INDEX idx_case_progress_risk ON case_learner_progress(risk_level);

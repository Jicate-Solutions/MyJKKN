-- 20260327000005_case_track_enrollments.sql
-- Per-track enrollment with triple gate completion

CREATE TABLE IF NOT EXISTS case_track_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES case_tracks(id),
  course_id UUID REFERENCES vac_courses(id),
  batch_id UUID, -- FK added after case_batches table created
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'in_progress', 'completed', 'incomplete', 'retry')),
  -- Triple gate
  attendance_percentage NUMERIC DEFAULT 0,
  grader_score_average NUMERIC DEFAULT 0,
  project_submitted BOOLEAN DEFAULT false,
  project_score NUMERIC,
  completion_gate_attendance BOOLEAN DEFAULT false,
  completion_gate_grader BOOLEAN DEFAULT false,
  completion_gate_project BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  retry_count INT DEFAULT 0,
  previous_enrollment_id UUID REFERENCES case_track_enrollments(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Prerequisite enforcement trigger
CREATE OR REPLACE FUNCTION check_case_track_prerequisite()
RETURNS TRIGGER AS $$
DECLARE
  prereq_track_id UUID;
  prereq_completed BOOLEAN;
BEGIN
  SELECT prerequisite_track_id INTO prereq_track_id
  FROM case_tracks WHERE id = NEW.track_id;

  IF prereq_track_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM case_track_enrollments
    WHERE user_id = NEW.user_id
    AND track_id = prereq_track_id
    AND status = 'completed'
  ) INTO prereq_completed;

  IF NOT prereq_completed THEN
    RAISE EXCEPTION 'Prerequisite track not completed. Complete the previous track first.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_case_track_prerequisite
  BEFORE INSERT ON case_track_enrollments
  FOR EACH ROW EXECUTE FUNCTION check_case_track_prerequisite();

-- Auto-update learner progress when track completed
CREATE OR REPLACE FUNCTION update_case_learner_progress()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE case_learner_progress
    SET
      tracks_completed = (
        SELECT COUNT(*) FROM case_track_enrollments
        WHERE user_id = NEW.user_id AND status = 'completed'
      ),
      total_hours_completed = (
        SELECT COALESCE(SUM(ct.duration_hours), 0)
        FROM case_track_enrollments cte
        JOIN case_tracks ct ON cte.track_id = ct.id
        WHERE cte.user_id = NEW.user_id AND cte.status = 'completed'
      ),
      graduation_ready = (
        SELECT COUNT(*) >= 6 FROM case_track_enrollments
        WHERE user_id = NEW.user_id AND status = 'completed'
      ),
      risk_level = CASE
        WHEN (SELECT COUNT(*) FROM case_track_enrollments WHERE user_id = NEW.user_id AND status = 'completed') >= 6
        THEN 'completed'
        ELSE risk_level
      END,
      updated_at = now()
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_progress_on_completion
  AFTER UPDATE ON case_track_enrollments
  FOR EACH ROW EXECUTE FUNCTION update_case_learner_progress();

ALTER TABLE case_track_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_enrollments_own" ON case_track_enrollments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "case_enrollments_admin_read" ON case_track_enrollments FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('administrator', 'super_admin', 'faculty', 'hod', 'staff'))
);
CREATE POLICY "case_enrollments_admin_write" ON case_track_enrollments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('administrator', 'super_admin'))
);

CREATE INDEX idx_case_enrollments_user ON case_track_enrollments(user_id);
CREATE INDEX idx_case_enrollments_track ON case_track_enrollments(track_id);
CREATE INDEX idx_case_enrollments_status ON case_track_enrollments(status);
CREATE INDEX idx_case_enrollments_batch ON case_track_enrollments(batch_id);

-- 20260327000003_case_graduation_requirements.sql
-- Per-programme graduation configuration

CREATE TABLE IF NOT EXISTS case_graduation_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id UUID NOT NULL REFERENCES programs(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  total_tracks_required INT DEFAULT 6,
  total_hours_required INT DEFAULT 180,
  programme_duration_semesters INT NOT NULL,
  enforcement_days_before_exam INT DEFAULT 25,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(programme_id, institution_id)
);

ALTER TABLE case_graduation_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_grad_req_read_all" ON case_graduation_requirements FOR SELECT USING (true);
CREATE POLICY "case_grad_req_admin_write" ON case_graduation_requirements FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('administrator', 'super_admin'))
);

-- 20260327000006_case_batches.sql
-- Batch scheduling for CASE tracks

CREATE TABLE IF NOT EXISTS case_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES case_tracks(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  batch_code TEXT NOT NULL,
  delivery_format TEXT DEFAULT 'moderate' CHECK (delivery_format IN ('spread', 'moderate', 'intensive', 'custom')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  schedule_json JSONB,
  max_capacity INT DEFAULT 60,
  current_enrollment INT DEFAULT 0,
  facilitator_id UUID,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  is_auto_suggested BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add FK from case_track_enrollments to case_batches
ALTER TABLE case_track_enrollments
  ADD CONSTRAINT fk_case_enrollment_batch
  FOREIGN KEY (batch_id) REFERENCES case_batches(id);

ALTER TABLE case_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_batches_read_all" ON case_batches FOR SELECT USING (true);
CREATE POLICY "case_batches_admin_write" ON case_batches FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('administrator', 'super_admin'))
);

CREATE INDEX idx_case_batches_track ON case_batches(track_id);
CREATE INDEX idx_case_batches_institution ON case_batches(institution_id);
CREATE INDEX idx_case_batches_status ON case_batches(status);

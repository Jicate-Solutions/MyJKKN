-- ============================================================================
-- GD-PI (Group Discussion & Personal Interview) Tables
-- Part of the Admission module for JKKN Institutions
-- ============================================================================

-- GD-PI Sessions
CREATE TABLE IF NOT EXISTS admission_gdpi_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('gd', 'pi')),
  title TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  venue TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  topic TEXT, -- GD topic
  max_candidates INTEGER DEFAULT 10,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Evaluators assigned to sessions
CREATE TABLE IF NOT EXISTS admission_gdpi_evaluators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES admission_gdpi_sessions(id) ON DELETE CASCADE,
  evaluator_id UUID NOT NULL REFERENCES profiles(id),
  role TEXT DEFAULT 'evaluator' CHECK (role IN ('lead', 'evaluator', 'observer')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, evaluator_id)
);

-- Candidates in sessions
CREATE TABLE IF NOT EXISTS admission_gdpi_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES admission_gdpi_sessions(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'present', 'absent', 'evaluated')),
  overall_score NUMERIC(4,1),
  recommendation TEXT CHECK (recommendation IN ('strong_accept', 'accept', 'waitlist', 'reject')),
  evaluator_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, lead_id)
);

-- Scoring rubrics
CREATE TABLE IF NOT EXISTS admission_gdpi_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES admission_gdpi_candidates(id) ON DELETE CASCADE,
  evaluator_id UUID NOT NULL REFERENCES profiles(id),
  criterion TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 10),
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(candidate_id, evaluator_id, criterion)
);

-- RLS
ALTER TABLE admission_gdpi_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_gdpi_evaluators ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_gdpi_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_gdpi_scores ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated users can read/write within their institution
CREATE POLICY "gdpi_sessions_select" ON admission_gdpi_sessions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "gdpi_sessions_insert" ON admission_gdpi_sessions
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "gdpi_sessions_update" ON admission_gdpi_sessions
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "gdpi_sessions_delete" ON admission_gdpi_sessions
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "gdpi_evaluators_select" ON admission_gdpi_evaluators
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "gdpi_evaluators_insert" ON admission_gdpi_evaluators
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "gdpi_evaluators_delete" ON admission_gdpi_evaluators
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "gdpi_candidates_select" ON admission_gdpi_candidates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "gdpi_candidates_insert" ON admission_gdpi_candidates
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "gdpi_candidates_update" ON admission_gdpi_candidates
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "gdpi_candidates_delete" ON admission_gdpi_candidates
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "gdpi_scores_select" ON admission_gdpi_scores
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "gdpi_scores_insert" ON admission_gdpi_scores
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "gdpi_scores_update" ON admission_gdpi_scores
  FOR UPDATE TO authenticated USING (true);

-- Indexes
CREATE INDEX idx_gdpi_sessions_institution ON admission_gdpi_sessions(institution_id);
CREATE INDEX idx_gdpi_sessions_scheduled ON admission_gdpi_sessions(scheduled_at);
CREATE INDEX idx_gdpi_sessions_status ON admission_gdpi_sessions(status);
CREATE INDEX idx_gdpi_sessions_type ON admission_gdpi_sessions(type);
CREATE INDEX idx_gdpi_candidates_session ON admission_gdpi_candidates(session_id);
CREATE INDEX idx_gdpi_candidates_lead ON admission_gdpi_candidates(lead_id);
CREATE INDEX idx_gdpi_scores_candidate ON admission_gdpi_scores(candidate_id);
CREATE INDEX idx_gdpi_evaluators_session ON admission_gdpi_evaluators(session_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_gdpi_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_gdpi_sessions_updated_at
  BEFORE UPDATE ON admission_gdpi_sessions
  FOR EACH ROW EXECUTE FUNCTION update_gdpi_updated_at();

CREATE TRIGGER trg_gdpi_candidates_updated_at
  BEFORE UPDATE ON admission_gdpi_candidates
  FOR EACH ROW EXECUTE FUNCTION update_gdpi_updated_at();

-- 20260327000001_case_tracks.sql
-- CASE Graduation Tracker: Track definitions

CREATE TABLE IF NOT EXISTS case_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_code TEXT UNIQUE NOT NULL,
  track_name TEXT NOT NULL,
  track_type TEXT NOT NULL CHECK (track_type IN ('ai_mastery', 'human_excellence')),
  sequence_order INT NOT NULL,
  prerequisite_track_id UUID REFERENCES case_tracks(id),
  duration_hours INT NOT NULL DEFAULT 30,
  description TEXT,
  completion_attendance_threshold NUMERIC DEFAULT 0.75,
  completion_grader_threshold NUMERIC DEFAULT 0.80,
  completion_project_required BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed the 6 tracks
INSERT INTO case_tracks (track_code, track_name, track_type, sequence_order, description) VALUES
  ('AI-1', 'AI Fluency', 'ai_mastery', 1, 'Prompt engineering, no-code AI, Copilot basics, AI ethics. 30 hours.'),
  ('AI-2', 'MATLAB Domain Applications', 'ai_mastery', 2, 'Domain-specific computational solutions using MATLAB. 86 programme-specific courses. 30 hours.'),
  ('AI-3', 'Cross-Functional AI Innovation', 'ai_mastery', 3, 'Team projects across departments, multi-disciplinary AI prototypes. 30 hours.'),
  ('AI-4', 'AI Capstone + Industry Deployment', 'ai_mastery', 4, 'Production-ready solutions, Solutions Hub graduation, JICATE pipeline. 30 hours.'),
  ('H-1', 'Personal Branding & Communication', 'human_excellence', 1, 'Personal brand, digital presence, verbal/non-verbal communication. 30 hours.'),
  ('H-2', 'Leadership & Negotiation', 'human_excellence', 2, 'Advanced communication, conflict resolution, team leadership, public speaking. 30 hours.');

-- Set prerequisites: AI-1 -> AI-2 -> AI-3 -> AI-4, H-1 -> H-2
UPDATE case_tracks SET prerequisite_track_id = (SELECT id FROM case_tracks WHERE track_code = 'AI-1') WHERE track_code = 'AI-2';
UPDATE case_tracks SET prerequisite_track_id = (SELECT id FROM case_tracks WHERE track_code = 'AI-2') WHERE track_code = 'AI-3';
UPDATE case_tracks SET prerequisite_track_id = (SELECT id FROM case_tracks WHERE track_code = 'AI-3') WHERE track_code = 'AI-4';
UPDATE case_tracks SET prerequisite_track_id = (SELECT id FROM case_tracks WHERE track_code = 'H-1') WHERE track_code = 'H-2';

-- Enable RLS
ALTER TABLE case_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_tracks_read_all" ON case_tracks FOR SELECT USING (true);
CREATE POLICY "case_tracks_admin_write" ON case_tracks FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('administrator', 'super_admin'))
);

-- Index
CREATE INDEX idx_case_tracks_code ON case_tracks(track_code);
CREATE INDEX idx_case_tracks_type ON case_tracks(track_type);

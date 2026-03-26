-- 20260327000002_case_track_courses.sql
-- Links CASE tracks to specific VAC courses per programme

CREATE TABLE IF NOT EXISTS case_track_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES case_tracks(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES vac_courses(id) ON DELETE CASCADE,
  programme_id UUID REFERENCES programs(id),
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(track_id, course_id)
);

ALTER TABLE case_track_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_track_courses_read_all" ON case_track_courses FOR SELECT USING (true);
CREATE POLICY "case_track_courses_admin_write" ON case_track_courses FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('administrator', 'super_admin'))
);

CREATE INDEX idx_case_track_courses_track ON case_track_courses(track_id);
CREATE INDEX idx_case_track_courses_course ON case_track_courses(course_id);
CREATE INDEX idx_case_track_courses_programme ON case_track_courses(programme_id);

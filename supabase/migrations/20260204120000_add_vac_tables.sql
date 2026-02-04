-- VAC (Value-Added Courses) Database Schema
-- JKKN Institutions - VAC Module for MyJKKN

-- ============================================
-- Table: vac_courses
-- Stores course definitions (e.g., CSE-MATLAB)
-- ============================================
CREATE TABLE IF NOT EXISTS vac_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,           -- e.g., "CSE-MATLAB"
  name VARCHAR(255) NOT NULL,                  -- e.g., "MATLAB for Computer Science & Engineering"
  description TEXT,
  institution VARCHAR(100) NOT NULL,           -- e.g., "Engineering", "Pharmacy"
  track VARCHAR(50) DEFAULT 'general',         -- 'ai', 'matlab', 'general'
  duration_hours INTEGER NOT NULL DEFAULT 30,
  weeks INTEGER NOT NULL DEFAULT 3,
  fee DECIMAL(10, 2) NOT NULL DEFAULT 500.00,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: vac_lessons
-- Stores individual lesson content
-- ============================================
CREATE TABLE IF NOT EXISTS vac_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES vac_courses(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,                       -- Week number (1, 2, 3, etc.)
  hour INTEGER NOT NULL,                       -- Hour number within course (1-30)
  title VARCHAR(255) NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  prerequisites TEXT,
  toolboxes TEXT,                              -- Required MATLAB toolboxes

  -- Content stored as JSONB for flexibility and editability
  learning_outcomes JSONB DEFAULT '[]'::jsonb,
  faculty_script JSONB DEFAULT '[]'::jsonb,
  student_content JSONB DEFAULT '[]'::jsonb,
  exercises JSONB DEFAULT '[]'::jsonb,
  gemini_prompts JSONB DEFAULT '[]'::jsonb,
  error_troubleshooting JSONB DEFAULT '[]'::jsonb,
  interview_questions JSONB DEFAULT '[]'::jsonb,
  resources JSONB DEFAULT '[]'::jsonb,
  self_check JSONB DEFAULT '[]'::jsonb,

  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique hour per course
  UNIQUE(course_id, hour)
);

-- ============================================
-- Table: vac_learner_progress
-- Tracks learner progress through courses
-- ============================================
CREATE TABLE IF NOT EXISTS vac_learner_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,                       -- References auth.users
  course_id UUID NOT NULL REFERENCES vac_courses(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES vac_lessons(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'not_started',
  completed_at TIMESTAMPTZ,
  score DECIMAL(5, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One progress entry per user per lesson
  UNIQUE(user_id, lesson_id),

  CONSTRAINT vac_valid_status CHECK (status IN ('not_started', 'in_progress', 'completed'))
);

-- ============================================
-- Indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_vac_lessons_course ON vac_lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_vac_lessons_week_hour ON vac_lessons(course_id, week, hour);
CREATE INDEX IF NOT EXISTS idx_vac_progress_user ON vac_learner_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_vac_progress_course ON vac_learner_progress(course_id);
CREATE INDEX IF NOT EXISTS idx_vac_courses_institution ON vac_courses(institution);
CREATE INDEX IF NOT EXISTS idx_vac_courses_active ON vac_courses(is_active);
CREATE INDEX IF NOT EXISTS idx_vac_courses_track ON vac_courses(track);

-- ============================================
-- Triggers for updated_at (using existing function)
-- ============================================
CREATE TRIGGER update_vac_courses_updated_at
  BEFORE UPDATE ON vac_courses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vac_lessons_updated_at
  BEFORE UPDATE ON vac_lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vac_learner_progress_updated_at
  BEFORE UPDATE ON vac_learner_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Row Level Security (RLS) Policies
-- ============================================

-- Enable RLS
ALTER TABLE vac_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE vac_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE vac_learner_progress ENABLE ROW LEVEL SECURITY;

-- Courses: Public read for active courses
CREATE POLICY "vac_courses_select_active"
  ON vac_courses FOR SELECT
  USING (is_active = true);

CREATE POLICY "vac_courses_all_authenticated"
  ON vac_courses FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Lessons: Public read for published lessons
CREATE POLICY "vac_lessons_select_published"
  ON vac_lessons FOR SELECT
  USING (is_published = true);

CREATE POLICY "vac_lessons_all_authenticated"
  ON vac_lessons FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Progress: Users can manage their own progress
CREATE POLICY "vac_progress_select_own"
  ON vac_learner_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "vac_progress_insert_own"
  ON vac_learner_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "vac_progress_update_own"
  ON vac_learner_progress FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- Initial seed data: CSE-MATLAB course
-- ============================================
INSERT INTO vac_courses (code, name, description, institution, track, duration_hours, weeks, fee, is_active)
VALUES (
  'CSE-MATLAB',
  'MATLAB for Computer Science & Engineering',
  'A comprehensive 30-hour course covering MATLAB fundamentals, advanced applications, and portfolio project development. Week 1 covers foundations, Week 2 covers applications, and Week 3 focuses on a portfolio project.',
  'Engineering',
  'matlab',
  30,
  3,
  500.00,
  true
) ON CONFLICT (code) DO NOTHING;

-- ============================================
-- Comments for documentation
-- ============================================
COMMENT ON TABLE vac_courses IS 'Value-Added Courses offered by JKKN Institutions';
COMMENT ON TABLE vac_lessons IS 'Individual lessons within VAC courses, with JSONB content for flexibility';
COMMENT ON TABLE vac_learner_progress IS 'Tracks learner progress through VAC courses';

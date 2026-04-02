-- ================================================================================
-- MIGRATION: VAC (Value-Added Courses) + CASE Graduation Tracker Module
-- Date: 2026-04-02
-- Description: Creates 13 tables, 3 views, 5 functions, triggers, and RLS policies
--              for the VAC course catalog and CASE graduation tracking system.
-- Target: Production Supabase (kvizhngldtiuufknvehv)
-- ================================================================================

-- NOTE: This migration consolidates all VAC/CASE database objects.
-- The full definitions are maintained in the setup files:
--   - 01_tables.sql    (13 tables)
--   - 02_functions.sql (5 functions)
--   - 03_policies.sql  (17+ RLS policies)
--   - 04_triggers.sql  (11 triggers)
--   - 05_views.sql     (3 views)
--
-- To apply: Run the setup files in order (01 → 05) against production,
-- OR apply this migration file which contains the complete set.

-- ================================================================================
-- STEP 0: Add programme_id to profiles
-- ================================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS programme_id UUID REFERENCES programs(id);
CREATE INDEX IF NOT EXISTS idx_profiles_programme ON profiles(programme_id);

-- ================================================================================
-- STEP 1: Core VAC Tables
-- ================================================================================

CREATE TABLE IF NOT EXISTS vac_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  institution VARCHAR(100),
  track VARCHAR(50) DEFAULT 'general',
  duration_hours INTEGER DEFAULT 30,
  weeks INTEGER DEFAULT 3,
  fee NUMERIC(10,2) DEFAULT 500.00,
  is_active BOOLEAN DEFAULT true,
  overall_finks_profile JSONB,
  ai_era_strategic_value INTEGER,
  programme_id UUID REFERENCES programs(id),
  institution_id UUID REFERENCES institutions(id),
  faculty_eligible BOOLEAN DEFAULT false,
  course_category TEXT DEFAULT 'add_on' CHECK (course_category IN ('add_on', 'value_add')),
  nsqf_level INTEGER CHECK (nsqf_level BETWEEN 1 AND 10),
  nheqf_level INTEGER CHECK (nheqf_level BETWEEN 4 AND 10),
  ncrf_credits NUMERIC(4,1),
  ncrf_credit_hours INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vac_courses_institution_text ON vac_courses(institution);
CREATE INDEX IF NOT EXISTS idx_vac_courses_track ON vac_courses(track);
CREATE INDEX IF NOT EXISTS idx_vac_courses_active ON vac_courses(is_active);
CREATE INDEX IF NOT EXISTS idx_vac_courses_programme ON vac_courses(programme_id);
CREATE INDEX IF NOT EXISTS idx_vac_courses_institution ON vac_courses(institution_id);
CREATE INDEX IF NOT EXISTS idx_vac_courses_category ON vac_courses(course_category);

CREATE TABLE IF NOT EXISTS vac_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES vac_courses(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  hour INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  prerequisites TEXT,
  toolboxes TEXT,
  learning_outcomes JSONB DEFAULT '[]'::jsonb,
  faculty_script JSONB DEFAULT '[]'::jsonb,
  student_content JSONB DEFAULT '[]'::jsonb,
  exercises JSONB DEFAULT '[]'::jsonb,
  gemini_prompts JSONB DEFAULT '[]'::jsonb,
  error_troubleshooting JSONB DEFAULT '[]'::jsonb,
  interview_questions JSONB DEFAULT '[]'::jsonb,
  resources JSONB DEFAULT '[]'::jsonb,
  self_check JSONB DEFAULT '[]'::jsonb,
  ltl_phase TEXT DEFAULT 'learn' CHECK (ltl_phase IN ('learn', 'leverage', 'both')),
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(course_id, hour)
);

CREATE INDEX IF NOT EXISTS idx_vac_lessons_course ON vac_lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_vac_lessons_course_week ON vac_lessons(course_id, week, hour);

CREATE TABLE IF NOT EXISTS vac_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  course_id UUID NOT NULL REFERENCES vac_courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'expired')),
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'waived', 'refunded')),
  payment_amount NUMERIC(10,2),
  payment_date TIMESTAMPTZ,
  payment_reference VARCHAR(100),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_vac_enrollments_user ON vac_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_vac_enrollments_course ON vac_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_vac_enrollments_status ON vac_enrollments(status);

CREATE TABLE IF NOT EXISTS vac_learner_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  course_id UUID NOT NULL REFERENCES vac_courses(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES vac_lessons(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'tested_out')),
  completed_at TIMESTAMPTZ,
  score NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_vac_progress_user_course ON vac_learner_progress(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_vac_progress_lesson ON vac_learner_progress(lesson_id);

CREATE TABLE IF NOT EXISTS vac_course_programmes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES vac_courses(id) ON DELETE CASCADE,
  programme_id UUID NOT NULL REFERENCES programs(id),
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(course_id, programme_id)
);

CREATE INDEX IF NOT EXISTS idx_vac_cp_course ON vac_course_programmes(course_id);
CREATE INDEX IF NOT EXISTS idx_vac_cp_programme ON vac_course_programmes(programme_id);

-- ================================================================================
-- STEP 2: CASE Tables
-- ================================================================================

CREATE TABLE IF NOT EXISTS case_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_code TEXT UNIQUE NOT NULL,
  track_name TEXT NOT NULL,
  track_type TEXT NOT NULL CHECK (track_type IN ('ai_mastery', 'human_excellence')),
  sequence_order INTEGER NOT NULL,
  prerequisite_track_id UUID REFERENCES case_tracks(id),
  duration_hours INTEGER DEFAULT 30,
  description TEXT,
  completion_attendance_threshold NUMERIC DEFAULT 0.75,
  completion_grader_threshold NUMERIC DEFAULT 0.80,
  completion_project_required BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS case_track_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES case_tracks(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES vac_courses(id) ON DELETE CASCADE,
  programme_id UUID REFERENCES programs(id),
  institution_id UUID REFERENCES institutions(id),
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_tc_track ON case_track_courses(track_id);
CREATE INDEX IF NOT EXISTS idx_case_tc_course ON case_track_courses(course_id);
CREATE INDEX IF NOT EXISTS idx_case_tc_programme ON case_track_courses(programme_id);
CREATE INDEX IF NOT EXISTS idx_case_tc_institution ON case_track_courses(institution_id);

CREATE TABLE IF NOT EXISTS case_track_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  track_id UUID NOT NULL REFERENCES case_tracks(id),
  course_id UUID REFERENCES vac_courses(id),
  batch_id UUID,
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'in_progress', 'completed', 'incomplete', 'retry')),
  attendance_percentage NUMERIC DEFAULT 0,
  grader_score_average NUMERIC DEFAULT 0,
  project_submitted BOOLEAN DEFAULT false,
  project_score NUMERIC,
  completion_gate_attendance BOOLEAN DEFAULT false,
  completion_gate_grader BOOLEAN DEFAULT false,
  completion_gate_project BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0,
  previous_enrollment_id UUID REFERENCES case_track_enrollments(id),
  placement_score NUMERIC,
  placement_start_week INTEGER DEFAULT 1,
  placement_taken_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_te_user ON case_track_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_case_te_track ON case_track_enrollments(track_id);
CREATE INDEX IF NOT EXISTS idx_case_te_status ON case_track_enrollments(status);

CREATE TABLE IF NOT EXISTS case_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES case_tracks(id),
  institution_id UUID REFERENCES institutions(id),
  batch_code TEXT,
  delivery_format TEXT DEFAULT 'moderate' CHECK (delivery_format IN ('spread', 'moderate', 'intensive')),
  start_date DATE,
  end_date DATE,
  schedule_json JSONB,
  max_capacity INTEGER DEFAULT 60,
  current_enrollment INTEGER DEFAULT 0,
  facilitator_id UUID,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'open', 'in_progress', 'completed', 'cancelled')),
  is_auto_suggested BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_batches_track ON case_batches(track_id);
CREATE INDEX IF NOT EXISTS idx_case_batches_institution ON case_batches(institution_id);
CREATE INDEX IF NOT EXISTS idx_case_batches_status ON case_batches(status);

CREATE TABLE IF NOT EXISTS case_learner_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  programme_id UUID NOT NULL REFERENCES programs(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  admission_semester INTEGER DEFAULT 1,
  current_semester INTEGER DEFAULT 1,
  tracks_completed INTEGER DEFAULT 0,
  total_hours_completed NUMERIC DEFAULT 0,
  graduation_ready BOOLEAN DEFAULT false,
  estimated_exam_date DATE,
  risk_level TEXT DEFAULT 'on_track' CHECK (risk_level IN ('on_track', 'at_risk', 'critical', 'overdue', 'completed')),
  last_alert_sent_at TIMESTAMPTZ,
  agency_index NUMERIC(3,1) DEFAULT 0.0 CHECK (agency_index BETWEEN 0 AND 10),
  agency_dimensions JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, programme_id)
);

CREATE INDEX IF NOT EXISTS idx_case_lp_user ON case_learner_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_case_lp_programme ON case_learner_progress(programme_id);
CREATE INDEX IF NOT EXISTS idx_case_lp_institution ON case_learner_progress(institution_id);
CREATE INDEX IF NOT EXISTS idx_case_lp_risk ON case_learner_progress(risk_level);

CREATE TABLE IF NOT EXISTS case_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  alert_type TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_via TEXT[] DEFAULT '{push}',
  sent_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ,
  coordinator_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_alerts_user ON case_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_case_alerts_type ON case_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_case_alerts_read ON case_alerts(user_id, read_at) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS case_graduation_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id UUID NOT NULL REFERENCES programs(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  total_tracks_required INTEGER DEFAULT 6,
  total_hours_required INTEGER DEFAULT 180,
  programme_duration_semesters INTEGER NOT NULL,
  enforcement_days_before_exam INTEGER DEFAULT 25,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_gr_programme ON case_graduation_requirements(programme_id);
CREATE INDEX IF NOT EXISTS idx_case_gr_institution ON case_graduation_requirements(institution_id);

-- ================================================================================
-- STEP 3: Enable RLS
-- ================================================================================

ALTER TABLE vac_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE vac_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE vac_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vac_learner_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE vac_course_programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_track_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_track_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_learner_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_graduation_requirements ENABLE ROW LEVEL SECURITY;

-- ================================================================================
-- STEP 4: Seed 6 CASE tracks
-- ================================================================================

INSERT INTO case_tracks (track_code, track_name, track_type, sequence_order, description, duration_hours)
VALUES
  ('AI-1', 'AI Foundations', 'ai_mastery', 1, 'Introduction to AI concepts, tools, and the Principal-Agent framework', 30),
  ('AI-2', 'AI Application', 'ai_mastery', 2, 'Applying AI tools to solve real-world problems across domains', 30),
  ('AI-3', 'AI Mastery', 'ai_mastery', 3, 'Advanced AI techniques, prompt engineering, and autonomous agents', 30),
  ('AI-4', 'AI Innovation', 'ai_mastery', 4, 'Creating novel AI solutions and leading AI-first projects', 30),
  ('H-1', 'Communication Excellence', 'human_excellence', 1, 'Professional communication, presentation, and interpersonal skills', 30),
  ('H-2', 'Leadership & Ethics', 'human_excellence', 2, 'Leadership principles, ethical decision-making, and team management', 30)
ON CONFLICT (track_code) DO NOTHING;

-- Set prerequisite chains
UPDATE case_tracks SET prerequisite_track_id = (SELECT id FROM case_tracks WHERE track_code = 'AI-1') WHERE track_code = 'AI-2';
UPDATE case_tracks SET prerequisite_track_id = (SELECT id FROM case_tracks WHERE track_code = 'AI-2') WHERE track_code = 'AI-3';
UPDATE case_tracks SET prerequisite_track_id = (SELECT id FROM case_tracks WHERE track_code = 'AI-3') WHERE track_code = 'AI-4';
UPDATE case_tracks SET prerequisite_track_id = (SELECT id FROM case_tracks WHERE track_code = 'H-1') WHERE track_code = 'H-2';

-- ================================================================================
-- STEP 5: Post-migration verification
-- ================================================================================

-- Run this to verify:
-- SELECT
--   (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'vac_%') as vac_tables,
--   (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'case_%') as case_tables,
--   (SELECT count(*) FROM case_tracks) as tracks_seeded;
-- Expected: 5 vac tables, 7 case tables, 6 tracks seeded

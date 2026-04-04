# VAC Module — Production Migration Guide

**Target:** Production Supabase `kvizhngldtiuufknvehv`
**Source:** Staging Supabase `hhprjbgknupaplivtoib`

## Pre-Migration Checklist

- [ ] Backup production database
- [ ] Verify production Supabase access
- [ ] Have staging data export ready for seed data

## Step 1: Core VAC Tables

Run in Supabase SQL Editor on **production**:

```sql
-- vac_courses
CREATE TABLE IF NOT EXISTS vac_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
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

-- vac_lessons
CREATE TABLE IF NOT EXISTS vac_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES vac_courses(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  hour INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  prerequisites TEXT,
  toolboxes TEXT,
  learning_outcomes JSONB,
  faculty_script JSONB,
  student_content JSONB,
  exercises JSONB,
  gemini_prompts JSONB,
  error_troubleshooting JSONB,
  interview_questions JSONB,
  resources JSONB,
  self_check JSONB,
  ltl_phase TEXT DEFAULT 'learn' CHECK (ltl_phase IN ('learn', 'leverage', 'both')),
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(course_id, hour)
);

CREATE INDEX IF NOT EXISTS idx_vac_lessons_course ON vac_lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_vac_lessons_course_week ON vac_lessons(course_id, week, hour);

-- vac_enrollments
CREATE TABLE IF NOT EXISTS vac_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  course_id UUID NOT NULL REFERENCES vac_courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','completed','cancelled','expired')),
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','waived','refunded')),
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

-- vac_learner_progress
CREATE TABLE IF NOT EXISTS vac_learner_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  course_id UUID NOT NULL REFERENCES vac_courses(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES vac_lessons(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','completed','tested_out')),
  completed_at TIMESTAMPTZ,
  score NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, lesson_id)
);

-- vac_course_programmes (junction)
CREATE TABLE IF NOT EXISTS vac_course_programmes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES vac_courses(id) ON DELETE CASCADE,
  programme_id UUID NOT NULL REFERENCES programs(id),
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(course_id, programme_id)
);
```

## Step 2: CASE Tables

```sql
-- case_tracks
CREATE TABLE IF NOT EXISTS case_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_code TEXT UNIQUE NOT NULL,
  track_name TEXT NOT NULL,
  track_type TEXT NOT NULL CHECK (track_type IN ('ai_mastery','human_excellence')),
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

-- case_track_courses
CREATE TABLE IF NOT EXISTS case_track_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES case_tracks(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES vac_courses(id) ON DELETE CASCADE,
  programme_id UUID REFERENCES programs(id),
  institution_id UUID REFERENCES institutions(id),
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- case_track_enrollments
CREATE TABLE IF NOT EXISTS case_track_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  track_id UUID NOT NULL REFERENCES case_tracks(id),
  course_id UUID REFERENCES vac_courses(id),
  batch_id UUID,
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'enrolled' CHECK (status IN ('enrolled','in_progress','completed','incomplete','retry')),
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

-- case_batches
CREATE TABLE IF NOT EXISTS case_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES case_tracks(id),
  institution_id UUID REFERENCES institutions(id),
  batch_code TEXT,
  delivery_format TEXT DEFAULT 'moderate' CHECK (delivery_format IN ('spread','moderate','intensive')),
  start_date DATE,
  end_date DATE,
  schedule_json JSONB,
  max_capacity INTEGER DEFAULT 60,
  current_enrollment INTEGER DEFAULT 0,
  facilitator_id UUID,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned','open','in_progress','completed','cancelled')),
  is_auto_suggested BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- case_learner_progress
CREATE TABLE IF NOT EXISTS case_learner_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL,
  programme_id UUID REFERENCES programs(id),
  institution_id UUID REFERENCES institutions(id),
  admission_semester INTEGER,
  current_semester INTEGER,
  tracks_completed INTEGER DEFAULT 0,
  total_hours_completed NUMERIC DEFAULT 0,
  graduation_ready BOOLEAN DEFAULT false,
  estimated_exam_date DATE,
  risk_level TEXT DEFAULT 'on_track' CHECK (risk_level IN ('on_track','at_risk','critical','overdue','completed')),
  agency_index NUMERIC(3,1) DEFAULT 0.0 CHECK (agency_index BETWEEN 0 AND 10),
  agency_dimensions JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- case_alerts
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

-- case_graduation_requirements
CREATE TABLE IF NOT EXISTS case_graduation_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id UUID REFERENCES programs(id),
  institution_id UUID REFERENCES institutions(id),
  total_tracks_required INTEGER DEFAULT 6,
  total_hours_required INTEGER DEFAULT 180,
  programme_duration_semesters INTEGER,
  enforcement_days_before_exam INTEGER DEFAULT 25,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

## Step 3: Views

```sql
-- See 03-DATABASE-SCHEMAS.md for full view definitions
-- These reference the tables above, so create AFTER tables

CREATE OR REPLACE VIEW vac_enrollments_with_details AS
SELECT e.*, c.code as course_code, c.name as course_name,
  c.institution as course_institution, c.track as course_track,
  c.duration_hours as course_duration, c.fee as course_fee,
  p.full_name as user_name, p.email as user_email
FROM vac_enrollments e
JOIN vac_courses c ON e.course_id = c.id
LEFT JOIN profiles p ON e.user_id = p.id;

-- case_risk_calculator and case_graduation_readiness views
-- Copy from staging (see 03-DATABASE-SCHEMAS.md)
```

## Step 4: RLS Policies

```sql
-- Enable RLS on all tables
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

-- See 03-DATABASE-SCHEMAS.md for full policy definitions
-- Key pattern: authenticated read, admin write, own-data for enrollments/progress
```

## Step 5: Functions + Cron

```sql
-- process_case_alerts() — daily auto-alert function
-- Copy full function body from staging
-- Then schedule:
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('case-daily-alerts', '30 1 * * *', 'SELECT process_case_alerts();');
```

## Step 6: Seed Data

Export from staging → import to production:

```sql
-- 6 CASE tracks (small, manual copy OK)
-- 92 VAC courses (export as INSERT statements)
-- 2,746 lessons (export as CSV, import with COPY)
-- 94 graduation requirements
-- 91 track-course links
-- 86 course-programme links
```

## Step 7: Add programme_id to profiles (if not exists)

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS programme_id UUID REFERENCES programs(id);
CREATE INDEX IF NOT EXISTS idx_profiles_programme ON profiles(programme_id);
```

## Post-Migration Verification

```sql
SELECT
  (SELECT count(*) FROM vac_courses WHERE is_active = true) as active_courses,
  (SELECT count(*) FROM vac_lessons) as total_lessons,
  (SELECT count(*) FROM case_tracks WHERE is_active = true) as active_tracks,
  (SELECT count(*) FROM case_graduation_requirements WHERE is_active = true) as grad_requirements;
```

Expected: 92 courses, 2746 lessons, 6 tracks, 94 requirements.

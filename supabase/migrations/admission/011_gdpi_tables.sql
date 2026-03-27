-- ============================================================================
-- ADMISSION MODULE: GD-PI (Group Discussion & Personal Interview) TABLES
-- Created: 2026-03-27
-- Purpose: Session scheduling, candidate assignment, evaluator scoring, results
-- ============================================================================

-- ============================================================================
-- 1. ENUMS
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE gdpi_session_type AS ENUM ('gd', 'pi', 'gd_pi');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE gdpi_session_status AS ENUM ('draft', 'scheduled', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE gdpi_candidate_status AS ENUM ('registered', 'present', 'absent', 'evaluated', 'disqualified');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE gdpi_recommendation AS ENUM ('strongly_recommend', 'recommend', 'consider', 'not_recommend');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. GD-PI SESSIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_gdpi_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  session_name text NOT NULL,
  session_type gdpi_session_type NOT NULL DEFAULT 'gd_pi',
  status gdpi_session_status NOT NULL DEFAULT 'draft',

  -- Scheduling
  scheduled_date date NOT NULL,
  start_time time,
  end_time time,
  venue text,

  -- Configuration
  program_ids uuid[] DEFAULT '{}',
  max_candidates integer DEFAULT 30,
  scoring_criteria jsonb DEFAULT '[]',
  -- scoring_criteria format: [{ "name": "Communication", "max_score": 10, "weight": 25 }, ...]

  -- Metadata
  notes text,
  academic_year text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE admission_gdpi_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_gdpi_sessions_institution ON admission_gdpi_sessions(institution_id);
CREATE INDEX IF NOT EXISTS idx_gdpi_sessions_date ON admission_gdpi_sessions(institution_id, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_gdpi_sessions_status ON admission_gdpi_sessions(institution_id, status);

-- ============================================================================
-- 3. GD-PI CANDIDATES (link leads to sessions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_gdpi_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES admission_gdpi_sessions(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id),

  status gdpi_candidate_status NOT NULL DEFAULT 'registered',

  -- Scores (aggregated after evaluation)
  total_score numeric DEFAULT 0,
  max_possible_score numeric DEFAULT 0,
  percentage numeric DEFAULT 0,
  rank integer,

  -- Metadata
  attendance_marked_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(session_id, lead_id)
);
ALTER TABLE admission_gdpi_candidates ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_gdpi_candidates_session ON admission_gdpi_candidates(session_id);
CREATE INDEX IF NOT EXISTS idx_gdpi_candidates_lead ON admission_gdpi_candidates(lead_id);
CREATE INDEX IF NOT EXISTS idx_gdpi_candidates_institution ON admission_gdpi_candidates(institution_id);

-- ============================================================================
-- 4. GD-PI EVALUATORS (link staff/profiles to sessions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_gdpi_evaluators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES admission_gdpi_sessions(id) ON DELETE CASCADE,
  evaluator_id uuid NOT NULL REFERENCES profiles(id),
  institution_id uuid NOT NULL REFERENCES institutions(id),

  is_lead_evaluator boolean DEFAULT false,
  evaluation_count integer DEFAULT 0,

  created_at timestamptz DEFAULT now(),

  UNIQUE(session_id, evaluator_id)
);
ALTER TABLE admission_gdpi_evaluators ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_gdpi_evaluators_session ON admission_gdpi_evaluators(session_id);
CREATE INDEX IF NOT EXISTS idx_gdpi_evaluators_evaluator ON admission_gdpi_evaluators(evaluator_id);

-- ============================================================================
-- 5. GD-PI SCORES (individual evaluator scores per candidate)
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_gdpi_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES admission_gdpi_sessions(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES admission_gdpi_candidates(id) ON DELETE CASCADE,
  evaluator_id uuid NOT NULL REFERENCES profiles(id),
  institution_id uuid NOT NULL REFERENCES institutions(id),

  -- Score data
  scores jsonb NOT NULL DEFAULT '{}',
  -- scores format: { "Communication": 8, "Knowledge": 7, "Leadership": 6, ... }
  total_score numeric NOT NULL DEFAULT 0,
  max_possible_score numeric NOT NULL DEFAULT 0,

  recommendation gdpi_recommendation,
  feedback text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(candidate_id, evaluator_id)
);
ALTER TABLE admission_gdpi_scores ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_gdpi_scores_session ON admission_gdpi_scores(session_id);
CREATE INDEX IF NOT EXISTS idx_gdpi_scores_candidate ON admission_gdpi_scores(candidate_id);
CREATE INDEX IF NOT EXISTS idx_gdpi_scores_evaluator ON admission_gdpi_scores(evaluator_id);

-- ============================================================================
-- 6. RLS POLICIES (standard admission pattern)
-- ============================================================================

-- Helper (reuse existing or create)
-- auth_institution_id() already exists from 004_rls_policies.sql

-- GD-PI Sessions
CREATE POLICY "gdpi_sessions_select" ON admission_gdpi_sessions FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'
  )
);
CREATE POLICY "gdpi_sessions_insert" ON admission_gdpi_sessions FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'
  )
);
CREATE POLICY "gdpi_sessions_update" ON admission_gdpi_sessions FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'
  )
);
CREATE POLICY "gdpi_sessions_delete" ON admission_gdpi_sessions FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'
  )
);

-- GD-PI Candidates
CREATE POLICY "gdpi_candidates_select" ON admission_gdpi_candidates FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'
  )
);
CREATE POLICY "gdpi_candidates_insert" ON admission_gdpi_candidates FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'
  )
);
CREATE POLICY "gdpi_candidates_update" ON admission_gdpi_candidates FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'
  )
);
CREATE POLICY "gdpi_candidates_delete" ON admission_gdpi_candidates FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'
  )
);

-- GD-PI Evaluators
CREATE POLICY "gdpi_evaluators_select" ON admission_gdpi_evaluators FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'
  )
);
CREATE POLICY "gdpi_evaluators_insert" ON admission_gdpi_evaluators FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'
  )
);
CREATE POLICY "gdpi_evaluators_update" ON admission_gdpi_evaluators FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'
  )
);
CREATE POLICY "gdpi_evaluators_delete" ON admission_gdpi_evaluators FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'
  )
);

-- GD-PI Scores
CREATE POLICY "gdpi_scores_select" ON admission_gdpi_scores FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'
  )
);
CREATE POLICY "gdpi_scores_insert" ON admission_gdpi_scores FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'
  )
);
CREATE POLICY "gdpi_scores_update" ON admission_gdpi_scores FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'
  )
);
CREATE POLICY "gdpi_scores_delete" ON admission_gdpi_scores FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'
  )
);

-- ============================================================================
-- 7. TRIGGERS
-- ============================================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION trg_gdpi_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gdpi_sessions_updated
  BEFORE UPDATE ON admission_gdpi_sessions
  FOR EACH ROW EXECUTE FUNCTION trg_gdpi_updated_at();

CREATE TRIGGER trg_gdpi_candidates_updated
  BEFORE UPDATE ON admission_gdpi_candidates
  FOR EACH ROW EXECUTE FUNCTION trg_gdpi_updated_at();

CREATE TRIGGER trg_gdpi_scores_updated
  BEFORE UPDATE ON admission_gdpi_scores
  FOR EACH ROW EXECUTE FUNCTION trg_gdpi_updated_at();

-- ================================================================
-- Mentor Ecosystem: Profiles, Matching, Sessions, Evaluations
-- Migration: 20260326000002_ss_mentor_ecosystem
-- Part of Incubation Management Enhancement Phase 2
-- ================================================================

-- 1. Mentor Profiles
CREATE TABLE IF NOT EXISTS ss_mentors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  user_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  photo_url TEXT,
  linkedin_url TEXT,

  -- Professional profile
  designation TEXT,
  organization TEXT,
  mentor_type TEXT NOT NULL DEFAULT 'visiting' CHECK (mentor_type IN (
    'resident', 'visiting', 'industry_expert', 'academic', 'investor', 'alumni', 'functional'
  )),
  status TEXT NOT NULL DEFAULT 'prospect' CHECK (status IN (
    'prospect', 'screening', 'onboarded', 'inactive', 'retired'
  )),

  -- Expertise & sourcing
  domain_expertise TEXT[] NOT NULL DEFAULT '{}',
  functional_expertise TEXT[] DEFAULT '{}',
  years_experience INTEGER,
  source TEXT,
  referred_by TEXT,

  -- Capacity
  max_mentees INTEGER DEFAULT 3,
  current_mentees INTEGER DEFAULT 0,
  preferred_session_frequency TEXT DEFAULT 'biweekly',
  preferred_session_mode TEXT DEFAULT 'hybrid' CHECK (preferred_session_mode IN ('in_person', 'virtual', 'hybrid')),
  availability_notes TEXT,

  -- Screening
  screened_at TIMESTAMPTZ,
  screened_by UUID REFERENCES profiles(id),
  screening_score INTEGER CHECK (screening_score BETWEEN 1 AND 10),
  screening_notes TEXT,

  -- Onboarding
  onboarded_at TIMESTAMPTZ,
  orientation_completed BOOLEAN DEFAULT false,
  nda_signed BOOLEAN DEFAULT false,
  agreement_signed BOOLEAN DEFAULT false,

  -- Performance tracking (aggregated)
  total_sessions INTEGER DEFAULT 0,
  total_hours NUMERIC(8,1) DEFAULT 0,
  avg_mentee_rating NUMERIC(3,2),
  startups_mentored INTEGER DEFAULT 0,
  successful_exits INTEGER DEFAULT 0,

  -- Institutional
  institution_id UUID REFERENCES institutions(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ss_mentors ENABLE ROW LEVEL SECURITY;

CREATE POLICY ss_mentors_select ON ss_mentors
  FOR SELECT TO authenticated USING (true);

CREATE POLICY ss_mentors_service_all ON ss_mentors
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ss_mentors_status ON ss_mentors(status);
CREATE INDEX IF NOT EXISTS idx_ss_mentors_type ON ss_mentors(mentor_type);
CREATE INDEX IF NOT EXISTS idx_ss_mentors_user ON ss_mentors(user_id);
CREATE INDEX IF NOT EXISTS idx_ss_mentors_institution ON ss_mentors(institution_id);

-- 2. Mentor-Startup Matching
CREATE TABLE IF NOT EXISTS ss_mentor_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id UUID NOT NULL REFERENCES ss_mentors(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES ss_nif_candidates(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN (
    'proposed', 'active', 'paused', 'completed', 'terminated'
  )),

  -- Match context
  match_reason TEXT,
  matched_by UUID REFERENCES profiles(id),
  matched_at TIMESTAMPTZ DEFAULT NOW(),

  -- Goals
  primary_goal TEXT,
  expected_duration_months INTEGER,
  session_frequency TEXT DEFAULT 'biweekly',

  -- Progress tracking
  sessions_completed INTEGER DEFAULT 0,
  goals_met TEXT[] DEFAULT '{}',
  goals_pending TEXT[] DEFAULT '{}',

  -- Lifecycle
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  pause_reason TEXT,
  completed_at TIMESTAMPTZ,
  completion_reason TEXT,
  terminated_at TIMESTAMPTZ,
  termination_reason TEXT,

  -- Satisfaction
  mentor_satisfaction INTEGER CHECK (mentor_satisfaction BETWEEN 1 AND 10),
  mentee_satisfaction INTEGER CHECK (mentee_satisfaction BETWEEN 1 AND 10),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(mentor_id, candidate_id)
);

ALTER TABLE ss_mentor_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY ss_mentor_matches_select ON ss_mentor_matches
  FOR SELECT TO authenticated USING (true);

CREATE POLICY ss_mentor_matches_service_all ON ss_mentor_matches
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ss_mentor_matches_mentor ON ss_mentor_matches(mentor_id);
CREATE INDEX IF NOT EXISTS idx_ss_mentor_matches_candidate ON ss_mentor_matches(candidate_id);
CREATE INDEX IF NOT EXISTS idx_ss_mentor_matches_status ON ss_mentor_matches(status);

-- 3. Mentoring Sessions
CREATE TABLE IF NOT EXISTS ss_mentor_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES ss_mentor_matches(id) ON DELETE CASCADE,

  -- Session details
  session_date TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL,
  mode TEXT DEFAULT 'virtual' CHECK (mode IN ('in_person', 'virtual', 'phone')),
  location TEXT,

  -- Content
  topics_discussed TEXT[] NOT NULL DEFAULT '{}',
  key_takeaways TEXT,
  action_items TEXT[] DEFAULT '{}',
  blockers_identified TEXT[] DEFAULT '{}',

  -- Focus area (from DST training program)
  focus_area TEXT CHECK (focus_area IN (
    'sales_marketing', 'market_research', 'financing', 'business_law',
    'tax_ip_law', 'accounting', 'product_development', 'hr_recruiting',
    'leadership', 'communications', 'networking', 'technology',
    'go_to_market', 'fundraising', 'governance', 'other'
  )),

  -- Outcomes
  mentee_progress_notes TEXT,
  next_session_date TIMESTAMPTZ,

  -- Ratings
  mentor_rating_of_session INTEGER CHECK (mentor_rating_of_session BETWEEN 1 AND 5),
  mentee_rating_of_session INTEGER CHECK (mentee_rating_of_session BETWEEN 1 AND 5),

  recorded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ss_mentor_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ss_mentor_sessions_select ON ss_mentor_sessions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY ss_mentor_sessions_service_all ON ss_mentor_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ss_mentor_sessions_match ON ss_mentor_sessions(match_id);
CREATE INDEX IF NOT EXISTS idx_ss_mentor_sessions_date ON ss_mentor_sessions(session_date DESC);

-- 4. Mentor Evaluations (periodic quality reviews)
CREATE TABLE IF NOT EXISTS ss_mentor_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id UUID NOT NULL REFERENCES ss_mentors(id) ON DELETE CASCADE,

  evaluation_period_start DATE NOT NULL,
  evaluation_period_end DATE NOT NULL,
  evaluated_by UUID REFERENCES profiles(id),

  -- Quantitative
  sessions_conducted INTEGER DEFAULT 0,
  total_hours NUMERIC(6,1) DEFAULT 0,
  mentees_served INTEGER DEFAULT 0,
  action_items_given INTEGER DEFAULT 0,
  action_items_completed INTEGER DEFAULT 0,

  -- Qualitative
  avg_mentee_satisfaction NUMERIC(3,2),
  domain_relevance_score INTEGER CHECK (domain_relevance_score BETWEEN 1 AND 10),
  communication_score INTEGER CHECK (communication_score BETWEEN 1 AND 10),
  availability_score INTEGER CHECK (availability_score BETWEEN 1 AND 10),
  impact_score INTEGER CHECK (impact_score BETWEEN 1 AND 10),

  -- Outcome
  overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 10),
  strengths TEXT,
  areas_for_improvement TEXT,
  recommendation TEXT CHECK (recommendation IN ('continue', 'reduce_load', 'retrain', 'retire')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ss_mentor_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY ss_mentor_evaluations_select ON ss_mentor_evaluations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY ss_mentor_evaluations_service_all ON ss_mentor_evaluations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ss_mentor_evaluations_mentor ON ss_mentor_evaluations(mentor_id);

-- 5. Triggers
CREATE TRIGGER update_ss_mentors_updated_at
  BEFORE UPDATE ON ss_mentors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ss_mentor_matches_updated_at
  BEFORE UPDATE ON ss_mentor_matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

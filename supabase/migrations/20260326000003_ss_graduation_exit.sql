-- ================================================================
-- Graduation & Exit: Criteria, Evaluations, Exit Procedures, Alumni
-- Migration: 20260326000003_ss_graduation_exit
-- Part of Incubation Management Enhancement Phase 3
-- ================================================================

-- 1. Configurable Graduation Criteria
CREATE TABLE IF NOT EXISTS ss_graduation_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  criteria_type TEXT NOT NULL CHECK (criteria_type IN (
    'revenue_threshold', 'funding_threshold', 'acquisition',
    'capacity_exceeded', 'time_limit', 'institutional_disconnect',
    'jobs_created', 'market_presence', 'custom'
  )),
  threshold_value NUMERIC(15,2),
  threshold_unit TEXT,
  is_active BOOLEAN DEFAULT true,
  min_criteria_to_graduate INTEGER DEFAULT 2,
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ss_graduation_criteria ENABLE ROW LEVEL SECURITY;
CREATE POLICY ss_graduation_criteria_select ON ss_graduation_criteria FOR SELECT TO authenticated USING (true);
CREATE POLICY ss_graduation_criteria_service_all ON ss_graduation_criteria FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Graduation Evaluations
CREATE TABLE IF NOT EXISTS ss_graduation_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES ss_nif_candidates(id) ON DELETE CASCADE,
  evaluation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  evaluated_by UUID REFERENCES profiles(id),
  criteria_results JSONB NOT NULL DEFAULT '[]',
  criteria_met_count INTEGER DEFAULT 0,
  is_graduation_ready BOOLEAN DEFAULT false,
  decision TEXT CHECK (decision IN ('graduate', 'extend', 'exit_non_performance', 'defer')),
  decision_notes TEXT,
  decision_by UUID REFERENCES profiles(id),
  extension_months INTEGER,
  extension_conditions TEXT,
  graduation_type TEXT CHECK (graduation_type IN ('successful', 'time_limit', 'capacity', 'acquisition')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ss_graduation_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY ss_graduation_evaluations_select ON ss_graduation_evaluations FOR SELECT TO authenticated USING (true);
CREATE POLICY ss_graduation_evaluations_service_all ON ss_graduation_evaluations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_ss_graduation_evaluations_candidate ON ss_graduation_evaluations(candidate_id);

-- 3. Exit Procedures
CREATE TABLE IF NOT EXISTS ss_exit_procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES ss_nif_candidates(id) ON DELETE CASCADE,
  exit_type TEXT NOT NULL CHECK (exit_type IN ('graduation', 'voluntary', 'non_performance', 'acquisition', 'closure')),
  notice_given_at TIMESTAMPTZ,
  notice_period_days INTEGER DEFAULT 60,
  fees_outstanding NUMERIC(12,2) DEFAULT 0,
  fees_reconciled BOOLEAN DEFAULT false,
  deposit_returned BOOLEAN DEFAULT false,
  exit_interview_completed BOOLEAN DEFAULT false,
  exit_interview_notes TEXT,
  ip_agreements_settled BOOLEAN DEFAULT false,
  nda_status TEXT DEFAULT 'active',
  equipment_returned BOOLEAN DEFAULT false,
  access_revoked BOOLEAN DEFAULT false,
  alumni_network_joined BOOLEAN DEFAULT false,
  testimonial_provided BOOLEAN DEFAULT false,
  exit_initiated_at TIMESTAMPTZ DEFAULT NOW(),
  exit_completed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ss_exit_procedures ENABLE ROW LEVEL SECURITY;
CREATE POLICY ss_exit_procedures_select ON ss_exit_procedures FOR SELECT TO authenticated USING (true);
CREATE POLICY ss_exit_procedures_service_all ON ss_exit_procedures FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_ss_exit_procedures_candidate ON ss_exit_procedures(candidate_id);

-- 4. Alumni Tracking (annual surveys)
CREATE TABLE IF NOT EXISTS ss_alumni_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES ss_nif_candidates(id) ON DELETE CASCADE,
  tracking_year INTEGER NOT NULL,
  tracking_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_operational BOOLEAN DEFAULT true,
  pivot_description TEXT,
  annual_revenue NUMERIC(15,2),
  revenue_currency TEXT DEFAULT 'INR',
  revenue_growth_pct NUMERIC(6,2),
  total_funding_raised NUMERIC(15,2),
  latest_funding_round TEXT,
  latest_valuation NUMERIC(15,2),
  employees_count INTEGER DEFAULT 0,
  jobs_created_this_year INTEGER DEFAULT 0,
  customers_count INTEGER DEFAULT 0,
  patents_filed INTEGER DEFAULT 0,
  patents_granted INTEGER DEFAULT 0,
  awards TEXT[] DEFAULT '{}',
  media_mentions INTEGER DEFAULT 0,
  is_mentor_back BOOLEAN DEFAULT false,
  is_investor_back BOOLEAN DEFAULT false,
  referred_startups INTEGER DEFAULT 0,
  incubator_helpfulness_rating INTEGER CHECK (incubator_helpfulness_rating BETWEEN 1 AND 10),
  most_valuable_support TEXT,
  improvement_suggestion TEXT,
  recorded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(candidate_id, tracking_year)
);

ALTER TABLE ss_alumni_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY ss_alumni_tracking_select ON ss_alumni_tracking FOR SELECT TO authenticated USING (true);
CREATE POLICY ss_alumni_tracking_service_all ON ss_alumni_tracking FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_ss_alumni_tracking_candidate ON ss_alumni_tracking(candidate_id);
CREATE INDEX IF NOT EXISTS idx_ss_alumni_tracking_year ON ss_alumni_tracking(tracking_year DESC);

-- 5. Triggers
CREATE TRIGGER update_ss_graduation_criteria_updated_at
  BEFORE UPDATE ON ss_graduation_criteria FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ss_exit_procedures_updated_at
  BEFORE UPDATE ON ss_exit_procedures FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- Portfolio Intelligence: TRL Tracking, Risk Assessment,
-- Competitive Matrix, NIF Candidate Enrichment
-- Migration: 20260326000001_ss_portfolio_intelligence
-- ================================================================

-- 1. TRL Assessments
CREATE TABLE IF NOT EXISTS ss_trl_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES ss_nif_candidates(id) ON DELETE CASCADE,
  trl_level INTEGER NOT NULL CHECK (trl_level BETWEEN 1 AND 9),
  previous_trl INTEGER CHECK (previous_trl BETWEEN 1 AND 9),
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  assessed_by UUID REFERENCES profiles(id),
  evidence_description TEXT NOT NULL,
  evidence_urls TEXT[] DEFAULT '{}',
  lab_validated BOOLEAN DEFAULT false,
  relevant_env_validated BOOLEAN DEFAULT false,
  prototype_demonstrated BOOLEAN DEFAULT false,
  system_qualified BOOLEAN DEFAULT false,
  operational_proven BOOLEAN DEFAULT false,
  blockers TEXT[] DEFAULT '{}',
  next_steps TEXT,
  estimated_months_to_next INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ss_trl_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY ss_trl_assessments_select ON ss_trl_assessments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY ss_trl_assessments_service_all ON ss_trl_assessments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ss_trl_assessments_candidate ON ss_trl_assessments(candidate_id);
CREATE INDEX IF NOT EXISTS idx_ss_trl_assessments_date ON ss_trl_assessments(assessment_date DESC);

-- 2. Risk Assessments (4M Framework: Magic, Market, Management, Money)
CREATE TABLE IF NOT EXISTS ss_risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES ss_nif_candidates(id) ON DELETE CASCADE,
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  assessed_by UUID REFERENCES profiles(id),

  -- Magic (Technology/IP) Risk: 1=extreme risk, 10=fully de-risked
  magic_score INTEGER NOT NULL CHECK (magic_score BETWEEN 1 AND 10),
  magic_trl_level INTEGER CHECK (magic_trl_level BETWEEN 1 AND 9),
  magic_ip_status TEXT CHECK (magic_ip_status IN ('none', 'trade_secret', 'patent_filed', 'patent_granted')),
  magic_has_tech_advisory BOOLEAN DEFAULT false,
  magic_prototype_maturity TEXT CHECK (magic_prototype_maturity IN ('concept', 'proof_of_concept', 'alpha', 'beta', 'production')),
  magic_notes TEXT,
  magic_mitigation_plan TEXT,

  -- Market Risk
  market_score INTEGER NOT NULL CHECK (market_score BETWEEN 1 AND 10),
  market_customers_validated INTEGER DEFAULT 0,
  market_willingness_to_pay TEXT CHECK (market_willingness_to_pay IN ('unknown', 'interested', 'verbal_commit', 'paid', 'recurring')),
  market_tam_estimate NUMERIC(15,2),
  market_tam_currency TEXT DEFAULT 'INR',
  market_competition_level TEXT CHECK (market_competition_level IN ('blue_ocean', 'few_competitors', 'moderate', 'crowded', 'monopolized')),
  market_notes TEXT,
  market_mitigation_plan TEXT,

  -- Management (Team) Risk
  management_score INTEGER NOT NULL CHECK (management_score BETWEEN 1 AND 10),
  management_team_size INTEGER DEFAULT 1,
  management_has_domain_expert BOOLEAN DEFAULT false,
  management_has_tech_lead BOOLEAN DEFAULT false,
  management_has_business_lead BOOLEAN DEFAULT false,
  management_coachability TEXT CHECK (management_coachability IN ('resistant', 'passive', 'receptive', 'proactive')),
  management_has_advisory_board BOOLEAN DEFAULT false,
  management_notes TEXT,
  management_mitigation_plan TEXT,

  -- Money (Financial) Risk
  money_score INTEGER NOT NULL CHECK (money_score BETWEEN 1 AND 10),
  money_monthly_burn NUMERIC(12,2),
  money_runway_months INTEGER,
  money_funding_raised NUMERIC(15,2) DEFAULT 0,
  money_funding_currency TEXT DEFAULT 'INR',
  money_revenue_monthly NUMERIC(12,2) DEFAULT 0,
  money_has_financial_plan BOOLEAN DEFAULT false,
  money_investor_interest_level TEXT CHECK (money_investor_interest_level IN ('none', 'exploring', 'in_discussion', 'term_sheet', 'committed')),
  money_notes TEXT,
  money_mitigation_plan TEXT,

  -- Computed fields
  overall_risk_score NUMERIC(4,2) GENERATED ALWAYS AS (
    (magic_score + market_score + management_score + money_score) / 4.0
  ) STORED,
  overall_risk_level TEXT GENERATED ALWAYS AS (
    CASE
      WHEN (magic_score + market_score + management_score + money_score) / 4.0 >= 8 THEN 'low'
      WHEN (magic_score + market_score + management_score + money_score) / 4.0 >= 5 THEN 'moderate'
      WHEN (magic_score + market_score + management_score + money_score) / 4.0 >= 3 THEN 'high'
      ELSE 'critical'
    END
  ) STORED,

  -- Action tracking
  priority_risk TEXT CHECK (priority_risk IN ('magic', 'market', 'management', 'money')),
  action_items JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ss_risk_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY ss_risk_assessments_select ON ss_risk_assessments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY ss_risk_assessments_service_all ON ss_risk_assessments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ss_risk_assessments_candidate ON ss_risk_assessments(candidate_id);
CREATE INDEX IF NOT EXISTS idx_ss_risk_assessments_date ON ss_risk_assessments(assessment_date DESC);

-- 3. Competitive Matrices
CREATE TABLE IF NOT EXISTS ss_competitive_matrices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES ss_nif_candidates(id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL,
  competitor_website TEXT,
  competitor_type TEXT DEFAULT 'direct' CHECK (competitor_type IN ('direct', 'indirect', 'substitute')),
  attributes JSONB NOT NULL DEFAULT '{}',
  our_advantage TEXT,
  their_advantage TEXT,
  strategic_response TEXT,
  last_updated DATE DEFAULT CURRENT_DATE,
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ss_competitive_matrices ENABLE ROW LEVEL SECURITY;

CREATE POLICY ss_competitive_matrices_select ON ss_competitive_matrices
  FOR SELECT TO authenticated USING (true);

CREATE POLICY ss_competitive_matrices_service_all ON ss_competitive_matrices
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ss_competitive_matrices_candidate ON ss_competitive_matrices(candidate_id);

-- 4. NIF Candidate Enrichment (ALTER existing table)
ALTER TABLE ss_nif_candidates
  ADD COLUMN IF NOT EXISTS current_trl INTEGER CHECK (current_trl BETWEEN 1 AND 9),
  ADD COLUMN IF NOT EXISTS trl_assessed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enthusiasm_curve TEXT CHECK (enthusiasm_curve IN (
    'uninformed_optimism', 'informed_pessimism', 'valley_of_despair', 'informed_optimism', 'success'
  )),
  ADD COLUMN IF NOT EXISTS capital_assessment JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dipp_number TEXT,
  ADD COLUMN IF NOT EXISTS incorporation_number TEXT,
  ADD COLUMN IF NOT EXISTS incorporation_date DATE,
  ADD COLUMN IF NOT EXISTS legal_structure TEXT CHECK (legal_structure IN (
    'proprietorship', 'partnership', 'llp', 'private_limited', 'section_8', 'opc'
  )),
  ADD COLUMN IF NOT EXISTS gst_number TEXT,
  ADD COLUMN IF NOT EXISTS pan_number TEXT,
  ADD COLUMN IF NOT EXISTS pitch_deck_url TEXT,
  ADD COLUMN IF NOT EXISTS elevator_pitch TEXT,
  ADD COLUMN IF NOT EXISTS business_plan_url TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS founder_profiles JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS customer_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS market_sector TEXT,
  ADD COLUMN IF NOT EXISTS target_geography TEXT,
  ADD COLUMN IF NOT EXISTS patents_filed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS patents_granted INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trademarks INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS incubation_agreement_signed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS incubation_agreement_date DATE,
  ADD COLUMN IF NOT EXISTS allocated_space TEXT,
  ADD COLUMN IF NOT EXISTS equity_given_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS kyc_status TEXT DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'submitted', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS kyc_documents JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_ss_nif_candidates_trl ON ss_nif_candidates(current_trl);
CREATE INDEX IF NOT EXISTS idx_ss_nif_candidates_kyc ON ss_nif_candidates(kyc_status);

-- 5. Updated_at trigger for competitive matrices
CREATE TRIGGER update_ss_competitive_matrices_updated_at
  BEFORE UPDATE ON ss_competitive_matrices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

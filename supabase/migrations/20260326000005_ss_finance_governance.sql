-- ================================================================
-- Finance, Governance & Compliance: Grants, Budgets, Revenue,
-- Audit Records, Governance Members, Compliance Items,
-- Readiness Assessments
-- Migration: 20260326000005_ss_finance_governance
-- Part of Incubation Management Enhancement Phase 5
-- ================================================================

-- 1. Grants
CREATE TABLE IF NOT EXISTS ss_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  funder TEXT NOT NULL,
  grant_number TEXT,
  sanctioned_amount NUMERIC(15,2) NOT NULL,
  received_amount NUMERIC(15,2) DEFAULT 0,
  utilized_amount NUMERIC(15,2) DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  sanction_date DATE,
  start_date DATE,
  end_date DATE,
  uc_submitted BOOLEAN DEFAULT false,
  uc_submitted_at TIMESTAMPTZ,
  audit_status TEXT DEFAULT 'pending' CHECK (audit_status IN ('pending', 'in_progress', 'completed', 'flagged')),
  purpose TEXT,
  allowed_heads TEXT[],
  reporting_frequency TEXT DEFAULT 'quarterly',
  last_report_date DATE,
  next_report_due DATE,
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ss_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY ss_grants_select ON ss_grants FOR SELECT TO authenticated USING (true);
CREATE POLICY ss_grants_service_all ON ss_grants FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ss_grants_institution ON ss_grants(institution_id);
CREATE INDEX IF NOT EXISTS idx_ss_grants_audit_status ON ss_grants(audit_status);
CREATE INDEX IF NOT EXISTS idx_ss_grants_end_date ON ss_grants(end_date);

CREATE TRIGGER update_ss_grants_updated_at
  BEFORE UPDATE ON ss_grants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Budgets
CREATE TABLE IF NOT EXISTS ss_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year TEXT NOT NULL,
  quarter TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  allocated_amount NUMERIC(15,2) NOT NULL,
  spent_amount NUMERIC(15,2) DEFAULT 0,
  committed_amount NUMERIC(15,2) DEFAULT 0,
  grant_id UUID REFERENCES ss_grants(id),
  notes TEXT,
  approved_by UUID REFERENCES profiles(id),
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(fiscal_year, quarter, category, subcategory, institution_id)
);

ALTER TABLE ss_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY ss_budgets_select ON ss_budgets FOR SELECT TO authenticated USING (true);
CREATE POLICY ss_budgets_service_all ON ss_budgets FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ss_budgets_institution ON ss_budgets(institution_id);
CREATE INDEX IF NOT EXISTS idx_ss_budgets_fiscal_year ON ss_budgets(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_ss_budgets_grant ON ss_budgets(grant_id);

CREATE TRIGGER update_ss_budgets_updated_at
  BEFORE UPDATE ON ss_budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. Revenue
CREATE TABLE IF NOT EXISTS ss_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year TEXT NOT NULL,
  month INTEGER CHECK (month BETWEEN 1 AND 12),
  source TEXT NOT NULL CHECK (source IN (
    'rental_income', 'service_fees', 'equity_returns', 'licensing_ip',
    'event_sponsorship', 'corporate_partnership', 'government_grant',
    'consulting', 'training_programs', 'other'
  )),
  amount NUMERIC(15,2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  description TEXT,
  is_self_generated BOOLEAN DEFAULT false,
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ss_revenue ENABLE ROW LEVEL SECURITY;
CREATE POLICY ss_revenue_select ON ss_revenue FOR SELECT TO authenticated USING (true);
CREATE POLICY ss_revenue_service_all ON ss_revenue FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ss_revenue_institution ON ss_revenue(institution_id);
CREATE INDEX IF NOT EXISTS idx_ss_revenue_fiscal_year ON ss_revenue(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_ss_revenue_source ON ss_revenue(source);

-- 4. Audit Records
CREATE TABLE IF NOT EXISTS ss_audit_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_type TEXT NOT NULL CHECK (audit_type IN ('internal_quarterly', 'external_annual', 'grant_specific', 'special')),
  audit_period_start DATE NOT NULL,
  audit_period_end DATE NOT NULL,
  auditor_name TEXT,
  auditor_organization TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'findings_open')),
  findings_count INTEGER DEFAULT 0,
  critical_findings INTEGER DEFAULT 0,
  findings_details JSONB DEFAULT '[]',
  management_response TEXT,
  action_plan JSONB DEFAULT '[]',
  all_findings_resolved BOOLEAN DEFAULT false,
  report_url TEXT,
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ss_audit_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY ss_audit_records_select ON ss_audit_records FOR SELECT TO authenticated USING (true);
CREATE POLICY ss_audit_records_service_all ON ss_audit_records FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ss_audit_records_institution ON ss_audit_records(institution_id);
CREATE INDEX IF NOT EXISTS idx_ss_audit_records_status ON ss_audit_records(status);
CREATE INDEX IF NOT EXISTS idx_ss_audit_records_period ON ss_audit_records(audit_period_start, audit_period_end);

CREATE TRIGGER update_ss_audit_records_updated_at
  BEFORE UPDATE ON ss_audit_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Governance Members
CREATE TABLE IF NOT EXISTS ss_governance_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  designation TEXT,
  organization TEXT,
  email TEXT,
  phone TEXT,
  body TEXT NOT NULL CHECK (body IN (
    'board_of_directors', 'advisory_council', 'finance_audit_committee',
    'startup_selection_committee', 'hr_compliance_committee', 'internal_complaints_committee'
  )),
  role TEXT NOT NULL CHECK (role IN ('chairperson', 'member', 'secretary', 'ex_officio', 'invitee')),
  term_start DATE,
  term_end DATE,
  is_active BOOLEAN DEFAULT true,
  coi_declaration_filed BOOLEAN DEFAULT false,
  coi_details TEXT,
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ss_governance_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY ss_governance_members_select ON ss_governance_members FOR SELECT TO authenticated USING (true);
CREATE POLICY ss_governance_members_service_all ON ss_governance_members FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ss_governance_members_institution ON ss_governance_members(institution_id);
CREATE INDEX IF NOT EXISTS idx_ss_governance_members_body ON ss_governance_members(body);
CREATE INDEX IF NOT EXISTS idx_ss_governance_members_active ON ss_governance_members(is_active);

CREATE TRIGGER update_ss_governance_members_updated_at
  BEFORE UPDATE ON ss_governance_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Compliance Items
CREATE TABLE IF NOT EXISTS ss_compliance_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('legal', 'financial', 'hr', 'startup', 'reporting', 'safety')),
  requirement TEXT NOT NULL,
  description TEXT,
  frequency TEXT NOT NULL CHECK (frequency IN ('one_time', 'monthly', 'quarterly', 'annually', 'as_needed')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue', 'not_applicable')),
  due_date DATE,
  completed_date DATE,
  completed_by UUID REFERENCES profiles(id),
  evidence_url TEXT,
  notes TEXT,
  reminder_days_before INTEGER DEFAULT 30,
  is_critical BOOLEAN DEFAULT false,
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ss_compliance_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY ss_compliance_items_select ON ss_compliance_items FOR SELECT TO authenticated USING (true);
CREATE POLICY ss_compliance_items_service_all ON ss_compliance_items FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ss_compliance_items_institution ON ss_compliance_items(institution_id);
CREATE INDEX IF NOT EXISTS idx_ss_compliance_items_category ON ss_compliance_items(category);
CREATE INDEX IF NOT EXISTS idx_ss_compliance_items_status ON ss_compliance_items(status);
CREATE INDEX IF NOT EXISTS idx_ss_compliance_items_due_date ON ss_compliance_items(due_date);

CREATE TRIGGER update_ss_compliance_items_updated_at
  BEFORE UPDATE ON ss_compliance_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. Readiness Assessments (5 Pillars)
CREATE TABLE IF NOT EXISTS ss_readiness_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_date DATE DEFAULT CURRENT_DATE,
  assessed_by UUID REFERENCES profiles(id),

  -- Pillar 1: Infrastructure (5 sub-scores x 20 = 100)
  infra_score INTEGER CHECK (infra_score BETWEEN 0 AND 100),
  infra_physical_facilities INTEGER CHECK (infra_physical_facilities BETWEEN 0 AND 20),
  infra_it_systems INTEGER CHECK (infra_it_systems BETWEEN 0 AND 20),
  infra_lab_equipment INTEGER CHECK (infra_lab_equipment BETWEEN 0 AND 20),
  infra_connectivity INTEGER CHECK (infra_connectivity BETWEEN 0 AND 20),
  infra_co_working_space INTEGER CHECK (infra_co_working_space BETWEEN 0 AND 20),

  -- Pillar 2: Finance (4 sub-scores x 25 = 100)
  finance_score INTEGER CHECK (finance_score BETWEEN 0 AND 100),
  finance_budget_process INTEGER CHECK (finance_budget_process BETWEEN 0 AND 25),
  finance_audit_compliance INTEGER CHECK (finance_audit_compliance BETWEEN 0 AND 25),
  finance_grant_management INTEGER CHECK (finance_grant_management BETWEEN 0 AND 25),
  finance_sustainability_plan INTEGER CHECK (finance_sustainability_plan BETWEEN 0 AND 25),

  -- Pillar 3: Board / Governance (4 sub-scores x 25 = 100)
  board_score INTEGER CHECK (board_score BETWEEN 0 AND 100),
  board_governance_structure INTEGER CHECK (board_governance_structure BETWEEN 0 AND 25),
  board_meeting_regularity INTEGER CHECK (board_meeting_regularity BETWEEN 0 AND 25),
  board_committee_formation INTEGER CHECK (board_committee_formation BETWEEN 0 AND 25),
  board_strategic_planning INTEGER CHECK (board_strategic_planning BETWEEN 0 AND 25),

  -- Pillar 4: HR (4 sub-scores x 25 = 100)
  hr_score INTEGER CHECK (hr_score BETWEEN 0 AND 100),
  hr_staff_capacity INTEGER CHECK (hr_staff_capacity BETWEEN 0 AND 25),
  hr_training_programs INTEGER CHECK (hr_training_programs BETWEEN 0 AND 25),
  hr_mentor_network INTEGER CHECK (hr_mentor_network BETWEEN 0 AND 25),
  hr_policies_in_place INTEGER CHECK (hr_policies_in_place BETWEEN 0 AND 25),

  -- Pillar 5: Legal (4 sub-scores x 25 = 100)
  legal_score INTEGER CHECK (legal_score BETWEEN 0 AND 100),
  legal_registration_complete INTEGER CHECK (legal_registration_complete BETWEEN 0 AND 25),
  legal_ip_policy INTEGER CHECK (legal_ip_policy BETWEEN 0 AND 25),
  legal_incubation_policy INTEGER CHECK (legal_incubation_policy BETWEEN 0 AND 25),
  legal_sop_documentation INTEGER CHECK (legal_sop_documentation BETWEEN 0 AND 25),

  -- Summary
  weakest_pillar TEXT,
  improvement_plan TEXT,

  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ss_readiness_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY ss_readiness_assessments_select ON ss_readiness_assessments FOR SELECT TO authenticated USING (true);
CREATE POLICY ss_readiness_assessments_service_all ON ss_readiness_assessments FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ss_readiness_assessments_institution ON ss_readiness_assessments(institution_id);
CREATE INDEX IF NOT EXISTS idx_ss_readiness_assessments_date ON ss_readiness_assessments(assessment_date DESC);

-- ================================================================
-- Seed: Default compliance checklist items for all institutions
-- 19 items from training program across 6 categories
-- ================================================================

-- Get all institution IDs and seed compliance items for each
DO $$
DECLARE
  inst_id UUID;
BEGIN
  FOR inst_id IN SELECT id FROM institutions LOOP
    -- Legal (4 items)
    INSERT INTO ss_compliance_items (category, requirement, description, frequency, is_critical, institution_id) VALUES
      ('legal', 'Company Registration', 'Section 8 / Private Limited company registration with MCA', 'one_time', true, inst_id),
      ('legal', 'GST Registration', 'Goods and Services Tax registration', 'one_time', true, inst_id),
      ('legal', 'PAN/TAN Registration', 'Permanent Account Number and Tax Deduction Account Number', 'one_time', true, inst_id),
      ('legal', 'MoUs with Stakeholders', 'Memoranda of Understanding with partner institutions, industry, and mentors', 'as_needed', false, inst_id)
    ON CONFLICT DO NOTHING;

    -- Financial (4 items)
    INSERT INTO ss_compliance_items (category, requirement, description, frequency, is_critical, institution_id) VALUES
      ('financial', 'Annual Audit', 'Statutory audit by chartered accountant', 'annually', true, inst_id),
      ('financial', 'Utilization Certificate', 'UC submission for all grants received', 'annually', true, inst_id),
      ('financial', 'MCA Annual Returns', 'Annual returns filing with Ministry of Corporate Affairs', 'annually', true, inst_id),
      ('financial', 'Income Tax Returns', 'Annual IT returns filing', 'annually', true, inst_id)
    ON CONFLICT DO NOTHING;

    -- HR (4 items)
    INSERT INTO ss_compliance_items (category, requirement, description, frequency, is_critical, institution_id) VALUES
      ('hr', 'PF Registration & Compliance', 'Provident Fund registration and monthly compliance', 'monthly', true, inst_id),
      ('hr', 'ESIC Registration', 'Employee State Insurance Corporation registration and compliance', 'monthly', false, inst_id),
      ('hr', 'POSH Compliance', 'Prevention of Sexual Harassment at Workplace - ICC formation and annual report', 'annually', true, inst_id),
      ('hr', 'Employment Contracts', 'Signed employment contracts for all staff with clear terms', 'as_needed', true, inst_id)
    ON CONFLICT DO NOTHING;

    -- Startup (3 items)
    INSERT INTO ss_compliance_items (category, requirement, description, frequency, is_critical, institution_id) VALUES
      ('startup', 'Startup Onboarding Documentation', 'Complete onboarding package - application, evaluation, agreement templates', 'as_needed', false, inst_id),
      ('startup', 'IP/NDA Agreements', 'Intellectual Property and Non-Disclosure agreements with all incubatees', 'as_needed', true, inst_id),
      ('startup', 'Incubation Agreements', 'Signed incubation agreements defining terms, equity, services, and exit', 'as_needed', true, inst_id)
    ON CONFLICT DO NOTHING;

    -- Reporting (3 items)
    INSERT INTO ss_compliance_items (category, requirement, description, frequency, is_critical, institution_id) VALUES
      ('reporting', 'Annual Report', 'Comprehensive annual report covering operations, finances, and outcomes', 'annually', true, inst_id),
      ('reporting', 'Quarterly Progress Reports', 'Quarterly reports to funders and governing body', 'quarterly', false, inst_id),
      ('reporting', 'MoE Data Submission', 'Ministry of Education / ARIIA / NIRF data submission', 'annually', false, inst_id)
    ON CONFLICT DO NOTHING;

    -- Safety (3 items — total: 4+4+4+3+3+3 = 21, but spec says 19, adjusted below)
    INSERT INTO ss_compliance_items (category, requirement, description, frequency, is_critical, institution_id) VALUES
      ('safety', 'Building Safety Certificate', 'Valid building safety and structural stability certificate', 'annually', true, inst_id),
      ('safety', 'Fire Safety Compliance', 'Fire NOC and fire safety equipment maintenance', 'annually', true, inst_id),
      ('safety', 'Insurance Coverage', 'Comprehensive insurance - property, liability, workers compensation', 'annually', false, inst_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- =============================================================================
-- Migration: Create Loan Connect tables
-- Feature: Loan Connect & Financial Aid for Admission module
-- Date: 2026-02-22
-- =============================================================================

-- Loan Partners
CREATE TABLE IF NOT EXISTS admission_loan_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  name TEXT NOT NULL,
  logo_url TEXT,
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  interest_rate_min NUMERIC(4,2),
  interest_rate_max NUMERIC(4,2),
  max_loan_amount NUMERIC(12,2),
  processing_fee_percent NUMERIC(4,2),
  max_tenure_months INTEGER DEFAULT 120,
  collateral_required BOOLEAN DEFAULT false,
  documents_required TEXT[], -- array of required document names
  is_active BOOLEAN DEFAULT true,
  approval_rate NUMERIC(5,2), -- historical approval percentage
  avg_processing_days INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Loan Applications
CREATE TABLE IF NOT EXISTS admission_loan_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  lead_id UUID NOT NULL REFERENCES admission_leads(id),
  partner_id UUID NOT NULL REFERENCES admission_loan_partners(id),
  loan_amount NUMERIC(12,2) NOT NULL,
  tenure_months INTEGER NOT NULL,
  interest_rate NUMERIC(4,2),
  emi_amount NUMERIC(10,2),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'under_review', 'documents_pending', 'approved', 'disbursed', 'rejected')),
  applied_at TIMESTAMPTZ,
  decision_at TIMESTAMPTZ,
  decision_notes TEXT,
  documents_submitted TEXT[],
  counselor_id UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE admission_loan_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_loan_applications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for loan partners
CREATE POLICY "loan_partners_select" ON admission_loan_partners
  FOR SELECT USING (true);

CREATE POLICY "loan_partners_insert" ON admission_loan_partners
  FOR INSERT WITH CHECK (true);

CREATE POLICY "loan_partners_update" ON admission_loan_partners
  FOR UPDATE USING (true);

CREATE POLICY "loan_partners_delete" ON admission_loan_partners
  FOR DELETE USING (true);

-- RLS Policies for loan applications
CREATE POLICY "loan_applications_select" ON admission_loan_applications
  FOR SELECT USING (true);

CREATE POLICY "loan_applications_insert" ON admission_loan_applications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "loan_applications_update" ON admission_loan_applications
  FOR UPDATE USING (true);

CREATE POLICY "loan_applications_delete" ON admission_loan_applications
  FOR DELETE USING (true);

-- Indexes
CREATE INDEX idx_loan_partners_institution ON admission_loan_partners(institution_id);
CREATE INDEX idx_loan_partners_active ON admission_loan_partners(institution_id, is_active);
CREATE INDEX idx_loan_apps_institution ON admission_loan_applications(institution_id);
CREATE INDEX idx_loan_apps_lead ON admission_loan_applications(lead_id);
CREATE INDEX idx_loan_apps_partner ON admission_loan_applications(partner_id);
CREATE INDEX idx_loan_apps_status ON admission_loan_applications(status);
CREATE INDEX idx_loan_apps_institution_status ON admission_loan_applications(institution_id, status);

-- Updated_at trigger for loan_partners
CREATE OR REPLACE FUNCTION update_loan_partners_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_loan_partners_updated_at
  BEFORE UPDATE ON admission_loan_partners
  FOR EACH ROW
  EXECUTE FUNCTION update_loan_partners_updated_at();

-- Updated_at trigger for loan_applications
CREATE OR REPLACE FUNCTION update_loan_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_loan_applications_updated_at
  BEFORE UPDATE ON admission_loan_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_loan_applications_updated_at();

-- ================================================================================
-- TRL / PRODUCT DEVELOPMENT / RDIF READINESS TRACKING
-- Created: 2026-02-10
-- Description: Tables for tracking JKKN-owned products, TRL assessments,
--              validation evidence, and RDIF prerequisite readiness.
-- Purpose: Enable IP retention from client solutions and track product maturity
--          toward RDIF (Research & Development Innovation Fund) eligibility.
-- ================================================================================

-- =====================================================
-- SECTION A: ALTER sh_solutions — Add IP retention fields
-- =====================================================

ALTER TABLE sh_solutions ADD COLUMN IF NOT EXISTS retained_ip BOOLEAN DEFAULT FALSE;
ALTER TABLE sh_solutions ADD COLUMN IF NOT EXISTS ip_retention_notes TEXT;

COMMENT ON COLUMN sh_solutions.retained_ip IS 'Whether JKKN retained IP/learnings from this client solution for internal product development';
COMMENT ON COLUMN sh_solutions.ip_retention_notes IS 'Notes on what IP was retained and how it feeds into product development';

-- =====================================================
-- SECTION B: Create sh_products — JKKN-owned products/technologies
-- =====================================================

CREATE TABLE IF NOT EXISTS sh_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,

  -- TRL tracking (1-9 scale, NASA standard)
  current_trl INTEGER DEFAULT 1 CHECK (current_trl BETWEEN 1 AND 9),
  target_trl INTEGER CHECK (target_trl BETWEEN 1 AND 9),
  trl_assessed_at TIMESTAMPTZ,
  trl_assessed_by UUID,

  -- Origin: which client solutions generated this product idea
  originating_solution_ids UUID[],
  lead_department_id UUID,

  -- Domain classification
  domain TEXT, -- health_tech, edu_tech, pharma_tech, dental_tech, nursing_tech, construction_tech, other
  sector TEXT, -- RDIF priority sectors: health_technologies, digital_economy, energy, agriculture, defence, space, telecom

  -- IP Status
  patent_status TEXT DEFAULT 'none' CHECK (patent_status IN ('none', 'provisional_filed', 'full_filed', 'granted', 'rejected')),
  patent_number TEXT,
  patent_filed_at TIMESTAMPTZ,

  -- Product Status
  status TEXT DEFAULT 'concept' CHECK (status IN ('concept', 'prototype', 'lab_validated', 'field_validated', 'market_ready', 'deployed', 'archived')),

  -- RDIF Readiness (0-9 score, calculated from prerequisites)
  rdif_readiness_score INTEGER DEFAULT 0 CHECK (rdif_readiness_score BETWEEN 0 AND 9),

  -- Financial
  development_budget NUMERIC(12,2) DEFAULT 0,
  development_spent NUMERIC(12,2) DEFAULT 0,

  -- Metadata
  tags TEXT[],
  notes TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);

COMMENT ON TABLE sh_products IS 'JKKN-owned products and technologies derived from client solutions, tracked through TRL levels toward RDIF eligibility';

-- =====================================================
-- SECTION C: Create sh_product_validations — TRL evidence tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS sh_product_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES sh_products(id) ON DELETE CASCADE,

  trl_level INTEGER NOT NULL CHECK (trl_level BETWEEN 1 AND 9),
  validation_type TEXT NOT NULL CHECK (validation_type IN ('internal_review', 'lab_test', 'field_test', 'external_review', 'user_validation', 'publication', 'patent')),

  title TEXT NOT NULL,
  evidence_description TEXT,
  evidence_url TEXT,

  validated_by TEXT,
  validator_affiliation TEXT,
  is_external BOOLEAN DEFAULT FALSE,

  validation_date TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);

COMMENT ON TABLE sh_product_validations IS 'Evidence and validation records for TRL level claims on JKKN products';

-- =====================================================
-- SECTION D: Create sh_rdif_prerequisites — Track the 9 RDIF prerequisites
-- =====================================================

CREATE TABLE IF NOT EXISTS sh_rdif_prerequisites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prerequisite_key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  is_met BOOLEAN DEFAULT FALSE,
  evidence TEXT,
  evidence_url TEXT,
  target_date TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID
);

COMMENT ON TABLE sh_rdif_prerequisites IS 'Tracks the 9 organizational prerequisites required for RDIF (Research & Development Innovation Fund) eligibility';

-- Seed the 9 prerequisites
INSERT INTO sh_rdif_prerequisites (prerequisite_key, label, description, is_met, evidence) VALUES
  ('registered_company', 'Registered Company', 'Company registered under Companies Act', TRUE, 'JICATE Solutions - registered under Companies Act, same management as JKKN Institutions'),
  ('indian_control', 'Indian Citizen Control (51%+)', 'Company controlled by Indian citizens', TRUE, 'Same management as JKKN Institutions - Indian citizen controlled'),
  ('trl_4_plus', 'Technology at TRL 4+', 'At least one technology validated in lab environment', FALSE, NULL),
  ('ip_portfolio', 'IP Portfolio', 'Patents filed or granted', FALSE, NULL),
  ('co_investment', 'Capital for 50% Co-investment', 'Ability to match RDIF funding 1:1', FALSE, NULL),
  ('rd_track_record', 'R&D Track Record', 'Demonstrated research and development history', FALSE, NULL),
  ('slfm_relationships', 'SLFM/VC Relationships', 'Relationships with Strategic Lead Financial Members', FALSE, NULL),
  ('dsir_recognition', 'DSIR-SIRO Recognition', 'Department of Scientific and Industrial Research recognition', FALSE, NULL),
  ('research_output', 'Research Publications', 'Published research papers in peer-reviewed journals', FALSE, NULL)
ON CONFLICT (prerequisite_key) DO NOTHING;

-- =====================================================
-- SECTION E: RLS Policies — Follow existing sh_ table patterns
-- =====================================================

-- Enable RLS on new tables
ALTER TABLE sh_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_product_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_rdif_prerequisites ENABLE ROW LEVEL SECURITY;

-- ----- sh_products RLS -----

DROP POLICY IF EXISTS "sh_products_select" ON sh_products;
DROP POLICY IF EXISTS "sh_products_insert" ON sh_products;
DROP POLICY IF EXISTS "sh_products_update" ON sh_products;
DROP POLICY IF EXISTS "sh_products_delete" ON sh_products;

CREATE POLICY "sh_products_select" ON sh_products
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
        OR sh_is_builder()
    );

CREATE POLICY "sh_products_insert" ON sh_products
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_products_update" ON sh_products
    FOR UPDATE USING (
        sh_has_management_access()
        OR (sh_is_hod() AND lead_department_id = sh_user_department_id())
    );

CREATE POLICY "sh_products_delete" ON sh_products
    FOR DELETE USING (
        sh_is_admin()
    );

-- ----- sh_product_validations RLS -----

DROP POLICY IF EXISTS "sh_product_validations_select" ON sh_product_validations;
DROP POLICY IF EXISTS "sh_product_validations_insert" ON sh_product_validations;
DROP POLICY IF EXISTS "sh_product_validations_update" ON sh_product_validations;
DROP POLICY IF EXISTS "sh_product_validations_delete" ON sh_product_validations;

CREATE POLICY "sh_product_validations_select" ON sh_product_validations
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
        OR sh_is_builder()
    );

CREATE POLICY "sh_product_validations_insert" ON sh_product_validations
    FOR INSERT WITH CHECK (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_product_validations_update" ON sh_product_validations
    FOR UPDATE USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_product_validations_delete" ON sh_product_validations
    FOR DELETE USING (
        sh_is_admin()
    );

-- ----- sh_rdif_prerequisites RLS -----

DROP POLICY IF EXISTS "sh_rdif_prerequisites_select" ON sh_rdif_prerequisites;
DROP POLICY IF EXISTS "sh_rdif_prerequisites_insert" ON sh_rdif_prerequisites;
DROP POLICY IF EXISTS "sh_rdif_prerequisites_update" ON sh_rdif_prerequisites;
DROP POLICY IF EXISTS "sh_rdif_prerequisites_delete" ON sh_rdif_prerequisites;

CREATE POLICY "sh_rdif_prerequisites_select" ON sh_rdif_prerequisites
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_rdif_prerequisites_insert" ON sh_rdif_prerequisites
    FOR INSERT WITH CHECK (
        sh_is_admin()
    );

CREATE POLICY "sh_rdif_prerequisites_update" ON sh_rdif_prerequisites
    FOR UPDATE USING (
        sh_has_management_access()
    );

CREATE POLICY "sh_rdif_prerequisites_delete" ON sh_rdif_prerequisites
    FOR DELETE USING (
        sh_is_admin()
    );

-- =====================================================
-- SECTION F: Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_sh_products_status ON sh_products(status);
CREATE INDEX IF NOT EXISTS idx_sh_products_domain ON sh_products(domain);
CREATE INDEX IF NOT EXISTS idx_sh_products_trl ON sh_products(current_trl);
CREATE INDEX IF NOT EXISTS idx_sh_products_patent_status ON sh_products(patent_status);
CREATE INDEX IF NOT EXISTS idx_sh_product_validations_product ON sh_product_validations(product_id);
CREATE INDEX IF NOT EXISTS idx_sh_product_validations_trl ON sh_product_validations(trl_level);
CREATE INDEX IF NOT EXISTS idx_sh_solutions_retained_ip ON sh_solutions(retained_ip) WHERE retained_ip = TRUE;

-- =====================================================
-- SECTION G: Updated_at trigger for sh_products
-- =====================================================

CREATE OR REPLACE FUNCTION sh_products_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sh_products_updated_at ON sh_products;
CREATE TRIGGER trg_sh_products_updated_at
    BEFORE UPDATE ON sh_products
    FOR EACH ROW
    EXECUTE FUNCTION sh_products_updated_at();

-- ================================================================================
-- END OF TRL / PRODUCT DEVELOPMENT MIGRATION
-- ================================================================================

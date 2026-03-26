-- ================================================================
-- KPI & Impact Framework: KPI Definitions, Measurements, Impact Reports
-- Migration: 20260326000004_ss_kpi_impact
-- Part of Incubation Management Enhancement Phase 4
-- ================================================================

-- 1. KPI Definitions — Catalog of KPIs seeded with DST/MSH/MoE requirements
CREATE TABLE IF NOT EXISTS ss_kpi_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  framework TEXT NOT NULL CHECK (framework IN (
    'dst', 'msh', 'moe_innovation_cell', 'nirf', 'internal', 'custom'
  )),
  category TEXT NOT NULL CHECK (category IN ('input', 'output', 'outcome', 'impact')),
  data_type TEXT NOT NULL CHECK (data_type IN (
    'integer', 'decimal', 'currency', 'percentage', 'boolean', 'text'
  )),
  unit TEXT,
  measurement_method TEXT,
  target_value NUMERIC(15,2),
  target_period TEXT,
  collection_frequency TEXT NOT NULL DEFAULT 'quarterly' CHECK (collection_frequency IN (
    'monthly', 'quarterly', 'annually', 'real_time'
  )),
  source_table TEXT,
  source_query TEXT,
  is_auto_calculated BOOLEAN DEFAULT false,
  relevant_to TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(code, institution_id)
);

ALTER TABLE ss_kpi_definitions ENABLE ROW LEVEL SECURITY;

-- RLS: institution-scoped + super_admin bypass
CREATE POLICY ss_kpi_definitions_select ON ss_kpi_definitions
  FOR SELECT TO authenticated
  USING (
    institution_id IS NULL
    OR institution_id = (SELECT (auth.jwt()->'user_metadata'->>'institution_id')::uuid)
    OR (auth.jwt()->'user_metadata'->>'role')::text = 'super_admin'
  );

CREATE POLICY ss_kpi_definitions_insert ON ss_kpi_definitions
  FOR INSERT TO authenticated
  WITH CHECK (
    institution_id IS NULL
    OR institution_id = (SELECT (auth.jwt()->'user_metadata'->>'institution_id')::uuid)
    OR (auth.jwt()->'user_metadata'->>'role')::text = 'super_admin'
  );

CREATE POLICY ss_kpi_definitions_update ON ss_kpi_definitions
  FOR UPDATE TO authenticated
  USING (
    institution_id IS NULL
    OR institution_id = (SELECT (auth.jwt()->'user_metadata'->>'institution_id')::uuid)
    OR (auth.jwt()->'user_metadata'->>'role')::text = 'super_admin'
  )
  WITH CHECK (
    institution_id IS NULL
    OR institution_id = (SELECT (auth.jwt()->'user_metadata'->>'institution_id')::uuid)
    OR (auth.jwt()->'user_metadata'->>'role')::text = 'super_admin'
  );

CREATE POLICY ss_kpi_definitions_delete ON ss_kpi_definitions
  FOR DELETE TO authenticated
  USING (
    institution_id IS NULL
    OR institution_id = (SELECT (auth.jwt()->'user_metadata'->>'institution_id')::uuid)
    OR (auth.jwt()->'user_metadata'->>'role')::text = 'super_admin'
  );

CREATE POLICY ss_kpi_definitions_service_all ON ss_kpi_definitions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON ss_kpi_definitions TO authenticated;
GRANT ALL ON ss_kpi_definitions TO anon;

CREATE INDEX IF NOT EXISTS idx_ss_kpi_definitions_code ON ss_kpi_definitions(code);
CREATE INDEX IF NOT EXISTS idx_ss_kpi_definitions_framework ON ss_kpi_definitions(framework);
CREATE INDEX IF NOT EXISTS idx_ss_kpi_definitions_category ON ss_kpi_definitions(category);
CREATE INDEX IF NOT EXISTS idx_ss_kpi_definitions_institution ON ss_kpi_definitions(institution_id);
CREATE INDEX IF NOT EXISTS idx_ss_kpi_definitions_active ON ss_kpi_definitions(is_active) WHERE is_active = true;


-- 2. KPI Measurements — Actual KPI values over time
CREATE TABLE IF NOT EXISTS ss_kpi_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id UUID NOT NULL REFERENCES ss_kpi_definitions(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  value NUMERIC(15,2) NOT NULL,
  previous_value NUMERIC(15,2),
  notes TEXT,
  data_source TEXT,
  verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES profiles(id),
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(kpi_id, period_start, period_end, institution_id)
);

ALTER TABLE ss_kpi_measurements ENABLE ROW LEVEL SECURITY;

-- RLS: institution-scoped + super_admin bypass
CREATE POLICY ss_kpi_measurements_select ON ss_kpi_measurements
  FOR SELECT TO authenticated
  USING (
    institution_id IS NULL
    OR institution_id = (SELECT (auth.jwt()->'user_metadata'->>'institution_id')::uuid)
    OR (auth.jwt()->'user_metadata'->>'role')::text = 'super_admin'
  );

CREATE POLICY ss_kpi_measurements_insert ON ss_kpi_measurements
  FOR INSERT TO authenticated
  WITH CHECK (
    institution_id IS NULL
    OR institution_id = (SELECT (auth.jwt()->'user_metadata'->>'institution_id')::uuid)
    OR (auth.jwt()->'user_metadata'->>'role')::text = 'super_admin'
  );

CREATE POLICY ss_kpi_measurements_update ON ss_kpi_measurements
  FOR UPDATE TO authenticated
  USING (
    institution_id IS NULL
    OR institution_id = (SELECT (auth.jwt()->'user_metadata'->>'institution_id')::uuid)
    OR (auth.jwt()->'user_metadata'->>'role')::text = 'super_admin'
  )
  WITH CHECK (
    institution_id IS NULL
    OR institution_id = (SELECT (auth.jwt()->'user_metadata'->>'institution_id')::uuid)
    OR (auth.jwt()->'user_metadata'->>'role')::text = 'super_admin'
  );

CREATE POLICY ss_kpi_measurements_delete ON ss_kpi_measurements
  FOR DELETE TO authenticated
  USING (
    institution_id IS NULL
    OR institution_id = (SELECT (auth.jwt()->'user_metadata'->>'institution_id')::uuid)
    OR (auth.jwt()->'user_metadata'->>'role')::text = 'super_admin'
  );

CREATE POLICY ss_kpi_measurements_service_all ON ss_kpi_measurements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON ss_kpi_measurements TO authenticated;
GRANT ALL ON ss_kpi_measurements TO anon;

CREATE INDEX IF NOT EXISTS idx_ss_kpi_measurements_kpi ON ss_kpi_measurements(kpi_id);
CREATE INDEX IF NOT EXISTS idx_ss_kpi_measurements_period ON ss_kpi_measurements(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_ss_kpi_measurements_institution ON ss_kpi_measurements(institution_id);
CREATE INDEX IF NOT EXISTS idx_ss_kpi_measurements_verified ON ss_kpi_measurements(verified) WHERE verified = false;


-- 3. Impact Reports — Structured reports per stakeholder audience
CREATE TABLE IF NOT EXISTS ss_impact_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_title TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN (
    'annual_report', 'quarterly_report', 'funder_specific', 'nirf_submission', 'custom'
  )),
  target_audience TEXT NOT NULL CHECK (target_audience IN (
    'funders', 'board', 'startups', 'policymakers', 'public', 'custom'
  )),
  period_start DATE,
  period_end DATE,
  executive_summary TEXT,
  startup_highlights JSONB DEFAULT '[]',
  kpi_snapshot JSONB DEFAULT '{}',
  report_url TEXT,
  infographic_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'review', 'approved', 'published'
  )),
  approved_by UUID REFERENCES profiles(id),
  published_at TIMESTAMPTZ,
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ss_impact_reports ENABLE ROW LEVEL SECURITY;

-- RLS: institution-scoped + super_admin bypass
CREATE POLICY ss_impact_reports_select ON ss_impact_reports
  FOR SELECT TO authenticated
  USING (
    institution_id IS NULL
    OR institution_id = (SELECT (auth.jwt()->'user_metadata'->>'institution_id')::uuid)
    OR (auth.jwt()->'user_metadata'->>'role')::text = 'super_admin'
  );

CREATE POLICY ss_impact_reports_insert ON ss_impact_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    institution_id IS NULL
    OR institution_id = (SELECT (auth.jwt()->'user_metadata'->>'institution_id')::uuid)
    OR (auth.jwt()->'user_metadata'->>'role')::text = 'super_admin'
  );

CREATE POLICY ss_impact_reports_update ON ss_impact_reports
  FOR UPDATE TO authenticated
  USING (
    institution_id IS NULL
    OR institution_id = (SELECT (auth.jwt()->'user_metadata'->>'institution_id')::uuid)
    OR (auth.jwt()->'user_metadata'->>'role')::text = 'super_admin'
  )
  WITH CHECK (
    institution_id IS NULL
    OR institution_id = (SELECT (auth.jwt()->'user_metadata'->>'institution_id')::uuid)
    OR (auth.jwt()->'user_metadata'->>'role')::text = 'super_admin'
  );

CREATE POLICY ss_impact_reports_delete ON ss_impact_reports
  FOR DELETE TO authenticated
  USING (
    institution_id IS NULL
    OR institution_id = (SELECT (auth.jwt()->'user_metadata'->>'institution_id')::uuid)
    OR (auth.jwt()->'user_metadata'->>'role')::text = 'super_admin'
  );

CREATE POLICY ss_impact_reports_service_all ON ss_impact_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON ss_impact_reports TO authenticated;
GRANT ALL ON ss_impact_reports TO anon;

CREATE INDEX IF NOT EXISTS idx_ss_impact_reports_type ON ss_impact_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_ss_impact_reports_status ON ss_impact_reports(status);
CREATE INDEX IF NOT EXISTS idx_ss_impact_reports_institution ON ss_impact_reports(institution_id);
CREATE INDEX IF NOT EXISTS idx_ss_impact_reports_period ON ss_impact_reports(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_ss_impact_reports_published ON ss_impact_reports(published_at DESC) WHERE status = 'published';


-- 4. Triggers for updated_at
CREATE TRIGGER update_ss_impact_reports_updated_at
  BEFORE UPDATE ON ss_impact_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- 5. Seed 14 KPI definitions for ALL institutions (CROSS JOIN)
INSERT INTO ss_kpi_definitions (name, code, description, framework, category, data_type, unit, collection_frequency, is_auto_calculated, relevant_to, is_active, institution_id)
SELECT
  kpi.name, kpi.code, kpi.description, kpi.framework, kpi.category,
  kpi.data_type, kpi.unit, kpi.collection_frequency,
  kpi.is_auto_calculated, kpi.relevant_to, true, inst.id
FROM (
  VALUES
    ('Number of startups supported', 'DST_001',
     'Total number of startups that have been incubated/supported',
     'dst', 'output', 'integer', 'startups', 'quarterly', true,
     ARRAY['dst', 'nirf', 'moe_innovation_cell']::text[]),
    ('SC/ST entrepreneurs supported', 'DST_002',
     'Number of SC/ST entrepreneurs supported through incubation programs',
     'dst', 'output', 'integer', 'entrepreneurs', 'quarterly', false,
     ARRAY['dst']::text[]),
    ('Women entrepreneurs supported', 'DST_003',
     'Number of women entrepreneurs supported through incubation programs',
     'dst', 'output', 'integer', 'entrepreneurs', 'quarterly', false,
     ARRAY['dst']::text[]),
    ('Follow-on funds raised', 'DST_004',
     'Total follow-on funding raised by incubated startups (INR)',
     'dst', 'outcome', 'currency', 'INR', 'quarterly', true,
     ARRAY['dst', 'nirf']::text[]),
    ('Patents filed', 'DST_005',
     'Total number of patents filed by incubated startups',
     'dst', 'outcome', 'integer', 'patents', 'quarterly', true,
     ARRAY['dst', 'nirf']::text[]),
    ('Jobs created', 'DST_006',
     'Total direct employment generated by incubated startups',
     'dst', 'impact', 'integer', 'jobs', 'quarterly', true,
     ARRAY['dst', 'nirf']::text[]),
    ('Revenue generated', 'DST_007',
     'Total cumulative revenue generated by incubated startups (INR)',
     'dst', 'impact', 'currency', 'INR', 'quarterly', true,
     ARRAY['dst', 'nirf']::text[]),
    ('Economic contribution', 'DST_008',
     'Estimated economic contribution including indirect employment and tax revenue (INR)',
     'dst', 'impact', 'currency', 'INR', 'annually', false,
     ARRAY['dst']::text[]),
    ('Grant utilization %', 'DST_009',
     'Percentage of total grants utilized effectively',
     'dst', 'input', 'percentage', '%', 'quarterly', false,
     ARRAY['dst']::text[]),
    ('Graduation rate', 'DST_010',
     'Percentage of incubated startups that graduated successfully',
     'dst', 'outcome', 'percentage', '%', 'annually', true,
     ARRAY['dst', 'nirf']::text[]),
    ('Innovation events conducted', 'MOE_001',
     'Number of innovation and entrepreneurship events conducted',
     'moe_innovation_cell', 'output', 'integer', 'events', 'quarterly', false,
     ARRAY['moe_innovation_cell', 'nirf']::text[]),
    ('Students trained', 'MOE_002',
     'Number of students trained in entrepreneurship and innovation programs',
     'moe_innovation_cell', 'output', 'integer', 'students', 'quarterly', false,
     ARRAY['moe_innovation_cell', 'nirf']::text[]),
    ('Faculty trained', 'MOE_003',
     'Number of faculty members trained as mentors or innovation ambassadors',
     'moe_innovation_cell', 'output', 'integer', 'faculty', 'annually', false,
     ARRAY['moe_innovation_cell']::text[]),
    ('Student innovations/startups', 'MOE_004',
     'Number of startups or innovations created by students',
     'moe_innovation_cell', 'output', 'integer', 'startups', 'quarterly', true,
     ARRAY['moe_innovation_cell', 'nirf']::text[])
) AS kpi(name, code, description, framework, category, data_type, unit, collection_frequency, is_auto_calculated, relevant_to)
CROSS JOIN institutions inst
ON CONFLICT (code, institution_id) DO NOTHING;

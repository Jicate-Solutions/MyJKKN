-- Migration: Create Maturity Assessment Tables
-- Purpose: TQM Excellence - 4-stage maturity model with 6 dimensions
-- Date: 2026-02-01
-- Module: maturity-assessment

-- ============================================================
-- Table: maturity_frameworks
-- Purpose: Store the assessment framework configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS maturity_frameworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL DEFAULT 'Excellence Journey',
  description TEXT,
  dimensions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users_profiles(id),
  updated_by UUID REFERENCES users_profiles(id)
);

-- Comment on table
COMMENT ON TABLE maturity_frameworks IS 'Stores maturity assessment framework configurations with customizable dimensions';
COMMENT ON COLUMN maturity_frameworks.dimensions IS 'JSON array of dimension objects with name, description, and stage criteria';

-- ============================================================
-- Table: maturity_assessments
-- Purpose: Store individual maturity assessments
-- ============================================================
CREATE TABLE IF NOT EXISTS maturity_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  framework_id UUID NOT NULL REFERENCES maturity_frameworks(id) ON DELETE RESTRICT,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  assessment_date DATE NOT NULL,
  assessor_id UUID REFERENCES users_profiles(id) ON DELETE SET NULL,
  dimension_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  overall_stage INTEGER NOT NULL CHECK (overall_stage >= 1 AND overall_stage <= 4),
  evidence TEXT,
  improvement_plan TEXT,
  target_stage INTEGER CHECK (target_stage IS NULL OR (target_stage >= 1 AND target_stage <= 4)),
  target_date DATE,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'archived')),
  reviewed_by UUID REFERENCES users_profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users_profiles(id),
  updated_by UUID REFERENCES users_profiles(id)
);

-- Comments on table
COMMENT ON TABLE maturity_assessments IS 'Individual maturity assessments for departments or institution-wide';
COMMENT ON COLUMN maturity_assessments.dimension_scores IS 'JSON object mapping dimension names to scores (1-4)';
COMMENT ON COLUMN maturity_assessments.overall_stage IS 'Calculated as floor(average of dimension scores)';

-- ============================================================
-- Table: maturity_progress
-- Purpose: Track improvement action items
-- ============================================================
CREATE TABLE IF NOT EXISTS maturity_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES maturity_assessments(id) ON DELETE CASCADE,
  action_item VARCHAR(500) NOT NULL,
  dimension VARCHAR(50) NOT NULL,
  target_stage INTEGER NOT NULL CHECK (target_stage >= 1 AND target_stage <= 4),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  assigned_to UUID REFERENCES users_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users_profiles(id),
  updated_by UUID REFERENCES users_profiles(id)
);

-- Comment on table
COMMENT ON TABLE maturity_progress IS 'Improvement action items linked to maturity assessments';

-- ============================================================
-- Table: maturity_evidence
-- Purpose: Store evidence documents for assessments
-- ============================================================
CREATE TABLE IF NOT EXISTS maturity_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES maturity_assessments(id) ON DELETE CASCADE,
  dimension VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_url TEXT,
  file_type VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users_profiles(id)
);

-- Comment on table
COMMENT ON TABLE maturity_evidence IS 'Evidence documents supporting maturity assessment scores';

-- ============================================================
-- Indexes for Performance
-- ============================================================

-- Framework indexes
CREATE INDEX IF NOT EXISTS idx_maturity_frameworks_institution
  ON maturity_frameworks(institution_id);
CREATE INDEX IF NOT EXISTS idx_maturity_frameworks_active
  ON maturity_frameworks(is_active) WHERE is_active = true;

-- Assessment indexes
CREATE INDEX IF NOT EXISTS idx_maturity_assessments_institution
  ON maturity_assessments(institution_id);
CREATE INDEX IF NOT EXISTS idx_maturity_assessments_department
  ON maturity_assessments(department_id);
CREATE INDEX IF NOT EXISTS idx_maturity_assessments_date
  ON maturity_assessments(assessment_date DESC);
CREATE INDEX IF NOT EXISTS idx_maturity_assessments_status
  ON maturity_assessments(status);
CREATE INDEX IF NOT EXISTS idx_maturity_assessments_framework
  ON maturity_assessments(framework_id);
CREATE INDEX IF NOT EXISTS idx_maturity_assessments_assessor
  ON maturity_assessments(assessor_id);

-- Progress indexes
CREATE INDEX IF NOT EXISTS idx_maturity_progress_assessment
  ON maturity_progress(assessment_id);
CREATE INDEX IF NOT EXISTS idx_maturity_progress_status
  ON maturity_progress(status);
CREATE INDEX IF NOT EXISTS idx_maturity_progress_due_date
  ON maturity_progress(due_date) WHERE status NOT IN ('completed');
CREATE INDEX IF NOT EXISTS idx_maturity_progress_assigned
  ON maturity_progress(assigned_to);
CREATE INDEX IF NOT EXISTS idx_maturity_progress_dimension
  ON maturity_progress(dimension);

-- Evidence indexes
CREATE INDEX IF NOT EXISTS idx_maturity_evidence_assessment
  ON maturity_evidence(assessment_id);
CREATE INDEX IF NOT EXISTS idx_maturity_evidence_dimension
  ON maturity_evidence(dimension);

-- ============================================================
-- Unique Constraints
-- ============================================================

-- One active framework per institution
CREATE UNIQUE INDEX IF NOT EXISTS idx_maturity_frameworks_institution_active
  ON maturity_frameworks(institution_id)
  WHERE is_active = true;

-- ============================================================
-- Triggers for updated_at
-- ============================================================

-- Trigger function (reuse if exists)
CREATE OR REPLACE FUNCTION update_maturity_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS trigger_maturity_frameworks_updated_at ON maturity_frameworks;
CREATE TRIGGER trigger_maturity_frameworks_updated_at
  BEFORE UPDATE ON maturity_frameworks
  FOR EACH ROW EXECUTE FUNCTION update_maturity_updated_at();

DROP TRIGGER IF EXISTS trigger_maturity_assessments_updated_at ON maturity_assessments;
CREATE TRIGGER trigger_maturity_assessments_updated_at
  BEFORE UPDATE ON maturity_assessments
  FOR EACH ROW EXECUTE FUNCTION update_maturity_updated_at();

DROP TRIGGER IF EXISTS trigger_maturity_progress_updated_at ON maturity_progress;
CREATE TRIGGER trigger_maturity_progress_updated_at
  BEFORE UPDATE ON maturity_progress
  FOR EACH ROW EXECUTE FUNCTION update_maturity_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

-- Enable RLS
ALTER TABLE maturity_frameworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE maturity_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE maturity_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE maturity_evidence ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies for maturity_frameworks
-- ============================================================

-- Select: Users can view frameworks for their institution
DROP POLICY IF EXISTS "Users can view frameworks for their institution" ON maturity_frameworks;
CREATE POLICY "Users can view frameworks for their institution"
  ON maturity_frameworks
  FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE profile_id = auth.uid()
    )
  );

-- Insert: Admins can create frameworks
DROP POLICY IF EXISTS "Admins can create frameworks" ON maturity_frameworks;
CREATE POLICY "Admins can create frameworks"
  ON maturity_frameworks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      JOIN users_profiles up ON up.id = uia.profile_id
      WHERE uia.profile_id = auth.uid()
        AND uia.institution_id = maturity_frameworks.institution_id
        AND up.role IN ('super_admin', 'admin', 'principal')
    )
  );

-- Update: Admins can update frameworks
DROP POLICY IF EXISTS "Admins can update frameworks" ON maturity_frameworks;
CREATE POLICY "Admins can update frameworks"
  ON maturity_frameworks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      JOIN users_profiles up ON up.id = uia.profile_id
      WHERE uia.profile_id = auth.uid()
        AND uia.institution_id = maturity_frameworks.institution_id
        AND up.role IN ('super_admin', 'admin', 'principal')
    )
  );

-- Delete: Super admins can delete frameworks
DROP POLICY IF EXISTS "Super admins can delete frameworks" ON maturity_frameworks;
CREATE POLICY "Super admins can delete frameworks"
  ON maturity_frameworks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users_profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- ============================================================
-- RLS Policies for maturity_assessments
-- ============================================================

-- Select: Users can view assessments for their institution
DROP POLICY IF EXISTS "Users can view assessments for their institution" ON maturity_assessments;
CREATE POLICY "Users can view assessments for their institution"
  ON maturity_assessments
  FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE profile_id = auth.uid()
    )
  );

-- Insert: Staff can create assessments
DROP POLICY IF EXISTS "Staff can create assessments" ON maturity_assessments;
CREATE POLICY "Staff can create assessments"
  ON maturity_assessments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      JOIN users_profiles up ON up.id = uia.profile_id
      WHERE uia.profile_id = auth.uid()
        AND uia.institution_id = maturity_assessments.institution_id
        AND up.role NOT IN ('student', 'parent')
    )
  );

-- Update: Staff can update their own draft assessments, admins can update all
DROP POLICY IF EXISTS "Staff can update assessments" ON maturity_assessments;
CREATE POLICY "Staff can update assessments"
  ON maturity_assessments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      JOIN users_profiles up ON up.id = uia.profile_id
      WHERE uia.profile_id = auth.uid()
        AND uia.institution_id = maturity_assessments.institution_id
        AND (
          -- Assessor can update their own drafts
          (assessor_id = auth.uid() AND status = 'draft')
          -- Admins can update any
          OR up.role IN ('super_admin', 'admin', 'principal')
        )
    )
  );

-- Delete: Admins can delete assessments
DROP POLICY IF EXISTS "Admins can delete assessments" ON maturity_assessments;
CREATE POLICY "Admins can delete assessments"
  ON maturity_assessments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      JOIN users_profiles up ON up.id = uia.profile_id
      WHERE uia.profile_id = auth.uid()
        AND uia.institution_id = maturity_assessments.institution_id
        AND up.role IN ('super_admin', 'admin', 'principal')
    )
  );

-- ============================================================
-- RLS Policies for maturity_progress
-- ============================================================

-- Select: Users can view progress for assessments they can see
DROP POLICY IF EXISTS "Users can view progress items" ON maturity_progress;
CREATE POLICY "Users can view progress items"
  ON maturity_progress
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM maturity_assessments ma
      JOIN user_institution_access uia ON uia.institution_id = ma.institution_id
      WHERE ma.id = maturity_progress.assessment_id
        AND uia.profile_id = auth.uid()
    )
  );

-- Insert: Staff can create progress items
DROP POLICY IF EXISTS "Staff can create progress items" ON maturity_progress;
CREATE POLICY "Staff can create progress items"
  ON maturity_progress
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM maturity_assessments ma
      JOIN user_institution_access uia ON uia.institution_id = ma.institution_id
      JOIN users_profiles up ON up.id = uia.profile_id
      WHERE ma.id = maturity_progress.assessment_id
        AND uia.profile_id = auth.uid()
        AND up.role NOT IN ('student', 'parent')
    )
  );

-- Update: Staff can update progress items
DROP POLICY IF EXISTS "Staff can update progress items" ON maturity_progress;
CREATE POLICY "Staff can update progress items"
  ON maturity_progress
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM maturity_assessments ma
      JOIN user_institution_access uia ON uia.institution_id = ma.institution_id
      JOIN users_profiles up ON up.id = uia.profile_id
      WHERE ma.id = maturity_progress.assessment_id
        AND uia.profile_id = auth.uid()
        AND up.role NOT IN ('student', 'parent')
    )
  );

-- Delete: Admins can delete progress items
DROP POLICY IF EXISTS "Admins can delete progress items" ON maturity_progress;
CREATE POLICY "Admins can delete progress items"
  ON maturity_progress
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM maturity_assessments ma
      JOIN user_institution_access uia ON uia.institution_id = ma.institution_id
      JOIN users_profiles up ON up.id = uia.profile_id
      WHERE ma.id = maturity_progress.assessment_id
        AND uia.profile_id = auth.uid()
        AND up.role IN ('super_admin', 'admin', 'principal')
    )
  );

-- ============================================================
-- RLS Policies for maturity_evidence
-- ============================================================

-- Select: Users can view evidence for assessments they can see
DROP POLICY IF EXISTS "Users can view evidence" ON maturity_evidence;
CREATE POLICY "Users can view evidence"
  ON maturity_evidence
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM maturity_assessments ma
      JOIN user_institution_access uia ON uia.institution_id = ma.institution_id
      WHERE ma.id = maturity_evidence.assessment_id
        AND uia.profile_id = auth.uid()
    )
  );

-- Insert: Staff can add evidence
DROP POLICY IF EXISTS "Staff can add evidence" ON maturity_evidence;
CREATE POLICY "Staff can add evidence"
  ON maturity_evidence
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM maturity_assessments ma
      JOIN user_institution_access uia ON uia.institution_id = ma.institution_id
      JOIN users_profiles up ON up.id = uia.profile_id
      WHERE ma.id = maturity_evidence.assessment_id
        AND uia.profile_id = auth.uid()
        AND up.role NOT IN ('student', 'parent')
    )
  );

-- Delete: Admins can delete evidence
DROP POLICY IF EXISTS "Admins can delete evidence" ON maturity_evidence;
CREATE POLICY "Admins can delete evidence"
  ON maturity_evidence
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM maturity_assessments ma
      JOIN user_institution_access uia ON uia.institution_id = ma.institution_id
      JOIN users_profiles up ON up.id = uia.profile_id
      WHERE ma.id = maturity_evidence.assessment_id
        AND uia.profile_id = auth.uid()
        AND up.role IN ('super_admin', 'admin', 'principal')
    )
  );

-- ============================================================
-- Seed Default Framework Function
-- ============================================================

CREATE OR REPLACE FUNCTION create_default_maturity_framework(p_institution_id UUID)
RETURNS UUID AS $$
DECLARE
  v_framework_id UUID;
  v_default_dimensions JSONB;
BEGIN
  -- Check if framework already exists
  SELECT id INTO v_framework_id
  FROM maturity_frameworks
  WHERE institution_id = p_institution_id AND is_active = true;

  IF v_framework_id IS NOT NULL THEN
    RETURN v_framework_id;
  END IF;

  -- Default dimensions based on TQM Excellence Model
  v_default_dimensions := '[
    {
      "name": "Leadership",
      "description": "Leadership commitment to excellence and transformation",
      "stage_1_criteria": "Reactive response to issues only, no visible commitment",
      "stage_2_criteria": "Sponsors some improvement initiatives occasionally",
      "stage_3_criteria": "Actively involved in quality reviews and planning",
      "stage_4_criteria": "Drives transformation, visible commitment, role model"
    },
    {
      "name": "Strategy",
      "description": "Strategic alignment of improvement efforts with organizational goals",
      "stage_1_criteria": "No clear goals or metrics defined",
      "stage_2_criteria": "Goals defined but not systematically tracked",
      "stage_3_criteria": "Goals linked to KPIs with regular review cycles",
      "stage_4_criteria": "Fully integrated strategic planning with continuous alignment"
    },
    {
      "name": "People",
      "description": "Staff capability development and engagement",
      "stage_1_criteria": "No formal training or development programs",
      "stage_2_criteria": "Ad-hoc training programs conducted occasionally",
      "stage_3_criteria": "Structured development plans for all staff",
      "stage_4_criteria": "Continuous learning culture with career pathways"
    },
    {
      "name": "Processes",
      "description": "Process documentation, standardization, and optimization",
      "stage_1_criteria": "No documented processes, ad-hoc operations",
      "stage_2_criteria": "Some key processes documented",
      "stage_3_criteria": "All processes documented with SLAs and monitoring",
      "stage_4_criteria": "Automated, optimized, and continuously improved"
    },
    {
      "name": "Resources",
      "description": "Data-driven decision making and resource optimization",
      "stage_1_criteria": "No systematic data collection or analysis",
      "stage_2_criteria": "Basic metrics tracked manually",
      "stage_3_criteria": "Comprehensive KPIs with dashboards and reports",
      "stage_4_criteria": "Predictive analytics with real-time insights"
    },
    {
      "name": "Results",
      "description": "Stakeholder engagement, satisfaction, and outcomes",
      "stage_1_criteria": "Complaints handled reactively, no measurement",
      "stage_2_criteria": "Feedback collected occasionally",
      "stage_3_criteria": "NPS tracked with action plans created",
      "stage_4_criteria": "Proactive engagement, high satisfaction, outcomes tracked"
    }
  ]'::jsonb;

  -- Create the framework
  INSERT INTO maturity_frameworks (
    institution_id,
    name,
    description,
    dimensions,
    is_active
  ) VALUES (
    p_institution_id,
    'Excellence Journey',
    'Based on TQM International Education Excellence Model - 4-stage maturity assessment',
    v_default_dimensions,
    true
  )
  RETURNING id INTO v_framework_id;

  RETURN v_framework_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment on function
COMMENT ON FUNCTION create_default_maturity_framework IS 'Creates the default TQM Excellence maturity framework for an institution';

-- ============================================================
-- Helper Function: Calculate Overall Stage
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_maturity_overall_stage(p_dimension_scores JSONB)
RETURNS INTEGER AS $$
DECLARE
  v_total INTEGER := 0;
  v_count INTEGER := 0;
  v_score INTEGER;
  v_key TEXT;
BEGIN
  FOR v_key IN SELECT jsonb_object_keys(p_dimension_scores)
  LOOP
    v_score := (p_dimension_scores->>v_key)::INTEGER;
    IF v_score IS NOT NULL AND v_score >= 1 AND v_score <= 4 THEN
      v_total := v_total + v_score;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    RETURN 1;
  END IF;

  -- Return floor of average
  RETURN FLOOR(v_total::DECIMAL / v_count);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Comment on function
COMMENT ON FUNCTION calculate_maturity_overall_stage IS 'Calculates overall maturity stage as floor of dimension score average';

-- ============================================================
-- Trigger: Auto-calculate overall_stage on insert/update
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_calculate_maturity_stage()
RETURNS TRIGGER AS $$
BEGIN
  NEW.overall_stage := calculate_maturity_overall_stage(NEW.dimension_scores);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_maturity_assessments_calculate_stage ON maturity_assessments;
CREATE TRIGGER trigger_maturity_assessments_calculate_stage
  BEFORE INSERT OR UPDATE OF dimension_scores ON maturity_assessments
  FOR EACH ROW EXECUTE FUNCTION trigger_calculate_maturity_stage();

-- ============================================================
-- View: Maturity Dashboard Summary
-- ============================================================

CREATE OR REPLACE VIEW maturity_dashboard_summary AS
SELECT
  ma.institution_id,
  i.name AS institution_name,
  d.id AS department_id,
  d.name AS department_name,
  ma.id AS assessment_id,
  ma.assessment_date,
  ma.overall_stage,
  ma.dimension_scores,
  ma.status,
  ma.target_stage,
  ma.target_date,
  -- Progress summary
  (
    SELECT COUNT(*)
    FROM maturity_progress mp
    WHERE mp.assessment_id = ma.id
  ) AS total_actions,
  (
    SELECT COUNT(*)
    FROM maturity_progress mp
    WHERE mp.assessment_id = ma.id AND mp.status = 'completed'
  ) AS completed_actions,
  (
    SELECT COUNT(*)
    FROM maturity_progress mp
    WHERE mp.assessment_id = ma.id
      AND mp.status NOT IN ('completed')
      AND mp.due_date < CURRENT_DATE
  ) AS overdue_actions
FROM maturity_assessments ma
JOIN institutions i ON i.id = ma.institution_id
LEFT JOIN departments d ON d.id = ma.department_id
WHERE ma.status = 'approved'
ORDER BY ma.institution_id, ma.assessment_date DESC;

COMMENT ON VIEW maturity_dashboard_summary IS 'Summary view for maturity assessment dashboard';

-- ============================================================
-- Grant Permissions
-- ============================================================

GRANT SELECT ON maturity_dashboard_summary TO authenticated;
GRANT EXECUTE ON FUNCTION create_default_maturity_framework TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_maturity_overall_stage TO authenticated;

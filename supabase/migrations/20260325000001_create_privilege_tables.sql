-- Migration: Create Exceptions & Privileges Module Tables
-- Date: 2026-03-25
-- Description: 6 tables for privilege group management, member tracking, and review audit trail
-- Tables: privilege_types, privilege_groups, privilege_group_types, privilege_members, privilege_reviews, privilege_progress_reports

-- ============================================================================
-- 1. privilege_types — extensible type registry
-- ============================================================================
CREATE TABLE privilege_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'academic' CHECK (category IN ('academic', 'financial', 'facility', 'other')),
  is_system BOOLEAN NOT NULL DEFAULT false,
  config_schema JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(institution_id, key)
);

-- ============================================================================
-- 2. privilege_groups
-- ============================================================================
CREATE TABLE privilege_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  reference_code TEXT NOT NULL,
  semester_id UUID,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'archived')),
  is_template BOOLEAN NOT NULL DEFAULT false,
  template_name TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. privilege_group_types — many-to-many join
-- ============================================================================
CREATE TABLE privilege_group_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES privilege_groups(id) ON DELETE CASCADE,
  type_id UUID NOT NULL REFERENCES privilege_types(id) ON DELETE CASCADE,
  config JSONB DEFAULT '{}',
  UNIQUE(group_id, type_id)
);

-- ============================================================================
-- 4. privilege_members
-- ============================================================================
CREATE TABLE privilege_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES privilege_groups(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'under_review', 'revoked')),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES profiles(id),
  revoke_reason TEXT,
  review_notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 5. privilege_reviews
-- ============================================================================
CREATE TABLE privilege_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES privilege_groups(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES profiles(id),
  review_date DATE NOT NULL DEFAULT CURRENT_DATE,
  members_reviewed INTEGER NOT NULL DEFAULT 0,
  members_kept INTEGER NOT NULL DEFAULT 0,
  members_revoked INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 6. privilege_progress_reports (V1.1 schema, created now)
-- ============================================================================
CREATE TABLE privilege_progress_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES privilege_members(id) ON DELETE CASCADE,
  report_month DATE NOT NULL,
  app_url TEXT,
  github_url TEXT,
  description TEXT,
  screenshot_url TEXT,
  auto_signals JSONB DEFAULT '{}',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id, report_month)
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_privilege_types_institution ON privilege_types(institution_id);
CREATE INDEX idx_privilege_groups_institution ON privilege_groups(institution_id);
CREATE INDEX idx_privilege_groups_status ON privilege_groups(status);
CREATE INDEX idx_privilege_groups_semester ON privilege_groups(semester_id);
CREATE INDEX idx_privilege_group_types_group ON privilege_group_types(group_id);
CREATE INDEX idx_privilege_group_types_type ON privilege_group_types(type_id);
CREATE INDEX idx_privilege_members_group ON privilege_members(group_id);
CREATE INDEX idx_privilege_members_learner ON privilege_members(learner_id);
CREATE INDEX idx_privilege_members_status ON privilege_members(status);
CREATE INDEX idx_privilege_members_active ON privilege_members(learner_id) WHERE status = 'active';
CREATE INDEX idx_privilege_reviews_group ON privilege_reviews(group_id);
CREATE INDEX idx_privilege_progress_reports_member ON privilege_progress_reports(member_id);

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION update_privilege_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_privilege_groups_updated_at
  BEFORE UPDATE ON privilege_groups
  FOR EACH ROW EXECUTE FUNCTION update_privilege_updated_at();

CREATE TRIGGER trigger_privilege_members_updated_at
  BEFORE UPDATE ON privilege_members
  FOR EACH ROW EXECUTE FUNCTION update_privilege_updated_at();

-- ============================================================================
-- RLS: privilege_types (has institution_id)
-- ============================================================================
ALTER TABLE privilege_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "privilege_types_select_policy" ON privilege_types
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role = 'super_admin' OR profiles.institution_id = privilege_types.institution_id)
    )
  );

CREATE POLICY "privilege_types_insert_policy" ON privilege_types
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role = 'super_admin' OR (profiles.role IN ('admin') AND profiles.institution_id = privilege_types.institution_id))
    )
  );

CREATE POLICY "privilege_types_update_policy" ON privilege_types
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role = 'super_admin' OR (profiles.role IN ('admin') AND profiles.institution_id = privilege_types.institution_id))
    )
  );

CREATE POLICY "privilege_types_delete_policy" ON privilege_types
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role = 'super_admin' OR (profiles.role IN ('admin') AND profiles.institution_id = privilege_types.institution_id))
    )
  );

-- ============================================================================
-- RLS: privilege_groups (has institution_id)
-- ============================================================================
ALTER TABLE privilege_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "privilege_groups_select_policy" ON privilege_groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role = 'super_admin' OR profiles.institution_id = privilege_groups.institution_id)
    )
  );

CREATE POLICY "privilege_groups_insert_policy" ON privilege_groups
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role = 'super_admin' OR (profiles.role IN ('admin') AND profiles.institution_id = privilege_groups.institution_id))
    )
  );

CREATE POLICY "privilege_groups_update_policy" ON privilege_groups
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role = 'super_admin' OR (profiles.role IN ('admin') AND profiles.institution_id = privilege_groups.institution_id))
    )
  );

CREATE POLICY "privilege_groups_delete_policy" ON privilege_groups
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role = 'super_admin' OR (profiles.role IN ('admin') AND profiles.institution_id = privilege_groups.institution_id))
    )
  );

-- ============================================================================
-- RLS: privilege_group_types (no institution_id — join through privilege_groups)
-- ============================================================================
ALTER TABLE privilege_group_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "privilege_group_types_select_policy" ON privilege_group_types
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM privilege_groups pg
      JOIN profiles p ON p.id = auth.uid()
      WHERE pg.id = privilege_group_types.group_id
      AND (p.role = 'super_admin' OR p.institution_id = pg.institution_id)
    )
  );

CREATE POLICY "privilege_group_types_insert_policy" ON privilege_group_types
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM privilege_groups pg
      JOIN profiles p ON p.id = auth.uid()
      WHERE pg.id = privilege_group_types.group_id
      AND (p.role = 'super_admin' OR (p.role IN ('admin') AND p.institution_id = pg.institution_id))
    )
  );

CREATE POLICY "privilege_group_types_update_policy" ON privilege_group_types
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM privilege_groups pg
      JOIN profiles p ON p.id = auth.uid()
      WHERE pg.id = privilege_group_types.group_id
      AND (p.role = 'super_admin' OR (p.role IN ('admin') AND p.institution_id = pg.institution_id))
    )
  );

CREATE POLICY "privilege_group_types_delete_policy" ON privilege_group_types
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM privilege_groups pg
      JOIN profiles p ON p.id = auth.uid()
      WHERE pg.id = privilege_group_types.group_id
      AND (p.role = 'super_admin' OR (p.role IN ('admin') AND p.institution_id = pg.institution_id))
    )
  );

-- ============================================================================
-- RLS: privilege_members (has group_id — join through privilege_groups)
-- Also: learners can read their own rows
-- ============================================================================
ALTER TABLE privilege_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "privilege_members_select_policy" ON privilege_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM privilege_groups pg
      JOIN profiles p ON p.id = auth.uid()
      WHERE pg.id = privilege_members.group_id
      AND (p.role = 'super_admin' OR p.institution_id = pg.institution_id)
    )
  );

CREATE POLICY "privilege_members_learner_select" ON privilege_members
  FOR SELECT USING (learner_id = auth.uid());

CREATE POLICY "privilege_members_insert_policy" ON privilege_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM privilege_groups pg
      JOIN profiles p ON p.id = auth.uid()
      WHERE pg.id = privilege_members.group_id
      AND (p.role = 'super_admin' OR (p.role IN ('admin') AND p.institution_id = pg.institution_id))
    )
  );

CREATE POLICY "privilege_members_update_policy" ON privilege_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM privilege_groups pg
      JOIN profiles p ON p.id = auth.uid()
      WHERE pg.id = privilege_members.group_id
      AND (p.role = 'super_admin' OR (p.role IN ('admin') AND p.institution_id = pg.institution_id))
    )
  );

CREATE POLICY "privilege_members_delete_policy" ON privilege_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM privilege_groups pg
      JOIN profiles p ON p.id = auth.uid()
      WHERE pg.id = privilege_members.group_id
      AND (p.role = 'super_admin' OR (p.role IN ('admin') AND p.institution_id = pg.institution_id))
    )
  );

-- ============================================================================
-- RLS: privilege_reviews (no institution_id — join through privilege_groups)
-- ============================================================================
ALTER TABLE privilege_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "privilege_reviews_select_policy" ON privilege_reviews
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM privilege_groups pg
      JOIN profiles p ON p.id = auth.uid()
      WHERE pg.id = privilege_reviews.group_id
      AND (p.role = 'super_admin' OR p.institution_id = pg.institution_id)
    )
  );

CREATE POLICY "privilege_reviews_insert_policy" ON privilege_reviews
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM privilege_groups pg
      JOIN profiles p ON p.id = auth.uid()
      WHERE pg.id = privilege_reviews.group_id
      AND (p.role = 'super_admin' OR (p.role IN ('admin') AND p.institution_id = pg.institution_id))
    )
  );

CREATE POLICY "privilege_reviews_update_policy" ON privilege_reviews
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM privilege_groups pg
      JOIN profiles p ON p.id = auth.uid()
      WHERE pg.id = privilege_reviews.group_id
      AND (p.role = 'super_admin' OR (p.role IN ('admin') AND p.institution_id = pg.institution_id))
    )
  );

CREATE POLICY "privilege_reviews_delete_policy" ON privilege_reviews
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM privilege_groups pg
      JOIN profiles p ON p.id = auth.uid()
      WHERE pg.id = privilege_reviews.group_id
      AND (p.role = 'super_admin' OR (p.role IN ('admin') AND p.institution_id = pg.institution_id))
    )
  );

-- ============================================================================
-- RLS: privilege_progress_reports (no institution_id — join through privilege_members → privilege_groups)
-- Also: learners can read their own reports and insert their own reports
-- ============================================================================
ALTER TABLE privilege_progress_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "privilege_progress_reports_select_policy" ON privilege_progress_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM privilege_members pm
      JOIN privilege_groups pg ON pg.id = pm.group_id
      JOIN profiles p ON p.id = auth.uid()
      WHERE pm.id = privilege_progress_reports.member_id
      AND (p.role = 'super_admin' OR p.institution_id = pg.institution_id)
    )
  );

CREATE POLICY "privilege_progress_reports_learner_select" ON privilege_progress_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM privilege_members
      WHERE privilege_members.id = privilege_progress_reports.member_id
      AND privilege_members.learner_id = auth.uid()
    )
  );

CREATE POLICY "privilege_progress_reports_insert_policy" ON privilege_progress_reports
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM privilege_members pm
      JOIN privilege_groups pg ON pg.id = pm.group_id
      JOIN profiles p ON p.id = auth.uid()
      WHERE pm.id = privilege_progress_reports.member_id
      AND (p.role = 'super_admin' OR (p.role IN ('admin') AND p.institution_id = pg.institution_id))
    )
  );

CREATE POLICY "privilege_progress_reports_learner_insert" ON privilege_progress_reports
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM privilege_members
      WHERE privilege_members.id = privilege_progress_reports.member_id
      AND privilege_members.learner_id = auth.uid()
    )
  );

CREATE POLICY "privilege_progress_reports_update_policy" ON privilege_progress_reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM privilege_members pm
      JOIN privilege_groups pg ON pg.id = pm.group_id
      JOIN profiles p ON p.id = auth.uid()
      WHERE pm.id = privilege_progress_reports.member_id
      AND (p.role = 'super_admin' OR (p.role IN ('admin') AND p.institution_id = pg.institution_id))
    )
  );

CREATE POLICY "privilege_progress_reports_delete_policy" ON privilege_progress_reports
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM privilege_members pm
      JOIN privilege_groups pg ON pg.id = pm.group_id
      JOIN profiles p ON p.id = auth.uid()
      WHERE pm.id = privilege_progress_reports.member_id
      AND (p.role = 'super_admin' OR (p.role IN ('admin') AND p.institution_id = pg.institution_id))
    )
  );

-- ============================================================================
-- SEED DATA: Core privilege types for test institution
-- ============================================================================
INSERT INTO privilege_types (institution_id, key, name, description, category, is_system) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'full_od', 'Full OD (On-Duty)', 'Auto-mark all attendance periods as On-Duty', 'academic', true),
  ('a1111111-1111-1111-1111-111111111111', 'full_marks', 'Full Internal Marks', 'Auto-fill all CIA components to maximum score', 'academic', true),
  ('a1111111-1111-1111-1111-111111111111', 'scholarship', 'Scholarship', 'Scholarship eligibility and tracking', 'financial', true),
  ('a1111111-1111-1111-1111-111111111111', 'funding', 'Funding Support', 'Institutional funding support tracking', 'financial', true);

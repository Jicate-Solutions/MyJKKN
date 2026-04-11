-- Migration: Add dynamic sub-categories for leave/onduty applications
-- Created: 2026-04-11
-- Purpose: Replace hard-coded LEAVE_SUB_CATEGORIES / ONDUTY_SUB_CATEGORIES constants
--          with an admin-manageable DB table, scoped per institution.
--
-- Strategy:
--   - New table leave_onduty_sub_categories stores dynamic list
--   - leave_onduty_applications.sub_category and leave_onduty_approval_flows.sub_category
--     remain as `text` — they store the `code` value from this new table
--   - Existing data is unaffected; existing constants ('casual', 'medical',
--     'event_participation', 'club_activities') are seeded into every institution
--   - If DB rows are empty, frontend falls back to the hard-coded constants

-- ============================================================================
-- 0. PREREQUISITE ENUM (safe on environments that already have it)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leave_onduty_category') THEN
    CREATE TYPE leave_onduty_category AS ENUM ('leave', 'onduty');
  END IF;
END $$;

-- ============================================================================
-- 1. TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS leave_onduty_sub_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  category leave_onduty_category NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_onduty_sub_categories_unique
    UNIQUE (institution_id, category, code),
  CONSTRAINT leave_onduty_sub_categories_code_format
    CHECK (code ~ '^[a-z0-9_]+$' AND length(code) BETWEEN 2 AND 64),
  CONSTRAINT leave_onduty_sub_categories_name_length
    CHECK (length(name) BETWEEN 2 AND 100)
);

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_leave_onduty_sub_categories_institution
  ON leave_onduty_sub_categories (institution_id, category, is_active);

CREATE INDEX IF NOT EXISTS idx_leave_onduty_sub_categories_code
  ON leave_onduty_sub_categories (code);

-- ============================================================================
-- 3. AUTO-UPDATE updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_leave_onduty_sub_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leave_onduty_sub_categories_updated_at
  ON leave_onduty_sub_categories;
CREATE TRIGGER trg_leave_onduty_sub_categories_updated_at
  BEFORE UPDATE ON leave_onduty_sub_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_leave_onduty_sub_categories_updated_at();

-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE leave_onduty_sub_categories ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated users can view sub-categories in their institution
-- (super admins see all institutions)
DROP POLICY IF EXISTS "sub_categories_select" ON leave_onduty_sub_categories;
CREATE POLICY "sub_categories_select" ON leave_onduty_sub_categories
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'super_admin'
          OR p.is_super_admin = true
          OR p.institution_id = leave_onduty_sub_categories.institution_id
        )
    )
  );

-- INSERT: super admins + institution admins + HODs + principals
DROP POLICY IF EXISTS "sub_categories_insert" ON leave_onduty_sub_categories;
CREATE POLICY "sub_categories_insert" ON leave_onduty_sub_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'super_admin'
          OR p.is_super_admin = true
          OR (
            p.role IN ('admin', 'institution_admin', 'hod', 'principal')
            AND p.institution_id = leave_onduty_sub_categories.institution_id
          )
        )
    )
  );

-- UPDATE: same roles as INSERT
DROP POLICY IF EXISTS "sub_categories_update" ON leave_onduty_sub_categories;
CREATE POLICY "sub_categories_update" ON leave_onduty_sub_categories
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'super_admin'
          OR p.is_super_admin = true
          OR (
            p.role IN ('admin', 'institution_admin', 'hod', 'principal')
            AND p.institution_id = leave_onduty_sub_categories.institution_id
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'super_admin'
          OR p.is_super_admin = true
          OR (
            p.role IN ('admin', 'institution_admin', 'hod', 'principal')
            AND p.institution_id = leave_onduty_sub_categories.institution_id
          )
        )
    )
  );

-- DELETE: same roles as INSERT
DROP POLICY IF EXISTS "sub_categories_delete" ON leave_onduty_sub_categories;
CREATE POLICY "sub_categories_delete" ON leave_onduty_sub_categories
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'super_admin'
          OR p.is_super_admin = true
          OR (
            p.role IN ('admin', 'institution_admin', 'hod', 'principal')
            AND p.institution_id = leave_onduty_sub_categories.institution_id
          )
        )
    )
  );

-- ============================================================================
-- 5. SEED: default sub-categories for every existing institution
-- ============================================================================

INSERT INTO leave_onduty_sub_categories (institution_id, category, code, name, description)
SELECT i.id, 'leave'::leave_onduty_category, 'casual', 'Casual Leave', 'General-purpose casual leave'
FROM institutions i
ON CONFLICT (institution_id, category, code) DO NOTHING;

INSERT INTO leave_onduty_sub_categories (institution_id, category, code, name, description)
SELECT i.id, 'leave'::leave_onduty_category, 'medical', 'Medical Leave', 'Medical leave (may require documentation)'
FROM institutions i
ON CONFLICT (institution_id, category, code) DO NOTHING;

INSERT INTO leave_onduty_sub_categories (institution_id, category, code, name, description)
SELECT i.id, 'onduty'::leave_onduty_category, 'event_participation', 'Event Participation', 'Official event participation'
FROM institutions i
ON CONFLICT (institution_id, category, code) DO NOTHING;

INSERT INTO leave_onduty_sub_categories (institution_id, category, code, name, description)
SELECT i.id, 'onduty'::leave_onduty_category, 'club_activities', 'Club Activities', 'Club-related activities'
FROM institutions i
ON CONFLICT (institution_id, category, code) DO NOTHING;

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON TABLE leave_onduty_sub_categories IS
  'Admin-manageable sub-categories for leave/onduty applications. Replaces hard-coded constants. Scoped per institution.';

COMMENT ON COLUMN leave_onduty_sub_categories.code IS
  'Slug-style identifier (lowercase letters, digits, underscores). Stored in leave_onduty_applications.sub_category and leave_onduty_approval_flows.sub_category.';

COMMENT ON COLUMN leave_onduty_sub_categories.is_active IS
  'Inactive rows are hidden from new-application dropdowns but remain for historical references.';

-- ─── Admission Packages v2 ───────────────────────────────────────────────────
-- Restructures admission_packages to mirror the fee-structure dimension model:
-- each package is scoped to a combination of eligibility dimensions
-- (institution, admission year, degree, dept, programme, quota, gender) so
-- that the right package surfaces automatically for the right student profile.
--
-- Changes from v1 (2026052905000_admission_packages.sql):
--   1. DROP total_price_inr  — pricing moved out of package definition
--   2. ADD dimension FKs     — admission_year, degree, dept, programme, quota,
--                               gender, mess_category, package_type
--   3. NEW junction table    — admission_package_communities (multi-community,
--                               mirrors admission_fee_structure_communities)
--   4. Retire programme-eligibility junction — programme_id is now a direct FK
--      on the package row (NULL = all programmes). Existing junction rows are
--      left in place but the app no longer writes new ones.
-- ─────────────────────────────────────────────────────────────────────────────

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Alter admission_packages
-- ══════════════════════════════════════════════════════════════════════════════

-- 1a. Drop price column (make nullable first so existing rows aren't blocked)
ALTER TABLE admission_packages
  ALTER COLUMN total_price_inr DROP NOT NULL;

ALTER TABLE admission_packages
  DROP COLUMN total_price_inr;

-- 1b. Add dimension FKs and new fields
--     All FK dimension columns are nullable: NULL = "any / not scoped"
ALTER TABLE admission_packages
  ADD COLUMN IF NOT EXISTS admission_year_id  uuid        REFERENCES admission_years(id),
  ADD COLUMN IF NOT EXISTS degree_id          uuid        REFERENCES degrees(id),
  ADD COLUMN IF NOT EXISTS department_id      uuid        REFERENCES departments(id),
  ADD COLUMN IF NOT EXISTS programme_id       uuid        REFERENCES programs(id),
  ADD COLUMN IF NOT EXISTS quota_id           uuid        REFERENCES quotas(id),
  ADD COLUMN IF NOT EXISTS gender             text        CHECK (gender IN ('MALE', 'FEMALE')),
  ADD COLUMN IF NOT EXISTS mess_category_id   uuid        REFERENCES mess_categories(id),
  ADD COLUMN IF NOT EXISTS package_type       text        NOT NULL DEFAULT 'package'
                                                          CHECK (package_type IN ('package', 'non_package'));

COMMENT ON COLUMN admission_packages.admission_year_id IS
  'NULL = applies to any admission year.';
COMMENT ON COLUMN admission_packages.degree_id IS
  'NULL = applies to any degree in the institution.';
COMMENT ON COLUMN admission_packages.department_id IS
  'NULL = applies to any department under the selected degree.';
COMMENT ON COLUMN admission_packages.programme_id IS
  'NULL = applies to all programmes. Replaces the admission_package_program_eligibility junction (v1).';
COMMENT ON COLUMN admission_packages.quota_id IS
  'NULL = applies to any quota.';
COMMENT ON COLUMN admission_packages.gender IS
  'NULL = any gender. MALE / FEMALE for gender-specific packages.';
COMMENT ON COLUMN admission_packages.mess_category_id IS
  'The mess category bundled with this package. NULL = not specified (learner override on assignment still applies).';
COMMENT ON COLUMN admission_packages.package_type IS
  'package = bundled room+mess deal; non_package = eligibility marker only.';

-- 1c. Updated composite index covering the new dimension columns
DROP INDEX IF EXISTS idx_admission_packages_inst_year;

CREATE INDEX IF NOT EXISTS idx_admission_packages_dims
  ON admission_packages (institution_id, admission_year_id, degree_id, department_id, programme_id, is_active);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Community junction table
--    One package → many community_categories (mirrors admission_fee_structure_communities)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS admission_package_communities (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id            uuid        NOT NULL REFERENCES admission_packages(id) ON DELETE CASCADE,
  community_category_id uuid        NOT NULL REFERENCES community_categories(id) ON DELETE CASCADE,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid        REFERENCES profiles(id),
  CONSTRAINT uq_pkg_community UNIQUE (package_id, community_category_id)
);

CREATE INDEX IF NOT EXISTS idx_pkg_communities_pkg
  ON admission_package_communities (package_id);

COMMENT ON TABLE admission_package_communities IS
  'Multi-community scope for an admission package. No rows = applies to all communities.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. RLS for admission_package_communities
--    read = all authenticated; write = super_admin / admin
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE admission_package_communities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admission_package_communities_select"
  ON admission_package_communities FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admission_package_communities_insert"
  ON admission_package_communities FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "admission_package_communities_delete"
  ON admission_package_communities FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

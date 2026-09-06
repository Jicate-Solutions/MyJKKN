-- ─── Admission packages substrate ───────────────────────────────────────
-- Locked decisions 2026-05-28 (12, 13, 14, 15, 5):
--   (12) Admission owns the package PRICE; Campus Living owns the package
--        CONTENTS (which categories are bundled). This table lives in the
--        campus-living schema but the price column is "Admission-owned".
--   (13) Every package's room component = CLASSIC. Premium is NEVER bundled
--        (Premium is always an opt-in upgrade). Enforced SOFTLY: the admin UI
--        restricts the room_category_id dropdown to Classic-tier categories
--        (hostel_categories.name ILIKE 'classic%'). A hard DB CHECK is not
--        possible because hostel_categories is a global lookup whose Classic
--        rows differ per gender (boys/girls) and could be renamed; the soft
--        rule + this comment is the contract. See admin UI restriction.
--   (14) Package price is a single flat number (total_price_inr); the bundled
--        components are hidden from the learner.
--   (15) Mess choice is DECOUPLED — the learner picks a mess category
--        separately at admission. Stored on learner_package_assignment, NOT on
--        the package definition.
--   (5)  When a learner has a package, allocation uses it (Classic room) + the
--        learner's separately-chosen mess. The getPackageForLearner resolver
--        feeds the allocation flow (PR γ).
--
-- Conventions mirror hostel_program_room_eligibility (PR β) + hostel_years
-- (Boobalan): is_active, created_at/updated_at, the shared
-- update_updated_at_column() trigger, RLS read=authenticated /
-- write=admin+super_admin via profiles.role, audit columns created_by/updated_by.
--
-- NOTE (Boobalan schema overlap): learners_profiles currently carries
-- hostel_category_id + mess_category_id (Boobalan's in-progress learner-tab
-- rework) but NO package_id column. To avoid colliding with his in-flight
-- migrations we keep the learner↔package link in a SEPARATE table
-- (learner_package_assignment) rather than adding a column to learners_profiles.

-- ─── Table 1: package definitions ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS admission_packages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   uuid        NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  hostel_year_id   uuid        REFERENCES hostel_years(id),       -- packages scoped to a hostel year
  name             text        NOT NULL,
  description      text        NULL,
  total_price_inr  integer     NOT NULL CHECK (total_price_inr >= 0),  -- single flat price (decision 14); Admission owns this number
  room_category_id uuid        NOT NULL REFERENCES hostel_categories(id),  -- bundled room (Classic; decision 13). Campus Living owns CONTENTS.
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid        REFERENCES profiles(id),
  updated_by       uuid        REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_admission_packages_inst_year
  ON admission_packages (institution_id, hostel_year_id, is_active);

COMMENT ON COLUMN admission_packages.total_price_inr IS
  'Single flat package price in INR. Admission module owns this number (decision 12/14).';
COMMENT ON COLUMN admission_packages.room_category_id IS
  'Bundled room category. MUST be a Classic-tier category (decision 13); enforced softly in the admin UI dropdown.';

-- ─── Table 2: per-program availability ──────────────────────────────────
-- Which programs may be offered this package. Mirror PR β's eligibility shape:
-- a row with program_id = NULL means "available to all programs in the
-- institution"; a row with a concrete program_id scopes availability to it.
CREATE TABLE IF NOT EXISTS admission_package_program_eligibility (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id  uuid        NOT NULL REFERENCES admission_packages(id) ON DELETE CASCADE,
  program_id  uuid        REFERENCES programs(id) ON DELETE CASCADE,  -- NULL = all programs in institution
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES profiles(id),
  CONSTRAINT uq_pkg_prog_elig UNIQUE (package_id, program_id)
);

-- Partial unique so the package "all programs" default (program_id IS NULL) is
-- deduped (the table-level UNIQUE treats NULLs as distinct).
CREATE UNIQUE INDEX IF NOT EXISTS uq_pkg_prog_elig_default
  ON admission_package_program_eligibility (package_id)
  WHERE program_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pkg_prog_elig_program
  ON admission_package_program_eligibility (program_id);

-- ─── Table 3: learner ↔ package assignment ──────────────────────────────
-- One package assignment per learner per hostel year. chosen_mess_category_id
-- holds the learner's DECOUPLED mess choice (decision 15) made at admission.
CREATE TABLE IF NOT EXISTS learner_package_assignment (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id              uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  package_id              uuid        NOT NULL REFERENCES admission_packages(id),
  hostel_year_id          uuid        REFERENCES hostel_years(id),
  chosen_mess_category_id uuid        REFERENCES mess_categories(id),  -- decoupled mess choice (decision 15)
  assigned_at             timestamptz NOT NULL DEFAULT now(),
  created_by              uuid        REFERENCES profiles(id),
  CONSTRAINT uq_learner_pkg_year UNIQUE (learner_id, hostel_year_id)
);

CREATE INDEX IF NOT EXISTS idx_learner_pkg_assignment_learner
  ON learner_package_assignment (learner_id, hostel_year_id);

COMMENT ON COLUMN learner_package_assignment.learner_id IS
  'profiles.id of the learner. The MyJKKN identity chain is auth.users.id == profiles.id == learner_id used by allocation search.';

-- ─── updated_at trigger (shared fn from 00_master_setup.sql) ─────────────
CREATE TRIGGER trg_admission_packages_updated_at
  BEFORE UPDATE ON admission_packages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════
-- RLS: read = all authenticated, write = super_admin/admin
-- ═══════════════════════════════════════════════════════════════════════

-- ─── admission_packages ─────────────────────────────────────────────────
ALTER TABLE admission_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admission_packages_select"
  ON admission_packages FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admission_packages_insert"
  ON admission_packages FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "admission_packages_update"
  ON admission_packages FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "admission_packages_delete"
  ON admission_packages FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- ─── admission_package_program_eligibility ──────────────────────────────
ALTER TABLE admission_package_program_eligibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admission_package_program_eligibility_select"
  ON admission_package_program_eligibility FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admission_package_program_eligibility_insert"
  ON admission_package_program_eligibility FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "admission_package_program_eligibility_delete"
  ON admission_package_program_eligibility FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- ─── learner_package_assignment ─────────────────────────────────────────
ALTER TABLE learner_package_assignment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "learner_package_assignment_select"
  ON learner_package_assignment FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "learner_package_assignment_insert"
  ON learner_package_assignment FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "learner_package_assignment_update"
  ON learner_package_assignment FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "learner_package_assignment_delete"
  ON learner_package_assignment FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

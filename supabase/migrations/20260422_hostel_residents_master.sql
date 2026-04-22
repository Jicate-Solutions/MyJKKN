-- Migration: hostel_residents master table (Campus Living Allocations — Path 2, PR-1 of 4)
-- Created: 2026-04-22
--
-- WHY: hostel_allocations.learner_id was learner-only, blocking non-learner residents
--      (staff, international students, married couples, visitors, other). This migration
--      introduces a master hostel_residents table that classifies any MyJKKN user as a
--      hostel resident with a discriminated resident_type. hostel_allocations.resident_id
--      (new, nullable) points here; learner_id (existing) stays as a transition column
--      and becomes nullable — for learner residents, both are populated; for non-learner
--      residents, only resident_id is set.
--
-- Design note (Q1 value-list principle): resident_type is an ENUM, not a CRUDable master
-- table. The six values are structural discriminators with business logic attached to each
-- (learner → links to learner profile + academic record; staff → links via HR; etc.), not
-- user-tunable labels. Contrast with hostel_leave_types which IS CRUDable (wardens add
-- custom codes).
--
-- Residents are ALWAYS existing MyJKKN users — profile_id is NOT NULL. No new auth.users
-- rows are created; this is classification, not identity.

-- ─── ENUM ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hostel_resident_type_enum') THEN
    CREATE TYPE hostel_resident_type_enum AS ENUM (
      'learner', 'staff', 'international', 'married', 'visitor', 'other'
    );
  END IF;
END$$;

-- ─── TABLE: hostel_residents ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hostel_residents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  resident_type hostel_resident_type_enum NOT NULL,
  id_proof_type TEXT,
  id_proof_number TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT hostel_residents_one_per_institution UNIQUE (institution_id, profile_id)
);

-- ─── INDEXES ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_hostel_residents_institution
  ON hostel_residents(institution_id);

CREATE INDEX IF NOT EXISTS idx_hostel_residents_profile
  ON hostel_residents(profile_id);

CREATE INDEX IF NOT EXISTS idx_hostel_residents_type
  ON hostel_residents(resident_type);

CREATE INDEX IF NOT EXISTS idx_hostel_residents_active
  ON hostel_residents(is_active) WHERE is_active = true;

-- ─── TRIGGER: updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_hostel_residents_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_hostel_residents_updated_at ON hostel_residents;
CREATE TRIGGER tr_hostel_residents_updated_at
  BEFORE UPDATE ON hostel_residents
  FOR EACH ROW
  EXECUTE FUNCTION set_hostel_residents_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE hostel_residents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hostel_residents_select_permission ON hostel_residents;
CREATE POLICY hostel_residents_select_permission ON hostel_residents
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.residents.view')
        AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hostel_residents_insert_permission ON hostel_residents;
CREATE POLICY hostel_residents_insert_permission ON hostel_residents
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.residents.create')
        AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hostel_residents_update_permission ON hostel_residents;
CREATE POLICY hostel_residents_update_permission ON hostel_residents
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.residents.edit')
        AND role_has_institution_access(institution_id))
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.residents.edit')
        AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hostel_residents_delete_permission ON hostel_residents;
CREATE POLICY hostel_residents_delete_permission ON hostel_residents
  FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.residents.delete')
        AND role_has_institution_access(institution_id))
  );

-- ─── ALTER hostel_allocations: add resident_id, relax learner_id NOT NULL ──
ALTER TABLE hostel_allocations
  ADD COLUMN IF NOT EXISTS resident_id UUID REFERENCES hostel_residents(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_hostel_allocations_resident
  ON hostel_allocations(resident_id);

-- Safe: hostel_allocations has 0 rows on prod (verified 2026-04-22).
-- Non-learner residents will have learner_id NULL going forward.
ALTER TABLE hostel_allocations ALTER COLUMN learner_id DROP NOT NULL;

-- Safety net: every allocation must have at least one of resident_id or learner_id.
-- Learner allocations populate both; non-learner populate resident_id only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hostel_allocations_resident_or_learner_required'
  ) THEN
    ALTER TABLE hostel_allocations
      ADD CONSTRAINT hostel_allocations_resident_or_learner_required
      CHECK (resident_id IS NOT NULL OR learner_id IS NOT NULL);
  END IF;
END$$;

-- ─── COMMENTS ───────────────────────────────────────────────────────────────
COMMENT ON TABLE hostel_residents IS
  'Master table for hostel residents (Path 2). Classifies any MyJKKN user (via profile_id) as a resident with a discriminated resident_type. hostel_allocations.resident_id FKs here.';

COMMENT ON COLUMN hostel_residents.profile_id IS
  'FK to profiles.id. All residents are existing MyJKKN users — no new auth.users rows are created via this table.';

COMMENT ON COLUMN hostel_residents.resident_type IS
  'Structural discriminator. Fixed 6 values — NOT a CRUDable master (see migration header for Q1 justification).';

COMMENT ON COLUMN hostel_allocations.resident_id IS
  'FK to hostel_residents.id (Path 2). Populated for all new allocations. Legacy learner_id remains for backward compatibility and learner-specific joins.';

COMMENT ON COLUMN hostel_allocations.learner_id IS
  'FK to profiles.id. Now NULLABLE (PR-1, 2026-04-22) — populated only when resident_type=''learner''. For non-learner residents, use resident_id.';

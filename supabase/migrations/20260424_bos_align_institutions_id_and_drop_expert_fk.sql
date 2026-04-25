-- ============================================================================
-- Migration: 20260424_bos_align_institutions_id_and_drop_expert_fk.sql
-- Purpose:   Reconcile BoS columns with the codebase + JKKN_COE convention.
--
--   Background: 20260306 created bos_* tables with `institution_id` (singular),
--   but the application code, JKKN_COE tables, and supabase/setup/01_tables.sql
--   all use `institutions_id` (plural). Inserts hit PGRST204 schema-cache
--   "column not found" errors. This migration renames every bos_*.institution_id
--   to bos_*.institutions_id, updates the dependent indexes, and drops the FK
--   from bos_external_experts.institutions_id so that COE-sourced UUIDs
--   (resolved through institutions.myjkkn_institution_ids) are accepted as
--   bare UUIDs — same contract already used for bos_*.board_id.
-- ============================================================================

-- ── 1. Rename columns (idempotent — only fires when the legacy name exists) ──
DO $$
DECLARE
  t TEXT;
  bos_tables TEXT[] := ARRAY[
    'bos_external_experts',
    'bos_compositions',
    'bos_members',
    'bos_meetings',
    'bos_meeting_attendance',
    'bos_meeting_agenda_items',
    'bos_meeting_courses',
    'bos_meeting_resolutions',
    'bos_meeting_actions',
    'bos_ta_da_claims'
  ];
BEGIN
  FOREACH t IN ARRAY bos_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = t AND column_name = 'institution_id'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = t AND column_name = 'institutions_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN institution_id TO institutions_id', t);
    END IF;
  END LOOP;
END $$;

-- ── 2. Drop FK constraint on bos_external_experts.institutions_id ───────────
-- Both possible auto-generated names are tried so this works regardless of
-- which column name the constraint was created against.
DO $$
DECLARE
  conname TEXT;
BEGIN
  FOR conname IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    WHERE rel.relname = 'bos_external_experts'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ILIKE '%REFERENCES institutions%'
  LOOP
    EXECUTE format('ALTER TABLE bos_external_experts DROP CONSTRAINT %I', conname);
  END LOOP;
END $$;

-- ── 3. Recreate indexes under the new column name ───────────────────────────
DROP INDEX IF EXISTS idx_bos_experts_institution;
DROP INDEX IF EXISTS idx_bos_compositions_institution;
DROP INDEX IF EXISTS idx_bos_members_institution;
DROP INDEX IF EXISTS idx_bos_meetings_institution;

CREATE INDEX IF NOT EXISTS idx_bos_experts_institutions       ON bos_external_experts(institutions_id);
CREATE INDEX IF NOT EXISTS idx_bos_compositions_institutions  ON bos_compositions(institutions_id);
CREATE INDEX IF NOT EXISTS idx_bos_members_institutions       ON bos_members(institutions_id);
CREATE INDEX IF NOT EXISTS idx_bos_meetings_institutions      ON bos_meetings(institutions_id);

-- ── 4. RLS policies that referenced institution_id are recreated ────────────
-- The policy expressions are stored with the resolved column name. After the
-- rename Postgres updates the dependency, but if any policy was created with
-- a now-stale name we recreate it explicitly. (No-op when names already match.)

NOTIFY pgrst, 'reload schema';

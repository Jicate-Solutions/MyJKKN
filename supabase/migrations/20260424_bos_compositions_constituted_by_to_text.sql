-- ============================================================================
-- Migration: 20260424_bos_compositions_constituted_by_to_text.sql
-- Purpose:   Convert bos_compositions.constituted_by from UUID FK→staff to a
--            free-text VARCHAR(255).
--
--   The form has always been a plain text input ("Principal / Academic
--   Council / Vice Chancellor") — these are role/body labels, not specific
--   staff records, so the FK was a design mismatch. Inserts were failing with:
--     ERROR: invalid input syntax for type uuid: "Principal"
-- ============================================================================

-- 1. Drop the FK constraint (works regardless of auto-generated name)
DO $$
DECLARE
  conname TEXT;
BEGIN
  FOR conname IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    WHERE rel.relname = 'bos_compositions'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ILIKE '%constituted_by%REFERENCES staff%'
  LOOP
    EXECUTE format('ALTER TABLE bos_compositions DROP CONSTRAINT %I', conname);
  END LOOP;
END $$;

-- 2. Convert UUID → VARCHAR(255) (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bos_compositions'
      AND column_name = 'constituted_by'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE bos_compositions
      ALTER COLUMN constituted_by TYPE VARCHAR(255) USING constituted_by::TEXT;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Phase 1: admission_lead_sources_master cleanup + dynamic-source extensions
-- ============================================================================
-- Goal:
--   1. Reconcile master.key with lead_source enum (currently 8 ghost keys with
--      0 leads but 44 counselor mappings each = 352 seed-fan-out junction rows)
--   2. Add enum_value column so the master row's routing target is explicit and
--      multiple master rows can share an enum (custom rows under same enum)
--   3. Add date-window + cap + pause columns on admission_counselor_sources to
--      power Phase 3 advanced assignment UI
--
-- Context (verified Phase 0):
--   - 0 NULL-source leads (no backfill risk on admission_leads)
--   - All 880 junction rows are 44-counselor x 20-master fan-out (seed data)
--   - Only 12 of 20 master rows have enum-aligned keys; deleting the 8 ghosts
--     removes 352 junction rows via ON DELETE CASCADE — confirmed seed-only
--   - admission.settings.sources.{view,manage} permission keys already exist
--     in custom_roles.permissions JSONB; no permission seeding needed
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Delete 8 ghost master rows (keys not in lead_source enum)
--    Cascade auto-removes 352 junction rows on admission_counselor_sources
-- ----------------------------------------------------------------------------
DELETE FROM admission_lead_sources_master
WHERE key NOT IN (
  SELECT e.enumlabel
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'lead_source'
);

-- ----------------------------------------------------------------------------
-- 2. Insert missing master rows for gate_entry + whatsapp enum values
-- ----------------------------------------------------------------------------
INSERT INTO admission_lead_sources_master
  (key, label, description, display_order, is_active, is_system, institution_id)
VALUES
  ('gate_entry', 'Gate Entry',
   'Walk-in lead captured at the institution gate kiosk',
   55, true, true, NULL),
  ('whatsapp', 'WhatsApp',
   'Lead captured via WhatsApp (inbound message or campaign reply)',
   45, true, true, NULL)
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Add enum_value column on master, backfill from key, lock to NOT NULL
-- ----------------------------------------------------------------------------
ALTER TABLE admission_lead_sources_master
  ADD COLUMN IF NOT EXISTS enum_value lead_source;

UPDATE admission_lead_sources_master
SET enum_value = key::lead_source
WHERE enum_value IS NULL;

ALTER TABLE admission_lead_sources_master
  ALTER COLUMN enum_value SET NOT NULL;

-- Allow only one SYSTEM master row per enum_value within an institution scope.
-- Custom (non-system) rows can stack on the same enum_value (e.g. multiple
-- "Education Fair" sub-rows: "Trichy Expo Oct'26", "Coimbatore Expo Nov'26").
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_sources_master_system_enum
  ON admission_lead_sources_master (COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid), enum_value)
  WHERE is_system = true;

CREATE INDEX IF NOT EXISTS idx_lead_sources_master_enum_value
  ON admission_lead_sources_master (enum_value);

COMMENT ON COLUMN admission_lead_sources_master.enum_value IS
  'lead_source enum literal this master row routes to. Multiple non-system master rows may share an enum_value to provide finer business-level granularity.';

-- ----------------------------------------------------------------------------
-- 4. Extend admission_counselor_sources for date-window + cap + pause routing
-- ----------------------------------------------------------------------------
ALTER TABLE admission_counselor_sources
  ADD COLUMN IF NOT EXISTS priority_weight numeric(4,2) NOT NULL DEFAULT 1.00
    CHECK (priority_weight >= 0 AND priority_weight <= 10),
  ADD COLUMN IF NOT EXISTS max_leads_per_day integer
    CHECK (max_leads_per_day IS NULL OR max_leads_per_day > 0),
  ADD COLUMN IF NOT EXISTS effective_from timestamptz,
  ADD COLUMN IF NOT EXISTS effective_to   timestamptz,
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;

ALTER TABLE admission_counselor_sources
  DROP CONSTRAINT IF EXISTS chk_counselor_sources_window_order;

ALTER TABLE admission_counselor_sources
  ADD CONSTRAINT chk_counselor_sources_window_order
  CHECK (effective_from IS NULL OR effective_to IS NULL OR effective_from < effective_to);

CREATE INDEX IF NOT EXISTS idx_counselor_sources_active_window
  ON admission_counselor_sources (source_id, counselor_id)
  WHERE is_paused = false;

COMMENT ON COLUMN admission_counselor_sources.priority_weight IS
  'Weight for weighted-pick assignment strategies (0.0-10.0, default 1.0). Higher = more leads routed here.';
COMMENT ON COLUMN admission_counselor_sources.max_leads_per_day IS
  'Daily cap on auto-assigned leads from this source. NULL = unlimited.';
COMMENT ON COLUMN admission_counselor_sources.effective_from IS
  'Start of assignment window (inclusive). NULL = active immediately.';
COMMENT ON COLUMN admission_counselor_sources.effective_to IS
  'End of assignment window (exclusive). NULL = no expiry.';
COMMENT ON COLUMN admission_counselor_sources.is_paused IS
  'Manual pause flag — counselor stays mapped but skipped by auto-assignment.';

-- ----------------------------------------------------------------------------
-- 5. Sanity asserts (will raise NOTICE on success, ERROR if invariants broken)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  master_count int;
  ghost_count  int;
  enum_count   int;
BEGIN
  SELECT COUNT(*) INTO master_count FROM admission_lead_sources_master;
  SELECT COUNT(*) INTO ghost_count
    FROM admission_lead_sources_master m
    WHERE m.key NOT IN (
      SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'lead_source'
    );
  SELECT COUNT(*) INTO enum_count
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'lead_source';

  IF ghost_count > 0 THEN
    RAISE EXCEPTION 'Ghost master rows still present: %', ghost_count;
  END IF;
  IF master_count <> enum_count THEN
    RAISE NOTICE 'Master rows (%) <> enum size (%) — expected if custom rows already exist', master_count, enum_count;
  END IF;

  RAISE NOTICE 'Phase 1 OK: master_count=%, enum_count=%, ghosts=%',
    master_count, enum_count, ghost_count;
END $$;

COMMIT;

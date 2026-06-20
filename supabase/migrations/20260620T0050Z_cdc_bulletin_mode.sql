-- 20260620T0050Z_cdc_bulletin_mode.sql
-- 2026-06-20 — BUG-004067: "Post Opportunity" (/cdc/bulletin/new) form does not ask
--   Mode of participation. Add a mode column (Online / Offline / Hybrid) so the
--   bulletin can record how an opportunity is attended.
--
-- Nullable: existing rows predate this field and have no known mode. New posts
--   default to 'offline' (the historical implicit value for most listed events),
--   but the column stays NULLABLE so back-filled/imported rows are not forced.
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded CHECK constraint.

ALTER TABLE public.cdc_external_opportunities
  ADD COLUMN IF NOT EXISTS mode text DEFAULT 'offline';

-- Constrain to the three allowed participation modes. Guarded so re-running
-- the migration does not error on an already-present constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cdc_external_opportunities_mode_check'
      AND conrelid = 'public.cdc_external_opportunities'::regclass
  ) THEN
    ALTER TABLE public.cdc_external_opportunities
      ADD CONSTRAINT cdc_external_opportunities_mode_check
      CHECK (mode IS NULL OR mode IN ('online', 'offline', 'hybrid'));
  END IF;
END $$;

COMMENT ON COLUMN public.cdc_external_opportunities.mode IS
  'Mode of participation: online | offline | hybrid. Nullable for legacy rows; new posts default offline. Added 2026-06-20 (BUG-004067).';

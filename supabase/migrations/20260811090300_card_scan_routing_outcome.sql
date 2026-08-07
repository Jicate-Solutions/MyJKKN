-- Business-card scanner — record WHERE each confirmed card was routed
--
-- Director decision 17 ("ask once, route everywhere") plus decision 18
-- ("half-filled records save, marked 'needs completion — N fields missing',
-- surfaced to the module owner"). Both need somewhere to record the outcome,
-- and `contact_card_scans` already carries one row per confirmed card.
--
-- Also the Director decision of 2026-08-05 on the parent-record problem: three
-- destinations require a row a business card cannot name (event_sponsors needs
-- event_id, the two internship tables need site_id). The user may SKIP that
-- picker, and when they do the contact still saves and the module owner gets a
-- to-do. `routing_status = 'pending_parent'` IS that to-do queue.

BEGIN;

ALTER TABLE public.contact_card_scans
  ADD COLUMN IF NOT EXISTS routed_table   text,
  ADD COLUMN IF NOT EXISTS routed_row_id  text,
  ADD COLUMN IF NOT EXISTS routing_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS pending_parent text,
  ADD COLUMN IF NOT EXISTS missing_fields text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS routing_error  text;

-- Named separately so a re-run does not fail on an existing constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contact_card_scans_routing_status_chk'
  ) THEN
    ALTER TABLE public.contact_card_scans
      ADD CONSTRAINT contact_card_scans_routing_status_chk
      CHECK (routing_status IN ('none', 'routed', 'pending_parent', 'failed'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contact_card_scans_pending_parent_chk'
  ) THEN
    ALTER TABLE public.contact_card_scans
      ADD CONSTRAINT contact_card_scans_pending_parent_chk
      CHECK (pending_parent IS NULL OR pending_parent IN ('event', 'site'));
  END IF;
END $$;

-- The to-do queue the module owner works from: cards that are saved as people
-- but not yet attached to their event or site.
CREATE INDEX IF NOT EXISTS contact_card_scans_pending_idx
  ON public.contact_card_scans (routing_status, routed_table)
  WHERE routing_status IN ('pending_parent', 'failed');

COMMENT ON COLUMN public.contact_card_scans.routing_status IS
  'none = contact book only · routed = module row written · pending_parent = saved but needs an event/site chosen (decision 18 to-do) · failed = the module write errored.';

COMMIT;

-- ROLLBACK
--   ALTER TABLE public.contact_card_scans
--     DROP COLUMN IF EXISTS routed_table, DROP COLUMN IF EXISTS routed_row_id,
--     DROP COLUMN IF EXISTS routing_status, DROP COLUMN IF EXISTS pending_parent,
--     DROP COLUMN IF EXISTS missing_fields, DROP COLUMN IF EXISTS routing_error;
--   DROP INDEX IF EXISTS public.contact_card_scans_pending_idx;
--
-- VERIFY (separate call — the Management API wraps a batch in one transaction)
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'contact_card_scans' AND column_name LIKE 'rout%';

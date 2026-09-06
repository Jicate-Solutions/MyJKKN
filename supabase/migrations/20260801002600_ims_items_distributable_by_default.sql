-- Phase 5e: make every item forwardable between an institution's own stores.
--
-- is_distributable defaulted to false, so ALL 761 JKKN Pharmacy items were
-- false and the Pharmacy warehouse's transfer item picker was empty — the
-- warehouse could not forward anything it owned. (The 164 Dental items were
-- set true during Phase 3/4 testing.)
--
-- "Can this item move between the stores of the institution that owns it?" is
-- true by default; the exceptions (fixed equipment, fixed assets) are rare and
-- can still be marked false one by one. Defaulting it false meant every bulk
-- import silently produced a catalog that could not be distributed, which is
-- the opposite of the warehouse model.
--
-- Blast radius is confined to transfers: is_distributable is read only by the
-- transfer item picker and ims_validate_distributable_items(). POS, GRN,
-- indents and department issues never look at it.

-- Only the DEFAULT changes. An unconditional
--   UPDATE ims_items SET is_distributable = true WHERE is_distributable = false
-- cannot tell "false because the old default made it so" apart from "false
-- because someone deliberately marked this fixed equipment non-transferable",
-- so on any populated database it silently makes the second group forwardable.
--
-- On a fresh database there are no rows to backfill and this is moot. On the
-- JKKN production database the backfill was applied once, on 2026-07-28, to
-- clear the 761 Pharmacy items that were false purely from the old default;
-- any item set false SINCE then is a deliberate choice and must be left alone.
-- Re-running that backfill is therefore never correct.
ALTER TABLE public.ims_items
  ALTER COLUMN is_distributable SET DEFAULT true;

COMMENT ON COLUMN public.ims_items.is_distributable IS
  'May this item be forwarded between stores on a supply transfer? Defaults true; set false for items that must not leave the store holding them (e.g. fixed equipment).';

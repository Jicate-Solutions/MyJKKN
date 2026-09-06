-- Migration: CDC Placement Mode — on_campus / off_campus / walk_in [BUG-004045]
-- Date: 2026-06-29
-- Adds `placement_mode` to cdc_placements: HOW/WHERE the placement happened.
-- Structural enum with an exhaustive 3-value set -> text column + CHECK constraint,
-- NOT a pg enum and NOT a master table (mirrors the project convention for fixed modes).
-- Backfills `walk_in` from the legacy `is_walk_in` boolean so history is preserved;
-- everything else defaults to on_campus. The form keeps is_walk_in in sync going forward.
-- Plain column on an already-RLS'd table -> no grant change (the anon-EXECUTE revoke
-- rule applies to SECURITY DEFINER functions, not columns).

ALTER TABLE public.cdc_placements
  ADD COLUMN IF NOT EXISTS placement_mode text NOT NULL DEFAULT 'on_campus';

ALTER TABLE public.cdc_placements DROP CONSTRAINT IF EXISTS cdc_placements_placement_mode_check;
ALTER TABLE public.cdc_placements
  ADD CONSTRAINT cdc_placements_placement_mode_check
  CHECK (placement_mode = ANY (ARRAY['on_campus'::text, 'off_campus'::text, 'walk_in'::text]));

-- Backfill: existing walk-in placements adopt the new mode; all others stay on_campus.
UPDATE public.cdc_placements SET placement_mode = 'walk_in'
  WHERE is_walk_in = true AND placement_mode = 'on_campus';

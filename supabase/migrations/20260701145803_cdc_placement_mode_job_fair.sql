-- Migration: CDC Placement Mode — add 'job_fair' (Job fair / Career fair) [BUG-004297]
-- Date: 2026-07-01
-- Extends the placement_mode CHECK on cdc_placements from 3 values to 4 so a
-- placement can be recorded as originating from a job fair / career fair, alongside
-- on_campus / off_campus / walk_in (added in 20260629072000_cdc_placement_mode.sql).
-- Structural enum convention: text column + CHECK constraint (NOT a pg enum, NOT a
-- master table). job_fair leaves the legacy is_walk_in boolean false — the form only
-- sets is_walk_in for walk_in — so the drive-required conditional and the NAAC/AICTE
-- export-service (both still read is_walk_in) continue to work unchanged.
-- No SECURITY DEFINER function is added -> no anon EXECUTE revoke needed (that rule
-- applies to functions, not CHECK constraints on an already-RLS'd table).

ALTER TABLE public.cdc_placements DROP CONSTRAINT IF EXISTS cdc_placements_placement_mode_check;
ALTER TABLE public.cdc_placements
  ADD CONSTRAINT cdc_placements_placement_mode_check
  CHECK (placement_mode = ANY (ARRAY['on_campus'::text, 'off_campus'::text, 'walk_in'::text, 'job_fair'::text]));

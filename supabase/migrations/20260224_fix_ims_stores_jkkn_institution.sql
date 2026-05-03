-- Migration: Fix ims_stores institution linkage for JKKN API integration
-- Date: 2026-02-24
-- Problem: institution_id FK references Supabase institutions table,
--          but IMS uses JKKN API institution IDs (different UUID space).
--          This caused FK violations on every store creation.
-- Solution: Drop the FK constraint, keep institution_id as plain UUID,
--           add institution_name TEXT column to snapshot the name at creation.

-- Drop the FK constraint blocking JKKN institution IDs
ALTER TABLE public.ims_stores
  DROP CONSTRAINT IF EXISTS ims_stores_institution_id_fkey;

-- Add institution_name column to snapshot the name (avoids broken JOIN)
ALTER TABLE public.ims_stores
  ADD COLUMN IF NOT EXISTS institution_name TEXT;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';

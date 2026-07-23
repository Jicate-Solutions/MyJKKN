-- Migration: 2026-06-02 19:30
-- Purpose:
--   Drop the admitted_count >= 0 CHECK constraint added in the initial
--   admission_historical_pivot migration (20260602190000).
--
-- Why:
--   The source Google Sheets contain per-day cells with NEGATIVE values
--   ('-1') representing cancellations / corrections. Storing those as
--   negative is the honest representation: cumulative SUM correctly
--   subtracts when computing the day-N trajectory.
--
--   The original CHECK was added defensively before sheet inspection.
--   Importer testing on 2026-06-02 surfaced 356 negative cells across
--   the 4 sub-sheets imported.
--
-- Tier: schema-only, additive (drops a constraint). No data touched.
-- Already applied to production prior to this migration being written.

ALTER TABLE admission_historical_pivot
  DROP CONSTRAINT IF EXISTS admission_historical_pivot_admitted_count_check;

-- Migration: 2026-06-06 02:20 IST
-- Purpose:
--   Restore program-level historical data to admission_historical_pivot (HP).
--   Today's earlier schema collapse (Boobalan's hostel-billing series, commits
--   c0ca8d51f + 982085823 + 46d24bafc) simplified admission_years from
--   per-(institution+program+year) to per-(institution+year). This was right
--   for billing — but it broke HP's program-level granularity through two
--   collateral effects:
--
--   (1) HP rows' admission_year_id was repointed from per-program ay_id to
--       per-institution ay_id, erasing program identity.
--   (2) The pre-existing UNIQUE constraint on (admission_year_id,
--       admission_date) caused conflicts when multiple programs had the same
--       date → ~50% of HP rows were silently dropped during the repoint.
--
--   Result: HP went from 2,462 rows / 117 program-years to 1,221 rows /
--   16 institution-years. Each surviving row arbitrarily inherited ONE
--   program_id's data per institution-year, breaking the YoY trajectory
--   chart's "common-courses" filter for any program that wasn't the
--   "survivor" — e.g., 18 PG specialty programs (MSC Nursing, MPHARM,
--   BSC Allied Health, PHARM D PB) that Director flagged 2026-06-06 02:00 IST.
--
-- Recovery mechanism:
--   The pre-collapse data was preserved in two backup tables
--   created during the collapse process (Boobalan's defense-in-depth):
--     - _bak_admission_historical_pivot_20260605 (2,462 rows)
--     - _bak_admission_years_20260605 (288 rows with original program_id)
--   These are joined to restore each HP row's program_id, then admission_year_id
--   is remapped from the old per-program ay_id to the new per-institution ay_id
--   via (institution_id, year) lookup.
--
-- Schema change rationale:
--   Adding program_id directly to admission_historical_pivot makes HP
--   self-describing — it no longer needs admission_years.program_id (which
--   no longer exists). The new unique constraint (admission_year_id,
--   program_id, admission_date) prevents the collapse-style data loss from
--   happening again if a similar restructure occurs.
--
-- Coordination with Boobalan's hostel-billing work:
--   HP is not touched by any billing flow (verified via codebase grep).
--   Adding a column is backwards-compatible — his queries continue to work.
--   No conflict expected.
--
-- Reversibility:
--   Backup tables (_bak_admission_historical_pivot_20260605 and
--   _bak_admission_years_20260605) remain in place after this migration.
--   To revert: TRUNCATE admission_historical_pivot + re-INSERT from backup
--   without the new mapping.


-- ─── Phase 1: Schema change ───────────────────────────────────────────────
-- Add program_id column with FK to programs.
ALTER TABLE admission_historical_pivot 
  ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id);

-- Drop the old unique constraint that caused the collapse data loss.
ALTER TABLE admission_historical_pivot
  DROP CONSTRAINT IF EXISTS admission_historical_pivot_admission_year_id_admission_date_key;

-- ─── Phase 2: Wipe misattributed current data ─────────────────────────────
TRUNCATE admission_historical_pivot;

-- ─── Phase 3: Restore from backup ─────────────────────────────────────────
-- For each backup HP row, find the corresponding NEW admission_year_id
-- (institution + year) and pull program_id from backup admission_years.
INSERT INTO admission_historical_pivot 
  (admission_year_id, program_id, admission_date, admitted_count, source, imported_at, imported_by)
SELECT 
  new_ay.id          AS admission_year_id,
  bak_ay.program_id  AS program_id,
  hp_bak.admission_date,
  hp_bak.admitted_count,
  hp_bak.source,
  hp_bak.imported_at,
  hp_bak.imported_by
FROM _bak_admission_historical_pivot_20260605 hp_bak
JOIN _bak_admission_years_20260605 bak_ay 
  ON bak_ay.id = hp_bak.admission_year_id
JOIN admission_years new_ay 
  ON new_ay.institution_id = bak_ay.institution_id 
  AND new_ay.year = bak_ay.program_start_year;

-- ─── Phase 4: New unique constraint (program-aware) ───────────────────────
ALTER TABLE admission_historical_pivot
  ADD CONSTRAINT admission_historical_pivot_unique_program_date
  UNIQUE (admission_year_id, program_id, admission_date);

-- ─── Phase 5: Performance index for trajectory queries ────────────────────
CREATE INDEX IF NOT EXISTS idx_admission_historical_pivot_program_year_date
  ON admission_historical_pivot (program_id, admission_year_id, admission_date);

-- ─── Phase 6: Sanity check via RAISE NOTICE ───────────────────────────────
DO $$
DECLARE
  v_total_rows int;
  v_distinct_programs int;
  v_distinct_ay_ids int;
  v_null_program_count int;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT program_id), COUNT(DISTINCT admission_year_id), 
         COUNT(*) FILTER (WHERE program_id IS NULL)
    INTO v_total_rows, v_distinct_programs, v_distinct_ay_ids, v_null_program_count
    FROM admission_historical_pivot;
  RAISE NOTICE 'Restored % rows across % distinct programs and % distinct admission_year_ids. NULL program_id: %', 
    v_total_rows, v_distinct_programs, v_distinct_ay_ids, v_null_program_count;
END $$;


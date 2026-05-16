-- =====================================================================
-- 2026-05-11  Raise counselor max_leads default + backfill all rows
--
-- Previous default of 50 caused 56 of 100 active counselors to be
-- at-or-over their cap, making them invisible to auto-routing and
-- bulk-distribute. Per user requirement, the load/cap feature stays
-- in place but the cap effectively never triggers under realistic load.
-- 5000 is ~17x the current average of 297, providing comfortable
-- headroom while preserving the gate for future tuning.
-- =====================================================================

ALTER TABLE admission_counselors
  ALTER COLUMN max_leads SET DEFAULT 5000;

UPDATE admission_counselors
   SET max_leads = 5000
 WHERE max_leads IS DISTINCT FROM 5000;

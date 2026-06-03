-- Migration: 2026-06-02
-- Purpose:
--   Substrate for the Year-over-Year admission trajectory chart on
--   /admission/group-dashboard?tab=seats (new "YoY" sub-tab).
--
--   Holds AGGREGATE historical admission counts imported from manually-
--   maintained Google Sheets for cycles where learners_profiles is
--   structurally incomplete (notably 2024-25, where Arts & Science Aided,
--   B.Ed, and Nursing admissions were never migrated into MyJKKN — see
--   discovery findings 2026-06-02).
--
--   The YoY RPC (PR 3) UNIONs this table with `learners_profiles` so the
--   chart pulls organic data for 2025-26 + 2026-27 and sheet-imported
--   aggregate for 2024-25. When backfill is later extended to 2024-25
--   per-learner rows, this table can be deprecated; the RPC's UNION
--   degrades gracefully.
--
-- Tier: NEW TABLE, additive only. Zero existing rows touched.
-- Risk: low — table is empty after this migration; no dashboard reads it
--       until PR 3 (RPC) and PR 4 (chart) ship.
-- Reversibility: DROP TABLE admission_historical_pivot; (data is sheet-
--       sourced, re-importable).
--
-- Locked decisions from 2026-06-02 interview with Director:
--   • Day 0 of each cycle = April 1 of cohort's program_start_year
--   • Source of truth for organic years = DB; for 2024-25 = sheet (this table)
--   • Sheet TOTAL ADMITTED is canonical for historical count
--   • Common-courses-only filter applied at RPC layer (PR 3), not here
--   • Auto-roll-forward: comparison set computed from MAX(program_start_year)
--     and prior 2; no config row needed

CREATE TABLE IF NOT EXISTS admission_historical_pivot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_year_id UUID NOT NULL REFERENCES admission_years(id) ON DELETE CASCADE,
  admission_date DATE NOT NULL,
  admitted_count INT NOT NULL CHECK (admitted_count >= 0),
  source TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by TEXT,
  UNIQUE (admission_year_id, admission_date)
);

COMMENT ON TABLE admission_historical_pivot IS
  'Aggregate historical admission counts per (cohort, date) imported from manually-maintained Google Sheets for cycles where learners_profiles is structurally incomplete. UNIONed with learners_profiles in fn_yoy_admission_trajectory.';

COMMENT ON COLUMN admission_historical_pivot.admission_year_id IS
  'FK to admission_years — anchors the row to a specific (institution, program, year) cohort.';
COMMENT ON COLUMN admission_historical_pivot.admission_date IS
  'Calendar date on which N learners were admitted. Day-N-of-cycle is derived at RPC layer (April 1 anchor).';
COMMENT ON COLUMN admission_historical_pivot.admitted_count IS
  'Count of learners admitted on this date for this cohort. Sheet "TOTAL ADMITTED" column sums match SUM(admitted_count) per cohort.';
COMMENT ON COLUMN admission_historical_pivot.source IS
  'Provenance string — e.g. "sheet:2024-25:1cn_sH9..." identifying which sheet revision was the source. Lets us trace any reconciliation discrepancy back to the import.';

CREATE INDEX IF NOT EXISTS idx_admission_historical_pivot_year_date
  ON admission_historical_pivot (admission_year_id, admission_date);

CREATE INDEX IF NOT EXISTS idx_admission_historical_pivot_date
  ON admission_historical_pivot (admission_date);

-- RLS — follows the standardized pattern from CLAUDE.md (super_admin/admin
-- bypass first, then permission + institution-scope check). Reads are
-- allowed for any user with admission.analytics.view who has access to
-- the cohort's institution. Writes (INSERT/UPDATE/DELETE) are admin-only —
-- this table is populated by a one-time import script, not user-facing.
ALTER TABLE admission_historical_pivot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "historical_pivot_select_permission" ON admission_historical_pivot
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('admission.analytics.view')
    AND EXISTS (
      SELECT 1 FROM admission_years ay
      WHERE ay.id = admission_year_id
        AND role_has_institution_access(ay.institution_id)
    )
  )
);

CREATE POLICY "historical_pivot_insert_admin_only" ON admission_historical_pivot
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
);

CREATE POLICY "historical_pivot_update_admin_only" ON admission_historical_pivot
FOR UPDATE USING (
  is_super_admin() OR is_admin()
) WITH CHECK (
  is_super_admin() OR is_admin()
);

CREATE POLICY "historical_pivot_delete_admin_only" ON admission_historical_pivot
FOR DELETE USING (
  is_super_admin() OR is_admin()
);

-- Helper function: cumulative admitted by day-N-of-cycle for a given year.
-- Day-N is computed against April 1 of program_start_year per the Director-
-- locked anchor. Pre-April-1 admissions yield negative day-N (e.g. 2024-25
-- cycle's December 2023 admissions land at day -90 to -120).
--
-- Returns nothing if the cohort year has no rows yet (graceful empty result).
-- The YoY RPC (PR 3) UNIONs this with the equivalent computation over
-- learners_profiles for organic years; consumers see a single trajectory.
CREATE OR REPLACE FUNCTION public._get_historical_admitted_by_day(
  p_year int,
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  day_n int,
  cumulative_admitted bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH daily_totals AS (
    SELECT
      hp.admission_date,
      SUM(hp.admitted_count) AS day_count
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    WHERE ay.program_start_year = p_year
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
    GROUP BY hp.admission_date
  )
  SELECT
    (admission_date - make_date(p_year, 4, 1))::int AS day_n,
    SUM(day_count) OVER (ORDER BY admission_date)::bigint AS cumulative_admitted
  FROM daily_totals
  ORDER BY admission_date;
$$;

COMMENT ON FUNCTION public._get_historical_admitted_by_day(int, uuid) IS
  'Returns cumulative admitted count by day-N-of-cycle (April 1 anchor) for a given program_start_year. Optional institution filter. Powers the YoY trajectory RPC.';

REVOKE ALL ON FUNCTION public._get_historical_admitted_by_day(int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._get_historical_admitted_by_day(int, uuid) TO authenticated;

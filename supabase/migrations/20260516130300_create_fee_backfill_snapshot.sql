-- ============================================================================
-- 20260516130300 — Snapshot table for fee-structure bulk-adopt rollback
-- ============================================================================
-- Phase 6a. Before the bulk-adopt loop in 20260516130400 flips legacy_fee_mode
-- and overwrites fee_items on ~346 admitted+legacy learner rows, capture the
-- pre-state in a permanent snapshot table so a single-statement rollback is
-- always available.
--
-- We snapshot every admitted+legacy row (not just tier1_ready) so the table
-- also serves as a reference for any future Phase 5/6/7 changes to the same
-- universe. Cost: ~500 small rows. Negligible.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.learners_profiles_fee_backfill_snapshot_20260516 AS
SELECT
    lp.id,
    lp.lifecycle_status,
    lp.legacy_fee_mode,
    lp.fee_items,
    lp.application_fee,
    lp.university_reg_fee,
    lp.tuition_fee,
    lp.hostel_fee,
    lp.dayscholar_fee,
    lp.uniform_fee,
    lp.hospital_training_fee,
    lp.placement_fee,
    lp.transport_fee,
    lp.updated_at AS row_updated_at_at_snapshot,
    now()        AS snapshot_taken_at
FROM public.learners_profiles lp
WHERE lp.lifecycle_status = 'admitted'
  AND lp.legacy_fee_mode  = true;

CREATE INDEX IF NOT EXISTS idx_lp_fee_backfill_snapshot_id
    ON public.learners_profiles_fee_backfill_snapshot_20260516 (id);

ALTER TABLE public.learners_profiles_fee_backfill_snapshot_20260516
    ENABLE ROW LEVEL SECURITY;

-- Admin/finance-only read access. No write policies — service role only.
CREATE POLICY "fee_backfill_snapshot_select_admin"
    ON public.learners_profiles_fee_backfill_snapshot_20260516
    FOR SELECT
    TO authenticated
    USING (public.user_has_permission('admission_fees.manage_adjustments'));

COMMENT ON TABLE public.learners_profiles_fee_backfill_snapshot_20260516 IS
    'Point-in-time snapshot (2026-05-16) of admitted+legacy learners_profiles columns affected by the fee-structure backfill. Single-statement rollback target.';

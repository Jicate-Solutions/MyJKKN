-- ============================================================================
-- 20260516130100 — learners_profile_fee_backfill_failures
-- ============================================================================
-- Captures per-row failures from the bulk admission_adopt_structure_for_lead
-- loop in Phase 6, so a partial-failure run doesn't lose information about
-- which rows need manual attention. Also wired to the "Fees Setup Pending"
-- tab so admin/finance can see which rows failed and why.
--
-- Insert is performed by the Phase 6 migration in a SECURITY DEFINER block;
-- read is gated by admission_fees.manage_adjustments (admin/finance tier).
-- No client-side write path exists.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.learners_profile_fee_backfill_failures (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id            uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    attempted_at          timestamptz NOT NULL DEFAULT now(),
    resolution_status     text NOT NULL,
    matched_structure_id  uuid REFERENCES public.admission_fee_structures(id) ON DELETE SET NULL,
    sqlstate              text,
    error_message         text,
    notes                 text
);

CREATE INDEX IF NOT EXISTS idx_lp_fee_backfill_failures_learner
    ON public.learners_profile_fee_backfill_failures (learner_id);

CREATE INDEX IF NOT EXISTS idx_lp_fee_backfill_failures_attempted
    ON public.learners_profile_fee_backfill_failures (attempted_at DESC);

ALTER TABLE public.learners_profile_fee_backfill_failures ENABLE ROW LEVEL SECURITY;

-- Read: admin/finance only (same gate as the manual adopt-structure dialog)
CREATE POLICY "fee_backfill_failures_select_admin"
    ON public.learners_profile_fee_backfill_failures
    FOR SELECT
    TO authenticated
    USING (public.user_has_permission('admission_fees.manage_adjustments'));

-- No INSERT/UPDATE/DELETE policies — only service role (used by the Phase 6
-- bulk migration) can write. If a future workflow needs manual cleanup, add
-- DELETE policy then.

COMMENT ON TABLE public.learners_profile_fee_backfill_failures IS
    'Per-row failures from the admitted+legacy fee-structure bulk-adopt migration. Surfaces in the "Fees Setup Pending" tab. Write access: service role only.';

GRANT SELECT ON public.learners_profile_fee_backfill_failures TO authenticated;

-- =============================================================================
-- CDC Sprint 3 — Placement triggers + manual snapshot RPC
-- Migration: 20260518T1530Z_cdc_s3_placements_triggers_rpc.sql
-- PR: feat/cdc-sprint-3-placements
--
-- What this migration adds (additive only — no DROP, no ALTER TYPE):
--   1. fn_cdc_multi_offer_cascade()  — trigger function: when a placement row
--      is updated to 'accepted', all other 'offered' rows for the same learner
--      (across any drive) transition to 'declined'.
--   2. trg_cdc_multi_offer_cascade   — AFTER UPDATE trigger on cdc_placements.
--   3. fn_capture_cdc_placement_snapshot(p_cycle text) — on-demand RPC to
--      materialise a snapshot row for a named cycle (e.g. '2025-Q4', 'AY25-26').
--   4. RLS fixes for cdc_placements learner self-read (existing policy had a
--      self-referential bug: p.learner_id = p.learner_id always true).
--   5. RLS write-insert policy for cdc_placement_snapshots (cdc_head / super).
--
-- Sprint 1 substrate already created (DO NOT duplicate):
--   - cdc_placements table + cdc_placement_status enum
--   - cdc_placement_snapshots table + cdc_placement_snapshots_unique constraint
--   - fn_cdc_quarterly_placement_snapshot() + pg_cron job
--   - fn_cdc_passed_out_to_alumni_bridge() + trg_cdc_passed_out_to_alumni_bridge
--   - RLS: cdc_placements_read, cdc_placements_write, cdc_placement_snapshots_read
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Multi-offer cascade trigger function
--    Round 2.3 decision: on accept, all other 'offered' rows for same learner
--    go to 'declined'. Policy cdc.allow_multiple_active_offers is checked by
--    application layer at creation time; this trigger enforces acceptance
--    exclusivity unconditionally (one learner = one accepted offer).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cdc_multi_offer_cascade()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  -- Only fire when status transitions INTO 'accepted'.
  IF NEW.status <> 'accepted' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'accepted' THEN
    RETURN NEW;  -- already accepted — idempotent re-fire safety
  END IF;

  -- Decline all other 'offered' rows for this learner except the one just accepted.
  UPDATE public.cdc_placements
  SET
    status       = 'declined',
    declined_at  = now(),
    decline_reason = 'auto_declined_on_acceptance_of_offer_' || NEW.id::text,
    updated_at   = now()
  WHERE learner_id   = NEW.learner_id
    AND id          <> NEW.id
    AND status       = 'offered';

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Attach multi-offer cascade trigger to cdc_placements
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_cdc_multi_offer_cascade ON public.cdc_placements;

CREATE TRIGGER trg_cdc_multi_offer_cascade
  AFTER UPDATE OF status
  ON public.cdc_placements
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_cdc_multi_offer_cascade();

-- ---------------------------------------------------------------------------
-- 3. On-demand snapshot RPC
--    fn_capture_cdc_placement_snapshot(p_cycle text)
--    Materialises a snapshot row for every current placement row under the
--    given cycle label. Idempotent — uses ON CONFLICT DO NOTHING.
--    Returns the count of rows inserted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_capture_cdc_placement_snapshot(p_cycle text)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_inserted integer;
BEGIN
  IF p_cycle IS NULL OR trim(p_cycle) = '' THEN
    RAISE EXCEPTION 'p_cycle must be a non-empty string (e.g. ''2025-Q4'' or ''AY25-26'')';
  END IF;

  INSERT INTO public.cdc_placement_snapshots (
    snapshot_at,
    snapshot_period,
    placement_id,
    learner_id,
    drive_id,
    recruiter_id,
    offer_type_id,
    status,
    package_lpa,
    package_inr_total,
    job_role,
    job_location,
    offered_at,
    accepted_at,
    notes
  )
  SELECT
    now(),
    p_cycle,
    p.id,
    p.learner_id,
    p.drive_id,
    p.recruiter_id,
    p.offer_type_id,
    p.status,
    p.package_lpa,
    p.package_inr_total,
    p.job_role,
    p.job_location,
    p.offered_at,
    p.accepted_at,
    p.notes
  FROM public.cdc_placements p
  ON CONFLICT (placement_id, snapshot_period) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Fix cdc_placements learner self-read RLS
--    The Sprint 1 policy had: p.learner_id = p.learner_id (always true —
--    self-referential). Replace with correct: profiles.learner_id = cdc_placements.learner_id.
--    Drop old policy, recreate with corrected predicate.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS cdc_placements_read ON public.cdc_placements;

CREATE POLICY cdc_placements_read ON public.cdc_placements
  FOR SELECT
  USING (
    is_cdc_staff()
    OR EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.learner_id = cdc_placements.learner_id
    )
  );

-- ---------------------------------------------------------------------------
-- 5. RLS write for cdc_placement_snapshots
--    cdc_head or super_admin can trigger snapshot inserts.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS cdc_placement_snapshots_write ON public.cdc_placement_snapshots;

CREATE POLICY cdc_placement_snapshots_write ON public.cdc_placement_snapshots
  FOR ALL
  USING (is_cdc_head_or_super())
  WITH CHECK (is_cdc_head_or_super());

-- ---------------------------------------------------------------------------
-- Verification probes (SELECT-only — no INSERT smoke tests per standing rule)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Verify trigger function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'fn_cdc_multi_offer_cascade'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'Verification failed: fn_cdc_multi_offer_cascade not found';
  END IF;

  -- Verify trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trg_cdc_multi_offer_cascade'
      AND event_object_table = 'cdc_placements'
  ) THEN
    RAISE EXCEPTION 'Verification failed: trg_cdc_multi_offer_cascade not found';
  END IF;

  -- Verify snapshot RPC exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'fn_capture_cdc_placement_snapshot'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'Verification failed: fn_capture_cdc_placement_snapshot not found';
  END IF;

  RAISE NOTICE 'CDC Sprint 3 migration verification: ALL PASS';
END;
$$;

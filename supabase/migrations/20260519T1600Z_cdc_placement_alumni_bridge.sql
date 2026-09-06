-- =============================================================================
-- CDC Sprint 5 (Workstream A2) — Placement → Alumni Outcomes Bridge
-- Migration: 20260519T1600Z_cdc_placement_alumni_bridge.sql
--
-- Purpose: when a placement transitions to 'accepted' AND the learner is
--   already in a passed-out lifecycle (graduated/alumni), copy the placement
--   into alumni_outcomes. This is the symmetric counterpart to the existing
--   fn_cdc_passed_out_to_alumni_bridge() trigger on learners_profiles, which
--   handles the opposite ordering (graduate-AFTER-accept).
--
-- Why both bridges? Two valid orderings exist in real data:
--
--   Order A (graduate first, accept after):
--     learners_profiles.lifecycle_status → 'graduated' fires
--     trg_cdc_passed_out_to_alumni_bridge → copies any existing accepted
--     placements into alumni_outcomes. Any LATER accepted placement (after
--     the learner is already graduated) is missed by this trigger.
--
--   Order B (accept first, graduate after):
--     cdc_placements.status → 'accepted' but learner is still 'active' →
--     no row should go into alumni_outcomes yet (not an alumnus). Then later
--     learners_profiles.lifecycle_status → 'graduated' fires the existing
--     trigger which picks up the placement.
--
--   Order C (accept while already graduated):
--     learner is already 'graduated', a new accepted placement is recorded →
--     existing trigger doesn't refire on placement change → alumni_outcomes
--     would miss this row. THIS migration adds the placement-side trigger
--     that handles Order C.
--
-- What this migration adds (additive only — no DROP, no ALTER TYPE):
--   1. fn_cdc_placement_to_alumni() — trigger function on cdc_placements
--      AFTER UPDATE OF status. Fires when NEW.status='accepted' AND
--      OLD.status<>'accepted' AND learner is in graduated/alumni lifecycle.
--      Uses the same NOT EXISTS dedup pattern as the existing bridge so the
--      two functions can never double-write the same alumni row.
--   2. trg_cdc_placement_to_alumni — AFTER UPDATE OF status trigger on
--      cdc_placements. Coexists with trg_cdc_multi_offer_cascade.
--
-- What this migration does NOT do:
--   - Does NOT modify alumni_outcomes columns
--   - Does NOT modify the existing fn_cdc_passed_out_to_alumni_bridge()
--   - Does NOT modify trg_cdc_multi_offer_cascade or its function
--   - Does NOT add columns to cdc_placements
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Placement → alumni_outcomes bridge function (Order C handler)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cdc_placement_to_alumni()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_learner RECORD;
BEGIN
  -- Only fire on transitions INTO 'accepted' from a non-accepted state.
  IF NEW.status <> 'accepted' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'accepted' THEN
    RETURN NEW;  -- idempotent: re-fire on a no-op acceptance update
  END IF;

  -- Look up the learner's current lifecycle + program/institution/batch.
  -- Skip if learner is not yet graduated/alumni — the learners_profiles
  -- trigger will pick this placement up when graduation flips the status.
  SELECT id, institution_id, program_id, batch_id, lifecycle_status, updated_by
    INTO v_learner
  FROM public.learners_profiles
  WHERE id = NEW.learner_id;

  IF NOT FOUND THEN
    RETURN NEW;  -- learner row missing — silently skip (don't break placement update)
  END IF;

  IF v_learner.lifecycle_status NOT IN ('graduated', 'alumni') THEN
    RETURN NEW;  -- learner still active — wait for graduation to trigger insert
  END IF;

  -- Insert mirrors fn_cdc_passed_out_to_alumni_bridge field mappings exactly.
  -- Dedup: same (learner_id, company_name, outcome_start_date) tuple as the
  -- sibling bridge. Both bridges use NOT EXISTS rather than ON CONFLICT
  -- because alumni_outcomes has no unique constraint on this tuple — they
  -- are two writers using the same logical dedup key.
  INSERT INTO public.alumni_outcomes (
    learner_id,
    institution_id,
    program_id,
    batch_id,
    graduation_date,
    graduation_year,
    outcome_type,
    outcome_start_date,
    company_name,
    designation,
    city,
    country,
    is_remote,
    data_source,
    verification_status,
    reported_at,
    created_by
  )
  SELECT
    NEW.learner_id,
    v_learner.institution_id,
    v_learner.program_id,
    v_learner.batch_id,
    CURRENT_DATE,
    EXTRACT(YEAR FROM CURRENT_DATE)::integer,
    'employed'::public.outcome_type,
    NEW.joining_date,
    r.name,
    NEW.job_role,
    NEW.job_location,
    COALESCE(r.hq_country, 'India'),
    NEW.is_remote,
    'cdc_placement_bridge'::varchar,
    'pending'::public.verification_status,
    now(),
    NEW.updated_by
  FROM public.cdc_recruiters r
  WHERE r.id = NEW.recruiter_id
    AND NOT EXISTS (
      SELECT 1 FROM public.alumni_outcomes ao
      WHERE ao.learner_id = NEW.learner_id
        AND ao.company_name = r.name
        AND ao.outcome_start_date IS NOT DISTINCT FROM NEW.joining_date
    );

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Attach placement → alumni bridge trigger
--    Trigger name sorts alphabetically AFTER trg_cdc_multi_offer_cascade so
--    cascade-driven sibling declines run first (they're idempotent w.r.t.
--    this bridge since they only touch 'offered' rows, not the just-accepted
--    one).
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_cdc_placement_to_alumni ON public.cdc_placements;

CREATE TRIGGER trg_cdc_placement_to_alumni
  AFTER UPDATE OF status
  ON public.cdc_placements
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_cdc_placement_to_alumni();

-- ---------------------------------------------------------------------------
-- Verification probes (SELECT-only — per standing rule: no INSERT smoke tests)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'fn_cdc_placement_to_alumni'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'Verification failed: fn_cdc_placement_to_alumni not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_cdc_placement_to_alumni'
      AND tgrelid = 'public.cdc_placements'::regclass
  ) THEN
    RAISE EXCEPTION 'Verification failed: trg_cdc_placement_to_alumni not attached';
  END IF;

  -- Confirm coexistence with multi-offer cascade
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_cdc_multi_offer_cascade'
      AND tgrelid = 'public.cdc_placements'::regclass
  ) THEN
    RAISE NOTICE 'Note: trg_cdc_multi_offer_cascade not present — placement-to-alumni bridge will still function but multi-offer cascade is expected per Sprint 3 substrate';
  END IF;

  RAISE NOTICE 'CDC placement-to-alumni bridge verification: ALL PASS';
END;
$$;

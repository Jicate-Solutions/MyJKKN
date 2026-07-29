-- =============================================================================
-- 2026-07-10 — AI Pulse → PDE bridge: expose the engagement discount as config,
--              and heal the demonstration rows written before the scoring fix.
--
-- Companion to the code change in
--   lib/services/ai-pulse/ai-pulse-pde-bridge-service.ts
-- which now writes  weighted_score = raw_score × weight_multiplier  (0.25) for
-- the `engaged_live_session` signal instead of a hardcoded NULL.
--
-- WHY A BACKFILL IS NEEDED
-- The bridge is INSERT-only: it skips any candidate whose evidence.source_key
-- already exists in pde_demonstrations and never updates an existing row. The
-- `ai-pulse-pde-bridge` cron fires daily at 10:30 IST, so every row it wrote
-- before the code deployed carries weighted_score = NULL permanently. Those
-- rows are invisible to pde-agency-live-service, which selects
-- `.not('weighted_score','is',null)`.
--
-- APPLY ORDER
-- Deploy the code FIRST, then apply this migration. Deploy ships code, never
-- migrations, so this file is inert until applied via the Management API.
-- Both statements are guarded, so a second run is a no-op — which also closes
-- the race if the cron happens to fire between the deploy and this apply.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Make the discount tunable without a deploy.
--
--    The guard keys off the ABSENCE OF THE KEY, never off its value. A seed
--    guarded by a mutable value resurrects itself after a later edit — if the
--    Director retunes this to 0.30, a value-guarded re-run would silently reset
--    it to 0.25.
--
--    `jsonb_exists(...)` rather than the `?` operator on purpose: `?` is a bind
--    placeholder in most client drivers and gets mangled in transit.
-- -----------------------------------------------------------------------------
UPDATE public.ai_pulse_policies
SET    value_jsonb = jsonb_set(
         value_jsonb,
         '{engaged_live_session,weight_multiplier}',
         '0.25'::jsonb,
         true
       ),
       updated_at = now()
WHERE  config_key = 'pde_bridge_signal_map'
  AND  NOT jsonb_exists(value_jsonb -> 'engaged_live_session', 'weight_multiplier');

-- -----------------------------------------------------------------------------
-- 2. Backfill the pre-fix rows.
--
--    Re-runnable and non-double-applying: `weighted_score IS NULL` means a
--    second run matches zero rows. `raw_score IS NOT NULL` deliberately leaves
--    genuinely-unscored engaged rows at NULL — they contribute nothing, and a 0
--    there would read as a scored demonstration and suppress the live service's
--    snapshot fallback.
--
--    Scoped to this bridge's own rows by evidence.source + evidence.signal, so
--    it can never touch a demonstration produced by any other writer.
--
--    updated_at is left to the set_updated_at_pde_demonstrations trigger.
-- -----------------------------------------------------------------------------
UPDATE public.pde_demonstrations d
SET    weighted_score = round(
         d.raw_score * COALESCE(
           (SELECT (value_jsonb -> 'engaged_live_session' ->> 'weight_multiplier')::numeric
              FROM public.ai_pulse_policies
             WHERE config_key = 'pde_bridge_signal_map'),
           0.25
         ),
         4
       )
WHERE  d.evidence ->> 'source' = 'ai_pulse'
  AND  d.evidence ->> 'signal' = 'engaged_live_session'
  AND  d.weighted_score IS NULL
  AND  d.raw_score IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. Report what happened, so the apply log is evidence rather than a guess.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_multiplier numeric;
  v_scored     bigint;
  v_unscored   bigint;
BEGIN
  SELECT (value_jsonb -> 'engaged_live_session' ->> 'weight_multiplier')::numeric
    INTO v_multiplier
    FROM public.ai_pulse_policies
   WHERE config_key = 'pde_bridge_signal_map';

  SELECT count(*) FILTER (WHERE weighted_score IS NOT NULL),
         count(*) FILTER (WHERE weighted_score IS NULL)
    INTO v_scored, v_unscored
    FROM public.pde_demonstrations
   WHERE evidence ->> 'source' = 'ai_pulse'
     AND evidence ->> 'signal' = 'engaged_live_session';

  RAISE NOTICE 'pde_bridge weight_multiplier = %', v_multiplier;
  RAISE NOTICE 'engaged_live_session rows: % scored, % unscored (no quiz score)',
    v_scored, v_unscored;

  IF v_multiplier IS NULL THEN
    RAISE EXCEPTION 'weight_multiplier missing from pde_bridge_signal_map after step 1';
  END IF;
END $$;

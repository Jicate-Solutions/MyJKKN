-- =============================================================================
-- T2.3 / C2.1 — CDC snapshot function consolidation
-- =============================================================================
-- Problem (locked during C2 audit on PR #1005):
--   Two near-identical functions insert into public.cdc_placement_snapshots:
--     1. fn_capture_cdc_placement_snapshot(p_cycle text) RETURNS integer
--        — Sprint 3 canonical RPC; explicit cycle; includes `notes` column.
--     2. fn_cdc_quarterly_placement_snapshot() RETURNS void
--        — Sprint 1 cron wrapper; auto-derives cycle as 'YYYY-QN';
--        — silently OMITS `notes` from the INSERT shape.
--
--   Two parallel INSERTs into the same table = drift risk. The wrapper
--   already missed `notes` for one release; the next column addition would
--   miss it again unless every engineer remembers to update both functions.
--
-- Fix (Approach A — preferred per spec):
--   Make the cron wrapper a thin shim that delegates to the canonical
--   function. INSERT shape lives in exactly one place. Cron command stays
--   identical (`SELECT public.fn_cdc_quarterly_placement_snapshot();`),
--   policy toggle behavior preserved, no schema changes.
--
-- Bonus: quarterly snapshots now populate `notes` (regression fix).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Replace the cron wrapper as a delegating shim.
--    DROP-then-CREATE to ensure the body is fully replaced (CREATE OR REPLACE
--    is sufficient here since the signature is unchanged, but we DROP first
--    to satisfy the spec's "DROP fn_cdc_quarterly_placement_snapshot()" step
--    and make the replacement loud in pg_proc audit logs).
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fn_cdc_quarterly_placement_snapshot();

CREATE OR REPLACE FUNCTION public.fn_cdc_quarterly_placement_snapshot()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_enabled  boolean;
  v_period   text;
  v_inserted integer;
BEGIN
  -- Honor the platform_policies toggle (unchanged behavior).
  SELECT (value)::boolean INTO v_enabled
  FROM public.platform_policies
  WHERE policy_key = 'cdc.quarterly_snapshot_enabled'
    AND scope_type = 'global'
    AND is_active = true
  LIMIT 1;

  IF NOT COALESCE(v_enabled, true) THEN
    RAISE NOTICE 'cdc quarterly snapshot skipped (policy disabled)';
    RETURN;
  END IF;

  -- Derive cycle label as 'YYYY-QN' (matches prior wrapper logic exactly).
  v_period := to_char(now(), 'YYYY') || '-Q' || ((EXTRACT(QUARTER FROM now()))::int)::text;

  -- Delegate to the canonical function. Single INSERT shape, no drift.
  v_inserted := public.fn_capture_cdc_placement_snapshot(v_period);

  RAISE NOTICE 'cdc quarterly snapshot inserted % row(s) for cycle %', v_inserted, v_period;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Verification (SELECT-only per standing rule)
--    Confirms:
--      a) Both function names still exist with the expected signatures.
--      b) Cron command is unchanged.
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  -- Canonical function intact, signature unchanged.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_capture_cdc_placement_snapshot'
      AND pg_get_function_identity_arguments(p.oid) = 'p_cycle text'
      AND pg_get_function_result(p.oid) = 'integer'
  ) THEN
    RAISE EXCEPTION 'Verification failed: fn_capture_cdc_placement_snapshot(p_cycle text) RETURNS integer not found';
  END IF;

  -- Wrapper function exists with unchanged signature.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_cdc_quarterly_placement_snapshot'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND pg_get_function_result(p.oid) = 'void'
  ) THEN
    RAISE EXCEPTION 'Verification failed: fn_cdc_quarterly_placement_snapshot() RETURNS void not found';
  END IF;

  -- Cron job command unchanged (regression check — if a future migration
  -- accidentally mutates the schedule, this fires before any silent drift).
  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'cdc_quarterly_placement_snapshot'
      AND command ILIKE '%fn_cdc_quarterly_placement_snapshot()%'
  ) THEN
    RAISE EXCEPTION 'Verification failed: cron.job cdc_quarterly_placement_snapshot is missing or its command no longer references fn_cdc_quarterly_placement_snapshot()';
  END IF;

  RAISE NOTICE 'T2.3 / C2.1 consolidation verification: ALL PASS';
END;
$$;

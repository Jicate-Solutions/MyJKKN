-- =====================================================================
-- Auto-complete past-due approved reservations via pg_cron
-- =====================================================================
-- Problem: Approved reservations whose end_time has passed remain in
-- 'approved' status indefinitely. This permanently holds stock, blocking
-- future approvals even though the physical usage window is over.
--
-- Fix: A pg_cron job runs every 15 minutes and transitions any approved
-- reservation where end_time < NOW() to 'completed'. The existing trigger
-- fn_reservation_cancelled_restore_stock_and_waitlist fires on this
-- transition and restores current_stock_quantity automatically.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Function that auto-completes past-due reservations
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_auto_complete_past_due_reservations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.resource_reservations
     SET status     = 'completed',
         updated_at = NOW()
   WHERE status   = 'approved'
     AND end_time < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    RAISE NOTICE 'auto_complete_past_due_reservations: completed % reservation(s)', v_count;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 2. Schedule: run every 15 minutes
--    Unschedule first so re-running this migration is idempotent.
--    Guard against the job not existing yet (first run).
-- ---------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('auto-complete-past-due-reservations');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job didn't exist yet, safe to continue
END;
$$;

SELECT cron.schedule(
  'auto-complete-past-due-reservations',
  '*/15 * * * *',
  $$ SELECT public.fn_auto_complete_past_due_reservations(); $$
);

-- ---------------------------------------------------------------------
-- 3. Run once immediately to clean up any existing stale reservations
-- ---------------------------------------------------------------------
SELECT public.fn_auto_complete_past_due_reservations();

COMMIT;

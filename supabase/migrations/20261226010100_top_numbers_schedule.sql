-- ============================================================================
-- 20261226010100_top_numbers_schedule.sql
-- ----------------------------------------------------------------------------
-- THE TWO TOP NUMBERS — the dispatcher SCHEDULE row. The AI-routine dispatcher
-- fires ai_routine_schedules rows; this seed row IS the registration.
-- ⛔ vercel.json is deliberately untouched (hard 100-cron cap — ref
-- feedback_vercel_cron_limit_100_blocks_all_deploys).
--
-- Cadence: WEEKLY, Monday 09:11 IST (days_of_week = {1}, minute_of_day = 551 —
-- an off-grid minute, house seed style). Monday morning is the first moment
-- the ISO week that just ended is COMPLETE, and the route measures that
-- finished week, never a partial one.
--
-- managed=true  → day/time editable on /admin/ai-routines, no deploy.
-- max_only=false → no model is called; the pass is one Sentry read plus SQL.
-- ON CONFLICT DO NOTHING → a re-run never clobbers a Director-retuned row.
--
-- ORDERING IS SAFE EITHER WAY (same as 20261225070100): applied before the
-- code deploys, the dispatcher logs 'skipped: not in registry' each Monday
-- until the deploy lands (the registry entry ships in
-- lib/ai-routines/loop-governance.ts in the same PR); applied after, the first
-- Monday simply fires.
--
-- ⛔ NOT APPLIED by merging — prod apply is a separate, Director-gated step.
--    No BEGIN;/COMMIT; (rollback-rehearsal safe).
-- ============================================================================

INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day, max_only)
VALUES
  ('top-numbers', true, true, ARRAY[1]::smallint[], 551, false)
ON CONFLICT (routine_id) DO NOTHING;

-- Guard: RAISE EXCEPTION, never RAISE NOTICE — a NOTICE-only miss path stamps
-- zero rows and reads as success (ref feedback_a_raise_notice_guard_reads_as_success).
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.ai_routine_schedules
   WHERE routine_id = 'top-numbers';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'top-numbers schedule row missing after seed (count=%)', v_count;
  END IF;
END $$;

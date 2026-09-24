-- ============================================================================
-- 20261225070100_loop_bar_proposals_schedule.sql
-- ----------------------------------------------------------------------------
-- LOOP BAR PROPOSALS — the dispatcher SCHEDULE row. The AI-routine dispatcher
-- fires ai_routine_schedules rows; this seed row IS the registration.
-- ⛔ vercel.json is deliberately untouched (hard 100-cron cap — ref
-- feedback_vercel_cron_limit_100_blocks_all_deploys).
--
-- Cadence: DAILY 11:19 IST (minute_of_day = 679 — an off-grid minute, house
-- seed style, and after the 10:41 Sunday charter drafter so a loop that just
-- had its charter legs approved can be barred the same day). days_of_week =
-- all seven. The pass is idempotent by construction: a loop with an open
-- 'proposed' bar row or a standing 'insufficient' one is skipped, so a daily
-- clock never re-asks a question already on the Director's desk.
--
-- managed=true → day/time editable on /admin/ai-routines, no deploy.
-- max_only=false → no model is called; the whole pass is one SQL function.
-- ON CONFLICT DO NOTHING → a re-run never clobbers a Director-retuned row.
--
-- ORDERING IS SAFE EITHER WAY (same as 20260927040000): applied before the
-- code deploys, the dispatcher logs 'skipped: not in registry' daily until the
-- deploy lands (the registry entry ships in lib/ai-routines/loop-governance.ts
-- in the same PR); applied after, the first 11:19 simply fires.
--
-- ⛔ NOT APPLIED by merging — prod apply is a separate, Director-gated step.
--    No BEGIN;/COMMIT; (rollback-rehearsal safe).
-- ============================================================================

INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day, max_only)
VALUES
  ('loop-bar-proposals', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 679, false)
ON CONFLICT (routine_id) DO NOTHING;

-- Guard: RAISE EXCEPTION, never RAISE NOTICE — a NOTICE-only miss path stamps
-- zero rows and reads as success (ref feedback_a_raise_notice_guard_reads_as_success).
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.ai_routine_schedules
   WHERE routine_id = 'loop-bar-proposals';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'loop-bar-proposals schedule row missing after seed (count=%)', v_count;
  END IF;
END $$;

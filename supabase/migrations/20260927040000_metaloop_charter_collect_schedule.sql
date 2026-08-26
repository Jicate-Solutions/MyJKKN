-- ============================================================================
-- 20260927040000_metaloop_charter_collect_schedule.sql
-- ----------------------------------------------------------------------------
-- MetaLoop daily COLLECT — the dispatcher SCHEDULE row. The AI-routine
-- dispatcher fires ai_routine_schedules rows; this seed row IS the
-- registration. ⛔ vercel.json is deliberately untouched (hard 100-cron cap —
-- ref feedback_vercel_cron_limit_100_blocks_all_deploys).
--
-- Cadence: DAILY 12:41 IST (minute_of_day = 761, off-grid :41 per house seed
-- style; days_of_week = all seven). WHY daily when drafting is weekly: the
-- Max-lane drain finishes Sunday's drafts within minutes of the 10:41 enqueue,
-- but the weekly route's collect had already run — so every draft waited a
-- FULL WEEK to surface (receipt: 08-16 drafts collected 08-23). A daily
-- collect bounds draft-invisibility at ~26 hours worst-case and surfaces
-- Sunday's drafts the same day at 12:41. Collect-only: enqueue cadence stays
-- Sunday's row ('metaloop-charter-drafts'), so no extra Max-lane spend.
--
-- Collision-safe with the Sunday route by construction: fn_ai_collect_claim
-- stamps delivered_at in the claiming statement (exactly-once across both
-- clocks) and source_job_id is UNIQUE on loop_charter_proposals.
--
-- managed=true → day/time editable on /admin/ai-routines, no deploy.
-- max_only=false → cloud cron (it only READS finished Max-lane results).
-- ON CONFLICT DO NOTHING → a re-run never clobbers a Director-retuned row.
--
-- ORDERING IS SAFE EITHER WAY (same as 20260825030300): applied before the
-- code deploys, the dispatcher logs 'skipped: not in registry' daily until the
-- deploy lands (the registry entry ships in lib/ai-routines/loop-governance.ts
-- in the same PR); applied after, the first 12:41 simply fires.
--
-- ⛔ NOT APPLIED by merging — prod apply is a separate, Director-gated step.
--    No BEGIN;/COMMIT; (rollback-rehearsal safe).
-- ============================================================================

INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day, max_only)
VALUES
  ('metaloop-charter-collect', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 761, false)
ON CONFLICT (routine_id) DO NOTHING;

-- Guard: RAISE EXCEPTION, never RAISE NOTICE — a NOTICE-only miss path stamps
-- zero rows and reads as success (ref feedback_a_raise_notice_guard_reads_as_success).
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.ai_routine_schedules
   WHERE routine_id = 'metaloop-charter-collect';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'metaloop-charter-collect schedule row missing after seed (count=%)', v_count;
  END IF;
END $$;

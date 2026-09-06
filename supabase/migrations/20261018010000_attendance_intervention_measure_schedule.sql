-- ============================================================================
-- 20261018010000_attendance_intervention_measure_schedule.sql
-- ----------------------------------------------------------------------------
-- Attendance → Intervention daily MEASURE — the dispatcher SCHEDULE row. The
-- AI-routine dispatcher fires ai_routine_schedules rows; this seed row IS the
-- registration. ⛔ vercel.json is deliberately untouched (hard 100-cron cap —
-- ref feedback_vercel_cron_limit_100_blocks_all_deploys).
--
-- Follow-up to 20260929010000 (PR #3212), whose section 4 deliberately did NOT
-- seed this row: the registry-cron-wiring invariant
-- (__tests__/lib/ai-routines/registry-cron-wiring.test.ts) requires every
-- ai_routine_schedules seed to ship WITH its lib/ai-routines registry entry,
-- and that registry file was a cross-lane collision zone that week. This PR
-- ships BOTH together: the 'attendance-intervention-measure' entry in
-- lib/ai-routines/loop-governance.ts and this seed.
--
-- Cadence: DAILY 10:07 IST (minute_of_day = 607, off-grid :07 per house seed
-- style; days_of_week = all seven). WHY daily: the measurer's after-window is
-- 14 days, so a pending row becomes measurable on a specific day; a daily tick
-- bounds measurement latency at ~24 hours and enrols yesterday's nudges and
-- staff interventions the next morning. The route is one RPC to
-- fn_attendance_measure_intervention_effect (idempotent — UNIQUE(source,
-- source_id) dedupes enrolment; measurement only touches still-pending rows),
-- so a daily fire never double-counts.
--
-- managed=true → day/time editable on /admin/ai-routines, no deploy.
-- max_only=false → cloud cron (no model, no Max-lane work — rules-based SQL).
-- ON CONFLICT DO NOTHING → a re-run never clobbers a Director-retuned row.
--
-- ORDERING IS SAFE EITHER WAY (same as 20260927040000): applied before the
-- code deploys, the dispatcher logs 'skipped: not in registry' daily until the
-- deploy lands (the registry entry ships in lib/ai-routines/loop-governance.ts
-- in the same PR); applied after, the first 10:07 simply fires. Applied before
-- 20260929010000, the route answers HTTP 500 ('measure rpc failed') daily
-- until that migration lands — visible on /admin/ai-routines, never silent.
--
-- ⛔ NOT APPLIED by merging — prod apply is a separate, Director-gated step.
--    No BEGIN;/COMMIT; (rollback-rehearsal safe).
-- ============================================================================

INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day, max_only)
VALUES
  ('attendance-intervention-measure', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 607, false)
ON CONFLICT (routine_id) DO NOTHING;

-- Guard: RAISE EXCEPTION, never RAISE NOTICE — a NOTICE-only miss path stamps
-- zero rows and reads as success (ref feedback_a_raise_notice_guard_reads_as_success).
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.ai_routine_schedules
   WHERE routine_id = 'attendance-intervention-measure';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'attendance-intervention-measure schedule row missing after seed (count=%)', v_count;
  END IF;
END $$;

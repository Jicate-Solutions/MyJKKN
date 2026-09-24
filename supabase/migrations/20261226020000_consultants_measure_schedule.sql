-- ============================================================================
-- 20261226020000_consultants_measure_schedule.sql
-- ----------------------------------------------------------------------------
-- CONSULTANTS MEASURE — the dispatcher SCHEDULE row. The AI-routine dispatcher
-- fires ai_routine_schedules rows; this seed row IS the registration.
--
-- WHY THIS EXISTS: the consultants loop has had a measurer since 2026-08-26
-- (fn_consultants_measure_conversion, migration 20261003010000) and a weekly
-- known-delta regress that proves it (20261003030000) — but never a clock.
-- Nothing called it, so consultant_conversion_measurements has stayed empty
-- and the loop has never produced a reading of its own. This row, plus the
-- 'consultants-measure' entry in lib/ai-routines/loop-governance.ts and
-- app/api/cron/consultants-measure/route.ts (same PR), is that clock.
--
-- ⛔ vercel.json is deliberately untouched (hard 100-cron cap — ref
-- feedback_vercel_cron_limit_100_blocks_all_deploys).
--
-- Cadence: WEEKLY, Mondays 11:23 IST (days_of_week = ARRAY[1]; 0 = Sunday in
-- this table's vocabulary — see 20260711064500's 'loops-regress' Sunday row).
-- minute_of_day = 683, an off-grid minute free of every other seeded routine.
-- Monday on purpose: the Sunday 07:53 loops-regress re-proves this very
-- measurer against known deltas first, so the week's reading is taken with a
-- measurer that has just been shown to be honest. Weekly rather than daily
-- because the measurement window is a rolling 30 days against an all-history
-- baseline — a daily re-read of the same window would churn rows without
-- moving a number.
--
-- managed=true → day/time editable on /admin/ai-routines, no deploy.
-- max_only=false → no model is called; the whole pass is one SQL function.
-- ON CONFLICT DO NOTHING → a re-run never clobbers a Director-retuned row.
--
-- ORDERING IS SAFE EITHER WAY (same as 20261018010000): applied before the
-- code deploys, the dispatcher logs 'skipped: not in registry' each Monday
-- until the deploy lands; applied after, the first 11:23 simply fires. If
-- 20261003010000 is itself still unapplied, the route answers HTTP 500 and the
-- dispatcher records a failure — a visible no-op, never a silent success.
--
-- No new function is created here, so there is no SECURITY DEFINER grant to
-- re-assert. (fn_consultants_measure_conversion is untouched: its REVOKE FROM
-- anon, authenticated, PUBLIC / GRANT TO service_role lock stands as written
-- in 20261003010000.)
--
-- ⛔ NOT APPLIED by merging — prod apply is a separate, Director-gated step.
--    No BEGIN;/COMMIT; (rollback-rehearsal safe).
-- ============================================================================

INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day, max_only)
VALUES
  ('consultants-measure', true, true, ARRAY[1]::smallint[], 683, false)
ON CONFLICT (routine_id) DO NOTHING;

-- Guard: RAISE EXCEPTION, never RAISE NOTICE — a NOTICE-only miss path stamps
-- zero rows and reads as success (ref feedback_a_raise_notice_guard_reads_as_success).
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.ai_routine_schedules
   WHERE routine_id = 'consultants-measure';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'consultants-measure schedule row missing after seed (count=%)', v_count;
  END IF;
END $$;

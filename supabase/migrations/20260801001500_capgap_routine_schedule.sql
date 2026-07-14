-- ============================================================================
-- Register capgap-scan as a governed, dispatcher-fired AI routine
-- Migration: 2026-07-14
-- ============================================================================
-- WHY: The capability-gap detection scan (app/api/cron/capgap-scan) shipped
-- with a DIRECT vercel.json cron entry ('51 3 * * *') and no ai_routine_schedules
-- row, so it was invisible on /admin/ai-routines and ungoverned by the loop
-- control tower. The correct architecture is: the ai-routine-dispatcher
-- (/api/cron/ai-routine-dispatcher, every 15 min) is the SINGLE CLOCK — it reads
-- this table, fires each due managed routine's endpoint, and stamps last_status
-- via fn_ai_routine_record_fire. This migration registers capgap-scan here;
-- the same PR removes its direct vercel.json cron so the dispatcher becomes the
-- ONLY firing path (no double-fire) and adds the routine to the registry
-- (lib/ai-routines/loop-governance.ts) so getRoutineById('capgap-scan')
-- resolves its triggerPath.
--
-- IDEMPOTENT: ON CONFLICT (routine_id) DO NOTHING — seeds this schedule ONCE and
-- never overwrites a day/time a super_admin later edits on /admin/ai-routines.
--
-- minute_of_day semantics (see 20260701210000 + 20260709093100 seed comments):
--   * stored in IST minutes (0..1439); the dispatcher floors to the 15-min slot,
--     i.e. (minute_of_day / 15) * 15, so any value fires at its containing slot.
--   * 231 = 03:51 → floors to the 03:45 IST dispatcher slot. This mirrors the
--     "03:51" reading of the removed vercel expression '51 3 * * *' for
--     traceability (same off-grid-minute style as loops-regress=473 / 07:53).
--   * NB: the removed vercel cron ran at 03:51 UTC (= 09:21 IST); this row runs
--     at ~03:51 IST. A daily, idempotent detection scan is timezone-insensitive
--     (it only needs to run once per day), so the wall-clock shift is harmless.
--     If exact prior wall-clock is ever wanted, set minute_of_day = 561 (09:21 IST).
--
-- managed=true → dispatcher owns the timing. max_only=false → this is a cloud
-- cron routine, not a Max-lane batch job (no maxlane:* runner involved).
-- ============================================================================

INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day, max_only)
VALUES
  ('capgap-scan', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 231, false)
ON CONFLICT (routine_id) DO NOTHING;

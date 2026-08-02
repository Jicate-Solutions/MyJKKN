-- ============================================================================
-- MBA Teaching-Enterprise · Data-Gap loop — daily cron schedules (Phase 4)
-- Created: 2026-07-26
-- ----------------------------------------------------------------------------
-- Rulebook decision #5: refresh the loop every day. Registers the two data-gap
-- crons in ai_routine_schedules so the AI-routine dispatcher fires them daily —
-- NOT vercel.json (day/time then editable from /admin/ai-routines with no
-- redeploy). Their registry entries (triggerPath) live in lib/ai-routines/
-- misc-ai.ts; the dispatcher looks each routine up by id.
--
-- Ordered so the loop turns over once per morning: measure (05:33 IST) runs
-- BEFORE rank (05:51 IST), so the ranker reads TODAY's fresh per-area hit-rate.
--   minute_of_day is minutes past midnight IST (333 = 05:33, 351 = 05:51).
--
-- Both are honest no-ops until gaps exist (measure over 0 rows writes nothing;
-- rank skips institutions with < 2 un-triaged gaps), so enabling now is safe.
-- Additive + idempotent: ON CONFLICT (routine_id) DO NOTHING.
-- ============================================================================

BEGIN;

INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('measure-gap-outcomes', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 333)
ON CONFLICT (routine_id) DO NOTHING;

INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('rank-data-gaps', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 351)
ON CONFLICT (routine_id) DO NOTHING;

COMMIT;

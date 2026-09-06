-- ============================================================================
-- Solutions Hub — Monday Director digest + daily quiet-client nudge schedules
-- Created: 2026-08-14
-- ----------------------------------------------------------------------------
-- Registers the two Solutions Hub reporting routines in ai_routine_schedules
-- so the AI-routine dispatcher fires them — NOT vercel.json, whose `crons`
-- array sits at the hard 100-entry plan cap (a 101st fails EVERY build).
-- Registry entries (triggerPath) live in lib/ai-routines/misc-ai.ts; the
-- dispatcher resolves each routine by id, so these routine_id values must
-- match the registry EXACTLY (asserted by registry-cron-wiring.test.ts).
--
-- minute_of_day is minutes past midnight IST (fn_ai_routine_claim_due converts
-- via now() AT TIME ZONE 'Asia/Kolkata' — NEVER copy a UTC hour here).
-- The dispatcher claims in 15-minute slots, so these deliberately off-mark
-- minutes are the load-spreading convention, not typos — do not "fix" them
-- to :00/:30:
--   * 487 = 08:07 IST, Monday only  → fires in the 08:00–08:15 slot.
--   * 563 = 09:23 IST, every day    → fires in the 09:15–09:30 slot.
--
-- The nudge routine additionally reads ITS OWN row's created_at as the quiet-
-- clock FLOOR (quiet_since = GREATEST(latest communication, created_at)), so
-- the first tick after this migration applies judges NO pre-existing backlog —
-- clients begin accruing "quiet days" from the moment this row exists.
--
-- Dormant until this file is applied; enabled/managed/day/time editable later
-- at /admin/ai-routines. Additive + idempotent: ON CONFLICT DO NOTHING.
-- ============================================================================

BEGIN;

INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('solutions-director-digest', true, true, ARRAY[1]::smallint[], 487)
ON CONFLICT (routine_id) DO NOTHING;

INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('solutions-client-touch-nudge', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 563)
ON CONFLICT (routine_id) DO NOTHING;

COMMIT;

-- ============================================================================
-- 20270402100000_meetings_followup_routine_schedule.sql
-- ----------------------------------------------------------------------------
-- MEETINGS FOLLOW-UP ROUTINE — the dispatcher SCHEDULE row, SWITCHED OFF.
--
-- ⛔ FILE ONLY — NOT APPLIED. The operator applies it at merge.
--    No BEGIN;/COMMIT; (rollback-rehearsal safe).
--
-- WHY: when a meeting ends and its Fireflies note is linked, the ingest turns
-- the note's follow-ups into meeting_action_items and nothing reaches the host.
-- app/api/cron/meetings-followup-routine/route.ts sends the host a "record
-- ready" card per note and a weekly open-follow-ups digest. This row, plus the
-- 'meetings-followup-routine' entry in lib/ai-routines/misc-ai.ts (same PR), is
-- its clock. vercel.json is deliberately untouched (hard 100-cron cap).
--
-- enabled = false  → ships OFF. The Director switches it on at
--                    /admin/ai-routines once he has chosen the channel. The
--                    route also refuses to write while this row is disabled.
-- created_at       → THIS ROW'S created_at IS THE ROUTINE'S FLOOR. The route
--                    never cards a note applied before it, so the notes that
--                    existed before the routine are never carded. Do not
--                    delete and re-insert this row to "reset" it: that moves
--                    the floor.
-- minute_of_day    → 1127 = 18:47 IST (IST, not UTC), floored by
--                    fn_ai_routine_claim_due to the 18:45 IST slot.
-- days_of_week     → every day; the weekly digest is keyed on the ISO week so
--                    it sends once per week regardless.
-- managed = true   → day/time editable on /admin/ai-routines, no deploy.
-- max_only = false → no model is called.
--
-- NOT-NULL columns of ai_routine_schedules (read from the live catalog
-- 2026-09-26, SELECT only): routine_id, enabled, days_of_week, minute_of_day,
-- managed, max_only, created_at, updated_at. Every one is supplied here or has
-- a default (created_at/updated_at now(), max_only false).
--
-- ON CONFLICT DO NOTHING → a re-run never clobbers a Director-retuned row.
-- No function is created here, so there is no SECURITY DEFINER grant to
-- re-assert.
-- ============================================================================

INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day, max_only)
VALUES
  ('meetings-followup-routine', false, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 1127, false)
ON CONFLICT DO NOTHING;

-- Guard: RAISE EXCEPTION, never RAISE NOTICE — a NOTICE-only miss reads as success.
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.ai_routine_schedules
   WHERE routine_id = 'meetings-followup-routine';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'meetings-followup-routine schedule row missing after insert (found %)', v_count;
  END IF;
END
$$;

-- =====================================================================
-- Meetings: the daily sweep closes a past meeting when its notes are linked
-- Migration: 2026-10-02 (applies as 20271003091700)
-- =====================================================================
-- ⚠️ FILE ONLY — NOT APPLIED. Director-gated, like every migration here.
--
-- DECISION
-- --------
-- Requested by the Front desk session on 2 Oct 2026 and confirmed by the
-- Director in the myjkkn-agent chat on 2 Oct 2026 (~23:25 IST), who chose the
-- option "Close those with notes" over "Keep the 21 Aug rule".
--
-- This PARTIALLY reverses the 21 Aug 2026 retirement of the 7-day auto-close.
-- What changes: a confirmed meeting that ended more than 7 days ago AND has a
-- meeting_notes row linked to it (a Fireflies record attached by the ingest's
-- calendar match or by hand) is closed as 'completed', stamped
-- outcome_marked_by = 'notes'. What does NOT change: a meeting WITHOUT notes
-- still waits for a person under "Awaiting you" on /meetings/inbox. The old
-- sweep, fn_meetings_auto_close_unmarked (20260831010000), is left exactly as
-- it is and must stay uncalled — app/api/cron/meetings-auto-close/route.ts
-- calls only the function below, and __tests__/meetings/auto-close-retired.test.ts
-- fails if that ever changes.
--
-- WHY 'notes' IS ITS OWN KIND
-- ---------------------------
-- outcome_marked_by records WHICH KIND of actor closed a meeting. 'host' and
-- 'admin' are people (mb_outcome_marked_by_person_chk makes them name the
-- person); 'system' is the retired blind sweep, which judged a meeting on age
-- alone. A notes-linked close is neither: no person looked, but the record has
-- evidence a blind sweep never had. Folding it into 'system' would make the
-- detail page say "nobody confirmed it took place" for a meeting with a
-- recording attached; folding it into 'host' would name a person who did not
-- act. So it gets its own value, and outcome_marked_by_profile_id stays NULL —
-- the person CHECK is untouched because 'notes' names nobody.
--
-- NO ACTIVATION FLOOR — deliberately
-- ----------------------------------
-- The 20260831010000 sweep floored itself at its schedule row's created_at so
-- it would never judge the backlog. This one has no floor ON PURPOSE: the
-- backlog of notes-linked meetings is exactly what the Front desk asked to
-- have closed. Counted on production 2 Oct 2026 (counts only): 61 bookings are
-- confirmed, unmarked, ended more than 7 days ago and have notes linked — the
-- first run closes all 61 at once. 9 more notes-linked confirmed meetings
-- ended within the last 7 days and will close as they age past the window.
--
-- TRIGGERS ON meeting_bookings — what each does to the rows this closes
-- ---------------------------------------------------------------------
-- Read from production pg_trigger on 2 Oct 2026 (SELECT only). A
-- confirmed -> completed UPDATE fires:
--   tg_mb_updated (BEFORE UPDATE)            sets updated_at. Nothing else.
--   tg_enqueue_meeting_webhooks (AFTER)      enqueues only booking.cancelled /
--                                            booking.rescheduled — a status
--                                            move to 'completed' returns early.
--                                            Nothing enqueued, nothing sent.
--   meeting_bookings_interview_follows       acts only on -> cancelled or on a
--                                            moved start/end. Nothing.
--   trg_enqueue_meeting_workflow_runs        ⚠ treats ANY status change that is
--     (AFTER UPDATE OF status)                 not cancelled/rescheduled as
--                                            'on_booked' and inserts pending
--                                            meeting_workflow_runs for the
--                                            host's ACTIVE on_booked /
--                                            before_meeting / after_meeting
--                                            workflows (ON CONFLICT DO NOTHING).
--                                            On production on 2 Oct 2026 there
--                                            are 0 meeting_workflows rows at all
--                                            and 0 runs, so this enqueues
--                                            nothing for the 61. It is a
--                                            pre-existing quirk that the host's
--                                            own "Mark happened" button shares;
--                                            it is not changed here.
-- No trigger sends an email, a WhatsApp or a bell notification on this move.
--
-- No BEGIN/COMMIT in this file on purpose, so a reviewer's BEGIN .. ROLLBACK
-- rehearsal actually rolls back.
-- =====================================================================

-- ── 1. the kind CHECK gains 'notes' ──────────────────────────────────────────
-- DROP ... IF EXISTS then ADD, not a guarded CREATE: the constraint already
-- exists with the three-value list, and an IF NOT EXISTS guard would find it,
-- skip, and leave 'notes' rejected.
ALTER TABLE public.meeting_bookings
  DROP CONSTRAINT IF EXISTS mb_outcome_marked_by_chk;

ALTER TABLE public.meeting_bookings
  ADD CONSTRAINT mb_outcome_marked_by_chk
  CHECK (outcome_marked_by IS NULL
         OR outcome_marked_by IN ('host', 'admin', 'system', 'notes'));

-- mb_outcome_marked_by_person_chk is NOT touched: it requires a named person
-- only for 'host' and 'admin', so 'notes' with a NULL profile id already passes.

COMMENT ON COLUMN public.meeting_bookings.outcome_marked_by IS
  'WHICH KIND of actor recorded the outcome: host = the booking''s own host; admin = a super admin acting on the host''s behalf; system = the pre-2026-08-21 automatic sweep; notes = the daily sweep closed it because meeting notes are linked to it (Director, 2 Oct 2026). Identity lives in outcome_marked_by_profile_id, never here; it is NULL for system and notes.';

-- ── 2. fn_meetings_close_with_notes — the daily sweep ────────────────────────
-- end_time < now() - p_older_than_days, the same end-time expression the old
-- sweep uses (fn_meetings_auto_close_unmarked: end_time < now() -
-- make_interval(days => p_days)), so "7 days after it ended" means the same
-- thing in both.
--
-- IDEMPOTENT BY CONSTRUCTION: the predicate is status = 'confirmed', and the
-- UPDATE moves every row it touches out of that set. A second run matches
-- nothing. A row a person already marked is 'completed'/'no_show' and was never
-- in the set, so a 'host' or 'admin' stamp is never overwritten; a cancelled
-- row is never in the set either.
--
-- Concurrency: if a host marks the same booking while this runs, the UPDATE
-- re-checks status = 'confirmed' under the row lock and skips it — the host's
-- answer wins.
--
-- p_older_than_days below 1 is refused rather than clamped: 0 or a negative
-- number would reach meetings that have not ended yet.
CREATE OR REPLACE FUNCTION public.fn_meetings_close_with_notes(
  p_older_than_days integer DEFAULT 7
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_closed integer;
BEGIN
  IF p_older_than_days IS NULL OR p_older_than_days < 1 THEN
    RAISE EXCEPTION 'p_older_than_days must be 1 or more (got %)', p_older_than_days
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.meeting_bookings b
     SET status                       = 'completed',
         outcome_marked_at            = now(),
         outcome_marked_by            = 'notes',
         outcome_marked_by_profile_id = NULL,
         updated_at                   = now()
   WHERE b.status = 'confirmed'
     AND b.outcome_marked_by IS NULL
     AND b.end_time < now() - make_interval(days => p_older_than_days)
     AND EXISTS (
           SELECT 1
             FROM public.meeting_notes n
            WHERE n.booking_id = b.id
         );

  GET DIAGNOSTICS v_closed = ROW_COUNT;
  RETURN v_closed;
END $fn$;

-- A cron function: the service role only. Revoked from authenticated too —
-- no signed-in person should be able to close other people's meetings.
REVOKE EXECUTE ON FUNCTION public.fn_meetings_close_with_notes(integer)
  FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_meetings_close_with_notes(integer) TO service_role;

COMMENT ON FUNCTION public.fn_meetings_close_with_notes(integer) IS
  'Daily sweep (service role only): closes a confirmed, unmarked booking that ended more than p_older_than_days ago (default 7) as completed, stamped outcome_marked_by = notes, ONLY when a meeting_notes row is linked to it. Returns the number closed. Decision: confirmed by the Director in the myjkkn-agent chat on 2 Oct 2026, choosing "Close those with notes" over "Keep the 21 Aug rule" — a partial reversal of the 21 Aug 2026 retirement; meetings WITHOUT notes still wait for a person. fn_meetings_auto_close_unmarked must stay uncalled.';

-- ── 3. guard ─────────────────────────────────────────────────────────────────
-- RAISE EXCEPTION, never RAISE NOTICE: a NOTICE-only miss path reads as success
-- in Studio while having done nothing.
DO $guard$
BEGIN
  IF to_regprocedure('public.fn_meetings_close_with_notes(integer)') IS NULL THEN
    RAISE EXCEPTION 'fn_meetings_close_with_notes(integer) was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.meeting_bookings'::regclass
       AND conname  = 'mb_outcome_marked_by_chk'
       AND pg_get_constraintdef(oid) LIKE '%notes%'
  ) THEN
    RAISE EXCEPTION 'mb_outcome_marked_by_chk does not permit the notes kind';
  END IF;

  -- The person CHECK must still be there: dropping it would let 'host'/'admin'
  -- rows go anonymous again.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.meeting_bookings'::regclass
       AND conname  = 'mb_outcome_marked_by_person_chk'
  ) THEN
    RAISE EXCEPTION 'mb_outcome_marked_by_person_chk is missing';
  END IF;

  -- Assert the EFFECTIVE privilege, not the ACL text: anon is a member of
  -- PUBLIC, so revoking anon alone can still leave anon able to execute.
  IF has_function_privilege('anon', 'public.fn_meetings_close_with_notes(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_meetings_close_with_notes is still executable by anon';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_meetings_close_with_notes(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_meetings_close_with_notes is still executable by authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.fn_meetings_close_with_notes(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_meetings_close_with_notes is not executable by service_role';
  END IF;
END $guard$;

NOTIFY pgrst, 'reload schema';

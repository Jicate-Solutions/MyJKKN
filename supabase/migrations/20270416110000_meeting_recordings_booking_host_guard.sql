-- ============================================================================
-- Meeting recordings: only the meeting's host can attach a recording to it
-- ============================================================================
-- Created: 2026-09-25   (BUG-006149)
--
-- PR #3836 let a recording be linked to a meeting (meeting_recordings.booking_id).
-- The rule "you may only attach a recording to a meeting you host" lived in the
-- API route alone (app/api/meetings/recordings/route.ts), and even there it was
-- "a booking you can SEE", which an administrator can for every booking
-- (mb_host_select). The table's own policies (20260915120001) check only
-- recorded_by, so a direct PostgREST write could hang a recording on anybody's
-- meeting, and an UPDATE could re-point an existing recording afterwards.
--
-- This moves the rule into the database as a BEFORE INSERT/UPDATE trigger:
--   * a new or CHANGED booking_id must name a meeting_bookings row whose
--     host_profile_id is the signed-in person (auth.uid());
--   * an UPDATE that leaves booking_id as it was is not re-checked, so a
--     recording already in progress can always be finished;
--   * a row with no booking_id is untouched (recording without a meeting);
--   * a server-side write with no signed-in user (service role, auth.uid() IS
--     NULL — e.g. background processing) is not blocked.
--
-- SECURITY INVOKER on purpose: the lookup reads meeting_bookings through the
-- caller's own RLS, where the host can see their own booking. No new callable
-- function is exposed (a trigger function cannot be called over RPC).
--
-- Live on 2026-09-25: 1 recording carries a booking_id and its recorder hosts
-- that booking, so no existing row conflicts with this rule.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.tg_meeting_recordings_booking_host()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.booking_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.booking_id IS NOT DISTINCT FROM OLD.booking_id THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.meeting_bookings b
     WHERE b.id = NEW.booking_id
       AND b.host_profile_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'That meeting is not yours, or it no longer exists.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.tg_meeting_recordings_booking_host() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_meeting_recordings_booking_host ON public.meeting_recordings;
CREATE TRIGGER trg_meeting_recordings_booking_host
  BEFORE INSERT OR UPDATE OF booking_id ON public.meeting_recordings
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_meeting_recordings_booking_host();

COMMIT;

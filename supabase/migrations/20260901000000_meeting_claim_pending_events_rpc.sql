-- ============================================================================
-- Migration: atomic claim for the accountability-meeting booking sweep
-- Date: 2026-08-18
--
-- WHY THIS EXISTS
--   bookPendingMeetings() claims a group of meeting_trigger_events with a single
--   conditional UPDATE, then reads the returned ids to learn which rows it won.
--   Expressed through PostgREST that was:
--
--     .update({ booking_claimed_at: now, booking_claim_token: token })
--     .in('id', ids).eq('status','meeting_pending').is('booking_id', null)
--     .or('booking_claimed_at.is.null,booking_claimed_at.lt.<stale>')
--     .select('id, booking_claimed_at')
--
--   PostgREST re-applies the request's filters to the RETURNING projection. The
--   row has just written booking_claimed_at = now(), so the staleness predicate
--   (IS NULL OR < stale_before) is FALSE for the new value and the row is
--   filtered OUT of the response body. The UPDATE COMMITS; the caller receives
--   [] and concludes another worker owns the row (skipped_claimed++), while the
--   claim it just wrote blocks every subsequent run for BOOKING_CLAIM_TTL_MIN.
--   That is a livelock: nothing is ever booked and nothing is ever reported.
--
--   Reproduced on production 2026-08-18 (service role, single row):
--     before  booking_claimed_at = 02:18:44Z   (stale)
--     PATCH … or=(…is.null,…lt.02:33:07Z) … select=id,booking_claimed_at
--     body    []                                <- caller sees "not mine"
--     after   booking_claimed_at = 02:48:44Z    <- but the write LANDED
--
--   Companion to #3124, which fixed the earlier form of the same PostgREST
--   behaviour (a filtered column absent from the projection raised 42703 and
--   aborted the claim outright). #3124 stopped the crash, which is what allowed
--   the write to land and exposed this second, silent half.
--
-- WHAT THIS DOES
--   Moves the claim into SQL, where UPDATE … RETURNING returns exactly the rows
--   the UPDATE touched, with no projection filter re-applied. Same predicate,
--   same atomicity (Postgres serialises concurrent writers on the row and
--   re-evaluates the WHERE against the winner's new version, so a loser matches
--   0 rows and walks away) — but the caller now receives the truth.
--
-- IDEMPOTENT: CREATE OR REPLACE.
-- NOT APPLIED BY THIS PR — apply via the Supabase Management API after merge.
-- ============================================================================

-- OUT column is named claimed_id, NOT id: a RETURNS TABLE output name that
-- collides with a real column of the updated table resolves ambiguously and
-- raises 42702 on every call, and the function still CREATEs clean.
CREATE OR REPLACE FUNCTION public.fn_meeting_claim_pending_events(
  p_event_ids    uuid[],
  p_claim_token  uuid,
  p_stale_before timestamptz
)
RETURNS TABLE (claimed_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.meeting_trigger_events AS e
     SET booking_claimed_at  = now(),
         booking_claim_token = p_claim_token
   WHERE e.id = ANY (p_event_ids)
     AND e.status = 'meeting_pending'
     AND e.booking_id IS NULL
     AND (e.booking_claimed_at IS NULL OR e.booking_claimed_at < p_stale_before)
  RETURNING e.id;
END;
$$;

COMMENT ON FUNCTION public.fn_meeting_claim_pending_events(uuid[], uuid, timestamptz) IS
  'Atomically claim meeting_trigger_events for the booking sweep and return the ids actually won. Exists because PostgREST re-applies request filters to an UPDATE''s RETURNING projection, so a row that writes the very column it filters on updates itself out of its own response body — the write commits but the caller sees [] and treats the row as owned by someone else. Cron/system only.';

-- Cron/system only: this mutates claim state for the booking sweep.
REVOKE EXECUTE ON FUNCTION public.fn_meeting_claim_pending_events(uuid[], uuid, timestamptz) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_meeting_claim_pending_events(uuid[], uuid, timestamptz) TO service_role;

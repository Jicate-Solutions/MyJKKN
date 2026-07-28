-- ============================================================================
-- Migration: Auto-accountability-meeting engine — PR1c (book the meeting)
-- Date: 2026-07-28
-- Spec decisions implemented here: #3 (auto-book soonest common free slot),
--   #4 (no calendar → do NOT force-book, nudge to connect), #9 (fold same-day
--   breaches for the same people into ONE meeting), #10 (accept a slot up to
--   14 days out), #11 (attendees = Director + Principal).
--
-- PR1a created meeting_trigger_events with status 'meeting_pending' and a
-- comment promising "PR1c adds the booked meeting". PR1c was never built: the
-- engine escalates and then STOPS. This migration adds the missing link between
-- an escalated breach and the meeting that closes it.
--
-- Schema-only. NOTHING here activates anything: all 16 meeting_trigger_rules
-- remain active=false and meeting_trigger_events is empty (0 rows, verified on
-- prod 2026-07-28), so the new booking pass is a no-op until the Director flips
-- a rule on.
--
-- Columns added (all nullable, all IF NOT EXISTS — safe to re-run):
--   booking_id                    the meeting_bookings row that resolves this
--                                 breach. Several events share one booking_id
--                                 when they were folded together (decision #9).
--   booking_error                 last failure reason from the booking pass, so
--                                 a Google outage is visible instead of silent.
--   calendar_nudge_sent_at        when the "connect your calendar" ask went out.
--   calendar_nudged_profile_ids   who has already been asked, so the degrade
--                                 path is idempotent and never re-nudges.
--
-- No new RPC and no new table → no GRANT/REVOKE changes. meeting_trigger_events
-- already has RLS enabled with an admin/super-admin-only policy (PR1a §3); new
-- columns inherit it. The cron writes with the service role.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Booking link + degrade-path bookkeeping
-- ----------------------------------------------------------------------------
ALTER TABLE public.meeting_trigger_events
  ADD COLUMN IF NOT EXISTS booking_id uuid
    REFERENCES public.meeting_bookings(id) ON DELETE SET NULL;

ALTER TABLE public.meeting_trigger_events
  ADD COLUMN IF NOT EXISTS booking_error text;

ALTER TABLE public.meeting_trigger_events
  ADD COLUMN IF NOT EXISTS calendar_nudge_sent_at timestamptz;

ALTER TABLE public.meeting_trigger_events
  ADD COLUMN IF NOT EXISTS calendar_nudged_profile_ids uuid[];

COMMENT ON COLUMN public.meeting_trigger_events.booking_id IS
  'The meeting_bookings row that resolves this breach (PR1c). NULL while the breach is still unbooked. Several events can share one booking when same-day breaches for the same people were folded into one meeting (decision #9). ON DELETE SET NULL so cancelling a booking returns the events to the queue rather than deleting the breach history.';

COMMENT ON COLUMN public.meeting_trigger_events.booking_error IS
  'Last failure from the PR1c booking pass (Google outage, no common slot, missing attendee email). Kept so a stuck meeting_pending event is diagnosable instead of silently pending forever.';

COMMENT ON COLUMN public.meeting_trigger_events.calendar_nudged_profile_ids IS
  'Profiles already asked to connect their Google Calendar for this event (decision #4 degrade path). Checked before sending so the hourly cron never re-nudges the same person for the same breach.';

-- ----------------------------------------------------------------------------
-- 2. Indexes
--    (a) the booking pass's work queue: meeting_pending AND not yet booked.
--    (b) reverse lookup booking -> the breach events it closes.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_meeting_trigger_events_booking_queue
  ON public.meeting_trigger_events (breach_date)
  WHERE status = 'meeting_pending' AND booking_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_trigger_events_booking_id
  ON public.meeting_trigger_events (booking_id)
  WHERE booking_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. ASSERT the status CHECK already admits 'booked'.
--    PR1a wrote CHECK (status IN ('notified','explained','dismissed',
--    'meeting_pending','booked','expired')) — verified live against prod on
--    2026-07-28 via pg_get_constraintdef. This block is a guard, not a change:
--    it fails loudly if some later migration narrowed the CHECK, rather than
--    letting the booking pass discover it at 23514-time in a cron.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.meeting_trigger_events'::regclass
    AND conname  = 'meeting_trigger_events_status_check';

  IF v_def IS NOT NULL AND position('''booked''' IN v_def) = 0 THEN
    RAISE EXCEPTION
      'meeting_trigger_events_status_check no longer admits status=''booked''; PR1c cannot mark a breach booked. Definition: %', v_def;
  END IF;
END
$$;

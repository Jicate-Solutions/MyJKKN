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
-- REVIEW ROUND 2 (2026-07-28) added the two safety mechanisms that make
-- auto-booking safe to actually turn on:
--   * a CLAIM (booking_claimed_at / booking_claim_token) so the book→flip
--     sequence is crash-safe: exactly one worker owns an event at a time;
--   * meeting_bookings.trigger_dedupe_key + a PARTIAL UNIQUE INDEX, so a retry
--     after a crash physically CANNOT insert a second meeting for the same
--     (institution, breach date, participants). A code check is not a guarantee;
--     a unique index is.
--   * an EXCLUDE constraint that stops the engine booking the same person into
--     two overlapping meetings as the ATTENDEE (the live mb_no_double_booking is
--     keyed on host_profile_id only, and auto-booked meetings put the Principal
--     in the attendee slot).
--
-- Schema-only. NOTHING here activates anything: all 16 meeting_trigger_rules
-- remain active=false and meeting_trigger_events is empty (0 rows, verified on
-- prod 2026-07-28), so the new booking pass is a no-op until the Director flips
-- a rule on.
--
-- Columns added on meeting_trigger_events (all nullable, all IF NOT EXISTS):
--   booking_id                    the meeting_bookings row that resolves this
--                                 breach. Several events share one booking_id
--                                 when they were folded together (decision #9).
--   booking_error                 last failure reason from the booking pass, so
--                                 a Google outage is visible instead of silent.
--   calendar_nudge_sent_at        when the last "connect your calendar" ask went
--                                 out (Director 2026-07-28: send EVERY pass).
--   calendar_nudged_profile_ids   cumulative record of who has been asked. Kept
--                                 for audit + the weekly summary; it no longer
--                                 suppresses a nudge.
--   booking_claimed_at            when a booking worker claimed this event.
--   booking_claim_token           which worker owns it (verified at attach time).
--
-- No new RPC. meeting_trigger_events already has RLS enabled with an
-- admin/super-admin-only policy (PR1a §3); new columns inherit it and the cron
-- writes with the service role. meeting_bookings likewise keeps its policies —
-- one new nullable column adds no new read surface.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Booking link + degrade-path bookkeeping
--    NOTE (review fix): the column and its FOREIGN KEY are added SEPARATELY.
--    `ADD COLUMN IF NOT EXISTS x uuid REFERENCES y(id)` silently skips the FK
--    when the column already exists without one, so on a partially-applied
--    database the link would be un-enforced forever. Each half is independently
--    idempotent instead.
-- ----------------------------------------------------------------------------
ALTER TABLE public.meeting_trigger_events
  ADD COLUMN IF NOT EXISTS booking_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.meeting_trigger_events'::regclass
      AND conname  = 'meeting_trigger_events_booking_id_fkey'
  ) THEN
    ALTER TABLE public.meeting_trigger_events
      ADD CONSTRAINT meeting_trigger_events_booking_id_fkey
      FOREIGN KEY (booking_id)
      REFERENCES public.meeting_bookings(id) ON DELETE SET NULL;
  END IF;
END
$$;

ALTER TABLE public.meeting_trigger_events
  ADD COLUMN IF NOT EXISTS booking_error text;

ALTER TABLE public.meeting_trigger_events
  ADD COLUMN IF NOT EXISTS calendar_nudge_sent_at timestamptz;

ALTER TABLE public.meeting_trigger_events
  ADD COLUMN IF NOT EXISTS calendar_nudged_profile_ids uuid[];

-- Crash-safe claim (review fix #1). The booking pass claims an event with a
-- single conditional UPDATE before it creates anything; only the winner of that
-- UPDATE proceeds. A worker that dies mid-flight leaves a claim that ages out.
ALTER TABLE public.meeting_trigger_events
  ADD COLUMN IF NOT EXISTS booking_claimed_at timestamptz;

ALTER TABLE public.meeting_trigger_events
  ADD COLUMN IF NOT EXISTS booking_claim_token uuid;

COMMENT ON COLUMN public.meeting_trigger_events.booking_id IS
  'The meeting_bookings row that resolves this breach (PR1c). NULL while the breach is still unbooked. Several events can share one booking when same-day breaches for the same people were folded into one meeting (decision #9). ON DELETE SET NULL so cancelling a booking returns the events to the queue rather than deleting the breach history.';

COMMENT ON COLUMN public.meeting_trigger_events.booking_error IS
  'Last failure from the PR1c booking pass (Google outage, no common slot, missing attendee email). Kept so a stuck meeting_pending event is diagnosable instead of silently pending forever.';

COMMENT ON COLUMN public.meeting_trigger_events.calendar_nudged_profile_ids IS
  'Cumulative record of who has been asked to connect Google Calendar for this event. AUDIT ONLY — Director decision 2026-07-28 is to re-send the ask on EVERY blocked pass, so this array no longer suppresses anything.';

COMMENT ON COLUMN public.meeting_trigger_events.booking_claimed_at IS
  'When a booking worker claimed this event. The claim ages out after 15 minutes so a crashed worker cannot wedge a breach forever; the hourly cron is the only producer, so the TTL always expires between runs.';

COMMENT ON COLUMN public.meeting_trigger_events.booking_claim_token IS
  'Which worker owns the claim. Re-checked when the booking is attached, so a worker whose claim expired mid-flight cannot overwrite the winner.';

-- ----------------------------------------------------------------------------
-- 2. Indexes
--    (a) the booking pass's work queue: meeting_pending AND not yet booked.
--    (b) reverse lookup booking -> the breach events it closes.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_meeting_trigger_events_booking_queue
  ON public.meeting_trigger_events (breach_date, id)
  WHERE status = 'meeting_pending' AND booking_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_trigger_events_booking_id
  ON public.meeting_trigger_events (booking_id)
  WHERE booking_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. Durable idempotency key for auto-booked meetings (review fix #1).
--
--    The key is derived from the meeting's IDENTITY — (institution, breach date,
--    the sorted set of participants) — NOT from the set of breach events folded
--    into it. That distinction is what makes it crash-proof: a retry after a
--    crash re-derives the SAME key even if a new breach for the same people on
--    the same day joined the queue in between, so the retry collides with the
--    already-inserted row instead of creating a second meeting.
--
--    Partial + scoped to confirmed: cancelling an auto-booked meeting frees the
--    key so the engine can legitimately book a replacement later.
-- ----------------------------------------------------------------------------
ALTER TABLE public.meeting_bookings
  ADD COLUMN IF NOT EXISTS trigger_dedupe_key text;

COMMENT ON COLUMN public.meeting_bookings.trigger_dedupe_key IS
  'Idempotency key for meetings auto-booked by the accountability trigger engine: sha256 of (institution_id | breach_date | sorted participant profile ids). NULL for every human/public booking. The partial unique index below is the real guarantee that a crashed-and-retried booking pass cannot create a duplicate meeting.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_bookings_trigger_dedupe_key
  ON public.meeting_bookings (trigger_dedupe_key)
  WHERE trigger_dedupe_key IS NOT NULL AND status = 'confirmed';

-- ----------------------------------------------------------------------------
-- 4. Attendee-side double-booking guard for AUTO-BOOKED meetings (review fix #2)
--
--    The live constraint is:
--      mb_no_double_booking EXCLUDE USING gist (host_profile_id WITH =,
--        seat_index WITH =, tstzrange(start_time,end_time) WITH &&)
--        WHERE (status = 'confirmed')
--    — keyed on the HOST only. An auto-booked accountability meeting puts the
--    Director in the host slot and the PRINCIPAL in the attendee slot, so that
--    constraint does nothing to stop the engine booking the same Principal into
--    two overlapping meetings.
--
--    Why this is scoped to source='trigger-engine' rather than the whole table:
--    a COLLECTIVE booking in the native scheduler deliberately writes ONE ROW
--    PER CO-HOST with the SAME attendee_profile_id and the SAME start/end
--    (lib/services/meetings/native-scheduling-service.ts, "COLLECTIVE: place a
--    matching confirmed booking on every OTHER required host"). A table-wide
--    attendee exclusion would make the second co-host row raise 23P01 and roll
--    the entire collective booking back — i.e. it would break a live feature.
--    Scoping to the engine's own rows gives a hard DB guarantee for the failure
--    mode being fixed (engine vs engine) with zero blast radius on human
--    bookings; engine-vs-human overlap is caught by the availability read in
--    bookPendingMeetings, which now counts a person's ATTENDEE bookings as busy.
--
--    Verified on prod 2026-07-28 before writing this: 0 existing pairs of
--    confirmed bookings share an attendee_profile_id with overlapping ranges,
--    and 0 rows have source='trigger-engine', so the constraint is created
--    against data that already satisfies it.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.meeting_bookings'::regclass
      AND conname  = 'mb_trigger_no_attendee_double_booking'
  ) THEN
    ALTER TABLE public.meeting_bookings
      ADD CONSTRAINT mb_trigger_no_attendee_double_booking
      EXCLUDE USING gist (
        attendee_profile_id WITH =,
        tstzrange(start_time, end_time) WITH &&
      )
      WHERE (
        status = 'confirmed'
        AND source = 'trigger-engine'
        AND attendee_profile_id IS NOT NULL
      );
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 5. ASSERT the status CHECK already admits 'booked'.
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

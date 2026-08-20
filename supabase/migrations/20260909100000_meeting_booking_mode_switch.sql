-- 20260909100000_meeting_booking_mode_switch.sql
--
-- Turn a face-to-face booking into a Google Meet WITHOUT cancelling it.
-- Director-approved 2026-08-19.
--
-- WHY THIS SHAPE (measured against production 2026-08-19, do not re-litigate):
--   193 hosts have meeting types. 110 have an in_person type. Exactly ONE has
--   an online type — all 14 online types belong to a single super-admin
--   account. So "move the booking to the host's online meeting type" would
--   work for one account and dead-end for the other 109 hosts. Mode therefore
--   becomes a property of the BOOKING, not a different meeting type: every
--   host can switch on day one with no setup.
--
-- video_url ALREADY EXISTS on meeting_bookings and already carries the Meet
-- link created at booking time. It is reused here — no second link column.
--
-- SECURITY: this migration adds NO function. There is deliberately no new
-- SECURITY DEFINER RPC: meeting_bookings has no UPDATE policy for
-- `authenticated` on purpose (20260611190000_native_scheduling_engine.sql,
-- lines 246-247) and every mutation flows through a service-role server
-- action that checks authorization in application code — the host action
-- verifies the caller IS the booking's host (or a super admin), the visitor
-- path is authorised ONLY by the booking's cancel_token. Adding a SECDEF
-- function here would create a new grantable surface for no gain; the RPCs
-- fixed earlier today in 20260901140000 are the reason that is worth saying
-- out loud rather than leaving implicit.
--
-- The new columns inherit the table's existing RLS unchanged.
--
-- Updated: 2026-08-19 - Added booking-level mode override + visitor switch request.

-- ── 1. the columns ──────────────────────────────────────────────────────────

ALTER TABLE public.meeting_bookings
  ADD COLUMN IF NOT EXISTS location_mode_override      text,
  ADD COLUMN IF NOT EXISTS mode_switch_requested_by    text,
  ADD COLUMN IF NOT EXISTS mode_switch_requested_at    timestamptz,
  ADD COLUMN IF NOT EXISTS mode_switch_requested_start timestamptz,
  ADD COLUMN IF NOT EXISTS mode_switch_request_status  text;

-- ── 2. domain constraints ───────────────────────────────────────────────────
-- Dropped-then-added so re-running the file is safe; ADD CONSTRAINT has no
-- IF NOT EXISTS in PostgreSQL.

ALTER TABLE public.meeting_bookings
  DROP CONSTRAINT IF EXISTS meeting_bookings_location_mode_override_check;
ALTER TABLE public.meeting_bookings
  ADD CONSTRAINT meeting_bookings_location_mode_override_check
  CHECK (location_mode_override IS NULL OR location_mode_override IN ('online'));

ALTER TABLE public.meeting_bookings
  DROP CONSTRAINT IF EXISTS meeting_bookings_mode_switch_requested_by_check;
ALTER TABLE public.meeting_bookings
  ADD CONSTRAINT meeting_bookings_mode_switch_requested_by_check
  CHECK (mode_switch_requested_by IS NULL OR mode_switch_requested_by IN ('attendee', 'host'));

ALTER TABLE public.meeting_bookings
  DROP CONSTRAINT IF EXISTS meeting_bookings_mode_switch_request_status_check;
ALTER TABLE public.meeting_bookings
  ADD CONSTRAINT meeting_bookings_mode_switch_request_status_check
  CHECK (
    mode_switch_request_status IS NULL
    OR mode_switch_request_status IN ('pending', 'approved', 'declined')
  );

-- ── 3. documentation ────────────────────────────────────────────────────────

COMMENT ON COLUMN public.meeting_bookings.location_mode_override IS
  'Booking-level override of meeting_types.location_mode. NULL = follow the type. '
  'Only ''online'' is admitted: this feature ships the in_person -> online direction '
  'only. Coming back needs a room that may since have been taken, which is a separate '
  'decision the Director has not made — the CHECK is the record of that scope.';

COMMENT ON COLUMN public.meeting_bookings.mode_switch_requested_by IS
  'Who asked for the switch: ''attendee'' (visitor, authorised by cancel_token) or '
  '''host''. A host never needs to request — they switch directly — so today only '
  '''attendee'' is written.';

COMMENT ON COLUMN public.meeting_bookings.mode_switch_requested_at IS
  'When the pending switch request was made. With the meeting type''s own '
  'min_notice_min it is also the expiry clock: a request is dead once the notice '
  'window closes or start_time passes, and is read as declined from then on. No new '
  'config row and no cron — expiry is evaluated at read time.';

COMMENT ON COLUMN public.meeting_bookings.mode_switch_requested_start IS
  'Optional new start_time the requester also asked for. NULL = keep the current time. '
  'A switch may move the meeting as well as its mode.';

COMMENT ON COLUMN public.meeting_bookings.mode_switch_request_status IS
  'pending | approved | declined. NULL = no request was ever made. A visitor request '
  'is ALWAYS pending: it never takes effect on its own, the host must approve it.';

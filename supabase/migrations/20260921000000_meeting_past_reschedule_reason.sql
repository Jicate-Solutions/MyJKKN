-- 20260921000000_meeting_past_reschedule_reason.sql
--
-- A host could not move a meeting once it had ended. On the booking detail page
-- the whole Actions card is wrapped in `!isCancelled && !isPast`, and the
-- service refuses anything whose status is not 'confirmed'
-- (native-scheduling-service.ts, rescheduleBooking). Meetings get missed, so the
-- only remaining route was to book a fresh one and lose the thread.
--
-- Measured on production 2026-08-21: 17 bookings sit 'confirmed' with a start
-- time in the past. All 17 belong to a single host. None is older than two days.
-- The 7-day auto-close would have recorded every one of them as 'completed'
-- whether or not anyone actually met.
--
-- ── WHY A REASON, NOT JUST A NEW TIME ──────────────────────────────────────
--
-- Director ruling 2026-08-21: "sometimes it is missed, sometimes it is a repeat
-- or followup meeting. we should be able to select it so it is recorded
-- accordingly." The three are NOT the same action:
--
--   missed     the meeting never happened  → MOVE this booking to a new time
--   repeat     it happened, do it again    → NEW booking, linked back to this one
--   follow_up  it happened, more to discuss→ NEW booking, linked back to this one
--
-- So 'missed' mutates the existing row and the other two create a successor.
-- `follows_booking_id` is what makes a chain of follow-ups readable later, and
-- is the hook the existing carry-over loop needs: MeetingActionItemService
-- .listOpenCarryOver already moves OPEN action items from one meeting to the
-- next, but nothing ever told it which meeting came next.
--
-- ── WHY NULLABLE ───────────────────────────────────────────────────────────
--
-- Every one of the 6,000+ existing bookings predates this and has no reason.
-- An ordinary future-dated reschedule does not need one either — the reason is
-- only asked for when the meeting being moved has already ended.
--
-- Reversible: ALTER TABLE public.meeting_bookings
--   DROP COLUMN reschedule_reason, DROP COLUMN follows_booking_id;
--
-- Updated: 2026-08-21 - Allow a past meeting to be moved, and record why.

ALTER TABLE public.meeting_bookings
  ADD COLUMN IF NOT EXISTS reschedule_reason  text,
  ADD COLUMN IF NOT EXISTS follows_booking_id uuid;

-- Self-reference. ON DELETE SET NULL, never CASCADE: deleting an old meeting
-- must not delete the follow-up that came after it.
ALTER TABLE public.meeting_bookings
  DROP CONSTRAINT IF EXISTS meeting_bookings_follows_booking_id_fkey;
ALTER TABLE public.meeting_bookings
  ADD CONSTRAINT meeting_bookings_follows_booking_id_fkey
  FOREIGN KEY (follows_booking_id)
  REFERENCES public.meeting_bookings (id)
  ON DELETE SET NULL;

ALTER TABLE public.meeting_bookings
  DROP CONSTRAINT IF EXISTS chk_meeting_bookings_reschedule_reason;
ALTER TABLE public.meeting_bookings
  ADD CONSTRAINT chk_meeting_bookings_reschedule_reason
  CHECK (reschedule_reason IS NULL
         OR reschedule_reason IN ('missed', 'repeat', 'follow_up'));

-- A booking must not claim to follow itself.
ALTER TABLE public.meeting_bookings
  DROP CONSTRAINT IF EXISTS chk_meeting_bookings_follows_not_self;
ALTER TABLE public.meeting_bookings
  ADD CONSTRAINT chk_meeting_bookings_follows_not_self
  CHECK (follows_booking_id IS NULL OR follows_booking_id <> id);

-- Reading a chain forward ("what came after this meeting?") is the common query.
CREATE INDEX IF NOT EXISTS idx_meeting_bookings_follows
  ON public.meeting_bookings (follows_booking_id)
  WHERE follows_booking_id IS NOT NULL;

COMMENT ON COLUMN public.meeting_bookings.reschedule_reason IS
  'Why a meeting that had already ended was given a new time: missed (it never '
  'happened - this row was moved), repeat, or follow_up (it did happen - this '
  'row is the successor and follows_booking_id points at the original). NULL '
  'for every ordinary future-dated reschedule.';

COMMENT ON COLUMN public.meeting_bookings.follows_booking_id IS
  'The earlier meeting this one continues, set only for reschedule_reason in '
  '(repeat, follow_up). ON DELETE SET NULL so removing the earlier meeting '
  'never removes its successor.';

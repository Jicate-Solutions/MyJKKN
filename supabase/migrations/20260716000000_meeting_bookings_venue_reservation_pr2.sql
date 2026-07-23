-- 20260716000000_meeting_bookings_venue_reservation_pr2.sql
--
-- Meeting Venues from Resource Management — PR2 (availability + reservation).
-- When an in-person meeting type is linked to a registry room (PR1's
-- meeting_types.location_resource_id), booking the meeting now also HOLDS the
-- room via the existing resource_reservations machinery. This migration adds
-- the two columns the booking row needs to track that:
--
--   * venue_reservation_id — FK to the resource_reservations row created for
--     this booking. NULL for walk-in rooms (no reservation), custom/no-room
--     types, or online/phone meetings. ON DELETE SET NULL so cancelling the
--     reservation directly never blocks reading the booking.
--   * venue_status — the room's state for THIS booking, orthogonal to the
--     booking's own lifecycle `status` (which stays confirmed/cancelled):
--       NULL        → no room reservation applies (walk-in / custom / online)
--       'confirmed' → room reserved, no approval needed
--       'pending'   → room reserved but awaiting caretaker approval (tentative)
--       'rejected'  → caretaker rejected the room (set in PR3)
--
-- No new RPC and no new RLS surface (meeting_bookings keeps its existing
-- policies; reservations are written by the service-role booking path), so no
-- anon grant is introduced. Additive + idempotent: safe to re-run.

ALTER TABLE public.meeting_bookings
  ADD COLUMN IF NOT EXISTS venue_reservation_id uuid NULL
    REFERENCES public.resource_reservations(id) ON DELETE SET NULL;

ALTER TABLE public.meeting_bookings
  ADD COLUMN IF NOT EXISTS venue_status text NULL
    CHECK (venue_status IS NULL OR venue_status IN ('pending', 'confirmed', 'rejected'));

COMMENT ON COLUMN public.meeting_bookings.venue_reservation_id IS
  'FK to the resource_reservations row holding this booking''s room (NULL = walk-in/custom/online). Added 2026-06-22 (venue-from-resource PR2).';
COMMENT ON COLUMN public.meeting_bookings.venue_status IS
  'Room state for this booking, orthogonal to status: NULL=no room reservation, confirmed, pending (awaiting caretaker approval), rejected. Added 2026-06-22 (venue-from-resource PR2).';

-- Fast lookup of bookings waiting on a room decision (PR3 approval resolution).
CREATE INDEX IF NOT EXISTS idx_meeting_bookings_venue_pending
  ON public.meeting_bookings (venue_reservation_id)
  WHERE venue_status = 'pending';

NOTIFY pgrst, 'reload schema';

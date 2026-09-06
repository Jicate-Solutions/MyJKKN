-- 20260717000000_meeting_venue_sync_trigger_pr3.sql
--
-- Meeting Venues from Resource Management — PR3 (two-way sync).
-- This is the RESERVATION → MEETING direction: when a room reservation that
-- holds a meeting (PR2's meeting_bookings.venue_reservation_id) changes status
-- — a caretaker approves or rejects it in the Resource Management approvals UI,
-- or it is cancelled — mirror that onto the meeting's venue_status.
--
-- A DB trigger (not a hook in the approvals UI) keeps the sync automatic
-- WHEREVER the reservation status changes: the approve_reservation /
-- reject_reservation / cancel_reservation RPCs, the approvals dialog, or a
-- direct admin edit. One source of truth; the existing approvals UI needs zero
-- changes.
--
-- Only CONFIRMED meetings are touched: when a meeting is cancelled it frees its
-- room (PR3 cancelBooking sets the reservation to cancelled), and that freed
-- room must NOT flip the cancelled meeting's venue_status — the status='confirmed'
-- guard handles that.
--
-- SECURITY DEFINER so the trigger can update meeting_bookings regardless of who
-- changed the reservation. Trigger functions are not directly callable through
-- PostgREST, but we still REVOKE from anon/PUBLIC per the CLAUDE.md anon-lock rule.

CREATE OR REPLACE FUNCTION public.fn_sync_meeting_venue_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_target := CASE NEW.status
                WHEN 'approved'  THEN 'confirmed'
                WHEN 'rejected'  THEN 'rejected'
                WHEN 'cancelled' THEN 'rejected'
                ELSE NULL
              END;

  -- Only act on transitions we map (approved/rejected/cancelled).
  IF v_target IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.meeting_bookings mb
     SET venue_status = v_target,
         updated_at   = now()
   WHERE mb.venue_reservation_id = NEW.id
     AND mb.status = 'confirmed'              -- never re-flag a cancelled meeting
     AND mb.venue_status IS DISTINCT FROM v_target;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_sync_meeting_venue_status() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_sync_meeting_venue_status ON public.resource_reservations;
CREATE TRIGGER trg_sync_meeting_venue_status
  AFTER UPDATE OF status ON public.resource_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_meeting_venue_status();

NOTIFY pgrst, 'reload schema';

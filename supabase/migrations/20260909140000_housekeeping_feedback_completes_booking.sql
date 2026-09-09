-- Rating a cleaning must COMPLETE it. Until now the status change was attempted
-- from the browser and silently did nothing.
--
-- THE BUG. HousekeepingBookingService.submitFeedback inserted the rating and
-- then ran, as the learner:
--
--     UPDATE hostel_cleaning_bookings SET status = 'completed'
--      WHERE id = $1 AND status = 'awaiting_feedback'
--
-- A learner has NO update policy on that table -- hk_bookings_update requires
-- campus_living.housekeeping.execute / .assign / .waive, all warden keys. RLS
-- therefore filtered the statement to zero rows, and PostgREST reports an
-- UPDATE that matched nothing as SUCCESS. No error, no exception, no clue.
--
-- WHAT THAT COST:
--   * The booking stayed 'awaiting_feedback' forever, and step 5 of
--     fn_cl_housekeeping_book treats that as a live booking -- so the room was
--     permanently locked out of booking another cleaning, of any type.
--   * The learner's rate card kept rendering, and a second submit hit
--     ux_hk_feedback_one_per_learner (23505).
--
-- What it did NOT cost: the attendance hold. fn_cl_housekeeping_feedback_holds
-- ends with `AND NOT EXISTS (SELECT 1 FROM hostel_cleaning_feedback ...)`, so
-- the hold lifted on the rating itself regardless of the status. The
-- safety-critical half was already right.
--
-- THE FIX is a trigger, not a better UPDATE from the client. The transition is
-- a fact about the data -- a rated cleaning IS finished -- so it belongs beside
-- the write, atomic with it, on every path: the learner page today, an import or
-- a warden acting for a learner tomorrow. A client-side status write can always
-- be filtered away by a policy the caller does not know about, which is exactly
-- what happened.

-- ==========================================================================
-- 1. The trigger
-- ==========================================================================
-- SECURITY DEFINER because the caller is a learner who cannot update the
-- bookings table. It performs NO authorization of its own and needs none: it
-- only ever runs on a row that hk_feedback_insert already authorized, and that
-- policy demands the caller hold a live allocation to the booking's room AND
-- the booking be 'awaiting_feedback'. It cannot be reached any other way -- a
-- function returning `trigger` is not callable over PostgREST.
--
-- The status guard is kept in the UPDATE so a second rating from a roommate is
-- a no-op rather than resurrecting a cancelled or waived booking.
CREATE OR REPLACE FUNCTION public.fn_cl_housekeeping_feedback_completes_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  UPDATE public.hostel_cleaning_bookings
  SET status = 'completed'
  WHERE id = NEW.booking_id
    AND status = 'awaiting_feedback';
  RETURN NEW;
END $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_housekeeping_feedback_completes_booking()
  FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS t_hk_feedback_completes_booking ON public.hostel_cleaning_feedback;
CREATE TRIGGER t_hk_feedback_completes_booking
AFTER INSERT ON public.hostel_cleaning_feedback
FOR EACH ROW EXECUTE FUNCTION public.fn_cl_housekeeping_feedback_completes_booking();

-- ==========================================================================
-- 2. Repair the bookings the bug stranded
-- ==========================================================================
-- Every booking that has been rated but never left 'awaiting_feedback'. Each
-- one is a room that cannot book a cleaning until this runs.
UPDATE public.hostel_cleaning_bookings b
SET status = 'completed'
WHERE b.status = 'awaiting_feedback'
  AND EXISTS (
    SELECT 1 FROM public.hostel_cleaning_feedback f WHERE f.booking_id = b.id
  );
